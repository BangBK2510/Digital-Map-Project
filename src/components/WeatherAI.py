import requests
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from sklearn.ensemble import RandomForestRegressor, RandomForestClassifier
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import mean_absolute_error, accuracy_score
from sklearn.model_selection import GridSearchCV, StratifiedKFold
import matplotlib.pyplot as plt
from matplotlib.ticker import MaxNLocator
import warnings
import os # Thêm thư viện os để kiểm tra sự tồn tại của tệp

warnings.filterwarnings("ignore", category=UserWarning)

def fetch_met_no_forecast(lat, lon):
    """
    Tải dữ liệu dự báo thời tiết từ API của MET Norway.
    """
    url = f"https://api.met.no/weatherapi/locationforecast/2.0/compact?lat={lat}&lon={lon}"
    headers = {"User-Agent": "WeatherAI/9.0 github.com/your-repo"}
    try:
        resp = requests.get(url, headers=headers, timeout=15)
        resp.raise_for_status()
    except requests.exceptions.RequestException as e:
        print(f"LỖI: Không thể tải dữ liệu từ API. Lỗi: {e}")
        return pd.DataFrame() # Trả về DataFrame rỗng nếu có lỗi

    data = resp.json()
    rows = []
    for entry in data["properties"]["timeseries"]:
        t = entry["time"]
        instant = entry["data"]["instant"]["details"]
        temp = instant.get("air_temperature")
        rhum = instant.get("relative_humidity")
        pres = instant.get("air_pressure_at_sea_level")
        wind_speed = instant.get("wind_speed")
        cloud_frac = instant.get("cloud_area_fraction")

        next_1h = entry["data"].get("next_1_hours", {})
        summary = next_1h.get("summary", {})
        symbol = summary.get("symbol_code")
        details_1h = next_1h.get("details", {})
        precip = details_1h.get("precipitation_amount")

        rows.append({
            "time": pd.to_datetime(t),
            "temp": temp,
            "rhum": rhum,
            "pres": pres,
            "wind_speed": wind_speed,
            "cloud_frac": cloud_frac,
            "precip_1h": precip,
            "symbol_code": symbol
        })

    df = pd.DataFrame(rows)
    df.set_index("time", inplace=True)
    if df.index.tz is not None:
        df.index = df.index.tz_convert("Asia/Ho_Chi_Minh").tz_localize(None)
    else:
        df.index = df.index.tz_localize("UTC").tz_convert("Asia/Ho_Chi_Minh").tz_localize(None)
    return df

def group_weather_condition(symbol_code):
    """
    Phân loại các biểu tượng thời tiết chi tiết thành ba nhóm: 'Nắng', 'Mưa', và 'Trời Mây'.
    """
    if not isinstance(symbol_code, str):
        return 'Trời Mây' # Mặc định là trời mây nếu không có symbol

    s_lower = symbol_code.lower()
    
    # Ưu tiên kiểm tra Mưa trước vì nó là điều kiện quan trọng nhất
    if any(p in s_lower for p in ['rain', 'sleet', 'shower', 'snow', 'drizzle', 'lightrain', 'heavyrain', 'thundershower']):
        return 'Mưa'
    
    # Tiếp theo kiểm tra Nắng
    if any(p in s_lower for p in ['sun', 'clearsky']):
        return 'Nắng'
        
    # Các trường hợp còn lại (mây, sương mù, etc.) sẽ là 'Trời Mây'
    return 'Trời Mây'

