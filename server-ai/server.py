# Nhiệm vụ: Chạy máy chủ API, huấn luyện và cung cấp dự báo

from flask import Flask, jsonify, request
from flask_cors import CORS
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from sklearn.ensemble import RandomForestRegressor, RandomForestClassifier
from sklearn.preprocessing import LabelEncoder
import os
import math
import warnings

# --- CẤU HÌNH ---
# File này sẽ đọc dữ liệu trong chính thư mục của nó
SERVER_AI_DIR = os.path.dirname(os.path.realpath(__file__))
DATA_FILE = os.path.join(SERVER_AI_DIR, 'all_cities_weather_data.csv')
LAGS = 6

TARGET_CITIES = {
    "Buon Ma Thuot": {"lat": 12.6683, "lon": 108.0435}, "Ca Mau": {"lat": 9.1768, "lon": 105.1531},
    "Ha Tinh": {"lat": 18.3442, "lon": 105.9089}, "Hanoi": {"lat": 21.0285, "lon": 105.8542},
    "Haiphong": {"lat": 20.8449, "lon": 106.6881}, "Ho Chi Minh City": {"lat": 10.7769, "lon": 106.7009},
    "Nha Trang": {"lat": 12.2458, "lon": 109.1897}, "Da Nang": {"lat": 16.0544, "lon": 108.2022},
    "Lang Son": {"lat": 21.8524, "lon": 106.7589}, "Lao Cai": {"lat": 22.4848, "lon": 103.9515}
}

warnings.filterwarnings("ignore", category=UserWarning)

app = Flask(__name__)
CORS(app)

trained_models = {}

# CÁC HÀM XỬ LÝ DỮ LIỆU
def group_weather_condition_3_classes(symbol_code):
    if not isinstance(symbol_code, str): return 'Trời mây'
    s_lower = symbol_code.lower()
    if any(p in s_lower for p in ['rain', 'sleet', 'shower', 'snow', 'drizzle']): return 'Mưa'
    if any(p in s_lower for p in ['clearsky_day', 'fair_day']): return 'Nắng'
    return 'Trời mây'

def preprocess_met_df(df):
    df2 = df.copy()
    df2["hour"], df2["sin_hour"], df2["cos_hour"] = df2.index.hour, np.sin(2 * np.pi * df2.index.hour / 24), np.cos(2 * np.pi * df2.index.hour / 24)
    df2["is_night"] = df2["hour"].apply(lambda h: 1 if (h < 6 or h > 18) else 0)
    df2["precip_1h"], df2['condition'] = df2["precip_1h"].fillna(0.0), df2['symbol_code'].apply(group_weather_condition_3_classes)
    return df2.dropna(subset=["temp", "rhum", "pres", "wind_speed", "cloud_frac"])

def create_training_samples(df, lags):
    X_list, y_temp_list, y_cond_list = [], [], []
    for i in range(lags, len(df)):
        past, target = df.iloc[i-lags:i], df.iloc[i]
        feat = []
        for j in range(lags):
            feat.extend([past["temp"].iloc[j], past["rhum"].iloc[j], past["pres"].iloc[j], past["wind_speed"].iloc[j], past["cloud_frac"].iloc[j], past["precip_1h"].iloc[j]])
        feat.extend([target["sin_hour"], target["cos_hour"], target["is_night"]])
        X_list.append(feat)
        y_temp_list.append(target["temp"])
        y_cond_list.append(target["condition"])
    return np.array(X_list), np.array(y_temp_list), np.array(y_cond_list)

