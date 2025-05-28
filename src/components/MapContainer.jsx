import React, { useEffect } from 'react';
import maplibregl from 'maplibre-gl';

export default function MapContainer({ mapRef }) {
  useEffect(() => {
    if (mapRef.current) return;
    const map = new maplibregl.Map({ container: 'map', style: '/data/fftmap.json', center: [105.804817, 21.028511], zoom: 12 });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl());
    const geoCtl = new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true, showUserLocation: true });
    map.addControl(geoCtl);
    map.on('load', () => geoCtl.trigger());
  }, [mapRef]);

  return <div id="map" style={{ width: '100vw', height: '100vh', position: 'absolute' }} />;
}