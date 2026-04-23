
const state = {
  module: null,
  rememberLogin: true,
  lastOcrItems: [],
  warehouse: { cells: [], zones: null, availableItems: [], activeZone: 'A', unplacedOpen: false },
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
  lastCustomerGuess: '',
  todoSelectedFile: null,
  todoSelectedFiles: [],
};

function $(id){ return document.getElementById(id); }
function qs(sel){ return document.querySelector(sel); }
function qsa(sel){ return Array.from(document.querySelectorAll(sel)); }

const NATIVE_SHELL_ORIGIN_ALLOWLIST = ['capacitor://localhost', 'http://localhost', 'https://localhost', 'ionic://localhost', 'app://localhost', 'null', ''];
const PENDING_SUBMIT_KEY = 'yuanxingPendingSubmits';
const OCR_HISTORY_KEY = 'yuanxingOcrHistory';

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
  state.lastOcrItems = it.items || parseTextareaItems();
  state.lineMap = it.line_map || [];
  state.nativePreview = it.preview || null;
  renderNativePreview();
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
  state.lineMap = payload.line_map || payload.lineMap || payload.blocks || [];
  if (payload.previewDataUrl || payload.preview_data_url) {
    state.nativePreview = { image: payload.previewDataUrl || payload.preview_data_url, roi: payload.roi || null };
  }
  renderNativePreview();
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

function saveModuleQuickJump(target, customerName='', productText=''){
  localStorage.setItem('moduleQuickJump', JSON.stringify({
    target,
    customerName,
    productText,
    at: Date.now()
  }));
}

function applyModuleQuickJump(){
  try {
    const raw = localStorage.getItem('moduleQuickJump');
    if (!raw) return;
    const jump = JSON.parse(raw);
    if (!jump || jump.target !== state.module) return;
    localStorage.removeItem('moduleQuickJump');
    if (jump.customerName && $('customer-name')) $('customer-name').value = jump.customerName;
    if (jump.productText) {
      if ($('ocr-text')) $('ocr-text').value = jump.productText;
      state.lastOcrItems = normalizeShipTextareaItems([{ product_text: jump.productText, product_code: jump.productText, qty: 1 }]);
      applyFormattedTextarea(true);
      if (state.module === 'ship') {
        syncShipItemsToTextarea(state.lastOcrItems);
      }
    }
    if ((state.module === 'orders' || state.module === 'master_order') && jump.customerName) {
      setTimeout(() => selectCustomerForModule(jump.customerName), 220);
    }
    if (state.module === 'warehouse' && jump.productText) {
      setTimeout(() => {
        if ($('warehouse-search')) $('warehouse-search').value = jump.productText;
        searchWarehouse();
      }, 220);
    }
  } catch (_e) {}
}

function quickJumpToModule(moduleKey, customerName='', productText=''){
  const targetMap = { orders:'/orders', master_order:'/master-order', ship:'/ship', warehouse:'/warehouse' };
  saveModuleQuickJump(moduleKey, customerName, productText);
  window.location.href = targetMap[moduleKey] || '/';
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
    box.innerHTML = files.length ? `<table class="backup-table"><thead><tr><th>檔名</th><th>大小</th><th>建立時間</th><th>操作</th></tr></thead><tbody>${files.map(f => `<tr><td>${escapeHTML(f.filename || '')}</td><td>${Number(f.size || 0).toLocaleString()}</td><td>${escapeHTML(f.created_at || '')}</td><td><div class="btn-row compact-row"><a class="ghost-btn tiny-btn" href="/api/backups/download/${encodeURIComponent(f.filename || '')}">下載</a>${String(f.filename||'').endsWith('.json') ? `<button class="ghost-btn tiny-btn" onclick="restoreBackupFile('${encodeURIComponent(f.filename || '')}')">還原</button>` : ''}</div></td></tr>`).join('')}</tbody></table>` : '<div class="small-note">目前沒有備份檔</div>';
  } catch (e) {
    box.innerHTML = `<div class="alert">${escapeHTML(e.message || '備份清單載入失敗')}</div>`;
  }
}

async function restoreBackupFile(encodedName){
  const name = decodeURIComponent(encodedName || '');
  const ok = await askConfirm(`確定要還原備份「${name}」？`, '還原備份', '還原', '取消');
  if (!ok) return;
  try {
    await requestJSON('/api/backups/restore', { method:'POST', body: JSON.stringify({ filename: name }) });
    toast('已還原備份', 'ok');
    loadBackups();
  } catch (e) {
    toast(e.message || '還原備份失敗', 'error');
  }
}

async function undoLastAction(){
  const msg = $('undo-msg');
  try {
    const data = await requestJSON('/api/undo-last', { method:'POST', body:'{}' });
    if (msg) msg.textContent = data.message || '已還原最近一筆';
    toast(data.message || '已還原最近一筆', 'ok');
    if (state.module) {
      if (state.module === 'inventory') await loadInventory();
      if (state.module === 'orders') { await loadOrdersList(); await loadCustomerBlocks(); }
      if (state.module === 'master_order') { await loadMasterList(); await loadCustomerBlocks(); }
      if (state.module === 'ship') { await loadShippingRecords(); await loadShipPreview(); }
      if (state.module === 'warehouse') await renderWarehouse();
      if (state.module === 'customers') await renderCustomers();
      if (state.module === 'todos') await loadTodos();
    }
  } catch (e) {
    if (msg) msg.textContent = e.message || '還原失敗';
    toast(e.message || '還原失敗', 'error');
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
  bindManualEntryFormatter();
  setupCustomerDropZones();

  if (module === 'inventory') { loadInventory(); }
  if (module === 'orders' || module === 'master_order') loadCustomerBlocks();
  if (module === 'orders') loadOrdersList();
  if (module === 'master_order') loadMasterList();
  if (module === 'shipping_query') loadShippingRecords();
  if (module === 'warehouse') renderWarehouse();
  if (module === 'customers') renderCustomers();
  if (module === 'todos') {
    const imageInput = $('todo-image-input');
    const cameraInput = $('todo-camera-input');
    imageInput?.addEventListener('change', (e) => handleTodoFiles(e.target.files));
    cameraInput?.addEventListener('change', (e) => handleTodoFiles(e.target.files));
    loadTodos();
  }
  applyModuleQuickJump();
}

function setupUploadButtons(){
  // 拍照 / 上傳檔案功能已取消，保留空函式避免舊引用報錯
}

function openAlbumPicker(){}
function openCameraPicker(){}
function resetModuleForm(){
  if ($('ocr-text')) $('ocr-text').value = '';
  if ($('customer-name')) $('customer-name').value = '';
  if ($('location-input')) $('location-input').value = '';
  if ($('ocr-confidence-pill')) $('ocr-confidence-pill').textContent = '信心值：0%';
  if ($('ocr-warning-pill')) $('ocr-warning-pill').textContent = '尚未辨識';
  if ($('module-result')) { $('module-result').classList.add('hidden'); $('module-result').innerHTML = ''; }
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
  return String(line || '')
    .replace(/[×X＊*]/g, 'x')
    .replace(/[＝﹦]/g, '=')
    .replace(/[＋]/g, '+')
    .replace(/[：]/g, ':')
    .replace(/\t+/g, '')
    .replace(/[\u00A0\u3000]/g, '')
    .replace(/\s+/g, '');
}

function sortParsedItems(items){
  return (items || []).slice().sort((a, b) => {
    const ad = a._dims || [0,0,0];
    const bd = b._dims || [0,0,0];
    return (Number(ad[2])||0) - (Number(bd[2])||0)
      || (Number(ad[1])||0) - (Number(bd[1])||0)
      || (Number(ad[0])||0) - (Number(bd[0])||0)
      || (Number(b.qty)||0) - (Number(a.qty)||0)
      || String(a.product_text || '').localeCompare(String(b.product_text || ''), 'zh-Hant');
  });
}

function splitManualRawLines(rawText=''){
  return String(rawText || '')
    .replace(/\r/g, '\n')
    .replace(/[；;]+/g, '\n')
    .replace(/\u3000/g, ' ')
    .split(/\n+/)
    .map(s => String(s || '').trim())
    .filter(Boolean);
}

function mergeParsedDuplicates(items=[]){
  const map = new Map();
  (items || []).forEach(it => {
    const key = `${it.product_text || ''}`;
    if (!map.has(key)) {
      map.set(key, { ...it, qty: Number(it.qty || 0) || 0 });
    } else {
      const cur = map.get(key);
      cur.qty = Number(cur.qty || 0) + (Number(it.qty || 0) || 0);
    }
  });
  return Array.from(map.values());
}

function formatManualEntryText(rawText=''){
  const sourceText = String(rawText || '');
  const rawLines = splitManualRawLines(sourceText);
  let lastDims = ['', '', ''];
  let customerGuess = extractCustomerNameFromText(sourceText);
  const parsed = [];

  const parseProductToken = (token) => {
    const parts = String(token || '').split('=');
    const leftRaw = parts.shift();
    const rightRaw = parts.join('=').replace(/[。．]/g, '').trim();
    if (!leftRaw || !rightRaw) return null;
    const leftParts = String(leftRaw || '').split(/x/i).map(s => s.trim());
    const dims = [0,1,2].map(i => {
      const v = (leftParts[i] || '').trim();
      if (!v || /^[_-]+$/.test(v)) return lastDims[i] || '';
      return v;
    });
    if (!dims[0]) dims[0] = lastDims[0] || '';
    if (!dims[1]) dims[1] = lastDims[1] || '';
    if (!dims[2]) dims[2] = lastDims[2] || '';
    if (!dims[0] || !dims[1] || !dims[2]) return null;
    lastDims = dims.slice();
    const nums = rightRaw.match(/\d+/g) || [];
    const qty = parseInt(nums[1] || nums[0] || '1', 10) || 1;
    const product_text = `${dims.join('x')}=${rightRaw}`;
    return { product_text, product_code: product_text, qty, _dims: dims.map(v => parseInt(v || 0, 10) || 0) };
  };

  rawLines.forEach(rawLine => {
    let line = String(rawLine || '')
      .replace(/[。．\.]/g, '')
      .replace(/[，,；;、]/g, '')
      .replace(/[｜|]/g, '｜')
      .replace(/商品資料[:：]?/g, '')
      .trim();
    if (!line) return;

    const customerInline = line.match(/^(?:客戶|公司|客戶名稱)\s*[：:]\s*(.+)$/i);
    if (customerInline) {
      customerGuess = customerInline[1].trim() || customerGuess;
      return;
    }

    line = normalizeOcrLine(line).replace(/[^0-9a-zA-Zx=+_\-｜:\u4e00-\u9fff]/g, '');
    if (!line) return;

    const productPattern = /(?:[_-]|\d{1,4})x(?:[_-]|\d{1,4})x(?:[_-]|\d{1,4})=[0-9x+]+/ig;
    const tokens = line.match(productPattern) || [];

    if (tokens.length) {
      const firstIdx = line.search(productPattern);
      if (firstIdx > 0) {
        const prefix = line.slice(0, firstIdx).replace(/^(?:客戶|公司|客戶名稱):?/i, '').trim();
        if (prefix && /[^0-9x=_\-+]/i.test(prefix) && !customerGuess) customerGuess = prefix;
      }
      tokens.forEach(token => {
        const item = parseProductToken(token);
        if (item) parsed.push(item);
      });
      return;
    }

    if (!line.includes('=') && /[^0-9x=_\-+]/.test(line)) {
      const cleanName = line.replace(/^(?:客戶|公司|客戶名稱):?/i, '').trim();
      if (cleanName && !customerGuess) customerGuess = cleanName;
      return;
    }

    if (!line.includes('=')) return;
    const item = parseProductToken(line);
    if (item) parsed.push(item);
  });

  const items = sortParsedItems(mergeParsedDuplicates(parsed));
  return {
    customerGuess,
    items,
    formattedText: items.map(it => `${it.product_text}`).join('\n')
  };
}

function renderParsedPreview(){
  const box = $('ocr-diff-preview');
  if (!box) return;
  box.classList.add('hidden');
  box.innerHTML = '';
}

function applyFormattedTextarea(force=false){
  const box = $('ocr-text');
  if (!box) return;
  const parsed = formatManualEntryText(box.value || '');
  state.lastCustomerGuess = parsed.customerGuess || '';
  if (parsed.customerGuess && $('customer-name') && !$('customer-name').value.trim()) $('customer-name').value = parsed.customerGuess;
  state.lastOcrItems = parsed.items || [];
  const nextText = (parsed.formattedText || '').trim();
  if (nextText && (force || nextText !== (box.value || '').trim())) box.value = nextText;
  renderParsedPreview();
}

function bindManualEntryFormatter(){
  const box = $('ocr-text');
  if (!box || box.dataset.bound === '1') return;
  box.dataset.bound = '1';
  let timer = null;
  const trigger = (force=false) => {
    clearTimeout(timer);
    timer = setTimeout(() => applyFormattedTextarea(force), force ? 0 : 120);
  };
  box.addEventListener('input', () => { trigger(false); if (state.module === 'ship') setTimeout(() => loadShipPreview(), 160); });
  box.addEventListener('paste', () => { trigger(true); if (state.module === 'ship') setTimeout(() => loadShipPreview(), 60); });
  box.addEventListener('blur', () => { trigger(true); if (state.module === 'ship') setTimeout(() => loadShipPreview(), 60); });
  $('batch-material')?.addEventListener('change', () => trigger(true));
}

function parseTextareaItems(){
  if (state.lastOcrItems && state.lastOcrItems.length) {
    return state.lastOcrItems.map(it => ({ product_text: it.product_text, product_code: it.product_code || it.product_text, qty: parseInt(it.qty || 0, 10) || 0 }));
  }
  const parsed = formatManualEntryText(($('ocr-text')?.value || '').trim());
  state.lastOcrItems = parsed.items || [];
  return (parsed.items || []).map(it => ({ product_text: it.product_text, product_code: it.product_code || it.product_text, qty: parseInt(it.qty || 0, 10) || 0 }));
}


function cleanOcrTextarea(){
  applyFormattedTextarea(true);
}

function setTodoButtonLoading(isBusy){
  const btn = $('todo-save-btn');
  if (!btn) return;
  btn.disabled = !!isBusy;
  btn.classList.toggle('is-loading', !!isBusy);
  btn.textContent = isBusy ? '新增中…' : '新增代辦';
}

function extractCustomerNameFromText(raw=''){
  const lines = String(raw || '').replace(/\r/g, '\n').split(/\n+/).map(s => s.trim()).filter(Boolean);
  const ignore = /^(商品資料|北區|中區|南區|FOB|FOB代付|CNF)$/i;
  const productPattern = /(?:[_-]|\d{1,4})x(?:[_-]|\d{1,4})x(?:[_-]|\d{1,4})=[0-9x+]+/i;
  for (const line of lines) {
    const normalized = normalizeOcrLine(line).trim();
    if (!normalized || ignore.test(normalized)) continue;
    const match = normalized.match(/^(?:客戶|公司|客戶名稱)\s*:?\s*(.+)$/);
    if (match && match[1]) return match[1].trim();
    if (productPattern.test(normalized)) {
      const idx = normalized.search(productPattern);
      const prefix = normalized.slice(0, idx).replace(/^(?:客戶|公司|客戶名稱):?/i, '').trim();
      if (prefix && /[^0-9x=_\-+]/i.test(prefix)) return prefix;
      continue;
    }
    if (!/=/.test(normalized) && /[^0-9xX=+_\-\s\.]/.test(normalized) && normalized.length <= 30) return normalized;
  }
  return '';
}

function formatTodoDateLabel(date=''){
  const today = new Date().toISOString().slice(0,10);
  if (!date) return '未指定日期';
  if (date === today) return '今天到期';
  if (date < today) return '已逾期';
  return date;
}

function sortTodoItems(items=[]){
  const today = new Date().toISOString().slice(0,10);
  return (items || []).slice().sort((a,b) => {
    const ad = Number(a.is_done || 0), bd = Number(b.is_done || 0);
    if (ad !== bd) return ad - bd;
    const aDue = a.due_date || '9999-99-99';
    const bDue = b.due_date || '9999-99-99';
    const rank = (itDue, done) => done ? 9 : (itDue === today ? 0 : itDue < today ? 1 : itDue === '9999-99-99' ? 3 : 2);
    const ar = rank(aDue, ad), br = rank(bDue, bd);
    return ar - br || aDue.localeCompare(bDue) || String(b.created_at||'').localeCompare(String(a.created_at||''));
  });
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
      card.innerHTML = `<div class=\"title\">${escapeHTML(item.customer_name || '')}</div><div class=\"sub\">${escapeHTML(item.product_text || '')} × ${item.qty || 0}</div><div class=\"btn-row\"><button class=\"ghost-btn small-btn to-master-btn\">加入總單</button></div>`;
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
      card.innerHTML = `<div class="title">${escapeHTML(item.customer_name || '')}</div><div class="sub">${escapeHTML(item.product_text || '')} × ${item.qty || 0}</div>`;
      el.appendChild(card);
    });
  } catch(e){ el.innerHTML = `<div class="alert">${escapeHTML(e.message)}</div>`; }
}

