import React from 'react';

// Component này gần giống với WeatherToggleButton
// nhưng dùng để bật/tắt lớp dữ liệu độ ẩm.
export default function HumidityToggleButton({ isActive, onToggle, humidityIconSrc }) {
  // Vị trí của nút mới sẽ nằm dưới nút thời tiết ---
  const topPosition = '185px'; // 145px (vị trí nút cũ) + 30px (chiều cao nút) + 10px (khoảng cách)

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
        backgroundColor: isActive ? '#e6f7ff' : 'white',
        border: 'none', 
        borderRadius: '4px', 
        boxShadow: '0 0 0 2px rgba(0,0,0,0.1)', 
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background-color 0.2s ease-in-out',
      }}
      title={isActive ? "Ẩn thông tin độ ẩm" : "Hiển thị thông tin độ ẩm"}
      aria-pressed={isActive}
    >
      <img
        src={humidityIconSrc}
        alt="Humidity Toggle"
        style={{
          width: '18px', 
          height: '18px',
          opacity: isActive ? 1 : 0.7,
        }}
      />
    </button>
  );
}