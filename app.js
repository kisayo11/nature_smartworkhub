// 설정: 배포된 Google Apps Script Web App URL을 입력하세요.
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbz_irqoJCGt8N5WRHj185VSVUuyE_JppyWRX62x7pjOJtyDLhQGtLqjgW1ilxspo6h0/exec';

let appsData = [];
let isAdmin = false;
let currentCategory = 'All';
let searchQuery = '';
let viewMode = localStorage.getItem('hub-view-mode') || 'grid';

// Premium Feature States
let currentPage = 1;
let sortBy = localStorage.getItem('hub-sort-by') || 'name';
let favorites = JSON.parse(localStorage.getItem('hub-favorites')) || [];
let clicks = JSON.parse(localStorage.getItem('hub-clicks')) || {};

// Integrated Search Dropdown State
let searchDropdownOpen = false;
let selectedSearchIndex = 0;
let activeSearchApps = [];

let currentTheme = 'classic';
let reorderModeActive = false;
let pingStatuses = {}; // format: { appId: 'checking' | 'online' | 'offline' }
let customOrder = JSON.parse(localStorage.getItem('hub-custom-order')) || [];
let collapsedSections = JSON.parse(localStorage.getItem('hub-collapsed-sections')) || {};

// DOM Elements
const loadingEl = document.getElementById('loading');
const appsGrid = document.getElementById('apps-grid');
const adminLoginBtn = document.getElementById('admin-login-btn');
const adminDashboardModal = document.getElementById('admin-dashboard-modal');
const adminAppsList = document.getElementById('admin-apps-list');
const adminStatus = document.getElementById('admin-status');
const appForm = document.getElementById('app-form');

const searchInput = document.getElementById('search-input');
const searchContainer = document.getElementById('search-container');
const searchDropdownPanel = document.getElementById('search-dropdown-panel');
const searchDropdownList = document.getElementById('search-dropdown-list');

const categoryNav = document.getElementById('category-nav');
const currentCategoryTitle = document.getElementById('current-category-title');
const timeEl = document.getElementById('current-time');
const dateEl = document.getElementById('current-date');
const sidebar = document.getElementById('sidebar');
const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const mobileClose = document.getElementById('mobile-close');

// Auto close sidebar when clicking outside on mobile
document.addEventListener('click', (e) => {
    if (window.innerWidth <= 768 && sidebar && sidebar.classList.contains('sidebar-open')) {
        if (!sidebar.contains(e.target) && !mobileMenuBtn.contains(e.target)) {
            sidebar.classList.remove('sidebar-open');
        }
    }
});

// Handle Live Clock
function initClock() {
    const updateTime = () => {
        const now = new Date();
        if (timeEl) timeEl.innerText = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
        if (dateEl) dateEl.innerText = now.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
    };
    updateTime();
    setInterval(updateTime, 1000);
}

// Sliding Indicator Toggle Control Logic
function updateSlidingToggles() {
    // For sorting toggle group
    const sortGroup = document.getElementById('sort-toggle-group');
    const sortIndicator = document.getElementById('sort-indicator');
    if (sortGroup && sortIndicator) {
        const activeBtn = sortGroup.querySelector(`[data-value="${sortBy}"]`);
        if (activeBtn) {
            sortIndicator.style.width = `${activeBtn.offsetWidth}px`;
            sortIndicator.style.left = `${activeBtn.offsetLeft}px`;
            sortGroup.querySelectorAll('.toggle-tab-btn').forEach(btn => {
                btn.classList.toggle('active', btn === activeBtn);
            });
        }
    }

    // For view mode toggle group
    const viewGroup = document.getElementById('view-toggle-group');
    const viewIndicator = document.getElementById('view-indicator');
    if (viewGroup && viewIndicator) {
        const activeBtn = viewGroup.querySelector(`[data-value="${viewMode}"]`);
        if (activeBtn) {
            viewIndicator.style.width = `${activeBtn.offsetWidth}px`;
            viewIndicator.style.left = `${activeBtn.offsetLeft}px`;
            viewGroup.querySelectorAll('.toggle-tab-btn').forEach(btn => {
                btn.classList.toggle('active', btn === activeBtn);
            });
        }
    }
}

window.setViewMode = function(mode) {
    viewMode = mode;
    localStorage.setItem('hub-view-mode', mode);
    updateSlidingToggles();
    renderApps();
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initClock();
    
    // 테마 설정 복원
    setTheme(currentTheme);
    const themeSelector = document.getElementById('theme-selector');
    if (themeSelector) themeSelector.value = currentTheme;

    // custom 순서 관리 토글 표시 판단
    updateReorderToggleVisibility();

    if (!SCRIPT_URL) {
        showError(`초기 설정이 필요합니다. Code.gs를 배포하고 app.js 상단에 SCRIPT_URL을 입력하세요.`);
        return;
    }
    fetchApps();
    initSearchIntegration();
    
    // Sliding Toggles Initialization
    setTimeout(updateSlidingToggles, 150);
});

// Update indicator offset on window resizing
window.addEventListener('resize', updateSlidingToggles);

// Cursor tracking radial glow backlight effect
document.addEventListener('mousemove', (e) => {
    const card = e.target.closest('.app-card, .app-list-item');
    if (card) {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        card.style.setProperty('--mouse-x', `${x}px`);
        card.style.setProperty('--mouse-y', `${y}px`);
    }
});

// Mobile Sidebar
if (mobileMenuBtn) mobileMenuBtn.addEventListener('click', () => sidebar.classList.add('sidebar-open'));
if (mobileClose) mobileClose.addEventListener('click', () => sidebar.classList.remove('sidebar-open'));

if (appForm) appForm.addEventListener('submit', submitAppForm);

// Fetch apps
async function fetchApps() {
    try {
        const response = await fetch(SCRIPT_URL + '?_=' + new Date().getTime());
        const result = await response.json();

        if (result.status === 'success') {
            // Save registry index to support "recency" sort later
            appsData = result.data.map((app, idx) => {
                app.regIndex = idx;
                return app;
            });
            
            // customOrder 동기화
            const appIds = appsData.map(a => a.id);
            customOrder = customOrder.filter(id => appIds.includes(id));
            appIds.forEach(id => {
                if (!customOrder.includes(id)) {
                    customOrder.push(id);
                }
            });
            localStorage.setItem('hub-custom-order', JSON.stringify(customOrder));
            
            renderCategories();
            renderApps();
            startHealthCheckLoop(); // 헬스 체크 루프 시작
        } else {
            showError("데이터 로드 실패: " + result.message);
        }
    } catch (error) {
        showError("네트워크 오류. Apps Script 배포 버전을 확인하세요.");
        console.error(error);
    }
}

