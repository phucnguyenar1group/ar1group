// =================================================================
// CẤU HÌNH
// =================================================================
// !!! QUAN TRỌNG: Thay thế URL này bằng URL triển khai Web App của bạn
const API_ENDPOINT = "http://localhost:3000/api/update-sheet"; 

// =================================================================
// BIẾN TOÀN CỤC
// =================================================================
let originalData = []; // Lưu trữ dữ liệu gốc để có thể hủy thay đổi
let changesToSave = []; // Mảng chỉ lưu các ô đã thực sự thay đổi

// =================================================================
// KHỞI TẠO ỨNG DỤNG
// =================================================================
document.addEventListener("DOMContentLoaded", () => {
  // Tải trang dashboard mặc định khi vào
  loadView('dashboard-main');

  // Gán sự kiện cho các link trong sidebar một lần duy nhất
  document.querySelectorAll(".sidebar-menu a").forEach(link => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const viewName = link.getAttribute("data-view");
      if (viewName) {
        loadView(viewName);
      }
    });
  });

  // Ủy quyền sự kiện cho các nút hành động (Sửa, Lưu, Hủy) trong #main-content
  document.getElementById("main-content").addEventListener("click", handleMainContentClick);
});

// =================================================================
// CÁC HÀM TIỆN ÍCH
// =================================================================

/**
 * Hiển thị email người dùng trên sidebar.
 * dashboard.html sẽ gọi hàm này sau khi xác thực thành công.
 */
function showUserEmail(email) {
    const userEmailElement = document.getElementById('userEmail');
    if(userEmailElement) {
        userEmailElement.textContent = email || "Không xác định";
    }
}

/**
 * Tải nội dung của một trang (view) từ file .html và hiển thị.
 * @param {string} viewName - Tên của view (ví dụ: 'Contact', 'Vendor').
 */
async function loadView(viewName) {
  const mainContent = document.getElementById("main-content");
  mainContent.innerHTML = `<p class="main-loading">Đang tải trang ${viewName}...</p>`;

  try {
    // Tải file HTML tương ứng
    const response = await fetch(`${viewName.toLowerCase()}.html`);
    if (!response.ok) throw new Error(`Không thể tải ${viewName}.html. File không tồn tại hoặc có lỗi.`);
    
    mainContent.innerHTML = await response.text();

    // Sau khi tải HTML xong, nếu là trang Contact thì tải dữ liệu cho nó
    if (viewName === 'Contact') {
      await loadContactData();
    }
  } catch (error) {
    mainContent.innerHTML = `<p class="main-loading" style="color: red;">Lỗi: ${error.message}</p>`;
    console.error("Lỗi tải view:", error);
  }
}

/**
 * Xử lý tập trung các sự kiện click cho các nút hành động.
 * @param {Event} event
 */
function handleMainContentClick(event) {
  const targetId = event.target.id;
  if (targetId === 'btn-edit') {
    enableEditingMode();
  } else if (targetId === 'btn-save') {
    saveChanges();
  } else if (targetId === 'btn-cancel') {
    cancelEditingMode();
  }
}

// =================================================================
// LOGIC CỤ THỂ CHO TRANG CONTACT
// =================================================================

/**
 * Tải và hiển thị dữ liệu Contact từ Google Sheet.
 */
async function loadContactData() {
  const tableBody = document.getElementById("contact-table");
  const editButton = document.getElementById("btn-edit");
  if (!tableBody || !editButton) {
      console.error("Không tìm thấy các thành phần của bảng Contact.");
      return;
  }
  tableBody.innerHTML = '<tr><td colspan="3">Đang tải dữ liệu...</td></tr>';
  
  try {
    // Gọi doGet từ Apps Script để lấy dữ liệu mới nhất
    const SCRIPT_URL_GET = "https://script.google.com/macros/s/AKfycbxb6gb0N6pEekpLxGMr1Dfz-RUtYfI4PnRMcfoxuFLmMqWiTkAtaG_2rb-A-sXVqe28Kw/exec";
    const response = await fetch(SCRIPT_URL_GET);
    if (!response.ok) throw new Error("Lỗi mạng hoặc server không phản hồi.");
    
    const data = await response.json();
    if(!data || data.length === 0) throw new Error("Không có dữ liệu để hiển thị.");

    originalData = JSON.parse(JSON.stringify(data)); // Lưu bản sao sâu của dữ liệu gốc
    renderContactTable(data);

    // Hiển thị nút "Chỉnh sửa" nếu là admin
    if (sessionStorage.getItem('userRole') === 'admin') {
      editButton.style.display = 'inline-block';
    }
  } catch (error) {
    tableBody.innerHTML = `<tr><td colspan="3" style="color: red;">Lỗi tải dữ liệu: ${error.message}</td></tr>`;
    console.error("Lỗi tải Contact:", error);
  }
}

