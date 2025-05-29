const express = require('express');
const fetch = require('node-fetch'); 
const cors = require('cors'); // Cho phép request từ frontend localhost 

const app = express();
const PORT = 3001; // Hoặc một port khác cho backend

app.use(cors({ origin: 'http://localhost:3000' })); // Cho phép request từ React app

app.get('/api/weather/:cityId', async (req, res) => {
  const { cityId } = req.params;
  const wmoApiUrl = `https://worldweather.wmo.int/en/json/${cityId}_en.json`;

  try {
    const apiResponse = await fetch(wmoApiUrl);
    if (!apiResponse.ok) {
      return res.status(apiResponse.status).json({ message: 'Lỗi từ API của WMO' });
    }
    const data = await apiResponse.json();
    res.json(data);
  } catch (error) {
    console.error('Lỗi proxy API thời tiết:', error);
    res.status(500).json({ message: 'Lỗi server proxy' });
  }
});

app.listen(PORT, () => {
  console.log(`Backend proxy đang chạy tại http://localhost:${PORT}`);
});