// Render Sidebar Categories (Vanilla CSS)
function renderCategories() {
    const categories = ['All', ...new Set(appsData.map(a => a.category || '일반'))];

    if (categoryNav) {
        categoryNav.innerHTML = categories.map(cat => {
            const isActive = cat === currentCategory;
            const activeClasses = isActive ? 'active' : '';

            return `
            <li class="category-item ${activeClasses}" data-category="${cat}">
                <span>${cat === 'All' ? '전체 시스템' : cat}</span>
                ${isActive ? '<iconify-icon icon="solar:round-alt-arrow-right-line-duotone" class="category-item-icon"></iconify-icon>' : ''}
            </li>
        `}).join('');

        document.querySelectorAll('#category-nav li').forEach(item => {
            item.addEventListener('click', (e) => {
                currentCategory = e.currentTarget.dataset.category;
                renderCategories();
                
                if (currentCategoryTitle) {
                    currentCategoryTitle.innerText = currentCategory === 'All' ? '전체 시스템' : `${currentCategory}`;
                }

                if (window.innerWidth <= 768) sidebar.classList.remove('sidebar-open');
                renderApps();
            });
        });
    }
}

// Premium Helper: Set Sorting Method
window.setSortBy = function(val) {
    sortBy = val;
    localStorage.setItem('hub-sort-by', val);
    currentPage = 1; // Reset to page 1 on sort change
    updateReorderToggleVisibility();
    updateSlidingToggles();
    renderApps();
};

// Premium Helper: Toggle Favorite Status
window.toggleFavorite = function(id, event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    const idx = favorites.indexOf(id);
    if (idx > -1) {
        favorites.splice(idx, 1);
    } else {
        favorites.push(id);
    }
    localStorage.setItem('hub-favorites', JSON.stringify(favorites));
    renderApps();
};

// Premium Helper: Log App Clicks
window.logClick = function(id) {
    clicks[id] = (clicks[id] || 0) + 1;
    localStorage.setItem('hub-clicks', JSON.stringify(clicks));
    if (sortBy === 'popularity') {
        renderApps();
    }
};