function itemSignature(it){
  return `${it.product_text || ''}@@${Number(it.qty || 0)}`;
}

async function filterExistingCustomerItems(customerName, items){
  if (!customerName || !['orders','master_order'].includes(state.module)) {
    return { items, ignored: [], duplicate_mode: '' };
  }
  const data = await requestJSON(`/api/customer-items?name=${encodeURIComponent(customerName)}`, { method:'GET' });
  const existing = data.items || [];
  const duplicates = items.filter(it => existing.some(ex => ex.product_text === it.product_text));
  if (!duplicates.length) return { items, ignored: [], duplicate_mode: '' };
  const panel = $('duplicate-action-panel');
  if (panel) {
    panel.classList.remove('hidden');
    panel.innerHTML = `<div class="section-title">偵測到重複商品</div><div class="muted">${duplicates.map(it => escapeHTML(it.product_text)).join('、')}</div>`;
  }
  const merge = await askConfirm('此客戶已有相同商品。\n按「合併」會累加數量；按「取代」會以這次貼上的資料覆蓋原本商品。', '重複商品', '合併', '取代');
  return { items, ignored: duplicates, duplicate_mode: merge ? 'merge' : 'replace' };
}


function setSubmitButtonLoading(isBusy){
  const btn = $('submit-btn');
  if (!btn) return;
  btn.disabled = !!isBusy;
  btn.classList.toggle('is-loading', !!isBusy);
  btn.textContent = isBusy ? '送出中…' : '確認送出';
}

function buildCommonCustomerStats(items){
  const sizeCount = new Map();
  const matCount = new Map();
  (items || []).forEach(it => {
    const row = formatCustomerProductRow(it.product_text || '');
    const size = (row.size || '').trim();
    const mat = (it.material || row.material || '').trim();
    if (size) sizeCount.set(size, (sizeCount.get(size) || 0) + 1);
    if (mat) matCount.set(mat, (matCount.get(mat) || 0) + 1);
  });
  const topSizes = Array.from(sizeCount.entries()).sort((a,b)=>b[1]-a[1] || a[0].localeCompare(b[0],'zh-Hant')).slice(0,6).map(([k])=>k);
  const topMaterials = Array.from(matCount.entries()).sort((a,b)=>b[1]-a[1] || a[0].localeCompare(b[0],'zh-Hant')).slice(0,6).map(([k])=>k);
  return { topSizes, topMaterials };
}

function renderEmptyCustomerStates(){
  [['region-north','北區目前沒有客戶'],['region-center','中區目前沒有客戶'],['region-south','南區目前沒有客戶'],['customers-north','北區目前沒有客戶'],['customers-center','中區目前沒有客戶'],['customers-south','南區目前沒有客戶']].forEach(([id,msg]) => {
    const el = $(id);
    if (el && !el.children.length) el.innerHTML = `<div class="empty-state-card">${msg}</div>`;
  });
}

function ensureCustomerRegionCard(customerName, itemCount=1, region='北區') {
  if (!customerName) return null;
  const groups = {
    '北區': $('region-north') || $('customers-north'),
    '中區': $('region-center') || $('customers-center'),
    '南區': $('region-south') || $('customers-south')
  };
  const target = groups[region] || groups['北區'];
  if (!target) return null;
  const empty = target.querySelector('.empty-state-card');
  if (empty) empty.remove();

  let card = Array.from(target.querySelectorAll('.customer-region-card'))
    .find(el => (el.dataset.customer || '').trim() === customerName.trim());

  if (!card) {
    card = document.createElement('button');
    card.type = 'button';
    card.className = 'customer-region-card';
    card.draggable = true;
    card.dataset.customer = customerName;
    card.addEventListener('dragstart', ev => {
      ev.dataTransfer.setData('text/plain', JSON.stringify({name: customerName, region}));
    });
    card.addEventListener('click', () => {
      if (card.dataset.longPressTriggered === '1') {
        card.dataset.longPressTriggered = '0';
        return;
      }
      if (['inventory','orders','master_order','ship'].includes(state.module)) selectCustomerForModule(customerName);
      else openCustomerModal(customerName);
    });
    target.prepend(card);
    setupCustomerDropZones();
  }

  card.innerHTML = buildCustomerRegionCard(customerName, itemCount);
  return card;
}

function renderOptimisticCustomerItems(customerName, items){
  const panel = $('selected-customer-items');
  if (!panel || !customerName) return;
  const stats = buildCommonCustomerStats(items || []);
  const tableRows = (items || []).map(it => {
    const row = formatCustomerProductRow(it.product_text || '');
    return `<tr><td>${escapeHTML(row.size)}</td><td>${escapeHTML(row.qtyText || '-')}</td><td>${escapeHTML(it.material || row.material || '')}</td></tr>`;
  }).join('') || '<tr><td colspan="3" class="muted">此客戶目前沒有商品</td></tr>';
  panel.classList.remove('hidden');
  panel.innerHTML = `
    <div class="customer-detail-card">
      <div class="customer-detail-header">
        <div>
          <div class="section-title">${escapeHTML(customerName)}</div>
          <div class="muted">${(items || []).length}筆商品</div>
        </div>
        <div class="customer-detail-tools">
          <label class="customer-note-inline">備註
            <select id="customer-trade-note" class="text-input small-inline">
              <option value="">未設定</option>
              <option value="FOB">FOB</option>
              <option value="FOB代付">FOB代付</option>
              <option value="CNF">CNF</option>
            </select>
          </label>
          <label class="batch-material-inline">
            <input type="checkbox" id="customer-batch-material-toggle"> 批量添加材質
          </label>
        </div>
      </div>
      <div class="common-meta-wrap">
        <div class="common-meta-block"><div class="common-meta-title">常用材質</div><div class="chip-list compact">${stats.topMaterials.length ? stats.topMaterials.map(v => `<span class="ship-location-chip">${escapeHTML(v)}</span>`).join('') : '<span class="small-note">尚未建立</span>'}</div></div>
        <div class="common-meta-block"><div class="common-meta-title">常用尺寸</div><div class="chip-list compact">${stats.topSizes.length ? stats.topSizes.map(v => `<span class="ship-location-chip">${escapeHTML(v)}</span>`).join('') : '<span class="small-note">尚未建立</span>'}</div></div>
      </div>
      <div class="table-card customer-table-wrap">
        <table>
          <thead><tr><th>尺寸</th><th>支數 x 件數</th><th>材質</th><th>來源</th><th>操作</th></tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
    </div>`;
}


