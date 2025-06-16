import React from 'react';

export default function Sidebar({ start, dest, setActiveInput, onNavigateCurrent, onNavigateFromAnotherStart }) {
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
    gap: '10px',
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
    cursor: 'pointer',
    backgroundColor: '#f9f9f9',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  };
  
  const buttonStyle = {
    padding: '8px 12px',
    fontSize: '13px',
    fontWeight: 'bold',
    color: '#333',
    backgroundColor: '#f0f0f0',
    border: '1px solid #ccc',
    borderRadius: '6px',
    cursor: 'pointer',
    textAlign: 'center'
  };

  return (
    <div style={sidebarStyle}>
      <div style={inputGroupStyle}>
        <span style={labelStyle}>Điểm xuất phát</span>
        <div style={pointInfoStyle} onClick={() => setActiveInput('start')}>
          {start ? start.name : 'Chọn điểm xuất phát...'}
        </div>
      </div>
      <div style={inputGroupStyle}>
        <span style={labelStyle}>Điểm đến</span>
        <div style={pointInfoStyle} onClick={() => setActiveInput('dest')}>
          {dest ? dest.name : 'Chọn điểm đến...'}
        </div>
      </div>
      <button style={buttonStyle} onClick={onNavigateCurrent}>
        Dùng vị trí hiện tại của tôi
      </button>
      <button style={buttonStyle} onClick={onNavigateFromAnotherStart}>
        Điều hướng tại điểm xuất phát khác
      </button>
    </div>
  );
}