// App Card Generator
function generateAppCard(app, index, isFavoriteItem = false) {
    const catName = app.category || '일반';
    
    let hash = 0;
    for (let i = 0; i < catName.length; i++) hash = catName.charCodeAt(i) + ((hash << 5) - hash);
    const palette = [
        'icon-palette-green',
        'icon-palette-gray',
        'icon-palette-yellow',
        'icon-palette-mint'
    ];
    const themeClass = palette[Math.abs(hash) % palette.length];

    const isLocked = app.isLocked === true || app.isLocked === 'TRUE' || app.isLocked === 'true';
    const isActive = app.isActive !== false && app.isActive !== 'FALSE' && app.isActive !== 'false';
    const isFav = favorites.includes(app.id);

    // bento-grid feature layout trigger: if the app has clicks >= 3 or is first in main grid
    const isFeatured = !isFavoriteItem && viewMode === 'grid' && ((clicks[app.id] || 0) >= 3 || index === 0);
    const bentoClass = isFeatured ? 'bento-featured' : '';

    // favorite button on cards
    const favoriteButton = `
        <button onclick="window.toggleFavorite('${app.id}', event)" class="card-favorite-btn ${isFav ? 'favorited' : ''}" style="${sortBy === 'custom' && reorderModeActive && !isFavoriteItem ? 'right: 4.5rem;' : ''}" title="${isFav ? '즐겨찾기 해제' : '즐겨찾기 등록'}">
            <iconify-icon icon="${isFav ? 'solar:star-bold' : 'solar:star-linear'}" class="${isFav ? 'text-brand-yellow' : ''}"></iconify-icon>
        </button>
    `;
    
    const lockBadge = isLocked ? `<div class="status-badge secured"><iconify-icon icon="solar:lock-keyhole-bold" style="font-size: 0.75rem;"></iconify-icon><span>Secured</span></div>` : '';
    const inactiveBadge = !isActive ? `<div class="status-badge offline"><iconify-icon icon="solar:forbidden-circle-bold" style="font-size: 0.75rem;"></iconify-icon><span>Offline</span></div>` : '';
    
    // Live Status Health Checker Badge
    const pingStatus = pingStatuses[app.id] || 'checking';
    let pingBadge = '';
    if (isActive) {
        if (pingStatus === 'checking') {
            pingBadge = `<div data-ping-app-id="${app.id}" class="status-badge checking"><iconify-icon icon="solar:spinner-track-bold-duotone" class="animate-spin" style="font-size: 0.75rem;"></iconify-icon> Checking</div>`;
        } else if (pingStatus === 'online') {
            pingBadge = `<div data-ping-app-id="${app.id}" class="status-badge online"><span class="status-badge-dot"></span> Online</div>`;
        } else {
            pingBadge = `<div data-ping-app-id="${app.id}" class="status-badge offline"><span class="status-badge-dot"></span> Offline</div>`;
        }
    }

    let badgesContainer = (lockBadge || inactiveBadge || pingBadge) ? `<div class="badge-capsule-row">${lockBadge}${inactiveBadge}${pingBadge}</div>` : '';

    // Keyboard Shortcuts Alt + [1-9] Guideline
    const favIndex = favorites.indexOf(app.id);
    let shortcutBadge = '';
    if (favIndex >= 0 && favIndex < 9) {
        shortcutBadge = `<span class="shortcut-kbd-badge" title="Alt + ${favIndex + 1} 단축키로 실행 가능"><kbd>Alt + ${favIndex + 1}</kbd></span>`;
    }

    // Custom Order Reorder Buttons
    let reorderButtons = '';
    if (sortBy === 'custom' && reorderModeActive && !isFavoriteItem) {
        reorderButtons = `
            <div class="card-reorder-wrap" onclick="event.stopPropagation();">
                <button onclick="window.moveApp('${app.id}', 'prev', event)" class="card-reorder-btn" title="앞으로 이동">
                    <iconify-icon icon="solar:alt-arrow-left-line-duotone"></iconify-icon>
                </button>
                <button onclick="window.moveApp('${app.id}', 'next', event)" class="card-reorder-btn" title="뒤로 이동">
                    <iconify-icon icon="solar:alt-arrow-right-line-duotone"></iconify-icon>
                </button>
            </div>
        `;
    }

    const safeUrl = (app.url || '').toString().replace(/'/g, "\\'");
    const safePw = (app.password || '').toString().replace(/'/g, "\\'");
    
    let cardAction = '';
    let closingTag = '';
    let extraClasses = '';
    if (!isActive) {
        cardAction = `onclick="alert('시스템 점검 중입니다.')"`;
        closingTag = 'div';
    } else if (isLocked) {
        cardAction = `onclick="openLockedApp('${safeUrl}', '${safePw}', '${app.id}')"`;
        extraClasses = 'text-left w-full focus:outline-none';
        closingTag = 'button';
    } else {
        cardAction = `href="${app.url}" target="_blank" onclick="window.logClick('${app.id}')"`;
        extraClasses = 'focus:outline-none';
        closingTag = 'a';
    }

    if (viewMode === 'list' && !isFavoriteItem) {
        const disabledClass = !isActive ? 'disabled' : '';
        return `
        <div class="app-list-item ${disabledClass} animate-fade-in-up" style="animation-delay: ${index * 40}ms;">
            <div class="app-list-item-inner">
                <!-- Radial Backlight Glow Overlay -->
                <div class="card-glow"></div>
                
                <!-- Action Overlay -->
                <${closingTag} ${cardAction} class="card-action-overlay" aria-label="${app.name} 이동"></${closingTag}>
                
                <div class="list-item-left">
                    <!-- Premium Icon Box -->
                    <div class="list-item-icon-box ${themeClass}">
                        <iconify-icon icon="${app.icon || 'solar:link-circle-bold-duotone'}"></iconify-icon>
                    </div>
                    
                    <div class="list-item-content">
                        <div class="list-item-title-row">
                            <h3 class="list-item-title">${app.name}</h3>
                            ${shortcutBadge}
                            <span class="list-item-cat-label">${catName}</span>
                            ${clicks[app.id] ? `<span class="card-clicks-label"><iconify-icon icon="solar:fire-bold" style="vertical-align: middle; margin-right: 0.15rem;"></iconify-icon>${clicks[app.id]}회</span>` : ''}
                            ${badgesContainer}
                        </div>
                        <p class="list-item-description">${app.description || '시스템에 대한 설명이 없습니다.'}</p>
                    </div>
                </div>
                
                <div class="list-item-right">
                    ${isActive && !isLocked ? '<div class="list-item-arrow"><iconify-icon icon="solar:arrow-right-up-linear"></iconify-icon></div>' : ''}
                </div>
                
                ${reorderButtons}
                ${favoriteButton}
            </div>
        </div>
        `;
    }

    // Grid layout (default)
    const disabledClass = !isActive ? 'disabled' : '';
    return `
    <div class="app-card ${disabledClass} ${bentoClass} animate-fade-in-up" style="animation-delay: ${index * 60}ms;">
        <!-- Action Overlay -->
        <${closingTag} ${cardAction} class="card-action-overlay" aria-label="${app.name} 이동"></${closingTag}>
        
        <div class="app-card-inner">
            <!-- Radial Backlight Glow Overlay -->
            <div class="card-glow"></div>
            
            <div style="margin-bottom: auto;">
                <!-- Premium Icon Box -->
                <div class="card-icon-box ${themeClass}">
                    <iconify-icon icon="${app.icon || 'solar:link-circle-bold-duotone'}"></iconify-icon>
                </div>
            </div>
            
            ${reorderButtons}
            ${favoriteButton}
            
            <div class="card-body">
                <div class="card-cat-clicks-row">
                    <div class="card-category-label">${catName}</div>
                    ${clicks[app.id] ? `<div class="card-clicks-label"><iconify-icon icon="solar:fire-bold" style="vertical-align: middle; margin-right: 0.15rem;"></iconify-icon>${clicks[app.id]}회</div>` : ''}
                </div>
                
                <div class="card-title-row">
                    <h3 class="card-title">${app.name}</h3>
                    ${shortcutBadge}
                    ${isActive && !isLocked ? '<div class="card-arrow-box"><iconify-icon icon="solar:arrow-right-up-linear"></iconify-icon></div>' : ''}
                </div>
                
                <p class="card-description">${app.description || '시스템에 대한 설명이 없습니다.'}</p>
                
                <div class="card-footer">
                    ${badgesContainer}
                </div>
            </div>
        </div>
    </div>
    `;
}

// Accordion collapse handler
window.toggleCategorySection = function(categoryName) {
    const isCollapsed = collapsedSections[categoryName] === true;
    collapsedSections[categoryName] = !isCollapsed;
    localStorage.setItem('hub-collapsed-sections', JSON.stringify(collapsedSections));
    
    // Smooth toggle in DOM
    const header = document.querySelector(`.category-section-header[onclick*="${categoryName}"]`);
    const grid = document.getElementById(`category-section-grid-${categoryName}`);
    
    if (header && grid) {
        const arrow = header.querySelector('.category-section-arrow');
        const icon = header.querySelector('.category-section-icon');
        
        if (!isCollapsed) {
            header.classList.add('collapsed');
            grid.classList.add('collapsed');
            if (icon) icon.icon = 'solar:folder-bold-duotone';
        } else {
            header.classList.remove('collapsed');
            grid.classList.remove('collapsed');
            if (icon) icon.icon = 'solar:folder-opened-bold-duotone';
        }
    }
};

// Render Apps Grid
function renderApps() {
    if (loadingEl) loadingEl.classList.add('hidden');
    if (appsGrid) appsGrid.classList.remove('hidden');

    if (appsData.length === 0) {
        if (appsGrid) appsGrid.classList.add('hidden');
        document.getElementById('favorites-container').classList.add('hidden');
        if (loadingEl) {
            loadingEl.classList.remove('hidden');
            loadingEl.innerHTML = `
                <div class="loading-panel animate-fade-in-up text-center">
                    <iconify-icon icon="solar:folder-error-bold-duotone" class="loading-spinner" style="color: var(--color-text-secondary); opacity: 0.4; margin-bottom: 1.5rem;"></iconify-icon>
                    <h3 class="loading-text" style="margin-bottom: 0.5rem;">등록된 시스템이 없습니다</h3>
                    <p style="font-size: 0.9rem; color: var(--color-text-secondary);">시스템 관리 패널에서 모듈을 배포하세요.</p>
                </div>
            `;
        }
        return;
    }

    // 1. FILTERING
    let filteredApps = appsData.filter(app => {
        const matchesCategory = currentCategory === 'All' || (app.category || '일반') === currentCategory;
        const searchTarget = (app.name + ' ' + (app.description || '') + ' ' + (app.category || '')).toLowerCase();
        const matchesSearch = searchTarget.includes(searchQuery);
        return matchesCategory && matchesSearch;
    });

    // 2. SORTING
    filteredApps.sort((a, b) => {
        if (sortBy === 'name') {
            const nameA = (a.name || '').toString();
            const nameB = (b.name || '').toString();
            return nameA.localeCompare(nameB, 'ko-KR');
        } else if (sortBy === 'recency') {
            return (b.regIndex || 0) - (a.regIndex || 0); // Reverse sheets registration order
        } else if (sortBy === 'popularity') {
            const clicksA = clicks[a.id] || 0;
            const clicksB = clicks[b.id] || 0;
            if (clicksB !== clicksA) return clicksB - clicksA;
            return (a.name || '').toString().localeCompare((b.name || '').toString(), 'ko-KR');
        } else if (sortBy === 'custom') {
            const indexA = customOrder.indexOf(a.id);
            const indexB = customOrder.indexOf(b.id);
            return (indexA > -1 ? indexA : 9999) - (indexB > -1 ? indexB : 9999);
        }
        return 0;
    });

    // 3. RENDER PINNED FAVORITES DRAWER (Only when not searching)
    const favoritesContainer = document.getElementById('favorites-container');
    const favoritesGrid = document.getElementById('favorites-grid');
    const favApps = appsData.filter(app => favorites.includes(app.id));

    if (favApps.length > 0 && searchQuery === '') {
        favoritesContainer.classList.remove('hidden');
        favoritesGrid.innerHTML = favApps.map((app, idx) => generateAppCard(app, idx, true)).join('');
    } else {
        favoritesContainer.classList.add('hidden');
        favoritesGrid.innerHTML = '';
    }

    // 4. EMPTY FILTER RESULTS
    if (filteredApps.length === 0) {
        if (appsGrid) appsGrid.classList.add('hidden');
        document.getElementById('pagination-container').innerHTML = '';
        if (loadingEl) {
            loadingEl.classList.remove('hidden');
            loadingEl.innerHTML = `
                <div class="loading-panel animate-fade-in-up text-center">
                    <iconify-icon icon="solar:magnifer-bold-duotone" class="loading-spinner" style="color: var(--color-text-secondary); opacity: 0.3; margin-bottom: 1rem;"></iconify-icon>
                    <p class="loading-text">검색 결과가 없습니다.</p>
                </div>
            `;
        }
        return;
    }

    // 5. ACCORDION GROUPING (Only when viewing "All" and not searching)
    if (currentCategory === 'All' && searchQuery === '' && viewMode === 'grouped') {
        // Group by Category
        const categoriesMap = {};
        filteredApps.forEach(app => {
            const cat = app.category || '일반';
            if (!categoriesMap[cat]) categoriesMap[cat] = [];
            categoriesMap[cat].push(app);
        });

        let accordionHTML = '';
        Object.keys(categoriesMap).forEach((cat, secIdx) => {
            const catApps = categoriesMap[cat];
            const isCollapsed = collapsedSections[cat] === true;
            const collapsedClass = isCollapsed ? 'collapsed' : '';
            const gridCollapsedClass = isCollapsed ? 'collapsed' : '';
            const gridLayoutClass = viewMode === 'grid' ? 'apps-grid' : 'apps-list-view';
            const folderIcon = isCollapsed ? 'solar:folder-bold-duotone' : 'solar:folder-opened-bold-duotone';

            accordionHTML += `
                <div class="category-accordion-section animate-fade-in-up" style="animation-delay: ${secIdx * 80}ms;">
                    <div class="category-section-header ${collapsedClass}" onclick="toggleCategorySection('${cat.replace(/'/g, "\\'")}')">
                        <div class="category-section-title-wrap">
                            <iconify-icon icon="${folderIcon}" class="category-section-icon"></iconify-icon>
                            <span class="category-section-title">${cat}</span>
                            <span class="category-section-count">${catApps.length}</span>
                        </div>
                        <iconify-icon icon="solar:alt-arrow-down-bold" class="category-section-arrow"></iconify-icon>
                    </div>
                    <div id="category-section-grid-${cat}" class="category-section-grid ${gridLayoutClass} ${gridCollapsedClass}">
                        ${catApps.map((app, idx) => generateAppCard(app, idx, false)).join('')}
                    </div>
                </div>
            `;
        });

        if (appsGrid) {
            appsGrid.className = "category-accordion-container";
            appsGrid.innerHTML = accordionHTML;
        }
        document.getElementById('pagination-container').innerHTML = ''; // No pagination in grouped accordion view
    } else {
        // 6. FLAT VIEW (When filtering specific category or typing search)
        const itemsPerPage = viewMode === 'grid' ? 8 : 5;
        const totalItems = filteredApps.length;
        const totalPages = Math.ceil(totalItems / itemsPerPage);

        if (currentPage > totalPages) {
            currentPage = 1;
        }

        const startIndex = (currentPage - 1) * itemsPerPage;
        const slicedApps = filteredApps.slice(startIndex, startIndex + itemsPerPage);

        if (appsGrid) {
            if (viewMode === 'grid') {
                appsGrid.className = "apps-grid";
            } else {
                appsGrid.className = "apps-list-view";
            }
            appsGrid.innerHTML = slicedApps.map((app, index) => generateAppCard(app, index, false)).join('');
        }
        
        // Render Pagination Controls
        renderPagination(totalItems, itemsPerPage);
    }
}

// Render Pagination Controls
function renderPagination(totalItems, itemsPerPage) {
    const pagContainer = document.getElementById('pagination-container');
    if (!pagContainer) return;

    const totalPages = Math.ceil(totalItems / itemsPerPage);
    if (totalPages <= 1) {
        pagContainer.innerHTML = '';
        return;
    }

    let buttons = [];

    // Prev Button
    const prevDisabled = currentPage === 1;
    buttons.push(`
        <button onclick="changePage(${currentPage - 1})" ${prevDisabled ? 'disabled' : ''} class="pagination-btn">
            <iconify-icon icon="solar:alt-arrow-left-line-duotone" style="font-size: 1.1rem;"></iconify-icon>
        </button>
    `);

    // Numeric Pages
    for (let i = 1; i <= totalPages; i++) {
        const isCurrent = currentPage === i;
        if (isCurrent) {
            buttons.push(`
                <button class="pagination-btn active">${i}</button>
            `);
        } else {
            buttons.push(`
                <button onclick="changePage(${i})" class="pagination-btn">${i}</button>
            `);
        }
    }

    // Next Button
    const nextDisabled = currentPage === totalPages;
    buttons.push(`
        <button onclick="changePage(${currentPage + 1})" ${nextDisabled ? 'disabled' : ''} class="pagination-btn">
            <iconify-icon icon="solar:alt-arrow-right-line-duotone" style="font-size: 1.1rem;"></iconify-icon>
        </button>
    `);

    pagContainer.innerHTML = `
        <div class="pagination-capsule">
            ${buttons.join('')}
        </div>
    `;
}

// Page Change Trigger
window.changePage = function(page) {
    currentPage = page;
    renderApps();
    // Scroll viewport cleanly to category block top for smooth UX
    const scrollTarget = document.getElementById('current-category-title');
    if (scrollTarget) {
        scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
};

function showError(msg) {
    if (loadingEl) {
        loadingEl.innerHTML = `
            <div class="loading-panel text-center">
                <iconify-icon icon="solar:danger-triangle-line-duotone" class="loading-spinner" style="color: var(--color-danger); margin-bottom: 1.5rem;"></iconify-icon>
                <div class="loading-text" style="color: var(--color-text-primary);">${msg}</div>
            </div>
        `;
    }
}

// Modal Logic
window.openModal = function(id) { 
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('show');
    el.setAttribute('data-show', 'true');
};

window.closeModal = function(id) { 
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('show');
    el.setAttribute('data-show', 'false');
};

if (adminLoginBtn) {
    adminLoginBtn.addEventListener('click', () => {
        if (isAdmin) openAdminDashboard();
        else {
            openModal('login-modal');
            const pwInput = document.getElementById('admin-password');
            if (pwInput) pwInput.value = '';
            setTimeout(() => {
                if (pwInput) pwInput.focus();
            }, 100);
        }
    });
}

function loginAdmin() {
    const pwInput = document.getElementById('admin-password');
    const pw = pwInput ? pwInput.value : '';
    if (!pw) return alert("비밀번호를 입력해주세요.");
    isAdmin = true;
    window.adminPassword = pw;
    closeModal('login-modal');
    openAdminDashboard();
}

let adminSortColumn = 'name'; 
let adminSortOrder = 'asc';

window.sortAdminTable = function(column) {
    if (adminSortColumn === column) {
        adminSortOrder = adminSortOrder === 'asc' ? 'desc' : 'asc';
    } else {
        adminSortColumn = column;
        adminSortOrder = 'asc';
    }
    renderAdminTable();
};

function openAdminDashboard() {
    openModal('admin-dashboard-modal');
    switchAdminTab('registry');
    renderAdminTable();
}

function renderAdminTable() {
    const iconCat = document.getElementById('icon-sort-category');
    const iconName = document.getElementById('icon-sort-name');
    if (iconCat) {
        if (adminSortColumn === 'category') iconCat.icon = adminSortOrder === 'asc' ? 'solar:alt-arrow-down-line-duotone' : 'solar:alt-arrow-up-line-duotone';
        else iconCat.icon = 'solar:sort-vertical-linear';
    }
    if (iconName) {
        if (adminSortColumn === 'name') iconName.icon = adminSortOrder === 'asc' ? 'solar:alt-arrow-down-line-duotone' : 'solar:alt-arrow-up-line-duotone';
        else iconName.icon = 'solar:sort-vertical-linear';
    }

    const sortedData = [...appsData].sort((a, b) => {
        let valA = (a[adminSortColumn] || '').toString();
        let valB = (b[adminSortColumn] || '').toString();
        let cmp = valA.localeCompare(valB, 'ko-KR');
        
        if (cmp === 0 && adminSortColumn === 'category') {
            cmp = (a.name || '').toString().localeCompare((b.name || '').toString(), 'ko-KR');
        }
        
        return adminSortOrder === 'asc' ? cmp : -cmp;
    });

    if (adminAppsList) {
        adminAppsList.innerHTML = sortedData.map(app => {
            const isActive = app.isActive !== false && app.isActive !== 'FALSE' && app.isActive !== 'false';
            
            return `
            <tr class="registry-row">
                <td class="registry-cell"><span class="registry-cat-badge">${app.category || '일반'}</span></td>
                <td class="registry-cell">
                    <div class="registry-product-cell">
                        <div class="registry-product-icon-box">
                            <iconify-icon icon="${app.icon || 'solar:link-circle-bold-duotone'}"></iconify-icon>
                        </div>
                        <div>
                            <div class="registry-product-name" style="${!isActive ? 'text-decoration: line-through; opacity: 0.5;' : ''}">${app.name}</div>
                            ${!isActive ? '<span class="registry-product-disabled-tag">비활성화됨</span>' : ''}
                        </div>
                    </div>
                </td>
                <td class="registry-cell hidden md:table-cell">
                    <a href="${app.url}" target="_blank" class="registry-link">${app.url}</a>
                </td>
                <td class="registry-cell" style="width: 140px;">
                    <div class="registry-actions-wrap">
                        <button class="registry-action-btn edit-btn" onclick="editApp('${app.id}')" title="수정"><iconify-icon icon="solar:pen-new-square-bold-duotone"></iconify-icon></button>
                        <button class="registry-action-btn delete-btn" onclick="deleteApp('${app.id}')" title="삭제"><iconify-icon icon="solar:trash-bin-trash-bold-duotone"></iconify-icon></button>
                    </div>
                </td>
            </tr>
        `}).join('');

        if (appsData.length === 0) {
            adminAppsList.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 3rem; color: var(--color-text-secondary); font-weight: bold;">배포된 시스템이 없습니다.</td></tr>';
        }
    }
}

function openAppForm(appId = null) {
    if (appForm) appForm.reset();
    
    const categoryList = document.getElementById('category-list');
    if (categoryList) {
        let categories = new Set(appsData.map(a => a.category).filter(c => c && c.trim() !== ''));
        ['인사방', '교육방', '마케팅방', '재무방'].forEach(opt => categories.add(opt));
        categoryList.innerHTML = Array.from(categories).map(cat => `<option value="${cat}"></option>`).join('');
    }

    if (appId) {
        document.getElementById('form-title').innerText = '메타데이터 편집';
        const app = appsData.find(a => a.id === appId);
        if (app) {
            document.getElementById('form-app-id').value = app.id;
            document.getElementById('form-name').value = app.name;
            document.getElementById('form-url').value = app.url;
            document.getElementById('form-category').value = app.category || '일반';
            document.getElementById('form-icon').value = app.icon || 'solar:link-circle-bold-duotone';
            document.getElementById('form-description').value = app.description || '';
            
            const isLocked = app.isLocked === true || app.isLocked === 'TRUE' || app.isLocked === 'true';
            document.getElementById('form-is-locked').checked = isLocked;
            document.getElementById('form-app-password').value = app.password || '';
            
            const isActive = app.isActive !== false && app.isActive !== 'FALSE' && app.isActive !== 'false';
            document.getElementById('form-is-active').checked = isActive;
        }
    } else {
        document.getElementById('form-title').innerText = '시스템 등록';
        document.getElementById('form-app-id').value = '';
        document.getElementById('form-icon').value = 'solar:link-circle-bold-duotone';
        document.getElementById('form-is-locked').checked = false;
        document.getElementById('form-app-password').value = '';
        document.getElementById('form-is-active').checked = true;
    }
    togglePasswordField();
    openModal('app-form-modal');
}
window.editApp = openAppForm;

async function submitAppForm(e) {
    e.preventDefault();
    const id = document.getElementById('form-app-id').value;
    const action = id ? 'edit' : 'add';
    const isLocked = document.getElementById('form-is-locked').checked;
    const isActive = document.getElementById('form-is-active').checked;
    const pwdValue = document.getElementById('form-app-password').value;
    
    if (isLocked && !pwdValue.trim()) {
        alert("보안 잠금이 설정되었습니다. 반드시 접속 암호를 입력해주세요.");
        return;
    }
    
    const appData = {
        name: document.getElementById('form-name').value,
        url: document.getElementById('form-url').value,
        category: document.getElementById('form-category').value,
        icon: document.getElementById('form-icon').value,
        description: document.getElementById('form-description').value,
        isLocked: isLocked,
        password: isLocked ? pwdValue : '',
        isActive: isActive
    };
    if (id) appData.id = id;

    const submitBtn = document.getElementById('form-submit-btn');
    const originalContent = submitBtn.innerHTML;
    submitBtn.innerHTML = `<iconify-icon icon="solar:spinner-track-bold-duotone" style="font-size: 1.25rem; vertical-align: middle; margin-right: 0.5rem;" class="animate-spin"></iconify-icon> <span>기록 중...</span>`;
    submitBtn.disabled = true;

    await requestBackend(action, appData);

    submitBtn.innerHTML = originalContent;
    submitBtn.disabled = false;
    closeModal('app-form-modal');
}

window.deleteApp = async function (id) {
    if (!confirm("이 시스템 기록을 완전히 삭제하시겠습니까?")) return;
    await requestBackend('delete', { id });
}

async function requestBackend(action, appData) {
    alertStatus('동기화 중...', 'success');
    try {
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({ action: action, password: window.adminPassword, appData: appData })
        });
        const result = await response.json();
        if (result.status === 'success') {
            alertStatus('저장됨', 'success');
            await fetchApps();
            if (document.getElementById('admin-dashboard-modal').getAttribute('data-show') === 'true') {
                renderAdminTable();
            }
        } else {
            alertStatus('권한 오류: ' + result.message, 'error');
            if (result.message.includes('비밀번호')) {
                isAdmin = false;
                window.adminPassword = '';
                closeModal('admin-dashboard-modal');
                openModal('login-modal');
            }
        }
    } catch (e) {
        alertStatus('네트워크 에러', 'error');
    }
}

function alertStatus(msg, type = 'success') {
    if (adminStatus) {
        adminStatus.innerText = msg;
        adminStatus.style.color = type === 'success' ? 'var(--color-brand)' : 'var(--color-danger)';
        setTimeout(() => { if (adminStatus.innerText === msg) adminStatus.innerText = ''; }, 3000);
    }
}

window.togglePasswordField = function() {
    const isLocked = document.getElementById('form-is-locked').checked;
    const pwdGroup = document.getElementById('password-group');
    const pwdInput = document.getElementById('form-app-password');
    if (isLocked) {
        pwdGroup.classList.remove('hidden');
    } else {
        pwdGroup.classList.add('hidden');
        if (pwdInput) pwdInput.value = '';
    }
};

/* ----------------------------------------------------
   11. Health status Ping Logic
   ---------------------------------------------------- */
async function pingApp(app) {
    pingStatuses[app.id] = 'checking';
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        await fetch(app.url, { mode: 'no-cors', signal: controller.signal });
        clearTimeout(timeoutId);
        pingStatuses[app.id] = 'online';
    } catch (error) {
        pingStatuses[app.id] = 'offline';
    }
    softRenderPing(app.id);
}

