import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

export default function MapContainer({ mapRef }) {

  const mapContainerRef = useRef(null);

  useEffect(() => {
    // Nếu map đã được khởi tạo hoặc div container chưa sẵn sàng thì không làm gì.
    if (mapRef.current || !mapContainerRef.current) {
        return;
    }

    // Khởi tạo bản đồ
    const map = new maplibregl.Map({
      container: mapContainerRef.current, // Gắn vào div bằng ref
      style: '/data/fftmap.json', 
      center: [105.804817, 21.028511], 
      zoom: 12,
    });

    // Gán đối tượng map vừa tạo vào ref được truyền từ component App.
    // Giúp App.js có thể điều khiển bản đồ.
    mapRef.current = map;

    // Thêm các control có sẵn cho bản đồ
    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    const geolocateControl = new maplibregl.GeolocateControl({
      positionOptions: {
        enableHighAccuracy: true,
      },
      trackUserLocation: true,
      showUserLocation: true,
    });
    map.addControl(geolocateControl, 'top-right');

    // Lắng nghe sự kiện để gỡ lỗi hoặc thực hiện hành động
    geolocateControl.on('geolocate', (e) => console.log('Geolocate successful:', e.coords));
    geolocateControl.on('error', (e) => console.error('Geolocate error:', e));

    map.on('load', () => {
      console.log('Map loaded. Triggering geolocate.');
      geolocateControl.trigger();
    });

    // Hàm dọn dẹp khi component bị gỡ bỏ
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [mapRef]); // Effect sẽ chỉ chạy lại nếu prop `mapRef` thay đổi.

  // Component giờ chỉ render ra div để chứa bản đồ.
  return (
    <div
      ref={mapContainerRef}
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 0 // Đảm bảo bản đồ nằm dưới các UI khác
      }}
    />
  );
}
