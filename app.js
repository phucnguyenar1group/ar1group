// =================================================================
// CẤU HÌNH
// =================================================================
// !!! QUAN TRỌNG: Thay thế URL này bằng URL Vercel đã cung cấp cho bạn
const API_BASE_URL = "https://ar1group.vercel.app"; 

// Định nghĩa các endpoints trên server Express
const GET_DATA_ENDPOINT = `${API_BASE_URL}/api/sheet-data`;
const UPDATE_DATA_ENDPOINT = `${API_BASE_URL}/api/update-sheet`;

// =================================================================
// BIẾN TOÀN CỤC VÀ CACHE
// =================================================================
// THAY ĐỔI 1: Sử dụng một đối tượng để lưu trữ dữ liệu cho nhiều tab
let viewDataCache = {}; // Ví dụ: { Contact: { data: [...], headers: [...] }, Vendor: { ... } }
let changesToSave = []; // Mảng chỉ lưu các ô đã thực sự thay đổi
let currentView = ''; // Lưu trữ view đang hoạt động

// =================================================================
// KHỞI TẠO ỨNG DỤNG
// =================================================================
document.addEventListener("DOMContentLoaded", () => {
  // Tải view mặc định là dashboard
  loadView('dashboard-main'); 
  document.querySelectorAll(".sidebar-menu a").forEach(link => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const viewName = link.getAttribute("data-view");
      if (viewName) loadView(viewName);
    });
  });
  document.getElementById("main-content").addEventListener("click", handleMainContentClick);
});

// =================================================================
// CÁC HÀM TIỆN ÍCH
// =================================================================

function showUserEmail(email) {
    const userEmailElement = document.getElementById('userEmail');
    if(userEmailElement) userEmailElement.textContent = email || "Không xác định";
}

/**
 * THAY ĐỔI 2: Logic load view hoàn toàn mới để cache giao diện
 * Hàm này giờ đây sẽ ẩn/hiện các view đã tải, và chỉ tải mới khi cần.
 */
async function loadView(viewName) {
  const mainContent = document.getElementById("main-content");
  const viewId = `view-${viewName}`;
  currentView = viewName; // Cập nhật view hiện tại

  // Ẩn tất cả các view con đang có
  const childViews = mainContent.querySelectorAll('.view-container');
  childViews.forEach(view => view.style.display = 'none');

  let viewContainer = document.getElementById(viewId);

  if (viewContainer) {
    // Nếu view đã tồn tại, chỉ cần hiển thị nó
    viewContainer.style.display = 'block';
    console.log(`Hiển thị lại view đã cache: ${viewName}`);

    // Và kiểm tra xem có dữ liệu mới không một cách "thầm lặng"
    // Chỉ kiểm tra cho các view có dữ liệu (Contact, Vendor, v.v...)
    if (viewName !== 'dashboard-main') {
         await loadDataForView(viewName, false); // false = không bắt buộc render lại
    }

  } else {
    // Nếu view chưa tồn tại, tạo mới và tải nội dung
    viewContainer = document.createElement('div');
    viewContainer.id = viewId;
    viewContainer.className = 'view-container';
    viewContainer.innerHTML = '';
    mainContent.appendChild(viewContainer);
    console.log(`Tải view lần đầu: ${viewName}`);

    try {
      // Tải file HTML tương ứng
      const response = await fetch(`${viewName.toLowerCase()}.html`);
      if (!response.ok) throw new Error(`Không thể tải ${viewName}.html.`);
      viewContainer.innerHTML = await response.text();
      
      // Sau khi tải HTML, nếu là view cần dữ liệu (như Contact, Vendor) thì tải dữ liệu
      // Các view này cần có một bảng với id là "table-grid-container" và tbody có id "table-body"
      if (viewName === 'Contact' || viewName === 'Vendor') { // Mở rộng điều kiện này cho các tab khác
        await loadDataForView(viewName, true); // true = bắt buộc render lần đầu
      }
    } catch (error) {
      viewContainer.innerHTML = `<p class="main-loading" style="color: red;">Lỗi: ${error.message}</p>`;
    }
  }
}

