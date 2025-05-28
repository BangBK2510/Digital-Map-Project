import React, { useEffect, useRef }
from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

export default function MapContainer({ mapRef: parentMapRef }) {

  const internalMapRef = useRef(null);
  const mapInstance = parentMapRef || internalMapRef; // Ưu tiên parentMapRef nếu được cung cấp

  useEffect(() => {
    // Chỉ khởi tạo map một lần
    if (mapInstance.current) {
      return;
    }
    // Kiểm tra xem container đã sẵn sàng chưa
    const mapContainer = document.getElementById('map');
    if (!mapContainer) {
      console.error("Map container 'map' not found in the DOM.");
      return;
    }
    // Khởi tạo bản đồ
    const map = new maplibregl.Map({
      container: 'map', // ID của div chứa bản đồ
      style: '/data/fftmap.json', // Đường dẫn đến file style 
      center: [105.804817, 21.028511], // Tọa độ trung tâm ban đầu - Hà Nội
      zoom: 12, // Mức zoom ban đầu
    });
    mapInstance.current = map; // Gán instance bản đồ vào ref

    // Thêm NavigationControl (zoom, rotate)
    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    // Khởi tạo GeolocateControl
    const geolocateControl = new maplibregl.GeolocateControl({
      positionOptions: {
        enableHighAccuracy: true, 
      },
      trackUserLocation: true, 
      showUserLocation: true, 
      showAccuracyCircle: true, 
      fitBoundsOptions: {
        maxZoom: 15, 
      },
    });

    // Thêm GeolocateControl vào bản đồ
    map.addControl(geolocateControl, 'top-right');

    // Lắng nghe các sự kiện từ GeolocateControl để gỡ lỗi
    geolocateControl.on('geolocate', (e) => {
      console.log('Geolocate successful:', e.coords);
      // e.coords.latitude, e.coords.longitude
      // e.coords.accuracy
      // e.timestamp
    });

    geolocateControl.on('error', (e) => {
      console.error('Geolocate error:', e);
      // e.code can be:
      // 1: PERMISSION_DENIED
      // 2: POSITION_UNAVAILABLE
      // 3: TIMEOUT
      // e.message provides more details
      // Hiển thị thông báo cho người dùng nếu cần
      if (e.code === 1) {
        alert('Bạn đã từ chối quyền truy cập vị trí. Vui lòng cho phép để sử dụng tính năng này.');
      } else {
        alert(`Không thể lấy vị trí của bạn: ${e.message}`);
      }
    });

    geolocateControl.on('outofmaxbounds', (e) => {
      console.warn('Geolocate outofmaxbounds:', e);
    });

    geolocateControl.on('trackuserlocationstart', () => {
      console.log('Track user location started.');
    });

    geolocateControl.on('trackuserlocationend', () => {
      console.log('Track user location ended.');
    });
    // Tự động kích hoạt GeolocateControl khi bản đồ đã tải xong
    map.on('load', () => {
      console.log('Map loaded. Triggering geolocate.');
      geolocateControl.trigger(); // Yêu cầu lấy vị trí người dùng
    });

    // Cleanup function khi component unmount
    return () => {
      // Xóa map instance để giải phóng tài nguyên
      // và tránh lỗi khi component được render lại (ví dụ trong React StrictMode)
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null; // Đặt lại ref
        console.log('Map instance removed.');
      }
    };
  }, [mapInstance]); // Dependency array, chỉ chạy lại effect nếu mapInstance (ref container) thay đổi

  // Div container cho bản đồ
  return (
    <div
      id="map"
      style={{
        position: 'absolute', // Hoặc 'relative' tùy theo layout cha
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        width: '100vw', // Hoặc '100%' nếu container cha có kích thước xác định
        height: '100vh',// Hoặc '100%'
      }}
    />
  );
}