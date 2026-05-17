(() => {
  'use strict';
  const clean = v => String(v == null ? '' : v).trim().replace(/\s+/g, ' ');
  function customerMergeKey(v){
    const raw = clean(v);
    const tags = [];
    raw.replace(/FOB代付|FOB代|FOB|CNF/gi, m => {
      const t = /代/.test(m) ? 'FOB代' : String(m || '').toUpperCase();
      if (!tags.includes(t)) tags.push(t);
      return m;
    });
    const base = raw.replace(/FOB代付|FOB代|FOB|CNF/gi, ' ').replace(/\s+/g, '').toLowerCase();
    return `${base}|${['FOB代','FOB','CNF'].filter(t => tags.includes(t)).join('/')}`;
  }
  function sameCustomerName(a,b){
    const aa = clean(a), bb = clean(b);
    if (!aa || !bb) return false;
    return aa === bb || customerMergeKey(aa) === customerMergeKey(bb);
  }
  // 防止舊 520 快取頁面 JS 還在瀏覽器內執行時，因 sameCustomerName 未定義造成訂單/總單/出貨點客戶整頁中斷。
  window.sameCustomerName = window.sameCustomerName || sameCustomerName;
  window.YXSameCustomerName = window.YXSameCustomerName || sameCustomerName;
  // 清掉舊診斷事件，避免已修復後仍被舊 localStorage 事件誤判。
  try { localStorage.removeItem('yx_diagnostics_events_v1'); } catch(_) {}
  // 只在版本切換第一次清理舊快取，避免舊 service worker / 舊 JS 造成全頁面像沒改到。
  const VERSION = 'mainline-cache-proof-repair-20260516j';
  const key = 'YX_MAINLINE_REPAIR_CACHE_CLEARED_' + VERSION;
  async function clearOldCaches(){
    if (localStorage.getItem(key)) return;
    try { if (window.caches) { const keys = await caches.keys(); await Promise.all(keys.map(k => caches.delete(k))); } } catch(_) {}
    try {
      if (navigator.serviceWorker) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.update().catch(()=>{})));
        regs.forEach(r => { try { (r.waiting || r.installing || r.active)?.postMessage({type:'CLEAR_YX_CACHES'}); } catch(_) {} });
      }
    } catch(_) {}
    try { localStorage.setItem(key, '1'); } catch(_) {}
  }
  clearOldCaches();
})();
