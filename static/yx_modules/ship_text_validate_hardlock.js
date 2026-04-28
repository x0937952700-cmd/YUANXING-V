/* FIX132 出貨商品資料母版：自動分行 + 總單數量不足攔截 */
(function(){
  'use strict';
  const YX = window.YXHardLock;
  if (!YX) return;
  const $ = id => document.getElementById(id);
  const isShip = () => YX.moduleKey() === 'ship' || !!$('ship-preview-section');
  function splitShipText(raw){
    raw = String(raw || '')
      .replace(/[，,；;]/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[Ｘ×✕＊*X]/g, 'x')
      .replace(/[＝]/g, '=')
      .replace(/[ \t]+(?=(?:\d{1,2}月)?\d+(?:x\d+){2}\s*=)/g, '\n')
      .replace(/([^\n])(?=(?:\d{1,2}月)?\d+(?:x\d+){2}\s*=)/g, '$1\n')
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean)
      .join('\n');
    return raw;
  }
  function normalizeBox(){
    const box = $('ocr-text');
    if (!box || !isShip()) return '';
    const next = splitShipText(box.value || '');
    if (next && next !== box.value) {
      box.value = next;
      try { box.dispatchEvent(new Event('input', {bubbles:true})); box.dispatchEvent(new Event('change', {bubbles:true})); } catch(_e) {}
    }
    return next;
  }
  function showShortage(shortages){
    const panel = $('module-result') || $('ship-preview-panel');
    const html = `<div class="yx132-ship-shortage"><strong>該客戶總單數量不足，請重新確認</strong>${shortages.map(it => `<div class="yx132-shortage-line"><span>${YX.esc(it.product_text || '')}</span><b>總單 ${Number(it.master_available || 0)} / 需要 ${Number(it.qty || 0)}</b></div>`).join('')}</div>`;
    if (panel) { panel.classList.remove('hidden'); panel.style.display='block'; panel.innerHTML = html; }
    YX.toast('該客戶總單數量不足，請重新確認', 'error');
  }
  async function validateMasterAvailable(){
    if (!isShip()) return true;
    const customer = YX.clean($('customer-name')?.value || window.__YX_SELECTED_CUSTOMER__ || '');
    const text = normalizeBox();
    if (!customer || !text) return true;
    try {
      const d = await YX.api('/api/ship-preview', {method:'POST', body:JSON.stringify({customer_name:customer, ocr_text:text, yx132_master_check:true})});
      const rows = Array.isArray(d.items) ? d.items : [];
      const shortages = rows.filter(it => Number(it.master_available || 0) < Number(it.qty || 0));
      if (shortages.length) { showShortage(shortages); return false; }
      return true;
    } catch(e) {
      YX.toast(e.message || '出貨預覽檢查失敗', 'error');
      return false;
    }
  }
  function wrapConfirm(){
    const current = window.confirmSubmit;
    if (typeof current !== 'function' || current.__yx132ShipTextWrapped) return;
    const wrapped = async function(...args){
      if (isShip()) {
        const ok = await validateMasterAvailable();
        if (!ok) return false;
      }
      return current.apply(this, args);
    };
    try { Object.defineProperty(wrapped, '__yx132ShipTextWrapped', {value:true}); } catch(_e) { wrapped.__yx132ShipTextWrapped = true; }
    try {
      const desc = Object.getOwnPropertyDescriptor(window, 'confirmSubmit');
      if (!desc || desc.configurable !== false) Object.defineProperty(window, 'confirmSubmit', {value:wrapped, configurable:true, writable:true});
      else window.confirmSubmit = wrapped;
    } catch(_e) { try { window.confirmSubmit = wrapped; } catch(_e2) {} }
  }
  function bind(){
    document.addEventListener('blur', ev => { if (ev.target?.id === 'ocr-text' && isShip()) normalizeBox(); }, true);
    document.addEventListener('paste', ev => { if (ev.target?.id === 'ocr-text' && isShip()) setTimeout(normalizeBox, 0); }, true);
  }
  function install(){
    if (!isShip()) return;
    document.documentElement.dataset.yx132ShipText = 'locked';
    bind(); wrapConfirm(); normalizeBox();
    [60,180,420].forEach(ms => setTimeout(wrapConfirm, ms));
  }
  YX.register('ship_text_validate', {install, split:splitShipText, validate:validateMasterAvailable});
})();
