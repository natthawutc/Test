// ID sheet ที่กำหนด
const SPREADSHEET_ID = '1L6TmseqPMRBdG5hP9WvK0xZ-pgvRmwBJYVFNispHEU4';

// กำหนดเวอร์ชันของแอปพลิเคชัน
const APP_VERSION = "Version 1.0.0";

// =========================================================================
// 1. ฟังก์ชันหลักสำหรับรับ Request แบบ POST จาก Frontend (Github Pages)
// =========================================================================
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
      // เพิ่ม Action สำหรับดึงข้อมูลเวอร์ชันโดยเฉพาะ
      result = { 
        success: true, 
        version: APP_VERSION 
      };
      
    } else if (action === "loginUser") {
      result = loginUser(data.phone, data.password);
      
    } else if (action === "redeemReward") {
      result = redeemReward(data.customerId, data.rewardName, data.points, data.rewardImage, data.rewardCode);
      
    } else if (action === "changeUserPassword") {
      result = changeUserPassword(data.customerId, data.newPassword);
      
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

// =========================================================================
// ฟังก์ชันการทำงานหลัก (Business Logic)
// =========================================================================

// ฟังก์ชันสำหรับแปลงลิงก์ Google Drive เป็นลิงก์รูปภาพ Thumbnail
function getDriveImageUrl(url) {
  const defaultGiftBoxUrl = 'https://img.icons8.com/color/400/gift.png';

  if (!url || String(url).trim() === '') {
    return defaultGiftBoxUrl;
  }
  
  try {
    if (String(url).match(/\.(jpeg|jpg|png|gif)$/i) != null) {
      return url;
    }
    const match = String(url).match(/[-\w]{25,}/);
    if (match) {
      return 'https://drive.google.com/thumbnail?id=' + match[0] + '&sz=w500';
    }
    return defaultGiftBoxUrl;
  } catch (error) {
    return defaultGiftBoxUrl;
  }
}

// ฟังก์ชันตรวจสอบการเข้าสู่ระบบ
function loginUser(phone, password) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('App-01');
    if (!sheet) return { success: false, message: 'ไม่พบชีท "App-01"' };
    
    const data = sheet.getDataRange().getValues();
    let userData = null;
    
    // เช็คเบอร์โทรจากคอลัมน์ C (index 2) และรหัสผ่านคอลัมน์ D (index 3)
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][2]).trim() === String(phone).trim() && 
          String(data[i][3]).trim() === String(password).trim()) {
        userData = {
          success: true,
          customerId: data[i][0],        // คอลัมน์ A - รหัสลูกค้า
          customerName: data[i][1],      // คอลัมน์ B - ชื่อลูกค้า
          points: data[i][10],           // คอลัมน์ K - จำนวนแต้ม
          accumulatedVolume: data[i][8], // คอลัมน์ I - ปริมาณสะสมปีปัจจุบัน
          level: data[i][11]             // คอลัมน์ L - เลเวล
        };
        break;
      }
    }

    if (!userData) {
      return { success: false, message: 'เบอร์โทรศัพท์หรือรหัสผ่านไม่ถูกต้อง' };
    }

    // --- 1. ดึงข้อมูลของรางวัลที่แลกได้ ---
    const promoSheet = ss.getSheetByName('จัดการโปรโมชัน');
    let rewards = [];
    if (promoSheet) {
      const lastRow = promoSheet.getLastRow();
      if (lastRow >= 2) {
        const promoData = promoSheet.getRange(2, 1, lastRow - 1, 8).getValues();
        for (let j = 0; j < promoData.length; j++) {
          if (promoData[j][0] && promoData[j][6] === true) {
            rewards.push({
              name: promoData[j][0],                             
              image: getDriveImageUrl(promoData[j][1]),          
              condition: promoData[j][2] || '-',                 
              points: promoData[j][3],
              rewardCode: promoData[j][7] || '' 
            });
          }
        }
      }
    }
    userData.rewards = rewards; 

    // --- 2. ดึงข้อมูล "รางวัลของฉัน" จาก App-02 ---
    const myRewardsSheet = ss.getSheetByName('App-02');
    let myRewards = [];

    if (myRewardsSheet) {
      const lastRowApp02 = myRewardsSheet.getLastRow();
      if (lastRowApp02 >= 2) {
        const app02Data = myRewardsSheet.getRange(2, 1, lastRowApp02 - 1, 9).getValues();

        for (let k = 0; k < app02Data.length; k++) {
          if (String(app02Data[k][0]).trim() === String(userData.customerId).trim()) {
            
            // จัดการวันหมดอายุ
            let expDate = app02Data[k][5]; 
            let rawExpireDate = 9999999999999;
            if (expDate instanceof Date) {
              rawExpireDate = expDate.getTime();
              const d = expDate.getDate().toString().padStart(2, '0');
              const m = (expDate.getMonth() + 1).toString().padStart(2, '0');
              const y = expDate.getFullYear() + 543; 
              expDate = `${d}/${m}/${y}`;
            } else {
              expDate = expDate ? String(expDate) : 'ไม่มีวันหมดอายุ';
            }

            // จัดการวันที่แลก
            let redeemDate = app02Data[k][6]; 
            if (redeemDate instanceof Date) {
              const d = redeemDate.getDate().toString().padStart(2, '0');
              const m = (redeemDate.getMonth() + 1).toString().padStart(2, '0');
              const y = redeemDate.getFullYear() + 543; 
              const hh = redeemDate.getHours().toString().padStart(2, '0');
              const mm = redeemDate.getMinutes().toString().padStart(2, '0');
              redeemDate = `${d}/${m}/${y}, ${hh}:${mm}`;
            } else {
              redeemDate = redeemDate ? String(redeemDate) : '-';
            }

            // จัดการวันที่รับรางวัล
            let usedDate = app02Data[k][7];
            if (usedDate instanceof Date) {
              const d = usedDate.getDate().toString().padStart(2, '0');
              const m = (usedDate.getMonth() + 1).toString().padStart(2, '0');
              const y = usedDate.getFullYear() + 543; 
              const hh = usedDate.getHours().toString().padStart(2, '0');
              const mm = usedDate.getMinutes().toString().padStart(2, '0');
              usedDate = `${d}/${m}/${y}, ${hh}:${mm}`;
            } else {
              usedDate = usedDate ? String(usedDate) : '-';
            }

            let status = String(app02Data[k][8]).trim(); 

            myRewards.push({
              couponCode: app02Data[k][1],
              name: app02Data[k][2],
              points: Number(app02Data[k][3]) || 0,
              image: getDriveImageUrl(app02Data[k][4]),
              expireDate: expDate,
              rawExpireDate: rawExpireDate,
              redeemDate: redeemDate,
              usedDate: usedDate,
              status: status
            });
          }
        }
      }
    }
    userData.myRewards = myRewards;

    return userData;
    
  } catch (error) {
    return { success: false, message: 'เกิดข้อผิดพลาด: ' + error.toString() };
  }
}

