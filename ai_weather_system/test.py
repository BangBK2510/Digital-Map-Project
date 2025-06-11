import requests
from requests.auth import HTTPBasicAuth

client_id = "88951464-2202-4417-8a9e-2b01c6f04601"
# Nếu cần client_secret, dùng HTTPBasicAuth(client_id, client_secret)

def find_nearest_stations_requests(lat, lon, max_count=5):
    url = "https://frost.met.no/sources"
    params = {
        "geometry": f"nearest(POINT({lon} {lat}))",
        "nearestmaxcount": str(max_count),
        "validtime": "now"
    }
    headers = {
        "User-Agent": "MyApp/1.0 contact@yourdomain.com"
    }
    resp = requests.get(url, params=params, headers=headers, auth=HTTPBasicAuth(client_id, ""))
    if resp.status_code != 200:
        print("Lỗi HTTP:", resp.status_code, resp.text)
        return None
    data = resp.json()
    # Cấu trúc JSON thường: {"data": [ {source metadata}, ... ], ...}
    # Bạn có thể parse thành DataFrame hoặc in ra.
    return data

# Ví dụ:
data_hanoi = find_nearest_stations_requests(21.0285, 105.8542, max_count=10)
print(data_hanoi)
