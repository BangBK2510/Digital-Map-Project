# Mục đích: Xây dựng máy chủ Flask để tải các mô hình AI đã huấn luyện
# và cung cấp API dự báo thời tiết.
# ==============================================================================
# *** NÂNG CẤP: Cập nhật server để tương thích với mô hình đã cải tiến,
# sử dụng các feature tuần hoàn và trung bình trượt khi dự báo.
# ==============================================================================
from flask import Flask, jsonify, request
from flask_cors import CORS
import joblib
import requests
import pandas as pd
from datetime import datetime, timedelta, timezone
import numpy as np
import pytz 

try:
    from province_data import PROVINCE_DATA
except ImportError:
    print("Lỗi: Không tìm thấy file province_data.py.")
    exit()

# --- Khởi tạo và tải các tài nguyên cần thiết ---
app = Flask(__name__)
CORS(app)

ELEMENTS = [
    'air_temperature',
    'relative_humidity',
    'precipitation_amount',
    'cloud_area_fraction',
    'wind_speed'
]

# Tải các mô hình và bộ mã hóa
try:
    MODELS = {element: joblib.load(f'model_{element}.joblib') for element in ELEMENTS}
    PROVINCE_ENCODER = joblib.load('province_encoder.joblib')
    print("--- Tất cả mô hình NÂNG CAO đã được tải thành công! ---")
except FileNotFoundError as e:
    print(f"Lỗi: Không tìm thấy file mô hình. Vui lòng chạy 'train_weather_model.py' trước. Chi tiết: {e}")
    exit()


def get_initial_features(lat, lon):
    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": lat,
        "longitude": lon,
        "hourly": ",".join([
            "temperature_2m", "relative_humidity_2m", "precipitation", 
            "cloud_cover", "wind_speed_10m"
        ]),
        "past_days": 2, "forecast_days": 1 
    }
    response = requests.get(url, params=params)
    response.raise_for_status()
    data = response.json()['hourly']
    
    df = pd.DataFrame(data)
    df = df.rename(columns={
        "time": "time", "temperature_2m": "air_temperature",
        "relative_humidity_2m": "relative_humidity", "precipitation": "precipitation_amount",
        "cloud_cover": "cloud_area_fraction", "wind_speed_10m": "wind_speed"
    })
    
    df['time'] = pd.to_datetime(df['time'], utc=True)
    now_utc = datetime.now(timezone.utc)
    past_df = df[df['time'] <= now_utc].copy()
    return past_df


def create_features_for_prediction(df_history, province_name, prediction_time):
    features = {}
    
    features['hour_sin'] = np.sin(2 * np.pi * prediction_time.hour / 24)
    features['hour_cos'] = np.cos(2 * np.pi * prediction_time.hour / 24)
    features['day_of_year_sin'] = np.sin(2 * np.pi * prediction_time.dayofyear / 366)
    features['day_of_year_cos'] = np.cos(2 * np.pi * prediction_time.dayofyear / 366)
    features['month_sin'] = np.sin(2 * np.pi * prediction_time.month / 12)
    features['month_cos'] = np.cos(2 * np.pi * prediction_time.month / 12)

    for element in ELEMENTS:
        history_series = df_history[element]
        for i in range(1, 4):
            features[f'{element}_lag_{i}'] = history_series.iloc[-i]
        
        features[f'{element}_rolling_mean_6'] = history_series.rolling(window=6, min_periods=1).mean().iloc[-1]
        features[f'{element}_rolling_mean_24'] = history_series.rolling(window=24, min_periods=1).mean().iloc[-1]
        features[f'{element}_rolling_std_6'] = history_series.rolling(window=6, min_periods=1).std().iloc[-1]
        
    features['province_encoded'] = PROVINCE_ENCODER[province_name]
    
    return pd.DataFrame([features]).fillna(0)


# *** BỔ SUNG 1: Thêm hàm logic để suy luận ra trạng thái thời tiết ***
def determine_weather_symbol(precipitation, cloud_cover, hour):
    """
    Hàm suy luận ra mã biểu tượng thời tiết từ các thông số dự báo.
    """
    is_day = 6 <= hour < 18

    if precipitation > 2.0: return 'heavyrain'
    if precipitation > 0.2: return 'rain'
    
    if cloud_cover > 80: return 'cloudy'
    if cloud_cover > 40: return 'partlycloudy_day' if is_day else 'partlycloudy_night'
        
    return 'clearsky_day' if is_day else 'clearsky_night'


