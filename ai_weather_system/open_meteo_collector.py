# Mục đích: Tải dữ liệu thời tiết lịch sử từ API của Open-Meteo.
# ==============================================================================

import requests
import pandas as pd
from datetime import datetime, timedelta
import time

try:
    from province_data import PROVINCE_DATA
except ImportError:
    print("Lỗi: Không tìm thấy file province_data.py.")
    exit()

HOURLY_PARAMS = [
    "temperature_2m",
    "relative_humidity_2m",
    "precipitation",
    "cloud_cover",
    "wind_speed_10m"
]

#Lấy dữ liệu của 3 năm (3 * 365 ngày) ***
end_date = datetime.now().strftime('%Y-%m-%d')
start_date = (datetime.now() - timedelta(days=3*365)).strftime('%Y-%m-%d')

base_url = "https://archive-api.open-meteo.com/v1/archive"
all_provinces_df = []

print(f"--- Bắt đầu thu thập dữ liệu lịch sử 3 NĂM từ Open-Meteo ({start_date} đến {end_date}) ---")

for province_name, info in PROVINCE_DATA.items():
    print(f"Đang lấy dữ liệu cho: {province_name}...")
    
    params = {
        "latitude": info["lat"],
        "longitude": info["lon"],
        "start_date": start_date,
        "end_date": end_date,
        "hourly": HOURLY_PARAMS
    }
    
    try:
        response = requests.get(base_url, params=params)
        response.raise_for_status()
        
        data = response.json()
        
        df = pd.DataFrame(data['hourly'])
        df = df.rename(columns={
            "time": "time",
            "temperature_2m": "air_temperature",
            "relative_humidity_2m": "relative_humidity",
            "precipitation": "precipitation_amount",
            "cloud_cover": "cloud_area_fraction",
            "wind_speed_10m": "wind_speed"
        })
        
        df['province'] = province_name
        all_provinces_df.append(df)
        
        print(f"Lấy dữ liệu thành công cho {province_name}.")
        
    except requests.exceptions.RequestException as e:
        print(f"Lỗi khi lấy dữ liệu cho {province_name}: {e}")
    
    time.sleep(1)

if all_provinces_df:
    final_df = pd.concat(all_provinces_df, ignore_index=True)
    output_filename = 'vietnam_weather_history.csv' 
    final_df.to_csv(output_filename, index=False)
    print(f"\n--- HOÀN TẤT ---. Dữ liệu đã được lưu tại file: {output_filename}")
else:
    print("\nKhông thu thập được dữ liệu nào.")