def preprocess_dataframe(df):
    """
    Thực hiện tiền xử lý trên DataFrame (cả từ API và CSV).
    Hàm này tạo ra các feature về thời gian và xử lý dữ liệu bị thiếu.
    """
    if df.empty:
        return df
        
    df2 = df.copy()
    df2["hour"] = df2.index.hour
    df2["sin_hour"] = np.sin(2 * np.pi * df2["hour"] / 24)
    df2["cos_hour"] = np.cos(2 * np.pi * df2["hour"] / 24)
    df2["is_night"] = df2["hour"].apply(lambda h: 1 if (h < 6 or h > 18) else 0)
    
    # Xử lý cột 'precip_1h' nếu có, nếu không thì tạo cột mới
    if "precip_1h" not in df2.columns:
        df2["precip_1h"] = 0.0
    else:
        df2["precip_1h"] = df2["precip_1h"].fillna(0.0)

    # Kiểm tra và áp dụng phân loại điều kiện thời tiết
    if 'symbol_code' in df2.columns:
        df2['condition'] = df2['symbol_code'].apply(group_weather_condition)
    elif 'condition' not in df2.columns:
        # Nếu không có thông tin để phân loại, mặc định là 'Trời Mây'
        df2['condition'] = 'Trời Mây'

    # Bỏ các dòng có dữ liệu quan trọng bị thiếu
    required_cols = ["temp", "rhum", "pres", "wind_speed", "cloud_frac"]
    df2 = df2.dropna(subset=required_cols)
    
    # Đảm bảo các cột cần thiết có kiểu dữ liệu số
    for col in required_cols + ["precip_1h"]:
        df2[col] = pd.to_numeric(df2[col], errors='coerce')
    df2 = df2.dropna(subset=required_cols) # Chạy lại dropna sau khi ép kiểu

    return df2

def load_historical_data(filepath):
    """
    Tải và tiền xử lý dữ liệu lịch sử từ tệp CSV.
    """
    if not os.path.exists(filepath):
        print(f"CẢNH BÁO: Không tìm thấy tệp dữ liệu lịch sử tại '{filepath}'. Bỏ qua.")
        return pd.DataFrame()

    print(f"Đang tải dữ liệu lịch sử từ '{filepath}'...")
    df = pd.read_csv(filepath)
    
    # Chuẩn hóa tên cột (đổi thành chữ thường, bỏ khoảng trắng)
    df.columns = df.columns.str.lower().str.strip()

    if 'time' not in df.columns:
        print("LỖI: Tệp CSV thiếu cột 'time'. Không thể xử lý dữ liệu lịch sử.")
        return pd.DataFrame()

    df['time'] = pd.to_datetime(df['time'])
    df.set_index('time', inplace=True)
    
    # Chuyển đổi múi giờ nếu cần để đồng bộ với dữ liệu API
    if df.index.tz is not None:
        df.index = df.index.tz_convert("Asia/Ho_Chi_Minh").tz_localize(None)

    print("Tải dữ liệu lịch sử thành công.")
    return df


