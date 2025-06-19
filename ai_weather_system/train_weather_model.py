# Mục đích: Đọc dữ liệu từ file CSV của Open-Meteo, xử lý và huấn luyện
# các mô hình AI dự báo thời tiết.
# ==============================================================================
import pandas as pd
import lightgbm as lgb
import joblib
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error, roc_auc_score, accuracy_score, confusion_matrix, ConfusionMatrixDisplay
import numpy as np
import matplotlib.pyplot as plt
import os

print("--- Bắt đầu quá trình huấn luyện mô hình (Mô hình Hai thành phần) ---")

if not os.path.exists('charts'):
    os.makedirs('charts')

# Các yếu tố đầu vào cho mô hình
ALL_INPUT_ELEMENTS = [
    'air_temperature', 'relative_humidity', 'precipitation_amount',
    'cloud_area_fraction', 'wind_speed', 'surface_pressure', 'dewpoint_2m'
]
# Các yếu tố được dự báo bằng mô hình hồi quy (regression)
REGRESSION_ELEMENTS = [
    'air_temperature', 'relative_humidity', 'wind_speed',
    'surface_pressure', 'dewpoint_2m'
]

# Đọc dữ liệu
input_filename = 'vietnam_weather_history.csv'
try:
    df = pd.read_csv(input_filename, parse_dates=['time'])
except FileNotFoundError:
    print(f"Lỗi: Không tìm thấy file '{input_filename}'.")
    exit()

print("Đã tải dữ liệu thành công.")

# 1. Tiền xử lý và tạo Feature Engineering
print("Đang tiền xử lý và tạo features...")
df = df.sort_values(by=['province', 'time']).reset_index(drop=True)
df.ffill(inplace=True)
df.bfill(inplace=True)

# Tạo các features tuần hoàn
df['hour_sin'] = np.sin(2 * np.pi * df['time'].dt.hour / 24)
df['hour_cos'] = np.cos(2 * np.pi * df['time'].dt.hour / 24)
df['day_of_year_sin'] = np.sin(2 * np.pi * df['time'].dt.dayofyear / 366)
df['day_of_year_cos'] = np.cos(2 * np.pi * df['time'].dt.dayofyear / 366)
# Tạo các features trễ và trung bình trượt
for element in ALL_INPUT_ELEMENTS:
    for i in range(1, 4):
        df[f'{element}_lag_{i}'] = df.groupby('province')[element].shift(i)
    df[f'{element}_rolling_mean_24'] = df.groupby('province')[element].transform(lambda x: x.shift(1).rolling(window=24, min_periods=1).mean())
df.dropna(inplace=True)
print("Tạo features hoàn tất.")

# 2. Chuẩn bị features và bộ mã hóa
features = ['hour_sin', 'hour_cos', 'day_of_year_sin', 'day_of_year_cos']
for element in ALL_INPUT_ELEMENTS:
    for i in range(1, 4):
        features.append(f'{element}_lag_{i}')
    features.append(f'{element}_rolling_mean_24')
province_encoder = {name: i for i, name in enumerate(df['province'].unique())}
df['province_encoded'] = df['province'].map(province_encoder)
features.append('province_encoded')
joblib.dump(province_encoder, 'province_encoder.joblib')
print("Đã lưu bộ mã hóa tỉnh thành.")

X = df[features]

# --- HUẤN LUYỆN CÁC MÔ HÌNH HỒI QUY THÔNG THƯỜNG ---
for target_element in REGRESSION_ELEMENTS:
    print(f"\n--- Huấn luyện mô hình HỒI QUY cho: {target_element} ---")
    y = df[target_element]
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    lgbm = lgb.LGBMRegressor(objective='regression_l1', random_state=42, n_jobs=-1)
    lgbm.fit(X_train, y_train, eval_set=[(X_test, y_test)], eval_metric='rmse', callbacks=[lgb.early_stopping(100, verbose=False)])
    
    preds = lgbm.predict(X_test)
    rmse = np.sqrt(mean_squared_error(y_test, preds))
    print(f"RMSE trên tập test cho {target_element}: {rmse:.4f}")

    model_filename = f'model_{target_element}.joblib'
    joblib.dump(lgbm, model_filename)
    print(f"Đã lưu mô hình tại '{model_filename}'")


# --- HUẤN LUYỆN MÔ HÌNH TÌNH TRẠNG MÂY ---
print("\n--- Huấn luyện mô hình PHÂN LOẠI cho: Tình trạng mây ---")
def map_cloud_to_condition(fraction):
    if fraction <= 10: return 0
    elif fraction <= 40: return 1
    elif fraction <= 70: return 2
    elif fraction < 100: return 3
    else: return 4

y_cloud = df['cloud_area_fraction'].apply(map_cloud_to_condition)
cloud_labels = {0: 'Trời quang', 1: 'Ít mây', 2: 'Mây rải rác', 3: 'Trời mây', 4: 'Trời nhiều mây'}
joblib.dump(cloud_labels, 'cloud_condition_labels.joblib')
print("Đã lưu nhãn cho các tình trạng mây.")