def train_all_models():
    """Huấn luyện mô hình riêng cho từng thành phố."""
    global trained_models
    print("--- Bắt đầu quá trình huấn luyện đa mô hình ---")
    if not os.path.exists(DATA_FILE):
        print(f"LỖI: Không tìm thấy file dữ liệu '{DATA_FILE}'. Vui lòng chạy 'python scripts/data_collector.py' trước.")
        return

    df_all = pd.read_csv(DATA_FILE, index_col='time', parse_dates=True)
    cities_in_data = df_all['city_name'].unique()
    print(f"Tìm thấy dữ liệu cho các thành phố: {', '.join(cities_in_data)}")

    for city in cities_in_data:
        print(f"\n-> Đang xử lý và huấn luyện cho: {city}")
        df_city = df_all[df_all['city_name'] == city]
        if len(df_city) < 50:
            print(f"  CẢNH BÁO: Dữ liệu cho {city} quá ít ({len(df_city)} dòng), bỏ qua.")
            continue
        df_processed = preprocess_met_df(df_city)
        X, y_temp, y_cond = create_training_samples(df_processed, lags=LAGS)
        X = np.nan_to_num(X)
        le = LabelEncoder()
        y_cond_enc = le.fit_transform(y_cond)

        reg = RandomForestRegressor(n_estimators=100, random_state=42, n_jobs=-1).fit(X, y_temp)
        clf = RandomForestClassifier(n_estimators=100, random_state=42, class_weight='balanced', n_jobs=-1).fit(X, y_cond_enc)
        
        trained_models[city] = {'reg': reg, 'clf': clf, 'le': le}
        print(f"  Mô hình cho {city} đã sẵn sàng. Các lớp đã học: {le.classes_}")
    print("\n--- Quá trình huấn luyện đa mô hình hoàn tất. Server sẵn sàng. ---")

def find_nearest_city(lat, lon):
    """Tìm thành phố gần nhất từ tọa độ cho trước."""
    available_cities = {name: coords for name, coords in TARGET_CITIES.items() if name in trained_models}
    if not available_cities: return None
    
    min_dist = float('inf')
    nearest_city = None
    for city_name, coords in available_cities.items():
        dist = math.sqrt((lat - coords['lat'])**2 + (lon - coords['lon'])**2)
        if dist < min_dist:
            min_dist, nearest_city = dist, city_name
    return nearest_city

@app.route('/api/predict_weather', methods=['GET'])
def predict_weather():
    lat_str, lon_str = request.args.get('lat'), request.args.get('lon')
    if not lat_str or not lon_str: return jsonify({"error": "Vui lòng cung cấp 'lat' và 'lon'"}), 400
    
    nearest_city = find_nearest_city(float(lat_str), float(lon_str))
    if not nearest_city: return jsonify({"error": f"Không có mô hình nào được huấn luyện cho khu vực lân cận"}), 500

    models = trained_models[nearest_city]
    reg_model, clf_model, le = models['reg'], models['clf'], models['le']
    
    df_all = pd.read_csv(DATA_FILE, index_col='time', parse_dates=True)
    df_city = df_all[df_all['city_name'] == nearest_city]
    df_processed = preprocess_met_df(df_city)
    initial_window_df = df_processed.iloc[-LAGS:]
    window_data = initial_window_df[['temp', 'rhum', 'pres', 'wind_speed', 'cloud_frac', 'precip_1h']].to_dict('records')
    
    forecast_results, current_time = [], datetime.now().replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
    for _ in range(24):
        current_hour = current_time.hour
        time_features = [np.sin(2*np.pi*current_hour/24), np.cos(2*np.pi*current_hour/24), 1 if (current_hour<6 or current_hour>18) else 0]
        
        feat = []
        for item in window_data:
            feat.extend([item["temp"], item["rhum"], item["pres"], item["wind_speed"], item["cloud_frac"], item["precip_1h"]])
        feat.extend(time_features)
        feat_arr = np.array(feat).reshape(1, -1)
        feat_arr = np.nan_to_num(feat_arr)

        predicted_temp = reg_model.predict(feat_arr)[0]
        predicted_cond_enc = clf_model.predict(feat_arr)[0]
        predicted_condition = le.inverse_transform([predicted_cond_enc])[0]

        forecast_results.append({"time": current_time.isoformat(), "temp": round(predicted_temp, 1), "condition": predicted_condition})

        if predicted_condition == 'Mưa': next_precip, next_cloud = 0.5, 100.0
        elif predicted_condition == 'Nắng': next_precip, next_cloud = 0.0, 10.0
        else: next_precip, next_cloud = 0.0, 60.0

        window_data.pop(0)
        new_entry = window_data[-1].copy()
        new_entry.update({'temp': predicted_temp, 'precip_1h': next_precip, 'cloud_frac': next_cloud})
        window_data.append(new_entry)
        current_time += timedelta(hours=1)
        
    return jsonify({"city_name": nearest_city, "lat": lat_str, "lon": lon_str, "forecast": forecast_results})

if __name__ == "__main__":
    train_all_models()
    # Chạy server, lắng nghe trên port 5001 để tránh xung đột với server.js
    app.run(debug=True, port=5001)