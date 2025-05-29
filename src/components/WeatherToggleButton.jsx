import React from 'react';

export default function WeatherToggleButton({ isWeatherVisible, onToggle, weatherIconSrc }) {
  const topPosition = '145px'; 

  return (
    <button
      onClick={onToggle}
      style={{
        position: 'absolute',
        top: topPosition, 
        right: '10px',    
        zIndex: 1001,     
        width: '30px',    
        height: '30px',
        padding: '0',     
        backgroundColor: isWeatherVisible ? '#e6f7ff' : 'white',
        border: 'none', 
        borderRadius: '4px', 
        boxShadow: '0 0 0 2px rgba(0,0,0,0.1)', 
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background-color 0.2s ease-in-out',
      }}
      title={isWeatherVisible ? "Ẩn thông tin thời tiết" : "Hiển thị thông tin thời tiết"}
      aria-pressed={isWeatherVisible}
    >
      <img
        src={weatherIconSrc}
        alt="Weather Toggle"
        style={{
          width: '18px', 
          height: '18px',
          opacity: isWeatherVisible ? 1 : 0.7,
        }}
      />
    </button>
  );
}