@app.route('/api/provinces', methods=['GET'])
def get_provinces():
    return jsonify(list(PROVINCE_DATA.keys()))

@app.route('/api/predict', methods=['GET'])
def predict():
    province_name = request.args.get('province')
    if not province_name or province_name not in PROVINCE_DATA:
        return jsonify({"error": "Tên tỉnh không hợp lệ hoặc bị thiếu."}), 400
    
    try:
        province_info = PROVINCE_DATA[province_name]
        history = get_initial_features(province_info['lat'], province_info['lon'])
        
        if len(history) < 24:
            return jsonify({"error": "Không đủ dữ liệu lịch sử để bắt đầu dự báo."}), 500
            
        predictions = []
        current_time_utc = pd.to_datetime(history['time'].iloc[-1])

        for _ in range(72):
            current_time_utc += timedelta(hours=1)
            feature_df = create_features_for_prediction(history, province_name, current_time_utc)
            
            predicted_values = {"time": current_time_utc}
            for element in ELEMENTS:
                prediction = MODELS[element].predict(feature_df)[0]
                if prediction < 0 and element != 'air_temperature':
                    prediction = 0
                if element == 'relative_humidity':
                    prediction = np.clip(prediction, 0, 100)
                predicted_values[element] = prediction
            
            predictions.append(predicted_values)
            
            new_row = pd.DataFrame([predicted_values])
            history = pd.concat([history, new_row], ignore_index=True)

        forecast_df = pd.DataFrame(predictions)
        vn_tz = pytz.timezone('Asia/Ho_Chi_Minh')
        forecast_df['time_vn'] = forecast_df['time'].dt.tz_convert(vn_tz)
        
        now_vn = datetime.now(vn_tz)

        # Tạo dự báo theo giờ
        hourly_df = forecast_df[forecast_df['time_vn'] > now_vn].head(24)
        hourly_forecast = []
        for _, row in hourly_df.iterrows():
            # *** BỔ SUNG 2: Gọi hàm suy luận để lấy mã icon ***
            symbol_code = determine_weather_symbol(row['precipitation_amount'], row['cloud_area_fraction'], row['time_vn'].hour)
            hourly_forecast.append({
                "time": row['time_vn'].strftime('%H:%M'),
                "temperature": round(row['air_temperature'], 1),
                "precipitation": round(row['precipitation_amount'], 2),
                "wind_speed": round(row['wind_speed'], 1),
                "relative_humidity": round(row['relative_humidity'], 1),
                "symbol_url": symbol_code 
            })
            
        # Tạo dự báo theo ngày
        forecast_df['date'] = forecast_df['time_vn'].dt.date
        daily_forecast = []
        
        unique_days = sorted(forecast_df[forecast_df['date'] >= now_vn.date()]['date'].unique())
        
        for date_val in unique_days[:3]:
            group = forecast_df[forecast_df['date'] == date_val]
            if group.empty: continue
            
            # *** BỔ SUNG 3: Xác định icon cho ngày ***
            daytime_group = group[(group['time_vn'].dt.hour >= 7) & (group['time_vn'].dt.hour < 17)]
            if not daytime_group.empty:
                daily_symbols = daytime_group.apply(
                    lambda row: determine_weather_symbol(row['precipitation_amount'], row['cloud_area_fraction'], row['time_vn'].hour),
                    axis=1
                )
                daily_symbol_code = daily_symbols.mode()[0] if not daily_symbols.empty else 'clearsky_day'
            else:
                daily_symbol_code = 'clearsky_day' 
            
            daily_forecast.append({
                "date": date_val.strftime('%A, %d/%m'),
                "temp_max": round(group['air_temperature'].max(), 1),
                "temp_min": round(group['air_temperature'].min(), 1),
                "total_precipitation": round(group['precipitation_amount'].sum(), 1),
                "avg_wind_speed": round(group['wind_speed'].mean(), 1),
                "avg_humidity": round(group['relative_humidity'].mean(), 1),
                "symbol_url": daily_symbol_code
            })

        return jsonify({
            "province": province_name,
            "hourly": hourly_forecast,
            "daily": daily_forecast
        })

    except Exception as e:
        print(f"Lỗi khi thực hiện dự báo cho {province_name}: {e}")
        return jsonify({"error": "Đã xảy ra lỗi phía server."}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=True)