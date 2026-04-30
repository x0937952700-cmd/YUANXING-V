/* 沅興木業 Final Stability Lock v6
   保留 FIX142 UI + FIX98 出貨邏輯；收斂按鈕、倉庫、出貨、API 回傳格式與重複點擊問題。 */
(function(){
  'use strict';
  if (window.__YX_FINAL_STABILITY_V6__) return;
  window.__YX_FINAL_STABILITY_V6__ = true;

  const $ = id => document.getElementById(id);
  const clean = v => String(v ?? '').replace(/\s+/g,' ').trim();
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const moduleKey = () => document.querySelector('[data-module]')?.dataset?.module || (
    location.pathname.includes('master-order') ? 'master_order' :
    location.pathname.includes('orders') ? 'orders' :
    location.pathname.includes('inventory') ? 'inventory' :
    location.pathname.includes('ship') ? 'ship' :
    location.pathname.includes('warehouse') ? 'warehouse' :
    location.pathname.includes('customers') ? 'customers' :
    location.pathname.includes('today-changes') ? 'today_changes' :
    location.pathname.includes('settings') ? 'settings' : 'home'
  );

  function toast(msg, type='ok'){
    try {
      if (window.YXHardLock?.toast) return window.YXHardLock.toast(msg, type);
      if (window.toast) return window.toast(msg, type);
      if (window.showToast) return window.showToast(msg, type);
    } catch(_e){}
    let box = $('yx-final-toast');
    if (!box) {
      box = document.createElement('div');
      box.id = 'yx-final-toast';
      box.style.cssText = 'position:fixed;z-index:99999;right:16px;top:16px;max-width:80vw;padding:10px 14px;border-radius:14px;background:#fff;border:1px solid #cfd7df;box-shadow:0 10px 30px rgba(0,0,0,.18);font-weight:800;color:#071426;';
      document.body.appendChild(box);
    }
    box.textContent = msg;
    box.style.borderColor = type === 'error' ? '#ff9aa2' : '#cfd7df';
    box.style.color = type === 'error' ? '#c1121f' : '#071426';
    clearTimeout(box._t);
    box._t = setTimeout(()=>box.remove(), 2800);
  }

  async function api(url, opt={}){
    const controller = new AbortController();
    const t = setTimeout(()=>controller.abort(), Number(opt.timeout || 20000));
    try {
      const res = await fetch(url, {
        credentials:'same-origin',
        cache:'no-store',
        headers:{'Content-Type':'application/json', ...(opt.headers||{})},
        ...opt,
        signal: opt.signal || controller.signal
      });
      const txt = await res.text();
      let d = {};
      try { d = txt ? JSON.parse(txt) : {}; } catch(_e) { d = {success:false, error:txt || '回應格式錯誤'}; }
      if (!res.ok || d.success === false) throw new Error(d.error || d.message || `請求失敗 ${res.status}`);
      return normalizeApiPayload(d, url);
    } finally {
      clearTimeout(t);
    }
  }
  window.YXFinalApi = api;

  function normalizeApiPayload(d, url){
    if (!d || typeof d !== 'object') return d;
    if (url && url.includes('/api/warehouse') && !url.includes('available')) {
      const cells = Array.isArray(d.cells) ? d.cells : (Array.isArray(d.items) ? d.items : []);
      d.cells = cells;
      d.items = cells;
      d.zones = d.zones || buildZones(cells);
    }
    if (url && url.includes('/api/ship-preview')) {
      const p = d.preview && typeof d.preview === 'object' ? d.preview : d;
      d.preview = p;
      d.items = Array.isArray(d.items) ? d.items : (Array.isArray(p.items) ? p.items : []);
      d.can_submit = typeof d.can_submit !== 'undefined' ? d.can_submit : p.can_submit;
      d.problems = Array.isArray(d.problems) ? d.problems : (Array.isArray(p.problems) ? p.problems : []);
    }
    return d;
  }

  function buildZones(cells){
    const zones = {A:{}, B:{}};
    (cells || []).forEach(c => {
      const z = clean(c.zone || 'A').toUpperCase();
      const col = String(parseInt(c.column_index || 1,10) || 1);
      (zones[z] ||= {});
      (zones[z][col] ||= []).push(c);
    });
    return zones;
  }

  function stabilizeButtons(){
    document.querySelectorAll('button,a[class*="btn"],.chip,.pill').forEach(el => {
      const txt = clean(el.textContent);
      if (!txt) {
        const label = el.getAttribute('aria-label') || el.getAttribute('title') || el.dataset.label || el.dataset.action || '按鈕';
        el.classList.add('yx-empty-button');
        el.dataset.yxLabel = label;
      }
      el.style.color = '#071426';
      el.style.webkitTextFillColor = '#071426';
      const dangerText = /刪除|移除|出貨|送出|確認|扣除|封存|清空/.test(txt + ' ' + (el.getAttribute('onclick') || '') + ' ' + (el.dataset.action || ''));
      if (dangerText && !/返回|搜尋|清除搜尋|同客戶|未入倉|A 區|B 區|全部/.test(txt)) {
        el.classList.add('yx-danger-text');
      }
    });
  }

  function stabilizeHomeLinks(){
    if (moduleKey() !== 'home') return;
    const map = {'庫存':'/inventory','訂單':'/orders','總單':'/master-order','出貨':'/ship','出貨查詢':'/shipping-query','倉庫圖':'/warehouse','客戶資料':'/customers','代辦事項':'/todos','設定':'/settings','今日異動':'/today-changes'};
    document.querySelectorAll('a.menu-btn,a.home-mini-btn,button.menu-btn,button.home-mini-btn').forEach(el => {
      const txt = clean(el.textContent);
      if (map[txt]) {
        if (el.tagName === 'A') {
          el.setAttribute('href', map[txt]);
          el.setAttribute('target','_self');
        } else {
          el.onclick = () => { location.href = map[txt]; };
        }
      }
    });
  }

  // 防止確認送出、出貨、刪除被連點造成重複寫入或畫面卡住
  document.addEventListener('click', function(ev){
    const btn = ev.target.closest?.('button');
    if (!btn) return;
    const txt = clean(btn.textContent);
    const risky = /確認|送出|出貨|刪除|移除|儲存|加入|批量/.test(txt + ' ' + (btn.getAttribute('onclick') || ''));
    if (!risky) return;
    const now = Date.now();
    const last = Number(btn.dataset.yxClickAt || 0);
    if (now - last < 650) {
      ev.preventDefault();
      ev.stopPropagation();
      return false;
    }
    btn.dataset.yxClickAt = String(now);
  }, true);

  async function safeLoadWarehouse(){
    const m = moduleKey();
    if (m !== 'warehouse') return;
    if (window.__YX_WAREHOUSE_LOADING__) return window.__YX_WAREHOUSE_LOADING__;
    window.__YX_WAREHOUSE_LOADING__ = (async () => {
      try {
        const data = await api('/api/warehouse');
        window.state = window.state || {};
        window.state.warehouse = window.state.warehouse || {};
        window.state.warehouse.cells = data.cells || [];
        window.state.warehouse.zones = data.zones || buildZones(data.cells || []);
        if (typeof window.renderWarehouse === 'function') {
          try { window.renderWarehouse(false); } catch(_e){}
        }
        if (typeof window.renderWarehouseZones === 'function') {
          try { window.renderWarehouseZones(data); } catch(_e){}
        }
        const active = localStorage.getItem('warehouseActiveZone') || window.state.warehouse.activeZone || 'A';
        if (typeof window.setWarehouseZone === 'function') {
          try { window.setWarehouseZone(active, false); } catch(_e){}
        }
      } catch(e) {
        toast(e.message || '倉庫圖載入失敗', 'error');
      } finally {
        setTimeout(()=>{ window.__YX_WAREHOUSE_LOADING__ = null; }, 300);
      }
    })();
    return window.__YX_WAREHOUSE_LOADING__;
  }

  // 包一層 renderWarehouse，避免多個硬鎖同時呼叫造成畫面跳兩次
  function patchWarehouseRender(){
    if (window.__YX_PATCHED_WAREHOUSE_RENDER__) return;
    window.__YX_PATCHED_WAREHOUSE_RENDER__ = true;
    const original = window.renderWarehouse;
    if (typeof original === 'function') {
      window.renderWarehouse = function(...args){
        if (window.__YX_RENDERING_WAREHOUSE__) return;
        window.__YX_RENDERING_WAREHOUSE__ = true;
        try { return original.apply(this,args); }
        finally { setTimeout(()=>{ window.__YX_RENDERING_WAREHOUSE__ = false; stabilizeButtons(); }, 120); }
      };
    }
    const originalLoad = window.loadWarehouse;
    window.loadWarehouse = function(...args){
      if (typeof originalLoad === 'function') {
        if (window.__YX_LOADING_WAREHOUSE_LEGACY__) return window.__YX_LOADING_WAREHOUSE_LEGACY__;
        window.__YX_LOADING_WAREHOUSE_LEGACY__ = Promise.resolve(originalLoad.apply(this,args)).finally(()=>setTimeout(()=>{window.__YX_LOADING_WAREHOUSE_LEGACY__=null;},300));
        return window.__YX_LOADING_WAREHOUSE_LEGACY__;
      }
      return safeLoadWarehouse(...args);
    };
  }

  function patchShipPreview(){
    if (moduleKey() !== 'ship' || window.__YX_PATCHED_SHIP_FETCH__) return;
    window.__YX_PATCHED_SHIP_FETCH__ = true;
    // 補強出貨預覽：前端若只送文字，讓後端自動配對；失敗時顯示錯誤，不讓畫面看起來卡住。
    const oldConfirm = window.confirmSubmit;
    if (typeof oldConfirm === 'function') {
      window.confirmSubmit = async function(...args){
        const btn = $('submit-btn');
        try {
          if (btn) { btn.disabled = true; btn.dataset.oldText = btn.textContent; btn.textContent = '處理中…'; }
          return await oldConfirm.apply(this,args);
        } catch(e) {
          toast(e.message || '送出失敗', 'error');
          throw e;
        } finally {
          if (btn) { btn.disabled = false; btn.textContent = btn.dataset.oldText || '確認送出'; }
        }
      };
    }
  }

  window.addEventListener('error', e => {
    const msg = e?.message || '';
    if (msg && !/ResizeObserver|Script error/i.test(msg)) toast(msg, 'error');
  });
  window.addEventListener('unhandledrejection', e => {
    const msg = e?.reason?.message || String(e?.reason || '');
    if (msg && !/AbortError/i.test(msg)) toast(msg, 'error');
  });

  function boot(){
    document.body.classList.add('yx-stable-ui');
    stabilizeHomeLinks();
    stabilizeButtons();
    patchWarehouseRender();
    patchShipPreview();
    if (moduleKey() === 'warehouse') setTimeout(safeLoadWarehouse, 180);
    // 少量定時補救即可，不使用常駐 MutationObserver，避免重新排版亂跳。
    [120, 450, 1000, 1800].forEach(ms => setTimeout(()=>{ stabilizeHomeLinks(); stabilizeButtons(); patchWarehouseRender(); }, ms));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();
})();
