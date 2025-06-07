const express = require('express');
const fetch = require('node-fetch'); 
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = 3001;

// --- CẤU HÌNH KẾT NỐI POSTGRESQL ---
const pool = new Pool({
  user: 'postgres',           
  host: 'localhost',
  database: 'OSM',            
  password: 'Katarina2510',  
  port: 5432,
});

// Middleware
app.use(cors({ origin: 'http://localhost:3000' })); // Cho phép request từ React app

// === Endpoint cho Proxy Thời tiết ===
app.get('/api/weather/:cityId', async (req, res) => {
  const { cityId } = req.params;
  const wmoApiUrl = `https://worldweather.wmo.int/en/json/${cityId}_en.json`;

  try {
    const apiResponse = await fetch(wmoApiUrl);
    if (!apiResponse.ok) {
      // Chuyển tiếp status code và message lỗi từ WMO nếu có
      const errorText = await apiResponse.text();
      console.error(`Lỗi từ WMO API cho cityId ${cityId}: ${apiResponse.status} - ${errorText}`);
      return res.status(apiResponse.status).json({ message: `Lỗi từ API của WMO: ${apiResponse.statusText}` });
    }
    const data = await apiResponse.json();
    res.json(data);
  } catch (error) {
    console.error('Lỗi proxy API thời tiết:', error);
    res.status(500).json({ message: 'Lỗi server proxy' });
  }
});

// === Endpoint cho Tìm kiếm Địa điểm từ PostgreSQL ===
app.get('/api/search', async (req, res) => {
  const query = req.query.q; // Lấy chuỗi tìm kiếm từ query param 'q'
  
  if (!query || query.trim().length < 2) { // Yêu cầu ít nhất 2 ký tự để tìm kiếm
    return res.json([]); // Trả về mảng rỗng nếu query quá ngắn
  }

  // Câu truy vấn SQL để tìm kiếm địa điểm
  // - Tìm kiếm trên cột 'name'
  // - Sử dụng ILIKE để tìm kiếm không phân biệt chữ hoa/thường
  // - ST_Y(way) as lat, ST_X(way) as lon: Chuyển đổi tọa độ từ định dạng WKB của PostGIS
  // - Lấy osm_id làm place_id duy nhất
const sqlQuery = `
    SELECT 
      osm_id as place_id,
      name as display_name,
      -- ST_Transform(way, 4326) chuyển đổi tọa độ sang WGS 84 (độ)
      -- Sau đó ST_Y và ST_X mới lấy ra lat/lon chính xác
      ST_Y(ST_Transform(way, 4326)) as lat,
      ST_X(ST_Transform(way, 4326)) as lon
    FROM 
      planet_osm_point
    WHERE 
      name ILIKE $1
    LIMIT 10; 
  `;

  // Thêm dấu % vào hai đầu chuỗi query để tìm kiếm (ví dụ: "ha" -> "%ha%")
  const searchValue = `%${query}%`;

  try {
    const client = await pool.connect();
    // console.log(`Executing search query for: ${query}`); // Bỏ comment để debug
    const result = await client.query(sqlQuery, [searchValue]);
    client.release(); 

    // console.log(`Found ${result.rows.length} results.`); // Bỏ comment để debug
    res.json(result.rows); // Trả về mảng các kết quả

  } catch (err) {
    console.error('Lỗi truy vấn database:', err.stack);
    res.status(500).json({ message: 'Lỗi khi truy vấn cơ sở dữ liệu' });
  }
});


app.listen(PORT, () => {
  console.log(`Backend proxy đang chạy tại http://localhost:${PORT}`);
});
