import React, { useState, useRef, useCallback } from 'react';

export default function Search({ activeInput, onSelect }) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  //STATE ĐỂ QUẢN LÝ VIỆC TẢI THÊM
  const [page, setPage] = useState(1); // Trang hiện tại
  const [hasMore, setHasMore] = useState(true); // Còn kết quả để tải không?
  const [isLoadingMore, setIsLoadingMore] = useState(false); // Trạng thái đang tải thêm

  const timeoutRef = useRef(null);
  const listRef = useRef(null); // Ref để tham chiếu đến thẻ <ul> chứa danh sách

  // Hàm fetchSuggestions được cập nhật
  // isNewSearch: boolean -> để biết đây là tìm kiếm mới hay tải thêm
  const fetchSuggestions = useCallback(async (currentQuery, currentPage, isNewSearch = false) => {
    if (!currentQuery || currentQuery.trim() === '') {
      setSuggestions([]);
      return;
    }

    if (isNewSearch) {
      setIsLoading(true);
    } else {
      setIsLoadingMore(true);
    }
    setError(null);

    try {
      // Gửi thêm `page` và `limit` lên server
      const res = await fetch(`http://localhost:3001/api/search?q=${encodeURIComponent(currentQuery)}&page=${currentPage}&limit=10`);
      if (!res.ok) {
        throw new Error('Lỗi từ server');
      }
      const data = await res.json();
      
      if (isNewSearch) {
        setSuggestions(data); // Nếu là tìm kiếm mới, thay thế toàn bộ danh sách
      } else {
        // Nếu là tải thêm, nối kết quả mới vào danh sách cũ
        setSuggestions(prev => [...prev, ...data]);
      }
      
      // Nếu server trả về ít hơn số lượng yêu cầu, tức là đã hết dữ liệu
      setHasMore(data.length > 0);
      setPage(currentPage + 1); // Cập nhật để lần sau tải trang tiếp theo

    } catch (err) {
      console.error("Lỗi khi tìm kiếm địa điểm:", err);
      setError(err.message);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, []);

  const debouncedFetch = useRef(debounce((q) => {
    setSuggestions([]); // Xóa gợi ý cũ
    setPage(1); // Reset lại trang về 1
    setHasMore(true); // Reset lại trạng thái hasMore
    fetchSuggestions(q, 1, true); // Bắt đầu tìm kiếm từ trang 1
  }, 400)).current;

  const handleChange = (e) => {
    const newQuery = e.target.value;
    setQuery(newQuery);
    debouncedFetch(newQuery);
  };

  const handleClick = (item) => {
    onSelect(item);
    setQuery(item.display_name);
    setSuggestions([]);
    setHasMore(false);
  };

  // --- HÀM XỬ LÝ SỰ KIỆN CUỘN ---
  const handleScroll = () => {
    // Nếu đang tải hoặc đã hết kết quả thì không làm gì cả
    if (isLoadingMore || !hasMore) return;

    const listElement = listRef.current;
    if (listElement) {
      // Kiểm tra xem người dùng đã cuộn gần đến cuối danh sách chưa
      const isAtBottom = listElement.scrollHeight - listElement.scrollTop - listElement.clientHeight < 1;
      if (isAtBottom) {
        // Tải trang tiếp theo
        fetchSuggestions(query, page, false);
      }
    }
  };
  
  // Hàm debounce cơ bản
  function debounce(fn, delay) {
    return (...args) => {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => fn(...args), delay);
    };
  }

  return (
    <div style={{ position: 'absolute', top: '10px', left: activeInput === 'dest' ? '10px' : '350px', zIndex: 1002, width: '300px' }}>
      <input
        value={query}
        onChange={handleChange}
        placeholder={activeInput === 'dest' ? 'Tìm điểm đến...' : 'Tìm điểm xuất phát...'}
        style={{ width: '100%', padding: '10px', boxSizing: 'border-box', border: '1px solid #ccc', borderRadius: '4px', boxShadow: '0 2px 6px rgba(0,0,0,0.1)' }}
      />
      
      {isLoading && <div className="search-feedback">Đang tìm...</div>}
      {error && <div className="search-feedback error">Lỗi: {error}</div>}

      {suggestions.length > 0 && (
        <ul
          ref={listRef}
          onScroll={handleScroll}
          className="suggestions-list"
        >
          {suggestions.map((item, index) => (
            <li 
              key={`${item.place_id}-${index}`} // Thêm index để đảm bảo key là duy nhất
              onClick={() => handleClick(item)} 
              className="suggestion-item"
            >
              {item.display_name}
            </li>
          ))}
          {/* Hiển thị thông báo đang tải khi cuộn */}
          {isLoadingMore && <li className="suggestion-item-loading">Đang tải thêm...</li>}
        </ul>
      )}
      {/* CSS cho component */}
      <style>{`
        .search-feedback { background: white; padding: 10px; border: 1px solid #ccc; border-top: none; }
        .search-feedback.error { color: red; }
        .suggestions-list {
          background: white; list-style: none; padding: 0; margin: 0;
          border: 1px solid #ccc; border-top: none; border-radius: 0 0 4px 4px;
          box-shadow: 0 4px 8px rgba(0,0,0,0.1);
          max-height: 250px; /* Giới hạn chiều cao và cho phép cuộn */
          overflow-y: auto;
        }
        .suggestion-item {
          padding: 10px; cursor: pointer; border-bottom: 1px solid #eee;
        }
        .suggestion-item:hover { background-color: #f0f0f0; }
        .suggestion-item:last-child { border-bottom: none; }
        .suggestion-item-loading { padding: 10px; text-align: center; color: #888; }
      `}</style>
    </div>
  );
}
