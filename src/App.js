import React, { useState, useRef, useEffect, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import MapContainer from './components/MapContainer';
import Search from './components/Search';
import Sidebar from './components/Sidebar';
import ResetButton from './components/ResetButton';
import WeatherToggleButton from './components/WeatherToggleButton';
import HumidityToggleButton from './components/HumidityToggleButton';
import WindToggleButton from './components/WindToggleButton';
import HourlyForecast from './components/HourlyForecast';

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
      heavyrain: 'heavy_rain.png',
      rain: 'rainy.png',
      cloudy_day: 'cloudy_day.png',
      cloudy_night: 'cloudy_night.png',
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

  const [activeLayer, setActiveLayer] = useState('none'); 
  
  const [allProcessedCities, setAllProcessedCities] = useState([]);
  const [citiesForWeather, setCitiesForWeather] = useState([]); 
  const [weatherData, setWeatherData] = useState([]);
  const [weatherMarkers, setWeatherMarkers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activePopup, setActivePopup] = useState(null);

  const [hourlyForecastData, setHourlyForecastData] = useState([]);
  const [forecastLocationName, setForecastLocationName] = useState('');

  const handleSelect = (selectedPlace) => {
    const map = mapRef.current;
    if (!map || !selectedPlace) return;
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

  useEffect(() => {
    const loadProvincesFromServer = async () => {
      try {
        const response = await fetch('http://localhost:5001/api/provinces');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        setAllProcessedCities(data);
      } catch (error) {
        console.error("Lỗi khi tải danh sách tỉnh thành từ server AI:", error);
      }
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
    if (JSON.stringify(limitedVisibleCities) !== JSON.stringify(citiesForWeather)) {
      setCitiesForWeather(limitedVisibleCities);
    }
  }, [mapRef, allProcessedCities, activeLayer, citiesForWeather]);
  
  const debouncedUpdateCitiesInView = useCallback(debounce(updateCitiesInView, 750), [updateCitiesInView]);

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
  
  const fetchAiForecasts = async (citiesToFetch) => {
    if (citiesToFetch.length === 0) {
      setWeatherData([]);
      return;
    }
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
    if (activeLayer !== 'none') {
      fetchAiForecasts(citiesForWeather);
    } else {
      setWeatherData([]);
    }
  }, [citiesForWeather, activeLayer]);
  
  const handleToggleWeather = () => {
    setActiveLayer(prevLayer => (prevLayer === 'weather' ? 'none' : 'weather'));
  };

  const handleToggleHumidity = () => {
    setActiveLayer(prevLayer => (prevLayer === 'humidity' ? 'none' : 'humidity'));
  };

  const handleToggleWind = () => {
    setActiveLayer(prevLayer => (prevLayer === 'wind' ? 'none' : 'wind'));
  };
  
  useEffect(() => {
    weatherMarkers.forEach(marker => marker.remove());
    setWeatherMarkers([]);
    if(activePopup) activePopup.remove();
    setActivePopup(null);
    setHourlyForecastData([]);
    setForecastLocationName('');

    if (activeLayer === 'none') {
      setWeatherData([]);
    } else {
        updateCitiesInView();
    }
  }, [activeLayer]);


  useEffect(() => {
    const map = mapRef.current;
    if (!map || activeLayer === 'none' || weatherData.length === 0) return;
    
    weatherMarkers.forEach(marker => marker.remove());

    const newMarkers = weatherData.map((dataPoint) => {
      const el = document.createElement('div');
      
      if (activeLayer === 'weather') {
        el.className = 'weather-icon-marker';
        el.style.backgroundImage = `url(${getWeatherIconUrl(dataPoint.daily[0].symbol_url)})`;
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          if (activePopup) activePopup.remove();
          setHourlyForecastData(dataPoint.hourly || []);
          setForecastLocationName(dataPoint.province);

          let popupHTML = `<div style="font-family: Arial, sans-serif; font-size: 13px; min-width: 300px; padding: 10px 12px; box-sizing: border-box;"><h4 style="margin: 0 0 10px 0; padding: 0; text-align: center; border-bottom: 1px solid #eee; padding-bottom: 8px; font-size: 16px;">${dataPoint.province}</h4><div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 5px;">`;
          dataPoint.daily.forEach((day, index) => {
            let dayName;
            if (index === 0) dayName = "Hôm nay";
            else if (index === 1) dayName = "Ngày mai";
            else if (index === 2) dayName = "Ngày kia";
            else dayName = day.date;
            popupHTML += `<div style="text-align: center; padding: 5px 2px; border: 1px solid #ddd; border-radius: 4px; flex: 1; min-width: 80px; box-sizing: border-box;">
                              <div style="font-weight: bold; margin-bottom: 4px; font-size: 12px;">${dayName}</div>
                              <img src="${getWeatherIconUrl(day.symbol_url)}" alt="${day.symbol_url}" style="width: 30px; height: 30px; margin-bottom: 2px;" />
                              <div style="font-size: 11px; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${day.symbol_url}">${day.symbol_url}</div>
                              <div style="font-size: 10px;">Min: ${day.temp_min}°C</div><div style="font-size: 10px;">Max: ${day.temp_max}°C</div></div>`;
          });
          popupHTML += `</div><div style="font-size:11px; color:#888; text-align:center; margin-top:8px;">(Dự báo chi tiết theo giờ ở cuối màn hình)</div></div>`;
          const newPopup = new maplibregl.Popup({ closeButton: true, closeOnClick: true, offset: 25 }).setLngLat([dataPoint.lon, dataPoint.lat]).setHTML(popupHTML).addTo(map);
          newPopup.on('close', () => { setHourlyForecastData([]); setForecastLocationName(''); });
          setActivePopup(newPopup);
        });
      } else if (activeLayer === 'humidity') {
        el.className = 'humidity-marker';
        el.innerHTML = `
          <img src="/weather_icons/humidity.png" alt="Độ ẩm" style="width: 14px; height: 14px; margin-right: 4px;"/>
          <span>${Math.round(dataPoint.daily[0].avg_humidity)}%</span>
        `;
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          if (activePopup) activePopup.remove();
          setHourlyForecastData(dataPoint.hourly || []);
          setForecastLocationName(dataPoint.province);
        });
      } else if (activeLayer === 'wind') {
        el.className = 'wind-marker';
        el.innerHTML = `
          <img src="/weather_icons/windspeed.png" alt="Sức gió" style="width: 14px; height: 14px; margin-right: 4px;"/>
          <span>${Math.round(dataPoint.daily[0].avg_wind_speed)} km/h</span>
        `;
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          if (activePopup) activePopup.remove();
          setHourlyForecastData(dataPoint.hourly || []);
          setForecastLocationName(dataPoint.province);
        });
      }
      return new maplibregl.Marker({ element: el }).setLngLat([dataPoint.lon, dataPoint.lat]).addTo(map);
    });
    setWeatherMarkers(newMarkers);
  }, [weatherData, activeLayer]);

  // Style cho các marker ---
  const markerStyles = `
    .weather-icon-marker {
      width: 35px;
      height: 35px;
      background-size: contain;
      cursor: pointer;
      transition: transform 0.2s;
    }
    .weather-icon-marker:hover {
        transform: scale(1.2);
    }
    .humidity-marker {
        display: flex;
        justify-content: center;
        align-items: center;
        padding: 5px 8px;
        background-color: rgba(230, 247, 255, 0.9);
        border: 1px solid #91d5ff;
        border-radius: 15px;
        font-size: 12px;
        font-weight: bold;
        color: #0050b3;
        cursor: pointer;
        box-shadow: 0 1px 3px rgba(0,0,0,0.15);
        transition: transform 0.2s, background-color 0.2s;
        white-space: nowrap;
    }
    .humidity-marker:hover {
        transform: scale(1.1);
        background-color: #e6f7ff;
    }
    .wind-marker {
        display: flex;
        justify-content: center;
        align-items: center;
        padding: 5px 8px;
        background-color: rgb(253, 253, 253);
        border: 1px solidrgb(185, 185, 185);
        border-radius: 15px;
        font-size: 12px;
        font-weight: bold;
        color:rgb(32, 34, 36);
        cursor: pointer;
        box-shadow: 0 1px 3px rgba(0,0,0,0.15);
        transition: transform 0.2s, background-color 0.2s;
        white-space: nowrap;
    }
    .wind-marker:hover {
        transform: scale(1.1);
        background-color: #e6f7ff;
    }
  `;

  return (
    <>
      <style>{markerStyles}</style>
      <Search activeInput={activeInput} onSelect={handleSelect}/>
      <MapContainer mapRef={mapRef} />
      <Sidebar dest={dest} start={start} setActiveInput={setActiveInput} onNavigateCurrent={() => {}}/>
      <ResetButton mapRef={mapRef} setDest={setDest} setStart={setStart} markerDest={markerDest} setMarkerDest={setMarkerDest} markerStart={markerStart} setMarkerStart={setMarkerStart} imageSrc="/data/circular.png" />
      
      <div className="layer-toggles">
        <WeatherToggleButton isActive={activeLayer === 'weather'} onToggle={handleToggleWeather} weatherIconSrc="/weather_icons/weather-button-icon.png" />
        <HumidityToggleButton isActive={activeLayer === 'humidity'} onToggle={handleToggleHumidity} humidityIconSrc="/weather_icons/humidity-button-icon.png" />
        <WindToggleButton isActive={activeLayer === 'wind'} onToggle={handleToggleWind} windIconSrc="/weather_icons/windspeed-button-icon.png" />
      </div>

      {isLoading && activeLayer !== 'none' && (
        <div style={{ position: 'fixed', bottom: '150px', right: '20px', backgroundColor: 'white', padding: '10px', borderRadius: '5px', boxShadow: '0 2px 5px rgba(0,0,0,0.2)'}}>
          Đang tải dữ liệu AI...
        </div>
      )}

      <HourlyForecast 
        forecastData={hourlyForecastData} 
        locationName={forecastLocationName}
        dataType={activeLayer}
      />
    </>
  );
}