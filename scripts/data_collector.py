# Nhiệm vụ: Thu thập dữ liệu và lưu vào /server-ai

import requests
import pandas as pd
import os
import time

# --- CẤU HÌNH ---
TARGET_CITIES = {
    "Buon Ma Thuot": {"lat": 12.6683, "lon": 108.0435}, "Ca Mau": {"lat": 9.1768, "lon": 105.1531},
    "Ha Tinh": {"lat": 18.3442, "lon": 105.9089}, "Hanoi": {"lat": 21.0285, "lon": 105.8542},
    "Haiphong": {"lat": 20.8449, "lon": 106.6881}, "Ho Chi Minh City": {"lat": 10.7769, "lon": 106.7009},
    "Nha Trang": {"lat": 12.2458, "lon": 109.1897}, "Da Nang": {"lat": 16.0544, "lon": 108.2022},
    "Lang Son": {"lat": 21.8524, "lon": 106.7589}, "Lao Cai": {"lat": 22.4848, "lon": 103.9515}
}

# *** FIXED PATH: Trỏ đến đúng thư mục /server-ai ***
SCRIPT_DIR = os.path.dirname(os.path.realpath(__file__))
DATA_FILE = os.path.join(SCRIPT_DIR, '..', 'server-ai', 'all_cities_weather_data.csv')


def fetch_met_no_forecast(lat, lon):
    """Tải dữ liệu dự báo mới nhất từ API của MET Norway."""
    url = f"https://api.met.no/weatherapi/locationforecast/2.0/compact?lat={lat}&lon={lon}"
    headers = {"User-Agent": "MultiCityDataCollector/1.0 your-email@domain.com"}
    try:
        resp = requests.get(url, headers=headers, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        
        rows = []
        for entry in data["properties"]["timeseries"]:
            t, instant, details_1h = entry["time"], entry["data"]["instant"]["details"], entry["data"].get("next_1_hours", {}).get("details", {})
            rows.append({
                "time": pd.to_datetime(t), "temp": instant.get("air_temperature"),
                "rhum": instant.get("relative_humidity"), "pres": instant.get("air_pressure_at_sea_level"),
                "wind_speed": instant.get("wind_speed"), "cloud_frac": instant.get("cloud_area_fraction"),
                "precip_1h": details_1h.get("precipitation_amount"),
                "symbol_code": entry["data"].get("next_1_hours", {}).get("summary", {}).get("symbol_code")
            })
        return pd.DataFrame(rows).set_index("time")
    except requests.RequestException as e:
        print(f"  Lỗi khi tải dữ liệu: {e}")
        return None

if __name__ == "__main__":
    print("--- Bắt đầu quá trình thu thập dữ liệu cho 10 tỉnh thành ---")
    all_new_data = []

    for city_name, coords in TARGET_CITIES.items():
        print(f"-> Đang tải dữ liệu cho: {city_name}...")
        df_new = fetch_met_no_forecast(coords['lat'], coords['lon'])
        if df_new is not None:
            df_new['city_name'] = city_name
            all_new_data.append(df_new)
            print(f"  Tải thành công {len(df_new)} bản ghi.")
        time.sleep(1)

    if not all_new_data:
        print("Không tải được dữ liệu mới nào. Kết thúc.")
        exit()

    df_to_append = pd.concat(all_new_data)
    
    os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)

    df_historical = pd.read_csv(DATA_FILE, index_col='time', parse_dates=True) if os.path.exists(DATA_FILE) else pd.DataFrame()
    df_combined = pd.concat([df_historical, df_to_append])
    
    df_combined.reset_index(inplace=True)
    df_combined.drop_duplicates(subset=['time', 'city_name'], keep='last', inplace=True)
    df_combined.set_index('time', inplace=True)
    df_combined.sort_index(inplace=True)
    df_combined.to_csv(DATA_FILE)

    print(f"\n--- HOÀN TẤT ---")
    print(f"File dữ liệu '{DATA_FILE}' đã được cập nhật. Tổng số dòng hiện tại: {len(df_combined)}.")