/* FIX98 shipping repair + FIX142 UI keep + warehouse final visibility lock */
(function(){
  'use strict';
  const V='fix98-ship-repair-keep142-ui-v1';
  const $=id=>document.getElementById(id);
  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const mod=()=>{
    const m=document.querySelector('[data-module]')?.dataset?.module || '';
    if(m) return m;
    const p=location.pathname;
    if(p.includes('/ship')) return 'ship';
    if(p.includes('/warehouse')) return 'warehouse';
    return '';
  };
  async function api(url,opt={}){
    const res=await fetch(url,{credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json',...(opt.headers||{})},...opt});
    let d={}; try{ d=await res.json(); }catch(_e){}
    if(!res.ok || d.success===false) throw new Error(d.error||d.message||`請求失敗 ${res.status}`);
    return d;
  }
  function toast(msg,type='ok'){
    try{ (window.toast||window.showToast||window.YXHardLock?.toast||console.log)(msg,type); }catch(_e){}
  }
  function normLine(s){ return clean(s).replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/\s+/g,''); }
  function qtyFromText(text){
    const raw=normLine(text);
    const right=raw.includes('=')?raw.split('=').slice(1).join('='):'';
    if(!right) return 1;
    let total=0;
    right.split(/[+＋,，;；]/).map(clean).filter(Boolean).forEach(seg=>{
      const m=seg.match(/x\s*(\d+)$/i);
      if(m) total+=Number(m[1]||0);
      else if(/\d/.test(seg)) total+=1;
    });
    return Math.max(1,total||1);
  }
  function parseTextItems(){
    const raw=String($('ocr-text')?.value||'').replace(/\r/g,'\n');
    const map=window.__YX98_SHIP_TEXT_SOURCE_MAP__ || {};
    return raw.split(/\n+/).map(normLine).filter(x=>x && x.includes('x')).map(product_text=>{
      const known=map[product_text] || map[product_text.split('=')[0]] || {};
      return {source:known.source||'', id:known.id||known.source_id||0, source_id:known.id||known.source_id||0, product_text, qty:known.qty ? Math.min(Number(known.qty)||qtyFromText(product_text), qtyFromText(product_text)) : qtyFromText(product_text), material:known.material||''};
    });
  }
  function previewObj(d){ return d?.preview || d?.result?.preview || d || {}; }
  function rowLocations(row){
    const locs = row.warehouse_locations || row.locations || [];
    if(!Array.isArray(locs) || !locs.length) return '尚未錄入倉庫圖';
    return locs.map(x=>`${esc(x.zone||'')}-${esc(x.column_index||'')}-${String(x.visual_slot||x.slot_number||'').padStart(2,'0')}`).join('、');
  }
  function renderPreview(d,payload){
    const preview=previewObj(d);
    const items=Array.isArray(preview.items)?preview.items:[];
    const problems=preview.problems||preview.resolve_problems||[];
    const panel=$('ship-preview-panel')||$('module-result');
    const sec=$('ship-preview-section');
    if(sec) sec.style.display='';
    if(!panel) return;
    panel.classList.remove('hidden'); panel.style.display='';
    const rows=items.length ? items.map(row=>`<tr>
      <td>${esc(row.product_text||row.original_product_text||'')}</td>
      <td>${Number(row.qty||0)}件</td>
      <td>${esc(row.source_label||row.source||'')}</td>
      <td>${Number(row.before_qty??0)} → ${Number(row.after_qty??0)}</td>
      <td>${esc(row.borrowed_from ? '向 '+row.borrowed_from+' 借貨' : '')}</td>
      <td>${rowLocations(row)}</td>
    </tr>`).join('') : '<tr><td colspan="6">沒有預覽資料，請確認客戶與商品是否存在於總單 / 訂單 / 庫存。</td></tr>';
    const problemHtml=problems.length?`<div class="error-card yx98-ship-problems">${problems.map(esc).join('<br>')}</div>`:'';
    panel.innerHTML = `<div class="success-card yx142-ship-preview">
      <div class="section-title">出貨預覽</div>
      <div class="ship-preview-summary">
        <div class="ship-summary-chip">本次件數<span>${Number(preview.total_qty||0)}</span></div>
        <div class="ship-summary-chip">材積<span>${Number(preview.volume_total||0).toLocaleString()}</span></div>
        <div class="ship-summary-chip">狀態<span>${preview.can_submit ? '可扣除' : '需修正'}</span></div>
      </div>
      ${preview.volume_formula?`<div class="small-note">材積算式：${esc(preview.volume_formula)}</div>`:''}
    </div>${problemHtml}
    <div class="yx63-table-wrap"><table class="yx63-summary-table yx98-ship-preview-table">
      <thead><tr><th>商品</th><th>件數</th><th>來源</th><th>出貨前後</th><th>借貨</th><th>倉庫圖位置</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <div class="btn-row">
      <button type="button" class="ghost-btn" id="yx98-ship-cancel">取消</button>
      <button type="button" class="primary-btn important-btn" id="yx98-ship-confirm" ${preview.can_submit?'':'disabled'}>確認扣除</button>
    </div>`;
    $('yx98-ship-cancel')?.addEventListener('click',()=>panel.classList.add('hidden'),{once:true});
    $('yx98-ship-confirm')?.addEventListener('click',async function(){
      const btn=this; if(btn.dataset.busy==='1') return;
      try{
        btn.dataset.busy='1'; btn.disabled=true; btn.dataset.oldText=btn.textContent; btn.textContent='扣除中…';
        const r=await api('/api/ship',{method:'POST',body:JSON.stringify({...payload, preview_confirmed:true, request_key:`ship98_${Date.now()}_${Math.random().toString(36).slice(2)}`})});
        const shipped=r.shipped || r.result?.shipped || [];
        panel.innerHTML = `<div class="success-card"><div class="section-title">出貨完成</div><div class="small-note">已扣除並同步更新庫存 / 訂單 / 總單 / 倉庫圖。</div></div>` + (shipped.length? shipped.map(x=>`<div class="deduct-card"><strong>${esc(x.product_text||x.original_product_text||'')}</strong><div>${Number(x.qty||0)}件｜${esc(x.source_label||x.source||'')}</div><div class="small-note">出貨前 ${Number(x.before_qty||0)} → 出貨後 ${Number(x.after_qty||0)}</div></div>`).join(''):'');
        toast('出貨完成','ok');
      }catch(e){
        toast(e.message||'出貨失敗','error');
        btn.dataset.busy='0'; btn.disabled=false; btn.textContent=btn.dataset.oldText||'確認扣除';
      }
    });
  }
  async function confirmShip98(){
    const btn=$('submit-btn');
    if(btn?.dataset.yx98Busy==='1') return false;
    const customer=clean($('customer-name')?.value||window.__YX_SELECTED_CUSTOMER__||'');
    const raw=String($('ocr-text')?.value||'').trim();
    const items=parseTextItems();
    if(!customer){ toast('請先輸入或點選客戶名稱','warn'); return false; }
    if(!items.length){ toast('請先加入要出貨的商品','warn'); return false; }
    const payload={customer_name:customer, ocr_text:raw, items, request_key:`ship98_preview_${Date.now()}_${Math.random().toString(36).slice(2)}`};
    try{
      if(btn){ btn.dataset.yx98Busy='1'; btn.disabled=true; btn.dataset.oldText=btn.textContent; btn.textContent='整理預覽中…'; }
      const d=await api('/api/ship-preview',{method:'POST',body:JSON.stringify(payload)});
      renderPreview(d,payload);
      toast('已產生出貨預覽','ok');
      return true;
    }catch(e){
      const panel=$('ship-preview-panel')||$('module-result');
      if(panel){ panel.classList.remove('hidden'); panel.style.display=''; panel.innerHTML=`<div class="error-card">${esc(e.message||'出貨預覽失敗')}</div>`; }
      toast(e.message||'出貨預覽失敗','error');
      return false;
    }finally{
      if(btn){ btn.dataset.yx98Busy='0'; btn.disabled=false; btn.textContent=btn.dataset.oldText||'確認送出'; }
    }
  }
  async function loadShipCustomerItems98(customer){
    const sel=$('ship-customer-item-select'); if(!sel) return;
    const name=clean((customer&&customer.name)||$('customer-name')?.value||window.__YX_SELECTED_CUSTOMER__||'');
    const uid=clean((customer&&customer.customer_uid)||$('customer-name')?.dataset.customerUid||'');
    if(!name && !uid){ sel.innerHTML='<option value="">請先選擇 / 輸入客戶名稱</option>'; window.__YX_SHIP_CUSTOMER_ITEMS__=[]; return; }
    try{
      sel.innerHTML='<option value="">載入中…</option>';
      const d=await api(`/api/customer-items?customer_name=${encodeURIComponent(name)}&name=${encodeURIComponent(name)}&customer_uid=${encodeURIComponent(uid)}&ts=${Date.now()}`);
      const items=d.items||[];
      window.__YX_SHIP_CUSTOMER_ITEMS__=items;
      window.__YX98_SHIP_TEXT_SOURCE_MAP__=window.__YX98_SHIP_TEXT_SOURCE_MAP__||{};
      items.forEach(it=>{
        const key=normLine(it.product_text||''); if(!key) return;
        window.__YX98_SHIP_TEXT_SOURCE_MAP__[key]={source:it.source,id:it.id,source_id:it.id,qty:it.qty,material:it.material};
        window.__YX98_SHIP_TEXT_SOURCE_MAP__[key.split('=')[0]]={source:it.source,id:it.id,source_id:it.id,qty:it.qty,material:it.material};
      });
      sel.innerHTML='<option value="">請選擇商品</option>'+items.map((it,i)=>`<option value="${i}">${esc(it.customer_name||name||'庫存')}｜${esc(it.product_text||'')}｜${esc(it.source_label||it.source||'')}｜${Number(it.qty||0)}件</option>`).join('');
    }catch(e){ sel.innerHTML=`<option value="">${esc(e.message||'商品載入失敗')}</option>`; }
  }
  function addShipItem98(it){
    const box=$('ocr-text'); if(!box||!it?.product_text) return;
    const key=normLine(it.product_text||'');
    window.__YX98_SHIP_TEXT_SOURCE_MAP__=window.__YX98_SHIP_TEXT_SOURCE_MAP__||{};
    window.__YX98_SHIP_TEXT_SOURCE_MAP__[key]={source:it.source,id:it.id,source_id:it.id,qty:it.qty,material:it.material};
    window.__YX98_SHIP_TEXT_SOURCE_MAP__[key.split('=')[0]]={source:it.source,id:it.id,source_id:it.id,qty:it.qty,material:it.material};
    box.value=box.value.trim()?box.value.trim()+'\n'+it.product_text:it.product_text;
    box.dispatchEvent(new Event('input',{bubbles:true}));
  }
  function installShip(){
    if(mod()!=='ship') return;
    window.loadShipCustomerItems=loadShipCustomerItems98;
    window.loadShipCustomerItems66=loadShipCustomerItems98;
    window.confirmSubmit=confirmShip98;
    const btn=$('submit-btn');
    if(btn && !btn.dataset.yx98ClickLock){
      btn.dataset.yx98ClickLock='1';
      document.addEventListener('click',ev=>{
        if(mod()==='ship' && ev.target?.closest?.('#submit-btn')){
          ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); confirmShip98();
        }
        if(mod()==='ship' && ev.target?.closest?.('#ship-refresh-customer-items')){
          ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); loadShipCustomerItems98({name:$('customer-name')?.value||''});
        }
        if(mod()==='ship' && ev.target?.closest?.('#ship-add-selected-item')){
          ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.();
          const it=(window.__YX_SHIP_CUSTOMER_ITEMS__||[])[Number($('ship-customer-item-select')?.value)];
          if(it) addShipItem98(it);
        }
        if(mod()==='ship' && ev.target?.closest?.('#ship-add-all-items')){
          ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.();
          (window.__YX_SHIP_CUSTOMER_ITEMS__||[]).forEach(addShipItem98);
        }
      },true);
    }
    const cn=$('customer-name');
    if(cn && !cn.dataset.yx98ShipInput){
      cn.dataset.yx98ShipInput='1';
      cn.addEventListener('change',()=>loadShipCustomerItems98({name:cn.value}));
      cn.addEventListener('blur',()=>loadShipCustomerItems98({name:cn.value}));
    }
    loadShipCustomerItems98({name:cn?.value||''});
  }
  function installWarehouse(){
    if(mod()!=='warehouse') return;
    document.documentElement.dataset.yxWarehouseUiVisible='fix98-142';
    const rerender=()=>{ try{ window.YX121Warehouse?.render?.(true); }catch(_e){ try{ window.renderWarehouse?.(true); }catch(_e2){} } };
    [0,120,420,900,1800].forEach(ms=>setTimeout(rerender,ms));
  }
  function install(){ installShip(); installWarehouse(); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true}); else install();
  window.YX98ShipRepair={version:V,install,confirmShip98,loadShipCustomerItems98};
})();