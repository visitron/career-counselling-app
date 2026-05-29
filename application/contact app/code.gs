// ============================================================
//  SIT STAFF DIRECTORY — API + HTML INDEX (FINAL)
// ============================================================

var SHEET_NAME     = "Staff";
var BIO_SHEET_NAME = "BiometricLog";
var ADMIN_PASSWORD = "admin@SIT2024"; // 🔴 change this

// ============================================================
// 🌐 doGet — LOAD index.html
// ============================================================
function doGet() {
  return HtmlService
    .createHtmlOutputFromFile('index')
    .setTitle('SIT Staff Directory API')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ============================================================
// 🧩 (OPTIONAL) INCLUDE HTML PARTIALS
// ============================================================
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ============================================================
// ✅ doPost — MAIN API ENTRY
// ============================================================
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonOut({ success: false, message: "No data received" });
    }

    var params = JSON.parse(e.postData.contents);
    var action = params.action;

    switch (action) {
      case "login":               return jsonOut(handleLogin(params));
      case "getStaff":            return jsonOut(handleGetStaff(params));
      case "addStaff":            return jsonOut(handleAddStaff(params));
      case "updateStaff":         return jsonOut(handleUpdateStaff(params));
      case "deleteStaff":         return jsonOut(handleDeleteStaff(params));
      case "register_biometric":  return jsonOut(handleRegisterBiometric(params));
      case "verify_biometric":    return jsonOut(handleVerifyBiometric(params));
      default:
        return jsonOut({ success: false, message: "Unknown action: " + action });
    }

  } catch (err) {
    return jsonOut({ success: false, message: "Server error: " + err.toString() });
  }
}

// ============================================================
// 🔐 LOGIN
// ============================================================
function handleLogin(params) {
  var mobile        = (params.mobile || "").trim();
  var password      = (params.password || "").trim();
  var spreadsheetUrl = params.spreadsheet_url || "";

  if (!mobile || !password) {
    return { success: false, message: "Mobile & Password required" };
  }

  // ADMIN LOGIN
  if (mobile.toLowerCase() === "admin") {
    if (password === ADMIN_PASSWORD) {
      return {
        success: true,
        role: "admin",
        user: { name: "Administrator", mobile: "admin" }
      };
    }
    return { success: false, message: "Invalid admin login" };
  }

  try {
    var sheet = getSheetFromUrl(spreadsheetUrl);
  } catch (err) {
    return { success: false, message: err.message };
  }
  var data  = sheet.getDataRange().getValues();

  var cleanMobile = mobile.replace(/\D/g, "").slice(-10);

  for (var i = 1; i < data.length; i++) {
    var rowMob = (data[i][5] || "").toString().replace(/\D/g, "").slice(-10);
    var rowPwd = (data[i][7] || "").toString().trim();

    if (rowMob === cleanMobile && rowPwd === password) {
      return {
        success: true,
        role: "staff",
        user: {
          id: data[i][0],
          name: data[i][1],
          department: data[i][2],
          designation: data[i][3],
          email: data[i][4],
          mobile: data[i][5],
          whatsapp: data[i][6]
        }
      };
    }
  }

  return { success: false, message: "Invalid credentials" };
}

// ============================================================
// 📋 GET STAFF
// ============================================================
function handleGetStaff(params) {
  var spreadsheetUrl = params ? (params.spreadsheet_url || "") : "";
  
  try {
    var sheet = spreadsheetUrl ? getSheetFromUrl(spreadsheetUrl) : getSheet();
  } catch (err) {
    return { success: false, message: err.message };
  }
  var data  = sheet.getDataRange().getValues();

  var list = [];

  for (var i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;

    list.push({
      id: data[i][0],
      name: data[i][1],
      department: data[i][2],
      designation: data[i][3],
      email: data[i][4],
      mobile: data[i][5],
      whatsapp: data[i][6]
    });
  }

  return { success: true, staff: list };
}

// ============================================================
// ➕ ADD STAFF
// ============================================================
function handleAddStaff(params) {
  if (!verifyAdmin(params)) {
    return { success: false, message: "Unauthorized" };
  }

  var spreadsheetUrl = params.spreadsheet_url || "";
  
  try {
    var sheet = spreadsheetUrl ? getSheetFromUrl(spreadsheetUrl) : getSheet();
  } catch (err) {
    return { success: false, message: err.message };
  }
  var data  = sheet.getDataRange().getValues();

  var maxId = 0;
  for (var i = 1; i < data.length; i++) {
    maxId = Math.max(maxId, parseInt(data[i][0]) || 0);
  }

  var s = params.staff || {};

  sheet.appendRow([
    maxId + 1,
    s.name || "",
    s.department || "",
    s.designation || "",
    s.email || "",
    s.mobile || "",
    s.whatsapp || s.mobile || "",
    s.password || "SIT@1234"
  ]);

  return { success: true, message: "Staff added" };
}