function normalizeShipTextareaItems(items=[]){
  const ordered = [];
  const seen = new Map();
  (items || []).forEach(it => {
    const key = (it.product_text || '').trim();
    if (!key) return;
    if (!seen.has(key)) {
      const row = { product_text: key, product_code: it.product_code || key, qty: Number(it.qty || 0) || 1 };
      seen.set(key, row);
      ordered.push(row);
    } else {
      seen.get(key).qty += Number(it.qty || 0) || 1;
    }
  });
  return ordered;
}

function syncShipItemsToTextarea(items){
  const merged = normalizeShipTextareaItems(items);
  const box = $('ocr-text');
  if (box) box.value = merged.map(it => it.product_text).join('\n');
  state.lastOcrItems = merged;
  applyFormattedTextarea(true);
  loadShipPreview();
  renderShipSelectedItems();
}

function renderShipSelectedItems(){
  const box = $('ship-selected-items');
  if (!box) return;
  const items = normalizeShipTextareaItems(parseTextareaItems());
  const previewMap = new Map((state.shipPreview?.items || []).map(it => [it.product_text || '', it]));
  box.innerHTML = items.length ? items.map((it, idx) => {
    const preview = previewMap.get(it.product_text || '') || {};
    const totalAvailable = Number(preview.master_available||0)+Number(preview.order_available||0)+Number(preview.inventory_available||0);
    const sourceBreakdown = preview.source_breakdown || [];
    const breakdown = sourceBreakdown.length
      ? sourceBreakdown.map(src => `<span class="ship-mini-chip">${escapeHTML(src.source)} 可扣 ${src.available || 0}</span>`).join('')
      : '<span class="small-note">尚未載入來源</span>';
    const shortageReasons = preview.shortage_reasons || [];
    const shortage = shortageReasons.length
      ? `<div class="ship-shortage-banner">缺貨：${escapeHTML(shortageReasons.join('、'))}</div>`
      : '';
    return `<div class="ship-selected-card${shortageReasons.length ? ' has-shortage' : ''}">
      <div class="ship-selected-main">
        <strong>${escapeHTML(it.product_text)}</strong>
        <span class="ship-need-chip">需求 ${it.qty || 1}</span>
      </div>
      <div class="ship-selected-meta">
        <span class="ship-mini-chip ship-total-chip">總可扣 ${totalAvailable}</span>
        ${breakdown}
      </div>
      ${shortage}
      <div class="small-note">來源摘要：總單 ${preview.master_available || 0}｜訂單 ${preview.order_available || 0}｜庫存 ${preview.inventory_available || 0}</div>
      <div class="btn-row compact-row"><button type="button" class="ghost-btn tiny-btn" onclick="moveShipItem(${idx}, -1)">↑</button><button type="button" class="ghost-btn tiny-btn" onclick="moveShipItem(${idx}, 1)">↓</button><button type="button" class="ghost-btn tiny-btn danger-btn" onclick="removeShipItemAt(${idx})">移除</button></div>
    </div>`;
  }).join('') : '<span class="small-note">尚未選取商品</span>';
}

function moveShipItem(index, delta){
  const items = normalizeShipTextareaItems(parseTextareaItems());
  const next = index + delta;
  if (next < 0 || next >= items.length) return;
  const temp = items[index];
  items[index] = items[next];
  items[next] = temp;
  syncShipItemsToTextarea(items);
}

function removeShipItemAt(index){
  const items = normalizeShipTextareaItems(parseTextareaItems());
  items.splice(index, 1);
  syncShipItemsToTextarea(items);
}

function appendShipProductToTextarea(productText){
  const items = normalizeShipTextareaItems(parseTextareaItems());
  const existing = items.find(it => (it.product_text || '') === productText);
  if (!existing) items.push({ product_text: productText, product_code: productText, qty: 1 });
  syncShipItemsToTextarea(items);
}

function clearShipSelectedItems(){
  syncShipItemsToTextarea([]);
}

async function confirmSubmit(){
  const module = state.module;
  setSubmitButtonLoading(true);
  applyFormattedTextarea(true);
  let customer_name = ($('customer-name')?.value || '').trim() || (state.lastCustomerGuess || '').trim();
  const location = ($('location-input')?.value || '').trim();
  const ocr_text = ($('ocr-text')?.value || '').trim();
  let items = ocr_text ? parseTextareaItems() : (state.lastOcrItems || []);

  if (!items.length) {
    setSubmitButtonLoading(false);
    return toast('沒有可送出的商品資料', 'warn');
  }
  if (!customer_name && ['orders','master_order','ship','inventory'].includes(module)) {
    setSubmitButtonLoading(false);
    return toast('請先輸入或貼上客戶名稱', 'warn');
  }

  let endpoint = '/api/inventory';
  if (module === 'orders') endpoint = '/api/orders';
  if (module === 'master_order') endpoint = '/api/master_orders';
  if (module === 'ship') endpoint = '/api/ship';

  try {
    const dedupe = await filterExistingCustomerItems(customer_name, items);
    if (dedupe.ignored.length && dedupe.items.length) {
      const html = `<div class="dup-modal-list"><div><strong>重複商品</strong></div><ul>${dedupe.ignored.map(it => `<li>${escapeHTML(it.product_text)} x ${it.qty || 1}</li>`).join('')}</ul><div><strong>將新增</strong></div><ul>${dedupe.items.map(it => `<li>${escapeHTML(it.product_text)} x ${it.qty || 1}</li>`).join('')}</ul></div>`;
      const ok = await askConfirm(html, '重複商品確認', '忽略重複並送出', '取消', {html:true});
      if (!ok) { setSubmitButtonLoading(false); return; }
      items = dedupe.items;
    } else if (dedupe.ignored.length && !dedupe.items.length) {
      const html = `<div class="dup-modal-list"><div><strong>這次辨識的商品都已存在</strong></div><ul>${dedupe.ignored.map(it => `<li>${escapeHTML(it.product_text)} x ${it.qty || 1}</li>`).join('')}</ul></div>`;
      const ok = await askConfirm(html, '重複商品確認', '知道了', '取消', {html:true});
      setSubmitButtonLoading(false);
      if (ok) toast('已略過重複商品', 'ok');
      return;
    }

    if (customer_name && ['orders','master_order'].includes(module)) {
      ensureCustomerRegionCard(customer_name, items.length || 1, '北區');
      renderOptimisticCustomerItems(customer_name, items);
    }

    let payload = {
      customer_name,
      location,
      ocr_text,
      items,
      duplicate_mode: dedupe.duplicate_mode || '',
      region: '北區'
    };

    if (module === 'ship') {
      const preview = state.shipPreview || await requestJSON('/api/ship-preview', { method:'POST', body: JSON.stringify({ customer_name, items }) });
      state.shipPreview = preview;
      if (preview.needs_inventory_fallback) {
        const ok = await askConfirm('該客戶總單 / 訂單不足，是否改扣庫存？', '出貨提醒', '確認改扣庫存', '取消');
        if (!ok) { setSubmitButtonLoading(false); return; }
        payload.allow_inventory_fallback = true;
      }
    }

    if (customer_name) {
      try {
        await requestJSON('/api/customers', { method:'POST', body: JSON.stringify({ name: customer_name, region: '北區' }) });
      } catch (_e) {}
    }

    const data = await requestJSON(endpoint, { method: 'POST', body: JSON.stringify(payload) });

    renderSubmitResult(module, data, customer_name);
    await loadCustomerBlocks();

    if (customer_name && ['orders','master_order'].includes(module)) {
      const targetCard = ensureCustomerRegionCard(customer_name, items.length || 1, '北區');
      targetCard?.scrollIntoView({behavior:'smooth', block:'center'});
      await selectCustomerForModule(customer_name);
    }

    state.lastOcrItems = items;
    saveOcrHistoryEntry({ text: ocr_text, customer_name, items, line_map: state.lineMap, preview: state.nativePreview, created_at: new Date().toISOString() });

    if (module === 'inventory') await loadInventory();
    if (module === 'orders') await loadOrdersList();
    if (module === 'master_order') await loadMasterList();
    if (module === 'ship') {
      await loadShippingRecords();
      await loadShipPreview();
    }
    if (module === 'warehouse') await renderWarehouse();

    if (module !== 'ship') toast('已建立商品資料', 'ok');
  } catch (e) {
    const payload = { customer_name, location, ocr_text, items, duplicate_mode: '' };
    if (isLikelyNetworkError(e)) {
      queuePendingSubmit({ endpoint, payload, module });
      showResult('網路暫時不穩，已先存入待同步佇列，恢復連線後會自動補送。', true);
      toast('已加入待同步佇列', 'warn');
      setSubmitButtonLoading(false);
      return;
    }
    showResult(`錯誤：${e.message}`, true);
  } finally {
    setSubmitButtonLoading(false);
  }
}

function renderSubmitResult(module, data, customerName=''){
  const box = $('module-result');
  if (!box) return;
  if (module !== 'ship') {
    box.classList.add('hidden');
    box.innerHTML = '';
    return;
  }
  box.classList.remove('hidden');
  const breakdown = data.breakdown || [];
  if (!breakdown.length) {
    box.innerHTML = `<div class="success-card">已完成出貨，但目前沒有可顯示的扣減明細。</div>`;
    return;
  }
  const totals = breakdown.reduce((acc, item) => {
    acc.master += Number(item.master_deduct || 0);
    acc.order += Number(item.order_deduct || 0);
    acc.inventory += Number(item.inventory_deduct || 0);
    return acc;
  }, {master:0, order:0, inventory:0});
  box.innerHTML = `
    <div class="success-card">
      <div class="section-title">出貨扣減結果</div>
      <div class="small-note">${escapeHTML(customerName || '')} 已完成出貨，以下是本次扣除明細</div>
      <div class="ship-breakdown-list summary-row">
        <span class="ship-location-chip">總單共扣 ${totals.master}</span>
        <span class="ship-location-chip">訂單共扣 ${totals.order}</span>
        <span class="ship-location-chip">庫存共扣 ${totals.inventory}</span>
      </div>
      ${breakdown.map(item => `
        <div class="deduct-card">
          <div><strong>${escapeHTML(item.product_text || '')}</strong>｜出貨 ${item.qty || 0}</div>
          <div class="ship-breakdown-list">
            <span class="ship-location-chip">總單扣 ${item.master_deduct || 0}</span>
            <span class="ship-location-chip">訂單扣 ${item.order_deduct || 0}</span>
            <span class="ship-location-chip">庫存扣 ${item.inventory_deduct || 0}</span>
          </div>
          <div class="small-note">來源：${item.used_inventory_fallback ? '總單 / 訂單不足，已改扣庫存' : '依正常流程扣減'}</div>
          <div class="ship-breakdown-list">
            ${(item.locations || []).map(loc => `<span class="ship-location-chip">${escapeHTML(loc.zone)}-${loc.column_index}-${String(loc.visual_slot || loc.slot_number || 0).padStart(2,'0')}｜扣 ${loc.ship_qty || loc.qty || 0}</span>`).join('') || '<span class="small-note">倉庫圖中尚未找到此商品位置</span>'}
          </div>
        </div>
      `).join('')}
      <div class="btn-row"><button type="button" class="ghost-btn" onclick="quickJumpToModule('warehouse', '', '')">前往倉庫圖</button></div>
    </div>`;
}

