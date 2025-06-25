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
    // Lấy thêm tham số page và limit
    const { sheetName, page = 1, limit = 20 } = req.query; // Mặc định trang 1, 20 mục/trang

    if (!sheetName) {
        return res.status(400).json({ status: 'error', message: 'Cần cung cấp "sheetName".' });
    }

    // Key cho cache giờ sẽ bao gồm cả trang và giới hạn
    const cacheKey = `${sheetName}-p${page}-l${limit}`;
    const now = Date.now();

    if (cache[cacheKey] && (now - cache[cacheKey].timestamp) / 1000 < CACHE_DURATION_SECONDS) {
        console.log(`[Cache HIT] Trả về dữ liệu cache cho: ${cacheKey}`);
        return res.json({ status: 'success', source: 'cache', ...cache[cacheKey].data });
    }

    try {
        console.log(`[Cache MISS] Lấy dữ liệu mới từ Google cho: ${cacheKey}`);
        // Truyền tham số phân trang tới Google Apps Script
        const scriptUrlWithParams = `${SCRIPT_URL}?sheetName=${sheetName}&page=${page}&limit=${limit}`;
        const responseFromGoogle = await axios.get(scriptUrlWithParams);
        const googleData = responseFromGoogle.data;

        if (googleData && googleData.status === 'success') {
            cache[cacheKey] = { data: googleData, timestamp: now };
            console.log(`[Cache SET] Đã lưu cache cho: ${cacheKey}`);
            res.json({ source: 'google', ...googleData });
        } else {
            // ... xử lý lỗi như cũ ...
        }
    } catch (error) {
        // ... xử lý lỗi như cũ ...
    }
});

// ROUTE MỚI: Thêm sản phẩm
app.post('/api/add-product', checkPermissions, async (req, res) => {
    try {
        // Thêm một action để Google Script biết phải làm gì
        const payload = {
            action: 'addProduct',
            ...req.body
        };

        const responseFromGoogle = await axios.post(SCRIPT_URL, payload);

        // Xóa cache của trang đầu tiên của sheet Product vì có dữ liệu mới
        console.log(`[Cache CLEAR] Xóa cache cho Product trang 1`);
        delete cache['Product-p1-l20']; // Hoặc một cơ chế xóa cache thông minh hơn

        res.json(responseFromGoogle.data);
    } catch (error) {
        console.error('[Add Product Error]', error.message);
        res.status(500).json({ status: 'error', message: 'Lỗi server khi thêm sản phẩm.' });
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