X_train, X_test, y_train, y_test = train_test_split(X, y_cloud, test_size=0.2, random_state=42, stratify=y_cloud)
cloud_classifier = lgb.LGBMClassifier(objective='multiclass', num_class=5, random_state=42, n_jobs=-1)
cloud_classifier.fit(X_train, y_train, eval_set=[(X_test, y_test)], eval_metric='multi_logloss', callbacks=[lgb.early_stopping(100, verbose=False)])

cloud_preds = cloud_classifier.predict(X_test)
accuracy = accuracy_score(y_test, cloud_preds)
print(f"Accuracy trên tập test cho tình trạng mây: {accuracy:.4f}")

cm = confusion_matrix(y_test, cloud_preds, labels=list(cloud_labels.keys()))
disp = ConfusionMatrixDisplay(confusion_matrix=cm, display_labels=list(cloud_labels.values()))
fig, ax = plt.subplots(figsize=(10, 10))
disp.plot(ax=ax, cmap='Blues', xticks_rotation='vertical')
plt.title('Ma trận nhầm lẫn cho Tình trạng mây')
plt.tight_layout()
chart_filename = os.path.join('charts', 'chart_cloud_condition_confusion_matrix.png')
plt.savefig(chart_filename)
plt.close()
print(f"Đã lưu ma trận nhầm lẫn tại '{chart_filename}'")

classifier_filename = 'model_cloud_condition.joblib'
joblib.dump(cloud_classifier, classifier_filename)
print(f"Đã lưu mô hình tình trạng mây tại '{classifier_filename}'")


# --- BƯỚC CẢI TIẾN: HUẤN LUYỆN MÔ HÌNH LƯỢNG MƯA HAI THÀNH PHẦN ---

# === Phần 1: Huấn luyện Mô hình Phân loại (Có mưa hay không?) ===
print("\n--- [Mưa P1] Huấn luyện mô hình PHÂN LOẠI: Có mưa hay không? ---")
y_is_raining = (df['precipitation_amount'] > 0).astype(int)
X_train, X_test, y_train, y_test = train_test_split(X, y_is_raining, test_size=0.2, random_state=42, stratify=y_is_raining)

rain_classifier = lgb.LGBMClassifier(objective='binary', random_state=42, n_jobs=-1, is_unbalanced=True)
rain_classifier.fit(X_train, y_train)
preds = rain_classifier.predict(X_test)
accuracy = accuracy_score(y_test, preds)
print(f"Accuracy của mô hình phân loại mưa: {accuracy:.4f}")

model_filename = 'model_rain_classifier.joblib'
joblib.dump(rain_classifier, model_filename)
print(f"Đã lưu mô hình phân loại mưa tại '{model_filename}'")

# === Phần 2: Huấn luyện Mô hình Hồi quy (Lượng mưa là bao nhiêu NẾU có mưa?) ===
print("\n--- [Mưa P2] Huấn luyện mô hình HỒI QUY: Lượng mưa khi có mưa ---")
# Lọc ra một tập dữ liệu chỉ chứa những ngày có mưa
rain_only_df = df[df['precipitation_amount'] > 0].copy()
X_rain = rain_only_df[features]
y_rain = rain_only_df['precipitation_amount']

X_train_r, X_test_r, y_train_r, y_test_r = train_test_split(X_rain, y_rain, test_size=0.2, random_state=42)

# Không cần xử lý mất cân bằng ở đây nữa
precipitation_regressor = lgb.LGBMRegressor(objective='regression_l1', random_state=42, n_jobs=-1)
precipitation_regressor.fit(X_train_r, y_train_r)
preds_r = precipitation_regressor.predict(X_test_r)
rmse = np.sqrt(mean_squared_error(y_test_r, preds_r))
print(f"RMSE của mô hình hồi quy mưa (trên dữ liệu có mưa): {rmse:.4f}")

# Vẽ biểu đồ cho mô hình hồi quy mưa (sẽ đẹp hơn nhiều)
plt.figure(figsize=(10, 10))
plt.scatter(y_test_r, preds_r, alpha=0.5)
lims = [0, np.max([y_test_r.max(), preds_r.max()])]
plt.plot(lims, lims, 'r--', alpha=0.75, zorder=0, label='Dự đoán hoàn hảo (y=x)')
plt.xlabel("Giá trị thực tế (khi có mưa)")
plt.ylabel("Giá trị dự đoán (khi có mưa)")
plt.title("So sánh kết quả cho LƯỢNG MƯA (chỉ khi có mưa)")
plt.legend()
plt.grid(True)
plt.axis('equal')
chart_filename = os.path.join('charts', 'chart_precipitation_amount_regressor_comparison.png')
plt.savefig(chart_filename)
plt.close()
print(f"Đã lưu biểu đồ hồi quy mưa tại '{chart_filename}'")

model_filename = 'model_precipitation_regressor.joblib'
joblib.dump(precipitation_regressor, model_filename)
print(f"Đã lưu mô hình hồi quy mưa tại '{model_filename}'")


print("\n--- HOÀN TẤT QUÁ TRÌNH HUẤN LUYỆN ---")