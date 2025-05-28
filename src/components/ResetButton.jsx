import React from 'react';

export default function ResetButton({ mapRef, setDest, setStart, markerDest, markerStart, setMarkerDest, setMarkerStart, imageSrc }) {
  const handleReset = () => {
    const map = mapRef.current;
    if (markerDest) markerDest.remove();
    if (markerStart) markerStart.remove();
    if (map.getLayer('route')) map.removeLayer('route');
    if (map.getSource('route')) map.removeSource('route');
    map.flyTo({ center: [105.804817, 21.028511], zoom: 12 });
    setDest(null);
    setStart(null);
    setMarkerDest(null);
    setMarkerStart(null);
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