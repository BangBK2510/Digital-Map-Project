import React from 'react';

// Component này dùng để bật/tắt lớp dữ liệu sức gió.
export default function WindToggleButton({ isActive, onToggle, windIconSrc }) {
  // --- Vị trí nằm dưới nút Độ ẩm ---
  const topPosition = '225px'; // 185px (vị trí nút độ ẩm) + 30px (chiều cao nút) + 10px (khoảng cách)

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
      title={isActive ? "Ẩn thông tin sức gió" : "Hiển thị thông tin sức gió"}
      aria-pressed={isActive}
    >
      <img
        src={windIconSrc}
        alt="Wind Toggle"
        style={{
          width: '18px', 
          height: '18px',
          opacity: isActive ? 1 : 0.7,
        }}
      />
    </button>
  );
}