async function loadShipPreview(){
  if (state.module !== 'ship') return;
  const panel = $('ship-preview-panel');
  if (!panel) return;
  const customer_name = ($('customer-name')?.value || '').trim();
  const items = normalizeShipTextareaItems(parseTextareaItems());
  if (!customer_name || !items.length){
    panel.classList.add('hidden');
    panel.innerHTML = '';
    return;
  }
  try {
    const data = await requestJSON('/api/ship-preview', { method:'POST', body: JSON.stringify({ customer_name, items }) });
    state.shipPreview = data;
    const highlightKeys = [];
    (data.items || []).forEach(item => (item.locations || []).forEach(loc => highlightKeys.push(`${loc.zone}|${loc.column_index}|direct|${loc.slot_number || loc.visual_slot || 0}`)));
    localStorage.setItem('shipPreviewWarehouseHighlights', JSON.stringify(highlightKeys));
    panel.classList.remove('hidden');
    panel.innerHTML = `<div class="success-card"><div class="section-title">出貨預覽</div><div class="small-note">${escapeHTML(data.message || '已整理可扣來源與倉位')}</div></div>` + (data.items || []).map(item => {
      const shortageTotal = Math.max(0, Number(item.qty||0) - (Number(item.master_available||0)+Number(item.order_available||0)+Number(item.inventory_available||0))); const shortage = (item.shortage_reasons || []).length ? `<div class="error-card compact-danger">缺貨提醒：${escapeHTML(item.shortage_reasons.join('、'))}${shortageTotal ? `｜不足 ${shortageTotal}` : ''}</div>` : '';
      const sourceChips = (item.source_breakdown || []).map(src => `<span class="ship-location-chip">${escapeHTML(src.source)} 可扣 ${src.available || 0}</span>`).join('');
      const locations = (item.locations || []).map(loc => `<button type="button" class="ship-location-chip ship-location-jump" onclick="quickJumpToModule('warehouse', '', ${JSON.stringify(item.product_text || '')})">${escapeHTML(loc.zone)}-${loc.column_index}-${String(loc.visual_slot || loc.slot_number || 0).padStart(2,'0')}｜可出 ${loc.ship_qty || loc.qty || 0}${typeof loc.remain_after !== 'undefined' ? `｜剩 ${loc.remain_after}` : ''}</button>`).join('') || '<span class="small-note">倉庫圖中尚未找到此商品位置</span>';
      return `<div class="ship-breakdown-item ${item.shortage_reasons?.length ? 'has-shortage' : ''}">
        <div><strong>${escapeHTML(item.product_text || '')}</strong>｜需求 ${item.qty || 0}</div>
        <div class="ship-breakdown-list"><span class="ship-mini-chip ship-total-chip">總可扣 ${Number(item.master_available||0)+Number(item.order_available||0)+Number(item.inventory_available||0)}</span>${sourceChips}</div>
        ${shortage}
        <div class="small-note">建議：${escapeHTML(item.recommendation || '')}</div>
        <div class="ship-breakdown-list">${locations}</div>
      </div>`;
    }).join('');
  } catch (e) {
    panel.classList.remove('hidden');
    panel.innerHTML = `<div class="error-card">${escapeHTML(e.message || '出貨預覽失敗')}</div>`;
  }
}

async function openCustomerModal(name){
  try {
    state.currentCustomer = name;
    const [detail, items, recent] = await Promise.all([
      requestJSON(`/api/customers/${encodeURIComponent(name)}`, { method:'GET' }),
      requestJSON(`/api/customer-items?name=${encodeURIComponent(name)}`, { method:'GET' }),
      loadCustomerRecentActivity(name)
    ]);
    $('customer-modal').classList.remove('hidden');
    const body = $('customer-modal-body');
    const stats = buildCommonCustomerStats(items.items || []);
    body.innerHTML = `
      <div class="card-list">
        <div class="card">
          <div class="title">${escapeHTML(name)}</div>
          <div class="sub">電話：${escapeHTML(detail.item?.phone || '')}</div>
          <div class="sub">地址：${escapeHTML(detail.item?.address || '')}</div>
          <div class="sub">特殊要求：${escapeHTML(detail.item?.notes || '')}</div>
          <div class="sub">區域：${escapeHTML(detail.item?.region || '')}</div>
          <div class="sub"><strong>常用材質：</strong>${stats.topMaterials.length ? escapeHTML(stats.topMaterials.join('、')) : '尚未建立'}</div>
          <div class="sub"><strong>常用尺寸：</strong>${stats.topSizes.length ? escapeHTML(stats.topSizes.join('、')) : '尚未建立'}</div>
        </div>
        <div class="card">
          <div class="title">商品</div>
          <div class="recent-activity-card">
            <div class="common-meta-title">最近異動</div>
            <div class="recent-activity-list">${renderCustomerRecentActivity(recent)}</div>
          </div>
          <div class="customer-batch-toolbar">
            <label class="customer-item-batch-check"><input type="checkbox" id="customer-select-all-modal"> 全選</label>
            <input id="customer-item-search-modal" class="text-input small-inline grow-input" placeholder="搜尋此客戶商品">
            <select id="customer-sort-modal" class="text-input small-inline">
              <option value="size">尺寸排序</option>
              <option value="material">材質排序</option>
              <option value="updated">更新時間排序</option>
            </select>
            <select id="customer-batch-material-modal" class="text-input small-inline">
              <option value="">批量套用材質</option>
              <option value="SPF">SPF</option><option value="HF">HF</option><option value="DF">DF</option>
              <option value="ROT">ROT</option><option value="SPY">SPY</option><option value="SP">SP</option>
              <option value="RP">RP</option><option value="TD">TD</option><option value="MLH">MLH</option>
            </select>
            <button class="ghost-btn tiny-btn" id="customer-batch-apply-modal">套用材質</button>
            <button class="ghost-btn tiny-btn danger-btn" id="customer-batch-delete-modal">批量刪除</button>
          </div>
          <div class="table-card customer-table-wrap"><table><thead><tr><th></th><th>尺寸</th><th>支數 x 件數</th><th>材質</th><th>來源</th><th>操作</th></tr></thead><tbody id="customer-modal-items"></tbody></table></div>
        </div>
      </div>`;
    const list = $('customer-modal-items');
    if (list) list.innerHTML = buildCustomerItemRows(name, items.items || []);
    bindCustomerPanelEnhancements(name, items.items || [], 'modal');
    $('customer-batch-apply-modal') && ($('customer-batch-apply-modal').onclick = () => batchApplyCustomerMaterial(name, 'modal'));
    $('customer-batch-delete-modal') && ($('customer-batch-delete-modal').onclick = () => batchDeleteCustomerItems(name, 'modal'));
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
      const days = parseInt(range, 10) || 7;
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - days + 1);
      end = endDate.toISOString().slice(0,10);
      start = startDate.toISOString().slice(0,10);
      if ($('ship-start')) $('ship-start').value = start;
      if ($('ship-end')) $('ship-end').value = end;
    }
    const qs = new URLSearchParams();
    const keyword = ($('ship-keyword')?.value || '').trim();
    if (start) qs.set('start_date', start);
    if (end) qs.set('end_date', end);
    if (keyword) qs.set('q', keyword);
    const data = await requestJSON(`/api/shipping_records?${qs.toString()}`, { method:'GET' });
    const el = $('shipping-results');
    if (!el) return;
    if (!data.records || !data.records.length) {
      el.innerHTML = '<div class="panel">沒有資料</div>';
      return;
    }
    let html = '<table><thead><tr><th>客戶</th><th>商品</th><th>數量</th><th>操作人員</th><th>出貨時間</th></tr></thead><tbody>';
    data.records.forEach(r => {
      html += `<tr><td>${escapeHTML(r.customer_name || '')}</td><td>${escapeHTML(r.product_text || '')}</td><td>${r.qty || 0}</td><td>${escapeHTML(r.operator || '')}</td><td>${escapeHTML(r.shipped_at || '')}</td></tr>`;
    });
    html += '</tbody></table>';
    el.innerHTML = html;
  } catch (e) {
    const el = $('shipping-results');
    if (el) el.innerHTML = `<div class="panel warning-red">${e.message}</div>`;
  }
}


function clearWarehouseHighlights(){
  state.searchHighlightKeys = new Set();
  state.warehouse.unplacedOpen = false;
  const box = $('warehouse-unplaced-list-inline');
  if (box) { box.classList.add('hidden'); box.innerHTML = ''; }
  const results = $('warehouse-search-results');
  if (results) { results.classList.add('hidden'); results.innerHTML = ''; }
  renderWarehouseZones();
  toast('已清除高亮', 'ok');
}

function getWarehouseCustomerHighlightName(){
  return (($('warehouse-search')?.value || '').trim()) || (($('customer-search')?.value || '').trim()) || (($('customer-name')?.value || '').trim()) || '';
}

function highlightWarehouseSameCustomer(){
  const customer = getWarehouseCustomerHighlightName();
  if (!customer) return toast('請先輸入客戶名稱或先搜尋客戶', 'warn');
  const keys = [];
  (state.warehouse.cells || []).forEach(cell => {
    let items = [];
    try { items = JSON.parse(cell.items_json || '[]'); } catch(e) {}
    if ((items || []).some(it => String(it.customer_name || '').trim() === customer.trim())) {
      keys.push(`${cell.zone}|${cell.column_index}|direct|${cell.slot_number}`);
    }
  });
  state.searchHighlightKeys = new Set(keys);
  renderWarehouseZones();
  const box = $('warehouse-search-results');
  if (box) {
    box.classList.remove('hidden');
    box.innerHTML = keys.length
      ? `<div class="success-card"><div class="section-title">同客戶高亮</div><div class="small-note">客戶：${escapeHTML(customer)}，共找到 ${keys.length} 個格位</div></div>`
      : `<div class="error-card"><div class="section-title">同客戶高亮</div><div class="small-note">找不到客戶 ${escapeHTML(customer)} 的倉位</div></div>`;
  }
  if (keys.length) {
    const first = keys[0].split('|');
    setWarehouseZone(first[0], false);
    setTimeout(() => highlightWarehouseCell(first[0], first[1], first[3]), 120);
  }
}

function toggleWarehouseUnplacedHighlight(){
  const box = $('warehouse-unplaced-list-inline');
  if (!box) return;
  state.warehouse.unplacedOpen = !state.warehouse.unplacedOpen;
  if (!state.warehouse.unplacedOpen) {
    box.classList.add('hidden');
    box.innerHTML = '';
    return;
  }
  const items = state.warehouse.availableItems || [];
  box.classList.remove('hidden');
  if (!items.length) {
    box.innerHTML = '<div class="empty-state-card compact-empty">目前沒有未錄入倉庫圖商品</div>';
    return;
  }
  box.innerHTML = `<div class="success-card"><div class="section-title">未錄入倉庫圖商品</div><div class="small-note">點商品可直接帶入搜尋</div></div>` + items.map((it, idx) => `<div class="search-card unplaced-highlight-card" data-unplaced-idx="${idx}"><strong>${escapeHTML(it.customer_name || '未指定客戶')}</strong><br>${escapeHTML(it.product_text || '')} × ${it.unplaced_qty || it.qty || 0}</div>`).join('');
  box.querySelectorAll('.unplaced-highlight-card').forEach(el => {
    el.addEventListener('click', () => {
      const idx = Number(el.dataset.unplacedIdx || 0);
      const item = items[idx];
      if (!item) return;
      if ($('warehouse-search')) $('warehouse-search').value = item.product_text || item.customer_name || '';
      searchWarehouse();
    });
  });
}

