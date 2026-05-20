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
let commandPaletteOpen = false;
let selectedPaletteIndex = 0;

let currentTheme = localStorage.getItem('hub-theme') || 'classic';
let reorderModeActive = false;
let pingStatuses = {}; // format: { appId: 'checking' | 'online' | 'offline' }
let customOrder = JSON.parse(localStorage.getItem('hub-custom-order')) || [];

// DOM Elements
const loadingEl = document.getElementById('loading');
const appsGrid = document.getElementById('apps-grid');
const adminLoginBtn = document.getElementById('admin-login-btn');
const adminDashboardModal = document.getElementById('admin-dashboard-modal');
const adminAppsList = document.getElementById('admin-apps-list');
const adminStatus = document.getElementById('admin-status');
const appForm = document.getElementById('app-form');

const searchInput = document.getElementById('search-input');
const categoryNav = document.getElementById('category-nav');
const currentCategoryTitle = document.getElementById('current-category-title');
const timeEl = document.getElementById('current-time');
const dateEl = document.getElementById('current-date');
const sidebar = document.getElementById('sidebar');
const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const mobileClose = document.getElementById('mobile-close');

// Auto close sidebar when clicking outside on mobile
document.addEventListener('click', (e) => {
    if (window.innerWidth <= 768 && sidebar.classList.contains('sidebar-open')) {
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

// Premium View Mode Toggle Logic
function updateViewToggleButtons() {
    const gridBtn = document.getElementById('view-grid-btn');
    const listBtn = document.getElementById('view-list-btn');
    if (!gridBtn || !listBtn) return;

    if (viewMode === 'grid') {
        gridBtn.className = "flex items-center gap-2 px-4 py-2.5 rounded-full text-[0.85rem] font-bold transition-all duration-300 bg-zinc-900 text-white shadow-md shadow-zinc-900/10";
        listBtn.className = "flex items-center gap-2 px-4 py-2.5 rounded-full text-[0.85rem] font-bold transition-all duration-300 text-zinc-400 hover:text-zinc-800 hover:bg-white/50";
    } else {
        gridBtn.className = "flex items-center gap-2 px-4 py-2.5 rounded-full text-[0.85rem] font-bold transition-all duration-300 text-zinc-400 hover:text-zinc-800 hover:bg-white/50";
        listBtn.className = "flex items-center gap-2 px-4 py-2.5 rounded-full text-[0.85rem] font-bold transition-all duration-300 bg-zinc-900 text-white shadow-md shadow-zinc-900/10";
    }
}

window.setViewMode = function(mode) {
    viewMode = mode;
    localStorage.setItem('hub-view-mode', mode);
    updateViewToggleButtons();
    renderApps();
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initClock();
    updateViewToggleButtons();
    
    // 테마 설정 복원
    setTheme(currentTheme);
    const themeSelector = document.getElementById('theme-selector');
    if (themeSelector) themeSelector.value = currentTheme;

    // Set initial sort option in selector
    const sortSelector = document.getElementById('sort-selector');
    if (sortSelector) sortSelector.value = sortBy;

    // custom 순서 관리 토글 표시 판단
    updateReorderToggleVisibility();

    if (!SCRIPT_URL) {
        showError(`초기 설정이 필요합니다. Code.gs를 배포하고 app.js 상단에 SCRIPT_URL을 입력하세요.`);
        return;
    }
    fetchApps();
});

// Mobile Sidebar
if (mobileMenuBtn) mobileMenuBtn.addEventListener('click', () => sidebar.classList.add('sidebar-open'));
if (mobileClose) mobileClose.addEventListener('click', () => sidebar.classList.remove('sidebar-open'));

if (appForm) appForm.addEventListener('submit', submitAppForm);

// Keyboard Shortcut for Search (Toggle Spotlight Command Palette)
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        openCommandPalette();
    } else if (commandPaletteOpen) {
        handlePaletteKeydown(e);
    }
});

// Main Search Input Trigger
if (searchInput) {
    // When focusing main search, open the immersive Spotlight Search instead
    searchInput.addEventListener('focus', (e) => {
        e.preventDefault();
        searchInput.blur();
        openCommandPalette();
    });
    searchInput.addEventListener('click', (e) => {
        e.preventDefault();
        openCommandPalette();
    });
}

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

