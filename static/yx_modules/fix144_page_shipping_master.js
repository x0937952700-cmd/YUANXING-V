(function(){'use strict';
  const M=()=>window.YX144; if(!M())return;
  const $=id=>document.getElementById(id);
  const esc=v=>M().esc(v);
  const clean=v=>M().clean(v);
  const qtyFromText=(text)=>{const raw=String(text||'').replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/\s+/g,''); const right=raw.includes('=')?raw.split('=').slice(1).join('='):''; if(!right)return raw?1:0; let total=0; right.split('+').filter(Boolean).forEach(p=>{const m=p.match(/x(\d+)$/i); total+=m?Number(m[1]):(/\d/.test(p)?1:0);}); return total||1;};
  function parseLines(){return String($('ocr-text')?.value||'').split(/\n+/).map(s=>s.trim()).filter(Boolean).map(product_text=>({product_text,qty:qtyFromText(product_text),product_code:'',material:''}));}
  async function loadCustomers(){
    if(M().moduleKey()!=='ship')return;
    try{
      const data=await M().api('/api/customers?fast=1'); const rows=data.items||[]; M().state.cache.customers=rows;
      let bar=document.querySelector('.yx144-ship-customer-bar'); if(!bar){bar=document.createElement('div');bar.className='yx144-ship-customer-bar';($('customer-name')?.parentElement||$('ship-customer-picker')||document.body).insertBefore(bar, $('ship-customer-picker')||null);}
      bar.innerHTML=rows.slice(0,60).map(c=>`<button type="button" class="chip" data-yx144-ship-customer="${esc(c.name||c.customer_name||'')}">${esc(c.name||c.customer_name||'')}</button>`).join('');
    }catch(e){M().toast('客戶載入失敗：'+(e.message||e),'error');}
  }
  async function loadItems(name){
    name=clean(name||$('customer-name')?.value||window.__YX_SELECTED_CUSTOMER__||''); if(!name)return [];
    try{const d=await M().api('/api/customer-items?fast=1&name='+encodeURIComponent(name)); return d.items||[];}catch(e){M().toast('客戶商品載入失敗：'+(e.message||e),'error'); return [];}
  }
  function fillSelect(rows){const sel=$('ship-customer-item-select'); if(!sel)return; sel.innerHTML=(rows||[]).map(r=>`<option value="${esc(r.product_text||r.size||'')}">${esc([r.source,r.material||r.product_code,r.product_text||r.size,(r.qty||r.total_qty)?((r.qty||r.total_qty)+'件'):''].filter(Boolean).join(' '))}</option>`).join('')||'<option value="">此客戶目前沒有商品</option>';}
  async function refreshItems(){const rows=await loadItems(); fillSelect(rows); return rows;}
  function appendText(line){const t=$('ocr-text'); if(!t||!line)return; const old=t.value.trim(); t.value=old?old+'\n'+line:line; t.dispatchEvent(new Event('input',{bubbles:true}));}
  function bindPicker(){
    if(M().moduleKey()!=='ship'||document.body.dataset.yx144ShipPickerBound)return; document.body.dataset.yx144ShipPickerBound='1';
    document.addEventListener('click',async e=>{const c=e.target.closest?.('[data-yx144-ship-customer]'); if(!c)return; const name=c.dataset.yx144ShipCustomer; const inp=$('customer-name'); if(inp)inp.value=name; window.__YX_SELECTED_CUSTOMER__=name; fillSelect(await loadItems(name));},true);
    $('ship-refresh-customer-items')?.addEventListener('click',e=>{e.preventDefault();refreshItems();},true);
    $('ship-add-selected-item')?.addEventListener('click',e=>{e.preventDefault(); const val=$('ship-customer-item-select')?.value||''; appendText(val);},true);
    $('ship-add-all-items')?.addEventListener('click',async e=>{e.preventDefault(); const rows=await refreshItems(); const lines=rows.map(r=>r.product_text||r.size).filter(Boolean); if(lines.length){const t=$('ocr-text'); t.value=(t.value.trim()?t.value.trim()+'\n':'')+lines.join('\n'); t.dispatchEvent(new Event('input',{bubbles:true}));}},true);
  }
  function renderPreview(preview, customer, items){
    const rows=preview.items||[];
    const lines=rows.map(r=>{const loc=(r.locations||[]).map(l=>l.slot||l.location||l.code||'').filter(Boolean).join('、')||'未標示'; const before=r.deduct_before||{}; const after=r.deduct_after||{}; return `<div class="yx145-ship-preview-row"><b>${esc(r.product_text)}</b><div class="small-note">${esc(r.recommendation||r.source_label||'')}</div><div class="small-note">出貨 ${esc(r.qty)}件｜位置：${esc(loc)}</div><div class="small-note">扣除前：總單${before.master??r.master_available??0} / 訂單${before.order??r.order_available??0} / 庫存${before.inventory??r.inventory_available??0}</div><div class="small-note">扣除後：總單${after.master??0} / 訂單${after.order??0} / 庫存${after.inventory??0}</div></div>`;}).join('');
    return `<div class="success-card"><b>出貨預覽</b><div class="small-note">客戶：${esc(customer)}｜共 ${items.length} 筆。確認後只扣除本次預覽的來源。</div></div>${lines||'<div class="empty-state-card compact-empty">沒有可預覽商品</div>'}<div class="btn-row"><button type="button" class="primary-btn" id="yx144-confirm-ship">確認扣除</button></div>`;
  }
  async function submitShip(){
    const customer=clean($('customer-name')?.value||window.__YX_SELECTED_CUSTOMER__||''); const items=parseLines();
    if(!customer){M().toast('請先選擇客戶','warn');return false;} if(!items.length){M().toast('請輸入要出貨的商品','warn');return false;}
    const panel=$('ship-preview-panel')||$('module-result'); if(panel){panel.classList.remove('hidden'); panel.style.display=''; panel.innerHTML='<div class="small-note">出貨預覽產生中…</div>';}
    const btn=$('submit-btn'); if(btn){btn.disabled=true; btn.dataset.oldText=btn.textContent; btn.textContent='產生預覽中…';}
    try{
      const preview=await M().api('/api/ship-preview',{method:'POST',body:JSON.stringify({customer_name:customer,items,ocr_text:$('ocr-text')?.value||'',allow_inventory_fallback:true,request_key:'fix145_ship_preview_'+Date.now()})});
      if(panel)panel.innerHTML=renderPreview(preview, customer, items);
      $('yx144-confirm-ship')?.addEventListener('click',async()=>{const b=$('yx144-confirm-ship'); if(b){b.disabled=true;b.textContent='扣除中…';} try{const res=await M().api('/api/ship',{method:'POST',body:JSON.stringify({customer_name:customer,items,ocr_text:$('ocr-text')?.value||'',allow_inventory_fallback:true,preview_confirmed:true,request_key:'fix145_ship_confirm_'+Date.now()})}); M().toast('出貨完成','ok'); if(panel)panel.innerHTML='<div class="success-card"><b>出貨完成</b><div class="small-note">已扣除總單 / 訂單 / 庫存，並寫入出貨紀錄。</div></div>'; document.dispatchEvent(new CustomEvent('yx145:ship-done',{detail:res}));}catch(e){if(panel)panel.insertAdjacentHTML('afterbegin',`<div class="error-card">${esc(e.message||'出貨失敗')}</div>`); M().toast(e.message||'出貨失敗','error'); if(b){b.disabled=false;b.textContent='確認扣除';}}}, {once:true});
      return preview;
    }catch(e){if(panel)panel.innerHTML=`<div class="error-card">${esc(e.message||'出貨預覽失敗')}</div>`; M().toast(e.message||'出貨預覽失敗','error'); return false;}
    finally{if(btn){btn.disabled=false;btn.textContent=btn.dataset.oldText||'確認送出';}}
  }
  function installSubmit(){ if(M().moduleKey()!=='ship')return; window.__YX144_OLD_CONFIRM_SUBMIT__=window.confirmSubmit; window.confirmSubmit=submitShip; const b=$('submit-btn'); if(b&&!b.dataset.yx144ShipBound){b.dataset.yx144ShipBound='1'; b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();e.stopImmediatePropagation?.();submitShip();},true);} }
  M().register('page_shipping_master',{install(){if(M().moduleKey()!=='ship')return; loadCustomers(); bindPicker(); installSubmit();}, repair(){if(M().moduleKey()==='ship')installSubmit();}});
  M().install('page_shipping_master',false);
})();
