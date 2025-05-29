// src/App.js
import React, { useState, useRef, useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import MapContainer from './components/MapContainer';
import Search from './components/Search';
import Sidebar from './components/Sidebar';
import ResetButton from './components/ResetButton';
import WeatherToggleButton from './components/WeatherToggleButton'; // Component mới

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
  const [allProcessedCities, setAllProcessedCities] = useState([]);
  const [citiesForWeather, setCitiesForWeather] = useState([]);
  const [weatherData, setWeatherData] = useState([]);
  const [weatherMarkers, setWeatherMarkers] = useState([]);
  const [isLoadingWeather, setIsLoadingWeather] = useState(false);

  // 1. Tải danh sách thành phố đã xử lý khi component mount
  useEffect(() => {
    const loadProcessedCityList = async () => {
      try {
        const response = await fetch('/data/processed_city_list.json');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setAllProcessedCities(data);

        const exampleCityIds = ["308", "309", "656", "234"]; // HN, HCM, DN, Singapore
        const selected = data.filter(city => exampleCityIds.includes(city.id)).slice(0, 10);
        setCitiesForWeather(selected);
        console.log("Danh sách thành phố đã xử lý được tải:", data.length, "thành phố");
        console.log("Các thành phố được chọn để hiển thị thời tiết ban đầu:", selected);

      } catch (error) {
        console.error("Lỗi khi tải danh sách thành phố đã xử lý:", error);
      }
    };
    loadProcessedCityList();
  }, []);

  // Các hàm hiện có của bạn
  const handleSelect = (point) => {
    const map = mapRef.current;
    if (!map) return;
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
    if (!map) return;
    const url = `https://router.project-osrm.org/route/v1/driving/${from.join(',')};${to.join(',')}?overview=full&geometries=geojson`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Lỗi OSRM: ${res.status}`);
      const json = await res.json();
      if (json.routes && json.routes.length > 0) {
        const route = json.routes[0].geometry;
        if (map.getLayer('route')) map.removeLayer('route');
        if (map.getSource('route')) map.removeSource('route');
        map.addSource('route', { type: 'geojson', data: { type: 'Feature', geometry: route } });
        map.addLayer({
          id: 'route',
          type: 'line',
          source: 'route',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#007cbf', 'line-width': 5, 'line-opacity': 0.8 },
        });
      } else {
        console.warn("OSRM không tìm thấy lộ trình.");
      }
    } catch (error) {
      console.error("Lỗi khi vẽ lộ trình:", error);
    }
  };

  // --- Các hàm cho tính năng thời tiết ---

  // 2. Hàm fetch dữ liệu thời tiết cho các thành phố trong `citiesForWeather`
  const fetchWeatherDataForSelectedCities = async () => {
    if (citiesForWeather.length === 0) {
      console.log("Không có thành phố nào được chọn để lấy dữ liệu thời tiết.");
      return;
    }

    setIsLoadingWeather(true);
    setWeatherData([]);

    console.log("Đang fetch dữ liệu thời tiết cho:", citiesForWeather.map(c => c.name).join(', '));

    const weatherPromises = citiesForWeather.map(async (cityInfo) => {
      try {
        const response = await fetch(`http://localhost:3001/api/weather/${cityInfo.id}`); 

        if (!response.ok) {
          let errorDataMessage = `Lỗi từ backend proxy: ${response.status}`;
          try {
            const errorJson = await response.json();
            errorDataMessage = errorJson.message || errorJson.details || errorDataMessage;
          } catch (e) {
            errorDataMessage = response.statusText || errorDataMessage;
          }
          console.error(`Backend proxy đã trả về lỗi cho ${cityInfo.name} (ID: ${cityInfo.id}): ${response.status} - ${errorDataMessage}`);
          return null; 
        }

        const data = await response.json();
        // console.log(`[City ID ${cityInfo.id}] Dữ liệu thô từ backend (JSON.stringify):`, JSON.stringify(data, null, 2));

        const cityObject = data ? data.city : undefined;

        if (data && data.city && typeof data.city.cityLongitude === 'string' && typeof data.city.cityLatitude === 'string' &&
            data.city.forecast && 
            Array.isArray(data.city.forecast.forecastDay) && data.city.forecast.forecastDay.length > 0) {
          
          const currentForecast = data.city.forecast.forecastDay[0]; 
          
          if (currentForecast && typeof currentForecast.weather === 'string' &&
              typeof currentForecast.minTemp === 'string' && 
              typeof currentForecast.maxTemp === 'string') {
            return {
              id: data.city.cityId,
              lon: parseFloat(data.city.cityLongitude),
              lat: parseFloat(data.city.cityLatitude),
              name: data.city.cityName,
              weatherDescription: currentForecast.weather,
              minTemp: currentForecast.minTemp,
              maxTemp: currentForecast.maxTemp,
            };
          } else {
            console.warn(`[City ID ${cityInfo.id}] Dữ liệu forecastDay[0] không đầy đủ hoặc kiểu không đúng. currentForecast:`, currentForecast);
            return null;
          }
        } else {
          console.warn(`[City ID ${cityInfo.id}] KHÔNG VÀO khối IF chính. Dữ liệu thời tiết từ backend không có cấu trúc đầy đủ/hợp lệ. Dữ liệu được kiểm tra (biến data):`, data);
          return null;
        }
      } catch (error) { 
        console.error(`[City ID ${cityInfo.id}] Lỗi mạng hoặc lỗi parse JSON khi fetch thời tiết cho ${cityInfo.name}:`, error);
        return null; 
      }
    });

    const results = await Promise.all(weatherPromises);
    const validResults = results.filter(r => r !== null); 
    setWeatherData(validResults);
    setIsLoadingWeather(false);
    console.log("Dữ liệu thời tiết cuối cùng được cập nhật vào state:", validResults);
  };

  // 3. Xử lý khi nhấn nút bật/tắt thời tiết
  const handleToggleWeather = async () => {
    const newVisibility = !isWeatherVisible;
    setIsWeatherVisible(newVisibility);

    if (newVisibility && citiesForWeather.length > 0) {
      await fetchWeatherDataForSelectedCities();
    }
  };

  // 4. Hàm lấy URL icon dựa trên mô tả thời tiết
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
    
    console.warn(`Không tìm thấy icon cho mô tả thời tiết: "${weatherDescription}"`);
    return '/weather_icons/default.png';
  };

  // 5. useEffect để hiển thị/ẩn marker thời tiết (CẬP NHẬT ĐỂ DEBUG ICON)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    weatherMarkers.forEach(marker => marker.remove());
    setWeatherMarkers([]);

    if (isWeatherVisible && weatherData.length > 0) {
      console.log("Đang hiển thị marker thời tiết cho:", weatherData.length, "thành phố");
      const newMarkers = weatherData.map(dataPoint => {
        if (typeof dataPoint.lat !== 'number' || typeof dataPoint.lon !== 'number' || isNaN(dataPoint.lat) || isNaN(dataPoint.lon)) {
            console.warn("Dữ liệu thời tiết thiếu tọa độ hoặc tọa độ không hợp lệ:", dataPoint.name, dataPoint);
            return null;
        }

        const el = document.createElement('div');
        el.className = 'weather-marker'; 
        const iconUrl = getWeatherIconUrl(dataPoint.weatherDescription);
        console.log(`[City ID ${dataPoint.id}] Sử dụng icon URL: ${iconUrl} cho thời tiết: ${dataPoint.weatherDescription}`);

        // Đặt các style cho div để hiển thị icon
        el.style.width = '35px'; 
        el.style.height = '35px';
        el.style.backgroundImage = `url(${iconUrl})`;
        el.style.backgroundSize = 'contain'; 
        el.style.backgroundRepeat = 'no-repeat';
        el.style.backgroundPosition = 'center'; 
        el.style.cursor = 'pointer';
        
        // Thêm border để debug nếu ảnh không hiển thị
        // el.style.border = '1px dashed red'; // Bỏ comment dòng này nếu cần debug xem div có ở đó không

        el.title = `${dataPoint.name}: ${dataPoint.weatherDescription}, ${dataPoint.minTemp}°C - ${dataPoint.maxTemp}°C`;

        return new maplibregl.Marker({
            element: el, // Quan trọng: truyền div tùy chỉnh vào đây
            anchor: 'center' // Tùy chọn: neo marker ở giữa icon
        })
          .setLngLat([dataPoint.lon, dataPoint.lat])
          .addTo(map);
      }).filter(marker => marker !== null);
      setWeatherMarkers(newMarkers);
    } else if (isWeatherVisible && weatherData.length === 0 && !isLoadingWeather) {
        console.log("Thời tiết được bật nhưng không có dữ liệu để hiển thị (và không đang tải).");
    }
  }, [isWeatherVisible, weatherData, mapRef]);


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
      <ResetButton
        mapRef={mapRef}
        setDest={setDest}
        setStart={setStart}
        markerDest={markerDest}
        setMarkerDest={setMarkerDest}
        markerStart={markerStart}
        setMarkerStart={setMarkerStart}
        imageSrc="/data/circular.png"
      />

      <WeatherToggleButton
        isWeatherVisible={isWeatherVisible}
        onToggle={handleToggleWeather}
        weatherIconSrc="/weather_icons/weather-button-icon.png"
      />

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
          Đang tải dữ liệu thời tiết...
        </div>
      )}
    </>
  );
}
