import React from 'react';
export default function Sidebar({ start, dest, onSelectStart, onNavigate }) {
  const sidebarStyle = {
    position: 'absolute',
    top: '60px',
    left: '10px',
    zIndex: 1001,
    backgroundColor: 'white',
    padding: '10px 15px',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    width: '300px'
  };

  const inputGroupStyle = {
    display: 'flex',
    flexDirection: 'column',
  };

  const labelStyle = {
    fontSize: '12px',
    color: '#555',
    marginBottom: '4px',
    fontWeight: 'bold'
  };

  const pointInfoStyle = {
    padding: '8px 10px',
    border: '1px solid #ccc',
    borderRadius: '4px',
    fontSize: '14px',
    backgroundColor: '#f9f9f9',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    minHeight: '19px'
  };
  
  // Style cho nút hành động chính (Điều hướng)
  const primaryButtonStyle = {
    padding: '10px 12px',
    fontSize: '14px',
    fontWeight: 'bold',
    color: 'white',
    backgroundColor: '#3887be', // Màu xanh dương
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    textAlign: 'center'
  };
  
  // Style cho nút hành động phụ (Chọn điểm xuất phát)
  const secondaryButtonStyle = {
    ...primaryButtonStyle,
    backgroundColor: '#f0f0f0',
    color: '#333',
    border: '1px solid #ccc',
  };

  return (
    <div style={sidebarStyle}>
      {/* Luôn hiển thị điểm đến */}
      <div style={inputGroupStyle}>
        <span style={labelStyle}>Điểm đến</span>
        <div style={pointInfoStyle}>
          {dest ? dest.name : '...'}
        </div>
      </div>

      {/* Hiển thị điểm xuất phát */}
      <div style={inputGroupStyle}>
        <span style={labelStyle}>Điểm xuất phát</span>
        <div style={pointInfoStyle}>
          {start ? start.name : 'Chưa chọn'}
        </div>
      </div>
      
      {/* Các nút hành động */}
      <button style={secondaryButtonStyle} onClick={onSelectStart}>
        Chọn điểm xuất phát
      </button>
      <button style={primaryButtonStyle} onClick={onNavigate}>
        Điều hướng
      </button>
    </div>
  );
}