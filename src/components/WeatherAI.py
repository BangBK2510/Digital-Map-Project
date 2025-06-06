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

warnings.filterwarnings("ignore", category=UserWarning)

def fetch_met_no_forecast(lat, lon):
    """
    Fetches weather forecast data from the MET Norway API.
    """
    url = f"https://api.met.no/weatherapi/locationforecast/2.0/compact?lat={lat}&lon={lon}"
    headers = {"User-Agent": "WeatherAI/9.0 github.com/your-repo"}
    resp = requests.get(url, headers=headers, timeout=10)
    resp.raise_for_status()

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
    Simplifies detailed symbols into a binary 'Mưa' vs 'Không Mưa' classification.
    """
    if not isinstance(symbol_code, str):
        return 'Không Mưa'

    s_lower = symbol_code.lower()
    
    if any(p in s_lower for p in ['rain', 'sleet', 'shower', 'snow', 'drizzle']):
        return 'Mưa'
    
    return 'Không Mưa'


def preprocess_met_df(df):
    """
    Performs preprocessing on the raw DataFrame.
    """
    df2 = df.copy()
    df2["hour"] = df2.index.hour
    df2["sin_hour"] = np.sin(2 * np.pi * df2["hour"] / 24)
    df2["cos_hour"] = np.cos(2 * np.pi * df2["hour"] / 24)
    df2["is_night"] = df2["hour"].apply(lambda h: 1 if (h < 6 or h > 18) else 0)
    df2["precip_1h"] = df2["precip_1h"].fillna(0.0)
    
    df2['condition'] = df2['symbol_code'].apply(group_weather_condition)

    df2 = df2.dropna(subset=["temp", "rhum", "pres", "wind_speed", "cloud_frac"])
    return df2

if __name__ == "__main__":
    # 1. Fetch and process data
    lat, lon = 21.0278, 105.8342
    print("Đang tải dữ liệu dự báo từ MET Norway...")
    df_raw = fetch_met_no_forecast(lat, lon)
    df = preprocess_met_df(df_raw)
    print("Tải và xử lý dữ liệu thành công.")

    print("\nPhân loại điều kiện thời tiết từ API:")
    print(df["condition"].value_counts())

    # 2. Build features and labels for BOTH models
    lags = 4
    X_list, y_temp_list, y_cond_list = [], [], []

    for i in range(lags, len(df) - 1):
        past = df.iloc[i - lags : i]
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
        feat.extend([df["sin_hour"].iloc[i], df["cos_hour"].iloc[i], df["is_night"].iloc[i]])
        
        X_list.append(feat)
        y_temp_list.append(df["temp"].iloc[i+1])
        y_cond_list.append(df["condition"].iloc[i+1])

    if not X_list:
        print("\nLỖI: Không tạo được mẫu huấn luyện nào. Dữ liệu từ API có thể quá ít.")
        exit()

    X = np.array(X_list)
    y_temp = np.array(y_temp_list)
    y_cond = np.array(y_cond_list)
    X = np.nan_to_num(X)

    # 3. Encode condition labels and split all data
    le = LabelEncoder()
    y_cond_enc = le.fit_transform(y_cond)
    
    split_idx = int(len(X) * 0.8)
    X_train, X_test = X[:split_idx], X[split_idx:]
    y_temp_train, y_temp_test = y_temp[:split_idx], y_temp[split_idx:]
    y_cond_train_enc, y_cond_test_enc = y_cond_enc[:split_idx], y_cond_enc[split_idx:]
    
    print(f"\nTổng số mẫu: {len(X)}")
    print(f"Số mẫu huấn luyện: {len(X_train)}")
    print(f"Số mẫu kiểm tra: {len(X_test)}")

    # 4. Train and evaluate the Temperature Regressor
    print("\nĐang huấn luyện và đánh giá mô hình dự báo Nhiệt độ...")
    reg = RandomForestRegressor(n_estimators=100, random_state=42, n_jobs=-1)
    reg.fit(X_train, y_temp_train)
    pred_temp = reg.predict(X_test)
    mae = mean_absolute_error(y_temp_test, pred_temp)
    print("Huấn luyện mô hình Nhiệt độ hoàn tất.")
    
    # 5. Train and evaluate the Condition Classifier
    print("\nĐang huấn luyện và đánh giá mô hình dự báo Tình trạng...")
    param_grid = {
        'n_estimators': [100, 150],
        'max_depth': [5, 10, None],
        'min_samples_leaf': [1, 3],
        'class_weight': ['balanced', 'balanced_subsample']
    }
    cv = StratifiedKFold(n_splits=3, shuffle=True, random_state=42)
    grid_search = GridSearchCV(
        estimator=RandomForestClassifier(random_state=42),
        param_grid=param_grid, scoring="accuracy", cv=cv, n_jobs=-1, verbose=1
    )
    grid_search.fit(X_train, y_cond_train_enc)
    best_clf = grid_search.best_estimator_
    pred_cond = best_clf.predict(X_test)
    acc = accuracy_score(y_cond_test_enc, pred_cond)
    print("Huấn luyện mô hình Tình trạng hoàn tất.")


    # 6. Print results
    print("\n--- KẾT QUẢ ĐÁNH GIÁ MÔ HÌNH ---")
    print(f"Thời gian hiện tại (local): {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Sai số tuyệt đối trung bình (MAE) cho Nhiệt độ: {mae:.2f} °C")
    print(f"Độ chính xác (Accuracy) cho Tình trạng: {acc:.2%}")
    
    # 7. Detailed Forecast using our trained models
    print("\n--- DỰ BÁO CHI TIẾT (sử dụng các mô hình đã huấn luyện) ---")
    now_local = datetime.now()
    start_forecast_time = (now_local + timedelta(hours=1)).replace(minute=0, second=0, microsecond=0)
    
    if len(df) < lags:
        print("\nLỖI: Không đủ dữ liệu từ API để bắt đầu dự báo.")
    else:
        # Create initial window from the end of the dataframe
        initial_window_df = df.iloc[-lags:]
        window_data = initial_window_df[['temp', 'rhum', 'pres', 'wind_speed', 'cloud_frac', 'precip_1h']].to_dict('records')

        current_time = start_forecast_time
        # Predict for the next 24 hours
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

            # Use our trained models to predict BOTH temperature and condition
            predicted_temp = reg.predict(feat_arr)[0]
            predicted_cond_enc = best_clf.predict(feat_arr)[0]
            predicted_condition = le.inverse_transform([predicted_cond_enc])[0]
            
            print(f"Dự báo lúc {current_time.strftime('%Y-%m-%d %H:%M')}: ~{predicted_temp:.1f}°C, Tình trạng: {predicted_condition}")

            # Update window for the next iteration
            if predicted_condition == 'Mưa':
                next_precip, next_cloud = 0.5, 100.0
            else: # Không Mưa
                next_precip, next_cloud = 0.0, 50.0

            window_data.pop(0)
            new_entry = window_data[-1].copy()
            new_entry.update({'temp': predicted_temp, 'precip_1h': next_precip, 'cloud_frac': next_cloud})
            window_data.append(new_entry)

            current_time += timedelta(hours=1)


    # 8. Plot results for the temperature model
    max_plots = min(100, len(y_temp_test)) if y_temp_test.size > 0 else 0
    if max_plots > 0:
        plt.figure(figsize=(12, 6))
        plt.plot(range(max_plots), y_temp_test[:max_plots], marker='o', linestyle='-', label="Nhiệt độ Thực tế (trong tập test)")
        plt.plot(range(max_plots), pred_temp[:max_plots], marker='x', linestyle='--', label="Nhiệt độ Dự báo (bởi mô hình)")
        plt.legend()
        plt.title(f"So sánh hiệu năng Mô hình Nhiệt độ ({max_plots} mẫu đầu tiên của tập test)")
        plt.xlabel("Chỉ số mẫu trong tập test")
        plt.ylabel("Nhiệt độ (°C)")
        plt.grid(True)
        ax = plt.gca()
        ax.xaxis.set_major_locator(MaxNLocator(integer=True))
        plt.tight_layout()
        plt.show()