async function renderWarehouse(){
  try {
    const [warehouseRes, availRes] = await Promise.allSettled([
      requestJSON('/api/warehouse', { method:'GET' }),
      requestJSON('/api/warehouse/available-items', { method:'GET' })
    ]);
    const data = warehouseRes.status === 'fulfilled' ? warehouseRes.value : { cells: [], zones: {A:{},B:{}} };
    const avail = availRes.status === 'fulfilled' ? availRes.value : { items: [] };
    state.warehouse.cells = Array.isArray(data.cells) ? data.cells : [];
    state.warehouse.zones = data.zones || {};
    state.warehouse.availableItems = Array.isArray(avail.items) ? avail.items : [];
    try {
      const external = JSON.parse(localStorage.getItem('shipPreviewWarehouseHighlights') || '[]');
      if (Array.isArray(external) && external.length) state.searchHighlightKeys = new Set(external);
    } catch (e) {}
    if ($('warehouse-unplaced-pill')) $('warehouse-unplaced-pill').textContent = `未錄入倉庫圖：${state.warehouse.availableItems.length}`;
    renderWarehouseZones();
    setWarehouseZone(state.warehouse.activeZone || 'A', false);
    try {
      const quick = JSON.parse(localStorage.getItem('warehouseQuickHighlight') || 'null');
      if (quick && (quick.productText || quick.customerName || quick.q)) {
        const query = quick.productText || quick.customerName || quick.q;
        if ($('warehouse-search')) $('warehouse-search').value = query;
        setTimeout(() => searchWarehouse(), 80);
        localStorage.removeItem('warehouseQuickHighlight');
      }
    } catch (_e) {}
  } catch (e) {
    toast(e.message || '倉庫圖載入失敗', 'error');
    renderWarehouseZones();
    setWarehouseZone('A', false);
  }
}