function handleMainContentClick(event) {
  const targetId = event.target.id;
  if (targetId === 'btn-edit') enableEditingMode(currentView);
  else if (targetId === 'btn-save') saveChanges(currentView);
  else if (targetId === 'btn-cancel') cancelEditingMode(currentView);
}

// =================================================================
// LOGIC TẢI VÀ HIỂN THỊ DỮ LIỆU CHUNG
// =================================================================

/**
 * THAY ĐỔI 3: Hàm tải dữ liệu chung cho mọi view
 * @param {string} viewName - Tên của view (và cũng là tên Sheet).
 * @param {boolean} forceRender - Nếu true, sẽ render lại bảng dù dữ liệu không mới.
 */
async function loadDataForView(viewName, forceRender = false) {
  const viewContainer = document.getElementById(`view-${viewName}`);
  if (!viewContainer) return;
  
  const tableBody = viewContainer.querySelector("tbody");
  if (!tableBody) return;

  // Hiển thị loading chỉ khi render lần đầu
  if (forceRender) {
    tableBody.innerHTML = '<tr><td colspan="99">Đang tải dữ liệu...</td></tr>';
  }

  try {
    const response = await fetch(`${GET_DATA_ENDPOINT}?sheetName=${viewName}`);
    if (!response.ok) throw new Error("Lỗi mạng hoặc server không phản hồi.");
    
    const result = await response.json();
    if (result.status !== 'success' || !result.data) {
      throw new Error(result.message || "Không có dữ liệu để hiển thị.");
    }
    
    // Chỉ render lại bảng nếu là lần đầu (forceRender) hoặc nếu dữ liệu được lấy từ Google (không phải cache server)
    if (forceRender || result.source === 'google') {
        console.log(`Dữ liệu cho '${viewName}' được cập nhật từ '${result.source}'. Đang render lại bảng.`);
        viewDataCache[viewName] = { data: result.data }; // Lưu dữ liệu mới vào cache
        renderTable(viewName);
        
        // Sau khi render lại, nếu đang ở chế độ chỉnh sửa thì tắt đi để tránh lỗi
        const editButton = document.getElementById('btn-edit');
        if (editButton && editButton.style.display === 'none') {
            cancelEditingMode(viewName);
        }
    } else {
        console.log(`Dữ liệu cho '${viewName}' lấy từ '${result.source}'. Không cần render lại.`);
    }

    // Hiển thị nút edit nếu là admin (luôn kiểm tra lại phòng trường hợp view được load từ cache)
    const editButton = document.getElementById("btn-edit");
    if (editButton && sessionStorage.getItem('userRole') === 'admin') {
      editButton.style.display = 'inline-block';
    }

  } catch (error) {
    if (tableBody) tableBody.innerHTML = `<tr><td colspan="99" style="color: red;">Lỗi tải dữ liệu: ${error.message}</td></tr>`;
  }
}

/**
 * THAY ĐỔI 4: Hàm render bảng chung
 * @param {string} viewName - Tên của view để tìm đúng container và dữ liệu trong cache.
 */
function renderTable(viewName) {
  const viewContainer = document.getElementById(`view-${viewName}`);
  if (!viewContainer) return;

  const tableBody = viewContainer.querySelector("tbody");
  if (!tableBody) return;

  // Xóa nội dung cũ của thân bảng, giữ nguyên tiêu đề
  tableBody.innerHTML = "";

  const data = viewDataCache[viewName]?.data;
  if (!data || data.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="4">Không có dữ liệu để hiển thị.</td></tr>';
      return;
  }

  // THAY ĐỔI: Định nghĩa thứ tự các cột để khớp với a header tĩnh trong HTML.
  // Quan trọng: Thứ tự các key trong mảng này PHẢI khớp với thứ tự các cột <th> trong contact.html
  const headers = ['Tên', 'Email', 'Số điện thoại', 'Chức vụ', 'Quyền truy cập'];
  viewDataCache[viewName].headers = headers; // Lưu lại header để dùng cho việc lưu thay đổi

  // Lặp qua dữ liệu và tạo các hàng cho tbody
  data.forEach((row, rowIndex) => {
    const tr = document.createElement("tr");
    tr.setAttribute('data-row-index', rowIndex);
    headers.forEach(header => {
        const td = document.createElement("td");
        td.setAttribute('data-column-name', header);
        // Lấy giá trị từ object 'row' dựa trên key là 'header'
        td.textContent = row[header] || "";
        tr.appendChild(td);
    });
    tableBody.appendChild(tr);
  });
}


