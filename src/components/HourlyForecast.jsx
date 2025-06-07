import React from 'react';

// Hàm này ánh xạ các điều kiện từ server.py ('Nắng', 'Mưa', 'Trời mây') sang icon
const getWeatherIconUrl = (condition) => {
    if (!condition) return '/weather_icons/default.png';
    const desc = String(condition).toLowerCase();
    // Chú ý: server.py trả về 'Mưa', 'Nắng', 'Trời mây' bằng tiếng Việt
    if (desc.includes("mưa")) return '/weather_icons/rainy.png';
    if (desc.includes("nắng")) return '/weather_icons/sunny.png';
    // Mặc định cho 'Trời mây' và các trường hợp khác
    return '/weather_icons/cloudy.png';
};

export default function HourlyForecast({ forecastData, locationName, isLoading }) {
  // Không hiển thị gì nếu không có dữ liệu và không đang tải
  if (!isLoading && (!forecastData || forecastData.length === 0)) {
    return null;
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      width: '100%',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      zIndex: 1003,
      boxShadow: '0 -2px 10px rgba(0,0,0,0.1)',
      borderTop: '1px solid #ddd',
      color: '#333',
      transform: 'translateY(0)',
      transition: 'transform 0.3s ease-in-out',
      overflow: 'hidden' // Ngăn scrollbar dọc không cần thiết
    }}>
      <h5 style={{ margin: '8px 0 5px 15px', fontSize: '14px', fontWeight: 'bold' }}>
        {isLoading ? 'Đang tải dự báo theo giờ...' : `Dự báo theo giờ tại: ${locationName}`}
      </h5>
      <div style={{
        display: 'flex',
        overflowX: 'auto',
        padding: '5px 10px 15px 10px',
        gap: '10px'
      }}>
        {/* Chỉ hiển thị 12 giờ đầu cho gọn */}
        {forecastData.slice(0, 12).map((hour, index) => (
          <div key={index} style={{
            flex: '0 0 85px',
            padding: '10px 5px',
            border: '1px solid #ccc',
            borderRadius: '8px',
            textAlign: 'center',
            backgroundColor: '#f9f9f9',
            fontSize: '12px'
          }}>
            <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>
              {/* Định dạng lại giờ từ chuỗi ISO */}
              {new Date(hour.time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute:'2-digit' })}
            </div>
            <img 
              src={getWeatherIconUrl(hour.condition)} 
              alt={hour.condition}
              style={{ width: '30px', height: '30px', margin: '5px auto' }} 
            />
            <div style={{ marginBottom: '5px' }}>{hour.condition}</div>
            <div style={{ fontSize: '14px', fontWeight: 'bold' }}>{hour.temp}°C</div>
          </div>
        ))}
      </div>
    </div>
  );
}