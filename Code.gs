const SHEET_NAME = 'Apps';
const ADMIN_PASSWORD = 'admin'; // 허브 관리자 비밀번호 (필요시 변경하세요)

// 최초 1회 빈 시트를 설정해주는 함수 (수동 실행용)
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(['id', 'name', 'url', 'icon', 'category', 'description', 'isLocked', 'password', 'isActive']);
    // 샘플 데이터 1건 추가
    sheet.appendRow([generateId(), '네이처요양병원 홈페이지', 'https://naturehospital.co.kr', 'fa-solid fa-hospital', 'Hospital Info', '공식 병원 홈페이지입니다.', false, '', true]);
  }
}

// 고유 ID 생성
function generateId() {
  return Utilities.getUuid();
}

// 허브 화면에서 앱 목록을 가져올 때 (GET 요청)
function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      return createJsonResponse({ status: 'error', message: 'Sheet not found' });
    }
    
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const apps = [];
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const app = {};
      for (let j = 0; j < headers.length; j++) {
        app[headers[j]] = row[j];
      }
      apps.push(app);
    }
    
    return createJsonResponse({ status: 'success', data: apps });
  } catch (error) {
    return createJsonResponse({ status: 'error', message: error.toString() });
  }
}

// 허브 관리자 모드에서 새로운 앱 추가/수정/삭제 시 (POST 요청)
function doPost(e) {
  try {
    // 프론트엔드에서 text/plain 으로 보낸 JSON 데이터를 파싱
    const postData = JSON.parse(e.postData.contents);
    
    // 비밀번호 검증
    if (postData.password !== ADMIN_PASSWORD) {
      return createJsonResponse({ status: 'error', message: '비밀번호가 일치하지 않습니다.' });
    }
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME);
    const action = postData.action; // 'add', 'edit', 'delete'
    const appData = postData.appData; // 등록/수정할 앱 정보
    
    if (action === 'add') {
      const newId = generateId();
      sheet.appendRow([
        newId,
        appData.name || '',
        appData.url || '',
        appData.icon || 'fa-solid fa-link',
        appData.category || 'General',
        appData.description || '',
        appData.isLocked || false,
        appData.password || '',
        appData.isActive !== undefined ? appData.isActive : true
      ]);
      return createJsonResponse({ status: 'success', message: '앱이 성공적으로 추가되었습니다.' });
      
    } else if (action === 'edit') {
      const data = sheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        if (data[i][0] === appData.id) { // ID로 해당 열 찾기
          const rowNumber = i + 1;
          const headers = data[0];
          for (let j = 1; j < headers.length; j++) { // id열(0) 제외하고 수정
            const colName = headers[j];
            if (appData[colName] !== undefined) {
              sheet.getRange(rowNumber, j + 1).setValue(appData[colName]);
            }
          }
           return createJsonResponse({ status: 'success', message: '앱 정보가 성공적으로 수정되었습니다.' });
        }
      }
      return createJsonResponse({ status: 'error', message: '수정할 앱을 찾을 수 없습니다.' });
      
    } else if (action === 'delete') {
      const data = sheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        if (data[i][0] === appData.id) {
          sheet.deleteRow(i + 1);
          return createJsonResponse({ status: 'success', message: '앱이 성공적으로 삭제되었습니다.' });
        }
      }
      return createJsonResponse({ status: 'error', message: '삭제할 앱을 찾을 수 없습니다.' });
    }
    
    return createJsonResponse({ status: 'error', message: '잘못된 액션 요청입니다.' });
    
  } catch (error) {
    return createJsonResponse({ status: 'error', message: error.toString() });
  }
}

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
