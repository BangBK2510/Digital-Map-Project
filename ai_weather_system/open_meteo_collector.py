# Mục đích: Tải dữ liệu thời tiết lịch sử từ API của Open-Meteo.
# - Nếu file dữ liệu chưa có, tải toàn bộ lịch sử 3 năm.
# - Nếu file đã có, tìm ngày gần nhất và chỉ tải dữ liệu mới kể từ đó.
# ==============================================================================

import requests
import pandas as pd
from datetime import datetime, timedelta
import time
import os

try:
    # Đảm bảo rằng file province_data.py nằm cùng thư mục
    from province_data import PROVINCE_DATA
except ImportError:
    print("Lỗi: Không tìm thấy file province_data.py.")
    print("Vui lòng đảm bảo file province_data.py nằm cùng thư mục với script này.")
    exit()

# Các tham số thời tiết muốn lấy
HOURLY_PARAMS = [
    "temperature_2m",
    "relative_humidity_2m",
    "precipitation",
    "cloud_cover",
    "wind_speed_10m"
]

# Tên file output
OUTPUT_FILENAME = 'vietnam_weather_history.csv' 
BASE_URL = "https://archive-api.open-meteo.com/v1/archive"
all_provinces_df_list = []
existing_df = None

# Kiểm tra xem file dữ liệu đã tồn tại chưa
if os.path.exists(OUTPUT_FILENAME):
    # Nếu file tồn tại, đọc nó và tìm ngày cuối cùng
    print(f"Phát hiện file dữ liệu đã có: '{OUTPUT_FILENAME}'.")
    try:
        existing_df = pd.read_csv(OUTPUT_FILENAME)
        if not existing_df.empty:
            # Chuyển cột 'time' sang định dạng datetime để xử lý
            existing_df['time'] = pd.to_datetime(existing_df['time'])
            
            # Tìm ngày cuối cùng trong dữ liệu cũ
            last_date = existing_df['time'].max()
            
            # Ngày bắt đầu sẽ là ngày tiếp theo của ngày cuối cùng
            start_date = (last_date + timedelta(days=1)).strftime('%Y-%m-%d')
            end_date = datetime.now().strftime('%Y-%m-%d')
            
            print(f"Sẽ cập nhật dữ liệu từ ngày {start_date} đến {end_date}.")

            if pd.to_datetime(start_date) > pd.to_datetime(end_date):
                print("Dữ liệu đã được cập nhật đến ngày hôm nay. Không cần tải thêm.")
                exit()
        else: # File tồn tại nhưng rỗng
            print("File dữ liệu hiện tại rỗng. Bắt đầu tải lại từ đầu.")
            end_date = datetime.now().strftime('%Y-%m-%d')
            start_date = (datetime.now() - timedelta(days=3*365)).strftime('%Y-%m-%d')
    except pd.errors.EmptyDataError:
        print(f"File '{OUTPUT_FILENAME}' bị rỗng. Bắt đầu tải lại từ đầu.")
        existing_df = None # Đảm bảo existing_df là None
        end_date = datetime.now().strftime('%Y-%m-%d')
        start_date = (datetime.now() - timedelta(days=3*365)).strftime('%Y-%m-%d')
else:
    # Nếu file không tồn tại, lấy dữ liệu của 3 năm gần nhất
    print(f"Không tìm thấy file '{OUTPUT_FILENAME}'. Bắt đầu tải dữ liệu lịch sử 3 năm.")
    end_date = datetime.now().strftime('%Y-%m-%d')
    start_date = (datetime.now() - timedelta(days=3*365)).strftime('%Y-%m-%d')

# Vòng lặp để lấy dữ liệu cho từng tỉnh
print(f"--- Bắt đầu thu thập dữ liệu từ Open-Meteo ({start_date} đến {end_date}) ---")

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
        response = requests.get(BASE_URL, params=params)
        response.raise_for_status() # Báo lỗi nếu request không thành công
        
        data = response.json()
        
        # Kiểm tra xem API có trả về dữ liệu không
        if 'hourly' not in data or not data['hourly']['time']:
            print(f"Không có dữ liệu mới cho {province_name} trong khoảng thời gian này.")
            continue
            
        df = pd.DataFrame(data['hourly'])
        # Đổi tên cột cho nhất quán
        df = df.rename(columns={
            "time": "time",
            "temperature_2m": "air_temperature",
            "relative_humidity_2m": "relative_humidity",
            "precipitation": "precipitation_amount",
            "cloud_cover": "cloud_area_fraction",
            "wind_speed_10m": "wind_speed"
        })
        
        df['province'] = province_name
        all_provinces_df_list.append(df)
        
        print(f"Lấy dữ liệu thành công cho {province_name}.")
        
    except requests.exceptions.RequestException as e:
        print(f"Lỗi khi lấy dữ liệu cho {province_name}: {e}")
    
    # Tạm dừng 1 giây để tránh làm quá tải API
    time.sleep(1)

# Xử lý và lưu file
if all_provinces_df_list:
    # Ghép tất cả dữ liệu mới thu thập được
    new_df = pd.concat(all_provinces_df_list, ignore_index=True)
    new_df['time'] = pd.to_datetime(new_df['time'])

    # Nếu có dữ liệu cũ và nó không rỗng, hãy ghép chúng lại với nhau
    if existing_df is not None and not existing_df.empty:
        final_df = pd.concat([existing_df, new_df], ignore_index=True)
    else:
        # Nếu không, dữ liệu mới là dữ liệu cuối cùng
        final_df = new_df

    # Sắp xếp lại và loại bỏ các dòng trùng lặp (nếu có)
    # đảm bảo tính duy nhất cho mỗi điểm dữ liệu theo tỉnh và thời gian
    final_df = final_df.sort_values(by=['province', 'time']).drop_duplicates(subset=['province', 'time'], keep='last')
    
    # Ghi lại toàn bộ dữ liệu đã được cập nhật ra file CSV
    final_df.to_csv(OUTPUT_FILENAME, index=False, date_format='%Y-%m-%dT%H:%M')
    print(f"\n--- HOÀN TẤT ---. Dữ liệu đã được cập nhật và lưu tại file: {OUTPUT_FILENAME}")
else:
    print("\nKhông có dữ liệu mới nào được thu thập.")