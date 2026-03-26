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
if (mobileMenuBtn) mobileMenuBtn.addEventListener('click', () => sidebar.classList.add('open'));
if (mobileClose) mobileClose.addEventListener('click', () => sidebar.classList.remove('open'));

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

// Render Sidebar Categories
function renderCategories() {
    const categories = ['All', ...new Set(appsData.map(a => a.category || '일반'))];

    if (categoryNav) {
        categoryNav.innerHTML = categories.map(cat => {
            let icon = 'fa-folder';
            if (cat === 'All') icon = 'fa-layer-group';
            else if (cat === 'HR' || cat.includes('인사')) icon = 'fa-users';
            else if (cat === 'Patient Care' || cat.includes('간호')) icon = 'fa-bed-pulse';
            else if (cat === 'Tools' || cat.includes('툴')) icon = 'fa-wrench';

            return `
            <li class="nav-item ${cat === currentCategory ? 'active' : ''}" data-category="${cat}">
                <i class="fa-solid ${icon}"></i> <span>${cat === 'All' ? '전체 워크스페이스' : cat}</span>
            </li>
        `}).join('');

        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                currentCategory = e.currentTarget.dataset.category;
                renderCategories(); // update active class visually

                // update title
                if (currentCategoryTitle) {
                    currentCategoryTitle.innerText = currentCategory === 'All' ? '전체 워크스페이스' : `${currentCategory} 시스템`;
                }

                if (window.innerWidth <= 900) sidebar.classList.remove('open');
                renderApps();
            });
        });
    }
}

