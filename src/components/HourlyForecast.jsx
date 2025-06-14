import React from 'react';

const symbolMap = {
  heavyrain: 'heavy_rain.png',
  rain: 'rainy.png',
  cloudy_day: 'cloudy_day.png',
  cloudy_night: 'cloudy_night.png',
  partlycloudy_day: 'partly_cloudy.png',
  partlycloudy_night: 'partly_cloudy_night.png',
  clearsky_day: 'sunny.png',
  clearsky_night: 'sunny.png',
  default: 'default.png'
};

const getWeatherIconUrl = (symbolCode) => {
  const iconName = symbolMap[symbolCode] || symbolMap['default'];
  return `/weather_icons/${iconName}`;
};

export default function HourlyForecast({ forecastData, locationName, isLoading, dataType }) {
  if (!locationName) {
    return null;
  }

  const renderDataPoint = (item) => {
    switch (dataType) {
      case 'humidity':
        return (
          <div className="data-point">
            <img src="/weather_icons/humidity.png" alt="Độ ẩm" className="data-point-icon" />
            <span>{Math.round(item.relative_humidity)}%</span>
          </div>
        );
      case 'wind':
        return (
          <div className="data-point">
             <img src="/weather_icons/windspeed.png" alt="Sức gió" className="data-point-icon" />
            <span>{Math.round(item.wind_speed)} km/h</span>
          </div>
        );
      case 'weather':
      default:
        // Mặc định hiển thị nhiệt độ
        return <div className="data-point">{item.temperature}°C</div>;
    }
  };

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
      padding: 8px 15px;
      box-sizing: border-box;
      z-index: 1001;
      transition: transform 0.3s ease-in-out;
      transform: translateY(0);
    }

    .location-title {
      margin: 0 0 8px 0;
      font-size: 14px;
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
      height: 5px;
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
      flex: 0 0 85px; /* Tăng chiều rộng thẻ một chút */
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-around; /* Căn đều các phần tử */
      padding: 8px 5px;
      margin-right: 8px;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      background-color: #fcfcfc;
      min-height: 100px; /* Tăng chiều cao thẻ */
    }

    .forecast-card .time {
      font-weight: 500;
      font-size: 13px;
    }

    .forecast-card .weather-icon {
      width: 32px;
      height: 32px;
      margin: 4px 0;
    }
    
    .forecast-card .data-point {
      font-size: 14px;
      font-weight: 500;
      color: #333;
      display: flex;
      align-items: center;
      gap: 4px; /* Khoảng cách giữa icon và text */
    }

    .data-point-icon {
      width: 14px;
      height: 14px;
      opacity: 0.7;
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
              {/* --- Sử dụng hàm renderDataPoint để hiển thị thông tin động --- */}
              {renderDataPoint(item)}
            </div>
          ))}
        </div>
      </div>
    </>
  );
};
