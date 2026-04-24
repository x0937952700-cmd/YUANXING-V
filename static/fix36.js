/* ==== FIX36：出貨客戶商品下拉 + 材積/長度/重量預覽後確認出貨 ==== */
(function(){
  'use strict';
  const VERSION = 'fix36-ship-customer-picker-preview-volume';
  window.__YUANXING_FIX_VERSION__ = VERSION;
  document.documentElement.dataset.yxVersion = VERSION;

  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  const mod = () => document.querySelector('.module-screen')?.dataset?.module || (location.pathname.includes('/ship') ? 'ship' : '');
  const say = (msg, type='ok') => typeof window.toast === 'function' ? window.toast(msg, type) : alert(msg);

  async function api(url, options={}){
    if (typeof window.requestJSON === 'function') return window.requestJSON(url, options);
    const opts = { credentials:'same-origin', ...options };
    opts.headers = { 'Content-Type':'application/json', ...(options.headers || {}) };
    const res = await fetch(url, opts);
    const data = await res.json().catch(()=>({}));
    if(!res.ok || data.success === false){ const err = new Error(data.error || data.message || `請求失敗：${res.status}`); err.payload = data; throw err; }
    return data;
  }

  function normalizeX(v){
    return String(v || '')
      .replace(/[Ｘ×✕＊*X]/g,'x')
      .replace(/[＝]/g,'=')
      .replace(/（/g,'(').replace(/）/g,')')
      .replace(/\u3000/g,' ')
      .trim();
  }
  function padSize(left){
    const nums = String(left || '').replace(/[×X＊*]/g,'x').match(/\d+/g) || [];
    if(nums.length < 3) return '';
    return `${Number(nums[0])}x${Number(nums[1])}x${String(Number(nums[2])).padStart(2,'0')}`;
  }
  function calcPieces(right){
    let total = 0;
    String(right || '').split(/[+＋,，;；]/).forEach(seg => {
      const nums = String(seg || '').match(/\d+/g) || [];
      if(nums.length >= 2) total += Number(nums[1] || 0) || 0;
      else if(nums.length === 1) total += 1;
    });
    return Math.max(1, total || 1);
  }
  function calcSupportTotal(right){
    let total = 0;
    const parts = [];
    String(right || '').split(/[+＋,，;；]/).forEach(seg => {
      const nums = String(seg || '').match(/\d+/g) || [];
      if(!nums.length) return;
      if(nums.length >= 2){
        const a = Number(nums[0] || 0) || 0, b = Number(nums[1] || 0) || 0;
        total += a * b;
        parts.push(`${a}x${b}`);
      }else{
        const a = Number(nums[0] || 0) || 0;
        total += a;
        parts.push(`${a}`);
      }
    });
    return { total, expr: parts.join('+') || '0' };
  }
  function parseShipItems(){
    const box = $('ocr-text');
    const raw = normalizeX(box?.value || '');
    if(!raw) return [];
    const out = [];
    let last = ['', '', ''];
    const pushToken = (token) => {
      const parts = String(token || '').split(/=|:/);
      const left = parts.shift() || '';
      let right = parts.join('=').replace(/^[=:]+/,'').trim().replace(/\s+/g,'');
      right = normalizeX(right).replace(/[^0-9A-Za-z一-鿿xX+＋\-()]/g, '');
      const dimsRaw = String(left || '').split(/x/i).map(s => s.trim());
      const dims = [0,1,2].map(i => {
        const v = dimsRaw[i] || '';
        if(!v || /^[_-]+$/.test(v)) return last[i] || '';
        return String(Number(v));
      });
      if(dims[0] && dims[1] && dims[2]) last = dims.slice();
      if(!dims[0] || !dims[1] || !dims[2] || !right) return;
      const size = `${Number(dims[0])}x${Number(dims[1])}x${String(Number(dims[2])).padStart(2,'0')}`;
      const product_text = `${size}=${right}`;
      out.push({ product_text, product_code: product_text, qty: calcPieces(right) });
    };
    raw.split(/\n+/).map(s => normalizeX(s).replace(/\s+/g,'')).filter(Boolean).forEach(line => {
      const tokens = line.match(/(?:[_-]|\d{1,4})x(?:[_-]|\d{1,4})x(?:[_-]|\d{1,4})\s*(?:=|:)\s*[^\n]+/ig) || [];
      if(tokens.length) tokens.forEach(pushToken);
      else if(line.includes('=') && /x/i.test(line)) pushToken(line);
    });
    const merged = new Map();
    out.forEach(it => {
      const key = it.product_text;
      if(!merged.has(key)) merged.set(key, {...it});
      else merged.get(key).qty += Number(it.qty || 0) || 0;
    });
    return Array.from(merged.values()).filter(it => it.product_text && Number(it.qty || 0) > 0);
  }

  function appendProductsToTextarea(products, replace=false){
    const box = $('ocr-text');
    if(!box) return;
    const lines = (products || []).map(it => String(it.product_text || '').trim()).filter(Boolean);
    if(!lines.length) return say('沒有可加入的商品', 'warn');
    const before = replace ? '' : box.value.trim();
    box.value = [before, ...lines].filter(Boolean).join('\n');
    box.dispatchEvent(new Event('input', {bubbles:true}));
    renderSelectedListQuick();
    say(`已加入 ${lines.length} 筆到商品資料`, 'ok');
  }

  async function loadCustomerProducts(){
    if(mod() !== 'ship') return [];
    const sel = $('ship-customer-item-select');
    const name = ($('customer-name')?.value || '').trim();
    if(!sel) return [];
    if(!name){
      sel.innerHTML = '<option value="">請先選擇 / 輸入客戶名稱</option>';
      window.__fix36CustomerItems = [];
      return [];
    }
    sel.innerHTML = '<option value="">載入客戶商品中…</option>';
    try{
      const data = await api(`/api/customer-items?name=${encodeURIComponent(name)}&ts=${Date.now()}`, {method:'GET'});
      const items = Array.isArray(data.items) ? data.items : [];
      window.__fix36CustomerItems = items;
      if(!items.length){
        sel.innerHTML = '<option value="">此客戶目前沒有可出貨商品</option>';
        return [];
      }
      sel.innerHTML = items.map((it, idx) => {
        const text = String(it.product_text || '');
        const source = String(it.source || '');
        const qty = Number(it.qty || 0) || 0;
        const mat = String(it.material || (it.product_code && it.product_code !== it.product_text ? it.product_code : '') || '');
        return `<option value="${idx}">${esc(text)}｜${esc(source)}｜${qty}件${mat ? '｜' + esc(mat) : ''}</option>`;
      }).join('');
      return items;
    }catch(e){
      sel.innerHTML = `<option value="">${esc(e.message || '商品載入失敗')}</option>`;
      return [];
    }
  }

  function selectedDropdownItem(){
    const sel = $('ship-customer-item-select');
    const idx = Number(sel?.value ?? -1);
    const items = window.__fix36CustomerItems || [];
    return Number.isInteger(idx) && idx >= 0 ? items[idx] : null;
  }

  function renderSelectedListQuick(){
    const box = $('ship-selected-items');
    if(!box || mod() !== 'ship') return;
    const items = parseShipItems();
    if(!items.length){
      box.innerHTML = '<div class="empty-state-card compact-empty">尚未加入要出貨的商品</div>';
      return;
    }
    box.innerHTML = items.map((it, idx) => `<div class="ship-selected-card fix36-ship-selected-card">
      <div class="ship-selected-main"><strong>${esc(it.product_text)}</strong><span class="ship-need-chip">本次件數 ${Number(it.qty || 0)}</span></div>
      <div class="ship-selected-actions"><button type="button" class="ghost-btn tiny-btn" data-fix36-remove="${idx}">移除</button></div>
    </div>`).join('');
    box.querySelectorAll('[data-fix36-remove]').forEach(btn => btn.addEventListener('click', () => {
      const index = Number(btn.dataset.fix36Remove || 0);
      const current = parseShipItems();
      current.splice(index, 1);
      if($('ocr-text')) $('ocr-text').value = current.map(x => x.product_text).join('\n');
      renderSelectedListQuick();
    }));
  }

  function factorLength(n){ return Number(n) > 210 ? Number('0.' + String(Number(n))) : Number(n) / 100; }
  function factorWidth(n){ return Number(n) / 10; }
  function factorHeight(n){ return Number(n) >= 100 ? Number(n) / 100 : Number(n) / 10; }
  function fmt(n){
    const x = Number(n || 0);
    if(!Number.isFinite(x)) return '0';
    return (Math.round(x * 1000000) / 1000000).toString();
  }
  function itemMeasure(item){
    const text = String(item.product_text || '');
    const [left, right=''] = text.split('=');
    const nums = (left.match(/\d+/g) || []).map(Number);
    if(nums.length < 3) return { supportTotal:0, volume:0, formula:'無法計算', lengthFormula:'無法計算' };
    const [L, W, H] = nums;
    const support = calcSupportTotal(right);
    const lf = factorLength(L), wf = factorWidth(W), hf = factorHeight(H);
    const volume = support.total * lf * wf * hf;
    return {
      length: L, width: W, height: H,
      supportTotal: support.total,
      supportExpr: support.expr,
      volume,
      formula: `(${support.expr})x${fmt(lf)}x${fmt(wf)}x${fmt(hf)}`,
      lengthFormula: `${support.expr}=${fmt(support.total)}`,
    };
  }
  function totalsFor(items){
    return (items || []).reduce((acc, it) => {
      const m = itemMeasure(it);
      acc.volume += m.volume;
      acc.supportTotal += m.supportTotal;
      acc.pieces += Number(it.qty || 0) || 0;
      return acc;
    }, {volume:0, supportTotal:0, pieces:0});
  }

  function ensurePreviewModal(){
    let modal = $('fix36-ship-preview-modal');
    if(modal) return modal;
    modal = document.createElement('div');
    modal.id = 'fix36-ship-preview-modal';
    modal.className = 'modal hidden';
    modal.innerHTML = `<div class="modal-card glass fix36-ship-preview-modal-card">
      <div class="modal-head">
        <div class="section-title">出貨預覽</div>
        <button class="icon-btn" type="button" id="fix36-preview-close">✕</button>
      </div>
      <div id="fix36-preview-body"></div>
      <div class="btn-row fix36-preview-footer">
        <button class="ghost-btn" type="button" id="fix36-preview-cancel">取消</button>
        <button class="primary-btn" type="button" id="fix36-preview-confirm">確認出貨</button>
      </div>
    </div>`;
    document.body.appendChild(modal);
    return modal;
  }

  function renderPreviewHtml(previewData, items){
    const totals = totalsFor(items);
    const rows = previewData.items || [];
    const itemMap = new Map(items.map(it => [it.product_text, it]));
    const bodyRows = rows.map(row => {
      const base = itemMap.get(row.product_text) || {product_text: row.product_text, qty: row.qty};
      const m = itemMeasure(base);
      const sourceRows = (row.source_breakdown || []).map(s => `<span class="ship-mini-chip">${esc(s.source)} 可扣 ${Number(s.available || 0)}</span>`).join('');
      const locs = (row.locations || []).map(l => `<span class="ship-location-chip">${esc(l.zone || '')}-${esc(l.column_index || '')}-${String(l.visual_slot || l.slot_number || '').padStart(2,'0')}｜可出 ${Number(l.ship_qty || l.qty || 0)}</span>`).join('') || '<span class="small-note">倉庫圖尚未找到此商品位置</span>';
      const shortage = Array.isArray(row.shortage_reasons) && row.shortage_reasons.length ? `<div class="error-card compact-danger">${esc(row.shortage_reasons.join('、'))}</div>` : '';
      return `<div class="ship-breakdown-item fix36-preview-item">
        <div class="fix36-preview-title"><strong>${esc(row.product_text || '')}</strong><span>本次 ${Number(row.qty || 0)} 件</span></div>
        <div class="ship-selected-meta">${sourceRows}</div>
        ${shortage}
        <div class="small-note">倉庫位置：${locs}</div>
        <div class="fix36-calc-box">
          <div>長度計算：<strong>${esc(m.lengthFormula)}</strong></div>
          <div>材積算式：<strong>${esc(m.formula)}</strong> = <strong>${fmt(m.volume)}</strong></div>
        </div>
      </div>`;
    }).join('');
    return `<div class="fix36-summary-grid">
      <div class="ship-summary-chip">本次件數<span class="small-note">${Number(totals.pieces || 0)}</span></div>
      <div class="ship-summary-chip">長度合計<span class="small-note">${fmt(totals.supportTotal)}</span></div>
      <div class="ship-summary-chip">材積合計<span class="small-note" id="fix36-total-volume">${fmt(totals.volume)}</span></div>
      <label class="ship-summary-chip fix36-weight-chip">重量<input class="text-input" id="fix36-weight-input" type="number" inputmode="decimal" placeholder="輸入重量"></label>
      <div class="ship-summary-chip">總重<span class="small-note" id="fix36-total-weight">0</span></div>
    </div>
    <div class="small-note fix36-preview-note">總重 = 材積 × 重量。確認下方倉庫位置、材積與長度後，再按「確認出貨」才會真正扣庫存。</div>
    ${bodyRows || '<div class="empty-state-card compact-empty">沒有可預覽的商品</div>'}`;
  }

  async function showShipPreviewAndConfirm(items, previewData){
    const modal = ensurePreviewModal();
    const body = modal.querySelector('#fix36-preview-body');
    const close = (ok=false) => new Promise(resolve => {
      const cleanup = val => { modal.classList.add('hidden'); resolve(val); };
      modal.querySelector('#fix36-preview-close').onclick = () => cleanup(false);
      modal.querySelector('#fix36-preview-cancel').onclick = () => cleanup(false);
      modal.querySelector('#fix36-preview-confirm').onclick = () => cleanup(true);
    });
    body.innerHTML = renderPreviewHtml(previewData, items);
    const totalVolume = totalsFor(items).volume;
    const weightInput = modal.querySelector('#fix36-weight-input');
    const totalWeight = modal.querySelector('#fix36-total-weight');
    weightInput?.addEventListener('input', () => {
      const w = Number(weightInput.value || 0) || 0;
      if(totalWeight) totalWeight.textContent = fmt(totalVolume * w);
    });
    modal.classList.remove('hidden');
    return close();
  }

  async function askSimpleConfirm(title, message, confirmText='確認'){
    if(typeof window.confirmDialog === 'function') return window.confirmDialog({title, message, confirmText});
    return window.confirm(`${title}\n${String(message || '').replace(/<[^>]+>/g,'')}`);
  }

  async function submitShipAfterPreview(){
    const btn = $('submit-btn');
    const resultPanel = $('module-result');
    const customer = ($('customer-name')?.value || '').trim();
    const items = parseShipItems();
    if(!customer){ say('請先輸入客戶名稱', 'warn'); return; }
    if(!items.length){
      say('沒有可送出的商品資料', 'warn');
      if(resultPanel){
        resultPanel.classList.remove('hidden'); resultPanel.style.display = '';
        resultPanel.innerHTML = '<div class="section-title">送出失敗</div><div class="muted">請先從客戶商品清單加入商品，或確認格式例如 80x30x125=111+132x3。</div>';
      }
      return;
    }
    try{
      if(btn){ btn.dataset.busy='1'; btn.disabled=true; btn.textContent='產生預覽中…'; }
      const preview = await api('/api/ship-preview', {method:'POST', body:JSON.stringify({customer_name:customer, items})});
      if(btn) btn.textContent='確認中…';
      const ok = await showShipPreviewAndConfirm(items, preview);
      if(!ok) return;
      if(btn) btn.textContent='出貨中…';
      await api('/api/customers', {method:'POST', body:JSON.stringify({name:customer, preserve_existing:true})}).catch(()=>null);
      const payload = {customer_name: customer, items, ocr_text: $('ocr-text')?.value || '', request_key: `ship_fix36__${customer}__${Date.now()}__${Math.random().toString(36).slice(2,9)}`};
      let response;
      try{
        response = await api('/api/ship', {method:'POST', body:JSON.stringify(payload)});
      }catch(e){
        if(e?.payload?.requires_inventory_fallback){
          const ok2 = await askSimpleConfirm('出貨扣除確認', `<div>${esc(e.payload.error || '客戶總單 / 訂單不足')}</div><div class="small-note">按確認後會改扣庫存。</div>`, '確認改扣庫存');
          if(!ok2) throw e;
          response = await api('/api/ship', {method:'POST', body:JSON.stringify({...payload, allow_inventory_fallback:true, request_key:`ship_fix36_fallback__${customer}__${Date.now()}__${Math.random().toString(36).slice(2,9)}`})});
        }else throw e;
      }
      const totals = totalsFor(items);
      const breakdown = Array.isArray(response?.breakdown) ? response.breakdown : [];
      if(resultPanel){
        resultPanel.classList.remove('hidden'); resultPanel.style.display = '';
        resultPanel.innerHTML = `<div class="section-title">本次扣除摘要</div><div class="fix36-summary-grid"><div class="ship-summary-chip">材積合計<span class="small-note">${fmt(totals.volume)}</span></div><div class="ship-summary-chip">長度合計<span class="small-note">${fmt(totals.supportTotal)}</span></div></div>` +
          (breakdown.length ? breakdown.map(row => `<div class="deduct-card"><div><strong>${esc(row.product_text || '')}</strong></div><div>本次出貨：${Number(row.qty || 0)}</div><div>扣總單：${Number(row.master_deduct || 0)}</div><div>扣訂單：${Number(row.order_deduct || 0)}</div><div>扣庫存：${Number(row.inventory_deduct || 0)}</div></div>`).join('') : '<div class="empty-state-card compact-empty">已送出，但沒有扣除摘要</div>');
      }
      say('出貨送出成功', 'ok');
      try{ await window.loadCustomerBlocks?.(); await window.selectCustomerForModule?.(customer); await loadCustomerProducts(); }catch(_e){}
    }catch(e){
      const msg = e?.payload?.error || e?.message || '出貨失敗';
      if(resultPanel){ resultPanel.classList.remove('hidden'); resultPanel.style.display=''; resultPanel.innerHTML = `<div class="section-title">送出失敗</div><div class="muted">${esc(msg)}</div>`; }
      say(msg, 'error');
    }finally{
      if(btn){ btn.dataset.busy='0'; btn.disabled=false; btn.textContent='確認送出'; }
    }
  }

  function bootShipPicker(){
    if(mod() !== 'ship') return;
    $('fix32-ship-commercial-panel')?.remove();
    const customerInput = $('customer-name');
    const refreshBtn = $('ship-refresh-customer-items');
    const addBtn = $('ship-add-selected-item');
    const addAllBtn = $('ship-add-all-items');
    let timer = 0;
    const debouncedLoad = () => { clearTimeout(timer); timer = setTimeout(loadCustomerProducts, 280); };
    customerInput?.addEventListener('input', debouncedLoad);
    refreshBtn?.addEventListener('click', loadCustomerProducts);
    addBtn?.addEventListener('click', () => {
      const item = selectedDropdownItem();
      if(!item) return say('請先選擇商品', 'warn');
      appendProductsToTextarea([item]);
    });
    addAllBtn?.addEventListener('click', async () => {
      const items = (window.__fix36CustomerItems && window.__fix36CustomerItems.length) ? window.__fix36CustomerItems : await loadCustomerProducts();
      appendProductsToTextarea(items || []);
    });
    $('ocr-text')?.addEventListener('input', renderSelectedListQuick);
    setTimeout(loadCustomerProducts, 250);
    setTimeout(renderSelectedListQuick, 300);
  }

  const previousSelectCustomer = window.selectCustomerForModule;
  window.selectCustomerForModule = async function(name){
    if(typeof previousSelectCustomer === 'function') await previousSelectCustomer.apply(this, arguments);
    if(mod() === 'ship') setTimeout(loadCustomerProducts, 80);
  };

  const previousConfirm = window.confirmSubmit;
  window.confirmSubmit = async function(){
    if(mod() !== 'ship') return previousConfirm ? previousConfirm.apply(this, arguments) : undefined;
    if($('submit-btn')?.dataset?.busy === '1') return;
    return submitShipAfterPreview();
  };

  window.fix36LoadCustomerProducts = loadCustomerProducts;
  window.fix36RenderShipSelected = renderSelectedListQuick;

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootShipPicker);
  else bootShipPicker();
})();
