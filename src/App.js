// src/App.js
import React, { useState, useRef, useEffect, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import MapContainer from './components/MapContainer';
import Search from './components/Search';
import Sidebar from './components/Sidebar';
import ResetButton from './components/ResetButton';
import WeatherToggleButton from './components/WeatherToggleButton';
// --- IMPORT COMPONENT MỚI ---
import HourlyForecast from './components/HourlyForecast';

// Hàm debounce đơn giản (giữ nguyên)
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
  const [activePopup, setActivePopup] = useState(null);

  // --- STATE MỚI CHO DỰ BÁO HÀNG GIỜ ---
  const [hourlyForecastData, setHourlyForecastData] = useState([]);
  const [forecastLocationName, setForecastLocationName] = useState('');
  const [isLoadingHourly, setIsLoadingHourly] = useState(false);


  // Hàm handleSelect (giữ nguyên)
  const handleSelect = (selectedPlace) => {
    const map = mapRef.current;
    if (!map || !selectedPlace) {
      console.error("Bản đồ chưa sẵn sàng hoặc không có địa điểm được chọn");
      return;
    }
    const point = [selectedPlace.lon, selectedPlace.lat];
    map.flyTo({ center: point, zoom: 15, essential: true });
    const markerColor = activeInput === 'dest' ? '#d9534f' : '#4285F4';
    const newMarker = new maplibregl.Marker({ color: markerColor })
      .setLngLat(point)
      .setPopup(new maplibregl.Popup({ offset: 25 }).setText(selectedPlace.display_name))
      .addTo(map);
    const placeInfo = { name: selectedPlace.display_name, coordinates: point };
    if (activeInput === 'dest') {
      if (markerDest) markerDest.remove();
      setDest(placeInfo);
      setMarkerDest(newMarker);
    } else {
      if (markerStart) markerStart.remove();
      setStart(placeInfo);
      setMarkerStart(newMarker);
    }
  };

  // Các hàm và useEffect khác giữ nguyên...
  useEffect(() => {
    const loadProcessedCityList = async () => {
      try {
        const response = await fetch('/data/processed_city_list_with_coords.json');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        setAllProcessedCities(data);
      } catch (error) {
        console.error("Lỗi khi tải danh sách thành phố:", error);
      }
    };
    loadProcessedCityList();
  }, []);

  const updateCitiesInView = useCallback(() => {
    const map = mapRef.current;
    if (!map || allProcessedCities.length === 0) return;
    const bounds = map.getBounds();
    if (!isWeatherVisible) {
      if (citiesForWeather.length > 0) setCitiesForWeather([]);
      return;
    }
    const visibleCities = allProcessedCities.filter(city => {
      if (typeof city.lat !== 'number' || typeof city.lon !== 'number') return false;
      return bounds.contains(new maplibregl.LngLat(city.lon, city.lat));
    });
    const MAX_CITIES = 30;
    const limitedVisibleCities = visibleCities.slice(0, MAX_CITIES);
    if (JSON.stringify(limitedVisibleCities) !== JSON.stringify(citiesForWeather)) {
      setCitiesForWeather(limitedVisibleCities);
    }
  }, [mapRef, allProcessedCities, isWeatherVisible, citiesForWeather]);

  const debouncedUpdateCitiesInView = useCallback(debounce(updateCitiesInView, 750), [updateCitiesInView]);

  useEffect(() => {
    const map = mapRef.current;
    if (map) {
      map.on('moveend', debouncedUpdateCitiesInView);
      map.on('zoomend', debouncedUpdateCitiesInView);
      if (isWeatherVisible) debouncedUpdateCitiesInView();
      return () => {
        map.off('moveend', debouncedUpdateCitiesInView);
        map.off('zoomend', debouncedUpdateCitiesInView);
      };
    }
  }, [mapRef, debouncedUpdateCitiesInView, isWeatherVisible]);

  useEffect(() => {
    if (isWeatherVisible && citiesForWeather.length > 0) {
      fetchWeatherDataForSelectedCities();
    } else if (!isWeatherVisible) {
      setWeatherData([]);
      if (activePopup) activePopup.remove();
    }
  }, [citiesForWeather, isWeatherVisible]);

  const fetchWeatherDataForSelectedCities = async () => {
    // ... Giữ nguyên nội dung hàm này
    if (citiesForWeather.length === 0) {
      setWeatherData([]); return;
    }
    setIsLoadingWeather(true);
    const weatherPromises = citiesForWeather.map(async (cityInfo) => {
      try {
        const response = await fetch(`http://localhost:3001/api/weather/${cityInfo.id}`);
        if (!response.ok) { throw new Error(`Proxy error for ${cityInfo.name}`); }
        const data = await response.json();
        if (data && data.city && data.city.forecast?.forecastDay?.length > 0) {
          const forecastDaysData = data.city.forecast.forecastDay.slice(0, 3).map(day => ({
            date: day.forecastDate, weather: day.weather, minTemp: day.minTemp, maxTemp: day.maxTemp
          }));
          return {
            id: data.city.cityId, lon: parseFloat(data.city.cityLongitude), lat: parseFloat(data.city.cityLatitude), name: data.city.cityName,
            forecastDays: forecastDaysData
          };
        }
        return null;
      } catch (error) {
        console.error(`Lỗi fetch thời tiết cho ${cityInfo.name}:`, error);
        return null;
      }
    });
    const results = await Promise.all(weatherPromises);
    setWeatherData(results.filter(r => r !== null));
    setIsLoadingWeather(false);
  };
  
  // --- HÀM MỚI ĐỂ LẤY DỰ BÁO HÀNG GIỜ TỪ SERVER.PY ---
  const fetchHourlyForecast = async (lat, lon, locationName) => {
    setIsLoadingHourly(true);
    setForecastLocationName(`Đang tải cho ${locationName}...`);
    setHourlyForecastData([]); // Xóa dữ liệu cũ
    try {
      // API này chạy trên server.py ở port 5001
      const response = await fetch(`http://localhost:5001/api/predict_weather?lat=${lat}&lon=${lon}`);
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Lỗi không xác định từ server AI');
      }
      const data = await response.json();
      setHourlyForecastData(data.forecast || []);
      setForecastLocationName(data.city_name || locationName); // Ưu tiên tên từ API
    } catch (error) {
      console.error("Lỗi khi lấy dự báo hàng giờ:", error);
      setForecastLocationName(`Lỗi: ${error.message}`);
      setHourlyForecastData([]);
    } finally {
      setIsLoadingHourly(false);
    }
  };


  const handleToggleWeather = () => {
    // ... Giữ nguyên logic, nhưng thêm reset cho dự báo hàng giờ
    const newVisibility = !isWeatherVisible;
    setIsWeatherVisible(newVisibility);
    if (newVisibility) {
      updateCitiesInView();
    } else {
      setCitiesForWeather([]);
      setWeatherData([]);
      setHourlyForecastData([]); // Reset khi tắt lớp thời tiết
      setForecastLocationName('');
      if (activePopup) activePopup.remove();
    }
  };
  
  const getWeatherIconUrl = (weatherDescription) => {
    // ... Giữ nguyên hàm này
    if (!weatherDescription) return '/weather_icons/default.png';
    const description = String(weatherDescription).toLowerCase();
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
  
  // --- CẬP NHẬT `useEffect` ĐỂ VẼ MARKER VÀ XỬ LÝ CLICK ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    
    // Xóa các marker thời tiết cũ
    weatherMarkers.forEach(marker => marker.remove());
    setWeatherMarkers([]);

    // Nếu không hiển thị lớp thời tiết, xóa luôn thanh dự báo hàng giờ
    if (!isWeatherVisible) {
        setHourlyForecastData([]);
        setForecastLocationName('');
    }

    if (isWeatherVisible && weatherData.length > 0) {
      const newMarkers = weatherData.map((dataPoint) => {
        if (!dataPoint || typeof dataPoint.lat !== 'number' || typeof dataPoint.lon !== 'number' || !dataPoint.forecastDays || dataPoint.forecastDays.length === 0) return null;
        
        const el = document.createElement('div');
        el.className = 'weather-icon-marker';
        el.style.width = '35px';
        el.style.height = '35px';
        el.style.backgroundImage = `url(${getWeatherIconUrl(dataPoint.forecastDays[0].weather)})`;
        el.style.backgroundSize = 'contain';
        el.style.cursor = 'pointer';

        // --- CẬP NHẬT CLICK HANDLER ---
        const clickHandler = (event) => {
            event.stopPropagation();
            if (activePopup) activePopup.remove();

            // 1. Lấy dữ liệu dự báo hàng giờ từ server.py
            fetchHourlyForecast(dataPoint.lat, dataPoint.lon, dataPoint.name);

            // 2. Tạo popup với dự báo 3 ngày (như cũ)
            const today = dataPoint.forecastDays[0];
            const tomorrow = dataPoint.forecastDays[1];
            const dayAfter = dataPoint.forecastDays[2];
            
            let popupHTML = `<div style="font-family: Arial, sans-serif; min-width: 280px;">...</div>`; // Giữ nguyên HTML của bạn
            // (Copy lại toàn bộ chuỗi popupHTML từ file gốc của bạn vào đây)
            popupHTML = `<div style="font-family: Arial, sans-serif; font-size: 13px; min-width: 300px; padding: 10px 12px; box-sizing: border-box;"><div style="font-size: 12px; color: #555; text-align: center; margin-bottom: 4px;">Dự báo thời tiết tại</div><h4 style="margin: 0 0 10px 0; padding: 0; text-align: center; border-bottom: 1px solid #eee; padding-bottom: 8px; font-size: 16px;">${dataPoint.name}</h4><div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 5px;"><div style="text-align: center; padding: 5px 2px; border: 1px solid #ddd; border-radius: 4px; flex: 1; min-width: 80px; box-sizing: border-box;"><div style="font-weight: bold; margin-bottom: 4px; font-size: 12px;">Hôm nay</div><img src="${getWeatherIconUrl(today.weather)}" alt="${today.weather}" style="width: 30px; height: 30px; margin-bottom: 2px;" /><div style="font-size: 11px; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${today.weather}">${today.weather}</div><div style="font-size: 10px;">Min: ${today.minTemp}°C</div><div style="font-size: 10px;">Max: ${today.maxTemp}°C</div></div>`;
            if (tomorrow) popupHTML += `<div style="text-align: center; padding: 5px 2px; border: 1px solid #ddd; border-radius: 4px; flex: 1; min-width: 80px; box-sizing: border-box;"><div style="font-weight: bold; margin-bottom: 4px; font-size: 12px;">Ngày mai</div><img src="${getWeatherIconUrl(tomorrow.weather)}" alt="${tomorrow.weather}" style="width: 30px; height: 30px; margin-bottom: 2px;" /><div style="font-size: 11px; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${tomorrow.weather}">${tomorrow.weather}</div><div style="font-size: 10px;">Min: ${tomorrow.minTemp}°C</div><div style="font-size: 10px;">Max: ${tomorrow.maxTemp}°C</div></div>`;
            if (dayAfter) popupHTML += `<div style="text-align: center; padding: 5px 2px; border: 1px solid #ddd; border-radius: 4px; flex: 1; min-width: 80px; box-sizing: border-box;"><div style="font-weight: bold; margin-bottom: 4px; font-size: 12px;">Ngày kia</div><img src="${getWeatherIconUrl(dayAfter.weather)}" alt="${dayAfter.weather}" style="width: 30px; height: 30px; margin-bottom: 2px;" /><div style="font-size: 11px; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${dayAfter.weather}">${dayAfter.weather}</div><div style="font-size: 10px;">Min: ${dayAfter.minTemp}°C</div><div style="font-size: 10px;">Max: ${dayAfter.maxTemp}°C</div></div>`;
            popupHTML += `</div><div style="font-size:11px; color:#888; text-align:center; margin-top:8px;">(Dự báo chi tiết theo giờ ở cuối màn hình)</div></div>`;


            const newPopup = new maplibregl.Popup({ closeButton: true, closeOnClick: true, offset: 25 })
                .setLngLat([dataPoint.lon, dataPoint.lat])
                .setHTML(popupHTML)
                .addTo(map);
            
            newPopup.on('close', () => {
                if (activePopup === newPopup) setActivePopup(null);
                // Khi popup đóng, xóa dự báo hàng giờ
                setHourlyForecastData([]);
                setForecastLocationName('');
            });
            setActivePopup(newPopup);
        };
        el.addEventListener('click', clickHandler);
        
        try {
          return new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([dataPoint.lon, dataPoint.lat]).addTo(map);
        } catch (markerError) {
          console.error(`Lỗi tạo marker cho "${dataPoint.name}":`, markerError);
          return null;
        }
      }).filter(marker => marker !== null);
      setWeatherMarkers(newMarkers);
    }
  }, [isWeatherVisible, weatherData, mapRef, activePopup]); // Giữ nguyên dependencies

  return (
    <>
      <Search activeInput={activeInput} onSelect={handleSelect}/>
      <MapContainer mapRef={mapRef} />
      <Sidebar dest={dest} start={start} setActiveInput={setActiveInput}
        onNavigateCurrent={() => { /* ... */ }}
      />
      <ResetButton mapRef={mapRef} setDest={setDest} setStart={setStart} markerDest={markerDest} setMarkerDest={setMarkerDest} markerStart={markerStart} setMarkerStart={setMarkerStart} imageSrc="/data/circular.png" />
      <WeatherToggleButton isWeatherVisible={isWeatherVisible} onToggle={handleToggleWeather} weatherIconSrc="/weather_icons/weather-button-icon.png" />
      
      {isLoadingWeather && isWeatherVisible && (
        <div style={{ position: 'fixed', bottom: 70, right: 20, /* ... */ }}>
          Đang tải dữ liệu... ({weatherData.length}/{citiesForWeather.length})
        </div>
      )}

      {/* --- RENDER COMPONENT DỰ BÁO HÀNG GIỜ --- */}
      <HourlyForecast 
        forecastData={hourlyForecastData} 
        locationName={forecastLocationName}
        isLoading={isLoadingHourly}
      />
    </>
  );
}