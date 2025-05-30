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
  // Các state hiện có của bạn
  const [activeInput, setActiveInput] = useState('dest');
  const [dest, setDest] = useState(null);
  const [start, setStart] = useState(null);
  const [markerDest, setMarkerDest] = useState(null);
  const [markerStart, setMarkerStart] = useState(null);

  // State cho tính năng thời tiết
  const [isWeatherVisible, setIsWeatherVisible] = useState(false);
  const [allProcessedCities, setAllProcessedCities] = useState([]); // Phải có {id, name, lat, lon}
  const [citiesForWeather, setCitiesForWeather] = useState([]); // Các thành phố trong khung nhìn hiện tại
  const [weatherData, setWeatherData] = useState([]);
  const [weatherMarkers, setWeatherMarkers] = useState([]);
  const [isLoadingWeather, setIsLoadingWeather] = useState(false);
  const [currentMapBounds, setCurrentMapBounds] = useState(null); // Lưu trữ ranh giới bản đồ hiện tại

  // 1. Tải danh sách tất cả thành phố (bao gồm lat, lon) khi component mount
  useEffect(() => {
    const loadProcessedCityList = async () => {
      try {
        const response = await fetch('/data/processed_city_list_with_coords.json');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        if (data.length > 0 && (typeof data[0].lat === 'undefined' || typeof data[0].lon === 'undefined')) {
            console.warn("Dữ liệu thành phố trong processed_city_list_with_coords.json thiếu thông tin lat/lon. Tính năng thời tiết theo viewport sẽ không hoạt động chính xác.");
        }
        setAllProcessedCities(data);
        console.log("Danh sách tất cả thành phố (với tọa độ) đã xử lý được tải:", data.length, "thành phố");
      } catch (error) {
        console.error("Lỗi khi tải danh sách thành phố đã xử lý:", error);
      }
    };
    loadProcessedCityList();
  }, []);


  // Hàm cập nhật các thành phố cần hiển thị thời tiết dựa trên khung nhìn bản đồ
  const updateCitiesInView = useCallback(() => {
    const map = mapRef.current;
    if (!map || allProcessedCities.length === 0) {
      return;
    }

    const bounds = map.getBounds();
    setCurrentMapBounds(bounds); 

    if (!isWeatherVisible) { 
        if(citiesForWeather.length > 0) setCitiesForWeather([]); 
        return;
    }

    const visibleCities = allProcessedCities.filter(city => {
      if (typeof city.lat !== 'number' || typeof city.lon !== 'number' || isNaN(city.lat) || isNaN(city.lon)) {
          return false;
      }
      const cityLngLat = new maplibregl.LngLat(city.lon, city.lat);
      return bounds.contains(cityLngLat);
    });

    const MAX_CITIES_TO_FETCH_IN_VIEW = 30;
    const limitedVisibleCities = visibleCities.slice(0, MAX_CITIES_TO_FETCH_IN_VIEW);
    
    const currentCityIds = citiesForWeather.map(c => c.id).sort().join(',');
    const newCityIds = limitedVisibleCities.map(c => c.id).sort().join(',');

    if (newCityIds !== currentCityIds) {
        console.log("Cập nhật thành phố trong khung nhìn:", limitedVisibleCities.length, "thành phố.");
        setCitiesForWeather(limitedVisibleCities);
    }
  }, [mapRef, allProcessedCities, isWeatherVisible, citiesForWeather]); 

  const debouncedUpdateCitiesInView = useCallback(debounce(updateCitiesInView, 750), [updateCitiesInView]); 

  // 2. Lắng nghe sự kiện bản đồ để cập nhật thành phố trong khung nhìn
  useEffect(() => {
    const map = mapRef.current;
    if (map) { 
      map.on('moveend', debouncedUpdateCitiesInView);
      map.on('zoomend', debouncedUpdateCitiesInView);
      
      if(isWeatherVisible && allProcessedCities.length > 0){
        debouncedUpdateCitiesInView();
      }

      return () => {
        map.off('moveend', debouncedUpdateCitiesInView);
        map.off('zoomend', debouncedUpdateCitiesInView);
      };
    }
  }, [mapRef, debouncedUpdateCitiesInView, isWeatherVisible, allProcessedCities.length]); 


  // 3. Fetch dữ liệu thời tiết khi `citiesForWeather` thay đổi VÀ `isWeatherVisible` là true
  useEffect(() => {
    if (isWeatherVisible && citiesForWeather.length > 0) {
      fetchWeatherDataForSelectedCities();
    } else if (!isWeatherVisible) {
      setWeatherData([]); 
    }
  }, [citiesForWeather, isWeatherVisible]);


  const handleSelect = (point) => { /* ... giữ nguyên ... */ };
  const drawRoute = async (from, to) => { /* ... giữ nguyên ... */ };

  const fetchWeatherDataForSelectedCities = async () => {
    if (citiesForWeather.length === 0) {
      console.log("Không có thành phố nào trong khung nhìn để lấy dữ liệu thời tiết.");
      setWeatherData([]); 
      return;
    }
    setIsLoadingWeather(true);
    console.log("Đang fetch dữ liệu thời tiết cho:", citiesForWeather.length, "thành phố trong khung nhìn.");
    const weatherPromises = citiesForWeather.map(async (cityInfo) => {
      try {
        const response = await fetch(`http://localhost:3001/api/weather/${cityInfo.id}`);
        if (!response.ok) {
          let errorDataMessage = `Lỗi từ backend proxy: ${response.status}`;
          try { const errorJson = await response.json(); errorDataMessage = errorJson.message || errorJson.details || errorDataMessage; } catch (e) { errorDataMessage = response.statusText || errorDataMessage; }
          console.error(`Backend proxy đã trả về lỗi cho ${cityInfo.name} (ID: ${cityInfo.id}): ${response.status} - ${errorDataMessage}`);
          return null;
        }
        const data = await response.json();
        if (data && data.city && typeof data.city.cityLongitude === 'string' && typeof data.city.cityLatitude === 'string' &&
            data.city.forecast && Array.isArray(data.city.forecast.forecastDay) && data.city.forecast.forecastDay.length > 0) {
          const currentForecast = data.city.forecast.forecastDay[0];
          if (currentForecast && typeof currentForecast.weather === 'string' && typeof currentForecast.minTemp === 'string' && typeof currentForecast.maxTemp === 'string') {
            return { id: data.city.cityId, lon: parseFloat(data.city.cityLongitude), lat: parseFloat(data.city.cityLatitude), name: data.city.cityName, weatherDescription: currentForecast.weather, minTemp: currentForecast.minTemp, maxTemp: currentForecast.maxTemp };
          }
        }
        console.warn(`Dữ liệu thời tiết từ backend không đầy đủ/hợp lệ cho City ID ${cityInfo.id}.`);
        return null;
      } catch (error) {
        console.error(`Lỗi mạng hoặc parse JSON khi fetch thời tiết cho ${cityInfo.name} (ID: ${cityInfo.id}):`, error);
        return null;
      }
    });
    const results = await Promise.all(weatherPromises);
    const validResults = results.filter(r => r !== null);
    setWeatherData(validResults);
    setIsLoadingWeather(false);
    console.log("Dữ liệu thời tiết cuối cùng được cập nhật vào state:", validResults.length, "thành phố");
  };

  const handleToggleWeather = () => {
    const newVisibility = !isWeatherVisible;
    setIsWeatherVisible(newVisibility); 
    if (newVisibility) {
      console.log("Nút thời tiết được BẬT, sẽ cập nhật thành phố trong khung nhìn.");
      updateCitiesInView(); 
    } else {
      console.log("Nút thời tiết được TẮT.");
      setCitiesForWeather([]); 
      setWeatherData([]); 
    }
  };
  

  const getWeatherIconUrl = (weatherDescription) => {
    if (!weatherDescription) return '/weather_icons/default.png';
    const description = weatherDescription.toLowerCase();

    if (description.includes("thunderstorm")) return '/weather_icons/thunderstorm.png';
    if (description.includes("rain") || description.includes("shower")) return '/weather_icons/rainy.png';
    if (description.includes("snow")) return '/weather_icons/snow.png';
    if (description.includes("cloudy") || description.includes("overcast")) return '/weather_icons/cloudy.png';
    if (description.includes("partly cloudy") || description.includes("few clouds") || description.includes("broken clouds") || description.includes("scattered clouds")) return '/weather_icons/partly_cloudy.png';
    if (description.includes("sunny") || description.includes("clear") || description.includes("fine")) return '/weather_icons/sunny.png';
    if (description.includes("fog") || description.includes("mist") || description.includes("haze")) return '/weather_icons/fog.png';
    if (description.includes("hot")) return '/weather_icons/hot.png'; // THÊM ĐIỀU KIỆN CHO "HOT"
    
    console.warn(`Không tìm thấy icon cho mô tả thời tiết: "${weatherDescription}"`);
    return '/weather_icons/default.png';
  };

  // 5. useEffect để hiển thị/ẩn marker thời tiết (HOÀN THIỆN)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    weatherMarkers.forEach(marker => marker.remove());
    setWeatherMarkers([]); 

    if (isWeatherVisible && weatherData.length > 0) {
      console.log(`[Marker Effect] Đang hiển thị ${weatherData.length} icon thời tiết.`);
      const newMarkers = weatherData.map((dataPoint, index) => {

        if (typeof dataPoint.lat !== 'number' || typeof dataPoint.lon !== 'number' || isNaN(dataPoint.lat) || isNaN(dataPoint.lon)) {
            console.warn(`[Marker Effect] Dữ liệu thời tiết cho "${dataPoint.name}" (ID: ${dataPoint.id}) thiếu tọa độ hoặc tọa độ không hợp lệ. Lat: ${dataPoint.lat}, Lon: ${dataPoint.lon}`);
            return null;
        }

        const el = document.createElement('div');
        el.className = 'weather-icon-marker'; 
        const iconUrl = getWeatherIconUrl(dataPoint.weatherDescription);
        
        el.style.width = '35px'; 
        el.style.height = '35px';
        el.style.backgroundImage = `url(${iconUrl})`; 
        el.style.backgroundSize = 'contain'; 
        el.style.backgroundRepeat = 'no-repeat';
        el.style.backgroundPosition = 'center';
        el.style.cursor = 'pointer';
        
        el.title = `${dataPoint.name}: ${dataPoint.weatherDescription}, ${dataPoint.minTemp}°C - ${dataPoint.maxTemp}°C`;
        
        try {
          const markerInstance = new maplibregl.Marker({ 
              element: el, 
              anchor: 'center' 
          })
            .setLngLat([dataPoint.lon, dataPoint.lat])
            .addTo(map);
          return markerInstance;
        } catch (markerError) {
          console.error(`[Marker Effect] Lỗi khi tạo hoặc thêm marker cho "${dataPoint.name}":`, markerError);
          return null;
        }
      }).filter(marker => marker !== null);

      console.log(`[Marker Effect] Số lượng icon thời tiết được tạo: ${newMarkers.length}`);
      setWeatherMarkers(newMarkers);

    } else if (isWeatherVisible && weatherData.length === 0 && !isLoadingWeather) {
        // console.log("[Marker Effect] Thời tiết được bật nhưng không có dữ liệu (weatherData rỗng) và không đang tải.");
    } else if (!isWeatherVisible) {
        // console.log("[Marker Effect] Thời tiết bị tắt, đã dọn dẹp markers.");
    }
  }, [isWeatherVisible, weatherData, mapRef]); 


  return (
    <>
      {/* ... JSX giữ nguyên ... */}
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
          Đang tải dữ liệu thời tiết... ({weatherData.length}/{citiesForWeather.length})
        </div>
      )}
    </>
  );
}