/**
 * Hiển thị dữ liệu lên bảng một cách linh hoạt.
 * @param {Array<Object>} data - Mảng dữ liệu contact.
 */
function renderContactTable(data) {
  const tableContainer = document.getElementById("contact-table-grid");
  if (!tableContainer) return;
  const tableHead = tableContainer.querySelector("thead");
  const tableBody = tableContainer.querySelector("tbody");
  
  tableHead.innerHTML = "";
  tableBody.innerHTML = ""; 

  if (!data || data.length === 0) return;

  // Tạo header từ các key của object đầu tiên trong mảng dữ liệu
  const headers = Object.keys(data[0]);
  const headerRow = document.createElement("tr");
  headers.forEach(headerText => {
      const th = document.createElement("th");
      th.textContent = headerText;
      headerRow.appendChild(th);
  });
  tableHead.appendChild(headerRow);
  
  // Tạo các hàng dữ liệu
  data.forEach((row, rowIndex) => {
    const tr = document.createElement("tr");
    tr.setAttribute('data-row-index', rowIndex);

    headers.forEach(header => {
        const td = document.createElement("td");
        td.setAttribute('data-column-name', header);
        td.textContent = row[header] || "";
        tr.appendChild(td);
    });
    tableBody.appendChild(tr);
  });
}

/**
 * Bật chế độ chỉnh sửa cho bảng Contact.
 */
function enableEditingMode() {
  document.getElementById('btn-edit').style.display = 'none';
  document.getElementById('btn-save').style.display = 'inline-block';
  document.getElementById('btn-cancel').style.display = 'inline-block';

  // Thêm thuộc tính contenteditable và class để CSS cho các ô
  document.querySelectorAll("#contact-table td").forEach(cell => {
    cell.setAttribute("contenteditable", "true");
    cell.classList.add("editable-cell");
    cell.addEventListener('input', trackChange); // Bắt sự kiện thay đổi
  });
  
  changesToSave = []; // Reset mảng thay đổi khi bắt đầu sửa
}

/**
 * Tắt chế độ chỉnh sửa và hủy các thay đổi.
 */
function cancelEditingMode() {
  document.getElementById('btn-edit').style.display = 'inline-block';
  document.getElementById('btn-save').style.display = 'none';
  document.getElementById('btn-cancel').style.display = 'none';
  
  // Gỡ bỏ thuộc tính contenteditable và sự kiện
  document.querySelectorAll("#contact-table td").forEach(cell => {
    cell.setAttribute("contenteditable", "false");
    cell.classList.remove("editable-cell");
    cell.removeEventListener('input', trackChange);
  });

  renderContactTable(originalData); // Khôi phục lại dữ liệu từ bản gốc đã lưu
  changesToSave = [];
}

/**
 * Theo dõi sự thay đổi của một ô và thêm vào mảng `changesToSave`.
 * @param {Event} event 
 */
function trackChange(event) {
    const cell = event.target;
    const rowIndex = cell.parentElement.getAttribute('data-row-index');
    const columnName = cell.getAttribute('data-column-name');
    const value = cell.textContent;

    // Xóa các thay đổi cũ trên cùng một ô để chỉ giữ lại giá trị cuối cùng
    const existingChangeIndex = changesToSave.findIndex(c => c.rowIndex === rowIndex && c.columnName === columnName);
    if (existingChangeIndex > -1) {
        changesToSave.splice(existingChangeIndex, 1);
    }
    
    // Thêm thay đổi mới vào mảng
    changesToSave.push({ rowIndex, columnName, value });
}


/**
 * Gửi các thay đổi đã được ghi nhận lên Google Sheet.
 */
async function saveChanges() {
    if (changesToSave.length === 0) {
        alert("Không có thay đổi nào để lưu.");
        cancelEditingMode();
        return;
    }

    const saveButton = document.getElementById('btn-save');
    saveButton.textContent = 'Đang lưu...';
    saveButton.disabled = true;

    try {
        // Dữ liệu gửi đi giờ chỉ cần mảng 'updates'
        const payload = { updates: changesToSave };
        
        // Gọi đến API ENDPOINT của server Express
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            // Xử lý lỗi từ server Express
            const errorResult = await response.json();
            throw new Error(errorResult.message || `Lỗi HTTP: ${response.status}`);
        }
        
        const result = await response.json();

        if (result.status === 'success') {
            alert("Cập nhật thành công!");
            await loadContactData(); // Tải lại dữ liệu gốc từ Apps Script (vẫn dùng doGet)
        } else {
            throw new Error(result.message || "Lỗi không xác định từ server.");
        }

    } catch (error) {
        alert(`Lưu thất bại: ${error.message}`);
        console.error("Lỗi khi lưu:", error);
        renderContactTable(originalData);
    } finally {
        cancelEditingMode();
        saveButton.textContent = 'Lưu thay đổi';
        saveButton.disabled = false;
    }
}