// Render Sidebar Categories (Glassmorphic)
function renderCategories() {
    const categories = ['All', ...new Set(appsData.map(a => a.category || '일반'))];

    if (categoryNav) {
        categoryNav.innerHTML = categories.map(cat => {
            const isActive = cat === currentCategory;
            const activeClasses = isActive 
                ? 'text-zinc-900 bg-white/80 shadow-[0_4px_12px_rgba(0,0,0,0.04)] border border-white font-extrabold backdrop-blur-md' 
                : 'text-zinc-500 font-bold border border-transparent hover:text-zinc-900 hover:bg-white/50 hover:border-white';

            return `
            <li class="group flex items-center justify-between px-5 py-3.5 rounded-2xl cursor-pointer transition-all duration-300 ${activeClasses}" data-category="${cat}">
                <span class="text-[0.95rem] tracking-wide">${cat === 'All' ? '전체 시스템' : cat}</span>
                ${isActive ? '<iconify-icon icon="solar:round-alt-arrow-right-line-duotone" class="text-brand-green text-[1.2rem] drop-shadow-sm"></iconify-icon>' : ''}
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
        { text: 'text-brand-green', bg: 'bg-[#EBF1ED]' },
        { text: 'text-zinc-600', bg: 'bg-zinc-100' },
        { text: 'text-brand-yellow', bg: 'bg-[#FDF6D6]' },
        { text: 'text-brand-mint', bg: 'bg-[#E3EFE8]' }
    ];
    const theme = palette[Math.abs(hash) % palette.length];

    const isLocked = app.isLocked === true || app.isLocked === 'TRUE' || app.isLocked === 'true';
    const isActive = app.isActive !== false && app.isActive !== 'FALSE' && app.isActive !== 'false';
    const isFav = favorites.includes(app.id);

    const favoriteButton = `
        <button onclick="window.toggleFavorite('${app.id}', event)" class="w-9 h-9 rounded-full bg-white/80 backdrop-blur-md shadow-sm border border-zinc-100/80 flex items-center justify-center text-zinc-400 hover:text-brand-yellow hover:scale-105 active:scale-95 transition-all duration-300 z-20" title="${isFav ? '즐겨찾기 해제' : '즐겨찾기 등록'}">
            <iconify-icon icon="${isFav ? 'solar:star-bold' : 'solar:star-linear'}" class="${isFav ? 'text-brand-yellow' : 'text-zinc-400'} text-[1.1rem]"></iconify-icon>
        </button>
    `;
    
    const lockBadge = isLocked ? `<div class="px-2.5 py-1 rounded-md bg-white/80 shadow-sm text-[#FF6B6B] flex items-center gap-1.5 border border-[#FFEAEA] backdrop-blur-md"><iconify-icon icon="solar:lock-keyhole-bold-duotone" class="text-[0.85rem]"></iconify-icon><span class="text-[0.65rem] font-bold tracking-widest uppercase mt-px">Secured</span></div>` : '';
    const inactiveBadge = !isActive ? `<div class="px-2.5 py-1 rounded-md bg-zinc-100/80 shadow-sm text-zinc-500 flex items-center gap-1.5 border border-zinc-200 backdrop-blur-md"><iconify-icon icon="solar:forbidden-circle-bold-duotone" class="text-[0.85rem]"></iconify-icon><span class="text-[0.65rem] font-bold tracking-widest uppercase mt-px">Offline</span></div>` : '';
    
    // Live Status Health Checker Badge
    const pingStatus = pingStatuses[app.id] || 'checking';
    let pingBadge = '';
    if (isActive) {
        if (pingStatus === 'checking') {
            pingBadge = `<div data-ping-app-id="${app.id}" class="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-500 border border-zinc-200 text-[0.65rem] font-bold"><iconify-icon icon="solar:spinner-track-bold-duotone" class="animate-spin text-[0.75rem]"></iconify-icon> Checking</div>`;
        } else if (pingStatus === 'online') {
            pingBadge = `<div data-ping-app-id="${app.id}" class="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#E3EFE8] text-brand-green border border-brand-green/20 text-[0.65rem] font-bold"><span class="w-1.5 h-1.5 rounded-full bg-brand-green animate-pulse"></span> Online</div>`;
        } else {
            pingBadge = `<div data-ping-app-id="${app.id}" class="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#FFF5F5] text-red-500 border border-red-200 text-[0.65rem] font-bold"><span class="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span> Offline</div>`;
        }
    }

    let badgesContainer = `<div class="flex gap-2">${lockBadge}${inactiveBadge}${pingBadge}</div>`;

    // Keyboard Shortcuts Alt + [1-9] Guideline
    const favIndex = favorites.indexOf(app.id);
    let shortcutBadge = '';
    if (favIndex >= 0 && favIndex < 9) {
        shortcutBadge = `<span class="inline-flex items-center bg-zinc-900/5 dark:bg-white/10 text-zinc-500 dark:text-zinc-400 text-[0.65rem] font-bold px-1.5 py-0.5 rounded border border-zinc-200/50 dark:border-white/10 select-none" title="Alt + ${favIndex + 1} 단축키로 실행 가능"><kbd class="font-mono">Alt + ${favIndex + 1}</kbd></span>`;
    }

    // Custom Order Reorder Buttons
    let reorderButtons = '';
    if (sortBy === 'custom' && reorderModeActive && !isFavoriteItem) {
        reorderButtons = `
            <div class="flex items-center gap-1 z-30 mr-1" onclick="event.stopPropagation();">
                <button onclick="window.moveApp('${app.id}', 'prev', event)" class="w-8 h-8 rounded-full bg-white/90 border border-zinc-200 text-zinc-600 hover:bg-zinc-900 hover:text-white flex items-center justify-center transition-all shadow-sm active:scale-95" title="앞으로 이동">
                    <iconify-icon icon="solar:alt-arrow-left-line-duotone" class="text-sm"></iconify-icon>
                </button>
                <button onclick="window.moveApp('${app.id}', 'next', event)" class="w-8 h-8 rounded-full bg-white/90 border border-zinc-200 text-zinc-600 hover:bg-zinc-900 hover:text-white flex items-center justify-center transition-all shadow-sm active:scale-95" title="뒤로 이동">
                    <iconify-icon icon="solar:alt-arrow-right-line-duotone" class="text-sm"></iconify-icon>
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
        return `
        <${closingTag} ${cardAction} class="${extraClasses} group block w-full rounded-[1.8rem] bg-white/40 border border-white hover:border-brand-green/30 transition-all duration-500 ease-out hover:-translate-y-0.5 hover:shadow-[0_15px_30px_rgba(0,0,0,0.03)] relative animate-fade-in-up ${!isActive ? 'opacity-60 grayscale cursor-not-allowed hover:shadow-none hover:border-white' : 'cursor-pointer shadow-[0_4px_20px_rgba(0,0,0,0.02)] backdrop-blur-md'}" style="animation-delay: ${index * 40}ms; opacity: 0; outline: none;">
            
            <!-- Double Bezel Inner Core -->
            <div class="flex flex-col sm:flex-row sm:items-center justify-between rounded-[calc(1.8rem-1px)] bg-gradient-to-br from-white/95 via-white/80 to-zinc-50/50 p-5 sm:p-6 gap-4 sm:gap-6">
                
                <div class="flex items-center gap-5 flex-1 min-w-0">
                    <!-- Premium Icon Box -->
                    <div class="w-12 h-12 rounded-[1rem] shrink-0 ${theme.bg} ${theme.text} flex items-center justify-center text-[1.8rem] group-hover:scale-[1.08] group-hover:rotate-2 transition-transform duration-500 ease-out shadow-[inset_0_1px_1px_rgba(255,255,255,0.8),0_4px_12px_rgba(0,0,0,0.03)] border border-white">
                        <iconify-icon icon="${app.icon || 'solar:link-circle-bold-duotone'}"></iconify-icon>
                    </div>
                    
                    <div class="flex-1 min-w-0">
                        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 mb-1">
                            <h3 class="font-extrabold text-zinc-900 text-[1.1rem] tracking-tight leading-tight flex items-center gap-1.5">${app.name} ${shortcutBadge}</h3>
                            <span class="inline-block text-[0.6rem] font-extrabold text-zinc-400 tracking-[0.15em] uppercase px-2 py-0.5 rounded bg-zinc-100/50 border border-zinc-200/30">${catName}</span>
                            ${clicks[app.id] ? `<span class="inline-flex items-center gap-1 text-[0.6rem] font-bold text-brand-green bg-brand-green/10 border border-brand-green/20 px-1.5 py-0.5 rounded-md"><iconify-icon icon="solar:fire-bold"></iconify-icon> ${clicks[app.id]}</span>` : ''}
                        </div>
                        <p class="text-[0.85rem] text-zinc-500 font-medium line-clamp-1 leading-relaxed">${app.description || '시스템에 대한 설명이 없습니다.'}</p>
                    </div>
                </div>
                
                <div class="flex items-center justify-between sm:justify-end gap-3 shrink-0 border-t border-zinc-100 sm:border-0 pt-3 sm:pt-0">
                    ${reorderButtons}
                    ${favoriteButton}
                    ${badgesContainer}
                    ${isActive && !isLocked ? '<div class="w-8 h-8 rounded-full bg-white shadow-sm border border-zinc-100 flex items-center justify-center text-zinc-400 group-hover:text-brand-green group-hover:bg-zinc-50 transition-colors duration-300"><iconify-icon icon="solar:arrow-right-up-linear" class="text-base"></iconify-icon></div>' : ''}
                </div>
                
            </div>
        </${closingTag}>
        `;
    }

    // Grid layout (applied also in Favorites drawer for aesthetic uniformity)
    return `
    <${closingTag} ${cardAction} class="${extraClasses} group block h-full rounded-[2.2rem] bg-white/40 border border-white hover:border-brand-green/30 transition-all duration-500 ease-out hover:-translate-y-2 hover:shadow-[0_30px_60px_-15px_rgba(134,167,137,0.25)] relative animate-fade-in-up ${!isActive ? 'opacity-60 grayscale cursor-not-allowed hover:translate-y-0 hover:shadow-none hover:border-white' : 'cursor-pointer shadow-[0_8px_30px_rgba(0,0,0,0.04)] backdrop-blur-md'}" style="animation-delay: ${index * 60}ms; opacity: 0; outline: none;">
        
        <!-- Double Bezel Inner Core - Forced to fill height -->
        <div class="flex flex-col h-full rounded-[calc(2.2rem-1px)] bg-gradient-to-br from-white/90 via-white/70 to-zinc-50/50 shadow-[inset_0_1px_2px_rgba(255,255,255,1)] p-8">
            
            <div class="flex items-start justify-between mb-8">
                <!-- Premium Icon Box -->
                <div class="w-16 h-16 rounded-[1.3rem] ${theme.bg} ${theme.text} flex items-center justify-center text-[2.2rem] group-hover:scale-[1.1] group-hover:rotate-3 transition-transform duration-500 ease-out shadow-[inset_0_1px_1px_rgba(255,255,255,0.8),0_4px_12px_rgba(0,0,0,0.05)] border border-white">
                    <iconify-icon icon="${app.icon || 'solar:link-circle-bold-duotone'}"></iconify-icon>
                </div>
                <div class="flex flex-col items-end gap-2">
                    ${reorderButtons}
                    ${favoriteButton}
                    ${badgesContainer}
                </div>
            </div>
            
            <div class="mt-auto flex flex-col flex-1">
                <div class="flex items-center justify-between mb-2.5">
                    <div class="text-[0.65rem] font-extrabold text-zinc-400 tracking-[0.2em] uppercase drop-shadow-sm">${catName}</div>
                    ${clicks[app.id] ? `<div class="flex items-center gap-1 text-[0.65rem] font-bold text-brand-green bg-brand-green/10 border border-brand-green/20 px-2 py-0.5 rounded-md"><iconify-icon icon="solar:fire-bold"></iconify-icon> ${clicks[app.id]}회</div>` : ''}
                </div>
                <div class="flex items-center gap-3 mb-3">
                    <h3 class="font-extrabold text-zinc-900 text-[1.3rem] tracking-tight leading-tight flex-1 flex items-center gap-1.5 flex-wrap">${app.name} ${shortcutBadge}</h3>
                    ${isActive && !isLocked ? '<div class="w-9 h-9 rounded-full bg-white shadow-sm border border-zinc-100 flex items-center justify-center opacity-0 -translate-x-3 translate-y-3 group-hover:opacity-100 group-hover:translate-x-0 group-hover:translate-y-0 transition-all duration-500 text-brand-green"><iconify-icon icon="solar:arrow-right-up-linear" class="text-lg"></iconify-icon></div>' : ''}
                </div>
                <p class="text-[0.95rem] text-zinc-500 leading-relaxed font-medium line-clamp-2">${app.description || '시스템에 대한 설명이 없습니다.'}</p>
            </div>
            
        </div>
    </${closingTag}>
    `;
}

// Render Apps Grid (Double Bezel + Stretching)
function renderApps() {
    loadingEl.classList.add('hidden');
    appsGrid.classList.remove('hidden');

    if (appsData.length === 0) {
        appsGrid.classList.add('hidden');
        document.getElementById('favorites-container').classList.add('hidden');
        loadingEl.classList.remove('hidden');
        loadingEl.innerHTML = `
            <div class="flex flex-col items-center justify-center py-24 w-full animate-fade-in-up text-center">
                <iconify-icon icon="solar:folder-error-bold-duotone" class="text-6xl text-zinc-300 mb-6 drop-shadow-sm"></iconify-icon>
                <h3 class="text-xl font-extrabold text-zinc-800 tracking-tight mb-2">등록된 시스템이 없습니다</h3>
                <p class="text-[0.95rem] text-zinc-500 font-medium">우측 하단 관리자 패널에서 시스템을 배포하세요.</p>
            </div>
        `;
        return;
    }

    // 1. FILTERING
    let filteredApps = appsData.filter(app => {
        const matchesCategory = currentCategory === 'All' || (app.category || '일반') === currentCategory;
        const searchTarget = (app.name + ' ' + (app.description || '')).toLowerCase();
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

    // 3. RENDER PINNED FAVORITES DRAWER
    const favoritesContainer = document.getElementById('favorites-container');
    const favoritesGrid = document.getElementById('favorites-grid');
    const favApps = appsData.filter(app => favorites.includes(app.id));

    if (favApps.length > 0) {
        favoritesContainer.classList.remove('hidden');
        favoritesGrid.innerHTML = favApps.map((app, idx) => generateAppCard(app, idx, true)).join('');
    } else {
        favoritesContainer.classList.add('hidden');
        favoritesGrid.innerHTML = '';
    }

    // 4. EMPTY FILTER RESULTS
    if (filteredApps.length === 0) {
        appsGrid.classList.add('hidden');
        document.getElementById('pagination-container').innerHTML = '';
        loadingEl.classList.remove('hidden');
        loadingEl.innerHTML = `
            <div class="flex flex-col items-center justify-center py-24 w-full animate-fade-in-up text-center">
                <iconify-icon icon="solar:magnifer-bold-duotone" class="text-6xl text-zinc-300 mb-6 drop-shadow-sm"></iconify-icon>
                <p class="text-[0.95rem] text-zinc-500 font-bold tracking-wide">검색 결과가 없습니다.</p>
            </div>
        `;
        return;
    }

    // 5. PAGINATION SLICING
    const itemsPerPage = viewMode === 'grid' ? 8 : 5;
    const totalItems = filteredApps.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);

    if (currentPage > totalPages) {
        currentPage = 1;
    }

    const startIndex = (currentPage - 1) * itemsPerPage;
    const slicedApps = filteredApps.slice(startIndex, startIndex + itemsPerPage);

    // 6. DRAW ITEMS
    if (viewMode === 'grid') {
        appsGrid.className = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6";
    } else {
        appsGrid.className = "flex flex-col gap-4 w-full animate-fade-in-up";
    }

    appsGrid.innerHTML = slicedApps.map((app, index) => generateAppCard(app, index, false)).join('');
    
    // 7. RENDER PAGINATION CONTROLS
    renderPagination(totalItems, itemsPerPage);
}

// Premium Render Glassmorphic Pagination Capsule
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
        <button onclick="changePage(${currentPage - 1})" ${prevDisabled ? 'disabled' : ''} class="w-10 h-10 rounded-full flex items-center justify-center border transition-all duration-300 ${prevDisabled ? 'border-transparent text-zinc-300 cursor-not-allowed' : 'border-zinc-200 bg-white/60 hover:bg-white text-zinc-600 hover:text-zinc-900 shadow-sm active:scale-95'}">
            <iconify-icon icon="solar:alt-arrow-left-line-duotone" class="text-[1.1rem]"></iconify-icon>
        </button>
    `);

    // Numeric Pages
    for (let i = 1; i <= totalPages; i++) {
        const isCurrent = currentPage === i;
        if (isCurrent) {
            buttons.push(`
                <button class="h-10 px-4 rounded-full text-[0.85rem] font-extrabold bg-zinc-900 text-white shadow-md shadow-zinc-900/15 pointer-events-none transition-all duration-300">${i}</button>
            `);
        } else {
            buttons.push(`
                <button onclick="changePage(${i})" class="h-10 px-4 rounded-full text-[0.85rem] font-bold border border-zinc-200/80 bg-white/60 hover:bg-white text-zinc-500 hover:text-zinc-900 hover:shadow-sm active:scale-95 transition-all duration-300">${i}</button>
            `);
        }
    }

    // Next Button
    const nextDisabled = currentPage === totalPages;
    buttons.push(`
        <button onclick="changePage(${currentPage + 1})" ${nextDisabled ? 'disabled' : ''} class="w-10 h-10 rounded-full flex items-center justify-center border transition-all duration-300 ${nextDisabled ? 'border-transparent text-zinc-300 cursor-not-allowed' : 'border-zinc-200 bg-white/60 hover:bg-white text-zinc-600 hover:text-zinc-900 shadow-sm active:scale-95'}">
            <iconify-icon icon="solar:alt-arrow-right-line-duotone" class="text-[1.1rem]"></iconify-icon>
        </button>
    `);

    // Wrap in premium ambient glass capsule
    pagContainer.innerHTML = `
        <div class="inline-flex items-center gap-1.5 bg-white/40 backdrop-blur-md border border-white p-1.5 rounded-full shadow-[0_4px_25px_rgba(0,0,0,0.02)]">
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
    loadingEl.innerHTML = `
        <div class="flex flex-col items-center justify-center py-20 w-full text-center">
            <iconify-icon icon="solar:danger-triangle-line-duotone" class="text-6xl text-red-400 mb-6 drop-shadow-sm"></iconify-icon>
            <div class="text-center leading-relaxed text-zinc-600 font-bold">${msg}</div>
        </div>
    `;
}

// Modal Logic
function openModal(id) { 
    const el = document.getElementById(id);
    el.setAttribute('data-show', 'true');
}

function closeModal(id) { 
    const el = document.getElementById(id);
    el.setAttribute('data-show', 'false');
}

if (adminLoginBtn) {
    adminLoginBtn.addEventListener('click', () => {
        if (isAdmin) openAdminDashboard();
        else {
            openModal('login-modal');
            document.getElementById('admin-password').value = '';
            setTimeout(() => document.getElementById('admin-password').focus(), 100);
        }
    });
}

function loginAdmin() {
    const pw = document.getElementById('admin-password').value;
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

    adminAppsList.innerHTML = sortedData.map(app => {
        const isActive = app.isActive !== false && app.isActive !== 'FALSE' && app.isActive !== 'false';
        
        return `
        <tr class="group hover:bg-white/90 transition-colors rounded-2xl relative bg-white/50 backdrop-blur-sm">
            <td class="px-6 py-4 rounded-l-2xl border-y border-l border-zinc-200/50 border-r-0"><span class="text-[0.65rem] font-bold text-zinc-500 uppercase tracking-[0.1em] bg-white shadow-sm px-2.5 py-1.5 rounded-lg border border-zinc-100">${app.category || '일반'}</span></td>
            <td class="px-6 py-4 font-bold text-zinc-800 border-y border-zinc-200/50">
                <div class="flex items-center gap-4">
                    <div class="w-11 h-11 rounded-xl bg-brand-green/10 text-brand-green border border-white flex items-center justify-center text-xl shadow-sm">
                        <iconify-icon icon="${app.icon || 'solar:link-circle-bold-duotone'}"></iconify-icon>
                    </div>
                    <div>
                        <div class="${!isActive ? 'line-through text-zinc-400' : 'text-zinc-900'} text-[1.05rem] font-extrabold tracking-tight leading-none mb-1.5">${app.name}</div>
                        ${!isActive ? '<span class="text-[0.65rem] text-red-500 font-bold uppercase tracking-wider">비활성화됨</span>' : ''}
                    </div>
                </div>
            </td>
            <td class="px-6 py-4 border-y border-zinc-200/50 hidden md:table-cell">
                <a href="${app.url}" target="_blank" class="text-zinc-500 text-[0.85rem] font-medium hover:text-brand-green truncate block max-w-[200px] transition-colors tracking-wide">${app.url}</a>
            </td>
            <td class="px-6 py-4 rounded-r-2xl text-right border-y border-r border-zinc-200/50 border-l-0 w-[140px]">
                <div class="flex items-center justify-end gap-2">
                    <button class="w-9 h-9 rounded-full flex items-center justify-center bg-white text-zinc-500 hover:bg-brand-green hover:text-white border border-white transition-all shadow-sm" onclick="editApp('${app.id}')" title="수정"><iconify-icon icon="solar:pen-new-square-bold-duotone" class="text-base"></iconify-icon></button>
                    <button class="w-9 h-9 rounded-full flex items-center justify-center bg-[#FFF5F5] text-[#FF6B6B] hover:bg-[#FF6B6B] hover:text-white border border-white transition-all shadow-sm" onclick="deleteApp('${app.id}')" title="삭제"><iconify-icon icon="solar:trash-bin-trash-bold-duotone" class="text-base"></iconify-icon></button>
                </div>
            </td>
        </tr>
    `}).join('');

    if (appsData.length === 0) {
        adminAppsList.innerHTML = '<tr><td colspan="4" class="text-center py-12 text-zinc-400 font-bold">배포된 시스템이 없습니다.</td></tr>';
    }
}

function openAppForm(appId = null) {
    appForm.reset();
    
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
    submitBtn.innerHTML = `<iconify-icon icon="solar:spinner-track-bold-duotone" class="text-xl animate-spin"></iconify-icon> <span class="text-[0.95rem]">기록 중...</span>`;
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
    adminStatus.innerText = msg;
    adminStatus.className = 'text-[0.85rem] font-bold ' + (type === 'success' ? 'text-brand-green' : 'text-red-500');
    setTimeout(() => { if (adminStatus.innerText === msg) adminStatus.innerText = ''; }, 3000);
}

window.togglePasswordField = function() {
    const isLocked = document.getElementById('form-is-locked').checked;
    const pwdGroup = document.getElementById('password-group');
    const pwdInput = document.getElementById('form-app-password');
    if (isLocked) {
        pwdGroup.classList.remove('hidden');
    } else {
        pwdGroup.classList.add('hidden');
        pwdInput.value = '';
    }
};

window.openCommandPalette = function() {
    const palette = document.getElementById('command-palette');
    if (!palette) return;
    
    commandPaletteOpen = true;
    selectedPaletteIndex = 0;
    
    const searchInput = document.getElementById('palette-search-input');
    if (searchInput) searchInput.value = '';
    
    palette.classList.remove('hidden');
    palette.offsetHeight;
    palette.setAttribute('data-show', 'true');
    
    renderPaletteResults();
    
    setTimeout(() => {
        if (searchInput) searchInput.focus();
    }, 100);
};

window.closeCommandPalette = function() {
    const palette = document.getElementById('command-palette');
    if (!palette) return;
    
    commandPaletteOpen = false;
    palette.setAttribute('data-show', 'false');
    
    setTimeout(() => {
        if (!commandPaletteOpen) {
            palette.classList.add('hidden');
        }
    }, 300);
};

// Realtime dynamic search and render in Spotlight
function renderPaletteResults() {
    const resultsContainer = document.getElementById('palette-results');
    const searchInput = document.getElementById('palette-search-input');
    if (!resultsContainer) return;
    
    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
    
    const filtered = appsData.filter(app => {
        const name = (app.name || '').toLowerCase();
        const cat = (app.category || '일반').toLowerCase();
        const desc = (app.description || '').toLowerCase();
        return name.includes(query) || cat.includes(query) || desc.includes(query);
    });
    
    if (filtered.length === 0) {
        resultsContainer.innerHTML = `
            <div class="flex flex-col items-center justify-center py-12 text-zinc-400">
                <iconify-icon icon="solar:magnifer-bug-bold-duotone" class="text-4xl mb-3"></iconify-icon>
                <p class="text-[0.9rem] font-bold">일치하는 시스템이 없습니다.</p>
            </div>
        `;
        window.activePaletteApps = [];
        return;
    }
    
    window.activePaletteApps = filtered;
    
    if (selectedPaletteIndex >= filtered.length) {
        selectedPaletteIndex = 0;
    }
    
    resultsContainer.innerHTML = filtered.map((app, idx) => {
        const isSelected = idx === selectedPaletteIndex;
        const isLocked = app.isLocked === true || app.isLocked === 'TRUE' || app.isLocked === 'true';
        const isActive = app.isActive !== false && app.isActive !== 'FALSE' && app.isActive !== 'false';
        
        const selectClasses = isSelected 
            ? 'bg-zinc-900 text-white shadow-lg shadow-zinc-900/10 border-transparent scale-[1.01]' 
            : 'bg-white/60 hover:bg-zinc-50 border-zinc-200/50 text-zinc-800';
            
        const textMuted = isSelected ? 'text-zinc-300' : 'text-zinc-500';
        const textCat = isSelected ? 'bg-white/20 text-white' : 'bg-zinc-100 text-zinc-500 border border-zinc-200/30';
        
        let statusBadge = '';
        if (!isActive) {
            statusBadge = `<span class="px-2 py-0.5 text-[0.6rem] font-bold rounded ${isSelected ? 'bg-red-500 text-white' : 'bg-red-50 text-red-500 border border-red-100'} uppercase ml-2">Offline</span>`;
        } else if (isLocked) {
            statusBadge = `<span class="px-2 py-0.5 text-[0.6rem] font-bold rounded ${isSelected ? 'bg-yellow-500 text-black' : 'bg-yellow-50 text-yellow-600 border border-yellow-100'} uppercase ml-2"><iconify-icon icon="solar:lock-keyhole-bold" class="text-[0.7rem] align-middle mr-0.5"></iconify-icon>Secured</span>`;
        }

        const safeUrl = (app.url || '').toString().replace(/'/g, "\\'");
        const safePw = (app.password || '').toString().replace(/'/g, "\\'");
        
        let actionStr = '';
        if (!isActive) {
            actionStr = `onclick="alert('시스템 점검 중입니다.')"`;
        } else if (isLocked) {
            actionStr = `onclick="window.closeCommandPalette(); openLockedApp('${safeUrl}', '${safePw}', '${app.id}')"`;
        } else {
            actionStr = `onclick="window.closeCommandPalette(); window.logClick('${app.id}'); window.open('${safeUrl}', '_blank')"`;
        }
        
        return `
            <div id="palette-item-${idx}" ${actionStr} class="flex items-center gap-4 px-5 py-4 rounded-2xl border transition-all duration-200 ease-out cursor-pointer ${selectClasses}" data-index="${idx}">
                <div class="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center text-[1.5rem] ${isSelected ? 'bg-white/20' : 'bg-brand-green/10 text-brand-green'} border border-white/10">
                    <iconify-icon icon="${app.icon || 'solar:link-circle-bold-duotone'}"></iconify-icon>
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 flex-wrap mb-0.5">
                        <span class="font-extrabold text-[1rem] tracking-tight leading-tight">${app.name}</span>
                        <span class="px-2 py-0.5 text-[0.6rem] font-extrabold rounded uppercase tracking-wider ${textCat}">${app.category || '일반'}</span>
                        ${statusBadge}
                    </div>
                    <span class="text-[0.8rem] leading-relaxed block truncate ${textMuted}">${app.description || '시스템에 대한 설명이 없습니다.'}</span>
                </div>
                <div class="shrink-0 flex items-center gap-2">
                    ${clicks[app.id] ? `<span class="text-[0.65rem] font-bold ${isSelected ? 'text-zinc-300' : 'text-brand-green'} flex items-center gap-0.5"><iconify-icon icon="solar:fire-bold" class="text-[0.75rem]"></iconify-icon> ${clicks[app.id]}</span>` : ''}
                    <iconify-icon icon="solar:arrow-right-up-linear" class="text-base opacity-60"></iconify-icon>
                </div>
            </div>
        `;
    }).join('');
    
    const rows = resultsContainer.querySelectorAll('[data-index]');
    rows.forEach(row => {
        row.addEventListener('mouseenter', (e) => {
            selectedPaletteIndex = parseInt(e.currentTarget.dataset.index);
            rows.forEach((r, i) => {
                const isSel = i === selectedPaletteIndex;
                if (isSel) {
                    r.className = `flex items-center gap-4 px-5 py-4 rounded-2xl border transition-all duration-200 ease-out cursor-pointer bg-zinc-900 text-white shadow-lg shadow-zinc-900/10 border-transparent scale-[1.01]`;
                } else {
                    r.className = `flex items-center gap-4 px-5 py-4 rounded-2xl border transition-all duration-200 ease-out cursor-pointer bg-white/60 hover:bg-zinc-50 border-zinc-200/50 text-zinc-800`;
                }
            });
        });
    });
}

// Keydown Router for Command Palette
function handlePaletteKeydown(e) {
    const apps = window.activePaletteApps || [];
    if (apps.length === 0) return;
    
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedPaletteIndex = (selectedPaletteIndex + 1) % apps.length;
        renderPaletteResults();
        scrollSelectedItemIntoView();
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedPaletteIndex = (selectedPaletteIndex - 1 + apps.length) % apps.length;
        renderPaletteResults();
        scrollSelectedItemIntoView();
    } else if (e.key === 'Enter') {
        e.preventDefault();
        const selectedApp = apps[selectedPaletteIndex];
        if (selectedApp) {
            const isLocked = selectedApp.isLocked === true || selectedApp.isLocked === 'TRUE' || selectedApp.isLocked === 'true';
            const isActive = selectedApp.isActive !== false && selectedApp.isActive !== 'FALSE' && selectedApp.isActive !== 'false';
            
            closeCommandPalette();
            
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
        closeCommandPalette();
    }
}

// Scroll active items smoothly into screen if long lists arise
/*******************************************************************************
 * 5 Premium Extension Logic Integrations
 ******************************************************************************/

// 1. Live Status Health Check Loop
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
            dot.className = "flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-500 border border-zinc-200 text-[0.65rem] font-bold";
            dot.innerHTML = `<iconify-icon icon="solar:spinner-track-bold-duotone" class="animate-spin text-[0.75rem]"></iconify-icon> Checking`;
        } else if (state === 'online') {
            dot.className = "flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#E3EFE8] text-brand-green border border-brand-green/20 text-[0.65rem] font-bold";
            dot.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-brand-green animate-pulse"></span> Online`;
        } else {
            dot.className = "flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#FFF5F5] text-red-500 border border-red-200 text-[0.65rem] font-bold";
            dot.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span> Offline`;
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

// 2. Alt + [1-9] Quick-Launch Keyboard Shortcuts
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

// 3. Custom Order Swap / Reorder Actions
window.toggleReorderMode = function() {
    reorderModeActive = !reorderModeActive;
    const reorderBtn = document.getElementById('reorder-toggle-btn');
    if (reorderBtn) {
        if (reorderModeActive) {
            reorderBtn.className = "flex items-center gap-2 px-4 py-2 rounded-full text-[0.85rem] font-extrabold transition-all duration-300 bg-zinc-900 text-white shadow-md shadow-zinc-900/10";
        } else {
            reorderBtn.className = "flex items-center gap-2 px-4 py-2 rounded-full text-[0.85rem] font-extrabold transition-all duration-300 text-zinc-400 hover:text-zinc-800 hover:bg-white/50";
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

// 4. Administrative Tabs Controller
window.switchAdminTab = function(tab) {
    const regTab = document.getElementById('tab-registry-btn');
    const anaTab = document.getElementById('tab-analytics-btn');
    const regView = document.getElementById('admin-registry-view');
    const anaView = document.getElementById('admin-analytics-view');
    const addAppBtn = document.getElementById('admin-add-app-btn');
    
    if (!regTab || !anaTab || !regView || !anaView) return;
    
    if (tab === 'registry') {
        regTab.className = "py-4 text-[0.95rem] font-extrabold border-b-2 border-zinc-900 text-zinc-900 transition-all duration-300 focus:outline-none";
        anaTab.className = "py-4 text-[0.95rem] font-bold border-b-2 border-transparent text-zinc-400 hover:text-zinc-700 transition-all duration-300 focus:outline-none";
        regView.classList.remove('hidden');
        anaView.classList.add('hidden');
        if (addAppBtn) addAppBtn.classList.remove('hidden');
    } else {
        anaTab.className = "py-4 text-[0.95rem] font-extrabold border-b-2 border-zinc-900 text-zinc-900 transition-all duration-300 focus:outline-none";
        regTab.className = "py-4 text-[0.95rem] font-bold border-b-2 border-transparent text-zinc-400 hover:text-zinc-700 transition-all duration-300 focus:outline-none";
        regView.classList.add('hidden');
        anaView.classList.remove('hidden');
        if (addAppBtn) addAppBtn.classList.add('hidden');
        renderAdminAnalytics();
    }
};

// 5. Admin Panel Stats & Native Analytics Chart Calculation
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
            <div class="text-center py-12 text-zinc-400 font-bold">
                분석할 이용 데이터가 없습니다.
            </div>
        `;
        return;
    }
    
    chartContainer.innerHTML = clickData.map((data, idx) => {
        const pct = maxClicks > 0 ? Math.round((data.clicks / maxClicks) * 100) : 0;
        let badgeColor = 'bg-zinc-100 text-zinc-600';
        if (idx === 0) badgeColor = 'bg-brand-yellow text-zinc-800';
        else if (idx === 1) badgeColor = 'bg-brand-green/20 text-brand-green';
        else if (idx === 2) badgeColor = 'bg-brand-mint/20 text-brand-mint';
        
        return `
            <div class="flex items-center gap-4 group">
                <div class="w-8 h-8 rounded-full ${badgeColor} flex items-center justify-center text-[0.8rem] font-extrabold shrink-0 shadow-sm">${idx + 1}</div>
                <div class="flex-1 min-w-0">
                    <div class="flex justify-between items-center mb-2">
                        <div class="flex items-center gap-2">
                            <span class="font-extrabold text-zinc-800 text-[0.95rem] truncate">${data.name}</span>
                            <span class="text-[0.65rem] font-bold text-zinc-400 px-2 py-0.5 rounded bg-zinc-100 border border-zinc-200/50">${data.category}</span>
                        </div>
                        <span class="text-[0.85rem] font-extrabold text-brand-green bg-brand-green/10 px-2.5 py-1 rounded-full"><iconify-icon icon="solar:fire-bold" class="mr-0.5 align-middle"></iconify-icon> ${data.clicks}회</span>
                    </div>
                    <div class="w-full h-3 bg-zinc-100 rounded-full overflow-hidden border border-zinc-200/20">
                        <div class="h-full bg-gradient-to-r from-brand-mint to-brand-green rounded-full transition-all duration-1000 ease-out" style="width: ${pct}%"></div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
};

function scrollSelectedItemIntoView() {
    const el = document.getElementById(`palette-item-${selectedPaletteIndex}`);
    if (el) {
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
}

// Real-time input binding in search modal
document.addEventListener('DOMContentLoaded', () => {
    const paletteSearch = document.getElementById('palette-search-input');
    if (paletteSearch) {
        paletteSearch.addEventListener('input', () => {
            selectedPaletteIndex = 0;
            renderPaletteResults();
        });
    }
});

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

// customOrder toggle display updater
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
            reorderBtn.className = "flex items-center gap-2 px-4 py-2 rounded-full text-[0.85rem] font-extrabold transition-all duration-300 text-zinc-400 hover:text-zinc-800 hover:bg-white/50";
        }
    }
}

// Theme switch customizer
window.setTheme = function(themeName) {
    currentTheme = themeName;
    localStorage.setItem('hub-theme', themeName);
    document.body.className = '';
    document.body.classList.add('theme-' + themeName);
};
