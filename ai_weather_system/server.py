# Mục đích: Xây dựng máy chủ Flask để tải các mô hình AI đã huấn luyện
# và cung cấp API dự báo thời tiết.
# ==============================================================================
# Sử dụng các feature tuần hoàn và trung bình trượt khi dự báo.
# ==============================================================================
from flask import Flask, jsonify, request
from flask_cors import CORS
import joblib
import requests
import pandas as pd
from datetime import datetime, timedelta, timezone
import numpy as np
import pytz
import time
import traceback

try:
    from province_data import PROVINCE_DATA
except ImportError:
    print("Lỗi: Không tìm thấy file province_data.py.")
    exit()

# --- Khởi tạo và tải các tài nguyên cần thiết ---
app = Flask(__name__)
CORS(app)

# --- CẤU HÌNH CACHE ---
FORECAST_CACHE = {}
CACHE_DURATION_SECONDS = 15 * 60

# Cập nhật danh sách các mô hình và yếu tố cần thiết
ALL_INPUT_ELEMENTS = [
    'air_temperature', 'relative_humidity', 'precipitation_amount',
    'cloud_area_fraction', 'wind_speed', 'surface_pressure', 'dewpoint_2m'
]
REGRESSION_ELEMENTS = [
    'air_temperature', 'relative_humidity', 'wind_speed',
    'surface_pressure', 'dewpoint_2m'
]

# Tải các mô hình và bộ mã hóa
try:
    print("--- Đang tải các mô hình và tài nguyên... ---")
    MODELS = {element: joblib.load(f'model_{element}.joblib') for element in REGRESSION_ELEMENTS}
    MODELS['cloud_condition_classifier'] = joblib.load('model_cloud_condition.joblib')
    MODELS['rain_classifier'] = joblib.load('model_rain_classifier.joblib')
    MODELS['precipitation_regressor'] = joblib.load('model_precipitation_regressor.joblib')
    PROVINCE_ENCODER = joblib.load('province_encoder.joblib')
    CLOUD_CONDITION_LABELS = joblib.load('cloud_condition_labels.joblib')
    print("--- Tất cả mô hình đã được tải thành công! ---")
except FileNotFoundError as e:
    print(f"Lỗi: Không tìm thấy file mô hình hoặc nhãn. Vui lòng chạy 'train_weather_model.py' trước. Chi tiết: {e}")
    exit()

# Xác định thứ tự features chính xác như trong lúc huấn luyện
FEATURE_ORDER = ['hour_sin', 'hour_cos', 'day_of_year_sin', 'day_of_year_cos']
for element in ALL_INPUT_ELEMENTS:
    for i in range(1, 4):
        FEATURE_ORDER.append(f'{element}_lag_{i}')
    FEATURE_ORDER.append(f'{element}_rolling_mean_24')
FEATURE_ORDER.append('province_encoded')


# --- CÁC HÀM HỖ TRỢ ---
def find_closest_province(lat, lon):
    min_dist_sq = float('inf')
    closest_province = None
    for province_name, info in PROVINCE_DATA.items():
        dist_sq = (lat - info['lat'])**2 + (lon - info['lon'])**2
        if dist_sq < min_dist_sq:
            min_dist_sq = dist_sq
            closest_province = province_name
    return closest_province

def get_initial_features(lat, lon):
    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": lat, "longitude": lon,
        "hourly": ",".join([
            "temperature_2m", "relative_humidity_2m", "dewpoint_2m", 
            "precipitation", "cloud_cover", "surface_pressure", "wind_speed_10m"
        ]),
        "past_days": 2, "forecast_days": 1 
    }
    response = requests.get(url, params=params)
    response.raise_for_status()
    data = response.json()['hourly']
    df = pd.DataFrame(data)
    df = df.rename(columns={
        "time": "time", "temperature_2m": "air_temperature",
        "relative_humidity_2m": "relative_humidity", "dewpoint_2m": "dewpoint_2m",
        "precipitation": "precipitation_amount", "cloud_cover": "cloud_area_fraction",
        "surface_pressure": "surface_pressure", "wind_speed_10m": "wind_speed"
    })
    df['time'] = pd.to_datetime(df['time'], utc=True)
    return df[df['time'] <= datetime.now(timezone.utc)].copy()

