/* V35 final lock: restore submit and protect backend/display flow. */
(function(){
  'use strict';
  if (window.__YX_V35_SUBMIT_BACKEND_FIX__) return;
  window.__YX_V35_SUBMIT_BACKEND_FIX__ = true;

  const $ = id => document.getElementById(id);
  const clean = v => String(v ?? '').trim();
  const esc = v => String(v ?? '').replace(/[&<>"]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[s]));
  const page = () => document.querySelector('.module-screen[data-module]')?.dataset.module || document.body?.dataset?.module || '';
  const apiPath = m => m === 'inventory' ? '/api/inventory' : m === 'orders' ? '/api/orders' : '/api/master_orders';
  let submitting = false;

  function toast(msg, type){
    try {
      const fn = window.YXHardLock?.toast || window.toast || window.showToast || window.notify;
      if (typeof fn === 'function') return fn(msg, type);
    } catch(_e) {}
    try { console.log('[YX]', msg); } catch(_e) {}
  }

  async function api(url, opt={}){
    const r = await fetch(url, {
      credentials:'same-origin', cache:'no-store', ...opt,
      headers:{'Accept':'application/json','Content-Type':'application/json','Cache-Control':'no-cache','X-YX-V35':'true',...(opt.headers||{})}
    });
    const text = await r.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch(_e) { data = {success:false, error:text || '後端沒有回傳 JSON'}; }
    if (!r.ok || data.success === false) throw new Error(data.error || data.message || '送出失敗');
    return data;
  }

  function normalizeProductText(value){
    let raw = clean(value).replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/[＋，,；;]/g,'+');
    const mm = raw.match(/(?:^|[\s,，\/])([1-9]|1[0-2])\s*(?:月|月份)(?=\s|\d|x|X|$)/);
    if (mm) {
      const month = `${Number(mm[1])}月`;
      raw = raw.slice(0, mm.index) + ' ' + raw.slice(mm.index + mm[0].length);
      raw = raw.replace(/\s+/g,'');
      if (!raw.startsWith(month)) raw = month + raw;
      return raw;
    }
    return raw.replace(/\s+/g,'');
  }
  function splitMaterial(line){
    line = clean(line);
    const m = line.match(/^([A-Za-z\u4e00-\u9fff]{1,8})\s+(.+?=.+)$/);
    if (m && !/^\d/.test(m[1])) return {material:m[1].toUpperCase(), product_text:normalizeProductText(m[2])};
    return {material:'', product_text:normalizeProductText(line)};
  }
  function qtyFromProduct(text){
    try { if (typeof window.YX30EffectiveQty === 'function') return Number(window.YX30EffectiveQty(text, 1)) || 1; } catch(_e) {}
    const s = clean(text).split('=')[1] || clean(text);
    const noParen = s.replace(/\([^)]*\)/g,'');
    const m = noParen.match(/(?:^|\+)\s*\d+\s*x\s*(\d+)/i);
    if (m) return Number(m[1]) || 1;
    const parts = noParen.split('+').map(x=>x.trim()).filter(Boolean);
    return Math.max(1, parts.length || 1);
  }
  function parseItems(text){
    return clean(text).split(/\n+/).map(splitMaterial).filter(x=>x.product_text).map(x => ({
      product_text:x.product_text, material:x.material, product_code:x.material, qty:qtyFromProduct(x.product_text)
    })).filter(x => x.qty > 0);
  }
  function activeZoneForSource(m){
    try {
      const btn = document.querySelector(`[data-yx132-zone-filter].is-active[data-source="${m}"]`);
      const z = (btn?.dataset?.yx132ZoneFilter || '').toUpperCase();
      return (z === 'A' || z === 'B') ? z : '';
    } catch(_e) { return ''; }
  }
  function sizeKey(text){
    const s = normalizeProductText(text).replace(/^([1-9]|1[0-2])月/, '');
    const left = s.split('=')[0] || s;
    const m = left.match(/(\d+)x(\d+)x(\d+)/i);
    return m ? `${Number(m[1])}x${Number(m[2])}x${Number(m[3])}` : left.toLowerCase();
  }
  function materialKey(v){ return clean(v || '未填材質').toUpperCase(); }
  function duplicateMode(m, customer, items){
    const act = window.YX113ProductActions || window.YX132ProductActions || window.YX128ProductActions;
    let rows = [];
    try { rows = act?.rowsStore?.(m) || []; } catch(_e) {}
    const map = new Map();
    function add(key, label){ if (!map.has(key)) map.set(key, []); map.get(key).push(label); }
    items.forEach((it, i) => add(`${sizeKey(it.product_text)}|${materialKey(it.material)}`, `新增第${i+1}筆 ${it.material || '未填材質'} ${it.product_text}`));
    (Array.isArray(rows) ? rows : []).forEach(r => {
      if ((m === 'orders' || m === 'master_order') && clean(customer) && clean(r.customer_name || r.customer || '') !== clean(customer)) return;
      const key = `${sizeKey(r.product_text)}|${materialKey(r.material || r.product_code)}`;
      if (map.has(key)) add(key, `既有 ${r.material || r.product_code || '未填材質'} ${r.product_text}`);
    });
    const dups = Array.from(map.values()).filter(a => a.length > 1).slice(0, 6);
    if (!dups.length) return 'merge';
    const msg = `偵測到相同尺寸＋材質的商品，是否要合併？\n\n${dups.map(a=>'・'+a.slice(0,4).join(' / ')).join('\n')}\n\n確定＝合併數量；取消＝分開新增保存。`;
    return window.confirm(msg) ? 'merge' : 'separate';
  }
  function submittedRows(customer, items, location){
    const now = Date.now();
    return items.map((it, idx) => ({id:`tmp-v34-${now}-${idx}`, product_text:it.product_text, product_code:it.material||'', material:it.material||'', qty:it.qty, customer_name:customer||'', location:location||'', zone:location||'', warehouse_zone:location||'', __optimistic:true}));
  }
  function mergeRows(base, addRows){
    const out = (Array.isArray(base) ? base : []).slice();
    addRows.forEach(r => out.unshift(r));
    return out;
  }
  function applyServerRows(m, customer, posted, items, activeZone){
    const act = window.YX113ProductActions || window.YX132ProductActions || window.YX128ProductActions;
    let rows = [];
    const snaps = posted?.snapshots || {};
    if (Array.isArray(snaps[m])) rows = snaps[m];
    else if (m === 'master_order' && Array.isArray(snaps.master_orders)) rows = snaps.master_orders;
    else if (Array.isArray(posted?.items)) rows = posted.items;
    else if (Array.isArray(posted?.exact_customer_items) && posted.exact_customer_items.length && act?.rowsStore) {
      const before = Array.isArray(act.rowsStore(m)) ? act.rowsStore(m) : [];
      rows = before.filter(r => clean(r.customer_name || r.customer || '') !== clean(customer)).concat(posted.exact_customer_items);
    }
    try {
      if (act?.rowsStore) {
        if (Array.isArray(rows) && rows.length) act.rowsStore(m, rows);
        else act.rowsStore(m, mergeRows((act.rowsStore(m)||[]).filter(r => !r.__optimistic && !String(r.id||'').startsWith('tmp-')), submittedRows(customer, items, activeZone)));
        act.renderSummary?.(m); act.renderCards?.(m);
        // V35: do not force full reload after submit; it interrupts current editing/selection.
        // Current rows are updated optimistically plus server rows when returned.
      }
    } catch(e) { console.warn('[YX v34 render]', e); }
    try { if (customer) window.__YX_SELECTED_CUSTOMER__ = customer; } catch(_e) {}
    try { if (customer && $('customer-name')) $('customer-name').value = customer; } catch(_e) {}
    if (m === 'orders' || m === 'master_order') {
      try { if (Array.isArray(posted?.customers) && window.YX113CustomerRegions?.renderBoards) window.YX113CustomerRegions.renderBoards(posted.customers); } catch(_e) {}
      try { window.YX113CustomerRegions?.renderFromCurrentRows?.(); } catch(_e) {}
      try { if (customer && window.YX113CustomerRegions?.selectCustomer) window.YX113CustomerRegions.selectCustomer(customer).catch(()=>{}); } catch(_e) {}
    }
  }

  async function submitNow(ev){
    if (ev) { ev.preventDefault?.(); ev.stopPropagation?.(); ev.stopImmediatePropagation?.(); }
    const m = page();
    if (!['inventory','orders','master_order'].includes(m)) return;
    if (submitting) return;
    const btn = $('submit-btn');
    const ta = $('ocr-text');
    const result = $('module-result');
    const text = clean(ta?.value || '');
    const customer = clean($('customer-name')?.value || window.__YX_SELECTED_CUSTOMER__ || '');
    if (!text) { toast('請輸入商品資料','warn'); return; }
    if (m !== 'inventory' && !customer) { toast('請輸入客戶名稱','warn'); return; }
    const items = parseItems(text);
    if (!items.length) { toast('商品格式無法辨識，請確認有尺寸與支數','warn'); return; }
    const mode = duplicateMode(m, customer, items);
    const activeZone = activeZoneForSource(m);
    submitting = true;
    try {
      if (btn) { btn.disabled = true; btn.textContent = '送出中…'; }
      toast(`送出中：${items.length} 筆商品`, 'ok');
      try {
        const act = window.YX113ProductActions || window.YX132ProductActions || window.YX128ProductActions;
        if (act?.rowsStore) { act.rowsStore(m, mergeRows(act.rowsStore(m)||[], submittedRows(customer, items, activeZone))); act.renderSummary?.(m); act.renderCards?.(m); }
      } catch(_e) {}
      const posted = await api(apiPath(m), {method:'POST', body:JSON.stringify({customer_name:customer, ocr_text:text, items, duplicate_mode:mode, location:activeZone, zone:activeZone, region:(m==='orders'||m==='master_order')?'北區':'', request_key:`v35-submit-${m}-${Date.now()}-${Math.random().toString(36).slice(2)}`})});
      if (ta) ta.value = '';
      applyServerRows(m, customer, posted, items, activeZone);
      if (result) { result.classList.remove('hidden'); result.style.display=''; result.innerHTML = `<strong>新增成功，已寫入資料庫</strong><div class="small-note">${items.map(i=>esc(i.product_text)).join('、')}</div>`; }
      toast(`已新增 ${items.length} 筆商品`, 'ok');
    } catch(e) {
      try {
        const act = window.YX113ProductActions || window.YX132ProductActions || window.YX128ProductActions;
        if (act?.rowsStore) { act.rowsStore(m, (act.rowsStore(m)||[]).filter(r => !r.__optimistic && !String(r.id||'').startsWith('tmp-'))); act.renderSummary?.(m); act.renderCards?.(m); }
      } catch(_e) {}
      if (result) { result.classList.remove('hidden'); result.style.display=''; result.innerHTML = `<strong style="color:#b91c1c">送出失敗 / 未寫入清單</strong><div class="small-note">${esc(e.message || '未知錯誤')}</div>`; }
      toast(e.message || '送出失敗', 'error');
    } finally {
      submitting = false;
      if (btn) { btn.disabled = false; btn.textContent = '確認送出'; }
    }
  }

  window.confirmSubmit = submitNow;
  window.YXConfirmSubmit = submitNow;
  function bind(){
    const btn = $('submit-btn');
    if (btn) { btn.type = 'button'; btn.onclick = submitNow; btn.disabled = false; btn.style.pointerEvents = 'auto'; }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, {once:true}); else bind();
  document.addEventListener('click', function(ev){
    const btn = ev.target?.closest?.('#submit-btn');
    if (!btn) return;
    if (!['inventory','orders','master_order'].includes(page())) return;
    submitNow(ev);
  }, true);
})();