function softRenderPing(appId) {
    const statusDots = document.querySelectorAll(`[data-ping-app-id="${appId}"]`);
    statusDots.forEach(dot => {
        const state = pingStatuses[appId] || 'checking';
        if (state === 'checking') {
            dot.className = "status-badge checking";
            dot.innerHTML = `<iconify-icon icon="solar:spinner-track-bold-duotone" class="animate-spin" style="font-size: 0.75rem;"></iconify-icon> Checking`;
        } else if (state === 'online') {
            dot.className = "status-badge online";
            dot.innerHTML = `<span class="status-badge-dot"></span> Online`;
        } else {
            dot.className = "status-badge offline";
            dot.innerHTML = `<span class="status-badge-dot"></span> Offline`;
        }
    });
}

function startHealthCheckLoop() {
    appsData.forEach(app => {
        if (app.isActive !== false && app.isActive !== 'FALSE' && app.isActive !== 'false') {
            pingApp(app);
        }
    });
    
    setInterval(() => {
        appsData.forEach(app => {
            if (app.isActive !== false && app.isActive !== 'FALSE' && app.isActive !== 'false') {
                pingApp(app);
            }
        });
    }, 30000);
}

/* ----------------------------------------------------
   12. Alt + [1-9] Quick shortcuts
   ---------------------------------------------------- */
