
const state = {
  module: null,
  rememberLogin: true,
  lastOcrItems: [],
  warehouse: { cells: [], zones: null, availableItems: [], activeZone: 'A' },
  adminUsers: [],
  currentCell: null,
  currentCellItems: [],
  currentCustomer: null,
  customerItems: [],
  searchHighlightKeys: new Set(),
  lastSelectedFile: null,
  lastOcrOriginalText: '',
  roi: null,
  todayChangesOpen: false,
  lastOcrTemplate: '',
  __confirmResolver: null,
  todayOnlyUnread: false,
  todayCategoryFilter: 'all',
  nativeOcrMode: 'blue',
  nativeOcrTemplate: 'whiteboard',
  ocrHistory: [],
  pendingSubmitQueue: [],
  lineMap: [],
  nativePreview: null,
  pendingNativeRequestId: '',
  todoSelectedFile: null,
  parsedMaterialOverrides: {},
};

function $(id){ return document.getElementById(id); }
function qs(sel){ return document.querySelector(sel); }
function qsa(sel){ return Array.from(document.querySelectorAll(sel)); }

const NATIVE_SHELL_ORIGIN_ALLOWLIST = ['capacitor://localhost', 'http://localhost', 'https://localhost', 'ionic://localhost', 'app://localhost', 'null', ''];
const PENDING_SUBMIT_KEY = 'yuanxingPendingSubmits';
const OCR_HISTORY_KEY = 'yuanxingOcrHistory';
const MATERIAL_OPTIONS = ['SPF','HF','DF','ROT','SPY','SP','RP','TD','MLH'];

function materialOptionsHtml(selected=''){
  const current = String(selected || '').trim().toUpperCase();
  return [''].concat(MATERIAL_OPTIONS).map(opt => `<option value="${opt}" ${opt === current ? 'selected' : ''}>${opt || '未填材質'}</option>`).join('');
}
function seedParsedMaterialOverrides(items=[]){
  state.parsedMaterialOverrides = {};
  (items || []).forEach((it, idx) => {
    const material = String(it?.material || '').trim().toUpperCase();
    if (material) state.parsedMaterialOverrides[idx] = material;
  });
}

function getParentTargetOrigin(){ return '*'; }
function safeJSONParse(raw, fallback){ try { return JSON.parse(raw); } catch(e){ return fallback; } }
function isTrustedNativeMessage(event){
  if (!event || !event.data || typeof event.data !== 'object') return false;
  if (window.parent && event.source !== window.parent) return false;
  const origin = String(event.origin || '');
  return NATIVE_SHELL_ORIGIN_ALLOWLIST.includes(origin) || origin.startsWith('capacitor://') || origin.startsWith('ionic://') || origin.startsWith('app://') || origin.startsWith('http://localhost') || origin.startsWith('https://localhost');
}
function loadStoredQueues(){
  state.pendingSubmitQueue = safeJSONParse(localStorage.getItem(PENDING_SUBMIT_KEY), []);
  state.ocrHistory = safeJSONParse(localStorage.getItem(OCR_HISTORY_KEY), []);
}
function persistPendingQueue(){ localStorage.setItem(PENDING_SUBMIT_KEY, JSON.stringify(state.pendingSubmitQueue.slice(-30))); updateOfflineSyncPill(); }
function persistOcrHistory(){ localStorage.setItem(OCR_HISTORY_KEY, JSON.stringify(state.ocrHistory.slice(0,20))); }
function updateOfflineSyncPill(){
  const pill = $('offline-sync-pill');
  if (!pill) return;
  const count = state.pendingSubmitQueue.length;
  pill.textContent = count ? `待同步：${count}` : '即時同步';
  pill.classList.toggle('warn', !!count);
}
function getSelectedOcrMode(){ return ($('ocr-mode-select')?.value || state.nativeOcrMode || 'blue'); }
function getSelectedTemplate(){ return ($('ocr-template-select')?.value || state.nativeOcrTemplate || 'whiteboard'); }
function setSelectedOcrOptions(mode, template){
  state.nativeOcrMode = mode || state.nativeOcrMode || 'blue';
  state.nativeOcrTemplate = template || state.nativeOcrTemplate || 'whiteboard';
  if ($('ocr-mode-select')) $('ocr-mode-select').value = state.nativeOcrMode;
  if ($('ocr-template-select')) $('ocr-template-select').value = state.nativeOcrTemplate;
}

function materialLabel(material){
  return material ? `材質：${material}` : '材質：未填';
}
function formatMaterialInline(material){
  return material ? `｜${material}` : '';
}
function parseProductParts(productText=''){
  const raw = String(productText || '').trim();
  if (!raw.includes('=')) return { left: raw, right: '' };
  const [left, right] = raw.split('=');
  return { left: left || '', right: right || '' };
}
function formatTodoDateLabel(dateStr=''){
  if (!dateStr) return '未指定日期';
  const today = new Date();
  const todayStr = today.toISOString().slice(0,10);
  if (dateStr === todayStr) return `今天 ${dateStr}`;
  return dateStr;
}
function sortTodoItems(items=[]){
  const today = new Date().toISOString().slice(0,10);
  const bucket = (item) => {
    const d = item.due_date || '';
    if (!d) return 3;
    if (d === today) return 0;
    if (d > today) return 1;
    return 2;
  };
  return [...(items || [])].sort((a,b) => {
    const ba = bucket(a), bb = bucket(b);
    if (ba !== bb) return ba - bb;
    const da = a.due_date || '';
    const db = b.due_date || '';
    if (da !== db) return da.localeCompare(db);
    return String(b.created_at || '').localeCompare(String(a.created_at || ''));
  });
}
function queuePendingSubmit(entry){
  state.pendingSubmitQueue.push({ ...entry, queued_at: new Date().toISOString() });
  persistPendingQueue();
}
function isLikelyNetworkError(err){
  const msg = String(err?.message || err || '').toLowerCase();
  return err instanceof TypeError || /network|failed to fetch|load failed|timeout|offline|internet/.test(msg);
}
function saveOcrHistoryEntry(entry){
  const items = [entry, ...state.ocrHistory.filter(it => !(it.text === entry.text && it.customer_name === entry.customer_name))];
  state.ocrHistory = items.slice(0, 12);
  persistOcrHistory();
  renderOcrHistory();
}
function renderOcrHistory(){
  const box = $('ocr-history-list');
  if (!box) return;
  if (!state.ocrHistory.length) { box.innerHTML = '<div class="small-note">尚無最近辨識紀錄</div>'; return; }
  box.innerHTML = state.ocrHistory.map((it, idx) => `<button class="chip-item ocr-history-item" onclick="restoreOcrHistory(${idx})"><span>${escapeHTML(it.customer_name || '未指定客戶')}</span><span>${escapeHTML((it.text || '').split(/\n/)[0] || '')}</span></button>`).join('');
}
function restoreOcrHistory(index){
  const it = state.ocrHistory[index];
  if (!it) return;
  if ($('ocr-text')) $('ocr-text').value = it.text || '';
  if ($('customer-name') && it.customer_name) $('customer-name').value = it.customer_name;
  seedParsedMaterialOverrides(it.items || []);
  state.lastOcrItems = it.items || parseTextareaItems();
  state.lineMap = it.line_map || [];
  state.nativePreview = it.preview || null;
  renderNativePreview();
  syncParsedItemViews({ triggerShipPreview: true });
  toast('已回填最近辨識結果', 'ok');
}
function renderLineMap(){
  const box = $('ocr-line-map');
  if (!box) return;
  if (!state.lineMap || !state.lineMap.length) { box.innerHTML = '<div class="small-note">辨識完成後，可點這裡的行內容反查圖片位置</div>'; return; }
  box.innerHTML = state.lineMap.map((line, idx) => `<button class="chip-item ocr-line-chip" onclick="highlightOcrLine(${idx})">${escapeHTML(line.text || '')}</button>`).join('');
}
function highlightOcrLine(index){
  const line = (state.lineMap || [])[index];
  const previewBox = $('ocr-highlight-box');
  const img = $('ocr-preview-img');
  if (!line || !previewBox || !img || !state.nativePreview?.image) return;
  const rect = img.getBoundingClientRect();
  const bbox = line.bbox || {};
  previewBox.style.left = `${(bbox.x || 0) * rect.width}px`;
  previewBox.style.top = `${(bbox.y || 0) * rect.height}px`;
  previewBox.style.width = `${(bbox.w || 0) * rect.width}px`;
  previewBox.style.height = `${(bbox.h || 0) * rect.height}px`;
  previewBox.classList.remove('hidden');
  previewBox.classList.add('flash-highlight');
  setTimeout(() => previewBox.classList.remove('flash-highlight'), 1800);
}
function renderNativePreview(){
  const panel = $('ocr-preview-panel');
  const img = $('ocr-preview-img');
  if (!panel || !img) return;
  if (!state.nativePreview?.image) { panel.classList.add('hidden'); renderLineMap(); return; }
  img.src = state.nativePreview.image;
  panel.classList.remove('hidden');
  const roiBox = $('ocr-roi-box');
  if (roiBox && state.nativePreview.roi) {
    const apply = () => {
      const rect = img.getBoundingClientRect();
      if (!rect.width || !rect.height) return setTimeout(apply, 50);
      roiBox.style.left = `${state.nativePreview.roi.x * rect.width}px`;
      roiBox.style.top = `${state.nativePreview.roi.y * rect.height}px`;
      roiBox.style.width = `${state.nativePreview.roi.w * rect.width}px`;
      roiBox.style.height = `${state.nativePreview.roi.h * rect.height}px`;
      roiBox.classList.remove('hidden');
    };
    apply();
  }
  renderLineMap();
}
function applyLocalNativeOcrPreview(payload={}){
  const fallbackText = payload.text || payload.rawText || payload.raw_text || '';
  if ($('ocr-text')) $('ocr-text').value = fallbackText;
  if ($('ocr-confidence-pill')) $('ocr-confidence-pill').textContent = `信心值：${payload.confidence || 0}%`;
  if ($('ocr-warning-pill')) $('ocr-warning-pill').textContent = '手機原生辨識完成，正在整理格式…';
  setPillState($('ocr-warning-pill'), 'warn');
  state.lastOcrOriginalText = fallbackText;
  state.lastOcrItems = parseTextareaItems();
  seedParsedMaterialOverrides(state.lastOcrItems);
  state.lineMap = payload.line_map || payload.lineMap || payload.blocks || [];
  if (payload.previewDataUrl || payload.preview_data_url) {
    state.nativePreview = { image: payload.previewDataUrl || payload.preview_data_url, roi: payload.roi || null };
  }
  renderNativePreview();
  syncParsedItemViews({ triggerShipPreview: true });
}
async function syncPendingSubmits(){
  if (!state.pendingSubmitQueue.length) return;
  const keep = [];
  for (const entry of state.pendingSubmitQueue) {
    try {
      await requestJSON(entry.endpoint, { method: 'POST', body: JSON.stringify(entry.payload) });
    } catch (e) {
      keep.push(entry);
    }
  }
  state.pendingSubmitQueue = keep;
  persistPendingQueue();
  if (!keep.length) toast('待同步資料已補送完成', 'ok');
}
window.addEventListener('online', () => { syncPendingSubmits(); });


