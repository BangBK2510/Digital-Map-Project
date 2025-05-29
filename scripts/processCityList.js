const fs = require('fs');
const path = require('path');

// Đường dẫn đến file input và output
const inputFile = path.join(__dirname, '../public/data/full_city_list.txt');
const outputFile = path.join(__dirname, '../public/data/processed_city_list.json');

console.log('--- Bắt đầu xử lý danh sách thành phố ---');
console.log(`Đọc từ file: ${inputFile}`);
console.log(`Sẽ ghi ra file: ${outputFile}`);

try {
    // Đọc toàn bộ nội dung file input
    if (!fs.existsSync(inputFile)) {
        console.error(`LỖI: File input không tồn tại tại đường dẫn: ${inputFile}`);
        process.exit(1); // Thoát script nếu file không tồn tại
    }
    const fileContent = fs.readFileSync(inputFile, 'utf8');
    const lines = fileContent.split('\n'); // Tách file thành từng dòng
    const cities = [];

    console.log(`Tổng số dòng đọc được: ${lines.length}`);

    // Lặp qua từng dòng để xử lý, bỏ qua dòng header (dòng đầu tiên)
    for (let i = 1; i < lines.length; i++) {
        const lineNumber = i + 1; // Số dòng thực tế trong file (vì index mảng bắt đầu từ 0)
        let trimmedLine = lines[i].trim(); // Loại bỏ khoảng trắng thừa ở đầu và cuối dòng

        if (!trimmedLine) {
            // console.log(`Dòng ${lineNumber}: Trống, bỏ qua.`);
            continue; // Bỏ qua dòng trống
        }

        // console.log(`\n[Dòng ${lineNumber}] Đang xử lý: "${trimmedLine}"`);

        // --- LOGIC PHÂN TÍCH DÒNG (CSV với dấu chấm phẩy) ---
        // Định dạng dự kiến: "Country";"City";"CityId"
        const parts = trimmedLine.split(';');

        if (parts.length === 3) { // Mong đợi 3 phần: Country, City, CityId
            // Loại bỏ dấu ngoặc kép và khoảng trắng thừa cho từng phần
            // const country = parts[0].replace(/"/g, '').trim(); // Lấy Country nếu cần
            const cityName = parts[1].replace(/"/g, '').trim();
            const cityId = parts[2].replace(/"/g, '').trim();

            // Kiểm tra xem cityId có phải là số không và cityName có tồn tại không
            if (cityName && cityId && !isNaN(cityId)) {
                cities.push({
                    id: cityId,
                    name: cityName
                    // country: country // Thêm quốc gia nếu bạn muốn lưu trữ
                });
                // console.log(`  => Đã thêm: { id: "${cityId}", name: "${cityName}", country: "${country}" }`);
            } else {
                // console.warn(`  => Dòng ${lineNumber}: Dữ liệu không hợp lệ sau khi parse. CityName: "${cityName}", CityId: "${cityId}". Dòng gốc: "${trimmedLine}"`);
            }
        } else if (trimmedLine.toLowerCase().includes('"country";"city";"cityid"')) {
            // Đây có thể là dòng header nếu nó không phải là dòng đầu tiên (trường hợp hiếm)
            // console.log(`  => Dòng ${lineNumber}: Giống dòng header, bỏ qua. Dòng gốc: "${trimmedLine}"`);
        }
        else {
            // console.warn(`  => Dòng ${lineNumber}: Không đúng định dạng 3 phần tử phân tách bằng ';'. Số phần tử: ${parts.length}. Dòng gốc: "${trimmedLine}"`);
        }
        // --- KẾT THÚC LOGIC PHÂN TÍCH DÒNG ---
    }

    console.log(`\nSố thành phố hợp lệ đã được phân tích: ${cities.length}`);

    if (cities.length === 0 && lines.length > 1) { // Chỉ cảnh báo nếu có dòng dữ liệu để đọc nhưng không parse được gì
        console.warn("\nCẢNH BÁO QUAN TRỌNG: Không có thành phố nào được xử lý. \nVui lòng kiểm tra lại LOGIC PHÂN TÍCH DÒNG trong script và cấu trúc thực tế của file full_city_list.txt.\nXem kỹ các log chi tiết của từng dòng ở trên để xác định vấn đề.");
    }

    // Ghi mảng cities đã xử lý ra file JSON
    fs.writeFileSync(outputFile, JSON.stringify(cities, null, 2)); // null, 2 để JSON output dễ đọc hơn
    console.log(`Đã xử lý và lưu ${cities.length} thành phố vào ${outputFile}`);

} catch (error) {
    console.error('LỖI TRONG QUÁ TRÌNH XỬ LÝ:', error);
}

console.log('--- Kết thúc xử lý ---');