document.addEventListener('keydown', (e) => {
    if (e.altKey && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const index = parseInt(e.key) - 1;
        const favId = favorites[index];
        if (favId) {
            const app = appsData.find(a => a.id === favId);
            if (app && app.isActive !== false && app.isActive !== 'FALSE' && app.isActive !== 'false') {
                window.logClick(app.id);
                window.open(app.url, '_blank');
            }
        }
    }
});

/* ----------------------------------------------------
   13. Reorder Logic
   ---------------------------------------------------- */
window.toggleReorderMode = function() {
    reorderModeActive = !reorderModeActive;
    const reorderBtn = document.getElementById('reorder-toggle-btn');
    if (reorderBtn) {
        if (reorderModeActive) {
            reorderBtn.className = "reorder-btn active";
        } else {
            reorderBtn.className = "reorder-btn";
        }
    }
    renderApps();
};

window.moveApp = function(appId, direction, event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    
    if (customOrder.length === 0 || customOrder.length !== appsData.length) {
        customOrder = appsData.map(a => a.id);
    }
    
    const index = customOrder.indexOf(appId);
    if (index === -1) return;
    
    let targetIndex = index;
    if (direction === 'prev' || direction === 'up') {
        targetIndex = index - 1;
    } else if (direction === 'next' || direction === 'down') {
        targetIndex = index + 1;
    }
    
    if (targetIndex >= 0 && targetIndex < customOrder.length) {
        const temp = customOrder[index];
        customOrder[index] = customOrder[targetIndex];
        customOrder[targetIndex] = temp;
        
        localStorage.setItem('hub-custom-order', JSON.stringify(customOrder));
        renderApps();
    }
};

