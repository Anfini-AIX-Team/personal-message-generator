// =============================================================
// Gemini API Proxy - Google Apps Script (JSONP対応版)
// モデルはサーバー側で決める（リクエストの model パラメータは無視する）。
// 解決順: スクリプトプロパティ GEMINI_MODEL_<タスク名> → GEMINI_MODEL_<カテゴリ> → コード内の既定値
// =============================================================

const GEMINI_DEFAULT_MODELS = { CHAT: 'gemini-3.5-flash-lite' };
// タスク名 → カテゴリ（と、カテゴリ既定と違う場合のみ既定モデル）
const GEMINI_TASKS = {
  GENERATE_MESSAGE: { category: 'CHAT', model: 'gemini-3.5-flash' },
};

function geminiModel(task) {
  const t = GEMINI_TASKS[task];
  if (!t) throw new Error('未定義のGeminiタスク: ' + task);
  const props = PropertiesService.getScriptProperties();
  return props.getProperty('GEMINI_MODEL_' + task) || props.getProperty('GEMINI_MODEL_' + t.category) || t.model || GEMINI_DEFAULT_MODELS[t.category];
}

function geminiEndpoint(task, apiKey) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel(task)}:generateContent?key=${apiKey}`;
}

function doPost(e) {
  const params = JSON.parse(e.postData.contents);
  return createJsonResponse(processRequest(params));
}

function doGet(e) {
  // JSONP（引数にcallbackがある場合）か、通常のGETリクエストかを判別
  if (e.parameter.callback) {
    return jsonpResponse(e.parameter.callback, processRequest(e.parameter));
  }
  return createJsonResponse(processRequest(e.parameter));
}

// 共通のメイン処理（POST / GET / JSONP）。返り値はレスポンスのJSONオブジェクト
function processRequest(params) {
  const password = params.password;
  const appId    = params.appId || 'unknown';
  const prompt   = params.prompt || '';

  try {
    const passwords = getPasswords();
    const valid = Object.values(passwords).includes(password);
    if (!valid) {
      return { success: false, error: 'パスワードが違います' };
    }
    if (prompt === '__auth_check__') {
      return { success: true, text: '' };
    }

    const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    if (!apiKey) {
      return { success: false, error: 'APIキーが未設定です' };
    }

    const model = geminiModel('GENERATE_MESSAGE');
    const geminiRes = UrlFetchApp.fetch(geminiEndpoint('GENERATE_MESSAGE', apiKey), {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } } // 確実に出力枠を確保
      }),
      muteHttpExceptions: true
    });

    const geminiData = JSON.parse(geminiRes.getContentText());
    if (geminiRes.getResponseCode() !== 200) {
      return { success: false, error: geminiData?.error?.message || 'Gemini APIエラー' };
    }

    const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    logAccess(appId, model);
    return { success: true, text };

  } catch(err) {
    return { success: false, error: err.message };
  }
}

// レスポンスヘルパー
function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function jsonpResponse(callback, data) {
  const json = JSON.stringify(data);
  return ContentService.createTextOutput(`${callback}(${json})`)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function getPasswords() {
  try {
    const raw = PropertiesService.getScriptProperties().getProperty('APP_PASSWORDS');
    return raw ? JSON.parse(raw) : {};
  } catch(e) { return {}; }
}

function logAccess(appId, model) {
  try {
    const sheetId = PropertiesService.getScriptProperties().getProperty('LOG_SHEET_ID');
    if (!sheetId) return;
    const ss = SpreadsheetApp.openById(sheetId);
    const sheet = ss.getSheetByName('ログ') || ss.insertSheet('ログ');
    if (sheet.getLastRow() === 0) sheet.appendRow(['日時','アプリID','モデル']);
    sheet.appendRow([new Date().toLocaleString('ja-JP'), appId, model]);
  } catch(e) {}
}

// GAS更新時は「デプロイを管理」で既存のデプロイを新バージョンに更新する（/exec のURLは変わらないのでHTML側の変更は不要）。
