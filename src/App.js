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
  const [activePopup, setActivePopup] = useState(null); 

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
      if (activePopup) {
        activePopup.remove();
        setActivePopup(null);
      }
    }
  }, [citiesForWeather, isWeatherVisible]);


  const handleSelect = (point) => { /* ... giữ nguyên ... */ };
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
            console.error(`Backend proxy đã trả về lỗi cho ${cityInfo.name} (ID: ${cityInfo.id}): ${response.status} - ${errorDataMessage}`);
            return null; 
        }
        const data = await response.json();
        if (data && data.city && typeof data.city.cityLongitude === 'string' && typeof data.city.cityLatitude === 'string' &&
            data.city.forecast && Array.isArray(data.city.forecast.forecastDay) && data.city.forecast.forecastDay.length > 0) {
          const forecastDaysData = data.city.forecast.forecastDay.slice(0, 3).map(day => ({
            date: day.forecastDate, weather: day.weather, minTemp: day.minTemp, maxTemp: day.maxTemp, iconCode: day.weatherIcon
          }));
          return { 
            id: data.city.cityId, lon: parseFloat(data.city.cityLongitude), lat: parseFloat(data.city.cityLatitude), name: data.city.cityName,
            forecastDays: forecastDaysData
          };
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
  };

  const handleToggleWeather = () => {
    const newVisibility = !isWeatherVisible;
    setIsWeatherVisible(newVisibility); 
    if (newVisibility) {
      updateCitiesInView(); 
    } else {
      setCitiesForWeather([]); 
      setWeatherData([]); 
      if (activePopup) {
        activePopup.remove();
        setActivePopup(null);
      }
    }
  };
  
  const getWeatherIconUrl = (weatherDescriptionOrCode, isCode = false) => {
    // ... (giữ nguyên logic getWeatherIconUrl)
    if (!weatherDescriptionOrCode) return '/weather_icons/default.png';
    const description = String(weatherDescriptionOrCode).toLowerCase();
    if (description.includes("thunderstorm")) return '/weather_icons/thunderstorm.png';
    if (description.includes("rain") || description.includes("shower")) return '/weather_icons/rainy.png';
    if (description.includes("snow")) return '/weather_icons/snow.png';
    if (description.includes("cloudy") || description.includes("overcast")) return '/weather_icons/cloudy.png';
    if (description.includes("partly cloudy") || description.includes("few clouds") || description.includes("broken clouds") || description.includes("scattered clouds")) return '/weather_icons/partly_cloudy.png';
    if (description.includes("sunny") || description.includes("clear") || description.includes("fine")) return '/weather_icons/sunny.png';
    if (description.includes("fog") || description.includes("mist") || description.includes("haze")) return '/weather_icons/fog.png';
    if (description.includes("hot")) return '/weather_icons/hot.png';
    console.warn(`Không tìm thấy icon cho mô tả/code thời tiết: "${weatherDescriptionOrCode}"`);
    return '/weather_icons/default.png';
  };

  // 5. useEffect để hiển thị/ẩn marker thời tiết (TINH CHỈNH STYLE POPUP - LAN 4)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    weatherMarkers.forEach(marker => marker.remove());
    setWeatherMarkers([]);
    
    if (isWeatherVisible && weatherData.length > 0) {
      const newMarkers = weatherData.map((dataPoint) => {
        if (typeof dataPoint.lat !== 'number' || typeof dataPoint.lon !== 'number' || isNaN(dataPoint.lat) || isNaN(dataPoint.lon) || !dataPoint.forecastDays || dataPoint.forecastDays.length === 0) {
            console.warn(`Dữ liệu không hợp lệ để tạo marker cho "${dataPoint.name}"`);
            return null;
        }

        const el = document.createElement('div');
        el.className = 'weather-icon-marker';
        const mainIconUrl = getWeatherIconUrl(dataPoint.forecastDays[0].weather);
        
        el.style.width = '35px'; 
        el.style.height = '35px';
        el.style.backgroundImage = `url(${mainIconUrl})`; 
        el.style.backgroundSize = 'contain'; 
        el.style.backgroundRepeat = 'no-repeat';
        el.style.backgroundPosition = 'center';
        el.style.cursor = 'pointer';
        el.title = `${dataPoint.name}: ${dataPoint.forecastDays[0].weather}, ${dataPoint.forecastDays[0].minTemp}°C - ${dataPoint.forecastDays[0].maxTemp}°C`;
        
        const clickHandler = (event) => { 
            event.stopPropagation(); 

            if (activePopup) {
                activePopup.remove();
            }

            const today = dataPoint.forecastDays[0];
            const tomorrow = dataPoint.forecastDays[1];
            const dayAfterTomorrow = dataPoint.forecastDays[2];

            if (!today) {
                console.error(`[POPUP DEBUG] Missing 'today' forecast data for "${dataPoint.name}"`);
                return;
            }

            // TINH CHỈNH HTML VÀ STYLE CHO POPUP - LAN 4
            // Giảm min-width của từng cột một chút, tăng padding của div chính một chút
            let popupHTML = `
                <div style="font-family: Arial, sans-serif; font-size: 13px; min-width: 300px; /* Giữ nguyên hoặc giảm nhẹ */ padding: 10px 12px; box-sizing: border-box;">
                    <div style="font-size: 12px; color: #555; text-align: center; margin-bottom: 4px;">Dự báo thời tiết tại</div>
                    <h4 style="margin: 0 0 10px 0; padding: 0; text-align: center; border-bottom: 1px solid #eee; padding-bottom: 8px; font-size: 16px;">${dataPoint.name}</h4>
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 5px; /* Giảm gap */">
                        <div style="text-align: center; padding: 5px 2px; /* Giảm padding cột */ border: 1px solid #ddd; border-radius: 4px; flex: 1; min-width: 80px; /* Giảm min-width cột */ box-sizing: border-box;">
                            <div style="font-weight: bold; margin-bottom: 4px; font-size: 12px;">Hôm nay</div>
                            <img src="${getWeatherIconUrl(today.weather)}" alt="${today.weather}" style="width: 30px; height: 30px; margin-bottom: 2px;" />
                            <div style="font-size: 11px; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${today.weather}">${today.weather}</div>
                            <div style="font-size: 10px;">Min: ${today.minTemp}°C</div>
                            <div style="font-size: 10px;">Max: ${today.maxTemp}°C</div>
                        </div>`;
            
            if (tomorrow) {
                popupHTML += `
                        <div style="text-align: center; padding: 5px 2px; border: 1px solid #ddd; border-radius: 4px; flex: 1; min-width: 80px; box-sizing: border-box;">
                            <div style="font-weight: bold; margin-bottom: 4px; font-size: 12px;">Ngày mai</div>
                            <img src="${getWeatherIconUrl(tomorrow.weather)}" alt="${tomorrow.weather}" style="width: 30px; height: 30px; margin-bottom: 2px;" />
                            <div style="font-size: 11px; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${tomorrow.weather}">${tomorrow.weather}</div>
                            <div style="font-size: 10px;">Min: ${tomorrow.minTemp}°C</div>
                            <div style="font-size: 10px;">Max: ${tomorrow.maxTemp}°C</div>
                        </div>`;
            }

            if (dayAfterTomorrow) {
                 popupHTML += `
                        <div style="text-align: center; padding: 5px 2px; border: 1px solid #ddd; border-radius: 4px; flex: 1; min-width: 80px; box-sizing: border-box;">
                            <div style="font-weight: bold; margin-bottom: 4px; font-size: 12px;">Ngày kia</div>
                            <img src="${getWeatherIconUrl(dayAfterTomorrow.weather)}" alt="${dayAfterTomorrow.weather}" style="width: 30px; height: 30px; margin-bottom: 2px;" />
                            <div style="font-size: 11px; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${dayAfterTomorrow.weather}">${dayAfterTomorrow.weather}</div>
                            <div style="font-size: 10px;">Min: ${dayAfterTomorrow.minTemp}°C</div>
                            <div style="font-size: 10px;">Max: ${dayAfterTomorrow.maxTemp}°C</div>
                        </div>`;
            }
            popupHTML += `</div></div>`;
            
            try {
                const newPopup = new maplibregl.Popup({ closeButton: true, closeOnClick: true, offset: 25 })
                    .setLngLat([dataPoint.lon, dataPoint.lat])
                    .setHTML(popupHTML)
                    .addTo(map);
                
                newPopup.on('close', () => { 
                    if (activePopup === newPopup) { 
                        setActivePopup(null);
                    }
                });
                setActivePopup(newPopup); 
            } catch (popupError) {
                console.error(`[POPUP DEBUG] Error creating or adding popup for "${dataPoint.name}":`, popupError);
            }
        };

        el.addEventListener('click', clickHandler);
        
        try {
          const markerInstance = new maplibregl.Marker({ element: el, anchor: 'center' })
            .setLngLat([dataPoint.lon, dataPoint.lat])
            .addTo(map);
          return markerInstance;
        } catch (markerError) {
          console.error(`[Marker Effect] Lỗi khi tạo hoặc thêm marker cho "${dataPoint.name}":`, markerError);
          return null;
        }
      }).filter(marker => marker !== null);
      setWeatherMarkers(newMarkers);
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
        <div style={{
          position: 'fixed',
          bottom: 70,
          right: 20,
          backgroundColor: 'rgba(255, 255, 255, 0.9)',
          padding: '8px 12px',
          borderRadius: '4px',
          boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
          zIndex: 1005,
          fontSize: '0.9em'
        }}>
          Đang tải dữ liệu thời tiết... ({weatherData.length}/{citiesForWeather.length})
        </div>
      )}
    </>
  );
}
