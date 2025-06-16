const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const fetch = require('node-fetch');

const app = express();
const PORT = 3001;

// --- CẤU HÌNH KẾT NỐI POSTGRESQL ---
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'OSM',
  password: 'Katarina2510', // Hãy chắc chắn mật khẩu của bạn là chính xác
  port: 5432,
});

// Middleware
app.use(cors({ origin: 'http://localhost:3000' }));

// === Endpoint cho Tìm kiếm Địa điểm (Đã cập nhật để hỗ trợ phân trang) ===
app.get('/api/search', async (req, res) => {
  // Lấy các tham số từ query string, gán giá trị mặc định nếu không có
  const { q: query, page = 1, limit = 10 } = req.query;

  if (!query || query.trim().length < 2) {
    return res.json([]);
  }

  // Chuyển đổi page và limit sang kiểu số nguyên
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);

  // Tính toán OFFSET để bỏ qua các kết quả của những trang trước
  const offset = (pageNum - 1) * limitNum;

  // Cập nhật câu lệnh SQL để sử dụng LIMIT và OFFSET
  const sqlQuery = `
    SELECT
      place_id,
      display_name,
      lat,
      lon
    FROM
      searchable_locations_view
    WHERE
      tsv @@ plainto_tsquery('simple', $1)
    ORDER BY
      ts_rank(tsv, plainto_tsquery('simple', $1)) DESC
    LIMIT $2 OFFSET $3; -- Sử dụng tham số cho LIMIT và OFFSET
  `;

  try {
    const client = await pool.connect();
    // Truyền các giá trị query, limit, và offset vào câu lệnh SQL 
    const result = await client.query(sqlQuery, [query, limitNum, offset]);
    client.release();
    res.json(result.rows);
  } catch (err) {
    console.error('Lỗi truy vấn database:', err.stack);
    res.status(500).json({ message: 'Lỗi khi truy vấn cơ sở dữ liệu' });
  }
});

// === Endpoint để lấy dữ liệu chỉ đường ===
// Endpoint này sẽ nhận tọa độ điểm đầu và điểm cuối, sau đó gọi đến dịch vụ OSRM để lấy thông tin rồi trả về cho client
app.get('/api/route', async (req, res) => {
  const { startLon, startLat, endLon, endLat } = req.query;

  if (!startLon || !startLat || !endLon || !endLat) {
    return res.status(400).json({ message: 'Thiếu tọa độ điểm đầu hoặc điểm cuối.' });
  }

  // URL của dịch vụ chỉ đường OSRM công cộng
  const osrmUrl = `http://router.project-osrm.org/route/v1/driving/${startLon},${startLat};${endLon},${endLat}?overview=full&geometries=geojson`;

  try {
    const response = await fetch(osrmUrl);
    const data = await response.json();

    if (data.code !== 'Ok') {
      // Nếu OSRM không tìm được đường đi
      return res.status(404).json({ message: 'Không tìm thấy đường đi.' });
    }
    
    // Trả về dữ liệu GeoJSON của tuyến đường cho client
    res.json(data.routes[0].geometry);

  } catch (error) {
    console.error('Lỗi khi gọi API chỉ đường OSRM:', error);
    res.status(500).json({ message: 'Lỗi server khi lấy dữ liệu chỉ đường.' });
  }
});


app.listen(PORT, () => {
  console.log(`Backend proxy đang chạy tại http://localhost:${PORT}`);
});
