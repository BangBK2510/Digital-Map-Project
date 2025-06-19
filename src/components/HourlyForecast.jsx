import React from 'react';

// Hàm hỗ trợ để lấy URL của biểu tượng thời tiết
const getWeatherIconUrl = (symbolCode) => {
    const symbolMap = {
      heavyrain: 'heavy_rain.png', rain: 'rainy.png',
      cloudy_day: 'cloudy_day.png', cloudy_night: 'cloudy_night.png',
      partlycloudy_day: 'partly_cloudy.png', partlycloudy_night: 'partly_cloudy.png',
      clearsky_day: 'sunny.png', clearsky_night: 'clearsky_night.png',
      default: 'default.png'
    };
    const iconName = symbolMap[symbolCode] || symbolMap['default'];
    return `/weather_icons/${iconName}`;
};

export default function HourlyForecast({ forecastData, locationName, dataType }) {
  if (!forecastData || forecastData.length === 0) return null;

  // Các style chung
  const containerStyle = {
    position: 'fixed', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    backdropFilter: 'blur(5px)',
    boxShadow: '0 -2px 10px rgba(0,0,0,0.1)',
    zIndex: 1500,
    padding: '10px',
    overflowX: 'auto',
    whiteSpace: 'nowrap',
    borderTop: '1px solid #ddd'
  };

  const itemStyle = {
    display: 'inline-block',
    textAlign: 'center',
    padding: '10px',
    margin: '0 5px',
    minWidth: '85px',
    border: '1px solid #ccc',
    borderRadius: '8px',
    backgroundColor: 'rgba(249, 249, 249, 0.8)'
  };
  
  const titleStyle = { margin: '0 0 10px 10px', color: '#333' };

  // --- Render dựa trên dataType ---
  
  // Giao diện cho ĐỘ ẨM
  if (dataType === 'humidity') {
    return (
      <div style={containerStyle}>
        <h4 style={titleStyle}>Dự báo Độ ẩm (%) theo giờ cho {locationName}</h4>
        {forecastData.map((item, index) => (
          <div key={index} style={itemStyle}>
            <div style={{ fontWeight: 'bold' }}>{item.time}</div>
            <img src="/weather_icons/humidity.png" alt="Độ ẩm" style={{ width: '40px', height: '40px' }} />
            <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{item.relative_humidity}%</div>
          </div>
        ))}
      </div>
    );
  }
  
  // Giao diện cho SỨC GIÓ
  if (dataType === 'wind') {
    return (
      <div style={containerStyle}>
        <h4 style={titleStyle}>Dự báo Sức gió (km/h) theo giờ cho {locationName}</h4>
        {forecastData.map((item, index) => (
          <div key={index} style={itemStyle}>
            <div style={{ fontWeight: 'bold' }}>{item.time}</div>
            <img src="/weather_icons/windspeed.png" alt="Sức gió" style={{ width: '40px', height: '40px' }} />
            <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{item.wind_speed}</div>
             <div style={{ fontSize: '12px', color: '#555' }}>km/h</div>
          </div>
        ))}
      </div>
    );
  }

  // Giao diện mặc định (THỜI TIẾT TỔNG HỢP)
  return (
    <div style={containerStyle}>
      <h4 style={titleStyle}>Dự báo theo giờ cho {locationName}</h4>
      {forecastData.map((item, index) => (
        <div key={index} style={itemStyle}>
          <div style={{ fontWeight: 'bold' }}>{item.time}</div>
          <img src={getWeatherIconUrl(item.symbol_url)} alt={item.cloud_condition} style={{ width: '40px', height: '40px' }} />
          <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{item.temperature}°C</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: '#007bff', marginTop: '2px' }}>
            <img src="/weather_icons/rain_prob.png" alt="" style={{ width: '12px', height: '12px', marginRight: '4px' }} />
            <span>{item.rain_probability}%</span>
          </div>
          <div style={{ fontSize: '12px', color: '#555' }}>{item.cloud_condition}</div>
        </div>
      ))}
    </div>
  );
};
