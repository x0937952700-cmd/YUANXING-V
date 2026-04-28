(function(){'use strict';
  const M=()=>window.YX144; if(!M())return;
  const $=id=>document.getElementById(id);
  const qtyFromText=(text)=>{const raw=String(text||'').replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/\s+/g,''); const right=raw.includes('=')?raw.split('=').slice(1).join('='):''; if(!right)return raw?1:0; const parts=right.split('+').filter(Boolean); let total=0; for(const p of parts){const m=p.match(/x(\d+)$/i); total+=m?Number(m[1]):(/\d/.test(p)?1:0);} return total||1;};
  function parseLines(){return String($('ocr-text')?.value||'').split(/\n+/).map(s=>s.trim()).filter(Boolean).map(product_text=>({product_text,qty:qtyFromText(product_text),product_code:'',material:''}));}
  async function loadCustomers(){
    if(M().moduleKey()!=='ship')return;
    try{
      const data=await M().api('/api/customers?fast=1'); const rows=data.items||[]; M().state.cache.customers=rows;
      let bar=document.querySelector('.yx144-ship-customer-bar'); if(!bar){bar=document.createElement('div');bar.className='yx144-ship-customer-bar';($('customer-name')?.parentElement||$('ship-customer-picker')||document.body).insertBefore(bar, $('ship-customer-picker')||null);}
      bar.innerHTML=rows.slice(0,30).map(c=>`<button type="button" class="chip" data-yx144-ship-customer="${M().esc(c.name||c.customer_name||'')}">${M().esc(c.name||c.customer_name||'')}</button>`).join('');
    }catch(e){M().toast('客戶載入失敗：'+(e.message||e),'error');}
  }
  async function loadItems(name){
    name=M().clean(name||$('customer-name')?.value||window.__YX_SELECTED_CUSTOMER__||''); if(!name)return [];
    try{const d=await M().api('/api/customer-items?fast=1&name='+encodeURIComponent(name)); return d.items||[];}catch(e){M().toast('客戶商品載入失敗：'+(e.message||e),'error'); return [];}
  }
  async function bindPicker(){
    if(M().moduleKey()!=='ship')return;
    document.addEventListener('click',async e=>{
      const c=e.target.closest?.('[data-yx144-ship-customer]'); if(!c)return;
      const name=c.dataset.yx144ShipCustomer; $('customer-name').value=name; window.__YX_SELECTED_CUSTOMER__=name;
      const rows=await loadItems(name); const sel=$('ship-customer-item-select'); if(sel){sel.innerHTML=rows.map(r=>`<option value="${M().esc(r.product_text||'')}">${M().esc((r.source||'')+' '+(r.material||r.product_code||'')+' '+(r.product_text||'')+' '+(r.qty||''))}</option>`).join('')||'<option value="">此客戶目前沒有商品</option>';}
    },true);
    $('ship-refresh-customer-items')?.addEventListener('click',async()=>{const rows=await loadItems(); const sel=$('ship-customer-item-select'); if(sel)sel.innerHTML=rows.map(r=>`<option value="${M().esc(r.product_text||'')}">${M().esc((r.source||'')+' '+(r.material||r.product_code||'')+' '+(r.product_text||'')+' '+(r.qty||''))}</option>`).join('')||'<option value="">此客戶目前沒有商品</option>';},true);
  }
  async function submitShip(){
    const customer=M().clean($('customer-name')?.value||window.__YX_SELECTED_CUSTOMER__||''); const items=parseLines();
    if(!customer){M().toast('請先選擇客戶','warn');return false;} if(!items.length){M().toast('請輸入要出貨的商品','warn');return false;}
    const panel=$('ship-preview-panel')||$('module-result'); if(panel){panel.classList.remove('hidden'); panel.style.display=''; panel.innerHTML='<div class="small-note">出貨預覽產生中…</div>';}
    try{const preview=await M().api('/api/ship-preview',{method:'POST',body:JSON.stringify({customer_name:customer,items,ocr_text:$('ocr-text')?.value||'',allow_inventory_fallback:true,request_key:'fix144_ship_'+Date.now()})});
      if(panel){panel.innerHTML='<div class="success-card"><b>出貨預覽</b><div class="small-note">確認後會扣除總單 / 訂單 / 庫存。</div></div><div class="btn-row"><button type="button" class="primary-btn" id="yx144-confirm-ship">確認扣除</button></div>';}
      $('yx144-confirm-ship')?.addEventListener('click',async()=>{try{await M().api('/api/ship',{method:'POST',body:JSON.stringify({customer_name:customer,items,ocr_text:$('ocr-text')?.value||'',allow_inventory_fallback:true,preview_confirmed:true,request_key:'fix144_ship_confirm_'+Date.now()})}); M().toast('出貨完成','ok'); if(panel)panel.innerHTML='<div class="success-card">出貨完成</div>'; }catch(e){M().toast(e.message||'出貨失敗','error');}}, {once:true});
      return preview;
    }catch(e){if(panel)panel.innerHTML=`<div class="error-card">${M().esc(e.message||'出貨預覽失敗')}</div>`; M().toast(e.message||'出貨預覽失敗','error'); return false;}
  }
  function installSubmit(){ if(M().moduleKey()!=='ship')return; try{window.__YX144_OLD_CONFIRM_SUBMIT__=window.confirmSubmit; window.confirmSubmit=submitShip;}catch(_e){} $('submit-btn')?.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();e.stopImmediatePropagation?.();submitShip();},true); }
  M().register('page_shipping_master',{install(){if(M().moduleKey()!=='ship')return; loadCustomers(); bindPicker(); installSubmit(); setTimeout(loadCustomers,500);}});
  M().install('page_shipping_master',true);
})();
