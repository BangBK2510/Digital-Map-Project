import React, { useState, useRef, useEffect, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import MapContainer from './components/MapContainer';
import Search from './components/Search';
import Sidebar from './components/Sidebar';
import ResetButton from './components/ResetButton';
import WeatherToggleButton from './components/WeatherToggleButton';
import HourlyForecast from './components/HourlyForecast';

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

// Hàm chuyển đổi mã biểu tượng từ server AI sang URL ảnh
const getWeatherIconUrl = (symbolCode) => {
    const symbolMap = {
      heavyrain: 'heavy_rain.png',
      rain: 'rainy.png',
      cloudy: 'cloudy.png',
      partlycloudy_day: 'partly_cloudy.png',
      partlycloudy_night: 'partly_cloudy.png',
      clearsky_day: 'sunny.png',
      clearsky_night: 'sunny.png', 
      default: 'default.png'
    };
    const iconName = symbolMap[symbolCode] || symbolMap['default'];
    return `/weather_icons/${iconName}`;
};


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

  // State cho dự báo hàng giờ
  const [hourlyForecastData, setHourlyForecastData] = useState([]);
  const [forecastLocationName, setForecastLocationName] = useState('');
  const [isLoadingHourly, setIsLoadingHourly] = useState(false); 

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

  // --- THAY ĐỔI: Tải danh sách tỉnh/thành phố từ server AI ---
  useEffect(() => {
    const loadProvincesFromServer = async () => {
      try {
        const response = await fetch('http://localhost:5001/api/provinces');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        // Dữ liệu trả về đã có dạng [{ name, lat, lon }, ...]
        setAllProcessedCities(data);
      } catch (error) {
        console.error("Lỗi khi tải danh sách tỉnh thành từ server AI:", error);
      }
    };
    loadProvincesFromServer();
  }, []);

  // Hàm cập nhật các tỉnh trong khung nhìn
  const updateCitiesInView = useCallback(() => {
    const map = mapRef.current;
    if (!map || !isWeatherVisible || allProcessedCities.length === 0) {
      setCitiesForWeather([]);
      return;
    }
    
    const bounds = map.getBounds();
    const visibleCities = allProcessedCities.filter(city => {
      if (typeof city.lat !== 'number' || typeof city.lon !== 'number') return false;
      return bounds.contains(new maplibregl.LngLat(city.lon, city.lat));
    });

    // Giới hạn số lượng thành phố để tránh quá tải API
    const MAX_CITIES = 20; 
    const limitedVisibleCities = visibleCities.slice(0, MAX_CITIES);
    
    // Chỉ cập nhật state nếu danh sách thành phố thay đổi
    if (JSON.stringify(limitedVisibleCities) !== JSON.stringify(citiesForWeather)) {
      setCitiesForWeather(limitedVisibleCities);
    }
  }, [mapRef, allProcessedCities, isWeatherVisible, citiesForWeather]);
  
  const debouncedUpdateCitiesInView = useCallback(debounce(updateCitiesInView, 1000), [updateCitiesInView]);

  useEffect(() => {
    const map = mapRef.current;
    if (map) {
      map.on('moveend', debouncedUpdateCitiesInView);
      map.on('zoomend', debouncedUpdateCitiesInView);
      return () => {
        map.off('moveend', debouncedUpdateCitiesInView);
        map.off('zoomend', debouncedUpdateCitiesInView);
      };
    }
  }, [mapRef, debouncedUpdateCitiesInView]);
  
  // Hàm lấy dữ liệu dự báo từ server AI cho các tỉnh trong khung nhìn
  const fetchAiForecasts = async (citiesToFetch) => {
    if (citiesToFetch.length === 0) {
      setWeatherData([]); // Xóa dữ liệu cũ nếu không có tỉnh nào trong view
      return;
    }
    
    setIsLoadingWeather(true);
    const forecastPromises = citiesToFetch.map(async (city) => {
      try {
        const response = await fetch(`http://localhost:5001/api/predict?lat=${city.lat}&lon=${city.lon}`);
        if (!response.ok) {
          console.error(`Lỗi API cho ${city.name}: Server trả về ${response.status}`);
          return null;
        }
        const data = await response.json();
        return { ...data, lat: city.lat, lon: city.lon };
      } catch (error) {
        console.error(`Lỗi fetch cho ${city.name}:`, error);
        return null;
      }
    });
    
    const results = await Promise.all(forecastPromises);
    setWeatherData(results.filter(r => r !== null && r.daily && r.hourly));
    setIsLoadingWeather(false);
  };
  
  // Trigger việc lấy dữ liệu khi danh sách `citiesForWeather` thay đổi
  useEffect(() => {
    if (isWeatherVisible) {
      fetchAiForecasts(citiesForWeather);
    } else {
      setWeatherData([]);
    }
  }, [citiesForWeather, isWeatherVisible]);


  // Xử lý khi bật/tắt lớp thời tiết
  const handleToggleWeather = () => {
    const newVisibility = !isWeatherVisible;
    setIsWeatherVisible(newVisibility);

    if (newVisibility) {
      // Khi bật, ngay lập tức cập nhật các tỉnh trong view
      updateCitiesInView();
    } else {
      // Khi tắt, dọn dẹp tất cả
      setCitiesForWeather([]);
      setWeatherData([]);
      setHourlyForecastData([]);
      setForecastLocationName('');
      if (activePopup) activePopup.remove();
      setActivePopup(null);
    }
  };
  
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    
    weatherMarkers.forEach(marker => marker.remove());
    setWeatherMarkers([]);

    if (isWeatherVisible && weatherData.length > 0) {
      const newMarkers = weatherData.map((dataPoint) => {
        if (!dataPoint || !dataPoint.daily || dataPoint.daily.length === 0) return null;
        
        const el = document.createElement('div');
        el.className = 'weather-icon-marker';
        el.style.width = '35px';
        el.style.height = '35px';
        el.style.backgroundImage = `url(${getWeatherIconUrl(dataPoint.daily[0].symbol_url)})`;
        el.style.backgroundSize = 'contain';
        el.style.cursor = 'pointer';

        const clickHandler = (event) => {
            event.stopPropagation();
            if (activePopup) activePopup.remove();

            setHourlyForecastData(dataPoint.hourly || []);
            setForecastLocationName(dataPoint.province);

            let popupHTML = `<div style="font-family: Arial, sans-serif; font-size: 13px; min-width: 300px; padding: 10px 12px; box-sizing: border-box;"><div style="font-size: 12px; color: #555; text-align: center; margin-bottom: 4px;">Dự báo thời tiết tại</div><h4 style="margin: 0 0 10px 0; padding: 0; text-align: center; border-bottom: 1px solid #eee; padding-bottom: 8px; font-size: 16px;">${dataPoint.province}</h4><div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 5px;">`;

            dataPoint.daily.forEach((day, index) => {
                let dayName = day.date;
                if (index === 0) dayName = "Hôm nay";
                if (index === 1) dayName = "Ngày mai";
                // --- SỬA LỖI: Thêm điều kiện cho ngày kia ---
                if (index === 2) dayName = "Ngày kia";
                
                popupHTML += `<div style="text-align: center; padding: 5px 2px; border: 1px solid #ddd; border-radius: 4px; flex: 1; min-width: 80px; box-sizing: border-box;">
                                <div style="font-weight: bold; margin-bottom: 4px; font-size: 12px;">${dayName}</div>
                                <img src="${getWeatherIconUrl(day.symbol_url)}" alt="${day.symbol_url}" style="width: 30px; height: 30px; margin-bottom: 2px;" />
                                <div style="font-size: 11px; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${day.symbol_url}">${day.symbol_url}</div>
                                <div style="font-size: 10px;">Min: ${day.temp_min}°C</div>
                                <div style="font-size: 10px;">Max: ${day.temp_max}°C</div>
                              </div>`;
            });
            
            popupHTML += `</div><div style="font-size:11px; color:#888; text-align:center; margin-top:8px;">(Dự báo chi tiết theo giờ ở cuối màn hình)</div></div>`;

            const newPopup = new maplibregl.Popup({ closeButton: true, closeOnClick: true, offset: 25 })
                .setLngLat([dataPoint.lon, dataPoint.lat])
                .setHTML(popupHTML)
                .addTo(map);
            
            newPopup.on('close', () => {
                if (activePopup === newPopup) setActivePopup(null);
                setHourlyForecastData([]);
                setForecastLocationName('');
            });
            setActivePopup(newPopup);
        };
        el.addEventListener('click', clickHandler);
        
        try {
          return new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([dataPoint.lon, dataPoint.lat]).addTo(map);
        } catch (markerError) {
          console.error(`Lỗi tạo marker cho "${dataPoint.province}":`, markerError);
          return null;
        }
      }).filter(marker => marker !== null);
      setWeatherMarkers(newMarkers);
    }
  }, [isWeatherVisible, weatherData]);

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
        <div style={{ position: 'fixed', bottom: '150px', right: '20px', backgroundColor: 'white', padding: '10px', borderRadius: '5px', boxShadow: '0 2px 5px rgba(0,0,0,0.2)'}}>
          Đang tải dữ liệu dự đoán... ({weatherData.length}/{citiesForWeather.length})
        </div>
      )}

      <HourlyForecast 
        forecastData={hourlyForecastData} 
        locationName={forecastLocationName}
        isLoading={isLoadingHourly}
      />
    </>
  );
}