function setWarehouseZone(zone, doScroll=true){
  state.warehouse.activeZone = zone || 'A';
  ['A','B','ALL'].forEach(z => {
    const btn = $('zone-switch-' + z);
    if (btn) btn.classList.toggle('active', z === state.warehouse.activeZone);
  });
  const zoneA = $('zone-A');
  const zoneB = $('zone-B');
  const pill = $('warehouse-selection-pill');
  if (pill) pill.textContent = `目前區域：${zone === 'ALL' ? '全部' : zone + ' 區'}`;
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

function visualSlotToCell(n){
  const num = parseInt(n, 10);
  if (num <= 10) return { side: 'front', slot: num };
  return { side: 'back', slot: num - 10 };
}

function cellToVisualSlot(side, slot){
  const n = parseInt(slot, 10);
  return side === 'back' ? n + 10 : n;
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
  return [1,2,3,4,5,6];
}

function getColumnVisibleSlots(zone, column){
  return 20;
}

async function addWarehouseVisualSlot(zone, column){
  toast('固定 20 格版本，暫不再增加', 'warn');
}

async function removeWarehouseVisualSlot(zone, column){
  toast('固定 20 格版本，暫不再減少', 'warn');
}

function renderWarehouseZones(){
  const renderZone = (zone) => {
    const wrap = $(`zone-${zone}-grid`);
    if (!wrap) return;
    wrap.className = 'zone-grid six-grid vertical-card-grid';
    wrap.innerHTML = '';
    const columns = [1,2,3,4,5,6];
    columns.forEach(c => {
      const col = document.createElement('div');
      col.className = 'vertical-column-card intuitive-column';
      col.innerHTML = `<div class="column-head-row"><div class="column-head">${zone} 區第 ${c} 欄</div><div class="small-note">20 格</div></div><div class="btn-row compact warehouse-col-tools"><button class="ghost-btn small-btn warehouse-mini-btn" title="增加格子" onclick="addWarehouseVisualSlot('${zone}', ${c})">＋</button><button class="ghost-btn small-btn warehouse-mini-btn" title="減少格子" onclick="removeWarehouseVisualSlot('${zone}', ${c})">－</button></div>`;
      const list = document.createElement('div');
      list.className = 'vertical-slot-list';
      for (let n = 1; n <= 20; n++) {
        const items = getCellItems(zone, c, n);
        const slot = document.createElement('div');
        slot.className = 'vertical-slot';
        slot.dataset.zone = zone;
        slot.dataset.column = c;
        slot.dataset.num = n;
        const directKey = `${zone}|${c}|direct|${n}`;
        let highlighted = state.searchHighlightKeys && state.searchHighlightKeys.has(directKey);
        if (items.length) slot.classList.add('filled');
        if (highlighted) slot.classList.add('highlight');
        const summary = items.length
          ? items.slice(0,2).map(it => `<div class="slot-line customer">客戶：${escapeHTML(it.customer_name || '未指定客戶')}</div><div class="slot-line product">商品：${escapeHTML(it.product_text || '')}</div><div class="slot-line qty">數量：${it.qty || 0}</div>`).join('<hr class="slot-sep">')
          : '<div class="slot-line empty">空格</div>';
        slot.innerHTML = `<div class="slot-title">第 ${String(n).padStart(2,'0')} 格</div><div class="slot-count">${summary}</div>`;
        slot.addEventListener('click', () => {
          showWarehouseDetail(zone, c, n, items);
          openWarehouseModal(zone, c, n);
        });
        slot.addEventListener('dragover', ev => { ev.preventDefault(); slot.classList.add('drag-over'); });
        slot.addEventListener('dragleave', () => slot.classList.remove('drag-over'));
        slot.addEventListener('drop', async ev => {
          ev.preventDefault();
          slot.classList.remove('drag-over');
          const raw = ev.dataTransfer.getData('text/plain');
          if (!raw) return;
          try {
            const parsed = JSON.parse(raw);
            if (parsed.kind === 'warehouse-item') {
              await moveWarehouseItem(parsed.fromKey, buildCellKey(zone, c, n), parsed.product_text, parsed.qty);
            }
          } catch (_e) {}
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
  toast('已取消整欄刪除功能', 'warn');
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
  state.warehouse.availableItems.filter(it => !q || `${it.product_text} ${it.customer_name || ''}`.toLowerCase().includes(q)).forEach(it => {
    const opt = document.createElement('option');
    opt.value = JSON.stringify(it);
    opt.textContent = `${it.product_text}｜剩餘 ${it.unplaced_qty}`;
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
    chip.innerHTML = `<span>${escapeHTML(it.product_text || '')} × ${it.qty || 0}${it.customer_name ? ` ｜ ${escapeHTML(it.customer_name)}` : ''}</span>
      <div class="btn-row compact-row">
        <button class="ghost-btn tiny-btn edit" data-idx="${idx}">編輯</button>
        <button class="remove" data-idx="${idx}">刪除</button>
      </div>`;
    chip.addEventListener('dragstart', ev => {
      ev.dataTransfer.setData('text/plain', JSON.stringify({
        kind: 'warehouse-item',
        fromKey: buildCellKey(state.currentCell.zone, state.currentCell.column, state.currentCell.slot_number),
        product_text: it.product_text || '',
        qty: it.qty || 1
      }));
    });
    chip.querySelector('.edit')?.addEventListener('click', async () => {
      const nextText = window.prompt('編輯格位商品資料', it.product_text || '');
      if (nextText === null) return;
      const nextQtyRaw = window.prompt('編輯數量', String(it.qty || 0));
      if (nextQtyRaw === null) return;
      const nextQty = parseInt(nextQtyRaw, 10);
      if (Number.isNaN(nextQty) || nextQty < 0) return toast('數量格式錯誤', 'error');
      state.currentCellItems[idx] = { ...it, product_text: String(nextText).trim(), qty: nextQty };
      renderWarehouseCellItems();
      toast('已更新格位內容，記得按儲存格位', 'ok');
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

async function moveWarehouseItem(fromKey, toKey, product_text, qty){
  try {
    await requestJSON('/api/warehouse/move', {
      method: 'POST',
      body: JSON.stringify({ from_key: fromKey, to_key: toKey, product_text, qty })
    });
    const fromLabel = `${fromKey[0]}-${fromKey[1]}-${String(fromKey[2] || fromKey[3] || 0).padStart(2,'0')}`;
    const toLabel = `${toKey[0]}-${toKey[1]}-${String(toKey[2] || toKey[3] || 0).padStart(2,'0')}`;
    toast(`已從 ${fromLabel} 移到 ${toLabel}`, 'ok');
    await renderWarehouse();
    await loadInventory();
    setTimeout(() => highlightWarehouseCell(toKey[0], toKey[1], toKey[2] || toKey[3]), 120);
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
    if (data.items && data.items[0]) {
      const first = data.items[0];
      setWarehouseZone(first.cell.zone, false);
      setTimeout(() => highlightWarehouseCell(first.cell.zone, first.cell.column_index, first.cell.slot_number), 120);
    }
    data.items.forEach(r => {
      const cell = r.cell;
      const item = r.item;
      const div = document.createElement('div');
      div.className = 'search-card';
      const visualNum = parseInt(cell.slot_number || 0);
      div.innerHTML = `<strong>${escapeHTML(cell.zone)}區 第 ${cell.column_index} 欄 第 ${String(visualNum).padStart(2,'0')} 格</strong><br>${escapeHTML(item.product_text || '')} × ${item.qty || 0}`;
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
  const mapped = visualSlotToCell(num);
  box.classList.remove('hidden');
  box.innerHTML = `<div class="section-title">${zone} 區第 ${column} 欄 第 ${String(num).padStart(2,'0')} 格</div><div class="small-note">${mapped.side === 'front' ? '前排' : '後排'}</div><div class="btn-row compact-row"><button class="ghost-btn tiny-btn" onclick="openWarehouseModal('${zone}', ${column}, ${num})">直接編輯此格</button></div>` + (items.length ? items.map(it => { const row = formatCustomerProductRow(it.product_text || ''); return `<div class="deduct-card"><div><strong>${escapeHTML(it.customer_name || '未指定客戶')}</strong></div><div>${escapeHTML(it.product_text || '')}</div><div>尺寸：${escapeHTML(row.size || '')}</div><div>材質：${escapeHTML((it.material || row.material || '未填'))}</div><div>數量：${it.qty || 0}</div><div class="small-note">格位：${zone}-${column}-${String(num).padStart(2,'0')}</div></div>`; }).join('') : '<div class="empty-state-card compact-empty">此格目前沒有商品</div>');
  highlightWarehouseCell(zone, column, num);
}

function openTodoAlbumPicker(){ $('todo-image-input')?.click(); }
function openTodoCameraPicker(){ $('todo-camera-input')?.click(); }
function parseTodoImageNames(raw=''){
  try {
    const arr = JSON.parse(raw || '[]');
    if (Array.isArray(arr)) return arr.filter(Boolean);
  } catch (e) {}
  return raw ? [String(raw)] : [];
}
function handleTodoFiles(fileList){
  const files = Array.from(fileList || []);
  state.todoSelectedFiles = files;
  state.todoSelectedFile = files[0] || null;
  renderTodoSelectedPreview();
}
function renderTodoSelectedPreview(){
  const box = $('todo-selected-preview');
  if (!box) return;
  if (!state.todoSelectedFiles || !state.todoSelectedFiles.length) {
    box.classList.add('hidden');
    box.innerHTML = '';
    return;
  }
  box.classList.remove('hidden');
  box.innerHTML = `<div class="todo-preview-grid">${state.todoSelectedFiles.map((file, idx) => { const url = URL.createObjectURL(file); return `<div class="todo-preview-card" draggable="true" data-todo-upload-idx="${idx}"><img src="${url}" alt="todo preview"><div class="small-note">${escapeHTML(file.name || `圖片${idx+1}`)}</div></div>`; }).join('')}</div>`;
  bindTodoUploadDrag();
}
function bindTodoUploadDrag(){
  let dragIndex = null;
  document.querySelectorAll('[data-todo-upload-idx]').forEach(card => {
    card.addEventListener('dragstart', () => { dragIndex = Number(card.dataset.todoUploadIdx || 0); });
    card.addEventListener('dragover', e => e.preventDefault());
    card.addEventListener('drop', e => {
      e.preventDefault();
      const dropIndex = Number(card.dataset.todoUploadIdx || 0);
      if (dragIndex === null || dragIndex === dropIndex) return;
      const files = [...state.todoSelectedFiles];
      const [moved] = files.splice(dragIndex, 1);
      files.splice(dropIndex, 0, moved);
      state.todoSelectedFiles = files;
      state.todoSelectedFile = files[0] || null;
      renderTodoSelectedPreview();
    });
  });
}
function clearTodoForm(){
  state.todoSelectedFile = null;
  state.todoSelectedFiles = [];
  if ($('todo-note')) $('todo-note').value = '';
  if ($('todo-date')) $('todo-date').value = '';
  if ($('todo-image-input')) $('todo-image-input').value = '';
  if ($('todo-camera-input')) $('todo-camera-input').value = '';
  renderTodoSelectedPreview();
}
async function saveTodoItem(){
  if (!state.todoSelectedFiles || !state.todoSelectedFiles.length) return toast('請先選擇照片', 'warn');
  setTodoButtonLoading(true);
  const keepNote = ($('todo-note')?.value || '').trim();
  const keepDate = ($('todo-date')?.value || '').trim();
  try {
    const fd = new FormData();
    state.todoSelectedFiles.forEach(file => fd.append('images', file));
    fd.append('note', keepNote);
    fd.append('due_date', keepDate);
    const res = await fetch('/api/todos', { method:'POST', body: fd, credentials:'same-origin' });
    const data = await res.json().catch(()=>({success:false,error:'回應解析失敗'}));
    if (!res.ok || data.success === false) throw new Error(data.error || `HTTP ${res.status}`);
    toast('代辦事項已新增', 'ok');
    clearTodoForm();
    await loadTodos();
  } catch (e) {
    if ($('todo-note')) $('todo-note').value = keepNote;
    if ($('todo-date')) $('todo-date').value = keepDate;
    toast(e.message || '新增失敗', 'error');
  } finally {
    setTodoButtonLoading(false);
  }
}
async function completeTodoItem(id){
  const ok = await askConfirm('確認此代辦已完成？', '完成代辦', '完成', '取消');
  if (!ok) return;
  try {
    await requestJSON(`/api/todos/${id}/complete`, { method:'POST', body:'{}' });
    const card = document.querySelector(`.todo-card[data-todo-id="${id}"]`);
    if (card) {
      card.style.transition = 'opacity .2s ease, transform .2s ease';
      card.style.opacity = '0';
      card.style.transform = 'translateY(-4px)';
      setTimeout(async () => { await loadTodos(); }, 180);
    } else {
      await loadTodos();
    }
    toast('已移到完成區', 'ok');
  } catch (e) {
    toast(e.message || '完成代辦失敗', 'error');
  }
}
async function restoreTodoItem(id){
  const ok = await askConfirm('確認把這筆代辦還原到進行中？', '還原代辦', '還原', '取消');
  if (!ok) return;
  try {
    await requestJSON(`/api/todos/${id}/restore`, { method:'POST', body:'{}' });
    const card = document.querySelector(`.todo-card[data-todo-id="${id}"]`);
    if (card) {
      card.style.transition = 'all .18s ease';
      card.style.opacity = '0';
      card.style.transform = 'translateY(-6px)';
      setTimeout(async () => { await loadTodos(); }, 180);
    } else {
      await loadTodos();
    }
    toast('代辦事項已還原', 'ok');
  } catch (e) {
    toast(e.message || '還原代辦失敗', 'error');
  }
}
async function deleteTodoItem(id){
  const ok = await askConfirm('確認這張備忘照片已完成，要刪除這筆代辦嗎？', '完成代辦', '確認刪除', '取消');
  if (!ok) return;
  try {
    await requestJSON(`/api/todos/${id}`, { method:'DELETE' });
    const card = document.querySelector(`.todo-card[data-todo-id="${id}"]`);
    if (card) {
      card.style.transition = 'opacity .2s ease, transform .2s ease';
      card.style.opacity = '0';
      card.style.transform = 'translateY(-4px)';
      setTimeout(async () => { await loadTodos(); }, 180);
    } else {
      await loadTodos();
    }
    toast('代辦事項已刪除', 'ok');
  } catch (e) {
    toast(e.message || '刪除失敗', 'error');
  }
}
async function persistTodoOrder(doneFlag){
  const ids = qsa(`.todo-card[data-done="${doneFlag}"]`).map(el => Number(el.dataset.todoId || 0)).filter(Boolean);
  if (!ids.length) return;
  try {
    await requestJSON('/api/todos/reorder', { method:'POST', body: JSON.stringify({ ids, done_flag: doneFlag }) });
  } catch (e) {
    toast(e.message || '代辦排序儲存失敗', 'error');
  }
}
function bindTodoCardDrag(){
  let dragging = null;
  qsa('.todo-card[data-done="0"]').forEach(card => {
    card.draggable = true;
    card.addEventListener('dragstart', () => { dragging = card; card.classList.add('is-dragging'); });
    card.addEventListener('dragend', async () => { card.classList.remove('is-dragging'); dragging = null; await persistTodoOrder(0); });
    card.addEventListener('dragover', e => e.preventDefault());
    card.addEventListener('drop', e => {
      e.preventDefault();
      if (!dragging || dragging === card) return;
      const parent = card.parentNode;
      const cards = [...parent.querySelectorAll('.todo-card[data-done="0"]')];
      const draggingIndex = cards.indexOf(dragging);
      const dropIndex = cards.indexOf(card);
      if (draggingIndex < dropIndex) parent.insertBefore(dragging, card.nextSibling);
      else parent.insertBefore(dragging, card);
    });
  });
}
async function loadTodos(){
  const box = $('todo-list');
  if (!box) return;
  try {
    const data = await requestJSON('/api/todos', { method:'GET' });
    const items = sortTodoItems(data.items || []);
    const active = items.filter(it => Number(it.is_done || 0) !== 1);
    const completed = items.filter(it => Number(it.is_done || 0) === 1);
    if (!items.length) {
      box.innerHTML = '<div class="empty-state-card"><div class="empty-state-title">目前沒有代辦事項</div><div class="small-note">可拍照或上傳多張圖片建立備忘，今天到期的會優先顯示</div></div>';
      return;
    }
    const today = new Date();
    const todayStr = today.toISOString().slice(0,10);
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0,10);
    const renderCard = (item, done=false) => {
      const imageNames = parseTodoImageNames(item.image_filename || '');
      const overdue = item.due_date && item.due_date < todayStr && !done;
      const dueToday = item.due_date && item.due_date === todayStr && !done;
      const dueTomorrow = item.due_date && item.due_date === tomorrowStr && !done;
      const dateChip = item.due_date ? `<span class="todo-chip todo-chip-date ${overdue ? 'todo-chip-overdue' : dueToday ? 'todo-chip-today' : dueTomorrow ? 'todo-chip-tomorrow' : ''}">${overdue ? '逾期' : dueToday ? '今天' : dueTomorrow ? '明天' : escapeHTML(item.due_date)}</span>` : `<span class="todo-chip">未指定日期</span>`;
      return `<div class="card todo-card premium-todo-card ${done ? 'todo-card-done' : ''}" data-done="${done ? 1 : 0}" data-todo-id="${Number(item.id || 0)}">
        <div class="todo-card-top">
          <div class="todo-top-badges">
            <span class="todo-chip todo-chip-accent">${done ? '已完成' : '代辦事項'}</span>
            ${dateChip}
          </div>
          <div class="todo-top-hint">${done ? '可刪除 / 還原' : '拖拉排序 / 完成 / 刪除'}</div>
        </div>
        <div class="todo-card-main">
          <div class="todo-thumb-wrap">
            <div class="todo-thumb-grid">${imageNames.map(src => `<img class="todo-thumb" src="/todo-image/${encodeURIComponent(src)}" alt="todo image" onclick="event.stopPropagation(); openTodoImagePreview('/todo-image/${encodeURIComponent(src)}')">`).join('')}</div>
          </div>
          <div class="todo-card-info">
            <div class="title todo-title">${escapeHTML(item.note || '照片備忘')}</div>
            <div class="todo-meta-grid">
              <div class="todo-meta-item"><span class="todo-meta-label">建立者</span><span class="todo-meta-value">${escapeHTML(item.created_by || '未填寫')}</span></div>
              <div class="todo-meta-item"><span class="todo-meta-label">建立時間</span><span class="todo-meta-value">${escapeHTML(item.created_at || '')}</span></div>
              <div class="todo-meta-item"><span class="todo-meta-label">圖片</span><span class="todo-meta-value">${imageNames.length} 張</span></div>
            </div>
          </div>
        </div>
        <div class="btn-row todo-card-actions">
          ${done ? `<button class="ghost-btn small-btn" onclick="event.stopPropagation(); restoreTodoItem(${Number(item.id || 0)})">還原</button>` : `<button class="primary-btn small-btn" onclick="event.stopPropagation(); completeTodoItem(${Number(item.id || 0)})">完成</button>`}
          <button class="ghost-btn small-btn" onclick="event.stopPropagation(); deleteTodoItem(${Number(item.id || 0)})">刪除</button>
        </div>
      </div>`;
    };
    const section = (title, arr, emptyText, done=false) => `<div class="todo-section-block"><div class="todo-date-heading">${title}</div>${arr.length ? arr.map(it => renderCard(it, done)).join('') : `<div class="empty-state-card compact-empty">${emptyText}</div>`}</div>`;
    box.innerHTML = section('進行中', active, '目前沒有進行中的代辦') + section('已完成', completed, '目前沒有已完成的代辦', true);
    bindTodoCardDrag();
  } catch (e) {
    box.innerHTML = `<div class="error-card">${escapeHTML(e.message || '代辦事項載入失敗')}</div>`;
  }
}

function openTodoImagePreview(src){
  const panel = $('module-result');
  if (!panel) return window.open(src, '_blank');
  panel.classList.remove('hidden');
  panel.innerHTML = `<div class="success-card todo-image-preview-card"><div class="btn-row compact-row" style="justify-content:flex-end"><button class="ghost-btn tiny-btn" onclick="document.getElementById('module-result').classList.add('hidden')">關閉</button></div><div class="section-title">圖片預覽</div><img class="todo-preview-large" src="${src}" alt="todo preview"></div>`;
}

function highlightWarehouseCell(zone, column, num){
  setWarehouseZone(zone, false);
  const target = document.querySelector(`.vertical-slot[data-zone="${zone}"][data-column="${column}"][data-num="${num}"]`);
  if (target){
    target.classList.remove('flash-highlight');
    void target.offsetWidth;
    target.classList.add('flash-highlight');
    target.scrollIntoView({behavior:'smooth', block:'center', inline:'center'});
    setTimeout(()=>target.classList.remove('flash-highlight'), 4200);
  }
}

async function reverseLookup(){
  const q = ($('ocr-text')?.value || $('customer-name')?.value || '').trim();
  if (!q) return;
  if (state.module === 'ship') {
    const items = parseTextareaItems();
    if (!items.length) return toast('請先輸入商品資料', 'warn');
    const resultBox = $('module-result');
    if (resultBox) {
      resultBox.classList.remove('hidden');
      resultBox.innerHTML = '<div class="success-card"><div class="section-title">反查商品位置</div><div class="small-note">查詢中…</div></div>';
    }
    const rows = [];
    for (const it of items) {
      try {
        const data = await requestJSON(`/api/warehouse/search?q=${encodeURIComponent(it.product_text)}`, { method:'GET' });
        (data.items || []).forEach(r => rows.push({ product_text: it.product_text, cell: r.cell, item: r.item }));
      } catch (_e) {}
    }
    if (resultBox) {
      if (!rows.length) {
        resultBox.innerHTML = '<div class="error-card"><div class="section-title">反查商品位置</div><div class="small-note">目前在倉庫圖找不到這些商品</div></div>';
      } else {
        const keys = rows.map(r => `${r.cell.zone}|${r.cell.column_index}|direct|${r.cell.slot_number}`);
        localStorage.setItem('shipPreviewWarehouseHighlights', JSON.stringify(keys));
        localStorage.setItem('moduleQuickJump', JSON.stringify({ target:'warehouse', customerName:'', productText:(rows[0]?.product_text || ''), at:Date.now() }));
        resultBox.innerHTML = `<div class="success-card"><div class="section-title">反查商品位置</div>${rows.map(r => `<div class="deduct-card"><div><strong>${escapeHTML(r.product_text)}</strong></div><div class="small-note">${escapeHTML(r.cell.zone)} 區第 ${r.cell.column_index} 欄 第 ${String(r.cell.slot_number).padStart(2,'0')} 格</div><div class="small-note">客戶：${escapeHTML(r.item.customer_name || '未指定客戶')}</div></div>`).join('')}<div class="btn-row"><a class="primary-btn" href="/warehouse">前往倉庫圖並高亮</a></div></div>`;
      }
    }
    return;
  }
  if (state.lineMap && state.lineMap.length) {
    highlightOcrLine(0);
    toast('已定位到第一筆辨識區塊，可點下方每行內容切換定位', 'ok');
    return;
  }
  if (state.module === 'warehouse') {
    $('warehouse-search').value = q.split(/\s+/)[0];
    searchWarehouse();
  }
}

async function renderCustomers(){
  if (state.module !== 'customers') return;
  await loadCustomerBlocks();
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
window.removeShipItemAt = removeShipItemAt;
window.batchDeleteCustomerItems = batchDeleteCustomerItems;
window.batchApplyCustomerMaterial = batchApplyCustomerMaterial;
window.loadShippingRecords = loadShippingRecords;
window.searchWarehouse = searchWarehouse;
window.closeWarehouseModal = closeWarehouseModal;
window.addSelectedItemToCell = addSelectedItemToCell;
window.saveWarehouseCell = saveWarehouseCell;
window.renderWarehouse = renderWarehouse;
window.renderCustomers = renderCustomers;
window.openTodoAlbumPicker = openTodoAlbumPicker;
window.openTodoCameraPicker = openTodoCameraPicker;
window.saveTodoItem = saveTodoItem;
window.clearTodoForm = clearTodoForm;
window.deleteTodoItem = deleteTodoItem;
window.completeTodoItem = completeTodoItem;
window.restoreTodoItem = restoreTodoItem;
window.openTodoImagePreview = openTodoImagePreview;
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
window.highlightWarehouseSameCustomer = highlightWarehouseSameCustomer;
window.toggleWarehouseUnplacedHighlight = toggleWarehouseUnplacedHighlight;
window.clearWarehouseHighlights = clearWarehouseHighlights;
window.jumpToZone = jumpToZone;
window.addWarehouseSlot = addWarehouseSlot;
window.removeWarehouseSlot = removeWarehouseSlot;
window.deleteWarehouseColumn = deleteWarehouseColumn;
window.loadAdminUsers = loadAdminUsers;
window.loadGoogleOcrStatus = loadGoogleOcrStatus;
window.loadBackups = loadBackups;
window.restoreBackupFile = restoreBackupFile;
window.undoLastAction = undoLastAction;
window.moveShipItem = moveShipItem;
window.clearShipSelectedItems = clearShipSelectedItems;
window.createBackup = createBackup;
window.setTodayCategoryFilter = setTodayCategoryFilter;
window.setGoogleOcrEnabled = setGoogleOcrEnabled;
window.addWarehouseVisualSlot = addWarehouseVisualSlot;
window.removeWarehouseVisualSlot = removeWarehouseVisualSlot;
window.toggleUserBlocked = toggleUserBlocked;
/* ===== 第十包覆寫強化 ===== */

function splitManualCompoundLine(line=''){
  const normalized = String(line || '')
    .replace(/[｜|]/g, ' ')
    .replace(/([0-9_\-]{1,4}x[0-9_\-]{1,4}x[0-9_\-]{1,4}=[0-9x+]+)/ig, '\n$1\n')
    .replace(/\n+/g, '\n');
  return normalized.split('\n').map(s => s.trim()).filter(Boolean);
}

function formatManualEntryText(rawText=''){
  const sourceText = String(rawText || '');
  const rawLines = splitManualRawLines(sourceText).flatMap(splitManualCompoundLine);
  let lastDims = ['', '', ''];
  let customerGuess = extractCustomerNameFromText(sourceText);
  const parsed = [];

  const parseProductToken = (token) => {
    const parts = String(token || '').split('=');
    const leftRaw = parts.shift();
    const rightRaw = parts.join('=').replace(/[。．]/g, '').trim();
    if (!leftRaw || !rightRaw) return null;
    const leftParts = String(leftRaw || '').split(/x/i).map(s => s.trim());
    const dims = [0,1,2].map(i => {
      const v = (leftParts[i] || '').trim();
      if (!v || /^[_-]+$/.test(v)) return lastDims[i] || '';
      return v;
    });
    if (!dims[0]) dims[0] = lastDims[0] || '';
    if (!dims[1]) dims[1] = lastDims[1] || '';
    if (!dims[2]) dims[2] = lastDims[2] || '';
    if (!dims[0] || !dims[1] || !dims[2]) return null;
    lastDims = dims.slice();
    const nums = rightRaw.match(/\d+/g) || [];
    const qty = parseInt(nums[1] || nums[0] || '1', 10) || 1;
    const product_text = `${dims.join('x')}=${rightRaw}`;
    return { product_text, product_code: product_text, qty, _dims: dims.map(v => parseInt(v || 0, 10) || 0) };
  };

  rawLines.forEach(rawLine => {
    let line = String(rawLine || '')
      .replace(/[。．\.]/g, '')
      .replace(/[，,；;、]/g, '')
      .replace(/商品資料[:：]?/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!line) return;

    const customerInline = line.match(/^(?:客戶|公司|客戶名稱)\s*[：:]\s*(.+)$/i);
    if (customerInline) {
      customerGuess = customerInline[1].trim() || customerGuess;
      return;
    }

    line = normalizeOcrLine(line).replace(/[^0-9a-zA-Zx=+_\-｜:\u4e00-\u9fff ]/g, '').trim();
    if (!line) return;

    const productPattern = /(?:[_-]|\d{1,4})x(?:[_-]|\d{1,4})x(?:[_-]|\d{1,4})=[0-9x+]+/ig;
    const tokens = line.match(productPattern) || [];

    if (tokens.length) {
      const firstIdx = line.search(productPattern);
      if (firstIdx > 0) {
        const prefix = line.slice(0, firstIdx).replace(/^(?:客戶|公司|客戶名稱):?/i, '').trim();
        if (prefix && /[^0-9x=_\-+]/i.test(prefix) && !customerGuess) customerGuess = prefix;
      }
      tokens.forEach(token => {
        const item = parseProductToken(token);
        if (item) parsed.push(item);
      });
      return;
    }

    if (!line.includes('=') && /[^0-9x=_\-+]/.test(line)) {
      const cleanName = line.replace(/^(?:客戶|公司|客戶名稱):?/i, '').trim();
      if (cleanName && !customerGuess) customerGuess = cleanName;
      return;
    }

    if (!line.includes('=')) return;
    const item = parseProductToken(line);
    if (item) parsed.push(item);
  });

  const items = sortParsedItems(mergeParsedDuplicates(parsed));
  return {
    customerGuess,
    items,
    formattedText: items.map(it => `${it.product_text}`).join('\n')
  };
}

function renderShipSelectedItems(){
  const box = $('ship-selected-items');
  if (!box) return;
  const items = normalizeShipTextareaItems(parseTextareaItems());
  const previewMap = new Map((state.shipPreview?.items || []).map(it => [it.product_text || '', it]));
  box.innerHTML = items.length ? items.map((it, idx) => {
    const preview = previewMap.get(it.product_text || '') || {};
    const totalAvailable = Number(preview.master_available||0)+Number(preview.order_available||0)+Number(preview.inventory_available||0);
    const shortageTotal = Math.max(0, Number(it.qty||0) - totalAvailable);
    const sourceBreakdown = preview.source_breakdown || [];
    const breakdown = sourceBreakdown.length
      ? sourceBreakdown.map(src => `<span class="ship-mini-chip">${escapeHTML(src.source)} 可扣 ${src.available || 0}</span>`).join('')
      : '<span class="small-note">尚未載入來源</span>';
    const shortage = shortageTotal > 0
      ? `<div class="ship-shortage-banner">缺貨：不足 ${shortageTotal}｜總單 ${preview.master_available || 0}｜訂單 ${preview.order_available || 0}｜庫存 ${preview.inventory_available || 0}</div>`
      : '';
    return `<div class="ship-selected-card${shortageTotal > 0 ? ' has-shortage' : ''}">
      <div class="ship-selected-main">
        <strong>${escapeHTML(it.product_text)}</strong>
        <span class="ship-need-chip">需求 ${it.qty || 1}</span>
      </div>
      <div class="ship-selected-meta">
        <span class="ship-mini-chip ship-total-chip">總可扣 ${totalAvailable}</span>
        ${breakdown}
      </div>
      ${shortage}
      <div class="small-note">來源摘要：總單 ${preview.master_available || 0}｜訂單 ${preview.order_available || 0}｜庫存 ${preview.inventory_available || 0}</div>
      <div class="ship-selected-actions"><button type="button" class="ghost-btn tiny-btn" onclick="moveShipItem(${idx}, -1)">↑</button><button type="button" class="ghost-btn tiny-btn" onclick="moveShipItem(${idx}, 1)">↓</button><button type="button" class="ghost-btn tiny-btn danger-btn" onclick="removeShipItemAt(${idx})">移除</button></div>
    </div>`;
  }).join('') : '<div class="empty-state-card compact-empty">尚未選取商品</div>';
}

async function loadShipPreview(){
  if (state.module !== 'ship') return;
  const panel = $('ship-preview-panel');
  if (!panel) return;
  const customer_name = ($('customer-name')?.value || '').trim();
  const items = normalizeShipTextareaItems(parseTextareaItems());
  renderShipSelectedItems();
  if (!customer_name || !items.length){
    panel.classList.add('hidden');
    panel.innerHTML = '';
    return;
  }
  try {
    const data = await requestJSON('/api/ship-preview', { method:'POST', body: JSON.stringify({ customer_name, items }) });
    state.shipPreview = data;
    renderShipSelectedItems();
    const highlightKeys = [];
    let totalMaster = 0, totalOrder = 0, totalInventory = 0, totalNeed = 0;
    (data.items || []).forEach(item => {
      totalMaster += Number(item.master_available||0);
      totalOrder += Number(item.order_available||0);
      totalInventory += Number(item.inventory_available||0);
      totalNeed += Number(item.qty||0);
      (item.locations || []).forEach(loc => highlightKeys.push(`${loc.zone}|${loc.column_index}|direct|${loc.slot_number || loc.visual_slot || 0}`));
    });
    localStorage.setItem('shipPreviewWarehouseHighlights', JSON.stringify(highlightKeys));
    const totalAvailable = totalMaster + totalOrder + totalInventory;
    const shortageAll = Math.max(0, totalNeed - totalAvailable);
    panel.classList.remove('hidden');
    const summary = `<div class="ship-preview-summary">
      <div class="ship-summary-chip">需求總量<span class="small-note">${totalNeed}</span></div>
      <div class="ship-summary-chip">總單可扣<span class="small-note">${totalMaster}</span></div>
      <div class="ship-summary-chip">訂單可扣<span class="small-note">${totalOrder}</span></div>
      <div class="ship-summary-chip">庫存可扣<span class="small-note">${totalInventory}</span></div>
      <div class="ship-summary-chip${shortageAll>0?' has-shortage':''}">整體不足<span class="small-note">${shortageAll}</span></div>
    </div>`;
    panel.innerHTML = `<div class="success-card"><div class="section-title">出貨預覽</div><div class="small-note">${escapeHTML(data.message || '已整理可扣來源與倉位')}</div></div>${summary}` + (data.items || []).map(item => {
      const shortageTotal = Math.max(0, Number(item.qty||0) - (Number(item.master_available||0)+Number(item.order_available||0)+Number(item.inventory_available||0)));
      const shortage = (item.shortage_reasons || []).length ? `<div class="error-card compact-danger">缺貨提醒：${escapeHTML(item.shortage_reasons.join('、'))}${shortageTotal ? `｜不足 ${shortageTotal}` : ''}</div>` : '';
      const sourceChips = (item.source_breakdown || []).map(src => `<span class="ship-location-chip">${escapeHTML(src.source)} 可扣 ${src.available || 0}</span>`).join('');
      const locations = (item.locations || []).map(loc => `<button type="button" class="ship-location-chip ship-location-jump" onclick="quickJumpToModule('warehouse', '', ${JSON.stringify(item.product_text || '')})">${escapeHTML(loc.zone)}-${loc.column_index}-${String(loc.visual_slot || loc.slot_number || 0).padStart(2,'0')}｜可出 ${loc.ship_qty || loc.qty || 0}${typeof loc.remain_after !== 'undefined' ? `｜剩 ${loc.remain_after}` : ''}</button>`).join('') || '<span class="small-note">倉庫圖中尚未找到此商品位置</span>';
      return `<div class="ship-breakdown-item ${item.shortage_reasons?.length ? 'has-shortage' : ''}">
        <div><strong>${escapeHTML(item.product_text || '')}</strong>｜需求 ${item.qty || 0}</div>
        <div class="ship-breakdown-list"><span class="ship-mini-chip ship-total-chip">總可扣 ${Number(item.master_available||0)+Number(item.order_available||0)+Number(item.inventory_available||0)}</span>${sourceChips}</div>
        ${shortage}
        <div class="small-note">建議：${escapeHTML(item.recommendation || '')}</div>
        <div class="ship-breakdown-list">${locations}</div>
      </div>`;
    }).join('');
  } catch (e) {
    panel.classList.remove('hidden');
    panel.innerHTML = `<div class="error-card">${escapeHTML(e.message || '出貨預覽失敗')}</div>`;
  }
}

function highlightWarehouseCell(zone, column, num){
  setWarehouseZone(zone, false);
  const target = document.querySelector(`.vertical-slot[data-zone="${zone}"][data-column="${column}"][data-num="${num}"]`);
  if (target){
    target.classList.remove('flash-highlight');
    void target.offsetWidth;
    target.classList.add('flash-highlight');
    target.scrollIntoView({behavior:'smooth', block:'center', inline:'center'});
    setTimeout(()=>target.classList.remove('flash-highlight'), 6800);
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
      box.innerHTML = '<div class="empty-state-card compact-empty">沒有找到資料</div>';
      return;
    }
    box.innerHTML = '';
    if (data.items && data.items[0]) {
      const first = data.items[0];
      setWarehouseZone(first.cell.zone, false);
      setTimeout(() => highlightWarehouseCell(first.cell.zone, first.cell.column_index, first.cell.slot_number), 120);
    }
    data.items.forEach(r => {
      const cell = r.cell;
      const item = r.item;
      const div = document.createElement('div');
      div.className = 'search-card warehouse-search-hit';
      div.innerHTML = `<strong>${escapeHTML(item.customer_name || '未指定客戶')}</strong><br>${escapeHTML(item.product_text || '')}<div class="small-note">${escapeHTML(cell.zone)} 區 第 ${cell.column_index} 欄 第 ${String(cell.slot_number).padStart(2,'0')} 格</div>`;
      div.addEventListener('click', ()=>{
        setWarehouseZone(cell.zone, false);
        setTimeout(()=>highlightWarehouseCell(cell.zone, cell.column_index, cell.slot_number), 80);
      });
      box.appendChild(div);
    });
  } catch (e) {
    $('warehouse-search-results').classList.remove('hidden');
    $('warehouse-search-results').innerHTML = `<div class="error-card">${escapeHTML(e.message || '搜尋失敗')}</div>`;
  }
}

async function moveWarehouseItem(fromKey, toKey, product_text, qty){
  try {
    await requestJSON('/api/warehouse/move', {
      method: 'POST',
      body: JSON.stringify({ from_key: fromKey, to_key: toKey, product_text, qty })
    });
    const fromLabel = `${fromKey[0]}-${fromKey[1]}-${String(fromKey[2] || fromKey[3] || 0).padStart(2,'0')}`;
    const toLabel = `${toKey[0]}-${toKey[1]}-${String(toKey[2] || toKey[3] || 0).padStart(2,'0')}`;
    toast(`搬移完成：${product_text}｜${fromLabel} → ${toLabel}`, 'ok');
    await renderWarehouse();
    await loadInventory();
    setTimeout(() => highlightWarehouseCell(toKey[0], toKey[1], toKey[2] || toKey[3]), 120);
  } catch (e) {
    toast(e.message, 'error');
  }
}

function batchAddCustomerItemsToShip(customerName, scope='modal'){
  const listId = scope === 'modal' ? 'customer-modal-items' : 'customer-inline-items';
  const checked = Array.from(document.querySelectorAll(`#${listId} input[type="checkbox"]:checked`));
  if (!checked.length) return toast('請先勾選商品', 'warn');
  const items = checked.map(input => {
    return {
      product_text: input.dataset.productText || '',
      product_code: input.dataset.productText || '',
      qty: Number(input.dataset.qty || 1) || 1
    };
  }).filter(it => it.product_text);
  if (!items.length) return toast('沒有可加入出貨的商品', 'warn');
  localStorage.setItem('shipQuickItems', JSON.stringify(items));
  localStorage.setItem('moduleQuickJump', JSON.stringify({
    target:'ship',
    customerName: customerName || '',
    productText:'',
    at: Date.now()
  }));
  window.location.href = '/ship';
}

function applyModuleQuickJump(){
  try {
    const raw = localStorage.getItem('moduleQuickJump');
    if (!raw) return;
    const jump = JSON.parse(raw);
    if (!jump || jump.target !== state.module) return;
    localStorage.removeItem('moduleQuickJump');
    if (jump.customerName && $('customer-name')) $('customer-name').value = jump.customerName;

    const shipRaw = localStorage.getItem('shipQuickItems');
    if (state.module === 'ship' && shipRaw) {
      localStorage.removeItem('shipQuickItems');
      const items = JSON.parse(shipRaw || '[]');
      if (Array.isArray(items) && items.length) {
        state.lastOcrItems = normalizeShipTextareaItems(items);
        syncShipItemsToTextarea(state.lastOcrItems);
      }
    } else if (jump.productText) {
      if ($('ocr-text')) $('ocr-text').value = jump.productText;
      state.lastOcrItems = normalizeShipTextareaItems([{ product_text: jump.productText, product_code: jump.productText, qty: 1 }]);
      applyFormattedTextarea(true);
      if (state.module === 'ship') {
        syncShipItemsToTextarea(state.lastOcrItems);
      }
    }
    if ((state.module === 'orders' || state.module === 'master_order') && jump.customerName) {
      setTimeout(() => selectCustomerForModule(jump.customerName), 220);
    }
    if (state.module === 'warehouse' && jump.productText) {
      setTimeout(() => {
        if ($('warehouse-search')) $('warehouse-search').value = jump.productText;
        searchWarehouse();
      }, 220);
    }
  } catch (_e) {}
}

async function openCustomerModal(name){
  try {
    state.currentCustomer = name;
    const [detail, items, recent] = await Promise.all([
      requestJSON(`/api/customers/${encodeURIComponent(name)}`, { method:'GET' }),
      requestJSON(`/api/customer-items?name=${encodeURIComponent(name)}`, { method:'GET' }),
      loadCustomerRecentActivity(name)
    ]);
    $('customer-modal').classList.remove('hidden');
    const body = $('customer-modal-body');
    const stats = buildCommonCustomerStats(items.items || []);
    body.innerHTML = `
      <div class="card-list">
        <div class="card">
          <div class="title">${escapeHTML(name)}</div>
          <div class="sub">電話：${escapeHTML(detail.item?.phone || '')}</div>
          <div class="sub">地址：${escapeHTML(detail.item?.address || '')}</div>
          <div class="sub">特殊要求：${escapeHTML(detail.item?.notes || '')}</div>
          <div class="sub">區域：${escapeHTML(detail.item?.region || '')}</div>
          <div class="sub"><strong>常用材質：</strong>${stats.topMaterials.length ? escapeHTML(stats.topMaterials.join('、')) : '尚未建立'}</div>
          <div class="sub"><strong>常用尺寸：</strong>${stats.topSizes.length ? escapeHTML(stats.topSizes.join('、')) : '尚未建立'}</div>
        </div>
        <div class="card">
          <div class="title">商品</div>
          <div class="recent-activity-card">
            <div class="common-meta-title">最近異動</div>
            <div class="recent-activity-list">${renderCustomerRecentActivity(recent)}</div>
          </div>
          <div class="customer-batch-toolbar">
            <label class="customer-item-batch-check"><input type="checkbox" id="customer-select-all-modal"> 全選</label>
            <input id="customer-item-search-modal" class="text-input small-inline grow-input" placeholder="搜尋此客戶商品">
            <select id="customer-sort-modal" class="text-input small-inline">
              <option value="size">尺寸排序</option>
              <option value="material">材質排序</option>
              <option value="updated">更新時間排序</option>
            </select>
            <select id="customer-batch-material-modal" class="text-input small-inline">
              <option value="">批量套用材質</option>
              <option value="SPF">SPF</option><option value="HF">HF</option><option value="DF">DF</option>
              <option value="ROT">ROT</option><option value="SPY">SPY</option><option value="SP">SP</option>
              <option value="RP">RP</option><option value="TD">TD</option><option value="MLH">MLH</option>
            </select>
            <button class="ghost-btn tiny-btn ship-add-btn" id="customer-batch-add-ship-modal">批量加入出貨</button>
            <button class="ghost-btn tiny-btn" id="customer-batch-apply-modal">套用材質</button>
            <button class="ghost-btn tiny-btn danger-btn" id="customer-batch-delete-modal">批量刪除</button>
          </div>
          <div class="table-card customer-table-wrap"><table><thead><tr><th></th><th>尺寸</th><th>支數 x 件數</th><th>材質</th><th>來源</th><th>操作</th></tr></thead><tbody id="customer-modal-items"></tbody></table></div>
        </div>
      </div>`;
    const list = $('customer-modal-items');
    if (list) list.innerHTML = buildCustomerItemRows(name, items.items || []);
    bindCustomerPanelEnhancements(name, items.items || [], 'modal');
    $('customer-batch-add-ship-modal') && ($('customer-batch-add-ship-modal').onclick = () => batchAddCustomerItemsToShip(name, 'modal'));
    $('customer-batch-apply-modal') && ($('customer-batch-apply-modal').onclick = () => batchApplyCustomerMaterial(name, 'modal'));
    $('customer-batch-delete-modal') && ($('customer-batch-delete-modal').onclick = () => batchDeleteCustomerItems(name, 'modal'));
    $('cust-name').value = detail.item?.name || name;
    $('cust-phone').value = detail.item?.phone || '';
    $('cust-address').value = detail.item?.address || '';
    $('cust-notes').value = detail.item?.notes || '';
    $('cust-region').value = detail.item?.region || '北區';
  } catch (e) {
    toast(e.message, 'error');
  }
}

window.batchAddCustomerItemsToShip = batchAddCustomerItemsToShip;
window.openCustomerModal = openCustomerModal;
window.loadShipPreview = loadShipPreview;
window.renderShipSelectedItems = renderShipSelectedItems;
window.searchWarehouse = searchWarehouse;
window.moveWarehouseItem = moveWarehouseItem;
window.highlightWarehouseCell = highlightWarehouseCell;
