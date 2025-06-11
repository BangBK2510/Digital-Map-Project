import React, { useState, useRef } from 'react';

export default function Search({ activeInput, onSelect }) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const timeoutRef = useRef(null);

  const debounce = (fn, delay) => (...args) => {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => fn(...args), delay);
  };

  const fetchSuggestions = async (q) => {
    if (!q || q.trim() === '') {
      setSuggestions([]);
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const res = await fetch(`http://localhost:3001/api/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ message: 'Không thể phân tích lỗi từ server' }));
        throw new Error(errData.message || `Lỗi ${res.status}`);
      }
      const data = await res.json();
      setSuggestions(data);
    } catch (err) {
      console.error("Lỗi khi tìm kiếm địa điểm:", err);
      setError(err.message);
      setSuggestions([]);
    } finally {
      setIsLoading(false);
    }
  };

  const debouncedFetch = useRef(debounce(fetchSuggestions, 400)).current;

  const handleChange = (e) => {
    const newQuery = e.target.value;
    setQuery(newQuery);
    debouncedFetch(newQuery);
  };

  // --- THAY ĐỔI CHÍNH Ở ĐÂY ---
  const handleClick = (item) => {
    if (item && typeof item.lon !== 'undefined' && typeof item.lat !== 'undefined') {
      // 1. Gửi toàn bộ đối tượng 'item' lên cho component cha (App.js)
      onSelect(item);
      // 2. Cập nhật thanh tìm kiếm với tên đã chọn để UX tốt hơn
      setQuery(item.display_name);
      // 3. Xóa danh sách gợi ý
      setSuggestions([]);
    } else {
      console.error("Dữ liệu gợi ý không hợp lệ:", item);
      setError("Dữ liệu trả về không hợp lệ.");
    }
  };

  return (
    <div style={{ position: 'absolute', top: '10px', left: activeInput === 'dest' ? '10px' : '350px', zIndex: 1002, width: '300px' }}>
      <input
        value={query}
        onChange={handleChange}
        placeholder={activeInput === 'dest' ? 'Tìm điểm đến...' : 'Tìm điểm xuất phát...'}
        style={{ width: '100%', padding: '10px', boxSizing: 'border-box', border: '1px solid #ccc', borderRadius: '4px', boxShadow: '0 2px 6px rgba(0,0,0,0.1)' }}
      />
      {isLoading && <div style={{ background: 'white', padding: '10px', border: '1px solid #ccc', borderTop: 'none' }}>Đang tìm...</div>}
      {error && <div style={{ background: 'white', padding: '10px', color: 'red', border: '1px solid #ccc', borderTop: 'none' }}>Lỗi: {error}</div>}
      {suggestions.length > 0 && (
        <ul style={{ background: 'white', listStyle: 'none', padding: 0, margin: 0, border: '1px solid #ccc', borderTop: 'none', borderRadius: '0 0 4px 4px', boxShadow: '0 4px 8px rgba(0,0,0,0.1)' }}>
          {suggestions.map(item => (
            <li 
              key={item.place_id}
              onClick={() => handleClick(item)} 
              style={{ padding: '10px', cursor: 'pointer', borderBottom: '1px solid #eee' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f0f0f0'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
            >
              {item.display_name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
