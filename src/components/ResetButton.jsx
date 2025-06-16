import React from 'react';

export default function ResetButton({ mapRef, setDest, setStart, markerDest, markerStart, setMarkerDest, setMarkerStart, imageSrc, setRouteGeoJSON, setIsRoutingActive }) {
  const handleReset = () => {
    // Xóa marker điểm bắt đầu
    if (markerStart) {
      markerStart.remove();
      setMarkerStart(null);
    }
    setStart(null);
    if (markerDest) {
      markerDest.remove();
      setMarkerDest(null);
    }
    setDest(null);

    // Xóa đường đi trên bản đồ
    const map = mapRef.current;
    if (map && map.getSource('route')) {
      map.getSource('route').setData({ type: 'Feature' });
    }
    setRouteGeoJSON(null);

    // Ẩn thanh Sidebar
    setIsRoutingActive(false);
  };

  return (
    <button
      onClick={handleReset}
      style={{
        position: 'absolute',
        top: 10,
        right: 45,
        zIndex: 4,
        padding: 10,
        border: 'none',
        borderRadius: '4px',
        backgroundColor: 'white',
        boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <img src={imageSrc} style={{ width: 15, height: 15 }} />
    </button>
  );
}