// =================================================================
// IMPORTS & CẤU HÌNH
// =================================================================
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-auth.js";

const API_BASE_URL = "https://ar1group.vercel.app";
const GET_DATA_ENDPOINT = `${API_BASE_URL}/api/sheet-data`;
const ADD_PRODUCT_ENDPOINT = `${API_BASE_URL}/api/add-product`;

// Danh sách các view có dữ liệu cần tải từ Sheet
const DATA_VIEWS = ['Contact', 'Vendor', 'Product', 'Marketing', 'Shipment'];

// =================================================================
// KHỞI TẠO FIREBASE
// =================================================================
const firebaseConfig = window.firebaseConfig;
let app;
if (!getApps().length) {
    app = initializeApp(firebaseConfig);
} else {
    app = getApps()[0];
}
const auth = getAuth(app);

// =================================================================
// BIẾN TOÀN CỤC
// =================================================================
let viewDataCache = {};
let paginationCache = {};
let currentView = '';

// =================================================================
// KHỞI TẠO ỨNG DỤNG VÀ XÁC THỰC
// =================================================================
document.addEventListener("DOMContentLoaded", () => {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            setupUserSession(user);
            initializeNavigation();
            // Tải view mặc định ban đầu
            activateView('dashboard-main');
        } else {
            sessionStorage.clear();
            if (window.location.pathname !== "/index.html" && window.location.pathname !== "/") {
                window.location.href = "index.html";
            }
        }
    });
});

function setupUserSession(user) {
    const userEmailElement = document.getElementById('userEmail');
    if (userEmailElement) userEmailElement.textContent = user.email || "Không xác định";
    sessionStorage.setItem('userRole', (user.email && user.email.endsWith('@ar1group.com')) ? 'admin' : 'customer');
}

function initializeNavigation() {
    document.querySelectorAll(".sidebar-menu a").forEach(link => {
        link.addEventListener("click", (event) => {
            event.preventDefault();
            const viewName = link.getAttribute("data-view");
            if (viewName) activateView(viewName); // Thay đổi: gọi activateView
        });
    });
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.onclick = () => signOut(auth).catch(error => alert(`Đăng xuất thất bại: ${error.message}`));
    }
}

window.getFreshIdToken = async () => {
    if (auth.currentUser) {
        return await auth.currentUser.getIdToken(true);
    }
    return null;
};

// =================================================================
// LOGIC QUẢN LÝ VIEW (Load on demand)
// =================================================================

/**
 * Kích hoạt một view. Sẽ tải nếu chưa có, hoặc chỉ hiển thị nếu đã có.
 * @param {string} viewName - Tên của view để kích hoạt.
 */
async function activateView(viewName) {
    const mainContent = document.getElementById("main-content");
    const viewId = `view-${viewName}`;
    let viewContainer = document.getElementById(viewId);

    // Nếu view chưa tồn tại trong DOM, tiến hành tải lần đầu.
    if (!viewContainer) {
        console.log(`View '${viewName}' chưa tồn tại. Bắt đầu tải...`);
        viewContainer = document.createElement('div');
        viewContainer.id = viewId;
        viewContainer.className = 'view-container';
        viewContainer.style.display = 'none'; // Giữ ẩn trong khi tải
        mainContent.appendChild(viewContainer);

        try {
            // Tải cấu trúc HTML
            const response = await fetch(`${viewName.toLowerCase()}.html`);
            if (!response.ok) throw new Error(`Không thể tải ${viewName}.html.`);
            viewContainer.innerHTML = await response.text();

            // Nếu là view cần dữ liệu, tải dữ liệu
            if (DATA_VIEWS.includes(viewName)) {
                await loadDataForView(viewName, 1);
            }
            
            // Thiết lập các sự kiện/modal cụ thể cho view
            if (viewName === 'Product') {
                setupAddProductModal();
            }
        } catch (error) {
            viewContainer.innerHTML = `<p style="color: red;">Lỗi tải view ${viewName}: ${error.message}</p>`;
        }
    } else {
        console.log(`View '${viewName}' đã tồn tại. Chỉ hiển thị.`);
    }

    // Hiển thị view mục tiêu và ẩn các view khác.
    switchView(viewName);
}

