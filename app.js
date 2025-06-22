// =================================================================
// CẤU HÌNH
// =================================================================
// !!! QUAN TRỌNG: Thay thế URL này bằng URL Vercel đã cung cấp cho bạn
const API_BASE_URL = "https://ar1group.vercel.app"; 

// Định nghĩa các endpoints trên server Express
const GET_DATA_ENDPOINT = `${API_BASE_URL}/api/sheet-data`;
const UPDATE_DATA_ENDPOINT = `${API_BASE_URL}/api/update-sheet`;

// =================================================================
// BIẾN TOÀN CỤC
// =================================================================
let originalData = []; // Lưu trữ dữ liệu gốc để có thể hủy thay đổi
let changesToSave = []; // Mảng chỉ lưu các ô đã thực sự thay đổi

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
  document.getElementById("main-content").addEventListener("click", handleMainContentClick);
});

// =================================================================
// CÁC HÀM TIỆN ÍCH
// =================================================================

function showUserEmail(email) {
    const userEmailElement = document.getElementById('userEmail');
    if(userEmailElement) userEmailElement.textContent = email || "Không xác định";
}

async function loadView(viewName) {
  const mainContent = document.getElementById("main-content");
  mainContent.innerHTML = `<p class="main-loading">Đang tải trang ${viewName}...</p>`;
  try {
    const response = await fetch(`${viewName.toLowerCase()}.html`);
    if (!response.ok) throw new Error(`Không thể tải ${viewName}.html.`);
    mainContent.innerHTML = await response.text();
    
    // Sau khi tải HTML xong, nếu là trang Contact thì tải dữ liệu cho nó
    if (viewName === 'Contact') {
      await loadContactData();
    }
  } catch (error) {
    mainContent.innerHTML = `<p class="main-loading" style="color: red;">Lỗi: ${error.message}</p>`;
  }
}

function handleMainContentClick(event) {
  const targetId = event.target.id;
  if (targetId === 'btn-edit') enableEditingMode();
  else if (targetId === 'btn-save') saveChanges();
  else if (targetId === 'btn-cancel') cancelEditingMode();
}

// =================================================================
// LOGIC CỤ THỂ CHO TRANG CONTACT
// =================================================================

/**
 * *** THAY ĐỔI 1: Tải dữ liệu từ Express Server để tận dụng Caching ***
 * Tải và hiển thị dữ liệu Contact.
 */
async function loadContactData() {
  const tableBody = document.getElementById("contact-table");
  const editButton = document.getElementById("btn-edit");
  if (!tableBody || !editButton) return;
  tableBody.innerHTML = '<tr><td colspan="3">Đang tải dữ liệu...</td></tr>';
  
  try {
    // Gọi đến Express server thay vì Apps Script trực tiếp
    const response = await fetch(`${GET_DATA_ENDPOINT}?sheetName=Contact`);
    if (!response.ok) throw new Error("Lỗi mạng hoặc server không phản hồi.");
    
    const result = await response.json();
    if(result.status !== 'success' || !result.data) {
      throw new Error(result.message || "Không có dữ liệu để hiển thị.");
    }
    
    console.log(`Dữ liệu được tải từ: ${result.source || 'google'}`); // Sẽ thấy 'cache' hoặc 'google'
    originalData = result.data; // Dữ liệu đã là JSON, không cần parse lại
    renderContactTable(result.data);

    if (sessionStorage.getItem('userRole') === 'admin') {
      editButton.style.display = 'inline-block';
    }
  } catch (error) {
    tableBody.innerHTML = `<tr><td colspan="3" style="color: red;">Lỗi tải dữ liệu: ${error.message}</td></tr>`;
  }
}

/**
 * Hiển thị dữ liệu lên bảng một cách linh hoạt.
 */
function renderContactTable(data) {
  const tableContainer = document.getElementById("contact-table-grid");
  if (!tableContainer) return;
  const tableHead = tableContainer.querySelector("thead");
  const tableBody = tableContainer.querySelector("tbody");
  
  tableHead.innerHTML = "";
  tableBody.innerHTML = ""; 

  if (!data || data.length === 0) return;

  const headers = Object.keys(data[0]);
  const headerRow = document.createElement("tr");
  headers.forEach(headerText => {
      const th = document.createElement("th");
      th.textContent = headerText;
      headerRow.appendChild(th);
  });
  tableHead.appendChild(headerRow);
  
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

function enableEditingMode() {
  document.getElementById('btn-edit').style.display = 'none';
  document.getElementById('btn-save').style.display = 'inline-block';
  document.getElementById('btn-cancel').style.display = 'inline-block';

  document.querySelectorAll("#contact-table td").forEach(cell => {
    cell.setAttribute("contenteditable", "true");
    cell.classList.add("editable-cell");
    cell.addEventListener('input', trackChange);
  });
  changesToSave = [];
}

function cancelEditingMode() {
  document.getElementById('btn-edit').style.display = 'inline-block';
  document.getElementById('btn-save').style.display = 'none';
  document.getElementById('btn-cancel').style.display = 'none';
  
  document.querySelectorAll("#contact-table td").forEach(cell => {
    cell.setAttribute("contenteditable", "false");
    cell.classList.remove("editable-cell");
    cell.removeEventListener('input', trackChange);
  });
  renderContactTable(originalData);
  changesToSave = [];
}

function trackChange(event) {
    const cell = event.target;
    const rowIndex = cell.parentElement.getAttribute('data-row-index');
    const columnName = cell.getAttribute('data-column-name');
    const value = cell.textContent;

    const existingChangeIndex = changesToSave.findIndex(c => c.rowIndex === rowIndex && c.columnName === columnName);
    if (existingChangeIndex > -1) {
        changesToSave.splice(existingChangeIndex, 1);
    }
    changesToSave.push({ rowIndex, columnName, value });
}

/**
 * *** THAY ĐỔI 2: Gửi ID Token để Xác thực quyền trên Server ***
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
        // Lấy token xác thực mới nhất từ Firebase (hàm này được định nghĩa trong dashboard.html)
        const idToken = await window.getFreshIdToken();
        if (!idToken) {
            throw new Error("Không thể lấy thông tin người dùng. Vui lòng đăng nhập lại.");
        }

        const payload = { 
            sheetName: 'Contact', // Gửi kèm tên sheet
            updates: changesToSave 
        };
        
        const response = await fetch(UPDATE_DATA_ENDPOINT, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              // *** GỬI TOKEN LÊN SERVER ĐỂ XÁC THỰC ***
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
            await loadContactData(); // Tải lại dữ liệu mới nhất
        } else {
            throw new Error(result.message || "Lỗi không xác định từ server.");
        }

    } catch (error) {
        alert(`Lưu thất bại: ${error.message}`);
        renderContactTable(originalData); // Khôi phục giao diện về trạng thái gốc
    } finally {
        cancelEditingMode();
        saveButton.textContent = 'Lưu thay đổi';
        saveButton.disabled = false;
    }
}
