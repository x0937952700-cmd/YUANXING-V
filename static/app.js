
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
  __confirmResolver: null,
  todayOnlyUnread: false,
  todayCategoryFilter: 'all',
  nativeOcrMode: 'blue',
  ocrHistory: [],
  pendingSubmitQueue: [],
  lineMap: [],
  nativePreview: null,
  pendingNativeRequestId: '',
  ocrTextareaAutoFormatting: false,
  ocrTextareaLastPastedAt: 0,
  todayUnplacedItems: [],
  syncSource: null,
  lastSyncEventId: '',
  submitInFlight: false,
  submitLastFingerprint: '',
  submitLastAt: 0,
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
  const count = state.pendingSubmitQueue.length;
  if (pill) {
    pill.textContent = count ? `待同步：${count}` : '已同步';
    pill.classList.toggle('warn', !!count);
  }
  renderPendingQueuePanel();
}
function getSelectedOcrMode(){ return ($('ocr-mode-select')?.value || state.nativeOcrMode || 'blue'); }
function setSelectedOcrOptions(mode){
  state.nativeOcrMode = mode || state.nativeOcrMode || 'blue';
  if ($('ocr-mode-select')) $('ocr-mode-select').value = state.nativeOcrMode;
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
  toast('已回填辨識結果', 'ok');
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

function renderOcrDiffPreview(rawText='', cleanedText='', finalText=''){
  const box = $('ocr-diff-preview');
  if (!box) return;
  const raw = String(rawText || '').trim();
  const clean = String(cleanedText || '').trim();
  const finalOut = String(finalText || '').trim();
  if (!raw && !clean && !finalOut) {
    box.classList.add('hidden');
    box.innerHTML = '';
    return;
  }
  box.classList.remove('hidden');
  box.innerHTML = `
    <div class="section-head"><h3>OCR 自動整理差異</h3><span class="muted">左邊原文、右邊整理後格式</span></div>
    <div class="today-columns" style="grid-template-columns:1fr 1fr; gap:10px;">
      <div class="glass panel"><div class="section-title">原始文字</div><pre class="small-note" style="white-space:pre-wrap;">${escapeHTML(raw || '（空白）')}</pre></div>
      <div class="glass panel"><div class="section-title">整理後</div><pre class="small-note" style="white-space:pre-wrap;">${escapeHTML(finalOut || clean || '（空白）')}</pre></div>
    </div>`;
}

function applyLocalNativeOcrPreview(payload={}){
  const fallbackText = payload.text || payload.rawText || payload.raw_text || '';
  if ($('ocr-text')) $('ocr-text').value = fallbackText;
  if ($('ocr-confidence-pill')) $('ocr-confidence-pill').textContent = `信心值：${payload.confidence || 0}%`;
  if ($('ocr-warning-pill')) $('ocr-warning-pill').textContent = '辨識完成，正在整理格式…';
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
    warningPill.textContent = source === 'camera' ? '拍照辨識中…' : '上傳檔案辨識中…';
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
      roi: payload.roi || null,
    })
  });
  if ($('ocr-text')) $('ocr-text').value = data.text || payload.text || '';
  state.lastOcrOriginalText = data.raw_text || data.text || payload.text || '';
  state.lastOcrItems = (data.items && data.items.length) ? data.items : parseTextareaItems();
  state.lineMap = data.line_map || payload.line_map || payload.blocks || [];
  if ($('customer-name') && data.customer_guess) $('customer-name').value = data.customer_guess;
  if ($('ocr-confidence-pill')) $('ocr-confidence-pill').textContent = `信心值：${data.confidence || payload.confidence || 0}%`;
  const warningPill = $('ocr-warning-pill');
  const statusText = data.warning || '辨識完成，可直接修改後送出';
  if (warningPill) warningPill.textContent = `${statusText}｜原生 ${data.ocr_confidence || payload.confidence || 0}%｜解析 ${data.parse_confidence || 0}%`; renderPendingQueuePanel();
  setPillState(warningPill, data.warning ? 'warn' : 'ok');
  renderNativePreview();
  saveOcrHistoryEntry({
    text: data.text || payload.text || '',
    customer_name: data.customer_guess || payload.customer_name || '',
    items: state.lastOcrItems,
    line_map: state.lineMap,
    preview: state.nativePreview,
    created_at: new Date().toISOString(),
  });
  toast(data.warning || '辨識完成', data.warning ? 'warn' : 'ok');
  scrollToOcrFields();
  if (state.module === 'ship') await loadShipPreview();
}