/**
 * Chỉ chuyển đổi hiển thị giữa các view đã được tạo.
 * @param {string} viewName - Tên của view để hiển thị.
 */
function switchView(viewName) {
    currentView = viewName;
    document.querySelectorAll('#main-content .view-container').forEach(view => {
        view.style.display = view.id === `view-${viewName}` ? 'block' : 'none';
    });
}

/**
 * Tải dữ liệu từ API và render bảng cho một view cụ thể.
 * @param {string} viewName - Tên view.
 * @param {number} page - Số trang cần tải.
 */
async function loadDataForView(viewName, page = 1) {
    const viewContainer = document.getElementById(`view-${viewName}`);
    const tableBody = viewContainer?.querySelector("tbody");
    if (!tableBody) return;

    tableBody.innerHTML = `<tr><td colspan="99">Đang tải dữ liệu...</td></tr>`;

    try {
        const response = await fetch(`${GET_DATA_ENDPOINT}?sheetName=${viewName}&page=${page}&limit=20`);
        if (!response.ok) throw new Error("Lỗi mạng hoặc server không phản hồi.");
        const result = await response.json();
        if (result.status !== 'success' || !result.data) {
            throw new Error(result.message || "Không có dữ liệu để hiển thị.");
        }
        
        viewDataCache[viewName] = result.data;
        paginationCache[viewName] = result.pagination;
        
        renderTable(viewName);
        renderPaginationControls(viewName);
    } catch (error) {
        tableBody.innerHTML = `<tr><td colspan="99" style="color: red;">Lỗi tải dữ liệu: ${error.message}</td></tr>`;
    }
}

// =================================================================
// CÁC HÀM RENDER (Giữ nguyên không đổi)
// =================================================================

