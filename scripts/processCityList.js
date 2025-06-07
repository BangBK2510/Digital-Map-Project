const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch'); // Sử dụng node-fetch phiên bản 2

// Đường dẫn đến file input và output
const inputFile = path.join(__dirname, '../public/data/full_city_list.txt');
const outputFile = path.join(__dirname, '../public/data/processed_city_list_with_coords.json'); // Đổi tên file output

// --- CẤU HÌNH ---
// Giới hạn số lượng thành phố để xử lý (đặt giá trị nhỏ để test, ví dụ: 10)
// Đặt là null hoặc một số lớn (ví dụ: 4000) để xử lý tất cả 
const LIMIT_CITIES_TO_PROCESS = null; // <<<< THAY ĐỔI GIÁ TRỊ NÀY ĐỂ TEST HOẶC CHẠY THẬT
// Độ trễ giữa mỗi lần gọi API (miligiây) để tránh bị chặn
const API_CALL_DELAY = 300; // 300ms, bạn có thể tăng lên nếu gặp vấn đề

console.log('--- Bắt đầu xử lý danh sách thành phố (có lấy tọa độ) ---');
console.log(`Đọc từ file: ${inputFile}`);
console.log(`Sẽ ghi ra file: ${outputFile}`);
if (LIMIT_CITIES_TO_PROCESS) {
    console.log(`GIỚI HẠN: Sẽ chỉ xử lý tối đa ${LIMIT_CITIES_TO_PROCESS} thành phố.`);
}
console.log(`Độ trễ giữa các API call: ${API_CALL_DELAY}ms`);

// Hàm tiện ích để tạo độ trễ
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function processCities() {
    try {
        if (!fs.existsSync(inputFile)) {
            console.error(`LỖI: File input không tồn tại tại đường dẫn: ${inputFile}`);
            process.exit(1);
        }
        const fileContent = fs.readFileSync(inputFile, 'utf8');
        const lines = fileContent.split('\n');
        const citiesWithCoords = [];

        console.log(`Tổng số dòng đọc được từ full_city_list.txt: ${lines.length}`);

        let processedCount = 0;
        // Lặp qua từng dòng để xử lý, bỏ qua dòng header (dòng đầu tiên)
        for (let i = 1; i < lines.length; i++) {
            if (LIMIT_CITIES_TO_PROCESS && processedCount >= LIMIT_CITIES_TO_PROCESS) {
                console.log(`Đã đạt giới hạn ${LIMIT_CITIES_TO_PROCESS} thành phố. Dừng xử lý.`);
                break;
            }

            const lineNumber = i + 1;
            let trimmedLine = lines[i].trim();

            if (!trimmedLine) continue;

            const parts = trimmedLine.split(';');
            if (parts.length === 3) {
                const countryName = parts[0].replace(/"/g, '').trim(); // Lấy thêm tên quốc gia cho dễ debug
                const cityName = parts[1].replace(/"/g, '').trim();
                const cityId = parts[2].replace(/"/g, '').trim();

                if (cityName && cityId && !isNaN(cityId)) {
                    console.log(`\n[${processedCount + 1}/${LIMIT_CITIES_TO_PROCESS || lines.length -1}] Đang xử lý: ID ${cityId}, Tên: ${cityName}, Quốc gia: ${countryName}`);
                    try {
                        const apiUrl = `https://worldweather.wmo.int/en/json/${cityId}_en.json`;
                        // console.log(`  Gọi API: ${apiUrl}`);
                        const response = await fetch(apiUrl);

                        if (!response.ok) {
                            console.warn(`  LỖI API cho City ID ${cityId} (${cityName}): Status ${response.status} - ${response.statusText}`);
                            // Vẫn thêm thành phố nhưng không có tọa độ, hoặc bỏ qua
                            // citiesWithCoords.push({ id: cityId, name: cityName, lat: null, lon: null, error: `API Error ${response.status}` });
                            await delay(API_CALL_DELAY); // Vẫn đợi trước khi thử thành phố tiếp theo
                            continue;
                        }

                        const cityData = await response.json();

                        if (cityData && cityData.city && cityData.city.cityLatitude && cityData.city.cityLongitude) {
                            const lat = parseFloat(cityData.city.cityLatitude);
                            const lon = parseFloat(cityData.city.cityLongitude);

                            if (!isNaN(lat) && !isNaN(lon)) {
                                citiesWithCoords.push({
                                    id: cityId,
                                    name: cityName,
                                    country: countryName, // Thêm quốc gia
                                    lat: lat,
                                    lon: lon
                                });
                                console.log(`  THÀNH CÔNG: Đã lấy tọa độ cho ${cityName} -> Lat: ${lat}, Lon: ${lon}`);
                            } else {
                                console.warn(`  CẢNH BÁO: Tọa độ không hợp lệ cho ${cityName} (ID: ${cityId}). Lat: ${cityData.city.cityLatitude}, Lon: ${cityData.city.cityLongitude}`);
                                // citiesWithCoords.push({ id: cityId, name: cityName, lat: null, lon: null, error: "Invalid coordinates" });
                            }
                        } else {
                            console.warn(`  CẢNH BÁO: Dữ liệu JSON trả về cho ${cityName} (ID: ${cityId}) không có thông tin tọa độ hoặc cấu trúc không đúng.`);
                            // citiesWithCoords.push({ id: cityId, name: cityName, lat: null, lon: null, error: "Missing coordinate data" });
                        }
                        processedCount++;
                    } catch (fetchError) {
                        console.error(`  LỖI FETCH cho City ID ${cityId} (${cityName}):`, fetchError.message);
                        // citiesWithCoords.push({ id: cityId, name: cityName, lat: null, lon: null, error: fetchError.message });
                    }
                    await delay(API_CALL_DELAY); // Đợi giữa các lần gọi API
                }
            }
        }

        console.log(`\nTổng số thành phố đã xử lý và có tọa độ: ${citiesWithCoords.length}`);

        if (citiesWithCoords.length === 0 && lines.length > 1 && processedCount > 0) {
            console.warn("\nCẢNH BÁO QUAN TRỌNG: Đã xử lý một số thành phố nhưng không lấy được tọa độ cho thành phố nào cả.");
        }

        fs.writeFileSync(outputFile, JSON.stringify(citiesWithCoords, null, 2));
        console.log(`Đã xử lý và lưu ${citiesWithCoords.length} thành phố (với tọa độ) vào ${outputFile}`);

    } catch (error) {
        console.error('LỖI NGOÀI VÒNG LẶP XỬ LÝ CHÍNH:', error);
    }
    console.log('--- Kết thúc xử lý ---');
}

processCities(); // Chạy hàm chính
