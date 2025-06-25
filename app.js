// =================================================================
// IMPORTS & CẤU HÌNH
// =================================================================

// Import các hàm cần thiết từ Firebase SDK
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-app.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-storage.js";

// !!! QUAN TRỌNG: Thay thế URL này bằng URL Vercel đã cung cấp cho bạn
const API_BASE_URL = "https://ar1group.vercel.app"; 

// Định nghĩa các endpoints
const GET_DATA_ENDPOINT = `${API_BASE_URL}/api/sheet-data`;
const UPDATE_DATA_ENDPOINT = `${API_BASE_URL}/api/update-sheet`;
const ADD_PRODUCT_ENDPOINT = `${API_BASE_URL}/api/add-product`;

// =================================================================
// KHỞI TẠO FIREBASE
// =================================================================

// Lấy config từ window (được khai báo trong dashboard.html) để tránh lặp lại
const firebaseConfig = window.firebaseConfig;
let app;
if (!getApps().length) {
    app = initializeApp(firebaseConfig);
} else {
    app = getApps()[0];
}
// Khởi tạo Storage service
const storage = getStorage(app);


// =================================================================
// BIẾN TOÀN CỤC VÀ CACHE
// =================================================================
let viewDataCache = {}; // Cache dữ liệu của bảng
let paginationCache = {}; // Cache thông tin phân trang
let changesToSave = []; // Mảng lưu các ô đã thay đổi
let currentView = ''; // View đang hoạt động

// =================================================================
// KHỞI TẠO ỨNG DỤNG
// =================================================================
document.addEventListener("DOMContentLoaded", () => {
    loadView('dashboard-main');
    document.querySelectorAll(".sidebar-menu a").forEach(link => {
        link.addEventListener("click", (event) => {
            event.preventDefault();
            const viewName = link.getAttribute("data-view");
            if (viewName) loadView(viewName);
        });
    });
});

// =================================================================
// LOGIC CHÍNH: TẢI VIEW VÀ DỮ LIỆU
// =================================================================

async function loadView(viewName) {
    const mainContent = document.getElementById("main-content");
    const viewId = `view-${viewName}`;
    currentView = viewName;

    // Ẩn tất cả các view con đang có
    mainContent.querySelectorAll('.view-container').forEach(view => view.style.display = 'none');

    let viewContainer = document.getElementById(viewId);

    if (viewContainer) {
        viewContainer.style.display = 'block';
        console.log(`Hiển thị lại view đã cache: ${viewName}`);
    } else {
        viewContainer = document.createElement('div');
        viewContainer.id = viewId;
        viewContainer.className = 'view-container';
        mainContent.appendChild(viewContainer);
        console.log(`Tải view lần đầu: ${viewName}`);

        try {
            const response = await fetch(`${viewName.toLowerCase()}.html`);
            if (!response.ok) throw new Error(`Không thể tải ${viewName}.html.`);
            viewContainer.innerHTML = await response.text();

            if (['Contact', 'Vendor', 'Product'].includes(viewName)) {
                await loadDataForView(viewName, 1, true); // Tải trang 1, bắt buộc render
            }

            if (viewName === 'Product') {
                setupAddProductModal();
            }

        } catch (error) {
            viewContainer.innerHTML = `<p style="color: red;">Lỗi tải view: ${error.message}</p>`;
        }
    }
}

async function loadDataForView(viewName, page = 1, forceRender = false) {
    const viewContainer = document.getElementById(`view-${viewName}`);
    if (!viewContainer) return;
    
    const tableBody = viewContainer.querySelector("tbody");
    if (!tableBody) return;

    if (forceRender) {
        tableBody.innerHTML = `<tr><td colspan="99">Đang tải dữ liệu...</td></tr>`;
    }

    try {
        const response = await fetch(`${GET_DATA_ENDPOINT}?sheetName=${viewName}&page=${page}&limit=20`);
        if (!response.ok) throw new Error("Lỗi mạng hoặc server không phản hồi.");
        
        const result = await response.json();
        if (result.status !== 'success' || !result.data) {
            throw new Error(result.message || "Không có dữ liệu để hiển thị.");
        }
        
        viewDataCache[viewName] = { data: result.data };
        paginationCache[viewName] = result.pagination;
        
        renderTable(viewName);
        renderPaginationControls(viewName);

        if (sessionStorage.getItem('userRole') === 'admin') {
            viewContainer.querySelectorAll('.admin-control').forEach(el => el.style.display = 'inline-block');
        }

    } catch (error) {
        if (tableBody) tableBody.innerHTML = `<tr><td colspan="99" style="color: red;">Lỗi tải dữ liệu: ${error.message}</td></tr>`;
    }
}

// =================================================================
// LOGIC RENDER BẢNG VÀ PHÂN TRANG
// =================================================================

