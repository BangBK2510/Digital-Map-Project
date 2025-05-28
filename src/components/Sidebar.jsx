import React from 'react';

export default function Sidebar({ dest, start, setActiveInput, onNavigateCurrent }) {
  if (!dest) return null;
  return (
    <div style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', background: 'white', padding: 10, zIndex: 3 }}>
      <button onClick={() => setActiveInput('start')}>Chọn điểm xuất phát</button>
      <button onClick={onNavigateCurrent}>Điều hướng từ vị trí hiện tại</button>
    </div>
  );
}