function updateReorderToggleVisibility() {
    const reorderContainer = document.getElementById('reorder-toggle-container');
    if (!reorderContainer) return;
    if (sortBy === 'custom') {
        reorderContainer.classList.remove('hidden');
    } else {
        reorderContainer.classList.add('hidden');
        reorderModeActive = false;
        const reorderBtn = document.getElementById('reorder-toggle-btn');
        if (reorderBtn) {
            reorderBtn.className = "reorder-btn";
        }
    }
}

/* ----------------------------------------------------
   14. Theme switch customizer
   ---------------------------------------------------- */
window.setTheme = function(themeName) {
    currentTheme = themeName;
    localStorage.setItem('hub-theme', themeName);
    document.body.className = '';
    document.body.classList.add('theme-' + themeName);
};

/* ----------------------------------------------------
   15. Admin Panel Tabs and Stats Analytics
   ---------------------------------------------------- */
window.switchAdminTab = function(tab) {
    const regTab = document.getElementById('tab-registry-btn');
    const anaTab = document.getElementById('tab-analytics-btn');
    const regView = document.getElementById('admin-registry-view');
    const anaView = document.getElementById('admin-analytics-view');
    const addAppBtn = document.getElementById('admin-add-app-btn');
    
    if (!regTab || !anaTab || !regView || !anaView) return;
    
    if (tab === 'registry') {
        regTab.className = "admin-tab-btn active";
        anaTab.className = "admin-tab-btn";
        regView.classList.remove('hidden');
        anaView.classList.add('hidden');
        if (addAppBtn) addAppBtn.classList.remove('hidden');
    } else {
        anaTab.className = "admin-tab-btn active";
        regTab.className = "admin-tab-btn";
        regView.classList.add('hidden');
        anaView.classList.remove('hidden');
        if (addAppBtn) addAppBtn.classList.add('hidden');
        renderAdminAnalytics();
    }
};

