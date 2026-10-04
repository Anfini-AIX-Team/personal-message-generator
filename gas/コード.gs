// =============================================================
// Gemini API Proxy - Google Apps Script (JSONP対応版・最適化)
// 2026年7月更新:
//   ・デフォルトモデルを gemini-3.5-flash に更新
//   ・prompt: '__list_models__' で、Gemini APIから「今使えるモデル一覧」を
//     動的取得できるアクションを追加（HTML側のプルダウンを自動更新するため）
// ==============================================================

function doPost(e) {
  const params = JSON.parse(e.postData.contents);
  return handleRequest(params);
}

function doGet(e) {
  // JSONP（引数にcallbackがある場合）か、通常のGETリクエストかを判別
  if (e.parameter.callback) {
    return handleJsonpRequest(e.parameter);
  }
  return handleRequest(e.parameter);
}

// 共通のメイン処理 (POST / 通常GET用)
function handleRequest(params) {
  const password = params.password;
  const model    = params.model || 'gemini-3.5-flash';
  const appId    = params.appId || 'unknown';
  const prompt   = params.prompt || '';
  let result;

  try {
    const passwords = getPasswords();
    const valid = Object.values(passwords).includes(password);
    if (!valid) {
      return createJsonResponse({ success: false, error: 'パスワードが違います' });
    }
    if (prompt === '__auth_check__') {
      return createJsonResponse({ success: true, text: '' });
    }
    // ここが新設のモデル一覧取得アクション
    if (prompt === '__list_models__') {
      return createJsonResponse(listAvailableModels());
    }

    const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    if (!apiKey) {
      return createJsonResponse({ success: false, error: 'APIキーが未設定です' });
    }

    const safeModel = sanitizeModel(model);
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${safeModel}:generateContent?key=${apiKey}`;

    const geminiRes = UrlFetchApp.fetch(geminiUrl, {
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
      return createJsonResponse({ success: false, error: geminiData?.error?.message || 'Gemini APIエラー' });
    }

    const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    logAccess(appId, safeModel);
    result = { success: true, text };

  } catch(err) {
    result = { success: false, error: err.message };
  }
  return createJsonResponse(result);
}

// JSONP専用の処理
function handleJsonpRequest(parameter) {
  const callback = parameter.callback;
  const password = parameter.password;
  const model    = parameter.model || 'gemini-3.5-flash';
  const appId    = parameter.appId || 'unknown';
  const prompt   = parameter.prompt || '';
  let result;

  try {
    const passwords = getPasswords();
    const valid = Object.values(passwords).includes(password);
    if (!valid) {
      return jsonpResponse(callback, { success: false, error: 'パスワードが違います' });
    }
    if (prompt === '__auth_check__') {
      return jsonpResponse(callback, { success: true, text: '' });
    }
    if (prompt === '__list_models__') {
      return jsonpResponse(callback, listAvailableModels());
    }

    const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    if (!apiKey) {
      return jsonpResponse(callback, { success: false, error: 'APIキーが未設定です' });
    }

    const safeModel = sanitizeModel(model);
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${safeModel}:generateContent?key=${apiKey}`;

    const geminiRes = UrlFetchApp.fetch(geminiUrl, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } }
      }),
      muteHttpExceptions: true
    });

    const geminiData = JSON.parse(geminiRes.getContentText());
    if (geminiRes.getResponseCode() !== 200) {
      return jsonpResponse(callback, { success: false, error: geminiData?.error?.message || 'Gemini APIエラー' });
    }

    const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    logAccess(appId, safeModel);
    result = { success: true, text };

  } catch(err) {
    result = { success: false, error: err.message };
  }
  return jsonpResponse(callback, result);
}

// ============================================================
// モデル一覧の動的取得
// Gemini APIの ListModels エンドポイント（GET /v1beta/models）を叩き、
// 今このAPIキーで実際に generateContent が使えるモデルだけを抽出して返す。
// これにより、Googleが新モデルを出したりモデルをシャットダウンしたりしても、
// HTML側のプルダウンはコードを書き換えずに自動で追従できる。
// ==============================================================
function listAvailableModels() {
  try {
    const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    if (!apiKey) {
      return { success: false, error: 'APIキーが未設定です' };
    }
    const res = UrlFetchApp.fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=200`,
      { muteHttpExceptions: true }
    );
    const data = JSON.parse(res.getContentText());
    if (res.getResponseCode() !== 200) {
      return { success: false, error: data?.error?.message || 'モデル一覧の取得に失敗しました' };
    }
    const rawModels = (data.models || [])
      // generateContentに対応していないモデル（embedding, image生成専用等）は除外
      .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
      // 名前は "models/gemini-3.5-flash" の形で返るため、先頭の "models/" を除去
      .map(m => ({
        name: (m.name || '').replace(/^models\//, ''),
        displayName: m.displayName || m.name,
        description: m.description || ''
      }))
      // 明らかに本アプリの用途に合わないもの（TTS/画像生成/embedding/Live API専用等）を除外
      .filter(m => !/(tts|image|embedding|aqa|live|vision-only)/i.test(m.name));

    // 見やすいように、'latest'を含むエイリアスと通常モデルを分けたうえで、
    // 世代が新しいと思われる順（名前の降順）に軽く並べ替える
    rawModels.sort((a, b) => b.name.localeCompare(a.name));

    return { success: true, models: rawModels };
  } catch (err) {
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

// sanitizeModelは「HTML側から想定外の文字列が送られてきた場合の安全な既定値」を
// 保証するための最終防衛ラインとして残す（一覧取得とは別に、直接呼び出しにも対応）。
function sanitizeModel(model) {
  const allowed = [
    'gemini-3.5-flash',
    'gemini-flash-latest',
    'gemini-3.1-pro',
    'gemini-3.1-flash-lite',
    'gemini-2.5-flash',
  ];
  if (allowed.includes(model)) return model;
  // 許可リストにない値が来た場合でも、明らかにGeminiモデル名の形式であれば
  // そのままGemini APIに投げてしまう（動的取得した一覧から選ばれた新モデル名を
  // 弾いてしまわないようにするため）。安全のため文字種だけ簡易チェックする。
  if (/^[a-z0-9._-]+$/i.test(model)) return model;
  return 'gemini-3.5-flash';
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

// ⚠️ GAS更新時は必ず「新しいデプロイ」として保存し、HTML側のGAS_URLを更新してください。