def create_features_for_prediction(df_history, province_name, prediction_time):
    features = {}
    features['hour_sin'] = np.sin(2 * np.pi * prediction_time.hour / 24)
    features['hour_cos'] = np.cos(2 * np.pi * prediction_time.hour / 24)
    features['day_of_year_sin'] = np.sin(2 * np.pi * prediction_time.dayofyear / 366)
    features['day_of_year_cos'] = np.cos(2 * np.pi * prediction_time.dayofyear / 366)
    for element in ALL_INPUT_ELEMENTS:
        history_series = df_history[element]
        for i in range(1, 4):
            features[f'{element}_lag_{i}'] = history_series.iloc[-i]
        features[f'{element}_rolling_mean_24'] = history_series.rolling(window=24, min_periods=1).mean().iloc[-1]
    features['province_encoded'] = PROVINCE_ENCODER[province_name]
    
    feature_df = pd.DataFrame([features]).fillna(0)
    return feature_df[FEATURE_ORDER]

def determine_weather_symbol(precipitation, cloud_condition, hour):
    is_day = 6 <= hour < 18
    if precipitation > 2.0: return 'heavyrain'
    if precipitation > 0.25: return 'rain'
    if cloud_condition == 'Trời nhiều mây': return 'cloudy_day' if is_day else 'cloudy_night'
    if cloud_condition in ['Trời mây', 'Mây rải rác']: return 'partlycloudy_day' if is_day else 'partlycloudy_night'
    return 'clearsky_day' if is_day else 'clearsky_night'

# --- ENDPOINT API ---
@app.route('/api/provinces', methods=['GET'])
def get_provinces():
    provinces_list = [{"name": name, "lat": data["lat"], "lon": data["lon"]} for name, data in PROVINCE_DATA.items()]
    return jsonify(provinces_list)