// ============================================================
// ✏️ UPDATE STAFF
// ============================================================
function handleUpdateStaff(params) {
  if (!verifyAdmin(params)) {
    return { success: false, message: "Unauthorized" };
  }

  var spreadsheetUrl = params.spreadsheet_url || "";
  
  try {
    var sheet = spreadsheetUrl ? getSheetFromUrl(spreadsheetUrl) : getSheet();
  } catch (err) {
    return { success: false, message: err.message };
  }
  var data  = sheet.getDataRange().getValues();
  var s     = params.staff || {};

  for (var i = 1; i < data.length; i++) {
    if (data[i][0].toString() === s.id.toString()) {
      sheet.getRange(i + 1, 2, 1, 7).setValues([[
        s.name,
        s.department,
        s.designation,
        s.email,
        s.mobile,
        s.whatsapp,
        s.password
      ]]);

      return { success: true, message: "Updated successfully" };
    }
  }

  return { success: false, message: "ID not found" };
}

// ============================================================
// ❌ DELETE STAFF
// ============================================================
function handleDeleteStaff(params) {
  if (!verifyAdmin(params)) {
    return { success: false, message: "Unauthorized" };
  }

  var spreadsheetUrl = params.spreadsheet_url || "";
  
  try {
    var sheet = spreadsheetUrl ? getSheetFromUrl(spreadsheetUrl) : getSheet();
  } catch (err) {
    return { success: false, message: err.message };
  }
  var data  = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if (data[i][0].toString() === params.id.toString()) {
      sheet.deleteRow(i + 1);
      return { success: true, message: "Deleted successfully" };
    }
  }

  return { success: false, message: "ID not found" };
}

// ============================================================
// 🔐 BIOMETRIC REGISTER
// ============================================================
function handleRegisterBiometric(params) {
  var spreadsheetUrl = params.spreadsheet_url || "";
  
  try {
    var sheet = spreadsheetUrl ? getBioSheetFromUrl(spreadsheetUrl) : getBioSheet();
  } catch (err) {
    return { success: false, message: err.message };
  }

  sheet.appendRow([
    params.staff_id,
    params.name,
    params.email,
    params.biometric_string,
    new Date(),
    ""
  ]);

  return { success: true, message: "Biometric saved" };
}

// ============================================================
// 🔍 BIOMETRIC VERIFY
// ============================================================
function handleVerifyBiometric(params) {
  var spreadsheetUrl = params.spreadsheet_url || "";
  
  try {
    var sheet = spreadsheetUrl ? getBioSheetFromUrl(spreadsheetUrl) : getBioSheet();
  } catch (err) {
    return { success: false, message: err.message };
  }
  var data  = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if (data[i][0] == params.staff_id) {

      var match = data[i][3] === params.biometric_string;

      sheet.getRange(i + 1, 6).setValue(
        match ? "OK " + new Date() : "FAIL " + new Date()
      );

      return { success: true, matched: match };
    }
  }

  return { success: false, message: "Staff not found" };
}

// ============================================================
// 🧩 HELPERS
// ============================================================
function getSheetFromUrl(url) {
  try {
    if (!url || typeof url !== 'string') {
      throw new Error("Invalid spreadsheet URL provided");
    }
    
    var spreadsheet = SpreadsheetApp.openByUrl(url);
    var sheet = spreadsheet.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
      throw new Error("Staff sheet not found in the specified spreadsheet");
    }
    
    return sheet;
  } catch (err) {
    throw new Error("Cannot access spreadsheet: " + err.message);
  }
}

function getBioSheetFromUrl(url) {
  try {
    if (!url || typeof url !== 'string') {
      throw new Error("Invalid spreadsheet URL provided");
    }
    
    var spreadsheet = SpreadsheetApp.openByUrl(url);
    var sheet = spreadsheet.getSheetByName(BIO_SHEET_NAME);
    
    if (!sheet) {
      throw new Error("BiometricLog sheet not found in the specified spreadsheet");
    }
    
    return sheet;
  } catch (err) {
    throw new Error("Cannot access spreadsheet: " + err.message);
  }
}

function getSheet() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error("Staff sheet not found");
  return sheet;
}

function getBioSheet() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(BIO_SHEET_NAME);
  if (!sheet) throw new Error("BiometricLog sheet not found");
  return sheet;
}

function verifyAdmin(params) {
  return (params.adminPassword || "") === ADMIN_PASSWORD;
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}