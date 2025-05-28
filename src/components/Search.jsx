import React, { useState, useRef } from 'react';

export default function Search({ activeInput, onSelect }) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const timeoutRef = useRef(null);

  const debounce = (fn, delay) => (...args) => {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => fn(...args), delay);
  };

  const fetchSuggestions = async (q) => {
    if (!q) return setSuggestions([]);
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5`);
    const data = await res.json();
    setSuggestions(data);
  };
  const debouncedFetch = useRef(debounce(fetchSuggestions, 400)).current;

  const handleChange = (e) => {
    setQuery(e.target.value);
    debouncedFetch(e.target.value);
  };

  const handleClick = (item) => {
    const point = [Number(item.lon), Number(item.lat)];
    onSelect(point);
    setQuery('');
    setSuggestions([]);
  };

  return (
    <>
      <input
        value={query}
        onChange={handleChange}
        placeholder={activeInput === 'dest' ? 'Chọn một địa điểm...' : 'Chọn điểm xuất phát...'}
        style={{ position: 'absolute', top: 10, left: activeInput === 'dest' ? 10 : 350, zIndex: 1, width: 300, padding: 10 }}
      />
      <ul style={{ position: 'absolute', top: 50, left: 10, zIndex: 2, background: 'white', listStyle: 'none', padding: 0, margin: 0 }}>
        {suggestions.map(item => (
          <li key={item.place_id} onClick={() => handleClick(item)} style={{ padding: 10, cursor: 'pointer' }}>
            {item.display_name}
          </li>
        ))}
      </ul>
    </>
  );
}