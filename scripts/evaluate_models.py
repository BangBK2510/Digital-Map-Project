# Nhiệm vụ: Đánh giá chất lượng mô hình từ dữ liệu trong /server-ai

import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestRegressor, RandomForestClassifier
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import mean_absolute_error, accuracy_score
from sklearn.model_selection import train_test_split
import matplotlib.pyplot as plt
import os
from datetime import datetime
import warnings

# --- CẤU HÌNH ---
# *** FIXED PATHS: Trỏ đến đúng thư mục /server-ai ***
SCRIPT_DIR = os.path.dirname(os.path.realpath(__file__))
SERVER_AI_DIR = os.path.join(SCRIPT_DIR, '..', 'server-ai')
DATA_FILE = os.path.join(SERVER_AI_DIR, 'all_cities_weather_data.csv')
LOG_FILE = os.path.join(SERVER_AI_DIR, 'evaluation_log.csv')
PLOT_FILE = os.path.join(SERVER_AI_DIR, 'model_performance_over_time.png')
LAGS = 6

warnings.filterwarnings("ignore", category=UserWarning)

# --- CÁC HÀM XỬ LÝ DỮ LIỆU ---
def group_weather_condition_3_classes(symbol_code):
    if not isinstance(symbol_code, str): return 'Trời mây'
    s_lower = symbol_code.lower()
    if any(p in s_lower for p in ['rain', 'sleet', 'shower', 'snow', 'drizzle']): return 'Mưa'
    if any(p in s_lower for p in ['clearsky_day', 'fair_day']): return 'Nắng'
    return 'Trời mây'

def preprocess_met_df(df):
    df2 = df.copy()
    df2["hour"], df2["sin_hour"], df2["cos_hour"] = df2.index.hour, np.sin(2*np.pi*df2.index.hour/24), np.cos(2*np.pi*df2.index.hour/24)
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

if __name__ == "__main__":
    print("--- Bắt đầu Kịch bản Đánh giá Hiệu năng Mô hình ---")

    if not os.path.exists(DATA_FILE):
        print(f"LỖI: Không tìm thấy file dữ liệu '{DATA_FILE}'. Vui lòng chạy data_collector.py trước.")
        exit()

    df_all = pd.read_csv(DATA_FILE, index_col='time', parse_dates=True)
    cities_in_data = df_all['city_name'].unique()
    evaluation_results, today_str = [], datetime.now().strftime('%Y-%m-%d')

    for city in cities_in_data:
        print(f"\n-> Đang đánh giá cho: {city}")
        df_city = df_all[df_all['city_name'] == city]
        if len(df_city) < 50:
            print(f"  CẢNH BÁO: Dữ liệu quá ít ({len(df_city)} dòng), bỏ qua.")
            continue
        df_processed = preprocess_met_df(df_city)
        X, y_temp, y_cond = create_training_samples(df_processed, lags=LAGS)
        if len(np.unique(y_cond)) < 2:
             print(f"  CẢNH BÁO: Chỉ có 1 lớp tình trạng, không thể đánh giá độ chính xác.")
             continue
        X = np.nan_to_num(X)
        le = LabelEncoder()
        y_cond_enc = le.fit_transform(y_cond)
        
        X_train, X_test, y_temp_train, y_temp_test, y_cond_train, y_cond_test = train_test_split(
            X, y_temp, y_cond_enc, test_size=0.25, random_state=42, stratify=y_cond_enc)
        
        reg = RandomForestRegressor(n_estimators=100, random_state=42).fit(X_train, y_temp_train)
        clf = RandomForestClassifier(n_estimators=100, random_state=42, class_weight='balanced').fit(X_train, y_cond_train)
        mae, acc = mean_absolute_error(y_temp_test, reg.predict(X_test)), accuracy_score(y_cond_test, clf.predict(X_test))
        print(f"  MAE: {mae:.2f}°C, Độ chính xác: {acc:.2%}")
        evaluation_results.append({'evaluation_date': today_str, 'city_name': city, 'data_points': len(df_city), 'mae': mae, 'accuracy': acc})

    if evaluation_results:
        new_log_df = pd.DataFrame(evaluation_results)
        log_df = pd.concat([pd.read_csv(LOG_FILE), new_log_df]) if os.path.exists(LOG_FILE) else new_log_df
        log_df.drop_duplicates(subset=['evaluation_date', 'city_name'], keep='last', inplace=True)
        log_df.to_csv(LOG_FILE, index=False)
        print(f"\nĐã lưu kết quả đánh giá vào file '{LOG_FILE}'.")
        
        print(f"Đang tạo biểu đồ và lưu vào '{PLOT_FILE}'...")
        plt.style.use('seaborn-v0_8-whitegrid')
        fig, ax = plt.subplots(figsize=(14, 8))
        log_df['evaluation_date'] = pd.to_datetime(log_df['evaluation_date'])
        for city_name, group in log_df.groupby('city_name'):
            if len(group) > 1: ax.plot(group['evaluation_date'], group['accuracy'] * 100, marker='o', linestyle='-', label=city_name)
        ax.set(title='Độ chính xác của Mô hình theo Thời gian', xlabel='Ngày Đánh giá', ylabel='Độ chính xác (%)')
        ax.legend(title='Thành phố', bbox_to_anchor=(1.05, 1), loc='upper left')
        ax.yaxis.set_major_formatter(plt.FuncFormatter('{:.0f}%'.format))
        fig.autofmt_xdate()
        plt.tight_layout(rect=[0, 0, 0.85, 1])
        plt.savefig(PLOT_FILE)
        plt.close()
        print("Tạo biểu đồ hoàn tất.")