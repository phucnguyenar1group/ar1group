// =================================================================
// CẤU HÌNH
// =================================================================
// !!! QUAN TRỌNG: Thay thế URL này bằng URL Vercel đã cung cấp cho bạn
const API_BASE_URL = "https://ar1group.vercel.app"; 

// Định nghĩa các endpoints
const GET_DATA_ENDPOINT = `${API_BASE_URL}/api/sheet-data`;
const UPDATE_DATA_ENDPOINT = `${API_BASE_URL}/api/update-sheet`;
const ADD_PRODUCT_ENDPOINT = `${API_BASE_URL}/api/add-product`;


// =================================================================
// BIẾN TOÀN CỤC VÀ CACHE
// =================================================================
let viewDataCache = {};
let paginationCache = {};
let changesToSave = [];
let currentView = '';

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

    mainContent.querySelectorAll('.view-container').forEach(view => view.style.display = 'none');

    let viewContainer = document.getElementById(viewId);

    if (viewContainer) {
        viewContainer.style.display = 'block';
    } else {
        viewContainer = document.createElement('div');
        viewContainer.id = viewId;
        viewContainer.className = 'view-container';
        mainContent.appendChild(viewContainer);
        
        try {
            const response = await fetch(`${viewName.toLowerCase()}.html`);
            if (!response.ok) throw new Error(`Không thể tải ${viewName}.html.`);
            viewContainer.innerHTML = await response.text();

            if (['Contact', 'Vendor', 'Product'].includes(viewName)) {
                await loadDataForView(viewName, 1, true);
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
    if (!tableBody) return;

    tableBody.innerHTML = "";
    const data = viewDataCache[viewName]?.data;
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
    loadDataForView(viewName, page, true);
};

// =================================================================
// LOGIC THÊM SẢN PHẨM (MODAL) VỚI GOOGLE DRIVE UPLOAD
// =================================================================

function setupAddProductModal() {
    const viewContainer = document.getElementById(`view-${currentView}`);
    const modal = viewContainer.querySelector('#add-product-modal');
    const btn = viewContainer.querySelector('#btn-add-product');
    const span = viewContainer.querySelector('.close-button');
    const form = viewContainer.querySelector('#add-product-form');

    if (!modal || !btn || !span || !form) return;

    btn.onclick = () => { modal.style.display = 'block'; };
    span.onclick = () => { modal.style.display = 'none'; };
    window.addEventListener('click', (event) => {
        if (event.target == modal) modal.style.display = 'none';
    });

    form.onsubmit = async (event) => {
        event.preventDefault();
        const submitButton = form.querySelector('button[type="submit"]');
        submitButton.textContent = 'Đang xử lý...';
        submitButton.disabled = true;

        try {
            // Bước 1: Đọc file ảnh dưới dạng base64
            const fileInput = form.querySelector('input[name="PHOTO"]');
            const file = fileInput.files[0];
            let imageFilePayload = null;
            
            if (file) {
                // Giới hạn kích thước file ở client để tránh lỗi từ Vercel
                if (file.size > 4.5 * 1024 * 1024) {
                    throw new Error("Ảnh quá lớn. Vui lòng chọn ảnh có kích thước dưới 4.5 MB.");
                }
                const base64Data = await toBase64(file);
                imageFilePayload = {
                    base64Data: base64Data.split(',')[1], // Chỉ lấy phần dữ liệu sau dấu phẩy
                    mimeType: file.type,
                    fileName: file.name
                };
            }

            // Bước 2: Gom dữ liệu từ form
            const formData = new FormData(form);
            const productData = {};
            for (let [key, value] of formData.entries()) {
                if (key !== 'PHOTO') {
                    productData[key] = value;
                }
            }
            
            // Bước 3: Gửi toàn bộ payload (thông tin sản phẩm và file ảnh) đến backend
            const idToken = await window.getFreshIdToken();
            const response = await fetch(ADD_PRODUCT_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({
                    action: 'addProduct', // Action để Apps Script biết cần làm gì
                    sheetName: 'Product',
                    productData: productData,
                    imageFile: imageFilePayload // Gửi kèm đối tượng file ảnh
                })
            });

            const result = await response.json();
            if (!response.ok || result.status !== 'success') {
                 throw new Error(result.message || "Có lỗi xảy ra từ server.");
            }

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

/**
 * Hàm tiện ích chuyển đổi file thành chuỗi base64.
 * @param {File} file - File người dùng chọn.
 * @returns {Promise<string>} - Một promise sẽ resolve với chuỗi base64.
 */
const toBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
});