window.renderAdminAnalytics = function() {
    const totalAppsEl = document.getElementById('stats-total-apps');
    const totalClicksEl = document.getElementById('stats-total-clicks');
    const hotCategoryEl = document.getElementById('stats-hot-category');
    const chartContainer = document.getElementById('analytics-chart-container');
    
    if (!totalAppsEl || !totalClicksEl || !hotCategoryEl || !chartContainer) return;
    
    const totalApps = appsData.length;
    totalAppsEl.innerText = `${totalApps}개`;
    
    let totalClicks = 0;
    const clickData = [];
    const categoryClicks = {};
    
    appsData.forEach(app => {
        const appClicks = clicks[app.id] || 0;
        totalClicks += appClicks;
        clickData.push({
            id: app.id,
            name: app.name,
            category: app.category || '일반',
            clicks: appClicks
        });
        
        const cat = app.category || '일반';
        categoryClicks[cat] = (categoryClicks[cat] || 0) + appClicks;
    });
    
    totalClicksEl.innerText = `${totalClicks}회`;
    
    let hotCategory = '-';
    let maxCatClicks = -1;
    for (const cat in categoryClicks) {
        if (categoryClicks[cat] > maxCatClicks) {
            maxCatClicks = categoryClicks[cat];
            hotCategory = cat;
        }
    }
    
    if (totalClicks === 0) {
        hotCategoryEl.innerText = totalApps > 0 ? (appsData[0].category || '일반') : '-';
    } else {
        hotCategoryEl.innerText = `${hotCategory} (${maxCatClicks}회)`;
    }
    
    clickData.sort((a, b) => b.clicks - a.clicks);
    const maxClicks = clickData.length > 0 ? Math.max(...clickData.map(d => d.clicks)) : 0;
    
    if (clickData.length === 0) {
        chartContainer.innerHTML = `
            <div style="text-align: center; padding: 3rem; color: var(--color-text-secondary); font-weight: bold;">
                분석할 이용 데이터가 없습니다.
            </div>
        `;
        return;
    }
    
    chartContainer.innerHTML = clickData.map((data, idx) => {
        const pct = maxClicks > 0 ? Math.round((data.clicks / maxClicks) * 100) : 0;
        return `
            <div class="chart-row">
                <div class="chart-rank-badge">${idx + 1}</div>
                <div class="chart-bar-content">
                    <div class="chart-bar-info">
                        <div class="chart-bar-title-wrap">
                            <span class="chart-bar-title">${data.name}</span>
                            <span class="list-item-cat-label">${data.category}</span>
                        </div>
                        <span class="chart-bar-clicks"><iconify-icon icon="solar:fire-bold" style="vertical-align: middle; margin-right: 0.15rem;"></iconify-icon>${data.clicks}회</span>
                    </div>
                    <div class="chart-track">
                        <div class="chart-fill" style="width: ${pct}%"></div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
};

/* ----------------------------------------------------
   16. Integrated Search & Autocomplete Dropdown Panel
   ---------------------------------------------------- */
function initSearchIntegration() {
    if (!searchInput) return;

    searchInput.addEventListener('focus', () => {
        openSearchDropdown();
    });

    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase().trim();
        selectedSearchIndex = 0;
        if (!searchDropdownOpen) {
            openSearchDropdown();
        } else {
            renderSearchDropdownResults();
        }
        renderApps(); // 실시간 필터링
    });

    searchInput.addEventListener('keydown', (e) => {
        if (searchDropdownOpen) {
            handleSearchKeydown(e);
        }
    });

    // Close on click outside search container
    document.addEventListener('click', (e) => {
        if (searchContainer && !searchContainer.contains(e.target)) {
            closeSearchDropdown();
        }
    });

    // Shortcut Ctrl + K or Cmd + K to focus
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            searchInput.focus();
            openSearchDropdown();
        }
    });
}

function openSearchDropdown() {
    if (!searchDropdownPanel) return;
    searchDropdownOpen = true;
    selectedSearchIndex = 0;
    searchDropdownPanel.classList.add('show');
    renderSearchDropdownResults();
}

window.closeSearchDropdown = function() {
    if (!searchDropdownPanel) return;
    searchDropdownOpen = false;
    searchDropdownPanel.classList.remove('show');
};

function renderSearchDropdownResults() {
    if (!searchDropdownList || !searchInput) return;
    
    const query = searchInput.value.toLowerCase().trim();
    
    const filtered = appsData.filter(app => {
        const name = (app.name || '').toLowerCase();
        const cat = (app.category || '일반').toLowerCase();
        const desc = (app.description || '').toLowerCase();
        return name.includes(query) || cat.includes(query) || desc.includes(query);
    });
    
    // Sort dropdown results by popularity (highest clicks first)
    filtered.sort((a, b) => {
        const clicksA = clicks[a.id] || 0;
        const clicksB = clicks[b.id] || 0;
        return clicksB - clicksA;
    });
    
    const displayApps = filtered.slice(0, 5);
    activeSearchApps = displayApps;
    
    if (displayApps.length === 0) {
        searchDropdownList.innerHTML = `
            <div style="text-align: center; padding: 2rem 1rem; color: var(--color-text-secondary); font-size: 0.9rem; font-weight: 700;">
                <iconify-icon icon="solar:magnifer-bug-bold-duotone" style="display: block; margin: 0 auto 0.5rem; font-size: 2.25rem; opacity: 0.5;"></iconify-icon>
                일치하는 시스템이 없습니다.
            </div>
        `;
        return;
    }
    
    if (selectedSearchIndex >= displayApps.length) {
        selectedSearchIndex = 0;
    }
    
    searchDropdownList.innerHTML = displayApps.map((app, idx) => {
        const isSelected = idx === selectedSearchIndex;
        const isLocked = app.isLocked === true || app.isLocked === 'TRUE' || app.isLocked === 'true';
        const isActive = app.isActive !== false && app.isActive !== 'FALSE' && app.isActive !== 'false';
        
        const selectedClass = isSelected ? 'selected' : '';
        const categoryLabel = app.category || '일반';
        
        let statusBadge = '';
        if (!isActive) {
            statusBadge = `<span class="status-badge offline" style="margin-left: 0.5rem;"><span class="status-badge-dot"></span>Offline</span>`;
        } else if (isLocked) {
            statusBadge = `<span class="status-badge secured" style="margin-left: 0.5rem;"><iconify-icon icon="solar:lock-keyhole-bold" class="text-[0.7rem] align-middle mr-0.5"></iconify-icon>Secured</span>`;
        }

        const safeUrl = (app.url || '').toString().replace(/'/g, "\\'");
        const safePw = (app.password || '').toString().replace(/'/g, "\\'");
        
        let actionStr = '';
        if (!isActive) {
            actionStr = `onclick="alert('시스템 점검 중입니다.')"`;
        } else if (isLocked) {
            actionStr = `onclick="closeSearchDropdown(); openLockedApp('${safeUrl}', '${safePw}', '${app.id}')"`;
        } else {
            actionStr = `onclick="closeSearchDropdown(); window.logClick('${app.id}'); window.open('${safeUrl}', '_blank')"`;
        }
        
        return `
            <div id="search-dropdown-item-${idx}" ${actionStr} class="search-dropdown-item ${selectedClass}" data-index="${idx}">
                <div class="search-dropdown-item-icon">
                    <iconify-icon icon="${app.icon || 'solar:link-circle-bold-duotone'}"></iconify-icon>
                </div>
                <div class="search-dropdown-item-content">
                    <div class="search-dropdown-item-header">
                        <span class="search-dropdown-item-title">${app.name}</span>
                        <span class="search-dropdown-item-category">${categoryLabel}</span>
                        ${statusBadge}
                    </div>
                    <span class="search-dropdown-item-description">${app.description || '시스템에 대한 설명이 없습니다.'}</span>
                </div>
                <div class="search-dropdown-item-action">
                    ${clicks[app.id] ? `<span style="font-weight: 700; margin-right: 0.5rem;"><iconify-icon icon="solar:fire-bold" style="vertical-align: middle; margin-right: 0.15rem;"></iconify-icon>${clicks[app.id]}</span>` : ''}
                    <iconify-icon icon="solar:arrow-right-up-linear"></iconify-icon>
                </div>
            </div>
        `;
    }).join('');
    
    // Hover item selector listener
    const rows = searchDropdownList.querySelectorAll('.search-dropdown-item');
    rows.forEach(row => {
        row.addEventListener('mouseenter', (e) => {
            selectedSearchIndex = parseInt(e.currentTarget.dataset.index);
            rows.forEach((r, i) => {
                if (i === selectedSearchIndex) {
                    r.classList.add('selected');
                } else {
                    r.classList.remove('selected');
                }
            });
        });
    });
}

function handleSearchKeydown(e) {
    const apps = activeSearchApps || [];
    if (apps.length === 0) return;
    
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedSearchIndex = (selectedSearchIndex + 1) % apps.length;
        renderSearchDropdownResults();
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedSearchIndex = (selectedSearchIndex - 1 + apps.length) % apps.length;
        renderSearchDropdownResults();
    } else if (e.key === 'Enter') {
        e.preventDefault();
        const selectedApp = apps[selectedSearchIndex];
        if (selectedApp) {
            const isLocked = selectedApp.isLocked === true || selectedApp.isLocked === 'TRUE' || selectedApp.isLocked === 'true';
            const isActive = selectedApp.isActive !== false && selectedApp.isActive !== 'FALSE' && selectedApp.isActive !== 'false';
            
            closeSearchDropdown();
            if (searchInput) searchInput.blur();
            
            if (!isActive) {
                alert('시스템 점검 중입니다.');
            } else if (isLocked) {
                const safeUrl = (selectedApp.url || '').toString().replace(/'/g, "\\'");
                const safePw = (selectedApp.password || '').toString().replace(/'/g, "\\'");
                openLockedApp(safeUrl, safePw, selectedApp.id);
            } else {
                window.logClick(selectedApp.id);
                window.open(selectedApp.url, '_blank');
            }
        }
    } else if (e.key === 'Escape') {
        e.preventDefault();
        closeSearchDropdown();
        if (searchInput) searchInput.blur();
    }
}

// App 암호 잠금 및 해제 메타 연동 모달 핸들러
window.openLockedApp = function(url, correctPassword, appId) {
    const userPass = prompt("보안 접근이 해제되지 않은 링크입니다. 암호를 입력해주세요:");
    if (userPass === null) return; // 취소
    if (userPass === correctPassword) {
        window.logClick(appId);
        window.open(url, '_blank');
    } else {
        alert("비밀번호가 올바르지 않습니다.");
    }
};