// Render Apps Grid
function renderApps() {
    loadingEl.classList.add('hidden');
    appsGrid.classList.remove('hidden');

    if (appsData.length === 0) {
        loadingEl.classList.remove('hidden');
        appsGrid.classList.add('hidden');
        loadingEl.innerHTML = `
            <i class="fa-solid fa-folder-open" style="font-size: 2.5rem; margin-bottom: 1rem; color: var(--text-tertiary);"></i>
            <h3 style="margin-bottom:0.5rem; color:var(--text-primary); font-size:1.1rem;">등록된 시스템이 없습니다</h3>
            <p style="font-size:0.9rem;">좌측 하단 '시스템 관리'에서 새 항목을 배포하세요.</p>
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
        loadingEl.classList.remove('hidden');
        appsGrid.classList.add('hidden');
        loadingEl.innerHTML = `
            <i class="fa-solid fa-magnifying-glass" style="font-size: 2.5rem; margin-bottom: 1rem; color: var(--text-tertiary);"></i>
            <p>검색 조건에 일치하는 시스템이 없습니다.</p>
        `;
        return;
    }

    appsGrid.innerHTML = filteredApps.map((app, index) => {
        const catName = app.category || '일반';
        let hash = 0;
        for (let i = 0; i < catName.length; i++) hash = catName.charCodeAt(i) + ((hash << 5) - hash);
        const palette = [
            { border: '#a2bb9c', bg: '#f1f6f0', text: '#688c5f' }, // Green
            { border: '#f2d79d', bg: '#fefbf3', text: '#b89447' }, // Yellow
            { border: '#b1d6c2', bg: '#f3f9f6', text: '#508b6d' }, // Mint
            { border: '#9fb8d0', bg: '#f2f6f9', text: '#6889a8' }, // Blue
            { border: '#d0a2b0', bg: '#faf2f4', text: '#a66a7b' }, // Pink
            { border: '#b2aac3', bg: '#f7f6f9', text: '#7d7491' }  // Purple
        ];
        const theme = palette[Math.abs(hash) % palette.length];

        const isLocked = app.isLocked === true || app.isLocked === 'TRUE' || app.isLocked === 'true';
        const isActive = app.isActive !== false && app.isActive !== 'FALSE' && app.isActive !== 'false';
        
        const lockIconHTML = isLocked ? `<i class="fa-solid fa-lock" style="color: #ff6b6b; font-size: 0.85rem;" title="보안 인증 필요"></i>` : '';
        const inactiveBadgeHTML = !isActive ? `<i class="fa-solid fa-ban" style="color: var(--text-tertiary); font-size: 0.85rem;" title="현재 비활성화(점검) 상태입니다"></i>` : '';
        
        let cardParams = '';
        const safeUrl = (app.url || '').toString().replace(/'/g, "\\'");
        const safePw = (app.password || '').toString().replace(/'/g, "\\'");
        
        if (!isActive) {
            cardParams = `div onclick="alert('이 시스템은 현재 관리자에 의해 비활성화(점검 중) 상태입니다.')"`;
        } else if (isLocked) {
            cardParams = `div onclick="openLockedApp('${safeUrl}', '${safePw}')"`;
        } else {
            cardParams = `a href="${app.url}" target="_blank"`;
        }
        
        const closingTag = (!isActive || isLocked) ? `div` : `a`;

        let badgesContainer = '';
        if (isLocked || !isActive) {
            badgesContainer = `
                <div style="display: flex; gap: 0.3rem; margin-left: 0.4rem; flex-shrink: 0; align-items: center;">
                    ${lockIconHTML}
                    ${inactiveBadgeHTML}
                </div>
            `;
        }

        return `
        <${cardParams} class="bento-card ${!isActive ? 'deactivated' : ''}" style="animation: fadeIn 0.3s ease forwards; animation-delay: ${index * 0.05}s; opacity: 0; border-top: 4px solid ${theme.border}; ${(!isActive || isLocked) ? 'cursor: pointer;' : ''}">
            <div class="card-header">
                <div class="card-icon" style="background: ${theme.bg}; color: ${theme.text}; border: none;"><i class="${app.icon || 'fa-solid fa-link'}"></i></div>
                <div class="card-title-wrap">
                    <div class="card-category" style="color: ${theme.text}; font-weight: 700;">${catName}</div>
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                        <h3 style="margin: 0; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${app.name}</h3>
                        ${badgesContainer}
                    </div>
                </div>
            </div>
            <div class="card-content">
                <p>${app.description || '시스템에 대한 설명이 없습니다.'}</p>
            </div>
        </${closingTag}>
        `;
    }).join('');
}

function showError(msg) {
    loadingEl.innerHTML = `
        <i class="fa-solid fa-circle-exclamation" style="font-size: 2.5rem; color: var(--danger-color); margin-bottom:1rem;"></i>
        <div style="text-align: center; line-height: 1.6;">${msg}</div>
    `;
}

// Modal Logic
function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

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

let adminSortColumn = 'category'; // 기본 정렬 속성
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
    if (iconCat) iconCat.className = `fa-solid ${adminSortColumn === 'category' ? (adminSortOrder === 'asc' ? 'fa-sort-up' : 'fa-sort-down') : 'fa-sort'}`;
    if (iconName) iconName.className = `fa-solid ${adminSortColumn === 'name' ? (adminSortOrder === 'asc' ? 'fa-sort-up' : 'fa-sort-down') : 'fa-sort'}`;

    const sortedData = [...appsData].sort((a, b) => {
        let valA = (a[adminSortColumn] || '').toString();
        let valB = (b[adminSortColumn] || '').toString();
        let cmp = valA.localeCompare(valB, 'ko-KR');
        
        // 카테고리 정렬 시 같은 카테고리 안에서는 이름으로 2차 정렬합니다.
        if (cmp === 0 && adminSortColumn === 'category') {
            cmp = (a.name || '').toString().localeCompare((b.name || '').toString(), 'ko-KR');
        }
        
        return adminSortOrder === 'asc' ? cmp : -cmp;
    });

    adminAppsList.innerHTML = sortedData.map(app => {
        const isActive = app.isActive !== false && app.isActive !== 'FALSE' && app.isActive !== 'false';
        
        return `
        <tr>
            <td><span class="card-category">${app.category || '일반'}</span></td>
            <td style="font-weight:600;">
                <i class="${app.icon}" style="color:var(--text-tertiary); margin-right:0.5rem;"></i>
                <span style="${!isActive ? 'text-decoration: line-through; color: var(--text-tertiary);' : ''}">${app.name}</span>
                ${!isActive ? '<i class="fa-solid fa-ban" style="color: var(--text-tertiary); font-size: 0.85rem; margin-left: 0.5rem;" title="비활성화 됨"></i>' : ''}
            </td>
            <td style="max-width:200px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                <a href="${app.url}" target="_blank" style="color:var(--text-secondary); text-decoration:none;">${app.url}</a>
            </td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-secondary btn-sm" onclick="editApp('${app.id}')">수정</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteApp('${app.id}')">삭제</button>
                </div>
            </td>
        </tr>
    `}).join('');

    if (appsData.length === 0) {
        adminAppsList.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 2rem; color:var(--text-secondary);">배포된 시스템이 없습니다.</td></tr>';
    }
}

function openAppForm(appId = null) {
    appForm.reset();
    
    // Update datalist with existing unique categories
    const categoryList = document.getElementById('category-list');
    if (categoryList) {
        let categories = new Set(appsData.map(a => a.category).filter(c => c && c.trim() !== ''));
        ['HR / 인사', '환자 간호 / 진료', '업무 툴', '일반'].forEach(opt => categories.add(opt));
        categoryList.innerHTML = Array.from(categories).map(cat => `<option value="${cat}"></option>`).join('');
    }

    if (appId) {
        document.getElementById('form-title').innerText = '시스템 정보 수정';
        const app = appsData.find(a => a.id === appId);
        if (app) {
            document.getElementById('form-app-id').value = app.id;
            document.getElementById('form-name').value = app.name;
            document.getElementById('form-url').value = app.url;
            document.getElementById('form-category').value = app.category || '일반';
            document.getElementById('form-icon').value = app.icon || 'fa-solid fa-link';
            document.getElementById('form-description').value = app.description || '';
            
            const isLocked = app.isLocked === true || app.isLocked === 'TRUE' || app.isLocked === 'true';
            document.getElementById('form-is-locked').checked = isLocked;
            document.getElementById('form-app-password').value = app.password || '';
            
            const isActive = app.isActive !== false && app.isActive !== 'FALSE' && app.isActive !== 'false';
            document.getElementById('form-is-active').checked = isActive;
        }
    } else {
        document.getElementById('form-title').innerText = '새 시스템 등록';
        document.getElementById('form-app-id').value = '';
        document.getElementById('form-icon').value = 'fa-solid fa-link';
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
        password: isLocked ? document.getElementById('form-app-password').value : '',
        isActive: isActive
    };
    if (id) appData.id = id;

    const submitBtn = document.getElementById('form-submit-btn');
    const originalText = submitBtn.innerText;
    submitBtn.innerText = '동기화 중...';
    submitBtn.disabled = true;

    await requestBackend(action, appData);

    submitBtn.innerText = originalText;
    submitBtn.disabled = false;
    closeModal('app-form-modal');
}

window.deleteApp = async function (id) {
    if (!confirm("해당 시스템 배포를 취소하시겠습니까?")) return;
    await requestBackend('delete', { id });
}

async function requestBackend(action, appData) {
    alertStatus('동기화 중입니다...', 'success');
    try {
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({ action: action, password: window.adminPassword, appData: appData })
        });
        const result = await response.json();
        if (result.status === 'success') {
            alertStatus('성공적으로 저장되었습니다.', 'success');
            await fetchApps();
            if (!document.getElementById('admin-dashboard-modal').classList.contains('hidden')) renderAdminTable();
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
        alertStatus('네트워크 연결이 지연되고 있습니다.', 'error');
    }
}

function alertStatus(msg, type = 'success') {
    adminStatus.innerText = msg;
    adminStatus.className = 'status-message';
    if (type === 'success') adminStatus.classList.add('status-success');
    if (type === 'error') adminStatus.classList.add('status-error');
    setTimeout(() => { if (adminStatus.innerText === msg) adminStatus.className = 'status-message'; }, 3000);
}

// 비밀번호 폼 토글
window.togglePasswordField = function() {
    const isLocked = document.getElementById('form-is-locked').checked;
    const pwdGroup = document.getElementById('password-group');
    const pwdInput = document.getElementById('form-app-password');
    if (isLocked) {
        pwdGroup.style.display = 'block';
    } else {
        pwdGroup.style.display = 'none';
        pwdInput.value = '';
    }
};

// 보안 앱 오픈
window.openLockedApp = function(url, requiredPw) {
    const inputPw = prompt("🔒 보안이 설정된 시스템입니다.\n접속 비밀번호를 입력하세요.");
    if (inputPw === null) return; // 취소시
    
    if (inputPw === requiredPw) {
        window.open(url, '_blank');
    } else {
        alert("비밀번호가 일치하지 않습니다.");
    }
};
