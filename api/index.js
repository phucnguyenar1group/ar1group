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
const CACHE_DURATION_SECONDS = 300;
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
    if (!sheetName) return res.status(400).json({ message: 'Cần cung cấp sheetName' });

    const now = Date.now();
    if (cache[sheetName] && (now - cache[sheetName].timestamp) / 1000 < CACHE_DURATION_SECONDS) {
        console.log(`[Cache HIT] Trả về dữ liệu cache cho: ${sheetName}`);
        return res.json({ status: 'success', source: 'cache', data: cache[sheetName].data });
    }

    try {
        const responseFromGoogle = await axios.get(`${SCRIPT_URL}?sheetName=${sheetName}`);
        if (responseFromGoogle.data && responseFromGoogle.data.data) {
            cache[sheetName] = { data: responseFromGoogle.data.data, timestamp: now };
        }
        res.json(responseFromGoogle.data);
    } catch (error) {
        res.status(500).json({ message: 'Lỗi server khi lấy dữ liệu từ Google.' });
    }
});

// Route cập nhật dữ liệu (sử dụng middleware checkPermissions)
app.post('/api/update-sheet', checkPermissions, async (req, res) => {
    try {
        const responseFromGoogle = await axios.post(SCRIPT_URL, req.body);
        const { sheetName } = req.body;
        if (sheetName && cache[sheetName]) {
            console.log(`[Cache CLEAR] Xóa cache cho: ${sheetName}`);
            delete cache[sheetName];
        }
        res.json(responseFromGoogle.data);
    } catch (error) {
        res.status(500).json({ message: 'Lỗi server khi cập nhật Google Sheet.' });
    }
});


// --- 6. XUẤT KHẨU ỨNG DỤNG CHO VERCEL ---
// Xóa app.listen và thay bằng dòng này.
module.exports = app;
