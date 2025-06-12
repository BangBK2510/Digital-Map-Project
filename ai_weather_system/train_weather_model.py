# Mục đích: Đọc dữ liệu từ file CSV của Open-Meteo, xử lý và huấn luyện
# các mô hình AI dự báo thời tiết.
# ==============================================================================
# Thêm các features phức tạp hơn (tuần hoàn, trung bình trượt) ***
# ==============================================================================
import pandas as pd
import lightgbm as lgb
import joblib
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error
import numpy as np

print("--- Bắt đầu quá trình huấn luyện mô hình ---")

ELEMENTS = [
    'air_temperature',
    'relative_humidity',
    'precipitation_amount',
    'cloud_area_fraction',
    'wind_speed'
]

# Đọc dữ liệu từ file
input_filename = 'vietnam_weather_history.csv'
try:
    df = pd.read_csv(input_filename, parse_dates=['time'])
except FileNotFoundError:
    print(f"Lỗi: Không tìm thấy file '{input_filename}'.")
    print("Vui lòng chạy file 'open_meteo_collector.py' trước.")
    exit()

print("Đã tải dữ liệu thành công.")

# 1. Tiền xử lý và tạo Feature Engineering 
# =================================================
print("Đang tiền xử lý và tạo features...")

df = df.sort_values(by=['province', 'time']).reset_index(drop=True)

# Cập nhật cú pháp fillna theo phiên bản mới của pandas ---
df.ffill(inplace=True) # Điền giá trị rỗng bằng giá trị phía trên
df.bfill(inplace=True) # Điền giá trị rỗng bằng giá trị phía dưới

# Thêm các đặc trưng tuần hoàn (Cyclical Features) ***
# Giúp mô hình hiểu tính chu kỳ của thời gian
df['hour_sin'] = np.sin(2 * np.pi * df['time'].dt.hour / 24)
df['hour_cos'] = np.cos(2 * np.pi * df['time'].dt.hour / 24)
df['day_of_year_sin'] = np.sin(2 * np.pi * df['time'].dt.dayofyear / 366)
df['day_of_year_cos'] = np.cos(2 * np.pi * df['time'].dt.dayofyear / 366)
df['month_sin'] = np.sin(2 * np.pi * df['time'].dt.month / 12)
df['month_cos'] = np.cos(2 * np.pi * df['time'].dt.month / 12)

# Thêm các đặc trưng trung bình trượt (Rolling Features) ***
# Giúp mô hình có cái nhìn về xu hướng gần đây
for element in ELEMENTS:
    # Thêm các lag features (dữ liệu của các giờ trước đó)
    for i in range(1, 4):
        df[f'{element}_lag_{i}'] = df.groupby('province')[element].shift(i)
        
    # Thêm các rolling features
    df[f'{element}_rolling_mean_6'] = df.groupby('province')[element].transform(lambda x: x.shift(1).rolling(window=6, min_periods=1).mean())
    df[f'{element}_rolling_mean_24'] = df.groupby('province')[element].transform(lambda x: x.shift(1).rolling(window=24, min_periods=1).mean())
    df[f'{element}_rolling_std_6'] = df.groupby('province')[element].transform(lambda x: x.shift(1).rolling(window=6, min_periods=1).std())

df.dropna(inplace=True)
print("Tạo features hoàn tất.")

# 2. Huấn luyện các mô hình
# ========================
features = [
    'hour_sin', 'hour_cos', 'day_of_year_sin', 'day_of_year_cos', 'month_sin', 'month_cos'
]
for element in ELEMENTS:
    for i in range(1, 4):
        features.append(f'{element}_lag_{i}')
    features.append(f'{element}_rolling_mean_6')
    features.append(f'{element}_rolling_mean_24')
    features.append(f'{element}_rolling_std_6')

province_encoder = {name: i for i, name in enumerate(df['province'].unique())}
df['province_encoded'] = df['province'].map(province_encoder)
features.append('province_encoded')

joblib.dump(province_encoder, 'province_encoder.joblib')
print("Đã lưu bộ mã hóa tỉnh thành.")

X = df[features]
models = {}

for target_element in ELEMENTS:
    print(f"\n--- Huấn luyện mô hình cho: {target_element} ---")
    y = df[target_element]
    
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    lgbm = lgb.LGBMRegressor(
        objective='regression_l1',
        n_estimators=1000,
        learning_rate=0.05,
        num_leaves=31,
        random_state=42,
        n_jobs=-1
    )
    
    lgbm.fit(
        X_train, y_train,
        eval_set=[(X_test, y_test)],
        eval_metric='rmse',
        callbacks=[lgb.early_stopping(100, verbose=False)]
    )
    
    preds = lgbm.predict(X_test)
    rmse = np.sqrt(mean_squared_error(y_test, preds))
    print(f"RMSE trên tập test cho {target_element}: {rmse:.4f}")
    
    model_filename = f'model_{target_element}.joblib'
    joblib.dump(lgbm, model_filename)
    print(f"Đã lưu mô hình tại '{model_filename}'")
    models[target_element] = lgbm

print("\n--- HOÀN TẤT QUÁ TRÌNH HUẤN LUYỆN ---")
