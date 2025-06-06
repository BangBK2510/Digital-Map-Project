// src/App.js
import React, { useState, useRef, useEffect, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import MapContainer from './components/MapContainer';
import Search from './components/Search';
import Sidebar from './components/Sidebar';
import ResetButton from './components/ResetButton';
import WeatherToggleButton from './components/WeatherToggleButton';

// Hàm debounce đơn giản
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

export default function App() {
  const mapRef = useRef(null);
  const [activeInput, setActiveInput] = useState('dest');
  const [dest, setDest] = useState(null);
  const [start, setStart] = useState(null);
  const [markerDest, setMarkerDest] = useState(null);
  const [markerStart, setMarkerStart] = useState(null);

  // State cho tính năng thời tiết
  const [isWeatherVisible, setIsWeatherVisible] = useState(false);
  const [allProcessedCities, setAllProcessedCities] = useState([]);
  const [citiesForWeather, setCitiesForWeather] = useState([]);
  const [weatherData, setWeatherData] = useState([]);
  const [weatherMarkers, setWeatherMarkers] = useState([]);
  const [isLoadingWeather, setIsLoadingWeather] = useState(false);
  const [currentMapBounds, setCurrentMapBounds] = useState(null);
  const [activePopup, setActivePopup] = useState(null);

  // --- THAY ĐỔI CHÍNH Ở ĐÂY ---
  // Hàm này giờ sẽ nhận toàn bộ thông tin địa điểm và xử lý
  const handleSelect = (selectedPlace) => {
    const map = mapRef.current;
    if (!map || !selectedPlace) {
      console.error("Bản đồ chưa sẵn sàng hoặc không có địa điểm được chọn");
      return;
    }

    const point = [selectedPlace.lon, selectedPlace.lat];

    // 1. Di chuyển bản đồ đến vị trí đã chọn
    map.flyTo({
      center: point,
      zoom: 15,
      essential: true
    });

    // 2. Tạo một marker mới
    const markerColor = activeInput === 'dest' ? '#d9534f' : '#4285F4'; // Màu đỏ cho điểm đến, xanh cho điểm đi
    const newMarker = new maplibregl.Marker({ color: markerColor })
      .setLngLat(point)
      .setPopup(new maplibregl.Popup({ offset: 25 }).setText(selectedPlace.display_name))
      .addTo(map);

    // 3. Cập nhật state của ứng dụng
    const placeInfo = {
      name: selectedPlace.display_name,
      coordinates: point
    };

    if (activeInput === 'dest') {
      if (markerDest) markerDest.remove(); // Xóa marker cũ nếu có
      setDest(placeInfo);
      setMarkerDest(newMarker);
    } else { // activeInput === 'start'
      if (markerStart) markerStart.remove(); // Xóa marker cũ nếu có
      setStart(placeInfo);
      setMarkerStart(newMarker);
    }
  };

  // Các hàm còn lại giữ nguyên...
  useEffect(() => {
    const loadProcessedCityList = async () => {
      try {
        const response = await fetch('/data/processed_city_list_with_coords.json');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        if (data.length > 0 && (typeof data[0].lat === 'undefined' || typeof data[0].lon === 'undefined')) {
            console.warn("Dữ liệu thành phố thiếu thông tin lat/lon.");
        }
        setAllProcessedCities(data);
      } catch (error) {
        console.error("Lỗi khi tải danh sách thành phố đã xử lý:", error);
      }
    };
    loadProcessedCityList();
  }, []);

  const updateCitiesInView = useCallback(() => {
    const map = mapRef.current;
    if (!map || allProcessedCities.length === 0) return;
    const bounds = map.getBounds();
    setCurrentMapBounds(bounds); 
    if (!isWeatherVisible) { 
        if(citiesForWeather.length > 0) setCitiesForWeather([]); 
        return;
    }
    const visibleCities = allProcessedCities.filter(city => {
      if (typeof city.lat !== 'number' || typeof city.lon !== 'number' || isNaN(city.lat) || isNaN(city.lon)) return false;
      return bounds.contains(new maplibregl.LngLat(city.lon, city.lat));
    });
    const MAX_CITIES_TO_FETCH_IN_VIEW = 30;
    const limitedVisibleCities = visibleCities.slice(0, MAX_CITIES_TO_FETCH_IN_VIEW);
    const currentCityIds = citiesForWeather.map(c => c.id).sort().join(',');
    const newCityIds = limitedVisibleCities.map(c => c.id).sort().join(',');
    if (newCityIds !== currentCityIds) {
        setCitiesForWeather(limitedVisibleCities);
    }
  }, [mapRef, allProcessedCities, isWeatherVisible, citiesForWeather]); 

  const debouncedUpdateCitiesInView = useCallback(debounce(updateCitiesInView, 750), [updateCitiesInView]); 

  useEffect(() => {
    const map = mapRef.current;
    if (map) { 
      map.on('moveend', debouncedUpdateCitiesInView);
      map.on('zoomend', debouncedUpdateCitiesInView);
      if(isWeatherVisible && allProcessedCities.length > 0) debouncedUpdateCitiesInView();
      return () => {
        map.off('moveend', debouncedUpdateCitiesInView);
        map.off('zoomend', debouncedUpdateCitiesInView);
      };
    }
  }, [mapRef, debouncedUpdateCitiesInView, isWeatherVisible, allProcessedCities.length]); 

  useEffect(() => {
    if (isWeatherVisible && citiesForWeather.length > 0) fetchWeatherDataForSelectedCities();
    else if (!isWeatherVisible) {
      setWeatherData([]); 
      if (activePopup) {
        activePopup.remove();
        setActivePopup(null);
      }
    }
  }, [citiesForWeather, isWeatherVisible]);

  const drawRoute = async (from, to) => { /* ... giữ nguyên ... */ };

  const fetchWeatherDataForSelectedCities = async () => {
    if (citiesForWeather.length === 0) {
      setWeatherData([]); return;
    }
    setIsLoadingWeather(true);
    const weatherPromises = citiesForWeather.map(async (cityInfo) => {
      try {
        const response = await fetch(`http://localhost:3001/api/weather/${cityInfo.id}`);
        if (!response.ok) { 
            let errorDataMessage = `Lỗi từ backend proxy: ${response.status}`;
            try { const errorJson = await response.json(); errorDataMessage = errorJson.message || errorJson.details || errorDataMessage; } catch (e) { errorDataMessage = response.statusText || errorDataMessage; }
            console.error(`Lỗi proxy cho ${cityInfo.name} (ID: ${cityInfo.id}): ${response.status} - ${errorDataMessage}`);
            return null; 
        }
        const data = await response.json();
        if (data && data.city && typeof data.city.cityLongitude === 'string' && typeof data.city.cityLatitude === 'string' && data.city.forecast?.forecastDay?.length > 0) {
          const forecastDaysData = data.city.forecast.forecastDay.slice(0, 3).map(day => ({
            date: day.forecastDate, weather: day.weather, minTemp: day.minTemp, maxTemp: day.maxTemp, iconCode: day.weatherIcon
          }));
          return { 
            id: data.city.cityId, lon: parseFloat(data.city.cityLongitude), lat: parseFloat(data.city.cityLatitude), name: data.city.cityName,
            forecastDays: forecastDaysData
          };
        }
        return null;
      } catch (error) {
        console.error(`Lỗi fetch thời tiết cho ${cityInfo.name} (ID: ${cityInfo.id}):`, error);
        return null;
      }
    });
    const results = await Promise.all(weatherPromises);
    const validResults = results.filter(r => r !== null);
    setWeatherData(validResults);
    setIsLoadingWeather(false);
  };

  const handleToggleWeather = () => {
    const newVisibility = !isWeatherVisible;
    setIsWeatherVisible(newVisibility); 
    if (newVisibility) updateCitiesInView(); 
    else {
      setCitiesForWeather([]); 
      setWeatherData([]); 
      if (activePopup) {
        activePopup.remove();
        setActivePopup(null);
      }
    }
  };
  
  const getWeatherIconUrl = (weatherDescriptionOrCode) => {
    if (!weatherDescriptionOrCode) return '/weather_icons/default.png';
    const description = String(weatherDescriptionOrCode).toLowerCase();
    if (description.includes("thunderstorm")) return '/weather_icons/thunder_rain.png';
    if (description.includes("drizzle")) return '/weather_icons/drizzle.png';
    if (description.includes("heavy rain")) return '/weather_icons/heavy_rain.png';
    if (description.includes("rain")) return '/weather_icons/rainy.png';
    if (description.includes("snow")) return '/weather_icons/snow.png';
    if (description.includes("mist") || description.includes("fog") || description.includes("haze")) return '/weather_icons/fog.png';
    if (description.includes("overcast")) return '/weather_icons/overcast.png';
    if (description.includes("cloudy")) return '/weather_icons/cloudy.png';
    if (description.includes("partly cloudy")) return '/weather_icons/partly_cloudy.png';
    if (description.includes("clear") || description.includes("sunny")) return '/weather_icons/sunny.png';
    return '/weather_icons/default.png';
  };

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    weatherMarkers.forEach(marker => marker.remove());
    setWeatherMarkers([]);
    if (isWeatherVisible && weatherData.length > 0) {
      const newMarkers = weatherData.map((dataPoint) => {
        if (typeof dataPoint.lat !== 'number' || typeof dataPoint.lon !== 'number' || isNaN(dataPoint.lat) || isNaN(dataPoint.lon) || !dataPoint.forecastDays || dataPoint.forecastDays.length === 0) return null;
        const el = document.createElement('div');
        el.className = 'weather-icon-marker';
        el.style.width = '35px'; 
        el.style.height = '35px';
        el.style.backgroundImage = `url(${getWeatherIconUrl(dataPoint.forecastDays[0].weather)})`; 
        el.style.backgroundSize = 'contain';
        el.style.cursor = 'pointer';
        el.title = `${dataPoint.name}: ${dataPoint.forecastDays[0].weather}, ${dataPoint.forecastDays[0].minTemp}°C - ${dataPoint.forecastDays[0].maxTemp}°C`;
        const clickHandler = (event) => { 
            event.stopPropagation(); 
            if (activePopup) activePopup.remove();
            const today = dataPoint.forecastDays[0];
            const tomorrow = dataPoint.forecastDays[1];
            const dayAfterTomorrow = dataPoint.forecastDays[2];
            if (!today) return;
            let popupHTML = `<div style="font-family: Arial, sans-serif; font-size: 13px; min-width: 300px; padding: 10px 12px; box-sizing: border-box;"><div style="font-size: 12px; color: #555; text-align: center; margin-bottom: 4px;">Dự báo thời tiết tại</div><h4 style="margin: 0 0 10px 0; padding: 0; text-align: center; border-bottom: 1px solid #eee; padding-bottom: 8px; font-size: 16px;">${dataPoint.name}</h4><div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 5px;"><div style="text-align: center; padding: 5px 2px; border: 1px solid #ddd; border-radius: 4px; flex: 1; min-width: 80px; box-sizing: border-box;"><div style="font-weight: bold; margin-bottom: 4px; font-size: 12px;">Hôm nay</div><img src="${getWeatherIconUrl(today.weather)}" alt="${today.weather}" style="width: 30px; height: 30px; margin-bottom: 2px;" /><div style="font-size: 11px; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${today.weather}">${today.weather}</div><div style="font-size: 10px;">Min: ${today.minTemp}°C</div><div style="font-size: 10px;">Max: ${today.maxTemp}°C</div></div>`;
            if (tomorrow) popupHTML += `<div style="text-align: center; padding: 5px 2px; border: 1px solid #ddd; border-radius: 4px; flex: 1; min-width: 80px; box-sizing: border-box;"><div style="font-weight: bold; margin-bottom: 4px; font-size: 12px;">Ngày mai</div><img src="${getWeatherIconUrl(tomorrow.weather)}" alt="${tomorrow.weather}" style="width: 30px; height: 30px; margin-bottom: 2px;" /><div style="font-size: 11px; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${tomorrow.weather}">${tomorrow.weather}</div><div style="font-size: 10px;">Min: ${tomorrow.minTemp}°C</div><div style="font-size: 10px;">Max: ${tomorrow.maxTemp}°C</div></div>`;
            if (dayAfterTomorrow) popupHTML += `<div style="text-align: center; padding: 5px 2px; border: 1px solid #ddd; border-radius: 4px; flex: 1; min-width: 80px; box-sizing: border-box;"><div style="font-weight: bold; margin-bottom: 4px; font-size: 12px;">Ngày kia</div><img src="${getWeatherIconUrl(dayAfterTomorrow.weather)}" alt="${dayAfterTomorrow.weather}" style="width: 30px; height: 30px; margin-bottom: 2px;" /><div style="font-size: 11px; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${dayAfterTomorrow.weather}">${dayAfterTomorrow.weather}</div><div style="font-size: 10px;">Min: ${dayAfterTomorrow.minTemp}°C</div><div style="font-size: 10px;">Max: ${dayAfterTomorrow.maxTemp}°C</div></div>`;
            popupHTML += `</div></div>`;
            const newPopup = new maplibregl.Popup({ closeButton: true, closeOnClick: true, offset: 25 }).setLngLat([dataPoint.lon, dataPoint.lat]).setHTML(popupHTML).addTo(map);
            newPopup.on('close', () => { if (activePopup === newPopup) setActivePopup(null); });
            setActivePopup(newPopup); 
        };
        el.addEventListener('click', clickHandler);
        try {
          return new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([dataPoint.lon, dataPoint.lat]).addTo(map);
        } catch (markerError) {
          console.error(`Lỗi khi tạo marker cho "${dataPoint.name}":`, markerError);
          return null;
        }
      }).filter(marker => marker !== null);
      setWeatherMarkers(newMarkers);
    }
  }, [isWeatherVisible, weatherData, mapRef, activePopup]);

  return (
    <>
      <Search activeInput={activeInput} onSelect={handleSelect}/>
      <MapContainer mapRef={mapRef} />
      <Sidebar dest={dest} start={start} setActiveInput={setActiveInput}
        onNavigateCurrent={() => {
          if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
              ({ coords }) => drawRoute([coords.longitude, coords.latitude], dest),
              (error) => console.error("Lỗi lấy vị trí hiện tại:", error)
            );
          } else {
            console.error("Trình duyệt không hỗ trợ Geolocation.");
          }
        }}
      />
      <ResetButton mapRef={mapRef} setDest={setDest} setStart={setStart} markerDest={markerDest} setMarkerDest={setMarkerDest} markerStart={markerStart} setMarkerStart={setMarkerStart} imageSrc="/data/circular.png" />
      <WeatherToggleButton isWeatherVisible={isWeatherVisible} onToggle={handleToggleWeather} weatherIconSrc="/weather_icons/weather-button-icon.png" />
      {isLoadingWeather && isWeatherVisible && (
        <div style={{ position: 'fixed', bottom: 70, right: 20, backgroundColor: 'rgba(255, 255, 255, 0.9)', padding: '8px 12px', borderRadius: '4px', boxShadow: '0 2px 5px rgba(0,0,0,0.2)', zIndex: 1005, fontSize: '0.9em' }}>
          Đang tải dữ liệu... ({weatherData.length}/{citiesForWeather.length})
        </div>
      )}
    </>
  );
}
