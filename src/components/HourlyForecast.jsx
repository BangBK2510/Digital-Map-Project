import React from 'react';

<<<<<<< HEAD
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
=======
const symbolMap = {
  heavyrain: 'heavy_rain.png',
  rain: 'rainy.png',
  cloudy: 'cloudy.png',
  partlycloudy_day: 'partly_cloudy.png',
  partlycloudy_night: 'partly_cloudy.png',
  clearsky_day: 'sunny.png',
  clearsky_night: 'sunny.png',
  default: 'default.png'
};

const getWeatherIconUrl = (symbolCode) => {
  const iconName = symbolMap[symbolCode] || symbolMap['default'];
  return `/weather_icons/${iconName}`;
};

const HourlyForecast = ({ forecastData, locationName, isLoading }) => {
  if (!locationName) {
    return null;
  }

  // CSS được nhúng trực tiếp để dễ quản lý và thu nhỏ component
  const styles = `
    .hourly-forecast-container {
      position: fixed;
      bottom: 0;
      left: 0;
      width: 100%;
      background-color: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      border-top: 1px solid #ddd;
      box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.1);
      padding: 8px 15px; /* Chiều cao nhỏ hơn */
      box-sizing: border-box;
      z-index: 1001;
      transition: transform 0.3s ease-in-out;
      transform: translateY(0);
    }

    .location-title {
      margin: 0 0 8px 0;
      font-size: 14px; /* Chữ nhỏ hơn */
      color: #333;
      text-align: center;
      font-weight: 500;
    }

    .scroll-container {
      display: flex;
      flex-direction: row;
      overflow-x: auto;
      overflow-y: hidden;
      padding-bottom: 10px;
      -webkit-overflow-scrolling: touch;
    }

    .scroll-container::-webkit-scrollbar {
      height: 5px; /* Thanh cuộn mỏng hơn */
    }

    .scroll-container::-webkit-scrollbar-track {
      background: #f1f1f1;
      border-radius: 2px;
    }

    .scroll-container::-webkit-scrollbar-thumb {
      background: #aaa;
      border-radius: 2px;
    }

    .scroll-container::-webkit-scrollbar-thumb:hover {
      background: #888;
    }

    .forecast-card {
      flex: 0 0 75px; /* Thẻ nhỏ hơn */
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 8px 5px;
      margin-right: 8px;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      background-color: #fcfcfc;
      min-height: 90px; /* Chiều cao thẻ nhỏ hơn */
    }

    .forecast-card .time {
      font-weight: 500;
      font-size: 13px;
    }

    .forecast-card .weather-icon {
      width: 32px; /* Icon nhỏ hơn */
      height: 32px;
      margin: 4px 0;
    }

    .forecast-card .temperature {
      font-size: 14px;
      font-weight: 500;
      color: #333;
    }
    
    .loading-text {
      width: 100%;
      text-align: center;
      font-size: 14px;
      color: #666;
      padding: 25px 0;
    }
  `;

  return (
    <>
      <style>{styles}</style>
      <div className="hourly-forecast-container">
        <h3 className="location-title">{locationName}</h3>
        <div className="scroll-container">
          {isLoading && <div className="loading-text">Đang tải...</div>}
          
          {!isLoading && forecastData.length === 0 && locationName && !locationName.startsWith('Lỗi') && (
            <div className="loading-text">Không có dữ liệu.</div>
          )}

          {!isLoading && forecastData.map((item, index) => (
            <div key={index} className="forecast-card">
              <div className="time">{item.time}</div>
              <img 
                src={getWeatherIconUrl(item.symbol_url)} 
                alt={item.symbol_url} 
                className="weather-icon"
              />
              <div className="temperature">{item.temperature}°C</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

export default HourlyForecast;
>>>>>>> master