if __name__ == "__main__":
    # 1. Tải và xử lý cả hai nguồn dữ liệu
    all_data_frames = []

    # Tải dữ liệu lịch sử từ CSV
    historical_df_raw = load_historical_data('all_cities_weather_data.csv')
    if not historical_df_raw.empty:
        historical_df = preprocess_dataframe(historical_df_raw)
        all_data_frames.append(historical_df)
        print(f"Đã xử lý và thêm {len(historical_df)} mẫu từ dữ liệu lịch sử.")

    # Tải dữ liệu dự báo mới từ API
    lat, lon = 21.0278, 105.8342 # Tọa độ Hà Nội
    print("\nĐang tải dữ liệu dự báo từ MET Norway...")
    api_df_raw = fetch_met_no_forecast(lat, lon)
    if not api_df_raw.empty:
        api_df = preprocess_dataframe(api_df_raw)
        all_data_frames.append(api_df)
        print(f"Đã xử lý và thêm {len(api_df)} mẫu từ dữ liệu API.")
    
    if not all_data_frames:
        print("\nLỖI: Không có dữ liệu nào để huấn luyện mô hình. Vui lòng kiểm tra lại kết nối mạng và tệp CSV.")
        exit()

    # Kết hợp các nguồn dữ liệu
    df_combined = pd.concat(all_data_frames)
    
    # Loại bỏ các chỉ số thời gian trùng lặp, giữ lại bản ghi cuối cùng (thường là từ API, mới hơn)
    df_combined = df_combined[~df_combined.index.duplicated(keep='last')]
    df_combined.sort_index(inplace=True) # Sắp xếp lại theo thời gian

    print(f"\nTổng số mẫu dữ liệu kết hợp (sau khi loại bỏ trùng lặp): {len(df_combined)}")
    print("Phân loại điều kiện thời tiết trong bộ dữ liệu tổng hợp:")
    print(df_combined["condition"].value_counts())

    # 2. Xây dựng features và labels cho cả hai mô hình
    lags = 5 # Tăng lags để mô hình học được nhiều hơn từ chuỗi thời gian dài hơn
    X_list, y_temp_list, y_cond_list = [], [], []

    # Sử dụng df_combined để tạo mẫu
    for i in range(lags, len(df_combined) - 1):
        past = df_combined.iloc[i - lags : i]
        feat = []
        for j in range(lags):
            feat.extend([
                past["temp"].iloc[j],
                past["rhum"].iloc[j],
                past["pres"].iloc[j],
                past["wind_speed"].iloc[j],
                past["cloud_frac"].iloc[j],
                past["precip_1h"].iloc[j]
            ])
        feat.extend([df_combined["sin_hour"].iloc[i], df_combined["cos_hour"].iloc[i], df_combined["is_night"].iloc[i]])
        
        X_list.append(feat)
        y_temp_list.append(df_combined["temp"].iloc[i+1])
        y_cond_list.append(df_combined["condition"].iloc[i+1])

    if not X_list:
        print("\nLỖI: Không tạo được mẫu huấn luyện nào. Dữ liệu có thể quá ít hoặc không liên tục.")
        exit()

    X = np.array(X_list)
    y_temp = np.array(y_temp_list)
    y_cond = np.array(y_cond_list)
    X = np.nan_to_num(X) # Xử lý các giá trị NaN còn sót lại

    # 3. Mã hóa label và chia dữ liệu train/test
    le = LabelEncoder()
    y_cond_enc = le.fit_transform(y_cond)
    
    split_idx = int(len(X) * 0.8)
    X_train, X_test = X[:split_idx], X[split_idx:]
    y_temp_train, y_temp_test = y_temp[:split_idx], y_temp[split_idx:]
    y_cond_train_enc, y_cond_test_enc = y_cond_enc[:split_idx], y_cond_enc[split_idx:]
    
    print(f"\nTổng số mẫu huấn luyện/kiểm tra: {len(X)}")
    print(f"Số mẫu huấn luyện: {len(X_train)}")
    print(f"Số mẫu kiểm tra: {len(X_test)}")
    if len(X_train) == 0:
        print("LỖI: Không có đủ dữ liệu để tạo tập huấn luyện. Dừng chương trình.")
        exit()

    # 4. Huấn luyện và đánh giá mô hình dự báo Nhiệt độ
    print("\nĐang huấn luyện và đánh giá mô hình dự báo Nhiệt độ...")
    reg = RandomForestRegressor(n_estimators=150, random_state=42, n_jobs=-1, min_samples_leaf=3)
    reg.fit(X_train, y_temp_train)
    pred_temp = reg.predict(X_test)
    mae = mean_absolute_error(y_temp_test, pred_temp)
    print("Huấn luyện mô hình Nhiệt độ hoàn tất.")
    
    # 5. Huấn luyện và đánh giá mô hình dự báo Tình trạng
    print("\nĐang huấn luyện và đánh giá mô hình dự báo Tình trạng (thời tiết)...")
    param_grid = {
        'n_estimators': [100, 200],
        'max_depth': [10, 20, None],
        'min_samples_leaf': [1, 3],
        'class_weight': ['balanced', 'balanced_subsample']
    }
    # Đảm bảo có đủ mẫu cho các lớp trong tập huấn luyện
    unique_classes_train = np.unique(y_cond_train_enc)
    if len(unique_classes_train) < 2:
        print("CẢNH BÁO: Tập huấn luyện chỉ có một lớp. Không thể thực hiện StratifiedKFold. Sử dụng mô hình mặc định.")
        best_clf = RandomForestClassifier(n_estimators=100, random_state=42, class_weight='balanced')
        best_clf.fit(X_train, y_cond_train_enc)
    else:
        cv = StratifiedKFold(n_splits=3, shuffle=True, random_state=42)
        grid_search = GridSearchCV(
            estimator=RandomForestClassifier(random_state=42),
            param_grid=param_grid, scoring="accuracy", cv=cv, n_jobs=-1, verbose=0 # Giảm verbose
        )
        grid_search.fit(X_train, y_cond_train_enc)
        best_clf = grid_search.best_estimator_

    pred_cond = best_clf.predict(X_test)
    acc = accuracy_score(y_cond_test_enc, pred_cond)
    print("Huấn luyện mô hình Tình trạng hoàn tất.")


    # 6. In kết quả
    print("\n--- KẾT QUẢ ĐÁNH GIÁ MÔ HÌNH TRÊN TẬP TEST ---")
    print(f"Thời gian hiện tại (local): {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Sai số tuyệt đối trung bình (MAE) cho Nhiệt độ: {mae:.2f} °C")
    print(f"Độ chính xác (Accuracy) cho Tình trạng: {acc:.2%}")
    
    # 7. Dự báo chi tiết cho tương lai
    print("\n--- DỰ BÁO CHI TIẾT CHO 24H TỚI ---")
    now_local = datetime.now()
    start_forecast_time = (now_local + timedelta(hours=1)).replace(minute=0, second=0, microsecond=0)
    
    if len(df_combined) < lags:
        print("\nLỖI: Không đủ dữ liệu để bắt đầu dự báo.")
    else:
        # Lấy cửa sổ dữ liệu cuối cùng từ bộ dữ liệu kết hợp để làm điểm bắt đầu
        initial_window_df = df_combined.iloc[-lags:]
        window_data = initial_window_df[['temp', 'rhum', 'pres', 'wind_speed', 'cloud_frac', 'precip_1h']].to_dict('records')

        current_time = start_forecast_time
        for _ in range(24):
            current_hour = current_time.hour
            
            feat = []
            for item in window_data:
                feat.extend([
                    item["temp"], item["rhum"], item["pres"],
                    item["wind_speed"], item["cloud_frac"], item["precip_1h"]
                ])
            feat.extend([np.sin(2*np.pi*current_hour/24), np.cos(2*np.pi*current_hour/24), 1 if (current_hour<6 or current_hour>18) else 0])
            
            feat_arr = np.array(feat).reshape(1, -1)
            feat_arr = np.nan_to_num(feat_arr)

            predicted_temp = reg.predict(feat_arr)[0]
            predicted_cond_enc = best_clf.predict(feat_arr)[0]
            predicted_condition = le.inverse_transform([predicted_cond_enc])[0]
            
            print(f"Dự báo lúc {current_time.strftime('%Y-%m-%d %H:%M')}: ~{predicted_temp:.1f}°C, Tình trạng: {predicted_condition}")

            # Cập nhật cửa sổ dữ liệu cho vòng lặp tiếp theo
            if predicted_condition == 'Mưa':
                next_precip = np.random.uniform(0.1, 1.5)
                next_cloud = np.random.uniform(80, 100)
            elif predicted_condition == 'Nắng':
                next_precip = 0.0
                next_cloud = np.random.uniform(0, 25)
            else: # Trời Mây
                next_precip = 0.0
                next_cloud = np.random.uniform(50, 90)

            window_data.pop(0)
            # Cập nhật các giá trị khác một cách hợp lý hơn
            new_entry = {
                'temp': predicted_temp,
                'rhum': window_data[-1]['rhum'] * 0.98 + np.random.uniform(0, 4), # Giả lập thay đổi độ ẩm
                'pres': window_data[-1]['pres'] * 0.99 + np.random.uniform(0, 2), # Giả lập thay đổi áp suất
                'wind_speed': window_data[-1]['wind_speed'] * 0.95 + np.random.uniform(0, 1),# Giả lập thay đổi tốc độ gió
                'precip_1h': next_precip, 
                'cloud_frac': next_cloud
            }
            window_data.append(new_entry)

            current_time += timedelta(hours=1)

    # 8. Vẽ biểu đồ kết quả
    max_plots = min(100, len(y_temp_test)) if y_temp_test.size > 0 else 0
    if max_plots > 0:
        plt.figure(figsize=(15, 7))
        plt.plot(range(max_plots), y_temp_test[:max_plots], marker='o', linestyle='-', label="Nhiệt độ Thực tế")
        plt.plot(range(max_plots), pred_temp[:max_plots], marker='x', linestyle='--', label="Nhiệt độ Dự báo (Mô hình)")
        plt.legend()
        plt.title(f"So sánh hiệu năng Mô hình Nhiệt độ trong ({max_plots} mẫu của tập dự đoán)")
        plt.xlabel("Mẫu")
        plt.ylabel("Nhiệt độ (°C)")
        plt.grid(True, linestyle='--', alpha=0.6)
        ax = plt.gca()
        ax.xaxis.set_major_locator(MaxNLocator(integer=True))
        plt.tight_layout()
        plt.show()