@app.route('/api/predict', methods=['GET'])
def predict():
    lat = request.args.get('lat', type=float)
    lon = request.args.get('lon', type=float)
    province_name_arg = request.args.get('province')

    province_name = None

    if lat is not None and lon is not None:
        province_name = find_closest_province(lat, lon)
        if not province_name:
             return jsonify({"error": "Không tìm thấy tỉnh nào gần tọa độ đã cho."}), 400
    elif province_name_arg:
        if province_name_arg not in PROVINCE_DATA:
            return jsonify({"error": f"Tên tỉnh '{province_name_arg}' không hợp lệ."}), 400
        province_name = province_name_arg
    else:
        return jsonify({"error": "Cần cung cấp 'lat' và 'lon'."}), 400

    current_time_epoch = time.time()
    if province_name in FORECAST_CACHE:
        cached_result, timestamp = FORECAST_CACHE[province_name]
        if current_time_epoch - timestamp < CACHE_DURATION_SECONDS:
            print(f"--> Phục vụ dự báo từ cache cho: {province_name}")
            return jsonify(cached_result)

    print(f"--> Cache không có hoặc đã hết hạn. Thực hiện dự báo mới cho: {province_name}")

    try:
        province_info = PROVINCE_DATA[province_name]
        history = get_initial_features(province_info['lat'], province_info['lon'])
        
        if len(history) < 24: return jsonify({"error": "Không đủ dữ liệu lịch sử để bắt đầu dự báo."}), 500
            
        predictions = []
        current_time_utc = pd.to_datetime(history['time'].iloc[-1])

        for _ in range(72):
            current_time_utc += timedelta(hours=1)
            feature_df = create_features_for_prediction(history, province_name, current_time_utc)
            predicted_values = {"time": current_time_utc}

            for element in REGRESSION_ELEMENTS:
                prediction = MODELS[element].predict(feature_df)[0]
                predicted_values[element] = max(0, prediction) if element != 'air_temperature' else prediction

            cloud_condition_code = MODELS['cloud_condition_classifier'].predict(feature_df)[0]
            predicted_values['cloud_condition'] = CLOUD_CONDITION_LABELS.get(int(cloud_condition_code), "Không rõ") # **FIX**
            cloud_map = {0: 5, 1: 25, 2: 55, 3: 85, 4: 100}
            predicted_values['cloud_area_fraction'] = cloud_map.get(int(cloud_condition_code), 50) # **FIX**

            is_raining = MODELS['rain_classifier'].predict(feature_df)[0]
            rain_prob = MODELS['rain_classifier'].predict_proba(feature_df)[0, 1]
            predicted_values['rain_probability'] = round(rain_prob * 100, 1)

            predicted_values['precipitation_amount'] = max(0, MODELS['precipitation_regressor'].predict(feature_df)[0]) if is_raining else 0
            
            predictions.append(predicted_values)
            
            new_row_data = {**predicted_values}
            del new_row_data['cloud_condition']; del new_row_data['rain_probability']
            new_row = pd.DataFrame([new_row_data])
            history = pd.concat([history, new_row], ignore_index=True)

        forecast_df = pd.DataFrame(predictions)
        vn_tz = pytz.timezone('Asia/Ho_Chi_Minh')
        forecast_df['time_vn'] = forecast_df['time'].dt.tz_convert(vn_tz)
        
        now_vn = datetime.now(vn_tz)
        hourly_df = forecast_df[forecast_df['time_vn'] > now_vn].head(24)
        
        hourly_forecast = []
        for _, row in hourly_df.iterrows():
            hourly_forecast.append({
                "time": str(row['time_vn'].strftime('%H:%M')),
                "temperature": float(round(row['air_temperature'], 1)),
                "precipitation": float(round(row['precipitation_amount'], 2)),
                "wind_speed": float(round(row['wind_speed'], 1)),
                "relative_humidity": float(round(row['relative_humidity'], 1)),
                "cloud_condition": str(row['cloud_condition']),
                "rain_probability": float(row['rain_probability']),
                "symbol_url": str(determine_weather_symbol(row['precipitation_amount'], row['cloud_condition'], row['time_vn'].hour))
            })
            
        forecast_df['date'] = forecast_df['time_vn'].dt.date
        daily_forecast = []
        unique_days = sorted(forecast_df[forecast_df['date'] >= now_vn.date()]['date'].unique())
        
        for date_val in unique_days[:3]:
            group = forecast_df[forecast_df['date'] == date_val]
            if group.empty: continue
            
            daytime_group = group[(group['time_vn'].dt.hour >= 7) & (group['time_vn'].dt.hour < 17)]
            daily_symbol_code = daytime_group.apply(lambda r: determine_weather_symbol(r['precipitation_amount'], r['cloud_condition'], r['time_vn'].hour), axis=1).mode()[0] if not daytime_group.empty else 'clearsky_day'
            
            # Chuyển đổi tất cả các giá trị sang kiểu Python tiêu chuẩn
            daily_forecast.append({
                "date": str(date_val.strftime('%A, %d/%m')),
                "temp_max": float(round(group['air_temperature'].max(), 1)),
                "temp_min": float(round(group['air_temperature'].min(), 1)),
                "total_precipitation": float(round(group['precipitation_amount'].sum(), 1)),
                "avg_wind_speed": float(round(group['wind_speed'].mean(), 1)),
                "avg_humidity": float(round(group['relative_humidity'].mean(), 1)),
                "most_common_cloud": str(group['cloud_condition'].mode()[0]),
                "max_rain_prob": float(round(group['rain_probability'].max(), 1)),
                "symbol_url": str(daily_symbol_code)
            })

        result_json = {"province": province_name, "hourly": hourly_forecast, "daily": daily_forecast}
        FORECAST_CACHE[province_name] = (result_json, time.time())
        return jsonify(result_json)

    except Exception as e:
        print(f"Lỗi khi thực hiện dự báo cho {province_name}: {e}")
        traceback.print_exc()
        return jsonify({"error": "Đã xảy ra lỗi phía server."}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=True)