async function requestJSON(url, options={}){
  const res = await fetch(url, {
    headers: {'Content-Type': 'application/json', ...(options.headers||{})},
    ...options
  });
  const data = await res.json().catch(()=>({success:false,error:'回應解析失敗'}));
  if(!res.ok || data.success === false){
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

function toast(msg, kind=''){
  let t = $('toast');
  if(!t){
    t = document.createElement('div');
    t.id='toast';
    t.className='toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.className = `toast show ${kind}`;
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(()=>{ t.className='toast'; }, 2400);
}

function setPillState(el, kind){
  if (!el) return;
  el.classList.remove('ok-pill','warn-pill','error-pill');
  if (kind) el.classList.add(kind + '-pill');
}

function scrollToOcrFields(){
  const target = $('customer-name') || $('ocr-text');
  if (target && typeof target.scrollIntoView === 'function') {
    target.scrollIntoView({behavior:'smooth', block:'center'});
  }
}

function canUseNativeOcr(){
  return !!(window.NativeOcrBridge || window.parent !== window || window.Capacitor);
}

function setNativeOcrBusy(isBusy, source=''){
  const warningPill = $('ocr-warning-pill');
  if (!warningPill) return;
  if (isBusy) {
    warningPill.textContent = source === 'camera' ? '手機相機辨識中…' : '手機相簿辨識中…';
    setPillState(warningPill, 'warn');
  }
}

async function parseNativeOcrText(payload={}){
  const data = await requestJSON('/api/native-ocr/parse', {
    method: 'POST',
    body: JSON.stringify({
      raw_text: payload.text || payload.rawText || payload.raw_text || '',
      customer_hint: payload.customer_name || payload.customerHint || '',
      confidence: payload.confidence || 0,
      blocks: payload.blocks || [],
      ocr_mode: payload.ocrMode || getSelectedOcrMode(),
      template: payload.template || getSelectedTemplate(),
      roi: payload.roi || null,
    })
  });
  if ($('ocr-text')) $('ocr-text').value = data.text || payload.text || '';
  state.lastOcrOriginalText = data.raw_text || data.text || payload.text || '';
  state.lastOcrItems = (data.items && data.items.length) ? data.items : parseTextareaItems();
  state.lastOcrTemplate = data.template || getSelectedTemplate() || 'native_device';
  state.lineMap = data.line_map || payload.line_map || payload.blocks || [];
  if ($('customer-name') && data.customer_guess) $('customer-name').value = data.customer_guess;
  if ($('ocr-confidence-pill')) $('ocr-confidence-pill').textContent = `信心值：${data.confidence || payload.confidence || 0}%`;
  const warningPill = $('ocr-warning-pill');
  const statusText = data.warning || '手機原生辨識完成，可直接修改後送出';
  if (warningPill) warningPill.textContent = `${statusText}｜原生 ${data.ocr_confidence || payload.confidence || 0}%｜解析 ${data.parse_confidence || 0}%`;
  setPillState(warningPill, data.warning ? 'warn' : 'ok');
  const detail = $('ocr-status-detail');
  if (detail) detail.textContent = `辨識引擎：${(data.engines || ['native_device_ocr']).join(' / ')}｜模板：${data.template || 'native_device'}`;
  renderNativePreview();
  saveOcrHistoryEntry({
    text: data.text || payload.text || '',
    customer_name: data.customer_guess || payload.customer_name || '',
    items: state.lastOcrItems,
    line_map: state.lineMap,
    preview: state.nativePreview,
    created_at: new Date().toISOString(),
  });
  toast(data.warning || '手機原生辨識完成', data.warning ? 'warn' : 'ok');
  scrollToOcrFields();
  if (state.module === 'ship') await loadShipPreview();
}

async function handleNativeOcrResult(payload={}){
  try {
    if (payload.error) throw new Error(payload.error);
    setSelectedOcrOptions(payload.ocrMode || payload.ocr_mode || getSelectedOcrMode(), payload.template || getSelectedTemplate());
    applyLocalNativeOcrPreview(payload);
    await parseNativeOcrText(payload);
  } catch (e) {
    const msg = e.message || '原生辨識失敗';
    if ($('ocr-warning-pill')) $('ocr-warning-pill').textContent = `${msg}；已保留原始辨識文字，可直接修改或稍後自動同步`;
    setPillState($('ocr-warning-pill'), 'error');
    if (payload && (payload.text || payload.rawText || payload.raw_text)) {
      saveOcrHistoryEntry({
        text: payload.text || payload.rawText || payload.raw_text || '',
        customer_name: payload.customer_name || '',
        items: parseTextareaItems(),
        line_map: payload.line_map || payload.blocks || [],
        preview: state.nativePreview,
        created_at: new Date().toISOString(),
      });
    }
    toast(msg, 'error');
  }
}

function requestNativeOcr(source='photos'){
  if (!canUseNativeOcr()) {
    toast('這一版 OCR 改成原生 App 使用，請在手機原生 App 內開啟。', 'warn');
    return false;
  }
  const requestId = `ocr-${Date.now()}`;
  state.pendingNativeRequestId = requestId;
  const payload = {
    type: 'native-ocr-request',
    source,
    requestId,
    ocrMode: getSelectedOcrMode(),
    template: getSelectedTemplate(),
    appId: 'yuanxing-native-shell-v20',
  };
  setNativeOcrBusy(true, source);
  if (window.NativeOcrBridge && typeof window.NativeOcrBridge.request === 'function') {
    window.NativeOcrBridge.request(JSON.stringify(payload));
    return true;
  }
  if (window.parent && window.parent !== window) {
    window.parent.postMessage(payload, getParentTargetOrigin());
    return true;
  }
  toast('原生辨識橋接尚未就緒', 'warn');
  return false;
}

window.receiveNativeOcrResult = handleNativeOcrResult;
window.addEventListener('message', (event) => {
  if (!isTrustedNativeMessage(event)) return;
  const data = event && event.data;
  if (!data || typeof data !== 'object') return;
  if (data.type === 'native-ocr-result') handleNativeOcrResult(data.payload || data);
});


function askConfirm(message, title='請確認', okText='確認', cancelText='取消', opts={}){
  const modal = $('confirm-modal');
  const msg = $('confirm-message');
  const ttl = $('confirm-title');
  const ok = $('confirm-ok-btn');
  const cancel = $('confirm-cancel-btn');
  if (!modal || !msg || !ttl || !ok || !cancel) return Promise.resolve(window.confirm(typeof message === 'string' ? message : '請確認'));
  ttl.textContent = title;
  if (opts && opts.html) msg.innerHTML = message;
  else msg.textContent = message;
  ok.textContent = okText;
  cancel.textContent = cancelText;
  modal.classList.remove('hidden');
  return new Promise(resolve => {
    const cleanup = (v) => {
      modal.classList.add('hidden');
      ok.onclick = null;
      cancel.onclick = null;
      state.__confirmResolver = null;
      resolve(v);
    };
    state.__confirmResolver = cleanup;
    ok.onclick = () => cleanup(true);
    cancel.onclick = () => cleanup(false);
  });
}

function currentModule(){
  const el = qs('.module-screen');
  return el ? el.dataset.module : null;
}

document.addEventListener('DOMContentLoaded', () => {
  loadStoredQueues();
  state.module = currentModule();
  updateOfflineSyncPill();
  renderOcrHistory();
  syncPendingSubmits();
  if ($('remember-label')) {
    state.rememberLogin = localStorage.getItem('rememberLogin') !== '0';
    $('remember-label').textContent = state.rememberLogin ? '開' : '關';
  }
  if ($('login-username')) {
    initLoginPage();
  }
  if ($('old-password')) {
    loadGoogleOcrStatus();
    loadBackups();
  }
  if ($('today-changes-btn') || $('today-summary-cards')) {
    loadTodayChanges();
  }
  if (state.module) {
    setSelectedOcrOptions(getSelectedOcrMode(), getSelectedTemplate());
    initModulePage();
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.__confirmResolver) state.__confirmResolver(false); });
});

function initLoginPage(){
  const u = localStorage.getItem('username') || '';
  if ($('login-username')) $('login-username').value = u;
  const pass = $('login-password');
  if (pass) pass.addEventListener('keypress', e => { if (e.key === 'Enter') submitLogin(); });
}

function toggleLoginSave(){
  state.rememberLogin = !state.rememberLogin;
  localStorage.setItem('rememberLogin', state.rememberLogin ? '1' : '0');
  if ($('remember-label')) $('remember-label').textContent = state.rememberLogin ? '開' : '關';
}

async function submitLogin(auto=false){
  const username = ($('login-username')?.value || '').trim();
  const password = ($('login-password')?.value || '').trim();
  const err = $('login-error');
  if (!username || !password) {
    if (!auto && err) { err.textContent = '請輸入帳號與密碼'; err.classList.remove('hidden'); }
    return;
  }
  try {
    await requestJSON('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    if (state.rememberLogin) localStorage.setItem('username', username);
    else localStorage.removeItem('username');
    localStorage.removeItem('password');
    if (err) err.classList.add('hidden');
    window.location.href = '/';
  } catch (e) {
    if (err) {
      err.textContent = e.message || '登入失敗';
      err.classList.remove('hidden');
    }
  }
}

async function logout(){
  try { await requestJSON('/api/logout', { method:'POST', body:'{}' }); } catch(e){}
  localStorage.removeItem('password');
  window.location.href = '/login';
}


async function loadAdminUsers(){
  const box = $('admin-users');
  if (!box) return;
  try {
    const data = await requestJSON('/api/admin/users', { method:'GET' });
    state.adminUsers = data.items || [];
    box.innerHTML = `<table><thead><tr><th>帳號</th><th>角色</th><th>狀態</th><th>操作</th></tr></thead><tbody>${state.adminUsers.map(u => `
      <tr>
        <td>${escapeHTML(u.username || '')}</td>
        <td>${escapeHTML(u.role || 'user')}</td>
        <td>${Number(u.is_blocked || 0) ? '黑名單' : '正常'}</td>
        <td>${u.username === '陳韋廷' ? '管理員' : `<button class="ghost-btn small-btn" onclick="toggleUserBlocked('${encodeURIComponent(u.username)}', ${Number(u.is_blocked || 0) ? 'false' : 'true'})">${Number(u.is_blocked || 0) ? '解除黑名單' : '加入黑名單'}</button>`}</td>
      </tr>`).join('')}</tbody></table>`;
  } catch (e) {
    box.innerHTML = `<div class="alert">${escapeHTML(e.message || '載入失敗')}</div>`;
  }
}

async function toggleUserBlocked(encodedUsername, blocked){
  try {
    await requestJSON('/api/admin/block', {
      method:'POST',
      body: JSON.stringify({ username: decodeURIComponent(encodedUsername), blocked })
    });
    toast(blocked ? '已加入黑名單' : '已解除黑名單', 'ok');
    loadAdminUsers();
  } catch (e) {
    toast(e.message, 'error');
  }
}



async function loadGoogleOcrStatus(){
  const box = $('google-ocr-panel');
  const status = $('system-status-panel');
  if (!box && !status) return;
  try {
    const data = await requestJSON('/api/admin/google-ocr', { method:'GET' });
    if (box) box.innerHTML = `<div class="card-list"><div class="card"><div class="title">OCR 模式</div><div class="sub"><strong>手機原生辨識</strong><br>Google OCR 已移除</div></div></div>`;
    if (status) status.innerHTML = `<div class="card"><div class="title">OCR 模式</div><div class="sub"><strong>手機原生辨識</strong><br>Google OCR 已停用，請從原生 App 進行拍照或相簿辨識。</div></div><div class="card"><div class="title">安全設定</div><div class="sub"><strong>SECRET_KEY</strong><br>此版本採環境變數強制啟動，未設定不會啟動服務。</div></div>`;
  } catch (e) {
    if (box) box.innerHTML = `<div class="alert">${escapeHTML(e.message || '載入失敗')}</div>`;
    if (status) status.innerHTML = `<div class="alert">${escapeHTML(e.message || '系統狀態載入失敗')}</div>`;
  }
}

async function setGoogleOcrEnabled(enabled){
  try {
    await requestJSON('/api/admin/google-ocr', { method:'POST', body: JSON.stringify({ enabled: false }) });
    toast('此版本固定使用手機原生 OCR', 'ok');
    loadGoogleOcrStatus();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function changePassword(){
  const old_password = ($('old-password')?.value || '').trim();
  const new_password = ($('new-password')?.value || '').trim();
  const confirm_password = ($('confirm-password')?.value || '').trim();
  const msg = $('settings-msg');
  try {
    await requestJSON('/api/change_password', {
      method: 'POST',
      body: JSON.stringify({ old_password, new_password, confirm_password })
    });
    if (msg) { msg.textContent = '密碼已更新'; msg.classList.remove('hidden'); }
    toast('密碼修改成功', 'ok');
    $('old-password').value = $('new-password').value = $('confirm-password').value = '';
  } catch (e) {
    if (msg) { msg.textContent = e.message; msg.classList.remove('hidden'); }
  }
}

async function loadBackups(){
  const box = $('backup-panel');
  if (!box) return;
  try {
    const data = await requestJSON('/api/backups', { method:'GET' });
    const files = data.files || [];
    box.innerHTML = files.length ? `<table class="backup-table"><thead><tr><th>檔名</th><th>大小</th><th>建立時間</th></tr></thead><tbody>${files.map(f => `<tr><td>${escapeHTML(f.filename || '')}</td><td>${Number(f.size || 0).toLocaleString()}</td><td>${escapeHTML(f.created_at || '')}</td></tr>`).join('')}</tbody></table>` : '<div class="small-note">目前沒有備份檔</div>';
  } catch (e) {
    box.innerHTML = `<div class="alert">${escapeHTML(e.message || '備份清單載入失敗')}</div>`;
  }
}

async function createBackup(){
  try {
    await requestJSON('/api/backup', { method:'POST', body:'{}' });
    toast('已建立備份', 'ok');
    loadBackups();
  } catch (e) {
    toast(e.message || '建立備份失敗', 'error');
  }
}

function initModulePage(){
  const module = state.module;
  setupUploadButtons();
  const album = $('album-input');
  const camera = $('camera-input');
  if (album) album.addEventListener('change', e => handleFiles(e.target.files));
  if (camera) camera.addEventListener('change', e => handleFiles(e.target.files));
  if ($('ocr-text')) {
    $('ocr-text').addEventListener('input', () => { syncParsedItemViews({ triggerShipPreview: module === 'ship' }); });
  }
  if (module === 'inventory') loadInventory();
  if (module === 'orders' || module === 'master_order' || module === 'ship') loadCustomerBlocks();
  if (module === 'orders') loadOrdersList();
  if (module === 'master_order') loadMasterList();
  if (module === 'shipping_query') loadShippingRecords();
  if (module === 'warehouse') renderWarehouse();
  if (module === 'customers') renderCustomers();
  if (module === 'todos') {
    const imageInput = $('todo-image-input');
    const cameraInput = $('todo-camera-input');
    if (imageInput) imageInput.addEventListener('change', e => handleTodoFiles(e.target.files));
    if (cameraInput) cameraInput.addEventListener('change', e => handleTodoFiles(e.target.files));
    loadTodos();
  }
  syncParsedItemViews({ triggerShipPreview: false });
}

function setupUploadButtons(){
  // nothing else; native picker behavior via hidden input
}

function openAlbumPicker(){ requestNativeOcr('photos'); }
function openCameraPicker(){ requestNativeOcr('camera'); }
function resetModuleForm(){
  if ($('ocr-text')) $('ocr-text').value = '';
  if ($('customer-name')) $('customer-name').value = '';
  if ($('location-input')) $('location-input').value = '';
  state.parsedMaterialOverrides = {};
  if ($('ocr-confidence-pill')) $('ocr-confidence-pill').textContent = '信心值：0%';
  if ($('ocr-warning-pill')) $('ocr-warning-pill').textContent = '尚未辨識';
  if ($('module-result')) { $('module-result').classList.add('hidden'); $('module-result').innerHTML = ''; }
  if (state.module === 'ship') loadShipPreview();
}

async function handleFiles(fileList){
  const files = Array.from(fileList || []);
  if (!files.length) return;
  toast('請改用原生 App 的相機或相簿辨識；手動框選已整合到原生流程。', 'warn');
}

async function uploadOcrFile(file, useRoi=false){
  const msg = '此版本已改成原生 App 先框選再辨識，網頁端不再走舊 upload_ocr 路徑。';
  if ($('ocr-warning-pill')) $('ocr-warning-pill').textContent = msg;
  setPillState($('ocr-warning-pill'), 'warn');
  toast(msg, 'warn');
}

function normalizeOcrLine(line){
  return String(line || '').replace(/[×X＊*]/g, 'x').replace(/＝/g, '=').replace(/\s+/g, '');
}

function parseTextareaItems(){
  const textValue = ($('ocr-text')?.value || '').trim();
  if (!textValue) return [];
  const lines = textValue.split(/\n+/).map(s => normalizeOcrLine(s)).filter(Boolean);
  const items = [];
  let itemIndex = 0;
  lines.forEach(line => {
    const materialMatch = String(line).match(/(?:\||｜|材質[:：]?)(SPF|HF|DF|ROT|SPY|SP|RP|TD|MLH)\s*$/i);
    const lineMaterial = materialMatch ? String(materialMatch[1] || '').toUpperCase() : '';
    const pureLine = String(line).replace(/(?:\||｜|材質[:：]?)(SPF|HF|DF|ROT|SPY|SP|RP|TD|MLH)\s*$/i, '').trim();
    if (!pureLine || !pureLine.includes('=')) return;
    const [left, rightRaw] = pureLine.split('=');
    const segments = String(rightRaw || '').split(/[+＋]/).map(s => s.trim()).filter(Boolean);
    segments.forEach(seg => {
      const nums = seg.match(/\d+/g) || [];
      if (!nums.length) return;
      const rhs = nums[0];
      const qty = parseInt(nums[1] || '1', 10) || 1;
      const overrideMaterial = String(state.parsedMaterialOverrides?.[itemIndex] || '').trim().toUpperCase();
      items.push({
        product_text: `${left}=${rhs}`,
        product_code: `${left}=${rhs}`,
        qty,
        material: lineMaterial || overrideMaterial || ''
      });
      itemIndex += 1;
    });
  });
  return items;
}

function renderParsedMaterialEditor(items = parseTextareaItems()){
  const box = $('parsed-item-material-list');
  if (!box) return;
  if (!items.length) {
    box.innerHTML = '<div class="small-note">辨識出商品後，會在這裡逐筆選擇材質。</div>';
    return;
  }
  const nextOverrides = {};
  items.forEach((it, idx) => {
    const material = String(it.material || state.parsedMaterialOverrides?.[idx] || '').trim().toUpperCase();
    if (material) nextOverrides[idx] = material;
  });
  state.parsedMaterialOverrides = nextOverrides;
  box.innerHTML = items.map((it, idx) => `
    <div class="parsed-item-row">
      <div class="parsed-item-main">
        <div class="parsed-item-title">${escapeHTML(it.product_text || '')}</div>
        <div class="small-note">件數：${Number(it.qty || 0)}${it.material ? `｜目前材質：${escapeHTML(it.material)}` : '｜尚未選材質'}</div>
      </div>
      <select class="text-input parsed-item-material-select" onchange="setParsedItemMaterial(${idx}, this.value)">
        ${materialOptionsHtml(it.material || '')}
      </select>
    </div>
  `).join('');
}

function setParsedItemMaterial(index, material){
  state.parsedMaterialOverrides[index] = String(material || '').trim().toUpperCase();
  state.lastOcrItems = parseTextareaItems();
  renderParsedMaterialEditor(state.lastOcrItems);
}

function syncParsedItemViews(opts={}){
  state.lastOcrItems = parseTextareaItems();
  renderParsedMaterialEditor(state.lastOcrItems);
  if (state.module === 'ship') {
    renderPickedShipItems();
    if (opts.triggerShipPreview !== false) loadShipPreview();
  }
}

function toggleTodayChanges(){
  window.location.href = '/today-changes';
}

function renderTodayLogList(items, emptyText){
  const filtered = state.todayOnlyUnread ? (items || []).filter(r => r.__unread) : (items || []);
  if (!filtered || !filtered.length) return `<div class="small-note">${emptyText}</div>`;
  return filtered.map(r => `<div class="chip-item log-chip ${r.__unread ? 'unread-item' : ''}" data-log-id="${Number(r.id||0)}"><div class="log-main">${escapeHTML(r.created_at || '')}｜${escapeHTML(r.username || '')}｜${escapeHTML(r.action || '')}</div><button class="ghost-btn tiny-btn" onclick="deleteTodayChange(${Number(r.id||0)})">刪除</button></div>`).join('');
}

function renderTodayChangesFromData(data){
  const s = data.summary || {};
  const readAt = data.read_at || '';
  const markUnread = (items) => (items || []).map(r => ({ ...r, __unread: !readAt || String(r.created_at || '') > readAt }));
  if ($('home-unplaced-pill')) $('home-unplaced-pill').textContent = `未錄入倉庫圖：${s.unplaced_count || 0}`;
  if ($('today-unread-badge')) $('today-unread-badge').textContent = String(s.unread_count || 0);
  if ($('today-summary-cards')) $('today-summary-cards').innerHTML = [
    ['進貨', s.inbound_count || 0, 'inbound'],
    ['出貨', s.outbound_count || 0, 'outbound'],
    ['新增訂單', s.new_order_count || 0, 'orders'],
    ['未錄入倉庫圖', s.unplaced_count || 0, 'unplaced'],
    ['異常比對', s.anomaly_count || 0, 'anomaly'],
    ['未讀', s.unread_count || 0, 'all'],
  ].map(([t,v,k]) => `<div class="card ${state.todayCategoryFilter===k?'active':''}" onclick="setTodayCategoryFilter('${k}')"><div class="title">${t}</div><div class="sub">${v}</div></div>`).join('');
  if ($('today-inbound-list')) $('today-inbound-list').innerHTML = renderTodayLogList(markUnread(data.feed?.inbound || []), '今日沒有進貨');
  if ($('today-outbound-list')) $('today-outbound-list').innerHTML = renderTodayLogList(markUnread(data.feed?.outbound || []), '今日沒有出貨');
  if ($('today-order-list')) $('today-order-list').innerHTML = renderTodayLogList(markUnread(data.feed?.new_orders || []), '今日沒有新增訂單');
  if ($('today-unplaced-list')) $('today-unplaced-list').innerHTML = ((data.unplaced_items || []).map(i => `<div class="chip-item log-chip"><div class="log-main"><strong>未錄入：</strong>${escapeHTML(i.message || `${i.product_text} (${i.qty || i.unplaced_qty || 0})`)}</div></div>`).join('')) || '<div class="small-note">目前沒有未錄入倉庫圖商品</div>';
  if ($('today-anomaly-list')) $('today-anomaly-list').innerHTML = ((data.anomalies || []).map(a => `<div class="chip-item log-chip"><div class="log-main"><strong>${escapeHTML(a.type || '異常')}</strong>｜${escapeHTML(a.message || a.product_text || '異常')}</div></div>`).join('')) || '<div class="small-note">目前沒有異常</div>';
  applyTodayCategoryFilter();
}

async function deleteTodayChange(id){
  if (!id) return;
  const ok = await askConfirm('確定刪除這筆今日異動？', '刪除異動', '刪除', '取消');
  if (!ok) return;
  const row = document.querySelector(`[data-log-id="${Number(id)}"]`);
  if (row) row.style.opacity = '0.35';
  try {
    const data = await requestJSON(`/api/today-changes/${id}`, { method:'DELETE' });
    toast('已刪除異動', 'ok');
    renderTodayChangesFromData(data);
  } catch (e) {
    if (row) row.style.opacity = '1';
    toast(e.message || '刪除失敗', 'error');
  }
}

async function markTodayChangesRead(){
  try {
    await requestJSON('/api/today-changes/read', { method:'POST', body:'{}' });
    toast('已清除已讀', 'ok');
    await loadTodayChanges();
  } catch (e) { toast(e.message || '清除已讀失敗', 'error'); }
}

function toggleTodayUnreadFilter(){
  state.todayOnlyUnread = !state.todayOnlyUnread;
  const btn = $('today-unread-toggle');
  if (btn) btn.textContent = state.todayOnlyUnread ? '只看全部' : '只看未讀';
  loadTodayChanges();
}

function setTodayCategoryFilter(filter){
  state.todayCategoryFilter = filter || 'all';
  ['all','inbound','outbound','orders','unplaced','anomaly'].forEach(k => {
    const el = $(`today-filter-${k}`); if (el) el.classList.toggle('active', state.todayCategoryFilter === k);
  });
  applyTodayCategoryFilter();
}

function applyTodayCategoryFilter(){
  const map = {
    inbound: ['today-inbound-list'],
    outbound: ['today-outbound-list'],
    orders: ['today-order-list'],
    unplaced: ['today-unplaced-list'],
    anomaly: ['today-anomaly-list'],
    all: ['today-inbound-list','today-outbound-list','today-order-list','today-unplaced-list','today-anomaly-list']
  };
  const visible = new Set(map[state.todayCategoryFilter] || map.all);
  ['today-inbound-list','today-outbound-list','today-order-list','today-unplaced-list','today-anomaly-list'].forEach(id => {
    const panel = $(id)?.closest('.panel');
    if (panel) panel.classList.toggle('hidden-by-filter', !visible.has(id));
  });
}

async function loadTodayChanges(){
  if (!$('today-summary-cards')) return;
  try {
    const data = await requestJSON('/api/today-changes', { method:'GET' });
    renderTodayChangesFromData(data);
  } catch (e) {
    console.error(e);
    const box = $('today-summary-cards');
    if (box) box.innerHTML = `<div class="alert">${escapeHTML(e.message || '載入失敗')}</div>`;
  }
}

function renderOcrPreview(file){
  const panel = $('ocr-preview-panel'); const img = $('ocr-preview-img'); const wrap = $('ocr-preview-wrap'); const box = $('ocr-roi-box');
  if (!panel || !img || !wrap || !box) return;
  const url = URL.createObjectURL(file);
  img.src = url;
  panel.classList.remove('hidden');
  box.classList.add('hidden');
  let start = null;
  const update = (x1,y1,x2,y2) => {
    const rect = wrap.getBoundingClientRect();
    const left = Math.max(0, Math.min(x1,x2));
    const top = Math.max(0, Math.min(y1,y2));
    const width = Math.abs(x2-x1);
    const height = Math.abs(y2-y1);
    Object.assign(box.style, {left:left+'px', top:top+'px', width:width+'px', height:height+'px'});
    box.classList.remove('hidden');
    state.roi = { x: left / rect.width, y: top / rect.height, w: width / rect.width, h: height / rect.height };
  };
  const point = (e) => {
    const rect = wrap.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX - rect.left, y: t.clientY - rect.top };
  };
  const startSelect = (e) => { const p = point(e); start = p; update(p.x,p.y,p.x,p.y); if (e.cancelable) e.preventDefault(); };
  const moveSelect = (e) => { if (!start) return; const p = point(e); update(start.x,start.y,p.x,p.y); if (e.cancelable) e.preventDefault(); };
  const endSelect = async () => { if (start) { start = null; toast('已框選辨識範圍，請按「確認送出後開始識別」', 'ok'); } };
  wrap.onmousedown = startSelect;
  wrap.onmousemove = moveSelect;
  wrap.ontouchstart = startSelect;
  wrap.ontouchmove = moveSelect;
  window.onmouseup = endSelect;
  window.ontouchend = endSelect;
}

function applySuggestedRoiBox(roi){
  const wrap = $('ocr-preview-wrap');
  const box = $('ocr-roi-box');
  if (!wrap || !box || !roi) return;
  const apply = () => {
    const rect = wrap.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      setTimeout(apply, 80);
      return;
    }
    Object.assign(box.style, {
      left: `${roi.x * rect.width}px`,
      top: `${roi.y * rect.height}px`,
      width: `${roi.w * rect.width}px`,
      height: `${roi.h * rect.height}px`
    });
    box.classList.remove('hidden');
  };
  apply();
}

async function runRoiOcr(){
  toast('手動框選已改成原生 App 內先框選再辨識，請直接點原生相機或原生相簿。', 'ok');
}

function clearRoiSelection(){
  state.roi = null;
  $('ocr-roi-box')?.classList.add('hidden');
}

async function learnOcrCorrection(){
  const raw = (state.lastOcrOriginalText || '').split(/\n+/).map(s=>s.trim()).filter(Boolean);
  const edited = (($('ocr-text')?.value || '').trim()).split(/\n+/).map(s=>s.trim()).filter(Boolean);
  const pairs = [];
  const len = Math.min(raw.length, edited.length);
  for (let i=0;i<len;i++){
    if (raw[i] && edited[i] && raw[i] !== edited[i]) pairs.push([raw[i], edited[i]]);
  }
  if (!pairs.length) return toast('沒有可學習的修正', 'warn');
  try {
    for (const [wrong_text, correct_text] of pairs){
      await requestJSON('/api/save_correction', { method:'POST', body: JSON.stringify({ wrong_text, correct_text }) });
    }
    toast(`已學習 ${pairs.length} 筆修正`, 'ok');
  } catch (e) { toast(e.message, 'error'); }
}

async function loadOrdersList(){
  const el = $('orders-list');
  if (!el) return;
  try {
    const data = await requestJSON('/api/orders', { method:'GET' });
    el.innerHTML = '';
    (data.items || []).forEach(item => {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `<div class="title">${escapeHTML(item.customer_name || '')}</div><div class="sub">${escapeHTML(item.product_text || '')}${formatMaterialInline((item.material || '').toUpperCase())} × ${item.qty || 0}</div><div class="btn-row"><button class="ghost-btn small-btn to-master-btn">加入總單</button></div>`;
      card.querySelector('button').onclick = () => addOrderToMaster(item);
      el.appendChild(card);
    });
  } catch(e){ el.innerHTML = `<div class="alert">${escapeHTML(e.message)}</div>`; }
}

async function addOrderToMaster(item){
  try {
    await requestJSON('/api/orders/to-master', { method:'POST', body: JSON.stringify(item) });
    toast('已加入總單', 'ok');
    if (state.module === 'master_order') loadMasterList();
  } catch(e){ toast(e.message, 'error'); }
}

async function loadMasterList(){
  const el = $('master-list');
  if (!el) return;
  try {
    const data = await requestJSON('/api/master_orders', { method:'GET' });
    el.innerHTML = '';
    (data.items || []).forEach(item => {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `<div class="title">${escapeHTML(item.customer_name || '')}</div><div class="sub">${escapeHTML(item.product_text || '')}${formatMaterialInline((item.material || '').toUpperCase())} × ${item.qty || 0}</div>`;
      el.appendChild(card);
    });
  } catch(e){ el.innerHTML = `<div class="alert">${escapeHTML(e.message)}</div>`; }
}

function itemSignature(it){
  return `${it.product_text || ''}@@${(it.material || '').toUpperCase()}@@${Number(it.qty || 0)}`;
}

async function filterExistingCustomerItems(customerName, items){
  if (!customerName || !['orders','master_order','ship'].includes(state.module)) {
    return { items, ignored: [] };
  }
  const data = await requestJSON(`/api/customer-items?name=${encodeURIComponent(customerName)}`, { method:'GET' });
  const sigs = new Set((data.items || []).map(itemSignature));
  const ignored = [];
  const fresh = [];
  items.forEach(it => {
    if (sigs.has(itemSignature(it))) ignored.push(it);
    else fresh.push(it);
  });
  return { items: fresh, ignored };
}

async function confirmSubmit(){
  const module = state.module;
  const customer_name = ($('customer-name')?.value || '').trim();
  const location = ($('location-input')?.value || '').trim();
  const ocr_text = ($('ocr-text')?.value || '').trim();
  let items = ocr_text ? parseTextareaItems() : (state.lastOcrItems || []);
  if (!items.length) return toast('沒有可送出的辨識內容', 'warn');
  let endpoint = '/api/inventory';
  if (module === 'orders') endpoint = '/api/orders';
  if (module === 'master_order') endpoint = '/api/master_orders';
  if (module === 'ship') endpoint = '/api/ship';
  try {
    const dedupe = await filterExistingCustomerItems(customer_name, items);
    if (dedupe.ignored.length && dedupe.items.length) {
      const html = `<div class="dup-modal-list"><div><strong>重複商品</strong></div><ul>${dedupe.ignored.map(it => `<li>${escapeHTML(it.product_text)}${it.material ? `｜${escapeHTML(it.material)}` : ''} x ${it.qty || 1}</li>`).join('')}</ul><div><strong>將新增</strong></div><ul>${dedupe.items.map(it => `<li>${escapeHTML(it.product_text)}${it.material ? `｜${escapeHTML(it.material)}` : ''} x ${it.qty || 1}</li>`).join('')}</ul></div>`;
      const ok = await askConfirm(html, '重複商品確認', '忽略重複並送出', '取消', {html:true});
      if (!ok) return;
      items = dedupe.items;
    } else if (dedupe.ignored.length && !dedupe.items.length) {
      const html = `<div class="dup-modal-list"><div><strong>這次辨識的商品都已存在</strong></div><ul>${dedupe.ignored.map(it => `<li>${escapeHTML(it.product_text)}${it.material ? `｜${escapeHTML(it.material)}` : ''} x ${it.qty || 1}</li>`).join('')}</ul></div>`;
      const ok = await askConfirm(html, '重複商品確認', '知道了', '取消', {html:true});
      if (ok) toast('已略過重複商品', 'ok');
      return;
    }
    let payload = { customer_name, location, ocr_text, items };
    if (module === 'ship') {
      const preview = state.shipPreview || await requestJSON('/api/ship-preview', { method:'POST', body: JSON.stringify({ customer_name, items }) });
      state.shipPreview = preview;
      if (preview.needs_inventory_fallback) {
        const ok = await askConfirm('該客戶總單 / 訂單不足，是否改扣庫存？', '出貨提醒', '確認改扣庫存', '取消');
        if (!ok) return;
        payload.allow_inventory_fallback = true;
      }
    }
    const data = await requestJSON(endpoint, { method: 'POST', body: JSON.stringify(payload) });
    renderSubmitResult(module, data, customer_name);
    state.lastOcrItems = items;
    saveOcrHistoryEntry({ text: ocr_text, customer_name, items, line_map: state.lineMap, preview: state.nativePreview, created_at: new Date().toISOString() });
    if (module === 'inventory') await loadInventory();
    if (module === 'orders') await loadOrdersList();
    if (module === 'master_order') await loadMasterList();
    if (module === 'ship') await loadShippingRecords();
    if (module === 'warehouse') await renderWarehouse();
    toast('送出完成', 'ok');
  } catch (e) {
    const payload = { customer_name, location, ocr_text, items };
    if (isLikelyNetworkError(e)) {
      queuePendingSubmit({ endpoint, payload, module });
      showResult('網路暫時不穩，已先存入待同步佇列，恢復連線後會自動補送。');
      toast('已加入待同步佇列', 'warn');
      return;
    }
    showResult(`錯誤：${e.message}`, true);
  }
}

function renderSubmitResult(module, data, customerName=''){
  const box = $('module-result');
  if (!box) return;
  box.classList.remove('hidden');
  let html = '';
  if (module === 'ship') {
    const breakdown = data.breakdown || [];
    html += `<div class="section-title">出貨結果</div>`;
    html += `<div class="muted">客戶：${escapeHTML(customerName)}</div>`;
    breakdown.forEach(b => {
      const locs = (b.locations || []).map(loc => `${loc.zone}區第${loc.column_index}欄第${String(loc.visual_slot || loc.slot_number).padStart(2,'0')}格`).join('、');
      html += `<div class="card ship-result-card"><div class="title">${escapeHTML(b.product_text)}${formatMaterialInline((b.material || '').toUpperCase())}</div><div class="sub">本次出貨：${b.qty}</div>`;
      html += `<div class="chip-list"><div class="chip-item">總單扣除：${b.master_deduct}</div><div class="chip-item">訂單扣除：${b.order_deduct}</div><div class="chip-item">庫存扣除：${b.inventory_deduct}</div>${b.used_inventory_fallback ? '<div class="chip-item">已啟用庫存補扣</div>' : ''}</div>`;
      if (b.master_details?.length) html += `<div class="small-note">總單明細：${b.master_details.map(x=>`#${x.id}(${x.qty})`).join('、')}</div>`;
      if (b.order_details?.length) html += `<div class="small-note">訂單明細：${b.order_details.map(x=>`#${x.id}(${x.qty})`).join('、')}</div>`;
      if (b.inventory_details?.length) html += `<div class="small-note">庫存明細：${b.inventory_details.map(x=>`#${x.id}(${x.qty})`).join('、')}</div>`;
      if (b.remaining_after) html += `<div class="small-note">扣減後剩餘：總單 ${b.remaining_after.master}｜訂單 ${b.remaining_after.order}｜庫存 ${b.remaining_after.inventory}</div>`;
      if (locs) html += `<div class="small-note">倉庫位置：${escapeHTML(locs)}</div>`;
      html += `</div>`;
    });
  } else if (module === 'orders') {
    html += `<div class="section-title">訂單已建立</div><div class="muted">客戶：${escapeHTML(customerName)}｜狀態：pending</div>`;
  } else if (module === 'master_order') {
    html += `<div class="section-title">總單已更新</div><div class="muted">客戶：${escapeHTML(customerName)}</div>`;
  } else if (module === 'inventory') {
    html += `<div class="section-title">庫存已更新</div>`;
  } else {
    html += `<div class="section-title">已儲存</div>`;
  }
  box.innerHTML = html;
}

function showResult(msg, isError=false){
  const box = $('module-result');
  if (!box) return;
  box.classList.remove('hidden');
  box.innerHTML = `<div class="${isError ? 'warning-red' : ''}">${msg}</div>`;
}

async function loadInventory(){
  try {
    const data = await requestJSON('/api/inventory', { method:'GET' });
    const el = $('inventory-summary');
    if (!el) return;
    el.innerHTML = '';
    (data.items || []).forEach(item => {
      const card = document.createElement('div');
      card.className = `card ${item.needs_red ? 'red' : ''}`;
      card.innerHTML = `
        <div class="title ${item.needs_red ? 'warning-red' : ''}">${escapeHTML(item.product_text || '')}</div>
        <div class="sub">${materialLabel((item.material || '').toUpperCase())}</div>
        <div class="sub">總數量：${item.qty || 0}</div>
        <div class="sub">已放倉庫：${item.placed_qty || 0}</div>
        <div class="sub">未放倉庫：${item.unplaced_qty || 0}</div>
        <div class="sub">位置：${escapeHTML(item.location || '—')}</div>
      `;
      el.appendChild(card);
    });
  } catch (e) {
    console.error(e);
  }
}

async function loadCustomerBlocks(){
  try {
    const data = await requestJSON('/api/customers', { method:'GET' });
    const groups = { '北區': $('region-north'), '中區': $('region-center'), '南區': $('region-south') };
    if ($('customers-north')) groups['北區'] = $('customers-north');
    if ($('customers-center')) groups['中區'] = $('customers-center');
    if ($('customers-south')) groups['南區'] = $('customers-south');
    Object.values(groups).forEach(el => { if (el) el.innerHTML=''; });
    const q = ($('customer-search')?.value || '').trim().toLowerCase();
    (data.items || []).filter(c => !q || (c.name || '').toLowerCase().includes(q)).forEach(c => {
      const chip = document.createElement('div');
      chip.className = 'chip';
      chip.draggable = true;
      chip.dataset.customer = c.name;
      chip.innerHTML = `<span>${escapeHTML(c.name)}</span>`;
      chip.addEventListener('dragstart', ev => {
        ev.dataTransfer.setData('text/plain', JSON.stringify({name:c.name, region:c.region || '北區'}));
      });
      chip.addEventListener('click', () => { if (['orders','master_order','ship'].includes(state.module)) selectCustomerForModule(c.name); else openCustomerModal(c.name); });
      const target = groups[c.region || '北區'] || groups['北區'];
      target?.appendChild(chip);
    });
    setupCustomerDropZones();
    if (state.module === 'customers') {
      $('cust-region').value = '北區';
      if (! $('cust-name').value) {
        $('cust-name').placeholder = '點選客戶可自動帶入';
      }
    }
  } catch (e) {
    console.error(e);
  }
}


async function selectCustomerForModule(name){
  if ($('customer-name')) $('customer-name').value = name;
  try {
    const data = await requestJSON(`/api/customer-items?name=${encodeURIComponent(name)}`, { method:'GET' });
    state.customerItems = data.items || [];
    const panel = $('selected-customer-items');
    if (panel) {
      panel.classList.remove('hidden');
      if (state.module === 'ship') {
        const shipItems = (state.customerItems || []).filter(it => ['訂單','總單'].includes(it.source));
        panel.innerHTML = `
          <div class="section-title">${escapeHTML(name)} 的可出貨商品</div>
          <div class="ship-picker-grid">
            <div>
              <label class="field-label">商品</label>
              <select id="ship-product-base" class="text-input" onchange="refreshShipQuickPicker()"></select>
            </div>
            <div>
              <label class="field-label">隻數</label>
              <select id="ship-stick-select" class="text-input" onchange="refreshShipPieceOptions()"></select>
            </div>
            <div>
              <label class="field-label">件數</label>
              <select id="ship-piece-select" class="text-input"></select>
            </div>
          </div>
          <div class="btn-row ship-quick-actions">
            <button class="primary-btn" onclick="addSelectedShipItem()">加入出貨清單</button>
            <button class="ghost-btn" onclick="clearShipItems()">清空出貨清單</button>
          </div>
          <div id="ship-picked-items" class="chip-list"></div>
          <div class="card-list compact-card-list">${shipItems.map((it, idx) => `<div class="card ship-source-card"><div class="title">${escapeHTML(it.source || '')}</div><div class="sub">${escapeHTML(it.product_text || '')}${formatMaterialInline((it.material || '').toUpperCase())}</div><div class="sub">可出：${it.qty || 0} 件</div><div class="btn-row"><button class="ghost-btn small-btn" onclick="chooseShipItem(${idx})">選這筆</button></div></div>`).join('') || '<div class="small-note">此客戶目前沒有總單 / 訂單商品</div>'}</div>
        `;
        refreshShipQuickPicker();
        renderPickedShipItems();
      } else {
        panel.innerHTML = `<div class="section-title">${escapeHTML(name)} 的商品</div>` + (((data.items || []).map(it => `<div class="chip-item">${escapeHTML(it.source || '')}｜${escapeHTML(it.product_text || '')}${formatMaterialInline((it.material || '').toUpperCase())} × ${it.qty || 0}</div>`).join('')) || '<div class="small-note">此客戶目前沒有商品</div>');
      }
    }
    if (state.module === 'ship') await loadShipPreview();
  } catch (e) { toast(e.message, 'error'); }
}

function getShipQuickItems(){
  return (state.customerItems || []).filter(it => ['訂單','總單'].includes(it.source));
}
function refreshShipQuickPicker(){
  const baseSel = $('ship-product-base');
  const stickSel = $('ship-stick-select');
  if (!baseSel || !stickSel) return;
  const items = getShipQuickItems();
  const groups = new Map();
  items.forEach((it, idx) => {
    const parts = parseProductParts(it.product_text || '');
    const key = `${parts.left}@@${(it.material || '').toUpperCase()}`;
    if (!groups.has(key)) groups.set(key, { left: parts.left, material: (it.material || '').toUpperCase(), rows: [] });
    groups.get(key).rows.push({ ...it, __idx: idx, left: parts.left, right: parts.right });
  });
  const prev = baseSel.value;
  baseSel.innerHTML = Array.from(groups.entries()).map(([key, g]) => `<option value="${escapeHTML(key)}">${escapeHTML(g.left || '未指定商品')}${g.material ? `｜${escapeHTML(g.material)}` : ''}</option>`).join('');
  if (prev && [...groups.keys()].includes(prev)) baseSel.value = prev;
  const selected = groups.get(baseSel.value) || Array.from(groups.values())[0];
  const rows = selected ? selected.rows : [];
  stickSel.innerHTML = rows.map((row, idx) => `<option value="${escapeHTML(row.product_text || '')}@@${idx}">${escapeHTML(row.right || '未指定隻數')}｜可出 ${row.qty || 0} 件</option>`).join('') || '<option value="">沒有可選隻數</option>';
  refreshShipPieceOptions();
}
function refreshShipPieceOptions(){
  const stickSel = $('ship-stick-select');
  const pieceSel = $('ship-piece-select');
  if (!stickSel || !pieceSel) return;
  const [productText, idxRaw] = String(stickSel.value || '').split('@@');
  const shipItems = getShipQuickItems();
  const item = shipItems.find((it, idx) => (it.product_text || '') === productText && String(idx) === String(idxRaw)) || shipItems.find(it => (it.product_text || '') === productText);
  const maxQty = Math.max(1, parseInt(item?.qty || '1', 10) || 1);
  pieceSel.innerHTML = Array.from({length:maxQty}, (_,i) => `<option value="${i+1}">${i+1} 件</option>`).join('');
}
function chooseShipItem(index){
  const items = getShipQuickItems();
  const item = items[index];
  if (!item) return;
  const parts = parseProductParts(item.product_text || '');
  const key = `${parts.left}@@${(item.material || '').toUpperCase()}`;
  if ($('ship-product-base')) $('ship-product-base').value = key;
  refreshShipQuickPicker();
  const stickSel = $('ship-stick-select');
  if (stickSel) {
    const opt = Array.from(stickSel.options).find(o => String(o.value || '').startsWith(`${item.product_text || ''}@@`));
    if (opt) stickSel.value = opt.value;
  }
  refreshShipPieceOptions();
}
function renderPickedShipItems(){
  const box = $('ship-picked-items');
  if (!box) return;
  const items = parseTextareaItems();
  if (!items.length) {
    box.innerHTML = '<div class="small-note">尚未加入出貨清單</div>';
    return;
  }
  box.innerHTML = items.map((it, idx) => `<div class="chip-item">${escapeHTML(it.product_text || '')}${it.material ? `｜${escapeHTML(it.material)}` : ''} × ${it.qty || 0}<button class="remove" onclick="removePickedShipItem(${idx})">刪除</button></div>`).join('');
}
function removePickedShipItem(index){
  const lines = (($('ocr-text')?.value || '').split(/\n+/).map(s=>s.trim()).filter(Boolean));
  lines.splice(index, 1);
  if ($('ocr-text')) $('ocr-text').value = lines.join('\n');
  renderPickedShipItems();
  loadShipPreview();
}
function addSelectedShipItem(){
  const stickSel = $('ship-stick-select');
  const pieceSel = $('ship-piece-select');
  if (!stickSel || !pieceSel || !stickSel.value) return toast('請先選商品', 'warn');
  const [productText, idxRaw] = String(stickSel.value || '').split('@@');
  const shipItems = getShipQuickItems();
  const sourceItem = shipItems.find((it, idx) => (it.product_text || '') === productText && String(idx) === String(idxRaw)) || shipItems.find(it => (it.product_text || '') === productText);
  if (!sourceItem) return toast('找不到商品資料', 'warn');
  const parts = parseProductParts(sourceItem.product_text || '');
  const qty = Math.max(1, parseInt(pieceSel.value || '1', 10) || 1);
  const material = (sourceItem.material || '').toUpperCase();
  const newLine = `${parts.left}=${parts.right}x${qty}${material ? `｜${material}` : ''}`;
  const lines = (($('ocr-text')?.value || '').split(/\n+/).map(s=>s.trim()).filter(Boolean));
  lines.push(newLine);
  if ($('ocr-text')) $('ocr-text').value = lines.join('\n');
  renderPickedShipItems();
  loadShipPreview();
}
function clearShipItems(){
  if ($('ocr-text')) $('ocr-text').value = '';
  renderPickedShipItems();
  loadShipPreview();
}

async function loadShipPreview(){
  if (state.module !== 'ship') return;
  const panel = $('ship-preview-panel');
  if (!panel) return;
  const customer_name = ($('customer-name')?.value || '').trim();
  const items = parseTextareaItems();
  if (!customer_name || !items.length){
    panel.classList.add('hidden');
    panel.innerHTML = '';
    return;
  }
  try {
    const data = await requestJSON('/api/ship-preview', { method:'POST', body: JSON.stringify({ customer_name, items }) });
    state.shipPreview = data;
    panel.classList.remove('hidden');
    panel.innerHTML = `<div class="alert">${escapeHTML(data.message || '出貨預覽完成')}</div>` + (data.items || []).map(item => `
      <div class="ship-breakdown-item">
        <div><strong>${escapeHTML(item.product_text || '')}</strong>${item.material ? `｜<span class="ship-material-badge">${escapeHTML(item.material)}</span>` : ''}｜需求 ${item.qty || 0}</div>
        <div class="small-note">總單可扣 ${item.master_available || 0}｜訂單可扣 ${item.order_available || 0}｜庫存可扣 ${item.inventory_available || 0}</div>
        <div class="small-note">建議：${escapeHTML(item.recommendation || '')}${item.shortage_reasons?.length ? '｜' + escapeHTML(item.shortage_reasons.join('、')) : ''}</div>
        <div class="ship-breakdown-list">${(item.locations || []).map(loc => `<span class="ship-location-chip">${escapeHTML(loc.zone)}-${loc.column_index}-${String(loc.visual_slot || loc.slot_number || 0).padStart(2,'0')}｜${loc.material ? escapeHTML(loc.material) + '｜' : ''}將出 ${loc.ship_qty || loc.qty || 0}${typeof loc.remain_after !== 'undefined' ? `｜剩 ${loc.remain_after}` : ''}</span>`).join('') || '<span class="small-note">倉庫圖中尚未找到此商品位置</span>'}</div>
      </div>`).join('');
  } catch (e) {
    panel.classList.remove('hidden');
    panel.innerHTML = `<div class="alert">${escapeHTML(e.message || '出貨預覽失敗')}</div>`;
  }
}

async function openCustomerModal(name){
  try {
    state.currentCustomer = name;
    const detail = await requestJSON(`/api/customers/${encodeURIComponent(name)}`, { method:'GET' });
    const items = await requestJSON(`/api/customer-items?name=${encodeURIComponent(name)}`, { method:'GET' });
    $('customer-modal').classList.remove('hidden');
    const body = $('customer-modal-body');
    body.innerHTML = `
      <div class="card-list">
        <div class="card">
          <div class="title">${escapeHTML(name)}</div>
          <div class="sub">電話：${escapeHTML(detail.item?.phone || '')}</div>
          <div class="sub">地址：${escapeHTML(detail.item?.address || '')}</div>
          <div class="sub">特殊要求：${escapeHTML(detail.item?.notes || '')}</div>
          <div class="sub">區域：${escapeHTML(detail.item?.region || '')}</div>
        </div>
        <div class="card">
          <div class="title">商品</div>
          <div id="customer-modal-items" class="chip-list"></div>
        </div>
      </div>`;
    const list = $('customer-modal-items');
    (items.items || []).forEach(it => {
      const ch = document.createElement('div');
      ch.className='chip-item';
      ch.textContent = `${it.source}｜${it.product_text || ''}${it.material ? `｜${it.material}` : ''} × ${it.qty || 0}`;
      list.appendChild(ch);
    });
    $('cust-name').value = detail.item?.name || name;
    $('cust-phone').value = detail.item?.phone || '';
    $('cust-address').value = detail.item?.address || '';
    $('cust-notes').value = detail.item?.notes || '';
    $('cust-region').value = detail.item?.region || '北區';
  } catch (e) {
    toast(e.message, 'error');
  }
}

function closeCustomerModal(){ $('customer-modal')?.classList.add('hidden'); }

async function saveCustomer(){
  try {
    const payload = {
      name: ($('cust-name')?.value || '').trim(),
      phone: ($('cust-phone')?.value || '').trim(),
      address: ($('cust-address')?.value || '').trim(),
      notes: ($('cust-notes')?.value || '').trim(),
      region: $('cust-region')?.value || '北區'
    };
    await requestJSON('/api/customers', { method:'POST', body: JSON.stringify(payload) });
    toast('客戶已儲存', 'ok');
    await loadCustomerBlocks();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function loadShippingRecords(){
  try {
    const range = $('ship-range')?.value || '7';
    let start = $('ship-start')?.value;
    let end = $('ship-end')?.value;
    if (range !== 'custom') {
      const now = new Date();
      const days = parseInt(range, 10) || 7;
      const startDate = new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
      start = startDate.toISOString().slice(0, 10);
      end = now.toISOString().slice(0, 10);
      if ($('ship-start')) $('ship-start').value = start;
      if ($('ship-end')) $('ship-end').value = end;
    }
    const keyword = ($('ship-keyword')?.value || '').trim();
    const qs = new URLSearchParams();
    if (start) qs.set('start_date', start);
    if (end) qs.set('end_date', end);
    if (keyword) qs.set('q', keyword);
    const data = await requestJSON(`/api/shipping_records?${qs.toString()}`, { method:'GET' });
    const el = $('shipping-results');
    if (!el) return;
    const rows = data.items || [];
    if (!rows.length) {
      el.innerHTML = '<div class="small-note">目前沒有出貨紀錄</div>';
      return;
    }
    let html = '<table><thead><tr><th>客戶</th><th>商品</th><th>數量</th><th>操作人員</th><th>出貨時間</th></tr></thead><tbody>';
    rows.forEach(r => {
      html += `<tr><td>${escapeHTML(r.customer_name || '')}</td><td>${escapeHTML(r.product_text || '')}${r.material ? `｜${escapeHTML((r.material || '').toUpperCase())}` : ''}</td><td>${r.qty || 0}</td><td>${escapeHTML(r.operator || '')}</td><td>${escapeHTML(r.shipped_at || '')}</td></tr>`;
    });
    html += '</tbody></table>';
    el.innerHTML = html;
  } catch (e) {
    const el = $('shipping-results');
    if (el) el.innerHTML = `<div class="alert">${escapeHTML(e.message || '查詢失敗')}</div>`;
  }
}

async function renderWarehouse(){
  try {
    const [data, avail] = await Promise.all([
      requestJSON('/api/warehouse', { method:'GET' }),
      requestJSON('/api/warehouse/available-items', { method:'GET' })
    ]);
    state.warehouse.cells = data.cells || [];
    state.warehouse.zones = data.zones || {};
    state.warehouse.availableItems = avail.items || [];
    try {
      const external = JSON.parse(localStorage.getItem('shipPreviewWarehouseHighlights') || '[]');
      if (Array.isArray(external) && external.length) state.searchHighlightKeys = new Set(external);
    } catch (e) {}
    $('warehouse-unplaced-pill') && ($('warehouse-unplaced-pill').textContent = `未錄入倉庫圖：${state.warehouse.availableItems.length}`);
    renderWarehouseZones();
    setWarehouseZone(state.warehouse.activeZone || 'A', false);
  } catch (e) {
    console.error(e);
    toast(e.message || '倉庫圖載入失敗', 'error');
  }
}

function setWarehouseZone(zone, doScroll=true){
  state.warehouse.activeZone = zone;
  ['A','B','ALL'].forEach(z => {
    const btn = $('zone-switch-' + z);
    if (btn) btn.classList.toggle('active', z === zone);
  });
  const zoneA = $('zone-A');
  const zoneB = $('zone-B');
  $('warehouse-selection-pill') && ($('warehouse-selection-pill').textContent = `目前區域：${zone === 'ALL' ? '全部' : zone + ' 區'}`);
  if (zoneA) zoneA.classList.toggle('hidden-zone', zone === 'B');
  if (zoneB) zoneB.classList.toggle('hidden-zone', zone === 'A');
  if (doScroll) jumpToZone(zone === 'ALL' ? 'A' : zone);
}

function jumpToZone(zone){
  const el = $('zone-' + zone);
  if (el) el.scrollIntoView({behavior:'smooth', block:'start'});
}

async function addWarehouseColumn(zone){
  try {
    await requestJSON('/api/warehouse/add-column', {
      method:'POST',
      body: JSON.stringify({ zone })
    });
    state.warehouse.activeZone = zone;
    toast(zone + ' 區已新增格子欄', 'ok');
    await renderWarehouse();
  } catch (e) {
    toast(e.message || '新增格子失敗', 'error');
  }
}


function buildCellKey(zone, column_index, slot_number){
  return [zone, column_index, slot_number];
}

function getCellItems(zone, column_index, slot_number){
  const cell = state.warehouse.cells.find(c => c.zone === zone && parseInt(c.column_index) === parseInt(column_index) && parseInt(c.slot_number) === parseInt(slot_number));
  if (!cell) return [];
  try { return JSON.parse(cell.items_json || '[]'); } catch(e){ return []; }
}

function getMaxSlot(zone, column){
  const zoneCells = state.warehouse.cells.filter(c => c.zone === zone && parseInt(c.column_index) === parseInt(column));
  if (!zoneCells.length) return 20;
  return Math.max(20, ...zoneCells.map(c => parseInt(c.slot_number || 0)).filter(Boolean));
}

function getVisibleZoneColumns(zone){
  const cols = state.warehouse.cells.filter(c => c.zone === zone).map(c => parseInt(c.column_index || 0)).filter(Boolean);
  const maxCol = Math.max(6, ...(cols.length ? cols : [0]));
  return Array.from({length:maxCol}, (_,i)=>i+1);
}

function getColumnVisibleSlots(zone, column){
  const zoneCells = state.warehouse.cells.filter(c => c.zone === zone && parseInt(c.column_index) === parseInt(column));
  if (!zoneCells.length) return 20;
  return Math.max(20, ...zoneCells.map(c => parseInt(c.slot_number || 0)).filter(Boolean));
}

async function addWarehouseVisualSlot(zone, column){
  try {
    const next = getColumnVisibleSlots(zone, column) + 1;
    await requestJSON('/api/warehouse/add-slot', { method:'POST', body: JSON.stringify({ zone, column_index: column, slot_number: next }) });
    toast(`已新增第 ${next} 格`, 'ok');
    await renderWarehouse();
  } catch (e) { toast(e.message, 'error'); }
}

async function removeWarehouseVisualSlot(zone, column){
  const current = getColumnVisibleSlots(zone, column);
  const items = getCellItems(zone, column, current);
  if (items.length) return toast('最後一格仍有商品，無法刪除', 'warn');
  const ok = await askConfirm(`確定刪除 ${zone} 區第 ${column} 欄最後一格（第 ${current} 格）？`, '刪除格子', '刪除', '取消');
  if (!ok) return;
  try {
    await requestJSON('/api/warehouse/remove-slot', { method:'POST', body: JSON.stringify({ zone, column_index: column, slot_number: current }) });
    toast(`已刪除第 ${current} 格`, 'ok');
    await renderWarehouse();
  } catch (e) { toast(e.message, 'error'); }
}

function renderWarehouseZones(){
  const renderZone = (zone) => {
    const wrap = $(`zone-${zone}-grid`);
    if (!wrap) return;
    wrap.classList.add('vertical-card-grid');
    wrap.innerHTML = '';
    const columns = getVisibleZoneColumns(zone);
    columns.forEach(c => {
      const col = document.createElement('div');
      col.className = 'vertical-column-card intuitive-column';
      const visibleSlots = getColumnVisibleSlots(zone, c);
      col.innerHTML = `<div class="column-head-row"><div class="column-head">${zone} 第 ${c} 欄</div><div class="small-note">目前 ${visibleSlots} 格</div></div><div class="btn-row compact warehouse-col-tools"><button class="ghost-btn small-btn warehouse-plusminus-btn" onclick="addWarehouseVisualSlot('${zone}', ${c})">＋</button><button class="ghost-btn small-btn warehouse-plusminus-btn" onclick="removeWarehouseVisualSlot('${zone}', ${c})">－</button></div>`;
      const list = document.createElement('div');
      list.className = 'vertical-slot-list';
      for (let n = 1; n <= visibleSlots; n++) {
        const items = getCellItems(zone, c, n);
        const slot = document.createElement('div');
        slot.className = 'vertical-slot';
        slot.dataset.zone = zone;
        slot.dataset.column = c;
        slot.dataset.num = n;
        const key = `${zone}|${c}|direct|${n}`;
        if (items.length) slot.classList.add('filled');
        if (state.searchHighlightKeys.has(key)) slot.classList.add('highlight');
        const summary = items.length ? items.slice(0,2).map(it => `<div class="slot-line customer">客戶：${escapeHTML(it.customer_name || '未指定客戶')}</div><div class="slot-line product">商品：${escapeHTML(it.product_text || '')}</div><div class="slot-line material">${escapeHTML(materialLabel((it.material || '').toUpperCase()))}</div><div class="slot-line qty">數量：${it.qty || 0}</div>`).join('<hr class="slot-sep">') : '<div class="slot-line empty">空格</div>';
        slot.innerHTML = `<div class="slot-title">第 ${String(n).padStart(2, '0')} 格</div><div class="slot-count">${summary}</div>`;
        slot.addEventListener('click', () => { showWarehouseDetail(zone, c, n, items); openWarehouseModal(zone, c, n); });
        slot.addEventListener('dragover', ev => { ev.preventDefault(); slot.classList.add('drag-over'); });
        slot.addEventListener('dragleave', () => slot.classList.remove('drag-over'));
        slot.addEventListener('drop', async ev => {
          ev.preventDefault(); slot.classList.remove('drag-over');
          const raw = ev.dataTransfer.getData('text/plain');
          if (!raw) return;
          const parsed = JSON.parse(raw);
          if (parsed.kind === 'warehouse-item') {
            await moveWarehouseItem(parsed.fromKey, buildCellKey(zone, c, n), parsed.product_text, parsed.qty, parsed.material || '');
          }
        });
        list.appendChild(slot);
      }
      col.appendChild(list);
      wrap.appendChild(col);
    });
  };
  renderZone('A');
  renderZone('B');
}

async function addWarehouseSlot(zone, column){ return addWarehouseVisualSlot(zone, column); }
async function removeWarehouseSlot(zone, column){ return removeWarehouseVisualSlot(zone, column); }

async function deleteWarehouseColumn(zone, column){
  toast('已移除刪除整欄功能', 'warn');
}

async function openWarehouseModal(zone, column, num){
  state.currentCell = { zone, column, slot_type: 'direct', slot_number: num };
  state.currentCellItems = getCellItems(zone, column, num);
  $('warehouse-modal').classList.remove('hidden');
  $('warehouse-modal-meta').textContent = `${zone} 區 / 第 ${column} 欄 / 第 ${String(num).padStart(2, '0')} 格`;
  $('warehouse-note').value = (state.warehouse.cells.find(c => c.zone===zone && parseInt(c.column_index)===parseInt(column) && parseInt(c.slot_number)===parseInt(num)) || {}).note || '';
  renderWarehouseCellItems();
  refreshWarehouseSelect();
  const search = $('warehouse-item-search');
  if (search) search.oninput = refreshWarehouseSelect;
}

function closeWarehouseModal(){ $('warehouse-modal')?.classList.add('hidden'); }

function refreshWarehouseSelect(){
  const sel = $('warehouse-item-select');
  if (!sel) return;
  const q = ($('warehouse-item-search')?.value || '').trim().toLowerCase();
  sel.innerHTML = '';
  state.warehouse.availableItems.filter(it => !q || `${it.product_text} ${it.customer_name || ''} ${it.material || ''}`.toLowerCase().includes(q)).forEach(it => {
    const opt = document.createElement('option');
    opt.value = JSON.stringify(it);
    opt.textContent = `${it.product_text}${it.material ? `｜${it.material}` : ''}｜剩餘 ${it.unplaced_qty}`;
    sel.appendChild(opt);
  });
  if (!sel.options.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '沒有可加入的商品';
    sel.appendChild(opt);
  }
}

function renderWarehouseCellItems(){
  const list = $('warehouse-cell-items');
  if (!list) return;
  list.innerHTML = '';
  state.currentCellItems.forEach((it, idx) => {
    const chip = document.createElement('div');
    chip.className = 'chip-item';
    chip.draggable = true;
    chip.dataset.idx = idx;
    chip.innerHTML = `<span>${escapeHTML(it.product_text || '')}${it.material ? ` ｜ ${escapeHTML(it.material)}` : ''} × ${it.qty || 0}${it.customer_name ? ` ｜ ${escapeHTML(it.customer_name)}` : ''}</span>
      <button class="remove" data-idx="${idx}">刪除</button>`;
    chip.addEventListener('dragstart', ev => {
      ev.dataTransfer.setData('text/plain', JSON.stringify({
        kind: 'warehouse-item',
        fromKey: buildCellKey(state.currentCell.zone, state.currentCell.column, state.currentCell.slot_number),
        product_text: it.product_text || '',
        material: it.material || '',
        qty: it.qty || 1
      }));
    });
    chip.querySelector('.remove').addEventListener('click', () => {
      state.currentCellItems.splice(idx, 1);
      renderWarehouseCellItems();
    });
    list.appendChild(chip);
  });
}

function addSelectedItemToCell(){
  const sel = $('warehouse-item-select');
  if (!sel || !sel.value) return;
  const item = JSON.parse(sel.value);
  const qty = Math.max(1, parseInt(($('warehouse-add-qty')?.value || '1'), 10) || 1);
  state.currentCellItems.push({
    product_text: item.product_text,
    product_code: item.product_code || '',
    material: (item.material || '').toUpperCase(),
    qty,
    customer_name: item.customer_name || '',
    source: 'inventory'
  });
  renderWarehouseCellItems();
}

async function saveWarehouseCell(){
  if (!state.currentCell) return;
  try {
    const note = $('warehouse-note')?.value || '';
    await requestJSON('/api/warehouse/cell', {
      method: 'POST',
      body: JSON.stringify({
        ...state.currentCell,
        items: state.currentCellItems,
        note
      })
    });
    toast('格位已儲存', 'ok');
    closeWarehouseModal();
    await renderWarehouse();
    await loadInventory();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function moveWarehouseItem(fromKey, toKey, product_text, qty, material=''){
  try {
    await requestJSON('/api/warehouse/move', {
      method: 'POST',
      body: JSON.stringify({ from_key: fromKey, to_key: toKey, product_text, qty, material })
    });
    toast('已拖曳移動', 'ok');
    await renderWarehouse();
    await loadInventory();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function searchWarehouse(){
  const q = ($('warehouse-search')?.value || '').trim();
  if (!q) {
    state.searchHighlightKeys = new Set();
    $('warehouse-search-results')?.classList.add('hidden');
    await renderWarehouse();
    return;
  }
  try {
    const data = await requestJSON(`/api/warehouse/search?q=${encodeURIComponent(q)}`, { method:'GET' });
    state.searchHighlightKeys = new Set((data.items || []).map(r => `${r.cell.zone}|${r.cell.column_index}|${r.cell.slot_type}|${r.cell.slot_number}`));
    renderWarehouseZones();
    const box = $('warehouse-search-results');
    if (!box) return;
    box.classList.remove('hidden');
    if (!data.items || !data.items.length) {
      box.innerHTML = '<div class="search-card">沒有找到資料</div>';
      return;
    }
    box.innerHTML = '';
    data.items.forEach(r => {
      const cell = r.cell;
      const item = r.item;
      const div = document.createElement('div');
      div.className = 'search-card';
      const visualNum = parseInt(cell.slot_number || 0);
      div.innerHTML = `<strong>${escapeHTML(cell.zone)}區 第 ${cell.column_index} 欄 第 ${String(visualNum).padStart(2,'0')} 格</strong><br>${escapeHTML(item.product_text || '')}${item.material ? `｜${escapeHTML(item.material)}` : ''} × ${item.qty || 0}`;
      div.addEventListener('click', () => { setWarehouseZone(cell.zone); setTimeout(()=>{ highlightWarehouseCell(cell.zone, cell.column_index, cell.slot_number); openWarehouseModal(cell.zone, cell.column_index, cell.slot_number); }, 120); });
      box.appendChild(div);
    });
  } catch (e) {
    toast(e.message, 'error');
  }
}

function showWarehouseDetail(zone, column, num, items){
  const box = $('warehouse-detail-panel');
  if (!box) return;
  box.classList.remove('hidden');
  box.innerHTML = `<div class="section-title">${zone} 區第 ${column} 欄 第 ${String(num).padStart(2,'0')} 格</div>` + (items.length ? items.map(it => `<div class="chip-item"><div><strong>${escapeHTML(it.customer_name || '未指定客戶')}</strong></div><div>${escapeHTML(it.product_text || '')}</div><div>${escapeHTML(materialLabel((it.material || '').toUpperCase()))}</div><div>數量：${it.qty || 0}</div></div>`).join('') : '<div class="small-note">此格目前沒有商品</div>');
  highlightWarehouseCell(zone, column, num);
}

function highlightWarehouseCell(zone, column, num){
  const target = document.querySelector(`.vertical-slot[data-zone="${zone}"][data-column="${column}"][data-num="${num}"]`);
  if (target){
    target.classList.add('flash-highlight');
    target.scrollIntoView({behavior:'smooth', block:'center', inline:'center'});
    setTimeout(()=>target.classList.remove('flash-highlight'), 3200);
  }
}

async function reverseLookup(){
  if (state.lineMap && state.lineMap.length) {
    highlightOcrLine(0);
    toast('已定位到第一筆辨識區塊，可點下方每行內容切換定位', 'ok');
    return;
  }
  const q = ($('ocr-text')?.value || $('customer-name')?.value || '').trim();
  if (!q) return;
  if (state.module === 'warehouse') {
    $('warehouse-search').value = q.split(/\s+/)[0];
    searchWarehouse();
  } else {
    toast('已幫你抓取查詢條件', 'ok');
  }
}

async function renderCustomers(){
  if (state.module !== 'customers') return;
  await loadCustomerBlocks();
}

function openTodoAlbumPicker(){ $('todo-image-input')?.click(); }
function openTodoCameraPicker(){ $('todo-camera-input')?.click(); }
function handleTodoFiles(fileList){
  const files = Array.from(fileList || []);
  state.todoSelectedFile = files[0] || null;
  renderTodoSelectedPreview();
}
function renderTodoSelectedPreview(){
  const box = $('todo-selected-preview');
  if (!box) return;
  if (!state.todoSelectedFile) {
    box.classList.add('hidden');
    box.innerHTML = '';
    return;
  }
  const url = URL.createObjectURL(state.todoSelectedFile);
  box.classList.remove('hidden');
  box.innerHTML = `<div class="todo-preview-card"><img src="${url}" alt="todo preview"><div class="small-note">已選擇：${escapeHTML(state.todoSelectedFile.name || '圖片')}</div></div>`;
}
function clearTodoForm(){
  state.todoSelectedFile = null;
  if ($('todo-note')) $('todo-note').value = '';
  if ($('todo-date')) $('todo-date').value = '';
  if ($('todo-image-input')) $('todo-image-input').value = '';
  if ($('todo-camera-input')) $('todo-camera-input').value = '';
  renderTodoSelectedPreview();
}
async function saveTodoItem(){
  if (!state.todoSelectedFile) return toast('請先選擇照片', 'warn');
  try {
    const fd = new FormData();
    fd.append('image', state.todoSelectedFile);
    fd.append('note', ($('todo-note')?.value || '').trim());
    fd.append('due_date', ($('todo-date')?.value || '').trim());
    const res = await fetch('/api/todos', { method:'POST', body: fd, credentials:'same-origin' });
    const data = await res.json().catch(()=>({success:false,error:'回應解析失敗'}));
    if (!res.ok || data.success === false) throw new Error(data.error || `HTTP ${res.status}`);
    toast('代辦事項已新增', 'ok');
    clearTodoForm();
    loadTodos();
  } catch (e) {
    toast(e.message || '新增失敗', 'error');
  }
}
async function deleteTodoItem(id){
  const ok = await askConfirm('確認這張備忘照片已完成，要刪除這筆代辦嗎？', '完成代辦', '確認刪除', '取消');
  if (!ok) return;
  try {
    await requestJSON(`/api/todos/${id}`, { method:'DELETE' });
    toast('代辦事項已刪除', 'ok');
    loadTodos();
  } catch (e) {
    toast(e.message || '刪除失敗', 'error');
  }
}
async function loadTodos(){
  const box = $('todo-list');
  if (!box) return;
  try {
    const data = await requestJSON('/api/todos', { method:'GET' });
    const items = sortTodoItems(data.items || []);
    if (!items.length) {
      box.innerHTML = '<div class="small-note">目前沒有代辦事項</div>';
      return;
    }
    let currentDate = '__INIT__';
    let html = '';
    items.forEach(item => {
      const dateLabel = formatTodoDateLabel(item.due_date || '');
      if (dateLabel !== currentDate) {
        currentDate = dateLabel;
        html += `<div class="todo-date-heading">${escapeHTML(dateLabel)}</div>`;
      }
      const dateChip = item.due_date ? `<span class="todo-chip todo-chip-date">${escapeHTML(item.due_date)}</span>` : `<span class="todo-chip">未指定日期</span>`;
      html += `<div class="card todo-card premium-todo-card" onclick="deleteTodoItem(${Number(item.id || 0)})">
        <div class="todo-card-top">
          <div class="todo-top-badges">
            <span class="todo-chip todo-chip-accent">代辦事項</span>
            ${dateChip}
          </div>
          <div class="todo-top-hint">點卡片可刪除</div>
        </div>
        <div class="todo-card-main">
          <div class="todo-thumb-wrap">
            <img class="todo-thumb" src="/todo-image/${encodeURIComponent(item.image_filename || '')}" alt="todo image">
          </div>
          <div class="todo-card-info">
            <div class="title todo-title">${escapeHTML(item.note || '照片備忘')}</div>
            <div class="todo-meta-grid">
              <div class="todo-meta-item"><span class="todo-meta-label">建立者</span><span class="todo-meta-value">${escapeHTML(item.created_by || '未填寫')}</span></div>
              <div class="todo-meta-item"><span class="todo-meta-label">建立時間</span><span class="todo-meta-value">${escapeHTML(item.created_at || '')}</span></div>
            </div>
          </div>
        </div>
        <div class="btn-row todo-card-actions"><button class="primary-btn small-btn" onclick="event.stopPropagation(); deleteTodoItem(${Number(item.id || 0)})">確認完成並刪除</button></div>
      </div>`;
    });
    box.innerHTML = html;
  } catch (e) {
    box.innerHTML = `<div class="alert">${escapeHTML(e.message || '代辦事項載入失敗')}</div>`;
  }
}

function escapeHTML(str){
  return String(str ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}

// expose globals
window.openAlbumPicker = openAlbumPicker;
window.openCameraPicker = openCameraPicker;
window.resetModuleForm = resetModuleForm;
window.confirmSubmit = confirmSubmit;
window.reverseLookup = reverseLookup;
window.logout = logout;
window.submitLogin = submitLogin;
window.toggleLoginSave = toggleLoginSave;
window.changePassword = changePassword;
window.openCustomerModal = openCustomerModal;
window.closeCustomerModal = closeCustomerModal;
window.saveCustomer = saveCustomer;
window.loadShippingRecords = loadShippingRecords;
window.searchWarehouse = searchWarehouse;
window.closeWarehouseModal = closeWarehouseModal;
window.addSelectedItemToCell = addSelectedItemToCell;
window.saveWarehouseCell = saveWarehouseCell;
window.renderWarehouse = renderWarehouse;
window.renderCustomers = renderCustomers;
window.toggleTodayChanges = toggleTodayChanges;
window.markTodayChangesRead = markTodayChangesRead;
window.toggleTodayUnreadFilter = toggleTodayUnreadFilter;
window.deleteTodayChange = deleteTodayChange;
window.runRoiOcr = runRoiOcr;
window.clearRoiSelection = clearRoiSelection;
window.learnOcrCorrection = learnOcrCorrection;
window.loadShipPreview = loadShipPreview;
window.restoreOcrHistory = restoreOcrHistory;
window.highlightOcrLine = highlightOcrLine;
window.selectCustomerForModule = selectCustomerForModule;
window.addOrderToMaster = addOrderToMaster;

window.setWarehouseZone = setWarehouseZone;
window.jumpToZone = jumpToZone;
window.addWarehouseSlot = addWarehouseSlot;
window.removeWarehouseSlot = removeWarehouseSlot;
window.deleteWarehouseColumn = deleteWarehouseColumn;
window.loadAdminUsers = loadAdminUsers;
window.loadGoogleOcrStatus = loadGoogleOcrStatus;
window.loadBackups = loadBackups;
window.createBackup = createBackup;
window.setTodayCategoryFilter = setTodayCategoryFilter;
window.setGoogleOcrEnabled = setGoogleOcrEnabled;
window.openTodoAlbumPicker = openTodoAlbumPicker;
window.openTodoCameraPicker = openTodoCameraPicker;
window.saveTodoItem = saveTodoItem;
window.clearTodoForm = clearTodoForm;
window.deleteTodoItem = deleteTodoItem;
window.refreshShipQuickPicker = refreshShipQuickPicker;
window.refreshShipPieceOptions = refreshShipPieceOptions;
window.chooseShipItem = chooseShipItem;
window.addSelectedShipItem = addSelectedShipItem;
window.clearShipItems = clearShipItems;
window.removePickedShipItem = removePickedShipItem;
window.addWarehouseVisualSlot = addWarehouseVisualSlot;
window.removeWarehouseVisualSlot = removeWarehouseVisualSlot;
window.toggleUserBlocked = toggleUserBlocked;