import React, { useState, useRef, useEffect, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import MapContainer from './components/MapContainer';
import Search from './components/Search';
import Sidebar from './components/Sidebar';
import WeatherToggleButton from './components/WeatherToggleButton';
import HumidityToggleButton from './components/HumidityToggleButton';
import WindToggleButton from './components/WindToggleButton';
import HourlyForecast from './components/HourlyForecast'; // Import lại component

// --- CÁC HÀM HỖ TRỢ ---
function debounce(func, delay) {
  let timeout;
  return function executedFunction(...args) {
    const context = this;
    const later = () => {
      timeout = null;
      func.apply(context, args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, delay);
  };
}

const getWeatherIconUrl = (symbolCode) => {
    const symbolMap = {
      heavyrain: 'heavy_rain.png', rain: 'rainy.png',
      cloudy_day: 'cloudy_day.png', cloudy_night: 'cloudy_night.png',
      partlycloudy_day: 'partly_cloudy.png', partlycloudy_night: 'partly_cloudy.png',
      clearsky_day: 'sunny.png', clearsky_night: 'clearsky_night.png',
      default: 'default.png'
    };
    const iconName = symbolMap[symbolCode] || symbolMap['default'];
    return `/weather_icons/${iconName}`;
};

// --- CÁC COMPONENT GIAO DIỆN ---
const Notification = ({ message, type }) => {
  if (!message) return null;
  const style = {
    position: 'fixed', bottom: '20px', left: '50%',
    transform: 'translateX(-50%)', padding: '12px 20px',
    borderRadius: '8px', color: 'white',
    backgroundColor: type === 'error' ? '#d9534f' : (type === 'navigating' ? '#5bc0de' : '#3887be'),
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 2000,
    fontSize: '14px', textAlign: 'center', transition: 'opacity 0.3s ease-in-out',
  };
  return <div style={style}>{message}</div>;
};

const ResetButton = () => {
  const handleReset = () => { window.location.reload(); };
  const style = {
    position: 'absolute', top: '10px', right: '45px', zIndex: 1001,
    backgroundColor: 'white', borderRadius: '4px', width: '30px', height: '30px',
    display: 'flex', justifyContent: 'center', alignItems: 'center',
    cursor: 'pointer', boxShadow: '0 0 0 2px rgba(0,0,0,0.1)', border: 'none',
  };
  const imgStyle = { width: '18px', height: '18px' };
  return (
    <button onClick={handleReset} style={style} title="Làm mới ứng dụng">
      <img src="/data/circular.png" alt="Reset" style={imgStyle} />
    </button>
  );
};

// --- COMPONENT APP CHÍNH ---
export default function App() {
  const mapRef = useRef(null);
  const [activeInput, setActiveInput] = useState('dest');
  const [dest, setDest] = useState(null);
  const [start, setStart] = useState(null);
  const [markerDest, setMarkerDest] = useState(null);
  const [markerStart, setMarkerStart] = useState(null);
  const [routeGeoJSON, setRouteGeoJSON] = useState(null);
  const [searchKey, setSearchKey] = useState(0);
  const [notification, setNotification] = useState({ message: '', type: '' });
  const notificationTimeoutRef = useRef(null);
  const [activeLayer, setActiveLayer] = useState('none');
  const [allProcessedCities, setAllProcessedCities] = useState([]);
  const [citiesForWeather, setCitiesForWeather] = useState([]);
  const [weatherData, setWeatherData] = useState([]);
  const [weatherMarkers, setWeatherMarkers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activePopup, setActivePopup] = useState(null);
  const [hourlyForecastData, setHourlyForecastData] = useState([]);
  const [forecastLocationName, setForecastLocationName] = useState('');

  const showNotification = (message, type = 'info', duration = 3000) => {
    if (notificationTimeoutRef.current) clearTimeout(notificationTimeoutRef.current);
    setNotification({ message, type });
    if (type !== 'navigating') {
      notificationTimeoutRef.current = setTimeout(() => {
        setNotification({ message: '', type: '' });
      }, duration);
    }
  };
  
  useEffect(() => {
    return () => { if (notificationTimeoutRef.current) clearTimeout(notificationTimeoutRef.current); };
  }, []);

  const handleSelect = (selectedPlace) => {
    const map = mapRef.current;
    if (!map || !selectedPlace) return;
    const point = [selectedPlace.lon, selectedPlace.lat];
    map.flyTo({ center: point, zoom: 15, essential: true });
    const placeInfo = { name: selectedPlace.display_name, coordinates: point };
    if (activeInput === 'dest') {
      if (markerDest) markerDest.remove();
      const newMarker = new maplibregl.Marker({ color: '#d9534f' }).setLngLat(point).setPopup(new maplibregl.Popup({ offset: 25 }).setText(placeInfo.name)).addTo(map);
      setDest(placeInfo); setMarkerDest(newMarker);
    } else if (activeInput === 'start') {
      if (markerStart) markerStart.remove();
      const newMarker = new maplibregl.Marker({ color: '#4285F4' }).setLngLat(point).setPopup(new maplibregl.Popup({ offset: 25 }).setText(placeInfo.name)).addTo(map);
      setStart(placeInfo); setMarkerStart(newMarker);
    }
    setActiveInput('none');
  };

  const handleSelectStart = () => {
    if (markerStart) { markerStart.remove(); setMarkerStart(null); }
    setStart(null); setRouteGeoJSON(null);
    setSearchKey(prevKey => prevKey + 1);
    setActiveInput('start');
  };

  const handleNavigate = async () => {
    if (!start) { showNotification('Vui lòng chọn điểm xuất phát', 'error'); return; }
    if (!dest) { showNotification('Vui lòng chọn điểm đến', 'error'); return; }
    showNotification('Đang điều hướng...', 'navigating');
    const startCoords = start.coordinates; const endCoords = dest.coordinates;
    try {
        const response = await fetch(`http://localhost:3001/api/route?startLon=${startCoords[0]}&startLat=${startCoords[1]}&endLon=${endCoords[0]}&endLat=${endCoords[1]}`);
        if (!response.ok) { const err = await response.json(); throw new Error(err.message || 'Không thể tìm đường đi.'); }
        const routeData = await response.json();
        setRouteGeoJSON(routeData);
        setNotification({ message: '', type: ''}); 
    } catch (error) {
        console.error("Lỗi khi lấy dữ liệu chỉ đường:", error);
        showNotification(error.message, 'error');
    }
  };

  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    const addOrUpdateRoute = () => {
      const source = map.getSource('route');
      if (source) { source.setData(routeGeoJSON || { type: 'FeatureCollection', features: [] });
      } else {
        map.addSource('route', { type: 'geojson', data: routeGeoJSON || { type: 'FeatureCollection', features: [] } });
        map.addLayer({ id: 'route-layer', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#3887be', 'line-width': 5, 'line-opacity': 0.75 } });
      }
    };
    if (map.isStyleLoaded()) { addOrUpdateRoute(); } else { map.once('load', addOrUpdateRoute); }
  }, [routeGeoJSON]);

  useEffect(() => {
    const loadProvincesFromServer = async () => {
      try {
        const response = await fetch('http://localhost:5001/api/provinces');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json(); setAllProcessedCities(data);
      } catch (error) { console.error("Lỗi khi tải danh sách tỉnh thành từ server AI:", error); }
    };
    loadProvincesFromServer();
  }, []);

  const updateCitiesInView = useCallback(() => {
    const map = mapRef.current;
    if (!map || activeLayer === 'none' || allProcessedCities.length === 0) {
      setCitiesForWeather([]);
      return;
    }
    const bounds = map.getBounds();
    const visibleCities = allProcessedCities.filter(city => 
      bounds.contains(new maplibregl.LngLat(city.lon, city.lat))
    );
    const MAX_CITIES = 20; 
    const limitedVisibleCities = visibleCities.slice(0, MAX_CITIES);
    
    setCitiesForWeather(prevCities => {
      if (JSON.stringify(limitedVisibleCities) !== JSON.stringify(prevCities)) {
        return limitedVisibleCities;
      }
      return prevCities;
    });
  }, [mapRef, allProcessedCities, activeLayer]);

  const debouncedUpdateCitiesInView = useCallback(debounce(updateCitiesInView, 750), [updateCitiesInView]);

  useEffect(() => {
    const map = mapRef.current;
    if(map) {
      map.on('moveend', debouncedUpdateCitiesInView);
      map.on('zoomend', debouncedUpdateCitiesInView);
      return () => {
        map.off('moveend', debouncedUpdateCitiesInView);
        map.off('zoomend', debouncedUpdateCitiesInView);
      };
    }
  }, [mapRef, debouncedUpdateCitiesInView]);
  
  // **FIX**: Bổ sung lại hàm fetchAiForecasts
  const fetchAiForecasts = async (citiesToFetch) => {
    if (citiesToFetch.length === 0) { setWeatherData([]); return; }
    setIsLoading(true);
    const forecastPromises = citiesToFetch.map(async (city) => {
      try {
        const response = await fetch(`http://localhost:5001/api/predict?lat=${city.lat}&lon=${city.lon}`);
        if (!response.ok) return null;
        const data = await response.json();
        return { ...data, lat: city.lat, lon: city.lon };
      } catch (error) { return null; }
    });
    const results = await Promise.all(forecastPromises);
    setWeatherData(results.filter(r => r));
    setIsLoading(false);
  };

  useEffect(() => {
    if (activeLayer !== 'none') { fetchAiForecasts(citiesForWeather); } else { setWeatherData([]); }
  }, [citiesForWeather, activeLayer]);
  
  const handleToggleWeather = () => { setActiveLayer(prev => prev === 'weather' ? 'none' : 'weather'); };
  const handleToggleHumidity = () => { setActiveLayer(prev => prev === 'humidity' ? 'none' : 'humidity'); };
  const handleToggleWind = () => { setActiveLayer(prev => prev === 'wind' ? 'none' : 'wind'); };
  
  useEffect(() => {
    weatherMarkers.forEach(marker => { if(marker) marker.remove() });
    setWeatherMarkers([]);
    if(activePopup) activePopup.remove();
    setActivePopup(null);
    setHourlyForecastData([]); setForecastLocationName('');
    if (activeLayer !== 'none') { 
      updateCitiesInView(); 
    } else { 
      setWeatherData([]); 
    }
  }, [activeLayer, updateCitiesInView]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || activeLayer === 'none' || weatherData.length === 0) return;
    
    weatherMarkers.forEach(marker => { if(marker) marker.remove() });
    const newMarkers = weatherData.map((dataPoint) => {
      if (!dataPoint || !dataPoint.daily || dataPoint.daily.length === 0) return null;
      const el = document.createElement('div');
      
      if (activeLayer === 'weather') {
        el.className = 'weather-icon-marker';
        el.style.backgroundImage = `url(${getWeatherIconUrl(dataPoint.daily[0].symbol_url)})`;
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          if (activePopup) activePopup.remove();
          setHourlyForecastData(dataPoint.hourly || []);
          setForecastLocationName(dataPoint.province);
          
          let popupHTML = `<div style="font-family: Arial, sans-serif; font-size: 14px; min-width: 320px; padding: 10px 12px; box-sizing: border-box;"><h4 style="margin: 0 0 10px 0; padding: 0; text-align: center; border-bottom: 1px solid #eee; padding-bottom: 8px; font-size: 16px;">${dataPoint.province}</h4><div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 5px;">`;
          dataPoint.daily.forEach((day, index) => {
            let dayName = index === 0 ? "Hôm nay" : (index === 1 ? "Ngày mai" : "Ngày kia");
            popupHTML += `<div style="text-align: center; padding: 5px; border: 1px solid #ddd; border-radius: 4px; flex: 1; min-width: 90px; box-sizing: border-box;">
              <div style="font-weight: bold; margin-bottom: 4px; font-size: 12px;">${dayName}</div>
              <img src="${getWeatherIconUrl(day.symbol_url)}" alt="${day.most_common_cloud}" style="width: 35px; height: 35px; margin-bottom: 2px;" />
              <div style="font-size: 12px; font-weight: bold; margin-bottom: 2px;">${day.temp_min}°C / ${day.temp_max}°C</div>
              <div style="font-size: 11px; color: #555;">${day.most_common_cloud}</div>
              <div style="font-size: 11px; color: #007bff;">Mưa: ${day.max_rain_prob}%</div>
            </div>`;
          });
          popupHTML += `</div><div style="font-size:11px; color:#888; text-align:center; margin-top:8px;">(Dự báo chi tiết theo giờ ở cuối màn hình)</div></div>`;
          
          const newPopup = new maplibregl.Popup({ closeButton: true, closeOnClick: true, offset: 25 }).setLngLat([dataPoint.lon, dataPoint.lat]).setHTML(popupHTML).addTo(map);
          newPopup.on('close', () => { setHourlyForecastData([]); setForecastLocationName(''); });
          setActivePopup(newPopup);
        });
      }
      else if (activeLayer === 'humidity') {
        el.className = 'humidity-marker';
        el.innerHTML = `<img src="/weather_icons/humidity.png" alt="Độ ẩm" style="width: 14px; height: 14px; margin-right: 4px;"/><span>${Math.round(dataPoint.daily[0].avg_humidity)}%</span>`;
        el.addEventListener('click', (e) => { e.stopPropagation(); if (activePopup) activePopup.remove(); setHourlyForecastData(dataPoint.hourly || []); setForecastLocationName(dataPoint.province); });
      }
      else if (activeLayer === 'wind') {
        el.className = 'wind-marker';
        el.innerHTML = `<img src="/weather_icons/windspeed.png" alt="Sức gió" style="width: 14px; height: 14px; margin-right: 4px;"/><span>${Math.round(dataPoint.daily[0].avg_wind_speed)} km/h</span>`;
        el.addEventListener('click', (e) => { e.stopPropagation(); if (activePopup) activePopup.remove(); setHourlyForecastData(dataPoint.hourly || []); setForecastLocationName(dataPoint.province); });
      }

      if(el.className){
        return new maplibregl.Marker({ element: el }).setLngLat([dataPoint.lon, dataPoint.lat]).addTo(map);
      }
      return null;
    }).filter(Boolean);
    setWeatherMarkers(newMarkers);
  }, [weatherData, activeLayer]);

  const markerStyles = `
    .weather-icon-marker { width: 35px; height: 35px; background-size: contain; cursor: pointer; transition: transform 0.2s; }
    .weather-icon-marker:hover { transform: scale(1.2); }
    .humidity-marker { display: flex; justify-content: center; align-items: center; padding: 5px 8px; background-color: rgba(230, 247, 255, 0.9); border: 1px solid #91d5ff; border-radius: 15px; font-size: 12px; font-weight: bold; color: #0050b3; cursor: pointer; box-shadow: 0 1px 3px rgba(0,0,0,0.15); transition: transform 0.2s, background-color 0.2s; white-space: nowrap; }
    .humidity-marker:hover { transform: scale(1.1); background-color: #e6f7ff; }
    .wind-marker { display: flex; justify-content: center; align-items: center; padding: 5px 8px; background-color: rgb(253, 253, 253); border: 1px solid rgb(185, 185, 185); border-radius: 15px; font-size: 12px; font-weight: bold; color: rgb(32, 34, 36); cursor: pointer; box-shadow: 0 1px 3px rgba(0,0,0,0.15); transition: transform 0.2s, background-color 0.2s; white-space: nowrap; }
    .wind-marker:hover { transform: scale(1.1); background-color: #e6f7ff; }
  `;

  return (
    <>
      <style>{markerStyles}</style>
      {activeInput !== 'none' && ( <Search key={searchKey} activeInput={activeInput} onSelect={handleSelect}/> )}
      <MapContainer mapRef={mapRef} />
      {dest && ( <Sidebar dest={dest} start={start} onSelectStart={handleSelectStart} onNavigate={handleNavigate} /> )}
      <Notification message={notification.message} type={notification.type} />
      <ResetButton />
      <div className="layer-toggles">
        <WeatherToggleButton isActive={activeLayer === 'weather'} onToggle={handleToggleWeather} weatherIconSrc="/weather_icons/weather-button-icon.png" />
        <HumidityToggleButton isActive={activeLayer === 'humidity'} onToggle={handleToggleHumidity} humidityIconSrc="/weather_icons/humidity-button-icon.png" />
        <WindToggleButton isActive={activeLayer === 'wind'} onToggle={handleToggleWind} windIconSrc="/weather_icons/windspeed-button-icon.png" />
      </div>
      {isLoading && activeLayer !== 'none' && ( <Notification message="Đang tải dữ liệu AI..." /> )}
      <HourlyForecast 
        forecastData={hourlyForecastData} 
        locationName={forecastLocationName}
        dataType={activeLayer} 
      />
    </>
  );
}