function renderTable(viewName) {
    const viewContainer = document.getElementById(`view-${viewName}`);
    const tableBody = viewContainer.querySelector("tbody");
    if (!tableBody) return;
    tableBody.innerHTML = "";
    const data = viewDataCache[viewName];
    const colspan = viewContainer.querySelectorAll("thead th").length || 1;
    if (!data || data.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="${colspan}">Không có dữ liệu để hiển thị.</td></tr>`;
        return;
    }
    if (viewName === 'Product') {
        renderProductTable(data, tableBody);
    } else {
        renderGenericTable(viewName, data, tableBody, viewContainer);
    }
}

function renderProductTable(data, tableBody) {
    data.forEach(row => {
        const tr = document.createElement("tr");
        const imageUrl = row.PHOTO || 'https://placehold.co/60x60/EEE/31343C?text=No+Image';
        tr.innerHTML = `
            <td><img class="product-image lazy" data-src="${imageUrl}" alt="${row['PRODUCT DESCRIPTION / Tên sản phẩm (song ngữ)'] || 'Product Image'}"></td>
            <td>${row['SKU'] || ''}</td>
            <td>${row['PRODUCT DESCRIPTION / Tên sản phẩm (song ngữ)'] || ''}</td>
            <td>${row['STORAGE TYPE'] || ''}</td>
            <td>${row['PACKING SIZE (INDIVIDUAL WEIGHTS/SIZES)'] || ''}</td>
            <td>${row['UNITS PER CARTON'] || ''}</td>
            <td>${row['N.W. PER CARTON (kg)'] || ''}</td>
            <td>${row['GW. PER CARTON (kg)'] || ''}</td>
            <td>${row['L (cm)'] || ''}</td>
            <td>${row['W (cm)'] || ''}</td>
            <td>${row['H (cm)'] || ''}</td>
            <td>${row['HS CODE'] || ''}</td>
            <td>${row['UPC (BARCODE)'] || ''}</td>
            <td>${row['INGREDIENTS'] || ''}</td>
            <td>${row['SHELF LIFE'] || ''}</td>
            <td class="actions-column"><span class="action-view">View</span></td>
        `;
        tableBody.appendChild(tr);
    });
    setupLazyLoading();
}

function renderGenericTable(viewName, data, tableBody, viewContainer) {
    const headers = Array.from(viewContainer.querySelectorAll("thead th:not(.actions-column)")).map(th => th.textContent.trim());
    data.forEach((row, rowIndex) => {
        const tr = document.createElement("tr");
        tr.setAttribute('data-row-index', rowIndex);
        headers.forEach(header => {
            const td = document.createElement("td");
            td.setAttribute('data-column-name', header);
            td.textContent = row[header] || "";
            tr.appendChild(td);
        });
        const actionTd = document.createElement("td");
        actionTd.className = 'actions-column';
        tr.appendChild(actionTd);
        tableBody.appendChild(tr);
    });
}

function setupLazyLoading() {
    const lazyImages = document.querySelectorAll('img.lazy');
    const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const image = entry.target;
                if (image.dataset.src) image.src = image.dataset.src;
                image.classList.remove('lazy');
                observer.unobserve(image);
            }
        });
    });
    lazyImages.forEach(image => imageObserver.observe(image));
}

function renderPaginationControls(viewName) {
    const container = document.querySelector(`#view-${viewName} .pagination-controls`);
    if (!container) return;
    const pagination = paginationCache[viewName];
    if (!pagination || pagination.totalPages <= 1) {
        container.innerHTML = "";
        return;
    }
    container.innerHTML = `
        <button class="btn btn-secondary" ${pagination.page === 1 ? 'disabled' : ''} onclick="window.changePage('${viewName}', ${pagination.page - 1})">Previous</button>
        <span style="margin: 0 15px;">Page ${pagination.page} of ${pagination.totalPages}</span>
        <button class="btn btn-secondary" ${pagination.page >= pagination.totalPages ? 'disabled' : ''} onclick="window.changePage('${viewName}', ${pagination.page + 1})">Next</button>
    `;
}

window.changePage = (viewName, page) => {
    loadDataForView(viewName, page);
};

// =================================================================
// HÀM XỬ LÝ FORM
// =================================================================

function setupAddProductModal() {
    const viewContainer = document.getElementById(`view-Product`);
    if (!viewContainer) return;

    const modal = viewContainer.querySelector('#add-product-modal');
    const btn = viewContainer.querySelector('#btn-add-product');
    const span = viewContainer.querySelector('.close-button');
    const form = viewContainer.querySelector('#add-product-form');
    
    if (!modal || !btn || !span || !form) return;
    
    btn.onclick = () => { modal.style.display = 'flex'; };
    span.onclick = () => { modal.style.display = 'none'; };
    
    form.onsubmit = async (event) => {
        event.preventDefault();
        const submitButton = form.querySelector('button[type="submit"]');
        submitButton.textContent = 'Đang xử lý...';
        submitButton.disabled = true;
        try {
            const fileInput = form.querySelector('input[name="PHOTO"]');
            const file = fileInput.files[0];
            let imageFilePayload = null;
            if (file) {
                if (file.size > 4.5 * 1024 * 1024) throw new Error("Ảnh quá lớn. Vui lòng chọn ảnh dưới 4.5 MB.");
                const base64Data = await toBase64(file);
                imageFilePayload = {
                    base64Data: base64Data.split(',')[1],
                    mimeType: file.type,
                    fileName: file.name
                };
            }
            const formData = new FormData(form);
            const productData = {};
            for (let [key, value] of formData.entries()) {
                if (key !== 'PHOTO') productData[key] = value;
            }
            const idToken = await window.getFreshIdToken();
            const response = await fetch(ADD_PRODUCT_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
                body: JSON.stringify({
                    action: 'addProduct',
                    sheetName: 'Product',
                    productData: productData,
                    imageFile: imageFilePayload
                })
            });
            const result = await response.json();
            if (!response.ok || result.status !== 'success') {
                throw new Error(result.message || "Có lỗi từ server.");
            }
            alert('Thêm sản phẩm thành công!');
            modal.style.display = 'none';
            form.reset();
            // Chỉ tải lại dữ liệu cho tab Product
            await loadDataForView('Product', 1);
            switchView('Product'); // Đảm bảo tab Product được hiển thị

        } catch (error) {
            alert(`Lỗi: ${error.message}`);
        } finally {
            submitButton.textContent = 'Lưu sản phẩm';
            submitButton.disabled = false;
        }
    }
}

const toBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
});
