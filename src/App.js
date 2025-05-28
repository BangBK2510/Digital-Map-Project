import React, { useState, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import MapContainer from './components/MapContainer';
import Search from './components/Search';
import Sidebar from './components/Sidebar';
import ResetButton from './components/ResetButton';

export default function App() {
  const mapRef = useRef(null);
  const [activeInput, setActiveInput] = useState('dest');
  const [dest, setDest] = useState(null);
  const [start, setStart] = useState(null);
  const [markerDest, setMarkerDest] = useState(null);
  const [markerStart, setMarkerStart] = useState(null);

  const handleSelect = (point) => {
    const map = mapRef.current;
    map.flyTo({ center: point, zoom: 15 });

    if (activeInput === 'dest') {
      markerDest?.remove();
      const newMarker = new maplibregl.Marker().setLngLat(point).addTo(map);
      setMarkerDest(newMarker);
      setDest(point);
    } else {
      markerStart?.remove();
      const newMarker = new maplibregl.Marker({ color: 'red' }).setLngLat(point).addTo(map);
      setMarkerStart(newMarker);
      setStart(point);
    }

    setActiveInput(activeInput === 'dest' ? 'start' : 'dest');
  };

  const drawRoute = async (from, to) => {
    if (!from || !to) return;
    const map = mapRef.current;
    const url = `https://router.project-osrm.org/route/v1/driving/${from.join(',')};${to.join(',')}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const json = await res.json();
    const route = json.routes[0].geometry;

    if (map.getLayer('route')) map.removeLayer('route');
    if (map.getSource('route')) map.removeSource('route');

    map.addSource('route', { type: 'geojson', data: { type: 'Feature', geometry: route } });
    map.addLayer({
      id: 'route',
      type: 'line',
      source: 'route',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#007cbf', 'line-width': 4 },
    });
  };

  return (
    <>
      <Search
        activeInput={activeInput}
        onSelect={handleSelect}
      />

      <MapContainer mapRef={mapRef} />

      <Sidebar
        dest={dest}
        start={start}
        setActiveInput={setActiveInput}
        onNavigateCurrent={() => navigator.geolocation.getCurrentPosition(({ coords }) => drawRoute([coords.longitude, coords.latitude], dest))}
      />

      <ResetButton
        mapRef={mapRef}
        setDest={setDest}
        setStart={setStart}
        markerDest={markerDest}
        setMarkerDest={setMarkerDest}
        markerStart={markerStart}
        setMarkerStart={setMarkerStart}
        imageSrc="/circular.png"
      />
    </>
  );
}