// ฟังก์ชันสำหรับบันทึกการแลกรางวัล
function redeemReward(customerId, rewardName, points, rewardImage, rewardCode) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    
    const now = new Date();
    const localTimeMs = now.getTime() - (now.getTimezoneOffset() * 60000);
    const serial = 25569 + (localTimeMs / 86400000);
    const timePart = Math.round(serial * 100).toString().padStart(7, '0');
    
    const safeRewardCode = String(rewardCode || '00').padStart(2, '0');
    const couponCode = "'" + String(safeRewardCode) + String(customerId) + String(timePart);
    
    let logSheet = ss.getSheetByName('DB-ประวัติแลกแต้ม');
    if (!logSheet) { 
      logSheet = ss.insertSheet('DB-ประวัติแลกแต้ม');
      logSheet.appendRow(['ประทับเวลา', 'รหัสลูกค้า', 'รหัสคูปอง', 'ชื่อของรางวัล', 'จำนวนแต้มที่แลก', 'รูปของรางวัล']);
    }
    
    logSheet.appendRow([new Date(), customerId, couponCode, rewardName, points, rewardImage]);
    SpreadsheetApp.flush();
    
    const appSheet = ss.getSheetByName('App-01');
    let remainingPoints = 0;
    if (appSheet) {
      const data = appSheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]).trim() === String(customerId).trim()) {
          remainingPoints = data[i][10]; 
          break;
        }
      }
    }

    return { 
      success: true, 
      couponCode: couponCode, 
      remainingPoints: remainingPoints, 
      message: 'แลกรางวัลสำเร็จ!' 
    };
  } catch (error) {
    return { success: false, message: 'เกิดข้อผิดพลาด: ' + error.toString() };
  }
}

// ฟังก์ชันสำหรับบันทึกการเปลี่ยนรหัสผ่าน
function changeUserPassword(customerId, newPassword) {
  try {
    const TARGET_SS_ID = '14A5wbLz4slr7OkWgNq2ES7MurZVLvAj6pCm1_BEKu4U';
    const ss = SpreadsheetApp.openById(TARGET_SS_ID);
    
    let sheet = ss.getSheetByName('DB_รหัสผ่าน');
    if (!sheet) {
      sheet = ss.insertSheet('DB_รหัสผ่าน');
      sheet.appendRow(['ประทับเวลา', 'รหัสลูกค้า', 'รหัสผ่านใหม่']);
    }
    
    sheet.appendRow([new Date(), customerId, newPassword]);
    
    return { success: true, message: 'บันทึกรหัสผ่านใหม่สำเร็จ' };
    
  } catch (error) {
    return { success: false, message: 'เกิดข้อผิดพลาดในการบันทึก: ' + error.toString() };
  }
}