// =================================================================
// LOGIC CHỈNH SỬA, LƯU, HỦY
// Các hàm này cần được điều chỉnh để hoạt động với view hiện tại
// =================================================================

function enableEditingMode(viewName) {
  document.getElementById('btn-edit').style.display = 'none';
  document.getElementById('btn-save').style.display = 'inline-block';
  document.getElementById('btn-cancel').style.display = 'inline-block';

  // Chỉ bật chỉnh sửa cho bảng trong view đang hoạt động
  const tableBody = document.querySelector(`#view-${viewName} tbody`);
  if (!tableBody) return;

  tableBody.querySelectorAll("td").forEach(cell => {
    cell.setAttribute("contenteditable", "true");
    cell.classList.add("editable-cell");
    cell.addEventListener('input', trackChange);
  });
  changesToSave = [];
}

function cancelEditingMode(viewName) {
  document.getElementById('btn-edit').style.display = 'inline-block';
  document.getElementById('btn-save').style.display = 'none';
  document.getElementById('btn-cancel').style.display = 'none';
  
  const tableBody = document.querySelector(`#view-${viewName} tbody`);
  if (!tableBody) return;

  tableBody.querySelectorAll("td").forEach(cell => {
    cell.setAttribute("contenteditable", "false");
    cell.classList.remove("editable-cell");
    cell.removeEventListener('input', trackChange);
  });

  // Khôi phục dữ liệu từ cache thay vì tải lại
  renderTable(viewName);
  changesToSave = [];
}

function trackChange(event) {
    const cell = event.target;
    const rowIndex = cell.parentElement.getAttribute('data-row-index');
    const columnName = cell.getAttribute('data-column-name');
    const value = cell.textContent;

    const existingChangeIndex = changesToSave.findIndex(c => c.rowIndex == rowIndex && c.columnName === columnName);
    if (existingChangeIndex > -1) {
        changesToSave.splice(existingChangeIndex, 1);
    }
    // Chuyển đổi rowIndex sang số nguyên để đảm bảo tính nhất quán
    changesToSave.push({ rowIndex: parseInt(rowIndex), columnName, value });
}

async function saveChanges(viewName) {
    if (changesToSave.length === 0) {
        alert("Không có thay đổi nào để lưu.");
        cancelEditingMode(viewName);
        return;
    }

    const saveButton = document.getElementById('btn-save');
    saveButton.textContent = 'Đang lưu...';
    saveButton.disabled = true;

    try {
        const idToken = await window.getFreshIdToken();
        if (!idToken) {
            throw new Error("Không thể lấy thông tin người dùng. Vui lòng đăng nhập lại.");
        }

        const payload = { 
            sheetName: viewName, // Sử dụng tên view động
            updates: changesToSave 
        };
        
        const response = await fetch(UPDATE_DATA_ENDPOINT, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorResult = await response.json();
            throw new Error(errorResult.message || `Lỗi từ server: ${response.statusText}`);
        }
        
        const result = await response.json();

        if (result.status === 'success') {
            alert("Cập nhật thành công!");
            // Tải lại dữ liệu cho view hiện tại, bắt buộc render để thấy thay đổi
            await loadDataForView(viewName, true); 
        } else {
            throw new Error(result.message || "Lỗi không xác định từ server.");
        }

    } catch (error) {
        alert(`Lưu thất bại: ${error.message}`);
        renderTable(viewName); // Khôi phục giao diện về trạng thái gốc từ cache
    } finally {
        cancelEditingMode(viewName);
        saveButton.textContent = 'Lưu thay đổi';
        saveButton.disabled = false;
    }
}