// 설정: 배포된 Google Apps Script Web App URL을 입력하세요.
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbz_irqoJCGt8N5WRHj185VSVUuyE_JppyWRX62x7pjOJtyDLhQGtLqjgW1ilxspo6h0/exec';

let appsData = [];
let isAdmin = false;
let currentCategory = 'All';
let searchQuery = '';

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

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initClock();
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

// Keyboard Shortcut for Search
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchInput.focus();
    }
});

// Search Logic
if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase();
        renderApps();
    });
}

// Fetch apps
async function fetchApps() {
    try {
        const response = await fetch(SCRIPT_URL);
        const result = await response.json();

        if (result.status === 'success') {
            appsData = result.data.sort((a, b) => {
                const nameA = a.name || '';
                const nameB = b.name || '';
                return nameA.localeCompare(nameB, 'ko-KR');
            });
            renderCategories();
            renderApps();
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

// Render Apps Grid (Double Bezel + Stretching)
function renderApps() {
    loadingEl.classList.add('hidden');
    appsGrid.classList.remove('hidden');

    if (appsData.length === 0) {
        // ... (empty state)
        appsGrid.classList.add('hidden');
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

    const filteredApps = appsData.filter(app => {
        const matchesCategory = currentCategory === 'All' || (app.category || '일반') === currentCategory;
        const searchTarget = (app.name + ' ' + (app.description || '')).toLowerCase();
        const matchesSearch = searchTarget.includes(searchQuery);
        return matchesCategory && matchesSearch;
    });

    if (filteredApps.length === 0) {
        appsGrid.classList.add('hidden');
        loadingEl.classList.remove('hidden');
        loadingEl.innerHTML = `
            <div class="flex flex-col items-center justify-center py-24 w-full animate-fade-in-up text-center">
                <iconify-icon icon="solar:magnifer-bold-duotone" class="text-6xl text-zinc-300 mb-6 drop-shadow-sm"></iconify-icon>
                <p class="text-[0.95rem] text-zinc-500 font-bold tracking-wide">검색 결과가 없습니다.</p>
            </div>
        `;
        return;
    }

    appsGrid.innerHTML = filteredApps.map((app, index) => {
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
        
        const lockBadge = isLocked ? `<div class="px-2.5 py-1 rounded-md bg-white/80 shadow-sm text-[#FF6B6B] flex items-center gap-1.5 border border-[#FFEAEA] backdrop-blur-md"><iconify-icon icon="solar:lock-keyhole-bold-duotone" class="text-[0.85rem]"></iconify-icon><span class="text-[0.65rem] font-bold tracking-widest uppercase mt-px">Secured</span></div>` : '';
        const inactiveBadge = !isActive ? `<div class="px-2.5 py-1 rounded-md bg-zinc-100/80 shadow-sm text-zinc-500 flex items-center gap-1.5 border border-zinc-200 backdrop-blur-md"><iconify-icon icon="solar:forbidden-circle-bold-duotone" class="text-[0.85rem]"></iconify-icon><span class="text-[0.65rem] font-bold tracking-widest uppercase mt-px">Offline</span></div>` : '';
        
        let badgesContainer = '';
        if (isLocked || !isActive) {
            badgesContainer = `<div class="flex gap-2">${lockBadge}${inactiveBadge}</div>`;
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
            cardAction = `onclick="openLockedApp('${safeUrl}', '${safePw}')"`;
            extraClasses = 'text-left w-full focus:outline-none';
            closingTag = 'button';
        } else {
            cardAction = `href="${app.url}" target="_blank"`;
            extraClasses = 'focus:outline-none';
            closingTag = 'a';
        }

        // Apply h-full so all cards in the grid row stretch identically (No missing teeth!)
        return `
        <${closingTag} ${cardAction} class="${extraClasses} group block h-full rounded-[2.2rem] bg-white/40 border border-white hover:border-brand-green/30 transition-all duration-500 ease-out hover:-translate-y-2 hover:shadow-[0_30px_60px_-15px_rgba(134,167,137,0.25)] relative animate-fade-in-up ${!isActive ? 'opacity-60 grayscale cursor-not-allowed hover:translate-y-0 hover:shadow-none hover:border-white' : 'cursor-pointer shadow-[0_8px_30px_rgba(0,0,0,0.04)] backdrop-blur-md'}" style="animation-delay: ${index * 60}ms; opacity: 0; outline: none;">
            
            <!-- Double Bezel Inner Core - Forced to fill height -->
            <div class="flex flex-col h-full rounded-[calc(2.2rem-1px)] bg-gradient-to-br from-white/90 via-white/70 to-zinc-50/50 shadow-[inset_0_1px_2px_rgba(255,255,255,1)] p-8">
                
                <div class="flex items-start justify-between mb-8">
                    <!-- Premium Icon Box -->
                    <div class="w-16 h-16 rounded-[1.3rem] ${theme.bg} ${theme.text} flex items-center justify-center text-[2.2rem] group-hover:scale-[1.1] group-hover:rotate-3 transition-transform duration-500 ease-out shadow-[inset_0_1px_1px_rgba(255,255,255,0.8),0_4px_12px_rgba(0,0,0,0.05)] border border-white">
                        <iconify-icon icon="${app.icon || 'solar:link-circle-bold-duotone'}"></iconify-icon>
                    </div>
                    ${badgesContainer}
                </div>
                
                <div class="mt-auto flex flex-col flex-1">
                    <div class="text-[0.65rem] font-extrabold text-zinc-400 tracking-[0.2em] uppercase mb-2.5 drop-shadow-sm">${catName}</div>
                    <div class="flex items-center gap-3 mb-3">
                        <h3 class="font-extrabold text-zinc-900 text-[1.3rem] tracking-tight leading-tight flex-1">${app.name}</h3>
                        ${isActive && !isLocked ? '<div class="w-9 h-9 rounded-full bg-white shadow-sm border border-zinc-100 flex items-center justify-center opacity-0 -translate-x-3 translate-y-3 group-hover:opacity-100 group-hover:translate-x-0 group-hover:translate-y-0 transition-all duration-500 text-brand-green"><iconify-icon icon="solar:arrow-right-up-linear" class="text-lg"></iconify-icon></div>' : ''}
                    </div>
                    <p class="text-[0.95rem] text-zinc-500 leading-relaxed font-medium line-clamp-2">${app.description || '시스템에 대한 설명이 없습니다.'}</p>
                </div>
                
            </div>
        </${closingTag}>
        `;
    }).join('');
}

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

window.openLockedApp = function(url, requiredPw) {
    const inputPw = prompt("🔒 강력한 보안이 설정된 시스템입니다.\\n접속 비밀번호를 입력하세요.");
    if (inputPw === null) return; 
    
    if (inputPw === requiredPw) {
        window.open(url, '_blank');
    } else {
        alert("비밀번호가 올바르지 않습니다.");
    }
};
