const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

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
    // Truyền các giá trị query, limit, và offset vào câu lệnh SQL một cách an toàn
    const result = await client.query(sqlQuery, [query, limitNum, offset]);
    client.release();
    res.json(result.rows);
  } catch (err) {
    console.error('Lỗi truy vấn database:', err.stack);
    res.status(500).json({ message: 'Lỗi khi truy vấn cơ sở dữ liệu' });
  }
});

app.listen(PORT, () => {
  console.log(`Backend proxy đang chạy tại http://localhost:${PORT}`);
});
