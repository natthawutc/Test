// ID sheet ที่กำหนด
const SPREADSHEET_ID = '1L6TmseqPMRBdG5hP9WvK0xZ-pgvRmwBJYVFNispHEU4';

// กำหนดเวอร์ชันของแอปพลิเคชัน
const APP_VERSION = "Version 1.0.0";

// 1. ฟังก์ชันหลักสำหรับรับ Request แบบ POST จาก Frontend (Github Pages)
function doPost(e) {
  try {
    // แปลงข้อมูลที่ส่งมาให้อยู่ในรูปแบบ JSON Object
    const requestData = JSON.parse(e.postData.contents);
    const action = requestData.action;
    const data = requestData.data || {};
    
    let result = {};

    // 2. ระบบ Router: แยกการทำงานตาม Action ที่ส่งมา
    if (action === "testConnection") {
      result = { 
        success: true, 
        message: "เชื่อมต่อ Google Apps Script สำเร็จ!", 
        version: APP_VERSION,
        received: data 
      };
      
    } else if (action === "getAppVersion") {
      // ดึงข้อมูลเวอร์ชันไปแสดงผล
      result = {
        success: true,
        version: APP_VERSION
      };

    } else if (action === "verifyLogin") {
      // ตรวจสอบการล็อกอิน
      result = verifyLogin(data.empId);

    } else if (action === "searchCoupon") {
      // ค้นหาคูปอง
      result = searchCouponData(data.couponCode);

    } else if (action === "saveUsage") {
      // บันทึกการใช้งานคูปอง
      result = saveCouponUsage(data.empId, data.couponCode, data.points);

    } else if (action === "getCustomerList") {
      // ดึงรายชื่อลูกค้าสำหรับ Dropdown
      result = getCustomerList();

    } else if (action === "searchCustomerRewards") {
      // ค้นหาข้อมูลของรางวัลของลูกค้า
      result = searchCustomerRewards(data.customerId);

    } else {
      // กรณีส่ง Action มาผิด
      result = { 
        success: false, 
        message: "ไม่พบ Action ที่ระบุ" 
      };
    }

    // 3. ส่งข้อมูลกลับไปยัง Frontend ในรูปแบบ JSON
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    // จัดการ Error กรณีเกิดข้อผิดพลาดรุนแรง
    return ContentService.createTextOutput(JSON.stringify({ 
      success: false, 
      message: "Server Error: " + error.message 
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// 4. ฟังก์ชันสำหรับเช็คสถานะ API (เมื่อเอา URL ไปวางบน Browser ตรงๆ)
function doGet(e) {
  return ContentService.createTextOutput("Backend API is running properly. Version: " + APP_VERSION + " | Use POST method to interact.");
}

// ==========================================
// ฟังก์ชันจัดการข้อมูล
// ==========================================

// ฟังก์ชันตรวจสอบการล็อกอิน
function verifyLogin(empId) {
  try {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('DB-พนักงาน');
    const data = sheet.getDataRange().getDisplayValues();
    
    // เริ่มค้นหาจากแถวที่ 2 (index 1) ข้าม Header
    for (let i = 1; i < data.length; i++) {
      if (data[i][1] === empId) { // คอลัมน์ B คือ index 1
        return { success: true, message: "เข้าสู่ระบบสำเร็จ" };
      }
    }
    return { success: false, message: "ไม่พบรหัสพนักงานนี้ในระบบ" };
  } catch (error) {
    return { success: false, message: "เกิดข้อผิดพลาด: " + error.message };
  }
}

// ฟังก์ชันค้นหาข้อมูลคูปอง
function searchCouponData(couponCode) {
  try {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('App-02');
    const data = sheet.getDataRange().getDisplayValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][1] === couponCode) { // คอลัมน์ B คือ index 1 (รหัสคูปอง)
        const status = data[i][8]; // คอลัมน์ I คือ index 8 (สถานะ: 1=ใช้แล้ว, 2=หมดอายุ)
        
        // เช็คสถานะคูปองก่อนคืนค่าข้อมูล
        if (status === '1') {
          return { success: true, found: false, message: "คูปองนี้ถูกใช้งานไปแล้ว ไม่สามารถรับสิทธิ์ซ้ำได้" };
        }
        if (status === '2') {
          return { success: true, found: false, message: "คูปองนี้หมดอายุแล้ว ไม่สามารถใช้งานได้" };
        }

        // ถ้าสถานะปกติ (ไม่ใช่ 1 และ 2) ให้ส่งข้อมูลกลับไปแสดงเพื่อแลกรับรางวัล
        return {
          success: true,
          found: true,
          name: data[i][2], // คอลัมน์ C (ชื่อของรางวัล)
          points: data[i][3], // คอลัมน์ D (แต้มที่ใช้แลก)
          image: convertDriveUrl(data[i][4]), // คอลัมน์ E (รูปของรางวัล)
          expiry: data[i][5] // คอลัมน์ F (วันหมดอายุ)
        };
      }
    }
    return { success: true, found: false, message: "ไม่พบรหัสคูปองนี้" };
  } catch (error) {
    return { success: false, found: false, message: "เกิดข้อผิดพลาด: " + error.message };
  }
}

// ฟังก์ชันบันทึกการใช้คูปอง
function saveCouponUsage(empId, couponCode, points) {
  try {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('DB-ประวัติรับคูปอง');
    const timestamp = new Date();
    
    // บันทึก: A=ประทับเวลา, B=รหัสพนักงาน, C=รหัสคูปอง, D=จำนวนแต้ม
    sheet.appendRow([timestamp, empId, couponCode, points]);
    return { success: true };
  } catch (error) {
    return { success: false, message: "เกิดข้อผิดพลาดในการบันทึก: " + error.message };
  }
}

// ฟังก์ชันดึงรายชื่อลูกค้าจากชีท DDL คอลัมน์ A
function getCustomerList() {
  try {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('DDL');
    if (!sheet) return { success: false, message: "ไม่พบชีท 'DDL'" };
    
    const data = sheet.getRange("A2:A").getDisplayValues();
    const list = [];
    
    for (let i = 0; i < data.length; i++) {
      if (data[i][0] !== "") {
        list.push(data[i][0]);
      }
    }
    
    return { success: true, data: list };
  } catch (error) {
    return { success: false, message: "เกิดข้อผิดพลาดในการดึงข้อมูลลูกค้า: " + error.message };
  }
}

// ฟังก์ชันค้นหาข้อมูลของลูกค้า และ ของรางวัลจาก App-01 และ App-02
function searchCustomerRewards(customerId) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    
    // 1. ดึงข้อมูลจำนวนแต้ม และ ปริมาณสะสมจากชีท "App-01"
    let points = "0";
    let volume = "0";
    let foundInApp01 = false;
    const sheetApp01 = ss.getSheetByName('App-01');
    if (sheetApp01) {
      const data01 = sheetApp01.getDataRange().getDisplayValues();
      for (let i = 1; i < data01.length; i++) {
        if (data01[i][0] === customerId) { // เช็ครหัส 7 หลักในคอลัมน์ A
          volume = data01[i][8];  // คอลัมน์ I (ปริมาณสะสม)
          points = data01[i][10]; // คอลัมน์ K (จำนวนแต้ม)
          foundInApp01 = true;
          break; // เจอแล้วหยุดหา
        }
      }
    }

    // 2. ดึงข้อมูลของรางวัลจากชีท "App-02"
    let rewards = [];
    const sheetApp02 = ss.getSheetByName('App-02');
    if (sheetApp02) {
      const data02 = sheetApp02.getDataRange().getDisplayValues();
      for (let i = 1; i < data02.length; i++) {
        if (data02[i][0] === customerId) {
          // ดึงเฉพาะสถานะ '0' = ใช้งานได้
          if (data02[i][8] === '0') {
            rewards.push({
              code: data02[i][1],       // คอลัมน์ B (รหัสคูปอง)
              name: data02[i][2],       // คอลัมน์ C (ชื่อของรางวัล)
              image: convertDriveUrl(data02[i][4]), // คอลัมน์ E (รูป)
              expiry: data02[i][5],     // คอลัมน์ F (วันหมดอายุ)
              redeemDate: data02[i][6], // คอลัมน์ G (วันที่แลก)
              status: data02[i][8]      // คอลัมน์ I (สถานะ)
            });
          }
        }
      }
    }
    
    return { 
      success: true, 
      data: {
        foundInApp01: foundInApp01,
        points: points,
        volume: volume,
        rewards: rewards
      }
    };
  } catch (error) {
    return { success: false, message: "เกิดข้อผิดพลาดในการดึงข้อมูลของรางวัล: " + error.message };
  }
}

// Helper: แปลงลิงก์ Google Drive ให้อยู่ในรูปแบบที่แสดงรูปภาพได้โดยตรง
function convertDriveUrl(url) {
  if (!url) return '';
  const match = url.match(/[-\w]{25,}/);
  if (match) {
    return 'https://drive.google.com/thumbnail?id=' + match[0] + '&sz=w800';
  }
  return url;
}
