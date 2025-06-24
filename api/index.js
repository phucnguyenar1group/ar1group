const express = require('express');
const cors = require('cors');
const axios = require('axios');
const admin = require('firebase-admin');

// --- 1. ĐỌC THÔNG TIN BÍ MẬT TỪ BIẾN MÔI TRƯỜNG ---
// Vercel sẽ cung cấp các giá trị này cho chúng ta sau khi cấu hình
// Điều này an toàn hơn nhiều so với việc viết trực tiếp vào code
const serviceAccount = JSON.parse(process.env.SERVICE_ACCOUNT_KEY);
const SCRIPT_URL = process.env.SCRIPT_URL;

// --- 2. KHỞI TẠO CÁC DỊCH VỤ ---
// Khởi tạo Firebase Admin SDK
// Thêm đoạn kiểm tra để tránh khởi tạo lại khi Vercel chạy hàm nhiều lần
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const app = express();

// --- 3. THIẾT LẬP CACHE VÀ MIDDLEWARE ---
const CACHE_DURATION_SECONDS = 30;
const cache = {};
const corsOptions = { origin: 'https://ar1group.web.app' }; // Thay bằng domain của bạn
app.use(cors(corsOptions));
app.use(express.json());

// --- 4. MIDDLEWARE KIỂM TRA QUYỀN (giữ nguyên logic của bạn) ---
const checkPermissions = async (req, res, next) => {
    // ... Dán toàn bộ code của middleware checkPermissions của bạn vào đây ...
    // Ví dụ cơ bản:
    try {
        const idToken = req.headers.authorization.split('Bearer ')[1];
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        req.user = decodedToken; // Gắn thông tin người dùng vào request
        console.log(`[AUTH] Request from ${decodedToken.email}`);
        // ... Logic kiểm tra quyền chi tiết của bạn ...
        next(); // Nếu có quyền thì cho đi tiếp
    } catch (error) {
        console.error('[AUTH] Lỗi xác thực:', error);
        res.status(403).json({ message: "Xác thực thất bại hoặc không có quyền." });
    }
};

// --- 5. CÁC ROUTE API (giữ nguyên logic của bạn) ---

// Route lấy dữ liệu
app.get('/api/sheet-data', async (req, res) => {
    const sheetName = req.query.sheetName;
    if (!sheetName) {
        return res.status(400).json({ status: 'error', message: 'Cần cung cấp "sheetName" trong query.' });
    }

    const now = Date.now();
    // Kiểm tra cache trước
    if (cache[sheetName] && (now - cache[sheetName].timestamp) / 1000 < CACHE_DURATION_SECONDS) {
        console.log(`[Cache HIT] Trả về dữ liệu cache cho: ${sheetName}`);
        return res.json({ status: 'success', source: 'cache', data: cache[sheetName].data });
    }

    try {
        console.log(`[Cache MISS] Lấy dữ liệu mới từ Google cho: ${sheetName}`);
        const responseFromGoogle = await axios.get(`${SCRIPT_URL}?sheetName=${sheetName}`);
        const googleData = responseFromGoogle.data;

        // Kiểm tra kỹ cấu trúc dữ liệu trả về từ Google Apps Script
        if (googleData && googleData.status === 'success' && Array.isArray(googleData.data)) {
            // Lưu dữ liệu vào cache
            cache[sheetName] = { data: googleData.data, timestamp: now };
            console.log(`[Cache SET] Đã lưu cache cho: ${sheetName}`);

            // Trả về cho client với định dạng chuẩn
            res.json({
                status: 'success',
                source: 'google',
                data: googleData.data
            });
        } else {
            // Nếu Apps Script trả về lỗi hoặc định dạng không đúng
            console.error(`[Google Script Error] Phản hồi không hợp lệ cho ${sheetName}:`, googleData);
            res.status(502).json({ status: 'error', message: googleData.message || 'Dữ liệu trả về từ Google không hợp lệ.' });
        }
    } catch (error) {
        // Nếu có lỗi mạng khi gọi Apps Script
        console.error(`[Axios Error] Lỗi khi gọi Google Script cho ${sheetName}:`, error.message);
        res.status(500).json({ status: 'error', message: 'Lỗi server khi lấy dữ liệu từ Google.' });
    }
});

// Route cập nhật dữ liệu (sử dụng middleware checkPermissions)
app.post('/api/update-sheet', checkPermissions, async (req, res) => {
    try {
        const responseFromGoogle = await axios.post(SCRIPT_URL, req.body);
        const { sheetName } = req.body;
        // Xóa cache của sheet vừa cập nhật để lần sau tải lại dữ liệu mới
        if (sheetName && cache[sheetName]) {
            console.log(`[Cache CLEAR] Xóa cache cho: ${sheetName}`);
            delete cache[sheetName];
        }
        res.json(responseFromGoogle.data);
    } catch (error) {
        console.error('[Update Error] Lỗi khi cập nhật Google Sheet:', error.message);
        res.status(500).json({ status: 'error', message: 'Lỗi server khi cập nhật Google Sheet.' });
    }
});


// --- 6. XUẤT KHẨU ỨNG DỤNG CHO VERCEL ---
// Xóa app.listen và thay bằng dòng này.
module.exports = app;