async function handleNativeOcrResult(payload={}){
  try {
    if (payload.error) throw new Error(payload.error);
    setSelectedOcrOptions(payload.ocrMode || payload.ocr_mode || getSelectedOcrMode());
    applyLocalNativeOcrPreview(payload);
    await parseNativeOcrText(payload);
  } catch (e) {
    const msg = e.message || '原生辨識失敗';
    if ($('ocr-warning-pill')) $('ocr-warning-pill').textContent = `${msg}；已保留原始辨識文字，可直接修改或稍後補送`;
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
  connectRealtimeSync();
  if ($('remember-label')) {
    state.rememberLogin = localStorage.getItem('rememberLogin') !== '0';
    $('remember-label').textContent = state.rememberLogin ? '開' : '關';
  }
  if ($('login-username')) {
    initLoginPage();
  }
  if ($('old-password')) {
    if ($('backup-panel')) loadBackups();
    loadCorrectionsList();
    loadCustomerAliasesList();
    loadAuditTrails();
  }
  if ($('today-changes-btn') || $('today-summary-cards')) {
    loadTodayChanges();
  }
  if (state.module) {
    setSelectedOcrOptions(getSelectedOcrMode());
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
    renderWarehouseUnplacedInline();
    setWarehouseZone(state.warehouse.activeZone || 'A', false);
    try {
      const rawQuick = localStorage.getItem('warehouseQuickPlaceProduct');
      if (rawQuick) {
        localStorage.removeItem('warehouseQuickPlaceProduct');
        const item = JSON.parse(rawQuick);
        const idx = (state.warehouse.availableItems || []).findIndex(it => it.product_text === item.product_text);
        if (idx >= 0) setTimeout(() => quickPlaceUnplaced(idx), 180);
      }
    } catch (e) {}
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
      col.innerHTML = `<div class="column-head-row"><div class="column-head">${zone} 第 ${c} 欄</div><div class="small-note">目前 ${visibleSlots} 格</div></div><div class="btn-row compact warehouse-col-tools"><button class="ghost-btn small-btn warehouse-plusminus-btn" title="增加格子" aria-label="增加格子" onclick="addWarehouseVisualSlot('${zone}', ${c})">＋</button><button class="ghost-btn small-btn warehouse-plusminus-btn" title="減少格子" aria-label="減少格子" onclick="removeWarehouseVisualSlot('${zone}', ${c})">－</button></div>`;
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
        const summary = items.length ? items.slice(0,2).map(it => `<div class="slot-line customer">客戶：${escapeHTML(it.customer_name || '未指定客戶')}</div><div class="slot-line product">商品：${escapeHTML(it.product_text || '')}</div><div class="slot-line qty">數量：${it.qty || 0}</div>`).join('<hr class="slot-sep">') : '<div class="slot-line empty">空格</div>';
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
            let qty = parseInt(parsed.qty || 1, 10) || 1;
            if (qty > 1) {
              const input = window.prompt(`要移動幾件？（可拆量移動，最多 ${qty} 件）`, String(qty));
              if (input === null) return;
              qty = Math.max(1, Math.min(qty, parseInt(input || '1', 10) || 1));
            }
            await moveWarehouseItem(parsed.fromKey, buildCellKey(zone, c, n), parsed.product_text, qty);
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

async function openWarehouseModal(zone, column, num){
  state.currentCell = { zone, column, slot_type: 'direct', slot_number: num };
  state.currentCellItems = getCellItems(zone, column, num);
  $('warehouse-modal').classList.remove('hidden');
  $('warehouse-modal-meta').textContent = `${zone} 區 / 第 ${column} 欄 / 第 ${String(num).padStart(2, '0')} 格`;
  $('warehouse-note').value = (state.warehouse.cells.find(c => c.zone===zone && parseInt(c.column_index)===parseInt(column) && parseInt(c.slot_number)===parseInt(num)) || {}).note || '';
  renderWarehouseCellItems();
  refreshWarehouseSelect();
  loadRecentSlots();
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
      <button class="remove" data-idx="${idx}">刪除</button>`;
    chip.addEventListener('dragstart', ev => {
      ev.dataTransfer.setData('text/plain', JSON.stringify({
        kind: 'warehouse-item',
        fromKey: buildCellKey(state.currentCell.zone, state.currentCell.column, state.currentCell.slot_number),
        product_text: it.product_text || '',
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
    toast('已拖曳移動', 'ok');
    await renderWarehouse();
    await loadInventory();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function searchWarehouse(){
  const q = ($('warehouse-search')?.value || '').trim();
  const jump = q.match(/^([ABab])\s*[- ]\s*(\d{1,2})\s*[- ]\s*(\d{1,2})$/);
  if (jump) {
    const zone = String(jump[1] || '').toUpperCase();
    const column = parseInt(jump[2] || '0', 10) || 0;
    const num = parseInt(jump[3] || '0', 10) || 0;
    setWarehouseZone(zone);
    setTimeout(() => { highlightWarehouseCell(zone, column, num); openWarehouseModal(zone, column, num); }, 120);
    return;
  }
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
  box.classList.remove('hidden');
  box.innerHTML = `<div class="section-title">${zone} 區第 ${column} 欄 第 ${String(num).padStart(2,'0')} 格</div>` + (items.length ? items.map(it => `<div class="chip-item"><div><strong>${escapeHTML(it.customer_name || '未指定客戶')}</strong></div><div>${escapeHTML(it.product_text || '')}</div><div>數量：${it.qty || 0}</div></div>`).join('') : '<div class="small-note">此格目前沒有商品</div>');
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

async function loadCustomerSpecs(name, targetId='customer-specs-box'){
  const box = $(targetId);
  if (!box) return;
  try {
    const data = await requestJSON(`/api/customer-specs?name=${encodeURIComponent(name)}`, { method:'GET' });
    box.innerHTML = (data.items || []).slice(0, 12).map(it => `<div class="chip-item">${escapeHTML(it.product_text || '')}｜總量 ${it.qty_total || 0}</div>`).join('') || '<div class="small-note">尚無規格學習資料</div>';
  } catch (e) {
    box.innerHTML = '<div class="small-note">尚無規格學習資料</div>';
  }
}

function escapeHTML(str){
  return String(str ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}


function renderPendingQueuePanel(){
  const panel = $('pending-queue-panel');
  if (!panel) return;
  const items = state.pendingSubmitQueue || [];
  if (!items.length) {
    panel.classList.add('hidden');
    panel.innerHTML = '';
    return;
  }
  panel.classList.remove('hidden');
  panel.innerHTML = `<div class="section-head"><div><strong>待同步佇列</strong><div class="small-note">網路恢復後會自動補送，也可手動重送或刪除。</div></div><button class="ghost-btn small-btn" onclick="syncPendingSubmits()">全部補送</button></div>` + items.map((entry, idx) => `<div class="chip-item log-chip"><div class="log-main"><strong>${escapeHTML(entry.module || '')}</strong>｜${escapeHTML(entry.payload?.customer_name || '未指定客戶')}｜${(entry.payload?.items || []).length} 筆｜${escapeHTML(entry.queued_at || '')}</div><div class="btn-row compact"><button class="ghost-btn tiny-btn" onclick="retryPendingSubmit(${idx})">重送</button><button class="ghost-btn tiny-btn" onclick="removePendingSubmit(${idx})">刪除</button></div></div>`).join('');
}

async function retryPendingSubmit(index){
  const entry = state.pendingSubmitQueue[index];
  if (!entry) return;
  try {
    await requestJSON(entry.endpoint, { method:'POST', body: JSON.stringify(entry.payload) });
    state.pendingSubmitQueue.splice(index, 1);
    persistPendingQueue();
    toast('已補送完成', 'ok');
  } catch (e) {
    toast(e.message || '補送失敗', 'error');
  }
}
function removePendingSubmit(index){
  state.pendingSubmitQueue.splice(index, 1);
  persistPendingQueue();
}

function connectRealtimeSync(){
  if (state.syncSource || !window.EventSource) return;
  try {
    const es = new EventSource('/api/sync/stream');
    state.syncSource = es;
    es.onmessage = (event) => {
      if (!event?.data) return;
      let payload = null;
      try { payload = JSON.parse(event.data); } catch (e) { return; }
      if (!payload || !payload.id || payload.id === state.lastSyncEventId) return;
      state.lastSyncEventId = payload.id;
      const mod = payload.module || 'all';
      if ($('ocr-warning-pill') && ['inventory','orders','master_order','ship','warehouse','customers','today_changes','all'].includes(mod)) {
        $('ocr-warning-pill').textContent = payload.message || '資料已同步更新';
        setPillState($('ocr-warning-pill'), 'ok');
      }
      handleRealtimeRefresh(mod, payload);
    };
    es.onerror = () => {};
  } catch (e) {}
}

async function handleRealtimeRefresh(mod, payload=null){
  try {
    if ($('today-summary-cards') && ['today_changes','all','badge'].includes(mod)) return await loadTodayChanges();
    if ($('admin-users') && ['settings','all'].includes(mod)) { await loadAuditTrails(); await loadBackups(); }
    if (state.module === 'inventory' && ['inventory','all'].includes(mod)) return await loadInventory();
    if (state.module === 'orders' && ['orders','customers','all'].includes(mod)) { await loadOrdersList(); return await loadCustomerBlocks(); }
    if (state.module === 'master_order' && ['master_order','customers','all'].includes(mod)) { await loadMasterList(); return await loadCustomerBlocks(); }
    if (state.module === 'ship' && ['ship','orders','master_order','inventory','all'].includes(mod)) return await loadShipPreview();
    if (state.module === 'warehouse' && ['warehouse','inventory','all'].includes(mod)) return await renderWarehouse();
    if (state.module === 'customers' && ['customers','all'].includes(mod)) return await renderCustomers();
  } catch (e) {}
}

async function loadCorrectionsList(){
  const box = $('corrections-list');
  if (!box) return;
  try {
    const data = await requestJSON('/api/corrections', { method:'GET' });
    box.innerHTML = (data.items || []).map(item => `<div class="chip-item log-chip"><div class="log-main"><strong>${escapeHTML(item.wrong_text || '')}</strong> → ${escapeHTML(item.correct_text || '')}</div><button class="ghost-btn tiny-btn" onclick="deleteCorrectionItem('${encodeURIComponent(item.wrong_text || '')}')">刪除</button></div>`).join('') || '<div class="small-note">尚無修正詞</div>';
  } catch (e) { box.innerHTML = `<div class="alert">${escapeHTML(e.message || '載入失敗')}</div>`; }
}
async function saveCorrectionItem(){
  try {
    await requestJSON('/api/corrections', { method:'POST', body: JSON.stringify({ wrong_text: ($('correction-wrong')?.value || '').trim(), correct_text: ($('correction-correct')?.value || '').trim() }) });
    if ($('correction-wrong')) $('correction-wrong').value = '';
    if ($('correction-correct')) $('correction-correct').value = '';
    toast('修正詞已儲存', 'ok');
    loadCorrectionsList();
  } catch (e) { toast(e.message, 'error'); }
}
async function deleteCorrectionItem(encoded){
  try {
    await requestJSON('/api/corrections', { method:'DELETE', body: JSON.stringify({ wrong_text: decodeURIComponent(encoded) }) });
    loadCorrectionsList();
  } catch (e) { toast(e.message, 'error'); }
}

async function loadCustomerAliasesList(){
  const box = $('aliases-list');
  if (!box) return;
  try {
    const data = await requestJSON('/api/customer-aliases', { method:'GET' });
    box.innerHTML = (data.items || []).map(item => `<div class="chip-item log-chip"><div class="log-main"><strong>${escapeHTML(item.alias || '')}</strong> → ${escapeHTML(item.target_name || '')}</div><button class="ghost-btn tiny-btn" onclick="deleteCustomerAliasItem('${encodeURIComponent(item.alias || '')}')">刪除</button></div>`).join('') || '<div class="small-note">尚無客戶別名</div>';
  } catch (e) { box.innerHTML = `<div class="alert">${escapeHTML(e.message || '載入失敗')}</div>`; }
}
async function saveCustomerAliasItem(){
  try {
    await requestJSON('/api/customer-aliases', { method:'POST', body: JSON.stringify({ alias: ($('alias-name')?.value || '').trim(), target_name: ($('alias-target')?.value || '').trim() }) });
    if ($('alias-name')) $('alias-name').value = '';
    if ($('alias-target')) $('alias-target').value = '';
    toast('客戶別名已儲存', 'ok');
    loadCustomerAliasesList();
  } catch (e) { toast(e.message, 'error'); }
}
async function deleteCustomerAliasItem(encoded){
  try {
    await requestJSON('/api/customer-aliases', { method:'DELETE', body: JSON.stringify({ alias: decodeURIComponent(encoded) }) });
    loadCustomerAliasesList();
  } catch (e) { toast(e.message, 'error'); }
}

async function loadAuditTrails(){
  const box = $('audit-trails-list');
  if (!box) return;
  try {
    const params = new URLSearchParams({ limit:'80' });
    if (($('audit-q')?.value || '').trim()) params.set('q', ($('audit-q').value || '').trim());
    if (($('audit-user')?.value || '').trim()) params.set('username', ($('audit-user').value || '').trim());
    if (($('audit-entity')?.value || '').trim()) params.set('entity_type', ($('audit-entity').value || '').trim());
    if (($('audit-start')?.value || '').trim()) params.set('start_date', ($('audit-start').value || '').trim());
    if (($('audit-end')?.value || '').trim()) params.set('end_date', ($('audit-end').value || '').trim());
    const data = await requestJSON(`/api/audit-trails?${params.toString()}`, { method:'GET' });
    box.innerHTML = (data.items || []).map(item => `<div class="chip-item log-chip"><div class="log-main"><strong>${escapeHTML(item.created_at || '')}</strong>｜${escapeHTML(item.username || '')}｜${escapeHTML(item.entity_type || '')}｜${escapeHTML(item.action_type || '')}｜${escapeHTML(item.entity_key || '')}</div><div class="small-note">前：${escapeHTML(JSON.stringify(item.before_json || {}))}<br>後：${escapeHTML(JSON.stringify(item.after_json || {}))}</div></div>`).join('') || '<div class="small-note">尚無差異紀錄</div>';
  } catch (e) { box.innerHTML = `<div class="alert">${escapeHTML(e.message || '載入失敗')}</div>`; }
}

function downloadReport(type){
  const params = new URLSearchParams({ type });
  const start = ($('report-start')?.value || '').trim();
  const end = ($('report-end')?.value || '').trim();
  if (start) params.set('start_date', start);
  if (end) params.set('end_date', end);
  window.location.href = `/api/reports/export?${params.toString()}`;
}

async function loadRecentSlots(){
  const box = $('warehouse-recent-slots');
  if (!box) return;
  try {
    const customer = (state.currentCellItems.find(it => it.customer_name)?.customer_name || '').trim();
    const data = await requestJSON(`/api/recent-slots?customer_name=${encodeURIComponent(customer)}`, { method:'GET' });
    box.innerHTML = `<div class="small-note">最近使用格位</div>` + ((data.items || []).map(item => `<button class="chip-item" onclick="applyRecentSlotToModal('${item.zone}', ${item.column_index}, ${item.slot_number})">${escapeHTML(item.zone)}-${item.column_index}-${String(item.slot_number).padStart(2,'0')}</button>`).join('') || '<span class="small-note">尚無紀錄</span>');
  } catch (e) { box.innerHTML = ''; }
}
function applyRecentSlotToModal(zone, column, slot){
  closeWarehouseModal();
  setWarehouseZone(zone);
  setTimeout(() => openWarehouseModal(zone, column, slot), 120);
}

function openUnplacedFromToday(index){
  const item = (state.todayUnplacedItems || [])[index];
  if (!item) return;
  localStorage.setItem('warehouseQuickPlaceProduct', JSON.stringify(item));
  window.location.href = '/warehouse';
}

function renderWarehouseUnplacedInline(){
  const box = $('warehouse-unplaced-list-inline');
  if (!box) return;
  const items = (state.warehouse.availableItems || []).slice(0, 12);
  if (!items.length) {
    box.classList.add('hidden');
    box.innerHTML = '';
    return;
  }
  box.classList.remove('hidden');
  box.innerHTML = items.map((item, idx) => `<div class="search-card" onclick="quickPlaceUnplaced(${idx})"><strong>${escapeHTML(item.product_text || '')}</strong><br>${escapeHTML(item.customer_name || '未指定客戶')}｜未錄入 ${item.unplaced_qty || 0}</div>`).join('');
}
function quickPlaceUnplaced(index){
  const item = (state.warehouse.availableItems || [])[index];
  if (!item) return;
  state.warehouse.quickPickItem = item;
  const zone = state.warehouse.activeZone === 'B' ? 'B' : 'A';
  openWarehouseModal(zone, 1, 1);
  setTimeout(() => {
    const sel = $('warehouse-item-select');
    if (!sel) return;
    for (const opt of Array.from(sel.options)) {
      try {
        const data = JSON.parse(opt.value || '{}');
        if (data.product_text === item.product_text) { sel.value = opt.value; break; }
      } catch (e) {}
    }
  }, 80);
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
window.loadAdminUsers = loadAdminUsers;
window.loadBackups = loadBackups;
window.createBackup = createBackup;
window.setTodayCategoryFilter = setTodayCategoryFilter;
window.addWarehouseVisualSlot = addWarehouseVisualSlot;
window.removeWarehouseVisualSlot = removeWarehouseVisualSlot;
window.toggleUserBlocked = toggleUserBlocked;