/* FIX143 速度與出貨母版：停止舊版延遲重畫，客戶點擊即時顯示，出貨用最後母版接管 */
(function(){
  'use strict';
  const V='fix143-instant-customer-ship-master';
  const YX=window.YXHardLock||{};
  const $=id=>document.getElementById(id);
  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const mod=()=>{try{return YX.moduleKey?YX.moduleKey():'';}catch(_e){const p=location.pathname; if(p.includes('ship'))return'ship'; if(p.includes('master-order'))return'master_order'; if(p.includes('orders'))return'orders'; if(p.includes('inventory'))return'inventory'; return '';}};
  async function api(url,opt={}){ if(YX.api) return YX.api(url,opt); const res=await fetch(url,{credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json',...(opt.headers||{})},...opt}); const txt=await res.text(); let d={}; try{d=txt?JSON.parse(txt):{};}catch(_e){d={success:false,error:txt||'回應格式錯誤'};} if(!res.ok||d.success===false) throw new Error(d.error||d.message||'操作失敗'); return d; }
  function toast(msg,type='ok'){ try{ return (YX.toast||window.toast||window.showToast||console.log)(msg,type); }catch(_e){} }
  function reqKey(prefix){ return prefix+'_'+Date.now()+'_'+Math.random().toString(36).slice(2); }
  function normalizeLine(s){ return clean(s).replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/\s+/g,''); }
  function qtyFromText(text,fallback=1){
    const raw=normalizeLine(text); if(!raw) return 0;
    const right=raw.includes('=')?raw.split('=').slice(1).join('='):'';
    if(!right) return Number(fallback)||1;
    const parts=right.split('+').map(clean).filter(Boolean); if(!parts.length) return Number(fallback)||1;
    let total=0,hit=false;
    for(const seg of parts){ const m=seg.match(/x\s*(\d+)$/i); if(m){ total+=Number(m[1]||0); hit=true; } else if(/\d/.test(seg)){ total+=1; hit=true; } }
    return hit?total:(Number(fallback)||1);
  }
  function parseShipText(){
    const raw=String($('ocr-text')?.value||'').replace(/\r/g,'\n');
    return raw.split(/\n+/).map(normalizeLine).filter(x=>x && /\d+\s*x\s*\d+/i.test(x)).map(product_text=>({product_text, qty:qtyFromText(product_text,1), product_code:'', material:''}));
  }
  function customerName(){ return clean($('customer-name')?.value||window.__YX_SELECTED_CUSTOMER__||''); }
  function setBusy(btn,busy,text){ if(!btn) return; if(busy){ btn.dataset.yx142Busy='1'; btn.disabled=true; btn.dataset.oldText=btn.textContent; btn.textContent=text||'處理中…'; } else { btn.dataset.yx142Busy='0'; btn.disabled=false; if(btn.dataset.oldText) btn.textContent=btn.dataset.oldText; } }
  function previewRows(preview){
    const rows=preview.items||preview.breakdown||preview.preview||[];
    if(!Array.isArray(rows)||!rows.length) return '<div class="empty-state-card compact-empty">沒有預覽資料</div>';
    return rows.map(r=>{ const p=r.product_text||r.product||''; const q=Number(r.qty||r.ship_qty||r.deduct_qty||qtyFromText(p,1)); const src=r.source||r.source_label||r.deduct_source||''; const before=r.before_qty!=null?`｜出貨前 ${r.before_qty}`:''; const after=r.after_qty!=null?`｜出貨後 ${r.after_qty}`:''; return `<div class="deduct-card yx142-preview-row"><strong>${esc(p)}</strong><span>${q}件</span><div class="small-note">${esc(src)}${esc(before)}${esc(after)}</div></div>`; }).join('');
  }
  function renderPreview(preview,payload){
    const sec=$('ship-preview-section'); if(sec) sec.style.display='';
    const panel=$('ship-preview-panel')||$('module-result'); if(!panel) return;
    panel.classList.remove('hidden'); panel.style.display='';
    const total=(payload.items||[]).reduce((s,it)=>s+Number(it.qty||0),0);
    panel.innerHTML=`<div class="success-card yx142-ship-preview"><div class="section-title">出貨預覽</div><div class="small-note">${esc(preview.message||'請確認扣除來源與數量。')}</div><div class="ship-preview-summary"><div class="ship-summary-chip">本次件數<span>${total}</span></div></div></div>${previewRows(preview)}<div class="btn-row"><button type="button" class="ghost-btn" id="yx142-ship-cancel">取消</button><button type="button" class="primary-btn" id="yx142-ship-confirm">確認扣除</button></div>`;
    $('yx142-ship-cancel')?.addEventListener('click',()=>panel.classList.add('hidden'),{once:true});
    $('yx142-ship-confirm')?.addEventListener('click',async function(){
      const btn=this; if(btn.dataset.yx142Busy==='1') return;
      try{ setBusy(btn,true,'扣除中…'); const result=await api('/api/ship',{method:'POST',body:JSON.stringify({...payload,allow_inventory_fallback:true,preview_confirmed:true,request_key:reqKey('ship142_confirm')})}); panel.innerHTML=`<div class="success-card"><div class="section-title">出貨完成</div><div class="small-note">已完成扣除並同步更新清單。</div></div>${previewRows(result)}`; toast('出貨完成','ok'); try{ window.YX113ProductActions?.refreshCurrent?.(); }catch(_e){} try{ window.YX113CustomerRegions?.loadCustomerBlocks?.(true); }catch(_e){} }
      catch(e){ toast(e.message||'出貨失敗','error'); setBusy(btn,false); }
    });
  }
  async function confirmSubmit142(){
    if(mod()!=='ship'){
      const old=window.__YX142_OLD_CONFIRM_SUBMIT__;
      if(typeof old==='function'&&old!==confirmSubmit142) return old.apply(this,arguments);
      return false;
    }
    const btn=$('submit-btn'); if(btn?.dataset.yx142Busy==='1') return false;
    const customer=customerName();
    const raw=String($('ocr-text')?.value||'').trim();
    const items=parseShipText();
    if(!customer){ toast('請先選擇或輸入客戶名稱','warn'); return false; }
    if(!raw && !items.length){ toast('請輸入或加入要出貨的商品','warn'); return false; }
    const payload={customer_name:customer,ocr_text:raw,items,allow_inventory_fallback:true,request_key:reqKey('ship142_preview')};
    try{ setBusy(btn,true,'整理預覽中…'); const preview=await api('/api/ship-preview',{method:'POST',body:JSON.stringify(payload)}); renderPreview(preview,payload); toast('已產生出貨預覽','ok'); return true; }
    catch(e){ const panel=$('ship-preview-panel')||$('module-result'); if(panel){ panel.classList.remove('hidden'); panel.style.display=''; panel.innerHTML=`<div class="error-card">${esc(e.message||'出貨預覽失敗')}</div>`; } toast(e.message||'出貨預覽失敗','error'); return false; }
    finally{ setBusy(btn,false); }
  }
  function patchConfirm(){
    if(window.confirmSubmit!==confirmSubmit142) window.__YX142_OLD_CONFIRM_SUBMIT__=window.confirmSubmit;
    try{ Object.defineProperty(window,'confirmSubmit',{value:confirmSubmit142,writable:true,configurable:true}); }catch(_e){ try{window.confirmSubmit=confirmSubmit142;}catch(_e2){} }
    const btn=$('submit-btn'); if(btn && !btn.__yx142Bound){ btn.__yx142Bound=true; btn.addEventListener('click',e=>{ if(mod()==='ship'){ e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation?.(); confirmSubmit142(); } },true); }
  }
  function fastCustomerPatch(){
    document.addEventListener('click',e=>{
      const card=e.target?.closest?.('.customer-region-card[data-customer-name],.yx113-customer-card[data-customer-name],.yx116-customer-card[data-customer-name]');
      if(!card) return;
      const name=clean(card.dataset.customerName||card.dataset.customer||''); if(!name) return;
      try{ window.__YX_SELECTED_CUSTOMER_VARIANTS__=JSON.parse(card.dataset.customerVariants||'[]'); }catch(_e){ window.__YX_SELECTED_CUSTOMER_VARIANTS__=[name]; }
      window.__YX_SELECTED_CUSTOMER__=name; const inp=$('customer-name'); if(inp) inp.value=name;
      // 先用已存在資料立即重畫，再讓母版背景更新。
      try{ const source=mod()==='master_order'?'master_order':(mod()==='orders'?'orders':''); if(source&&window.YX113ProductActions){ window.YX113ProductActions.renderSummary?.(source); window.YX113ProductActions.renderCards?.(source); } }catch(_e){}
    },true);
  }
  function disableLegacyDelay(){
    try{ document.documentElement.dataset.yx142Fast='locked'; window.__YX142_FAST_LOCKED__=true; }catch(_e){}
    // 只清掉已排隊的舊版延遲重畫；之後按鈕/功能仍可正常使用。
    setTimeout(()=>{ try{ YX.cancelLegacyTimers?.('fix142-fast'); }catch(_e){} patchConfirm(); },420);
  }
  function install(){ patchConfirm(); fastCustomerPatch(); disableLegacyDelay(); }
  window.YX142SpeedShip={version:V,install,confirmSubmit:confirmSubmit142};
  if(YX.register) YX.register('fix142_speed_ship',{install});
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true}); else install();
  document.addEventListener('yx:master-installed',install);
})();