function renderTable(viewName) {
    const viewContainer = document.getElementById(`view-${viewName}`);
    const tableBody = viewContainer.querySelector("tbody");
    if (!viewContainer || !tableBody) return;

    tableBody.innerHTML = "";
    const data = viewDataCache[viewName]?.data;

    if (!data || data.length === 0) {
        const colspan = viewContainer.querySelectorAll("thead th").length || 1;
        tableBody.innerHTML = `<tr><td colspan="${colspan}">Không có dữ liệu để hiển thị.</td></tr>`;
        return;
    }

    if (viewName === 'Product') {
        renderProductTable(data, tableBody);
    } else {
        renderGenericTable(viewName, data, tableBody, viewContainer);
    }
}

/**
 * Hàm render cho bảng Product, đã được cập nhật để khớp với các header mới.
 */
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
    const headers = Array.from(viewContainer.querySelectorAll("thead th:not(.actions-column)"))
                         .map(th => th.textContent.trim());
    
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
                if (image.dataset.src) {
                   image.src = image.dataset.src;
                }
                image.classList.remove('lazy');
                observer.unobserve(image);
            }
        });
    });

    lazyImages.forEach(image => imageObserver.observe(image));
}

function renderPaginationControls(viewName) {
    const viewContainer = document.getElementById(`view-${viewName}`);
    const container = viewContainer.querySelector(".pagination-controls");
    if (!container) return;

    const pagination = paginationCache[viewName];
    if (!pagination || pagination.totalPages <= 1) {
        container.innerHTML = "";
        return;
    }

    let buttonsHTML = '';
    buttonsHTML += `<button class="btn btn-secondary" ${pagination.page === 1 ? 'disabled' : ''} onclick="window.changePage('${viewName}', ${pagination.page - 1})">Previous</button>`;
    buttonsHTML += `<span style="margin: 0 15px;">Page ${pagination.page} of ${pagination.totalPages}</span>`;
    buttonsHTML += `<button class="btn btn-secondary" ${pagination.page >= pagination.totalPages ? 'disabled' : ''} onclick="window.changePage('${viewName}', ${pagination.page + 1})">Next</button>`;
    
    container.innerHTML = buttonsHTML;
}

// Gắn hàm vào window để HTML có thể gọi
window.changePage = (viewName, page) => {
    loadDataForView(viewName, page, true);
};


// =================================================================
// LOGIC THÊM SẢN PHẨM (MODAL)
// =================================================================

function setupAddProductModal() {
    const viewContainer = document.getElementById(`view-${currentView}`);
    const modal = viewContainer.querySelector('#add-product-modal');
    const btn = viewContainer.querySelector('#btn-add-product');
    const span = viewContainer.querySelector('.close-button');
    const form = viewContainer.querySelector('#add-product-form');

    if (!modal || !btn || !span || !form) {
      console.warn("Modal elements not found for product view.");
      return;
    }

    btn.onclick = () => { modal.style.display = 'block'; };
    span.onclick = () => { modal.style.display = 'none'; };
    window.addEventListener('click', (event) => {
        if (event.target == modal) {
            modal.style.display = 'none';
        }
    });

    form.onsubmit = async (event) => {
        event.preventDefault();
        const submitButton = form.querySelector('button[type="submit"]');
        submitButton.textContent = 'Đang lưu...';
        submitButton.disabled = true;

        try {
            const fileInput = form.querySelector('input[name="PHOTO"]');
            const file = fileInput.files[0];
            let imageUrl = '';
            
            if (file) {
                 submitButton.textContent = 'Đang tải ảnh...';
                 const storageRef = ref(storage, `products/${Date.now()}_${file.name}`);
                 const snapshot = await uploadBytes(storageRef, file);
                 imageUrl = await getDownloadURL(snapshot.ref);
                 console.log('Image uploaded:', imageUrl);
            }

            const formData = new FormData(form);
            const productData = {};
            for (let [key, value] of formData.entries()) {
                // Không lấy giá trị của file input vào đây vì ta đã xử lý riêng
                if (key !== 'PHOTO') {
                    productData[key] = value;
                }
            }
            productData.PHOTO = imageUrl; // Thêm URL ảnh, dù là rỗng hay có giá trị

            submitButton.textContent = 'Đang lưu dữ liệu...';
            const idToken = await window.getFreshIdToken();
            const response = await fetch(ADD_PRODUCT_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({
                    sheetName: 'Product',
                    productData: productData
                })
            });

            const result = await response.json();
            if (result.status !== 'success') throw new Error(result.message);

            alert('Thêm sản phẩm thành công!');
            modal.style.display = 'none';
            form.reset();
            loadDataForView('Product', 1, true);

        } catch (error) {
            alert(`Lỗi: ${error.message}`);
        } finally {
            submitButton.textContent = 'Lưu sản phẩm';
            submitButton.disabled = false;
        }
    }
}
