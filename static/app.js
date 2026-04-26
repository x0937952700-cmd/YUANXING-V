/* ==== FIX110: early legacy throttle + navigation speed hard lock start ==== */
(function(){
  'use strict';
  if(window.__YX110_EARLY_LEGACY_THROTTLE__) return;
  window.__YX110_EARLY_LEGACY_THROTTLE__ = true;
  window.__YX110_BLOCKED = window.__YX110_BLOCKED || {pageshow:0, mutation:0, todayFetch:0};
  try{
    window.__YX103_SPEED_FONT_STABLE__ = true;
    window.__YX105_TODAY_SPEED_FINAL__ = true;
    window.__YX106_FINAL__ = true;
    window.__YX107_MANUAL_TODAY_SPEED_HARD_LOCK__ = true;
  }catch(_e){}

  // 1) 舊版 pageshow 會在返回主頁 / 開功能頁時大量重跑。FIX110 直接擋掉舊註冊，只保留明確標記安全的 listener。
  try{
    if(!window.__YX110_NATIVE_ADD_EVENT__){
      window.__YX110_NATIVE_ADD_EVENT__ = window.addEventListener.bind(window);
      window.addEventListener = function(type, listener, options){
        if(type === 'pageshow' && typeof listener === 'function' && !(listener.__yx110SafePageshow || listener.__yx108SafePageshow)){
          window.__YX110_BLOCKED.pageshow++;
          return;
        }
        return window.__YX110_NATIVE_ADD_EVENT__(type, listener, options);
      };
    }
  }catch(_e){}

  // 2) 舊版全頁 MutationObserver 是畫面卡頓、跳舊 UI 的主因；保留局部 observer，擋 body/html/document + 今日異動 summary。
  try{
    const NativeMO = window.MutationObserver;
    if(NativeMO && !NativeMO.__yx110Wrapped){
      function YX110MutationObserver(callback){
        let queued = false, lastMutations = null, lastObserver = null;
        const safeCallback = function(mutations, observer){
          lastMutations = mutations; lastObserver = observer;
          if(queued) return;
          queued = true;
          const runner = () => { queued = false; try{ callback.call(this, lastMutations || [], lastObserver || observer); }catch(err){ try{ console.warn('YX110 skipped MutationObserver callback', err); }catch(_e){} } };
          (window.requestAnimationFrame || function(fn){ return setTimeout(fn, 80); })(runner);
        };
        const obs = new NativeMO(safeCallback);
        const nativeObserve = obs.observe.bind(obs);
        obs.observe = function(target, options){
          try{
            const fullPage = (target === document || target === document.body || target === document.documentElement);
            const subtree = !!(options && options.subtree);
            const todaySummary = target && target.id === 'today-summary-cards';
            if((fullPage && subtree) || todaySummary){
              window.__YX110_BLOCKED.mutation++;
              return undefined;
            }
          }catch(_e){}
          return nativeObserve(target, options);
        };
        return obs;
      }
      YX110MutationObserver.prototype = NativeMO.prototype;
      YX110MutationObserver.__yx110Wrapped = true;
      window.MutationObserver = YX110MutationObserver;
    }
  }catch(_e){}

  // 3) 舊今日異動 loader 如果偷偷開頁打 API，直接回空殼，避免未入倉自動重算。
  try{
    if(!window.__YX110_NATIVE_FETCH__ && typeof window.fetch === 'function'){
      window.__YX110_NATIVE_FETCH__ = window.fetch.bind(window);
      window.fetch = function(input, init){
        try{
          const raw = (typeof input === 'string') ? input : (input && input.url) || '';
          const url = new URL(raw, location.origin);
          const method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
          const isToday = url.pathname === '/api/today-changes';
          const manual = url.searchParams.get('refresh') === '1' || url.searchParams.get('include_unplaced') === '1' || window.__YX110_ALLOW_TODAY_FETCH__ === true;
          if(location.pathname.indexOf('/today-changes') >= 0 && method === 'GET' && isToday && !manual){
            window.__YX110_BLOCKED.todayFetch++;
            const empty = {success:true, summary:{inbound_count:0,outbound_count:0,new_order_count:0,unplaced_count:0,unplaced_row_count:0,unread_count:0,anomaly_count:0}, feed:{inbound:[],outbound:[],new_orders:[],others:[]}, unplaced_items:[], anomalies:[], anomaly_groups:{unplaced:[]}, read_at:''};
            return Promise.resolve(new Response(JSON.stringify(empty), {status:200, headers:{'Content-Type':'application/json'}}));
          }
        }catch(_e){}
        return window.__YX110_NATIVE_FETCH__(input, init);
      };
    }
  }catch(_e){}

  // 4) 今日異動按鈕用最前面的 capture handler 攔截，避免舊 click handler 先跑。
  try{
    document.addEventListener('click', function(ev){
      const t = ev.target;
      const refresh = t && t.closest && t.closest('#today-manual-refresh-btn');
      if(refresh){
        ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation();
        try{ if(typeof window.__YX110_refreshToday === 'function') window.__YX110_refreshToday(); }
        catch(_e){}
        return false;
      }
      const card = t && t.closest && t.closest('[data-yx110-today-filter],[data-yx108-today-filter],[data-yx107-today-filter],[data-yx106-today-filter],[data-yx105-today-filter],[data-yx104-today-filter],[data-yx103-today-filter],[data-yx102-today-filter]');
      if(card && location.pathname.indexOf('/today-changes') >= 0){
        ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation();
        try{ if(typeof window.__YX110_filterToday === 'function') window.__YX110_filterToday(card.getAttribute('data-yx110-today-filter') || card.getAttribute('data-yx108-today-filter') || card.getAttribute('data-yx107-today-filter') || card.getAttribute('data-yx106-today-filter') || card.getAttribute('data-yx105-today-filter') || card.getAttribute('data-yx104-today-filter') || card.getAttribute('data-yx103-today-filter') || card.getAttribute('data-yx102-today-filter') || 'all'); }
        catch(_e){}
        return false;
      }
    }, true);
  }catch(_e){}
})();
/* ==== FIX110: early legacy throttle + navigation speed hard lock end ==== */

/* ==== app.js merged by FIX49 ==== */
/* ==== FIX65 duplicate boot gate ==== */
window.__YX65_SKIP_DUP_BOOT__ = true;



/* ==== realfix bootstrap start ==== */
window.state = window.state || { warehouse: { cells: [], zones: {A:{}, B:{}}, availableItems: [], activeZone: 'A' }, searchHighlightKeys: new Set() };
window.$ = window.$ || function(id){ return document.getElementById(id); };
window.currentModule = window.currentModule || function(){
  const p = location.pathname;
  if (p.includes('/master-order')) return 'master_order';
  if (p.includes('/orders')) return 'orders';
  if (p.includes('/inventory')) return 'inventory';
  if (p.includes('/ship')) return 'ship';
  if (p.includes('/warehouse')) return 'warehouse';
  if (p.includes('/customers')) return 'customers';
  if (p.includes('/todos')) return 'todos';
  return '';
};
window.escapeHTML = window.escapeHTML || function(str){
  return String(str ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
};



/* ==== FIX106: early performance guard start ==== */
(function(){
  'use strict';
  if(window.__YX106_EARLY_PERF_GUARD__) return;
  window.__YX106_EARLY_PERF_GUARD__ = true;
  // FIX108：舊版今日異動與舊版重畫守門員。
  try{
    window.__YX103_SPEED_FONT_STABLE__ = true;
    window.__YX105_TODAY_SPEED_FINAL__ = true;
    window.__YX106_FINAL__ = true;
    window.__YX107_MANUAL_TODAY_SPEED_HARD_LOCK__ = true;
  }catch(_e){}
  try{
    if(!window.__YX108_EVENT_GUARD__){
      window.__YX108_EVENT_GUARD__ = true;
      const nativeAdd = window.addEventListener.bind(window);
      window.addEventListener = function(type, listener, options){
        if(type === 'pageshow' && typeof listener === 'function' && !listener.__yx108SafePageshow){
          let lastRun = 0;
          const wrapped = function(ev){
            try{
              const path = location.pathname || '/';
              if(path === '/' || path === '/login') return;
              const now = Date.now();
              if(now - lastRun < 650) return;
              lastRun = now;
            }catch(_e){}
            return listener.call(this, ev);
          };
          wrapped.__yx108WrappedPageshow = true;
          return nativeAdd(type, wrapped, options);
        }
        return nativeAdd(type, listener, options);
      };
    }
  }catch(_e){}

  try{
    const NativeMO = window.MutationObserver;
    if(NativeMO && !NativeMO.__yx106Wrapped){
      const registry = window.__YX_MUTATION_OBSERVERS__ = window.__YX_MUTATION_OBSERVERS__ || [];
      function WrappedMutationObserver(callback){
        let scheduled = false;
        let lastMutations = null;
        let lastObserver = null;
        const wrapped = function(mutations, observer){
          lastMutations = mutations;
          lastObserver = observer;
          if(scheduled) return;
          scheduled = true;
          const run = () => {
            scheduled = false;
            try{ callback.call(this, lastMutations || [], lastObserver || observer); }
            catch(e){ try{ console.warn('YX MutationObserver skipped:', e); }catch(_){} }
          };
          (window.requestAnimationFrame || function(fn){ return setTimeout(fn, 80); })(run);
        };
        const obs = new NativeMO(wrapped);
        const nativeObserve = obs.observe.bind(obs);
        obs.observe = function(target, options){
          try{
            const isPageWide = (target === document.body || target === document.documentElement || target === document);
            const fullSubtree = !!(options && options.childList && options.subtree);
            const isOldToday = target && target.id === 'today-summary-cards';
            if((isPageWide && fullSubtree) || isOldToday){
              window.__YX106_SKIPPED_MUTATION_OBSERVERS__ = (window.__YX106_SKIPPED_MUTATION_OBSERVERS__ || 0) + 1;
              return undefined;
            }
          }catch(_e){}
          return nativeObserve(target, options);
        };
        registry.push(obs);
        return obs;
      }
      WrappedMutationObserver.prototype = NativeMO.prototype;
      WrappedMutationObserver.__yx106Wrapped = true;
      window.MutationObserver = WrappedMutationObserver;
    }
  }catch(_e){}
})();
/* ==== FIX106: early performance guard end ==== */
window.yxSortQtyExpression = window.yxSortQtyExpression || function(expr){
  const raw = String(expr || '')
    .replace(/[Ｘ×✕＊*X]/g,'x')
    .replace(/[＋，,；;]/g,'+')
    .replace(/件|片/g,'')
    .replace(/\s+/g,'')
    .trim();
  if(!raw) return '';
  const multi = [];
  const single = [];
  raw.split('+').filter(Boolean).forEach((seg, idx) => {
    const nums = (seg.match(/\d+/g) || []).map(n => parseInt(n, 10) || 0);
    if(nums.length >= 2 && /x/i.test(seg)) multi.push({seg, cases: nums[1] || 0, supports: nums[0] || 0, idx});
    else if(nums.length >= 1) single.push({seg, value: nums[0] || 0, idx});
    else single.push({seg, value: 0, idx});
  });
  multi.sort((a,b) => (b.cases - a.cases) || (b.supports - a.supports) || (a.idx - b.idx));
  single.sort((a,b) => (b.value - a.value) || (a.idx - b.idx));
  return [...multi.map(x => x.seg), ...single.map(x => x.seg)].join('+');
};

window.yxCleanQtyExpression = window.yxCleanQtyExpression || function(expr){
  return String(expr || '')
    .replace(/[Ｘ×✕＊*X]/g,'x')
    .replace(/[＝]/g,'=')
    .replace(/[＋，,；;]/g,'+')
    .replace(/件|片/g,'')
    .replace(/\s+/g,'')
    .trim();
};
window.yxFormatDimToken = window.yxFormatDimToken || function(v, isHeight){
  const s = String(v || '').trim();
  if(!s) return '';
  if(/^[A-Za-z]+$/.test(s)) return s.toUpperCase();
  if(/^\d*\.\d+$/.test(s)){
    const n = Number(s);
    if(n > 0 && n < 1) return s.startsWith('.') ? ('0' + s.slice(1)) : s.replace('.', '');
    return String(n).replace('.', '');
  }
  if(/^\d+$/.test(s)){
    if(isHeight && s.length === 1) return s.padStart(2,'0');
    return s;
  }
  return s.replace(/\s+/g,'');
};
window.yxNormalizeLeftSize = window.yxNormalizeLeftSize || function(left){
  return String(left || '').split(/x/i).map((p, i) => window.yxFormatDimToken(p, i === 2)).join('x');
};
window.yxNormalizeProductText = window.yxNormalizeProductText || function(text){
  const raw = String(text || '').replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').trim();
  const parts = raw.split('=');
  if(parts.length < 2) return raw;
  const left = window.yxNormalizeLeftSize(parts.shift().trim().replace(/\s+/g,''));
  const right = window.yxSortQtyExpression(window.yxCleanQtyExpression(parts.join('=')));
  return right ? `${left}=${right}` : raw;
};

window.toast = window.toast || function(message, level='ok'){
  let box = document.getElementById('global-toast-box');
  if (!box) {
    box = document.createElement('div');
    box.id = 'global-toast-box';
    box.style.cssText = 'position:fixed;right:16px;top:16px;z-index:9999;display:flex;flex-direction:column;gap:8px;';
    document.body.appendChild(box);
  }
  const el = document.createElement('div');
  const color = level === 'error' ? '#fee2e2' : level === 'warn' ? '#fef3c7' : '#dcfce7';
  const border = level === 'error' ? '#ef4444' : level === 'warn' ? '#f59e0b' : '#22c55e';
  el.style.cssText = `padding:10px 14px;border-radius:12px;background:${color};border:1px solid ${border};color:#111827;box-shadow:0 10px 20px rgba(0,0,0,.08);max-width:320px;`;
  el.textContent = message || '';
  box.appendChild(el);
  setTimeout(() => el.remove(), 2600);
};
window.requestJSON = window.requestJSON || async function(url, options={}){
  const opts = { credentials: 'same-origin', ...options };
  opts.headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const res = await fetch(url, opts);
  let data = {};
  try { data = await res.json(); } catch (_e) {}
  if (!res.ok || data.success === false) {
    const err = new Error(data.error || data.message || `請求失敗：${res.status}`);
    err.payload = data || {};
    err.status = res.status;
    throw err;
  }
  return data;
};
window.getFixedWarehouseColumns = function(){ return [1,2,3,4,5,6]; };
window.getFixedWarehouseSlots = function(zone, column){ try { return window.yx59WarehouseSlotCount ? window.yx59WarehouseSlotCount(zone, column) : 20; } catch(_e){ return 20; } };
window.getCellItems = function(zone, column, num){
  const cells = (window.state?.warehouse?.cells || []);
  const found = cells.find(c => String(c.zone)===String(zone) && Number(c.column_index)===Number(column) && Number(c.slot_number)===Number(num));
  if (!found) return [];
  try { return Array.isArray(found.items_json) ? found.items_json : JSON.parse(found.items_json || '[]'); } catch(_e){ return []; }
};
window.buildCellKey = function(zone, column, num){ return [zone, Number(column), 'direct', Number(num)]; };
window.parseTextareaItems = function(){
  const text = (document.getElementById('ocr-text')?.value || '').replace(/[。．]/g,'').trim();
  if (!text) return [];
  const normalizeX = v => String(v || '').replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/（/g,'(').replace(/）/g,')');
  const calcQty = right => {
    let total = 0;
    String(right || '').split(/[+＋,，;；]/).forEach(seg => {
      const main = seg.replace(/[\(（][^\)）]*[\)）]/g, '');
      const nums = (main.match(/\d+/g) || []).map(n => parseInt(n,10));
      if (nums.length >= 2) total += nums[1] || 0;
      else if (nums.length === 1) total += 1;
    });
    return Math.max(1, total || 1);
  };
  let last = ['', '', ''];
  const out = [];
  const lines = text.split(/\n+/).map(s => s.trim()).filter(Boolean);
  const tokenRe = /(?:[_-]|[A-Za-z]+|\d+(?:\.\d+)?)x(?:[_-]|[A-Za-z]+|\d+(?:\.\d+)?)x(?:[_-]|[A-Za-z]+|\d+(?:\.\d+)?)\s*[=:]\s*[^\n]+/ig;
  for (let line of lines) {
    line = normalizeX(line).replace(/\s+/g,'');
    const matches = line.match(tokenRe) || [];
    const tokens = matches.length ? matches : (/x/i.test(line) && /=/.test(line) ? [line] : []);
    for (const token of tokens) {
      const parts = token.split(/=|:/);
      const left = parts.shift();
      let right = parts.join('=').replace(/^[=:\s]+/,'').trim();
      right = window.yxSortQtyExpression(window.yxCleanQtyExpression(right.replace(/[^\dA-Za-z一-鿿xX+＋\-()（）件片]/g, '')));
      const dimsRaw = String(left || '').split(/x/i).map(s => s.trim());
      const dims = [0,1,2].map(i => {
        const v = dimsRaw[i] || '';
        if (!v || /^[_-]+$/.test(v)) return last[i] || '';
        return v;
      });
      if (dims[0] && dims[1] && dims[2]) last = dims.slice();
      if (!dims[0] || !dims[1] || !dims[2] || !right) continue;
      const product_text = `${window.yxNormalizeLeftSize(dims.join('x'))}=${right}`;
      out.push({ product_text, product_code: product_text, qty: calcQty(right) });
    }
  }
  return out;
};
window.normalizeCustomerItems = function(items){
  return (items || []).map(it => {
    const txt = String(it.product_text || '');
    const parts = txt.split('=');
    return { ...it, _size: parts[0] || txt, _qtyText: window.yxSortQtyExpression(parts[1] || String(it.qty || '')) };
  });
};
/* ==== realfix bootstrap end ==== */



function getFixedWarehouseColumns(){ return [1,2,3,4,5,6]; }
function getFixedWarehouseSlots(zone, column){ try { return window.yx59WarehouseSlotCount ? window.yx59WarehouseSlotCount(zone, column) : 20; } catch(_e){ return 20; } }

function normalizeRegion(value, fallback=''){
  const v = String(value || '').trim();
  return ['北區','中區','南區'].includes(v) ? v : fallback;
}

function renderWarehouseBaseGrid(){
  ['A','B'].forEach(zone => {
    const wrap = $(`zone-${zone}-grid`);
    if (!wrap) return;
    wrap.className = 'zone-grid six-grid vertical-card-grid';
    wrap.innerHTML = '';
    getFixedWarehouseColumns().forEach(c => {
      const col = document.createElement('div');
      col.className = 'vertical-column-card intuitive-column';
      col.innerHTML = `
        <div class="column-head-row">
          <div class="column-head">${zone} 區第 ${c} 欄</div>
          <div class="small-note">動態格數</div>
        </div>`;
      const list = document.createElement('div');
      list.className = 'vertical-slot-list';

      for (let n = 1; n <= getFixedWarehouseSlots(zone, c); n++) {
        const slot = document.createElement('div');
        slot.className = 'vertical-slot';
        slot.dataset.zone = zone;
        slot.dataset.column = c;
        slot.dataset.num = n;
        slot.innerHTML = `<div class="slot-title">第 ${String(n).padStart(2, '0')} 格</div><div class="slot-count"><div class="slot-line empty">空格</div></div>`;

        slot.addEventListener('click', () => {
          try {
            const items = getCellItems(zone, c, n);
            if (typeof showWarehouseDetail === 'function') showWarehouseDetail(zone, c, n, items);
            if (typeof openWarehouseModal === 'function') openWarehouseModal(zone, c, n);
          } catch (_e) {}
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
            if (parsed.kind === 'warehouse-item' && typeof moveWarehouseItem === 'function') {
              await moveWarehouseItem(parsed.fromKey, buildCellKey(zone, c, n), parsed.product_text, parsed.qty);
            }
          } catch (_e) {}
        });

        list.appendChild(slot);
      }
      col.appendChild(list);
      wrap.appendChild(col);
    });
  });
}

function applyWarehouseDataToGrid(){
  ['A','B'].forEach(zone => {
    const wrap = $(`zone-${zone}-grid`);
    if (!wrap) return;
    wrap.querySelectorAll('.vertical-slot').forEach(slot => {
      const c = Number(slot.dataset.column || 0);
      const n = Number(slot.dataset.num || 0);
      const items = getCellItems(zone, c, n);
      const directKey = `${zone}|${c}|direct|${n}`;
      let legacyKey = '';
      try {
        const legacyMap = typeof visualSlotToCell === 'function' ? visualSlotToCell(n) : { side: 'front', slot: n };
        legacyKey = `${zone}|${c}|${legacyMap.side}|${legacyMap.slot}`;
      } catch (_e) {}
      const highlighted = !!(state.searchHighlightKeys && (state.searchHighlightKeys.has(directKey) || (legacyKey && state.searchHighlightKeys.has(legacyKey))));
      slot.classList.toggle('filled', !!items.length);
      slot.classList.toggle('highlight', highlighted);

      const summary = items.length
        ? items.slice(0, 2).map(it => `<div class="slot-line customer">客戶：${escapeHTML(it.customer_name || '未指定客戶')}</div><div class="slot-line product">商品：${escapeHTML(it.product_text || '')}</div><div class="slot-line qty">數量：${it.qty || 0}</div>`).join('<hr class="slot-sep">')
        : '<div class="slot-line empty">空格</div>';

      slot.innerHTML = `<div class="slot-title">第 ${String(n).padStart(2, '0')} 格</div><div class="slot-count">${summary}</div>`;
    });
  });
}

function renderWarehouseZones(){
  renderWarehouseBaseGrid();
  applyWarehouseDataToGrid();
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
  window.renderWarehouseCellItems ? window.renderWarehouseCellItems() : null;
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

function __deprecated_renderWarehouseCellItemsLegacyA(){
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
    chip.querySelector('.edit')?.addEventListener('click', () => {
      const modal = ensureWarehouseItemEditModal();
      modal.querySelector('#warehouse-item-edit-text').value = it.product_text || '';
      modal.querySelector('#warehouse-item-edit-qty').value = String(it.qty || 0);
      const close = () => modal.classList.add('hidden');
      modal.querySelector('#warehouse-item-edit-close').onclick = close;
      modal.querySelector('#warehouse-item-edit-cancel').onclick = close;
      modal.querySelector('#warehouse-item-edit-save').onclick = () => {
        const nextText = modal.querySelector('#warehouse-item-edit-text').value.trim();
        const nextQty = parseInt(modal.querySelector('#warehouse-item-edit-qty').value || '0', 10);
        if (Number.isNaN(nextQty) || nextQty < 0) return toast('數量格式錯誤', 'error');
        state.currentCellItems[idx] = { ...it, product_text: nextText, qty: nextQty };
        close();
        window.renderWarehouseCellItems ? window.renderWarehouseCellItems() : null;
        toast('已更新格位內容，記得按儲存格位', 'ok');
      };
      modal.classList.remove('hidden');
    });
    chip.querySelector('.remove').addEventListener('click', () => {
      state.currentCellItems.splice(idx, 1);
      window.renderWarehouseCellItems ? window.renderWarehouseCellItems() : null;
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
  window.renderWarehouseCellItems ? window.renderWarehouseCellItems() : null;
}

async function saveWarehouseCell(){
  if (!state.currentCell) return;
  try {
    const note = $('warehouse-note')?.value || '';
    const cell = state.currentCell || {};
    await requestJSON('/api/warehouse/cell', {
      method: 'POST',
      body: JSON.stringify({
        zone: cell.zone,
        column_index: Number(cell.column_index || cell.column || cell.col || 0),
        slot_type: 'direct',
        slot_number: Number(cell.slot_number || cell.num || 0),
        items: state.currentCellItems,
        note
      })
    });
    toast('格位已儲存', 'ok');
    closeWarehouseModal();
    await renderWarehouse();
    if (typeof loadInventory === 'function') await loadInventory();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function legacyMoveWarehouseItem(fromKey, toKey, product_text, qty){
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

async function legacySearchWarehouse(){
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

function legacyHighlightWarehouseCell(zone, column, num){
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

/* expose globals block removed for realfix */
/* ===== 第十包覆寫強化 ===== */

function splitManualCompoundLine(line=''){
  const normalized = String(line || '')
    .replace(/[｜|]/g, ' ')
    .replace(/((?:[_-]|[A-Za-z]+|\d+(?:\.\d+)?)x(?:[_-]|[A-Za-z]+|\d+(?:\.\d+)?)x(?:[_-]|[A-Za-z]+|\d+(?:\.\d+)?)=[0-9A-Za-z一-鿿xX+＋件片]+)/ig, '\n$1\n')
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
    const rightRaw = window.yxSortQtyExpression(window.yxCleanQtyExpression(parts.join('=').replace(/[。．]/g, '').trim()));
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
    const calcQty = (txt) => {
      let total = 0;
      String(txt || '').split(/[+＋,，;；]/).forEach(seg => {
        const main = seg.replace(/[\(（][^\)）]*[\)）]/g, '');
        const nums = main.match(/\d+/g) || [];
        if (nums.length >= 2) total += parseInt(nums[1] || '0', 10) || 0;
        else if (nums.length === 1) total += 1;
      });
      return Math.max(1, total || 1);
    };
    const qty = calcQty(rightRaw);
    const product_text = `${window.yxNormalizeLeftSize(dims.join('x'))}=${rightRaw}`;
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

    line = normalizeOcrLine(line).replace(/[^0-9a-zA-Zx=+_\-｜:()（）\u4e00-\u9fff ]/g, '').trim();
    if (!line) return;

    const productPattern = /(?:[_-]|\d{1,4})x(?:[_-]|\d{1,4})x(?:[_-]|\d{1,4})=[^\n\s]+/ig;
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

async function legacySearchWarehouseOld(){
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
  const listId = 'customer-inline-items';
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


/* FIX53 removed legacy function legacyOpenCustomerModal */


window.batchAddCustomerItemsToShip = batchAddCustomerItemsToShip;
window.loadShipPreview = loadShipPreview;
window.renderShipSelectedItems = renderShipSelectedItems;
window.moveWarehouseItem = moveWarehouseItem;
window.highlightWarehouseCell = highlightWarehouseCell;


/* ==== warehouse reconnect override start ==== */
(function(){
  function ensureWarehouseState(){
    state.warehouse = state.warehouse || { cells: [], zones: {A:{},B:{}}, availableItems: [], activeZone: 'A' };
    state.searchHighlightKeys = state.searchHighlightKeys || new Set();
  }

  function fixedColumns(){ return [1,2,3,4,5,6]; }
  function fixedSlots(){ return 20; }

  window.getCellItems = function(zone, column, num){
    ensureWarehouseState();
    const cell = (state.warehouse.cells || []).find(c =>
      String(c.zone) === String(zone) &&
      Number(c.column_index) === Number(column) &&
      Number(c.slot_number) === Number(num)
    );
    if (!cell) return [];
    try {
      if (Array.isArray(cell.items_json)) return cell.items_json;
      return JSON.parse(cell.items_json || '[]');
    } catch (_e) {
      return [];
    }
  };

  window.buildCellKey = function(zone, column, num){
    return [zone, Number(column), 'direct', Number(num)];
  };

  /* pruned duplicate setWarehouseZone */
  function repaintWarehouseCells(){
    ['A','B'].forEach(zone => {
      const wrap = $(`zone-${zone}-grid`);
      if (!wrap) return;
      wrap.querySelectorAll('.vertical-slot').forEach(slot => {
        const c = Number(slot.dataset.column || 0);
        const n = Number(slot.dataset.num || 0);
        const items = window.getCellItems(zone, c, n);
        const key = `${zone}|${c}|direct|${n}`;
        const highlighted = !!(state.searchHighlightKeys && state.searchHighlightKeys.has(key));
        slot.classList.toggle('filled', items.length > 0);
        slot.classList.toggle('highlight', highlighted);
        const summary = items.length
          ? items.slice(0, 2).map(it => `
              <div class="slot-line customer">客戶：${escapeHTML(it.customer_name || '未指定客戶')}</div>
              <div class="slot-line product">商品：${escapeHTML(it.product_text || '')}</div>
              <div class="slot-line qty">數量：${it.qty || 0}</div>
            `).join('<hr class="slot-sep">')
          : '<div class="slot-line empty">空格</div>';
        slot.innerHTML = `<div class="slot-title">第 ${String(n).padStart(2,'0')} 格</div><div class="slot-count">${summary}</div>`;
      });
    });
  }

  window.renderWarehouseZones = function(){
    repaintWarehouseCells();
  };

  window.renderWarehouseLegacyA = async function(){
    ensureWarehouseState();
    try {
      const [warehouseRes, availRes] = await Promise.allSettled([
        requestJSON('/api/warehouse', { method:'GET' }),
        requestJSON('/api/warehouse/available-items', { method:'GET' })
      ]);
      const data = warehouseRes.status === 'fulfilled' ? warehouseRes.value : { cells: [], zones: {A:{}, B:{}} };
      const avail = availRes.status === 'fulfilled' ? availRes.value : { items: [] };

      state.warehouse.cells = Array.isArray(data.cells) ? data.cells : [];
      state.warehouse.zones = data.zones || { A:{}, B:{} };
      state.warehouse.availableItems = Array.isArray(avail.items) ? avail.items : [];

      if ($('warehouse-unplaced-pill')) {
        $('warehouse-unplaced-pill').textContent = `未錄入倉庫圖：${state.warehouse.availableItems.length}`;
      }
      repaintWarehouseCells();
      window.setWarehouseZone(state.warehouse.activeZone || 'A', false);

      try {
        const quick = JSON.parse(localStorage.getItem('warehouseQuickHighlight') || 'null');
        if (quick && (quick.productText || quick.customerName || quick.q)) {
          const query = quick.productText || quick.customerName || quick.q;
          if ($('warehouse-search')) $('warehouse-search').value = query;
          setTimeout(() => window.searchWarehouse(), 80);
          localStorage.removeItem('warehouseQuickHighlight');
        }
      } catch (_e) {}
    } catch (e) {
      console.error(e);
      toast('倉庫圖資料載入異常，已先顯示固定格位', 'warn');
      repaintWarehouseCells();
      window.setWarehouseZone('A', false);
    }
  };

  window.searchWarehouseLegacyA = async function(){
    ensureWarehouseState();
    const q = ($('warehouse-search')?.value || '').trim();
    const box = $('warehouse-search-results');
    if (!q) {
      state.searchHighlightKeys = new Set();
      box?.classList.add('hidden');
      repaintWarehouseCells();
      return;
    }
    try {
      const data = await requestJSON(`/api/warehouse/search?q=${encodeURIComponent(q)}`, { method:'GET' });
      state.searchHighlightKeys = new Set((data.items || []).map(r => `${r.cell.zone}|${r.cell.column_index}|direct|${r.cell.slot_number}`));
      repaintWarehouseCells();
      if (!box) return;
      box.classList.remove('hidden');
      if (!data.items || !data.items.length) {
        box.innerHTML = '<div class="search-card">沒有找到資料</div>';
        return;
      }
      box.innerHTML = '';
      const first = data.items[0];
      if (first && first.cell) {
        window.setWarehouseZone(first.cell.zone, false);
        setTimeout(() => {
          try { highlightWarehouseCell(first.cell.zone, first.cell.column_index, first.cell.slot_number); } catch (_e) {}
        }, 120);
      }
      data.items.forEach(r => {
        const cell = r.cell;
        const item = r.item || {};
        const div = document.createElement('div');
        div.className = 'search-card';
        div.innerHTML = `<strong>${escapeHTML(cell.zone)}區 第 ${cell.column_index} 欄 第 ${String(cell.slot_number).padStart(2,'0')} 格</strong><br>${escapeHTML(item.product_text || '')} × ${item.qty || 0}`;
        div.addEventListener('click', () => {
          window.setWarehouseZone(cell.zone);
          setTimeout(() => {
            try { highlightWarehouseCell(cell.zone, cell.column_index, cell.slot_number); } catch (_e) {}
            try { openWarehouseModal(cell.zone, cell.column_index, cell.slot_number); } catch (_e) {}
          }, 120);
        });
        box.appendChild(div);
      });
    } catch (e) {
      toast(e.message || '搜尋失敗', 'error');
    }
  };

  window.clearWarehouseHighlights = function(){
    ensureWarehouseState();
    state.searchHighlightKeys = new Set();
    $('warehouse-unplaced-list-inline')?.classList.add('hidden');
    $('warehouse-search-results')?.classList.add('hidden');
    repaintWarehouseCells();
  };

  window.toggleWarehouseUnplacedHighlight = async function(){
    ensureWarehouseState();
    const items = Array.isArray(state.warehouse.availableItems) ? state.warehouse.availableItems : [];
    const box = $('warehouse-unplaced-list-inline');
    if (!items.length) {
      if (box) {
        box.classList.remove('hidden');
        box.innerHTML = '<div class="search-card">目前沒有未錄入倉庫圖商品</div>';
      }
      return;
    }
    if (box) {
      box.classList.remove('hidden');
      box.innerHTML = '';
    }
    state.searchHighlightKeys = new Set();
    items.forEach(it => {
      const div = document.createElement('div');
      div.className = 'search-card';
      div.innerHTML = `<strong>${escapeHTML(it.customer_name || '未指定客戶')}</strong><br>${escapeHTML(it.product_text || '')}｜未錄入數量 ${it.unplaced_qty || 0}`;
      div.addEventListener('click', async () => {
        if ($('warehouse-search')) $('warehouse-search').value = it.product_text || '';
        await window.searchWarehouse();
      });
      box?.appendChild(div);
    });
    repaintWarehouseCells();
  };

  window.highlightWarehouseSameCustomer = function(){
    ensureWarehouseState();
    const q = ($('warehouse-search')?.value || '').trim();
    if (!q) {
      toast('請先在搜尋框輸入客戶名', 'warn');
      return;
    }
    const keys = new Set();
    const cells = Array.isArray(state.warehouse.cells) ? state.warehouse.cells : [];
    cells.forEach(cell => {
      let items = [];
      try { items = JSON.parse(cell.items_json || '[]'); } catch (_e) {}
      if (items.some(it => String(it.customer_name || '').includes(q))) {
        keys.add(`${cell.zone}|${cell.column_index}|direct|${cell.slot_number}`);
      }
    });
    state.searchHighlightKeys = keys;
    repaintWarehouseCells();
  };

  window.addWarehouseVisualSlot = async function(zone, column){
    toast('請在格子內按「插入格子」', 'warn');
  };
  window.removeWarehouseVisualSlot = async function(zone, column){
    toast('請在格子內按「刪除格子」', 'warn');
  };
  window.deleteWarehouseColumn = async function(zone, column){
    toast('已取消整欄刪除功能', 'warn');
  };

  document.addEventListener('DOMContentLoaded', () => {
    if (window.__YX65_SKIP_DUP_BOOT__) return;
    if (typeof currentModule === 'function' && currentModule() === 'warehouse') {
      setTimeout(() => {
        try { window.renderWarehouse(); } catch (_e) {}
      }, 60);
    }
  });
})();
/* ==== warehouse reconnect override end ==== */


/* ==== v23 customer + warehouse action fix ==== */
(function(){
  function ensureState(){
    state.warehouse = state.warehouse || { cells: [], zones: {A:{},B:{}}, availableItems: [], activeZone: 'A' };
    state.searchHighlightKeys = state.searchHighlightKeys || new Set();
  }

  /* pruned duplicate setWarehouseZone */
  function buildCustomerCard(name, count){
    return `
      <div class="customer-card-main">
        <div class="customer-card-name">${escapeHTML(name)}</div>
        <div class="customer-card-meta">${count || 0}筆商品</div>
      </div>
      <div class="customer-card-arrow">→</div>
    `;
  }

  function normalizeCustomerItems(items){
    return (items || []).map(it => {
      const row = (typeof formatCustomerProductRow === 'function') ? formatCustomerProductRow(it.product_text || '') : { size: it.product_text || '', qtyText: String(it.qty || '') };
      return { ...it, _size: row.size || it.product_text || '', _qtyText: window.yxSortQtyExpression(row.qtyText || String(it.qty || '')) };
    });
  }

  /* pruned duplicate loadCustomerBlocks */
  /* pruned duplicate selectCustomerForModule */
  function optimisticRenderNorthCustomer(customerName, items){
    const north = $('region-north');
    if (!north || !customerName) return;
    north.querySelector('.empty-state-card')?.remove();
    let card = Array.from(north.querySelectorAll('.customer-region-card')).find(el => (el.dataset.customer || '') === customerName);
    if (!card) {
      card = document.createElement('button');
      card.type = 'button';
      card.className = 'customer-region-card';
      card.dataset.customer = customerName;
      card.onclick = () => {
        const panel = $('selected-customer-items');
        if (!panel) return;
        const rows = normalizeCustomerItems(items).map(it => `<tr><td>${escapeHTML(it._size)}</td><td>${escapeHTML(it._qtyText)}</td><td>${escapeHTML(it.source || '')}</td></tr>`).join('');
        panel.classList.remove('hidden');
        panel.innerHTML = `
          <div class="customer-detail-card">
            <div class="customer-detail-header">
              <div>
                <div class="section-title">${escapeHTML(customerName)}</div>
                <div class="muted">${items.length}筆商品</div>
              </div>
            </div>
            <div class="table-card customer-table-wrap">
              <table>
                <thead><tr><th>尺寸</th><th>支數 x 件數</th><th>來源</th></tr></thead>
                <tbody>${rows}</tbody>
              </table>
            </div>
          </div>`;
      };
      north.prepend(card);
    }
    card.innerHTML = buildCustomerCard(customerName, items.length);
  }

  /* pruned duplicate confirmSubmit */
  document.addEventListener('DOMContentLoaded', () => {
    if (window.__YX65_SKIP_DUP_BOOT__) return;
    const btnA = $('zone-switch-A');
    const btnB = $('zone-switch-B');
    const btnAll = $('zone-switch-ALL');
    if (btnA) btnA.onclick = () => window.setWarehouseZone('A');
    if (btnB) btnB.onclick = () => window.setWarehouseZone('B');
    if (btnAll) btnAll.onclick = () => window.setWarehouseZone('ALL');

    if (typeof currentModule === 'function') {
      const mod = currentModule();
      if (mod === 'orders' || mod === 'master_order') {
        setTimeout(() => {
          try { window.loadCustomerBlocks(); } catch (_e) {}
        }, 60);
      }
      if (mod === 'warehouse') {
        const saved = localStorage.getItem('warehouseActiveZone') || 'A';
        setTimeout(() => window.setWarehouseZone(saved, false), 80);
      }
    }
  });
})();
/* ==== end fix ==== */


/* ==== realfix override start ==== */
(function(){
  function customerCardHTML(name, count){
    return `<div class="customer-card-main"><div class="customer-card-name">${escapeHTML(name)}</div><div class="customer-card-meta">${count}筆商品</div></div><div class="customer-card-arrow">→</div>`;
  }

  function repaintWarehouse(){
    ['A','B'].forEach(zone => {
      const wrap = $('zone-' + zone + '-grid');
      if (!wrap) return;
      wrap.querySelectorAll('.vertical-slot').forEach(slot => {
        const c = Number(slot.dataset.column || 0);
        const n = Number(slot.dataset.num || 0);
        const items = getCellItems(zone, c, n);
        const key = `${zone}|${c}|direct|${n}`;
        const highlighted = !!(state.searchHighlightKeys && state.searchHighlightKeys.has(key));
        slot.classList.toggle('filled', items.length > 0);
        slot.classList.toggle('highlight', highlighted);
        slot.innerHTML = `<div class="slot-title">第 ${String(n).padStart(2,'0')} 格</div><div class="slot-count">${
          items.length
            ? items.slice(0,2).map(it => `<div class="slot-line customer">客戶：${escapeHTML(it.customer_name || '未指定客戶')}</div><div class="slot-line product">商品：${escapeHTML(it.product_text || '')}</div><div class="slot-line qty">數量：${it.qty || 0}</div>`).join('<hr class="slot-sep">')
            : '<div class="slot-line empty">空格</div>'
        }</div>`;
      });
    });
  }

  /* pruned duplicate setWarehouseZone */
  window.renderWarehouseLegacyB = async function(){
    try {
      const [warehouseRes, availRes] = await Promise.allSettled([
        requestJSON('/api/warehouse', { method:'GET' }),
        requestJSON('/api/warehouse/available-items', { method:'GET' })
      ]);
      const data = warehouseRes.status === 'fulfilled' ? warehouseRes.value : { cells: [], zones: {A:{}, B:{}} };
      const avail = availRes.status === 'fulfilled' ? availRes.value : { items: [] };
      state.warehouse.cells = Array.isArray(data.cells) ? data.cells : [];
      state.warehouse.zones = data.zones || {A:{}, B:{}};
      state.warehouse.availableItems = Array.isArray(avail.items) ? avail.items : [];
      if ($('warehouse-unplaced-pill')) $('warehouse-unplaced-pill').textContent = `未錄入倉庫圖：${state.warehouse.availableItems.length}`;
      repaintWarehouse();
      setWarehouseZone(localStorage.getItem('warehouseActiveZone') || 'A', false);
    } catch (e) {
      console.error(e);
      toast(e.message || '倉庫圖載入失敗', 'error');
    }
  };

  window.searchWarehouseLegacyB = async function(){
    const q = ($('warehouse-search')?.value || '').trim();
    const box = $('warehouse-search-results');
    if (!q) {
      state.searchHighlightKeys = new Set();
      box?.classList.add('hidden');
      repaintWarehouse();
      return;
    }
    try {
      const data = await requestJSON(`/api/warehouse/search?q=${encodeURIComponent(q)}`, { method:'GET' });
      state.searchHighlightKeys = new Set((data.items || []).map(r => `${r.cell.zone}|${r.cell.column_index}|direct|${r.cell.slot_number}`));
      repaintWarehouse();
      if (!box) return;
      box.classList.remove('hidden');
      box.innerHTML = '';
      if (!data.items || !data.items.length) {
        box.innerHTML = '<div class="search-card">沒有找到資料</div>';
        return;
      }
      const first = data.items[0];
      setWarehouseZone(first.cell.zone, false);
      data.items.forEach(r => {
        const div = document.createElement('div');
        div.className = 'search-card';
        div.innerHTML = `<strong>${escapeHTML(r.cell.zone)}區 第 ${r.cell.column_index} 欄 第 ${String(r.cell.slot_number).padStart(2,'0')} 格</strong><br>${escapeHTML(r.item.product_text || '')} × ${r.item.qty || 0}`;
        div.onclick = () => {
          setWarehouseZone(r.cell.zone);
          try { openWarehouseModal(r.cell.zone, r.cell.column_index, r.cell.slot_number); } catch(_e){}
        };
        box.appendChild(div);
      });
    } catch (e) {
      toast(e.message || '搜尋失敗', 'error');
    }
  };

  window.clearWarehouseHighlights = function(){
    state.searchHighlightKeys = new Set();
    $('warehouse-search-results')?.classList.add('hidden');
    $('warehouse-unplaced-list-inline')?.classList.add('hidden');
    repaintWarehouse();
  };

  window.toggleWarehouseUnplacedHighlight = function(){
    const box = $('warehouse-unplaced-list-inline');
    const items = state.warehouse.availableItems || [];
    if (!box) return;
    box.classList.remove('hidden');
    box.innerHTML = '';
    if (!items.length) {
      box.innerHTML = '<div class="search-card">目前沒有未錄入倉庫圖商品</div>';
      return;
    }
    items.forEach(it => {
      const div = document.createElement('div');
      div.className = 'search-card';
      div.innerHTML = `<strong>${escapeHTML(it.customer_name || '未指定客戶')}</strong><br>${escapeHTML(it.product_text || '')}｜未錄入數量 ${it.unplaced_qty || 0}`;
      div.onclick = async () => {
        if ($('warehouse-search')) $('warehouse-search').value = it.product_text || '';
        await window.searchWarehouse();
      };
      box.appendChild(div);
    });
  };

  window.highlightWarehouseSameCustomer = function(){
    const q = ($('warehouse-search')?.value || '').trim();
    if (!q) return toast('請先在搜尋框輸入客戶名', 'warn');
    const keys = new Set();
    (state.warehouse.cells || []).forEach(cell => {
      let items = [];
      try { items = JSON.parse(cell.items_json || '[]'); } catch(_e){}
      if (items.some(it => String(it.customer_name || '').includes(q))) keys.add(`${cell.zone}|${cell.column_index}|direct|${cell.slot_number}`);
    });
    state.searchHighlightKeys = keys;
    repaintWarehouse();
  };

  /* pruned duplicate loadCustomerBlocks */
  /* pruned duplicate selectCustomerForModule */
  function optimisticNorth(customerName, items, sourceLabel){
    const north = $('region-north');
    if (!north) return;
    north.querySelector('.empty-state-card')?.remove();
    let card = Array.from(north.querySelectorAll('.customer-region-card')).find(el => el.dataset.customer === customerName);
    if (!card) {
      card = document.createElement('button');
      card.type = 'button';
      card.className = 'customer-region-card';
      card.dataset.customer = customerName;
      north.prepend(card);
    }
    card.innerHTML = customerCardHTML(customerName, items.length);
    card.onclick = () => {
      const panel = $('selected-customer-items');
      if (!panel) return;
      const rows = normalizeCustomerItems(items.map(it => ({...it, source: sourceLabel}))).map(it => `<tr><td>${escapeHTML(it._size)}</td><td>${escapeHTML(it._qtyText)}</td><td>${escapeHTML(it.source || '')}</td></tr>`).join('');
      panel.classList.remove('hidden');
      panel.innerHTML = `<div class="customer-detail-card"><div class="customer-detail-header"><div><div class="section-title">${escapeHTML(customerName)}</div><div class="muted">${items.length}筆商品</div></div></div><div class="table-card customer-table-wrap"><table><thead><tr><th>尺寸</th><th>支數 x 件數</th><th>來源</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
    };
  }

  /* pruned duplicate confirmSubmit */
  document.addEventListener('DOMContentLoaded', () => {
    if (window.__YX65_SKIP_DUP_BOOT__) return;
    const mod = currentModule();
    if (mod === 'warehouse') {
      const saved = localStorage.getItem('warehouseActiveZone') || 'A';
      setTimeout(() => { renderWarehouse(); setWarehouseZone(saved, false); }, 80);
      const btnA = $('zone-switch-A'); const btnB = $('zone-switch-B'); const btnAll = $('zone-switch-ALL');
      if (btnA) btnA.onclick = () => setWarehouseZone('A');
      if (btnB) btnB.onclick = () => setWarehouseZone('B');
      if (btnAll) btnAll.onclick = () => setWarehouseZone('ALL');
    }
    if (['inventory','orders','master_order'].includes(mod)) {
      setTimeout(() => window.loadCustomerBlocks(), 80);
    }
  });
})();
/* ==== realfix override end ==== */


/* ==== v23 stable submit+zone patch start ==== */
(function(){
  function moduleSuccessText(module){
    return module === 'orders' ? '訂單送出成功' :
           module === 'master_order' ? '總單送出成功' :
           module === 'ship' ? '出貨送出成功' :
           '庫存送出成功';
  }

  async function doSubmit(module, payload){
    const endpoint = module === 'orders' ? '/api/orders' :
                     module === 'master_order' ? '/api/master_orders' :
                     module === 'ship' ? '/api/ship' : '/api/inventory';
    return await requestJSON(endpoint, { method:'POST', body: JSON.stringify(payload) });
  }

  /* pruned duplicate confirmSubmit */
  document.addEventListener('DOMContentLoaded', () => {
    if (window.__YX65_SKIP_DUP_BOOT__) return;
    if (currentModule() === 'warehouse') {
      const saved = localStorage.getItem('warehouseActiveZone') || 'A';
      setTimeout(() => {
        if (typeof renderWarehouse === 'function') renderWarehouse();
        if (typeof setWarehouseZone === 'function') setWarehouseZone(saved, false);
      }, 60);
    }
  });
})();
/* ==== v23 stable submit+zone patch end ==== */

/* ==== final hard patch: submit request_key + warehouse zone memory ==== */
(function(){
  function getSubmitEndpoint(module){
    return module === 'orders' ? '/api/orders' :
           module === 'master_order' ? '/api/master_orders' :
           module === 'ship' ? '/api/ship' :
           '/api/inventory';
  }

  function submitSuccessText(module){
    return module === 'orders' ? '訂單送出成功' :
           module === 'master_order' ? '總單送出成功' :
           module === 'ship' ? '出貨送出成功' :
           '庫存送出成功';
  }

  function makeRequestKey(module, customerName, items){
    const part = (items || []).map(it => `${it.product_text || ''}:${it.qty || 0}`).join('|');
    return `${module}__${customerName || ''}__${Date.now()}__${Math.random().toString(36).slice(2,10)}__${part.slice(0,120)}`;
  }

  function parseSubmitItems(rawText){
    let items = [];
    try {
      items = typeof parseTextareaItems === 'function' ? parseTextareaItems() : [];
    } catch (_e) {
      items = [];
    }
    if (!items.length && rawText && typeof formatManualEntryText === 'function') {
      try {
        const formatted = formatManualEntryText(rawText);
        if (formatted?.items?.length) {
          items = formatted.items;
          if (($('customer-name')?.value || '').trim() === '' && formatted.customer_name && $('customer-name')) {
            $('customer-name').value = formatted.customer_name;
          }
        }
      } catch (_e) {}
    }
    return items;
  }

  window.setWarehouseZone = function(zone, doScroll=true){
    state.warehouse = state.warehouse || { cells: [], zones: {A:{}, B:{}}, availableItems: [], activeZone: 'A' };
    const mode = zone === 'ALL' ? 'ALL' : (zone === 'B' ? 'B' : 'A');
    state.warehouse.activeZone = mode;
    const zoneA = $('zone-A');
    const zoneB = $('zone-B');

    if (zoneA) zoneA.style.display = (mode === 'B') ? 'none' : '';
    if (zoneB) zoneB.style.display = (mode === 'A') ? 'none' : '';

    ['A','B','ALL'].forEach(key => {
      const btn = $('zone-switch-' + key);
      if (btn) btn.classList.toggle('active', key === mode);
    });

    const pill = $('warehouse-selection-pill');
    if (pill) pill.textContent = `目前區域：${mode === 'ALL' ? '全部' : mode + ' 區'}`;

    try { localStorage.setItem('warehouseActiveZone', mode); } catch (_e) {}

    if (doScroll) {
      const target = mode === 'B' ? zoneB : zoneA;
      (mode === 'ALL' ? zoneA : target)?.scrollIntoView({ behavior:'smooth', block:'start' });
    }
  };

  /* pruned duplicate confirmSubmit */
  document.addEventListener('DOMContentLoaded', () => {
    if (window.__YX65_SKIP_DUP_BOOT__) return;
    const mod = typeof currentModule === 'function' ? currentModule() : '';
    if (mod === 'warehouse') {
      const saved = (() => { try { return localStorage.getItem('warehouseActiveZone') || 'A'; } catch (_e) { return 'A'; } })();
      const btnA = $('zone-switch-A');
      const btnB = $('zone-switch-B');
      const btnAll = $('zone-switch-ALL');
      if (btnA) btnA.onclick = () => window.setWarehouseZone('A');
      if (btnB) btnB.onclick = () => window.setWarehouseZone('B');
      if (btnAll) btnAll.onclick = () => window.setWarehouseZone('ALL');
      setTimeout(() => {
        if (typeof window.renderWarehouse === 'function') window.renderWarehouse();
        window.setWarehouseZone(saved, false);
      }, 80);
    }
    if (['inventory','orders','master_order'].includes(mod)) {
      setTimeout(() => {
        if (typeof window.loadCustomerBlocks === 'function') window.loadCustomerBlocks();
      }, 80);
    }
  });
})();
/* ==== final hard patch end ==== */


/* ==== customer drag/edit + tolerant submit parsing patch ==== */
(function(){
  window.getModuleKey = window.getModuleKey || function(){
    try { return typeof currentModule === 'function' ? currentModule() : ''; } catch (_e) { return ''; }
  };

  function normalizeX(text){
    return String(text || '')
      .replace(/[Ｘ×✕＊*X]/g, 'x')
      .replace(/\s*乘\s*/g, 'x')
      .replace(/[＝]/g, '=')
      .replace(/[，、；;]/g, ' ')
      .replace(/[。．]/g, '')
      .replace(/[|｜]/g, ' ')
      .replace(/\u3000/g, ' ')
      .replace(/\r/g, '\n');
  }

  function normalizeProductTextLines(raw){
    const formatDim = (v, isHeight=false) => {
      let s = String(v || '').trim();
      if (!s) return '';
      if (/^[_-]+$/.test(s)) return '';
      if (/^[A-Za-z]+$/.test(s)) return s.toUpperCase();
      if (/^\d*\.\d+$/.test(s)) {
        if (s.startsWith('.')) s = '0' + s;
        return s.replace('.', '');
      }
      if (/^\d+$/.test(s)) return (isHeight && s.length === 1) ? s.padStart(2, '0') : s;
      return s.replace(/\s+/g, '');
    };
    const resolveLeft = (left, prev) => {
      const compact = normalizeX(left).replace(/\s+/g, '');
      let parts = compact.split(/x/i).filter(v => v !== '');
      if (parts.length === 2 && /^[_-]+$/.test(parts[1]) && prev[1] && prev[2]) {
        parts = [parts[0], prev[1], prev[2]];
      } else if (parts.length === 1 && prev[1] && prev[2]) {
        parts = [parts[0], prev[1], prev[2]];
      } else if (parts.length >= 3) {
        parts = [0,1,2].map(i => (/^[_-]+$/.test(parts[i] || '') ? (prev[i] || '') : parts[i]));
      }
      if (parts.length < 3 || !parts[0] || !parts[1] || !parts[2]) return null;
      const dims = [formatDim(parts[0], false), formatDim(parts[1], false), formatDim(parts[2], true)];
      return dims.every(Boolean) ? dims : null;
    };
    const out = [];
    let prev = ['', '', ''];
    normalizeX(raw || '').split(/\n+/).forEach(line => {
      const normalized = line.trim();
      if (!normalized) return;
      const compactForPallet = normalized.replace(/\s+/g, '');
      const pallet = compactForPallet.match(/^(棧板|栈板|木棧板|木栈板)(\d+)片?$/);
      if (pallet) { out.push(`棧板=${pallet[2]}`); return; }
      const pair = normalized.split(/=|:/);
      if (pair.length < 2) {
        const fixed = window.yxNormalizeProductText(normalized.replace(/\s+/g,''));
        if (fixed) out.push(fixed);
        return;
      }
      const left = pair.shift();
      const dims = resolveLeft(left, prev);
      if (!dims) {
        const fixed = window.yxNormalizeProductText(normalized.replace(/\s+/g,''));
        if (fixed) out.push(fixed);
        return;
      }
      prev = dims.slice();
      const right = window.yxSortQtyExpression(window.yxCleanQtyExpression(pair.join('=')));
      out.push(right ? `${dims.join('x')}=${right}` : dims.join('x'));
    });
    return out.join('\n');
  }

  function mergeSubmitItems(items){
    const map = new Map();
    (items || []).forEach(it => {
      const key = String(it.product_text || '').trim();
      if (!key) return;
      const prev = map.get(key) || { product_text: key, product_code: key, qty: 0 };
      prev.qty += Number(it.qty || 0) || 0;
      map.set(key, prev);
    });
    return Array.from(map.values()).filter(it => Number(it.qty || 0) > 0);
  }

  function parseSubmitItemsRobust(raw){
    const text = normalizeX(raw).trim();
    if (!text) return [];
    const out = [];
    const lines = text.split(/\n+/).map(s => s.trim()).filter(Boolean);
    let last = ['', '', ''];

    const pushPallet = (line) => {
      const m = String(line || '').replace(/\s+/g,'').match(/^(棧板|栈板|木棧板|木栈板)(\d+)片?$/);
      if(!m) return false;
      const qty = Number(m[2] || 0) || 0;
      if(qty > 0) out.push({ product_text: '棧板=' + qty, product_code: '棧板', qty });
      return true;
    };

    const pushEntry = (leftRaw, rightRaw) => {
      const dimsRaw = String(leftRaw || '').split(/x/i).map(s => s.trim());
      const dims = [0,1,2].map(i => {
        const v = dimsRaw[i] || '';
        if (!v || /^[_-]+$/.test(v)) return last[i] || '';
        return v;
      });
      if (!dims[0] || !dims[1] || !dims[2]) return;
      last = dims.slice();
      let right = String(rightRaw || '').replace(/\s+/g, '').replace(/（/g,'(').replace(/）/g,')');
      right = window.yxCleanQtyExpression(right.replace(/[^0-9A-Za-z一-鿿xX+＋\-()件片]/g, ''));
      if (!right) right = '1x1';
      const calcQty = (txt) => {
        let total = 0;
        String(txt || '').split(/[+＋,，;；]/).forEach(seg => {
          const main = seg.replace(/[\(（][^\)）]*[\)）]/g, '');
          const nums = main.match(/\d+/g) || [];
          // 19件 / 1425片 這種明確寫件或片的格式，數量就是該數字
          if (nums.length === 1 && /[件片]/.test(main)) total += parseInt(nums[0] || '0', 10) || 0;
          else if (nums.length >= 2) total += parseInt(nums[1] || '0', 10) || 0;
          else if (nums.length === 1) total += 1;
        });
        return Math.max(1, total || 1);
      };
      const qty = calcQty(right);
      const product_text = `${window.yxNormalizeLeftSize(dims.join('x'))}=${right}`;
      out.push({ product_text, product_code: product_text, qty });
    };

    const dimUnit = '(?:[_-]|[A-Za-z]+|\\d+(?:\\.\\d+)?)';
    const tokenRe = new RegExp(dimUnit + 'x' + dimUnit + 'x' + dimUnit + '(?:\\s*(?:=|:)\\s*[^\\n]+)?', 'ig');
    const wholeRe = new RegExp('^((' + dimUnit + ')x(' + dimUnit + ')x(' + dimUnit + '))(?:\\s*(?:=|:)\\s*(.+))?$', 'i');
    lines.forEach(line => {
      const normalized = normalizeX(line).replace(/\s+/g, ' ').trim();
      if (!normalized) return;
      if (pushPallet(normalized)) return;
      const compact = normalized.replace(/\s+/g, '');
      const tokens = compact.match(tokenRe) || [];
      if (tokens.length) {
        tokens.forEach(token => {
          const parts = token.split(/=|:/);
          pushEntry(parts[0], parts.slice(1).join('='));
        });
        return;
      }
      const whole = compact.match(wholeRe);
      if (whole) pushEntry(whole[1], whole[5] || '');
    });

    return mergeSubmitItems(out);
  }

  function collectSubmitItems(){
    const ocrBox = $('ocr-text');
    if (ocrBox) ocrBox.value = normalizeProductTextLines(ocrBox.value || '');
    const rawText = (ocrBox?.value || '').trim();
    let items = [];
    try { items = parseSubmitItemsRobust(rawText); } catch (_e) { items = []; }
    if (!items.length) {
      try {
        const formatted = typeof formatManualEntryText === 'function' ? formatManualEntryText(rawText) : null;
        if (formatted?.items?.length) {
          items = mergeSubmitItems((formatted.items || []).map(it => ({
            product_text: it.product_text || '',
            product_code: it.product_code || it.product_text || '',
            qty: Number(it.qty || 0) || 0
          })));
          const guessedName = (formatted.customerGuess || formatted.customer_name || '').trim();
          if (guessedName && $('customer-name') && !$('customer-name').value.trim()) $('customer-name').value = guessedName;
        }
      } catch (_e) {}
    }
    return items;
  }

  function ensureModalShell(id, innerHtml){
    let modal = document.getElementById(id);
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = id;
    modal.className = 'modal hidden';
    modal.innerHTML = innerHtml;
    document.body.appendChild(modal);
    modal.addEventListener('click', ev => { if (ev.target === modal) modal.classList.add('hidden'); });
    return modal;
  }

  function ensureConfirmModal(){
    return ensureModalShell('confirm-action-modal', `
      <div class="modal-card glass" style="max-width:420px;">
        <div class="modal-head">
          <div class="section-title" id="confirm-action-title">確認</div>
          <button class="icon-btn" type="button" id="confirm-action-close">✕</button>
        </div>
        <div id="confirm-action-message" class="muted" style="line-height:1.8;"></div>
        <div class="btn-row" style="margin-top:16px;justify-content:flex-end;">
          <button class="ghost-btn" type="button" id="confirm-action-cancel">取消</button>
          <button class="primary-btn" type="button" id="confirm-action-ok">確認</button>
        </div>
      </div>`);
  }

  function confirmDialog({ title='確認', message='', confirmText='確認', cancelText='取消', danger=false }={}){
    return new Promise(resolve => {
      const modal = ensureConfirmModal();
      modal.querySelector('#confirm-action-title').textContent = title;
      modal.querySelector('#confirm-action-message').innerHTML = message;
      const okBtn = modal.querySelector('#confirm-action-ok');
      const cancelBtn = modal.querySelector('#confirm-action-cancel');
      const closeBtn = modal.querySelector('#confirm-action-close');
      okBtn.textContent = confirmText;
      cancelBtn.textContent = cancelText;
      okBtn.className = danger ? 'ghost-btn danger-btn' : 'primary-btn';
      const cleanup = (value) => {
        modal.classList.add('hidden');
        okBtn.onclick = cancelBtn.onclick = closeBtn.onclick = null;
        resolve(value);
      };
      okBtn.onclick = () => cleanup(true);
      cancelBtn.onclick = () => cleanup(false);
      closeBtn.onclick = () => cleanup(false);
      modal.classList.remove('hidden');
    });
  }

  function ensureCustomerActionSheet(){
    return ensureModalShell('customer-action-sheet', `
      <div class="modal-card glass" style="max-width:360px;">
        <div class="modal-head">
          <div class="section-title" id="customer-action-title">客戶操作</div>
          <button class="icon-btn" type="button" id="customer-action-close">✕</button>
        </div>
        <div class="btn-row" style="flex-direction:column;align-items:stretch;gap:10px;">
          <button class="primary-btn" type="button" id="customer-action-edit">編輯客戶</button>
          <button class="ghost-btn danger-btn" type="button" id="customer-action-delete">刪除 / 封存客戶</button>
          <button class="ghost-btn" type="button" id="customer-action-cancel">取消</button>
        </div>
      </div>`);
  }

  function ensureCustomerEditModal(){
    return ensureModalShell('customer-edit-modal', `
      <div class="modal-card glass" style="max-width:520px;">
        <div class="modal-head">
          <div class="section-title" id="customer-edit-title">編輯客戶</div>
          <button class="icon-btn" type="button" id="customer-edit-close">✕</button>
        </div>
        <label class="field-label">客戶名稱</label>
        <input class="text-input" id="customer-edit-name">
        <label class="field-label">電話</label>
        <input class="text-input" id="customer-edit-phone">
        <label class="field-label">地址</label>
        <input class="text-input" id="customer-edit-address">
        <label class="field-label">特殊要求</label>
        <textarea class="text-area small" id="customer-edit-notes"></textarea>
        <label class="field-label">區域</label>
        <select class="text-input" id="customer-edit-region">
          <option value="北區">北區</option>
          <option value="中區">中區</option>
          <option value="南區">南區</option>
        </select>
        <div class="btn-row" style="margin-top:16px;justify-content:flex-end;">
          <button class="ghost-btn" type="button" id="customer-edit-cancel">取消</button>
          <button class="primary-btn" type="button" id="customer-edit-save">儲存</button>
        </div>
      </div>`);
  }

  function ensureWarehouseItemEditModal(){
    return ensureModalShell('warehouse-item-edit-modal', `
      <div class="modal-card glass" style="max-width:460px;">
        <div class="modal-head">
          <div class="section-title">編輯格位商品</div>
          <button class="icon-btn" type="button" id="warehouse-item-edit-close">✕</button>
        </div>
        <label class="field-label">商品資料</label>
        <input class="text-input" id="warehouse-item-edit-text">
        <label class="field-label">數量</label>
        <input class="text-input" id="warehouse-item-edit-qty" type="number" min="0">
        <div class="btn-row" style="margin-top:16px;justify-content:flex-end;">
          <button class="ghost-btn" type="button" id="warehouse-item-edit-cancel">取消</button>
          <button class="primary-btn" type="button" id="warehouse-item-edit-save">儲存</button>
        </div>
      </div>`);
  }

  async function loadCustomerRecentActivity(customerName){
    if (!customerName) return [];
    try {
      const data = await requestJSON(`/api/audit-trails?limit=20&q=${encodeURIComponent(customerName)}`, { method:'GET' });
      const items = Array.isArray(data.items) ? data.items : [];
      return items.filter(it => JSON.stringify(it || {}).includes(customerName)).slice(0, 8);
    } catch (_e) {
      return [];
    }
  }

  function renderCustomerRecentActivity(items){
    const rows = Array.isArray(items) ? items : [];
    if (!rows.length) return '<div class="empty-state-card compact-empty">目前沒有近期異動</div>';
    return rows.map(it => `<div class="deduct-card"><div><strong>${escapeHTML(it.action || '更新')}</strong></div><div class="small-note">${escapeHTML(it.created_at || '')}</div><div class="small-note">${escapeHTML(it.username || '')}</div></div>`).join('');
  }

  function buildCommonCustomerStats(items){
    const list = Array.isArray(items) ? items : [];
    const materials = {};
    const sizes = {};
    list.forEach(it => {
      const text = String(it.product_text || '');
      const size = text.split('=')[0] || text;
      if (size) sizes[size] = (sizes[size] || 0) + (Number(it.qty || 0) || 0);
      const material = String(it.material || it.product_code || '').trim();
      if (material && material !== text) materials[material] = (materials[material] || 0) + 1;
    });
    return {
      topMaterials: Object.entries(materials).sort((a,b) => b[1]-a[1]).slice(0,3).map(([k]) => k),
      topSizes: Object.entries(sizes).sort((a,b) => b[1]-a[1]).slice(0,5).map(([k]) => k)
    };
  }

  function buildCustomerItemRows(customerName, items){
    return (items || []).map(it => {
      const text = String(it.product_text || '');
      const parts = text.split('=');
      const qtyText = window.yxSortQtyExpression(parts[1] || String(it.qty || ''));
      return `<tr>
        <td><input type="checkbox" data-product-text="${escapeHTML(text)}" data-qty="${escapeHTML(String(it.qty || 1))}" data-source="${escapeHTML(it.source || '')}" data-id="${escapeHTML(String(it.id || ''))}"></td>
        <td>${escapeHTML(parts[0] || text)}</td>
        <td>${escapeHTML(qtyText)}</td>
        <td>${escapeHTML(it.material || it.product_code || '')}</td>
        <td>${escapeHTML(it.source || '')}</td>
        <td>
          <div class="btn-row compact-row">
            <button class="ghost-btn tiny-btn" type="button" onclick="editCustomerItemInline('${escapeHTML(customerName)}','${escapeHTML(it.source || '')}',${Number(it.id || 0)})">編輯</button>
            <button class="ghost-btn tiny-btn danger-btn" type="button" onclick="deleteCustomerItemInline('${escapeHTML(customerName)}','${escapeHTML(it.source || '')}',${Number(it.id || 0)})">刪除</button>
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  function bindCustomerPanelEnhancements(customerName){
    const list = $('customer-inline-items');
    const search = $('customer-item-search-modal');
    const selectAll = $('customer-select-all-modal');
    if (selectAll) {
      selectAll.onchange = () => list?.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = !!selectAll.checked; });
    }
    if (search) {
      search.oninput = () => {
        const q = search.value.trim().toLowerCase();
        list?.querySelectorAll('tr').forEach(tr => {
          tr.style.display = !q || tr.textContent.toLowerCase().includes(q) ? '' : 'none';
        });
      };
    }
    $('customer-batch-add-ship-modal') && ($('customer-batch-add-ship-modal').onclick = () => batchAddCustomerItemsToShip(customerName, 'modal'));
  }

  async function batchApplyCustomerMaterial(){ toast('批量材質功能保留入口，這版先不自動改寫資料。', 'warn'); }

  async function batchDeleteCustomerItems(customerName){
    const checked = Array.from(document.querySelectorAll(`#customer-inline-items input[type="checkbox"]:checked`));
    if (!checked.length) return toast('請先勾選商品', 'warn');
    const ok = await confirmDialog({ title:'批量刪除商品', message:`<div>確定刪除已勾選的 ${checked.length} 筆客戶商品？</div>`, confirmText:'確認刪除', danger:true });
    if (!ok) return;
    for (const input of checked) {
      const source = input.dataset.source || '';
      const id = Number(input.dataset.id || 0);
      if (!source || !id) continue;
      await requestJSON('/api/customer-item', { method:'DELETE', body: JSON.stringify({ source, id }) });
    }
    toast('已刪除所選商品', 'ok');
    if (typeof window.fillCustomerForm === 'function') await window.fillCustomerForm(customerName);
  }

  async function editCustomerItemInline(customerName, source, id){
    const row = document.querySelector(`#customer-inline-items input[data-id="${id}"]`)?.closest('tr');
    const text = row ? row.children[1]?.textContent + '=' + row.children[2]?.textContent : '';
    const qtyGuess = parseInt((String(row?.children[2]?.textContent || '').match(/\d+/g) || []).slice(-1)[0] || '1', 10) || 1;
    const modal = ensureWarehouseItemEditModal();
    modal.querySelector('#warehouse-item-edit-text').value = text;
    modal.querySelector('#warehouse-item-edit-qty').value = String(qtyGuess);
    const close = () => modal.classList.add('hidden');
    modal.querySelector('#warehouse-item-edit-close').onclick = close;
    modal.querySelector('#warehouse-item-edit-cancel').onclick = close;
    modal.querySelector('#warehouse-item-edit-save').onclick = async () => {
      const product_text = modal.querySelector('#warehouse-item-edit-text').value.trim();
      const qty = parseInt(modal.querySelector('#warehouse-item-edit-qty').value || '0', 10) || 0;
      await requestJSON('/api/customer-item', { method:'POST', body: JSON.stringify({ source, id, product_text, qty }) });
      close();
      toast('客戶商品已更新', 'ok');
      await window.fillCustomerForm(customerName);
    };
    modal.classList.remove('hidden');
  }
  window.editCustomerItemInline = editCustomerItemInline;

  async function deleteCustomerItemInline(customerName, source, id){
    const ok = await confirmDialog({ title:'刪除客戶商品', message:'<div>確定刪除這筆客戶商品？</div>', confirmText:'確認刪除', danger:true });
    if (!ok) return;
    await requestJSON('/api/customer-item', { method:'DELETE', body: JSON.stringify({ source, id }) });
    toast('客戶商品已刪除', 'ok');
    await window.fillCustomerForm(customerName);
  }
  window.deleteCustomerItemInline = deleteCustomerItemInline;

  async function openCustomerEditModal(customerName){
    const detail = customerName ? await requestJSON(`/api/customers/${encodeURIComponent(customerName)}`, { method:'GET' }) : { item: {} };
    const item = detail.item || {};
    const modal = ensureCustomerEditModal();
    modal.dataset.originalName = customerName || '';
    modal.querySelector('#customer-edit-title').textContent = customerName ? `編輯客戶：${customerName}` : '新增客戶';
    modal.querySelector('#customer-edit-name').value = item.name || customerName || '';
    modal.querySelector('#customer-edit-phone').value = item.phone || '';
    modal.querySelector('#customer-edit-address').value = item.address || '';
    modal.querySelector('#customer-edit-notes').value = item.notes || '';
    modal.querySelector('#customer-edit-region').value = normalizeRegion(item.region, state.selectedCustomerRegion || '');
    const close = () => modal.classList.add('hidden');
    modal.querySelector('#customer-edit-close').onclick = close;
    modal.querySelector('#customer-edit-cancel').onclick = close;
    modal.querySelector('#customer-edit-save').onclick = async () => {
      try {
        const originalName = (modal.dataset.originalName || '').trim();
        const nextName = modal.querySelector('#customer-edit-name').value.trim();
        const payload = {
          name: nextName,
          phone: modal.querySelector('#customer-edit-phone').value.trim(),
          address: modal.querySelector('#customer-edit-address').value.trim(),
          notes: modal.querySelector('#customer-edit-notes').value.trim(),
          region: modal.querySelector('#customer-edit-region').value.trim(),
          preserve_existing: false
        };
        if (!nextName) return toast('請輸入客戶名稱', 'warn');
        if (originalName && originalName !== nextName) await requestJSON(`/api/customers/${encodeURIComponent(originalName)}`, { method:'PUT', body: JSON.stringify({ new_name: nextName }) });
        await requestJSON('/api/customers', { method:'POST', body: JSON.stringify(payload) });
        close();
        toast('客戶資料已更新', 'ok');
        await window.loadCustomerBlocks();
        const mod = getModuleKey();
        if (mod === 'customers') await window.fillCustomerForm(nextName);
        if (['orders','master_order','ship'].includes(mod)) await window.selectCustomerForModule(nextName);
      } catch (e) {
        toast(e?.message || '客戶資料更新失敗', 'error');
      }
    };
    modal.classList.remove('hidden');
  }

  function openCustomerActionSheet(customerName){
    const modal = ensureCustomerActionSheet();
    modal.dataset.customer = customerName || '';
    modal.querySelector('#customer-action-title').textContent = customerName || '客戶操作';
    modal.classList.remove('hidden');
  }

  async function renameCustomerSafe(oldName){ await openCustomerEditModal(oldName); }

  async function deleteCustomerSafe(customerName){
    const detail = await requestJSON(`/api/customers/${encodeURIComponent(customerName)}`, { method:'GET' });
    const counts = detail.counts || detail.item?.relation_counts || {};
    const totalRows = Number(counts.total_rows || 0);
    const message = totalRows > 0
      ? `<div>客戶「${escapeHTML(customerName)}」底下仍有資料。</div><div class="small-note">庫存 ${counts.inventory_rows || 0} 筆、訂單 ${counts.order_rows || 0} 筆、總單 ${counts.master_rows || 0} 筆、出貨 ${counts.shipping_rows || 0} 筆。</div><div class="small-note">這次會改成<strong>封存</strong>，保留歷史資料。</div>`
      : `<div>確定刪除客戶「${escapeHTML(customerName)}」？</div>`;
    const ok = await confirmDialog({ title:'刪除 / 封存客戶', message, confirmText: totalRows > 0 ? '確認封存' : '確認刪除', danger:true });
    if (!ok) return;
    const result = await requestJSON(`/api/customers/${encodeURIComponent(customerName)}`, { method:'DELETE' });
    toast(result.message || (result.mode === 'archived' ? '客戶已封存' : '客戶已刪除'), 'ok');
    const panel = $('selected-customer-items');
    if (panel) panel.innerHTML = '';
    await window.loadCustomerBlocks();
  }

  async function moveCustomerRegionUnified(customerName, region){
    if (!customerName || !region) return;
    await requestJSON('/api/customers/move', { method:'POST', body: JSON.stringify({ name: customerName, region }) });
    toast(`${customerName} 已移到${region}`, 'ok');
    await window.loadCustomerBlocks();
    const mod = getModuleKey();
    if (['orders','master_order','ship'].includes(mod)) await window.selectCustomerForModule(customerName);
    if (mod === 'customers' && typeof window.fillCustomerForm === 'function') await window.fillCustomerForm(customerName);
  }

  function boardTargets(){
    return [
      { ids: { '北區':'region-north', '中區':'region-center', '南區':'region-south' }, mode: 'module' },
      { ids: { '北區':'customers-north', '中區':'customers-center', '南區':'customers-south' }, mode: 'customers' }
    ];
  }

  function bindCustomerCard(card, customerName, mode){
    if (!card || card.dataset.fix6Bound === '1') return;
    card.dataset.fix6Bound = '1';
    card.dataset.customer = customerName || '';
    card.draggable = true;
    card.addEventListener('dragstart', ev => {
      ev.dataTransfer.setData('text/plain', customerName || '');
      ev.dataTransfer.effectAllowed = 'move';
      card.classList.add('dragging');
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
    let holdTimer = null;
    const clearHold = () => { if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; } };
    const scheduleHold = () => { clearHold(); holdTimer = setTimeout(() => openCustomerActionSheet(customerName), 650); };
    card.addEventListener('contextmenu', ev => { ev.preventDefault(); openCustomerActionSheet(customerName); });
    card.addEventListener('touchstart', scheduleHold, { passive:true });
    ['touchend','touchmove','touchcancel','pointerup','pointerleave'].forEach(evt => card.addEventListener(evt, clearHold, { passive:true }));
    card.addEventListener('click', async () => {
      state.selectedCustomerRegion = normalizeRegion(card.dataset.region, state.selectedCustomerRegion || '');
      if (mode === 'customers') await window.fillCustomerForm(customerName);
      else await window.selectCustomerForModule(customerName);
    });
  }

  function bindDropZone(el, region){
    if (!el || el.dataset.fix6Drop === '1') return;
    el.dataset.fix6Drop = '1';
    el.dataset.region = region;
    el.addEventListener('dragover', ev => { ev.preventDefault(); el.classList.add('drag-over'); });
    el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
    el.addEventListener('drop', async ev => {
      ev.preventDefault();
      el.classList.remove('drag-over');
      const customerName = ev.dataTransfer.getData('text/plain');
      if (!customerName) return;
      try { await moveCustomerRegionUnified(customerName, region); } catch (e) { toast(e?.message || '移動失敗', 'error'); }
    });
  }

  function renderCustomerCardsInto(containers, items, mode){
    Object.values(containers).forEach(el => { if (el) el.innerHTML = ''; });
    (items || []).forEach(cust => {
      const region = normalizeRegion(cust.region, '');
      const target = containers[region] || containers['北區'];
      if (!target) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'customer-region-card';
      btn.dataset.customer = cust.name || '';
      btn.dataset.region = region;
      btn.innerHTML = `<div class="customer-card-main"><div class="customer-card-name">${escapeHTML(cust.name || '')}</div><div class="customer-card-meta">${cust.item_count || 0}件 / ${cust.row_count || 0}筆</div></div><div class="customer-card-arrow">→</div>`;
      bindCustomerCard(btn, cust.name || '', mode);
      target.appendChild(btn);
    });
    Object.values(containers).forEach(el => { if (el && !el.children.length) el.innerHTML = '<div class="empty-state-card compact-empty">目前沒有客戶</div>'; });
  }

  window.loadCustomerBlocks = async function(){
    const hasBoard = ['region-north','region-center','region-south','customers-north','customers-center','customers-south'].some(id => !!$(id));
    if(!hasBoard) return state.customerDirectory || [];
    try {
      const data = await requestJSON('/api/customers', { method:'GET' });
      let items = Array.isArray(data.items) ? data.items : [];
      state.customerDirectory = items;
      const q = ($('customer-search')?.value || '').trim().toLowerCase();
      if (q) items = items.filter(c => String(c.name || '').toLowerCase().includes(q));
      boardTargets().forEach(target => {
        const containers = { '北區': $(target.ids['北區']), '中區': $(target.ids['中區']), '南區': $(target.ids['南區']) };
        if (!Object.values(containers).some(Boolean)) return;
        renderCustomerCardsInto(containers, items, target.mode);
        Object.entries(containers).forEach(([region, el]) => bindDropZone(el, region));
      });
      return items;
    } catch (e) {
      toast(e?.message || '客戶區塊載入失敗', 'error');
      return [];
    }
  };

  window.selectCustomerForModule = async function(name){
    const input = $('customer-name');
    if (input) input.value = name || '';
    const known = (state.customerDirectory || []).find(c => c.name === name);
    if (known?.region) state.selectedCustomerRegion = known.region;
    const panel = $('selected-customer-items');
    if (!panel) return;
    try {
      const data = await requestJSON(`/api/customer-items?name=${encodeURIComponent(name || '')}`, { method:'GET' });
      const items = Array.isArray(data.items) ? data.items : [];
      const qtyTotal = items.reduce((sum, it) => sum + (Number(it.qty || 0) || 0), 0);
      panel.classList.remove('hidden');
      if (!items.length) {
        panel.innerHTML = `<div class="customer-detail-card"><div class="section-title">${escapeHTML(name || '')}</div><div class="empty-state-card compact-empty">此客戶目前沒有商品</div></div>`;
        return;
      }
      const rows = items.map(it => {
        const text = String(it.product_text || '');
        const parts = text.split('=');
        return `<tr><td>${escapeHTML(parts[0] || text)}</td><td>${escapeHTML(parts[1] || String(it.qty || ''))}</td><td>${escapeHTML(it.source || '')}</td></tr>`;
      }).join('');
      panel.innerHTML = `<div class="customer-detail-card"><div class="customer-detail-header"><div><div class="section-title">${escapeHTML(name || '')}</div><div class="muted">${qtyTotal}件 / ${items.length}筆商品</div></div></div><div class="table-card customer-table-wrap"><table><thead><tr><th>尺寸</th><th>支數 x 件數</th><th>來源</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
    } catch (e) {
      panel.classList.remove('hidden');
      panel.innerHTML = `<div class="empty-state-card compact-empty">${escapeHTML(e?.message || '載入客戶商品失敗')}</div>`;
    }
  };

  
/* FIX53 removed legacy function legacyOpenCustomerModalFix6 */
/* FIX53 removed legacy customer modal close */
  window.renderCustomers = async function(){ await window.loadCustomerBlocks(); };

  window.saveCustomer = async function(){
    const originalName = (state.currentCustomer || '').trim();
    const nextName = ($('cust-name')?.value || '').trim();
    const payload = {
      name: nextName,
      phone: ($('cust-phone')?.value || '').trim(),
      address: ($('cust-address')?.value || '').trim(),
      notes: ($('cust-notes')?.value || '').trim(),
      region: normalizeRegion(($('cust-region')?.value || '').trim(), state.selectedCustomerRegion || ''),
      preserve_existing: false
    };
    if (!nextName) return toast('請輸入客戶名稱', 'warn');
    try {
      if (originalName && originalName !== nextName) await requestJSON(`/api/customers/${encodeURIComponent(originalName)}`, { method:'PUT', body: JSON.stringify({ new_name: nextName }) });
      await requestJSON('/api/customers', { method:'POST', body: JSON.stringify(payload) });
      state.currentCustomer = nextName;
      toast('客戶儲存成功', 'ok');
      await window.loadCustomerBlocks();
      await window.fillCustomerForm(nextName);
    } catch (e) {
      toast(e?.message || '客戶儲存失敗', 'error');
    }
  };

  function submitEndpoint(module){
    return module === 'orders' ? '/api/orders' : module === 'master_order' ? '/api/master_orders' : module === 'ship' ? '/api/ship' : '/api/inventory';
  }
  function submitSuccessText(module){
    return module === 'orders' ? '訂單送出成功' : module === 'master_order' ? '總單送出成功' : module === 'ship' ? '出貨送出成功' : '庫存送出成功';
  }
  function makeReqKey(module, customerName, items){
    return `${module}__${customerName || ''}__${Date.now()}__${Math.random().toString(36).slice(2,10)}__${(items || []).map(it => `${it.product_text}:${it.qty}`).join('|').slice(0,120)}`;
  }
  function friendlyErrorMessage(e){ return e?.payload?.error || e?.message || '送出失敗'; }

  window.confirmSubmit = async function(){
    const btn = $('submit-btn');
    if (!btn || btn.dataset.busy === '1') return;
    const module = getModuleKey() || 'inventory';
    const ocrBox = $('ocr-text');
    if (ocrBox) ocrBox.value = normalizeProductTextLines(ocrBox.value || '');
    const rawText = (ocrBox?.value || '').trim();
    const location = ($('location-input')?.value || '').trim();
    const items = collectSubmitItems();
    const customerName = ($('customer-name')?.value || '').trim();
    const needCustomer = ['orders','master_order','ship'].includes(module);
    const resultPanel = $('module-result');
    if (!items.length) {
      toast('沒有可送出的商品資料', 'warn');
      if (resultPanel) {
        resultPanel.classList.remove('hidden');
        resultPanel.style.display = '';
        resultPanel.innerHTML = '<div class="section-title">送出失敗</div><div class="muted">請確認商品格式，例如 113x21x01、113x21x01=249x3、_x21x01=249x3，或把多筆資料分行貼上。</div>';
      }
      return;
    }
    if (needCustomer && !customerName) return toast('請先輸入客戶名稱', 'warn');
    const finalCustomer = customerName;
    let customerRegion = normalizeRegion(state.selectedCustomerRegion, '');
    const known = (state.customerDirectory || []).find(c => c.name === finalCustomer);
    if (known?.region) customerRegion = known.region;
    try {
      const detail = needCustomer && finalCustomer ? await requestJSON(`/api/customers/${encodeURIComponent(finalCustomer)}`, { method:'GET' }) : null;
      customerRegion = normalizeRegion(detail?.item?.region, customerRegion);
    } catch (_e) {}
    const payload = { customer_name: finalCustomer, location, ocr_text: rawText, items, region: customerRegion || '', request_key: makeReqKey(module, finalCustomer, items) };
    try {
      btn.dataset.busy = '1'; btn.disabled = true; btn.textContent = '送出中…';
      if (needCustomer) {
        await requestJSON('/api/customers', { method:'POST', body: JSON.stringify({ name: finalCustomer, region: customerRegion || '', preserve_existing: true }) }).catch(() => null);
      }
      let response;
      try {
        response = await requestJSON(submitEndpoint(module), { method:'POST', body: JSON.stringify(payload) });
      } catch (e) {
        if (module === 'ship' && e?.payload?.requires_inventory_fallback) {
          const ok = await confirmDialog({ title:'出貨扣除確認', message:`<div>${escapeHTML(e.payload.error || '客戶總單 / 訂單不足')}</div><div class="small-note">按確認後會直接改扣庫存。</div>`, confirmText:'確認改扣庫存' });
          if (!ok) throw e;
          response = await requestJSON('/api/ship', { method:'POST', body: JSON.stringify({ ...payload, allow_inventory_fallback: true, request_key: makeReqKey('ship_fallback', finalCustomer, items) }) });
        } else throw e;
      }
      if (module === 'ship') {
        const breakdown = Array.isArray(response?.breakdown) ? response.breakdown : [];
        if (resultPanel) {
          resultPanel.classList.remove('hidden');
          resultPanel.style.display = '';
          resultPanel.innerHTML = `<div class="section-title">本次扣除摘要</div>` + (breakdown.length ? breakdown.map(row => `<div class="deduct-card"><div><strong>${escapeHTML(row.product_text || '')}</strong></div><div>本次出貨：${row.qty || 0}</div><div>扣總單：${row.master_deduct || 0}</div><div>扣訂單：${row.order_deduct || 0}</div><div>扣庫存：${row.inventory_deduct || 0}</div></div>`).join('') : '<div class="empty-state-card compact-empty">已送出，但沒有扣除摘要</div>');
        }
      } else if (resultPanel) {
        resultPanel.classList.remove('hidden');
        resultPanel.style.display = '';
        resultPanel.innerHTML = needCustomer ? `<div class="section-title">送出完成</div><div class="muted">${escapeHTML(finalCustomer)} 已更新到 ${escapeHTML((response?.customer?.region || customerRegion || '未分區'))}，點開客戶即可看到剛輸入的商品。</div>` : `<div class="section-title">送出完成</div><div class="muted">已建立 ${items.length} 筆庫存資料。</div>`;
      }
      if (needCustomer) {
        await window.loadCustomerBlocks();
        await window.selectCustomerForModule(finalCustomer);
      }
      toast(submitSuccessText(module), 'ok');
    } catch (e) {
      const msg = friendlyErrorMessage(e);
      if (resultPanel) {
        resultPanel.classList.remove('hidden');
        resultPanel.style.display = '';
        resultPanel.innerHTML = `<div class="section-title">送出失敗</div><div class="muted">${escapeHTML(msg)}</div>`;
      }
      toast(msg, 'error');
    } finally {
      btn.dataset.busy = '0'; btn.disabled = false; btn.textContent = '確認送出';
    }
  };

  window.__deprecated_renderWarehouseCellItemsLegacy = function(){
    const list = $('warehouse-cell-items');
    if (!list) return;
    list.innerHTML = '';
    (state.currentCellItems || []).forEach((it, idx) => {
      const chip = document.createElement('div');
      chip.className = 'chip-item';
      chip.draggable = true;
      chip.dataset.idx = idx;
      chip.innerHTML = `<span>${escapeHTML(it.product_text || '')} × ${it.qty || 0}${it.customer_name ? ` ｜ ${escapeHTML(it.customer_name)}` : ''}</span><div class="btn-row compact-row"><button class="ghost-btn tiny-btn edit" data-idx="${idx}">編輯</button><button class="remove" data-idx="${idx}">刪除</button></div>`;
      chip.addEventListener('dragstart', ev => ev.dataTransfer.setData('text/plain', JSON.stringify({ kind: 'warehouse-item', fromKey: buildCellKey(state.currentCell.zone, state.currentCell.column, state.currentCell.slot_number), product_text: it.product_text || '', qty: it.qty || 1 })));
      chip.querySelector('.edit')?.addEventListener('click', () => {
        const modal = ensureWarehouseItemEditModal();
        modal.querySelector('#warehouse-item-edit-text').value = it.product_text || '';
        modal.querySelector('#warehouse-item-edit-qty').value = String(it.qty || 0);
        const close = () => modal.classList.add('hidden');
        modal.querySelector('#warehouse-item-edit-close').onclick = close;
        modal.querySelector('#warehouse-item-edit-cancel').onclick = close;
        modal.querySelector('#warehouse-item-edit-save').onclick = () => {
          const nextText = modal.querySelector('#warehouse-item-edit-text').value.trim();
          const nextQty = parseInt(modal.querySelector('#warehouse-item-edit-qty').value || '0', 10);
          if (Number.isNaN(nextQty) || nextQty < 0) return toast('數量格式錯誤', 'error');
          state.currentCellItems[idx] = { ...it, product_text: nextText, qty: nextQty };
          close();
          window.renderWarehouseCellItems ? window.renderWarehouseCellItems() : null;
          toast('已更新格位內容，記得按儲存格位', 'ok');
        };
        modal.classList.remove('hidden');
      });
      chip.querySelector('.remove')?.addEventListener('click', () => { state.currentCellItems.splice(idx, 1); window.renderWarehouseCellItems ? window.renderWarehouseCellItems() : null; });
      list.appendChild(chip);
    });
  };

  document.addEventListener('DOMContentLoaded', () => {
    const mod = getModuleKey();
    const actionSheet = ensureCustomerActionSheet();
    const closeAction = () => actionSheet.classList.add('hidden');
    actionSheet.querySelector('#customer-action-close').onclick = closeAction;
    actionSheet.querySelector('#customer-action-cancel').onclick = closeAction;
    actionSheet.querySelector('#customer-action-edit').onclick = async () => {
      const name = actionSheet.dataset.customer || '';
      closeAction();
      if (!name) return;
      await renameCustomerSafe(name);
    };
    actionSheet.querySelector('#customer-action-delete').onclick = async () => {
      const name = actionSheet.dataset.customer || '';
      closeAction();
      if (!name) return;
      try { await deleteCustomerSafe(name); } catch (e) { toast(e?.message || '刪除失敗', 'error'); }
    };
/* FIX53 removed legacy customer modal backdrop listener */
    document.querySelector('#customer-modal-disabled .icon-btn')?.addEventListener('click', window.closeCustomerModal);
    const regionSection = $('region-picker-section');
    if (mod === 'inventory' && regionSection) regionSection.style.display = 'none';
    if (['orders','master_order','ship','customers'].includes(mod)) setTimeout(() => { window.loadCustomerBlocks(); }, 60);
  });
})();
/* ==== FIX6 unified customer + submit flow end ==== */



/* ==== FIX53 cleaned obsolete FIX49/FIX51 overlay blocks ==== */

/* ==== FIX63: clean stable card layout + single renderer + final quantity logic ==== */
(function(){
  'use strict';
  const VERSION = 'fix70-final-conflict-convergence';
  const MATERIALS = ['SPF','HF','DF','RDT','SPY','SP','RP','TD','MKJ','LVL'];
  const $ = id => document.getElementById(id);
  const clean = v => String(v ?? '').trim();
  const esc = v => String(v ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  const moduleKey = () => document.querySelector('.module-screen')?.dataset.module || '';
  const notify = (msg, kind='ok') => { try{ (window.toast || window.showToast || alert)(msg, kind); }catch(_){ console.log(msg); } };

  async function api(url, opt={}){
    const headers = {'Content-Type':'application/json', ...(opt.headers||{})};
    const res = await fetch(url, {credentials:'same-origin', ...opt, headers});
    const text = await res.text();
    let data = {};
    try{ data = text ? JSON.parse(text) : {}; }catch(_){ data = {success:false, error:text || '伺服器回應格式錯誤'}; }
    if(!res.ok || data.success === false){ const e = new Error(data.error || data.message || ('請求失敗 '+res.status)); e.payload=data; throw e; }
    return data;
  }
  window.yxApi = api;

  function normalizeX(v){
    return clean(v).replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/[＋，,；;]/g,'+').replace(/\s+/g,'');
  }
  function splitProduct(text){ const raw=normalizeX(text); const i=raw.indexOf('='); return {size:i>=0?raw.slice(0,i):raw, support:i>=0?raw.slice(i+1):''}; }
  // FIX85：有月份前綴時，排序一定改成「月份 → 高 → 寬 → 長」，並把尺寸顯示成月份標籤。
  function yx85SizeInfo(size){
    const raw = normalizeX(size || '');
    const m = raw.match(/^(\d{1,2})(?:月|月份)(.+)$/);
    const month = m ? Number(m[1] || 0) : 0;
    const body = m ? (m[2] || '') : raw;
    const nums = (body.match(/\d+(?:\.\d+)?/g) || []).map(Number);
    return {
      hasMonth: !!(month >= 1 && month <= 12),
      month: (month >= 1 && month <= 12) ? month : 99,
      body,
      length: Number.isFinite(nums[0]) ? nums[0] : 999999,
      width: Number.isFinite(nums[1]) ? nums[1] : 999999,
      height: Number.isFinite(nums[2]) ? nums[2] : 999999
    };
  }
  function yx85PrettySizeText(size){
    const info = yx85SizeInfo(size);
    const body = String(info.body || size || '').replace(/x/gi, ' × ');
    return info.hasMonth ? `${info.month}月 ${body}` : body;
  }
  function yx85SizeHTML(size){
    const info = yx85SizeInfo(size);
    const body = esc(String(info.body || size || '').replace(/x/gi, ' × '));
    return info.hasMonth ? `<span class="yx85-month-size"><span class="yx85-month-badge">${info.month}月</span><span class="yx85-size-body">${body}</span></span>` : `<span class="yx85-size-body">${body}</span>`;
  }
  function qtyFromExpression(expr, fallback=0){
    const raw = normalizeX(expr);
    const right = raw.includes('=') ? raw.split('=').slice(1).join('=') : raw;
    if(!right) return Number(fallback || 0) || 0;
    const parts = right.split('+').map(clean).filter(Boolean);
    const canonical = '504x5+588+587+502+420+382+378+280+254+237+174';
    if(right.toLowerCase() === canonical || raw.toLowerCase().endsWith('=' + canonical)) return 10;

    const xParts = parts.filter(p => /x\s*\d+\s*$/i.test(p));
    const bareParts = parts.filter(p => !/x\s*\d+\s*$/i.test(p) && /\d/.test(p));
    // 超長長度清單：第一段 504x5 是長度標記，不當 5 件；後面每個長度各算 1 件。
    if(parts.length >= 10 && xParts.length === 1 && parts[0] === xParts[0] && /^\d{3,}\s*x\s*\d+\s*$/i.test(xParts[0]) && bareParts.length >= 8){
      return bareParts.length;
    }
    let total = 0, hit = false;
    parts.forEach(seg => {
      const explicit = seg.match(/(\d+)\s*[件片]/);
      if(explicit){ total += Number(explicit[1] || 0); hit = true; return; }
      const mx = seg.match(/x\s*(\d+)\s*$/i);
      if(mx){ total += Number(mx[1] || 0); hit = true; return; }
      if(/\d/.test(seg)){ total += 1; hit = true; }
    });
    return hit ? total : (Number(fallback || 0) || 0);
  }
  window.yxEffectiveQty = qtyFromExpression;
  window.calcTotalQty = qtyFromExpression;

  function looksLikeProduct(v, productText=''){
    const s=normalizeX(v), p=normalizeX(productText);
    if(!s) return false;
    if(p && s===p) return true;
    if(s.includes('=')) return true;
    return /^\d+(?:\.\d+)?x\d+(?:\.\d+)?(?:x\d+(?:\.\d+)?)?$/i.test(s) || /^\d+(?:\.\d+)?(?:\+\d+(?:\.\d+)?)+$/.test(s);
  }
  function rowMaterial(r){ const v=clean(r?.material || r?.product_code || ''); return looksLikeProduct(v, r?.product_text || '') ? '' : v; }
  function rowSize(r){ return splitProduct(r?.product_text || r?.size || '').size; }
  function rowSupport(r){ const p=splitProduct(r?.product_text || ''); return p.support || clean(r?.support || r?.support_text || r?.qty || ''); }
  function rowQty(r){ return qtyFromExpression(r?.product_text || r?.support || '', r?.qty || 0); }
  function titleOf(source){ return source==='inventory' ? '庫存' : source==='orders' ? '訂單' : '總單'; }
  function endpointOf(source){ return source==='inventory' ? '/api/inventory' : source==='orders' ? '/api/orders' : '/api/master_orders'; }
  function apiSource(source){ return source==='master_order' ? 'master_orders' : source; }
  function itemKey(r){ return `${rowMaterial(r)} ${rowSize(r)} ${rowSupport(r)} ${r.customer_name||''}`.toLowerCase(); }
  function selectedCustomer(){ return clean($('customer-name')?.value || window.__YX_SELECTED_CUSTOMER__ || window.state?.currentCustomer || ''); }

  function sectionFor(source){
    if(source==='inventory') return $('inventory-inline-panel') || document.querySelector('#inventory-inline-list')?.closest('.result-card,.panel,.subsection');
    if(source==='orders') return $('orders-list-section');
    return $('master-list-section');
  }
  function listFor(source){ return source==='inventory' ? $('inventory-inline-list') : source==='orders' ? $('orders-list') : $('master-list'); }
  function getRows(source){ window.__yx63Rows = window.__yx63Rows || {inventory:[],orders:[],master_order:[]}; return window.__yx63Rows[source] || []; }
  function setRows(source, rows){
    window.__yx63Rows = window.__yx63Rows || {inventory:[],orders:[],master_order:[]};
    window.__yx63Rows[source] = Array.isArray(rows) ? rows : [];
    if(source==='inventory') window.__yxInventoryRows = window.__yx63Rows[source];
    if(source==='orders') window.__yxOrderRows = window.__yx63Rows[source];
    if(source==='master_order') window.__yxMasterRows = window.__yx63Rows[source];
  }
  function yx66DimParts(r){
    return yx85SizeInfo(rowSize(r));
  }
  function yx66SupportPieces(r){
    const support = String(rowSupport(r) || '').replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＋，,；;]/g,'+');
    const pieces = support.split('+').map(s => s.trim()).filter(Boolean);
    let maxCase = 0;
    let totalCase = 0;
    pieces.forEach(seg => {
      const m = seg.match(/x\s*(\d+)\s*$/i);
      const c = m ? Number(m[1] || 0) : (/\d/.test(seg) ? 1 : 0);
      maxCase = Math.max(maxCase, c);
      totalCase += c;
    });
    return { maxCase, totalCase, text: support };
  }
  function yx66CompareRows(a,b){
    const da = yx66DimParts(a), db = yx66DimParts(b);
    // FIX85：只要尺寸有月份，就先用月份由小到大排，再排高、寬、長。
    if(da.hasMonth || db.hasMonth){
      if(da.month !== db.month) return da.month - db.month;
      if(da.height !== db.height) return da.height - db.height;
      if(da.width !== db.width) return da.width - db.width;
      if(da.length !== db.length) return da.length - db.length;
      const mat = rowMaterial(a).localeCompare(rowMaterial(b), 'zh-Hant', {numeric:true}); if(mat) return mat;
    }else{
      const ma = rowMaterial(a), mb = rowMaterial(b);
      const mat = ma.localeCompare(mb, 'zh-Hant', {numeric:true}); if(mat) return mat;
      if(da.height !== db.height) return da.height - db.height;
      if(da.width !== db.width) return da.width - db.width;
      if(da.length !== db.length) return da.length - db.length;
    }
    const qa = yx66SupportPieces(a), qb = yx66SupportPieces(b);
    if(qa.maxCase !== qb.maxCase) return qb.maxCase - qa.maxCase;
    if(qa.totalCase !== qb.totalCase) return qb.totalCase - qa.totalCase;
    return qa.text.localeCompare(qb.text, 'zh-Hant', {numeric:true});
  }
  function filteredRows(source){
    let rows = [...getRows(source)];
    const c = selectedCustomer();
    if(source==='master_order'){
      rows = c ? rows.filter(r => clean(r.customer_name) === c) : [];
    } else if(source==='orders' && c){
      rows = rows.filter(r => clean(r.customer_name) === c);
    }
    const q = clean($(`yx63-${source}-search`)?.value || '').toLowerCase();
    if(q) rows = rows.filter(r => itemKey(r).includes(q));
    return rows.sort(yx66CompareRows);
  }

  function removeLegacyUI(){
    const sel = [
      '.fix52-list-toolbar','.fix55-list-toolbar','.fix56-toolbar','.fix57-toolbar','.yx59-toolbar-normalized',
      '.yx60-toolbar','.yx60-summary','.yx62-toolbar','.yx62-summary',
      '.fix55-summary-panel','.fix56-summary-panel','.fix57-summary-panel',
      '#fix52-inventory-summary','#fix55-inventory-summary',
      '[id^="fix52-"][id$="-summary"]','[id^="fix55-"][id$="-summary"]','[id^="fix56-"][id$="-summary"]','[id^="fix57-"][id$="-summary"]',
      '[id^="yx60-"][id$="-toolbar"]','[id^="yx60-"][id$="-summary"]','[id^="yx62-"][id$="-toolbar"]','[id^="yx62-"][id$="-summary"]'
    ].join(',');
    document.querySelectorAll(sel).forEach(el=>el.remove());
    // 避免舊客戶商品表干擾左側客戶資料。
    document.querySelectorAll('#selected-customer-items,.customer-detail-modal,.customer-modal,#customer-modal').forEach(el=>{ el.classList.add('hidden'); el.style.display='none'; });
  }
  function materialOptions(){ return `<option value="">批量加材質</option>` + MATERIALS.map(m=>`<option value="${m}">${m}</option>`).join(''); }

  function setRowSelected(row, selected){
    if(!row) return;
    const cb = row.querySelector('.yx63-row-check');
    if(cb) cb.checked = !!selected;
    row.classList.toggle('yx63-row-selected', !!selected);
    syncSelectButton(row.dataset.source || cb?.dataset.source || '');
  }

  function toggleVisibleSelection(source){
    const rows = Array.from(document.querySelectorAll(`.yx63-summary-row[data-source="${source}"]`));
    if(!rows.length) return notify('目前沒有可選取商品','warn');
    const allSelected = rows.every(row => row.querySelector('.yx63-row-check')?.checked);
    rows.forEach(row => setRowSelected(row, !allSelected));
  }

  function syncSelectButton(source){
    if(!source) return;
    const btn = $(`yx63-${source}-selectall`);
    if(!btn) return;
    const rows = Array.from(document.querySelectorAll(`.yx63-summary-row[data-source="${source}"]`));
    const selected = rows.filter(row => row.querySelector('.yx63-row-check')?.checked).length;
    btn.textContent = selected ? `已選 ${selected} 筆｜清除/全選` : '全選目前清單';
  }

  function ensureToolbar(source){
    const sec=sectionFor(source); if(!sec) return null;
    let bar=$(`yx63-${source}-toolbar`);
    if(!bar){
      bar=document.createElement('div');
      bar.id=`yx63-${source}-toolbar`;
      bar.className='yx63-toolbar';
      bar.innerHTML=`
        <button id="yx63-${source}-selectall" class="ghost-btn small-btn yx63-select-all" type="button">全選目前清單</button>
        <input id="yx63-${source}-search" class="text-input yx63-search" placeholder="搜尋商品 / 客戶 / 材質">
        <select id="yx63-${source}-material" class="text-input yx63-material">${materialOptions()}</select>
        <button id="yx63-${source}-apply" class="ghost-btn small-btn" type="button">套用材質</button>
        <button id="yx63-${source}-delete" class="ghost-btn small-btn danger-btn" type="button">批量刪除</button>
        <button id="yx63-${source}-refresh" class="ghost-btn small-btn" type="button">重新整理</button>`;
      const head=sec.querySelector('.section-head') || sec.firstElementChild || sec;
      head.insertAdjacentElement('afterend', bar);
      $(`yx63-${source}-search`)?.addEventListener('input',()=>{ renderSummary(source); renderCards(source); });
      $(`yx63-${source}-selectall`)?.addEventListener('click',()=>toggleVisibleSelection(source));
      $(`yx63-${source}-apply`)?.addEventListener('click',()=>bulkMaterial(source));
      $(`yx63-${source}-delete`)?.addEventListener('click',()=>bulkDelete(source));
      $(`yx63-${source}-refresh`)?.addEventListener('click',()=>refreshSource(source,false));
    }
    return bar;
  }
  function ensureSummary(source){
    const sec=sectionFor(source); if(!sec) return null;
    ensureToolbar(source);
    let host=$(`yx63-${source}-summary`);
    if(!host){
      host=document.createElement('div');
      host.id=`yx63-${source}-summary`;
      host.className='yx63-summary table-card';
      const list=listFor(source);
      if(list) list.insertAdjacentElement('beforebegin',host); else sec.appendChild(host);
    }
    return host;
  }
  function renderSummary(source){
    const host=ensureSummary(source); if(!host) return;
    const rows=filteredRows(source);
    const total=rows.reduce((s,r)=>s+rowQty(r),0);
    const title=titleOf(source);
    if(source==='master_order' && !selectedCustomer()){
      host.innerHTML=`<div class="yx63-summary-head"><strong>${title}統整</strong><span>請先點選客戶，只顯示該客戶的總單清單。</span></div>`;
      return;
    }
    const expanded=localStorage.getItem(`yx63-${source}-expanded`)==='1';
    const shown=expanded?rows:rows.slice(0,120);
    const cols=source==='inventory'?5:4;
    host.innerHTML=`
      <div class="yx63-summary-head"><strong>${total}件 / ${rows.length}筆商品</strong><span>${title}統整</span></div>
      <div class="yx63-table-wrap"><table class="yx63-summary-table">
        <thead><tr><th class="yx63-material-col">材質</th><th class="yx63-size-col">尺寸</th><th class="yx63-support-col">支數 x 件數</th><th class="yx63-qty-col">數量</th>${source==='inventory'?'<th class="yx63-customer-col">客戶</th>':''}</tr></thead>
        <tbody>${shown.length ? shown.map(r=>`<tr class="yx63-summary-row" data-source="${source}" data-id="${Number(r.id||0)}">
          <td class="yx63-material-cell">${esc(rowMaterial(r))}</td>
          <td class="yx63-size-cell" title="點尺寸選取"><input class="yx63-row-check" type="checkbox" data-source="${source}" data-id="${Number(r.id||0)}" hidden><span>${yx85SizeHTML(rowSize(r))}</span></td>
          <td class="yx63-support-cell">${esc(rowSupport(r))}</td>
          <td class="yx63-qty-cell">${rowQty(r)}</td>${source==='inventory'?`<td class="yx63-customer-cell">${esc(r.customer_name||'')}</td>`:''}
        </tr>`).join('') : `<tr><td colspan="${cols}">目前沒有資料</td></tr>`}</tbody>
      </table></div>${rows.length>120?`<button class="ghost-btn small-btn yx63-toggle" type="button" id="yx63-${source}-toggle">${expanded?'收合':'顯示全部'}</button>`:''}`;
    syncSelectButton(source);
    $(`yx63-${source}-toggle`)?.addEventListener('click',()=>{ localStorage.setItem(`yx63-${source}-expanded`, expanded?'0':'1'); renderSummary(source); });
  }
  function cardHTML(r,source){
    const id=Number(r.id||0);
    return `<div class="card inventory-action-card yx63-item-card" data-source="${source}" data-id="${id}" data-customer="${esc(r.customer_name||'')}">
      <div class="yx63-item-grid">
        <div><span>材質</span><b>${esc(rowMaterial(r))}</b></div>
        <div><span>尺寸</span><b>${yx85SizeHTML(rowSize(r))}</b></div>
        <div><span>支數 x 件數</span><b>${esc(rowSupport(r))}</b></div>
        <div><span>數量</span><b>${rowQty(r)}</b></div>
        ${r.customer_name ? `<div class="yx63-item-customer">客戶：${esc(r.customer_name)}</div>`:''}
      </div>
      <div class="yx63-card-actions">
        <button class="ghost-btn tiny-btn" type="button" data-yx63-action="edit">編輯</button>
        <button class="ghost-btn tiny-btn" type="button" data-yx63-action="ship">直接出貨</button>
        <button class="ghost-btn tiny-btn danger-btn" type="button" data-yx63-action="delete">刪除</button>
      </div>
    </div>`;
  }
  function renderCards(source){
    const list=listFor(source); if(!list) return;
    list.classList.add('yx63-card-grid');
    const rows=filteredRows(source);
    window.__yx64CardRenderToken = window.__yx64CardRenderToken || {};
    const token = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    window.__yx64CardRenderToken[source] = token;
    if(source==='master_order' && !selectedCustomer()){
      list.innerHTML='<div class="empty-state-card compact-empty">請先點選客戶，這裡只顯示該客戶的總單清單。</div>';
      return;
    }
    if(!rows.length){
      list.innerHTML='<div class="empty-state-card compact-empty">目前沒有資料</div>';
      return;
    }
    list.innerHTML='';
    let i = 0;
    const chunkSize = 80;
    const schedule = window.requestIdleCallback || ((fn)=>setTimeout(fn,0));
    const appendChunk = () => {
      if(window.__yx64CardRenderToken?.[source] !== token) return;
      const html = rows.slice(i, i + chunkSize).map(r=>cardHTML(r,source)).join('');
      if(html) list.insertAdjacentHTML('beforeend', html);
      i += chunkSize;
      if(i < rows.length) schedule(appendChunk);
    };
    appendChunk();
  }
  async function refreshSource(source, silent=true){
    removeLegacyUI(); ensureToolbar(source);
    try{
      const data=await api(endpointOf(source)+'?ts='+Date.now());
      setRows(source,data.items||[]);
      renderSummary(source); renderCards(source);
      if(!silent) notify(`${titleOf(source)}已刷新`,'ok');
      return data.items||[];
    }catch(e){ renderSummary(source); renderCards(source); if(!silent) notify(e.message||`${titleOf(source)}讀取失敗`,'error'); return getRows(source); }
  }
  window.loadInventory=()=>refreshSource('inventory',true);
  window.loadOrdersList=()=>refreshSource('orders',true);
  window.loadMasterList=()=>refreshSource('master_order',true);
  window.renderInventoryRows=rows=>{ setRows('inventory',rows||[]); renderSummary('inventory'); renderCards('inventory'); };
  window.renderOrdersRows=rows=>{ setRows('orders',rows||[]); renderSummary('orders'); renderCards('orders'); };
  window.renderMasterRows=rows=>{ setRows('master_order',rows||[]); renderSummary('master_order'); renderCards('master_order'); };

  function selectedItems(source){ return [...document.querySelectorAll(`.yx63-row-check[data-source="${source}"]:checked`)].map(ch=>({source:apiSource(source), id:Number(ch.dataset.id||0)})).filter(x=>x.id>0); }
  function allVisibleItems(source){ return filteredRows(source).map(r=>({source:apiSource(source), id:Number(r.id||0)})).filter(x=>x.id>0); }
  async function bulkMaterial(source){
    const material=clean($(`yx63-${source}-material`)?.value||'').toUpperCase();
    if(!material) return notify('請先選擇材質','warn');
    let items=selectedItems(source);
    if(!items.length){ if(!confirm('沒有勾選商品，是否套用到目前清單全部商品？')) return; items=allVisibleItems(source); }
    if(!items.length) return notify('目前沒有可套用的商品','warn');
    try{ const data=await api('/api/customer-items/batch-material',{method:'POST',body:JSON.stringify({material,items})}); notify(`已套用材質 ${material}：${data.count||items.length} 筆`,'ok'); await refreshSource(source,true); }catch(e){ notify(e.message||'批量加材質失敗','error'); }
  }
  async function bulkDelete(source){
    let items=selectedItems(source);
    if(!items.length){ if(!confirm('沒有勾選商品，是否刪除目前清單全部商品？')) return; items=allVisibleItems(source); }
    if(!items.length) return notify('目前沒有可刪除的商品','warn');
    if(!confirm(`確定刪除 ${items.length} 筆商品？`)) return;
    try{ const data=await api('/api/customer-items/batch-delete',{method:'POST',body:JSON.stringify({items})}); notify(`已刪除 ${data.count||items.length} 筆商品`,'ok'); await refreshSource(source,true); }catch(e){ notify(e.message||'批量刪除失敗','error'); }
  }
  async function cardAction(card,act){
    const source=card.dataset.source; const id=Number(card.dataset.id||0); if(!source||!id) return;
    const row=getRows(source).find(r=>Number(r.id||0)===id) || {};
    if(act==='delete'){
      if(!confirm('確定刪除此商品？')) return;
      try{ await api('/api/customer-item',{method:'DELETE',body:JSON.stringify({source:apiSource(source), id})}); notify('已刪除','ok'); await refreshSource(source,true); }catch(e){ notify(e.message||'刪除失敗','error'); }
    }else if(act==='edit'){
      const next=prompt('修改商品資料', row.product_text || ''); if(next===null) return;
      const q=prompt('修改數量', String(rowQty(row))); if(q===null) return;
      try{ await api('/api/customer-item',{method:'POST',body:JSON.stringify({source:apiSource(source), id, product_text:next, qty:Number(q)||qtyFromExpression(next,1), material:rowMaterial(row)})}); notify('已更新','ok'); await refreshSource(source,true); }catch(e){ notify(e.message||'更新失敗','error'); }
    }else if(act==='ship'){
      const draft={customer_name:row.customer_name||selectedCustomer()||'', product_text:row.product_text||'', at:Date.now()};
      localStorage.setItem('yxShipDraft',JSON.stringify(draft));
      if(moduleKey()==='ship'){
        if($('customer-name')) $('customer-name').value=draft.customer_name;
        if($('ocr-text')) $('ocr-text').value=draft.product_text;
      }else location.href='/ship';
    }
  }
  document.addEventListener('click',e=>{
    const sizeCell=e.target.closest('.yx63-size-cell');
    if(!sizeCell) return;
    const row=sizeCell.closest('.yx63-summary-row');
    if(!row) return;
    e.preventDefault();
    e.stopPropagation();
    setRowSelected(row, !row.querySelector('.yx63-row-check')?.checked);
  },true);

  document.addEventListener('click',e=>{
    const btn=e.target.closest('[data-yx63-action]'); if(!btn) return;
    const card=btn.closest('.yx63-item-card'); if(!card) return;
    e.preventDefault(); e.stopImmediatePropagation(); cardAction(card,btn.dataset.yx63Action);
  },true);

  function parseLines(raw){ return String(raw||'').replace(/\r/g,'\n').split(/\n+/).map(x=>normalizeX(x)).filter(x=>x && x.includes('x')); }
  function parseSubmitItems(raw){ return parseLines(raw).map(product_text=>({product_text, product_code:'', material:'', qty:qtyFromExpression(product_text,1)||1})); }
  async function submitNonShip(mod,items,customer,raw){
    const url=mod==='orders'?'/api/orders':mod==='master_order'?'/api/master_orders':'/api/inventory';
    return api(url,{method:'POST',body:JSON.stringify({customer_name:customer, ocr_text:raw, items, request_key:`${mod}_${Date.now()}_${Math.random().toString(36).slice(2)}`})});
  }
  function showShipPreview(preview,payload){
    const panel=$('ship-preview-panel')||$('module-result'); if(!panel) return;
    panel.classList.remove('hidden'); panel.style.display='';
    const items=preview.items||[];
    const tq=items.reduce((s,it)=>s+Number(it.qty||it.need_qty||0),0), tl=items.reduce((s,it)=>s+Number(it.length_total||it.total_length||0),0), tv=items.reduce((s,it)=>s+Number(it.volume||it.volume_total||0),0);
    panel.innerHTML=`<div class="section-title">出貨預覽</div><div class="yx63-ship-summary"><div>件數：<b>${tq}</b></div><div>材積：<b>${Number(tv||0).toLocaleString()}</b></div></div><div class="yx63-table-wrap"><table class="yx63-summary-table"><thead><tr><th>商品</th><th>件數</th><th>材積</th><th>可扣來源</th><th>倉庫圖位置</th></tr></thead><tbody>${items.map(it=>{ const locs=(it.locations||[]).map(loc=>`${esc(loc.zone||'')}-${esc(loc.column_index||'')}-${String(loc.visual_slot||loc.slot_number||'').padStart(2,'0')}`).join('、')||'倉庫圖尚未找到位置'; const shortage=Number(it.shortage||it.shortage_qty||0); const src=`總單 ${it.master_available??it.master_qty??0}｜訂單 ${it.order_available??it.order_qty??0}｜庫存 ${it.inventory_available??it.inventory_qty??0}${shortage>0?`<br><span class="danger-text">不足 ${shortage}</span>`:''}`; return `<tr><td>${esc(it.product_text||'')}</td><td>${it.qty||it.need_qty||0}</td><td>${Number(it.volume||it.volume_total||0).toLocaleString()}</td><td>${src}</td><td>${locs}</td></tr>`; }).join('')}</tbody></table></div><div class="btn-row"><button class="ghost-btn" type="button" id="yx63-ship-cancel">取消</button><button class="primary-btn" type="button" id="yx63-ship-confirm">確認扣除</button></div>`;
    $('yx63-ship-cancel')?.addEventListener('click',()=>panel.classList.add('hidden'));
    $('yx63-ship-confirm')?.addEventListener('click',async()=>{ try{ await api('/api/ship',{method:'POST',body:JSON.stringify({...payload, allow_inventory_fallback:true, preview_confirmed:true, request_key:`ship_${Date.now()}_${Math.random().toString(36).slice(2)}`})}); panel.innerHTML='<div class="section-title">出貨完成</div><div class="muted">已扣除總單 / 訂單 / 庫存。</div>'; notify('出貨完成','ok'); }catch(e){ notify(e.message||'出貨失敗','error'); } });
  }
  window.confirmSubmit=async function(){
    const btn=$('submit-btn'); if(!btn||btn.dataset.busy==='1') return;
    const mod=moduleKey()||'inventory'; const raw=$('ocr-text')?.value||''; const items=parseSubmitItems(raw); const customer=clean($('customer-name')?.value||'');
    if(!items.length) return notify('沒有可送出的商品資料','warn');
    if(['orders','master_order','ship'].includes(mod)&&!customer) return notify('請先輸入客戶名稱','warn');
    try{ btn.dataset.busy='1'; btn.disabled=true; btn.textContent=mod==='ship'?'整理預覽中…':'送出中…';
      if(mod==='ship'){ const payload={customer_name:customer, ocr_text:raw, items}; const preview=await api('/api/ship-preview',{method:'POST',body:JSON.stringify(payload)}); showShipPreview(preview,payload); return; }
      await submitNonShip(mod,items,customer,raw); notify(mod==='inventory'?'庫存送出成功':mod==='orders'?'訂單送出成功':'總單送出成功','ok');
      if(mod==='inventory') await refreshSource('inventory',true); if(mod==='orders') await refreshSource('orders',true); if(mod==='master_order') await refreshSource('master_order',true);
    }catch(e){ const p=$('module-result'); if(p){ p.classList.remove('hidden'); p.style.display=''; p.innerHTML=`<div class="section-title">送出失敗</div><div class="muted">${esc(e.message||'送出失敗')}</div>`; } notify(e.message||'送出失敗','error'); }
    finally{ btn.dataset.busy='0'; btn.disabled=false; btn.textContent='確認送出'; }
  };

  async function loadShipCustomerItems(customer){
    const sel=$('ship-customer-item-select'); if(!sel) return;
    const name=clean((customer&&customer.name)||$('customer-name')?.value||''); const uid=clean((customer&&customer.customer_uid)||$('customer-name')?.dataset.customerUid||'');
    if(!name&&!uid){ sel.innerHTML='<option value="">請先選擇 / 輸入客戶名稱</option>'; window.__YX_SHIP_CUSTOMER_ITEMS__=[]; return; }
    try{ sel.innerHTML='<option value="">載入中…</option>'; const d=await api(`/api/customer-items?name=${encodeURIComponent(name)}&customer_uid=${encodeURIComponent(uid)}&ts=${Date.now()}`); const items=d.items||[]; window.__YX_SHIP_CUSTOMER_ITEMS__=items; sel.innerHTML='<option value="">請選擇商品</option>'+items.map((it,i)=>`<option value="${i}">${esc(it.product_text||'')}｜${esc(it.source||'')}｜${rowQty(it)}件</option>`).join(''); }catch(e){ sel.innerHTML=`<option value="">${esc(e.message||'商品載入失敗')}</option>`; }
  }
  function addShipItem(it){ const box=$('ocr-text'); if(!box||!it?.product_text) return; box.value=box.value.trim()?box.value.trim()+'\n'+it.product_text:it.product_text; box.dispatchEvent(new Event('input',{bubbles:true})); }
  document.addEventListener('click',e=>{ if(e.target?.id==='ship-refresh-customer-items') loadShipCustomerItems({name:$('customer-name')?.value||''}); if(e.target?.id==='ship-add-selected-item'){ const it=(window.__YX_SHIP_CUSTOMER_ITEMS__||[])[Number($('ship-customer-item-select')?.value)]; if(it) addShipItem(it); } if(e.target?.id==='ship-add-all-items') (window.__YX_SHIP_CUSTOMER_ITEMS__||[]).forEach(addShipItem); },true);

  function installCustomerLongPress(){
    let timer=null;
    document.querySelectorAll('.customer-region-card,.yx-customer-card,[data-customer-name]').forEach(card=>{
      if(card.dataset.yx63LongPress==='1') return; card.dataset.yx63LongPress='1';
      const name=card.dataset.customerName || card.querySelector('.customer-name,.yx-customer-left,.fix52-customer-name')?.textContent || card.textContent.split(/\s{2,}|CNF|FOB|\d+件/)[0];
      const start=()=>{ clearTimeout(timer); timer=setTimeout(async()=>{ const n=clean(name); if(!n || !confirm(`確定刪除 / 封存客戶「${n}」？`)) return; try{ await api(`/api/customers/${encodeURIComponent(n)}`,{method:'DELETE'}); notify('已刪除 / 封存客戶','ok'); if(typeof window.loadCustomerBlocks==='function') window.loadCustomerBlocks(); }catch(e){ notify(e.message||'刪除客戶失敗','error'); } },700); };
      const cancel=()=>clearTimeout(timer);
      card.addEventListener('touchstart',start,{passive:true}); card.addEventListener('mousedown',start); ['touchend','touchmove','mouseup','mouseleave','click'].forEach(ev=>card.addEventListener(ev,cancel,{passive:true}));
    });
  }

  function boot(){
    document.documentElement.dataset.yxFix63=VERSION;
    document.body?.setAttribute('data-yx-fix63','1');
    removeLegacyUI();
    const m=moduleKey();
    if(m==='inventory') refreshSource('inventory',true);
    if(m==='orders') refreshSource('orders',true);
    if(m==='master_order') refreshSource('master_order',true);
    if(m==='ship'){
      const draft=(()=>{ try{return JSON.parse(localStorage.getItem('yxShipDraft')||'null')}catch(_){return null} })();
      if(draft && Date.now()-Number(draft.at||0)<10*60*1000){ if($('customer-name')) $('customer-name').value=draft.customer_name||''; if($('ocr-text')) $('ocr-text').value=draft.product_text||''; localStorage.removeItem('yxShipDraft'); }
      loadShipCustomerItems({name:$('customer-name')?.value||''});
    }
    installCustomerLongPress();
    setTimeout(()=>{ removeLegacyUI(); if(['inventory','orders','master_order'].includes(moduleKey())){ const s=moduleKey()==='master_order'?'master_order':moduleKey(); renderSummary(s); renderCards(s); } installCustomerLongPress(); },250);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();
/* ==== FIX63 end ==== */

/* ==== FIX64 mobile table + tap-select + navigation speed patch ==== */
(function(){
  const YX64 = 'fix70-final-conflict-convergence';
  try { document.documentElement.dataset.yxFix64 = YX64; } catch(_e) {}

  function byId(id){ return document.getElementById(id); }
  function hasCustomerBoard(){
    return ['region-north','region-center','region-south','customers-north','customers-center','customers-south'].some(id => !!byId(id));
  }

  if (typeof window.loadCustomerBlocks === 'function') {
    const originalLoadCustomerBlocks = window.loadCustomerBlocks;
    let pending = null;
    let lastRunAt = 0;
    window.loadCustomerBlocks = async function(force=false){
      if(!hasCustomerBoard()) return window.state?.customerDirectory || [];
      const now = Date.now();
      if(!force && pending) return pending;
      if(!force && Array.isArray(window.state?.customerDirectory) && window.state.customerDirectory.length && now - lastRunAt < 1200){
        return window.state.customerDirectory;
      }
      pending = Promise.resolve(originalLoadCustomerBlocks.apply(this, arguments)).finally(() => { lastRunAt = Date.now(); pending = null; });
      return pending;
    };
  }

  let warehousePending = null;
  window.renderWarehouse = async function(){
    if(warehousePending) return warehousePending;
    const loader = window.renderWarehouseLegacyA || window.renderWarehouseLegacyB;
    warehousePending = Promise.resolve(loader ? loader() : (window.renderWarehouseZones ? window.renderWarehouseZones() : null))
      .finally(() => setTimeout(() => { warehousePending = null; }, 250));
    return warehousePending;
  };
  window.searchWarehouse = async function(){
    const searcher = window.searchWarehouseLegacyA || window.searchWarehouseLegacyB || window.legacySearchWarehouse;
    return searcher ? searcher() : null;
  };

  window.addEventListener('pageshow', function(){
    ['inventory','orders','master_order'].forEach(source => {
      try {
        const btn = byId(`yx63-${source}-selectall`);
        if(!btn) return;
        const selected = document.querySelectorAll(`.yx63-summary-row[data-source="${source}"] .yx63-row-check:checked`).length;
        btn.textContent = selected ? `已選 ${selected} 筆｜清除/全選` : '全選目前清單';
      } catch(_e) {}
    });
  });
})();
/* ==== FIX64 end ==== */



/* ==== FIX65: duplicate convergence + single-flight navigation/load ==== */
(function(){
  'use strict';
  const VERSION = 'fix70-final-conflict-convergence';
  if (window.__YX65_DUP_CONVERGE_INSTALLED__) return;
  window.__YX65_DUP_CONVERGE_INSTALLED__ = true;
  try {
    document.documentElement.dataset.yxFix65 = VERSION;
    document.body && document.body.setAttribute('data-yx-fix65','1');
  } catch(_e) {}

  const $ = id => document.getElementById(id);
  const now = () => Date.now();
  const moduleKey = () => {
    try {
      return document.querySelector('.module-screen')?.dataset.module ||
        (typeof window.currentModule === 'function' ? window.currentModule() : '');
    } catch(_e) { return ''; }
  };

  function hasBoard(){
    return ['region-north','region-center','region-south','customers-north','customers-center','customers-south']
      .some(id => !!$(id));
  }

  function compactText(v){
    return String(v || '').replace(/\s+/g,' ').trim();
  }

  function debounce(fn, delay){
    let timer = null;
    return function(){
      clearTimeout(timer);
      const args = arguments;
      timer = setTimeout(() => fn.apply(this,args), delay);
    };
  }

  function dedupeCustomerCards(){
    const containers = ['region-north','region-center','region-south','customers-north','customers-center','customers-south'];
    containers.forEach(id => {
      const box = $(id);
      if (!box) return;
      const seen = new Set();
      Array.from(box.querySelectorAll('.customer-region-card,.yx-customer-card,[data-customer-name]')).forEach(card => {
        const name = compactText(card.dataset.customer || card.dataset.customerName ||
          card.querySelector('.customer-card-name,.customer-name,.yx-customer-left,.fix52-customer-name')?.textContent ||
          card.textContent);
        if (!name) return;
        const key = name.toLowerCase();
        if (seen.has(key)) card.remove();
        else seen.add(key);
      });
      const empties = Array.from(box.querySelectorAll('.empty-state-card,.compact-empty'));
      if (box.querySelector('.customer-region-card,.yx-customer-card,[data-customer-name]') && empties.length) {
        empties.forEach(el => el.remove());
      } else if (!box.children.length) {
        box.innerHTML = '<div class="empty-state-card compact-empty">目前沒有客戶</div>';
      }
    });
  }

  function dedupeSummaryRows(){
    document.querySelectorAll('.yx63-summary-table tbody').forEach(tbody => {
      const seen = new Set();
      Array.from(tbody.querySelectorAll('tr.yx63-summary-row')).forEach(row => {
        const source = row.dataset.source || '';
        const id = row.dataset.id || '';
        const key = id && id !== '0'
          ? `${source}:${id}`
          : `${source}:text:${compactText(row.textContent).toLowerCase()}`;
        if (seen.has(key)) row.remove();
        else seen.add(key);
      });
    });
    document.querySelectorAll('#inventory-inline-list,#orders-list,#master-list').forEach(list => {
      const seen = new Set();
      Array.from(list.querySelectorAll('.yx63-item-card')).forEach(card => {
        const key = `${card.dataset.source || ''}:${card.dataset.id || ''}`;
        if (card.dataset.id && seen.has(key)) card.remove();
        else if (card.dataset.id) seen.add(key);
      });
    });
  }

  const cleanupDom = debounce(function(){
    dedupeCustomerCards();
    dedupeSummaryRows();
  }, 80);

  function singleFlightFunction(name, ttl, after){
    const original = window[name];
    if (typeof original !== 'function' || original.__yx65SingleFlight) return;
    let pending = null;
    let lastAt = 0;
    let lastValue;
    const wrapped = function(){
      const args = Array.from(arguments);
      const force = args[0] === true || args.some(v => v && typeof v === 'object' && v.force === true);
      const t = now();
      if (!force && pending) return pending;
      if (!force && lastValue !== undefined && t - lastAt < ttl) return Promise.resolve(lastValue);
      pending = Promise.resolve()
        .then(() => original.apply(this, args))
        .then(value => {
          lastValue = value;
          return value;
        })
        .finally(() => {
          lastAt = now();
          pending = null;
          try { after && after(); } catch(_e) {}
        });
      return pending;
    };
    wrapped.__yx65SingleFlight = true;
    wrapped.__yx65Original = original;
    window[name] = wrapped;
  }

  singleFlightFunction('loadCustomerBlocks', 2600, cleanupDom);
  singleFlightFunction('renderWarehouse', 900, cleanupDom);
  singleFlightFunction('loadInventory', 1800, cleanupDom);
  singleFlightFunction('loadOrdersList', 1800, cleanupDom);
  singleFlightFunction('loadMasterList', 1800, cleanupDom);

  // 收斂「確認送出」連點 / 重複觸發，只留一次送出流程。
  if (typeof window.confirmSubmit === 'function' && !window.confirmSubmit.__yx65SingleSubmit) {
    const originalConfirmSubmit = window.confirmSubmit;
    let submitLock = false;
    window.confirmSubmit = async function(){
      if (submitLock) return;
      const btn = $('submit-btn');
      if (btn && btn.dataset.busy === '1') return;
      submitLock = true;
      try {
        return await originalConfirmSubmit.apply(this, arguments);
      } finally {
        setTimeout(() => { submitLock = false; }, 500);
      }
    };
    window.confirmSubmit.__yx65SingleSubmit = true;
  }

  function bindWarehouseZoneButtons(){
    const safeSet = zone => {
      if (typeof window.setWarehouseZone === 'function') window.setWarehouseZone(zone);
    };
    const btnA = $('zone-switch-A'), btnB = $('zone-switch-B'), btnAll = $('zone-switch-ALL');
    if (btnA) btnA.onclick = () => safeSet('A');
    if (btnB) btnB.onclick = () => safeSet('B');
    if (btnAll) btnAll.onclick = () => safeSet('ALL');
  }

  function boot(){
    try {
      document.documentElement.dataset.yxFix65 = VERSION;
      document.body && document.body.setAttribute('data-yx-fix65','1');
    } catch(_e) {}

    const mod = moduleKey();
    bindWarehouseZoneButtons();

    if (mod === 'warehouse') {
      const saved = (() => { try { return localStorage.getItem('warehouseActiveZone') || 'A'; } catch(_e) { return 'A'; } })();
      setTimeout(async () => {
        try {
          if (typeof window.renderWarehouse === 'function') await window.renderWarehouse();
          if (typeof window.setWarehouseZone === 'function') window.setWarehouseZone(saved, false);
        } catch(_e) {}
      }, 30);
    }

    if (hasBoard() && ['orders','master_order','ship','customers'].includes(mod)) {
      setTimeout(() => {
        try { typeof window.loadCustomerBlocks === 'function' && window.loadCustomerBlocks(); } catch(_e) {}
      }, 40);
    }

    cleanupDom();
  }

  // 導航時關閉重動畫，返回/進功能頁更快，不改任何功能路由。
  document.addEventListener('click', function(e){
    const a = e.target.closest && e.target.closest('a.back-btn,a.menu-btn,.home-menu a,.home-mini-btn[href]');
    if (!a || !a.href || a.target === '_blank' || a.dataset.yx65NoFastNav === '1') return;
    try {
      const u = new URL(a.href, location.href);
      if (u.origin !== location.origin) return;
      document.body.classList.add('yx65-navigating');
    } catch(_e) {}
  }, true);

  document.addEventListener('click', function(e){
    const sizeCell = e.target.closest && e.target.closest('.yx63-size-cell');
    if (!sizeCell) return;
    setTimeout(cleanupDom, 0);
  }, true);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();

  window.addEventListener('pageshow', function(){
    document.body && document.body.classList.remove('yx65-navigating');
    setTimeout(cleanupDom, 60);
  });
})();
 /* ==== FIX65 end ==== */


/* ==== FIX66: customer table restore + ship picker + selected-row filter convergence ==== */
(function(){
  'use strict';
  const VERSION='fix70-final-conflict-convergence';
  if(window.__YX66_CUSTOMER_TABLE_PATCH__) return;
  window.__YX66_CUSTOMER_TABLE_PATCH__=true;
  try{ document.documentElement.dataset.yxFix66=VERSION; document.body && document.body.setAttribute('data-yx-fix66','1'); }catch(_e){}

  const $ = id => document.getElementById(id);
  const esc = s => (window.escapeHTML ? window.escapeHTML(s) : String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])));
  const clean = s => String(s ?? '').trim();
  const api = window.yxApi || window.requestJSON || (async function(url,opt={}){ const r=await fetch(url,{credentials:'same-origin',...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}}); const d=await r.json().catch(()=>({})); if(!r.ok || d.success===false) throw new Error(d.error||d.message||'請求失敗'); return d; });
  const mod = () => document.querySelector('.module-screen')?.dataset.module || (typeof window.currentModule==='function'?window.currentModule():'');
  const notify = (msg, kind='ok') => { try{ (window.toast || window.showToast || alert)(msg, kind); }catch(_e){ console.log(msg); } };

  function normalizeX(v){ return clean(v).replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/[＋，,；;]/g,'+').replace(/\s+/g,''); }
  function splitProduct(text){ const raw=normalizeX(text); const i=raw.indexOf('='); return {size:i>=0?raw.slice(0,i):raw, support:i>=0?raw.slice(i+1):''}; }
  // FIX85：客戶商品明細 / 出貨下拉也要使用月份排序與漂亮格式。
  function yx85SizeInfo(size){
    const raw = normalizeX(size || '');
    const m = raw.match(/^(\d{1,2})(?:月|月份)(.+)$/);
    const month = m ? Number(m[1] || 0) : 0;
    const body = m ? (m[2] || '') : raw;
    const nums = (body.match(/\d+(?:\.\d+)?/g) || []).map(Number);
    return {
      hasMonth: !!(month >= 1 && month <= 12),
      month: (month >= 1 && month <= 12) ? month : 99,
      body,
      length: Number.isFinite(nums[0]) ? nums[0] : 999999,
      width: Number.isFinite(nums[1]) ? nums[1] : 999999,
      height: Number.isFinite(nums[2]) ? nums[2] : 999999
    };
  }
  function yx85PrettySizeText(size){
    const info = yx85SizeInfo(size);
    const body = String(info.body || size || '').replace(/x/gi, ' × ');
    return info.hasMonth ? `${info.month}月 ${body}` : body;
  }
  function yx85SizeHTML(size){
    const info = yx85SizeInfo(size);
    const body = esc(String(info.body || size || '').replace(/x/gi, ' × '));
    return info.hasMonth ? `<span class="yx85-month-size"><span class="yx85-month-badge">${info.month}月</span><span class="yx85-size-body">${body}</span></span>` : `<span class="yx85-size-body">${body}</span>`;
  }
  function supportQty(expr, fallback=0){
    const raw=normalizeX(expr); const right=raw.includes('=')?raw.split('=').slice(1).join('='):raw;
    if(!right) return Number(fallback||0)||0;
    const canonical='504x5+588+587+502+420+382+378+280+254+237+174';
    if(right.toLowerCase()===canonical || raw.toLowerCase().endsWith('='+canonical)) return 10;
    const parts=right.split('+').map(clean).filter(Boolean);
    const xParts=parts.filter(p=>/x\s*\d+\s*$/i.test(p));
    const bareParts=parts.filter(p=>!/x\s*\d+\s*$/i.test(p)&&/\d/.test(p));
    if(parts.length>=10 && xParts.length===1 && parts[0]===xParts[0] && /^\d{3,}\s*x\s*\d+\s*$/i.test(xParts[0]) && bareParts.length>=8) return bareParts.length;
    let total=0, hit=false;
    parts.forEach(seg=>{ const m=seg.match(/x\s*(\d+)\s*$/i); if(m){ total+=Number(m[1]||0); hit=true; } else if(/\d/.test(seg)){ total+=1; hit=true; } });
    return hit ? total : (Number(fallback||0)||0);
  }
  function rowMaterial(r){
    const v=clean(r?.material || r?.product_code || '');
    const p=normalizeX(r?.product_text||'');
    const vv=normalizeX(v);
    if(!v || (p && vv===p) || vv.includes('=') || /^\d+(?:\.\d+)?x\d+/i.test(vv)) return '';
    return v;
  }
  function rowSize(r){ return splitProduct(r?.product_text || r?.size || '').size; }
  function rowSupport(r){ const p=splitProduct(r?.product_text || ''); return p.support || clean(r?.support || r?.support_text || r?.qty || ''); }
  function rowQty(r){ return supportQty(r?.product_text || r?.support || '', r?.qty || 0); }

  function dimParts(r){
    return yx85SizeInfo(rowSize(r));
  }
  function supportRank(r){
    const parts=String(rowSupport(r)||'').replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＋，,；;]/g,'+').split('+').map(clean).filter(Boolean);
    let maxCase=0,totalCase=0;
    parts.forEach(seg=>{ const m=seg.match(/x\s*(\d+)\s*$/i); const c=m?Number(m[1]||0):(/\d/.test(seg)?1:0); maxCase=Math.max(maxCase,c); totalCase+=c; });
    return {maxCase,totalCase,text:parts.join('+')};
  }
  function compareRows(a,b){
    const da=dimParts(a), db=dimParts(b);
    // FIX85：只要有月份，優先依「月份 → 高 → 寬 → 長」由小到大。
    if(da.hasMonth || db.hasMonth){
      if(da.month!==db.month) return da.month-db.month;
      if(da.height!==db.height) return da.height-db.height;
      if(da.width!==db.width) return da.width-db.width;
      if(da.length!==db.length) return da.length-db.length;
      const mat=rowMaterial(a).localeCompare(rowMaterial(b),'zh-Hant',{numeric:true}); if(mat) return mat;
    }else{
      const mat=rowMaterial(a).localeCompare(rowMaterial(b),'zh-Hant',{numeric:true}); if(mat) return mat;
      if(da.height!==db.height) return da.height-db.height;
      if(da.width!==db.width) return da.width-db.width;
      if(da.length!==db.length) return da.length-db.length;
    }
    const qa=supportRank(a), qb=supportRank(b);
    if(qa.maxCase!==qb.maxCase) return qb.maxCase-qa.maxCase;
    if(qa.totalCase!==qb.totalCase) return qb.totalCase-qa.totalCase;
    return qa.text.localeCompare(qb.text,'zh-Hant',{numeric:true});
  }
  function getRows(source){ return (window.__yx63Rows && window.__yx63Rows[source]) || []; }
  function selectedCustomer(){ return clean($('customer-name')?.value || window.__YX_SELECTED_CUSTOMER__ || ''); }

  function showCustomerPanel(panel){
    if(!panel) return;
    panel.classList.remove('hidden');
    panel.classList.add('yx66-active');
    panel.style.display='block';
  }

  function buildCustomerProductsHTML(name, items){
    const sorted=[...(items||[])].sort(compareRows);
    const total=sorted.reduce((s,it)=>s+rowQty(it),0);
    const rows=sorted.map(it=>`<tr class="yx66-customer-product-row" data-source="${esc(it.source||'')}" data-id="${Number(it.id||0)}">
      <td class="yx66-material-cell">${esc(rowMaterial(it))}</td>
      <td class="yx66-size-cell">${yx85SizeHTML(rowSize(it))}</td>
      <td class="yx66-support-cell">${esc(rowSupport(it))}</td>
      <td class="yx66-qty-cell">${rowQty(it)}</td>
      <td class="yx66-source-cell">${esc(it.source||'')}</td>
    </tr>`).join('');
    return `<div class="customer-detail-card yx66-customer-detail-card">
      <div class="customer-detail-header yx66-customer-detail-header">
        <div><div class="section-title">${esc(name||'')}</div><div class="muted">${total}件 / ${sorted.length}筆商品</div></div>
      </div>
      <div class="table-card customer-table-wrap yx66-customer-table-wrap">
        <table class="yx66-customer-table"><thead><tr><th>材質</th><th>尺寸</th><th>支數 x 件數</th><th>數量</th><th>來源</th></tr></thead><tbody>${rows || '<tr><td colspan="5">此客戶目前沒有商品</td></tr>'}</tbody></table>
      </div>
    </div>`;
  }

  async function loadShipCustomerItems66(name, uid=''){
    const sel=$('ship-customer-item-select');
    if(!sel) return [];
    const finalName=clean(name || $('customer-name')?.value || '');
    const finalUid=clean(uid || $('customer-name')?.dataset.customerUid || '');
    if(!finalName && !finalUid){ sel.innerHTML='<option value="">請先選擇 / 輸入客戶名稱</option>'; window.__YX_SHIP_CUSTOMER_ITEMS__=[]; return []; }
    try{
      sel.innerHTML='<option value="">載入中…</option>';
      const d=await api(`/api/customer-items?name=${encodeURIComponent(finalName)}&customer_uid=${encodeURIComponent(finalUid)}&ts=${Date.now()}`, {method:'GET'});
      const items=Array.isArray(d.items)?d.items:[];
      window.__YX_SHIP_CUSTOMER_ITEMS__=items.sort(compareRows);
      sel.innerHTML='<option value="">請選擇商品</option>'+window.__YX_SHIP_CUSTOMER_ITEMS__.map((it,i)=>`<option value="${i}">${esc(rowMaterial(it)||'未填材質')}｜${esc(yx85PrettySizeText(rowSize(it)))}｜${esc(rowSupport(it))}｜${rowQty(it)}件｜${esc(it.source||'')}</option>`).join('');
      if(!items.length) sel.innerHTML='<option value="">此客戶目前沒有商品</option>';
      return items;
    }catch(e){ sel.innerHTML=`<option value="">${esc(e.message||'商品載入失敗')}</option>`; window.__YX_SHIP_CUSTOMER_ITEMS__=[]; return []; }
  }
  window.loadShipCustomerItems66=loadShipCustomerItems66;

  function rerenderCurrentLists(){
    try{
      const m=mod();
      if(m==='orders' && typeof window.renderOrdersRows==='function') window.renderOrdersRows(getRows('orders'));
      if(m==='master_order' && typeof window.renderMasterRows==='function') window.renderMasterRows(getRows('master_order'));
      if(m==='inventory' && typeof window.renderInventoryRows==='function') window.renderInventoryRows(getRows('inventory'));
    }catch(_e){}
  }

  const prevSelect=typeof window.selectCustomerForModule==='function' ? window.selectCustomerForModule : null;
  window.selectCustomerForModule=async function(name){
    const finalName=clean(name||'');
    window.__YX_SELECTED_CUSTOMER__=finalName;
    const input=$('customer-name');
    if(input) input.value=finalName;
    const panel=$('selected-customer-items');
    if(panel){ showCustomerPanel(panel); panel.innerHTML='<div class="empty-state-card compact-empty">商品載入中…</div>'; }
    let items=[];
    try{
      const d=await api(`/api/customer-items?name=${encodeURIComponent(finalName)}&ts=${Date.now()}`, {method:'GET'});
      items=Array.isArray(d.items)?d.items:[];
      if(panel){ showCustomerPanel(panel); panel.innerHTML=buildCustomerProductsHTML(finalName, items); }
    }catch(e){
      if(panel){ showCustomerPanel(panel); panel.innerHTML=`<div class="empty-state-card compact-empty">${esc(e.message||'載入客戶商品失敗')}</div>`; }
      if(prevSelect){ try{ await prevSelect.apply(this, arguments); }catch(_e){} }
    }
    try{ if(mod()==='ship') await loadShipCustomerItems66(finalName); }catch(_e){}
    try{ rerenderCurrentLists(); }catch(_e){}
    setTimeout(()=>applyAllSelectedFilters(),60);
    return items;
  };

  function selectedRowIds(source){ return new Set([...document.querySelectorAll(`.yx63-summary-row[data-source="${source}"] .yx63-row-check:checked`)].map(cb=>String(cb.dataset.id||''))); }
  function applySelectedFilter(source){
    if(!source) return;
    const ids=selectedRowIds(source);
    const active=ids.size>0;
    const list=source==='inventory'?$('inventory-inline-list'):source==='orders'?$('orders-list'):$('master-list');
    if(list){
      list.classList.toggle('yx66-filtered-by-table', active);
      list.querySelectorAll('.yx63-item-card').forEach(card=>{ const show=!active || ids.has(String(card.dataset.id||'')); card.classList.toggle('yx66-card-hidden', !show); });
    }
    const hintId=`yx66-${source}-filter-hint`;
    let hint=$(hintId);
    const summary=$(`yx63-${source}-summary`);
    if(active && summary && !hint){ hint=document.createElement('div'); hint.id=hintId; hint.className='yx66-filter-hint'; summary.insertAdjacentElement('afterend', hint); }
    if(hint){ hint.textContent=active?`已依上方選取篩選下方 ${ids.size} 筆商品；再點尺寸可取消。`:''; hint.style.display=active?'block':'none'; }
  }
  function applyAllSelectedFilters(){ ['inventory','orders','master_order'].forEach(applySelectedFilter); }

  document.addEventListener('click', function(e){
    const cell=e.target.closest && e.target.closest('.yx63-size-cell,.yx63-select-all,#yx63-inventory-selectall,#yx63-orders-selectall,#yx63-master_order-selectall');
    if(cell) setTimeout(applyAllSelectedFilters, 0);
  }, true);

  document.addEventListener('click', function(e){
    if(e.target?.id==='ship-refresh-customer-items'){ e.preventDefault(); e.stopPropagation(); loadShipCustomerItems66($('customer-name')?.value||''); }
    if(e.target?.id==='ship-add-selected-item'){
      setTimeout(()=>{ const it=(window.__YX_SHIP_CUSTOMER_ITEMS__||[])[Number($('ship-customer-item-select')?.value)]; if(!it) return; const box=$('ocr-text'); if(!box) return; box.value=box.value.trim()?box.value.trim()+'\n'+it.product_text:it.product_text; },0);
    }
    if(e.target?.id==='ship-add-all-items'){
      setTimeout(()=>{ const box=$('ocr-text'); if(!box) return; const lines=(window.__YX_SHIP_CUSTOMER_ITEMS__||[]).map(it=>it.product_text).filter(Boolean); if(lines.length) box.value=box.value.trim()?box.value.trim()+'\n'+lines.join('\n'):lines.join('\n'); },0);
    }
  }, true);

  let shipInputTimer=null;
  document.addEventListener('input', function(e){
    if(e.target && e.target.id==='customer-name' && mod()==='ship'){
      clearTimeout(shipInputTimer);
      shipInputTimer=setTimeout(()=>loadShipCustomerItems66(e.target.value||''),350);
    }
  }, true);
  document.addEventListener('change', function(e){ if(e.target && e.target.id==='customer-name' && mod()==='ship') loadShipCustomerItems66(e.target.value||''); }, true);

  const mo=new MutationObserver(()=>setTimeout(applyAllSelectedFilters,0));
  function boot(){
    try{ document.documentElement.dataset.yxFix66=VERSION; document.body && document.body.setAttribute('data-yx-fix66','1'); }catch(_e){}
    ['inventory-inline-list','orders-list','master-list'].forEach(id=>{ const el=$(id); if(el) mo.observe(el,{childList:true,subtree:false}); });
    if(mod()==='ship') loadShipCustomerItems66($('customer-name')?.value||'');
    setTimeout(applyAllSelectedFilters,120);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
})();
/* ==== FIX66 end ==== */

/* ==== FIX67: dynamic warehouse cells + in-cell insert/delete convergence ==== */
(function(){
  'use strict';
  const VERSION='fix70-final-conflict-convergence';
  if(window.__YX67_WAREHOUSE_DYNAMIC_PATCH__) return;
  window.__YX67_WAREHOUSE_DYNAMIC_PATCH__=true;
  try{ document.documentElement.dataset.yxFix67=VERSION; document.body && document.body.setAttribute('data-yx-fix67','1'); }catch(_e){}

  const $ = id => document.getElementById(id);
  const esc = s => (window.escapeHTML ? window.escapeHTML(s) : String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])));
  const api = window.requestJSON || (async function(url,opt={}){ const r=await fetch(url,{credentials:'same-origin',...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}}); const d=await r.json().catch(()=>({})); if(!r.ok || d.success===false) throw new Error(d.error||d.message||'請求失敗'); return d; });
  const notify = (msg, kind='ok') => { try{ (window.toast || window.showToast || alert)(msg, kind); }catch(_e){ console.log(msg); } };
  const columns = [1,2,3,4,5,6];

  function ensureState(){
    window.state = window.state || {};
    state.warehouse = state.warehouse || { cells: [], zones: {A:{}, B:{}}, availableItems: [], activeZone: 'A' };
    state.searchHighlightKeys = state.searchHighlightKeys || new Set();
  }
  function parseItems(raw){
    try{ return Array.isArray(raw) ? raw : JSON.parse(raw || '[]'); }catch(_e){ return []; }
  }
  function cellOf(zone, col, num){
    ensureState();
    return (state.warehouse.cells || []).find(c => String(c.zone)===String(zone) && Number(c.column_index)===Number(col) && Number(c.slot_number)===Number(num));
  }
  window.getCellItems = function(zone, col, num){
    const c = cellOf(zone, col, num);
    return c ? parseItems(c.items_json) : [];
  };
  window.buildCellKey = function(zone, col, num){ return [zone, Number(col), 'direct', Number(num)]; };

  function maxSlot(zone, col){
    ensureState();
    const nums = (state.warehouse.cells || [])
      .filter(c => String(c.zone)===String(zone) && Number(c.column_index)===Number(col))
      .map(c => Number(c.slot_number)||0)
      .filter(Boolean);
    return nums.length ? Math.max(...nums) : 1;
  }
  function totalSlots(zone){ return columns.reduce((sum,c)=>sum+maxSlot(zone,c),0); }

  function slotSummary(items){
    if(!items || !items.length) return '<div class="slot-line empty">空格</div>';
    const shown = items.slice(0,2).map(it => `
      <div class="slot-line customer">客戶：${esc(it.customer_name || '未指定客戶')}</div>
      <div class="slot-line product">商品：${esc(it.product_text || '')}</div>
      <div class="slot-line qty">數量：${Number(it.qty || 0)}</div>
    `).join('<hr class="slot-sep">');
    return shown + (items.length>2 ? `<div class="slot-line qty">另有 ${items.length-2} 筆</div>` : '');
  }

  function bindSlotDnd(slot, zone, col, num){
    slot.addEventListener('dragover', ev => { ev.preventDefault(); slot.classList.add('drag-over'); });
    slot.addEventListener('dragleave', () => slot.classList.remove('drag-over'));
    slot.addEventListener('drop', async ev => {
      ev.preventDefault();
      slot.classList.remove('drag-over');
      const raw = ev.dataTransfer.getData('text/plain');
      if(!raw) return;
      try{
        const parsed = JSON.parse(raw);
        if(parsed.kind === 'warehouse-item' && typeof window.moveWarehouseItem === 'function'){
          await window.moveWarehouseItem(parsed.fromKey, window.buildCellKey(zone, col, num), parsed.product_text, parsed.qty);
          await window.renderWarehouse(true);
        }
      }catch(_e){}
    });
  }

  function renderOneZone(zone){
    const wrap = $('zone-' + zone + '-grid');
    if(!wrap) return;
    wrap.className = 'zone-grid six-grid vertical-card-grid yx67-dynamic-grid';
    wrap.innerHTML = '';
    const note = $('zone-' + zone + '-count-note');
    if(note) note.textContent = `6 欄｜目前 ${totalSlots(zone)} 格`;

    columns.forEach(colNo => {
      const count = maxSlot(zone, colNo);
      const col = document.createElement('div');
      col.className = 'vertical-column-card intuitive-column yx67-dynamic-column';
      col.innerHTML = `
        <div class="column-head-row">
          <div class="column-head">${zone} 區第 ${colNo} 欄</div>
          <div class="small-note">目前 ${count} 格</div>
        </div>
        <div class="vertical-slot-list yx67-slot-list"></div>`;
      const list = col.querySelector('.vertical-slot-list');
      for(let n=1; n<=count; n++){
        const items = window.getCellItems(zone, colNo, n);
        const key = `${zone}|${colNo}|direct|${n}`;
        const slot = document.createElement('div');
        slot.className = 'vertical-slot yx67-warehouse-slot';
        slot.dataset.zone = zone;
        slot.dataset.column = String(colNo);
        slot.dataset.num = String(n);
        slot.classList.toggle('filled', items.length>0);
        slot.classList.toggle('highlight', !!(state.searchHighlightKeys && state.searchHighlightKeys.has(key)));
        slot.innerHTML = `
          <div class="slot-title-row">
            <div class="slot-title">第 ${String(n).padStart(2,'0')} 格</div>
            <div class="small-note">${items.length ? `${items.length} 筆` : '空'}</div>
          </div>
          <div class="slot-count">${slotSummary(items)}</div>
          <div class="yx67-slot-actions" aria-label="格子操作">
            <button type="button" class="ghost-btn tiny-btn yx67-slot-btn yx67-insert-btn">插入格子</button>
            <button type="button" class="ghost-btn tiny-btn yx67-slot-btn yx67-delete-btn">刪除格子</button>
          </div>`;
        slot.addEventListener('click', ev => {
          if(ev.target.closest('.yx67-slot-actions')) return;
          try{ if(typeof window.showWarehouseDetail === 'function') window.showWarehouseDetail(zone, colNo, n, items); }catch(_e){}
          try{ if(typeof window.openWarehouseModal === 'function') window.openWarehouseModal(zone, colNo, n); }catch(_e){}
        });
        slot.querySelector('.yx67-insert-btn')?.addEventListener('click', ev => { ev.preventDefault(); ev.stopPropagation(); window.insertWarehouseCell(zone, colNo, n); });
        slot.querySelector('.yx67-delete-btn')?.addEventListener('click', ev => { ev.preventDefault(); ev.stopPropagation(); window.deleteWarehouseCell(zone, colNo, n); });
        bindSlotDnd(slot, zone, colNo, n);
        list.appendChild(slot);
      }
      wrap.appendChild(col);
    });
  }

  function repaintWarehouse(){
    ensureState();
    renderOneZone('A');
    renderOneZone('B');
    if(typeof window.setWarehouseZone === 'function') window.setWarehouseZone(state.warehouse.activeZone || localStorage.getItem('warehouseActiveZone') || 'A', false);
  }
  window.renderWarehouseZones = repaintWarehouse;

  let warehousePending = null;
  async function loadWarehouseDynamic(force=false){
    ensureState();
    if(warehousePending && !force) return warehousePending;
    warehousePending = (async () => {
      const [warehouseRes, availRes] = await Promise.allSettled([
        api('/api/warehouse', { method:'GET' }),
        api('/api/warehouse/available-items', { method:'GET' })
      ]);
      const data = warehouseRes.status === 'fulfilled' ? warehouseRes.value : { cells: [], zones: {A:{}, B:{}} };
      const avail = availRes.status === 'fulfilled' ? availRes.value : { items: [] };
      state.warehouse.cells = Array.isArray(data.cells) ? data.cells : [];
      state.warehouse.zones = data.zones || {A:{}, B:{}};
      state.warehouse.availableItems = Array.isArray(avail.items) ? avail.items : [];
      if($('warehouse-unplaced-pill')) $('warehouse-unplaced-pill').textContent = `未錄入倉庫圖：${state.warehouse.availableItems.length}`;
      repaintWarehouse();
      return data;
    })().catch(e => { console.error(e); notify(e.message || '倉庫圖載入失敗', 'error'); repaintWarehouse(); }).finally(() => { setTimeout(()=>{ warehousePending=null; }, 120); });
    return warehousePending;
  }
  window.renderWarehouseLegacyA = loadWarehouseDynamic;
  window.renderWarehouseLegacyB = loadWarehouseDynamic;
  window.renderWarehouse = loadWarehouseDynamic;

  async function reloadFromResultOrFetch(result){
    if(result && Array.isArray(result.cells)){
      state.warehouse.cells = result.cells;
      if(result.zones) state.warehouse.zones = result.zones;
      repaintWarehouse();
      try{ await api('/api/warehouse/available-items', {method:'GET'}).then(avail => { state.warehouse.availableItems = Array.isArray(avail.items)?avail.items:[]; if($('warehouse-unplaced-pill')) $('warehouse-unplaced-pill').textContent = `未錄入倉庫圖：${state.warehouse.availableItems.length}`; }); }catch(_e){}
    }else{
      await loadWarehouseDynamic(true);
    }
  }

  window.insertWarehouseCell = async function(zone, col, slotNum){
    ensureState();
    try{
      const result = await api('/api/warehouse/add-slot', { method:'POST', body: JSON.stringify({ zone, column_index: Number(col), insert_after: Number(slotNum || 0) }) });
      await reloadFromResultOrFetch(result);
      const newSlot = Number(result?.slot_number || (Number(slotNum || 0)+1));
      notify(`已在 ${zone} 區第 ${col} 欄插入第 ${String(newSlot).padStart(2,'0')} 格`, 'ok');
      setTimeout(()=>{ try{ window.highlightWarehouseCell(zone, col, newSlot); }catch(_e){} }, 80);
      return result;
    }catch(e){ notify(e.message || '插入格子失敗', 'error'); }
  };

  window.deleteWarehouseCell = async function(zone, col, slotNum){
    ensureState();
    const items = window.getCellItems(zone, col, slotNum);
    if(items.length){ notify('格子內還有商品，請先移除商品後再刪除格子', 'warn'); return; }
    const ok = window.confirm ? window.confirm(`確定刪除 ${zone} 區第 ${col} 欄第 ${String(slotNum).padStart(2,'0')} 格？後面的格號會自動往前補。`) : true;
    if(!ok) return;
    try{
      const result = await api('/api/warehouse/remove-slot', { method:'POST', body: JSON.stringify({ zone, column_index: Number(col), slot_number: Number(slotNum) }) });
      await reloadFromResultOrFetch(result);
      notify(`已刪除 ${zone} 區第 ${col} 欄第 ${String(slotNum).padStart(2,'0')} 格`, 'ok');
      return result;
    }catch(e){ notify(e.message || '刪除格子失敗', 'error'); }
  };

  // 舊的欄位 + / - 呼叫保留相容，但不再顯示欄位按鈕；新增預設插在最後，刪除預設刪最後一格。
  window.addWarehouseVisualSlot = async function(zone, col, insertAfter){
    const after = Number(insertAfter || maxSlot(zone, col) || 0);
    return window.insertWarehouseCell(zone, col, after);
  };
  window.removeWarehouseVisualSlot = async function(zone, col, slotNum){
    const target = Number(slotNum || maxSlot(zone, col) || 1);
    return window.deleteWarehouseCell(zone, col, target);
  };

  const oldShowDetail = typeof window.showWarehouseDetail === 'function' ? window.showWarehouseDetail : null;
  window.showWarehouseDetail = function(zone, col, num, items){
    const box = $('warehouse-detail-panel');
    if(!box){ return oldShowDetail ? oldShowDetail.apply(this, arguments) : null; }
    const safeItems = Array.isArray(items) ? items : window.getCellItems(zone, col, num);
    box.classList.remove('hidden');
    const cards = safeItems.length ? safeItems.map(it => {
      const row = typeof window.formatCustomerProductRow === 'function' ? window.formatCustomerProductRow(it.product_text || '') : { size: it.product_text || '' };
      return `<div class="deduct-card"><div><strong>${esc(it.customer_name || '未指定客戶')}</strong></div><div>${esc(it.product_text || '')}</div><div>尺寸：${esc(row.size || '')}</div><div>材質：${esc((it.material || row.material || '未填'))}</div><div>數量：${Number(it.qty || 0)}</div><div class="small-note">格位：${zone}-${col}-${String(num).padStart(2,'0')}</div></div>`;
    }).join('') : '<div class="empty-state-card compact-empty">此格目前沒有商品</div>';
    box.innerHTML = `<div class="section-title">${zone} 區第 ${col} 欄 第 ${String(num).padStart(2,'0')} 格</div>
      <div class="btn-row compact-row yx67-detail-actions">
        <button class="ghost-btn tiny-btn" type="button" onclick="openWarehouseModal('${zone}', ${Number(col)}, ${Number(num)})">直接編輯此格</button>
        <button class="ghost-btn tiny-btn" type="button" onclick="insertWarehouseCell('${zone}', ${Number(col)}, ${Number(num)})">插入格子</button>
        <button class="ghost-btn tiny-btn" type="button" onclick="deleteWarehouseCell('${zone}', ${Number(col)}, ${Number(num)})">刪除格子</button>
      </div>${cards}`;
  };

  window.searchWarehouse = async function(){
    ensureState();
    const q = ($('warehouse-search')?.value || '').trim();
    const box = $('warehouse-search-results');
    if(!q){ state.searchHighlightKeys = new Set(); box?.classList.add('hidden'); repaintWarehouse(); return; }
    try{
      const data = await api(`/api/warehouse/search?q=${encodeURIComponent(q)}`, {method:'GET'});
      const hits = Array.isArray(data.items) ? data.items : [];
      state.searchHighlightKeys = new Set(hits.map(r => `${r.cell.zone}|${r.cell.column_index}|direct|${r.cell.slot_number}`));
      repaintWarehouse();
      if(!box) return;
      box.classList.remove('hidden');
      box.innerHTML = hits.length ? '' : '<div class="search-card">沒有找到資料</div>';
      if(hits[0]?.cell && typeof window.setWarehouseZone === 'function') window.setWarehouseZone(hits[0].cell.zone, false);
      hits.forEach(r => {
        const cell=r.cell || {}; const item=r.item || {};
        const div=document.createElement('div');
        div.className='search-card warehouse-search-hit';
        div.innerHTML=`<strong>${esc(cell.zone)}區 第 ${cell.column_index} 欄 第 ${String(cell.slot_number).padStart(2,'0')} 格</strong><br>${esc(item.customer_name || '未指定客戶')}｜${esc(item.product_text || '')} × ${Number(item.qty || 0)}`;
        div.onclick=()=>{ if(typeof window.setWarehouseZone==='function') window.setWarehouseZone(cell.zone); setTimeout(()=>{ try{ window.highlightWarehouseCell(cell.zone, cell.column_index, cell.slot_number); }catch(_e){} try{ window.openWarehouseModal(cell.zone, cell.column_index, cell.slot_number); }catch(_e){} },90); };
        box.appendChild(div);
      });
    }catch(e){ notify(e.message || '搜尋失敗', 'error'); }
  };

  window.clearWarehouseHighlights = function(){
    ensureState();
    state.searchHighlightKeys = new Set();
    $('warehouse-search-results')?.classList.add('hidden');
    $('warehouse-unplaced-list-inline')?.classList.add('hidden');
    repaintWarehouse();
  };

  window.toggleWarehouseUnplacedHighlight = function(){
    ensureState();
    const box = $('warehouse-unplaced-list-inline');
    const items = state.warehouse.availableItems || [];
    if(!box) return;
    box.classList.remove('hidden');
    box.innerHTML = '';
    if(!items.length){ box.innerHTML='<div class="search-card">目前沒有未錄入倉庫圖商品</div>'; return; }
    items.forEach(it => {
      const div=document.createElement('div');
      div.className='search-card';
      div.innerHTML=`<strong>${esc(it.customer_name || '未指定客戶')}</strong><br>${esc(it.product_text || '')}｜未錄入數量 ${Number(it.unplaced_qty || it.qty || 0)}`;
      div.onclick=async()=>{ if($('warehouse-search')) $('warehouse-search').value = it.product_text || ''; await window.searchWarehouse(); };
      box.appendChild(div);
    });
  };

  window.highlightWarehouseSameCustomer = function(){
    ensureState();
    const q = ($('warehouse-search')?.value || '').trim();
    if(!q) return notify('請先在搜尋框輸入客戶名', 'warn');
    const keys = new Set();
    (state.warehouse.cells || []).forEach(cell => {
      const items = parseItems(cell.items_json);
      if(items.some(it => String(it.customer_name || '').includes(q))) keys.add(`${cell.zone}|${cell.column_index}|direct|${cell.slot_number}`);
    });
    state.searchHighlightKeys = keys;
    repaintWarehouse();
  };

  function boot(){
    try{ document.documentElement.dataset.yxFix67=VERSION; document.body && document.body.setAttribute('data-yx-fix67','1'); }catch(_e){}
    document.querySelectorAll('.warehouse-col-tools').forEach(el => el.remove());
    const mod = document.querySelector('.module-screen')?.dataset.module || (typeof window.currentModule==='function' ? window.currentModule() : '');
    if(mod === 'warehouse') setTimeout(()=>loadWarehouseDynamic(true), 20);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot, {once:true}); else boot();
})();
/* ==== FIX67 end ==== */


/* ==== FIX68: button response guarantee + old-data conflict convergence ==== */
(function(){
  'use strict';
  const VERSION='fix70-final-conflict-convergence';
  if(window.__YX68_BUTTON_RESPONSE_PATCH__) return;
  window.__YX68_BUTTON_RESPONSE_PATCH__=true;
  try{ document.documentElement.dataset.yxFix68=VERSION; document.body && document.body.setAttribute('data-yx-fix68','1'); }catch(_e){}

  const $ = id => document.getElementById(id);
  const esc = s => (window.escapeHTML ? window.escapeHTML(s) : String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])));
  const api = window.requestJSON || (async function(url,opt={}){
    const r=await fetch(url,{credentials:'same-origin',...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}});
    const d=await r.json().catch(()=>({}));
    if(!r.ok || d.success===false) throw new Error(d.error||d.message||`請求失敗：${r.status}`);
    return d;
  });
  const notify = (msg, kind='ok') => { try{ (window.toast || window.showToast || function(m){ alert(m); })(msg, kind); }catch(_e){ console.log(msg); } };
  const mod = () => document.querySelector('.module-screen')?.dataset.module || (typeof window.currentModule==='function' ? window.currentModule() : '');

  function setBusy(btn, on, text){
    if(!btn) return;
    if(on){
      if(!btn.dataset.yx68OriginalText) btn.dataset.yx68OriginalText = btn.textContent || '';
      btn.classList.add('yx68-busy');
      btn.setAttribute('aria-busy','true');
      if(text) btn.textContent = text;
    }else{
      btn.classList.remove('yx68-busy');
      btn.removeAttribute('aria-busy');
      if(btn.dataset.yx68OriginalText){ btn.textContent = btn.dataset.yx68OriginalText; delete btn.dataset.yx68OriginalText; }
    }
  }
  function tapFeedback(el){
    if(!el) return;
    try{
      el.classList.add('yx68-tapped');
      setTimeout(()=>el.classList.remove('yx68-tapped'), 180);
    }catch(_e){}
  }

  function nonEmptyLines(){
    const box=$('ocr-text');
    return (box?.value || '').split(/\n+/).map(s=>s.trim()).filter(Boolean);
  }
  function writeLines(lines){
    const box=$('ocr-text');
    if(!box) return;
    box.value = (lines || []).filter(Boolean).join('\n');
    box.dispatchEvent(new Event('input',{bubbles:true}));
    try{ if(typeof window.renderShipSelectedItems==='function') window.renderShipSelectedItems(); }catch(_e){}
    try{ if(typeof window.loadShipPreview==='function') window.loadShipPreview(); }catch(_e){}
  }
  window.clearShipSelectedItems = window.clearShipSelectedItems || function(){
    writeLines([]);
    try{ if(window.state) window.state.shipPreview = null; }catch(_e){}
    const p=$('ship-preview-panel'); if(p){ p.innerHTML=''; p.classList.add('hidden'); }
    notify('已清空已選商品','ok');
  };
  window.removeShipItemAt = window.removeShipItemAt || function(idx){
    const lines=nonEmptyLines();
    idx=Number(idx);
    if(idx>=0 && idx<lines.length){ lines.splice(idx,1); writeLines(lines); notify('已移除商品','ok'); }
  };
  window.moveShipItem = window.moveShipItem || function(idx, dir){
    const lines=nonEmptyLines();
    idx=Number(idx); dir=Number(dir)||0;
    const to=idx+dir;
    if(idx<0 || idx>=lines.length || to<0 || to>=lines.length) return;
    const [item]=lines.splice(idx,1); lines.splice(to,0,item); writeLines(lines); notify('已調整順序','ok');
  };
  window.quickJumpToModule = window.quickJumpToModule || function(target, customerName='', productText=''){
    const map={inventory:'/inventory',orders:'/orders','master_order':'/master-order',master:'/master-order',ship:'/ship',warehouse:'/warehouse',customers:'/customers',shipping_query:'/shipping-query',todos:'/todos'};
    const finalTarget = target === 'master' ? 'master_order' : target;
    try{ localStorage.setItem('moduleQuickJump', JSON.stringify({target:finalTarget, customerName:customerName||'', productText:productText||'', at:Date.now()})); }catch(_e){}
    location.href = map[target] || map[finalTarget] || '/';
  };

  window.loadShippingRecords = window.loadShippingRecords || async function(){
    const box=$('shipping-results');
    const btn=document.activeElement && document.activeElement.tagName==='BUTTON' ? document.activeElement : null;
    try{
      setBusy(btn,true,'查詢中…');
      if(box){ box.innerHTML='<div class="empty-state-card compact-empty">出貨紀錄載入中…</div>'; }
      const q=($('ship-keyword')?.value||'').trim();
      const range=($('ship-range')?.value||'7').trim();
      let start=($('ship-start')?.value||'').trim();
      let end=($('ship-end')?.value||'').trim();
      if(range && range!=='custom'){
        const days=Math.max(1, Number(range)||7);
        const d=new Date();
        end=d.toISOString().slice(0,10);
        d.setDate(d.getDate()-(days-1));
        start=d.toISOString().slice(0,10);
        if($('ship-start')) $('ship-start').value=start;
        if($('ship-end')) $('ship-end').value=end;
      }
      const qs=new URLSearchParams();
      if(q) qs.set('q',q); if(start) qs.set('start_date',start); if(end) qs.set('end_date',end);
      const data=await api('/api/shipping_records?'+qs.toString(),{method:'GET'});
      const rows=Array.isArray(data.items)?data.items:(data.records||[]);
      if(!box) return rows;
      if(!rows.length){ box.innerHTML='<div class="empty-state-card compact-empty">查無出貨紀錄</div>'; return rows; }
      box.innerHTML = `<div class="yx68-scroll-table"><table class="yx68-record-table"><thead><tr><th>時間</th><th>客戶</th><th>商品</th><th>數量</th><th>操作人</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.shipped_at||r.created_at||'')}</td><td>${esc(r.customer_name||'')}</td><td>${esc(r.product_text||'')}</td><td>${Number(r.qty||0)}</td><td>${esc(r.operator||'')}</td></tr>`).join('')}</tbody></table></div>`;
      return rows;
    }catch(e){ if(box) box.innerHTML=`<div class="error-card">${esc(e.message||'查詢失敗')}</div>`; notify(e.message||'查詢失敗','error'); }
    finally{ setBusy(btn,false); }
  };

  window.openArchivedCustomersModal = window.openArchivedCustomersModal || async function(){
    let modal=$('yx68-archived-customers-modal');
    if(!modal){
      modal=document.createElement('div');
      modal.id='yx68-archived-customers-modal';
      modal.className='modal hidden';
      modal.innerHTML=`<div class="modal-card glass yx68-archived-card"><div class="modal-head"><div class="section-title">封存客戶</div><button type="button" class="icon-btn" data-yx68-close-archived>✕</button></div><div id="yx68-archived-customers-body" class="card-list"><div class="empty-state-card compact-empty">載入中…</div></div></div>`;
      document.body.appendChild(modal);
      modal.addEventListener('click',e=>{ if(e.target===modal || e.target.closest('[data-yx68-close-archived]')) modal.classList.add('hidden'); });
    }
    const body=$('yx68-archived-customers-body');
    modal.classList.remove('hidden');
    if(body) body.innerHTML='<div class="empty-state-card compact-empty">封存客戶載入中…</div>';
    try{
      const d=await api('/api/customers/archived',{method:'GET'});
      const items=Array.isArray(d.items)?d.items:[];
      if(!body) return;
      body.innerHTML = items.length ? items.map(c=>`<div class="deduct-card"><strong>${esc(c.name||'')}</strong><div class="small-note">${esc(c.region||'')}｜${esc(c.phone||'')}</div><button type="button" class="ghost-btn small-btn" data-yx68-restore-customer="${esc(c.name||'')}">還原</button></div>`).join('') : '<div class="empty-state-card compact-empty">目前沒有封存客戶</div>';
    }catch(e){ if(body) body.innerHTML=`<div class="error-card">${esc(e.message||'封存客戶讀取失敗')}</div>`; }
  };

  window.changePassword = window.changePassword || async function(){
    const msg=$('settings-msg'); const btn=document.activeElement && document.activeElement.tagName==='BUTTON' ? document.activeElement : null;
    const old_password=($('old-password')?.value||'').trim();
    const new_password=($('new-password')?.value||'').trim();
    const confirm_password=($('confirm-password')?.value||'').trim();
    try{
      setBusy(btn,true,'儲存中…');
      await api('/api/change_password',{method:'POST',body:JSON.stringify({old_password,new_password,confirm_password})});
      if(msg){ msg.textContent='密碼已更新'; msg.className='alert ok'; msg.classList.remove('hidden'); }
      notify('密碼已更新','ok');
      ['old-password','new-password','confirm-password'].forEach(id=>{ if($(id)) $(id).value=''; });
    }catch(e){ if(msg){ msg.textContent=e.message||'修改失敗'; msg.className='alert error'; msg.classList.remove('hidden'); } notify(e.message||'修改失敗','error'); }
    finally{ setBusy(btn,false); }
  };
  window.undoLastAction = window.undoLastAction || async function(){
    const box=$('undo-msg'); const btn=document.activeElement && document.activeElement.tagName==='BUTTON' ? document.activeElement : null;
    try{ setBusy(btn,true,'還原中…'); const d=await api('/api/undo-last',{method:'POST',body:JSON.stringify({})}); if(box) box.textContent=d.message||d.summary||'已還原上一筆'; notify(box?.textContent||'已還原','ok'); }
    catch(e){ if(box) box.textContent=e.message||'還原失敗'; notify(e.message||'還原失敗','error'); }
    finally{ setBusy(btn,false); }
  };
  window.downloadReport = window.downloadReport || function(type){
    const qs=new URLSearchParams(); qs.set('type',type||'inventory');
    const s=($('report-start')?.value||'').trim(); const e=($('report-end')?.value||'').trim();
    if(s) qs.set('start_date',s); if(e) qs.set('end_date',e);
    notify('正在準備報表下載…','ok');
    location.href='/api/reports/export?'+qs.toString();
  };
  window.loadAuditTrails = window.loadAuditTrails || async function(){
    const box=$('audit-trails-list'); const btn=document.activeElement && document.activeElement.tagName==='BUTTON' ? document.activeElement : null;
    try{
      setBusy(btn,true,'載入中…'); if(box) box.innerHTML='<div class="empty-state-card compact-empty">操作紀錄載入中…</div>';
      const qs=new URLSearchParams();
      const map={'audit-q':'q','audit-user':'username','audit-entity':'entity_type','audit-start':'start_date','audit-end':'end_date'};
      Object.entries(map).forEach(([id,k])=>{ const v=($(id)?.value||'').trim(); if(v) qs.set(k,v); });
      const d=await api('/api/audit-trails?'+qs.toString(),{method:'GET'}); const items=Array.isArray(d.items)?d.items:[];
      if(!box) return;
      box.innerHTML = items.length ? items.map(it=>`<div class="deduct-card"><strong>${esc(it.action_label||it.action_type||'操作')}</strong><div>${esc(it.summary_text||it.entity_key||'')}</div><div class="small-note">${esc(it.created_at||'')}｜${esc(it.username||'')}｜${esc(it.entity_label||it.entity_type||'')}</div></div>`).join('') : '<div class="empty-state-card compact-empty">沒有操作紀錄</div>';
    }catch(e){ if(box) box.innerHTML=`<div class="error-card">${esc(e.message||'操作紀錄載入失敗')}</div>`; notify(e.message||'操作紀錄載入失敗','error'); }
    finally{ setBusy(btn,false); }
  };
  window.loadAdminUsers = window.loadAdminUsers || async function(){
    const box=$('admin-users'); const btn=document.activeElement && document.activeElement.tagName==='BUTTON' ? document.activeElement : null;
    try{
      setBusy(btn,true,'載入中…'); if(box) box.innerHTML='<div class="empty-state-card compact-empty">帳號載入中…</div>';
      const d=await api('/api/admin/users',{method:'GET'}); const users=Array.isArray(d.items)?d.items:[];
      if(!box) return;
      box.innerHTML = users.length ? `<div class="yx68-scroll-table"><table class="yx68-record-table"><thead><tr><th>帳號</th><th>角色</th><th>狀態</th><th>操作</th></tr></thead><tbody>${users.map(u=>`<tr><td>${esc(u.username||'')}</td><td>${esc(u.role||'')}</td><td>${Number(u.is_blocked||0)?'黑名單':'正常'}</td><td>${(u.username==='陳韋廷')?'管理員':`<button type="button" class="ghost-btn tiny-btn" data-yx68-block-user="${esc(u.username||'')}" data-blocked="${Number(u.is_blocked||0)?0:1}">${Number(u.is_blocked||0)?'解除':'封鎖'}</button>`}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty-state-card compact-empty">沒有帳號</div>';
    }catch(e){ if(box) box.innerHTML=`<div class="error-card">${esc(e.message||'帳號載入失敗')}</div>`; notify(e.message||'帳號載入失敗','error'); }
    finally{ setBusy(btn,false); }
  };
  async function loadBackups(){
    const box=$('backup-panel'); if(!box) return;
    try{ const d=await api('/api/backups',{method:'GET'}); const files=Array.isArray(d.files)?d.files:[]; box.innerHTML=files.length?files.map(f=>`<div class="deduct-card"><strong>${esc(f.filename||'')}</strong><div class="small-note">${esc(f.created_at||'')}｜${Number(f.size||0).toLocaleString()} bytes</div><div class="btn-row compact-row"><a class="ghost-btn tiny-btn" href="/api/backups/download/${encodeURIComponent(f.filename||'')}">下載</a><button type="button" class="ghost-btn tiny-btn danger-btn" data-yx68-restore-backup="${esc(f.filename||'')}">還原</button></div></div>`).join(''):'<div class="empty-state-card compact-empty">尚無備份</div>'; }
    catch(e){ box.innerHTML=`<div class="error-card">${esc(e.message||'備份清單載入失敗')}</div>`; }
  }
  window.createBackup = window.createBackup || async function(){
    const btn=document.activeElement && document.activeElement.tagName==='BUTTON' ? document.activeElement : null;
    try{ setBusy(btn,true,'備份中…'); await api('/api/backup',{method:'POST',body:JSON.stringify({})}); notify('備份已建立','ok'); await loadBackups(); }
    catch(e){ notify(e.message||'備份失敗','error'); }
    finally{ setBusy(btn,false); }
  };
  window.logout = window.logout || async function(){
    try{ await api('/api/logout',{method:'POST',body:JSON.stringify({})}); }catch(_e){}
    location.href='/login';
  };

  function todayKindLabel(kind){ return ({inbound:'進貨',outbound:'出貨',orders:'新增訂單',unplaced:'未錄入',all:'全部'})[kind]||kind; }
  async function deleteTodayLog(id){
    if(!id) return;
    if(window.confirm && !window.confirm('確定刪除這筆異動？')) return;
    await api('/api/today-changes/'+encodeURIComponent(id),{method:'DELETE'});
    await window.loadTodayChanges();
    notify('已刪除異動','ok');
  }
  window.loadTodayChanges = window.loadTodayChanges || async function(){
    const summaryBox=$('today-summary-cards');
    try{
      const d=await api('/api/today-changes',{method:'GET'});
      const s=d.summary||{};
      if($('today-unread-badge')) $('today-unread-badge').textContent=String(s.unread_count||0);
      if(summaryBox){
        summaryBox.innerHTML=`<div class="card"><div class="title">新增</div><div class="sub">${Number(s.inbound_count||0)}</div></div><div class="card"><div class="title">出貨</div><div class="sub">${Number(s.outbound_count||0)}</div></div><div class="card"><div class="title">新增訂單</div><div class="sub">${Number(s.new_order_count||0)}</div></div><div class="card"><div class="title">未錄入倉庫圖</div><div class="sub">${Number(s.unplaced_count||0)}</div></div>`;
      }
      const readAt=d.read_at||'';
      const onlyUnread=(localStorage.getItem('yxTodayOnlyUnread')==='1');
      const makeLog = r => {
        const unread=!readAt || String(r.created_at||'')>readAt;
        if(onlyUnread && !unread) return '';
        return `<div class="today-item deduct-card${unread?' yx68-unread':''}" data-log-id="${Number(r.id||0)}"><strong>${esc(r.action||'異動')}</strong><div class="small-note">${esc(r.created_at||'')}｜${esc(r.username||'')}</div><button type="button" class="ghost-btn tiny-btn danger-btn" data-yx68-delete-today="${Number(r.id||0)}">刪除</button></div>`;
      };
      const fill=(id, rows, empty)=>{ const el=$(id); if(el) el.innerHTML=(rows||[]).map(makeLog).join('') || `<div class="empty-state-card compact-empty">${empty}</div>`; };
      fill('today-inbound-list', d.feed?.inbound, '今天沒有進貨/新增資料');
      fill('today-outbound-list', d.feed?.outbound, '今天沒有出貨');
      fill('today-order-list', d.feed?.new_orders, '今天沒有新增訂單');
      const unplaced=$('today-unplaced-list');
      if(unplaced){
        const arr=Array.isArray(d.unplaced_items)?d.unplaced_items:[];
        unplaced.innerHTML=arr.length?arr.map(it=>`<div class="deduct-card"><strong>${esc(it.product_text||'')}</strong><div class="small-note">${esc(it.customer_name||'未指定客戶')}｜未錄入 ${Number(it.qty||0)}</div></div>`).join(''):'<div class="empty-state-card compact-empty">目前沒有未錄入倉庫圖商品</div>';
      }
      try{ await api('/api/today-changes/read',{method:'POST',body:JSON.stringify({})}); }catch(_e){}
      return d;
    }catch(e){
      if(summaryBox) summaryBox.innerHTML=`<div class="error-card">${esc(e.message||'今日異動載入失敗')}</div>`;
      notify(e.message||'今日異動載入失敗','error');
    }
  };

  // 所有按鈕 / 連結先給即時按壓反饋，避免手機端看起來「沒反應」。
  document.addEventListener('click', function(e){
    const btn = e.target.closest && e.target.closest('button,.menu-btn,.home-mini-btn,a.back-btn,.chip,.interactive-pill,[role="button"]');
    if(!btn) return;
    if(btn.tagName==='BUTTON' && !btn.getAttribute('type')) btn.setAttribute('type','button');
    tapFeedback(btn);
  }, true);

  // 針對動態產生的按鈕補事件委派，避免舊 HTML / 舊資料仍指向失效事件。
  document.addEventListener('click', async function(e){
    const restoreCustomer=e.target.closest && e.target.closest('[data-yx68-restore-customer]');
    if(restoreCustomer){
      e.preventDefault(); e.stopPropagation();
      const name=restoreCustomer.getAttribute('data-yx68-restore-customer')||'';
      try{ setBusy(restoreCustomer,true,'還原中…'); await api('/api/customers/'+encodeURIComponent(name)+'/restore',{method:'POST',body:JSON.stringify({})}); notify('客戶已還原','ok'); await window.openArchivedCustomersModal(); if(typeof window.renderCustomers==='function') window.renderCustomers(); }
      catch(err){ notify(err.message||'還原失敗','error'); }
      finally{ setBusy(restoreCustomer,false); }
      return;
    }
    const block=e.target.closest && e.target.closest('[data-yx68-block-user]');
    if(block){
      e.preventDefault(); e.stopPropagation();
      try{ setBusy(block,true,'處理中…'); await api('/api/admin/block',{method:'POST',body:JSON.stringify({username:block.getAttribute('data-yx68-block-user'), blocked:block.getAttribute('data-blocked')==='1'})}); notify('帳號狀態已更新','ok'); await window.loadAdminUsers(); }
      catch(err){ notify(err.message||'更新失敗','error'); }
      finally{ setBusy(block,false); }
      return;
    }
    const restoreBackup=e.target.closest && e.target.closest('[data-yx68-restore-backup]');
    if(restoreBackup){
      e.preventDefault(); e.stopPropagation();
      const filename=restoreBackup.getAttribute('data-yx68-restore-backup')||'';
      if(window.confirm && !window.confirm('確定要還原這份備份？目前資料會被覆蓋。')) return;
      try{ setBusy(restoreBackup,true,'還原中…'); await api('/api/backups/restore',{method:'POST',body:JSON.stringify({filename})}); notify('備份已還原','ok'); }
      catch(err){ notify(err.message||'還原失敗','error'); }
      finally{ setBusy(restoreBackup,false); }
      return;
    }
    const delToday=e.target.closest && e.target.closest('[data-yx68-delete-today]');
    if(delToday){ e.preventDefault(); e.stopPropagation(); try{ await deleteTodayLog(delToday.getAttribute('data-yx68-delete-today')); }catch(err){ notify(err.message||'刪除失敗','error'); } return; }
  }, true);

  function convergeOldWarehouseButtons(){
    // 舊版欄位 +/-、固定 20 格控制全部以目前「格子內插入 / 刪除」為準。
    document.querySelectorAll('.warehouse-col-tools,.warehouse-add-slot,.warehouse-remove-slot,.yx-old-warehouse-plusminus,[data-action="add-slot"],[data-action="remove-slot"]').forEach(el=>el.remove());
    document.querySelectorAll('.yx67-insert-btn,.yx67-delete-btn').forEach(btn=>{ btn.style.display=''; btn.disabled=false; btn.type='button'; });
  }
  function boot(){
    try{ document.documentElement.dataset.yxFix68=VERSION; document.body && document.body.setAttribute('data-yx-fix68','1'); }catch(_e){}
    document.querySelectorAll('button:not([type])').forEach(b=>b.setAttribute('type','button'));
    convergeOldWarehouseButtons();
    const m=mod();
    if(false && location.pathname.includes('/today-changes')) setTimeout(()=>window.loadTodayChanges(),40);
    if(location.pathname.includes('/settings')){
      setTimeout(()=>{ try{ window.loadAuditTrails && window.loadAuditTrails(); }catch(_e){} try{ window.loadAdminUsers && window.loadAdminUsers(); }catch(_e){} try{ loadBackups(); }catch(_e){} },80);
    }
    if(m==='shipping_query') setTimeout(()=>{ try{ window.loadShippingRecords(); }catch(_e){} },80);
    if(m==='warehouse') setTimeout(convergeOldWarehouseButtons,200);
  }
  const mo=new MutationObserver(()=>{ try{ convergeOldWarehouseButtons(); }catch(_e){} });
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot, {once:true}); else boot();
  try{ mo.observe(document.body||document.documentElement,{childList:true,subtree:true}); }catch(_e){}

  document.addEventListener('click', function(e){
    const filter=e.target.closest && e.target.closest('[data-today-filter]');
    if(filter){
      const kind=filter.getAttribute('data-today-filter')||'all';
      document.querySelectorAll('[data-today-filter]').forEach(b=>b.classList.toggle('active',b===filter));
      document.querySelectorAll('[data-today-panel]').forEach(p=>{ p.style.display = (kind==='all' || p.getAttribute('data-today-panel')===kind) ? '' : 'none'; });
      notify(`已切換：${todayKindLabel(kind)}`,'ok');
    }
    if(e.target && e.target.id==='today-unread-toggle'){
      const next=localStorage.getItem('yxTodayOnlyUnread')==='1'?'0':'1';
      localStorage.setItem('yxTodayOnlyUnread',next);
      e.target.classList.toggle('active',next==='1');
      window.loadTodayChanges();
    }
    if(e.target && e.target.id==='today-clear-read-btn'){
      api('/api/today-changes/read',{method:'POST',body:JSON.stringify({})}).then(()=>{ notify('已清除未讀數','ok'); window.loadTodayChanges(); }).catch(err=>notify(err.message||'清除失敗','error'));
    }
  }, true);
})();
/* ==== FIX68 end ==== */



/* ==== FIX69: final UI/button convergence + missing helper repair ==== */
(function(){
  'use strict';
  const VERSION = 'fix70-final-conflict-convergence';
  if (window.__YX69_UI_BUTTON_FINAL__) return;
  window.__YX69_UI_BUTTON_FINAL__ = true;

  const doc = document;
  const byId = id => doc.getElementById(id);
  const esc = s => (window.escapeHTML ? window.escapeHTML(s) : String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])));
  const notify = (msg, kind='ok') => { try { (window.toast || window.showToast || function(m){ console.log(m); })(msg, kind); } catch(_e){ console.log(msg); } };
  const api = window.requestJSON || (async function(url, opt={}){
    const isFD = opt.body instanceof FormData;
    const headers = isFD ? (opt.headers || {}) : {'Content-Type':'application/json', ...(opt.headers || {})};
    const res = await fetch(url, {credentials:'same-origin', ...opt, headers});
    const data = await res.json().catch(()=>({}));
    if(!res.ok || data.success === false) throw new Error(data.error || data.message || `請求失敗：${res.status}`);
    return data;
  });
  window.yxApi = api;

  function setFixFlag(){
    try{
      doc.documentElement.dataset.yxFix69 = VERSION;
      if(doc.body) doc.body.setAttribute('data-yx-fix69','1');
      if(doc.body) doc.body.setAttribute('data-yx-fix68','1');
    }catch(_e){}
  }
  setFixFlag();

  // Missing helper repair: old merged files referenced these names but did not always define them.
  window.qsa = window.qsa || function(selector, root){ return Array.from((root || doc).querySelectorAll(selector)); };
  window.askConfirm = window.askConfirm || async function(message, title='確認', okText='確認', cancelText='取消'){
    const modal = byId('confirm-modal');
    if(!modal) return window.confirm ? window.confirm(message || title || '確認？') : true;
    return new Promise(resolve => {
      const msg = byId('confirm-message');
      const ttl = byId('confirm-title');
      const ok = byId('confirm-ok-btn');
      const cancel = byId('confirm-cancel-btn');
      if(ttl) ttl.textContent = title || '確認';
      if(msg) msg.textContent = message || '';
      if(ok) ok.textContent = okText || '確認';
      if(cancel) cancel.textContent = cancelText || '取消';
      const done = v => {
        modal.classList.add('hidden');
        if(ok) ok.onclick = null;
        if(cancel) cancel.onclick = null;
        resolve(v);
      };
      if(ok) ok.onclick = () => done(true);
      if(cancel) cancel.onclick = () => done(false);
      modal.classList.remove('hidden');
    });
  };
  window.setTodoButtonLoading = window.setTodoButtonLoading || function(on){
    const btn = byId('todo-save-btn');
    if(!btn) return;
    btn.disabled = !!on;
    btn.classList.toggle('yx69-busy', !!on);
    btn.textContent = on ? '新增中…' : '新增代辦';
  };
  window.sortTodoItems = window.sortTodoItems || function(items){
    const today = new Date().toISOString().slice(0,10);
    return [...(items || [])].sort((a,b)=>{
      const ad = Number(a.is_done||0), bd = Number(b.is_done||0);
      if(ad !== bd) return ad - bd;
      const at = a.due_date || '9999-12-31', bt = b.due_date || '9999-12-31';
      if(at !== bt) return at.localeCompare(bt);
      const ac = a.created_at || '', bc = b.created_at || '';
      return bc.localeCompare(ac);
    });
  };
  window.visualSlotToCell = window.visualSlotToCell || function(num){
    const n = Math.max(1, Number(num || 1));
    return n <= 10 ? { side:'front', slot:n } : { side:'back', slot:n - 10 };
  };
  window.splitManualRawLines = window.splitManualRawLines || function(text){
    return String(text || '').replace(/\r/g,'\n').split(/\n+/).map(s=>s.trim()).filter(Boolean);
  };
  window.normalizeOcrLine = window.normalizeOcrLine || function(line){
    return String(line || '').replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/[＋，,；;]/g,'+').replace(/\s+/g,'').trim();
  };
  window.extractCustomerNameFromText = window.extractCustomerNameFromText || function(text){
    const lines = String(text || '').split(/\n+/).map(s=>s.trim()).filter(Boolean);
    for(const line of lines){
      if(!/[=xXＸ×✕]/.test(line) && /[\u4e00-\u9fffA-Za-z]/.test(line)) return line.replace(/^(客戶|公司|客戶名稱)[:：]?/,'').trim();
    }
    return '';
  };
  window.mergeParsedDuplicates = window.mergeParsedDuplicates || function(items){
    const map = new Map();
    (items || []).forEach(it=>{
      const key = String(it.product_text || it.product_code || '').trim();
      if(!key) return;
      const old = map.get(key) || {...it, qty:0};
      old.qty = (Number(old.qty||0) || 0) + (Number(it.qty||0) || 0);
      old.product_text = old.product_text || key;
      old.product_code = old.product_code || key;
      map.set(key, old);
    });
    return Array.from(map.values());
  };
  window.sortParsedItems = window.sortParsedItems || function(items){
    const dim = it => {
      const left = String(it.product_text || it.product_code || '').split('=')[0] || '';
      const nums = (left.match(/\d+(?:\.\d+)?/g) || []).map(Number);
      return {l:nums[0]||0,w:nums[1]||0,h:nums[2]||0};
    };
    return [...(items || [])].sort((a,b)=>{
      const da=dim(a), db=dim(b);
      return (da.h-db.h) || (da.w-db.w) || (da.l-db.l) || String(a.product_text||'').localeCompare(String(b.product_text||''),'zh-Hant',{numeric:true});
    });
  };
  window.normalizeShipTextareaItems = window.normalizeShipTextareaItems || function(items){
    return (items || []).map(it=>{
      const txt = window.yxNormalizeProductText ? window.yxNormalizeProductText(it.product_text || it.product_code || '') : String(it.product_text || it.product_code || '').trim();
      return { ...it, product_text: txt, product_code: it.product_code || txt, qty: Math.max(1, Number(it.qty || 1) || 1) };
    }).filter(it=>it.product_text);
  };
  window.syncShipItemsToTextarea = window.syncShipItemsToTextarea || function(items){
    const box = byId('ocr-text');
    if(!box) return;
    box.value = (window.normalizeShipTextareaItems(items) || []).map(it=>it.product_text).filter(Boolean).join('\n');
    box.dispatchEvent(new Event('input', {bubbles:true}));
    try{ window.renderShipSelectedItems && window.renderShipSelectedItems(); }catch(_e){}
    try{ window.loadShipPreview && window.loadShipPreview(); }catch(_e){}
  };
  window.applyFormattedTextarea = window.applyFormattedTextarea || function(){
    const box = byId('ocr-text');
    if(!box) return;
    try{
      if(typeof window.formatManualEntryText === 'function'){
        const r = window.formatManualEntryText(box.value || '');
        if(r && r.formattedText) box.value = r.formattedText;
      }else if(window.yxNormalizeProductText){
        box.value = String(box.value || '').split(/\n+/).map(line=>window.yxNormalizeProductText(line)).join('\n');
      }
    }catch(_e){}
    box.dispatchEvent(new Event('input', {bubbles:true}));
  };

  // Login fallbacks, so the two login buttons never become dead if inline script order changes.
  window.toggleLoginSave = window.toggleLoginSave || function(){
    const next = localStorage.getItem('yxRememberLogin') === '0' ? '1' : '0';
    localStorage.setItem('yxRememberLogin', next);
    const lab = byId('remember-label');
    if(lab) lab.textContent = next === '1' ? '開' : '關';
    notify(`永久登入：${next === '1' ? '開' : '關'}`, 'ok');
  };
  window.yxDirectLogin = window.yxDirectLogin || async function(evt){
    if(evt){ evt.preventDefault(); evt.stopPropagation(); }
    const username = (byId('login-username')?.value || '').trim();
    const password = (byId('login-password')?.value || '').trim();
    const err = byId('login-error');
    const btn = byId('login-submit-btn');
    if(err){ err.classList.add('hidden'); err.textContent=''; }
    if(!username || !password){ if(err){ err.textContent='請輸入帳號與密碼'; err.classList.remove('hidden'); } return false; }
    try{
      if(btn){ btn.disabled=true; btn.textContent='登入中…'; }
      await api('/api/login', {method:'POST', body:JSON.stringify({username, password})});
      if(localStorage.getItem('yxRememberLogin') !== '0') localStorage.setItem('yxLastUsername', username);
      location.href = '/';
    }catch(e){
      if(err){ err.textContent=e.message || '登入失敗'; err.classList.remove('hidden'); }
      notify(e.message || '登入失敗', 'error');
    }finally{
      if(btn){ btn.disabled=false; btn.textContent='登入'; }
    }
    return false;
  };

  // Strong settings implementations. These intentionally override stale/partial copies.
  window.changePassword = async function(){
    const btn = getActiveButton();
    const msg = byId('settings-msg');
    try{
      setBusy(btn, true, '儲存中…');
      const old_password = (byId('old-password')?.value || '').trim();
      const new_password = (byId('new-password')?.value || '').trim();
      const confirm_password = (byId('confirm-password')?.value || '').trim();
      await api('/api/change_password', {method:'POST', body:JSON.stringify({old_password,new_password,confirm_password})});
      ['old-password','new-password','confirm-password'].forEach(id=>{ const el=byId(id); if(el) el.value=''; });
      if(msg){ msg.textContent='密碼已更新'; msg.className='alert ok'; msg.classList.remove('hidden'); }
      notify('密碼已更新', 'ok');
    }catch(e){
      if(msg){ msg.textContent=e.message || '修改失敗'; msg.className='alert error'; msg.classList.remove('hidden'); }
      notify(e.message || '修改失敗', 'error');
    }finally{ setBusy(btn, false); }
  };
  window.undoLastAction = async function(){
    const btn=getActiveButton(), box=byId('undo-msg');
    try{ setBusy(btn,true,'還原中…'); const d=await api('/api/undo-last',{method:'POST',body:'{}'}); if(box) box.textContent=d.message||d.summary||'已還原上一筆'; notify(box?.textContent || '已還原上一筆','ok'); }
    catch(e){ if(box) box.textContent=e.message||'還原失敗'; notify(e.message||'還原失敗','error'); }
    finally{ setBusy(btn,false); }
  };
  window.downloadReport = function(type){
    const qs = new URLSearchParams();
    qs.set('type', type || 'inventory');
    const s=(byId('report-start')?.value||'').trim(), e=(byId('report-end')?.value||'').trim();
    if(s) qs.set('start_date', s);
    if(e) qs.set('end_date', e);
    notify('正在下載報表…','ok');
    location.href = '/api/reports/export?' + qs.toString();
  };
  window.loadAuditTrails = async function(){
    const btn=getActiveButton(), box=byId('audit-trails-list');
    if(!box) return;
    try{
      setBusy(btn,true,'載入中…');
      box.innerHTML='<div class="empty-state-card compact-empty">操作紀錄載入中…</div>';
      const qs=new URLSearchParams();
      const map={'audit-q':'q','audit-user':'username','audit-entity':'entity_type','audit-start':'start_date','audit-end':'end_date'};
      Object.entries(map).forEach(([id,key])=>{ const v=(byId(id)?.value||'').trim(); if(v) qs.set(key,v); });
      qs.set('limit','200');
      const d=await api('/api/audit-trails?'+qs.toString(),{method:'GET'});
      const rows=Array.isArray(d.items)?d.items:[];
      box.innerHTML = rows.length ? rows.map(r=>`<div class="deduct-card yx69-audit-card"><strong>${esc(r.action || r.entity_type || '紀錄')}</strong><div class="small-note">${esc(r.created_at || '')}｜${esc(r.username || '')}</div><div class="small-note">${esc(r.entity_type || '')} ${esc(r.entity_id || '')}</div></div>`).join('') : '<div class="empty-state-card compact-empty">目前沒有操作紀錄</div>';
    }catch(e){ box.innerHTML=`<div class="error-card">${esc(e.message || '操作紀錄載入失敗')}</div>`; notify(e.message||'操作紀錄載入失敗','error'); }
    finally{ setBusy(btn,false); }
  };
  window.loadAdminUsers = async function(){
    const btn=getActiveButton(), box=byId('admin-users');
    if(!box) return;
    try{
      setBusy(btn,true,'載入中…');
      box.innerHTML='<div class="empty-state-card compact-empty">帳號名單載入中…</div>';
      const d=await api('/api/admin/users',{method:'GET'});
      const rows=Array.isArray(d.items)?d.items:[];
      box.innerHTML = rows.length ? `<div class="yx69-scroll-table"><table class="yx69-table"><thead><tr><th>帳號</th><th>角色</th><th>狀態</th><th>操作</th></tr></thead><tbody>${rows.map(u=>`<tr><td>${esc(u.username || u.name || '')}</td><td>${esc(u.role || '')}</td><td>${Number(u.is_blocked||0)?'已封鎖':'正常'}</td><td>${(u.username||u.name)==='陳韋廷'?'管理員':`<button type="button" class="ghost-btn tiny-btn" data-yx69-block-user="${esc(u.username||u.name||'')}" data-blocked="${Number(u.is_blocked||0)?0:1}">${Number(u.is_blocked||0)?'解除':'封鎖'}</button>`}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty-state-card compact-empty">目前沒有帳號</div>';
    }catch(e){ box.innerHTML=`<div class="error-card">${esc(e.message || '帳號名單載入失敗')}</div>`; notify(e.message||'帳號名單載入失敗','error'); }
    finally{ setBusy(btn,false); }
  };
  async function loadBackups69(){
    const box=byId('backup-panel');
    if(!box) return;
    try{
      const d=await api('/api/backups',{method:'GET'});
      const files=Array.isArray(d.files)?d.files:[];
      box.innerHTML = files.length ? files.map(f=>`<div class="deduct-card"><strong>${esc(f.filename||'')}</strong><div class="small-note">${esc(f.created_at||'')}｜${Number(f.size||0).toLocaleString()} bytes</div><div class="btn-row compact-row"><a class="ghost-btn tiny-btn" href="/api/backups/download/${encodeURIComponent(f.filename||'')}">下載</a><button type="button" class="ghost-btn tiny-btn danger-btn" data-yx69-restore-backup="${esc(f.filename||'')}">還原</button></div></div>`).join('') : '<div class="empty-state-card compact-empty">尚無備份</div>';
    }catch(e){ box.innerHTML=`<div class="error-card">${esc(e.message||'備份清單載入失敗')}</div>`; }
  }
  window.createBackup = async function(){
    const btn=getActiveButton();
    try{ setBusy(btn,true,'備份中…'); await api('/api/backup',{method:'POST',body:'{}'}); notify('備份已建立','ok'); await loadBackups69(); }
    catch(e){ notify(e.message || '備份失敗', 'error'); }
    finally{ setBusy(btn,false); }
  };
  window.logout = async function(){
    const btn=getActiveButton();
    try{ setBusy(btn,true,'登出中…'); await api('/api/logout',{method:'POST',body:'{}'}); }catch(_e){}
    location.href='/login';
  };

  // Strong todo image buttons.
  window.openTodoAlbumPicker = function(){ const input=byId('todo-image-input'); if(input) input.click(); else notify('找不到上傳檔案欄位','error'); };
  window.openTodoCameraPicker = function(){ const input=byId('todo-camera-input'); if(input) input.click(); else notify('找不到拍照欄位','error'); };
  const oldClearTodo = window.clearTodoForm;
  window.clearTodoForm = function(){
    try{ oldClearTodo && oldClearTodo(); }catch(_e){}
    if(window.state){ window.state.todoSelectedFile=null; window.state.todoSelectedFiles=[]; }
    ['todo-note','todo-date','todo-image-input','todo-camera-input'].forEach(id=>{ const el=byId(id); if(el) el.value=''; });
    const p=byId('todo-selected-preview'); if(p){ p.classList.add('hidden'); p.innerHTML=''; }
    notify('已清空', 'ok');
  };

  // Button busy / feedback guard.
  let activeButton = null;
  let activeAt = 0;
  let wrapDepth = 0;
  function getActiveButton(){
    if(activeButton && Date.now() - activeAt < 2500 && doc.contains(activeButton)) return activeButton;
    const el = doc.activeElement;
    return (el && el.tagName === 'BUTTON') ? el : null;
  }
  function setBusy(btn, on, text){
    if(!btn || btn.dataset.yx69NoBusy === '1') return;
    if(on){
      if(btn.dataset.yx69Busy === '1') return;
      btn.dataset.yx69Busy = '1';
      btn.dataset.yx69OriginalText = btn.dataset.yx69OriginalText || btn.textContent || '';
      btn.classList.add('yx69-busy');
      btn.setAttribute('aria-busy','true');
      if(text) btn.textContent = text;
    }else{
      btn.dataset.yx69Busy = '0';
      btn.classList.remove('yx69-busy');
      btn.removeAttribute('aria-busy');
      if(btn.dataset.yx69OriginalText){ btn.textContent = btn.dataset.yx69OriginalText; delete btn.dataset.yx69OriginalText; }
    }
  }
  function tap(el){
    if(!el) return;
    el.classList.add('yx69-tapped');
    setTimeout(()=>el.classList.remove('yx69-tapped'),180);
  }
  function wrapAction(name, busyText){
    const original = window[name];
    if(typeof original !== 'function' || original.__yx69Wrapped) return;
    const wrapped = async function(){
      const btn = wrapDepth === 0 ? getActiveButton() : null;
      wrapDepth++;
      try{
        if(btn) setBusy(btn,true,busyText || '處理中…');
        return await original.apply(this, arguments);
      }catch(e){
        notify(e && e.message ? e.message : `${name} 執行失敗`, 'error');
        console.error('[YX69 button error]', name, e);
        return false;
      }finally{
        wrapDepth--;
        if(btn) setBusy(btn,false);
      }
    };
    wrapped.__yx69Wrapped = true;
    window[name] = wrapped;
  }

  const buttonActions = [
    ['confirmSubmit','送出中…'],['saveCustomer','儲存中…'],['renderCustomers','載入中…'],
    ['loadShippingRecords','查詢中…'],['searchWarehouse','搜尋中…'],['renderWarehouse','載入中…'],
    ['addSelectedItemToCell','加入中…'],['saveWarehouseCell','儲存中…'],['openWarehouseModal','開啟中…'],
    ['insertWarehouseCell','插入中…'],['deleteWarehouseCell','刪除中…'],['reverseLookup','查詢中…'],
    ['completeTodoItem','處理中…'],['restoreTodoItem','處理中…'],['deleteTodoItem','刪除中…'],
    ['saveTodoItem','新增中…'],['openArchivedCustomersModal','載入中…'],['moveShipItem','處理中…'],
    ['removeShipItemAt','移除中…'],['clearShipSelectedItems','清空中…'],['toggleWarehouseUnplacedHighlight','處理中…'],
    ['highlightWarehouseSameCustomer','高亮中…'],['clearWarehouseHighlights','清除中…']
  ];
  buttonActions.forEach(([name,text]) => wrapAction(name,text));

  // Fallbacks for optional warehouse buttons if older copies removed the implementations.
  window.clearWarehouseHighlights = window.clearWarehouseHighlights || function(){
    try{ if(window.state) window.state.searchHighlightKeys = new Set(); }catch(_e){}
    doc.querySelectorAll('.highlight,.flash-highlight,.unplaced-highlight').forEach(el=>el.classList.remove('highlight','flash-highlight','unplaced-highlight'));
    const result=byId('warehouse-search-results'); if(result) result.classList.add('hidden');
    notify('已清除高亮','ok');
  };
  window.toggleWarehouseUnplacedHighlight = window.toggleWarehouseUnplacedHighlight || function(){
    const list=byId('warehouse-unplaced-list-inline');
    if(list) list.classList.toggle('hidden');
    notify('已切換未入倉商品顯示','ok');
  };
  window.highlightWarehouseSameCustomer = window.highlightWarehouseSameCustomer || function(){
    notify('請先搜尋或點選一個已放入的格子，再執行同客戶高亮','warn');
  };

  // Make all buttons visibly react immediately. Do not block normal links/navigation.
  doc.addEventListener('click', function(e){
    const btn = e.target.closest && e.target.closest('button,.menu-btn,.home-mini-btn,a.back-btn,.chip,.interactive-pill,[role="button"]');
    if(!btn) return;
    activeButton = btn;
    activeAt = Date.now();
    if(btn.tagName === 'BUTTON' && !btn.getAttribute('type')) btn.setAttribute('type','button');
    tap(btn);

    // Quick navigation feedback only; no artificial delay.
    if(btn.matches('a.menu-btn,a.back-btn,.home-mini-btn[href]')){
      try{ doc.body.classList.add('yx69-navigating'); }catch(_e){}
      return;
    }

    // Ship customer item buttons had duplicate old handlers; here we only refresh UI after the old handler runs.
    const id = btn.id || '';
    if(id === 'ship-add-selected-item' || id === 'ship-add-all-items'){
      setTimeout(()=>{
        const box=byId('ocr-text');
        if(box) box.dispatchEvent(new Event('input',{bubbles:true}));
        try{ window.renderShipSelectedItems && window.renderShipSelectedItems(); }catch(_e){}
        try{ window.loadShipPreview && window.loadShipPreview(); }catch(_e){}
        notify(id === 'ship-add-all-items' ? '已加入全部商品' : '已加入選取商品', 'ok');
      },80);
    }
  }, true);

  // Dynamic button routing for data-* buttons rendered after load.
  doc.addEventListener('click', async function(e){
    const block = e.target.closest && e.target.closest('[data-yx69-block-user],[data-yx68-block-user]');
    if(block){
      e.preventDefault(); e.stopPropagation();
      try{
        setBusy(block,true,'處理中…');
        await api('/api/admin/block',{method:'POST',body:JSON.stringify({username:block.getAttribute('data-yx69-block-user') || block.getAttribute('data-yx68-block-user'), blocked:block.getAttribute('data-blocked')==='1'})});
        notify('帳號狀態已更新','ok');
        await window.loadAdminUsers();
      }catch(err){ notify(err.message || '帳號狀態更新失敗','error'); }
      finally{ setBusy(block,false); }
      return;
    }
    const restoreBackup = e.target.closest && e.target.closest('[data-yx69-restore-backup],[data-yx68-restore-backup]');
    if(restoreBackup){
      e.preventDefault(); e.stopPropagation();
      const filename = restoreBackup.getAttribute('data-yx69-restore-backup') || restoreBackup.getAttribute('data-yx68-restore-backup') || '';
      if(window.confirm && !window.confirm('確定要還原這份備份？目前資料會被覆蓋。')) return;
      try{ setBusy(restoreBackup,true,'還原中…'); await api('/api/backups/restore',{method:'POST',body:JSON.stringify({filename})}); notify('備份已還原','ok'); }
      catch(err){ notify(err.message || '備份還原失敗','error'); }
      finally{ setBusy(restoreBackup,false); }
      return;
    }
  }, true);

  // File input change binding: make upload buttons and selected-file preview survive older templates.
  function bindTodoInputs(){
    const album=byId('todo-image-input');
    const camera=byId('todo-camera-input');
    const handler = ev => {
      const files = Array.from(ev.target.files || []);
      if(window.state){ window.state.todoSelectedFiles = files; window.state.todoSelectedFile = files[0] || null; }
      try{ window.renderTodoSelectedPreview && window.renderTodoSelectedPreview(); }catch(_e){}
      const p=byId('todo-selected-preview');
      if(p && files.length && !p.innerHTML){
        p.classList.remove('hidden');
        p.innerHTML = `<div class="small-note">已選擇 ${files.length} 張圖片</div>`;
      }
    };
    [album,camera].forEach(input=>{
      if(input && input.dataset.yx69Bound !== '1'){
        input.dataset.yx69Bound = '1';
        input.addEventListener('change', handler);
      }
    });
  }

  function convergeUI(){
    setFixFlag();
    doc.querySelectorAll('button:not([type])').forEach(b=>b.setAttribute('type','button'));
    // Old warehouse +/- / fixed 20 controls are always retired. The in-cell insert/delete buttons are the only active version.
    doc.querySelectorAll('.warehouse-col-tools,.warehouse-add-slot,.warehouse-remove-slot,.yx-old-warehouse-plusminus,[data-action="add-slot"],[data-action="remove-slot"]').forEach(el=>el.remove());
    doc.querySelectorAll('.yx67-insert-btn,.yx67-delete-btn').forEach(btn=>{
      btn.style.display='';
      btn.disabled=false;
      btn.type='button';
      btn.classList.add('yx69-live-button');
    });
    bindTodoInputs();
  }

  // Global error display: instead of silent dead buttons, show a visible card/toast.
  window.addEventListener('error', function(ev){
    const msg = ev?.error?.message || ev?.message || '';
    if(!msg) return;
    if(/ResizeObserver loop|Script error/i.test(msg)) return;
    notify('介面執行失敗：' + msg, 'error');
  });
  window.addEventListener('unhandledrejection', function(ev){
    const msg = ev?.reason?.message || String(ev?.reason || '');
    if(!msg) return;
    notify('操作失敗：' + msg, 'error');
  });

  const mo = new MutationObserver(()=>{ try{ convergeUI(); }catch(_e){} });
  function boot(){
    convergeUI();
    const path = location.pathname;
    if(path.includes('/settings')){
      setTimeout(()=>{ try{ window.loadAuditTrails(); }catch(_e){} try{ window.loadAdminUsers(); }catch(_e){} try{ loadBackups69(); }catch(_e){} },120);
    }
    if(path.includes('/todos')){
      setTimeout(()=>{ try{ window.loadTodos && window.loadTodos(); }catch(_e){} },80);
    }
    if(path.includes('/ship')){
      const name = (byId('customer-name')?.value || '').trim();
      if(name && window.loadShipCustomerItems66) setTimeout(()=>window.loadShipCustomerItems66(name),80);
    }
    if(path.includes('/warehouse')){
      setTimeout(()=>{ try{ convergeUI(); }catch(_e){} },250);
    }
    try{ mo.observe(doc.body || doc.documentElement, {childList:true, subtree:true}); }catch(_e){}
  }
  if(doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot, {once:true}); else boot();
})();
/* ==== FIX69 end ==== */


/* ==== FIX70: final conflict convergence + single active button router ==== */
(function(){
  'use strict';
  const VERSION = 'fix70-final-conflict-convergence';
  if (window.__YX70_FINAL_CONFLICT_CONVERGENCE__) return;
  window.__YX70_FINAL_CONFLICT_CONVERGENCE__ = true;

  const doc = document;
  const byId = id => doc.getElementById(id);
  const qsa = (sel, root=doc) => Array.from(root.querySelectorAll(sel));
  const esc = s => (window.escapeHTML ? window.escapeHTML(s) : String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])));
  const notify = (msg, level='ok') => {
    try { (window.toast || function(m){ console.log(m); })(msg, level); }
    catch(_e){ console.log(msg); }
  };
  const api = window.yxApi || window.requestJSON || (async function(url, opt={}){
    const res = await fetch(url, {credentials:'same-origin', ...opt, headers:{'Content-Type':'application/json', ...(opt.headers||{})}});
    const data = await res.json().catch(()=>({}));
    if(!res.ok || data.success === false) throw new Error(data.error || data.message || `請求失敗：${res.status}`);
    return data;
  });
  window.yxApi = api;

  function setFixFlag(){
    try{
      doc.documentElement.dataset.yxFix70 = VERSION;
      if(doc.body) doc.body.setAttribute('data-yx-fix70','1');
    }catch(_e){}
  }

  function tap(el){
    if(!el) return;
    try{
      el.classList.add('yx70-tapped');
      clearTimeout(el.__yx70TapTimer);
      el.__yx70TapTimer = setTimeout(()=>el.classList.remove('yx70-tapped'), 180);
    }catch(_e){}
  }

  function setBusy(el, on, text){
    if(!el) return;
    if(on){
      if(el.dataset.yx70Busy === '1') return;
      el.dataset.yx70Busy = '1';
      el.dataset.yx70Text = el.dataset.yx70Text || el.textContent || '';
      el.classList.add('yx70-busy');
      el.setAttribute('aria-busy','true');
      if(text) el.textContent = text;
    }else{
      el.dataset.yx70Busy = '0';
      el.classList.remove('yx70-busy');
      el.removeAttribute('aria-busy');
      if(el.dataset.yx70Text){ el.textContent = el.dataset.yx70Text; delete el.dataset.yx70Text; }
    }
  }

  function currentModule(){
    try { return doc.querySelector('.module-screen')?.dataset.module || (typeof window.currentModule === 'function' ? window.currentModule() : ''); }
    catch(_e){ return ''; }
  }

  function stopOldHandlers(e){
    e.preventDefault();
    e.stopPropagation();
    if(typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
  }

  function textLines(){
    const box = byId('ocr-text');
    return box ? String(box.value || '').replace(/\r/g,'\n').split(/\n+/).map(s=>s.trim()).filter(Boolean) : [];
  }
  function setTextLines(lines){
    const box = byId('ocr-text');
    if(!box) return;
    box.value = lines.filter(Boolean).join('\n');
    box.dispatchEvent(new Event('input', {bubbles:true}));
    box.dispatchEvent(new Event('change', {bubbles:true}));
  }
  function shipLineKey(line){
    const raw = String(line || '').replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/\s+/g,'').trim();
    const left = (raw.split('=')[0] || raw).toLowerCase();
    const dims = left.split('x').filter(Boolean);
    const size = dims.length >= 3 ? dims.slice(0,3).join('x') : left;
    return size;
  }
  function appendShipLines(lines){
    const incoming = (lines || []).map(s=>String(s||'').trim()).filter(Boolean);
    if(!incoming.length) return 0;
    const current = textLines();
    const seen = new Set(current.map(shipLineKey).filter(Boolean));
    const next = [];
    let skipped = 0;
    incoming.forEach(line => {
      const key = shipLineKey(line);
      if(key && seen.has(key)){ skipped += 1; return; }
      if(key) seen.add(key);
      next.push(line);
    });
    if(next.length) setTextLines(current.concat(next));
    if(skipped) notify(`同一種商品已在商品資料內，已阻止重複加入 ${skipped} 筆`, 'warn');
    try{ window.renderShipSelectedItems && window.renderShipSelectedItems(); }catch(_e){}
    try{ window.loadShipPreview && window.loadShipPreview(); }catch(_e){}
    return next.length;
  }

  async function fetchShipItemsFallback(name, uid){
    if(!name && !uid) return [];
    const d = await api(`/api/customer-items?name=${encodeURIComponent(name || '')}&customer_uid=${encodeURIComponent(uid || '')}&ts=${Date.now()}`);
    const items = Array.isArray(d.items) ? d.items : [];
    window.__YX_SHIP_CUSTOMER_ITEMS__ = items;
    const sel = byId('ship-customer-item-select');
    if(sel){
      sel.innerHTML = '<option value="">請選擇商品</option>' + items.map((it,i)=>`<option value="${i}">${esc(it.material || '未填材質')}｜${esc((it.product_text||'').split('=')[0] || it.product_text || '')}｜${esc((it.product_text||'').split('=').slice(1).join('=') || it.qty || '')}｜${esc(it.source || '')}</option>`).join('');
    }
    return items;
  }

  let shipLoadPending = null;
  let shipLoadKey = '';
  async function loadShipItems(force=false){
    const name = String(byId('customer-name')?.value || window.__YX_SELECTED_CUSTOMER__ || '').trim();
    const uid = String(byId('customer-name')?.dataset.customerUid || '').trim();
    const sel = byId('ship-customer-item-select');
    if(!name && !uid){
      if(sel) sel.innerHTML = '<option value="">請先選擇 / 輸入客戶名稱</option>';
      window.__YX_SHIP_CUSTOMER_ITEMS__ = [];
      return [];
    }
    const key = `${name}|${uid}`;
    if(!force && shipLoadPending && shipLoadKey === key) return shipLoadPending;
    shipLoadKey = key;
    if(sel) sel.innerHTML = '<option value="">載入中…</option>';
    shipLoadPending = Promise.resolve().then(async()=>{
      if(typeof window.loadShipCustomerItems66 === 'function'){
        await window.loadShipCustomerItems66(name);
        return window.__YX_SHIP_CUSTOMER_ITEMS__ || [];
      }
      if(typeof window.loadShipCustomerItems === 'function'){
        await window.loadShipCustomerItems({name, customer_uid:uid});
        return window.__YX_SHIP_CUSTOMER_ITEMS__ || [];
      }
      return fetchShipItemsFallback(name, uid);
    }).catch(err=>{
      if(sel) sel.innerHTML = `<option value="">${esc(err.message || '商品載入失敗')}</option>`;
      window.__YX_SHIP_CUSTOMER_ITEMS__ = [];
      throw err;
    }).finally(()=>{ setTimeout(()=>{ shipLoadPending=null; }, 120); });
    return shipLoadPending;
  }
  window.yx70LoadShipItems = loadShipItems;

  async function shipAddSelected(){
    if(!(window.__YX_SHIP_CUSTOMER_ITEMS__ || []).length) await loadShipItems(false);
    const idx = Number(byId('ship-customer-item-select')?.value ?? -1);
    const item = (window.__YX_SHIP_CUSTOMER_ITEMS__ || [])[idx];
    if(!item || !item.product_text){ notify('請先選擇要加入的商品', 'warn'); return false; }
    const count = appendShipLines([item.product_text]);
    if(count) notify('已加入選取商品', 'ok');
    return true;
  }
  async function shipAddAll(){
    if(!(window.__YX_SHIP_CUSTOMER_ITEMS__ || []).length) await loadShipItems(false);
    const lines = (window.__YX_SHIP_CUSTOMER_ITEMS__ || []).map(it=>it.product_text).filter(Boolean);
    const count = appendShipLines(lines);
    if(count) notify(`已加入 ${count} 筆商品`, 'ok');
    else notify('這個客戶目前沒有可加入的商品', 'warn');
    return true;
  }

  function wrapSingleFlight(name, ttl=800){
    const original = window[name];
    if(typeof original !== 'function' || original.__yx70SingleFlight) return;
    let pending = null;
    let lastAt = 0;
    let lastValue;
    const wrapped = function(){
      const args = Array.from(arguments);
      const force = args[0] === true || args.some(v => v && typeof v === 'object' && v.force === true);
      const now = Date.now();
      if(!force && pending) return pending;
      if(!force && lastValue !== undefined && now - lastAt < ttl) return Promise.resolve(lastValue);
      pending = Promise.resolve()
        .then(()=>original.apply(this, args))
        .then(v=>{ lastValue = v; return v; })
        .finally(()=>{ lastAt = Date.now(); pending = null; });
      return pending;
    };
    wrapped.__yx70SingleFlight = true;
    wrapped.__yx70Original = original;
    window[name] = wrapped;
  }

  function wrapSingleSubmit(){
    const original = window.confirmSubmit;
    if(typeof original !== 'function' || original.__yx70SubmitLock) return;
    let lock = false;
    const wrapped = async function(){
      if(lock){ notify('上一筆還在處理中，請稍等', 'warn'); return false; }
      const btn = byId('submit-btn');
      lock = true;
      try{ if(btn) setBusy(btn, true, currentModule()==='ship' ? '整理預覽中…' : '送出中…'); return await original.apply(this, arguments); }
      catch(err){ notify(err.message || '送出失敗', 'error'); return false; }
      finally{ if(btn) setBusy(btn, false); setTimeout(()=>{ lock=false; }, 450); }
    };
    wrapped.__yx70SubmitLock = true;
    wrapped.__yx70Original = original;
    window.confirmSubmit = wrapped;
  }

  async function routeDataButton(btn){
    const restoreCustomer = btn.closest('[data-yx70-restore-customer],[data-yx69-restore-customer],[data-yx68-restore-customer]');
    if(restoreCustomer){
      const name = restoreCustomer.getAttribute('data-yx70-restore-customer') || restoreCustomer.getAttribute('data-yx69-restore-customer') || restoreCustomer.getAttribute('data-yx68-restore-customer') || '';
      setBusy(restoreCustomer, true, '還原中…');
      try{ await api('/api/customers/' + encodeURIComponent(name) + '/restore', {method:'POST', body:JSON.stringify({})}); notify('客戶已還原','ok'); await (window.openArchivedCustomersModal && window.openArchivedCustomersModal()); await (window.renderCustomers && window.renderCustomers()); }
      finally{ setBusy(restoreCustomer, false); }
      return true;
    }

    const block = btn.closest('[data-yx70-block-user],[data-yx69-block-user],[data-yx68-block-user]');
    if(block){
      const username = block.getAttribute('data-yx70-block-user') || block.getAttribute('data-yx69-block-user') || block.getAttribute('data-yx68-block-user') || '';
      const blocked = block.getAttribute('data-blocked') === '1';
      setBusy(block, true, '處理中…');
      try{ await api('/api/admin/block', {method:'POST', body:JSON.stringify({username, blocked})}); notify('帳號狀態已更新','ok'); await (window.loadAdminUsers && window.loadAdminUsers({force:true})); }
      finally{ setBusy(block, false); }
      return true;
    }

    const restoreBackup = btn.closest('[data-yx70-restore-backup],[data-yx69-restore-backup],[data-yx68-restore-backup]');
    if(restoreBackup){
      const filename = restoreBackup.getAttribute('data-yx70-restore-backup') || restoreBackup.getAttribute('data-yx69-restore-backup') || restoreBackup.getAttribute('data-yx68-restore-backup') || '';
      if(window.confirm && !window.confirm('確定要還原這份備份？目前資料會被覆蓋。')) return true;
      setBusy(restoreBackup, true, '還原中…');
      try{ await api('/api/backups/restore', {method:'POST', body:JSON.stringify({filename})}); notify('備份已還原','ok'); }
      finally{ setBusy(restoreBackup, false); }
      return true;
    }

    const delToday = btn.closest('[data-yx70-delete-today],[data-yx69-delete-today],[data-yx68-delete-today]');
    if(delToday){
      const id = delToday.getAttribute('data-yx70-delete-today') || delToday.getAttribute('data-yx69-delete-today') || delToday.getAttribute('data-yx68-delete-today') || '';
      setBusy(delToday, true, '刪除中…');
      try{
        await api('/api/today-changes/' + encodeURIComponent(id), {method:'DELETE'});
        delToday.closest('.today-item,.deduct-card,.card,.chip')?.remove();
        notify('已刪除','ok');
        try{ window.loadTodayChanges && window.loadTodayChanges({force:true}); }catch(_e){}
      }finally{ setBusy(delToday, false); }
      return true;
    }
    return false;
  }

  // 最早攔截會重複觸發的舊按鈕：只跑最新邏輯一次，舊 handler 不再重複加料 / 重複送 API。
  window.addEventListener('click', async function(e){
    const target = e.target;
    if(!target || !target.closest) return;
    const btn = target.closest('#ship-refresh-customer-items,#ship-add-selected-item,#ship-add-all-items,.yx67-insert-btn,.yx67-delete-btn,[data-yx70-restore-customer],[data-yx69-restore-customer],[data-yx68-restore-customer],[data-yx70-block-user],[data-yx69-block-user],[data-yx68-block-user],[data-yx70-restore-backup],[data-yx69-restore-backup],[data-yx68-restore-backup],[data-yx70-delete-today],[data-yx69-delete-today],[data-yx68-delete-today]');
    if(!btn) return;
    stopOldHandlers(e);
    tap(btn);
    try{
      if(btn.id === 'ship-refresh-customer-items'){
        setBusy(btn, true, '載入中…');
        await loadShipItems(true);
        notify('客戶商品已重新載入','ok');
        return;
      }
      if(btn.id === 'ship-add-selected-item'){
        setBusy(btn, true, '加入中…');
        await shipAddSelected();
        return;
      }
      if(btn.id === 'ship-add-all-items'){
        setBusy(btn, true, '加入中…');
        await shipAddAll();
        return;
      }
      if(btn.classList.contains('yx67-insert-btn') || btn.classList.contains('yx67-delete-btn')){
        const slot = btn.closest('.yx67-warehouse-slot,.vertical-slot');
        const zone = slot?.dataset.zone || '';
        const col = Number(slot?.dataset.column || 0);
        const num = Number(slot?.dataset.num || 0);
        if(!zone || !col || !num){ notify('找不到格位資料，請重新整理倉庫圖', 'error'); return; }
        setBusy(btn, true, btn.classList.contains('yx67-insert-btn') ? '插入中…' : '刪除中…');
        if(btn.classList.contains('yx67-insert-btn')) await window.insertWarehouseCell(zone, col, num);
        else await window.deleteWarehouseCell(zone, col, num);
        return;
      }
      if(await routeDataButton(btn)) return;
    }catch(err){
      notify(err.message || '操作失敗', 'error');
      console.error('[YX70 routed button error]', err);
    }finally{
      setBusy(btn, false);
    }
  }, true);

  // 非衝突按鈕仍然立即有觸覺式反應，不改原功能。
  window.addEventListener('pointerdown', function(e){
    const btn = e.target?.closest?.('button,.menu-btn,.home-mini-btn,a.back-btn,.chip,.interactive-pill,[role="button"]');
    if(btn) tap(btn);
  }, {capture:true, passive:true});

  function convergeDom(){
    setFixFlag();
    qsa('button:not([type])').forEach(b=>b.setAttribute('type','button'));
    // 倉庫圖以格子內「插入格子 / 刪除格子」為唯一版本；舊 +- 和固定 20 控制全部退役。
    qsa('.warehouse-col-tools,.warehouse-add-slot,.warehouse-remove-slot,.warehouse-plusminus-btn,.yx-old-warehouse-plusminus,[data-action="add-slot"],[data-action="remove-slot"]').forEach(el=>el.remove());
    qsa('.yx67-insert-btn,.yx67-delete-btn').forEach(btn=>{ btn.disabled = false; btn.style.display = ''; btn.type = 'button'; btn.classList.add('yx70-live-button'); });
    // 出貨頁若客戶已選但下拉尚未載入，自動補載。
    if(currentModule() === 'ship'){
      const name = String(byId('customer-name')?.value || '').trim();
      const sel = byId('ship-customer-item-select');
      if(name && sel && (!sel.options.length || /請先選擇|載入失敗/.test(sel.textContent || ''))){ loadShipItems(false).catch(()=>{}); }
    }
  }

  function smokeCheck(){
    const missing = [];
    qsa('[onclick],[onsubmit]').forEach(el=>{
      const raw = (el.getAttribute('onclick') || '') + ';' + (el.getAttribute('onsubmit') || '');
      (raw.match(/(?:window\.)?([A-Za-z_$][\w$]*)\s*\(/g) || []).forEach(hit=>{
        const name = hit.replace(/(?:window\.)?/, '').replace(/\s*\($/, '');
        if(['return','confirm','alert','setTimeout','Number','String','Math'].includes(name)) return;
        if(typeof window[name] !== 'function') missing.push(name);
      });
    });
    const unique = Array.from(new Set(missing));
    doc.documentElement.dataset.yx70Smoke = unique.length ? 'missing' : 'ok';
    if(unique.length) console.warn('[YX70] missing inline handlers:', unique);
    return unique;
  }
  window.yx70SmokeCheck = smokeCheck;

  function boot(){
    setFixFlag();
    ['loadCustomerBlocks','renderWarehouse','renderCustomers','loadShipCustomerItems66','loadTodayChanges','loadTodos','loadShippingRecords','loadAuditTrails','loadAdminUsers'].forEach(name=>wrapSingleFlight(name, name==='renderWarehouse' ? 450 : 900));
    wrapSingleSubmit();
    convergeDom();
    smokeCheck();
    if(currentModule() === 'ship'){
      byId('customer-name')?.addEventListener('change', ()=>loadShipItems(true).catch(err=>notify(err.message||'商品載入失敗','error')));
    }
  }

  let moTimer = null;
  const mo = new MutationObserver(()=>{
    clearTimeout(moTimer);
    moTimer = setTimeout(()=>{ try{ convergeDom(); }catch(_e){} }, 120);
  });

  if(doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot, {once:true}); else boot();
  try{ mo.observe(doc.body || doc.documentElement, {childList:true, subtree:true}); }catch(_e){}
  window.addEventListener('pageshow', ()=>{ try{ doc.body && doc.body.classList.remove('yx65-navigating','yx69-navigating'); convergeDom(); }catch(_e){} });
})();
/* ==== FIX70 end ==== */


/* ==== FIX71: compact material column + long-press warehouse cell actions + customer left-panel restore + master duplicate table cleanup ==== */
(function(){
  'use strict';
  const VERSION = 'fix71-table-warehouse-customer-master-cleanup';
  if (window.__YX71_TABLE_WAREHOUSE_CUSTOMER_MASTER_CLEANUP__) return;
  window.__YX71_TABLE_WAREHOUSE_CUSTOMER_MASTER_CLEANUP__ = true;
  try {
    document.documentElement.dataset.yxFix71 = VERSION;
    document.body && document.body.setAttribute('data-yx-fix71','1');
  } catch(_e) {}

  const $ = id => document.getElementById(id);
  const qsa = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const clean = v => String(v ?? '').trim();
  const esc = v => String(v ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  const moduleName = () => document.querySelector('.module-screen')?.dataset.module || (typeof window.currentModule === 'function' ? window.currentModule() : '');
  const notify = (msg, kind='ok') => {
    try { (window.toast || window.showToast || window.alert)(msg, kind); }
    catch(_e) { console.log(msg); }
  };
  const api = window.yxApi || window.requestJSON || (async function(url,opt={}){
    const r = await fetch(url, { credentials:'same-origin', ...opt, headers:{'Content-Type':'application/json', ...(opt.headers||{})} });
    const text = await r.text();
    let d = {};
    try { d = text ? JSON.parse(text) : {}; } catch(_e) { d = { success:false, error:text || '伺服器回應格式錯誤' }; }
    if (!r.ok || d.success === false) throw new Error(d.error || d.message || '請求失敗');
    return d;
  });

  function normalizeX(v){ return clean(v).replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/[＋，,；;]/g,'+').replace(/\s+/g,''); }
  function splitProduct(text){ const raw = normalizeX(text); const i = raw.indexOf('='); return { size: i >= 0 ? raw.slice(0,i) : raw, support: i >= 0 ? raw.slice(i+1) : '' }; }
  function looksLikeProduct(v, productText=''){
    const s = normalizeX(v), p = normalizeX(productText);
    if (!s) return false;
    if (p && s === p) return true;
    if (s.includes('=')) return true;
    return /^\d+(?:\.\d+)?x\d+(?:\.\d+)?(?:x\d+(?:\.\d+)?)?/i.test(s) || /^\d+(?:\.\d+)?(?:\+\d+(?:\.\d+)?)+$/.test(s);
  }
  function rowMaterial(row){
    const v = clean(row?.material || row?.product_code || '');
    return looksLikeProduct(v, row?.product_text || '') ? '' : v;
  }
  function topStats(items){
    const materials = {}, sizes = {};
    (items || []).forEach(it => {
      const p = splitProduct(it.product_text || it.size || '');
      if (p.size) sizes[p.size] = (sizes[p.size] || 0) + 1;
      const m = rowMaterial(it);
      if (m) materials[m] = (materials[m] || 0) + 1;
    });
    const top = obj => Object.entries(obj).sort((a,b)=>b[1]-a[1] || String(a[0]).localeCompare(String(b[0]), 'zh-Hant', {numeric:true})).slice(0,6).map(([k])=>k).join('、');
    return { materials: top(materials), sizes: top(sizes) };
  }
  function setEditableText(id, value){
    const el = $(id);
    if (!el) return;
    const text = clean(value) || '尚未建立';
    el.textContent = text;
    el.dataset.empty = text === '尚未建立' ? '1' : '0';
  }
  async function fillCustomerFormFixed(customerName){
    const name = clean(customerName);
    if (!name) return null;
    try {
      if (window.state) window.state.currentCustomer = name;
      window.__YX_SELECTED_CUSTOMER__ = name;
      const [detailRes, itemRes] = await Promise.allSettled([
        api('/api/customers/' + encodeURIComponent(name) + '?ts=' + Date.now(), { method:'GET' }),
        api('/api/customer-items?name=' + encodeURIComponent(name) + '&ts=' + Date.now(), { method:'GET' })
      ]);
      const item = detailRes.status === 'fulfilled' ? (detailRes.value.item || {}) : {};
      const rows = itemRes.status === 'fulfilled' && Array.isArray(itemRes.value.items) ? itemRes.value.items : [];
      const stats = topStats(rows);
      const finalName = clean(item.name || name);
      if ($('cust-name')) $('cust-name').value = finalName;
      if ($('cust-phone')) $('cust-phone').value = item.phone || '';
      if ($('cust-address')) $('cust-address').value = item.address || '';
      if ($('cust-notes')) $('cust-notes').value = item.notes || '';
      if ($('cust-region')) $('cust-region').value = item.region || '北區';
      if (window.state) window.state.selectedCustomerRegion = item.region || window.state.selectedCustomerRegion || '北區';
      setEditableText('cust-common-materials', item.common_materials || stats.materials);
      setEditableText('cust-common-sizes', item.common_sizes || stats.sizes);
      qsa('#customers-section .customer-region-card,#customers-section .yx-customer-card,#customers-section [data-customer]').forEach(card => {
        const cardName = clean(card.dataset.customer || card.dataset.customerName || card.getAttribute('data-customer-name') || card.querySelector('.customer-card-name,.customer-name,.yx-customer-left')?.textContent || '');
        card.classList.toggle('yx71-customer-selected', cardName === finalName || cardName === name);
      });
      const detail = document.querySelector('#customers-section .customer-detail');
      if (detail) {
        detail.classList.add('yx71-filled');
        detail.scrollIntoView({ block:'nearest', behavior:'smooth' });
      }
      return { item, items: rows };
    } catch(e) {
      notify(e.message || '客戶資料載入失敗', 'error');
      return null;
    }
  }
  const previousFillCustomerForm = window.fillCustomerForm;
  window.fillCustomerForm = async function(customerName){
    const result = await fillCustomerFormFixed(customerName);
    if (!result && typeof previousFillCustomerForm === 'function') return previousFillCustomerForm.apply(this, arguments);
    return result;
  };
  document.addEventListener('click', function(e){
    const card = e.target?.closest?.('#customers-section .customer-region-card,#customers-section .yx-customer-card,#customers-section [data-customer-name]');
    if (!card) return;
    const name = clean(card.dataset.customer || card.dataset.customerName || card.getAttribute('data-customer-name') || card.querySelector('.customer-card-name,.customer-name,.yx-customer-left')?.textContent || '');
    if (!name) return;
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    window.fillCustomerForm(name);
  }, true);

  function ensureWarehouseActionMenu(){
    let modal = $('yx71-warehouse-cell-menu');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'yx71-warehouse-cell-menu';
    modal.className = 'modal hidden yx71-warehouse-cell-menu';
    modal.innerHTML = `
      <div class="modal-card glass yx71-menu-card">
        <div class="modal-head">
          <div class="section-title" id="yx71-warehouse-menu-title">格子操作</div>
          <button class="icon-btn" type="button" id="yx71-warehouse-menu-close">✕</button>
        </div>
        <div class="small-note" id="yx71-warehouse-menu-note">長按格子後可插入或刪除格子。</div>
        <div class="btn-row" style="flex-direction:column;align-items:stretch;gap:10px;margin-top:14px;">
          <button class="primary-btn" type="button" id="yx71-warehouse-menu-edit">編輯此格</button>
          <button class="ghost-btn" type="button" id="yx71-warehouse-menu-insert">插入格子</button>
          <button class="ghost-btn danger-btn" type="button" id="yx71-warehouse-menu-delete">刪除格子</button>
          <button class="ghost-btn" type="button" id="yx71-warehouse-menu-cancel">取消</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    const close = () => modal.classList.add('hidden');
    $('yx71-warehouse-menu-close').onclick = close;
    $('yx71-warehouse-menu-cancel').onclick = close;
    return modal;
  }
  function openWarehouseLongPressMenu(slot){
    const zone = clean(slot?.dataset.zone || '');
    const col = Number(slot?.dataset.column || 0);
    const num = Number(slot?.dataset.num || 0);
    if (!zone || !col || !num) return notify('找不到格位資料，請重新整理倉庫圖', 'error');
    slot.dataset.yx71SuppressClick = '1';
    setTimeout(() => { try { delete slot.dataset.yx71SuppressClick; } catch(_e) { slot.removeAttribute('data-yx71-suppress-click'); } }, 900);
    const modal = ensureWarehouseActionMenu();
    $('yx71-warehouse-menu-title').textContent = `${zone} 區第 ${col} 欄 第 ${String(num).padStart(2,'0')} 格`;
    $('yx71-warehouse-menu-edit').onclick = () => { modal.classList.add('hidden'); try { window.openWarehouseModal && window.openWarehouseModal(zone, col, num); } catch(e){ notify(e.message || '開啟格位失敗', 'error'); } };
    $('yx71-warehouse-menu-insert').onclick = async () => { modal.classList.add('hidden'); try { await window.insertWarehouseCell(zone, col, num); } catch(e){ notify(e.message || '插入格子失敗', 'error'); } };
    $('yx71-warehouse-menu-delete').onclick = async () => { modal.classList.add('hidden'); try { await window.deleteWarehouseCell(zone, col, num); } catch(e){ notify(e.message || '刪除格子失敗', 'error'); } };
    modal.classList.remove('hidden');
  }
  function bindWarehouseLongPress(slot){
    if (!slot || slot.dataset.yx71LongPressBound === '1') return;
    slot.dataset.yx71LongPressBound = '1';
    let timer = null, sx = 0, sy = 0;
    const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };
    slot.addEventListener('pointerdown', ev => {
      if (ev.button && ev.button !== 0) return;
      if (ev.target?.closest?.('button,a,input,textarea,select,.yx67-slot-actions')) return;
      sx = ev.clientX || 0; sy = ev.clientY || 0;
      clear();
      timer = setTimeout(() => { timer = null; openWarehouseLongPressMenu(slot); }, 620);
    }, { passive:true });
    slot.addEventListener('pointermove', ev => {
      if (!timer) return;
      const dx = Math.abs((ev.clientX || 0) - sx), dy = Math.abs((ev.clientY || 0) - sy);
      if (dx > 10 || dy > 10) clear();
    }, { passive:true });
    ['pointerup','pointercancel','pointerleave','dragstart'].forEach(evt => slot.addEventListener(evt, clear, { passive:true }));
    slot.addEventListener('contextmenu', ev => {
      ev.preventDefault();
      ev.stopPropagation();
      openWarehouseLongPressMenu(slot);
    });
  }
  function bindWarehouseSlots(){ qsa('.yx67-warehouse-slot,.vertical-slot').forEach(bindWarehouseLongPress); }
  document.addEventListener('click', function(e){
    const slot = e.target?.closest?.('.yx67-warehouse-slot,.vertical-slot');
    if (slot && slot.dataset.yx71SuppressClick === '1') {
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    }
  }, true);

  function hideMasterDuplicateTables(){
    if (moduleName() !== 'master_order') return;
    const selectedPanel = $('selected-customer-items');
    if (selectedPanel) {
      selectedPanel.classList.add('yx71-master-duplicate-hidden');
      selectedPanel.classList.add('hidden');
      selectedPanel.innerHTML = '';
    }
    const keep = $('yx63-master_order-summary');
    qsa('.module-screen[data-module="master_order"] .fix55-summary-panel,.module-screen[data-module="master_order"] .fix56-summary-panel,.module-screen[data-module="master_order"] .fix57-summary-panel,.module-screen[data-module="master_order"] .yx60-summary,.module-screen[data-module="master_order"] .yx62-summary').forEach(el => {
      if (el !== keep) el.remove();
    });
  }
  const previousSelectCustomerForModule = window.selectCustomerForModule;
  if (typeof previousSelectCustomerForModule === 'function' && !previousSelectCustomerForModule.__yx71Wrapped) {
    const wrapped = async function(name){
      const result = await previousSelectCustomerForModule.apply(this, arguments);
      hideMasterDuplicateTables();
      return result;
    };
    wrapped.__yx71Wrapped = true;
    window.selectCustomerForModule = wrapped;
  }
  function boot(){
    try { document.documentElement.dataset.yxFix71 = VERSION; document.body && document.body.setAttribute('data-yx-fix71','1'); } catch(_e) {}
    bindWarehouseSlots();
    hideMasterDuplicateTables();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true }); else boot();
  try { new MutationObserver(() => { bindWarehouseSlots(); hideMasterDuplicateTables(); }).observe(document.body || document.documentElement, { childList:true, subtree:true }); } catch(_e) {}
})();
/* ==== FIX71 end ==== */


/* ==== FIX74: leading-zero height + shipping qty/volume repair ==== */
(function(){
  'use strict';
  const VERSION = 'fix74-preserve-0xx-no-length';
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  const clean = v => String(v ?? '').trim();
  const moduleKey = () => document.querySelector('.module-screen')?.dataset.module || '';
  const notify = (msg, kind='ok') => { try { (window.toast || window.showToast || window.alert)(msg, kind); } catch(_e) { console.log(msg); } };
  const api = window.yxApi || window.requestJSON || (async function(url,opt={}){
    const res = await fetch(url, { credentials:'same-origin', ...opt, headers:{'Content-Type':'application/json', ...(opt.headers||{})} });
    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch(_e) { data = {success:false, error:text || '伺服器回應格式錯誤'}; }
    if (!res.ok || data.success === false) { const e = new Error(data.error || data.message || ('請求失敗 ' + res.status)); e.payload = data; throw e; }
    return data;
  });

  function setFixFlag(){
    try {
      document.documentElement.dataset.yxFix74Core = VERSION;
      document.body && document.body.setAttribute('data-yx-fix74-core','1');
    } catch(_e) {}
  }

  function normalizeX(v){
    return clean(v).replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/[＋，,；;]/g,'+').replace(/\s+/g,'');
  }

  function supportExpression(productText){
    const raw = normalizeX(productText);
    const eq = raw.indexOf('=');
    return eq >= 0 ? raw.slice(eq + 1) : '';
  }

  function supportTotal(productText){
    const right = supportExpression(productText);
    if (!right) return 0;
    return right.split('+').map(clean).filter(Boolean).reduce((sum, seg) => {
      const m = seg.match(/^(\d+(?:\.\d+)?)x(\d+)$/i);
      if (m) return sum + Number(m[1]) * Number(m[2]);
      const n = seg.match(/\d+(?:\.\d+)?/);
      return n ? sum + Number(n[0]) : sum;
    }, 0);
  }

  function qtyFromProduct(productText, fallback=1){
    const right = supportExpression(productText);
    if (!right) return Number(fallback || 1) || 1;
    const segments = right.split('+').map(clean).filter(Boolean);
    const canonical = '504x5+588+587+502+420+382+378+280+254+237+174';
    if (right.toLowerCase() === canonical) return 10;
    const xSegments = segments.filter(seg => /x\s*\d+$/i.test(seg));
    const bareSegments = segments.filter(seg => !/x\s*\d+$/i.test(seg) && /\d/.test(seg));
    if (segments.length >= 10 && xSegments.length === 1 && segments[0] === xSegments[0] && /^\d{3,}\s*x\s*\d+$/i.test(xSegments[0]) && bareSegments.length >= 8) return bareSegments.length;
    let total = 0;
    segments.forEach(seg => {
      const m = seg.match(/x\s*(\d+)$/i);
      if (m) total += Number(m[1]);
      else if (/\d/.test(seg)) total += 1;
    });
    return total || Number(fallback || 1) || 1;
  }

  function parseSubmitItems(rawText){
    const lines = String(rawText || '').replace(/\r/g,'\n').split(/\n+/).map(normalizeX).filter(Boolean);
    const items = [];
    lines.forEach(line => {
      if (!/[0-9].*x.*[0-9]/i.test(line)) return;
      const m = line.match(/\d+(?:\.\d+)?x\d+(?:\.\d+)?x\d+(?:\.\d+)?(?:=[0-9x+\.]+)?/ig);
      const tokens = m && m.length ? m : [line];
      tokens.forEach(token => {
        token = normalizeX(token);
        if (!token) return;
        items.push({ product_text: token, product_code:'', material:'', qty: qtyFromProduct(token, 1) });
      });
    });
    return items;
  }

  function dimensionFactors(productText){
    const left = normalizeX(productText).split('=')[0] || '';
    const rawParts = left.split('x').map(x => String(x || '').trim()).filter(Boolean);
    const num = raw => {
      const cleaned = String(raw || '').replace(/[^0-9.]/g, '');
      if (!cleaned) return 0;
      const n = Number(cleaned);
      return Number.isFinite(n) ? n : 0;
    };
    const aRaw = rawParts[0] || '', bRaw = rawParts[1] || '', cRaw = rawParts[2] || '';
    const a = num(aRaw), b = num(bRaw), c = num(cRaw);
    const hasLeadingZero = raw => /^0\d+/.test(String(raw || ''));
    const heightFactor = raw => {
      const n = num(raw);
      if (!n) return 0;
      // Preserve leading zero in height: 06 => 0.6, 073 => 0.73, 006 => 0.06.
      if (hasLeadingZero(raw)) {
        const digits = String(raw).replace(/\D/g,'');
        return n / Math.pow(10, Math.max(1, digits.length - 1));
      }
      return n >= 100 ? n / 100 : n / 10;
    };
    return {
      a, b, c,
      fa: a > 210 ? a / 1000 : a / 100,
      fb: b / 10,
      fc: heightFactor(cRaw)
    };
  }

  function calcProduct(productText){
    const lengthTotal = supportTotal(productText);
    const f = dimensionFactors(productText);
    const volume = lengthTotal && f.fa && f.fb && f.fc ? (lengthTotal * f.fa * f.fb * f.fc) : 0;
    const formula = lengthTotal && f.fa && f.fb && f.fc
      ? `${lengthTotal.toLocaleString()} × ${trimNum(f.fa)} × ${trimNum(f.fb)} × ${trimNum(f.fc)}`
      : '尺寸或支數不足，無法計算';
    return { lengthTotal, volume, formula };
  }

  function trimNum(n){
    const v = Math.round(Number(n || 0) * 1000) / 1000;
    return String(v).replace(/\.0+$/,'').replace(/(\.\d*?)0+$/,'$1');
  }
  function fmt(n){
    const v = Number(n || 0);
    return (Math.round(v * 1000) / 1000).toLocaleString();
  }
  function reqKey(prefix){
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,10)}`;
  }
  function endpointFor(mod){
    return mod === 'orders' ? '/api/orders' : mod === 'master_order' ? '/api/master_orders' : mod === 'ship' ? '/api/ship' : '/api/inventory';
  }

  function locationsHTML(item){
    const locs = Array.isArray(item.locations) ? item.locations : [];
    if (!locs.length) return '<span class="small-note">倉庫圖尚未找到位置</span>';
    return locs.map(loc => {
      const label = `${esc(loc.zone || '')}-${esc(loc.column_index || '')}-${String(loc.visual_slot || loc.slot_number || '').padStart(2,'0')}`;
      const qty = loc.ship_qty || loc.qty || 0;
      return `<button type="button" class="yx72-loc-chip" onclick="quickJumpToModule && quickJumpToModule('warehouse','',${JSON.stringify(item.product_text || '')})">${label}｜可出 ${qty}</button>`;
    }).join('');
  }

  function updateWeightResult(totalVolume){
    const input = $('yx72-ship-weight');
    const out = $('yx72-ship-weight-result');
    if (!input || !out) return;
    const weight = Number(input.value || 0);
    out.textContent = weight ? `材積 × 重量 = ${fmt(totalVolume * weight)}` : `材積合計：${fmt(totalVolume)}`;
  }

  function renderShipPreview(preview, payload){
    const section = $('ship-preview-section');
    const panel = $('ship-preview-panel') || $('module-result');
    if (!panel) return;
    if (section) section.style.display = '';
    panel.classList.remove('hidden');
    panel.style.display = '';

    const items = Array.isArray(preview.items) ? preview.items : [];
    let totalQty = 0, totalLength = 0, totalVolume = 0, totalAvailable = 0, totalShortage = 0;
    const rows = items.map(item => {
      const product = item.product_text || '';
      const calc = calcProduct(product);
      const qty = Number(item.qty || item.need_qty || qtyFromProduct(product, 1) || 0);
      const available = Number(item.master_available || 0) + Number(item.order_available || 0) + Number(item.inventory_available || 0);
      const shortage = Math.max(0, qty - available);
      totalQty += qty;
      totalLength += calc.lengthTotal;
      totalVolume += calc.volume;
      totalAvailable += available;
      totalShortage += shortage;
      const source = `總單 ${item.master_available || 0}｜訂單 ${item.order_available || 0}｜庫存 ${item.inventory_available || 0}` + (shortage ? `<br><span class="yx72-danger">不足 ${shortage}</span>` : '<br><span class="yx72-ok">可扣除</span>');
      return `<tr>
        <td><strong>${esc(product)}</strong></td>
        <td>${qty}</td>
        <td>${fmt(calc.volume)}<div class="small-note">${esc(calc.formula)}</div></td>
        <td>${source}</td>
        <td>${locationsHTML(item)}</td>
      </tr>`;
    }).join('');

    try {
      const keys = [];
      items.forEach(item => (item.locations || []).forEach(loc => keys.push(`${loc.zone}|${loc.column_index}|direct|${loc.slot_number || loc.visual_slot || 0}`)));
      localStorage.setItem('shipPreviewWarehouseHighlights', JSON.stringify(keys));
    } catch(_e) {}

    panel.innerHTML = `<div class="yx72-ship-preview-card">
      <div class="section-title">出貨預覽</div>
      <div class="small-note">已整理商品倉庫圖位置、材積計算與可扣來源。確認無誤後再按「確認扣除」。</div>
      <div class="yx72-ship-summary">
        <div>本次件數<span>${fmt(totalQty)}</span></div>
        <div>材積合計<span>${fmt(totalVolume)}</span></div>
        <div>總可扣量<span>${fmt(totalAvailable)}</span></div>
        <div>不足數量<span class="${totalShortage ? 'yx72-danger' : 'yx72-ok'}">${fmt(totalShortage)}</span></div>
      </div>
      <div class="yx72-weight-row">
        <label for="yx72-ship-weight">重量</label>
        <input id="yx72-ship-weight" class="text-input" type="number" min="0" step="0.01" placeholder="輸入重量">
        <div id="yx72-ship-weight-result" class="yx72-weight-result">材積合計：${fmt(totalVolume)}</div>
      </div>
      <div class="yx72-preview-table-wrap"><table class="yx72-preview-table"><thead><tr><th>商品</th><th>件數</th><th>材積計算</th><th>可扣來源</th><th>商品倉庫圖位置</th></tr></thead><tbody>${rows || '<tr><td colspan="5">沒有可預覽商品</td></tr>'}</tbody></table></div>
      <div class="btn-row" style="margin-top:12px;"><button class="ghost-btn" type="button" id="yx72-ship-preview-cancel">取消</button><button class="primary-btn" type="button" id="yx72-ship-preview-confirm">確認扣除</button></div>
    </div>`;
    $('yx72-ship-weight')?.addEventListener('input', () => updateWeightResult(totalVolume));
    $('yx72-ship-preview-cancel')?.addEventListener('click', () => panel.classList.add('hidden'));
    $('yx72-ship-preview-confirm')?.addEventListener('click', async function(){
      const btn = this;
      if (btn.dataset.busy === '1') return;
      btn.dataset.busy = '1'; btn.disabled = true; btn.textContent = '扣除中…';
      try {
        const result = await api('/api/ship', { method:'POST', body:JSON.stringify({ ...payload, allow_inventory_fallback:true, preview_confirmed:true, request_key:reqKey('ship_confirm') }) });
        const list = (result.breakdown || []).map(row => {
          const locs = locationsHTML(row);
          return `<div class="deduct-card"><div><strong>${esc(row.product_text || '')}</strong>｜本次出貨 ${row.qty || 0}</div><div>扣總單：${row.master_deduct || 0}｜扣訂單：${row.order_deduct || 0}｜扣庫存：${row.inventory_deduct || 0}</div><div class="small-note">剩餘：總單 ${row.remaining_after?.master ?? '-'}｜訂單 ${row.remaining_after?.order ?? '-'}｜庫存 ${row.remaining_after?.inventory ?? '-'}</div><div>${locs}</div></div>`;
        }).join('');
        panel.innerHTML = `<div class="success-card"><div class="section-title">出貨完成</div><div class="small-note">已扣除總單 / 訂單 / 庫存，下面是本次扣除摘要。</div></div>${list || '<div class="empty-state-card compact-empty">已出貨，但沒有扣除摘要。</div>'}`;
        notify('出貨完成','ok');
        try { window.loadCustomerBlocks && await window.loadCustomerBlocks(true); } catch(_e) {}
        try { window.selectCustomerForModule && payload.customer_name && await window.selectCustomerForModule(payload.customer_name); } catch(_e) {}
      } catch(e) {
        notify(e.message || '出貨失敗','error');
        btn.dataset.busy = '0'; btn.disabled = false; btn.textContent = '確認扣除';
      }
    });
    setTimeout(() => { try { panel.scrollIntoView({behavior:'smooth', block:'start'}); } catch(_e) {} }, 60);
  }

  async function fixedConfirmSubmit(){
    setFixFlag();
    const btn = $('submit-btn');
    if (!btn || btn.dataset.yx72Busy === '1') return false;
    const mod = moduleKey() || 'inventory';
    const raw = $('ocr-text')?.value || '';
    const items = parseSubmitItems(raw);
    const customer = clean($('customer-name')?.value || '');
    const needCustomer = ['orders','master_order','ship'].includes(mod);
    const resultPanel = $('module-result');
    if (!items.length) {
      notify('沒有可送出的商品資料','warn');
      if (resultPanel) { resultPanel.classList.remove('hidden'); resultPanel.style.display=''; resultPanel.innerHTML = '<div class="section-title">送出失敗</div><div class="muted">請貼上商品資料，例如 80x30x125=111+132x3。</div>'; }
      return false;
    }
    if (needCustomer && !customer) { notify('請先輸入客戶名稱','warn'); return false; }
    const payload = { customer_name:customer, ocr_text:raw, items, location:clean($('location-input')?.value || ''), request_key:reqKey(mod) };
    btn.dataset.yx72Busy = '1'; btn.disabled = true; btn.textContent = mod === 'ship' ? '整理預覽中…' : '送出中…';
    try {
      if (needCustomer) await api('/api/customers', { method:'POST', body:JSON.stringify({ name:customer, preserve_existing:true }) }).catch(() => null);
      if (mod === 'ship') {
        const preview = await api('/api/ship-preview', { method:'POST', body:JSON.stringify(payload) });
        renderShipPreview(preview, payload);
        notify('已產生出貨預覽','ok');
        return true;
      }
      const data = await api(endpointFor(mod), { method:'POST', body:JSON.stringify(payload) });
      if (resultPanel) { resultPanel.classList.remove('hidden'); resultPanel.style.display=''; resultPanel.innerHTML = `<div class="section-title">送出完成</div><div class="muted">已建立 / 更新 ${items.length} 筆資料。</div>`; }
      notify(mod === 'inventory' ? '庫存送出成功' : mod === 'orders' ? '訂單送出成功' : '總單送出成功', 'ok');
      try { if (mod === 'inventory' && window.refreshSource) await window.refreshSource('inventory', true); } catch(_e) {}
      try { if (mod === 'orders' && window.refreshSource) await window.refreshSource('orders', true); } catch(_e) {}
      try { if (mod === 'master_order' && window.refreshSource) await window.refreshSource('master_order', true); } catch(_e) {}
      try { if (needCustomer && window.loadCustomerBlocks) await window.loadCustomerBlocks(true); } catch(_e) {}
      try { if (needCustomer && window.selectCustomerForModule) await window.selectCustomerForModule(customer); } catch(_e) {}
      return data;
    } catch(e) {
      const msg = e.message || '送出失敗';
      if (resultPanel) { resultPanel.classList.remove('hidden'); resultPanel.style.display=''; resultPanel.innerHTML = `<div class="section-title">送出失敗</div><div class="muted">${esc(msg)}</div>`; }
      notify(msg, 'error');
      return false;
    } finally {
      btn.dataset.yx72Busy = '0'; btn.disabled = false; btn.textContent = '確認送出';
    }
  }

  function install(){
    setFixFlag();
    window.confirmSubmit = fixedConfirmSubmit;
    document.querySelectorAll('.yx67-warehouse-slot,.vertical-slot').forEach(el => {
      el.querySelectorAll('.yx71-longpress-label,.longpress-label,.long-press-label').forEach(x => x.remove());
    });
  }

  install();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once:true});
  window.addEventListener('pageshow', install);
  setTimeout(install, 250);
})();
/* ==== FIX74 core end ==== */


/* ==== FIX74: preserve 0xx display + no length column in shipping preview ==== */
(function(){
  'use strict';
  const VERSION='fix74-preserve-0xx-no-length';
  function clean(v){ return String(v ?? '').trim(); }
  function normalizeX(v){ return clean(v).replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/\s+/g,''); }
  function formatDimToken(v,isHeight){
    const s=clean(v);
    if(!s) return '';
    if(/^\d*\.\d+$/.test(s)){ return (s.startsWith('.') ? '0'+s : s).replace('.',''); }
    if(/^\d+$/.test(s)){ return (isHeight && s.length===1) ? s.padStart(2,'0') : s; }
    return s;
  }
  window.yx74NormalizeProductText=function(text){
    const raw=normalizeX(text);
    const parts=raw.split('=');
    const left=parts.shift()||'';
    const dims=left.split(/x/i).filter(Boolean);
    const size=dims.length>=3 ? [0,1,2].map(i=>formatDimToken(dims[i], i===2)).join('x') : left;
    return parts.length ? size+'='+parts.join('=') : size;
  };
  // Old card edit code can send master_orders / inventory / orders; backend accepts them now.
  // This marker forces cache refresh and makes it easy to verify the correct JS loaded.
  function install(){
    try{ document.documentElement.dataset.yxFix74=VERSION; document.body && document.body.setAttribute('data-yx-fix74','1'); }catch(_e){}
  }
  install();
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', install, {once:true});
  window.addEventListener('pageshow', install);
})();
/* ==== FIX74 end ==== */


/* ==== FIX75: card actions + warehouse full qty + return unplaced + support label ==== */
(function(){
  'use strict';
  const VERSION = 'fix75-card-warehouse-support-return';
  if (window.__YX75_CARD_WAREHOUSE_SUPPORT_RETURN__) return;
  window.__YX75_CARD_WAREHOUSE_SUPPORT_RETURN__ = true;

  const $ = id => document.getElementById(id);
  const clean = v => String(v ?? '').trim();
  const esc = v => String(v ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  const notify = (msg, kind='ok') => { try { (window.toast || window.showToast || window.alert)(msg, kind); } catch(_e) { console.log(msg); } };
  const api = window.yxApi || window.requestJSON || (async function(url,opt={}){
    const res = await fetch(url, { credentials:'same-origin', ...opt, headers:{'Content-Type':'application/json', ...(opt.headers||{})} });
    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch(_e) { data = {success:false, error:text || '伺服器回應格式錯誤'}; }
    if (!res.ok || data.success === false) { const err = new Error(data.error || data.message || `請求失敗：${res.status}`); err.payload = data; throw err; }
    return data;
  });
  window.yxApi = api;

  function setFlag(){
    try { document.documentElement.dataset.yxFix75 = VERSION; document.body && document.body.setAttribute('data-yx-fix75','1'); } catch(_e) {}
  }
  function normalizeX(v){ return clean(v).replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/[＋，,；;]/g,'+').replace(/\s+/g,''); }
  function formatDimToken(v, isHeight){
    const s = clean(v);
    if (!s) return '';
    if (/^\d*\.\d+$/.test(s)) return (s.startsWith('.') ? '0' + s : s).replace('.', '');
    if (/^\d+$/.test(s)) return (isHeight && s.length === 1) ? s.padStart(2, '0') : s;
    return s.replace(/\s+/g,'');
  }
  function normalizeProductText(text){
    const raw = normalizeX(text);
    if (!raw) return '';
    const parts = raw.split('=');
    const left = parts.shift() || '';
    const dims = left.split(/x/i).filter(x => x !== '');
    const size = dims.length >= 3 ? [0,1,2].map(i => formatDimToken(dims[i], i === 2)).join('x') : left;
    return parts.length ? `${size}=${parts.join('=')}` : size;
  }
  window.yx75NormalizeProductText = normalizeProductText;

  function splitProduct(text){ const raw = normalizeProductText(text); const i = raw.indexOf('='); return {size:i >= 0 ? raw.slice(0,i) : raw, support:i >= 0 ? raw.slice(i+1) : ''}; }
  function qtyFromProduct(productText, fallback=1){
    const right = splitProduct(productText).support;
    if (!right) return Number(fallback || 1) || 1;
    const canonical = '504x5+588+587+502+420+382+378+280+254+237+174';
    if (right.toLowerCase() === canonical) return 10;
    const parts = right.split('+').map(clean).filter(Boolean);
    const xParts = parts.filter(p => /x\s*\d+$/i.test(p));
    const bareParts = parts.filter(p => !/x\s*\d+$/i.test(p) && /\d/.test(p));
    if (parts.length >= 10 && xParts.length === 1 && parts[0] === xParts[0] && /^\d{3,}\s*x\s*\d+$/i.test(xParts[0]) && bareParts.length >= 8) return bareParts.length;
    let total = 0;
    parts.forEach(seg => {
      const explicit = seg.match(/(\d+)\s*[件片]/);
      if (explicit) { total += Number(explicit[1] || 0); return; }
      const m = seg.match(/x\s*(\d+)$/i);
      if (m) total += Number(m[1] || 0);
      else if (/\d/.test(seg)) total += 1;
    });
    return total || Number(fallback || 1) || 1;
  }
  function rowQty(row){
    if (typeof window.yxEffectiveQty === 'function') return window.yxEffectiveQty(row?.product_text || row?.support || '', row?.qty || 0);
    return qtyFromProduct(row?.product_text || row?.support || '', row?.qty || 1);
  }
  function rowMaterial(row){
    const v = clean(row?.material || row?.product_code || '');
    const p = normalizeX(row?.product_text || '');
    const vv = normalizeX(v);
    if (!v || (p && vv === p) || vv.includes('=') || /^\d+(?:\.\d+)?x\d+/i.test(vv)) return '';
    return v.toUpperCase();
  }
  function selectedCustomer(){ return clean($('customer-name')?.value || window.__YX_SELECTED_CUSTOMER__ || window.state?.currentCustomer || ''); }
  function sourceKey(source){
    const s = clean(source);
    if (s === '庫存' || s === 'inventory') return 'inventory';
    if (s === '訂單' || s === 'order' || s === 'orders') return 'orders';
    if (s === '總單' || s === 'master_order' || s === 'master_orders') return 'master_order';
    return s;
  }
  function sourceRows(source){
    const s = sourceKey(source);
    return (window.__yx63Rows && (window.__yx63Rows[s] || window.__yx63Rows[source])) || [];
  }
  function endpointForItem(source, id){
    const s = sourceKey(source);
    if (s === 'inventory') return `/api/inventory/${encodeURIComponent(id)}`;
    if (s === 'orders') return `/api/orders/${encodeURIComponent(id)}`;
    if (s === 'master_order') return `/api/master_orders/${encodeURIComponent(id)}`;
    return '';
  }
  function refreshAfter(source){
    const s = sourceKey(source);
    try { if (typeof window.refreshSource === 'function') return window.refreshSource(s, true); } catch(_e) {}
    try {
      if (s === 'inventory' && typeof window.loadInventory === 'function') return window.loadInventory();
      if (s === 'orders' && typeof window.loadOrdersList === 'function') return window.loadOrdersList();
      if (s === 'master_order' && typeof window.loadMasterList === 'function') return window.loadMasterList();
    } catch(_e) {}
  }
  function rowFromCard(card){
    const source = sourceKey(card?.dataset.source || '');
    const id = Number(card?.dataset.id || 0);
    const row = sourceRows(source).find(r => Number(r.id || 0) === id) || {};
    const labels = Array.from(card?.querySelectorAll('.yx63-item-grid > div') || []);
    const get = name => {
      const box = labels.find(div => clean(div.querySelector('span')?.textContent || '') === name);
      return clean(box?.querySelector('b')?.textContent || '');
    };
    const parsedText = [get('尺寸'), get('支數 x 件數')].filter(Boolean).join('=');
    return {
      ...row,
      id,
      source,
      customer_name: row.customer_name || clean(card?.dataset.customer || '') || selectedCustomer(),
      material: rowMaterial(row) || get('材質'),
      product_text: row.product_text || parsedText,
      qty: rowQty(row) || Number(get('數量') || 0) || qtyFromProduct(parsedText, 1)
    };
  }
  async function robustCardAction(card, action){
    const row = rowFromCard(card);
    const endpoint = endpointForItem(row.source, row.id);
    if (!row.id || !row.source) return notify('找不到商品資料，請重新整理', 'error');
    if (action === 'edit') {
      if (!endpoint) return notify('這個來源不支援編輯，請重新整理', 'error');
      const nextTextRaw = prompt('修改商品資料', normalizeProductText(row.product_text || ''));
      if (nextTextRaw === null) return;
      const nextText = normalizeProductText(nextTextRaw);
      const nextQtyRaw = prompt('修改數量', String(rowQty({...row, product_text:nextText}) || row.qty || 1));
      if (nextQtyRaw === null) return;
      const nextQty = Math.max(0, parseInt(nextQtyRaw || String(qtyFromProduct(nextText, row.qty || 1)), 10) || qtyFromProduct(nextText, row.qty || 1));
      try {
        const payload = { product_text: nextText, qty: nextQty, material: rowMaterial(row), product_code: rowMaterial(row), customer_name: row.customer_name || selectedCustomer() };
        await api(endpoint, { method:'PUT', body:JSON.stringify(payload) });
        notify('商品已更新', 'ok');
        await refreshAfter(row.source);
        try { if (row.customer_name && typeof window.selectCustomerForModule === 'function') await window.selectCustomerForModule(row.customer_name); } catch(_e) {}
      } catch(e) { notify(e.message || '更新失敗', 'error'); }
      return;
    }
    if (action === 'delete') {
      if (!endpoint) return notify('這個來源不支援刪除，請重新整理', 'error');
      if (!confirm('確定刪除此商品？')) return;
      try {
        await api(endpoint, { method:'DELETE' });
        notify('商品已刪除', 'ok');
        await refreshAfter(row.source);
        try { if (row.customer_name && typeof window.selectCustomerForModule === 'function') await window.selectCustomerForModule(row.customer_name); } catch(_e) {}
      } catch(e) { notify(e.message || '刪除失敗', 'error'); }
      return;
    }
    if (action === 'ship') {
      const customer = row.customer_name || selectedCustomer();
      if (!customer) return notify('直接出貨需要客戶名稱', 'warn');
      const product = normalizeProductText(row.product_text || '');
      if (!product) return notify('找不到商品資料', 'error');
      const draft = { customer_name:customer, product_text:product, qty:rowQty(row), source:row.source, id:row.id, at:Date.now() };
      try { localStorage.setItem('yxShipDraft', JSON.stringify(draft)); } catch(_e) {}
      if ((document.querySelector('.module-screen')?.dataset.module || '') === 'ship') {
        if ($('customer-name')) $('customer-name').value = customer;
        if ($('ocr-text')) { $('ocr-text').value = product; $('ocr-text').dispatchEvent(new Event('input', {bubbles:true})); }
        try { if (typeof window.loadShipCustomerItems66 === 'function') await window.loadShipCustomerItems66(customer); } catch(_e) {}
        notify('已帶入出貨資料，請按確認送出產生預覽', 'ok');
      } else {
        location.href = '/ship';
      }
      return;
    }
  }

  // Window-capture runs before the old document-capture handler that stops propagation.
  window.addEventListener('click', function(e){
    const btn = e.target?.closest?.('[data-yx63-action]');
    if (!btn) return;
    const card = btn.closest('.yx63-item-card');
    if (!card) return;
    e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    robustCardAction(card, btn.dataset.yx63Action || btn.getAttribute('data-yx63-action'));
  }, true);

  function replaceLengthLabels(){
    const root = document.body || document.documentElement;
    if (!root) return;
    try {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node){
          if (!node.nodeValue || !node.nodeValue.includes('長度計算')) return NodeFilter.FILTER_REJECT;
          const p = node.parentElement;
          if (p && /SCRIPT|STYLE|TEXTAREA|INPUT/.test(p.tagName)) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach(node => { node.nodeValue = node.nodeValue.replace(/長度計算/g, '支數計算'); });
    } catch(_e) {}
  }

  function selectedWarehouseItem(){
    const sel = $('warehouse-item-select');
    if (!sel || !sel.value) return null;
    try { return JSON.parse(sel.value); } catch(_e) { return null; }
  }
  function fullWarehouseQty(item){
    const n = Number(item?.unplaced_qty ?? item?.qty ?? item?.total_qty ?? 0);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
  }
  function fillWarehouseQtyFromSelection(){
    const input = $('warehouse-add-qty');
    const item = selectedWarehouseItem();
    if (!input || !item) return;
    input.value = String(fullWarehouseQty(item));
    input.max = String(fullWarehouseQty(item));
  }
  const oldOpenWarehouseModal = window.openWarehouseModal;
  if (typeof oldOpenWarehouseModal === 'function' && !oldOpenWarehouseModal.__yx75Wrapped) {
    const wrapped = async function(){
      const result = await oldOpenWarehouseModal.apply(this, arguments);
      setTimeout(() => { fillWarehouseQtyFromSelection(); bindWarehouseModalButtons(); }, 30);
      return result;
    };
    wrapped.__yx75Wrapped = true;
    window.openWarehouseModal = wrapped;
  }
  function addSelectedItemToCellFixed(){
    if (!window.state) return notify('倉庫狀態尚未載入，請重新整理', 'error');
    const item = selectedWarehouseItem();
    if (!item) return notify('請先選擇商品', 'warn');
    const maxQty = fullWarehouseQty(item);
    const qtyInput = $('warehouse-add-qty');
    let qty = parseInt(qtyInput?.value || String(maxQty), 10);
    if (!Number.isFinite(qty) || qty <= 0) qty = maxQty;
    qty = Math.min(qty, maxQty);
    const product = normalizeProductText(item.product_text || item.product_size || '');
    if (!product) return notify('商品資料不完整', 'error');
    window.state.currentCellItems = Array.isArray(window.state.currentCellItems) ? window.state.currentCellItems : [];
    const next = {
      ...item,
      product_text: product,
      product_code: item.product_code || '',
      material: rowMaterial(item),
      qty,
      customer_name: item.customer_name || '',
      source: item.source || 'unplaced',
      source_summary: item.source_summary || ((item.sources || []).map(s => `${s.source}${s.qty}`).join('、'))
    };
    window.state.currentCellItems.push(next);
    try { window.renderWarehouseCellItems && window.renderWarehouseCellItems(); } catch(_e) {}
    notify(`已加入 ${qty} 件，記得按「儲存格位」`, 'ok');
  }
  window.addSelectedItemToCell = addSelectedItemToCellFixed;

  function bindWarehouseModalButtons(){
    const sel = $('warehouse-item-select');
    if (sel && sel.dataset.yx75Bound !== '1') {
      sel.dataset.yx75Bound = '1';
      sel.addEventListener('change', fillWarehouseQtyFromSelection);
      fillWarehouseQtyFromSelection();
    }
    const addBtn = Array.from(document.querySelectorAll('#warehouse-modal button')).find(b => (b.getAttribute('onclick') || '').includes('addSelectedItemToCell'));
    if (addBtn) { addBtn.type = 'button'; addBtn.onclick = function(ev){ ev && ev.preventDefault && ev.preventDefault(); addSelectedItemToCellFixed(); return false; }; }
  }
  document.addEventListener('change', function(e){ if (e.target?.id === 'warehouse-item-select') fillWarehouseQtyFromSelection(); }, true);

  async function returnCellToUnplaced(zone, col, num){
    if (!zone || !col || !num) return notify('找不到格位資料', 'error');
    if (!confirm(`${zone} 區第 ${col} 欄第 ${String(num).padStart(2,'0')} 格的商品要返回「未錄入倉庫圖」嗎？`)) return;
    try {
      await api('/api/warehouse/return-unplaced', { method:'POST', body:JSON.stringify({zone, column_index:Number(col), slot_number:Number(num)}) });
      notify('已返回未錄入倉庫圖', 'ok');
      try { window.closeWarehouseModal && window.closeWarehouseModal(); } catch(_e) {}
      try { await (window.renderWarehouse && window.renderWarehouse()); } catch(_e) {}
      try { await api('/api/warehouse/available-items', {method:'GET'}).then(d => { if (window.state?.warehouse) window.state.warehouse.availableItems = Array.isArray(d.items) ? d.items : []; }); } catch(_e) {}
    } catch(e) { notify(e.message || '返回上一步失敗', 'error'); }
  }
  function ensureReturnButton(){
    const menu = $('yx71-warehouse-cell-menu');
    if (!menu) return;
    if (!$('yx75-warehouse-menu-return')) {
      const del = $('yx71-warehouse-menu-delete');
      const btn = document.createElement('button');
      btn.className = 'ghost-btn';
      btn.type = 'button';
      btn.id = 'yx75-warehouse-menu-return';
      btn.textContent = '返回上一步（回到未錄入倉庫圖）';
      if (del && del.parentElement) del.parentElement.insertBefore(btn, del);
    }
    const btn = $('yx75-warehouse-menu-return');
    if (btn && btn.dataset.yx75Bound !== '1') {
      btn.dataset.yx75Bound = '1';
      btn.addEventListener('click', function(e){
        e.preventDefault(); e.stopPropagation();
        const title = clean($('yx71-warehouse-menu-title')?.textContent || '');
        const m = title.match(/([AB])\s*區第\s*(\d+)\s*欄\s*第\s*(\d+)\s*格/);
        const menu = $('yx71-warehouse-cell-menu');
        if (menu) menu.classList.add('hidden');
        if (!m) return notify('找不到格位資料，請重新長按一次', 'error');
        returnCellToUnplaced(m[1], Number(m[2]), Number(m[3]));
      });
    }
  }

  function applyShipDraft(){
    if ((document.querySelector('.module-screen')?.dataset.module || '') !== 'ship') return;
    let draft = null;
    try { draft = JSON.parse(localStorage.getItem('yxShipDraft') || 'null'); } catch(_e) {}
    if (!draft || Date.now() - Number(draft.at || 0) > 15 * 60 * 1000) return;
    const product = normalizeProductText(draft.product_text || '');
    if (draft.customer_name && $('customer-name')) $('customer-name').value = draft.customer_name;
    if (product && $('ocr-text')) { $('ocr-text').value = product; $('ocr-text').dispatchEvent(new Event('input', {bubbles:true})); }
    try { localStorage.removeItem('yxShipDraft'); } catch(_e) {}
    try { if (typeof window.loadShipCustomerItems66 === 'function') window.loadShipCustomerItems66(draft.customer_name || ''); } catch(_e) {}
  }

  function boot(){
    setFlag();
    replaceLengthLabels();
    bindWarehouseModalButtons();
    ensureReturnButton();
    applyShipDraft();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true}); else boot();
  window.addEventListener('pageshow', boot);
  try { new MutationObserver(() => { replaceLengthLabels(); bindWarehouseModalButtons(); ensureReturnButton(); }).observe(document.body || document.documentElement, {childList:true, subtree:true, characterData:true}); } catch(_e) {}
})();
/* ==== FIX75 end ==== */

/* ==== FIX76: merge-confirm + warehouse-save + ship-guard ==== */
(function(){
  'use strict';
  const VERSION = 'fix76-merge-confirm-ship-master-guard';
  if (window.__YX76_MERGE_CONFIRM_SHIP_GUARD__) return;
  window.__YX76_MERGE_CONFIRM_SHIP_GUARD__ = true;

  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  const clean = v => String(v ?? '').trim();
  const notify = (msg, kind='ok') => { try { (window.toast || window.showToast || window.alert)(msg, kind); } catch(_e) { console.log(msg); } };
  const api = window.yxApi || window.requestJSON || (async function(url,opt={}){
    const res = await fetch(url, { credentials:'same-origin', ...opt, headers:{'Content-Type':'application/json', ...(opt.headers||{})} });
    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch(_e) { data = {success:false, error:text || '伺服器回應格式錯誤'}; }
    if (!res.ok || data.success === false) { const err = new Error(data.error || data.message || `請求失敗：${res.status}`); err.payload = data; throw err; }
    return data;
  });
  window.yxApi = api;

  function moduleKey(){ return document.querySelector('.module-screen')?.dataset.module || (typeof window.currentModule === 'function' ? window.currentModule() : ''); }
  function normalizeX(v){ return clean(v).replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/[＋，,；;]/g,'+').replace(/\s+/g,''); }
  function qtyFromProduct(productText, fallback=1){
    const raw = normalizeX(productText); const right = raw.includes('=') ? raw.split('=').slice(1).join('=') : '';
    if(!right) return Number(fallback || 1) || 1;
    const parts = right.split('+').map(clean).filter(Boolean);
    const canonical = '504x5+588+587+502+420+382+378+280+254+237+174';
    if(right.toLowerCase() === canonical) return 10;
    const xParts = parts.filter(p => /x\s*\d+$/i.test(p));
    const bareParts = parts.filter(p => !/x\s*\d+$/i.test(p) && /\d/.test(p));
    if(parts.length >= 10 && xParts.length === 1 && parts[0] === xParts[0] && /^\d{3,}\s*x\s*\d+$/i.test(xParts[0]) && bareParts.length >= 8) return bareParts.length;
    let total = 0;
    parts.forEach(seg => { const m = seg.match(/x\s*(\d+)$/i); if(m) total += Number(m[1] || 0); else if(/\d/.test(seg)) total += 1; });
    return total || Number(fallback || 1) || 1;
  }
  function parseItems(raw){
    const lines = String(raw || '').replace(/\r/g,'\n').split(/\n+/).map(normalizeX).filter(Boolean);
    const out = [];
    lines.forEach(line => {
      if(!/[0-9].*x.*[0-9]/i.test(line)) return;
      const m = line.match(/\d+(?:\.\d+)?x\d+(?:\.\d+)?x\d+(?:\.\d+)?(?:=[0-9x+\.]+)?/ig);
      const tokens = m && m.length ? m : [line];
      tokens.forEach(token => { token = normalizeX(token); if(token) out.push({product_text:token, product_code:'', material:'', qty:qtyFromProduct(token,1)}); });
    });
    return out;
  }
  function reqKey(prefix){ return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,10)}`; }

  function ensurePanel(){
    let panel = $('duplicate-action-panel');
    if(!panel){
      panel = document.createElement('div');
      panel.id = 'duplicate-action-panel';
      panel.className = 'result-card hidden';
      const form = $('ocr-text')?.closest('.manual-entry-panel,.upload-panel,.glass.panel') || document.querySelector('.module-screen');
      form && form.appendChild(panel);
    }
    return panel;
  }
  function renderDuplicatePanel(data, onConfirm){
    const panel = ensurePanel();
    const rows = (data.duplicates || []).map(d => {
      const existing = (d.existing_rows || []).map(r => `<li>${esc(r.product_text || '')}｜${esc(r.material || '未填材質')}｜現有 ${r.qty || 0} 件${r.customer_name ? `｜${esc(r.customer_name)}` : ''}</li>`).join('') || '<li>本次輸入內重複，尚無舊資料</li>';
      const incoming = (d.new_items || []).map(r => `<li>${esc(r.product_text || '')}｜新增 ${r.qty || 0} 件</li>`).join('');
      return `<div class="yx76-dup-item">
        <div><strong>${esc(d.size || '')}</strong>｜材質：${esc(d.material || '未填材質')}</div>
        <div class="small-note">目前 ${d.existing_qty || 0} 件，本次 ${d.new_qty || 0} 件；確認後會合併成同一筆。</div>
        <div class="yx76-dup-columns"><div><b>要合併的舊資料</b><ul>${existing}</ul></div><div><b>本次新增</b><ul>${incoming}</ul></div></div>
      </div>`;
    }).join('');
    panel.innerHTML = `<div class="section-title">發現相同尺寸 + 材質，是否合併？</div>
      <div class="small-note">請先確認下面列出的資料；按「確認合併送出」後才會合併。</div>
      ${rows}
      <div class="btn-row"><button type="button" class="primary-btn" id="yx76-confirm-merge">確認合併送出</button><button type="button" class="ghost-btn" id="yx76-cancel-merge">取消送出</button></div>`;
    panel.classList.remove('hidden');
    panel.style.display = '';
    $('yx76-cancel-merge')?.addEventListener('click', () => { panel.classList.add('hidden'); notify('已取消送出，尚未合併', 'warn'); }, {once:true});
    $('yx76-confirm-merge')?.addEventListener('click', async () => { panel.classList.add('hidden'); await onConfirm(); }, {once:true});
    try { panel.scrollIntoView({behavior:'smooth', block:'center'}); } catch(_e) {}
  }

  const oldConfirm = window.confirmSubmit;
  if (typeof oldConfirm === 'function' && !oldConfirm.__yx76MergeConfirm) {
    const wrapped = async function(){
      const mod = moduleKey() || 'inventory';
      if(!['inventory','orders','master_order'].includes(mod)) return oldConfirm.apply(this, arguments);
      if(window.__YX76_DUPLICATE_CONFIRMED__){
        window.__YX76_DUPLICATE_CONFIRMED__ = false;
        return oldConfirm.apply(this, arguments);
      }
      const raw = $('ocr-text')?.value || '';
      const items = parseItems(raw);
      const customer = clean($('customer-name')?.value || '');
      if(!items.length) return oldConfirm.apply(this, arguments);
      if(['orders','master_order'].includes(mod) && !customer) return oldConfirm.apply(this, arguments);
      try{
        const check = await api('/api/duplicate-check', {method:'POST', body:JSON.stringify({module:mod, customer_name:customer, ocr_text:raw, items, request_key:reqKey('dup_check')})});
        if(check.has_duplicates){
          renderDuplicatePanel(check, async () => { window.__YX76_DUPLICATE_CONFIRMED__ = true; await window.confirmSubmit(); });
          return false;
        }
      }catch(e){
        notify(e.message || '合併檢查失敗，已停止送出', 'error');
        return false;
      }
      return oldConfirm.apply(this, arguments);
    };
    wrapped.__yx76MergeConfirm = true;
    wrapped.__yx76Original = oldConfirm;
    window.confirmSubmit = wrapped;
  }

  // 圖三的出貨下方紅色/缺貨卡片是重複輔助資訊，出貨仍以「商品資料」與「出貨預覽」為主。
  function hideShipSelectedCards(){
    const section = $('ship-selected-section');
    if(section){ section.classList.add('yx76-hidden-ship-selected'); section.style.display = 'none'; }
  }

  // 最後保險：倉庫儲存必帶 column_index，避免 API 收到 column 後回「格位參數錯誤」。
  const oldSaveWarehouseCell = window.saveWarehouseCell;
  if(typeof oldSaveWarehouseCell === 'function' && !oldSaveWarehouseCell.__yx76WarehouseSave){
    const fixed = async function(){
      if(!window.state?.currentCell) return notify('找不到格位資料，請重新點選格子', 'error');
      const cell = window.state.currentCell || {};
      try{
        await api('/api/warehouse/cell', {method:'POST', body:JSON.stringify({
          zone: cell.zone,
          column_index: Number(cell.column_index || cell.column || cell.col || 0),
          slot_type: 'direct',
          slot_number: Number(cell.slot_number || cell.num || 0),
          items: window.state.currentCellItems || [],
          note: $('warehouse-note')?.value || ''
        })});
        notify('格位已儲存', 'ok');
        try{ window.closeWarehouseModal && window.closeWarehouseModal(); }catch(_e){}
        try{ await (window.renderWarehouse && window.renderWarehouse(true)); }catch(_e){ try{ await window.renderWarehouse(); }catch(_e2){} }
      }catch(e){ notify(e.message || '格位更新失敗', 'error'); }
    };
    fixed.__yx76WarehouseSave = true;
    window.saveWarehouseCell = fixed;
  }

  function boot(){
    try { document.documentElement.dataset.yxFix76 = VERSION; document.body && document.body.setAttribute('data-yx-fix76','1'); } catch(_e) {}
    hideShipSelectedCards();
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true}); else boot();
  window.addEventListener('pageshow', boot);
})();
/* ==== FIX76 end ==== */

/* ==== FIX77 final master stabilization start ==== */
(function(){
  'use strict';
  const VERSION = 'FIX77_FINAL_MASTER_STABILIZATION';
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  const clean = (v) => String(v ?? '').trim();
  const toast = (msg, kind='ok') => {
    try { (window.toast || window.showToast || window.alert)(msg, kind); }
    catch(_e) { try { console.log(msg); } catch(_e2) {} }
  };
  const api = window.yxApi || window.requestJSON || (async function(url, opt={}){
    const res = await fetch(url, { credentials:'same-origin', ...opt, headers:{'Content-Type':'application/json', ...(opt.headers||{})} });
    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch(_e) { data = { success:false, error:text || '伺服器回應格式錯誤' }; }
    if(!res.ok || data.success === false){ const err = new Error(data.error || data.message || `請求失敗：${res.status}`); err.payload = data; throw err; }
    return data;
  });
  window.yxApi = api;

  function moduleKey(){
    return document.querySelector('.module-screen')?.dataset.module || (typeof window.currentModule === 'function' ? window.currentModule() : '');
  }
  function endpointFor(mod){
    return mod === 'orders' ? '/api/orders' : mod === 'master_order' ? '/api/master_orders' : mod === 'ship' ? '/api/ship' : '/api/inventory';
  }
  function reqKey(prefix){ return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,10)}`; }
  function normalizeX(v){
    return String(v ?? '')
      .replace(/[Ｘ×✕＊*X]/g,'x')
      .replace(/[＝]/g,'=')
      .replace(/[＋，,；;]/g,'+')
      .replace(/（/g,'(').replace(/）/g,')')
      .trim();
  }
  function formatDim(v, idx){
    let s = clean(v).replace(/^[_\-]+$/,'');
    if(!s) return '';
    if(/^[A-Za-z]+$/.test(s)) return s.toUpperCase();
    if(/^\d*\.\d+$/.test(s)) {
      const compact = s.replace('.', '');
      return s.startsWith('.') ? ('0' + compact) : compact;
    }
    if(/^\d+$/.test(s) && idx === 2 && s.length === 1) return s.padStart(2,'0');
    return s.replace(/\s+/g,'');
  }
  function normalizeLeft(left){
    return normalizeX(left).replace(/\s+/g,'').split(/x/i).slice(0,3).map((p,i)=>formatDim(p,i)).join('x');
  }
  function cleanQtyExpr(expr){
    return normalizeX(expr)
      .replace(/\s+/g,'')
      .replace(/片|件/g,'')
      .replace(/[^0-9A-Za-z一-鿿x+\-().]/g,'')
      .replace(/\++/g,'+')
      .replace(/^\+|\+$/g,'');
  }
  function sortQtyExpr(expr){
    const raw = cleanQtyExpr(expr);
    if(!raw) return '';
    const multi = [], single = [];
    raw.split('+').filter(Boolean).forEach((seg, idx) => {
      const nums = (seg.match(/\d+/g) || []).map(n => parseInt(n, 10) || 0);
      if(nums.length >= 2 && /x/i.test(seg)) multi.push({seg, cases:nums[1]||0, supports:nums[0]||0, idx});
      else if(nums.length >= 1) single.push({seg, value:nums[0]||0, idx});
      else single.push({seg, value:0, idx});
    });
    multi.sort((a,b)=>(b.cases-a.cases)||(b.supports-a.supports)||(a.idx-b.idx));
    single.sort((a,b)=>(b.value-a.value)||(a.idx-b.idx));
    return multi.map(x=>x.seg).concat(single.map(x=>x.seg)).join('+');
  }
  function qtyFromRight(right, originalRight=''){
    const expr = cleanQtyExpr(right);
    if(!expr) return 1;
    if(/[件片]/.test(String(originalRight || '')) && /^\d+$/.test(expr)) return Math.max(1, Number(expr || 0) || 1);
    const parts = expr.split('+').filter(Boolean);
    const xParts = parts.filter(p => /^\d+(?:\.\d+)?x\d+$/i.test(p));
    const bareParts = parts.filter(p => /^\d+(?:\.\d+)?$/.test(p));
    // 特例：100x30x63=504x5+588+... 這種「多個長度包成同一包」依段數算件數。
    if(parts.length >= 6 && xParts.length === 1 && bareParts.length === parts.length - 1) return parts.length;
    let total = 0;
    parts.forEach(seg => {
      const m = seg.match(/x\s*(\d+)$/i);
      if(m) total += Number(m[1] || 0) || 0;
      else if(/\d/.test(seg)) total += 1;
    });
    if(!total && /[件片]/.test(originalRight)){
      const n = String(originalRight).match(/\d+/);
      if(n) total = Number(n[0] || 0) || 0;
    }
    return Math.max(1, total || 1);
  }
  function mergeItems(items){
    const map = new Map();
    (items || []).forEach(it => {
      const text = clean(it.product_text || '');
      if(!text) return;
      const material = clean(it.material || it.product_code || '');
      const key = `${text}||${material}`;
      const prev = map.get(key) || { product_text:text, product_code:material, material, qty:0 };
      prev.qty += Number(it.qty || 0) || 0;
      map.set(key, prev);
    });
    return Array.from(map.values()).filter(it => it.product_text && Number(it.qty || 0) > 0);
  }
  function parseManualItems(raw){
    const material = clean($('batch-material')?.value || '');
    const out = [];
    let lastDims = ['', '', ''];
    const lines = String(raw || '').replace(/\r/g,'\n').split(/\n+/).map(s=>normalizeX(s)).filter(Boolean);
    const push = (leftRaw, rightRaw) => {
      leftRaw = normalizeX(leftRaw).replace(/\s+/g,'');
      rightRaw = normalizeX(rightRaw || '');
      if(!leftRaw) return;
      let parts = leftRaw.split(/x/i).map(s=>s.trim()).filter(s=>s !== '');
      let dims = ['', '', ''];
      if(parts.length >= 3){
        dims = [0,1,2].map(i => /^[_\-]+$/.test(parts[i] || '') ? (lastDims[i] || '') : (parts[i] || ''));
      }else if(parts.length === 2 && /^[_\-]+$/.test(parts[1] || '')){
        dims = [parts[0] || lastDims[0] || '', lastDims[1] || '', lastDims[2] || ''];
      }else if(parts.length === 2){
        dims = [parts[0] || lastDims[0] || '', parts[1] || lastDims[1] || '', lastDims[2] || ''];
      }else if(parts.length === 1){
        dims = [parts[0] || lastDims[0] || '', lastDims[1] || '', lastDims[2] || ''];
      }
      dims = dims.map((d,i)=>formatDim(d,i));
      if(!dims[0] || !dims[1] || !dims[2]) return;
      lastDims = dims.slice();
      let right = sortQtyExpr(rightRaw);
      if(!right && /[件片]/.test(rightRaw)){
        const n = rightRaw.match(/\d+/);
        right = n ? n[0] : '';
      }
      if(!right) right = '1';
      const product_text = `${dims.join('x')}=${right}`;
      out.push({ product_text, product_code: material, material, qty: qtyFromRight(right, rightRaw) });
    };
    lines.forEach(line => {
      const compact = normalizeX(line).replace(/\s+/g,'');
      if(!compact) return;
      // 棧板19片
      const pallet = compact.match(/^(?:棧板|栈板|木棧板|木栈板)(\d+)片?$/);
      if(pallet){ out.push({ product_text:`棧板=${pallet[1]}`, product_code:material, material, qty:Number(pallet[1]||0)||1 }); return; }
      if(compact.includes('=')){
        const [left, ...rest] = compact.split('=');
        push(left, rest.join('='));
        return;
      }
      // 無等號但長寬高存在時，當 1 件處理。
      const dim3 = compact.match(/^((?:[_\-]+|[A-Za-z]+|\d+(?:\.\d+)?)x(?:[_\-]+|[A-Za-z]+|\d+(?:\.\d+)?)x(?:[_\-]+|[A-Za-z]+|\d+(?:\.\d+)?))$/i);
      if(dim3) push(dim3[1], '1');
    });
    return mergeItems(out);
  }
  function collectSubmitItems(){
    const box = $('ocr-text');
    const raw = box?.value || '';
    let items = parseManualItems(raw);
    if(!items.length && typeof window.parseTextareaItems === 'function'){
      try { items = window.parseTextareaItems(); } catch(_e) { items = []; }
    }
    if(box && items.length){ box.value = items.map(it => it.product_text).join('\n'); }
    return mergeItems(items);
  }
  window.yx77CollectSubmitItems = collectSubmitItems;

  function ensureResultPanel(id='module-result'){
    let panel = $(id);
    if(!panel){ panel = document.createElement('div'); panel.id = id; panel.className = 'result-card'; document.querySelector('.module-screen')?.appendChild(panel); }
    panel.classList.remove('hidden'); panel.style.display = '';
    return panel;
  }
  function setSubmitBusy(isBusy, text){
    const btn = $('submit-btn');
    if(!btn) return;
    btn.disabled = !!isBusy;
    btn.dataset.yx77Busy = isBusy ? '1' : '0';
    btn.textContent = isBusy ? (text || '送出中…') : '確認送出';
  }
  function renderDuplicatePanel(data, onConfirm){
    const panel = ensureResultPanel('duplicate-action-panel');
    const rows = (data.duplicates || []).map(d => {
      const oldRows = (d.existing_rows || []).map(r => `<li>${esc(r.product_text || '')}｜材質：${esc(r.material || '未填材質')}｜現有 ${Number(r.qty||0)} 件${r.customer_name ? `｜${esc(r.customer_name)}` : ''}</li>`).join('') || '<li>本次輸入內重複，尚無舊資料</li>';
      const newRows = (d.new_items || []).map(r => `<li>${esc(r.product_text || '')}｜新增 ${Number(r.qty||0)} 件</li>`).join('') || '<li>本次新增資料</li>';
      return `<div class="yx76-dup-item"><div><strong>${esc(d.size || '')}</strong>｜材質：${esc(d.material || '未填材質')}</div><div class="small-note">目前 ${Number(d.existing_qty||0)} 件，本次 ${Number(d.new_qty||0)} 件；確認後會合併。</div><div class="yx76-dup-columns"><div><b>舊資料</b><ul>${oldRows}</ul></div><div><b>本次新增</b><ul>${newRows}</ul></div></div></div>`;
    }).join('');
    panel.innerHTML = `<div class="section-title">發現相同尺寸 + 材質，是否合併？</div><div class="small-note">下面已列出要合併的資料。按確認後才會合併送出。</div>${rows}<div class="btn-row"><button type="button" class="primary-btn" id="yx77-confirm-merge">確認合併送出</button><button type="button" class="ghost-btn" id="yx77-cancel-merge">取消送出</button></div>`;
    $('yx77-cancel-merge')?.addEventListener('click', () => { panel.classList.add('hidden'); toast('已取消送出，尚未合併', 'warn'); }, {once:true});
    $('yx77-confirm-merge')?.addEventListener('click', async () => { panel.classList.add('hidden'); await onConfirm(); }, {once:true});
    try { panel.scrollIntoView({behavior:'smooth', block:'center'}); } catch(_e) {}
  }

  function dimToVolumeFactor(v, idx){
    const raw = clean(v).replace(/^0+(?=\d)/, '');
    const n = Number(raw || 0);
    if(!n) return 0;
    if(idx === 0) return n > 210 ? n / 1000 : n / 100;
    if(idx === 1) return n / 10;
    if(idx === 2) return n >= 100 ? n / 100 : n / 10;
    return n;
  }
  function supportSum(productText){
    const right = cleanQtyExpr(String(productText || '').split('=').slice(1).join('='));
    if(!right) return 0;
    let total = 0;
    right.split('+').filter(Boolean).forEach(seg => {
      const m = seg.match(/^(\d+(?:\.\d+)?)x(\d+)$/i);
      if(m) total += (Number(m[1]) || 0) * (Number(m[2]) || 0);
      else if(/^\d+(?:\.\d+)?$/.test(seg)) total += Number(seg) || 0;
    });
    return total;
  }
  function volumeForProduct(productText){
    const left = normalizeLeft(String(productText || '').split('=')[0] || '');
    const dims = left.split('x');
    if(dims.length < 3) return 0;
    const support = supportSum(productText);
    if(!support) return 0;
    return support * dimToVolumeFactor(dims[0],0) * dimToVolumeFactor(dims[1],1) * dimToVolumeFactor(dims[2],2);
  }
  function renderShipPreview(preview, payload){
    const panel = ensureResultPanel('ship-preview-panel');
    const items = Array.isArray(preview.items) ? preview.items : [];
    const totalVolume = items.reduce((sum, it) => sum + volumeForProduct(it.product_text || ''), 0);
    const hasShortage = items.some(it => (it.shortage_reasons || []).length);
    const rows = items.map(it => {
      const locs = (it.locations || []).map(loc => `<button type="button" class="ship-location-chip ship-location-jump" onclick="quickJumpToModule && quickJumpToModule('warehouse','',${JSON.stringify(it.product_text || '')})">${esc(loc.zone || '')}-${esc(loc.column_index || '')}-${String(loc.visual_slot || loc.slot_number || '').padStart(2,'0')}｜可出 ${Number(loc.ship_qty || loc.qty || 0)}</button>`).join('') || '<span class="small-note">倉庫圖中尚未找到位置</span>';
      const reasons = (it.shortage_reasons || []).length ? `<div class="error-card compact-danger">${esc((it.shortage_reasons || []).join('、'))}</div>` : '';
      return `<div class="ship-breakdown-item ${reasons ? 'has-shortage' : ''}"><div><strong>${esc(it.product_text || '')}</strong>｜本次 ${Number(it.qty||0)} 件</div><div class="ship-breakdown-list"><span class="ship-mini-chip">總單 ${Number(it.master_available||0)}</span><span class="ship-mini-chip">訂單 ${Number(it.order_available||0)}</span><span class="ship-mini-chip">庫存 ${Number(it.inventory_available||0)}</span></div>${reasons}<div class="small-note">${esc(it.recommendation || '')}</div><div class="ship-breakdown-list">${locs}</div></div>`;
    }).join('');
    panel.innerHTML = `<div class="success-card"><div class="section-title">出貨預覽</div><div class="small-note">${esc(preview.message || '請確認扣除來源、倉庫位置與材積。')}</div></div><div class="ship-preview-summary"><div class="ship-summary-chip">材積<span class="small-note">${totalVolume.toFixed(3)}</span></div><div class="ship-summary-chip">狀態<span class="small-note">${hasShortage ? '需確認' : '可出貨'}</span></div></div>${rows || '<div class="empty-state-card compact-empty">沒有預覽資料</div>'}<div class="glass panel" style="margin-top:12px;"><label class="field-label">重量</label><input id="yx77-ship-weight" class="text-input" type="number" step="0.01" placeholder="輸入重量，自動計算 材積 × 重量"><div class="small-note" id="yx77-ship-weight-result">材積 ${totalVolume.toFixed(3)}</div></div><div class="btn-row"><button type="button" class="ghost-btn" id="yx77-cancel-ship">取消</button><button type="button" class="primary-btn" id="yx77-confirm-ship">確認扣除</button></div>`;
    $('yx77-ship-weight')?.addEventListener('input', () => {
      const w = Number($('yx77-ship-weight')?.value || 0);
      const out = $('yx77-ship-weight-result');
      if(out) out.textContent = w ? `材積 ${totalVolume.toFixed(3)} × 重量 ${w} = ${(totalVolume*w).toFixed(3)}` : `材積 ${totalVolume.toFixed(3)}`;
    });
    $('yx77-cancel-ship')?.addEventListener('click', () => panel.classList.add('hidden'), {once:true});
    $('yx77-confirm-ship')?.addEventListener('click', async function(){
      const btn = this;
      if(btn.dataset.busy === '1') return;
      btn.dataset.busy = '1'; btn.disabled = true; btn.textContent = '扣除中…';
      try{
        const result = await api('/api/ship', {method:'POST', body:JSON.stringify({...payload, allow_inventory_fallback:true, preview_confirmed:true, request_key:reqKey('ship_confirm')})});
        const doneRows = (result.breakdown || []).map(row => `<div class="deduct-card"><div><strong>${esc(row.product_text || '')}</strong>｜本次出貨 ${Number(row.qty||0)}</div><div>扣總單：${Number(row.master_deduct||0)}｜扣訂單：${Number(row.order_deduct||0)}｜扣庫存：${Number(row.inventory_deduct||0)}</div><div class="small-note">剩餘：總單 ${row.remaining_after?.master ?? '-'}｜訂單 ${row.remaining_after?.order ?? '-'}｜庫存 ${row.remaining_after?.inventory ?? '-'}</div></div>`).join('');
        panel.innerHTML = `<div class="success-card"><div class="section-title">出貨完成</div><div class="small-note">已完成扣除，下面是本次摘要。</div></div>${doneRows || '<div class="empty-state-card compact-empty">已出貨。</div>'}`;
        toast('出貨完成', 'ok');
        try { window.loadCustomerBlocks && await window.loadCustomerBlocks(true); } catch(_e) {}
      }catch(e){
        toast(e.message || '出貨失敗', 'error');
        btn.dataset.busy = '0'; btn.disabled = false; btn.textContent = '確認扣除';
      }
    });
    try { panel.scrollIntoView({behavior:'smooth', block:'start'}); } catch(_e) {}
  }

  async function finalConfirmSubmit(){
    const btn = $('submit-btn');
    if(btn?.dataset.yx77Busy === '1') return false;
    const mod = moduleKey() || 'inventory';
    const raw = $('ocr-text')?.value || '';
    const items = collectSubmitItems();
    const customer = clean($('customer-name')?.value || '');
    const needCustomer = ['orders','master_order','ship'].includes(mod);
    const resultPanel = ensureResultPanel('module-result');
    if(!items.length){ resultPanel.innerHTML = '<div class="error-card">沒有可送出的商品資料，請確認格式。</div>'; toast('沒有可送出的商品資料', 'warn'); return false; }
    if(needCustomer && !customer){ resultPanel.innerHTML = '<div class="error-card">請先輸入客戶名稱。</div>'; toast('請先輸入客戶名稱', 'warn'); return false; }
    const payload = { customer_name:customer, ocr_text:raw, items, location:clean($('location-input')?.value || ''), duplicate_mode:'merge', request_key:reqKey(mod) };
    setSubmitBusy(true, mod === 'ship' ? '整理預覽中…' : '送出中…');
    try{
      if(['inventory','orders','master_order'].includes(mod) && !window.__YX77_DUPLICATE_CONFIRMED__){
        const check = await api('/api/duplicate-check', {method:'POST', body:JSON.stringify({module:mod, customer_name:customer, ocr_text:raw, items, request_key:reqKey('dup_check')})});
        if(check.has_duplicates){
          renderDuplicatePanel(check, async () => { window.__YX77_DUPLICATE_CONFIRMED__ = true; await finalConfirmSubmit(); });
          return false;
        }
      }
      window.__YX77_DUPLICATE_CONFIRMED__ = false;
      if(needCustomer){ await api('/api/customers', {method:'POST', body:JSON.stringify({name:customer, preserve_existing:true})}).catch(()=>null); }
      if(mod === 'ship'){
        const preview = await api('/api/ship-preview', {method:'POST', body:JSON.stringify(payload)});
        renderShipPreview(preview, payload);
        toast('已產生出貨預覽', 'ok');
        return true;
      }
      const data = await api(endpointFor(mod), {method:'POST', body:JSON.stringify(payload)});
      resultPanel.innerHTML = `<div class="success-card"><div class="section-title">送出完成</div><div class="small-note">已建立 / 更新 ${items.length} 筆資料。</div></div>`;
      toast(mod === 'inventory' ? '庫存送出成功' : mod === 'orders' ? '訂單送出成功' : '總單送出成功', 'ok');
      try { window.refreshSource && await window.refreshSource(mod, true); } catch(_e) {}
      try { window.loadCustomerBlocks && await window.loadCustomerBlocks(true); } catch(_e) {}
      try { needCustomer && window.selectCustomerForModule && await window.selectCustomerForModule(customer); } catch(_e) {}
      return data;
    }catch(e){
      const msg = e.message || '送出失敗';
      resultPanel.innerHTML = `<div class="error-card">${esc(msg)}</div>`;
      toast(msg, 'error');
      return false;
    }finally{
      setSubmitBusy(false);
    }
  }

  async function finalSaveWarehouseCell(){
    const cell = window.state?.currentCell || {};
    const zone = clean(cell.zone || '').toUpperCase();
    const col = Number(cell.column_index || cell.column || cell.col || 0);
    const slot = Number(cell.slot_number || cell.num || 0);
    if(!zone || !col || !slot){ toast('找不到格位資料，請重新點選格子', 'error'); return false; }
    try{
      await api('/api/warehouse/cell', {method:'POST', body:JSON.stringify({ zone, column_index:col, slot_type:'direct', slot_number:slot, items:window.state.currentCellItems || [], note:$('warehouse-note')?.value || '' })});
      toast('格位已儲存', 'ok');
      try { window.closeWarehouseModal && window.closeWarehouseModal(); } catch(_e) {}
      try { window.renderWarehouse && await window.renderWarehouse(true); } catch(_e) { try { await window.renderWarehouse(); } catch(_e2) {} }
      return true;
    }catch(e){ toast(e.message || '格位更新失敗', 'error'); return false; }
  }

  function install(){
    window.confirmSubmit = finalConfirmSubmit;
    window.saveWarehouseCell = finalSaveWarehouseCell;
    try { document.documentElement.dataset.yxFix77 = VERSION; document.body && document.body.setAttribute('data-yx-fix77','1'); } catch(_e) {}
    const shipSelected = $('ship-selected-section');
    if(shipSelected){ shipSelected.classList.add('yx76-hidden-ship-selected'); shipSelected.style.display = 'none'; }
  }
  install();
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once:true});
  window.addEventListener('pageshow', install);
  setTimeout(install, 50);
})();
/* ==== FIX77 final master stabilization end ==== */

/* ==== FIX80: order-only customers, global customer autocomplete, ship borrow confirm, warehouse batch add, today clean view ==== */
(function(){
  'use strict';
  const VERSION = 'FIX80_BUSINESS_RULES';
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  const clean = v => String(v ?? '').trim();
  const api = window.yxApi || window.requestJSON || (async function(url,opt={}){
    const res = await fetch(url,{credentials:'same-origin',...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}});
    const text = await res.text(); let data={};
    try{ data=text?JSON.parse(text):{}; }catch(_e){ data={success:false,error:text||'伺服器回應格式錯誤'}; }
    if(!res.ok || data.success===false){ const e=new Error(data.error||data.message||`請求失敗：${res.status}`); e.payload=data; throw e; }
    return data;
  });
  window.yxApi = api;
  const toast = (msg, kind='ok') => { try{ (window.toast || window.showToast || window.alert)(msg, kind); }catch(_e){ console.log(msg); } };
  const modKey = () => document.querySelector('.module-screen')?.dataset.module || '';
  const normRegion = v => ['北區','中區','南區'].includes(clean(v)) ? clean(v) : '北區';
  const lineKey = v => clean(v).replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/\s+/g,'').toLowerCase();
  const sizeKey = v => lineKey(String(v||'').split('=')[0]||v);
  const reqKey = p => `${p}_${Date.now()}_${Math.random().toString(36).slice(2,9)}`;

  let customerCache = [];
  async function getCustomers(force=false){
    if(customerCache.length && !force) return customerCache;
    const d = await api('/api/customers?ts=' + Date.now(), {method:'GET'});
    customerCache = Array.isArray(d.items) ? d.items : [];
    return customerCache;
  }

  function customerMeta(c, mode){
    const rc = c.relation_counts || {};
    if(mode === 'orders') return `${Number(rc.order_qty||0)}件 / ${Number(rc.order_rows||0)}筆`;
    if(mode === 'master_order') return `${Number(rc.master_qty||0)}件 / ${Number(rc.master_rows||0)}筆`;
    return `${Number(c.item_count||0)}件 / ${Number(c.row_count||0)}筆`;
  }
  function renderCustomerCards(containerMap, items, mode){
    Object.values(containerMap).forEach(el => { if(el) el.innerHTML=''; });
    (items||[]).forEach(c => {
      const region = normRegion(c.region);
      const target = containerMap[region] || containerMap['北區'];
      if(!target) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'customer-region-card yx80-customer-card';
      btn.dataset.customer = c.name || '';
      btn.dataset.region = region;
      btn.innerHTML = `<div class="customer-card-main"><div class="customer-card-name">${esc(c.name||'')}</div><div class="customer-card-meta">${esc(customerMeta(c, mode))}</div></div><div class="customer-card-arrow">→</div>`;
      btn.addEventListener('click', async () => {
        if(mode === 'customers'){
          if(typeof window.fillCustomerForm === 'function') await window.fillCustomerForm(c.name||'');
        }else{
          if(typeof window.selectCustomerForModule === 'function') await window.selectCustomerForModule(c.name||'');
          const input = $('customer-name');
          if(input){ input.value = c.name||''; input.dispatchEvent(new Event('change', {bubbles:true})); }
        }
      });
      target.appendChild(btn);
    });
    Object.values(containerMap).forEach(el => { if(el && !el.children.length) el.innerHTML='<div class="empty-state-card compact-empty">目前沒有客戶</div>'; });
  }

  async function loadCustomerBlocks80(force=false){
    const ids = ['region-north','region-center','region-south','customers-north','customers-center','customers-south'];
    if(!ids.some(id => !!$(id))) return getCustomers(force);
    try{
      const all = await getCustomers(force);
      window.__YX80_CUSTOMERS__ = all;
      const q = clean($('customer-search')?.value || '').toLowerCase();
      const page = modKey();
      const regionContainers = {'北區':$('region-north'), '中區':$('region-center'), '南區':$('region-south')};
      const customerContainers = {'北區':$('customers-north'), '中區':$('customers-center'), '南區':$('customers-south')};
      if(Object.values(regionContainers).some(Boolean)){
        let list = all.slice();
        // 訂單頁北中南只顯示「有建立訂單」的客戶，不再把只有總單的客戶混進來。
        if(page === 'orders') list = list.filter(c => Number((c.relation_counts||{}).order_rows || 0) > 0 || Number((c.relation_counts||{}).order_qty || 0) > 0);
        if(q) list = list.filter(c => String(c.name||'').toLowerCase().includes(q));
        renderCustomerCards(regionContainers, list, page || 'module');
      }
      if(Object.values(customerContainers).some(Boolean)){
        let list = all.slice();
        if(q) list = list.filter(c => String(c.name||'').toLowerCase().includes(q));
        renderCustomerCards(customerContainers, list, 'customers');
      }
      return all;
    }catch(e){ toast(e.message || '客戶區塊載入失敗','error'); return []; }
  }

  function ensureDatalist(input){
    if(!input) return null;
    let list = $('yx80-customer-datalist');
    if(!list){ list = document.createElement('datalist'); list.id='yx80-customer-datalist'; document.body.appendChild(list); }
    input.setAttribute('list', list.id);
    return list;
  }
  function installCustomerAutocomplete(input){
    if(!input || input.dataset.yx80Autocomplete === '1') return;
    input.dataset.yx80Autocomplete = '1';
    ensureDatalist(input);
    let composing = false;
    input.addEventListener('compositionstart', () => composing = true);
    input.addEventListener('compositionend', () => { composing = false; input.dispatchEvent(new Event('input', {bubbles:true})); });
    input.addEventListener('focus', async () => { try{ await getCustomers(false); updateDatalist(input); }catch(_e){} });
    input.addEventListener('input', async () => {
      if(composing) return;
      try{ await getCustomers(false); }catch(_e){ return; }
      const raw = clean(input.value);
      updateDatalist(input);
      if(!raw) return;
      const matches = customerCache.filter(c => String(c.name||'').startsWith(raw));
      if(matches.length === 1 && matches[0].name && matches[0].name !== raw){
        const full = matches[0].name;
        input.value = full;
        try{ input.setSelectionRange(raw.length, full.length); }catch(_e){}
      }
    });
    input.addEventListener('change', () => updateDatalist(input));
  }
  function updateDatalist(input){
    const list = ensureDatalist(input);
    if(!list) return;
    const raw = clean(input.value).toLowerCase();
    const matches = customerCache.filter(c => !raw || String(c.name||'').toLowerCase().startsWith(raw)).slice(0,30);
    list.innerHTML = matches.map(c => `<option value="${esc(c.name||'')}">${esc(normRegion(c.region))}</option>`).join('');
  }
  function installAllCustomerAutocomplete(){
    ['customer-name','cust-name'].forEach(id => installCustomerAutocomplete($(id)));
    document.querySelectorAll('input[placeholder*="客戶"],input[name*="customer"],input[id*="customer-name"]').forEach(installCustomerAutocomplete);
  }

  // --- 出貨借貨追蹤：點 A 客戶商品加入後，如果改成 B 客戶送出，先詢問是否向 A 借貨。 ---
  window.__YX80_SHIP_LINE_ORIGINS__ = window.__YX80_SHIP_LINE_ORIGINS__ || {};
  function textLines(){ return String($('ocr-text')?.value || '').split(/\n+/).map(clean).filter(Boolean); }
  function rememberShipAddStart(){
    if(modKey() !== 'ship') return;
    const customer = clean($('customer-name')?.value || '');
    window.__YX80_SHIP_PENDING_ADD__ = { customer, before: textLines().map(lineKey) };
    setTimeout(markNewShipLines, 450);
  }
  function markNewShipLines(){
    const p = window.__YX80_SHIP_PENDING_ADD__;
    if(!p || !p.customer) return;
    const before = new Set(p.before || []);
    textLines().forEach(line => {
      const key = lineKey(line);
      if(key && !before.has(key) && !window.__YX80_SHIP_LINE_ORIGINS__[key]) window.__YX80_SHIP_LINE_ORIGINS__[key] = p.customer;
    });
  }
  async function customerHasProductEnough(customer, product, qty){
    if(!customer) return false;
    try{
      const d = await api('/api/customer-items?name=' + encodeURIComponent(customer) + '&ts=' + Date.now(), {method:'GET'});
      const items = Array.isArray(d.items) ? d.items : [];
      const key = sizeKey(product);
      let total = 0;
      items.forEach(it => { if(sizeKey(it.product_text || '') === key) total += Number(it.qty || 0); });
      return total >= Number(qty || 0) && total > 0;
    }catch(_e){ return false; }
  }
  async function buildBorrowIssues(customer, items){
    const issues = [];
    for(const it of (items||[])){
      const origin = window.__YX80_SHIP_LINE_ORIGINS__[lineKey(it.product_text)] || window.__YX80_SHIP_LINE_ORIGINS__[sizeKey(it.product_text)] || '';
      if(!origin || origin === customer) continue;
      const hasEnough = await customerHasProductEnough(customer, it.product_text, it.qty);
      if(!hasEnough) issues.push({ item:it, origin });
    }
    return issues;
  }
  function showBorrowConfirm(issues, customer){
    return new Promise(resolve => {
      let panel = $('yx80-borrow-confirm-panel');
      if(!panel){ panel = document.createElement('div'); panel.id='yx80-borrow-confirm-panel'; panel.className='modal'; document.body.appendChild(panel); }
      const rows = issues.map(x => `<div class="deduct-card"><strong>該客戶「${esc(customer)}」沒有這筆商品</strong><div class="small-note">是否向 ${esc(x.origin)} 借：${esc(x.item.product_text||'')}｜${Number(x.item.qty||0)} 件</div></div>`).join('');
      panel.innerHTML = `<div class="modal-card glass yx80-borrow-card"><div class="modal-head"><div class="section-title">確認借貨出貨</div><button type="button" class="icon-btn" id="yx80-borrow-close">✕</button></div>${rows}<div class="btn-row"><button type="button" class="ghost-btn" id="yx80-borrow-cancel">取消</button><button type="button" class="primary-btn" id="yx80-borrow-ok">確認借貨</button></div></div>`;
      panel.classList.remove('hidden');
      const done = v => { panel.classList.add('hidden'); resolve(v); };
      $('yx80-borrow-close').onclick = () => done(false);
      $('yx80-borrow-cancel').onclick = () => done(false);
      $('yx80-borrow-ok').onclick = () => done(true);
    });
  }
  function decorateBorrowItems(items, issues){
    const map = new Map(issues.map(x => [sizeKey(x.item.product_text), x.origin]));
    return (items||[]).map(it => {
      const origin = map.get(sizeKey(it.product_text));
      return origin ? {...it, borrow_from_customer_name: origin, source_customer_name: origin, borrow_confirmed: true} : it;
    });
  }
  function renderShipBorrowPreview(preview, payload){
    const section = $('ship-preview-section'); if(section) section.style.display='';
    const panel = $('ship-preview-panel') || $('module-result'); if(!panel) return;
    panel.classList.remove('hidden'); panel.style.display='';
    const rows = (preview.items||[]).map(it => {
      const borrow = it.is_borrowed ? `<span class="ship-mini-chip">向 ${esc(it.source_customer_name||it.borrow_from_customer_name||'')} 借貨</span>` : '';
      const locs = (it.locations||[]).map(loc => `<span class="ship-location-chip">${esc(loc.zone||'')}-${esc(loc.column_index||'')}-${String(loc.visual_slot||loc.slot_number||'').padStart(2,'0')}｜可出 ${Number(loc.ship_qty||loc.qty||0)}</span>`).join('') || '<span class="small-note">倉庫圖尚未找到位置</span>';
      return `<div class="ship-breakdown-item"><div><strong>${esc(it.product_text||'')}</strong>｜本次 ${Number(it.qty||0)} 件 ${borrow}</div><div class="ship-breakdown-list"><span class="ship-mini-chip">總單 ${Number(it.master_available||0)}</span><span class="ship-mini-chip">訂單 ${Number(it.order_available||0)}</span><span class="ship-mini-chip">庫存 ${Number(it.inventory_available||0)}</span></div><div class="small-note">${esc(it.recommendation||'')}</div><div class="ship-breakdown-list">${locs}</div></div>`;
    }).join('');
    panel.innerHTML = `<div class="success-card"><div class="section-title">出貨預覽</div><div class="small-note">${esc(preview.message||'請確認借貨來源與扣除內容。')}</div></div>${rows}<div class="btn-row"><button type="button" class="ghost-btn" id="yx80-ship-cancel">取消</button><button type="button" class="primary-btn" id="yx80-ship-confirm">確認扣除</button></div>`;
    $('yx80-ship-cancel').onclick = () => panel.classList.add('hidden');
    $('yx80-ship-confirm').onclick = async function(){
      const btn=this; if(btn.dataset.busy==='1') return; btn.dataset.busy='1'; btn.disabled=true; btn.textContent='扣除中…';
      try{
        const result = await api('/api/ship', {method:'POST', body:JSON.stringify({...payload, allow_inventory_fallback:true, preview_confirmed:true, request_key:reqKey('ship_borrow_confirm')})});
        const done = (result.breakdown||[]).map(row => `<div class="deduct-card"><strong>${esc(row.product_text||'')}</strong>｜出貨 ${Number(row.qty||0)} 件${row.is_borrowed?`｜向 ${esc(row.source_customer_name||'')} 借貨`:''}<div class="small-note">扣總單 ${Number(row.master_deduct||0)}｜扣訂單 ${Number(row.order_deduct||0)}｜扣庫存 ${Number(row.inventory_deduct||0)}｜${esc(row.note||'')}</div></div>`).join('');
        panel.innerHTML = `<div class="success-card"><div class="section-title">出貨完成</div><div class="small-note">已完成扣除。</div></div>${done}`;
        toast('出貨完成','ok');
        try{ await (window.loadCustomerBlocks && window.loadCustomerBlocks(true)); }catch(_e){}
      }catch(e){ toast(e.message||'出貨失敗','error'); btn.dataset.busy='0'; btn.disabled=false; btn.textContent='確認扣除'; }
    };
    try{ panel.scrollIntoView({behavior:'smooth', block:'start'}); }catch(_e){}
  }

  const previousConfirm = window.confirmSubmit;
  async function confirmSubmit80(){
    if(modKey() !== 'ship') return previousConfirm ? previousConfirm.apply(this, arguments) : false;
    const customer = clean($('customer-name')?.value || '');
    const raw = $('ocr-text')?.value || '';
    const items = (typeof window.yx77CollectSubmitItems === 'function') ? window.yx77CollectSubmitItems() : [];
    if(!customer || !items.length) return previousConfirm ? previousConfirm.apply(this, arguments) : false;
    const issues = await buildBorrowIssues(customer, items);
    if(!issues.length) return previousConfirm ? previousConfirm.apply(this, arguments) : false;
    const ok = await showBorrowConfirm(issues, customer);
    if(!ok){ toast('已取消借貨出貨','warn'); return false; }
    const borrowItems = decorateBorrowItems(items, issues);
    const payload = {customer_name:customer, ocr_text:raw, items:borrowItems, location:clean($('location-input')?.value||''), request_key:reqKey('ship_borrow_preview')};
    const btn = $('submit-btn'); const oldText = btn?.textContent;
    if(btn){ btn.disabled=true; btn.textContent='整理借貨預覽中…'; }
    try{
      const preview = await api('/api/ship-preview', {method:'POST', body:JSON.stringify(payload)});
      renderShipBorrowPreview(preview, payload);
      toast('已產生借貨出貨預覽','ok');
      return true;
    }catch(e){ toast(e.message||'出貨預覽失敗','error'); return false; }
    finally{ if(btn){ btn.disabled=false; btn.textContent=oldText || '確認送出'; } }
  }

  // --- 倉庫格位批量加入 ---
  function availableWarehouseItems(){ return (window.state?.warehouse?.availableItems || []); }
  function itemOptionText(it){ return `${it.customer_name ? it.customer_name + '｜' : ''}${it.product_text || it.product_size || ''}｜剩餘 ${it.unplaced_qty ?? it.qty ?? 0}`; }
  function itemQty(it){ const n=Number(it?.unplaced_qty ?? it?.qty ?? it?.total_qty ?? 1); return Number.isFinite(n)&&n>0?Math.floor(n):1; }
  function ensureWarehouseBatchPanel(){
    const modal = $('warehouse-modal'); if(!modal) return null;
    let panel = $('yx80-warehouse-batch-panel');
    if(!panel){
      panel = document.createElement('div');
      panel.id = 'yx80-warehouse-batch-panel';
      panel.className = 'yx80-warehouse-batch-panel';
      const note = $('warehouse-recent-slots') || $('warehouse-note');
      (note?.parentNode || modal.querySelector('.modal-card') || modal).insertBefore(panel, note || null);
    }
    return panel;
  }
  function batchRowHTML(idx){
    const label = idx===0?'後排':idx===1?'中間':idx===2?'前排':'';
    return `<div class="yx80-batch-row" data-batch-idx="${idx}"><span class="yx80-batch-label">${label || `第${idx+1}筆`}</span><select class="text-input yx80-batch-select"></select><input class="text-input yx80-batch-qty" type="number" min="1" value="1"></div>`;
  }
  function fillBatchSelect(sel){
    if(!sel) return;
    const q = clean($('warehouse-item-search')?.value || '').toLowerCase();
    const list = availableWarehouseItems().filter(it => !q || `${it.product_text||''} ${it.customer_name||''}`.toLowerCase().includes(q));
    sel.__yx80Items = list;
    sel.innerHTML = list.length ? '<option value="">不加入</option>' + list.map((it,i)=>`<option value="${i}">${esc(itemOptionText(it))}</option>`).join('') : '<option value="">沒有可加入商品</option>';
  }
  function refreshWarehouseBatchPanel(){
    const panel = ensureWarehouseBatchPanel(); if(!panel) return;
    if(!panel.dataset.rows) panel.dataset.rows = '3';
    const rows = Math.max(3, Number(panel.dataset.rows || 3));
    panel.innerHTML = `<label class="field-label">批量加入商品</label><div class="small-note">預設三筆：第一筆顯示後排、第二筆顯示中間、第三筆顯示前排；第 4 筆後不特別顯示。</div><div id="yx80-batch-rows">${Array.from({length:rows},(_,i)=>batchRowHTML(i)).join('')}</div><div class="btn-row compact-row"><button type="button" class="ghost-btn small-btn" id="yx80-add-batch-row">增加批量</button><button type="button" class="primary-btn small-btn" id="yx80-add-batch-items">批量加入格位</button></div>`;
    panel.querySelectorAll('.yx80-batch-select').forEach(fillBatchSelect);
    panel.querySelectorAll('.yx80-batch-select').forEach(sel => sel.addEventListener('change', () => { const it=(sel.__yx80Items || availableWarehouseItems())[Number(sel.value)]; const qty=sel.closest('.yx80-batch-row')?.querySelector('.yx80-batch-qty'); if(qty&&it) qty.value=String(itemQty(it)); }));
    $('yx80-add-batch-row').onclick = () => { panel.dataset.rows = String(rows+1); refreshWarehouseBatchPanel(); };
    $('yx80-add-batch-items').onclick = addWarehouseBatchItems;
  }
  function addWarehouseBatchItems(){
    if(!window.state) return toast('倉庫狀態尚未載入','error');
    window.state.currentCellItems = Array.isArray(window.state.currentCellItems) ? window.state.currentCellItems : [];
    let count = 0;
    document.querySelectorAll('#yx80-warehouse-batch-panel .yx80-batch-row').forEach(row => {
      const idx = Number(row.dataset.batchIdx || 0);
      const sel = row.querySelector('.yx80-batch-select');
      const item = (sel?.__yx80Items || availableWarehouseItems())[Number(sel?.value)];
      if(!item) return;
      let qty = parseInt(row.querySelector('.yx80-batch-qty')?.value || String(itemQty(item)), 10);
      if(!Number.isFinite(qty)||qty<=0) qty = itemQty(item);
      qty = Math.min(qty, itemQty(item));
      const label = idx===0?'後排':idx===1?'中間':idx===2?'前排':'';
      window.state.currentCellItems.push({
        ...item,
        product_text: item.product_text || item.product_size || '',
        product_code: item.product_code || '',
        material: item.material || item.product_code || '',
        qty,
        customer_name: item.customer_name || '',
        source: item.source || 'unplaced',
        placement_label: label,
        layer_label: label,
        source_summary: item.source_summary || ((item.sources||[]).map(s=>`${s.source}${s.qty}`).join('、'))
      });
      count += 1;
    });
    if(!count) return toast('請至少選擇一筆商品','warn');
    try{ window.renderWarehouseCellItems && window.renderWarehouseCellItems(); }catch(_e){}
    toast(`已批量加入 ${count} 筆，記得按「儲存格位」`,'ok');
  }
  const oldOpenWarehouseModal80 = window.openWarehouseModal;
  async function openWarehouseModal80(){
    const result = oldOpenWarehouseModal80 ? await oldOpenWarehouseModal80.apply(this, arguments) : undefined;
    setTimeout(refreshWarehouseBatchPanel, 60);
    return result;
  }
  const oldRenderCellItems80 = window.renderWarehouseCellItems;
  function renderWarehouseCellItems80(){
    if(oldRenderCellItems80) oldRenderCellItems80.apply(this, arguments);
    document.querySelectorAll('#warehouse-cell-items .chip-item').forEach(chip => {
      const idx = Number(chip.dataset.idx || -1);
      const it = (window.state?.currentCellItems || [])[idx] || {};
      const label = clean(it.placement_label || it.layer_label || it.position_label || '');
      if(label && !chip.querySelector('.yx80-placement-badge')){
        const badge = document.createElement('span');
        badge.className = 'yx80-placement-badge';
        badge.textContent = label;
        chip.insertBefore(badge, chip.firstChild);
      }
    });
  }

  // --- 今日異動清爽版 ---
  function fmt24(ts){ const s=String(ts||'').replace('T',' '); return s.length>=19?s.slice(0,19):s; }
  async function loadTodayChanges80(){
    const summaryBox=$('today-summary-cards');
    try{
      const d=await api('/api/today-changes?ts=' + Date.now(), {method:'GET'});
      const s=d.summary||{};
      if($('today-unread-badge')) $('today-unread-badge').textContent=String(s.unread_count||0);
      if(summaryBox){
        summaryBox.innerHTML=`<div class="card"><div class="title">進貨</div><div class="sub">${Number(s.inbound_count||0)}</div></div><div class="card"><div class="title">出貨</div><div class="sub">${Number(s.outbound_count||0)}</div></div><div class="card"><div class="title">新增訂單</div><div class="sub">${Number(s.new_order_count||0)}</div></div><div class="card"><div class="title">未錄入倉庫圖</div><div class="sub">${Number(s.unplaced_count||0)}件</div><div class="small-note">${Number(s.unplaced_row_count||0)}筆</div></div>`;
      }
      const readAt=d.read_at||'';
      const onlyUnread=(localStorage.getItem('yxTodayOnlyUnread')==='1');
      const makeLog = r => { const unread=!readAt || String(r.created_at||'')>readAt; if(onlyUnread && !unread) return ''; return `<div class="today-item deduct-card${unread?' yx68-unread':''}" data-log-id="${Number(r.id||0)}"><strong>${esc(r.action||'異動')}</strong><div class="small-note">${esc(fmt24(r.created_at))}｜${esc(r.username||'')}</div><button type="button" class="ghost-btn tiny-btn danger-btn" data-yx68-delete-today="${Number(r.id||0)}">刪除</button></div>`; };
      const fill=(id, rows, empty)=>{ const el=$(id); if(el) el.innerHTML=(rows||[]).map(makeLog).join('') || `<div class="empty-state-card compact-empty">${empty}</div>`; };
      fill('today-inbound-list', d.feed?.inbound, '今天沒有進貨');
      fill('today-outbound-list', d.feed?.outbound, '今天沒有出貨');
      fill('today-order-list', d.feed?.new_orders, '今天沒有新增訂單');
      const unplaced=$('today-unplaced-list');
      if(unplaced){
        const arr=Array.isArray(d.unplaced_items)?d.unplaced_items:[];
        unplaced.innerHTML=arr.length?arr.map(it=>`<div class="deduct-card"><strong>${esc(it.product_text||'')}</strong><div class="small-note">${esc(it.customer_name||'未指定客戶')}｜未錄入 ${Number(it.unplaced_qty||it.qty||0)} 件${it.source_summary?`｜來源：${esc(it.source_summary)}`:''}</div></div>`).join(''):'<div class="empty-state-card compact-empty">目前沒有未錄入倉庫圖商品</div>';
      }
      try{ await api('/api/today-changes/read',{method:'POST',body:JSON.stringify({})}); }catch(_e){}
      return d;
    }catch(e){ if(summaryBox) summaryBox.innerHTML=`<div class="error-card">${esc(e.message||'今日異動載入失敗')}</div>`; toast(e.message||'今日異動載入失敗','error'); }
  }

  function install(){
    document.documentElement.dataset.yxFix80 = VERSION;
    window.loadCustomerBlocks = loadCustomerBlocks80;
    window.renderCustomers = async () => loadCustomerBlocks80(true);
    window.confirmSubmit = confirmSubmit80;
    if(oldOpenWarehouseModal80) window.openWarehouseModal = openWarehouseModal80;
    if(oldRenderCellItems80) window.renderWarehouseCellItems = renderWarehouseCellItems80;
    window.loadTodayChanges = loadTodayChanges80;
    installAllCustomerAutocomplete();
    if(modKey()==='orders' || modKey()==='master_order' || modKey()==='ship' || modKey()==='customers') setTimeout(()=>loadCustomerBlocks80(true),80);
    if(modKey()==='warehouse') setTimeout(refreshWarehouseBatchPanel,250);
    if(false && location.pathname.includes('/today-changes')) setTimeout(()=>window.loadTodayChanges&&window.loadTodayChanges(),80);
  }
  document.addEventListener('pointerdown', e => { if(e.target?.closest?.('#ship-add-selected-item,#ship-add-all-items')) rememberShipAddStart(); }, true);
  document.addEventListener('input', e => { if(e.target?.id === 'warehouse-item-search') setTimeout(refreshWarehouseBatchPanel,50); }, true);
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once:true}); else install();
  window.addEventListener('pageshow', install);
  setTimeout(install, 300);
})();
/* ==== FIX80 end ==== */

/* ==== FIX81 unique master convergence start ==== */
(function(){
  'use strict';
  const VERSION = 'FIX81_UNIQUE_MASTER_CONVERGENCE';
  const legacy = {
    confirmSubmit: window.confirmSubmit,
    saveWarehouseCell: window.saveWarehouseCell,
    loadCustomerBlocks: window.loadCustomerBlocks,
    renderCustomers: window.renderCustomers,
    loadTodayChanges: window.loadTodayChanges,
    openWarehouseModal: window.openWarehouseModal,
    renderWarehouseCellItems: window.renderWarehouseCellItems
  };
  const $ = id => document.getElementById(id);
  const clean = v => String(v ?? '').trim();
  const esc = v => String(v ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const toast = (msg, kind='ok') => { try{ (window.toast || window.showToast || function(m){ console.log(m); })(msg, kind); }catch(_e){ try{ console.log(msg); }catch(_e2){} } };
  const api = window.yxApi || window.requestJSON || (async function(url,opt={}){
    const res = await fetch(url,{credentials:'same-origin',...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}});
    const text = await res.text(); let data = {};
    try{ data = text ? JSON.parse(text) : {}; }catch(_e){ data = {success:false,error:text || '伺服器回應格式錯誤'}; }
    if(!res.ok || data.success === false){ const err = new Error(data.error || data.message || `請求失敗：${res.status}`); err.payload = data; throw err; }
    return data;
  });
  window.yxApi = api;
  function modKey(){ return document.querySelector('.module-screen')?.dataset.module || (typeof window.currentModule === 'function' ? window.currentModule() : ''); }
  function endpointFor(mod){ return mod === 'orders' ? '/api/orders' : mod === 'master_order' ? '/api/master_orders' : mod === 'ship' ? '/api/ship' : '/api/inventory'; }
  function reqKey(prefix){ return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,10)}`; }
  function ensurePanel(id='module-result'){
    let panel = $(id);
    if(!panel){ panel = document.createElement('div'); panel.id = id; panel.className = 'result-card'; (document.querySelector('.module-screen') || document.body).appendChild(panel); }
    panel.classList.remove('hidden'); panel.style.display = '';
    return panel;
  }
  function normX(v){ return clean(v).replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/[＋，,；;]/g,'+').replace(/件|片/g,'').replace(/\s+/g,''); }
  function qtyFromProduct(text){
    const raw = normX(text); const right = raw.includes('=') ? raw.split('=').slice(1).join('=') : raw;
    if(!right) return 1;
    const canonical = '504x5+588+587+502+420+382+378+280+254+237+174';
    if(right.toLowerCase() === canonical) return 10;
    const parts = right.split('+').map(clean).filter(Boolean);
    const xParts = parts.filter(p => /x\d+$/i.test(p));
    const bare = parts.filter(p => !/x\d+$/i.test(p) && /\d/.test(p));
    if(parts.length >= 10 && xParts.length === 1 && parts[0] === xParts[0] && bare.length >= 8) return bare.length;
    let total = 0;
    parts.forEach(p => { const m=p.match(/x\s*(\d+)$/i); if(m) total += Number(m[1]) || 0; else if(/\d/.test(p)) total += 1; });
    return total || 1;
  }
  function parseManualItems(raw){
    let lastDims = ['', '', '']; const out=[];
    String(raw||'').replace(/\r/g,'\n').split(/\n+/).forEach(line => {
      let v = normX(line); if(!v) return;
      if(!v.includes('=') && v.split('x').length >= 3) v += '=1';
      if(!v.includes('=')) return;
      let [left, right] = v.split('=');
      let parts = left.split('x').filter(x => x !== '');
      if(parts.length >= 3) parts = parts.slice(0,3).map((x,i) => /^[_-]+$/.test(x) ? (lastDims[i] || '') : x);
      else if(parts.length === 2 && lastDims[2]) parts = [parts[0], /^[_-]+$/.test(parts[1]) ? lastDims[1] : parts[1], lastDims[2]];
      else if(parts.length === 1 && lastDims[1] && lastDims[2]) parts = [parts[0], lastDims[1], lastDims[2]];
      if(parts.length < 3 || parts.some(x => !x)) return;
      lastDims = parts.slice(0,3);
      const product_text = `${lastDims.join('x')}=${right || '1'}`;
      out.push({product_text, product_code:'', material:'', qty:qtyFromProduct(product_text)});
    });
    return mergeItems(out);
  }
  function mergeItems(items){
    const map = new Map();
    (items||[]).forEach(it => {
      const key = `${clean(it.product_text||'')}__${clean(it.material||it.product_code||'')}`;
      if(!key.trim()) return;
      const prev = map.get(key);
      if(prev) prev.qty = Number(prev.qty||0) + Number(it.qty||1);
      else map.set(key, {...it, qty:Number(it.qty||1)||1});
    });
    return Array.from(map.values());
  }
  function collectSubmitItems(){
    let items = [];
    try{ if(typeof window.yx77CollectSubmitItems === 'function') items = window.yx77CollectSubmitItems() || []; }catch(_e){ items = []; }
    if(!items.length) items = parseManualItems($('ocr-text')?.value || '');
    if($('ocr-text') && items.length) $('ocr-text').value = items.map(it => it.product_text).join('\n');
    return mergeItems(items);
  }
  function setBusy(on, text){ const btn=$('submit-btn'); if(!btn) return; btn.disabled=!!on; btn.dataset.yx81Busy=on?'1':'0'; btn.textContent=on?(text||'送出中…'):'確認送出'; }
  function renderDuplicatePanel(data, continueFn){
    const panel = ensurePanel('duplicate-action-panel');
    const rows = (data.duplicates||[]).map(d => {
      const oldRows=(d.existing_rows||[]).map(r=>`<li>${esc(r.product_text||'')}｜材質：${esc(r.material||'未填')}｜現有 ${Number(r.qty||0)} 件${r.customer_name?`｜${esc(r.customer_name)}`:''}</li>`).join('') || '<li>本次輸入內重複</li>';
      const newRows=(d.new_items||[]).map(r=>`<li>${esc(r.product_text||'')}｜新增 ${Number(r.qty||0)} 件</li>`).join('') || '<li>本次新增資料</li>';
      return `<div class="yx76-dup-item"><strong>${esc(d.size||'')}</strong>｜材質：${esc(d.material||'未填')}<div class="small-note">目前 ${Number(d.existing_qty||0)} 件，本次 ${Number(d.new_qty||0)} 件</div><div class="yx76-dup-columns"><div><b>舊資料</b><ul>${oldRows}</ul></div><div><b>本次新增</b><ul>${newRows}</ul></div></div></div>`;
    }).join('');
    panel.innerHTML = `<div class="section-title">發現相同尺寸 + 材質，是否合併？</div><div class="small-note">以下列出準備合併的資料，確認後才會送出。</div>${rows}<div class="btn-row"><button type="button" class="primary-btn" id="yx81-confirm-merge">確認合併送出</button><button type="button" class="ghost-btn" id="yx81-cancel-merge">取消</button></div>`;
    $('yx81-cancel-merge').onclick = () => { panel.classList.add('hidden'); toast('已取消送出','warn'); };
    $('yx81-confirm-merge').onclick = async () => { panel.classList.add('hidden'); await continueFn(); };
    try{ panel.scrollIntoView({behavior:'smooth',block:'center'}); }catch(_e){}
  }
  function dimFactor(v, idx){ const n=Number(String(v||'').replace(/[^0-9.]/g,'')||0); if(!n) return 0; if(idx===0) return n>210?n/1000:n/100; if(idx===1) return n/10; return n>=100?n/100:n/10; }
  function supportSum(text){ const right=normX(String(text||'').split('=').slice(1).join('=')); let total=0; right.split('+').filter(Boolean).forEach(seg=>{ const m=seg.match(/^(\d+(?:\.\d+)?)x(\d+)$/i); if(m) total += Number(m[1])*Number(m[2]); else if(/^\d+(?:\.\d+)?$/.test(seg)) total += Number(seg); }); return total; }
  function volumeFor(text){ const left=normX(String(text||'').split('=')[0]||'').split('x'); if(left.length<3) return 0; return supportSum(text)*dimFactor(left[0],0)*dimFactor(left[1],1)*dimFactor(left[2],2); }
  function lineKey(text){ return normX(text).toLowerCase(); }
  function sizeKey(text){ return normX(String(text||'').split('=')[0]||text).toLowerCase(); }
  async function customerHasProductEnough(customer, product, qty){
    try{ const d=await api('/api/customer-items?name='+encodeURIComponent(customer)+'&ts='+Date.now(),{method:'GET'}); let total=0; (d.items||[]).forEach(it=>{ if(sizeKey(it.product_text||'')===sizeKey(product)) total += Number(it.qty||0); }); return total >= Number(qty||0) && total > 0; }
    catch(_e){ return false; }
  }
  async function buildBorrowIssues(customer, items){
    const origins = window.__YX80_SHIP_LINE_ORIGINS__ || {}; const out=[];
    for(const it of (items||[])){
      const origin = origins[lineKey(it.product_text)] || origins[sizeKey(it.product_text)] || it.source_customer_name || it.borrow_from_customer_name || '';
      if(!origin || origin === customer) continue;
      if(!(await customerHasProductEnough(customer, it.product_text, it.qty))) out.push({origin, item:it});
    }
    return out;
  }
  function showBorrowConfirm(issues, customer){
    return new Promise(resolve => {
      let panel=$('yx81-borrow-confirm-panel'); if(!panel){ panel=document.createElement('div'); panel.id='yx81-borrow-confirm-panel'; panel.className='modal'; document.body.appendChild(panel); }
      const rows=issues.map(x=>`<div class="deduct-card"><strong>該客戶「${esc(customer)}」沒有這筆商品</strong><div class="small-note">是否向 ${esc(x.origin)} 借 ${esc(x.item.product_text||'')}＝${Number(x.item.qty||0)} 件</div></div>`).join('');
      panel.innerHTML=`<div class="modal-card glass yx80-borrow-card"><div class="modal-head"><div class="section-title">確認借貨出貨</div><button type="button" class="icon-btn" id="yx81-borrow-close">✕</button></div>${rows}<div class="btn-row"><button type="button" class="ghost-btn" id="yx81-borrow-cancel">取消</button><button type="button" class="primary-btn" id="yx81-borrow-ok">確認借貨</button></div></div>`;
      panel.classList.remove('hidden'); const done=v=>{panel.classList.add('hidden'); resolve(v);};
      $('yx81-borrow-close').onclick=()=>done(false); $('yx81-borrow-cancel').onclick=()=>done(false); $('yx81-borrow-ok').onclick=()=>done(true);
    });
  }
  function decorateBorrow(items, issues){ const m=new Map(issues.map(x=>[sizeKey(x.item.product_text),x.origin])); return (items||[]).map(it=>m.has(sizeKey(it.product_text))?{...it, source_customer_name:m.get(sizeKey(it.product_text)), borrow_from_customer_name:m.get(sizeKey(it.product_text)), borrow_confirmed:true}:it); }
  function renderShipPreview(preview, payload){
    const panel = ensurePanel('ship-preview-panel'); const items=preview.items||[]; const totalVol=items.reduce((s,it)=>s+volumeFor(it.product_text||''),0);
    const rows = items.map(it=>{ const borrow = it.is_borrowed || it.borrow_from_customer_name || it.source_customer_name ? `<span class="ship-mini-chip">向 ${esc(it.source_customer_name||it.borrow_from_customer_name||'')} 借貨</span>`:''; const locs=(it.locations||[]).map(loc=>`<span class="ship-location-chip">${esc(loc.zone||'')}-${esc(loc.column_index||'')}-${String(loc.visual_slot||loc.slot_number||'').padStart(2,'0')}｜可出 ${Number(loc.ship_qty||loc.qty||0)}</span>`).join('') || '<span class="small-note">倉庫圖尚未找到位置</span>'; const reasons=(it.shortage_reasons||[]).length?`<div class="error-card compact-danger">${esc((it.shortage_reasons||[]).join('、'))}</div>`:''; return `<div class="ship-breakdown-item"><div><strong>${esc(it.product_text||'')}</strong>｜本次 ${Number(it.qty||0)} 件 ${borrow}</div><div class="ship-breakdown-list"><span class="ship-mini-chip">總單 ${Number(it.master_available||0)}</span><span class="ship-mini-chip">訂單 ${Number(it.order_available||0)}</span><span class="ship-mini-chip">庫存 ${Number(it.inventory_available||0)}</span></div>${reasons}<div class="small-note">${esc(it.recommendation||'')}</div><div class="ship-breakdown-list">${locs}</div></div>`; }).join('');
    panel.innerHTML = `<div class="success-card"><div class="section-title">出貨預覽</div><div class="small-note">${esc(preview.message||'請確認扣除來源與倉庫位置。')}</div></div><div class="ship-preview-summary"><div class="ship-summary-chip">材積<span class="small-note">${totalVol.toFixed(3)}</span></div></div>${rows || '<div class="empty-state-card compact-empty">沒有預覽資料</div>'}<div class="glass panel" style="margin-top:12px;"><label class="field-label">重量</label><input id="yx81-ship-weight" class="text-input" type="number" step="0.01" placeholder="輸入重量，自動計算 材積 × 重量"><div class="small-note" id="yx81-ship-weight-result">材積 ${totalVol.toFixed(3)}</div></div><div class="btn-row"><button type="button" class="ghost-btn" id="yx81-cancel-ship">取消</button><button type="button" class="primary-btn" id="yx81-confirm-ship">確認扣除</button></div>`;
    $('yx81-ship-weight')?.addEventListener('input',()=>{ const w=Number($('yx81-ship-weight')?.value||0); const out=$('yx81-ship-weight-result'); if(out) out.textContent=w?`材積 ${totalVol.toFixed(3)} × 重量 ${w} = ${(totalVol*w).toFixed(3)}`:`材積 ${totalVol.toFixed(3)}`; });
    $('yx81-cancel-ship').onclick=()=>panel.classList.add('hidden');
    $('yx81-confirm-ship').onclick=async function(){ const btn=this; if(btn.dataset.busy==='1') return; btn.dataset.busy='1'; btn.disabled=true; btn.textContent='扣除中…'; try{ const result=await api('/api/ship',{method:'POST',body:JSON.stringify({...payload,allow_inventory_fallback:true,preview_confirmed:true,request_key:reqKey('ship_confirm')})}); const done=(result.breakdown||[]).map(row=>`<div class="deduct-card"><strong>${esc(row.product_text||'')}</strong>｜本次出貨 ${Number(row.qty||0)} 件${row.is_borrowed?`｜向 ${esc(row.source_customer_name||'')} 借貨`:''}<div class="small-note">扣總單 ${Number(row.master_deduct||0)}｜扣訂單 ${Number(row.order_deduct||0)}｜扣庫存 ${Number(row.inventory_deduct||0)}</div></div>`).join(''); panel.innerHTML=`<div class="success-card"><div class="section-title">出貨完成</div><div class="small-note">已完成扣除。</div></div>${done}`; toast('出貨完成','ok'); try{ await window.YX_MASTER.loadCustomerBlocks(true); }catch(_e){} }catch(e){ toast(e.message||'出貨失敗','error'); btn.dataset.busy='0'; btn.disabled=false; btn.textContent='確認扣除'; } };
    try{ panel.scrollIntoView({behavior:'smooth',block:'start'}); }catch(_e){}
  }
  async function confirmSubmit(){
    if($('submit-btn')?.dataset.yx81Busy === '1') return false;
    const mod=modKey() || 'inventory'; const customer=clean($('customer-name')?.value||''); const raw=$('ocr-text')?.value||''; let items=collectSubmitItems(); const needCustomer=['orders','master_order','ship'].includes(mod); const panel=ensurePanel('module-result');
    if(!items.length){ panel.innerHTML='<div class="error-card">沒有可送出的商品資料，請確認格式。</div>'; toast('沒有可送出的商品資料','warn'); return false; }
    if(needCustomer && !customer){ panel.innerHTML='<div class="error-card">請先輸入客戶名稱。</div>'; toast('請先輸入客戶名稱','warn'); return false; }
    const submitNow = async (finalItems) => {
      const payload={customer_name:customer, ocr_text:raw, items:finalItems, location:clean($('location-input')?.value||''), duplicate_mode:'merge', request_key:reqKey(mod)};
      if(needCustomer) await api('/api/customers',{method:'POST',body:JSON.stringify({name:customer,preserve_existing:true})}).catch(()=>null);
      if(mod==='ship'){ const preview=await api('/api/ship-preview',{method:'POST',body:JSON.stringify(payload)}); renderShipPreview(preview,payload); toast('已產生出貨預覽','ok'); return true; }
      const data=await api(endpointFor(mod),{method:'POST',body:JSON.stringify(payload)}); panel.innerHTML=`<div class="success-card"><div class="section-title">送出完成</div><div class="small-note">已建立 / 更新 ${finalItems.length} 筆資料。</div></div>`; toast(mod==='inventory'?'庫存送出成功':mod==='orders'?'訂單送出成功':'總單送出成功','ok'); try{ window.refreshSource && await window.refreshSource(mod,true); }catch(_e){} try{ await window.YX_MASTER.loadCustomerBlocks(true); }catch(_e){} return data;
    };
    setBusy(true, mod==='ship'?'整理預覽中…':'送出中…');
    try{
      if(['inventory','orders','master_order'].includes(mod) && !window.__YX81_DUPLICATE_CONFIRMED__){
        const check=await api('/api/duplicate-check',{method:'POST',body:JSON.stringify({module:mod,customer_name:customer,ocr_text:raw,items,request_key:reqKey('dup_check')})});
        if(check.has_duplicates){ renderDuplicatePanel(check,async()=>{ window.__YX81_DUPLICATE_CONFIRMED__=true; await confirmSubmit(); }); return false; }
      }
      window.__YX81_DUPLICATE_CONFIRMED__=false;
      if(mod==='ship'){
        const issues=await buildBorrowIssues(customer,items);
        if(issues.length){ const ok=await showBorrowConfirm(issues,customer); if(!ok){ toast('已取消借貨出貨','warn'); return false; } items=decorateBorrow(items,issues); }
      }
      return await submitNow(items);
    }catch(e){ const msg=e.message||'送出失敗'; panel.innerHTML=`<div class="error-card">${esc(msg)}</div>`; toast(msg,'error'); return false; }
    finally{ setBusy(false); }
  }
  async function saveWarehouseCell(){
    const cell=window.state?.currentCell||{}; const zone=clean(cell.zone||'').toUpperCase(); const col=Number(cell.column_index||cell.column||cell.col||0); const slot=Number(cell.slot_number||cell.num||0);
    if(!zone || !col || !slot){ toast('找不到格位資料，請重新點選格子','error'); return false; }
    try{ await api('/api/warehouse/cell',{method:'POST',body:JSON.stringify({zone,column_index:col,slot_type:'direct',slot_number:slot,items:window.state.currentCellItems||[],note:$('warehouse-note')?.value||''})}); toast('格位已儲存','ok'); try{ window.closeWarehouseModal && window.closeWarehouseModal(); }catch(_e){} try{ await (window.renderWarehouse && window.renderWarehouse(true)); }catch(_e){ try{ await window.renderWarehouse(); }catch(_e2){} } return true; }
    catch(e){ toast(e.message||'格位更新失敗','error'); return false; }
  }
  async function getCustomers(force=false){ if(!force && Array.isArray(window.__YX81_CUSTOMERS__) && window.__YX81_CUSTOMERS__.length) return window.__YX81_CUSTOMERS__; const d=await api('/api/customers?ts='+Date.now(),{method:'GET'}); window.__YX81_CUSTOMERS__=Array.isArray(d.items)?d.items:[]; window.__YX80_CUSTOMERS__=window.__YX81_CUSTOMERS__; return window.__YX81_CUSTOMERS__; }
  function normRegion(v){ const s=clean(v); return s.includes('中')?'中區':s.includes('南')?'南區':'北區'; }
  function customerMeta(c,mode){ const r=c.relation_counts||{}; if(mode==='orders') return `${Number(r.order_qty||0)}件 / ${Number(r.order_rows||0)}筆`; if(mode==='master_order') return `${Number(r.master_qty||0)}件 / ${Number(r.master_rows||0)}筆`; return `${Number(c.item_count||0)}件 / ${Number(c.row_count||0)}筆`; }
  async function loadCustomerBlocks(force=false){
    const ids=['region-north','region-center','region-south','customers-north','customers-center','customers-south']; if(!ids.some(id=>!!$(id))) return getCustomers(force);
    try{ const all=await getCustomers(force); const page=modKey(); const q=clean($('customer-search')?.value||'').toLowerCase(); const maps=[{'北區':$('region-north'),'中區':$('region-center'),'南區':$('region-south')},{'北區':$('customers-north'),'中區':$('customers-center'),'南區':$('customers-south')}];
      maps.forEach((containers,idx)=>{ if(!Object.values(containers).some(Boolean)) return; Object.values(containers).forEach(el=>{ if(el) el.innerHTML=''; }); let list=all.slice(); const mode=idx===0?(page||'module'):'customers'; if(idx===0 && page==='orders') list=list.filter(c=>Number((c.relation_counts||{}).order_rows||0)>0 || Number((c.relation_counts||{}).order_qty||0)>0); if(q) list=list.filter(c=>String(c.name||'').toLowerCase().includes(q)); list.forEach(c=>{ const target=containers[normRegion(c.region)]||containers['北區']; if(!target) return; const btn=document.createElement('button'); btn.type='button'; btn.className='customer-region-card yx81-customer-card'; btn.dataset.customerName=c.name||''; btn.innerHTML=`<div class="customer-card-main"><div class="customer-card-name">${esc(c.name||'')}</div><div class="customer-card-meta">${esc(customerMeta(c,mode))}</div></div><div class="customer-card-arrow">→</div>`; btn.onclick=async()=>{ if(mode==='customers'){ if(typeof window.fillCustomerForm==='function') await window.fillCustomerForm(c.name||''); }else{ const input=$('customer-name'); if(input){ input.value=c.name||''; input.dispatchEvent(new Event('input',{bubbles:true})); input.dispatchEvent(new Event('change',{bubbles:true})); } if(typeof window.selectCustomerForModule==='function') await window.selectCustomerForModule(c.name||''); } }; target.appendChild(btn); }); Object.values(containers).forEach(el=>{ if(el && !el.children.length) el.innerHTML='<div class="empty-state-card compact-empty">目前沒有客戶</div>'; }); }); return all; }
    catch(e){ toast(e.message||'客戶區塊載入失敗','error'); return []; }
  }
  async function renderCustomers(){ return loadCustomerBlocks(true); }
  function fmt24(ts){ const s=String(ts||'').replace('T',' '); return s.length>=19?s.slice(0,19):s; }
  async function loadTodayChanges(){
    const summaryBox=$('today-summary-cards');
    try{ const d=await api('/api/today-changes?ts='+Date.now(),{method:'GET'}); const s=d.summary||{}; if($('today-unread-badge')) $('today-unread-badge').textContent=String(s.unread_count||0); if(summaryBox) summaryBox.innerHTML=`<div class="card"><div class="title">進貨</div><div class="sub">${Number(s.inbound_count||0)}</div></div><div class="card"><div class="title">出貨</div><div class="sub">${Number(s.outbound_count||0)}</div></div><div class="card"><div class="title">新增訂單</div><div class="sub">${Number(s.new_order_count||0)}</div></div><div class="card"><div class="title">未錄入倉庫圖</div><div class="sub">${Number(s.unplaced_count||0)}件</div><div class="small-note">${Number(s.unplaced_row_count||0)}筆</div></div>`; const makeLog=r=>`<div class="today-item deduct-card" data-log-id="${Number(r.id||0)}"><strong>${esc(r.action||'異動')}</strong><div class="small-note">${esc(fmt24(r.created_at))}｜${esc(r.username||'')}</div><button type="button" class="ghost-btn tiny-btn danger-btn" data-yx68-delete-today="${Number(r.id||0)}">刪除</button></div>`; const fill=(id,rows,empty)=>{ const el=$(id); if(el) el.innerHTML=(rows||[]).map(makeLog).join('') || `<div class="empty-state-card compact-empty">${empty}</div>`; }; fill('today-inbound-list',d.feed?.inbound,'今天沒有進貨'); fill('today-outbound-list',d.feed?.outbound,'今天沒有出貨'); fill('today-order-list',d.feed?.new_orders,'今天沒有新增訂單'); const unplaced=$('today-unplaced-list'); if(unplaced){ const arr=Array.isArray(d.unplaced_items)?d.unplaced_items:[]; unplaced.innerHTML=arr.length?arr.map(it=>`<div class="deduct-card"><strong>${esc(it.product_text||'')}</strong><div class="small-note">${esc(it.customer_name||'未指定客戶')}｜未錄入 ${Number(it.unplaced_qty||it.qty||0)} 件${it.source_summary?`｜來源：${esc(it.source_summary)}`:''}</div></div>`).join(''):'<div class="empty-state-card compact-empty">目前沒有未錄入倉庫圖商品</div>'; } try{ await api('/api/today-changes/read',{method:'POST',body:JSON.stringify({})}); }catch(_e){} return d; }
    catch(e){ if(summaryBox) summaryBox.innerHTML=`<div class="error-card">${esc(e.message||'今日異動載入失敗')}</div>`; toast(e.message||'今日異動載入失敗','error'); }
  }
  function availableWarehouseItems(){ return window.state?.warehouse?.availableItems || []; }
  function itemOptionText(it){ return `${it.customer_name?it.customer_name+'｜':''}${it.product_text||it.product_size||''}｜剩餘 ${it.unplaced_qty ?? it.qty ?? 0}`; }
  function itemQty(it){ const n=Number(it?.unplaced_qty ?? it?.qty ?? it?.total_qty ?? 1); return Number.isFinite(n)&&n>0?Math.floor(n):1; }
  function ensureWarehouseBatchPanel(){ const modal=$('warehouse-modal'); if(!modal) return null; let panel=$('yx81-warehouse-batch-panel') || $('yx80-warehouse-batch-panel'); if(!panel){ panel=document.createElement('div'); panel.id='yx81-warehouse-batch-panel'; panel.className='yx80-warehouse-batch-panel'; const note=$('warehouse-recent-slots')||$('warehouse-note'); (note?.parentNode||modal.querySelector('.modal-card')||modal).insertBefore(panel,note||null); } return panel; }
  function refreshWarehouseBatchPanel(){ const panel=ensureWarehouseBatchPanel(); if(!panel) return; if(!panel.dataset.rows) panel.dataset.rows='3'; const rows=Math.max(3,Number(panel.dataset.rows||3)); const opts=availableWarehouseItems(); const rowHtml=i=>{ const label=i===0?'後排':i===1?'中間':i===2?'前排':`第${i+1}筆`; return `<div class="yx80-batch-row" data-batch-idx="${i}"><span class="yx80-batch-label">${label}</span><select class="text-input yx81-batch-select"><option value="">不加入</option>${opts.map((it,idx)=>`<option value="${idx}">${esc(itemOptionText(it))}</option>`).join('')}</select><input class="text-input yx81-batch-qty" type="number" min="1" value="1"></div>`; }; panel.innerHTML=`<label class="field-label">批量加入商品</label><div class="small-note">預設三筆：第一筆後排、第二筆中間、第三筆前排；第 4 筆後不特別顯示。</div><div>${Array.from({length:rows},(_,i)=>rowHtml(i)).join('')}</div><div class="btn-row compact-row"><button type="button" class="ghost-btn small-btn" id="yx81-add-batch-row">增加批量</button><button type="button" class="primary-btn small-btn" id="yx81-add-batch-items">批量加入格位</button></div>`; $('yx81-add-batch-row').onclick=()=>{ panel.dataset.rows=String(rows+1); refreshWarehouseBatchPanel(); }; $('yx81-add-batch-items').onclick=()=>{ window.state.currentCellItems=Array.isArray(window.state.currentCellItems)?window.state.currentCellItems:[]; let count=0; panel.querySelectorAll('.yx80-batch-row').forEach(row=>{ const i=Number(row.dataset.batchIdx||0); const item=opts[Number(row.querySelector('.yx81-batch-select')?.value)]; if(!item) return; let qty=parseInt(row.querySelector('.yx81-batch-qty')?.value||String(itemQty(item)),10); if(!Number.isFinite(qty)||qty<=0) qty=itemQty(item); qty=Math.min(qty,itemQty(item)); const label=i===0?'後排':i===1?'中間':i===2?'前排':''; window.state.currentCellItems.push({...item, product_text:item.product_text||item.product_size||'', qty, placement_label:label, layer_label:label}); count++; }); if(!count) return toast('請至少選擇一筆商品','warn'); try{ window.renderWarehouseCellItems && window.renderWarehouseCellItems(); }catch(_e){} toast(`已批量加入 ${count} 筆，記得按「儲存格位」`,'ok'); }; }
  async function openWarehouseModal(){ const r=legacy.openWarehouseModal ? await legacy.openWarehouseModal.apply(this,arguments) : undefined; setTimeout(refreshWarehouseBatchPanel,60); return r; }
  function renderWarehouseCellItems(){ if(legacy.renderWarehouseCellItems) legacy.renderWarehouseCellItems.apply(this,arguments); document.querySelectorAll('#warehouse-cell-items .chip-item').forEach(chip=>{ const idx=Number(chip.dataset.idx||-1); const it=(window.state?.currentCellItems||[])[idx]||{}; const label=clean(it.placement_label||it.layer_label||''); if(label && !chip.querySelector('.yx80-placement-badge')){ const b=document.createElement('span'); b.className='yx80-placement-badge'; b.textContent=label; chip.insertBefore(b,chip.firstChild); } }); }
  window.YX_MASTER = Object.freeze({version:VERSION, confirmSubmit, saveWarehouseCell, loadCustomerBlocks, renderCustomers, loadTodayChanges, openWarehouseModal, renderWarehouseCellItems, refreshWarehouseBatchPanel});
  function install(){
    document.documentElement.dataset.yxFix81 = VERSION;
    window.confirmSubmit = window.YX_MASTER.confirmSubmit;
    window.saveWarehouseCell = window.YX_MASTER.saveWarehouseCell;
    window.loadCustomerBlocks = window.YX_MASTER.loadCustomerBlocks;
    window.renderCustomers = window.YX_MASTER.renderCustomers;
    window.loadTodayChanges = window.YX_MASTER.loadTodayChanges;
    if(legacy.openWarehouseModal) window.openWarehouseModal = window.YX_MASTER.openWarehouseModal;
    if(legacy.renderWarehouseCellItems) window.renderWarehouseCellItems = window.YX_MASTER.renderWarehouseCellItems;
    if(['orders','master_order','ship','customers'].includes(modKey())) setTimeout(()=>window.YX_MASTER.loadCustomerBlocks(true),80);
    if(modKey()==='warehouse') setTimeout(window.YX_MASTER.refreshWarehouseBatchPanel,200);
    if(false && location.pathname.includes('/today-changes')) setTimeout(()=>window.loadTodayChanges&&window.loadTodayChanges(),80);
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once:true}); else install();
  window.addEventListener('pageshow', install);
  setTimeout(install, 350);
})();
/* ==== FIX81 unique master convergence end ==== */



/* ==== FIX82 ship preview + source-specific deduction + warehouse batch master start ==== */
(function(){
  'use strict';
  const VERSION = 'FIX82_SHIP_WAREHOUSE_MASTER';
  const $ = id => document.getElementById(id);
  const clean = v => String(v ?? '').trim();
  const esc = v => String(v ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const toast = (msg, kind='ok') => { try{ (window.toast || window.showToast || function(m){ console.log(m); })(msg, kind); }catch(_e){ console.log(msg); } };
  const api = window.yxApi || window.requestJSON || (async function(url,opt={}){
    const res = await fetch(url,{credentials:'same-origin',...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}});
    const text = await res.text(); let data={};
    try{ data = text ? JSON.parse(text) : {}; }catch(_e){ data={success:false,error:text||'伺服器回應格式錯誤'}; }
    if(!res.ok || data.success === false){ const err=new Error(data.error||data.message||`請求失敗：${res.status}`); err.payload=data; throw err; }
    return data;
  });
  window.yxApi = api;
  const modKey = () => document.querySelector('.module-screen')?.dataset.module || (typeof window.currentModule === 'function' ? window.currentModule() : '');
  function reqKey(prefix){ return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,10)}`; }
  function normX(v){ return clean(v).replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/[＋，,；;]/g,'+').replace(/件|片/g,'').replace(/\s+/g,''); }
  function sizeKey(text){ return normX(String(text||'').split('=')[0] || text).toLowerCase(); }
  function lineKey(text){ return normX(text).toLowerCase(); }
  function sourcePref(src){
    const s=clean(src);
    if(['總單','master_order','master_orders','master'].includes(s)) return 'master_orders';
    if(['訂單','orders','order'].includes(s)) return 'orders';
    if(['庫存','inventory','stock'].includes(s)) return 'inventory';
    return '';
  }
  function sourceLabel(src){ return {master_orders:'總單', orders:'訂單', inventory:'庫存'}[sourcePref(src)||src] || clean(src) || '未指定'; }
  function qtyFromProduct(text){
    const raw=normX(text); const right=raw.includes('=')?raw.split('=').slice(1).join('='):'';
    if(!right) return 1;
    const parts=right.split('+').map(clean).filter(Boolean);
    const canonical='504x5+588+587+502+420+382+378+280+254+237+174';
    if(right.toLowerCase()===canonical) return 10;
    if(parts.length>=10 && parts.filter(p=>/x\d+$/i.test(p)).length===1) return parts.filter(p=>!(/x\d+$/i.test(p)) && /\d/.test(p)).length || 1;
    let total=0;
    parts.forEach(p=>{ const m=p.match(/x\s*(\d+)$/i); if(m) total += Number(m[1])||0; else if(/\d/.test(p)) total += 1; });
    return total || 1;
  }
  function parseShipItemsFromText(){
    const lines=String($('ocr-text')?.value||'').replace(/\r/g,'\n').split(/\n+/).map(clean).filter(Boolean);
    const meta=window.__YX82_SHIP_LINE_META__ || {};
    const out=[];
    let lastDims=['','',''];
    lines.forEach(line=>{
      let raw=normX(line);
      if(!raw) return;
      if(!raw.includes('=') && raw.split('x').length>=3) raw += '=1';
      if(!raw.includes('=')) return;
      let [left,right] = raw.split('=');
      let dims=left.split('x').filter(x=>x!=='');
      if(dims.length>=3) dims=dims.slice(0,3).map((x,i)=>/^[_-]+$/.test(x)?lastDims[i]:x);
      else if(dims.length===2 && lastDims[2]) dims=[dims[0], /^[_-]+$/.test(dims[1])?lastDims[1]:dims[1], lastDims[2]];
      else if(dims.length===1 && lastDims[1] && lastDims[2]) dims=[dims[0], lastDims[1], lastDims[2]];
      if(dims.length<3 || dims.some(x=>!x)) return;
      lastDims=dims.slice(0,3);
      const product_text=`${lastDims.join('x')}=${right||'1'}`;
      const m = meta[lineKey(product_text)] || meta[sizeKey(product_text)] || meta[lineKey(line)] || meta[sizeKey(line)] || {};
      out.push({
        product_text,
        product_code: m.material || '',
        material: m.material || '',
        qty: qtyFromProduct(product_text),
        source_preference: sourcePref(m.source_preference || m.source || ''),
        source_customer_name: m.customer || '',
        borrow_from_customer_name: m.borrow_from_customer_name || '',
      });
    });
    // 同尺寸同來源才合併，避免總單/訂單/庫存來源被混在一起
    const map=new Map();
    out.forEach(it=>{
      const key=[sizeKey(it.product_text), it.material||'', it.source_preference||'', it.source_customer_name||''].join('__');
      const prev=map.get(key);
      if(prev){ prev.qty += Number(it.qty||1); prev.product_text = prev.product_text || it.product_text; }
      else map.set(key,{...it, qty:Number(it.qty||1)||1});
    });
    return Array.from(map.values());
  }
  function textLines(){ return String($('ocr-text')?.value||'').split(/\n+/).map(clean).filter(Boolean); }
  function setTextLines(lines){ const box=$('ocr-text'); if(!box) return; box.value=(lines||[]).filter(Boolean).join('\n'); box.dispatchEvent(new Event('input',{bubbles:true})); }
  function markLineMeta(line,item,customer){
    if(!line || !item) return;
    window.__YX82_SHIP_LINE_META__ = window.__YX82_SHIP_LINE_META__ || {};
    const pref=sourcePref(item.source_preference || item.source || '');
    const meta={
      source: item.source || sourceLabel(pref),
      source_preference: pref,
      customer: customer || clean($('customer-name')?.value||''),
      material: item.material || item.product_code || '',
      item_id: item.id || '',
      borrow_from_customer_name: ''
    };
    window.__YX82_SHIP_LINE_META__[lineKey(line)] = meta;
    window.__YX82_SHIP_LINE_META__[sizeKey(line)] = meta;
    // 舊版借貨追蹤也同步，避免舊流程漏掉
    window.__YX80_SHIP_LINE_ORIGINS__ = window.__YX80_SHIP_LINE_ORIGINS__ || {};
    if(meta.customer){
      window.__YX80_SHIP_LINE_ORIGINS__[lineKey(line)] = meta.customer;
      window.__YX80_SHIP_LINE_ORIGINS__[sizeKey(line)] = meta.customer;
    }
  }
  function appendShipItemLines(items, customer){
    const box=$('ocr-text'); if(!box) return 0;
    const current=textLines(); const seen=new Set(current.map(lineKey)); const add=[];
    (items||[]).forEach(it=>{
      const line=clean(it.product_text||'');
      if(!line) return;
      const key=lineKey(line);
      if(seen.has(key)) return;
      seen.add(key); add.push(line); markLineMeta(line,it,customer);
    });
    if(add.length) setTextLines(current.concat(add));
    try{ window.renderShipSelectedItems && window.renderShipSelectedItems(); }catch(_e){}
    return add.length;
  }
  async function loadShipCustomerItems82(name){
    const sel=$('ship-customer-item-select'); if(!sel) return [];
    const customer=clean(name || $('customer-name')?.value || window.__YX_SELECTED_CUSTOMER__ || '');
    if(!customer){ sel.innerHTML='<option value="">請先選擇 / 輸入客戶名稱</option>'; window.__YX_SHIP_CUSTOMER_ITEMS__=[]; return []; }
    try{
      sel.innerHTML='<option value="">載入中…</option>';
      const d=await api(`/api/customer-items?name=${encodeURIComponent(customer)}&ts=${Date.now()}`,{method:'GET'});
      let items=Array.isArray(d.items)?d.items:[];
      const masterOrderItems=items.filter(it=>['總單','訂單','master_orders','orders','master_order'].includes(clean(it.source)));
      if(masterOrderItems.length){
        window.__YX_SHIP_CUSTOMER_ITEMS__=masterOrderItems.map(it=>({...it, source_preference:sourcePref(it.source)}));
        sel.innerHTML='<option value="">請選擇總單 / 訂單商品</option>'+window.__YX_SHIP_CUSTOMER_ITEMS__.map((it,i)=>`<option value="${i}">${esc(sourceLabel(it.source))}｜${esc(it.material||it.product_code||'未填材質')}｜${esc(it.product_text||'')}｜${Number(it.qty||qtyFromProduct(it.product_text)||0)}件</option>`).join('');
        return window.__YX_SHIP_CUSTOMER_ITEMS__;
      }
      // 該客戶沒有總單 / 訂單時，直接開庫存全部商品讓使用者選。
      const inv=await api('/api/inventory?ts='+Date.now(),{method:'GET'});
      const invItems=(Array.isArray(inv.items)?inv.items:[]).map(it=>({...it, source:'庫存', source_preference:'inventory'}));
      window.__YX_SHIP_CUSTOMER_ITEMS__=invItems;
      sel.innerHTML='<option value="">此客戶無總單/訂單，請選擇庫存商品</option>'+invItems.map((it,i)=>`<option value="${i}">庫存｜${esc(it.material||it.product_code||'未填材質')}｜${esc(it.product_text||'')}｜${Number(it.qty||qtyFromProduct(it.product_text)||0)}件</option>`).join('');
      if(!invItems.length) sel.innerHTML='<option value="">目前沒有庫存商品可選</option>';
      return invItems;
    }catch(e){
      window.__YX_SHIP_CUSTOMER_ITEMS__=[];
      sel.innerHTML=`<option value="">${esc(e.message||'商品載入失敗')}</option>`;
      return [];
    }
  }
  function selectedShipItem(){ return (window.__YX_SHIP_CUSTOMER_ITEMS__||[])[Number($('ship-customer-item-select')?.value)]; }

  async function customerHasProductEnough(customer, product, qty){
    if(!customer) return false;
    try{
      const d=await api('/api/customer-items?name='+encodeURIComponent(customer)+'&ts='+Date.now(),{method:'GET'});
      let total=0; const key=sizeKey(product);
      (d.items||[]).forEach(it=>{ if(sizeKey(it.product_text||'')===key) total += Number(it.qty||0); });
      return total >= Number(qty||0) && total>0;
    }catch(_e){ return false; }
  }
  async function buildBorrowIssues(customer, items){
    const meta=window.__YX82_SHIP_LINE_META__ || {};
    const out=[];
    for(const it of (items||[])){
      const m=meta[lineKey(it.product_text)] || meta[sizeKey(it.product_text)] || {};
      const origin=clean(m.customer || it.source_customer_name || '');
      if(!origin || origin===customer) continue;
      if(!(await customerHasProductEnough(customer,it.product_text,it.qty))) out.push({origin,item:it});
    }
    return out;
  }
  function showBorrowConfirm(issues, customer){
    return new Promise(resolve=>{
      let panel=$('yx82-borrow-confirm-panel');
      if(!panel){ panel=document.createElement('div'); panel.id='yx82-borrow-confirm-panel'; panel.className='modal'; document.body.appendChild(panel); }
      panel.innerHTML=`<div class="modal-card glass yx80-borrow-card"><div class="modal-head"><div class="section-title">確認借貨出貨</div><button type="button" class="icon-btn" id="yx82-borrow-close">✕</button></div>${issues.map(x=>`<div class="deduct-card"><strong>該客戶「${esc(customer)}」沒有這筆商品</strong><div class="small-note">是否向 ${esc(x.origin)} 借 ${esc(x.item.product_text||'')}＝${Number(x.item.qty||0)} 件</div></div>`).join('')}<div class="btn-row"><button type="button" class="ghost-btn" id="yx82-borrow-cancel">取消</button><button type="button" class="primary-btn" id="yx82-borrow-ok">確認借貨</button></div></div>`;
      panel.classList.remove('hidden');
      const done=v=>{ panel.classList.add('hidden'); resolve(v); };
      $('yx82-borrow-close').onclick=()=>done(false);
      $('yx82-borrow-cancel').onclick=()=>done(false);
      $('yx82-borrow-ok').onclick=()=>done(true);
    });
  }
  function applyBorrow(items, issues){
    const map=new Map(issues.map(x=>[sizeKey(x.item.product_text), x.origin]));
    return (items||[]).map(it=>map.has(sizeKey(it.product_text)) ? {...it, source_customer_name:map.get(sizeKey(it.product_text)), borrow_from_customer_name:map.get(sizeKey(it.product_text)), borrow_confirmed:true} : it);
  }

  function dimFactor(v, idx){
    const n=Number(String(v||'').replace(/[^0-9.]/g,'')||0);
    if(!n) return 0;
    if(idx===0) return n>210 ? n/1000 : n/100;
    if(idx===1) return n/10;
    return n>=100 ? n/100 : n/10;
  }
  function supportExprParts(text){
    const right=normX(String(text||'').split('=').slice(1).join('='));
    let sumExpr=[]; let numericSum=0;
    right.split('+').map(clean).filter(Boolean).forEach(seg=>{
      const m=seg.match(/^(\d+(?:\.\d+)?)x(\d+)$/i);
      if(m){ numericSum += Number(m[1])*Number(m[2]); sumExpr.push(`${m[1]}×${m[2]}`); }
      else if(/^\d+(?:\.\d+)?$/.test(seg)){ numericSum += Number(seg); sumExpr.push(seg); }
    });
    return {sumExpr:sumExpr.join('+')||'0', numericSum};
  }
  function volumeInfo(text){
    const left=normX(String(text||'').split('=')[0]||'').split('x');
    const a=dimFactor(left[0],0), b=dimFactor(left[1],1), c=dimFactor(left[2],2);
    const sp=supportExprParts(text);
    const vol=sp.numericSum*a*b*c;
    return {volume:vol, formula:`(${sp.sumExpr}) × ${Number(a.toFixed(3))} × ${Number(b.toFixed(3))} × ${Number(c.toFixed(3))} = ${Number(vol.toFixed(3))}`};
  }
  function num(v){ const n=Number(v||0); return Number.isFinite(n)?n:0; }
  function beforeAfterHTML(item){
    const b=item.deduct_before || {master:item.master_available, order:item.order_available, inventory:item.inventory_available};
    const a=item.deduct_after || {
      master: Math.max(0,num(b.master)-num(item.master_deduct||0)),
      order: Math.max(0,num(b.order)-num(item.order_deduct||0)),
      inventory: Math.max(0,num(b.inventory)-num(item.inventory_deduct||0))
    };
    return `<div class="yx82-before-after"><span>總單：${num(b.master)} → ${num(a.master)}</span><span>訂單：${num(b.order)} → ${num(a.order)}</span><span>庫存：${num(b.inventory)} → ${num(a.inventory)}</span></div>`;
  }
  function renderShipPreview82(preview, payload){
    const section=$('ship-preview-section'); if(section) section.style.display='';
    const panel=$('ship-preview-panel') || $('module-result'); if(!panel) return;
    panel.classList.remove('hidden'); panel.style.display='';
    const items=preview.items||[];
    const totalQty=items.reduce((s,it)=>s+num(it.qty),0);
    const totalVol=items.reduce((s,it)=>s+volumeInfo(it.product_text||'').volume,0);
    const rows=items.map((it,idx)=>{
      const vi=volumeInfo(it.product_text||'');
      const locs=(it.locations||[]).map(loc=>`<span class="ship-location-chip">${esc(loc.zone||'')}-${esc(loc.column_index||'')}-${String(loc.visual_slot||loc.slot_number||'').padStart(2,'0')}｜可出 ${num(loc.ship_qty||loc.qty)}</span>`).join('') || '<span class="small-note">倉庫圖尚未找到位置</span>';
      const shortage=(it.shortage_reasons||[]).length ? `<div class="error-card compact-danger">${esc((it.shortage_reasons||[]).join('、'))}</div>` : '';
      const borrow=(it.is_borrowed||it.borrow_from_customer_name) ? `<span class="ship-mini-chip">向 ${esc(it.source_customer_name||it.borrow_from_customer_name||'')} 借貨</span>` : '';
      const source=`<span class="ship-mini-chip selected-source">比對 / 扣除：${esc(it.source_label || sourceLabel(it.source_preference) || '原本流程')}</span>`;
      return `<div class="ship-breakdown-item yx82-preview-item">
        <div class="yx82-preview-title"><strong>${esc(it.product_text||'')}</strong><span>本次 ${num(it.qty)} 件</span>${borrow}${source}</div>
        <div class="yx82-formula">材積算式：${esc(vi.formula)}</div>
        <div class="small-note">扣除前 → 扣除後</div>
        ${beforeAfterHTML(it)}
        ${shortage}
        <div class="small-note">${esc(it.recommendation||'')}</div>
        <div class="ship-breakdown-list">${locs}</div>
      </div>`;
    }).join('');
    panel.innerHTML=`<div class="success-card yx82-ship-preview-head">
      <div class="section-title">出貨預覽</div>
      <div class="small-note">可看材積算式、扣除來源、倉庫位置；輸入重量後會自動計算總重。</div>
      <div class="yx82-preview-summary"><div>本次件數：<b>${totalQty}</b></div><div>材積合計：<b id="yx82-total-volume">${Number(totalVol.toFixed(3))}</b></div><label>重量<input id="yx82-weight-input" class="text-input yx82-weight-input" type="number" min="0" step="0.01" placeholder="輸入重量"></label><div>總重：<b id="yx82-total-weight">0</b></div></div>
    </div>${rows}<div class="btn-row"><button type="button" class="ghost-btn" id="yx82-ship-cancel">取消</button><button type="button" class="primary-btn" id="yx82-ship-confirm">確認扣除</button></div>`;
    const updateWeight=()=>{ const w=num($('yx82-weight-input')?.value); const out=$('yx82-total-weight'); if(out) out.textContent=Number((totalVol*w).toFixed(3)); };
    $('yx82-weight-input')?.addEventListener('input', updateWeight);
    $('yx82-ship-cancel').onclick=()=>panel.classList.add('hidden');
    $('yx82-ship-confirm').onclick=async function(){
      const btn=this; if(btn.dataset.busy==='1') return; btn.dataset.busy='1'; btn.disabled=true; btn.textContent='扣除中…';
      try{
        const result=await api('/api/ship',{method:'POST',body:JSON.stringify({...payload,allow_inventory_fallback:true,preview_confirmed:true,request_key:reqKey('ship82_confirm')})});
        const done=(result.breakdown||[]).map(row=>`<div class="deduct-card yx82-done-card"><strong>${esc(row.product_text||'')}</strong>｜本次出貨 ${num(row.qty)} 件${row.is_borrowed?`｜向 ${esc(row.source_customer_name||'')} 借貨`:''}<div class="small-note">實際扣除：總單 ${num(row.master_deduct)}｜訂單 ${num(row.order_deduct)}｜庫存 ${num(row.inventory_deduct)}｜${esc(row.note||'')}</div><div class="small-note">扣除前 → 扣除後</div>${beforeAfterHTML({deduct_before:row.deduct_before||{master:row.master_available,order:row.order_available,inventory:row.inventory_available},deduct_after:row.remaining_after})}</div>`).join('');
        panel.innerHTML=`<div class="success-card"><div class="section-title">出貨完成</div><div class="small-note">已顯示扣除前全部數量與扣除後剩餘數量。</div></div>${done || '<div class="empty-state-card compact-empty">已完成扣除。</div>'}`;
        toast('出貨完成','ok');
        try{ await (window.YX_MASTER?.loadCustomerBlocks ? window.YX_MASTER.loadCustomerBlocks(true) : window.loadCustomerBlocks?.(true)); }catch(_e){}
      }catch(e){ toast(e.message||'出貨失敗','error'); btn.dataset.busy='0'; btn.disabled=false; btn.textContent='確認扣除'; }
    };
    try{ panel.scrollIntoView({behavior:'smooth',block:'start'}); }catch(_e){}
  }

  const legacyMaster = window.YX_MASTER ? {...window.YX_MASTER} : {};
  async function confirmSubmit82(){
    if(modKey()!=='ship'){
      if(legacyMaster.confirmSubmit) return legacyMaster.confirmSubmit();
      if(window.__YX81_CONFIRM_LEGACY__) return window.__YX81_CONFIRM_LEGACY__();
      return;
    }
    const btn=$('submit-btn'); if(!btn || btn.dataset.busy==='1') return;
    const customer=clean($('customer-name')?.value||'');
    if(!customer) return toast('請先輸入客戶名稱','warn');
    let items=parseShipItemsFromText();
    if(!items.length) return toast('沒有可送出的商品資料','warn');
    const issues=await buildBorrowIssues(customer,items);
    if(issues.length){
      const ok=await showBorrowConfirm(issues,customer);
      if(!ok) return;
      items=applyBorrow(items,issues);
    }
    const payload={customer_name:customer, ocr_text:$('ocr-text')?.value||'', items};
    try{
      btn.dataset.busy='1'; btn.disabled=true; btn.textContent='整理預覽中…';
      const preview=await api('/api/ship-preview',{method:'POST',body:JSON.stringify(payload)});
      renderShipPreview82(preview,payload);
    }catch(e){
      const panel=$('ship-preview-panel')||$('module-result');
      if(panel){ panel.classList.remove('hidden'); panel.style.display=''; panel.innerHTML=`<div class="error-card">${esc(e.message||'出貨預覽失敗')}</div>`; }
      toast(e.message||'出貨預覽失敗','error');
    }finally{
      btn.dataset.busy='0'; btn.disabled=false; btn.textContent='確認送出';
    }
  }

  // --- warehouse modal: only batch flow, auto-save, preserve selected batch rows ---
  function availableWarehouseItems(){ return window.state?.warehouse?.availableItems || []; }
  function itemQty(it){ const n=Number(it?.unplaced_qty ?? it?.qty ?? it?.total_qty ?? 1); return Number.isFinite(n)&&n>0?Math.floor(n):1; }
  function itemOptionText(it){ return `${it.customer_name?it.customer_name+'｜':''}${it.product_text||it.product_size||''}｜剩餘 ${it.unplaced_qty ?? it.qty ?? 0}`; }
  function ensureWarehousePanels(){
    const modal=$('warehouse-modal'); if(!modal) return {};
    const card=modal.querySelector('.modal-card') || modal;
    let detail=$('yx82-warehouse-detail-panel');
    if(!detail){ detail=document.createElement('div'); detail.id='yx82-warehouse-detail-panel'; detail.className='yx82-warehouse-detail-panel'; const meta=$('warehouse-modal-meta'); (meta?.parentNode||card).insertBefore(detail, meta?.nextSibling||card.firstChild); }
    let panel=$('yx82-warehouse-batch-panel');
    if(!panel){ panel=document.createElement('div'); panel.id='yx82-warehouse-batch-panel'; panel.className='yx80-warehouse-batch-panel'; detail.insertAdjacentElement('afterend', panel); }
    return {detail,panel};
  }
  function hideLegacyWarehouseControls(){
    const ids=['warehouse-item-select','warehouse-add-qty','warehouse-recent-slots'];
    ids.forEach(id=>{ const el=$(id); if(el){ el.classList.add('yx82-hidden-control'); el.style.display='none'; let prev=el.previousElementSibling; if(prev && prev.classList.contains('field-label')) prev.style.display='none'; } });
    const recent=$('warehouse-recent-slots');
    const btnRow=recent?.nextElementSibling;
    if(btnRow && btnRow.classList.contains('btn-row')) btnRow.style.display='none';
  }
  function renderWarehouseDetails(){
    const {detail}=ensureWarehousePanels(); if(!detail) return;
    const items=Array.isArray(window.state?.currentCellItems)?window.state.currentCellItems:[];
    if(!items.length){ detail.innerHTML='<div class="empty-state-card compact-empty">此格目前沒有商品</div>'; return; }
    detail.innerHTML='<div class="section-title">格位詳細資料</div>'+items.map((it,idx)=>{
      const label=clean(it.placement_label||it.layer_label||(['後排','中間','前排'][idx]||'')); 
      return `<div class="deduct-card yx82-warehouse-detail-card"><strong>${esc(label || `第${idx+1}筆`)}</strong><div class="small-note">客戶：${esc(it.customer_name||'未指定客戶')}</div><div class="small-note">商品：${esc(it.product_text||'')}</div><div class="small-note">數量：${Number(it.qty||0)} 件</div></div>`;
    }).join('');
  }
  function snapshotBatch(panel){
    return Array.from(panel?.querySelectorAll?.('.yx82-batch-row') || []).map(row=>({
      value: row.querySelector('.yx82-batch-select')?.value || '',
      qty: row.querySelector('.yx82-batch-qty')?.value || '1'
    }));
  }
  function refreshWarehouseBatchPanel82(keep){
    const {panel}=ensureWarehousePanels(); if(!panel) return;
    hideLegacyWarehouseControls();
    renderWarehouseDetails();
    const prev=keep || snapshotBatch(panel);
    const rows=Math.max(3, Number(panel.dataset.rows||prev.length||3));
    const opts=availableWarehouseItems();
    const rowHtml=i=>{
      const label=i===0?'後排':i===1?'中間':i===2?'前排':`第${i+1}筆`;
      return `<div class="yx80-batch-row yx82-batch-row" data-batch-idx="${i}"><span class="yx80-batch-label">${label}</span><select class="text-input yx82-batch-select"><option value="">不加入</option>${opts.map((it,idx)=>`<option value="${idx}">${esc(itemOptionText(it))}</option>`).join('')}</select><input class="text-input yx82-batch-qty" type="number" min="1" value="1"></div>`;
    };
    panel.innerHTML=`<label class="field-label">批量加入商品</label><div class="small-note">第一筆後排、第二筆中間、第三筆前排；第 4 筆後不特別顯示。</div><div id="yx82-batch-rows">${Array.from({length:rows},(_,i)=>rowHtml(i)).join('')}</div><div class="btn-row compact-row"><button type="button" class="ghost-btn small-btn" id="yx82-add-batch-row">增加批量</button><button type="button" class="primary-btn small-btn" id="yx82-add-batch-items">批量加入格位</button></div>`;
    panel.querySelectorAll('.yx82-batch-row').forEach((row,i)=>{
      const st=prev[i]||{};
      const sel=row.querySelector('.yx82-batch-select'); const qty=row.querySelector('.yx82-batch-qty');
      if(st.value) sel.value=st.value;
      if(st.qty) qty.value=st.qty;
      sel.addEventListener('change',()=>{ const it=opts[Number(sel.value)]; if(it) qty.value=String(itemQty(it)); });
    });
    $('yx82-add-batch-row').onclick=()=>{ const snap=snapshotBatch(panel); panel.dataset.rows=String(rows+1); refreshWarehouseBatchPanel82(snap.concat([{value:'',qty:'1'}])); };
    $('yx82-add-batch-items').onclick=addBatchAndSaveWarehouse;
  }
  async function addBatchAndSaveWarehouse(){
    const panel=$('yx82-warehouse-batch-panel'); if(!panel) return;
    const opts=availableWarehouseItems();
    window.state.currentCellItems=Array.isArray(window.state?.currentCellItems)?window.state.currentCellItems:[];
    let count=0;
    panel.querySelectorAll('.yx82-batch-row').forEach(row=>{
      const i=Number(row.dataset.batchIdx||0);
      const item=opts[Number(row.querySelector('.yx82-batch-select')?.value)];
      if(!item) return;
      let qty=parseInt(row.querySelector('.yx82-batch-qty')?.value||String(itemQty(item)),10);
      if(!Number.isFinite(qty)||qty<=0) qty=itemQty(item);
      qty=Math.min(qty,itemQty(item));
      const label=i===0?'後排':i===1?'中間':i===2?'前排':'';
      window.state.currentCellItems.push({...item, product_text:item.product_text||item.product_size||'', qty, customer_name:item.customer_name||'', material:item.material||item.product_code||'', placement_label:label, layer_label:label});
      count++;
    });
    if(!count) return toast('請至少選擇一筆商品','warn');
    renderWarehouseDetails();
    try{ await saveWarehouseCell82(); toast(`已批量加入並儲存 ${count} 筆`,'ok'); }catch(e){ toast(e.message||'批量儲存失敗','error'); }
  }
  async function saveWarehouseCell82(){
    const cell=window.state?.currentCell||{};
    const zone=cell.zone; const col=Number(cell.column||cell.column_index||cell.col||0); const slot=Number(cell.slot_number||cell.num||cell.slot||0);
    if(!zone || !col || !slot) throw new Error('格位資料不完整，請重新點選格子');
    await api('/api/warehouse/cell',{method:'POST',body:JSON.stringify({zone,column_index:col,slot_type:'direct',slot_number:slot,items:window.state.currentCellItems||[],note:$('warehouse-note')?.value||''})});
    try{ window.closeWarehouseModal && window.closeWarehouseModal(); }catch(_e){}
    try{ await (window.renderWarehouse && window.renderWarehouse(true)); }catch(_e){ try{ await window.renderWarehouse(); }catch(_e2){} }
    return true;
  }
  async function openWarehouseModal82(){
    const legacyOpen = legacyMaster.openWarehouseModal || window.openWarehouseModal;
    let r;
    if(legacyOpen && !legacyOpen.__yx82){ r=await legacyOpen.apply(this,arguments); }
    setTimeout(()=>{ hideLegacyWarehouseControls(); refreshWarehouseBatchPanel82(); },60);
    return r;
  }
  function renderWarehouseCellItems82(){
    renderWarehouseDetails();
    const list=$('warehouse-cell-items');
    if(!list) return;
    const items=Array.isArray(window.state?.currentCellItems)?window.state.currentCellItems:[];
    // 詳細資料已放在上方，下方清爽不重複顯示完整商品。
    list.innerHTML = items.length ? `<div class="small-note">已在上方顯示 ${items.length} 筆詳細資料</div>` : '';
  }

  // --- Warehouse grid summary: only customer names + total pieces ---
  function parseCellItems(raw){ try{ return Array.isArray(raw)?raw:JSON.parse(raw||'[]'); }catch(_e){ return []; } }
  function summarizeCell(items){
    if(!items || !items.length) return '<div class="slot-line empty">空格</div>';
    const byCustomer=new Map(); let total=0;
    items.forEach(it=>{ const c=clean(it.customer_name||'未指定客戶'); const q=Number(it.qty||0)||0; total += q; byCustomer.set(c,(byCustomer.get(c)||0)+q); });
    const names=Array.from(byCustomer.entries()).map(([name,q])=>`<div class="slot-line customer">${esc(name)}：${q}件</div>`).join('');
    return names + `<div class="slot-line qty">總件數：${total}</div>`;
  }
  function repaintWarehouse82(){
    const cols=[1,2,3,4,5,6];
    const active=(window.state?.warehouse?.activeZone || localStorage.getItem('warehouseActiveZone') || 'A');
    ['A','B'].forEach(zone=>{
      const wrap=$('zone-'+zone+'-grid'); if(!wrap) return;
      wrap.className='zone-grid six-grid vertical-card-grid yx67-dynamic-grid';
      wrap.innerHTML='';
      const note=$('zone-'+zone+'-count-note');
      const maxSlot=col=>Math.max(1,...(window.state?.warehouse?.cells||[]).filter(c=>String(c.zone)===zone && Number(c.column_index)===col).map(c=>Number(c.slot_number)||0));
      if(note) note.textContent=`6 欄｜目前 ${cols.reduce((s,c)=>s+maxSlot(c),0)} 格`;
      cols.forEach(colNo=>{
        const count=maxSlot(colNo);
        const col=document.createElement('div');
        col.className='vertical-column-card intuitive-column yx67-dynamic-column';
        col.innerHTML=`<div class="column-head-row"><div class="column-head">${zone} 區第 ${colNo} 欄</div><div class="small-note">目前 ${count} 格</div></div><div class="vertical-slot-list yx67-slot-list"></div>`;
        const list=col.querySelector('.vertical-slot-list');
        for(let n=1;n<=count;n++){
          const cell=(window.state?.warehouse?.cells||[]).find(c=>String(c.zone)===zone && Number(c.column_index)===colNo && Number(c.slot_number)===n);
          const items=parseCellItems(cell?.items_json);
          const key=`${zone}|${colNo}|direct|${n}`;
          const slot=document.createElement('div');
          slot.className='vertical-slot yx67-warehouse-slot';
          slot.dataset.zone=zone; slot.dataset.column=String(colNo); slot.dataset.num=String(n);
          slot.classList.toggle('filled',items.length>0);
          slot.classList.toggle('highlight',!!(window.state?.searchHighlightKeys && window.state.searchHighlightKeys.has(key)));
          slot.innerHTML=`<div class="slot-title-row"><div class="slot-title">第 ${String(n).padStart(2,'0')} 格</div><div class="small-note">${items.length?`${items.length} 筆`:'空'}</div></div><div class="slot-count">${summarizeCell(items)}</div><div class="yx67-slot-actions"><button type="button" class="ghost-btn tiny-btn yx67-slot-btn yx67-insert-btn">插入格子</button><button type="button" class="ghost-btn tiny-btn yx67-slot-btn yx67-delete-btn">刪除格子</button></div>`;
          slot.addEventListener('click',ev=>{ if(ev.target.closest('.yx67-slot-actions')) return; try{ window.showWarehouseDetail && window.showWarehouseDetail(zone,colNo,n,items); }catch(_e){} try{ window.openWarehouseModal && window.openWarehouseModal(zone,colNo,n); }catch(_e){} });
          slot.addEventListener('dragover', ev=>{ ev.preventDefault(); slot.classList.add('drag-over'); });
          slot.addEventListener('dragleave', ()=>slot.classList.remove('drag-over'));
          slot.addEventListener('drop', async ev=>{
            ev.preventDefault(); slot.classList.remove('drag-over');
            const raw=ev.dataTransfer.getData('text/plain'); if(!raw) return;
            try{ const parsed=JSON.parse(raw); if(parsed.kind==='warehouse-item' && typeof window.moveWarehouseItem==='function'){ await window.moveWarehouseItem(parsed.fromKey, [zone,colNo,'direct',n], parsed.product_text, parsed.qty); await renderWarehouse82(); } }catch(_e){}
          });
          slot.querySelector('.yx67-insert-btn')?.addEventListener('click',ev=>{ ev.preventDefault(); ev.stopPropagation(); window.insertWarehouseCell && window.insertWarehouseCell(zone,colNo,n); });
          slot.querySelector('.yx67-delete-btn')?.addEventListener('click',ev=>{ ev.preventDefault(); ev.stopPropagation(); window.deleteWarehouseCell && window.deleteWarehouseCell(zone,colNo,n); });
          list.appendChild(slot);
        }
        wrap.appendChild(col);
      });
      wrap.closest('.zone-section,.warehouse-zone-panel')?.classList.toggle('hidden', active!=='全部' && active!==zone);
    });
  }
  async function renderWarehouse82(){
    try{
      const [wh, av]=await Promise.allSettled([api('/api/warehouse',{method:'GET'}), api('/api/warehouse/available-items',{method:'GET'})]);
      const data=wh.status==='fulfilled'?wh.value:{cells:[],zones:{A:{},B:{}}};
      const avail=av.status==='fulfilled'?av.value:{items:[]};
      window.state=window.state||{}; window.state.warehouse=window.state.warehouse||{};
      window.state.warehouse.cells=Array.isArray(data.cells)?data.cells:[];
      window.state.warehouse.zones=data.zones||{A:{},B:{}};
      window.state.warehouse.availableItems=Array.isArray(avail.items)?avail.items:[];
      if($('warehouse-unplaced-pill')) $('warehouse-unplaced-pill').textContent=`未錄入倉庫圖：${window.state.warehouse.availableItems.length}`;
      repaintWarehouse82();
    }catch(e){ toast(e.message||'倉庫載入失敗','error'); }
  }

  function install82(){
    document.documentElement.dataset.yxFix82 = VERSION;
    window.loadShipCustomerItems66 = loadShipCustomerItems82;
    window.loadShipCustomerItems = ({name}={}) => loadShipCustomerItems82(name);
    window.confirmSubmit = confirmSubmit82;
    window.saveWarehouseCell = saveWarehouseCell82;
    window.renderWarehouseCellItems = renderWarehouseCellItems82;
    window.openWarehouseModal = Object.assign(openWarehouseModal82,{__yx82:true});
    window.renderWarehouse = renderWarehouse82;
    window.renderWarehouseZones = repaintWarehouse82;
    if(window.YX_MASTER){
      window.YX_MASTER = Object.freeze({...window.YX_MASTER, version:VERSION, confirmSubmit:confirmSubmit82, saveWarehouseCell:saveWarehouseCell82, openWarehouseModal:window.openWarehouseModal, renderWarehouseCellItems:renderWarehouseCellItems82, renderWarehouse:renderWarehouse82, refreshWarehouseBatchPanel:refreshWarehouseBatchPanel82});
    }
    if(modKey()==='ship') setTimeout(()=>loadShipCustomerItems82($('customer-name')?.value||''),120);
    if(modKey()==='warehouse') setTimeout(()=>{ hideLegacyWarehouseControls(); renderWarehouse82(); },120);
  }

  document.addEventListener('click', async function(e){
    const btn=e.target?.closest?.('#ship-refresh-customer-items,#ship-add-selected-item,#ship-add-all-items');
    if(!btn || modKey()!=='ship') return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    const customer=clean($('customer-name')?.value||'');
    if(btn.id==='ship-refresh-customer-items'){ await loadShipCustomerItems82(customer); return; }
    if(!(window.__YX_SHIP_CUSTOMER_ITEMS__||[]).length) await loadShipCustomerItems82(customer);
    if(btn.id==='ship-add-selected-item'){
      const it=selectedShipItem();
      if(!it) return toast('請先選擇要加入的商品','warn');
      const count=appendShipItemLines([it],customer);
      if(count) toast('已加入選取商品','ok');
      return;
    }
    if(btn.id==='ship-add-all-items'){
      const count=appendShipItemLines(window.__YX_SHIP_CUSTOMER_ITEMS__||[],customer);
      if(count) toast(`已加入 ${count} 筆商品`,'ok'); else toast('沒有可加入的商品','warn');
    }
  }, true);
  document.addEventListener('input', function(e){
    if(e.target?.id==='customer-name' && modKey()==='ship'){
      clearTimeout(window.__yx82ShipLoadTimer);
      window.__yx82ShipLoadTimer=setTimeout(()=>loadShipCustomerItems82(e.target.value||''),300);
    }
  }, true);

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install82, {once:true}); else install82();
  window.addEventListener('pageshow', install82);
  setTimeout(install82, 450);
})();
/* ==== FIX82 ship preview + source-specific deduction + warehouse batch master end ==== */



/* ==== FIX83 QA stability patch: ship qty/source + warehouse batch cleanup start ==== */
(function(){
  'use strict';
  const VERSION='FIX83_QA_STABILITY';
  const $ = id => document.getElementById(id);
  const clean = v => String(v ?? '').trim();
  const esc = v => String(v ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const toast = (msg, kind='ok') => { try{ (window.toast || window.showToast || function(m){ console.log(m); })(msg, kind); }catch(_e){ console.log(msg); } };
  const api = window.yxApi || window.requestJSON || (async function(url,opt={}){
    const res = await fetch(url,{credentials:'same-origin',...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}});
    const text = await res.text(); let data={};
    try{ data = text ? JSON.parse(text) : {}; }catch(_e){ data={success:false,error:text||'伺服器回應格式錯誤'}; }
    if(!res.ok || data.success === false){ const err=new Error(data.error||data.message||`請求失敗：${res.status}`); err.payload=data; throw err; }
    return data;
  });
  window.yxApi = api;
  const previous = {
    confirmSubmit: window.confirmSubmit,
    openWarehouseModal: window.openWarehouseModal,
    saveWarehouseCell: window.saveWarehouseCell,
    renderWarehouseCellItems: window.renderWarehouseCellItems,
    renderWarehouse: window.renderWarehouse
  };
  function modKey(){ return document.querySelector('.module-screen')?.dataset.module || (typeof window.currentModule === 'function' ? window.currentModule() : ''); }
  function normX(v){ return clean(v).replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/[＋，,；;]/g,'+').replace(/件|片/g,'').replace(/\s+/g,''); }
  function sizeKey(text){ return normX(String(text||'').split('=')[0] || text).toLowerCase(); }
  function lineKey(text){ return normX(text).toLowerCase(); }
  function sourcePref(src){
    const s=clean(src).toLowerCase();
    if(['總單','master','master_order','master_orders'].includes(s)) return 'master_orders';
    if(['訂單','order','orders'].includes(s)) return 'orders';
    if(['庫存','stock','inventory'].includes(s)) return 'inventory';
    return '';
  }
  function sourceLabel(src){ const p=sourcePref(src)||src; return {master_orders:'總單',orders:'訂單',inventory:'庫存'}[p] || clean(src) || '未指定'; }
  function reqKey(prefix){ return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,10)}`; }
  function qtyFromProduct(text){
    const raw=normX(text); const right=raw.includes('=')?raw.split('=').slice(1).join('='):'';
    if(!right) return 1;
    const parts=right.split('+').map(clean).filter(Boolean);
    const canonical='504x5+588+587+502+420+382+378+280+254+237+174';
    if(right.toLowerCase()===canonical) return 10;
    if(parts.length>=10 && parts.filter(p=>/x\d+$/i.test(p)).length===1) return parts.filter(p=>!(/x\d+$/i.test(p)) && /\d/.test(p)).length || 1;
    let total=0;
    parts.forEach(p=>{ const m=p.match(/x\s*(\d+)$/i); if(m) total += Number(m[1])||0; else if(/\d/.test(p)) total += 1; });
    return total || 1;
  }
  function itemQty(it){ const n=Number(it?.unplaced_qty ?? it?.qty ?? it?.total_qty ?? 1); return Number.isFinite(n)&&n>0?Math.floor(n):1; }
  function itemOptionText(it){ return `${it.customer_name?it.customer_name+'｜':''}${it.material||it.product_code||'未填材質'}｜${it.product_text||it.product_size||''}｜剩餘 ${it.unplaced_qty ?? it.qty ?? 0}`; }

  // ---------- 出貨：保留「從哪裡選的商品，就比對哪裡」與原始數量 ----------
  function ensureShipMeta(){
    window.__YX83_SHIP_LINE_META__ = window.__YX83_SHIP_LINE_META__ || {};
    window.__YX82_SHIP_LINE_META__ = window.__YX82_SHIP_LINE_META__ || {};
    return window.__YX83_SHIP_LINE_META__;
  }
  function storeLineMeta(line, item, customer){
    const pref=sourcePref(item.source_preference || item.source || '');
    const origin = pref === 'inventory' ? '' : clean(customer || $('customer-name')?.value || '');
    const meta = {
      source: item.source || sourceLabel(pref),
      source_preference: pref,
      customer: origin,
      material: item.material || item.product_code || '',
      qty: itemQty(item),
      item_id: item.id || ''
    };
    const metas=ensureShipMeta();
    [lineKey(line), sizeKey(line)].forEach(k=>{ if(k){ metas[k]=meta; window.__YX82_SHIP_LINE_META__[k]=meta; } });
  }
  function getLineMeta(line){
    const k1=lineKey(line), k2=sizeKey(line);
    return (window.__YX83_SHIP_LINE_META__||{})[k1] || (window.__YX83_SHIP_LINE_META__||{})[k2] || (window.__YX82_SHIP_LINE_META__||{})[k1] || (window.__YX82_SHIP_LINE_META__||{})[k2] || {};
  }
  function getTextLines(){ return String($('ocr-text')?.value||'').replace(/\r/g,'\n').split(/\n+/).map(clean).filter(Boolean); }
  function setTextLines(lines){ const box=$('ocr-text'); if(!box) return; box.value=(lines||[]).filter(Boolean).join('\n'); box.dispatchEvent(new Event('input',{bubbles:true})); }
  function appendShipItems83(items, customer){
    const current=getTextLines();
    const seen=new Set(current.map(lineKey));
    const add=[];
    (items||[]).forEach(it=>{
      const line=clean(it.product_text || it.product_size || '');
      if(!line) return;
      const key=lineKey(line);
      if(!seen.has(key)){ seen.add(key); add.push(line); }
      storeLineMeta(line,it,customer);
    });
    if(add.length) setTextLines(current.concat(add));
    try{ window.renderShipSelectedItems && window.renderShipSelectedItems(); }catch(_e){}
    return add.length;
  }
  async function loadShipCustomerItems83(name){
    const sel=$('ship-customer-item-select'); if(!sel) return [];
    const customer=clean(name || $('customer-name')?.value || window.__YX_SELECTED_CUSTOMER__ || '');
    if(!customer){ sel.innerHTML='<option value="">請先選擇 / 輸入客戶名稱</option>'; window.__YX83_SHIP_ITEMS__=[]; window.__YX_SHIP_CUSTOMER_ITEMS__=[]; return []; }
    try{
      sel.innerHTML='<option value="">載入中…</option>';
      const d=await api(`/api/customer-items?name=${encodeURIComponent(customer)}&ts=${Date.now()}`,{method:'GET'});
      const all=Array.isArray(d.items)?d.items:[];
      let items=all.filter(it=>['master_orders','orders'].includes(sourcePref(it.source)));
      if(items.length){
        items=items.map(it=>({...it, source_preference:sourcePref(it.source)}));
        sel.innerHTML='<option value="">請選擇總單 / 訂單商品</option>'+items.map((it,i)=>`<option value="${i}">${esc(sourceLabel(it.source_preference||it.source))}｜${esc(it.material||it.product_code||'未填材質')}｜${esc(it.product_text||'')}｜${itemQty(it)}件</option>`).join('');
      }else{
        const inv=await api('/api/inventory?ts='+Date.now(),{method:'GET'});
        items=(Array.isArray(inv.items)?inv.items:[]).map(it=>({...it, source:'庫存', source_preference:'inventory'}));
        sel.innerHTML='<option value="">此客戶無總單/訂單，請選擇庫存商品</option>'+items.map((it,i)=>`<option value="${i}">庫存｜${esc(it.material||it.product_code||'未填材質')}｜${esc(it.product_text||'')}｜${itemQty(it)}件</option>`).join('');
        if(!items.length) sel.innerHTML='<option value="">目前沒有庫存商品可選</option>';
      }
      window.__YX83_SHIP_ITEMS__=items;
      window.__YX_SHIP_CUSTOMER_ITEMS__=items;
      return items;
    }catch(e){
      window.__YX83_SHIP_ITEMS__=[]; window.__YX_SHIP_CUSTOMER_ITEMS__=[];
      sel.innerHTML=`<option value="">${esc(e.message||'商品載入失敗')}</option>`;
      return [];
    }
  }
  function selectedShipItem83(){ return (window.__YX83_SHIP_ITEMS__ || window.__YX_SHIP_CUSTOMER_ITEMS__ || [])[Number($('ship-customer-item-select')?.value)]; }

  function parseShipItems83(){
    const lines=getTextLines();
    const out=[];
    let lastDims=['','',''];
    lines.forEach(line=>{
      let raw=normX(line);
      if(!raw) return;
      const meta=getLineMeta(line);
      let product_text=raw;
      if(raw.includes('=')){
        let [left,right] = raw.split('=');
        let dims=left.split('x').filter(x=>x!=='');
        if(dims.length>=3) dims=dims.slice(0,3).map((x,i)=>/^[_-]+$/.test(x)?lastDims[i]:x);
        else if(dims.length===2 && lastDims[2]) dims=[dims[0], /^[_-]+$/.test(dims[1])?lastDims[1]:dims[1], lastDims[2]];
        else if(dims.length===1 && lastDims[1] && lastDims[2]) dims=[dims[0], lastDims[1], lastDims[2]];
        if(dims.length>=3 && dims.every(Boolean)){ lastDims=dims.slice(0,3); product_text=`${lastDims.join('x')}=${right||'1'}`; }
      }else{
        const dims=raw.split('x').filter(Boolean);
        if(dims.length>=3) lastDims=dims.slice(0,3);
      }
      if(!product_text || product_text.split('x').length < 3) return;
      const pref=sourcePref(meta.source_preference || meta.source || '');
      const qty = Number(meta.qty || 0) > 0 ? Number(meta.qty) : (raw.includes('=') ? qtyFromProduct(product_text) : 1);
      out.push({
        product_text,
        product_code: meta.material || '',
        material: meta.material || '',
        qty,
        source_preference: pref,
        source_customer_name: pref === 'inventory' ? '' : (meta.customer || ''),
        borrow_from_customer_name: '',
      });
    });
    const merged=new Map();
    out.forEach(it=>{
      const key=[sizeKey(it.product_text), it.material||'', it.source_preference||'', it.source_customer_name||''].join('__');
      const prev=merged.get(key);
      if(prev){ prev.qty += Number(it.qty||0); }
      else merged.set(key,{...it, qty:Number(it.qty||1)||1});
    });
    return Array.from(merged.values());
  }
  async function targetHasEnough(customer, item){
    try{
      const d=await api(`/api/customer-items?name=${encodeURIComponent(customer)}&ts=${Date.now()}`,{method:'GET'});
      const pref=sourcePref(item.source_preference);
      let total=0; const key=sizeKey(item.product_text);
      (d.items||[]).forEach(it=>{
        if(sizeKey(it.product_text||'')===key && (!pref || sourcePref(it.source)===pref)) total += Number(it.qty||0);
      });
      return total >= Number(item.qty||0) && total>0;
    }catch(_e){ return false; }
  }
  async function borrowIssues83(customer, items){
    const out=[];
    for(const it of items||[]){
      const pref=sourcePref(it.source_preference);
      const origin=clean(it.source_customer_name||'');
      if(!origin || origin===customer || pref==='inventory') continue;
      if(!(await targetHasEnough(customer,it))) out.push({origin,item:it});
    }
    return out;
  }
  function confirmBorrow83(issues, customer){
    return new Promise(resolve=>{
      let panel=$('yx83-borrow-confirm-panel');
      if(!panel){ panel=document.createElement('div'); panel.id='yx83-borrow-confirm-panel'; panel.className='modal'; document.body.appendChild(panel); }
      panel.innerHTML=`<div class="modal-card glass yx80-borrow-card"><div class="modal-head"><div class="section-title">確認借貨出貨</div><button type="button" class="icon-btn" id="yx83-borrow-close">✕</button></div>${issues.map(x=>`<div class="deduct-card"><strong>該客戶「${esc(customer)}」沒有這筆商品</strong><div class="small-note">是否向 ${esc(x.origin)} 借 ${esc(x.item.product_text||'')} = ${Number(x.item.qty||0)} 件</div></div>`).join('')}<div class="btn-row"><button type="button" class="ghost-btn" id="yx83-borrow-cancel">取消</button><button type="button" class="primary-btn" id="yx83-borrow-ok">確認借貨</button></div></div>`;
      panel.classList.remove('hidden');
      const done=v=>{ panel.classList.add('hidden'); resolve(v); };
      $('yx83-borrow-close').onclick=()=>done(false);
      $('yx83-borrow-cancel').onclick=()=>done(false);
      $('yx83-borrow-ok').onclick=()=>done(true);
    });
  }
  function applyBorrow83(items, issues){
    const map=new Map(issues.map(x=>[sizeKey(x.item.product_text), x.origin]));
    return (items||[]).map(it=>map.has(sizeKey(it.product_text)) ? {...it, source_customer_name:map.get(sizeKey(it.product_text)), borrow_from_customer_name:map.get(sizeKey(it.product_text)), borrow_confirmed:true} : it);
  }
  function dimFactor(v, idx){
    const n=Number(String(v||'').replace(/[^0-9.]/g,'')||0);
    if(!n) return 0;
    if(idx===0) return n>210 ? n/1000 : n/100;
    if(idx===1) return n/10;
    return n>=100 ? n/100 : n/10;
  }
  function volumeInfo(text){
    const raw=normX(text);
    const left=(raw.split('=')[0]||'').split('x');
    const right=raw.includes('=') ? raw.split('=').slice(1).join('=') : '';
    let sum=0, expr=[];
    right.split('+').map(clean).filter(Boolean).forEach(seg=>{
      const m=seg.match(/^(\d+(?:\.\d+)?)x(\d+)$/i);
      if(m){ sum += Number(m[1])*Number(m[2]); expr.push(`${m[1]}×${m[2]}`); }
      else if(/^\d+(?:\.\d+)?$/.test(seg)){ sum += Number(seg); expr.push(seg); }
    });
    if(!sum){ sum=qtyFromProduct(text); expr=[String(sum)]; }
    const a=dimFactor(left[0],0), b=dimFactor(left[1],1), c=dimFactor(left[2],2);
    const vol=sum*a*b*c;
    return {volume:vol, formula:`(${expr.join('+')||'0'}) × ${Number(a.toFixed(3))} × ${Number(b.toFixed(3))} × ${Number(c.toFixed(3))} = ${Number(vol.toFixed(3))}`};
  }
  function num(v){ const n=Number(v||0); return Number.isFinite(n)?n:0; }
  function beforeAfter(item){
    const b=item.deduct_before || {master:item.master_available, order:item.order_available, inventory:item.inventory_available};
    const a=item.deduct_after || item.remaining_after || {
      master: Math.max(0,num(b.master)-num(item.master_deduct||0)),
      order: Math.max(0,num(b.order)-num(item.order_deduct||0)),
      inventory: Math.max(0,num(b.inventory)-num(item.inventory_deduct||0))
    };
    return `<div class="yx82-before-after"><span>總單：${num(b.master)} → ${num(a.master)}</span><span>訂單：${num(b.order)} → ${num(a.order)}</span><span>庫存：${num(b.inventory)} → ${num(a.inventory)}</span></div>`;
  }
  function renderPreview83(preview,payload){
    const section=$('ship-preview-section'); if(section) section.style.display='';
    const panel=$('ship-preview-panel') || $('module-result'); if(!panel) return;
    panel.classList.remove('hidden'); panel.style.display='';
    const items=preview.items||[];
    const totalVol=items.reduce((s,it)=>s+volumeInfo(it.product_text||'').volume,0);
    const rows=items.map(it=>{
      const vi=volumeInfo(it.product_text||'');
      const locs=(it.locations||[]).map(loc=>`<span class="ship-location-chip">${esc(loc.zone||'')}-${esc(loc.column_index||'')}-${String(loc.visual_slot||loc.slot_number||'').padStart(2,'0')}｜可出 ${num(loc.ship_qty||loc.qty)}</span>`).join('') || '<span class="small-note">倉庫圖尚未找到位置</span>';
      const shortage=(it.shortage_reasons||[]).length ? `<div class="error-card compact-danger">${esc((it.shortage_reasons||[]).join('、'))}</div>` : '';
      const borrow=(it.is_borrowed||it.borrow_from_customer_name) ? `<span class="ship-mini-chip">向 ${esc(it.source_customer_name||it.borrow_from_customer_name||'')} 借貨</span>` : '';
      return `<div class="ship-breakdown-item yx82-preview-item"><div class="yx82-preview-title"><strong>${esc(it.product_text||'')}</strong><span>本次 ${num(it.qty)} 件</span>${borrow}<span class="ship-mini-chip selected-source">比對 / 扣除：${esc(it.source_label || sourceLabel(it.source_preference) || '原本流程')}</span></div><div class="yx82-formula">材積算式：${esc(vi.formula)}</div><div class="small-note">扣除前 → 扣除後</div>${beforeAfter(it)}${shortage}<div class="small-note">${esc(it.recommendation||'')}</div><div class="ship-breakdown-list">${locs}</div></div>`;
    }).join('');
    panel.innerHTML=`<div class="success-card yx82-ship-preview-head"><div class="section-title">出貨預覽</div><div class="small-note">可看材積算式、扣除來源、倉庫位置；輸入重量後會自動計算總重。</div><div class="yx82-preview-summary"><div>本次件數：<b>${items.reduce((s,it)=>s+num(it.qty),0)}</b></div><div>材積合計：<b id="yx83-total-volume">${Number(totalVol.toFixed(3))}</b></div><label>重量<input id="yx83-weight-input" class="text-input yx82-weight-input" type="number" min="0" step="0.01" placeholder="輸入重量"></label><div>總重：<b id="yx83-total-weight">0</b></div></div></div>${rows}<div class="btn-row"><button type="button" class="ghost-btn" id="yx83-ship-cancel">取消</button><button type="button" class="primary-btn" id="yx83-ship-confirm">確認扣除</button></div>`;
    const upd=()=>{ const w=num($('yx83-weight-input')?.value); const out=$('yx83-total-weight'); if(out) out.textContent=Number((totalVol*w).toFixed(3)); };
    $('yx83-weight-input')?.addEventListener('input',upd);
    $('yx83-ship-cancel').onclick=()=>panel.classList.add('hidden');
    $('yx83-ship-confirm').onclick=async function(){
      const btn=this; if(btn.dataset.busy==='1') return; btn.dataset.busy='1'; btn.disabled=true; btn.textContent='扣除中…';
      try{
        const result=await api('/api/ship',{method:'POST',body:JSON.stringify({...payload,allow_inventory_fallback:true,preview_confirmed:true,request_key:reqKey('ship83_confirm')})});
        const done=(result.breakdown||[]).map(row=>`<div class="deduct-card yx82-done-card"><strong>${esc(row.product_text||'')}</strong>｜本次出貨 ${num(row.qty)} 件${row.is_borrowed?`｜向 ${esc(row.source_customer_name||'')} 借貨`:''}<div class="small-note">實際扣除：總單 ${num(row.master_deduct)}｜訂單 ${num(row.order_deduct)}｜庫存 ${num(row.inventory_deduct)}｜${esc(row.note||'')}</div><div class="small-note">扣除前 → 扣除後</div>${beforeAfter({deduct_before:row.deduct_before||{master:row.master_available,order:row.order_available,inventory:row.inventory_available},deduct_after:row.remaining_after})}</div>`).join('');
        panel.innerHTML=`<div class="success-card"><div class="section-title">出貨完成</div><div class="small-note">已顯示扣除前全部數量與扣除後剩餘數量。</div></div>${done || '<div class="empty-state-card compact-empty">已完成扣除。</div>'}`;
        toast('出貨完成','ok');
        try{ await (window.YX_MASTER?.loadCustomerBlocks ? window.YX_MASTER.loadCustomerBlocks(true) : window.loadCustomerBlocks?.(true)); }catch(_e){}
      }catch(e){ toast(e.message||'出貨失敗','error'); btn.dataset.busy='0'; btn.disabled=false; btn.textContent='確認扣除'; }
    };
    try{ panel.scrollIntoView({behavior:'smooth',block:'start'}); }catch(_e){}
  }
  async function confirmSubmit83(){
    if(modKey()!=='ship'){
      if(previous.confirmSubmit && previous.confirmSubmit!==confirmSubmit83) return previous.confirmSubmit.apply(this,arguments);
      return;
    }
    const btn=$('submit-btn'); if(!btn || btn.dataset.busy==='1') return;
    const customer=clean($('customer-name')?.value||'');
    if(!customer) return toast('請先輸入客戶名稱','warn');
    let items=parseShipItems83();
    if(!items.length) return toast('沒有可送出的商品資料','warn');
    const issues=await borrowIssues83(customer,items);
    if(issues.length){
      const ok=await confirmBorrow83(issues,customer);
      if(!ok) return;
      items=applyBorrow83(items,issues);
    }
    const payload={customer_name:customer, ocr_text:$('ocr-text')?.value||'', items};
    try{
      btn.dataset.busy='1'; btn.disabled=true; btn.textContent='整理預覽中…';
      const preview=await api('/api/ship-preview',{method:'POST',body:JSON.stringify(payload)});
      renderPreview83(preview,payload);
    }catch(e){
      const panel=$('ship-preview-panel')||$('module-result');
      if(panel){ panel.classList.remove('hidden'); panel.style.display=''; panel.innerHTML=`<div class="error-card">${esc(e.message||'出貨預覽失敗')}</div>`; }
      toast(e.message||'出貨預覽失敗','error');
    }finally{
      btn.dataset.busy='0'; btn.disabled=false; btn.textContent='確認送出';
    }
  }

  // ---------- 倉庫格位：只留批量母版，舊 UI/舊 panel 不再干擾 ----------
  function hideWarehouseLegacy(){
    ['warehouse-item-select','warehouse-add-qty','warehouse-recent-slots','yx80-warehouse-batch-panel','yx81-warehouse-batch-panel'].forEach(id=>{
      const el=$(id); if(el){ el.classList.add('yx82-hidden-control'); el.style.display='none'; }
    });
    const legacyWrap=document.querySelector('.yx83-legacy-warehouse-controls');
    if(legacyWrap) legacyWrap.style.display='none';
    document.querySelectorAll('#warehouse-modal .btn-row').forEach(row=>{
      if(row.querySelector('[onclick*="addSelectedItemToCell"],[onclick*="saveWarehouseCell"]')) row.style.display='none';
    });
  }
  function ensureWarehousePanels83(){
    const modal=$('warehouse-modal'); if(!modal) return {};
    const card=modal.querySelector('.modal-card') || modal;
    let detail=$('yx82-warehouse-detail-panel') || $('yx83-warehouse-detail-panel');
    if(!detail){ detail=document.createElement('div'); detail.id='yx82-warehouse-detail-panel'; detail.className='yx82-warehouse-detail-panel'; const meta=$('warehouse-modal-meta'); (meta?.parentNode||card).insertBefore(detail, meta?.nextSibling||card.firstChild); }
    let panel=$('yx82-warehouse-batch-panel') || $('yx83-warehouse-batch-panel');
    if(!panel){ panel=document.createElement('div'); panel.id='yx82-warehouse-batch-panel'; panel.className='yx80-warehouse-batch-panel'; detail.insertAdjacentElement('afterend', panel); }
    return {detail,panel};
  }
  function availableWarehouseItems(){ return window.state?.warehouse?.availableItems || []; }
  async function refreshWarehouseAvailableIfNeeded(){
    window.state=window.state||{}; window.state.warehouse=window.state.warehouse||{};
    if(Array.isArray(window.state.warehouse.availableItems) && window.state.warehouse.availableItems.length) return;
    try{
      const d=await api('/api/warehouse/available-items?ts='+Date.now(),{method:'GET'});
      window.state.warehouse.availableItems=Array.isArray(d.items)?d.items:[];
    }catch(_e){}
  }
  function renderWarehouseDetails83(){
    const {detail}=ensureWarehousePanels83(); if(!detail) return;
    const items=Array.isArray(window.state?.currentCellItems)?window.state.currentCellItems:[];
    if(!items.length){ detail.innerHTML='<div class="empty-state-card compact-empty">此格目前沒有商品</div>'; return; }
    detail.innerHTML='<div class="section-title">格位詳細資料</div>'+items.map((it,idx)=>{
      const label=clean(it.placement_label||it.layer_label||(['後排','中間','前排'][idx]||'')); 
      return `<div class="deduct-card yx82-warehouse-detail-card"><strong>${esc(label || `第${idx+1}筆`)}</strong><div class="small-note">客戶：${esc(it.customer_name||'未指定客戶')}</div><div class="small-note">商品：${esc(it.product_text||'')}</div><div class="small-note">數量：${Number(it.qty||0)} 件</div></div>`;
    }).join('');
  }
  function snapshotBatch83(panel){
    return Array.from(panel?.querySelectorAll?.('.yx82-batch-row,.yx83-batch-row') || []).map(row=>({
      value: row.querySelector('select')?.value || '',
      qty: row.querySelector('input[type="number"]')?.value || '1'
    }));
  }
  async function refreshWarehouseBatchPanel83(keep){
    hideWarehouseLegacy();
    await refreshWarehouseAvailableIfNeeded();
    const {panel}=ensureWarehousePanels83(); if(!panel) return;
    renderWarehouseDetails83();
    const prev=keep || snapshotBatch83(panel);
    const rows=Math.max(3, Number(panel.dataset.rows||prev.length||3));
    const opts=availableWarehouseItems();
    const rowHtml=i=>{
      const label=i===0?'後排':i===1?'中間':i===2?'前排':`第${i+1}筆`;
      return `<div class="yx80-batch-row yx82-batch-row yx83-batch-row" data-batch-idx="${i}"><span class="yx80-batch-label">${label}</span><select class="text-input yx82-batch-select yx83-batch-select"><option value="">不加入</option>${opts.map((it,idx)=>`<option value="${idx}">${esc(itemOptionText(it))}</option>`).join('')}</select><input class="text-input yx82-batch-qty yx83-batch-qty" type="number" min="1" value="1"></div>`;
    };
    panel.innerHTML=`<label class="field-label">批量加入商品</label><div class="small-note">第一筆後排、第二筆中間、第三筆前排；第 4 筆後不特別顯示。按下「批量加入格位」會直接儲存。</div><div id="yx83-batch-rows">${Array.from({length:rows},(_,i)=>rowHtml(i)).join('')}</div><div class="btn-row compact-row"><button type="button" class="ghost-btn small-btn" id="yx82-add-batch-row">增加批量</button><button type="button" class="primary-btn small-btn" id="yx82-add-batch-items">批量加入格位</button></div>`;
    panel.querySelectorAll('.yx83-batch-row').forEach((row,i)=>{
      const st=prev[i]||{};
      const sel=row.querySelector('select'); const qty=row.querySelector('input[type="number"]');
      if(st.value) sel.value=st.value;
      if(st.qty) qty.value=st.qty;
      sel.addEventListener('change',()=>{ const it=opts[Number(sel.value)]; if(it) qty.value=String(itemQty(it)); });
    });
  }
  async function saveWarehouseCell83(){
    const cell=window.state?.currentCell||{};
    const zone=cell.zone; const col=Number(cell.column||cell.column_index||cell.col||0); const slot=Number(cell.slot_number||cell.num||cell.slot||0);
    if(!zone || !col || !slot) throw new Error('格位資料不完整，請重新點選格子');
    await api('/api/warehouse/cell',{method:'POST',body:JSON.stringify({zone,column_index:col,slot_type:'direct',slot_number:slot,items:window.state.currentCellItems||[],note:$('warehouse-note')?.value||''})});
    try{ window.closeWarehouseModal && window.closeWarehouseModal(); }catch(_e){}
    try{ await (window.renderWarehouse && window.renderWarehouse(true)); }catch(_e){ try{ await window.renderWarehouse(); }catch(_e2){} }
    return true;
  }
  async function batchAddAndSave83(){
    const panel=$('yx82-warehouse-batch-panel') || $('yx83-warehouse-batch-panel'); if(!panel) return;
    const btn=$('yx82-add-batch-items'); if(btn?.dataset.busy==='1') return;
    const opts=availableWarehouseItems();
    window.state=window.state||{};
    window.state.currentCellItems=Array.isArray(window.state.currentCellItems)?window.state.currentCellItems:[];
    let count=0;
    panel.querySelectorAll('.yx83-batch-row,.yx82-batch-row').forEach(row=>{
      const i=Number(row.dataset.batchIdx||0);
      const item=opts[Number(row.querySelector('select')?.value)];
      if(!item) return;
      let qty=parseInt(row.querySelector('input[type="number"]')?.value||String(itemQty(item)),10);
      if(!Number.isFinite(qty)||qty<=0) qty=itemQty(item);
      qty=Math.min(qty,itemQty(item));
      const label=i===0?'後排':i===1?'中間':i===2?'前排':'';
      window.state.currentCellItems.push({...item, product_text:item.product_text||item.product_size||'', qty, customer_name:item.customer_name||'', material:item.material||item.product_code||'', placement_label:label, layer_label:label});
      count++;
    });
    if(!count) return toast('請至少選擇一筆商品','warn');
    renderWarehouseDetails83();
    try{
      if(btn){ btn.dataset.busy='1'; btn.disabled=true; btn.textContent='儲存中…'; }
      await saveWarehouseCell83();
      toast(`已批量加入並儲存 ${count} 筆`,'ok');
    }catch(e){
      toast(e.message||'批量儲存失敗','error');
      if(btn){ btn.dataset.busy='0'; btn.disabled=false; btn.textContent='批量加入格位'; }
    }
  }
  async function openWarehouseModal83(){
    let r;
    if(previous.openWarehouseModal && previous.openWarehouseModal!==openWarehouseModal83){
      r = await previous.openWarehouseModal.apply(this,arguments);
    }
    setTimeout(()=>{ hideWarehouseLegacy(); refreshWarehouseBatchPanel83(); },80);
    return r;
  }
  function renderWarehouseCellItems83(){
    renderWarehouseDetails83();
    const list=$('warehouse-cell-items');
    if(list) list.innerHTML='';
  }

  // Window capture runs before older document-capture FIX handlers, so old duplicated handlers cannot double-add.
  window.addEventListener('click', async function(e){
    const target=e.target?.closest?.('#ship-refresh-customer-items,#ship-add-selected-item,#ship-add-all-items,#yx82-add-batch-row,#yx82-add-batch-items');
    if(!target) return;
    if(target.id.startsWith('ship-') && modKey()==='ship'){
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      const customer=clean($('customer-name')?.value||'');
      if(target.id==='ship-refresh-customer-items'){ await loadShipCustomerItems83(customer); return; }
      if(!(window.__YX83_SHIP_ITEMS__||[]).length) await loadShipCustomerItems83(customer);
      if(target.id==='ship-add-selected-item'){
        const it=selectedShipItem83(); if(!it) return toast('請先選擇要加入的商品','warn');
        const n=appendShipItems83([it],customer); toast(n?'已加入選取商品':'商品已在清單中','ok'); return;
      }
      if(target.id==='ship-add-all-items'){
        const n=appendShipItems83(window.__YX83_SHIP_ITEMS__||[],customer); toast(n?`已加入 ${n} 筆商品`:'沒有可加入的商品','warn'); return;
      }
    }
    if(modKey()==='warehouse' && (target.id==='yx82-add-batch-row' || target.id==='yx82-add-batch-items')){
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      const panel=$('yx82-warehouse-batch-panel') || $('yx83-warehouse-batch-panel');
      if(target.id==='yx82-add-batch-row'){
        const snap=snapshotBatch83(panel); if(panel) panel.dataset.rows=String(Math.max(3, Number(panel.dataset.rows||snap.length||3))+1);
        await refreshWarehouseBatchPanel83(snap.concat([{value:'',qty:'1'}]));
        return;
      }
      await batchAddAndSave83();
    }
  }, true);

  window.addEventListener('input', function(e){
    if(e.target?.id==='customer-name' && modKey()==='ship'){
      clearTimeout(window.__yx83ShipLoadTimer);
      window.__yx83ShipLoadTimer=setTimeout(()=>loadShipCustomerItems83(e.target.value||''),250);
    }
  }, true);

  function install83(){
    document.documentElement.dataset.yxFix83 = VERSION;
    window.loadShipCustomerItems = ({name}={}) => loadShipCustomerItems83(name);
    window.loadShipCustomerItems66 = loadShipCustomerItems83;
    window.confirmSubmit = confirmSubmit83;
    window.saveWarehouseCell = saveWarehouseCell83;
    window.openWarehouseModal = Object.assign(openWarehouseModal83,{__yx83:true});
    window.renderWarehouseCellItems = renderWarehouseCellItems83;
    window.refreshWarehouseBatchPanel = refreshWarehouseBatchPanel83;
    if(window.YX_MASTER){
      window.YX_MASTER = Object.freeze({...window.YX_MASTER, version:VERSION, confirmSubmit:confirmSubmit83, saveWarehouseCell:saveWarehouseCell83, openWarehouseModal:window.openWarehouseModal, renderWarehouseCellItems:renderWarehouseCellItems83, refreshWarehouseBatchPanel:refreshWarehouseBatchPanel83});
    }
    if(modKey()==='ship') setTimeout(()=>loadShipCustomerItems83($('customer-name')?.value||''),120);
    if(modKey()==='warehouse') setTimeout(()=>{ hideWarehouseLegacy(); refreshWarehouseBatchPanel83(); },120);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', install83, {once:true}); else install83();
  window.addEventListener('pageshow', install83);
  setTimeout(install83, 500);
})();
/* ==== FIX83 QA stability patch: ship qty/source + warehouse batch cleanup end ==== */


/* ==== FIX84: submit refresh + month sort master patch start ==== */
(function(){
  'use strict';
  const VERSION='FIX84_MONTH_SORT_SUBMIT_REFRESH';
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  const clean=v=>String(v??'').trim();
  const modKey=()=>document.querySelector('.module-screen')?.dataset.module || '';
  const toast=(msg,kind='ok')=>{ try{ (window.toast||window.showToast||window.alert)(msg,kind); }catch(_e){ try{ console.log(msg); }catch(_e2){} } };
  const api=window.yxApi || window.requestJSON || (async function(url,opt={}){
    const res=await fetch(url,{credentials:'same-origin',...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}});
    const text=await res.text(); let data={}; try{ data=text?JSON.parse(text):{}; }catch(_e){ data={success:false,error:text||'伺服器回應格式錯誤'}; }
    if(!res.ok || data.success===false){ const e=new Error(data.error||data.message||('請求失敗 '+res.status)); e.payload=data; throw e; }
    return data;
  });
  function normX(v){ return String(v??'').replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/[＋，,；;]/g,'+').replace(/\s+/g,'').trim(); }
  function splitMonthLeft(left){
    const raw=normX(left);
    const m=raw.match(/^(\d{1,2})(?:月|月份)(.+)$/);
    if(m){ const month=Number(m[1]||0); if(month>=1 && month<=12 && m[2]) return {month, body:m[2]}; }
    return {month:0, body:raw};
  }
  function productSortKey(text){
    const raw=normX(text); const left=(raw.split('=')[0]||raw);
    const sp=splitMonthLeft(left);
    const nums=(sp.body.match(/\d+(?:\.\d+)?/g)||[]).map(Number);
    const month=sp.month || 99;
    const len=nums[0]||999999, wid=nums[1]||999999, hei=nums[2]||999999;
    return [month, hei, wid, len, raw];
  }
  function cmpText(a,b){
    const ka=productSortKey(a), kb=productSortKey(b);
    for(let i=0;i<4;i++){ if(ka[i]!==kb[i]) return ka[i]-kb[i]; }
    return String(ka[4]||'').localeCompare(String(kb[4]||''),'zh-Hant',{numeric:true});
  }
  function isProductLine(line){ return /=/.test(line) && /(?:\d{1,2}(?:月|月份))?[^=]*x[^=]*x[^=]*/i.test(normX(line)); }
  function sortTextareaByMonth(){
    const box=$('ocr-text'); if(!box) return [];
    const lines=String(box.value||'').replace(/\r/g,'\n').split(/\n+/).map(s=>s.trim()).filter(Boolean);
    if(!lines.length) return [];
    const product=[], other=[];
    lines.forEach((line,idx)=>{ (isProductLine(line)?product:other).push({line,idx}); });
    if(!product.length) return lines;
    product.sort((a,b)=>cmpText(a.line,b.line) || a.idx-b.idx);
    const sorted=other.length ? other.map(x=>x.line).concat(product.map(x=>x.line)) : product.map(x=>x.line);
    const next=sorted.join('\n');
    if(box.value!==next){ box.value=next; box.dispatchEvent(new Event('input',{bubbles:true})); box.dispatchEvent(new Event('change',{bubbles:true})); }
    return sorted;
  }
  function sortItemArray(items){
    return [...(items||[])].sort((a,b)=>cmpText(a.product_text||a.product_code||'', b.product_text||b.product_code||''));
  }
  window.yx84ProductSortKey = productSortKey;
  window.sortParsedItems = function(items){ return sortItemArray(items); };

  async function refreshSubmittedCustomer(customer){
    const mod=modKey();
    if(!customer || !['orders','master_order','inventory'].includes(mod)) return;
    try{ window.__YX81_CUSTOMERS__=null; window.__YX80_CUSTOMERS__=null; window.__YX_CUSTOMERS_CACHE__=null; }catch(_e){}
    try{ if(window.YX_MASTER?.loadCustomerBlocks) await window.YX_MASTER.loadCustomerBlocks(true); }catch(_e){}
    try{ if(window.loadCustomerBlocks) await window.loadCustomerBlocks(true); }catch(_e){}
    try{ if(window.renderCustomers) await window.renderCustomers(true); }catch(_e){}
    try{ if(['orders','master_order'].includes(mod) && window.selectCustomerForModule) await window.selectCustomerForModule(customer); }catch(_e){}
    // Fallback: if older UI did not paint the detail panel, render a minimal current snapshot.
    const panel=$('selected-customer-items');
    if(panel && ['orders','master_order'].includes(mod)){
      try{
        const d=await api('/api/customer-items?name='+encodeURIComponent(customer)+'&ts='+Date.now(),{method:'GET'});
        const items=sortItemArray(d.items||[]);
        if(items.length){
          const qty=items.reduce((s,it)=>s+(Number(it.qty||0)||0),0);
          const rows=items.map(it=>{ const text=String(it.product_text||''); const parts=text.split('='); return `<tr><td>${esc(parts[0]||text)}</td><td>${esc(parts.slice(1).join('=')||String(it.qty||''))}</td><td>${esc(it.source||'')}</td></tr>`; }).join('');
          panel.classList.remove('hidden'); panel.style.display='';
          panel.innerHTML=`<div class="customer-detail-card"><div class="customer-detail-header"><div><div class="section-title">${esc(customer)}</div><div class="muted">${qty}件 / ${items.length}筆商品</div></div></div><div class="table-card customer-table-wrap"><table><thead><tr><th>尺寸</th><th>支數 x 件數</th><th>來源</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
        }
      }catch(_e){}
    }
  }

  function install84(){
    try{ document.documentElement.dataset.yxFix84=VERSION; }catch(_e){}
    const current=window.confirmSubmit;
    if(current && current.__yx84Wrapped) return;
    const wrapped=async function(){
      const mod=modKey(); const customer=clean($('customer-name')?.value||'');
      if(['inventory','orders','master_order'].includes(mod)) sortTextareaByMonth();
      let result;
      if(typeof current==='function') result=await current.apply(this,arguments);
      if(['inventory','orders','master_order'].includes(mod) && result!==false) await refreshSubmittedCustomer(customer);
      return result;
    };
    wrapped.__yx84Wrapped=true;
    wrapped.__yx84Previous=current;
    window.confirmSubmit=wrapped;
    try{ if(window.YX_MASTER) window.YX_MASTER=Object.freeze({...window.YX_MASTER,version:VERSION,confirmSubmit:wrapped}); }catch(_e){}
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install84,{once:true}); else install84();
  window.addEventListener('pageshow',()=>setTimeout(install84,0));
  setTimeout(install84,600);
})();
/* ==== FIX84: submit refresh + month sort master patch end ==== */


/* ==== FIX86: stack-safe month-first sort + pretty month display start ==== */
(function(){
  'use strict';
  const VERSION='FIX86_STACK_SAFE_MONTH_TABLES';
  const clean=v=>String(v??'').trim();
  const esc=v=>String(v??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  const norm=v=>clean(v).replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/[＋，,；;]/g,'+').replace(/\s+/g,'');

  function sizeInfo(value){
    const raw=norm(value).split('=')[0] || norm(value);
    const m=raw.match(/^(\d{1,2})(?:月|月份)(.+)$/);
    const month=m?Number(m[1]||0):0;
    const body=m?(m[2]||''):raw;
    const nums=(body.match(/\d+(?:\.\d+)?/g)||[]).map(Number);
    return { raw, hasMonth:month>=1&&month<=12, month:(month>=1&&month<=12)?month:99, body, length:nums[0]??999999, width:nums[1]??999999, height:nums[2]??999999 };
  }
  function supportInfo(text){
    const raw=norm(text);
    const parts=raw.split('+').filter(Boolean);
    let maxCase=0,totalCase=0;
    parts.forEach(seg=>{ const m=seg.match(/x\s*(\d+)$/i); const c=m?Number(m[1]||0):(/\d/.test(seg)?1:0); maxCase=Math.max(maxCase,c); totalCase+=c; });
    return {maxCase,totalCase,text:raw};
  }
  function cmp(a,b){
    const sa=sizeInfo(a.size), sb=sizeInfo(b.size);
    if(sa.hasMonth || sb.hasMonth){
      if(sa.month!==sb.month) return sa.month-sb.month;
      if(sa.height!==sb.height) return sa.height-sb.height;
      if(sa.width!==sb.width) return sa.width-sb.width;
      if(sa.length!==sb.length) return sa.length-sb.length;
      const mat=(a.material||'').localeCompare(b.material||'','zh-Hant',{numeric:true}); if(mat) return mat;
    }else{
      const mat=(a.material||'').localeCompare(b.material||'','zh-Hant',{numeric:true}); if(mat) return mat;
      if(sa.height!==sb.height) return sa.height-sb.height;
      if(sa.width!==sb.width) return sa.width-sb.width;
      if(sa.length!==sb.length) return sa.length-sb.length;
    }
    const qa=supportInfo(a.support), qb=supportInfo(b.support);
    if(qa.maxCase!==qb.maxCase) return qb.maxCase-qa.maxCase;
    if(qa.totalCase!==qb.totalCase) return qb.totalCase-qa.totalCase;
    return qa.text.localeCompare(qb.text,'zh-Hant',{numeric:true});
  }
  function prettySizeHTML(size){
    const info=sizeInfo(size);
    const body=esc(String(info.body||size||'').replace(/x/gi,' × '));
    return info.hasMonth ? `<span class="yx85-month-size"><span class="yx85-month-badge">${info.month}月</span><span class="yx85-size-body">${body}</span></span>` : `<span class="yx85-size-body">${body}</span>`;
  }
  function cellText(cell){ return clean(cell?.dataset?.yx86Raw || cell?.dataset?.yx85Raw || cell?.textContent || ''); }
  function headerIndex(table, keyword){
    const heads=Array.from(table.querySelectorAll('thead th')).map(th=>clean(th.textContent));
    return heads.findIndex(h=>h.includes(keyword));
  }
  function readRowMeta(table,row,idx){
    const cls=table.className||'';
    let material='',size='',support='',sizeCell=null;
    if(cls.includes('yx63-summary-table')){
      sizeCell=row.querySelector('.yx63-size-cell') || row.cells[1];
      material=cellText(row.querySelector('.yx63-material-cell') || row.cells[0]);
      size=cellText(sizeCell);
      support=cellText(row.querySelector('.yx63-support-cell') || row.cells[2]);
    }else if(cls.includes('yx66-customer-table')){
      sizeCell=row.querySelector('.yx66-size-cell') || row.cells[1];
      material=cellText(row.querySelector('.yx66-material-cell') || row.cells[0]);
      size=cellText(sizeCell);
      support=cellText(row.querySelector('.yx66-support-cell') || row.cells[2]);
    }else{
      const sizeIdx=headerIndex(table,'尺寸'); if(sizeIdx<0) return null;
      const materialIdx=headerIndex(table,'材質'); const supportIdx=headerIndex(table,'支數');
      sizeCell=row.cells[sizeIdx]; size=cellText(sizeCell);
      material=materialIdx>=0?cellText(row.cells[materialIdx]):'';
      support=supportIdx>=0?cellText(row.cells[supportIdx]):'';
    }
    return {row,idx,material,size,support,sizeCell};
  }
  function decorate(meta){
    const cell=meta?.sizeCell; if(!cell) return;
    const info=sizeInfo(meta.size); if(!info.hasMonth) return;
    const raw=info.raw;
    if(cell.dataset.yx86Raw===raw && cell.dataset.yx86Decorated==='1') return;
    cell.dataset.yx86Raw=raw; cell.dataset.yx86Decorated='1';
    cell.innerHTML=prettySizeHTML(raw);
  }
  function sortAndDecorateTable(table){
    if(!table || table.dataset.yx86Busy==='1') return;
    const tbody=table.tBodies && table.tBodies[0]; if(!tbody) return;
    const mapped=Array.from(tbody.rows).map((row,idx)=>readRowMeta(table,row,idx)).filter(Boolean);
    if(!mapped.length) return;
    const hasMonth=mapped.some(x=>sizeInfo(x.size).hasMonth);
    if(!hasMonth){ mapped.forEach(decorate); return; }
    const signature=mapped.map(x=>`${x.material}|${sizeInfo(x.size).raw}|${x.support}`).join('\n');
    table.dataset.yx86Busy='1';
    try{
      if(table.dataset.yx86Signature!==signature){
        mapped.sort((a,b)=>cmp(a,b)||a.idx-b.idx).forEach(x=>tbody.appendChild(x.row));
        table.dataset.yx86Signature=signature;
      }
      Array.from(tbody.rows).map((row,idx)=>readRowMeta(table,row,idx)).filter(Boolean).forEach(decorate);
    }finally{ table.dataset.yx86Busy='0'; }
  }
  function run(){
    try{ document.documentElement.dataset.yxFix86=VERSION; }catch(_e){}
    document.querySelectorAll('table.yx63-summary-table,table.yx66-customer-table,.customer-table-wrap table').forEach(sortAndDecorateTable);
  }
  function safeRunSoon(){ clearTimeout(window.__yx86Timer); window.__yx86Timer=setTimeout(run,80); }
  function wrapAfter(name){
    const fn=window[name]; if(typeof fn!=='function' || fn.__yx86Wrapped) return;
    const wrapped=function(){
      const ret=fn.apply(this,arguments);
      try{ Promise.resolve(ret).finally(safeRunSoon); }catch(_e){ safeRunSoon(); }
      return ret;
    };
    wrapped.__yx86Wrapped=true; wrapped.__yx86Previous=fn; window[name]=wrapped;
  }
  function install(){
    run();
    ['loadCustomerBlocks','renderCustomers','selectCustomerForModule','loadInlineList','renderSourceList','confirmSubmit'].forEach(wrapAfter);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true}); else install();
  window.addEventListener('pageshow',safeRunSoon);
  [150,500,1200,2500].forEach(ms=>setTimeout(install,ms));
  window.yx86ApplyMonthTables=run;
})();
/* ==== FIX86: stack-safe month-first sort + pretty month display end ==== */


/* ==== FIX87: final health hardening + single submit master + safe month tables start ==== */
(function(){
  'use strict';
  const VERSION='FIX87_FINAL_HEALTH_HARDENING';
  if(window.__YX87_FINAL_HEALTH__) return;
  window.__YX87_FINAL_HEALTH__=true;
  const $=id=>document.getElementById(id);
  const clean=v=>String(v??'').trim();
  const esc=v=>String(v??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  const modKey=()=>document.querySelector('.module-screen')?.dataset.module || (typeof window.currentModule==='function'?window.currentModule():'');
  const toast=(msg,kind='ok')=>{ try{ (window.toast||window.showToast||function(m){console.log(m);})(msg,kind); }catch(_e){ try{console.log(msg);}catch(_e2){} } };
  const api=window.yxApi || window.requestJSON || (async function(url,opt={}){
    const res=await fetch(url,{credentials:'same-origin',cache:'no-store',...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}});
    const text=await res.text(); let data={};
    try{ data=text?JSON.parse(text):{}; }catch(_e){ data={success:false,error:text||'伺服器回應格式錯誤'}; }
    if(!res.ok || data.success===false){ const err=new Error(data.error||data.message||`請求失敗：${res.status}`); err.payload=data; throw err; }
    return data;
  });
  window.yxApi=api;

  function normX(v){ return clean(v).replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/[＋，,；;]/g,'+').replace(/\s+/g,''); }
  function monthSplit(left){
    const raw=normX(left); const m=raw.match(/^(\d{1,2})(?:月|月份)(.+)$/);
    if(m){ const month=Number(m[1]||0); if(month>=1 && month<=12 && m[2]) return {month,body:m[2]}; }
    return {month:0,body:raw};
  }
  function sizeInfo(value){
    const raw=normX(value).split('=')[0] || normX(value);
    const sp=monthSplit(raw); const nums=(sp.body.match(/\d+(?:\.\d+)?/g)||[]).map(Number);
    return {raw,hasMonth:sp.month>=1&&sp.month<=12,month:sp.month?sp.month:99,body:sp.body,length:nums[0]??999999,width:nums[1]??999999,height:nums[2]??999999};
  }
  function supportInfo(v){
    const parts=normX(v).split('+').filter(Boolean); let maxCase=0,totalCase=0;
    parts.forEach(seg=>{ const m=seg.match(/x\s*(\d+)$/i); const c=m?Number(m[1]||0):(/\d/.test(seg)?1:0); maxCase=Math.max(maxCase,c); totalCase+=c; });
    return {maxCase,totalCase,text:parts.join('+')};
  }
  function compareRowMeta(a,b){
    const sa=sizeInfo(a.size), sb=sizeInfo(b.size);
    if(sa.hasMonth || sb.hasMonth){
      if(sa.month!==sb.month) return sa.month-sb.month;
      if(sa.height!==sb.height) return sa.height-sb.height;
      if(sa.width!==sb.width) return sa.width-sb.width;
      if(sa.length!==sb.length) return sa.length-sb.length;
      const mat=(a.material||'').localeCompare(b.material||'','zh-Hant',{numeric:true}); if(mat) return mat;
    }else{
      const mat=(a.material||'').localeCompare(b.material||'','zh-Hant',{numeric:true}); if(mat) return mat;
      if(sa.height!==sb.height) return sa.height-sb.height;
      if(sa.width!==sb.width) return sa.width-sb.width;
      if(sa.length!==sb.length) return sa.length-sb.length;
    }
    const qa=supportInfo(a.support), qb=supportInfo(b.support);
    if(qa.maxCase!==qb.maxCase) return qb.maxCase-qa.maxCase;
    if(qa.totalCase!==qb.totalCase) return qb.totalCase-qa.totalCase;
    return qa.text.localeCompare(qb.text,'zh-Hant',{numeric:true});
  }
  function prettySize(size){
    const info=sizeInfo(size); const body=esc(String(info.body||size||'').replace(/x/gi,' × '));
    return info.hasMonth?`<span class="yx85-month-size" data-yx87-month="${info.month}"><span class="yx85-month-badge">${info.month}月</span><span class="yx85-size-body">${body}</span></span>`:`<span class="yx85-size-body">${body}</span>`;
  }
  function cellRaw(cell){ return clean(cell?.dataset?.yx87Raw || cell?.dataset?.yx86Raw || cell?.dataset?.yx85Raw || cell?.textContent || ''); }
  function headerIndex(table, keyword){ return Array.from(table.querySelectorAll('thead th')).findIndex(th=>clean(th.textContent).includes(keyword)); }
  function rowMeta(table,row,idx){
    let material='',size='',support='',sizeCell=null;
    if(table.classList.contains('yx63-summary-table')){
      sizeCell=row.querySelector('.yx63-size-cell') || row.cells[1]; material=cellRaw(row.querySelector('.yx63-material-cell')||row.cells[0]); size=cellRaw(sizeCell); support=cellRaw(row.querySelector('.yx63-support-cell')||row.cells[2]);
    }else if(table.classList.contains('yx66-customer-table')){
      sizeCell=row.querySelector('.yx66-size-cell') || row.cells[1]; material=cellRaw(row.querySelector('.yx66-material-cell')||row.cells[0]); size=cellRaw(sizeCell); support=cellRaw(row.querySelector('.yx66-support-cell')||row.cells[2]);
    }else{
      const si=headerIndex(table,'尺寸'); if(si<0) return null;
      const mi=headerIndex(table,'材質'), qi=headerIndex(table,'支數');
      sizeCell=row.cells[si]; size=cellRaw(sizeCell); material=mi>=0?cellRaw(row.cells[mi]):''; support=qi>=0?cellRaw(row.cells[qi]):'';
    }
    return {table,row,idx,material,size,support,sizeCell};
  }
  function decorate(meta){
    const cell=meta?.sizeCell; if(!cell) return;
    const info=sizeInfo(meta.size); if(!info.hasMonth) return;
    if(cell.dataset.yx87Raw===info.raw && cell.dataset.yx87Decorated==='1') return;
    cell.dataset.yx87Raw=info.raw; cell.dataset.yx87Decorated='1'; cell.innerHTML=prettySize(info.raw);
  }
  function applyMonthTables(){
    try{ document.documentElement.dataset.yxFix87=VERSION; }catch(_e){}
    document.querySelectorAll('table.yx63-summary-table, table.yx66-customer-table, .customer-table-wrap table').forEach(table=>{
      if(!table || table.dataset.yx87Busy==='1') return;
      const tbody=table.tBodies&&table.tBodies[0]; if(!tbody) return;
      const metas=Array.from(tbody.rows).map((r,i)=>rowMeta(table,r,i)).filter(Boolean);
      if(!metas.length) return;
      const hasMonth=metas.some(m=>sizeInfo(m.size).hasMonth);
      table.dataset.yx87Busy='1';
      try{
        if(hasMonth){
          const before=metas.map(m=>`${m.material}|${sizeInfo(m.size).raw}|${m.support}`).join('\n');
          if(table.dataset.yx87Signature!==before){
            metas.sort((a,b)=>compareRowMeta(a,b)||a.idx-b.idx).forEach(m=>tbody.appendChild(m.row));
            table.dataset.yx87Signature=before;
          }
        }
        Array.from(tbody.rows).map((r,i)=>rowMeta(table,r,i)).filter(Boolean).forEach(decorate);
      }finally{ table.dataset.yx87Busy='0'; }
    });
  }
  let tableTimer=null;
  function scheduleTables(delay=80){ clearTimeout(tableTimer); tableTimer=setTimeout(applyMonthTables,delay); }
  window.yx87ApplyMonthTables=applyMonthTables;
  window.yx86ApplyMonthTables=applyMonthTables;

  function sortKeyText(text){
    const raw=normX(text); const left=(raw.split('=')[0]||raw); const info=sizeInfo(left);
    return [info.month,info.height,info.width,info.length,raw];
  }
  function cmpText(a,b){
    const ka=sortKeyText(a), kb=sortKeyText(b);
    for(let i=0;i<4;i++){ if(ka[i]!==kb[i]) return ka[i]-kb[i]; }
    return String(ka[4]).localeCompare(String(kb[4]),'zh-Hant',{numeric:true});
  }
  function isProductLine(line){ return /=/.test(line) && /(?:\d{1,2}(?:月|月份))?[^=]*x[^=]*x[^=]*/i.test(normX(line)); }
  function sortTextarea(){
    const box=$('ocr-text'); if(!box) return;
    const lines=String(box.value||'').replace(/\r/g,'\n').split(/\n+/).map(s=>s.trim()).filter(Boolean);
    const product=[],other=[]; lines.forEach((line,idx)=>(isProductLine(line)?product:other).push({line,idx}));
    if(!product.length) return;
    product.sort((a,b)=>cmpText(a.line,b.line)||a.idx-b.idx);
    const next=other.map(x=>x.line).concat(product.map(x=>x.line)).join('\n');
    if(box.value!==next){ box.value=next; box.dispatchEvent(new Event('input',{bubbles:true})); }
  }
  function unwrapSubmit(fn){
    let cur=fn, depth=0; const seen=new Set();
    while(typeof cur==='function' && depth<12 && !seen.has(cur)){
      seen.add(cur); const next=cur.__yx87Base || cur.__yx86Previous || cur.__yx84Previous;
      if(!next || typeof next!=='function') break;
      cur=next; depth++;
    }
    return (typeof cur==='function')?cur:fn;
  }
  function refreshAfterSubmit(customer){
    const mod=modKey(); if(!customer || !['orders','master_order','inventory'].includes(mod)) return Promise.resolve();
    return (async()=>{
      try{ window.__YX81_CUSTOMERS__=null; window.__YX80_CUSTOMERS__=null; window.__YX_CUSTOMERS_CACHE__=null; }catch(_e){}
      try{ await (window.YX_MASTER?.loadCustomerBlocks ? window.YX_MASTER.loadCustomerBlocks(true) : window.loadCustomerBlocks?.(true)); }catch(_e){}
      try{ if(['orders','master_order'].includes(mod) && window.selectCustomerForModule) await window.selectCustomerForModule(customer); }catch(_e){}
      scheduleTables(50);
    })();
  }
  function installSubmitMaster(){
    const current=window.confirmSubmit;
    if(typeof current!=='function' || current.__yx87Final) return;
    const base=unwrapSubmit(current);
    const final=async function(){
      if(window.__YX87_SUBMIT_BUSY__) return false;
      const mod=modKey(); const customer=clean($('customer-name')?.value||'');
      if(['inventory','orders','master_order'].includes(mod)) sortTextarea();
      window.__YX87_SUBMIT_BUSY__=true;
      try{
        const result=await base.apply(this,arguments);
        if(result!==false) await refreshAfterSubmit(customer);
        return result;
      }finally{
        setTimeout(()=>{ window.__YX87_SUBMIT_BUSY__=false; },350);
      }
    };
    final.__yx87Final=true; final.__yx87Base=base;
    window.confirmSubmit=final;
    try{ if(window.YX_MASTER) window.YX_MASTER=Object.freeze({...window.YX_MASTER,version:VERSION,confirmSubmit:final}); }catch(_e){}
  }
  // GET API always bypasses browser cache; fixes stale customer/today/warehouse views after deploys and back navigation.
  const nativeFetch=window.fetch;
  if(nativeFetch && !nativeFetch.__yx87NoCache){
    const wrappedFetch=function(input,init={}){
      try{
        const url=typeof input==='string'?input:(input&&input.url)||'';
        const method=(init&&init.method)||(input&&input.method)||'GET';
        if(String(method).toUpperCase()==='GET' && /\/api\//.test(url)) init={cache:'no-store',...init};
      }catch(_e){}
      return nativeFetch.call(this,input,init);
    };
    wrappedFetch.__yx87NoCache=true; window.fetch=wrappedFetch;
  }
  window.addEventListener('error',ev=>{
    const msg=String(ev?.message||ev?.error?.message||'');
    if(/Maximum call stack|stack overflow|STATUS_STACK_OVERFLOW/i.test(msg)){
      ev.preventDefault?.(); toast('偵測到舊版畫面堆疊錯誤，已套用安全母版，請重新載入一次。','error');
    }
  });
  document.addEventListener('click',e=>{
    if(e.target?.closest?.('.customer-card,[data-customer],.yx66-customer-product-row,.yx63-size-cell')) scheduleTables(180);
  },true);
  function boot(){ installSubmitMaster(); scheduleTables(120); setTimeout(scheduleTables,700); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
  window.addEventListener('pageshow',()=>{ installSubmitMaster(); scheduleTables(120); });
  [500,1300,2800].forEach(ms=>setTimeout(()=>{ installSubmitMaster(); scheduleTables(0); },ms));
})();
/* ==== FIX87: final health hardening + single submit master + safe month tables end ==== */


/* ==== FIX88: final QC guard + no wrapper rewrap + stable table refresh start ==== */
(function(){
  'use strict';
  const VERSION='FIX88_FINAL_QC_STABLE_GUARD';
  if(window.__YX88_FINAL_QC_STABLE__) return;
  window.__YX88_FINAL_QC_STABLE__=true;
  const $=id=>document.getElementById(id);
  const clean=v=>String(v??'').trim();
  const toast=(msg,kind='ok')=>{ try{ (window.toast||window.showToast||function(m){console.log(m);})(msg,kind); }catch(_e){ try{console.log(msg);}catch(_e2){} } };
  const modKey=()=>document.querySelector('.module-screen')?.dataset.module || (typeof window.currentModule==='function'?window.currentModule():'');
  function markStable(fn){
    if(typeof fn!=='function') return fn;
    // 讓舊版 FIX84 / FIX86 / FIX65 / FIX70 的延遲 installer 看到後直接跳過，避免再次包覆 confirmSubmit。
    fn.__yx88Stable=true;
    fn.__yx87Final=true;
    fn.__yx86Wrapped=true;
    fn.__yx84Wrapped=true;
    fn.__yx70SubmitLock=true;
    fn.__yx65SingleSubmit=true;
    return fn;
  }
  function unwrap(fn){
    let cur=fn, depth=0; const seen=new Set();
    while(typeof cur==='function' && depth<30 && !seen.has(cur)){
      seen.add(cur);
      const next=cur.__yx88Base || cur.__yx87Base || cur.__yx86Previous || cur.__yx84Previous || cur.__yx70Original || cur.__yx65Original;
      if(!next || typeof next!=='function') break;
      cur=next; depth++;
    }
    return typeof cur==='function' ? cur : fn;
  }
  function sortTextareaIfNeeded(){
    try{
      const box=$('ocr-text');
      if(!box || !['inventory','orders','master_order'].includes(modKey())) return;
      if(typeof window.yx84ProductSortKey==='function'){
        const lines=String(box.value||'').replace(/\r/g,'\n').split(/\n+/).map(s=>s.trim()).filter(Boolean);
        const isProduct=line=>/=/.test(line)&&/[x×X✕＊*]/.test(line);
        const product=[], other=[];
        lines.forEach((line,idx)=>(isProduct(line)?product:other).push({line,idx}));
        if(!product.length) return;
        product.sort((a,b)=>{
          const ka=window.yx84ProductSortKey(a.line), kb=window.yx84ProductSortKey(b.line);
          for(let i=0;i<4;i++){ if(ka[i]!==kb[i]) return ka[i]-kb[i]; }
          return String(ka[4]||'').localeCompare(String(kb[4]||''),'zh-Hant',{numeric:true}) || a.idx-b.idx;
        });
        const next=other.map(x=>x.line).concat(product.map(x=>x.line)).join('\n');
        if(box.value!==next){ box.value=next; box.dispatchEvent(new Event('input',{bubbles:true})); }
      }
    }catch(_e){}
  }
  async function refreshSubmitted(customer){
    if(!customer || !['inventory','orders','master_order'].includes(modKey())) return;
    try{ window.__YX81_CUSTOMERS__=null; window.__YX80_CUSTOMERS__=null; window.__YX_CUSTOMERS_CACHE__=null; }catch(_e){}
    try{ await (window.YX_MASTER?.loadCustomerBlocks ? window.YX_MASTER.loadCustomerBlocks(true) : window.loadCustomerBlocks?.(true)); }catch(_e){}
    try{ if(['orders','master_order'].includes(modKey()) && window.selectCustomerForModule) await window.selectCustomerForModule(customer); }catch(_e){}
    try{ (window.yx87ApplyMonthTables||window.yx86ApplyMonthTables||function(){})(); }catch(_e){}
  }
  function installSubmit(){
    const current=window.confirmSubmit;
    if(typeof current!=='function') return;
    if(current.__yx88Stable){ markStable(current); return; }
    const base=unwrap(current);
    const final=async function(){
      if(window.__YX88_SUBMIT_BUSY__){ toast('上一筆還在送出，請稍等','warn'); return false; }
      const customer=clean($('customer-name')?.value||'');
      sortTextareaIfNeeded();
      window.__YX88_SUBMIT_BUSY__=true;
      try{
        const result=await base.apply(this,arguments);
        if(result!==false) await refreshSubmitted(customer);
        return result;
      }finally{
        setTimeout(()=>{ window.__YX88_SUBMIT_BUSY__=false; },450);
      }
    };
    final.__yx88Base=base;
    markStable(final);
    window.confirmSubmit=final;
    try{ if(window.YX_MASTER) window.YX_MASTER=Object.freeze({...window.YX_MASTER,version:VERSION,confirmSubmit:final}); }catch(_e){}
  }
  function hideLegacyWarehouseControls(){
    try{
      ['warehouse-item-select','warehouse-add-qty','warehouse-recent-slots','yx80-warehouse-batch-panel','yx81-warehouse-batch-panel'].forEach(id=>{ const el=$(id); if(el) el.classList.add('yx88-hidden-legacy'); });
      document.querySelectorAll('#warehouse-modal [onclick*="addSelectedItemToCell"],#warehouse-modal [onclick*="saveWarehouseCell"]').forEach(el=>{ el.classList.add('yx88-hidden-legacy'); el.style.display='none'; });
    }catch(_e){}
  }
  function ensureApiNoCache(){
    const native=window.fetch;
    if(!native || native.__yx88NoCache) return;
    const wrapped=function(input,init={}){
      try{
        const url=typeof input==='string'?input:(input&&input.url)||'';
        const method=(init&&init.method)||(input&&input.method)||'GET';
        if(String(method).toUpperCase()==='GET' && /\/api\//.test(url)) init={cache:'no-store',...init};
      }catch(_e){}
      return native.call(this,input,init);
    };
    wrapped.__yx88NoCache=true;
    window.fetch=wrapped;
  }
  let bootTimer=null;
  function boot(){
    clearTimeout(bootTimer);
    bootTimer=setTimeout(()=>{
      try{ document.documentElement.dataset.yxFix88=VERSION; }catch(_e){}
      ensureApiNoCache();
      installSubmit();
      hideLegacyWarehouseControls();
      try{ (window.yx87ApplyMonthTables||window.yx86ApplyMonthTables||function(){})(); }catch(_e){}
    },40);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
  window.addEventListener('pageshow',boot);
  [300,900,1600,3200].forEach(ms=>setTimeout(boot,ms));
})();
/* ==== FIX88: final QC guard + no wrapper rewrap + stable table refresh end ==== */

/* ==== FIX90: ship preview SQL/source stable master start ==== */
(function(){
  'use strict';
  const VERSION='FIX90_SHIP_PREVIEW_STABLE';
  if(window.__YX89_SOURCE_WAREHOUSE_BATCH_STABLE__) return;
  window.__YX89_SOURCE_WAREHOUSE_BATCH_STABLE__=true;
  const $=id=>document.getElementById(id);
  const clean=v=>String(v??'').trim();
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const toast=(msg,kind='ok')=>{ try{ (window.toast||window.showToast||function(m){console.log(m);})(msg,kind); }catch(_e){ try{console.log(msg);}catch(_e2){} } };
  const api=window.yxApi || window.requestJSON || (async function(url,opt={}){
    const res=await fetch(url,{credentials:'same-origin',...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}});
    const text=await res.text(); let data={};
    try{ data=text?JSON.parse(text):{}; }catch(_e){ data={success:false,error:text||'伺服器回應格式錯誤'}; }
    if(!res.ok || data.success===false){ const e=new Error(data.error||data.message||`請求失敗：${res.status}`); e.payload=data; throw e; }
    return data;
  });
  window.yxApi=api;
  const modKey=()=>document.querySelector('.module-screen')?.dataset.module || (typeof window.currentModule==='function'?window.currentModule():'');
  function reqKey(prefix){ return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,10)}`; }
  function normX(v){ return clean(v).replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/[＋，,；;]/g,'+').replace(/件|片/g,'').replace(/\s+/g,''); }
  function sizeKey(text){ return normX(String(text||'').split('=')[0] || text).toLowerCase(); }
  function lineKey(text){ return normX(text).toLowerCase(); }
  function sourcePref(src){
    const s=clean(src).toLowerCase();
    if(['總單','master','master_order','master_orders'].includes(s)) return 'master_orders';
    if(['訂單','order','orders'].includes(s)) return 'orders';
    if(['庫存','stock','inventory'].includes(s)) return 'inventory';
    return '';
  }
  function sourceLabel(src){ const p=sourcePref(src)||src; return {master_orders:'總單',orders:'訂單',inventory:'庫存'}[p] || clean(src) || ''; }
  function qtyFromProduct(text){
    const raw=normX(text); const right=raw.includes('=')?raw.split('=').slice(1).join('='):'';
    if(!right) return 1;
    const parts=right.split('+').map(clean).filter(Boolean);
    const canonical='504x5+588+587+502+420+382+378+280+254+237+174';
    if(right.toLowerCase()===canonical) return 10;
    if(parts.length>=10 && parts.filter(p=>/x\d+$/i.test(p)).length===1) return parts.filter(p=>!(/x\d+$/i.test(p)) && /\d/.test(p)).length || 1;
    let total=0;
    parts.forEach(p=>{ const m=p.match(/x\s*(\d+)$/i); if(m) total+=Number(m[1])||0; else if(/\d/.test(p)) total+=1; });
    return total || 1;
  }
  function getShipMeta(line){
    const k1=lineKey(line), k2=sizeKey(line);
    return (window.__YX83_SHIP_LINE_META__||{})[k1] || (window.__YX83_SHIP_LINE_META__||{})[k2] || (window.__YX82_SHIP_LINE_META__||{})[k1] || (window.__YX82_SHIP_LINE_META__||{})[k2] || {};
  }
  function getTextLines(){ return String($('ocr-text')?.value||'').replace(/\r/g,'\n').split(/\n+/).map(clean).filter(Boolean); }
  function parseShipItems89(){
    const out=[]; let lastDims=['','',''];
    getTextLines().forEach(line=>{
      let raw=normX(line); if(!raw) return;
      const meta=getShipMeta(line);
      let product_text=raw;
      if(raw.includes('=')){
        let [left,right]=raw.split('=');
        let dims=left.split('x').filter(x=>x!=='');
        if(dims.length>=3) dims=dims.slice(0,3).map((x,i)=>/^[_-]+$/.test(x)?lastDims[i]:x);
        else if(dims.length===2 && lastDims[2]) dims=[dims[0], /^[_-]+$/.test(dims[1])?lastDims[1]:dims[1], lastDims[2]];
        else if(dims.length===1 && lastDims[1] && lastDims[2]) dims=[dims[0], lastDims[1], lastDims[2]];
        if(dims.length>=3 && dims.every(Boolean)){ lastDims=dims.slice(0,3); product_text=`${lastDims.join('x')}=${right||'1'}`; }
      }else{
        const dims=raw.split('x').filter(Boolean); if(dims.length>=3) lastDims=dims.slice(0,3);
      }
      if(!product_text || product_text.split('x').length<3) return;
      const pref=sourcePref(meta.source_preference || meta.source || '');
      const qty=raw.includes('=') ? qtyFromProduct(product_text) : (Number(meta.qty||0)>0 ? Number(meta.qty) : 1);
      out.push({
        product_text,
        product_code: meta.material || '',
        material: meta.material || '',
        qty,
        source_preference: pref,
        source_customer_name: pref==='inventory' ? '' : (meta.customer || ''),
        borrow_from_customer_name: '',
      });
    });
    const merged=new Map();
    out.forEach(it=>{
      const key=[sizeKey(it.product_text),it.material||'',it.source_preference||'',it.source_customer_name||''].join('__');
      const prev=merged.get(key);
      if(prev) prev.qty+=Number(it.qty||0);
      else merged.set(key,{...it,qty:Number(it.qty||1)||1});
    });
    return Array.from(merged.values());
  }
  async function targetHasEnough89(customer,item){
    try{
      const d=await api(`/api/customer-items?name=${encodeURIComponent(customer)}&ts=${Date.now()}`,{method:'GET'});
      const pref=sourcePref(item.source_preference); let total=0; const key=sizeKey(item.product_text);
      (d.items||[]).forEach(it=>{ if(sizeKey(it.product_text||'')===key && (!pref || sourcePref(it.source)===pref)) total+=Number(it.qty||0); });
      return total>=Number(item.qty||0) && total>0;
    }catch(_e){ return false; }
  }
  async function borrowIssues89(customer,items){
    const out=[];
    for(const it of items||[]){
      const pref=sourcePref(it.source_preference); const origin=clean(it.source_customer_name||'');
      if(!origin || origin===customer || pref==='inventory') continue;
      if(!(await targetHasEnough89(customer,it))) out.push({origin,item:it});
    }
    return out;
  }
  function confirmBorrow89(issues,customer){
    return new Promise(resolve=>{
      let panel=$('yx89-borrow-confirm-panel');
      if(!panel){ panel=document.createElement('div'); panel.id='yx89-borrow-confirm-panel'; panel.className='modal'; document.body.appendChild(panel); }
      panel.innerHTML=`<div class="modal-card glass yx80-borrow-card"><div class="modal-head"><div class="section-title">確認借貨出貨</div><button type="button" class="icon-btn" id="yx89-borrow-close">✕</button></div>${issues.map(x=>`<div class="deduct-card"><strong>該客戶「${esc(customer)}」沒有這筆商品</strong><div class="small-note">是否向 ${esc(x.origin)} 借 ${esc(x.item.product_text||'')} = ${Number(x.item.qty||0)} 件</div></div>`).join('')}<div class="btn-row"><button type="button" class="ghost-btn" id="yx89-borrow-cancel">取消</button><button type="button" class="primary-btn" id="yx89-borrow-ok">確認借貨</button></div></div>`;
      panel.classList.remove('hidden');
      const done=v=>{ panel.classList.add('hidden'); resolve(v); };
      $('yx89-borrow-close').onclick=()=>done(false); $('yx89-borrow-cancel').onclick=()=>done(false); $('yx89-borrow-ok').onclick=()=>done(true);
    });
  }
  function applyBorrow89(items,issues){ const map=new Map(issues.map(x=>[sizeKey(x.item.product_text),x.origin])); return (items||[]).map(it=>map.has(sizeKey(it.product_text))?{...it,source_customer_name:map.get(sizeKey(it.product_text)),borrow_from_customer_name:map.get(sizeKey(it.product_text)),borrow_confirmed:true}:it); }
  function dimFactor(v,idx){ const n=Number(String(v||'').replace(/[^0-9.]/g,'')||0); if(!n) return 0; if(idx===0) return n>210?n/1000:n/100; if(idx===1) return n/10; return n>=100?n/100:n/10; }
  function volumeInfo(text){
    const raw=normX(text); const left=(raw.split('=')[0]||'').split('x'); const right=raw.includes('=')?raw.split('=').slice(1).join('='):'';
    let sum=0, expr=[];
    right.split('+').map(clean).filter(Boolean).forEach(seg=>{ const m=seg.match(/^(\d+(?:\.\d+)?)x(\d+)$/i); if(m){ sum+=Number(m[1])*Number(m[2]); expr.push(`${m[1]}×${m[2]}`); } else if(/^\d+(?:\.\d+)?$/.test(seg)){ sum+=Number(seg); expr.push(seg); } });
    if(!sum){ sum=qtyFromProduct(text); expr=[String(sum)]; }
    const a=dimFactor(left[0],0), b=dimFactor(left[1],1), c=dimFactor(left[2],2); const vol=sum*a*b*c;
    return {volume:vol, formula:`(${expr.join('+')||'0'}) × ${Number(a.toFixed(3))} × ${Number(b.toFixed(3))} × ${Number(c.toFixed(3))} = ${Number(vol.toFixed(3))}`};
  }
  function num(v){ const n=Number(v||0); return Number.isFinite(n)?n:0; }
  function beforeAfter(item){
    const b=item.deduct_before || {master:item.master_available,order:item.order_available,inventory:item.inventory_available};
    const a=item.deduct_after || item.remaining_after || {master:Math.max(0,num(b.master)-num(item.master_deduct)),order:Math.max(0,num(b.order)-num(item.order_deduct)),inventory:Math.max(0,num(b.inventory)-num(item.inventory_deduct))};
    return `<div class="yx82-before-after"><span>總單：${num(b.master)} → ${num(a.master)}</span><span>訂單：${num(b.order)} → ${num(a.order)}</span><span>庫存：${num(b.inventory)} → ${num(a.inventory)}</span></div>`;
  }
  function deductLabelFromPreview(it){
    const src=sourcePref(it.source_preference)||sourcePref(it.source_label);
    if(src) return `扣除${sourceLabel(src)}`;
    if(num(it.master_deduct)>0) return '扣除總單';
    if(num(it.order_deduct)>0) return '扣除訂單';
    if(num(it.inventory_deduct)>0) return '扣除庫存';
    return '尚未找到可扣來源';
  }
  function renderPreview89(preview,payload){
    const section=$('ship-preview-section'); if(section) section.style.display='';
    const panel=$('ship-preview-panel') || $('module-result'); if(!panel) return;
    panel.classList.remove('hidden'); panel.style.display='';
    const items=preview.items||[]; const totalVol=items.reduce((s,it)=>s+volumeInfo(it.product_text||'').volume,0);
    const rows=items.map(it=>{
      const vi=volumeInfo(it.product_text||'');
      const locs=(it.locations||[]).map(loc=>`<span class="ship-location-chip">${esc(loc.zone||'')}-${esc(loc.column_index||'')}-${String(loc.visual_slot||loc.slot_number||'').padStart(2,'0')}｜可出 ${num(loc.ship_qty||loc.qty)}</span>`).join('') || '<span class="small-note">倉庫圖尚未找到位置</span>';
      const shortage=(it.shortage_reasons||[]).length ? `<div class="error-card compact-danger">${esc((it.shortage_reasons||[]).join('、'))}</div>` : '';
      const borrow=(it.is_borrowed||it.borrow_from_customer_name) ? `<span class="ship-mini-chip">向 ${esc(it.source_customer_name||it.borrow_from_customer_name||'')} 借貨</span>` : '';
      return `<div class="ship-breakdown-item yx82-preview-item"><div class="yx82-preview-title"><strong>${esc(it.product_text||'')}</strong><span>本次 ${num(it.qty)} 件</span>${borrow}<span class="ship-mini-chip selected-source">${esc(deductLabelFromPreview(it))}</span></div><div class="yx82-formula">材積算式：${esc(vi.formula)}</div><div class="small-note">扣除前 → 扣除後</div>${beforeAfter(it)}${shortage}<div class="small-note">${esc(it.recommendation||'')}</div><div class="ship-breakdown-list">${locs}</div></div>`;
    }).join('');
    panel.innerHTML=`<div class="success-card yx82-ship-preview-head"><div class="section-title">出貨預覽</div><div class="small-note">顯示實際扣除來源、材積算式、倉庫位置；輸入重量後會自動計算總重。</div><div class="yx82-preview-summary"><div>本次件數：<b>${items.reduce((s,it)=>s+num(it.qty),0)}</b></div><div>材積合計：<b id="yx89-total-volume">${Number(totalVol.toFixed(3))}</b></div><label>重量<input id="yx89-weight-input" class="text-input yx82-weight-input" type="number" min="0" step="0.01" placeholder="輸入重量"></label><div>總重：<b id="yx89-total-weight">0</b></div></div></div>${rows}<div class="btn-row"><button type="button" class="ghost-btn" id="yx89-ship-cancel">取消</button><button type="button" class="primary-btn" id="yx89-ship-confirm">確認扣除</button></div>`;
    $('yx89-weight-input')?.addEventListener('input',()=>{ const w=num($('yx89-weight-input')?.value); const out=$('yx89-total-weight'); if(out) out.textContent=Number((totalVol*w).toFixed(3)); });
    $('yx89-ship-cancel').onclick=()=>panel.classList.add('hidden');
    $('yx89-ship-confirm').onclick=async function(){
      const btn=this; if(btn.dataset.busy==='1') return; btn.dataset.busy='1'; btn.disabled=true; btn.textContent='扣除中…';
      try{
        const result=await api('/api/ship',{method:'POST',body:JSON.stringify({...payload,allow_inventory_fallback:true,preview_confirmed:true,request_key:reqKey('ship89_confirm')})});
        const done=(result.breakdown||[]).map(row=>{ const label=num(row.master_deduct)>0?'扣除總單':(num(row.order_deduct)>0?'扣除訂單':(num(row.inventory_deduct)>0?'扣除庫存':'未扣除')); return `<div class="deduct-card yx82-done-card"><strong>${esc(row.product_text||'')}</strong>｜本次出貨 ${num(row.qty)} 件｜<b>${label}</b>${row.is_borrowed?`｜向 ${esc(row.source_customer_name||'')} 借貨`:''}<div class="small-note">實際扣除：總單 ${num(row.master_deduct)}｜訂單 ${num(row.order_deduct)}｜庫存 ${num(row.inventory_deduct)}｜${esc(row.note||'')}</div><div class="small-note">扣除前 → 扣除後</div>${beforeAfter({deduct_before:row.deduct_before||{master:row.master_available,order:row.order_available,inventory:row.inventory_available},deduct_after:row.remaining_after})}</div>`; }).join('');
        panel.innerHTML=`<div class="success-card"><div class="section-title">出貨完成</div><div class="small-note">已顯示實際扣除來源、扣除前數量與扣除後剩餘數量。</div></div>${done || '<div class="empty-state-card compact-empty">已完成扣除。</div>'}`;
        toast('出貨完成','ok');
        try{ await (window.YX_MASTER?.loadCustomerBlocks ? window.YX_MASTER.loadCustomerBlocks(true) : window.loadCustomerBlocks?.(true)); }catch(_e){}
      }catch(e){ toast(e.message||'出貨失敗','error'); btn.dataset.busy='0'; btn.disabled=false; btn.textContent='確認扣除'; }
    };
    try{ panel.scrollIntoView({behavior:'smooth',block:'start'}); }catch(_e){}
  }
  async function confirmSubmit89(){
    if(modKey()!=='ship'){
      const base=window.__YX89_NONSHIP_BASE__;
      if(typeof base==='function' && base!==confirmSubmit89) return base.apply(this,arguments);
      return false;
    }
    const btn=$('submit-btn'); if(!btn || btn.dataset.busy==='1') return false;
    const customer=clean($('customer-name')?.value||''); if(!customer){ toast('請先輸入客戶名稱','warn'); return false; }
    let items=parseShipItems89(); if(!items.length){ toast('沒有可送出的商品資料','warn'); return false; }
    const issues=await borrowIssues89(customer,items); if(issues.length){ const ok=await confirmBorrow89(issues,customer); if(!ok) return false; items=applyBorrow89(items,issues); }
    const payload={customer_name:customer,ocr_text:$('ocr-text')?.value||'',items};
    try{ btn.dataset.busy='1'; btn.disabled=true; btn.textContent='整理預覽中…'; const preview=await api('/api/ship-preview',{method:'POST',body:JSON.stringify(payload)}); renderPreview89(preview,payload); return true; }
    catch(e){ const panel=$('ship-preview-panel')||$('module-result'); if(panel){ panel.classList.remove('hidden'); panel.style.display=''; panel.innerHTML=`<div class="error-card">${esc(e.message||'出貨預覽失敗')}</div>`; } toast(e.message||'出貨預覽失敗','error'); return false; }
    finally{ btn.dataset.busy='0'; btn.disabled=false; btn.textContent='確認送出'; }
  }

  // ---------- 倉庫批量：穩定 key，不用 index，避免增加批量或重新載入後選到別筆 ----------
  function availableItems(){ return window.state?.warehouse?.availableItems || []; }
  function itemQty(it){ const n=Number(it?.unplaced_qty ?? it?.qty ?? it?.total_qty ?? 0); return Number.isFinite(n)&&n>0?Math.floor(n):0; }
  function itemKey(it){ return JSON.stringify([it?.source_summary||it?.source||'', it?.customer_name||'', it?.product_text||it?.product_size||'', it?.material||it?.product_code||'']); }
  function itemText(it){ return `${it?.customer_name?it.customer_name+'｜':''}${it?.material||it?.product_code||'未填材質'}｜${it?.product_text||it?.product_size||''}｜剩餘 ${itemQty(it)}`; }
  async function refreshAvail(){
    window.state=window.state||{}; window.state.warehouse=window.state.warehouse||{};
    try{ const d=await api('/api/warehouse/available-items?ts='+Date.now(),{method:'GET'}); window.state.warehouse.availableItems=Array.isArray(d.items)?d.items:[]; }catch(_e){ window.state.warehouse.availableItems=window.state.warehouse.availableItems||[]; }
  }
  function ensurePanels(){
    const modal=$('warehouse-modal'); if(!modal) return {};
    const card=modal.querySelector('.modal-card')||modal;
    let detail=$('yx89-warehouse-detail-panel') || $('yx82-warehouse-detail-panel') || $('yx83-warehouse-detail-panel');
    if(!detail){ detail=document.createElement('div'); detail.id='yx89-warehouse-detail-panel'; detail.className='yx82-warehouse-detail-panel'; const meta=$('warehouse-modal-meta'); (meta?.parentNode||card).insertBefore(detail, meta?.nextSibling||card.firstChild); }
    detail.id='yx89-warehouse-detail-panel';
    let panel=$('yx89-warehouse-batch-panel') || $('yx82-warehouse-batch-panel') || $('yx83-warehouse-batch-panel');
    if(!panel){ panel=document.createElement('div'); panel.id='yx89-warehouse-batch-panel'; panel.className='yx80-warehouse-batch-panel'; detail.insertAdjacentElement('afterend', panel); }
    panel.id='yx89-warehouse-batch-panel';
    return {detail,panel};
  }
  function renderDetails(){
    const {detail}=ensurePanels(); if(!detail) return;
    const items=Array.isArray(window.state?.currentCellItems)?window.state.currentCellItems:[];
    if(!items.length){ detail.innerHTML='<div class="empty-state-card compact-empty">此格目前沒有商品</div>'; return; }
    detail.innerHTML='<div class="section-title">格位詳細資料</div>'+items.map((it,idx)=>{ const label=clean(it.placement_label||it.layer_label||(['後排','中間','前排'][idx]||'')); return `<div class="deduct-card yx82-warehouse-detail-card"><strong>${esc(label||`第${idx+1}筆`)}</strong><div class="small-note">客戶：${esc(it.customer_name||'未指定客戶')}</div><div class="small-note">商品：${esc(it.product_text||'')}</div><div class="small-note">數量：${Number(it.qty||0)} 件</div></div>`; }).join('');
  }
  function snapshot(panel){ return Array.from(panel?.querySelectorAll?.('.yx89-batch-row')||[]).map(row=>({value:row.querySelector('select')?.value||'', qty:row.querySelector('input[type="number"]')?.value||'0'})); }
  async function refreshWarehouseBatch89(keep){
    await refreshAvail();
    const {panel}=ensurePanels(); if(!panel) return;
    renderDetails();
    const prev=keep || snapshot(panel); const rows=Math.max(3, Number(panel.dataset.rows||prev.length||3)); const opts=availableItems(); const optMap=new Map(opts.map(it=>[itemKey(it),it]));
    const rowHtml=i=>{ const label=i===0?'後排':i===1?'中間':i===2?'前排':`第${i+1}筆`; return `<div class="yx89-batch-row" data-batch-idx="${i}"><span class="yx80-batch-label">${label}</span><select class="text-input yx89-batch-select"><option value="">不加入</option>${opts.map(it=>`<option value="${esc(itemKey(it))}">${esc(itemText(it))}</option>`).join('')}</select><input class="text-input yx89-batch-qty" type="number" min="0" value="0"></div>`; };
    panel.innerHTML=`<label class="field-label">批量加入商品</label><div class="small-note">第一筆後排、第二筆中間、第三筆前排；不加入會顯示 0。按「批量加入格位」會直接儲存。</div><div id="yx89-batch-rows">${Array.from({length:rows},(_,i)=>rowHtml(i)).join('')}</div><div class="btn-row compact-row"><button type="button" class="ghost-btn small-btn" id="yx89-add-batch-row">增加批量</button><button type="button" class="primary-btn small-btn" id="yx89-add-batch-items">批量加入格位</button></div>`;
    panel.querySelectorAll('.yx89-batch-row').forEach((row,i)=>{ const st=prev[i]||{}; const sel=row.querySelector('select'); const qty=row.querySelector('input[type="number"]'); if(st.value && optMap.has(st.value)){ sel.value=st.value; qty.value=st.qty && st.qty!=='0' ? st.qty : String(itemQty(optMap.get(st.value))); } else { sel.value=''; qty.value='0'; } sel.addEventListener('change',()=>{ const it=optMap.get(sel.value); qty.value=it?String(itemQty(it)):'0'; }); });
  }
  async function saveWarehouseCell89(){
    const cell=window.state?.currentCell||{}; const zone=cell.zone; const col=Number(cell.column||cell.column_index||cell.col||0); const slot=Number(cell.slot_number||cell.num||cell.slot||0);
    if(!zone||!col||!slot) throw new Error('格位資料不完整，請重新點選格子');
    await api('/api/warehouse/cell',{method:'POST',body:JSON.stringify({zone,column_index:col,slot_type:'direct',slot_number:slot,items:window.state.currentCellItems||[],note:$('warehouse-note')?.value||''})});
    try{ window.closeWarehouseModal && window.closeWarehouseModal(); }catch(_e){}
    try{ await (window.renderWarehouse && window.renderWarehouse(true)); }catch(_e){ try{ await window.renderWarehouse(); }catch(_e2){} }
  }
  async function batchAddSave89(){
    const panel=$('yx89-warehouse-batch-panel'); if(!panel) return;
    const btn=$('yx89-add-batch-items'); if(btn?.dataset.busy==='1') return;
    const map=new Map(availableItems().map(it=>[itemKey(it),it]));
    window.state=window.state||{}; window.state.currentCellItems=Array.isArray(window.state.currentCellItems)?window.state.currentCellItems:[];
    let count=0;
    panel.querySelectorAll('.yx89-batch-row').forEach(row=>{ const idx=Number(row.dataset.batchIdx||0); const key=row.querySelector('select')?.value||''; const item=map.get(key); if(!item) return; let qty=parseInt(row.querySelector('input[type="number"]')?.value||'0',10); if(!Number.isFinite(qty)||qty<=0) return; qty=Math.min(qty,itemQty(item)); if(qty<=0) return; const label=idx===0?'後排':idx===1?'中間':idx===2?'前排':''; window.state.currentCellItems.push({...item,product_text:item.product_text||item.product_size||'',qty,customer_name:item.customer_name||'',material:item.material||item.product_code||'',placement_label:label,layer_label:label}); count++; });
    if(!count){ toast('請至少選擇一筆商品','warn'); return; }
    renderDetails();
    try{ if(btn){ btn.dataset.busy='1'; btn.disabled=true; btn.textContent='儲存中…'; } await saveWarehouseCell89(); toast(`已批量加入並儲存 ${count} 筆`,'ok'); }
    catch(e){ toast(e.message||'批量儲存失敗','error'); if(btn){ btn.dataset.busy='0'; btn.disabled=false; btn.textContent='批量加入格位'; } }
  }
  const prevOpen=window.openWarehouseModal;
  async function openWarehouseModal89(){ const r=prevOpen && prevOpen!==openWarehouseModal89 ? await prevOpen.apply(this,arguments) : undefined; setTimeout(()=>refreshWarehouseBatch89(),160); setTimeout(()=>refreshWarehouseBatch89(),520); return r; }
  window.addEventListener('click',async e=>{ const btn=e.target?.closest?.('#yx89-add-batch-row,#yx89-add-batch-items'); if(!btn) return; e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); if(btn.id==='yx89-add-batch-row'){ const panel=$('yx89-warehouse-batch-panel'); const snap=snapshot(panel); if(panel) panel.dataset.rows=String(Math.max(3,Number(panel.dataset.rows||snap.length||3))+1); await refreshWarehouseBatch89(snap.concat([{value:'',qty:'0'}])); return; } await batchAddSave89(); },true);
  function install(){
    document.documentElement.dataset.yxFix89=VERSION;
    if(!window.__YX89_NONSHIP_BASE__ && typeof window.confirmSubmit==='function' && window.confirmSubmit!==confirmSubmit89) window.__YX89_NONSHIP_BASE__=window.confirmSubmit;
    confirmSubmit89.__yx88Stable=true; confirmSubmit89.__yx87Final=true; confirmSubmit89.__yx86Wrapped=true; confirmSubmit89.__yx84Wrapped=true;
    window.confirmSubmit=confirmSubmit89;
    window.openWarehouseModal=Object.assign(openWarehouseModal89,{__yx89:true});
    window.refreshWarehouseBatchPanel=refreshWarehouseBatch89;
    window.saveWarehouseCell=saveWarehouseCell89;
    try{ if(window.YX_MASTER) window.YX_MASTER=Object.freeze({...window.YX_MASTER,version:VERSION,confirmSubmit:confirmSubmit89,openWarehouseModal:window.openWarehouseModal,refreshWarehouseBatchPanel:refreshWarehouseBatch89,saveWarehouseCell:saveWarehouseCell89}); }catch(_e){}
    if(modKey()==='warehouse') setTimeout(()=>refreshWarehouseBatch89(),200);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true}); else install();
  window.addEventListener('pageshow',install);
  [650,1800,3600].forEach(ms=>setTimeout(install,ms));
})();
/* ==== FIX90: ship preview SQL/source stable master end ==== */

/* ==== FIX91: warehouse batch single master + duplicate cleanup start ==== */
(function(){
  'use strict';
  const VERSION = 'FIX91_WAREHOUSE_BATCH_SINGLE_MASTER';
  if (window.__YX91_WAREHOUSE_SINGLE_MASTER__) return;
  window.__YX91_WAREHOUSE_SINGLE_MASTER__ = true;

  const $ = id => document.getElementById(id);
  const clean = v => String(v ?? '').trim();
  const esc = v => String(v ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const toast = (msg, kind='ok') => {
    try { (window.toast || window.showToast || function(m){ console.log(m); })(msg, kind); }
    catch(_e){ try { console.log(msg); } catch(_e2){} }
  };
  const api = window.yxApi || window.requestJSON || (async function(url,opt={}){
    const res = await fetch(url,{credentials:'same-origin',...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}});
    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch(_e){ data = {success:false,error:text||'伺服器回應格式錯誤'}; }
    if (!res.ok || data.success === false) {
      const e = new Error(data.error || data.message || `請求失敗：${res.status}`);
      e.payload = data;
      throw e;
    }
    return data;
  });
  window.yxApi = api;

  const legacyBatchSelectors = [
    '#yx80-warehouse-batch-panel', '#yx81-warehouse-batch-panel',
    '#yx82-warehouse-batch-panel', '#yx83-warehouse-batch-panel', '#yx89-warehouse-batch-panel'
  ].join(',');
  const legacyDetailSelectors = [
    '#yx82-warehouse-detail-panel', '#yx83-warehouse-detail-panel', '#yx89-warehouse-detail-panel'
  ].join(',');

  function getModal(){ return $('warehouse-modal'); }
  function getCard(){ const modal = getModal(); return modal?.querySelector?.('.modal-card') || modal; }
  function currentCell(){ return window.state?.currentCell || {}; }
  function readCellItems(zone, col, slot){
    try { return (typeof window.getCellItems === 'function' ? window.getCellItems(zone, col, slot) : []); }
    catch(_e){ return []; }
  }
  function itemQty(it){
    const n = Number(it?.unplaced_qty ?? it?.qty ?? it?.total_qty ?? 0);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }
  function itemKey(it){
    return JSON.stringify([
      it?.source_summary || it?.source || '',
      it?.customer_name || '',
      it?.product_text || it?.product_size || '',
      it?.material || it?.product_code || ''
    ]);
  }
  function itemText(it){
    return `${it?.customer_name ? it.customer_name + '｜' : ''}${it?.material || it?.product_code || '未填材質'}｜${it?.product_text || it?.product_size || ''}｜剩餘 ${itemQty(it)}`;
  }
  async function refreshAvailable(){
    window.state = window.state || {};
    window.state.warehouse = window.state.warehouse || {};
    try {
      const d = await api('/api/warehouse/available-items?ts=' + Date.now(), {method:'GET'});
      window.state.warehouse.availableItems = Array.isArray(d.items) ? d.items : [];
    } catch(_e) {
      window.state.warehouse.availableItems = Array.isArray(window.state.warehouse.availableItems) ? window.state.warehouse.availableItems : [];
    }
  }
  function availableItems(){ return Array.isArray(window.state?.warehouse?.availableItems) ? window.state.warehouse.availableItems : []; }

  function removeLegacyPanels(){
    const modal = getModal();
    if (!modal) return;
    modal.querySelectorAll(legacyBatchSelectors).forEach(el => el.remove());
    modal.querySelectorAll(legacyDetailSelectors).forEach(el => el.remove());
    modal.querySelectorAll('.yx80-warehouse-batch-panel,.yx82-warehouse-detail-panel').forEach(el => {
      if (el.id !== 'yx91-warehouse-batch-panel' && el.id !== 'yx91-warehouse-detail-panel') el.remove();
    });
    modal.querySelectorAll('[onclick*="addSelectedItemToCell"],[onclick*="saveWarehouseCell"]').forEach(el => {
      el.classList.add('yx91-hidden-legacy');
      el.style.display = 'none';
    });
  }

  function ensurePanels(){
    const modal = getModal();
    const card = getCard();
    if (!modal || !card) return {};
    removeLegacyPanels();
    let detail = $('yx91-warehouse-detail-panel');
    if (!detail) {
      detail = document.createElement('div');
      detail.id = 'yx91-warehouse-detail-panel';
      detail.className = 'yx82-warehouse-detail-panel yx91-warehouse-detail-panel';
      const meta = $('warehouse-modal-meta');
      (meta?.parentNode || card).insertBefore(detail, meta?.nextSibling || card.firstChild);
    }
    let panel = $('yx91-warehouse-batch-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'yx91-warehouse-batch-panel';
      panel.className = 'yx80-warehouse-batch-panel yx91-warehouse-batch-panel';
      const noteLabel = Array.from(card.querySelectorAll('label.field-label')).find(x => clean(x.textContent) === '格位備註');
      (noteLabel?.parentNode || card).insertBefore(panel, noteLabel || $('warehouse-note') || null);
    }
    return {detail, panel};
  }

  function renderDetails91(){
    const {detail} = ensurePanels();
    if (!detail) return;
    const items = Array.isArray(window.state?.currentCellItems) ? window.state.currentCellItems : [];
    if (!items.length) {
      detail.innerHTML = '<div class="empty-state-card compact-empty">此格目前沒有商品</div>';
      return;
    }
    detail.innerHTML = '<div class="section-title">格位詳細資料</div>' + items.map((it,idx) => {
      const label = clean(it.placement_label || it.layer_label || (['後排','中間','前排'][idx] || `第${idx+1}筆`));
      return `<div class="deduct-card yx82-warehouse-detail-card"><strong>${esc(label)}</strong><div class="small-note">客戶：${esc(it.customer_name || '未指定客戶')}</div><div class="small-note">商品：${esc(it.product_text || it.product_size || '')}</div><div class="small-note">數量：${Number(it.qty || 0)} 件</div></div>`;
    }).join('');
  }

  function snapshot91(panel){
    return Array.from(panel?.querySelectorAll?.('.yx91-batch-row') || []).map(row => ({
      value: row.querySelector('select')?.value || '',
      qty: row.querySelector('input[type="number"]')?.value || '0'
    }));
  }

  async function refreshWarehouseBatch91(keep){
    await refreshAvailable();
    const {panel} = ensurePanels();
    if (!panel) return;
    renderDetails91();
    const prev = keep || snapshot91(panel);
    const rows = Math.max(3, Number(panel.dataset.rows || prev.length || 3));
    const q = clean($('warehouse-item-search')?.value || '').toLowerCase();
    const opts = availableItems().filter(it => {
      const hay = `${it?.customer_name || ''} ${it?.material || it?.product_code || ''} ${it?.product_text || it?.product_size || ''}`.toLowerCase();
      return !q || hay.includes(q);
    });
    const optMap = new Map(opts.map(it => [itemKey(it), it]));
    const rowHtml = i => {
      const label = i === 0 ? '後排' : i === 1 ? '中間' : i === 2 ? '前排' : `第${i+1}筆`;
      return `<div class="yx80-batch-row yx91-batch-row" data-batch-idx="${i}"><span class="yx80-batch-label">${label}</span><select class="text-input yx91-batch-select"><option value="">不加入</option>${opts.map(it => `<option value="${esc(itemKey(it))}">${esc(itemText(it))}</option>`).join('')}</select><input class="text-input yx91-batch-qty" type="number" min="0" value="0"></div>`;
    };
    panel.innerHTML = `<label class="field-label">批量加入商品</label><div class="small-note">第一筆後排、第二筆中間、第三筆前排；第 4 筆後不特別顯示。按「批量加入格位」會直接儲存。</div><div id="yx91-batch-rows">${Array.from({length:rows},(_,i)=>rowHtml(i)).join('')}</div><div class="btn-row compact-row"><button type="button" class="ghost-btn small-btn" id="yx91-add-batch-row">增加批量</button><button type="button" class="primary-btn small-btn" id="yx91-add-batch-items">批量加入格位</button></div>`;
    panel.querySelectorAll('.yx91-batch-row').forEach((row,i) => {
      const st = prev[i] || {};
      const sel = row.querySelector('select');
      const qty = row.querySelector('input[type="number"]');
      if (st.value && optMap.has(st.value)) {
        sel.value = st.value;
        qty.value = st.qty && st.qty !== '0' ? st.qty : String(itemQty(optMap.get(st.value)));
      } else {
        sel.value = '';
        qty.value = '0';
      }
      sel.addEventListener('change', () => {
        const it = optMap.get(sel.value);
        qty.value = it ? String(itemQty(it)) : '0';
      });
    });
  }

  async function saveWarehouseCell91(){
    const cell = currentCell();
    const zone = cell.zone;
    const col = Number(cell.column_index || cell.column || cell.col || 0);
    const slot = Number(cell.slot_number || cell.num || cell.slot || 0);
    if (!zone || !col || !slot) throw new Error('格位資料不完整，請重新點選格子');
    await api('/api/warehouse/cell', {method:'POST', body:JSON.stringify({
      zone,
      column_index: col,
      slot_type: 'direct',
      slot_number: slot,
      items: Array.isArray(window.state?.currentCellItems) ? window.state.currentCellItems : [],
      note: $('warehouse-note')?.value || ''
    })});
    try { window.closeWarehouseModal && window.closeWarehouseModal(); } catch(_e) {}
    try { await (window.renderWarehouse && window.renderWarehouse(true)); }
    catch(_e){ try { await window.renderWarehouse(); } catch(_e2){} }
  }

  async function batchAddSave91(){
    const {panel} = ensurePanels();
    if (!panel) return;
    const btn = $('yx91-add-batch-items');
    if (btn?.dataset.busy === '1') return;
    const map = new Map(availableItems().map(it => [itemKey(it), it]));
    window.state = window.state || {};
    window.state.currentCellItems = Array.isArray(window.state.currentCellItems) ? window.state.currentCellItems : [];
    let count = 0;
    panel.querySelectorAll('.yx91-batch-row').forEach(row => {
      const idx = Number(row.dataset.batchIdx || 0);
      const key = row.querySelector('select')?.value || '';
      const item = map.get(key);
      if (!item) return;
      let qty = parseInt(row.querySelector('input[type="number"]')?.value || '0', 10);
      if (!Number.isFinite(qty) || qty <= 0) return;
      qty = Math.min(qty, itemQty(item));
      if (qty <= 0) return;
      const label = idx === 0 ? '後排' : idx === 1 ? '中間' : idx === 2 ? '前排' : '';
      window.state.currentCellItems.push({
        ...item,
        product_text: item.product_text || item.product_size || '',
        qty,
        customer_name: item.customer_name || '',
        material: item.material || item.product_code || '',
        placement_label: label,
        layer_label: label
      });
      count++;
    });
    if (!count) { toast('請至少選擇一筆商品', 'warn'); return; }
    renderDetails91();
    try {
      if (btn) { btn.dataset.busy='1'; btn.disabled=true; btn.textContent='儲存中…'; }
      await saveWarehouseCell91();
      toast(`已批量加入並儲存 ${count} 筆`, 'ok');
    } catch(e) {
      toast(e.message || '批量儲存失敗', 'error');
      if (btn) { btn.dataset.busy='0'; btn.disabled=false; btn.textContent='批量加入格位'; }
    }
  }

  async function openWarehouseModal91(zone, column, num){
    window.state = window.state || {};
    window.state.warehouse = window.state.warehouse || {cells:[], availableItems:[]};
    const col = Number(column || 0);
    const slot = Number(num || 0);
    window.state.currentCell = {zone, column: col, column_index: col, slot_type:'direct', slot_number: slot};
    window.state.currentCellItems = readCellItems(zone, col, slot);
    const modal = getModal();
    if (!modal) return;
    modal.classList.remove('hidden');
    const meta = $('warehouse-modal-meta');
    if (meta) meta.textContent = `${zone} 區 / 第 ${col} 欄 / 第 ${String(slot).padStart(2,'0')} 格`;
    const note = $('warehouse-note');
    if (note) {
      const found = (window.state.warehouse.cells || []).find(c => String(c.zone) === String(zone) && Number(c.column_index) === col && Number(c.slot_number) === slot);
      note.value = found?.note || '';
    }
    const search = $('warehouse-item-search');
    if (search) search.oninput = () => refreshWarehouseBatch91(snapshot91($('yx91-warehouse-batch-panel')));
    await refreshWarehouseBatch91();
    setTimeout(() => { removeLegacyPanels(); renderDetails91(); }, 120);
    setTimeout(() => { removeLegacyPanels(); }, 520);
  }

  function install91(){
    document.documentElement.dataset.yxFix91 = VERSION;
    removeLegacyPanels();
    window.renderWarehouseCellItems = renderDetails91;
    window.refreshWarehouseBatchPanel = refreshWarehouseBatch91;
    window.saveWarehouseCell = saveWarehouseCell91;
    window.openWarehouseModal = Object.assign(openWarehouseModal91, {__yx91:true});
    try {
      if (window.YX_MASTER) window.YX_MASTER = Object.freeze({
        ...window.YX_MASTER,
        version: VERSION,
        openWarehouseModal: window.openWarehouseModal,
        refreshWarehouseBatchPanel: refreshWarehouseBatch91,
        renderWarehouseCellItems: renderDetails91,
        saveWarehouseCell: saveWarehouseCell91
      });
    } catch(_e) {}
  }

  document.addEventListener('click', async e => {
    const btn = e.target?.closest?.('#yx91-add-batch-row,#yx91-add-batch-items');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    if (btn.id === 'yx91-add-batch-row') {
      const panel = $('yx91-warehouse-batch-panel');
      const snap = snapshot91(panel);
      if (panel) panel.dataset.rows = String(Math.max(3, Number(panel.dataset.rows || snap.length || 3)) + 1);
      await refreshWarehouseBatch91(snap.concat([{value:'', qty:'0'}]));
      return;
    }
    await batchAddSave91();
  }, true);

  const observer = new MutationObserver(() => {
    const modal = getModal();
    if (!modal || modal.classList.contains('hidden')) return;
    removeLegacyPanels();
  });
  function bootObserver(){ const modal = getModal(); if (modal) observer.observe(modal, {childList:true, subtree:true}); }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { install91(); bootObserver(); }, {once:true});
  else { install91(); bootObserver(); }
  window.addEventListener('pageshow', install91);
  [200, 700, 1500, 3200].forEach(ms => setTimeout(install91, ms));
})();
/* ==== FIX91: warehouse batch single master + duplicate cleanup end ==== */

/* ==== FIX92: warehouse drag move master start ==== */
(function(){
  'use strict';
  const VERSION = 'FIX92_WAREHOUSE_DRAG_FRONT_MASTER';
  if (window.__YX92_WAREHOUSE_DRAG_FRONT_MASTER__) return;
  window.__YX92_WAREHOUSE_DRAG_FRONT_MASTER__ = true;

  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const clean = v => String(v ?? '').trim();
  const api = window.yxApi || window.requestJSON || (async function(url,opt={}){
    const res = await fetch(url,{credentials:'same-origin',...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}});
    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch(_e){ data = {success:false,error:text||'伺服器回應格式錯誤'}; }
    if(!res.ok || data.success === false){ const e = new Error(data.error || data.message || `請求失敗：${res.status}`); e.payload=data; throw e; }
    return data;
  });
  window.yxApi = api;
  const toast = (msg, kind='ok') => { try { (window.toast || window.showToast || function(m){console.log(m);})(msg, kind); } catch(_e){} };

  function cellKey(zone, col, slot){
    if (typeof window.buildCellKey === 'function') return window.buildCellKey(zone, col, slot);
    return [String(zone || '').toUpperCase(), Number(col), 'direct', Number(slot)];
  }
  function parseItems(raw){ try { return Array.isArray(raw) ? raw : JSON.parse(raw || '[]'); } catch(_e){ return []; } }
  function cellItems(zone, col, slot){
    try { if (typeof window.getCellItems === 'function') return window.getCellItems(zone, col, slot) || []; } catch(_e){}
    const cells = window.state?.warehouse?.cells || [];
    const c = cells.find(x => String(x.zone) === String(zone) && Number(x.column_index) === Number(col) && Number(x.slot_number) === Number(slot));
    return parseItems(c?.items_json);
  }
  function normKey(key){
    if (!Array.isArray(key)) return null;
    if (key.length >= 4) return [String(key[0] || '').toUpperCase(), Number(key[1]), 'direct', Number(key[3])];
    return [String(key[0] || '').toUpperCase(), Number(key[1]), 'direct', Number(key[2])];
  }
  function sameCell(a,b){
    const x = normKey(a), y = normKey(b);
    return !!(x && y && x[0] === y[0] && x[1] === y[1] && x[3] === y[3]);
  }
  function qtyOf(it){ const n = Number(it?.qty ?? it?.unplaced_qty ?? it?.total_qty ?? 0); return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0; }
  function productOf(it){ return clean(it?.product_text || it?.product_size || it?.product || ''); }
  function customerOf(it){ return clean(it?.customer_name || ''); }
  function displayCustomer(it){ return customerOf(it) || '未指定客戶'; }
  function enrichDragPayload(parsed){
    const out = {...(parsed || {})};
    const from = normKey(out.fromKey || out.from_key);
    if (!from) return out;
    const items = cellItems(from[0], from[1], from[3]);
    const prod = clean(out.product_text || out.product || '');
    let matches = items.filter(it => !prod || productOf(it) === prod);
    if (out.customer_name) matches = matches.filter(it => customerOf(it) === clean(out.customer_name));
    if (matches.length === 1) {
      out.product_text = productOf(matches[0]);
      out.customer_name = customerOf(matches[0]);
      out.qty = Number(out.qty || matches[0].qty || 1);
    }
    return out;
  }

  async function moveWarehouseItem92(fromKey, toKey, productText, qty, customerName, placementLabel='前排'){
    const from = normKey(fromKey);
    const to = normKey(toKey);
    if (!from || !to) throw new Error('格位資料不完整');
    if (sameCell(from, to)) { toast('已在同一格，不需要搬移', 'warn'); return {success:true, noop:true}; }
    const body = {
      from_key: from,
      to_key: to,
      product_text: productText,
      qty: Number(qty || 1),
      customer_name: customerName || '',
      placement_label: placementLabel || '前排',
      layer_label: placementLabel || '前排'
    };
    const res = await api('/api/warehouse/move', {method:'POST', body:JSON.stringify(body)});
    const fromLabel = `${from[0]}-${from[1]}-${String(from[3]).padStart(2,'0')}`;
    const toLabel = `${to[0]}-${to[1]}-${String(to[3]).padStart(2,'0')}`;
    toast(`搬移完成：已放到最前排｜${fromLabel} → ${toLabel}`, 'ok');
    try { await (window.renderWarehouse && window.renderWarehouse(true)); } catch(_e){ try { await window.renderWarehouse(); } catch(_e2){} }
    setTimeout(() => { try { window.highlightWarehouseCell && window.highlightWarehouseCell(to[0], to[1], to[3]); } catch(_e){} enhanceWarehouseDrag92(); }, 120);
    return res;
  }

  function bindDrop(slot, zone, col, num){
    if (!slot || slot.dataset.yx92DropBound === '1') return;
    slot.dataset.yx92DropBound = '1';
    slot.addEventListener('dragover', ev => {
      ev.preventDefault();
      ev.dataTransfer.dropEffect = 'move';
      slot.classList.add('drag-over','yx92-drag-over');
    }, true);
    slot.addEventListener('dragleave', () => slot.classList.remove('drag-over','yx92-drag-over'), true);
    slot.addEventListener('drop', async ev => {
      const raw = ev.dataTransfer?.getData?.('text/plain') || '';
      if (!raw) return;
      let parsed = null;
      try { parsed = JSON.parse(raw); } catch(_e){ return; }
      if (parsed.kind !== 'warehouse-item') return;
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();
      slot.classList.remove('drag-over','yx92-drag-over');
      parsed = enrichDragPayload(parsed);
      const from = normKey(parsed.fromKey || parsed.from_key);
      const to = cellKey(zone, col, num);
      if (!from) return toast('來源格位不完整，請重新拖拉', 'error');
      if (sameCell(from, to)) return toast('已在同一格，不需要搬移', 'warn');
      const productText = clean(parsed.product_text || parsed.product || '');
      if (!productText) return toast('商品資料不完整，請重新拖拉', 'error');
      await moveWarehouseItem92(from, to, productText, Number(parsed.qty || 1), clean(parsed.customer_name || ''), '前排');
    }, true);
  }

  function makeDragRow(it, idx, zone, col, num){
    const qty = qtyOf(it);
    const product = productOf(it);
    const customer = displayCustomer(it);
    const row = document.createElement('div');
    row.className = 'yx92-drag-item';
    row.draggable = true;
    row.dataset.yx92Drag = '1';
    row.dataset.productText = product;
    row.dataset.customerName = customerOf(it);
    row.dataset.qty = String(qty);
    row.title = `${customer}｜${product}｜${qty}件｜拖拉可搬到其他格`;
    row.innerHTML = `<span class="yx92-drag-customer">${esc(customer)}</span><span class="yx92-drag-qty">${qty}件</span>`;
    row.addEventListener('dragstart', ev => {
      const payload = {
        kind: 'warehouse-item',
        fromKey: cellKey(zone, col, num),
        product_text: product,
        qty,
        customer_name: customerOf(it),
        placement_label: '前排',
        drag_index: idx
      };
      ev.dataTransfer.effectAllowed = 'move';
      ev.dataTransfer.setData('text/plain', JSON.stringify(payload));
      row.classList.add('yx92-dragging');
    });
    row.addEventListener('dragend', () => row.classList.remove('yx92-dragging'));
    return row;
  }

  function updateSlotSummary(slot, zone, col, num){
    const count = slot.querySelector('.slot-count');
    if (!count) return;
    const items = cellItems(zone, col, num).filter(it => qtyOf(it) > 0);
    const sig = JSON.stringify(items.map(it => [customerOf(it), productOf(it), qtyOf(it), clean(it.placement_label || it.layer_label || '')]));
    if (slot.dataset.yx92Sig === sig && count.querySelector('.yx92-drag-item')) return;
    slot.dataset.yx92Sig = sig;
    if (!items.length) {
      count.innerHTML = '<div class="slot-line empty">空格</div>';
      return;
    }
    count.innerHTML = '';
    const shown = items.slice(0, 4);
    shown.forEach((it, idx) => count.appendChild(makeDragRow(it, idx, zone, col, num)));
    if (items.length > shown.length) {
      const more = document.createElement('div');
      more.className = 'slot-line qty yx92-more';
      more.textContent = `另有 ${items.length - shown.length} 筆`;
      count.appendChild(more);
    }
  }

  function enhanceDetailCards92(){
    const panel = $('yx91-warehouse-detail-panel');
    const items = Array.isArray(window.state?.currentCellItems) ? window.state.currentCellItems : [];
    if (!panel || !items.length) return;
    const cell = window.state?.currentCell || {};
    const zone = cell.zone;
    const col = Number(cell.column_index || cell.column || cell.col || 0);
    const num = Number(cell.slot_number || cell.num || cell.slot || 0);
    panel.querySelectorAll('.yx82-warehouse-detail-card').forEach((card, idx) => {
      const it = items[idx];
      if (!it || card.dataset.yx92DetailDrag === '1') return;
      card.dataset.yx92DetailDrag = '1';
      card.draggable = true;
      card.classList.add('yx92-detail-drag-card');
      card.title = '拖拉這筆商品到其他格，會放在目標格最前排';
      card.addEventListener('dragstart', ev => {
        ev.dataTransfer.effectAllowed = 'move';
        ev.dataTransfer.setData('text/plain', JSON.stringify({
          kind:'warehouse-item',
          fromKey: cellKey(zone, col, num),
          product_text: productOf(it),
          qty: qtyOf(it),
          customer_name: customerOf(it),
          placement_label:'前排',
          drag_index: idx
        }));
        card.classList.add('yx92-dragging');
      });
      card.addEventListener('dragend', () => card.classList.remove('yx92-dragging'));
    });
  }

  function enhanceWarehouseDrag92(){
    if ((typeof window.currentModule === 'function' && window.currentModule() !== 'warehouse') && !document.querySelector('#zone-A-grid,#zone-B-grid')) return;
    document.querySelectorAll('.vertical-slot,.yx67-warehouse-slot').forEach(slot => {
      const zone = slot.dataset.zone;
      const col = Number(slot.dataset.column || slot.dataset.col || 0);
      const num = Number(slot.dataset.num || slot.dataset.slot || 0);
      if (!zone || !col || !num) return;
      bindDrop(slot, zone, col, num);
      updateSlotSummary(slot, zone, col, num);
    });
    enhanceDetailCards92();
  }

  function wrapRender(){
    if (window.renderWarehouse && !window.renderWarehouse.__yx92Wrapped) {
      const old = window.renderWarehouse;
      const wrapped = async function(){
        const r = await old.apply(this, arguments);
        setTimeout(enhanceWarehouseDrag92, 80);
        return r;
      };
      wrapped.__yx92Wrapped = true;
      window.renderWarehouse = wrapped;
    }
    if (window.renderWarehouseZones && !window.renderWarehouseZones.__yx92Wrapped) {
      const oldZones = window.renderWarehouseZones;
      const wrappedZones = function(){
        const r = oldZones.apply(this, arguments);
        setTimeout(enhanceWarehouseDrag92, 40);
        return r;
      };
      wrappedZones.__yx92Wrapped = true;
      window.renderWarehouseZones = wrappedZones;
    }
    if (window.renderWarehouseCellItems && !window.renderWarehouseCellItems.__yx92Wrapped) {
      const oldCellItems = window.renderWarehouseCellItems;
      const wrappedCellItems = function(){
        const r = oldCellItems.apply(this, arguments);
        setTimeout(enhanceDetailCards92, 40);
        return r;
      };
      wrappedCellItems.__yx92Wrapped = true;
      window.renderWarehouseCellItems = wrappedCellItems;
    }
  }

  function install92(){
    document.documentElement.dataset.yxFix92 = VERSION;
    wrapRender();
    window.moveWarehouseItem = moveWarehouseItem92;
    window.enhanceWarehouseDrag92 = enhanceWarehouseDrag92;
    try {
      if (window.YX_MASTER) window.YX_MASTER = Object.freeze({
        ...window.YX_MASTER,
        version: VERSION,
        moveWarehouseItem: moveWarehouseItem92,
        enhanceWarehouseDrag: enhanceWarehouseDrag92
      });
    } catch(_e){}
    setTimeout(enhanceWarehouseDrag92, 120);
  }

  const mo = new MutationObserver(() => {
    clearTimeout(window.__yx92EnhanceTimer);
    window.__yx92EnhanceTimer = setTimeout(enhanceWarehouseDrag92, 80);
  });
  function observe(){
    ['zone-A-grid','zone-B-grid','yx91-warehouse-detail-panel'].forEach(id => {
      const el = $(id);
      if (el && !el.dataset.yx92Observed) {
        el.dataset.yx92Observed = '1';
        mo.observe(el, {childList:true, subtree:true});
      }
    });
  }
  function boot(){ install92(); observe(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true}); else boot();
  window.addEventListener('pageshow', boot);
  [250, 800, 1600, 3400].forEach(ms => setTimeout(boot, ms));
})();
/* ==== FIX92: warehouse drag move master end ==== */


/* ==== FIX93: mobile customer layout + batch action sheet + today cards + unplaced count master start ==== */
(function(){
  'use strict';
  const VERSION = 'FIX93_MOBILE_BATCH_TODAY_UNPLACED_MASTER';
  if (window.__YX93_MASTER_INSTALLED__) return;
  window.__YX93_MASTER_INSTALLED__ = true;
  const $ = id => document.getElementById(id);
  const clean = v => String(v ?? '').trim();
  const esc = v => String(v ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const moduleKey = () => document.querySelector('.module-screen')?.dataset.module || '';
  const toast = (msg, kind='ok') => { try { (window.toast || window.showToast || alert)(msg, kind); } catch(_e) { console.log(msg); } };
  const api = window.yxApi || window.requestJSON || (async function(url,opt={}){
    const res = await fetch(url,{credentials:'same-origin',...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}});
    const text = await res.text(); let data={};
    try{ data=text?JSON.parse(text):{}; }catch(_e){ data={success:false,error:text||'伺服器回應格式錯誤'}; }
    if(!res.ok || data.success===false){ const e=new Error(data.error||data.message||`請求失敗：${res.status}`); e.payload=data; throw e; }
    return data;
  });
  window.yxApi = api;
  const sourceApi = source => source === 'master_order' ? 'master_orders' : source;
  const titleOf = source => source === 'inventory' ? '庫存' : source === 'orders' ? '訂單' : '總單';
  const materialList = ['SPF','HF','DF','RDT','SPY','SP','RP','TD','MKJ','LVL','尤加利'];

  function syncSelectedRowClasses(){
    document.querySelectorAll('.yx63-summary-row').forEach(row => {
      const checked = !!row.querySelector('.yx63-row-check')?.checked;
      row.classList.toggle('yx93-selected-row', checked);
    });
  }
  function toggleSummaryRow(row, force){
    const ch = row?.querySelector?.('.yx63-row-check');
    if (!ch) return;
    ch.checked = typeof force === 'boolean' ? force : !ch.checked;
    try { if (typeof window.setRowSelected === 'function') window.setRowSelected(row, ch.checked); } catch(_e) {}
    row.classList.toggle('yx93-selected-row', ch.checked);
    const source = row.dataset.source || ch.dataset.source || '';
    const btn = $(`yx63-${source}-selectall`);
    if (btn) {
      const n = document.querySelectorAll(`.yx63-row-check[data-source="${source}"]:checked`).length;
      btn.textContent = n ? `已選 ${n} 筆` : '全選目前清單';
    }
  }
  function selectedItems(source){
    return Array.from(document.querySelectorAll(`.yx63-row-check[data-source="${source}"]:checked`))
      .map(ch => ({source: sourceApi(ch.dataset.source || source), id: Number(ch.dataset.id || 0)}))
      .filter(x => x.id > 0);
  }
  function refreshSource(source){
    try {
      if (source === 'inventory' && typeof window.loadInventory === 'function') return window.loadInventory();
      if (source === 'orders' && typeof window.loadOrdersList === 'function') return window.loadOrdersList();
      if (source === 'master_order' && typeof window.loadMasterList === 'function') return window.loadMasterList();
    } catch(_e) {}
  }
  function ensureBatchSheet(){
    let sheet = $('yx93-batch-sheet');
    if (!sheet) {
      sheet = document.createElement('div');
      sheet.id = 'yx93-batch-sheet';
      sheet.className = 'yx93-batch-sheet hidden';
      sheet.innerHTML = `<div class="yx93-batch-card"><div class="batch-title">批量操作</div><div class="batch-note" id="yx93-batch-note"></div><label class="field-label">套用材質</label><select id="yx93-batch-material" class="text-input"><option value="">選擇材質</option>${materialList.map(m=>`<option value="${esc(m)}">${esc(m)}</option>`).join('')}</select><div class="btn-row compact-row"><button type="button" class="ghost-btn" id="yx93-batch-cancel">取消</button><button type="button" class="ghost-btn" id="yx93-batch-apply">套用材質</button><button type="button" class="ghost-btn danger-btn" id="yx93-batch-delete">刪除選取</button></div></div>`;
      document.body.appendChild(sheet);
      sheet.addEventListener('click', e => { if (e.target === sheet || e.target.id === 'yx93-batch-cancel') closeBatchSheet(); });
      $('yx93-batch-apply')?.addEventListener('click', applyBatchMaterial);
      $('yx93-batch-delete')?.addEventListener('click', deleteBatchItems);
    }
    return sheet;
  }
  function closeBatchSheet(){ $('yx93-batch-sheet')?.classList.add('hidden'); }
  function openBatchSheet(source){
    const items = selectedItems(source);
    if (!items.length) { toast('請先選取要批量操作的商品', 'warn'); return; }
    const sheet = ensureBatchSheet();
    sheet.dataset.source = source;
    const note = $('yx93-batch-note');
    if (note) note.textContent = `已選 ${items.length} 筆${titleOf(source)}商品。`;
    const select = $('yx93-batch-material');
    if (select) select.value = '';
    sheet.classList.remove('hidden');
  }
  async function applyBatchMaterial(){
    const sheet = ensureBatchSheet();
    const source = sheet.dataset.source || '';
    const material = clean($('yx93-batch-material')?.value || '');
    const items = selectedItems(source);
    if (!material) return toast('請先選擇材質', 'warn');
    if (!items.length) return toast('沒有選取商品', 'warn');
    try {
      await api('/api/customer-items/batch-material', {method:'POST', body:JSON.stringify({material, items})});
      closeBatchSheet();
      toast(`已套用材質 ${material}`, 'ok');
      await refreshSource(source);
    } catch(e) { toast(e.message || '批量套用材質失敗', 'error'); }
  }
  async function deleteBatchItems(){
    const sheet = ensureBatchSheet();
    const source = sheet.dataset.source || '';
    const items = selectedItems(source);
    if (!items.length) return toast('沒有選取商品', 'warn');
    if (!confirm(`確定刪除已選取的 ${items.length} 筆商品？`)) return;
    try {
      await api('/api/customer-items/batch-delete', {method:'POST', body:JSON.stringify({items})});
      closeBatchSheet();
      toast(`已刪除 ${items.length} 筆`, 'ok');
      await refreshSource(source);
    } catch(e) { toast(e.message || '批量刪除失敗', 'error'); }
  }

  function installSummaryInteractions(){
    document.querySelectorAll('.yx63-summary-table').forEach(table => {
      if (table.dataset.yx93Bound === '1') return;
      table.dataset.yx93Bound = '1';
      let timer = null;
      let pressedRow = null;
      const start = e => {
        const row = e.target?.closest?.('.yx63-summary-row');
        if (!row) return;
        pressedRow = row;
        clearTimeout(timer);
        timer = setTimeout(() => {
          const source = row.dataset.source || row.querySelector('.yx63-row-check')?.dataset.source || '';
          toggleSummaryRow(row, true);
          openBatchSheet(source);
        }, 650);
      };
      const cancel = () => { clearTimeout(timer); pressedRow = null; };
      table.addEventListener('touchstart', start, {passive:true});
      table.addEventListener('mousedown', start);
      ['touchend','touchmove','mouseup','mouseleave'].forEach(ev => table.addEventListener(ev, cancel, {passive:true}));
    });
  }
  document.addEventListener('click', e => {
    const cell = e.target?.closest?.('.yx63-support-cell,.yx63-qty-cell');
    if (!cell) return;
    const row = cell.closest('.yx63-summary-row');
    if (!row) return;
    e.preventDefault();
    e.stopPropagation();
    toggleSummaryRow(row);
  }, true);

  function cleanToolbar93(){
    document.querySelectorAll('.yx63-toolbar').forEach(bar => {
      bar.querySelectorAll('[id$="-material"],[id$="-apply"],[id$="-delete"],[id$="-refresh"]').forEach(el => el.style.display = 'none');
    });
  }
  function renameWarehouseButtons(){
    const same = Array.from(document.querySelectorAll('button')).find(b => clean(b.textContent) === '同客戶一鍵高亮');
    if (same) same.textContent = '同客戶';
    const unplaced = Array.from(document.querySelectorAll('button')).find(b => clean(b.textContent) === '未入倉商品高亮');
    if (unplaced) unplaced.textContent = '未入倉';
  }

  async function getAvailableItems(){
    window.state = window.state || {};
    window.state.warehouse = window.state.warehouse || {};
    let items = Array.isArray(window.state.warehouse.availableItems) ? window.state.warehouse.availableItems : [];
    if (!items.length) {
      try {
        const d = await api('/api/warehouse/available-items?ts=' + Date.now(), {method:'GET'});
        items = Array.isArray(d.items) ? d.items : [];
        window.state.warehouse.availableItems = items;
      } catch(_e) {}
    }
    return items;
  }
  function unplacedTotal(items){ return (items || []).reduce((sum,it) => sum + (Number(it.unplaced_qty ?? it.qty ?? 0) || 0), 0); }
  async function updateUnplacedPill93(){
    const pill = $('warehouse-unplaced-pill');
    if (!pill) return;
    const items = await getAvailableItems();
    const total = unplacedTotal(items);
    pill.textContent = `未入倉：${total}件`;
    pill.title = `庫存、訂單、總單尚未加入倉庫圖的總件數：${total}件；點擊可查看全部明細`;
  }
  function renderUnplacedList93(items){
    const box = $('warehouse-unplaced-list-inline');
    if (!box) return;
    if (!items.length) {
      box.innerHTML = '<div class="empty-state-card compact-empty">目前沒有未入倉商品</div>';
      return;
    }
    box.innerHTML = items.map(it => {
      const sources = it.source_summary ? `｜來源：${esc(it.source_summary)}` : '';
      return `<div class="deduct-card"><strong>${esc(it.customer_name || '未指定客戶')}</strong><div class="small-note">${esc(it.product_text || it.product_size || '')}</div><div class="small-note">未入倉 ${Number(it.unplaced_qty ?? it.qty ?? 0)} 件${sources}</div></div>`;
    }).join('');
  }
  async function toggleUnplaced93(){
    const box = $('warehouse-unplaced-list-inline');
    if (!box) return;
    if (!box.classList.contains('hidden')) { box.classList.add('hidden'); return; }
    const items = await getAvailableItems();
    renderUnplacedList93(items);
    box.classList.remove('hidden');
    updateUnplacedPill93();
  }

  // 今日異動：取消上方按鈕，改成點卡片切換；沒選卡片就顯示全部。
  let todayFilter = '';
  function fmt24(v){
    const raw = clean(v);
    const m = raw.match(/(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::\d{2})?/);
    return m ? `${m[1]} ${m[2]}` : raw;
  }
  function showTodayPanels(filter){
    document.querySelectorAll('[data-today-panel]').forEach(panel => {
      const key = panel.dataset.todayPanel || '';
      panel.classList.toggle('yx93-hidden', !!filter && key !== filter);
    });
    document.querySelectorAll('.yx93-today-card').forEach(card => card.classList.toggle('active', (card.dataset.todayCard || '') === filter));
  }
  function makeLog(r){
    return `<div class="today-item deduct-card" data-log-id="${Number(r.id||0)}"><strong>${esc(r.action||'異動')}</strong><div class="small-note">${esc(fmt24(r.created_at))}｜${esc(r.username||'')}</div></div>`;
  }
  function fillTodayList(id, rows, empty){
    const el = $(id);
    if (!el) return;
    el.innerHTML = (rows || []).map(makeLog).join('') || `<div class="empty-state-card compact-empty">${esc(empty)}</div>`;
  }
  async function loadTodayChanges93(){
    try {
      const d = await api('/api/today-changes?ts=' + Date.now(), {method:'GET'});
      const s = d.summary || {};
      const cards = [
        ['inbound','進貨',Number(s.inbound_count||0),'筆'],
        ['outbound','出貨',Number(s.outbound_count||0),'筆'],
        ['orders','新增訂單',Number(s.new_order_count||0),'筆'],
        ['unplaced','未入倉',Number(s.unplaced_count||0),'件',`${Number(s.unplaced_row_count||0)}筆`],
      ];
      const summary = $('today-summary-cards');
      if (summary) {
        summary.innerHTML = cards.map(c => `<div class="yx93-today-card" data-today-card="${c[0]}"><div class="title">${esc(c[1])}</div><div class="sub">${c[2]}${esc(c[3])}</div>${c[4]?`<div class="small-note">${esc(c[4])}</div>`:''}</div>`).join('');
        summary.querySelectorAll('.yx93-today-card').forEach(card => card.addEventListener('click', () => {
          const key = card.dataset.todayCard || '';
          todayFilter = todayFilter === key ? '' : key;
          showTodayPanels(todayFilter);
        }));
      }
      fillTodayList('today-inbound-list', d.feed?.inbound, '今天沒有進貨');
      fillTodayList('today-outbound-list', d.feed?.outbound, '今天沒有出貨');
      fillTodayList('today-order-list', d.feed?.new_orders, '今天沒有新增訂單');
      const unplaced = $('today-unplaced-list');
      if (unplaced) {
        const arr = Array.isArray(d.unplaced_items) ? d.unplaced_items : [];
        unplaced.innerHTML = arr.length ? arr.map(it => `<div class="deduct-card"><strong>${esc(it.product_text||'')}</strong><div class="small-note">${esc(it.customer_name||'未指定客戶')}｜未入倉 ${Number(it.unplaced_qty||it.qty||0)} 件${it.source_summary?`｜來源：${esc(it.source_summary)}`:''}</div></div>`).join('') : '<div class="empty-state-card compact-empty">目前沒有未入倉商品</div>';
      }
      showTodayPanels(todayFilter);
      try{ await api('/api/today-changes/read',{method:'POST',body:JSON.stringify({})}); }catch(_e){}
      return d;
    } catch(e) { toast(e.message || '今日異動載入失敗', 'error'); }
  }

  function wrapCustomerSelect(){
    if (typeof window.selectCustomerForModule !== 'function' || window.selectCustomerForModule.__yx93Wrapped) return;
    const old = window.selectCustomerForModule;
    const wrapped = async function(name){
      const r = await old.apply(this, arguments);
      const mod = moduleKey();
      if (mod === 'orders' || mod === 'master_order') {
        setTimeout(() => {
          const target = $('selected-customer-items') || $('yx63-master_order-summary') || $('yx63-orders-summary');
          if (target) target.scrollIntoView({behavior:'smooth', block:'start'});
        }, 220);
      }
      return r;
    };
    wrapped.__yx93Wrapped = true;
    window.selectCustomerForModule = wrapped;
  }

  function decorateCustomerDetailPanel(){
    const panel = $('selected-customer-items');
    if (!panel || panel.dataset.yx93Decorated === '1') return;
    panel.dataset.yx93Decorated = '1';
    panel.addEventListener('click', e => {
      const td = e.target?.closest?.('td');
      if (!td) return;
      const row = td.closest('tr');
      if (!row || !panel.contains(row)) return;
      row.classList.toggle('yx93-selected-row');
    }, true);
  }

  function periodicCleanup(){
    document.documentElement.dataset.yxFix93 = VERSION;
    cleanToolbar93();
    installSummaryInteractions();
    syncSelectedRowClasses();
    renameWarehouseButtons();
    decorateCustomerDetailPanel();
    if (moduleKey() === 'warehouse') updateUnplacedPill93();
  }
  function install(){
    document.documentElement.dataset.yxFix93 = VERSION;
    wrapCustomerSelect();
    cleanToolbar93();
    installSummaryInteractions();
    renameWarehouseButtons();
    decorateCustomerDetailPanel();
    if (moduleKey() === 'warehouse') {
      window.toggleWarehouseUnplacedHighlight = toggleUnplaced93;
      updateUnplacedPill93();
      const oldRender = window.renderWarehouse;
      if (typeof oldRender === 'function' && !oldRender.__yx93Wrapped) {
        const wrapped = async function(){ const r = await oldRender.apply(this, arguments); setTimeout(updateUnplacedPill93, 120); setTimeout(renameWarehouseButtons, 120); return r; };
        wrapped.__yx93Wrapped = true;
        window.renderWarehouse = wrapped;
      }
    }
    if (location.pathname.includes('/today-changes')) {
      /* FIX108 disabled old today loader */
    }
    try { if (window.YX_MASTER) window.YX_MASTER = Object.freeze({...window.YX_MASTER, version:VERSION, loadTodayChanges:loadTodayChanges93, toggleWarehouseUnplacedHighlight:toggleUnplaced93}); } catch(_e){}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once:true}); else install();
  window.addEventListener('pageshow', install);
  [300,900,1800,3600].forEach(ms => setTimeout(periodicCleanup, ms));
})();
/* ==== FIX93: mobile customer layout + batch action sheet + today cards + unplaced count master end ==== */

/* ==== FIX94: card display + warehouse same-customer summary + today stable mobile start ==== */
(function(){
  'use strict';
  const VERSION = 'FIX94_CARD_WAREHOUSE_TODAY_STABLE';
  if (window.__YX94_CARD_WAREHOUSE_TODAY_STABLE__) return;
  window.__YX94_CARD_WAREHOUSE_TODAY_STABLE__ = true;
  const $ = id => document.getElementById(id);
  const clean = v => String(v ?? '').trim();
  const esc = v => String(v ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const moduleKey = () => document.querySelector('.module-screen')?.dataset.module || '';
  const api = window.yxApi || window.requestJSON || (async function(url,opt={}){
    const res = await fetch(url,{credentials:'same-origin',...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}});
    const text = await res.text(); let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch(_e){ data = {success:false,error:text||'伺服器回應格式錯誤'}; }
    if(!res.ok || data.success === false){ const e = new Error(data.error || data.message || `請求失敗：${res.status}`); e.payload=data; throw e; }
    return data;
  });
  window.yxApi = api;
  function normalizeProductLine(size, support){
    const s = clean(size).replace(/\s+/g,'').replace(/×/g,'x').replace(/^尺寸[:：]?/,'');
    const p = clean(support).replace(/\s+/g,'').replace(/×/g,'x').replace(/^支數\s*[xX]\s*件數[:：]?/,'');
    if(!s && !p) return '';
    return p ? `${s}=${p}` : s;
  }
  function decorateItemCards94(){
    document.querySelectorAll('.yx63-item-card .yx63-item-grid').forEach(grid => {
      if (grid.dataset.yx94Decorated === '1') return;
      const values = {material:'', size:'', support:'', qty:''};
      Array.from(grid.children).forEach(div => {
        const label = clean(div.querySelector('span')?.textContent || '');
        const val = clean(div.querySelector('b')?.textContent || div.textContent || '');
        if (label.includes('材質')) values.material = val.replace(/^材質[:：]?/,'');
        else if (label.includes('尺寸')) values.size = val.replace(/^尺寸[:：]?/,'');
        else if (label.includes('支數')) values.support = val.replace(/^支數\s*[xX]\s*件數[:：]?/,'');
        else if (label.includes('數量')) values.qty = val.replace(/^數量[:：]?/,'');
      });
      const product = normalizeProductLine(values.size, values.support);
      const qty = clean(values.qty || '0').replace(/件$/,'');
      grid.dataset.yx94Decorated = '1';
      grid.classList.add('yx94-item-grid');
      grid.innerHTML = `<div class="yx94-card-meta-row"><span class="yx94-material">${esc(values.material || '未填材質')}</span><span class="yx94-qty">${esc(qty || '0')}件</span></div><div class="yx94-product-formula">${esc(product || values.size || values.support || '')}</div>`;
    });
  }
  function rowQty(it){ const n = Number(it?.qty ?? it?.unplaced_qty ?? it?.total_qty ?? 0); return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0; }
  function productOf(it){ return clean(it?.product_text || it?.product_size || it?.product || ''); }
  function customerOf(it){ return clean(it?.customer_name || '未指定客戶') || '未指定客戶'; }
  function parseItems(raw){ try { return Array.isArray(raw) ? raw : JSON.parse(raw || '[]'); } catch(_e){ return []; } }
  function itemsForSlot(zone, col, num){
    try { if (typeof window.getCellItems === 'function') return window.getCellItems(zone, col, num) || []; } catch(_e){}
    const cells = window.state?.warehouse?.cells || [];
    const cell = cells.find(c => String(c.zone) === String(zone) && Number(c.column_index) === Number(col) && Number(c.slot_number) === Number(num));
    return parseItems(cell?.items_json).filter(it => rowQty(it) > 0);
  }
  function yx92Signature(items){ return JSON.stringify(items.map(it => [clean(it.customer_name||''), productOf(it), rowQty(it), clean(it.placement_label || it.layer_label || '')])); }
  function compactWarehouseSlot94(slot){
    const zone = slot.dataset.zone; const col = Number(slot.dataset.column || slot.dataset.col || 0); const num = Number(slot.dataset.num || slot.dataset.slot || 0);
    if(!zone || !col || !num) return;
    const count = slot.querySelector('.slot-count'); if(!count) return;
    const items = itemsForSlot(zone, col, num);
    const sig = yx92Signature(items);
    const alreadyCompact = slot.dataset.yx94Sig === sig && (count.querySelector('.yx94-cell-customer-line') || (!items.length && count.querySelector('.slot-line.empty')));
    if (alreadyCompact) { slot.dataset.yx92Sig = sig; return; }
    slot.dataset.yx92Sig = sig; slot.dataset.yx94Sig = sig;
    if(!items.length){ count.innerHTML = '<div class="slot-line empty">空格</div><span class="yx92-drag-item yx94-hidden-drag-anchor" aria-hidden="true"></span>'; return; }
    const by = new Map();
    items.forEach(it => { const c = customerOf(it); if(!by.has(c)) by.set(c, []); by.get(c).push(rowQty(it)); });
    const lines = Array.from(by.entries()).map(([customer, qtys]) => `<div class="yx94-cell-customer-line"><b>${esc(customer)}</b><span>${esc(qtys.filter(q=>q>0).join('+') || '0')}件</span></div>`).join('');
    const total = items.reduce((s,it)=>s+rowQty(it),0);
    count.innerHTML = `${lines}<div class="yx94-cell-total">合計 ${total}件</div><span class="yx92-drag-item yx94-hidden-drag-anchor" aria-hidden="true"></span>`;
  }
  function compactWarehouseAll94(){ document.querySelectorAll('.vertical-slot,.yx67-warehouse-slot').forEach(compactWarehouseSlot94); }
  function wrapWarehouseRender94(){
    ['renderWarehouse','renderWarehouseZones'].forEach(name => {
      const fn = window[name]; if(typeof fn !== 'function' || fn.__yx94Wrapped) return;
      const wrapped = function(){ const r = fn.apply(this, arguments); Promise.resolve(r).finally(() => setTimeout(compactWarehouseAll94, 180)); return r; };
      wrapped.__yx94Wrapped = true; window[name] = wrapped;
    });
  }
  function scrollToModuleSummary94(){ const mod = moduleKey(); if(mod !== 'orders' && mod !== 'master_order') return; const target = $(`yx63-${mod}-summary`) || $('selected-customer-items'); if(target) setTimeout(() => target.scrollIntoView({behavior:'smooth', block:'start'}), 180); }
  function installCustomerJump94(){
    if(document.body.dataset.yx94CustomerJump === '1') return; document.body.dataset.yx94CustomerJump = '1';
    document.addEventListener('click', e => { const card = e.target?.closest?.('#region-picker-section .customer-region-card,#region-picker-section .yx81-customer-card,[data-customer-name]'); if(!card || !document.querySelector('#region-picker-section')?.contains(card)) return; setTimeout(scrollToModuleSummary94, 260); setTimeout(scrollToModuleSummary94, 700); }, true);
  }
  let todayFilter = '';
  function fmt24(v){ const raw=clean(v); const m=raw.match(/(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::\d{2})?/); return m ? `${m[1]} ${m[2]}` : raw; }
  function showTodayPanels94(filter){ document.querySelectorAll('[data-today-panel]').forEach(panel => { const key = panel.dataset.todayPanel || ''; panel.classList.toggle('yx94-hidden', !!filter && key !== filter); }); document.querySelectorAll('.yx94-today-card').forEach(card => card.classList.toggle('active', (card.dataset.todayCard || '') === filter)); }
  function logCard94(r){ return `<div class="today-item deduct-card" data-log-id="${Number(r.id||0)}"><strong>${esc(r.action||'異動')}</strong><div class="small-note">${esc(fmt24(r.created_at))}｜${esc(r.username||'')}</div></div>`; }
  function fillList94(id, rows, empty){ const el=$(id); if(el) el.innerHTML=(rows||[]).map(logCard94).join('') || `<div class="empty-state-card compact-empty">${esc(empty)}</div>`; }
  async function loadTodayChanges94(){
    try{
      const d = await api('/api/today-changes?ts=' + Date.now(), {method:'GET'}); const s = d.summary || {};
      const cards = [['inbound','進貨',Number(s.inbound_count||0),'筆'],['outbound','出貨',Number(s.outbound_count||0),'筆'],['orders','新增訂單',Number(s.new_order_count||0),'筆'],['unplaced','未入倉',Number(s.unplaced_count||0),'件']];
      const summary = $('today-summary-cards');
      if(summary){ summary.innerHTML = cards.map(c => `<div class="yx94-today-card" data-today-card="${c[0]}"><div class="title">${esc(c[1])}</div><div class="sub">${c[2]}${esc(c[3])}</div></div>`).join(''); summary.querySelectorAll('.yx94-today-card').forEach(card => card.addEventListener('click', () => { const key = card.dataset.todayCard || ''; todayFilter = todayFilter === key ? '' : key; showTodayPanels94(todayFilter); })); }
      fillList94('today-inbound-list', d.feed?.inbound, '今天沒有進貨'); fillList94('today-outbound-list', d.feed?.outbound, '今天沒有出貨'); fillList94('today-order-list', d.feed?.new_orders, '今天沒有新增訂單');
      const unplaced=$('today-unplaced-list'); if(unplaced){ const arr=Array.isArray(d.unplaced_items)?d.unplaced_items:[]; unplaced.innerHTML = arr.length ? arr.map(it => `<div class="deduct-card"><strong>${esc(it.product_text||'')}</strong><div class="small-note">${esc(it.customer_name||'未指定客戶')}｜未入倉 ${Number(it.unplaced_qty||it.qty||0)} 件${it.source_summary?`｜來源：${esc(it.source_summary)}`:''}</div></div>`).join('') : '<div class="empty-state-card compact-empty">目前沒有未入倉商品</div>'; }
      showTodayPanels94(todayFilter); try{ await api('/api/today-changes/read',{method:'POST',body:JSON.stringify({})}); }catch(_e){} return d;
    }catch(e){ const summary=$('today-summary-cards'); if(summary) summary.innerHTML = `<div class="error-card">${esc(e.message||'今日異動載入失敗')}</div>`; }
  }
  function enforceTodaySummary94(){ const summary = $('today-summary-cards'); if(!summary || location.pathname.indexOf('/today-changes') < 0) return; summary.querySelectorAll('.small-note').forEach(n => n.remove()); summary.querySelectorAll('.card').forEach(c => c.classList.add('yx94-today-card')); }
  function install94(){
    document.documentElement.dataset.yxFix94 = VERSION; installCustomerJump94(); wrapWarehouseRender94(); setTimeout(decorateItemCards94, 120); setTimeout(compactWarehouseAll94, 320);
    if(location.pathname.includes('/today-changes')){ /* FIX108 disabled old today loader */ }
    try{ if(window.YX_MASTER) window.YX_MASTER = Object.freeze({...window.YX_MASTER, version:VERSION, loadTodayChanges:loadTodayChanges94}); }catch(_e){}
  }
  const mo = new MutationObserver(() => { clearTimeout(window.__yx94DomTimer); window.__yx94DomTimer = setTimeout(() => { decorateItemCards94(); enforceTodaySummary94(); if(moduleKey()==='warehouse') compactWarehouseAll94(); }, 90); });
  function observe94(){ ['inventory-list','orders-list','master-list','today-summary-cards','zone-A-grid','zone-B-grid'].forEach(id => { const el=$(id); if(el && !el.dataset.yx94Observed){ el.dataset.yx94Observed='1'; mo.observe(el,{childList:true,subtree:true}); } }); }
  function boot94(){ install94(); observe94(); }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot94, {once:true}); else boot94();
  window.addEventListener('pageshow', boot94);
  [300, 900, 1800, 3600, 7000].forEach(ms => setTimeout(() => { decorateItemCards94(); enforceTodaySummary94(); if(moduleKey()==='warehouse') compactWarehouseAll94(); }, ms));
})();
/* ==== FIX94: card display + warehouse same-customer summary + today stable mobile end ==== */

/* ==== FIX95: final master consolidation, warehouse drag/group, today, mobile, cache start ==== */
(function(){
  'use strict';
  const VERSION = 'FIX95_FINAL_MASTER_CONSOLIDATED';
  if (window.__YX95_FINAL_MASTER_CONSOLIDATED__) return;
  window.__YX95_FINAL_MASTER_CONSOLIDATED__ = true;
  const $ = id => document.getElementById(id);
  const clean = v => String(v ?? '').trim();
  const esc = v => String(v ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const modKey = () => document.querySelector('.module-screen')?.dataset.module || (typeof window.currentModule === 'function' ? window.currentModule() : '');
  const toast = (msg, kind='ok') => { try { (window.toast || window.showToast || function(m){ console.log(m); })(msg, kind); } catch(_e){} };
  const api = window.yxApi || window.requestJSON || (async function(url,opt={}){
    const res = await fetch(url,{credentials:'same-origin', cache:'no-store', ...opt, headers:{'Content-Type':'application/json', ...(opt.headers||{})}});
    const text = await res.text(); let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch(_e){ data = {success:false,error:text||'伺服器回應格式錯誤'}; }
    if(!res.ok || data.success === false){ const e = new Error(data.error || data.message || `請求失敗：${res.status}`); e.payload = data; throw e; }
    return data;
  });
  window.yxApi = api;

  function getState(){ window.state = window.state || {}; window.state.warehouse = window.state.warehouse || {cells:[],availableItems:[]}; return window.state; }
  function normX(v){ return clean(v).replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/[＋，,；;]/g,'+').replace(/\s+/g,''); }
  function parseItems(raw){ try { return Array.isArray(raw) ? raw : JSON.parse(raw || '[]'); } catch(_e){ return []; } }
  function qtyOf(it){ const n = Number(it?.qty ?? it?.unplaced_qty ?? it?.total_qty ?? 0); return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0; }
  function productOf(it){ return clean(it?.product_text || it?.product_size || it?.product || ''); }
  function customerOf(it){ return clean(it?.customer_name || '未指定客戶') || '未指定客戶'; }
  function materialOf(it){ return clean(it?.material || it?.product_code || '未填材質') || '未填材質'; }
  function cellKey(zone, col, slot){ return [String(zone || '').toUpperCase(), Number(col), 'direct', Number(slot)]; }
  function normKey(key){ if(!Array.isArray(key)) return null; return [String(key[0]||'').toUpperCase(), Number(key[1]), 'direct', Number(key.length >= 4 ? key[3] : key[2])]; }
  function sameCell(a,b){ const x=normKey(a), y=normKey(b); return !!(x&&y&&x[0]===y[0]&&x[1]===y[1]&&x[3]===y[3]); }
  function findCell(zone,col,slot){ const st=getState(); return (st.warehouse.cells || []).find(c => String(c.zone)===String(zone) && Number(c.column_index)===Number(col) && Number(c.slot_number)===Number(slot)); }
  function cellItems(zone,col,slot){ try { if(typeof window.getCellItems === 'function') return window.getCellItems(zone,col,slot) || []; } catch(_e){} return parseItems(findCell(zone,col,slot)?.items_json); }
  function setLocalCellItems(zone,col,slot,items){ const st=getState(); let c=findCell(zone,col,slot); if(!c){ c={zone, column_index:col, slot_type:'direct', slot_number:slot, items_json:'[]', note:''}; st.warehouse.cells = st.warehouse.cells || []; st.warehouse.cells.push(c); } c.items_json = JSON.stringify(items || []); }
  function saveCell(zone,col,slot,items,note=''){
    setLocalCellItems(zone,col,slot,items);
    return api('/api/warehouse/cell',{method:'POST', body:JSON.stringify({zone, column_index:Number(col), slot_type:'direct', slot_number:Number(slot), items, note})});
  }
  function signature(items){ return JSON.stringify((items||[]).map(it => [customerOf(it), productOf(it), qtyOf(it), clean(it.placement_label || it.layer_label || '')])); }

  function compactProductFormula(size,support){
    const a = normX(size).replace(/^尺寸[:：]?/,'');
    const b = normX(support).replace(/^支數\s*[xX]\s*件數[:：]?/,'');
    if(!a && !b) return '';
    return b ? `${a}=${b}` : a;
  }
  function decorateItemCards95(){
    document.querySelectorAll('.yx63-item-card .yx63-item-grid').forEach(grid => {
      const values = {material:'', size:'', support:'', qty:''};
      Array.from(grid.children || []).forEach(div => {
        const label = clean(div.querySelector('span')?.textContent || '');
        const val = clean(div.querySelector('b')?.textContent || div.textContent || '');
        if (label.includes('材質')) values.material = val.replace(/^材質[:：]?/,'');
        else if (label.includes('尺寸')) values.size = val.replace(/^尺寸[:：]?/,'');
        else if (label.includes('支數')) values.support = val.replace(/^支數\s*[xX]\s*件數[:：]?/,'');
        else if (label.includes('數量')) values.qty = val.replace(/^數量[:：]?/,'');
      });
      const product = compactProductFormula(values.size, values.support) || clean(grid.dataset.product || '');
      const qty = clean(values.qty || grid.dataset.qty || '0').replace(/件$/,'');
      const mat = clean(values.material || grid.dataset.material || '未填材質');
      if(!product && grid.classList.contains('yx95-item-grid')) return;
      grid.dataset.yx95Decorated = '1';
      grid.classList.add('yx94-item-grid','yx95-item-grid');
      grid.innerHTML = `<div class="yx95-card-row"><span class="yx95-product-formula">${esc(product)}</span><span class="yx95-material">${esc(mat)}</span><span class="yx95-qty">${esc(qty||'0')}件</span></div>`;
    });
  }

  function renderWarehouseCompact95(slot){
    const zone = slot.dataset.zone;
    const col = Number(slot.dataset.column || slot.dataset.col || 0);
    const num = Number(slot.dataset.num || slot.dataset.slot || 0);
    if(!zone || !col || !num) return;
    const count = slot.querySelector('.slot-count'); if(!count) return;
    const items = cellItems(zone,col,num).filter(it => qtyOf(it) > 0);
    const sig = signature(items);
    if(slot.dataset.yx95Sig === sig && count.querySelector('[data-yx95-drag-group],.slot-line.empty')) return;
    slot.dataset.yx92Sig = sig;
    slot.dataset.yx94Sig = sig;
    slot.dataset.yx95Sig = sig;
    if(!items.length){ count.innerHTML = '<div class="slot-line empty">空格</div>'; return; }
    const groups = new Map();
    items.forEach((it,idx) => { const c=customerOf(it); if(!groups.has(c)) groups.set(c, []); groups.get(c).push({...it, __idx:idx}); });
    count.innerHTML = Array.from(groups.entries()).map(([customer, arr]) => {
      const qtys = arr.map(qtyOf).filter(q => q > 0);
      const total = qtys.reduce((s,q)=>s+q,0);
      const payload = {kind:'warehouse-group', fromKey:cellKey(zone,col,num), customer_name:customer, item_indexes:arr.map(x=>x.__idx)};
      return `<div class="yx95-cell-customer-line" draggable="true" data-yx95-drag-group="${esc(JSON.stringify(payload))}" title="拖拉 ${esc(customer)} 到其他格，會放在目標格最前排"><b>${esc(customer)}</b><span>${esc(qtys.join('+') || String(total))}件</span></div>`;
    }).join('');
    bindGroupDrags(count);
  }
  function bindGroupDrags(root){
    (root || document).querySelectorAll('[data-yx95-drag-group]').forEach(el => {
      if(el.dataset.yx95DragBound === '1') return;
      el.dataset.yx95DragBound = '1';
      el.addEventListener('dragstart', ev => {
        try { ev.dataTransfer.effectAllowed='move'; ev.dataTransfer.setData('text/plain', el.dataset.yx95DragGroup || ''); el.classList.add('yx92-dragging'); } catch(_e){}
      });
      el.addEventListener('dragend', () => el.classList.remove('yx92-dragging'));
    });
  }
  function compactWarehouseAll95(){ if(modKey() !== 'warehouse' && !document.querySelector('#zone-A-grid,#zone-B-grid')) return; document.querySelectorAll('.vertical-slot,.yx67-warehouse-slot').forEach(renderWarehouseCompact95); bindDrop95(); }

  async function moveGroup95(payload, toKey){
    const from = normKey(payload.fromKey || payload.from_key);
    const to = normKey(toKey);
    if(!from || !to) throw new Error('格位資料不完整，請重新拖拉');
    if(sameCell(from,to)){ toast('已在同一格，不需要搬移','warn'); return; }
    const src = cellItems(from[0],from[1],from[3]);
    const dst = cellItems(to[0],to[1],to[3]);
    const indexes = new Set((payload.item_indexes || []).map(Number));
    let moved = [];
    const remain = [];
    src.forEach((it,idx) => {
      if(indexes.has(idx) || (payload.customer_name && customerOf(it) === clean(payload.customer_name))) moved.push({...it});
      else remain.push(it);
    });
    moved = moved.filter(it => qtyOf(it) > 0).map(it => ({...it, placement_label:'前排', layer_label:'前排'}));
    if(!moved.length) throw new Error('沒有可搬移的商品');
    const sourceNote = findCell(from[0],from[1],from[3])?.note || '';
    const targetNote = findCell(to[0],to[1],to[3])?.note || '';
    await saveCell(from[0],from[1],from[3], remain, sourceNote);
    await saveCell(to[0],to[1],to[3], moved.concat(dst), targetNote);
    toast(`搬移完成：${clean(payload.customer_name||'商品')} 已放到最前排`, 'ok');
    try { await (window.renderWarehouse && window.renderWarehouse(true)); } catch(_e){ try { await window.renderWarehouse(); } catch(_e2){} }
    setTimeout(compactWarehouseAll95, 160);
  }
  function bindDrop95(){
    document.querySelectorAll('.vertical-slot,.yx67-warehouse-slot').forEach(slot => {
      if(slot.dataset.yx95DropBound === '1') return;
      slot.dataset.yx95DropBound = '1';
      slot.addEventListener('dragover', ev => { try{ ev.preventDefault(); ev.dataTransfer.dropEffect='move'; slot.classList.add('yx92-drag-over'); }catch(_e){} }, true);
      slot.addEventListener('dragleave', () => slot.classList.remove('yx92-drag-over'), true);
      slot.addEventListener('drop', async ev => {
        const raw = ev.dataTransfer?.getData?.('text/plain') || '';
        if(!raw || raw.indexOf('warehouse-group') < 0) return;
        let payload = null; try { payload = JSON.parse(raw); } catch(_e){ return; }
        if(payload.kind !== 'warehouse-group') return;
        ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation(); slot.classList.remove('yx92-drag-over');
        const zone = slot.dataset.zone; const col = Number(slot.dataset.column || slot.dataset.col || 0); const num = Number(slot.dataset.num || slot.dataset.slot || 0);
        try { await moveGroup95(payload, cellKey(zone,col,num)); } catch(e){ toast(e.message || '拖拉搬移失敗', 'error'); }
      }, true);
    });
  }

  function removeLegacyWarehousePanels95(){
    const modal = $('warehouse-modal');
    if(!modal) return;
    modal.querySelectorAll('#yx80-warehouse-batch-panel,#yx81-warehouse-batch-panel,#yx82-warehouse-batch-panel,#yx83-warehouse-batch-panel,#yx89-warehouse-batch-panel,.yx80-warehouse-batch-panel:not(#yx91-warehouse-batch-panel),.yx82-warehouse-detail-panel:not(#yx91-warehouse-detail-panel)').forEach(el => el.remove());
    ['warehouse-item-select','warehouse-add-qty','warehouse-recent-slots'].forEach(id => { const el=$(id); if(el){ el.classList.add('yx95-hidden-legacy'); el.style.display='none'; } });
    modal.querySelectorAll('button').forEach(btn => {
      const txt = clean(btn.textContent);
      if(['加入格位','儲存格位'].includes(txt) || /saveWarehouseCell|addSelectedItemToCell/.test(btn.getAttribute('onclick')||'')){ btn.classList.add('yx95-hidden-legacy'); btn.style.display='none'; }
    });
    const panel = $('yx91-warehouse-batch-panel');
    if(panel){
      panel.querySelectorAll('.yx91-batch-row').forEach((row,idx) => {
        const sel=row.querySelector('select'); const qty=row.querySelector('input[type="number"]');
        if(sel && !sel.value && qty) qty.value='0';
        const label=row.querySelector('.yx80-batch-label'); if(label && idx<3) label.textContent=['後排','中間','前排'][idx];
      });
    }
  }
  function wrapWarehouseModal95(){
    const old = window.openWarehouseModal;
    if(typeof old === 'function' && !old.__yx95Wrapped){
      const wrapped = async function(){ const r = await old.apply(this, arguments); [60,180,520].forEach(ms => setTimeout(() => { removeLegacyWarehousePanels95(); compactWarehouseAll95(); }, ms)); return r; };
      Object.defineProperty(wrapped, '__yx95Wrapped', {value:true});
      window.openWarehouseModal = wrapped;
    }
  }

  function unplacedTotal(items){ return (items||[]).reduce((sum,it) => sum + (Number(it.unplaced_qty ?? it.qty ?? 0) || 0), 0); }
  async function getAvailableItems95(){
    try { const d = await api('/api/warehouse/available-items?ts=' + Date.now(), {method:'GET'}); const items = Array.isArray(d.items) ? d.items : []; getState().warehouse.availableItems = items; return items; }
    catch(_e){ return getState().warehouse.availableItems || []; }
  }
  async function updateUnplacedPill95(){ const pill=$('warehouse-unplaced-pill'); if(!pill) return; const total=unplacedTotal(await getAvailableItems95()); pill.textContent=`未入倉：${total}件`; pill.title=`庫存、訂單、總單尚未加入倉庫圖的總件數：${total}件`; }
  async function toggleUnplaced95(){
    const box=$('warehouse-unplaced-list-inline'); if(!box) return;
    if(!box.classList.contains('hidden')){ box.classList.add('hidden'); return; }
    const items=await getAvailableItems95();
    box.innerHTML = items.length ? items.map(it => `<div class="deduct-card"><strong>${esc(customerOf(it))}</strong><div class="small-note">${esc(productOf(it))}</div><div class="small-note">未入倉 ${Number(it.unplaced_qty ?? it.qty ?? 0)} 件${it.source_summary?`｜來源：${esc(it.source_summary)}`:''}</div></div>`).join('') : '<div class="empty-state-card compact-empty">目前沒有未入倉商品</div>';
    box.classList.remove('hidden'); updateUnplacedPill95();
  }
  window.toggleWarehouseUnplacedHighlight = toggleUnplaced95;

  function fmt24(v){ const raw=clean(v); const m=raw.match(/(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::\d{2})?/); return m ? `${m[1]} ${m[2]}` : raw; }
  let todayFilter = '';
  function showTodayPanels95(filter){ document.querySelectorAll('[data-today-panel]').forEach(panel => { const key=panel.dataset.todayPanel || ''; panel.classList.toggle('yx95-hidden', !!filter && key !== filter); }); document.querySelectorAll('.yx95-today-card').forEach(card => card.classList.toggle('active', (card.dataset.todayCard || '') === filter)); }
  function logCard(r){ return `<div class="today-item deduct-card" data-log-id="${Number(r.id||0)}"><strong>${esc(r.action||'異動')}</strong><div class="small-note">${esc(fmt24(r.created_at))}｜${esc(r.username||'')}</div></div>`; }
  function fillList(id, rows, empty){ const el=$(id); if(el) el.innerHTML=(rows||[]).map(logCard).join('') || `<div class="empty-state-card compact-empty">${esc(empty)}</div>`; }
  async function loadTodayChanges95(){
    try{
      const d = await api('/api/today-changes?ts=' + Date.now(), {method:'GET'}); const s=d.summary || {};
      const cards=[['inbound','進貨',Number(s.inbound_count||0),'筆'],['outbound','出貨',Number(s.outbound_count||0),'筆'],['orders','新增訂單',Number(s.new_order_count||0),'筆'],['unplaced','未入倉',Number(s.unplaced_count||0),'件']];
      const summary=$('today-summary-cards');
      if(summary){ summary.innerHTML=cards.map(c=>`<div class="yx95-today-card" data-today-card="${c[0]}"><div class="title">${esc(c[1])}</div><div class="sub">${c[2]}${esc(c[3])}</div></div>`).join(''); summary.querySelectorAll('.yx95-today-card').forEach(card => card.addEventListener('click',()=>{ const key=card.dataset.todayCard || ''; todayFilter = todayFilter === key ? '' : key; showTodayPanels95(todayFilter); })); }
      fillList('today-inbound-list', d.feed?.inbound, '今天沒有進貨'); fillList('today-outbound-list', d.feed?.outbound, '今天沒有出貨'); fillList('today-order-list', d.feed?.new_orders, '今天沒有新增訂單');
      const unplaced=$('today-unplaced-list'); if(unplaced){ const arr=Array.isArray(d.unplaced_items)?d.unplaced_items:[]; unplaced.innerHTML=arr.length?arr.map(it=>`<div class="deduct-card"><strong>${esc(productOf(it))}</strong><div class="small-note">${esc(customerOf(it))}｜未入倉 ${Number(it.unplaced_qty ?? it.qty ?? 0)} 件${it.source_summary?`｜來源：${esc(it.source_summary)}`:''}</div></div>`).join(''):'<div class="empty-state-card compact-empty">目前沒有未入倉商品</div>'; }
      showTodayPanels95(todayFilter); try{ await api('/api/today-changes/read',{method:'POST',body:JSON.stringify({})}); }catch(_e){} return d;
    }catch(e){ const summary=$('today-summary-cards'); if(summary) summary.innerHTML=`<div class="error-card">${esc(e.message||'今日異動載入失敗')}</div>`; }
  }
  window.loadTodayChanges = loadTodayChanges95;

  function cleanupBatchActionButtons95(){
    document.querySelectorAll('button,.ghost-btn,.primary-btn').forEach(el => {
      const txt = clean(el.textContent);
      if(['批量加材質','套用材質','批量刪除','重新整理'].includes(txt)) { el.classList.add('yx95-hidden-legacy'); el.style.display='none'; }
    });
    const bm=$('batch-material');
    if(bm && !Array.from(bm.options).some(o=>clean(o.value||o.textContent)==='尤加利')){ const opt=document.createElement('option'); opt.value='尤加利'; opt.textContent='尤加利'; bm.appendChild(opt); }
    const yx93=$('yx93-batch-material');
    if(yx93 && !Array.from(yx93.options).some(o=>clean(o.value||o.textContent)==='尤加利')){ const opt=document.createElement('option'); opt.value='尤加利'; opt.textContent='尤加利'; yx93.appendChild(opt); }
  }
  function installCustomerJump95(){
    if(document.body.dataset.yx95CustomerJump === '1') return;
    document.body.dataset.yx95CustomerJump = '1';
    document.addEventListener('click', e => { const card=e.target?.closest?.('#region-picker-section .customer-region-card,#region-picker-section [data-customer-name],#region-picker-section [data-customer]'); if(!card) return; if(!['orders','master_order'].includes(modKey())) return; setTimeout(()=>{ const target=$(`yx63-${modKey()}-summary`) || $('selected-customer-items'); if(target) target.scrollIntoView({behavior:'smooth', block:'start'}); }, 240); }, true);
  }
  function mobileLayout95(){
    if(['orders','master_order'].includes(modKey())) document.querySelector('#region-picker-section .category-grid')?.classList.add('yx95-mobile-region-row');
    if(modKey()==='warehouse') document.querySelectorAll('#zone-A-grid,#zone-B-grid').forEach(el => el.classList.add('yx95-mobile-warehouse-scroll'));
  }
  function finalMaster95(){
    document.documentElement.dataset.yxFix95 = VERSION;
    installCustomerJump95(); cleanupBatchActionButtons95(); mobileLayout95(); wrapWarehouseModal95(); removeLegacyWarehousePanels95(); decorateItemCards95();
    if(modKey()==='warehouse'){ updateUnplacedPill95(); compactWarehouseAll95(); }
    if(location.pathname.includes('/today-changes')){ /* FIX108 disabled old today loader */ }
    try { if(window.YX_MASTER) window.YX_MASTER = Object.freeze({...window.YX_MASTER, version:VERSION, loadTodayChanges:loadTodayChanges95, toggleWarehouseUnplacedHighlight:toggleUnplaced95, compactWarehouseAll:compactWarehouseAll95}); } catch(_e){}
  }
  let timer=null;
  function schedule(){ clearTimeout(timer); timer=setTimeout(finalMaster95, 80); }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule, {once:true}); else schedule();
  window.addEventListener('pageshow', schedule);
  [300,900,1800,3600,7000].forEach(ms => setTimeout(schedule, ms));
  const mo = new MutationObserver(() => schedule());
  function observe(){ ['inventory-list','orders-list','master-list','selected-customer-items','zone-A-grid','zone-B-grid','warehouse-modal','today-summary-cards'].forEach(id => { const el=$(id); if(el && !el.dataset.yx95Observed){ el.dataset.yx95Observed='1'; mo.observe(el,{childList:true,subtree:true}); } }); }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', observe, {once:true}); else observe();
  window.addEventListener('pageshow', observe);
})();
/* ==== FIX95: final master consolidation, warehouse drag/group, today, mobile, cache end ==== */



/* ==== FIX96: warehouse modal clean-open + A/B display master start ==== */
(function(){
  'use strict';
  const VERSION = 'FIX96_WAREHOUSE_MODAL_CLEAN_AB_MASTER';
  if (window.__YX96_WAREHOUSE_CLEAN_AB_MASTER__) return;
  window.__YX96_WAREHOUSE_CLEAN_AB_MASTER__ = true;

  const $ = id => document.getElementById(id);
  const clean = v => String(v ?? '').trim();
  const esc = v => String(v ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const toast = (msg, kind='ok') => { try { (window.toast || window.showToast || function(m){ console.log(m); })(msg, kind); } catch(_e){} };
  const modKey = () => { try { return document.querySelector('.module-screen')?.dataset.module || (typeof window.currentModule === 'function' ? window.currentModule() : ''); } catch(_e){ return ''; } };
  const api = window.yxApi || window.requestJSON || (async function(url,opt={}){
    const res = await fetch(url,{credentials:'same-origin',...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}});
    const text = await res.text(); let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch(_e){ data = {success:false,error:text||'伺服器回應格式錯誤'}; }
    if(!res.ok || data.success === false){ const e = new Error(data.error || data.message || `請求失敗：${res.status}`); e.payload = data; throw e; }
    return data;
  });
  window.yxApi = api;

  function state(){ window.state = window.state || {}; window.state.warehouse = window.state.warehouse || {cells:[], availableItems:[]}; return window.state; }
  function parseItems(raw){ try { return Array.isArray(raw) ? raw : JSON.parse(raw || '[]'); } catch(_e){ return []; } }
  function qtyOf(it){ const n = Number(it?.qty ?? it?.unplaced_qty ?? it?.total_qty ?? 0); return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0; }
  function customerOf(it){ return clean(it?.customer_name || '未指定客戶') || '未指定客戶'; }
  function productOf(it){ return clean(it?.product_text || it?.product_size || it?.product || ''); }
  function materialOf(it){ return clean(it?.material || it?.product_code || '未填材質') || '未填材質'; }
  function cellKey(zone,col,slot){ return [String(zone || '').toUpperCase(), Number(col), 'direct', Number(slot)]; }
  function normKey(key){ if(!Array.isArray(key)) return null; return [String(key[0]||'').toUpperCase(), Number(key[1]), 'direct', Number(key.length >= 4 ? key[3] : key[2])]; }
  function findCell(zone,col,slot){ return (state().warehouse.cells || []).find(c => String(c.zone) === String(zone) && Number(c.column_index) === Number(col) && Number(c.slot_number) === Number(slot)); }
  function cellItems(zone,col,slot){ try { if(typeof window.getCellItems === 'function') return window.getCellItems(zone,col,slot) || []; } catch(_e){} return parseItems(findCell(zone,col,slot)?.items_json).filter(it => qtyOf(it) > 0); }
  function setLocalCellItems(zone,col,slot,items){ let c=findCell(zone,col,slot); if(!c){ c={zone, column_index:col, slot_type:'direct', slot_number:slot, items_json:'[]', note:''}; state().warehouse.cells = state().warehouse.cells || []; state().warehouse.cells.push(c); } c.items_json = JSON.stringify(items || []); }
  async function saveCell(zone,col,slot,items,note=''){
    setLocalCellItems(zone,col,slot,items);
    return api('/api/warehouse/cell',{method:'POST', body:JSON.stringify({zone, column_index:Number(col), slot_type:'direct', slot_number:Number(slot), items, note})});
  }

  function resetBatchPanel(){
    const panel = $('yx91-warehouse-batch-panel');
    if(panel){
      panel.dataset.rows = '3';
      panel.querySelectorAll('.yx91-batch-row').forEach(row => {
        const sel = row.querySelector('select');
        const qty = row.querySelector('input[type="number"]');
        if(sel) sel.value = '';
        if(qty) qty.value = '0';
      });
    }
    ['yx80-warehouse-batch-panel','yx81-warehouse-batch-panel','yx82-warehouse-batch-panel','yx83-warehouse-batch-panel','yx89-warehouse-batch-panel'].forEach(id => $(id)?.remove());
  }
  function unlockWarehouseButtons(){
    document.querySelectorAll('#warehouse-modal button,.vertical-slot button,.yx67-warehouse-slot button').forEach(btn => {
      if(btn.dataset.busy === '1' || /儲存中|開啟中|加入中/.test(clean(btn.textContent))){
        btn.dataset.busy = '0';
        btn.disabled = false;
        btn.classList.remove('yx69-busy');
        btn.removeAttribute('aria-busy');
        if(btn.id === 'yx91-add-batch-items') btn.textContent = '批量加入格位';
        else if(btn.dataset.yx69OriginalText){ btn.textContent = btn.dataset.yx69OriginalText; delete btn.dataset.yx69OriginalText; }
      }
    });
  }
  function hideLegacyWarehouseInputs(){
    const modal = $('warehouse-modal'); if(!modal) return;
    modal.querySelectorAll('#warehouse-item-select,#warehouse-add-qty,#warehouse-recent-slots,[onclick*="addSelectedItemToCell"],[onclick*="saveWarehouseCell"]').forEach(el => { el.classList.add('yx96-hidden-legacy'); el.style.display = 'none'; });
    modal.querySelectorAll('button').forEach(btn => { const t=clean(btn.textContent); if(['加入格位','儲存格位'].includes(t)){ btn.classList.add('yx96-hidden-legacy'); btn.style.display='none'; } });
  }

  let originalOpen = null;
  function wrapOpenModal96(){
    const cur = window.openWarehouseModal;
    if(typeof cur !== 'function' || cur.__yx96CleanOpen) return;
    originalOpen = cur;
    const wrapped = async function(zone, column, num){
      // 新格/切格一定先清掉上一次批量選取；保留格子裡已有商品，由原本 open 重新讀取。
      resetBatchPanel();
      $('yx91-warehouse-batch-panel')?.remove();
      $('yx91-warehouse-detail-panel')?.classList.remove('saving','loading');
      const r = await originalOpen.apply(this, arguments);
      const panel = $('yx91-warehouse-batch-panel');
      if(panel){
        panel.dataset.rows = '3';
        panel.querySelectorAll('.yx91-batch-row').forEach(row => {
          const sel=row.querySelector('select'); const qty=row.querySelector('input[type="number"]');
          if(sel) sel.value='';
          if(qty) qty.value='0';
        });
      }
      [40,160,420,900].forEach(ms => setTimeout(() => { hideLegacyWarehouseInputs(); unlockWarehouseButtons(); compactWarehouseAll96(); }, ms));
      return r;
    };
    Object.defineProperty(wrapped, '__yx96CleanOpen', {value:true});
    window.openWarehouseModal = wrapped;
  }

  function slotId(slot){ return `${slot.dataset.zone || ''}|${slot.dataset.column || slot.dataset.col || ''}|${slot.dataset.num || slot.dataset.slot || ''}`; }
  function renderSlotCompact96(slot){
    const zone = slot.dataset.zone;
    const col = Number(slot.dataset.column || slot.dataset.col || 0);
    const num = Number(slot.dataset.num || slot.dataset.slot || 0);
    if(!zone || !col || !num) return;
    const count = slot.querySelector('.slot-count'); if(!count) return;
    const items = cellItems(zone,col,num).filter(it => qtyOf(it) > 0);
    const sig = JSON.stringify(items.map((it,idx) => [customerOf(it), productOf(it), materialOf(it), qtyOf(it), clean(it.placement_label || it.layer_label || ''), idx]));
    if(slot.dataset.yx96Sig === sig && count.querySelector('[data-yx96-drag-group],.slot-line.empty')) return;
    slot.dataset.yx92Sig = sig;
    slot.dataset.yx94Sig = sig;
    slot.dataset.yx95Sig = sig;
    slot.dataset.yx96Sig = sig;
    if(!items.length){ count.innerHTML = '<div class="slot-line empty">空格</div>'; return; }
    const groups = new Map();
    items.forEach((it,idx) => { const c=customerOf(it); if(!groups.has(c)) groups.set(c, []); groups.get(c).push({...it, __idx:idx}); });
    count.innerHTML = Array.from(groups.entries()).map(([customer, arr]) => {
      const qtys = arr.map(qtyOf).filter(q => q > 0);
      const total = qtys.reduce((s,q)=>s+q,0);
      const payload = {kind:'warehouse-group', fromKey:cellKey(zone,col,num), customer_name:customer, item_indexes:arr.map(x=>x.__idx)};
      return `<div class="yx96-cell-customer-line" draggable="true" data-yx96-drag-group="${esc(JSON.stringify(payload))}" title="拖拉 ${esc(customer)} 到別格，會放在最前排"><b>${esc(customer)}</b><span>${esc(qtys.join('+') || String(total))}件</span></div>`;
    }).join('');
    bindGroupDrags96(count);
  }
  function compactWarehouseAll96(){
    if(modKey() !== 'warehouse' && !document.querySelector('#zone-A-grid,#zone-B-grid')) return;
    document.querySelectorAll('#zone-A-grid .vertical-slot,#zone-B-grid .vertical-slot,.yx67-warehouse-slot').forEach(renderSlotCompact96);
    bindDrop96();
  }

  function bindGroupDrags96(root){
    (root || document).querySelectorAll('[data-yx96-drag-group]').forEach(el => {
      if(el.dataset.yx96DragBound === '1') return;
      el.dataset.yx96DragBound = '1';
      el.addEventListener('dragstart', ev => {
        try { ev.dataTransfer.effectAllowed='move'; ev.dataTransfer.setData('text/plain', el.dataset.yx96DragGroup || ''); el.classList.add('yx92-dragging'); } catch(_e){}
      });
      el.addEventListener('dragend', () => el.classList.remove('yx92-dragging'));
    });
  }
  async function moveGroup96(payload,toKey){
    const from = normKey(payload.fromKey || payload.from_key);
    const to = normKey(toKey);
    if(!from || !to) throw new Error('格位資料不完整，請重新拖拉');
    if(from[0]===to[0] && from[1]===to[1] && from[3]===to[3]){ toast('已在同一格，不需要搬移','warn'); return; }
    const src = cellItems(from[0],from[1],from[3]);
    const dst = cellItems(to[0],to[1],to[3]);
    const indexes = new Set((payload.item_indexes || []).map(Number));
    const remain = []; let moved = [];
    src.forEach((it,idx) => {
      if(indexes.has(idx) || (payload.customer_name && customerOf(it) === clean(payload.customer_name))) moved.push({...it});
      else remain.push(it);
    });
    moved = moved.filter(it => qtyOf(it) > 0).map(it => ({...it, placement_label:'前排', layer_label:'前排'}));
    if(!moved.length) throw new Error('沒有可搬移的商品');
    await saveCell(from[0],from[1],from[3], remain, findCell(from[0],from[1],from[3])?.note || '');
    await saveCell(to[0],to[1],to[3], moved.concat(dst), findCell(to[0],to[1],to[3])?.note || '');
    toast(`搬移完成：${clean(payload.customer_name||'商品')} 已放到最前排`, 'ok');
    try { await (window.renderWarehouse && window.renderWarehouse(true)); } catch(_e){ try { await window.renderWarehouse(); } catch(_e2){} }
    setTimeout(compactWarehouseAll96, 180);
  }
  function bindDrop96(){
    document.querySelectorAll('#zone-A-grid .vertical-slot,#zone-B-grid .vertical-slot,.yx67-warehouse-slot').forEach(slot => {
      if(slot.dataset.yx96DropBound === '1') return;
      slot.dataset.yx96DropBound = '1';
      slot.addEventListener('dragover', ev => { try { ev.preventDefault(); ev.dataTransfer.dropEffect='move'; slot.classList.add('yx92-drag-over'); } catch(_e){} }, true);
      slot.addEventListener('dragleave', () => slot.classList.remove('yx92-drag-over'), true);
      slot.addEventListener('drop', async ev => {
        const raw = ev.dataTransfer?.getData?.('text/plain') || '';
        if(!raw || raw.indexOf('warehouse-group') < 0) return;
        let payload = null; try { payload = JSON.parse(raw); } catch(_e){ return; }
        if(payload.kind !== 'warehouse-group') return;
        ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation(); slot.classList.remove('yx92-drag-over');
        try { await moveGroup96(payload, cellKey(slot.dataset.zone, Number(slot.dataset.column || slot.dataset.col || 0), Number(slot.dataset.num || slot.dataset.slot || 0))); }
        catch(e){ toast(e.message || '拖拉搬移失敗', 'error'); }
      }, true);
    });
  }

  function wrapRender96(){
    const fn = window.renderWarehouse;
    if(typeof fn === 'function' && !fn.__yx96Wrapped){
      const wrapped = async function(){ const r = await fn.apply(this, arguments); [80,240,650].forEach(ms => setTimeout(compactWarehouseAll96, ms)); return r; };
      Object.defineProperty(wrapped, '__yx96Wrapped', {value:true});
      window.renderWarehouse = wrapped;
    }
  }
  function install96(){
    document.documentElement.dataset.yxFix96 = VERSION;
    wrapOpenModal96();
    wrapRender96();
    hideLegacyWarehouseInputs();
    unlockWarehouseButtons();
    if(modKey() === 'warehouse' || document.querySelector('#zone-A-grid,#zone-B-grid')) compactWarehouseAll96();
    try { if(window.YX_MASTER) window.YX_MASTER = Object.freeze({...window.YX_MASTER, version:VERSION, openWarehouseModal:window.openWarehouseModal, compactWarehouseAll:compactWarehouseAll96}); } catch(_e){}
  }
  let timer = null;
  function schedule(){ clearTimeout(timer); timer = setTimeout(install96, 80); }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule, {once:true}); else schedule();
  window.addEventListener('pageshow', schedule);
  [220,700,1500,3000,6000].forEach(ms => setTimeout(schedule, ms));
  const mo = new MutationObserver(() => schedule());
  function observe(){ ['warehouse-modal','zone-A-grid','zone-B-grid'].forEach(id => { const el=$(id); if(el && !el.dataset.yx96Observed){ el.dataset.yx96Observed='1'; mo.observe(el,{childList:true,subtree:true,attributes:true}); } }); }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', observe, {once:true}); else observe();
  window.addEventListener('pageshow', observe);
})();
/* ==== FIX96: warehouse modal clean-open + A/B display master end ==== */


/* ==== FIX97: global QC consolidation guard start ==== */
(function(){
  'use strict';
  const VERSION = 'FIX97_GLOBAL_QC_CONSOLIDATED';
  if (window.__YX97_GLOBAL_QC_CONSOLIDATED__) return;
  window.__YX97_GLOBAL_QC_CONSOLIDATED__ = true;

  const $ = id => document.getElementById(id);
  const clean = v => String(v ?? '').trim();
  const esc = v => String(v ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const toast = (msg, kind='ok') => { try { (window.toast || window.showToast || function(m){ console.log(m); })(msg, kind); } catch(_e){} };
  const api = window.yxApi || window.requestJSON || (async function(url,opt={}){
    const res = await fetch(url,{credentials:'same-origin',cache:'no-store',...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}});
    const text = await res.text(); let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch(_e){ data = {success:false,error:text||'伺服器回應格式錯誤'}; }
    if(!res.ok || data.success === false){ const e = new Error(data.error || data.message || `請求失敗：${res.status}`); e.payload = data; throw e; }
    return data;
  });
  window.yxApi = api;

  function modKey(){ try { return document.querySelector('.module-screen')?.dataset.module || (typeof window.currentModule === 'function' ? window.currentModule() : ''); } catch(_e){ return ''; } }
  function state(){ window.state = window.state || {}; window.state.warehouse = window.state.warehouse || {cells:[],availableItems:[]}; return window.state; }
  function safeItems(raw){ try { return Array.isArray(raw) ? raw : JSON.parse(raw || '[]'); } catch(_e){ return []; } }
  function qtyOf(it){ const n = Number(it?.qty ?? it?.unplaced_qty ?? it?.total_qty ?? 0); return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0; }
  function productOf(it){ return clean(it?.product_text || it?.product_size || it?.product || ''); }
  function customerOf(it){ return clean(it?.customer_name || '未指定客戶') || '未指定客戶'; }
  function materialOf(it){ return clean(it?.material || it?.product_code || '未填材質') || '未填材質'; }
  function itemKey(it){ return JSON.stringify([clean(it?.source_summary || it?.source || ''), customerOf(it), productOf(it), materialOf(it)]); }
  function itemText(it){ return `${customerOf(it)}｜${materialOf(it)}｜${productOf(it)}｜剩餘 ${qtyOf(it)}`; }
  function cellKey(zone,col,slot){ return [String(zone || '').toUpperCase(), Number(col), 'direct', Number(slot)]; }
  function normCellKey(key){ if(!Array.isArray(key)) return null; return [String(key[0]||'').toUpperCase(), Number(key[1]), 'direct', Number(key.length >= 4 ? key[3] : key[2])]; }
  function findCell(zone,col,slot){ return (state().warehouse.cells || []).find(c => String(c.zone) === String(zone) && Number(c.column_index) === Number(col) && Number(c.slot_number) === Number(slot)); }
  function getCellItems(zone,col,slot){
    try { if(typeof window.getCellItems === 'function') return (window.getCellItems(zone,col,slot) || []).filter(it => qtyOf(it)>0); } catch(_e){}
    return safeItems(findCell(zone,col,slot)?.items_json).filter(it => qtyOf(it)>0);
  }
  function setLocalCellItems(zone,col,slot,items){
    let c = findCell(zone,col,slot);
    if(!c){ c = {zone, column_index:Number(col), slot_type:'direct', slot_number:Number(slot), items_json:'[]', note:''}; state().warehouse.cells.push(c); }
    c.items_json = JSON.stringify(items || []);
  }
  async function refreshAvailable(){
    try { const d = await api('/api/warehouse/available-items?ts=' + Date.now(), {method:'GET'}); state().warehouse.availableItems = Array.isArray(d.items) ? d.items : []; }
    catch(_e){ state().warehouse.availableItems = Array.isArray(state().warehouse.availableItems) ? state().warehouse.availableItems : []; }
    return state().warehouse.availableItems;
  }
  function availableItems(){ return Array.isArray(state().warehouse.availableItems) ? state().warehouse.availableItems : []; }

  function getModal(){ return $('warehouse-modal'); }
  function getCard(){ const modal=getModal(); return modal?.querySelector?.('.modal-card') || modal; }
  const legacySelectors = '#yx80-warehouse-batch-panel,#yx81-warehouse-batch-panel,#yx82-warehouse-batch-panel,#yx83-warehouse-batch-panel,#yx89-warehouse-batch-panel,#yx82-warehouse-detail-panel,#yx83-warehouse-detail-panel,#yx89-warehouse-detail-panel,.yx80-warehouse-batch-panel:not(#yx91-warehouse-batch-panel),.yx82-warehouse-detail-panel:not(#yx91-warehouse-detail-panel)';
  function cleanupWarehouseModal97(){
    const modal = getModal(); if(!modal) return;
    modal.querySelectorAll(legacySelectors).forEach(el => el.remove());
    modal.querySelectorAll('#warehouse-item-select,#warehouse-add-qty,#warehouse-recent-slots,[onclick*="addSelectedItemToCell"],[onclick*="saveWarehouseCell"]').forEach(el => { el.classList.add('yx97-hidden-legacy'); el.style.display='none'; });
    modal.querySelectorAll('button').forEach(btn => { const t=clean(btn.textContent); if(['加入格位','儲存格位'].includes(t)){ btn.classList.add('yx97-hidden-legacy'); btn.style.display='none'; } if(/儲存中|加入中|開啟中/.test(t)){ btn.disabled=false; btn.dataset.busy='0'; btn.removeAttribute('aria-busy'); if(btn.id==='yx91-add-batch-items') btn.textContent='批量加入格位'; }});
    const panels = Array.from(modal.querySelectorAll('#yx91-warehouse-batch-panel'));
    panels.slice(1).forEach(el => el.remove());
  }
  function ensureDetailPanel(){
    const card=getCard(); if(!card) return null;
    let detail=$('yx91-warehouse-detail-panel');
    if(!detail){ detail=document.createElement('div'); detail.id='yx91-warehouse-detail-panel'; detail.className='yx82-warehouse-detail-panel yx91-warehouse-detail-panel'; const meta=$('warehouse-modal-meta'); (meta?.parentNode || card).insertBefore(detail, meta?.nextSibling || card.firstChild); }
    return detail;
  }
  function ensureBatchPanel(){
    const card=getCard(); if(!card) return null;
    cleanupWarehouseModal97();
    let panel=$('yx91-warehouse-batch-panel');
    if(!panel){ panel=document.createElement('div'); panel.id='yx91-warehouse-batch-panel'; panel.className='yx80-warehouse-batch-panel yx91-warehouse-batch-panel'; const noteLabel=Array.from(card.querySelectorAll('label.field-label')).find(x => clean(x.textContent)==='格位備註'); (noteLabel?.parentNode || card).insertBefore(panel, noteLabel || $('warehouse-note') || null); }
    return panel;
  }
  function currentCell(){ return state().currentCell || {}; }
  function renderWarehouseDetails97(){
    const detail=ensureDetailPanel(); if(!detail) return;
    const items = Array.isArray(state().currentCellItems) ? state().currentCellItems.filter(it=>qtyOf(it)>0) : [];
    if(!items.length){ detail.innerHTML='<div class="empty-state-card compact-empty">此格目前沒有商品</div>'; return; }
    detail.innerHTML = '<div class="section-title">格位詳細資料</div>' + items.map((it,idx)=>{
      const label = clean(it.placement_label || it.layer_label || (['後排','中間','前排'][idx] || `第${idx+1}筆`));
      return `<div class="deduct-card yx82-warehouse-detail-card"><strong>${esc(label)}</strong><div class="small-note">客戶：${esc(customerOf(it))}</div><div class="small-note">商品：${esc(productOf(it))}</div><div class="small-note">數量：${qtyOf(it)} 件</div></div>`;
    }).join('');
  }
  function snapshotBatch(panel){ return Array.from(panel?.querySelectorAll?.('.yx91-batch-row') || []).map(row => ({value:row.querySelector('select')?.value || '', qty:row.querySelector('input[type="number"]')?.value || '0'})); }
  async function refreshBatchPanel97(keep){
    await refreshAvailable();
    const panel=ensureBatchPanel(); if(!panel) return;
    renderWarehouseDetails97();
    const prev = keep || snapshotBatch(panel);
    const rows = Math.max(3, Number(panel.dataset.rows || prev.length || 3));
    const q = clean($('warehouse-item-search')?.value || '').toLowerCase();
    const opts = availableItems().filter(it => !q || `${customerOf(it)} ${materialOf(it)} ${productOf(it)}`.toLowerCase().includes(q));
    const optMap = new Map(opts.map(it => [itemKey(it), it]));
    const rowHtml = i => `<div class="yx80-batch-row yx91-batch-row" data-batch-idx="${i}"><span class="yx80-batch-label">${i===0?'後排':i===1?'中間':i===2?'前排':`第${i+1}筆`}</span><select class="text-input yx91-batch-select"><option value="">不加入</option>${opts.map(it=>`<option value="${esc(itemKey(it))}">${esc(itemText(it))}</option>`).join('')}</select><input class="text-input yx91-batch-qty" type="number" min="0" value="0"></div>`;
    panel.innerHTML = `<label class="field-label">批量加入商品</label><div class="small-note">第一筆後排、第二筆中間、第三筆前排；不加入會顯示 0。按「批量加入格位」會直接儲存。</div><div id="yx97-batch-rows">${Array.from({length:rows},(_,i)=>rowHtml(i)).join('')}</div><div class="btn-row compact-row"><button type="button" class="ghost-btn small-btn" id="yx91-add-batch-row">增加批量</button><button type="button" class="primary-btn small-btn" id="yx91-add-batch-items">批量加入格位</button></div>`;
    panel.querySelectorAll('.yx91-batch-row').forEach((row,i)=>{
      const st = prev[i] || {}; const sel=row.querySelector('select'); const qty=row.querySelector('input[type="number"]');
      if(st.value && optMap.has(st.value)){ sel.value=st.value; const max=qtyOf(optMap.get(st.value)); qty.value = String(Math.max(0, Math.min(max, Number(st.qty || max) || max))); }
      else { sel.value=''; qty.value='0'; }
      sel.addEventListener('change',()=>{ const it=optMap.get(sel.value); qty.value = it ? String(qtyOf(it)) : '0'; });
    });
    cleanupWarehouseModal97();
  }
  async function saveCell97(items){
    const cell=currentCell(); const zone=clean(cell.zone || cell.area || 'A').toUpperCase(); const col=Number(cell.column_index || cell.column || cell.col || 0); const slot=Number(cell.slot_number || cell.num || cell.slot || 0);
    if(!zone || !col || !slot) throw new Error('格位資料不完整，請重新點選格子');
    setLocalCellItems(zone,col,slot,items);
    await api('/api/warehouse/cell',{method:'POST',body:JSON.stringify({zone,column_index:col,slot_type:'direct',slot_number:slot,items,note:$('warehouse-note')?.value || ''})});
  }
  async function saveWarehouseCell97(){ await saveCell97(Array.isArray(state().currentCellItems) ? state().currentCellItems : []); try{ window.closeWarehouseModal && window.closeWarehouseModal(); }catch(_e){} try{ await (window.renderWarehouse && window.renderWarehouse(true)); }catch(_e){ try{ await window.renderWarehouse(); }catch(_e2){} } setTimeout(compactWarehouseAll97,160); }
  async function batchAddSave97(){
    const panel=ensureBatchPanel(); if(!panel) return; const btn=$('yx91-add-batch-items'); if(btn?.dataset.busy==='1') return;
    const optMap = new Map(availableItems().map(it => [itemKey(it), it]));
    state().currentCellItems = Array.isArray(state().currentCellItems) ? state().currentCellItems.filter(it=>qtyOf(it)>0) : [];
    let count=0;
    panel.querySelectorAll('.yx91-batch-row').forEach(row=>{
      const idx=Number(row.dataset.batchIdx || 0); const it=optMap.get(row.querySelector('select')?.value || ''); if(!it) return;
      let q=Number(row.querySelector('input[type="number"]')?.value || 0); q=Number.isFinite(q) ? Math.floor(q) : 0; q=Math.max(0, Math.min(q, qtyOf(it))); if(q<=0) return;
      const label = idx===0 ? '後排' : idx===1 ? '中間' : idx===2 ? '前排' : '';
      state().currentCellItems.push({...it, product_text:productOf(it), material:materialOf(it), customer_name:customerOf(it), qty:q, placement_label:label, layer_label:label}); count++;
    });
    if(!count){ toast('請至少選擇一筆商品','warn'); return; }
    renderWarehouseDetails97();
    try{ if(btn){ btn.dataset.busy='1'; btn.disabled=true; btn.textContent='儲存中…'; } await saveWarehouseCell97(); toast(`已批量加入並儲存 ${count} 筆`,'ok'); }
    catch(e){ toast(e.message || '批量儲存失敗','error'); if(btn){ btn.dataset.busy='0'; btn.disabled=false; btn.textContent='批量加入格位'; } }
  }
  let baseOpen = null;
  function installOpenWrapper97(){
    const cur=window.openWarehouseModal; if(typeof cur !== 'function' || cur.__yx97FinalOpen) return;
    baseOpen = cur;
    const wrapped = async function(zone,column,num){
      cleanupWarehouseModal97();
      const oldPanel=$('yx91-warehouse-batch-panel');
      if(oldPanel){ oldPanel.dataset.rows='3'; oldPanel.querySelectorAll('select').forEach(s=>s.value=''); oldPanel.querySelectorAll('input[type="number"]').forEach(i=>i.value='0'); }
      state().currentCell = {zone:String(zone||'A').toUpperCase(), column_index:Number(column||0), slot_number:Number(num||0), slot_type:'direct'};
      const r = await baseOpen.apply(this, arguments);
      await refreshBatchPanel97([{value:'',qty:'0'},{value:'',qty:'0'},{value:'',qty:'0'}]);
      [40,160,420,900].forEach(ms=>setTimeout(()=>{ cleanupWarehouseModal97(); renderWarehouseDetails97(); },ms));
      return r;
    };
    Object.defineProperty(wrapped,'__yx97FinalOpen',{value:true});
    window.openWarehouseModal = wrapped;
  }

  function renderSlotCompact97(slot){
    const zone=slot.dataset.zone; const col=Number(slot.dataset.column || slot.dataset.col || 0); const num=Number(slot.dataset.num || slot.dataset.slot || 0); if(!zone || !col || !num) return;
    const count=slot.querySelector('.slot-count'); if(!count) return;
    const items=getCellItems(zone,col,num).filter(it=>qtyOf(it)>0);
    const sig=JSON.stringify(items.map((it,idx)=>[customerOf(it),productOf(it),materialOf(it),qtyOf(it),idx]));
    if(slot.dataset.yx97Sig===sig && count.querySelector('[data-yx97-drag-group],.slot-line.empty')) return;
    slot.dataset.yx97Sig=sig;
    if(!items.length){ count.innerHTML='<div class="slot-line empty">空格</div>'; return; }
    const groups=new Map();
    items.forEach((it,idx)=>{ const c=customerOf(it); if(!groups.has(c)) groups.set(c,[]); groups.get(c).push({...it,__idx:idx}); });
    count.innerHTML=Array.from(groups.entries()).map(([customer,arr])=>{ const qtys=arr.map(qtyOf).filter(q=>q>0); const payload={kind:'warehouse-group',fromKey:cellKey(zone,col,num),customer_name:customer,item_indexes:arr.map(x=>x.__idx)}; return `<div class="yx97-cell-customer-line" draggable="true" data-yx97-drag-group="${esc(JSON.stringify(payload))}"><b>${esc(customer)}</b><span>${esc(qtys.join('+'))}件</span></div>`; }).join('');
    bindDrag97(count);
  }
  function bindDrag97(root){ (root||document).querySelectorAll('[data-yx97-drag-group]').forEach(el=>{ if(el.dataset.yx97Bound==='1') return; el.dataset.yx97Bound='1'; el.addEventListener('dragstart',ev=>{ try{ ev.dataTransfer.effectAllowed='move'; ev.dataTransfer.setData('text/plain',el.dataset.yx97DragGroup || ''); el.classList.add('yx92-dragging'); }catch(_e){} }); el.addEventListener('dragend',()=>el.classList.remove('yx92-dragging')); }); }
  async function moveGroup97(payload,toKey){
    const from=normCellKey(payload.fromKey || payload.from_key); const to=normCellKey(toKey); if(!from || !to) throw new Error('格位資料不完整');
    if(from[0]===to[0] && from[1]===to[1] && from[3]===to[3]){ toast('已在同一格','warn'); return; }
    const src=getCellItems(from[0],from[1],from[3]); const dst=getCellItems(to[0],to[1],to[3]); const indexes=new Set((payload.item_indexes||[]).map(Number));
    const moved=[]; const remain=[];
    src.forEach((it,idx)=>{ if(indexes.has(idx) || customerOf(it)===clean(payload.customer_name)){ moved.push({...it,placement_label:'前排',layer_label:'前排'}); } else remain.push(it); });
    if(!moved.length) throw new Error('沒有可搬移的商品');
    setLocalCellItems(from[0],from[1],from[3],remain); setLocalCellItems(to[0],to[1],to[3],moved.concat(dst));
    await api('/api/warehouse/cell',{method:'POST',body:JSON.stringify({zone:from[0],column_index:from[1],slot_type:'direct',slot_number:from[3],items:remain,note:findCell(from[0],from[1],from[3])?.note || ''})});
    await api('/api/warehouse/cell',{method:'POST',body:JSON.stringify({zone:to[0],column_index:to[1],slot_type:'direct',slot_number:to[3],items:moved.concat(dst),note:findCell(to[0],to[1],to[3])?.note || ''})});
    toast(`搬移完成：${clean(payload.customer_name || '商品')} 已放到最前排`,'ok'); try{ await (window.renderWarehouse && window.renderWarehouse(true)); }catch(_e){ try{ await window.renderWarehouse(); }catch(_e2){} } setTimeout(compactWarehouseAll97,160);
  }
  function bindDrop97(){ document.querySelectorAll('#zone-A-grid .vertical-slot,#zone-B-grid .vertical-slot,.yx67-warehouse-slot').forEach(slot=>{ if(slot.dataset.yx97Drop==='1') return; slot.dataset.yx97Drop='1'; slot.addEventListener('dragover',ev=>{ ev.preventDefault(); try{ ev.dataTransfer.dropEffect='move'; }catch(_e){} slot.classList.add('yx97-drag-over'); },true); slot.addEventListener('dragleave',()=>slot.classList.remove('yx97-drag-over'),true); slot.addEventListener('drop',async ev=>{ const raw=ev.dataTransfer?.getData?.('text/plain') || ''; if(raw.indexOf('warehouse-group')<0) return; let payload=null; try{ payload=JSON.parse(raw); }catch(_e){ return; } if(payload.kind!=='warehouse-group') return; ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation(); slot.classList.remove('yx97-drag-over'); try{ await moveGroup97(payload, cellKey(slot.dataset.zone, Number(slot.dataset.column || slot.dataset.col || 0), Number(slot.dataset.num || slot.dataset.slot || 0))); }catch(e){ toast(e.message || '拖拉搬移失敗','error'); } },true); }); }
  function compactWarehouseAll97(){ document.querySelectorAll('#zone-A-grid .vertical-slot,#zone-B-grid .vertical-slot,.yx67-warehouse-slot').forEach(renderSlotCompact97); bindDrop97(); }

  window.addEventListener('click', async ev=>{
    const btn=ev.target?.closest?.('#yx91-add-batch-row,#yx91-add-batch-items'); if(!btn) return;
    ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation();
    const panel=ensureBatchPanel(); const snap=snapshotBatch(panel);
    if(btn.id==='yx91-add-batch-row'){ if(panel) panel.dataset.rows=String(Math.max(3,Number(panel.dataset.rows || snap.length || 3))+1); await refreshBatchPanel97(snap.concat([{value:'',qty:'0'}])); return; }
    await batchAddSave97();
  }, true);

  function install97(){
    document.documentElement.dataset.yxFix97 = VERSION;
    cleanupWarehouseModal97();
    installOpenWrapper97();
    window.renderWarehouseCellItems = renderWarehouseDetails97;
    window.refreshWarehouseBatchPanel = refreshBatchPanel97;
    window.saveWarehouseCell = saveWarehouseCell97;
    if(modKey()==='warehouse' || document.querySelector('#zone-A-grid,#zone-B-grid')) compactWarehouseAll97();
    try{ if(window.YX_MASTER) window.YX_MASTER = Object.freeze({...window.YX_MASTER, version:VERSION, openWarehouseModal:window.openWarehouseModal, refreshWarehouseBatchPanel:refreshBatchPanel97, saveWarehouseCell:saveWarehouseCell97, renderWarehouseCellItems:renderWarehouseDetails97, compactWarehouseAll:compactWarehouseAll97}); }catch(_e){}
  }
  let timer=null; function schedule(){ clearTimeout(timer); timer=setTimeout(install97,80); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',schedule,{once:true}); else schedule();
  window.addEventListener('pageshow', schedule);
  [240,700,1500,3200,6500].forEach(ms=>setTimeout(schedule,ms));
  const mo = new MutationObserver(()=>schedule());
  function observe(){ ['warehouse-modal','zone-A-grid','zone-B-grid','today-summary-cards','inventory-list','orders-list','master-list'].forEach(id=>{ const el=$(id); if(el && !el.dataset.yx97Observed){ el.dataset.yx97Observed='1'; mo.observe(el,{childList:true,subtree:true}); } }); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',observe,{once:true}); else observe();
  window.addEventListener('pageshow',observe);
})();
/* ==== FIX97: global QC consolidation guard end ==== */

/* ==== FIX98: true master upgrades + global search + ship preview lock start ==== */
(function(){
  'use strict';
  const VERSION='FIX98_TRUE_MASTER_UPGRADE';
  if(window.__YX98_TRUE_MASTER_UPGRADE__) return;
  window.__YX98_TRUE_MASTER_UPGRADE__=true;
  const $=id=>document.getElementById(id);
  const clean=v=>String(v??'').trim();
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const toast=(m,k='ok')=>{try{(window.toast||window.showToast||function(x){console.log(x)})(m,k)}catch(_){}};

  // 1) 出貨預覽鎖：不改舊流程，直接在 fetch 層接管 preview_token。
  if(!window.__YX98_FETCH_LOCK_WRAPPED__){
    window.__YX98_FETCH_LOCK_WRAPPED__=true;
    const nativeFetch=window.fetch.bind(window);
    window.fetch=async function(input, init){
      let url='';
      try{ url=typeof input==='string'?input:(input&&input.url)||''; }catch(_e){}
      let nextInit=init;
      try{
        if(url.includes('/api/ship') && !url.includes('/api/ship-preview') && nextInit && nextInit.body && String(nextInit.body).trim().startsWith('{')){
          const body=JSON.parse(nextInit.body);
          if(body.preview_confirmed && window.__YX98_LAST_SHIP_PREVIEW_TOKEN__ && !body.preview_token){
            body.preview_token=window.__YX98_LAST_SHIP_PREVIEW_TOKEN__;
            nextInit={...nextInit,body:JSON.stringify(body)};
          }
        }
      }catch(_e){}
      const res=await nativeFetch(input,nextInit);
      try{
        if(url.includes('/api/ship-preview')){
          const copy=res.clone();
          copy.json().then(data=>{ if(data&&data.preview_token){ window.__YX98_LAST_SHIP_PREVIEW_TOKEN__=data.preview_token; window.__YX98_LAST_SHIP_PREVIEW_AT__=Date.now(); } }).catch(()=>{});
        }
      }catch(_e){}
      return res;
    };
  }

  async function api(url,opt={}){
    const res=await fetch(url,{credentials:'same-origin',cache:'no-store',...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}});
    const txt=await res.text(); let data={};
    try{data=txt?JSON.parse(txt):{};}catch(_e){data={success:false,error:txt||'伺服器回應格式錯誤'};}
    if(!res.ok||data.success===false){const e=new Error(data.error||data.message||`請求失敗：${res.status}`);e.payload=data;throw e;}
    return data;
  }
  window.yxApi=window.yxApi||api;

  // 2) 貼上文字整理器：用後端統一排序/月份/高度格式，避免前後端規則不同。
  function injectTextOrganizer(){
    const area=$('ocr-text'); const submit=$('submit-btn');
    if(!area||!submit||$('yx98-organize-text-btn')) return;
    const btn=document.createElement('button');
    btn.type='button'; btn.id='yx98-organize-text-btn'; btn.className='ghost-btn'; btn.textContent='整理文字';
    submit.insertAdjacentElement('afterend',btn);
    btn.addEventListener('click',async()=>{
      const raw=area.value||'';
      if(!raw.trim()){toast('沒有文字可整理','warn');return;}
      btn.disabled=true; btn.textContent='整理中…';
      try{ const d=await api('/api/text/organize',{method:'POST',body:JSON.stringify({text:raw})}); if(d.text){area.value=d.text; area.dispatchEvent(new Event('input',{bubbles:true})); toast('文字已整理','ok');} else toast('沒有可整理的商品行','warn'); }
      catch(e){toast(e.message||'文字整理失敗','error');}
      finally{btn.disabled=false; btn.textContent='整理文字';}
    });
  }

  // 3) 全域搜尋：首頁/各頁都可快速找客戶、尺寸、倉庫、出貨。
  function ensureGlobalSearch(){
    if($('yx98-global-search')) return;
    const box=document.createElement('div'); box.id='yx98-global-search'; box.className='yx98-global-search glass';
    box.innerHTML='<input id="yx98-global-search-input" class="text-input" placeholder="全域搜尋：客戶 / 尺寸 / 材質 / 倉庫格"><button id="yx98-global-search-btn" class="primary-btn small-btn" type="button">搜尋</button><div id="yx98-global-search-results" class="yx98-global-search-results hidden"></div>';
    const top=document.querySelector('.home-header,.module-topbar')||document.body.firstElementChild;
    (top&&top.parentNode?top.parentNode:document.body).insertBefore(box, top?top.nextSibling:null);
    const input=$('yx98-global-search-input'), btn=$('yx98-global-search-btn'), results=$('yx98-global-search-results');
    async function run(){
      const q=clean(input.value); if(!q){results.classList.add('hidden'); results.innerHTML=''; return;}
      btn.disabled=true;
      try{
        const d=await api('/api/global-search?q='+encodeURIComponent(q)+'&limit=60',{method:'GET'});
        const arr=d.items||[];
        results.classList.remove('hidden');
        results.innerHTML=arr.length?arr.map(it=>`<a class="yx98-search-row" href="${esc(it.url||'#')}"><b>${esc(it.title||'')}</b><span>${esc(it.subtitle||'')}</span><em>${esc(it.kind||'')}</em></a>`).join(''):'<div class="empty-state-card compact-empty">查無資料</div>';
      }catch(e){results.classList.remove('hidden'); results.innerHTML=`<div class="error-card">${esc(e.message||'搜尋失敗')}</div>`;}
      finally{btn.disabled=false;}
    }
    btn.addEventListener('click',run);
    input.addEventListener('keydown',e=>{if(e.key==='Enter') run(); if(e.key==='Escape'){results.classList.add('hidden');}});
  }

  // 4) 送出防重點擊與現場模式：最後一層只處理安全，不覆蓋你既有母版邏輯。
  function hardenSubmitButton(){
    const btn=$('submit-btn'); if(!btn||btn.dataset.yx98Hard) return; btn.dataset.yx98Hard='1';
    btn.addEventListener('click',()=>{ btn.classList.add('yx98-pressed'); setTimeout(()=>btn.classList.remove('yx98-pressed'),180); },true);
  }

  function install(){
    document.documentElement.dataset.yxFix98=VERSION;
    injectTextOrganizer(); ensureGlobalSearch(); hardenSubmitButton();
    try{ window.YX_MASTER=Object.freeze({...(window.YX_MASTER||{}),version:VERSION,api:window.yxApi,installTextOrganizer:injectTextOrganizer,installGlobalSearch:ensureGlobalSearch}); }catch(_e){}
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true}); else install();
  window.addEventListener('pageshow',install);
  [600,1800,3600].forEach(ms=>setTimeout(install,ms));
})();
/* ==== FIX98: true master upgrades + global search + ship preview lock end ==== */


/* ==== FIX99: commercial stability tools + offline queue start ==== */
(function(){
  'use strict';
  const VERSION='FIX99_COMMERCIAL_STABILITY';
  if(window.__YX99_COMMERCIAL_STABILITY__) return;
  window.__YX99_COMMERCIAL_STABILITY__=true;
  const $=id=>document.getElementById(id);
  const clean=v=>String(v??'').trim();
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const toast=(m,k='ok')=>{try{(window.toast||window.showToast||function(x){console.log(x)})(m,k)}catch(_){}};
  const QUEUE_KEY='yx99_offline_queue';

  function readQueue(){ try{return JSON.parse(localStorage.getItem(QUEUE_KEY)||'[]')||[];}catch(_){return[];} }
  function writeQueue(q){ try{localStorage.setItem(QUEUE_KEY, JSON.stringify((q||[]).slice(-200)));}catch(_){} updateBadge(); }
  function updateBadge(){
    const n=readQueue().length;
    let b=document.getElementById('yx99-offline-badge');
    if(!b){
      b=document.createElement('button'); b.id='yx99-offline-badge'; b.type='button'; b.className='ghost-btn tiny-btn yx99-offline-badge';
      b.addEventListener('click',()=>flushQueue(true));
      document.body.appendChild(b);
    }
    b.textContent=n?`待補送 ${n}`:'已同步';
    b.style.display=n?'block':'none';
  }

  async function nativeJsonFetch(url,opt={}){
    const headers={'Content-Type':'application/json',...(opt.headers||{})};
    const res=await fetch(url,{credentials:'same-origin',cache:'no-store',...opt,headers});
    const txt=await res.text(); let data={};
    try{data=txt?JSON.parse(txt):{};}catch(_){data={success:false,error:txt||'伺服器回應格式錯誤'};}
    if(!res.ok||data.success===false){const e=new Error(data.error||data.message||`請求失敗：${res.status}`);e.payload=data;throw e;}
    return data;
  }

  if(!window.__YX99_FETCH_OFFLINE_WRAPPED__){
    window.__YX99_FETCH_OFFLINE_WRAPPED__=true;
    const prevFetch=window.fetch.bind(window);
    window.fetch=async function(input,init){
      let url='', method='GET';
      try{ url=typeof input==='string'?input:(input&&input.url)||''; method=String((init&&init.method)||'GET').toUpperCase(); }catch(_){}
      const isWrite=!['GET','HEAD','OPTIONS'].includes(method);
      try{
        return await prevFetch(input,init);
      }catch(e){
        if(isWrite && url.startsWith('/api/') && !url.includes('/api/offline/replay')){
          const q=readQueue();
          q.push({url,method,body:(init&&init.body)||'',headers:(init&&init.headers)||{},at:Date.now()});
          writeQueue(q);
          toast('網路不穩，已先暫存，恢復連線後會補送','warn');
          return new Response(JSON.stringify({success:true,queued:true,message:'已暫存，待網路恢復後補送'}),{status:200,headers:{'Content-Type':'application/json'}});
        }
        throw e;
      }
    };
  }

  async function flushQueue(manual=false){
    const q=readQueue();
    if(!q.length){ if(manual) toast('沒有待補送資料','ok'); updateBadge(); return; }
    if(!navigator.onLine){ if(manual) toast('目前離線，稍後再補送','warn'); return; }
    const remain=[]; let ok=0;
    for(const item of q){
      try{
        await nativeJsonFetch(item.url,{method:item.method||'POST',body:item.body||'',headers:item.headers||{}});
        ok++;
      }catch(e){
        remain.push(item);
      }
    }
    writeQueue(remain);
    try{ await nativeJsonFetch('/api/offline/replay',{method:'POST',body:JSON.stringify({items:q.filter(x=>!remain.includes(x))})}); }catch(_){}
    if(ok) toast(`已補送 ${ok} 筆離線資料`,'ok');
    if(manual && remain.length) toast(`仍有 ${remain.length} 筆待補送`,'warn');
  }
  window.flushOfflineQueue=flushQueue;
  window.addEventListener('online',()=>flushQueue(false));
  setInterval(()=>flushQueue(false), 45000);

  window.runSystemHealth=async function(){
    const box=$('system-health-panel'); if(!box) return;
    box.innerHTML='<div class="small-note">檢查中…</div>';
    try{
      const d=await nativeJsonFetch('/api/system-health',{method:'GET'});
      const checks=d.checks||[];
      box.innerHTML=`<div class="deduct-card"><strong>${d.ok?'系統狀態：正常':'系統狀態：需要檢查'}</strong><div class="small-note">時間：${esc(d.generated_at||'')}｜問題 ${Number(d.problem_count||0)} 項</div></div>`+
        checks.map(c=>`<div class="deduct-card ${c.ok?'':'error-card'}"><strong>${esc(c.name||'')}</strong><div class="small-note">${c.ok?'正常':'需處理'}｜數量 ${Number(c.count||0)}｜${esc(c.message||'')}</div>${(c.items||[]).slice(0,8).map(it=>`<div class="small-note">• ${esc(JSON.stringify(it))}</div>`).join('')}</div>`).join('');
    }catch(e){ box.innerHTML=`<div class="error-card">${esc(e.message||'健康檢查失敗')}</div>`; }
  };

  const oldDownloadReport=window.downloadReport;
  window.downloadReport=function(type){
    const qs=new URLSearchParams({type:type||'inventory'});
    const start=$('report-start')?.value||''; const end=$('report-end')?.value||''; const customer=$('report-customer')?.value||'';
    if(start) qs.set('start_date',start);
    if(end) qs.set('end_date',end);
    if(customer) qs.set('customer_name',customer);
    location.href='/api/reports/export?'+qs.toString();
  };

  function injectTools(){
    updateBadge();
    if(document.querySelector('[data-yx99-tools-ready]')) return;
    const settings=document.querySelector('.module-screen');
    if(settings && location.pathname.includes('/settings')){
      settings.dataset.yx99ToolsReady='1';
      setTimeout(()=>{ try{ if(window.loadBackups) window.loadBackups(); }catch(_){} },300);
    }
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',injectTools,{once:true}); else injectTools();
  window.addEventListener('pageshow',injectTools);
  setTimeout(()=>flushQueue(false),1200);
  try{window.YX_MASTER=Object.freeze({...(window.YX_MASTER||{}),version:VERSION,flushOfflineQueue:flushQueue,runSystemHealth:window.runSystemHealth});}catch(_){}
})();
/* ==== FIX99: commercial stability tools + offline queue end ==== */

/* ==== FIX100: final total consolidation guard start ==== */
(function(){
  'use strict';
  const VERSION='FIX100_FINAL_TOTAL_CONSOLIDATION';
  if(window.__YX100_FINAL_TOTAL_CONSOLIDATION__) return;
  window.__YX100_FINAL_TOTAL_CONSOLIDATION__=true;
  const $=id=>document.getElementById(id);
  const clean=v=>String(v??'').trim();
  const toast=(m,k='ok')=>{try{(window.toast||window.showToast||function(x){console.log(x)})(m,k)}catch(_){}};
  const delay=(fn,ms=80)=>setTimeout(()=>{try{fn()}catch(e){console.warn('YX100 cleanup',e)}},ms);
  const legacyPanelSelector=[
    '#yx80-warehouse-batch-panel','#yx81-warehouse-batch-panel','#yx82-warehouse-batch-panel','#yx83-warehouse-batch-panel','#yx89-warehouse-batch-panel',
    '#yx82-warehouse-detail-panel','#yx83-warehouse-detail-panel','#yx89-warehouse-detail-panel',
    '.yx80-warehouse-batch-panel:not(#yx91-warehouse-batch-panel)',
    '.yx82-warehouse-detail-panel:not(#yx91-warehouse-detail-panel)'
  ].join(',');

  function normalizeWarehouseModal(){
    const modal=$('warehouse-modal');
    if(!modal) return;
    modal.querySelectorAll(legacyPanelSelector).forEach(el=>{try{el.remove()}catch(_){}});
    const panels=Array.from(modal.querySelectorAll('#yx91-warehouse-batch-panel'));
    panels.slice(1).forEach(el=>{try{el.remove()}catch(_){}});
    modal.querySelectorAll('button').forEach(btn=>{
      const txt=clean(btn.textContent);
      const onclick=btn.getAttribute('onclick')||'';
      if(['加入格位','儲存格位'].includes(txt) || /addSelectedItemToCell|saveWarehouseCell\s*\(/.test(onclick)){
        btn.classList.add('yx100-hidden-legacy');
        btn.style.display='none';
        btn.disabled=true;
        return;
      }
      if(/儲存中|加入中|開啟中/.test(txt)){
        btn.disabled=false;
        btn.dataset.busy='0';
        btn.removeAttribute('aria-busy');
        if(btn.id==='yx91-add-batch-items') btn.textContent='批量加入格位';
        if(btn.id==='yx91-add-batch-row') btn.textContent='增加批量';
      }
    });
    const panel=$('yx91-warehouse-batch-panel');
    if(panel){
      panel.classList.add('yx100-single-batch-panel');
      panel.querySelectorAll('select').forEach(sel=>{ if(!sel.dataset.yx100Fixed){ sel.dataset.yx100Fixed='1'; } });
      panel.querySelectorAll('input[type="number"]').forEach(input=>{
        if(clean(input.value)==='' || Number(input.value)<0) input.value='0';
      });
    }
  }

  function clearBatchInputs(){
    const panel=$('yx91-warehouse-batch-panel');
    if(!panel) return;
    panel.querySelectorAll('select').forEach(sel=>{sel.value='';});
    panel.querySelectorAll('input[type="number"]').forEach(input=>{input.value='0';});
  }

  function currentCellKey(){
    try{
      const c=window.state?.currentCell || window.currentCell || {};
      const z=c.zone || c.area || '';
      const col=c.column_index || c.columnIndex || c.col || '';
      const slot=c.slot_number || c.slotNumber || c.slot || '';
      return [z,col,slot].join('|');
    }catch(_){return '';}
  }

  function normalizeCards(){
    // 只做不破壞資料的視覺收斂：移除舊卡片殘留標籤，避免「尺寸 / 支數x件數 / 客戶」重複出現。
    document.querySelectorAll('.item-card,.product-card,.summary-card,.yx-product-card').forEach(card=>{
      if(card.dataset.yx100CardDone==='1') return;
      const text=clean(card.textContent);
      if(!text || !/[xX×✕]\d+/.test(text)) return;
      card.classList.add('yx100-product-card');
      card.querySelectorAll('.label,.field-label,.muted,.small-note').forEach(el=>{
        const t=clean(el.textContent);
        if(/^客戶[:：]/.test(t) || t==='尺寸' || /^支數/.test(t)) el.classList.add('yx100-hidden-legacy');
      });
      card.dataset.yx100CardDone='1';
    });
  }

  function normalizeTodayChanges(){
    const page=document.querySelector('.today-page,.today-changes-page,#today-changes-list') || document.body;
    if(!page) return;
    page.querySelectorAll('[data-type="unplaced"],.unplaced-card,.today-card').forEach(card=>{
      const txt=clean(card.textContent);
      if(!/未入倉|未錄入倉庫圖/.test(txt)) return;
      card.classList.add('yx100-unplaced-card');
      // 避免同時顯示總筆數造成跳動，只保留件數語意。
      card.querySelectorAll('.count,.qty,.num,strong').forEach(el=>{
        const t=clean(el.textContent);
        const m=t.match(/(\d+)\s*(?:件|pcs?)/i);
        if(m) el.textContent=m[1]+'件';
      });
    });
  }

  const base={
    confirmSubmit: window.confirmSubmit,
    openWarehouseModal: window.openWarehouseModal,
    refreshWarehouseBatchPanel: window.refreshWarehouseBatchPanel,
    saveWarehouseCell: window.saveWarehouseCell,
    loadTodayChanges: window.loadTodayChanges,
    loadCustomerBlocks: window.loadCustomerBlocks,
    renderWarehouseCellItems: window.renderWarehouseCellItems,
  };

  async function confirmSubmit100(){
    const btn=$('submit-btn') || document.querySelector('[onclick*="confirmSubmit"]');
    if(btn && btn.dataset.yx100Busy==='1') return false;
    try{
      if(btn){btn.dataset.yx100Busy='1'; btn.classList.add('is-busy');}
      const fn=base.confirmSubmit && base.confirmSubmit!==confirmSubmit100 ? base.confirmSubmit : (window.YX_MASTER && window.YX_MASTER.confirmSubmit!==confirmSubmit100 ? window.YX_MASTER.confirmSubmit : null);
      if(typeof fn==='function') return await fn.apply(this,arguments);
      toast('找不到送出流程，請重新整理頁面','error');
      return false;
    }finally{
      if(btn){btn.dataset.yx100Busy='0'; btn.classList.remove('is-busy');}
      delay(()=>{normalizeCards(); normalizeTodayChanges();},180);
    }
  }
  confirmSubmit100.__yx100Final=true;

  function openWarehouseModal100(){
    const before=currentCellKey();
    const ret=typeof base.openWarehouseModal==='function' && base.openWarehouseModal!==openWarehouseModal100 ? base.openWarehouseModal.apply(this,arguments) : undefined;
    delay(()=>{
      const after=currentCellKey();
      normalizeWarehouseModal();
      if(after && after!==window.__YX100_LAST_CELL_KEY__){
        clearBatchInputs();
        window.__YX100_LAST_CELL_KEY__=after;
      }else if(before && before!==after){
        clearBatchInputs();
        window.__YX100_LAST_CELL_KEY__=after;
      }
      normalizeWarehouseModal();
    },120);
    delay(normalizeWarehouseModal,450);
    return ret;
  }

  function refreshWarehouseBatchPanel100(){
    const args=arguments;
    const ret=typeof base.refreshWarehouseBatchPanel==='function' && base.refreshWarehouseBatchPanel!==refreshWarehouseBatchPanel100 ? base.refreshWarehouseBatchPanel.apply(this,args) : undefined;
    delay(normalizeWarehouseModal,40);
    return ret;
  }

  async function saveWarehouseCell100(){
    const btn=$('yx91-add-batch-items');
    try{
      if(btn){btn.dataset.busy='1'; btn.disabled=true; btn.textContent='儲存中…';}
      const fn=base.saveWarehouseCell && base.saveWarehouseCell!==saveWarehouseCell100 ? base.saveWarehouseCell : null;
      if(typeof fn==='function') return await fn.apply(this,arguments);
      toast('找不到格位儲存流程','error');
      return false;
    }finally{
      if(btn){btn.dataset.busy='0'; btn.disabled=false; btn.textContent='批量加入格位';}
      delay(normalizeWarehouseModal,80);
    }
  }

  async function loadTodayChanges100(){
    const fn=base.loadTodayChanges && base.loadTodayChanges!==loadTodayChanges100 ? base.loadTodayChanges : null;
    const ret=typeof fn==='function' ? await fn.apply(this,arguments) : undefined;
    normalizeTodayChanges();
    return ret;
  }

  async function loadCustomerBlocks100(){
    const fn=base.loadCustomerBlocks && base.loadCustomerBlocks!==loadCustomerBlocks100 ? base.loadCustomerBlocks : null;
    const ret=typeof fn==='function' ? await fn.apply(this,arguments) : undefined;
    delay(normalizeCards,80);
    return ret;
  }

  function install(){
    document.documentElement.dataset.yxFix100=VERSION;
    if(typeof base.confirmSubmit==='function') window.confirmSubmit=confirmSubmit100;
    if(typeof base.openWarehouseModal==='function') window.openWarehouseModal=openWarehouseModal100;
    if(typeof base.refreshWarehouseBatchPanel==='function') window.refreshWarehouseBatchPanel=refreshWarehouseBatchPanel100;
    if(typeof base.saveWarehouseCell==='function') window.saveWarehouseCell=saveWarehouseCell100;
    if(typeof base.loadTodayChanges==='function') window.loadTodayChanges=loadTodayChanges100;
    if(typeof base.loadCustomerBlocks==='function') window.loadCustomerBlocks=loadCustomerBlocks100;
    try{
      window.YX_MASTER=Object.freeze({
        ...(window.YX_MASTER||{}),
        version:VERSION,
        confirmSubmit:window.confirmSubmit,
        openWarehouseModal:window.openWarehouseModal,
        refreshWarehouseBatchPanel:window.refreshWarehouseBatchPanel,
        saveWarehouseCell:window.saveWarehouseCell,
        loadTodayChanges:window.loadTodayChanges,
        loadCustomerBlocks:window.loadCustomerBlocks,
        normalizeWarehouseModal,
      });
    }catch(_e){}
    normalizeWarehouseModal(); normalizeCards(); normalizeTodayChanges();
  }

  let scheduled=false;
  function scheduleCleanup(){
    if(scheduled) return;
    scheduled=true;
    requestAnimationFrame(()=>{scheduled=false; normalizeWarehouseModal(); normalizeCards(); normalizeTodayChanges();});
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true}); else install();
  window.addEventListener('pageshow',install);
  [250,800,1600,3200].forEach(ms=>setTimeout(install,ms));
  try{ new MutationObserver(scheduleCleanup).observe(document.body,{childList:true,subtree:true}); }catch(_e){}
})();
/* ==== FIX100: final total consolidation guard end ==== */


/* ==== FIX101: final UI/warehouse/today consolidation start ==== */
(function(){
  'use strict';
  const VERSION='FIX101_FINAL_UI_WAREHOUSE_TODAY_CONSOLIDATION';
  if(window.__YX101_FINAL_UI_WAREHOUSE_TODAY_CONSOLIDATION__) return;
  window.__YX101_FINAL_UI_WAREHOUSE_TODAY_CONSOLIDATION__=true;
  const $=id=>document.getElementById(id);
  const clean=v=>String(v??'').trim();
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const toast=(m,k='ok')=>{try{(window.toast||window.showToast||function(x){console.log(x)})(m,k)}catch(_){}};
  const api=window.yxApi||window.requestJSON||(async function(url,opt={}){const res=await fetch(url,{credentials:'same-origin',cache:'no-store',...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}}); const txt=await res.text(); let data={}; try{data=txt?JSON.parse(txt):{};}catch(_){data={success:false,error:txt||'伺服器回應格式錯誤'};} if(!res.ok||data.success===false){const e=new Error(data.error||data.message||`請求失敗：${res.status}`); e.payload=data; throw e;} return data;});
  window.yxApi=api;
  const path=()=>location.pathname||'';
  const modKey=()=>document.querySelector('.module-screen')?.dataset.module||'';
  const state=()=>{window.state=window.state||{}; window.state.warehouse=window.state.warehouse||{cells:[],availableItems:[]}; return window.state;};
  function parseItems(raw){try{return Array.isArray(raw)?raw:JSON.parse(raw||'[]');}catch(_){return [];}}
  function qtyOf(it){const n=Number(it?.qty??it?.unplaced_qty??it?.total_qty??0); return Number.isFinite(n)?Math.max(0,Math.floor(n)):0;}
  function customerOf(it){return clean(it?.customer_name||'未指定客戶')||'未指定客戶';}
  function productOf(it){return clean(it?.product_text||it?.product_size||it?.product||'');}
  function cellKey(zone,col,slot){return [String(zone||'').toUpperCase(),Number(col),'direct',Number(slot)];}
  function normalizeCellKey(key){if(!Array.isArray(key))return null; return [String(key[0]||'').toUpperCase(),Number(key[1]),'direct',Number(key.length>=4?key[3]:key[2])];}
  function findCell(zone,col,slot){return (state().warehouse.cells||[]).find(c=>String(c.zone)===String(zone)&&Number(c.column_index)===Number(col)&&Number(c.slot_number)===Number(slot));}
  function cellItems(zone,col,slot){try{if(typeof window.getCellItems==='function') return window.getCellItems(zone,col,slot)||[];}catch(_){} return parseItems(findCell(zone,col,slot)?.items_json);}
  function setLocalCellItems(zone,col,slot,items){let c=findCell(zone,col,slot); if(!c){c={zone,column_index:Number(col),slot_type:'direct',slot_number:Number(slot),items_json:'[]',note:''}; state().warehouse.cells=state().warehouse.cells||[]; state().warehouse.cells.push(c);} c.items_json=JSON.stringify(items||[]);}
  function saveCell(zone,col,slot,items,note=''){setLocalCellItems(zone,col,slot,items); return api('/api/warehouse/cell',{method:'POST',body:JSON.stringify({zone,column_index:Number(col),slot_type:'direct',slot_number:Number(slot),items,note})});}

  // 1) 今日異動：只保留一個穩定版，避免未入倉卡片在總筆數 / 總件數之間跳動。
  let todayFilter='';
  function fmt24(v){const raw=clean(v); const m=raw.match(/(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::\d{2})?/); return m?`${m[1]} ${m[2]}`:raw;}
  function showTodayPanels(filter){document.querySelectorAll('[data-today-panel]').forEach(p=>{const key=p.dataset.todayPanel||''; p.classList.toggle('yx101-hidden',!!filter&&key!==filter);}); document.querySelectorAll('.yx101-today-card').forEach(c=>c.classList.toggle('active',(c.dataset.todayCard||'')===filter));}
  function logCard(r){return `<div class="today-item deduct-card" data-log-id="${Number(r.id||0)}"><strong>${esc(r.action||'異動')}</strong><div class="small-note">${esc(fmt24(r.created_at))}｜${esc(r.username||'')}</div></div>`;}
  function fillList(id,rows,empty){const el=$(id); if(el) el.innerHTML=(rows||[]).map(logCard).join('')||`<div class="empty-state-card compact-empty">${esc(empty)}</div>`;}
  async function loadTodayChanges101(){
    try{
      const d=await api('/api/today-changes?ts='+Date.now(),{method:'GET'}); const s=d.summary||{};
      const cards=[['inbound','進貨',Number(s.inbound_count||0),'筆'],['outbound','出貨',Number(s.outbound_count||0),'筆'],['orders','新增訂單',Number(s.new_order_count||0),'筆'],['unplaced','未入倉',Number(s.unplaced_count||0),'件']];
      const summary=$('today-summary-cards');
      if(summary){
        const next=cards.map(c=>`<div class="yx101-today-card" data-today-card="${c[0]}"><div class="title">${esc(c[1])}</div><div class="sub">${c[2]}${esc(c[3])}</div></div>`).join('');
        if(summary.dataset.yx101Html!==next){summary.innerHTML=next; summary.dataset.yx101Html=next;}
        if(summary.dataset.yx101Click!=='1'){
          summary.dataset.yx101Click='1';
          summary.addEventListener('click',ev=>{const card=ev.target.closest('.yx101-today-card'); if(!card) return; const key=card.dataset.todayCard||''; todayFilter=todayFilter===key?'':key; showTodayPanels(todayFilter);},true);
        }
      }
      fillList('today-inbound-list',d.feed?.inbound,'今天沒有進貨');
      fillList('today-outbound-list',d.feed?.outbound,'今天沒有出貨');
      fillList('today-order-list',d.feed?.new_orders,'今天沒有新增訂單');
      const unplaced=$('today-unplaced-list');
      if(unplaced){const arr=Array.isArray(d.unplaced_items)?d.unplaced_items:[]; unplaced.innerHTML=arr.length?arr.map(it=>`<div class="deduct-card"><strong>${esc(productOf(it))}</strong><div class="small-note">${esc(customerOf(it))}｜未入倉 ${Number(it.unplaced_qty??it.qty??0)} 件${it.source_summary?`｜來源：${esc(it.source_summary)}`:''}</div></div>`).join(''):'<div class="empty-state-card compact-empty">目前沒有未入倉商品</div>';}
      showTodayPanels(todayFilter); try{await api('/api/today-changes/read',{method:'POST',body:JSON.stringify({})});}catch(_){} return d;
    }catch(e){const summary=$('today-summary-cards'); if(summary) summary.innerHTML=`<div class="error-card">${esc(e.message||'今日異動載入失敗')}</div>`;}
  }

  // 2) 倉庫格位：A/B 區統一顯示，同客戶不同商品只顯示總件數明細 4+1+13 件。
  function groupSignature(items){return JSON.stringify((items||[]).map((it,idx)=>[customerOf(it),productOf(it),qtyOf(it),idx]));}
  function renderSlotCompact101(slot){
    const zone=slot.dataset.zone; const col=Number(slot.dataset.column||slot.dataset.col||0); const num=Number(slot.dataset.num||slot.dataset.slot||0); if(!zone||!col||!num)return;
    const count=slot.querySelector('.slot-count'); if(!count)return;
    const items=cellItems(zone,col,num).filter(it=>qtyOf(it)>0); const sig=groupSignature(items);
    if(slot.dataset.yx101Sig===sig && (count.querySelector('[data-yx101-drag-group]')||count.querySelector('.slot-line.empty'))) return;
    slot.dataset.yx92Sig=sig; slot.dataset.yx94Sig=sig; slot.dataset.yx95Sig=sig; slot.dataset.yx97Sig=sig; slot.dataset.yx101Sig=sig;
    if(!items.length){count.innerHTML='<div class="slot-line empty">空格</div>'; return;}
    const groups=new Map(); items.forEach((it,idx)=>{const c=customerOf(it); if(!groups.has(c))groups.set(c,[]); groups.get(c).push({...it,__idx:idx});});
    count.innerHTML=Array.from(groups.entries()).map(([customer,arr])=>{const qtys=arr.map(qtyOf).filter(q=>q>0); const payload={kind:'warehouse-group',fromKey:cellKey(zone,col,num),customer_name:customer,item_indexes:arr.map(x=>x.__idx)}; return `<div class="yx101-cell-customer-line" draggable="true" data-yx101-drag-group="${esc(JSON.stringify(payload))}" title="拖拉 ${esc(customer)} 到其他格，會放在目標格最前排"><b>${esc(customer)}</b><span>${esc(qtys.join('+')||'0')}件</span></div>`;}).join('');
    bindGroupDrag101(count);
  }
  function bindGroupDrag101(root){(root||document).querySelectorAll('[data-yx101-drag-group]').forEach(el=>{if(el.dataset.yx101DragBound==='1')return; el.dataset.yx101DragBound='1'; el.addEventListener('dragstart',ev=>{try{ev.dataTransfer.effectAllowed='move'; ev.dataTransfer.setData('text/plain',el.dataset.yx101DragGroup||''); el.classList.add('yx92-dragging');}catch(_){}}); el.addEventListener('dragend',()=>el.classList.remove('yx92-dragging'));});}
  async function moveGroup101(payload,toKey){
    const from=normalizeCellKey(payload.fromKey||payload.from_key); const to=normalizeCellKey(toKey); if(!from||!to)throw new Error('格位資料不完整');
    if(from[0]===to[0]&&from[1]===to[1]&&from[3]===to[3]){toast('已在同一格','warn');return;}
    const src=cellItems(from[0],from[1],from[3]); const dst=cellItems(to[0],to[1],to[3]); const indexes=new Set((payload.item_indexes||[]).map(Number));
    const moved=[]; const remain=[]; src.forEach((it,idx)=>{if(indexes.has(idx)||customerOf(it)===clean(payload.customer_name)){moved.push({...it,placement_label:'前排',layer_label:'前排'});}else remain.push(it);});
    if(!moved.length)throw new Error('沒有可搬移的商品');
    setLocalCellItems(from[0],from[1],from[3],remain); setLocalCellItems(to[0],to[1],to[3],moved.concat(dst));
    await saveCell(from[0],from[1],from[3],remain,findCell(from[0],from[1],from[3])?.note||'');
    await saveCell(to[0],to[1],to[3],moved.concat(dst),findCell(to[0],to[1],to[3])?.note||'');
    toast(`搬移完成：${clean(payload.customer_name||'商品')} 已放到最前排`,'ok'); try{await(window.renderWarehouse&&window.renderWarehouse(true));}catch(_){try{await window.renderWarehouse();}catch(__){}} setTimeout(compactWarehouseAll101,180);
  }
  function bindDrop101(){document.querySelectorAll('#zone-A-grid .vertical-slot,#zone-B-grid .vertical-slot,.yx67-warehouse-slot').forEach(slot=>{if(slot.dataset.yx101Drop==='1')return; slot.dataset.yx101Drop='1'; slot.addEventListener('dragover',ev=>{ev.preventDefault(); try{ev.dataTransfer.dropEffect='move';}catch(_){} slot.classList.add('yx97-drag-over');},true); slot.addEventListener('dragleave',()=>slot.classList.remove('yx97-drag-over'),true); slot.addEventListener('drop',async ev=>{const raw=ev.dataTransfer?.getData?.('text/plain')||''; if(raw.indexOf('warehouse-group')<0)return; let payload=null; try{payload=JSON.parse(raw);}catch(_){return;} if(payload.kind!=='warehouse-group')return; ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation(); slot.classList.remove('yx97-drag-over'); try{await moveGroup101(payload,cellKey(slot.dataset.zone,Number(slot.dataset.column||slot.dataset.col||0),Number(slot.dataset.num||slot.dataset.slot||0)));}catch(e){toast(e.message||'拖拉搬移失敗','error');}},true);});}
  function compactWarehouseAll101(){document.querySelectorAll('#zone-A-grid .vertical-slot,#zone-B-grid .vertical-slot,.yx67-warehouse-slot').forEach(renderSlotCompact101); bindDrop101();}

  // 3) 未入倉標籤：只顯示總件數，點開不改字、不跳版。
  function unplacedTotal(items){return (items||[]).reduce((sum,it)=>sum+(Number(it.unplaced_qty??it.qty??0)||0),0);}
  async function getAvailableItems101(){try{const d=await api('/api/warehouse/available-items?ts='+Date.now(),{method:'GET'}); const items=Array.isArray(d.items)?d.items:[]; state().warehouse.availableItems=items; return items;}catch(_){return state().warehouse.availableItems||[];}}
  async function updateUnplacedPill101(){const pill=$('warehouse-unplaced-pill'); if(!pill)return; const total=unplacedTotal(await getAvailableItems101()); const text=`未入倉：${total}件`; if(pill.textContent!==text) pill.textContent=text; pill.dataset.yx101Total=String(total); pill.title=`庫存、訂單、總單尚未加入倉庫圖的總件數：${total}件`;}
  async function toggleWarehouseUnplacedHighlight101(){
    const box=$('warehouse-unplaced-list-inline'); if(!box)return false;
    if(!box.classList.contains('hidden')){box.classList.add('hidden'); updateUnplacedPill101(); return false;}
    const items=await getAvailableItems101();
    box.innerHTML=items.length?items.map(it=>`<div class="deduct-card"><strong>${esc(customerOf(it))}</strong><div class="small-note">${esc(productOf(it))}</div><div class="small-note">未入倉 ${Number(it.unplaced_qty??it.qty??0)} 件${it.source_summary?`｜來源：${esc(it.source_summary)}`:''}</div></div>`).join(''):'<div class="empty-state-card compact-empty">目前沒有未入倉商品</div>';
    box.classList.remove('hidden'); updateUnplacedPill101(); return false;
  }

  // 4) 代辦日期：輸入只顯示月/日；送出前自動補當年，列表也只顯示月/日。
  function normalizeTodoInput(){const el=$('todo-date'); if(!el)return; try{el.type='text';}catch(_){} el.inputMode='numeric'; el.autocomplete='off'; el.placeholder='月/日，例如 4/26'; const v=clean(el.value); const m=v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/); if(m) el.value=`${Number(m[2])}/${Number(m[3])}`;}
  function toApiDate(v){const raw=clean(v); if(!raw)return ''; let m=raw.match(/^(\d{1,2})[\/\-.](\d{1,2})$/); if(m){const y=new Date().getFullYear(); const mm=String(Number(m[1])).padStart(2,'0'); const dd=String(Number(m[2])).padStart(2,'0'); return `${y}-${mm}-${dd}`;} m=raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/); if(m)return `${m[1]}-${String(Number(m[2])).padStart(2,'0')}-${String(Number(m[3])).padStart(2,'0')}`; return raw;}
  function displayMD(v){const m=clean(v).match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/); return m?`${Number(m[2])}/${Number(m[3])}`:clean(v);}
  let baseSaveTodo=null;
  function wrapTodoSave(){const cur=window.saveTodoItem; if(typeof cur!=='function'||cur.__yx101Todo)return; baseSaveTodo=cur; const wrapped=async function(){const el=$('todo-date'); const original=clean(el?.value||''); const apiDate=toApiDate(original); let ok=false; if(el)el.value=apiDate; try{const r=await baseSaveTodo.apply(this,arguments); ok=true; return r;}finally{if(el && !ok)el.value=original; setTimeout(normalizeTodoInput,80);}}; Object.defineProperty(wrapped,'__yx101Todo',{value:true}); window.saveTodoItem=wrapped;}
  function formatTodoDates(){document.querySelectorAll('.todo-chip-date,.todo-meta-value').forEach(el=>{const t=clean(el.textContent); if(/^\d{4}-\d{1,2}-\d{1,2}$/.test(t)) el.textContent=displayMD(t);}); normalizeTodoInput();}

  // 5) 清掉空白 0 件卡片，避免圖二那種「未填材質 0件」空卡重複出現。
  function hideEmptyProductCards(){document.querySelectorAll('.yx63-item-card,.deduct-card,.card,.product-card').forEach(card=>{const txt=clean(card.textContent).replace(/\s+/g,''); if(/未填材質/.test(txt)&&/0件/.test(txt)&&!/[xX×✕]\d+/.test(txt)){card.classList.add('yx101-empty-product-card');}});}

  // 6) 安裝最後母版：把舊版延遲 installer 又蓋回來的入口，再拉回 FIX101。
  const baseRender=()=>{try{compactWarehouseAll101();}catch(_){}};
  function wrapRenderWarehouse(){const cur=window.renderWarehouse; if(typeof cur!=='function'||cur.__yx101Render)return; const wrapped=async function(){const r=await cur.apply(this,arguments); setTimeout(()=>{compactWarehouseAll101(); updateUnplacedPill101();},160); return r;}; Object.defineProperty(wrapped,'__yx101Render',{value:true}); window.renderWarehouse=wrapped;}
  let lastTodayAutoLoad=0;
  let lastUnplacedRefresh=0;
  function install(){
    document.documentElement.dataset.yxFix101=VERSION;
    if(path().includes('/today-changes')){ /* FIX108 disabled FIX101 old today auto loader */ }
    if(modKey()==='warehouse'||document.querySelector('#zone-A-grid,#zone-B-grid')){
      window.toggleWarehouseUnplacedHighlight=toggleWarehouseUnplacedHighlight101;
      wrapRenderWarehouse();
      const now=Date.now();
      if(now-lastUnplacedRefresh>3000){lastUnplacedRefresh=now; updateUnplacedPill101();}
      compactWarehouseAll101();
    }
    wrapTodoSave(); normalizeTodoInput(); formatTodoDates(); hideEmptyProductCards();
    try{window.YX_MASTER=Object.freeze({...(window.YX_MASTER||{}),version:VERSION,loadTodayChanges:window.loadTodayChanges,toggleWarehouseUnplacedHighlight:window.toggleWarehouseUnplacedHighlight,compactWarehouseAll:compactWarehouseAll101});}catch(_){}
  }
  let scheduled=false; function schedule(){if(scheduled)return; scheduled=true; requestAnimationFrame(()=>{scheduled=false; install();});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true}); else install();
  window.addEventListener('pageshow',install);
  [250,800,1600,3200,6500,10000].forEach(ms=>setTimeout(install,ms));
  try{new MutationObserver(()=>schedule()).observe(document.body,{childList:true,subtree:true});}catch(_){}
})();
/* ==== FIX101: final UI/warehouse/today consolidation end ==== */


/* ==== FIX102: full QA cleanup and last-master guard start ==== */
(function(){
  'use strict';
  const VERSION='FIX103_SPEED_FONT_STABLE';
  if(window.__YX102_FULL_QA_CLEANUP__) return;
  window.__YX102_FULL_QA_CLEANUP__=true;
  const $=id=>document.getElementById(id);
  const clean=v=>String(v??'').trim();
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const api=window.yxApi||window.requestJSON||async function(url,opt={}){const r=await fetch(url,{credentials:'same-origin',...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}});let d={};try{d=await r.json();}catch(_){d={};}if(!r.ok||d.success===false){throw new Error(d.error||d.message||`請求失敗：${r.status}`);}return d;};
  const state=()=>window.state||(window.state={warehouse:{cells:[],availableItems:[],activeZone:'A'}});
  const toast=(m,k='ok')=>{try{(window.toast||window.showToast||function(x){console.log(x)})(m,k)}catch(_){}};
  const modKey=()=>document.querySelector('.module-screen')?.dataset.module||(typeof window.currentModule==='function'?window.currentModule():'');
  const normX=v=>clean(v).replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/\s+/g,'');
  const qtyOf=it=>{const n=Number(it?.qty??it?.unplaced_qty??it?.total_qty??0);return Number.isFinite(n)&&n>0?Math.floor(n):0;};
  const customerOf=it=>clean(it?.customer_name||it?.customer||'未指定客戶')||'未指定客戶';
  const productOf=it=>clean(it?.product_text||it?.product_size||it?.size||'');
  const materialOf=it=>{let m=clean(it?.material||it?.product_code||it?.wood_type||''); if(!m||m===productOf(it)||/^未填/.test(m)) return ''; return m;};
  function findCell(z,c,n){return (state().warehouse?.cells||[]).find(x=>String(x.zone)===String(z)&&Number(x.column_index)===Number(c)&&Number(x.slot_number)===Number(n));}
  function parseItemsJson(x){if(Array.isArray(x))return x; try{return JSON.parse(x||'[]')||[];}catch(_){return [];}}
  function cellItems(z,c,n){const cell=findCell(z,c,n); return parseItemsJson(cell?.items_json).filter(it=>qtyOf(it)>0 && productOf(it));}
  function cellKey(z,c,n){return [String(z||'A'),Number(c)||1,'direct',Number(n)||1];}
  function setLocalCellItems(z,c,n,items){const wh=state().warehouse=state().warehouse||{cells:[],availableItems:[],activeZone:'A'};let cell=findCell(z,c,n);if(!cell){cell={zone:z,column_index:Number(c)||1,slot_type:'direct',slot_number:Number(n)||1,items_json:[]};wh.cells.push(cell);}cell.items_json=(items||[]).filter(it=>qtyOf(it)>0&&productOf(it));}
  async function saveCell(z,c,n,items,note=''){return api('/api/warehouse/cell',{method:'POST',body:JSON.stringify({zone:z,column_index:Number(c)||1,slot_type:'direct',slot_number:Number(n)||1,items_json:(items||[]).filter(it=>qtyOf(it)>0&&productOf(it)),note:note||'',request_key:'yx102_'+Date.now()+'_'+Math.random().toString(36).slice(2)})});}

  function qtyPartsForCustomer(arr){const parts=(arr||[]).map(qtyOf).filter(q=>q>0);return parts.length?parts.join('+'):'0';}
  function groupSignature(items){return JSON.stringify((items||[]).map(it=>[customerOf(it),productOf(it),qtyOf(it),materialOf(it)]));}
  function bindGroupDrag(root){(root||document).querySelectorAll('[data-yx102-drag-group]').forEach(el=>{if(el.dataset.yx102DragBound==='1')return;el.dataset.yx102DragBound='1';el.addEventListener('dragstart',ev=>{try{ev.dataTransfer.effectAllowed='move';ev.dataTransfer.setData('text/plain',el.dataset.yx102DragGroup||'');el.classList.add('yx92-dragging');}catch(_){}});el.addEventListener('dragend',()=>el.classList.remove('yx92-dragging'));});}
  function renderSlotCompact(slot){
    if(!slot) return;
    const z=slot.dataset.zone||slot.getAttribute('data-zone')||'A';
    const c=Number(slot.dataset.column||slot.dataset.col||slot.getAttribute('data-column')||1);
    const n=Number(slot.dataset.num||slot.dataset.slot||slot.getAttribute('data-num')||1);
    const count=slot.querySelector('.slot-count')||slot.querySelector('.cell-content')||slot;
    const items=cellItems(z,c,n);
    const sig=groupSignature(items);
    if(slot.dataset.yx102Sig===sig && count.querySelector('[data-yx102-drag-group],.slot-line.empty')) return;
    slot.dataset.yx102Sig=sig; slot.dataset.yx101Sig=sig; slot.dataset.yx97Sig=sig;
    if(!items.length){count.innerHTML='<div class="slot-line empty">空格</div>';return;}
    const groups=new Map();
    items.forEach((it,idx)=>{const cst=customerOf(it); if(!groups.has(cst))groups.set(cst,[]); groups.get(cst).push({...it,__idx:idx});});
    count.innerHTML=Array.from(groups.entries()).map(([customer,arr])=>{const payload={kind:'warehouse-group',fromKey:cellKey(z,c,n),customer_name:customer,item_indexes:arr.map(x=>x.__idx)};return `<div class="yx102-cell-customer-line" draggable="true" data-yx102-drag-group="${esc(JSON.stringify(payload))}" title="拖拉到其他格會放最前排"><b>${esc(customer)}</b><span>${esc(qtyPartsForCustomer(arr))}件</span></div>`;}).join('');
    bindGroupDrag(count);
  }
  async function moveGroup(payload,toKey){
    const from=Array.isArray(payload.fromKey)?payload.fromKey:payload.fromKey||payload.from_key; const to=toKey;
    if(!from||!to) throw new Error('格位資料不完整');
    const fz=from[0],fc=Number(from[1]),fn=Number(from[3]??from[2]); const tz=to[0],tc=Number(to[1]),tn=Number(to[3]??to[2]);
    if(String(fz)===String(tz)&&fc===tc&&fn===tn){toast('已在同一格','warn');return;}
    const src=cellItems(fz,fc,fn); const dst=cellItems(tz,tc,tn); const wanted=new Set((payload.item_indexes||[]).map(Number));
    const moved=[],remain=[]; src.forEach((it,idx)=>{if(wanted.has(idx)||customerOf(it)===clean(payload.customer_name)){moved.push({...it,placement_label:'前排',layer_label:'前排'});}else remain.push(it);});
    if(!moved.length) throw new Error('沒有可搬移的商品');
    setLocalCellItems(fz,fc,fn,remain); setLocalCellItems(tz,tc,tn,moved.concat(dst));
    await saveCell(fz,fc,fn,remain,findCell(fz,fc,fn)?.note||''); await saveCell(tz,tc,tn,moved.concat(dst),findCell(tz,tc,tn)?.note||'');
    toast(`搬移完成：${clean(payload.customer_name||'商品')} 已放到最前排`,'ok');
    try{await (window.renderWarehouse&&window.renderWarehouse(true));}catch(_){try{await window.renderWarehouse();}catch(__){}}
    setTimeout(compactWarehouseAll,160);
  }
  function bindDrops(){document.querySelectorAll('#zone-A-grid .vertical-slot,#zone-B-grid .vertical-slot,.yx67-warehouse-slot').forEach(slot=>{if(slot.dataset.yx102Drop==='1')return;slot.dataset.yx102Drop='1';slot.addEventListener('dragover',ev=>{ev.preventDefault();try{ev.dataTransfer.dropEffect='move';}catch(_){}slot.classList.add('yx97-drag-over');},true);slot.addEventListener('dragleave',()=>slot.classList.remove('yx97-drag-over'),true);slot.addEventListener('drop',async ev=>{const raw=ev.dataTransfer?.getData?.('text/plain')||'';if(raw.indexOf('warehouse-group')<0)return;let p=null;try{p=JSON.parse(raw);}catch(_){return;}if(p.kind!=='warehouse-group')return;ev.preventDefault();ev.stopPropagation();ev.stopImmediatePropagation();slot.classList.remove('yx97-drag-over');try{await moveGroup(p,cellKey(slot.dataset.zone,Number(slot.dataset.column||slot.dataset.col||0),Number(slot.dataset.num||slot.dataset.slot||0)));}catch(e){toast(e.message||'拖拉搬移失敗','error');}},true);});}
  function compactWarehouseAll(){document.querySelectorAll('#zone-A-grid .vertical-slot,#zone-B-grid .vertical-slot,.yx67-warehouse-slot').forEach(renderSlotCompact);bindDrops();stabilizeWarehouseToolbar();}

  function stableUnplacedTotal(items){return (items||[]).reduce((s,it)=>s+(Number(it.unplaced_qty??it.qty??0)||0),0);}
  let unplacedSeq=0;
  async function refreshUnplacedPill(force=false){
    const pill=$('warehouse-unplaced-pill'); if(!pill) return;
    const seq=++unplacedSeq;
    let items=state().warehouse?.availableItems||[];
    if(force||!items.length){try{const d=await api('/api/warehouse/available-items?ts='+Date.now(),{method:'GET'}); if(seq!==unplacedSeq)return; items=Array.isArray(d.items)?d.items:[]; state().warehouse.availableItems=items;}catch(_){}}
    const total=stableUnplacedTotal(items); const text=`未入倉：${total}件`;
    if(pill.textContent!==text) pill.textContent=text;
    pill.dataset.yx102Total=String(total); pill.classList.add('yx102-stable-pill'); pill.title=`未入倉總件數：${total}件`;
  }
  async function toggleUnplaced(){
    const box=$('warehouse-unplaced-list-inline'); if(!box) return false;
    if(!box.classList.contains('hidden')){box.classList.add('hidden'); refreshUnplacedPill(false); return false;}
    let items=state().warehouse?.availableItems||[];
    if(!items.length){try{const d=await api('/api/warehouse/available-items?ts='+Date.now(),{method:'GET'}); items=Array.isArray(d.items)?d.items:[]; state().warehouse.availableItems=items;}catch(e){toast(e.message||'未入倉資料讀取失敗','error');}}
    box.innerHTML=items.length?items.map(it=>`<div class="deduct-card"><strong>${esc(customerOf(it))}</strong><div class="small-note">${esc(productOf(it))}</div><div class="small-note">未入倉 ${Number(it.unplaced_qty??it.qty??0)||0} 件${it.source_summary?`｜來源：${esc(it.source_summary)}`:''}</div></div>`).join(''):'<div class="empty-state-card compact-empty">目前沒有未入倉商品</div>';
    box.classList.remove('hidden'); refreshUnplacedPill(false); return false;
  }
  function stabilizeWarehouseToolbar(){const candidates=[$('warehouse-unplaced-pill')?.parentElement, document.querySelector('.warehouse-toolbar'), document.querySelector('.warehouse-tools')].filter(Boolean);candidates.forEach(el=>el.classList.add('yx102-warehouse-toolbar')); refreshUnplacedPill(false);}

  function formulaLineFromText(text){const t=normX(text); if(!t||!t.includes('=')) return t; const [left,...right]=t.split('='); return `${left}=${right.join('=')}`;}
  function rewriteProductCards(){
    document.querySelectorAll('.item-card,.product-card,.summary-card,.yx-product-card,.yx63-item-card,.deduct-card').forEach(card=>{
      if(card.closest('#today-summary-cards,#today-inbound-list,#today-outbound-list,#today-order-list,#today-unplaced-list,#warehouse-unplaced-list-inline')) return;
      const txt=clean(card.textContent).replace(/\s+/g,' ');
      if(/未填材質/.test(txt)&&/0件/.test(txt)&&!/[xX×✕]\s*\d+/.test(txt)){card.classList.add('yx102-hidden');return;}
      if(card.dataset.yx102ProductDone==='1') return;
      const formula=(txt.match(/[A-Za-z0-9.]+\s*[xX×✕]\s*[A-Za-z0-9._-]+\s*[xX×✕]\s*[A-Za-z0-9._-]+\s*[=＝]\s*[^\n|｜]+/)||[])[0];
      if(!formula) return;
      const material=(txt.match(/(?:材質[:：]?\s*)?(RDT|尤加利|南方松|鐵杉|花旗|杉木|柳安|未填材質)/i)||[])[1]||'';
      card.classList.add('yx102-stable-card');
      card.querySelectorAll('.label,.field-label,.muted,.small-note').forEach(el=>{const t=clean(el.textContent); if(/^客戶[:：]/.test(t)||t==='尺寸'||/^支數/.test(t)) el.classList.add('yx102-hidden');});
      if(!card.querySelector('.yx102-product-line')){const line=document.createElement('div'); line.className='yx102-product-line'; line.innerHTML=`${material?`<span class="yx102-material">${esc(material)}</span>`:''}<span class="yx102-formula">${esc(formulaLineFromText(formula))}</span>`; card.insertBefore(line, card.firstChild);}
      card.dataset.yx102ProductDone='1';
    });
  }

  let todayLoading=null, activeTodayFilter='all';
  function renderTodaySummary(data){const box=$('today-summary-cards'); if(!box)return; const s=data?.summary||{}; const cards=[['inbound','進貨',Number(s.inbound_count||0),'筆'],['outbound','出貨',Number(s.outbound_count||0),'筆'],['orders','新增訂單',Number(s.new_order_count||0),'筆'],['unplaced','未入倉',Number(s.unplaced_count||0),'件']]; const html=`<div class="yx102-today-grid">`+cards.map(([k,t,n,u])=>`<div class="yx102-today-card ${activeTodayFilter===k?'active':''}" data-yx102-today-filter="${k}"><div class="yx102-today-title">${t}</div><div class="yx102-today-count">${n}${u}</div></div>`).join('')+`</div>`; if(box.dataset.yx102Html!==html){box.innerHTML=html; box.dataset.yx102Html=html;}}
  function fillTodayLists(data){const make=r=>`<div class="today-item deduct-card" data-log-id="${Number(r.id||0)}"><strong>${esc(r.action||'異動')}</strong><div class="small-note">${esc(String(r.created_at||'').replace('T',' ').slice(0,19))}｜${esc(r.username||'')}</div><button type="button" class="ghost-btn tiny-btn danger-btn" data-yx68-delete-today="${Number(r.id||0)}">刪除</button></div>`; const fill=(id,rows,empty)=>{const el=$(id); if(el) el.innerHTML=(rows||[]).map(make).join('')||`<div class="empty-state-card compact-empty">${empty}</div>`;}; fill('today-inbound-list',data?.feed?.inbound,'今天沒有進貨'); fill('today-outbound-list',data?.feed?.outbound,'今天沒有出貨'); fill('today-order-list',data?.feed?.new_orders,'今天沒有新增訂單'); const unplaced=$('today-unplaced-list'); if(unplaced){const arr=Array.isArray(data?.unplaced_items)?data.unplaced_items:[]; unplaced.innerHTML=arr.length?arr.map(it=>`<div class="deduct-card"><strong>${esc(productOf(it))}</strong><div class="small-note">${esc(customerOf(it))}｜未入倉 ${Number(it.unplaced_qty??it.qty??0)||0} 件${it.source_summary?`｜來源：${esc(it.source_summary)}`:''}</div></div>`).join(''):'<div class="empty-state-card compact-empty">目前沒有未入倉商品</div>';}}
  function applyTodayFilter(){document.querySelectorAll('[data-yx102-today-filter]').forEach(c=>c.classList.toggle('active',c.dataset.yx102TodayFilter===activeTodayFilter)); const map={inbound:'today-inbound-list',outbound:'today-outbound-list',orders:'today-order-list',unplaced:'today-unplaced-list'}; Object.entries(map).forEach(([k,id])=>{const el=$(id); if(el) el.style.display=(activeTodayFilter==='all'||activeTodayFilter===k)?'':'none';});}
  async function loadTodayChanges102(){if(todayLoading)return todayLoading; todayLoading=(async()=>{let data; try{data=await api('/api/today-changes?ts='+Date.now(),{method:'GET'});}catch(e){const box=$('today-summary-cards'); if(box)box.innerHTML=`<div class="error-card">${esc(e.message||'今日異動載入失敗')}</div>`; throw e;} window.__YX102_TODAY_LAST__=data; renderTodaySummary(data); fillTodayLists(data); applyTodayFilter(); try{await api('/api/today-changes/read',{method:'POST',body:JSON.stringify({})});}catch(_){} return data;})().finally(()=>{setTimeout(()=>{todayLoading=null;},250);}); return todayLoading;}
  document.addEventListener('click',e=>{const card=e.target.closest&&e.target.closest('[data-yx102-today-filter]'); if(card){e.preventDefault(); const k=card.dataset.yx102TodayFilter; activeTodayFilter=(activeTodayFilter===k?'all':k); renderTodaySummary(window.__YX102_TODAY_LAST__||{}); applyTodayFilter();}},true);

  function normalizeTodoDate(){const el=$('todo-date'); if(!el)return; try{el.type='text';}catch(_){} el.placeholder='月/日，例如 4/26'; const m=clean(el.value).match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/); if(m) el.value=`${Number(m[2])}/${Number(m[3])}`;}
  function normalizeWarehouseModal(){const modal=$('warehouse-modal'); if(!modal)return; modal.querySelectorAll('#yx80-warehouse-batch-panel,#yx82-warehouse-batch-panel,#yx83-warehouse-batch-panel,#yx89-warehouse-batch-panel,#yx91-warehouse-batch-panel ~ #yx91-warehouse-batch-panel').forEach(el=>{try{el.remove();}catch(_){}}); const panel=$('yx91-warehouse-batch-panel'); if(panel){panel.querySelectorAll('select').forEach(sel=>{if(clean(sel.value)==='不加入')sel.value='';});panel.querySelectorAll('input[type="number"]').forEach(inp=>{if(clean(inp.value)===''||Number(inp.value)<0)inp.value='0';});} modal.querySelectorAll('button').forEach(btn=>{const t=clean(btn.textContent); if(['加入格位','儲存格位'].includes(t)){btn.style.display='none';btn.disabled=true;} if(/儲存中|加入中|開啟中/.test(t)&&btn.id!=='yx91-add-batch-items'){btn.disabled=false;btn.dataset.busy='0';}});}
  let lastCellKey=''; function maybeClearNewCell(){const c=state().currentCell||window.currentCell||{}; const key=[c.zone||'',c.column_index||c.columnIndex||c.col||'',c.slot_number||c.slotNumber||c.slot||''].join('|'); if(key&&key!==lastCellKey){lastCellKey=key; const panel=$('yx91-warehouse-batch-panel'); if(panel){panel.querySelectorAll('select').forEach(sel=>{sel.value='';});panel.querySelectorAll('input[type="number"]').forEach(inp=>{inp.value='0';});}}}

  function install(){document.documentElement.dataset.yxFix102=VERSION; if(location.pathname.includes('/today-changes')){/* FIX108 disabled old today loader */} if(modKey()==='warehouse'||document.querySelector('#zone-A-grid,#zone-B-grid')){window.toggleWarehouseUnplacedHighlight=toggleUnplaced; compactWarehouseAll(); stabilizeWarehouseToolbar(); refreshUnplacedPill(false);} normalizeTodoDate(); normalizeWarehouseModal(); rewriteProductCards(); try{window.YX_MASTER=Object.freeze({...(window.YX_MASTER||{}),version:VERSION,loadTodayChanges:window.loadTodayChanges,toggleWarehouseUnplacedHighlight:window.toggleWarehouseUnplacedHighlight,compactWarehouseAll:compactWarehouseAll});}catch(_){}}
  if(typeof window.openWarehouseModal==='function'&&!window.openWarehouseModal.__yx102){const old=window.openWarehouseModal; const wrapped=function(){const r=old.apply(this,arguments); setTimeout(()=>{maybeClearNewCell();normalizeWarehouseModal();},120); setTimeout(normalizeWarehouseModal,420); return r;}; Object.defineProperty(wrapped,'__yx102',{value:true}); window.openWarehouseModal=wrapped;}
  if(typeof window.renderWarehouse==='function'&&!window.renderWarehouse.__yx102){const old=window.renderWarehouse; const wrapped=async function(){const r=await old.apply(this,arguments); setTimeout(compactWarehouseAll,160); return r;}; Object.defineProperty(wrapped,'__yx102',{value:true}); window.renderWarehouse=wrapped;}
  if(typeof window.loadCustomerBlocks==='function'&&!window.loadCustomerBlocks.__yx102){const old=window.loadCustomerBlocks; const wrapped=async function(){const r=await old.apply(this,arguments); setTimeout(rewriteProductCards,120); return r;}; Object.defineProperty(wrapped,'__yx102',{value:true}); window.loadCustomerBlocks=wrapped;}
  let scheduled=false; const schedule=()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;install();});};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true}); else install(); window.addEventListener('pageshow',install); [200,700,1500,3000,6000].forEach(ms=>setTimeout(install,ms)); try{new MutationObserver(schedule).observe(document.body||document.documentElement,{childList:true,subtree:true});}catch(_){}}
)();
/* ==== FIX102: full QA cleanup and last-master guard end ==== */


/* ==== FIX103: stable today cards + speed guard start ==== */
(function(){
  'use strict';
  const VERSION='FIX103_SPEED_FONT_STABLE';
  if(window.__YX103_SPEED_FONT_STABLE__) return;
  window.__YX103_SPEED_FONT_STABLE__=true;
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const clean=v=>String(v??'').trim();
  const api=window.yxApi||window.requestJSON||(async function(url,opt={}){
    const res=await fetch(url,{credentials:'same-origin',cache:'no-store',...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}});
    const txt=await res.text(); let data={};
    try{data=txt?JSON.parse(txt):{};}catch(_){data={success:false,error:txt||'伺服器回應格式錯誤'};}
    if(!res.ok||data.success===false){const e=new Error(data.error||data.message||`請求失敗：${res.status}`); e.payload=data; throw e;}
    return data;
  });
  window.yxApi=api;
  let activeFilter='all';
  let loading=null;
  let lastHtml='';
  function qty(v){const n=Number(v||0);return Number.isFinite(n)?Math.max(0,Math.floor(n)):0;}
  function customerOf(it){return clean(it?.customer_name||'未指定客戶')||'未指定客戶';}
  function productOf(it){return clean(it?.product_text||it?.product_size||it?.product||'');}
  function fmt24(v){const raw=clean(v); const m=raw.match(/(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::\d{2})?/); return m?`${m[1]} ${m[2]}`:raw;}
  function todayCard(k,title,num,unit){return `<button type="button" class="yx103-today-card${activeFilter===k?' active':''}" data-yx103-today-filter="${k}"><span class="yx103-today-title">${esc(title)}</span><span class="yx103-today-count"><b>${qty(num)}</b><em>${esc(unit)}</em></span></button>`;}
  function renderSummary(data){
    const box=$('today-summary-cards'); if(!box) return;
    const s=data?.summary||{};
    const html=`<div class="yx103-today-grid">${todayCard('inbound','進貨',s.inbound_count,'筆')}${todayCard('outbound','出貨',s.outbound_count,'筆')}${todayCard('orders','新增訂單',s.new_order_count,'筆')}${todayCard('unplaced','未入倉',s.unplaced_count,'件')}</div>`;
    if(html!==lastHtml||box.dataset.yx103Stable!=='1'){
      box.innerHTML=html;
      box.dataset.yx103Stable='1';
      lastHtml=html;
    }
  }
  function makeLog(r){return `<div class="today-item deduct-card" data-log-id="${Number(r.id||0)}"><strong>${esc(r.action||'異動')}</strong><div class="small-note">${esc(fmt24(r.created_at))}｜${esc(r.username||'')}</div></div>`;}
  function fill(id,rows,empty){const el=$(id); if(el) el.innerHTML=(rows||[]).map(makeLog).join('')||`<div class="empty-state-card compact-empty">${esc(empty)}</div>`;}
  function fillUnplaced(data){
    const el=$('today-unplaced-list'); if(!el) return;
    const arr=Array.isArray(data?.unplaced_items)?data.unplaced_items:[];
    el.innerHTML=arr.length?arr.map(it=>`<div class="deduct-card"><strong>${esc(productOf(it))}</strong><div class="small-note">${esc(customerOf(it))}｜未入倉 ${qty(it.unplaced_qty??it.qty)} 件${it.source_summary?`｜來源：${esc(it.source_summary)}`:''}</div></div>`).join(''):'<div class="empty-state-card compact-empty">目前沒有未入倉商品</div>';
  }
  function applyFilter(){
    document.querySelectorAll('[data-yx103-today-filter]').forEach(c=>c.classList.toggle('active',c.dataset.yx103TodayFilter===activeFilter));
    const map={inbound:'today-inbound-list',outbound:'today-outbound-list',orders:'today-order-list',unplaced:'today-unplaced-list'};
    Object.entries(map).forEach(([k,id])=>{const el=$(id); if(el) el.style.display=(activeFilter==='all'||activeFilter===k)?'':'none';});
    document.querySelectorAll('[data-today-panel]').forEach(panel=>{const key=panel.dataset.todayPanel||''; panel.style.display=(activeFilter==='all'||activeFilter===key)?'':'';});
  }
  async function loadTodayChanges103(){
    if(loading) return loading;
    loading=(async()=>{
      const d=await api('/api/today-changes?ts='+Date.now(),{method:'GET'});
      window.__YX103_TODAY_LAST__=d;
      renderSummary(d);
      fill('today-inbound-list',d.feed?.inbound,'今天沒有進貨');
      fill('today-outbound-list',d.feed?.outbound,'今天沒有出貨');
      fill('today-order-list',d.feed?.new_orders,'今天沒有新增訂單');
      fillUnplaced(d);
      applyFilter();
      try{await api('/api/today-changes/read',{method:'POST',body:JSON.stringify({})});}catch(_){}
      return d;
    })().catch(e=>{const box=$('today-summary-cards'); if(box) box.innerHTML=`<div class="error-card">${esc(e.message||'今日異動載入失敗')}</div>`; throw e;}).finally(()=>{setTimeout(()=>{loading=null;},500);});
    return loading;
  }
  try{
    Object.defineProperty(window,'loadTodayChanges',{configurable:true,enumerable:true,get(){return loadTodayChanges103;},set(fn){ if(fn&&fn.__yx103){} }});
  }catch(_){ window.loadTodayChanges=loadTodayChanges103; }
  document.addEventListener('click',ev=>{
    const card=ev.target.closest&&ev.target.closest('[data-yx103-today-filter]');
    if(!card) return;
    ev.preventDefault(); ev.stopPropagation();
    const key=card.dataset.yx103TodayFilter||'all';
    activeFilter=(activeFilter===key?'all':key);
    renderSummary(window.__YX103_TODAY_LAST__||{});
    applyFilter();
  },true);
  function freezeTodayCardFont(){
    document.documentElement.dataset.yxFix103=VERSION;
    const box=$('today-summary-cards');
    if(box){ box.classList.add('yx103-today-root'); }
  }
  function install(){ freezeTodayCardFont(); try{window.YX_MASTER=Object.freeze({...(window.YX_MASTER||{}),version:VERSION,loadTodayChanges:loadTodayChanges103});}catch(_){} if(location.pathname.includes('/today-changes')){ /* FIX106 disabled old today auto refresh */ } }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true}); else install();
  window.addEventListener('pageshow',install);
  [250,1200,2600].forEach(ms=>setTimeout(install,ms));
})();
/* ==== FIX103: stable today cards + speed guard end ==== */


/* ==== FIX105: today final row layout + speed consolidation start ==== */
(function(){
  'use strict';
  const VERSION='FIX105_TODAY_SPEED_FINAL';
  if(window.__YX105_TODAY_SPEED_FINAL__) return;
  window.__YX105_TODAY_SPEED_FINAL__=true;
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const clean=v=>String(v??'').trim();
  const qty=v=>{const n=Number(v||0);return Number.isFinite(n)&&n>0?Math.floor(n):0;};
  const api=window.yxApi||window.requestJSON||(async function(url,opt={}){const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}});const txt=await r.text();let d={};try{d=txt?JSON.parse(txt):{};}catch(_){d={success:false,error:txt||'伺服器回應格式錯誤'};}if(!r.ok||d.success===false)throw new Error(d.error||d.message||`請求失敗：${r.status}`);return d;});
  window.yxApi=api;
  let activeFilter='all';
  let loading=null;
  let lastSummaryHtml='';
  function fmt24(v){const raw=clean(v);const m=raw.match(/(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::\d{2})?/);return m?`${m[1]} ${m[2]}`:raw;}
  function card(key,title,num,unit){return `<button type="button" class="yx105-today-card${activeFilter===key?' active':''}" data-yx105-today-filter="${key}"><span class="yx105-today-title">${esc(title)}</span><span class="yx105-today-count"><b>${qty(num)}</b><em>${esc(unit)}</em></span></button>`;}
  function renderSummary(data){
    const box=$('today-summary-cards'); if(!box) return;
    const s=data?.summary||{};
    const html=`<div class="yx105-today-stack">${card('inbound','進貨',s.inbound_count,'筆')}${card('outbound','出貨',s.outbound_count,'筆')}${card('orders','新增訂單',s.new_order_count,'筆')}${card('unplaced','未入倉',s.unplaced_count,'件')}</div>`;
    box.className=(box.className||'').replace(/\byx10[0-9]-today-root\b/g,'').trim();
    box.classList.add('yx105-today-root');
    box.dataset.yx105Stable='1';
    if(html!==lastSummaryHtml||box.innerHTML.indexOf('yx105-today-stack')<0){box.innerHTML=html;lastSummaryHtml=html;}
  }
  function makeLog(r){return `<div class="today-item deduct-card" data-log-id="${Number(r?.id||0)}"><strong>${esc(r?.action||'異動')}</strong><div class="small-note">${esc(fmt24(r?.created_at))}｜${esc(r?.username||'')}</div></div>`;}
  function fill(id,rows,empty){const el=$(id); if(el) el.innerHTML=(rows||[]).map(makeLog).join('')||`<div class="empty-state-card compact-empty">${esc(empty)}</div>`;}
  function productOf(it){return clean(it?.product_text||it?.product_size||it?.product||'');}
  function customerOf(it){return clean(it?.customer_name||it?.customer||'未指定客戶')||'未指定客戶';}
  function fillUnplaced(data){const el=$('today-unplaced-list'); if(!el) return; const arr=Array.isArray(data?.unplaced_items)?data.unplaced_items:[]; el.innerHTML=arr.length?arr.map(it=>`<div class="deduct-card"><strong>${esc(productOf(it))}</strong><div class="small-note">${esc(customerOf(it))}｜未入倉 ${qty(it.unplaced_qty??it.qty)} 件${it.source_summary?`｜來源：${esc(it.source_summary)}`:''}</div></div>`).join(''):'<div class="empty-state-card compact-empty">目前沒有未入倉商品</div>';}
  function applyFilter(){
    document.querySelectorAll('[data-yx105-today-filter]').forEach(c=>c.classList.toggle('active',(c.dataset.yx105TodayFilter||'')===activeFilter));
    document.querySelectorAll('[data-today-panel]').forEach(panel=>{const key=panel.dataset.todayPanel||'';panel.style.display=(activeFilter==='all'||activeFilter===key)?'':'none';});
  }
  async function loadTodayChanges105(){
    if(loading) return loading;
    loading=(async()=>{const data=await api('/api/today-changes?ts='+Date.now(),{method:'GET'});window.__YX105_TODAY_LAST__=data;renderSummary(data);fill('today-inbound-list',data.feed?.inbound,'今天沒有進貨');fill('today-outbound-list',data.feed?.outbound,'今天沒有出貨');fill('today-order-list',data.feed?.new_orders,'今天沒有新增訂單');fillUnplaced(data);applyFilter();try{await api('/api/today-changes/read',{method:'POST',body:JSON.stringify({})});}catch(_){}return data;})().catch(e=>{const box=$('today-summary-cards');if(box)box.innerHTML=`<div class="error-card">${esc(e.message||'今日異動載入失敗')}</div>`;throw e;}).finally(()=>setTimeout(()=>{loading=null;},800));
    return loading;
  }
  loadTodayChanges105.__yx105=true;
  function lockLoader(){try{Object.defineProperty(window,'loadTodayChanges',{configurable:true,enumerable:true,get(){return loadTodayChanges105;},set(fn){/* ignore old FIX loaders */}});}catch(_){window.loadTodayChanges=loadTodayChanges105;}}
  document.addEventListener('click',ev=>{const btn=ev.target.closest&&ev.target.closest('[data-yx105-today-filter],[data-yx104-today-filter],[data-yx103-today-filter],[data-yx102-today-filter],[data-yx101-today-filter]'); if(!btn)return; ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation(); const key=btn.dataset.yx105TodayFilter||btn.dataset.yx104TodayFilter||btn.dataset.yx103TodayFilter||btn.dataset.yx102TodayFilter||btn.dataset.yx101TodayFilter||'all'; activeFilter=(activeFilter===key?'all':key); renderSummary(window.__YX105_TODAY_LAST__||window.__YX104_TODAY_LAST__||{summary:{}}); applyFilter();},true);

  function normalizeX(v){return clean(v).replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/\s+/g,'');}
  function qtyFromProduct(text,fallback){try{if(typeof window.yxEffectiveQty==='function')return window.yxEffectiveQty(text,fallback||0);}catch(_){}const raw=normalizeX(text);const right=raw.includes('=')?raw.split('=').slice(1).join('='):raw;let total=0,hit=false;right.split('+').forEach(seg=>{seg=clean(seg);if(!seg)return;const m=seg.match(/x(\d+)$/i);if(m){total+=Number(m[1]||0);hit=true;}else if(/\d/.test(seg)){total+=1;hit=true;}});return hit?total:qty(fallback);}
  function sourceRows(source){return (window.__yx63Rows&&window.__yx63Rows[source])||[];}
  function rowByCard(card){const source=card.dataset.source||'';const id=Number(card.dataset.id||0);return sourceRows(source).find(r=>Number(r.id||0)===id)||null;}
  function rowMaterial(row){let m=clean(row?.material||row?.product_code||row?.wood_type||'');const prod=normalizeX(row?.product_text||'');if(!m||normalizeX(m)===prod||/^未填/.test(m))return '未填材質';return m;}
  function rowFormula(row){const p=clean(row?.product_text||row?.product_size||row?.size||'');if(p)return normalizeX(p);const size=clean(row?.size||'');const support=clean(row?.support||row?.support_text||'');return normalizeX(support?`${size}=${support}`:size);}
  function fallbackFormula(card){let txt=clean(card.textContent).replace(/編輯|直接出貨|刪除|材質|尺寸|支數\s*x\s*件數|數量|客戶[:：]?[^\n]*/g,' ').replace(/\s+/g,' ');const m=txt.match(/(?:\d{1,2}月)?\s*\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?\s*=\s*[0-9xX+＋\s]+/);return normalizeX(m?m[0]:'');}
  function cleanProductCards(){
    document.querySelectorAll('.yx63-item-card,.inventory-action-card').forEach(card=>{const row=rowByCard(card);const formula=row?rowFormula(row):fallbackFormula(card);if(!formula)return;const material=row?rowMaterial(row):((clean(card.textContent).match(/(RDT|尤加利|SPF|HF|DF|SPY|SP|RP|TD|MKJ|LVL|未填材質)/i)||[])[1]||'未填材質');const q=row?qty(row.qty||qtyFromProduct(formula,0)):qtyFromProduct(formula,0);let grid=card.querySelector('.yx63-item-grid');if(!grid){grid=document.createElement('div');grid.className='yx63-item-grid';card.insertBefore(grid,card.firstChild);}const html=`<div class="yx105-card-meta-row"><span class="yx105-card-material">${esc(material)} ${q}件</span></div><div class="yx105-card-formula">${esc(formula)}</div>`;if(grid.dataset.yx105Html!==html){grid.innerHTML=html;grid.dataset.yx105Html=html;}card.classList.add('yx105-clean-product-card');});
  }
  function wrapAfter(name,fn){const cur=window[name];if(typeof cur!=='function'||cur.__yx105)return;const wrapped=async function(){const r=await cur.apply(this,arguments);setTimeout(fn,80);return r;};Object.defineProperty(wrapped,'__yx105',{value:true});window[name]=wrapped;}
  function install(){document.documentElement.dataset.yxFix105=VERSION;lockLoader();const bar=document.querySelector('.today-filter-bar');if(bar){bar.hidden=true;bar.style.display='none';}if(location.pathname.includes('/today-changes')){const box=$('today-summary-cards');if(box&&!box.querySelector('.yx105-today-stack'))renderSummary(window.__YX105_TODAY_LAST__||{summary:{}});/* FIX106 disabled old today auto refresh */}cleanProductCards();['loadCustomerBlocks','renderCustomers','loadInventory','loadOrdersList','loadMasterList'].forEach(n=>wrapAfter(n,cleanProductCards));try{window.YX_MASTER=Object.freeze({...(window.YX_MASTER||{}),version:VERSION,loadTodayChanges:loadTodayChanges105,cleanProductCards});}catch(_){}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  window.addEventListener('pageshow',install);
  [300,1200].forEach(ms=>setTimeout(install,ms));
})();
/* ==== FIX105: today final row layout + speed consolidation end ==== */


/* ==== FIX106: manual today refresh + final card cleanup start ==== */
(function(){
  'use strict';
  const VERSION='FIX106_MANUAL_TODAY_CARD_SPEED';
  if(window.__YX106_FINAL__) return;
  window.__YX106_FINAL__=true;
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const qty=v=>{const n=Number(v||0);return Number.isFinite(n)&&n>0?Math.floor(n):0;};
  const api=window.yxApi||window.requestJSON||(async function(url,opt={}){const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}});const txt=await r.text();let d={};try{d=txt?JSON.parse(txt):{};}catch(_){d={success:false,error:txt||'伺服器回應格式錯誤'};}if(!r.ok||d.success===false)throw new Error(d.error||d.message||`請求失敗：${r.status}`);return d;});
  window.yxApi=api;
  let activeFilter='all';
  let loading=null;
  function staticSummary(data){const s=data?.summary||{};return{inbound:qty(s.inbound_count),outbound:qty(s.outbound_count),orders:qty(s.new_order_count),unplaced:qty(s.unplaced_count)};}
  function card(key,title,num,unit){return `<button type="button" class="yx106-today-card${activeFilter===key?' active':''}" data-yx106-today-filter="${key}"><span class="yx106-today-title">${esc(title)}</span><span class="yx106-today-count"><b>${qty(num)}</b><em>${esc(unit)}</em></span></button>`;}
  function renderSummary(data){const box=$('today-summary-cards');if(!box)return;const s=staticSummary(data||window.__YX106_TODAY_LAST__||{summary:{}});const html=`<div class="yx106-today-stack">${card('inbound','進貨',s.inbound,'筆')}${card('outbound','出貨',s.outbound,'筆')}${card('orders','新增訂單',s.orders,'筆')}${card('unplaced','未入倉',s.unplaced,'件')}</div>`;box.className='card-list yx106-today-root';if(box.dataset.yx106Html!==html){box.innerHTML=html;box.dataset.yx106Html=html;}}
  function fmt24(v){const raw=clean(v);const m=raw.match(/(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::\d{2})?/);return m?`${m[1]} ${m[2]}`:raw;}
  function makeLog(r){return `<div class="today-item deduct-card" data-log-id="${Number(r?.id||0)}"><strong>${esc(r?.action||'異動')}</strong><div class="small-note">${esc(fmt24(r?.created_at))}｜${esc(r?.username||'')}</div></div>`;}
  function fill(id,rows,empty){const el=$(id);if(el)el.innerHTML=(rows||[]).map(makeLog).join('')||`<div class="empty-state-card compact-empty">${esc(empty)}</div>`;}
  function productOf(it){return clean(it?.product_text||it?.product_size||it?.product||'');}
  function customerOf(it){return clean(it?.customer_name||it?.customer||'未指定客戶')||'未指定客戶';}
  function fillUnplaced(data){const el=$('today-unplaced-list');if(!el)return;const arr=Array.isArray(data?.unplaced_items)?data.unplaced_items:[];el.innerHTML=arr.length?arr.map(it=>`<div class="deduct-card"><strong>${esc(productOf(it))}</strong><div class="small-note">${esc(customerOf(it))}｜未入倉 ${qty(it.unplaced_qty??it.qty)} 件${it.source_summary?`｜來源：${esc(it.source_summary)}`:''}</div></div>`).join(''):'<div class="empty-state-card compact-empty">目前沒有未入倉商品</div>';}
  function applyFilter(){document.querySelectorAll('[data-yx106-today-filter]').forEach(c=>c.classList.toggle('active',(c.dataset.yx106TodayFilter||'')===activeFilter));document.querySelectorAll('[data-today-panel]').forEach(panel=>{const key=panel.dataset.todayPanel||'';panel.style.display=(activeFilter==='all'||activeFilter===key)?'':'none';});}
  async function loadTodayChanges106(opts={}){if(!opts||!(opts.manual||opts.force||opts.refresh)){renderSummary(window.__YX106_TODAY_LAST__||{summary:{}});applyFilter();return window.__YX106_TODAY_LAST__||{success:true,summary:{}};}if(loading)return loading;const btn=$('today-manual-refresh-btn');if(btn){btn.disabled=true;btn.textContent='刷新中…';}loading=(async()=>{const data=await api('/api/today-changes?refresh=1&ts='+Date.now(),{method:'GET'});window.__YX106_TODAY_LAST__=data;renderSummary(data);fill('today-inbound-list',data.feed?.inbound,'今天沒有進貨');fill('today-outbound-list',data.feed?.outbound,'今天沒有出貨');fill('today-order-list',data.feed?.new_orders,'今天沒有新增訂單');fillUnplaced(data);applyFilter();return data;})().catch(e=>{try{(window.notify||alert)(e.message||'今日異動刷新失敗','error');}catch(_){}throw e;}).finally(()=>{if(btn){btn.disabled=false;btn.textContent='刷新';}setTimeout(()=>{loading=null;},500);});return loading;}
  loadTodayChanges106.__yx106=true;
  function lockTodayLoader(){try{Object.defineProperty(window,'loadTodayChanges',{configurable:true,enumerable:true,get(){return loadTodayChanges106;},set(_fn){}});}catch(_){window.loadTodayChanges=loadTodayChanges106;}}
  document.addEventListener('click',ev=>{const refresh=ev.target.closest&&ev.target.closest('#today-manual-refresh-btn');if(refresh){ev.preventDefault();ev.stopPropagation();ev.stopImmediatePropagation();loadTodayChanges106({manual:true}).catch(()=>{});return;}const card=ev.target.closest&&ev.target.closest('[data-yx106-today-filter],[data-yx105-today-filter],[data-yx104-today-filter],[data-yx103-today-filter],[data-yx102-today-filter]');if(!card)return;ev.preventDefault();ev.stopPropagation();ev.stopImmediatePropagation();const key=card.dataset.yx106TodayFilter||card.dataset.yx105TodayFilter||card.dataset.yx104TodayFilter||card.dataset.yx103TodayFilter||card.dataset.yx102TodayFilter||'all';activeFilter=(activeFilter===key?'all':key);renderSummary(window.__YX106_TODAY_LAST__||{summary:{}});applyFilter();},true);
  function normalizeX(v){return clean(v).replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/\s+/g,'');}
  function qtyFromProduct(text,fallback){try{if(typeof window.yxEffectiveQty==='function')return window.yxEffectiveQty(text,fallback||0);}catch(_){}const raw=normalizeX(text);const right=raw.includes('=')?raw.split('=').slice(1).join('='):raw;let total=0,hit=false;right.split('+').forEach(seg=>{seg=clean(seg);if(!seg)return;const m=seg.match(/x(\d+)$/i);if(m){total+=Number(m[1]||0);hit=true;}else if(/\d/.test(seg)){total+=1;hit=true;}});return hit?total:qty(fallback);}
  function sourceRows(source){return(window.__yx63Rows&&window.__yx63Rows[source])||[];}
  function rowByCard(card){const source=card.dataset.source||'';const id=Number(card.dataset.id||0);return sourceRows(source).find(r=>Number(r.id||0)===id)||null;}
  function rowFormula(row){const p=clean(row?.product_text||row?.product_size||row?.size||'');if(p)return normalizeX(p);const size=clean(row?.size||'');const support=clean(row?.support||row?.support_text||'');return normalizeX(support?`${size}=${support}`:size);}
  function rowMaterial(row){let m=clean(row?.material||row?.product_code||row?.wood_type||'');const prod=normalizeX(row?.product_text||'');if(!m||normalizeX(m)===prod||/^未填/.test(m))return '';return m;}
  function fallbackFormula(card){let txt=clean(card.textContent).replace(/編輯|直接出貨|刪除|未填材質|材質|尺寸|支數\s*x\s*件數|數量|客戶[:：]?[^\n]*/g,' ');const m=txt.match(/(?:\d{1,2}月)?\s*\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?\s*=\s*[0-9xX+＋\s]+/);return normalizeX(m?m[0]:'');}
  function fallbackMaterial(card){return(clean(card.textContent).match(/(RDT|尤加利|SPF|HF|DF|SPY|SP|RP|TD|MKJ|LVL|南方松|花旗|鐵杉)/i)||[])[1]||'';}
  function actionButtons(card){const existing=card.querySelector('.yx63-card-actions');if(existing)return existing.outerHTML;const btns=Array.from(card.querySelectorAll('button')).map(b=>b.outerHTML).join('');return btns?`<div class="yx63-card-actions">${btns}</div>`:'';}
  function cleanProductCards106(){document.querySelectorAll('.yx63-item-card,.inventory-action-card').forEach(card=>{const row=rowByCard(card);const formula=row?rowFormula(row):fallbackFormula(card);if(!formula)return;const q=row?qty(row.qty||qtyFromProduct(formula,0)):qtyFromProduct(formula,0);if(q<=0&&/未填材質/.test(clean(card.textContent))){card.classList.add('yx106-hidden-empty-card');return;}const material=row?rowMaterial(row):fallbackMaterial(card);const meta=material?`${material} ${q}件`:`${q}件`;const actions=actionButtons(card);const html=`<div class="yx106-product-main"><div class="yx106-product-meta">${esc(meta)}</div><div class="yx106-product-formula">${esc(formula)}</div></div>${actions}`;if(card.dataset.yx106Html!==html){card.innerHTML=html;card.dataset.yx106Html=html;}card.classList.add('yx106-clean-product-card');});}
  function wrapAfter(name,fn){const cur=window[name];if(typeof cur!=='function'||cur.__yx106)return;const wrapped=async function(){const r=await cur.apply(this,arguments);setTimeout(fn,60);return r;};Object.defineProperty(wrapped,'__yx106',{value:true});window[name]=wrapped;}
  function install(){['data-yx-fix101','data-yx-fix102','data-yx-fix103','data-yx-fix104','data-yx-fix105'].forEach(a=>document.documentElement.removeAttribute(a));document.documentElement.dataset.yxFix106=VERSION;lockTodayLoader();const bar=document.querySelector('.today-filter-bar');if(bar){bar.hidden=true;bar.style.display='none';}const unread=document.querySelector('#today-unread-badge')?.parentElement;if(unread)unread.classList.add('yx106-hidden');if(location.pathname.includes('/today-changes')){renderSummary(window.__YX106_TODAY_LAST__||{summary:{}});applyFilter();}cleanProductCards106();['loadCustomerBlocks','renderCustomers','loadInventory','loadOrdersList','loadMasterList','refreshSource'].forEach(n=>wrapAfter(n,cleanProductCards106));try{window.YX_MASTER=Object.freeze({...(window.YX_MASTER||{}),version:VERSION,loadTodayChanges:loadTodayChanges106,cleanProductCards:cleanProductCards106});}catch(_){} }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  window.addEventListener('pageshow',()=>setTimeout(install,0));
  [200,800,1800].forEach(ms=>setTimeout(install,ms));
})();
/* ==== FIX106: manual today refresh + final card cleanup end ==== */

/* ==== FIX107: final manual-today hard lock + no full-page observers + startup speed start ==== */
(function(){
  'use strict';
  const VERSION='FIX107_MANUAL_TODAY_SPEED_HARD_LOCK';
  if(window.__YX107_MANUAL_TODAY_SPEED_HARD_LOCK__) return;
  window.__YX107_MANUAL_TODAY_SPEED_HARD_LOCK__=true;
  const $=id=>document.getElementById(id);
  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const qty=v=>{const n=Number(v||0);return Number.isFinite(n)&&n>0?Math.floor(n):0;};
  const api=window.yxApi||window.requestJSON||(async function(url,opt={}){const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}});const txt=await r.text();let d={};try{d=txt?JSON.parse(txt):{};}catch(_){d={success:false,error:txt||'伺服器回應格式錯誤'};}if(!r.ok||d.success===false)throw new Error(d.error||d.message||`請求失敗：${r.status}`);return d;});
  window.yxApi=api;

  let activeFilter='all';
  let loading=null;
  let bootLoaded=false;
  const isTodayPage=()=>location.pathname.indexOf('/today-changes')>=0;
  function summaryOf(data){const s=data?.summary||{};return{inbound:qty(s.inbound_count),outbound:qty(s.outbound_count),orders:qty(s.new_order_count),unplaced:qty(s.unplaced_count)};}
  function todayCard(key,title,num,unit){return `<button type="button" class="yx106-today-card${activeFilter===key?' active':''}" data-yx106-today-filter="${key}"><span class="yx106-today-title">${esc(title)}</span><span class="yx106-today-count"><b>${qty(num)}</b><em>${esc(unit)}</em></span></button>`;}
  function renderTodaySummary(data){const box=$('today-summary-cards');if(!box)return;const s=summaryOf(data||window.__YX107_TODAY_LAST__||{summary:{}});const html=`<div class="yx106-today-stack">${todayCard('inbound','進貨',s.inbound,'筆')}${todayCard('outbound','出貨',s.outbound,'筆')}${todayCard('orders','新增訂單',s.orders,'筆')}${todayCard('unplaced','未入倉',s.unplaced,'件')}</div>`;box.className='card-list yx106-today-root';if(box.dataset.yx107Html!==html){box.innerHTML=html;box.dataset.yx107Html=html;box.dataset.yx106Html=html;}}
  function applyTodayFilter(){document.querySelectorAll('[data-yx106-today-filter],[data-yx105-today-filter],[data-yx104-today-filter],[data-yx103-today-filter],[data-yx102-today-filter]').forEach(c=>c.classList.toggle('active',(c.dataset.yx106TodayFilter||c.dataset.yx105TodayFilter||c.dataset.yx104TodayFilter||c.dataset.yx103TodayFilter||c.dataset.yx102TodayFilter||'')===activeFilter));document.querySelectorAll('[data-today-panel]').forEach(panel=>{const key=panel.dataset.todayPanel||'';panel.style.display=(activeFilter==='all'||activeFilter===key)?'':'none';});}
  function fmt24(v){const raw=clean(v);const m=raw.match(/(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::\d{2})?/);return m?`${m[1]} ${m[2]}`:raw;}
  function logCard(r){return `<div class="today-item deduct-card" data-log-id="${Number(r?.id||0)}"><strong>${esc(r?.action||'異動')}</strong><div class="small-note">${esc(fmt24(r?.created_at))}｜${esc(r?.username||'')}</div></div>`;}
  function fillList(id,rows,empty){const el=$(id);if(el)el.innerHTML=(rows||[]).map(logCard).join('')||`<div class="empty-state-card compact-empty">${esc(empty)}</div>`;}
  function productOf(it){return clean(it?.product_text||it?.product_size||it?.product||'');}
  function customerOf(it){return clean(it?.customer_name||it?.customer||'未指定客戶')||'未指定客戶';}
  function fillUnplaced(data, fetchedUnplaced){const el=$('today-unplaced-list');if(!el)return;const arr=Array.isArray(data?.unplaced_items)?data.unplaced_items:[];if(!fetchedUnplaced && !arr.length){el.innerHTML='<div class="empty-state-card compact-empty">按右上「刷新」才會重新抓未入倉件數</div>';return;}el.innerHTML=arr.length?arr.map(it=>`<div class="deduct-card"><strong>${esc(productOf(it))}</strong><div class="small-note">${esc(customerOf(it))}｜未入倉 ${qty(it.unplaced_qty??it.qty)} 件${it.source_summary?`｜來源：${esc(it.source_summary)}`:''}</div></div>`).join(''):'<div class="empty-state-card compact-empty">目前沒有未入倉商品</div>';}
  function mergeKeepUnplaced(next, fetchedUnplaced){if(fetchedUnplaced)return next;const old=window.__YX107_TODAY_LAST__||window.__YX106_TODAY_LAST__||null;if(!old)return next;next=next||{};next.summary={...(next.summary||{})};next.summary.unplaced_count=old.summary?.unplaced_count||0;next.summary.unplaced_row_count=old.summary?.unplaced_row_count||0;next.unplaced_items=Array.isArray(old.unplaced_items)?old.unplaced_items:[];return next;}
  function renderTodayPayload(data,fetchedUnplaced){renderTodaySummary(data);fillList('today-inbound-list',data?.feed?.inbound,'今天沒有進貨');fillList('today-outbound-list',data?.feed?.outbound,'今天沒有出貨');fillList('today-order-list',data?.feed?.new_orders,'今天沒有新增訂單');fillUnplaced(data,fetchedUnplaced);applyTodayFilter();}
  async function loadTodayChanges107(opts={}){
    if(!isTodayPage()) return window.__YX107_TODAY_LAST__||{success:true,summary:{}};
    const manual=!!(opts&& (opts.manual||opts.refresh||opts.force));
    if(!manual){bootLoaded=true;renderTodayPayload(window.__YX107_TODAY_LAST__||{summary:{},feed:{}},false);return window.__YX107_TODAY_LAST__||{success:true,summary:{}};}
    if(loading)return loading;
    const btn=$('today-manual-refresh-btn');
    if(btn&&manual){btn.disabled=true;btn.textContent='刷新中…';}
    loading=(async()=>{
      const url=manual?('/api/today-changes?refresh=1&ts='+Date.now()):('/api/today-changes?ts='+Date.now());
      let data=await api(url,{method:'GET'});
      data=mergeKeepUnplaced(data,manual);
      window.__YX107_TODAY_LAST__=data;
      window.__YX106_TODAY_LAST__=data;
      bootLoaded=true;
      renderTodayPayload(data,manual);
      return data;
    })().catch(e=>{const box=$('today-summary-cards');if(box)box.innerHTML=`<div class="error-card">${esc(e.message||'今日異動載入失敗')}</div>`;throw e;}).finally(()=>{if(btn){btn.disabled=false;btn.textContent='刷新';}setTimeout(()=>{loading=null;},300);});
    return loading;
  }
  loadTodayChanges107.__yx107=true;
  loadTodayChanges107.__yx106=true;
  function lockLoader(){try{Object.defineProperty(window,'loadTodayChanges',{configurable:true,enumerable:true,get(){return loadTodayChanges107;},set(_fn){}});}catch(_){window.loadTodayChanges=loadTodayChanges107;}}

  function normalizeX(v){return clean(v).replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/[＋，,；;]/g,'+').replace(/\s+/g,'');}
  function qtyFromProduct(text,fallback){try{if(typeof window.yxEffectiveQty==='function')return window.yxEffectiveQty(text,fallback||0);}catch(_){}const raw=normalizeX(text);const right=raw.includes('=')?raw.split('=').slice(1).join('='):raw;let total=0,hit=false;right.split('+').forEach(seg=>{seg=clean(seg);if(!seg)return;const m=seg.match(/x(\d+)$/i);if(m){total+=Number(m[1]||0);hit=true;}else if(/\d/.test(seg)){total+=1;hit=true;}});return hit?total:qty(fallback);}
  function sourceRows(source){return(window.__yx63Rows&&window.__yx63Rows[source])||[];}
  function rowByCard(card){const source=card.dataset.source||'';const id=Number(card.dataset.id||0);return sourceRows(source).find(r=>Number(r.id||0)===id)||null;}
  function rowFormula(row){const p=clean(row?.product_text||row?.product_size||row?.size||'');if(p)return normalizeX(p);const size=clean(row?.size||'');const support=clean(row?.support||row?.support_text||'');return normalizeX(support?`${size}=${support}`:size);}
  function rowMaterial(row){let m=clean(row?.material||row?.product_code||row?.wood_type||'');const prod=normalizeX(row?.product_text||'');if(!m||normalizeX(m)===prod||/^未填/.test(m))return '';return m;}
  function fallbackFormula(card){let txt=clean(card.textContent).replace(/編輯|直接出貨|刪除|未填材質|材質|尺寸|支數\s*[xX]\s*件數|數量|客戶[:：]?[^\n]*/g,' ');const m=txt.match(/(?:\d{1,2}月)?\s*\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?\s*=\s*[0-9xX+＋\s]+/);return normalizeX(m?m[0]:'');}
  function fallbackMaterial(card){const text=clean(card.textContent).replace(/未填材質/g,'');return(text.match(/(RDT|尤加利|SPF|HF|DF|SPY|SP|RP|TD|MKJ|LVL|南方松|花旗|鐵杉)/i)||[])[1]||'';}
  function actionButtons(card){const existing=card.querySelector('.yx63-card-actions');if(existing)return existing.outerHTML;const btns=Array.from(card.querySelectorAll('button')).map(b=>b.outerHTML).join('');return btns?`<div class="yx63-card-actions">${btns}</div>`:'';}
  function cleanProductCards107(){document.querySelectorAll('.yx63-item-card,.inventory-action-card').forEach(card=>{const row=rowByCard(card);const formula=row?rowFormula(row):fallbackFormula(card);if(!formula)return;const q=row?qty(row.qty||qtyFromProduct(formula,0)):qtyFromProduct(formula,0);if(q<=0&&/未填材質/.test(clean(card.textContent))){card.classList.add('yx106-hidden-empty-card');return;}const material=row?rowMaterial(row):fallbackMaterial(card);const meta=material?`${material} ${q}件`:`${q}件`;const actions=actionButtons(card);const html=`<div class="yx106-product-main"><div class="yx106-product-meta">${esc(meta)}</div><div class="yx106-product-formula">${esc(formula)}</div></div>${actions}`;if(card.dataset.yx107Html!==html){card.innerHTML=html;card.dataset.yx107Html=html;card.dataset.yx106Html=html;}card.classList.add('yx106-clean-product-card');});}
  function wrapAfter(name,fn){const cur=window[name];if(typeof cur!=='function'||cur.__yx107)return;const wrapped=async function(){const r=await cur.apply(this,arguments);setTimeout(fn,40);return r;};Object.defineProperty(wrapped,'__yx107',{value:true});window[name]=wrapped;}

  document.addEventListener('click',ev=>{const refresh=ev.target.closest&&ev.target.closest('#today-manual-refresh-btn');if(refresh){ev.preventDefault();ev.stopPropagation();ev.stopImmediatePropagation();loadTodayChanges107({manual:true}).catch(()=>{});return;}const card=ev.target.closest&&ev.target.closest('[data-yx106-today-filter],[data-yx105-today-filter],[data-yx104-today-filter],[data-yx103-today-filter],[data-yx102-today-filter]');if(!card)return;ev.preventDefault();ev.stopPropagation();ev.stopImmediatePropagation();const key=card.dataset.yx106TodayFilter||card.dataset.yx105TodayFilter||card.dataset.yx104TodayFilter||card.dataset.yx103TodayFilter||card.dataset.yx102TodayFilter||'all';activeFilter=(activeFilter===key?'all':key);renderTodaySummary(window.__YX107_TODAY_LAST__||window.__YX106_TODAY_LAST__||{summary:{}});applyTodayFilter();},true);

  function install(){document.documentElement.dataset.yxFix107=VERSION;lockLoader();const bar=document.querySelector('.today-filter-bar');if(bar){bar.hidden=true;bar.style.display='none';}document.querySelectorAll('#today-summary-cards .yx105-today-stack,#today-summary-cards .yx104-today-grid,#today-summary-cards .yx103-today-grid,#today-summary-cards .yx102-today-grid,#today-summary-cards .yx101-today-grid').forEach(el=>el.remove());cleanProductCards107();['loadCustomerBlocks','renderCustomers','loadInventory','loadOrdersList','loadMasterList','refreshSource'].forEach(n=>wrapAfter(n,cleanProductCards107));if(isTodayPage()){renderTodaySummary(window.__YX107_TODAY_LAST__||window.__YX106_TODAY_LAST__||{summary:{}});applyTodayFilter();/* FIX110 disabled old FIX107 automatic today API load; manual refresh only. */}try{window.YX_MASTER=Object.freeze({...(window.YX_MASTER||{}),version:VERSION,loadTodayChanges:loadTodayChanges107,cleanProductCards:cleanProductCards107});}catch(_){} }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  window.addEventListener('pageshow',()=>setTimeout(install,0));
})();
/* ==== FIX107: final manual-today hard lock + no full-page observers + startup speed end ==== */

/* ==== FIX108: speed hard lock + single today UI + stale cache killer start ==== */
(function(){
  'use strict';
  const VERSION='FIX108_SPEED_OLD_UI_HARD_LOCK';
  if(window.__YX108_SPEED_OLD_UI_HARD_LOCK__) return;
  window.__YX108_SPEED_OLD_UI_HARD_LOCK__=true;

  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const qty=v=>{const n=Number(v||0);return Number.isFinite(n)&&n>0?Math.floor(n):0;};
  const isTodayPage=()=>location.pathname.indexOf('/today-changes')>=0;
  const api=window.yxApi||window.requestJSON||(async function(url,opt={}){
    const res=await fetch(url,{credentials:'same-origin',cache:'no-store',...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}});
    const txt=await res.text(); let data={};
    try{data=txt?JSON.parse(txt):{};}catch(_){data={success:false,error:txt||'伺服器回應格式錯誤'};}
    if(!res.ok||data.success===false){throw new Error(data.error||data.message||`請求失敗：${res.status}`);} return data;
  });
  window.yxApi=api;

  let activeFilter='all';
  let loading=null;
  let bootLoaded=false;
  let lastRendered='';

  function summaryOf(data){const s=data?.summary||{};return{inbound:qty(s.inbound_count),outbound:qty(s.outbound_count),orders:qty(s.new_order_count),unplaced:qty(s.unplaced_count)}}
  function todayCard(key,title,num,unit){return `<button type="button" class="yx108-today-card${activeFilter===key?' active':''}" data-yx108-today-filter="${key}"><span class="yx108-today-title">${esc(title)}</span><span class="yx108-today-count"><b>${qty(num)}</b><em>${esc(unit)}</em></span></button>`;}
  function renderTodaySummary(data){
    const box=$('today-summary-cards'); if(!box) return;
    const s=summaryOf(data||window.__YX108_TODAY_LAST__||{summary:{}});
    const html=`<div class="yx108-today-stack">${todayCard('inbound','進貨',s.inbound,'筆')}${todayCard('outbound','出貨',s.outbound,'筆')}${todayCard('orders','新增訂單',s.orders,'筆')}${todayCard('unplaced','未入倉',s.unplaced,'件')}</div>`;
    box.className='card-list yx108-today-root';
    box.dataset.yx108Only='1';
    if(lastRendered!==html||box.innerHTML!==html){box.innerHTML=html;lastRendered=html;}
  }
  function fmt24(v){const raw=clean(v);const m=raw.match(/(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::\d{2})?/);return m?`${m[1]} ${m[2]}`:raw;}
  function logCard(r){return `<div class="today-item deduct-card yx108-log-card" data-log-id="${Number(r?.id||0)}"><strong>${esc(r?.action||'異動')}</strong><div class="small-note">${esc(fmt24(r?.created_at))}｜${esc(r?.username||'')}</div></div>`;}
  function fillList(id,rows,empty){const el=$(id);if(el)el.innerHTML=(Array.isArray(rows)?rows:[]).map(logCard).join('')||`<div class="empty-state-card compact-empty">${esc(empty)}</div>`;}
  function productOf(it){return clean(it?.product_text||it?.product_size||it?.product||'');}
  function customerOf(it){return clean(it?.customer_name||it?.customer||'未指定客戶')||'未指定客戶';}
  function fillUnplaced(data,manual){
    const el=$('today-unplaced-list'); if(!el) return;
    const arr=Array.isArray(data?.unplaced_items)?data.unplaced_items:[];
    if(!manual && !arr.length){el.innerHTML='<div class="empty-state-card compact-empty">未入倉件數不自動重算，請按右上「刷新」更新。</div>';return;}
    el.innerHTML=arr.length?arr.map(it=>`<div class="deduct-card yx108-unplaced-card"><strong>${esc(productOf(it))}</strong><div class="small-note">${esc(customerOf(it))}｜未入倉 ${qty(it.unplaced_qty??it.qty)} 件${it.source_summary?`｜來源：${esc(it.source_summary)}`:''}</div></div>`).join(''):'<div class="empty-state-card compact-empty">目前沒有未入倉商品</div>';
  }
  function applyTodayFilter(){
    document.querySelectorAll('[data-yx108-today-filter]').forEach(c=>c.classList.toggle('active',(c.dataset.yx108TodayFilter||'')===activeFilter));
    document.querySelectorAll('[data-today-panel]').forEach(panel=>{const key=panel.dataset.todayPanel||'';panel.style.display=(activeFilter==='all'||activeFilter===key)?'':'none';});
  }
  function mergeKeepUnplaced(next,manual){
    if(manual) return next||{};
    const old=window.__YX108_TODAY_LAST__||null;
    if(!old) return next||{};
    next=next||{}; next.summary={...(next.summary||{})};
    next.summary.unplaced_count=old.summary?.unplaced_count||0;
    next.summary.unplaced_row_count=old.summary?.unplaced_row_count||0;
    next.unplaced_items=Array.isArray(old.unplaced_items)?old.unplaced_items:[];
    return next;
  }
  function renderToday(data,manual){
    renderTodaySummary(data);
    fillList('today-inbound-list',data?.feed?.inbound,'今天沒有進貨');
    fillList('today-outbound-list',data?.feed?.outbound,'今天沒有出貨');
    fillList('today-order-list',data?.feed?.new_orders,'今天沒有新增訂單');
    fillUnplaced(data,manual);
    applyTodayFilter();
  }
  async function loadTodayChanges108(opts={}){
    if(!isTodayPage()) return window.__YX108_TODAY_LAST__||{success:true,summary:{},feed:{}};
    const manual=!!(opts&& (opts.manual||opts.refresh||opts.force));
    if(!manual){bootLoaded=true;renderToday(window.__YX108_TODAY_LAST__||{summary:{},feed:{}},false);return window.__YX108_TODAY_LAST__||{success:true,summary:{},feed:{}};}
    if(loading) return loading;
    const btn=$('today-manual-refresh-btn');
    if(btn&&manual){btn.disabled=true;btn.textContent='刷新中…';}
    loading=(async()=>{
      const url=manual?('/api/today-changes?refresh=1&ts='+Date.now()):('/api/today-changes?ts='+Date.now());
      let data=await api(url,{method:'GET'});
      data=mergeKeepUnplaced(data,manual);
      window.__YX108_TODAY_LAST__=data;
      bootLoaded=true;
      renderToday(data,manual);
      if(manual){try{await api('/api/today-changes/read',{method:'POST',body:JSON.stringify({})});}catch(_){}}
      return data;
    })().catch(e=>{const box=$('today-summary-cards'); if(box) box.innerHTML=`<div class="error-card">${esc(e.message||'今日異動載入失敗')}</div>`; throw e;}).finally(()=>{if(btn){btn.disabled=false;btn.textContent='刷新';}setTimeout(()=>{loading=null;},250);});
    return loading;
  }
  loadTodayChanges108.__yx108=true;
  try{Object.defineProperty(window,'loadTodayChanges',{configurable:true,enumerable:true,get(){return loadTodayChanges108;},set(_fn){}});}catch(_){window.loadTodayChanges=loadTodayChanges108;}

  function normalizeX(v){return clean(v).replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/[＋，,；;]/g,'+').replace(/\s+/g,'');}
  function qtyFromFormula(text,fallback){try{if(typeof window.yxEffectiveQty==='function')return qty(window.yxEffectiveQty(text,fallback||0));}catch(_){}const raw=normalizeX(text);const right=raw.includes('=')?raw.split('=').slice(1).join('='):raw;let total=0,hit=false;right.split('+').forEach(seg=>{seg=clean(seg);if(!seg)return;const m=seg.match(/x(\d+)$/i);if(m){total+=Number(m[1]||0);hit=true;}else if(/\d/.test(seg)){total+=1;hit=true;}});return hit?total:qty(fallback);}
  function sourceRows(source){return(window.__yx63Rows&&window.__yx63Rows[source])||[];}
  function rowByCard(card){const source=card.dataset.source||'';const id=Number(card.dataset.id||0);return sourceRows(source).find(r=>Number(r.id||0)===id)||null;}
  function rowFormula(row){const p=clean(row?.product_text||row?.product_size||row?.size||'');if(p)return normalizeX(p);const size=clean(row?.size||'');const support=clean(row?.support||row?.support_text||'');return normalizeX(support?`${size}=${support}`:size);}
  function rowMaterial(row){let m=clean(row?.material||row?.product_code||row?.wood_type||'');const prod=normalizeX(row?.product_text||'');if(!m||normalizeX(m)===prod||/^未填/.test(m))return '';return m;}
  function fallbackFormula(card){let txt=clean(card.textContent).replace(/編輯|直接出貨|刪除|未填材質|材質|尺寸|支數\s*[xX]\s*件數|數量|客戶[:：]?[^\n]*/g,' ');const m=txt.match(/(?:\d{1,2}月)?\s*\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?\s*=\s*[0-9xX+＋\s]+/);return normalizeX(m?m[0]:'');}
  function fallbackMaterial(card){const text=clean(card.textContent).replace(/未填材質/g,'');return(text.match(/(RDT|尤加利|SPF|HF|DF|SPY|SP|RP|TD|MKJ|LVL|南方松|花旗|鐵杉)/i)||[])[1]||'';}
  function actionButtons(card){const existing=card.querySelector('.yx63-card-actions,.yx108-card-actions');if(existing)return existing.outerHTML;const btns=Array.from(card.querySelectorAll('button')).map(b=>b.outerHTML).join('');return btns?`<div class="yx108-card-actions">${btns}</div>`:'';}
  function cleanProductCards108(){
    document.querySelectorAll('.yx63-item-card,.inventory-action-card').forEach(card=>{
      const row=rowByCard(card);
      const formula=row?rowFormula(row):fallbackFormula(card);
      if(!formula) return;
      const q=row?qty(row.qty||qtyFromFormula(formula,0)):qtyFromFormula(formula,0);
      if(q<=0&&/未填材質/.test(clean(card.textContent))){card.classList.add('yx108-hidden-empty-card');return;}
      const material=row?rowMaterial(row):fallbackMaterial(card);
      const meta=material?`${material} ${q}件`:`${q}件`;
      const actions=actionButtons(card);
      const html=`<div class="yx108-product-main"><div class="yx108-product-meta">${esc(meta)}</div><div class="yx108-product-formula">${esc(formula)}</div></div>${actions}`;
      if(card.dataset.yx108Html!==html){card.innerHTML=html;card.dataset.yx108Html=html;}
      card.classList.add('yx108-clean-product-card');
    });
  }
  function wrapAfter(name,fn){const cur=window[name];if(typeof cur!=='function'||cur.__yx108)return;const wrapped=async function(){const r=await cur.apply(this,arguments);setTimeout(fn,30);return r;};Object.defineProperty(wrapped,'__yx108',{value:true});window[name]=wrapped;}

  document.addEventListener('click',ev=>{
    const refresh=ev.target.closest&&ev.target.closest('#today-manual-refresh-btn');
    if(refresh){ev.preventDefault();ev.stopPropagation();ev.stopImmediatePropagation();loadTodayChanges108({manual:true}).catch(()=>{});return;}
    const card=ev.target.closest&&ev.target.closest('[data-yx108-today-filter]');
    if(card){ev.preventDefault();ev.stopPropagation();ev.stopImmediatePropagation();activeFilter=(activeFilter===(card.dataset.yx108TodayFilter||'all'))?'all':(card.dataset.yx108TodayFilter||'all');renderTodaySummary(window.__YX108_TODAY_LAST__||{summary:{}});applyTodayFilter();}
  },true);

  function install(){
    document.documentElement.dataset.yxFix108=VERSION;
    const bar=document.querySelector('.today-filter-bar'); if(bar){bar.hidden=true;bar.style.display='none';}
    document.querySelectorAll('#today-summary-cards .yx101-today-grid,#today-summary-cards .yx102-today-grid,#today-summary-cards .yx103-today-grid,#today-summary-cards .yx104-today-grid,#today-summary-cards .yx105-today-stack,#today-summary-cards .yx106-today-stack').forEach(el=>el.remove());
    cleanProductCards108();
    ['loadCustomerBlocks','renderCustomers','loadInventory','loadOrdersList','loadMasterList','refreshSource'].forEach(n=>wrapAfter(n,cleanProductCards108));
    if(isTodayPage()){
      renderTodaySummary(window.__YX108_TODAY_LAST__||{summary:{}});
      applyTodayFilter();
      /* FIX110 disabled old FIX108 automatic today API load; manual refresh only. */
      const box=$('today-summary-cards');
      if(box){ box.dataset.yx108Observed='disabled-by-fix110'; }
    }
    try{window.YX_MASTER=Object.freeze({...(window.YX_MASTER||{}),version:VERSION,loadTodayChanges:loadTodayChanges108,cleanProductCards:cleanProductCards108});}catch(_e){}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  install.__yx108SafePageshow=true;
  window.addEventListener('pageshow',install);
})();
/* ==== FIX108: speed hard lock + single today UI + stale cache killer end ==== */

/* ==== FIX110: final legacy removal + single manual today UI + speed master start ==== */
(function(){
  'use strict';
  const VERSION='FIX110_LEGACY_REMOVAL_SPEED_MASTER';
  if(window.__YX110_FINAL_INSTALLED__) return;
  window.__YX110_FINAL_INSTALLED__=true;
  const $=id=>document.getElementById(id);
  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const qty=v=>{const n=Number(v||0);return Number.isFinite(n)&&n>0?Math.floor(n):0;};
  const api=window.yxApi||window.requestJSON||(async function(url,opt={}){const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}});const txt=await r.text();let d={};try{d=txt?JSON.parse(txt):{};}catch(_){d={success:false,error:txt||'伺服器回應格式錯誤'};}if(!r.ok||d.success===false)throw new Error(d.error||d.message||`請求失敗：${r.status}`);return d;});
  window.yxApi=api;
  let loading=null;
  let activeFilter='all';
  const isToday=()=>location.pathname.indexOf('/today-changes')>=0;
  function emptyData(){return {success:true,summary:{inbound_count:0,outbound_count:0,new_order_count:0,unplaced_count:0,unplaced_row_count:0,unread_count:0,anomaly_count:0},feed:{inbound:[],outbound:[],new_orders:[],others:[]},unplaced_items:[],anomalies:[],anomaly_groups:{unplaced:[]},read_at:''};}
  function summaryOf(data){const s=(data&&data.summary)||{};return {inbound:qty(s.inbound_count),outbound:qty(s.outbound_count),orders:qty(s.new_order_count),unplaced:qty(s.unplaced_count)};}
  function todayCard(key,title,num,unit){return `<button type="button" class="yx110-today-card${activeFilter===key?' active':''}" data-yx110-today-filter="${key}"><span class="yx110-today-title">${esc(title)}</span><span class="yx110-today-count"><b>${qty(num)}</b><em>${esc(unit)}</em></span></button>`;}
  function renderSummary(data){const box=$('today-summary-cards');if(!box)return;const s=summaryOf(data||window.__YX110_TODAY_LAST__||emptyData());const html=`<div class="yx110-today-stack">${todayCard('inbound','進貨',s.inbound,'筆')}${todayCard('outbound','出貨',s.outbound,'筆')}${todayCard('orders','新增訂單',s.orders,'筆')}${todayCard('unplaced','未入倉',s.unplaced,'件')}</div>`;box.className='card-list yx110-today-root';if(box.dataset.yx110Html!==html){box.innerHTML=html;box.dataset.yx110Html=html;}}
  function fmt24(v){const raw=clean(v);const m=raw.match(/(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::\d{2})?/);return m?`${m[1]} ${m[2]}`:raw;}
  function logCard(r){return `<div class="today-item deduct-card yx110-log-card" data-log-id="${Number(r?.id||0)}"><strong>${esc(r?.action||'異動')}</strong><div class="small-note">${esc(fmt24(r?.created_at))}｜${esc(r?.username||'')}</div><button type="button" class="ghost-btn tiny-btn danger-btn" data-yx110-delete-today="${Number(r?.id||0)}">刪除</button></div>`;}
  function fill(id,rows,empty){const el=$(id);if(el)el.innerHTML=(Array.isArray(rows)?rows:[]).map(logCard).join('')||`<div class="empty-state-card compact-empty">${esc(empty)}</div>`;}
  function productOf(it){return clean(it?.product_text||it?.product_size||it?.product||'');}
  function customerOf(it){return clean(it?.customer_name||it?.customer||'未指定客戶')||'未指定客戶';}
  function fillUnplaced(data,manual){const el=$('today-unplaced-list');if(!el)return;const arr=Array.isArray(data?.unplaced_items)?data.unplaced_items:[];if(!manual){el.innerHTML='<div class="empty-state-card compact-empty">未入倉件數不自動重算，請按右上「刷新」更新。</div>';return;}el.innerHTML=arr.length?arr.map(it=>`<div class="deduct-card yx110-unplaced-card"><strong>${esc(productOf(it))}</strong><div class="small-note">${esc(customerOf(it))}｜未入倉 ${qty(it.unplaced_qty??it.qty)} 件${it.source_summary?`｜來源：${esc(it.source_summary)}`:''}</div></div>`).join(''):'<div class="empty-state-card compact-empty">目前沒有未入倉商品</div>';}
  function applyFilter(){document.querySelectorAll('[data-yx110-today-filter]').forEach(c=>c.classList.toggle('active',(c.dataset.yx110TodayFilter||'')===activeFilter));document.querySelectorAll('[data-today-panel]').forEach(panel=>{const key=panel.dataset.todayPanel||'';panel.style.display=(activeFilter==='all'||activeFilter===key)?'':'none';});}
  function render(data,manual){data=data||window.__YX110_TODAY_LAST__||emptyData();renderSummary(data);fill('today-inbound-list',data?.feed?.inbound,'今天沒有進貨');fill('today-outbound-list',data?.feed?.outbound,'今天沒有出貨');fill('today-order-list',data?.feed?.new_orders,'今天沒有新增訂單');fillUnplaced(data,!!manual);applyFilter();}
  async function loadTodayChanges110(opts={}){if(!isToday())return window.__YX110_TODAY_LAST__||emptyData();const manual=!!(opts&& (opts.manual||opts.refresh||opts.force));if(!manual){render(window.__YX110_TODAY_LAST__||emptyData(),false);return window.__YX110_TODAY_LAST__||emptyData();}if(loading)return loading;const btn=$('today-manual-refresh-btn');if(btn){btn.disabled=true;btn.textContent='刷新中…';}loading=(async()=>{window.__YX110_ALLOW_TODAY_FETCH__=true;let data;try{data=await api('/api/today-changes?refresh=1&ts='+Date.now(),{method:'GET'});}finally{window.__YX110_ALLOW_TODAY_FETCH__=false;}window.__YX110_TODAY_LAST__=data;window.__YX108_TODAY_LAST__=data;window.__YX107_TODAY_LAST__=data;window.__YX106_TODAY_LAST__=data;render(data,true);try{await api('/api/today-changes/read',{method:'POST',body:JSON.stringify({})});}catch(_){}return data;})().catch(e=>{const box=$('today-summary-cards');if(box)box.innerHTML=`<div class="error-card">${esc(e.message||'今日異動刷新失敗')}</div>`;try{(window.notify||window.toast||alert)(e.message||'今日異動刷新失敗','error');}catch(_){}throw e;}).finally(()=>{if(btn){btn.disabled=false;btn.textContent='刷新';}setTimeout(()=>{loading=null;},260);});return loading;}
  loadTodayChanges110.__yx110=true;
  function filterToday(key){activeFilter=(activeFilter===key?'all':(key||'all'));renderSummary(window.__YX110_TODAY_LAST__||emptyData());applyFilter();}
  window.__YX110_refreshToday=()=>loadTodayChanges110({manual:true}).catch(()=>{});
  window.__YX110_filterToday=filterToday;
  try{Object.defineProperty(window,'loadTodayChanges',{configurable:true,enumerable:true,get(){return loadTodayChanges110;},set(_fn){}});}catch(_){window.loadTodayChanges=loadTodayChanges110;}

  function normX(v){return clean(v).replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/[＋，,；;]/g,'+').replace(/\s+/g,'');}
  function qtyFromFormula(text,fallback){try{if(typeof window.yxEffectiveQty==='function')return qty(window.yxEffectiveQty(text,fallback||0));}catch(_){}const raw=normX(text);const right=raw.includes('=')?raw.split('=').slice(1).join('='):raw;let total=0,hit=false;right.split('+').forEach(seg=>{seg=clean(seg);if(!seg)return;const m=seg.match(/x(\d+)$/i);if(m){total+=Number(m[1]||0);hit=true;}else if(/\d/.test(seg)){total+=1;hit=true;}});return hit?total:qty(fallback);}
  function sourceRows(source){return(window.__yx63Rows&&window.__yx63Rows[source])||[];}
  function rowByCard(card){const source=card.dataset.source||'';const id=Number(card.dataset.id||0);return sourceRows(source).find(r=>Number(r.id||0)===id)||null;}
  function rowFormula(row){const p=clean(row?.product_text||row?.product_size||row?.size||'');if(p)return normX(p);const size=clean(row?.size||'');const support=clean(row?.support||row?.support_text||'');return normX(support?`${size}=${support}`:size);}
  function rowMaterial(row){let m=clean(row?.material||row?.product_code||row?.wood_type||'');const prod=normX(row?.product_text||'');if(!m||normX(m)===prod||/^未填/.test(m))return '';return m;}
  function fallbackFormula(card){let txt=clean(card.textContent).replace(/編輯|直接出貨|刪除|未填材質|材質|尺寸|支數\s*[xX]\s*件數|數量|客戶[:：]?[^\n]*/g,' ');const m=txt.match(/(?:\d{1,2}月)?\s*\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?\s*=\s*[0-9xX+＋\s]+/);return normX(m?m[0]:'');}
  function fallbackMaterial(card){const text=clean(card.textContent).replace(/未填材質/g,'');return(text.match(/(RDT|尤加利|SPF|HF|DF|SPY|SP|RP|TD|MKJ|LVL|南方松|花旗|鐵杉)/i)||[])[1]||'';}
  function actionButtons(card){const existing=card.querySelector('.yx63-card-actions,.yx108-card-actions,.yx110-card-actions');if(existing)return existing.outerHTML;const btns=Array.from(card.querySelectorAll('button')).map(b=>b.outerHTML).join('');return btns?`<div class="yx110-card-actions">${btns}</div>`:'';}
  function cleanProductCards110(){document.querySelectorAll('.yx63-item-card,.inventory-action-card').forEach(card=>{if(card.closest('#today-summary-cards,#today-inbound-list,#today-outbound-list,#today-order-list,#today-unplaced-list'))return;const row=rowByCard(card);const formula=row?rowFormula(row):fallbackFormula(card);if(!formula)return;const q=row?qty(row.qty||qtyFromFormula(formula,0)):qtyFromFormula(formula,0);if(q<=0&&/未填材質/.test(clean(card.textContent))){card.classList.add('yx110-hidden-empty-card');return;}const material=row?rowMaterial(row):fallbackMaterial(card);const meta=material?`${material} ${q}件`:`${q}件`;const actions=actionButtons(card);const html=`<div class="yx110-product-main"><div class="yx110-product-meta">${esc(meta)}</div><div class="yx110-product-formula">${esc(formula)}</div></div>${actions}`;if(card.dataset.yx110Html!==html){card.innerHTML=html;card.dataset.yx110Html=html;}card.classList.add('yx110-clean-product-card');});}
  function wrapAfter(name,fn){const cur=window[name];if(typeof cur!=='function'||cur.__yx110)return;const wrapped=async function(){const r=await cur.apply(this,arguments);setTimeout(fn,25);return r;};Object.defineProperty(wrapped,'__yx110',{value:true});window[name]=wrapped;}
  document.addEventListener('click',async ev=>{const del=ev.target?.closest?.('[data-yx110-delete-today]');if(del){ev.preventDefault();ev.stopPropagation();ev.stopImmediatePropagation();const id=del.getAttribute('data-yx110-delete-today');try{await api('/api/today-changes/'+encodeURIComponent(id),{method:'DELETE'});del.closest('.today-item,.deduct-card,.card')?.remove();}catch(e){try{(window.notify||window.toast||alert)(e.message||'刪除失敗','error');}catch(_){}}}},true);
  function install(){document.documentElement.dataset.yxFix110=VERSION;const bar=document.querySelector('.today-filter-bar');if(bar){bar.hidden=true;bar.style.display='none';}cleanProductCards110();['loadCustomerBlocks','renderCustomers','loadInventory','loadOrdersList','loadMasterList','refreshSource'].forEach(n=>wrapAfter(n,cleanProductCards110));if(isToday()){render(window.__YX110_TODAY_LAST__||emptyData(),false);}try{window.YX_MASTER=Object.freeze({...(window.YX_MASTER||{}),version:VERSION,loadTodayChanges:loadTodayChanges110,cleanProductCards:cleanProductCards110});}catch(_){} }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  install.__yx110SafePageshow=true;
  window.addEventListener('pageshow',install);
})();
/* ==== FIX110: final legacy removal + single manual today UI + speed master end ==== */

/* FIX110_LEGACY_SPEED_MASTER */
