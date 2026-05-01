/* 沅興木業 出貨單一母版：只保留一套 HTML 結構 + 一套 JS 邏輯 */
(function(){
  'use strict';
  if (!window.__YX_SHIP_SINGLE_LOCK__) return;
  const $ = (id)=>document.getElementById(id);
  const state = { customer:'', items:[], selected:[], customers:[], timer:null, loadingName:'', itemCache:new Map() };
  const esc = (v)=>String(v??'').replace(/[&<>"']/g, ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const clean = (v)=>String(v??'').replace(/\s+/g,' ').trim();
  async function api(url,opt={}){
    const res=await fetch(url,{credentials:'same-origin',cache:'no-store',...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}});
    const txt=await res.text(); let data={};
    try{ data=txt?JSON.parse(txt):{}; }catch(_e){ data={success:false,error:txt||'伺服器回應格式錯誤'}; }
    if(!res.ok || data.success===false){ throw new Error(data.error||data.message||`請求失敗 ${res.status}`); }
    return data;
  }
  function toast(msg,kind='ok'){
    let box=$('yx-ship-toast');
    if(!box){ box=document.createElement('div'); box.id='yx-ship-toast'; document.body.appendChild(box); }
    box.className='yx-ship-toast '+kind; box.textContent=msg; clearTimeout(box._t); box._t=setTimeout(()=>box.classList.remove('ok','warn','error'),2600);
  }
  function normalizeText(t){ return clean(t).replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'='); }
  function qtyFromText(text,fallback=0){
    const raw=normalizeText(text); const right=raw.includes('=')?raw.split('=').slice(1).join('='):raw;
    if(right){ let total=0; right.split('+').map(x=>x.trim()).filter(Boolean).forEach(seg=>{ const m=seg.match(/x\s*(\d+)$/i); total += m ? Number(m[1]||0) : (/\d/.test(seg)?1:0); }); if(total) return total; }
    const n=Number(fallback||0); return Number.isFinite(n)&&n>0?Math.floor(n):0;
  }
  function splitProduct(text){ const raw=normalizeText(text); const i=raw.indexOf('='); return {size:i>=0?raw.slice(0,i):raw, support:i>=0?raw.slice(i+1):''}; }
  function materialOf(it){ return clean(it.material||it.product_code||it.product||'未填材質'); }
  function normalizeSource(v){
    const raw=clean(v);
    if(/總單|master_order|master_orders|master/i.test(raw)) return '總單';
    if(/訂單|orders|order/i.test(raw)) return '訂單';
    if(/庫存|inventory|stock/i.test(raw)) return '庫存';
    return '';
  }
  function sourceOf(it){ return normalizeSource(it.source_preference||it.source||it.deduct_source) || '自動'; }
  function sourcePreferenceOf(it){ return normalizeSource(it.source_preference||it.source||it.deduct_source); }
  function withQtySupport(support, qty){
    let s=normalizeText(support); const q=Math.max(1,parseInt(qty||1,10)||1);
    if(!s) return String(q);
    const parts=s.split('+').map(x=>x.trim()).filter(Boolean);
    if(parts.length===1){ const base=parts[0].replace(/x\s*\d+$/i,''); return `${base}x${q}`; }
    return `${parts[0].replace(/x\s*\d+$/i,'')}x${q}`;
  }
  function productForQty(it,qty){ const p=splitProduct(it.product_text||''); return `${p.size}=${withQtySupport(p.support,qty)}`; }
  function selectedKey(it){ return [materialOf(it), normalizeText(splitProduct(it.product_text||'').size), sourcePreferenceOf(it)||'auto'].join('|').toLowerCase(); }
  function setCustomer(name){
    state.customer=clean(name); const input=$('customer-name'); if(input && input.value!==state.customer) input.value=state.customer;
    const search=$('ship-customer-search'); if(search && search.value!==state.customer) search.value=state.customer;
  }
  function renderCustomers(){
    const box=$('ship-customer-quick-list'); if(!box) return;
    if(!state.customers.length){ box.innerHTML='<div class="small-note">尚無客戶資料</div>'; return; }
    const q=clean($('ship-customer-search')?.value||$('customer-name')?.value||'').toLowerCase();
    let rows=state.customers;
    if(q) rows=rows.filter(c=>String(c.name||c.customer_name||'').toLowerCase().includes(q));
    box.innerHTML=rows.slice(0,90).map(c=>`<button type="button" class="ghost-btn tiny-btn yx-ship-customer-chip" data-ship-customer="${esc(c.name||c.customer_name||'')}">${esc(c.name||c.customer_name||'')}</button>`).join('') || '<div class="small-note">找不到符合客戶，按重新載入可手動查商品</div>';
  }
  async function loadCustomers(){
    try{
      const cards=Array.from(document.querySelectorAll('[data-customer-name]')).map(el=>({name:el.dataset.customerName||el.dataset.customer||''})).filter(x=>x.name);
      if(cards.length){ state.customers=cards; renderCustomers(); return; }
      const d=await api('/api/customers?ship_single=1&light=1&ts='+Date.now());
      state.customers=Array.isArray(d.items)?d.items:(Array.isArray(d.customers)?d.customers:[]);
      renderCustomers();
    }catch(_e){}
  }
  function renderItems(){
    const box=$('ship-customer-item-list'); if(!box) return;
    if(!state.customer){ box.innerHTML='<div class="empty-state-card compact-empty">請先輸入或點選客戶名稱</div>'; return; }
    if(!state.items.length){ box.innerHTML='<div class="empty-state-card compact-empty">此客戶目前沒有可出貨商品</div>'; return; }
    const total=state.items.reduce((s,it)=>s+qtyFromText(it.product_text,it.qty),0);
    box.innerHTML=`<div class="yx-ship-list-head"><strong>${esc(state.customer)} 商品</strong><span>${total}件 / ${state.items.length}筆</span></div>`+
      state.items.map((it,i)=>{ const p=splitProduct(it.product_text||''); const q=qtyFromText(it.product_text,it.qty); return `
        <div class="yx-ship-tag-card" data-ship-item="${i}">
          <button type="button" class="yx-ship-product-tag" data-ship-pick="${i}">
            <span class="yx-ship-src">${esc(sourceOf(it))}</span>
            <b>${esc(materialOf(it))}</b>
            <span>${esc(p.size)}＝${esc(p.support||q)}</span>
            <em>${q}件</em>
          </button>
          <input class="text-input yx-ship-qty-input" type="number" min="1" max="${q||9999}" value="${q||1}" data-ship-qty="${i}" aria-label="出貨件數">
          <button type="button" class="primary-btn small-btn" data-ship-add="${i}">加入</button>
        </div>`; }).join('');
  }
  async function loadItems(name, opts={}){
    setCustomer(name||state.customer); renderItems();
    if(!state.customer) return;
    const key=state.customer;
    const cached=state.itemCache.get(key);
    if(!opts.force && cached && Date.now()-cached.at<15000){ state.items=cached.items; renderItems(); return; }
    if(state.loadingName===key) return;
    state.loadingName=key;
    const box=$('ship-customer-item-list'); if(box) box.innerHTML='<div class="empty-state-card compact-empty">客戶商品載入中…</div>';
    try{
      const d=await api('/api/customer-items?name='+encodeURIComponent(state.customer)+'&fast=1&ship_single=1&ts='+Date.now());
      state.items=Array.isArray(d.items)?d.items:[];
      state.itemCache.set(key,{items:state.items,at:Date.now()});
      renderItems();
    } finally { state.loadingName=''; }
  }
  function renderSelected(){
    const box=$('ship-selected-items'); if(!box) return;
    if(!state.selected.length){ box.innerHTML='<div class="empty-state-card compact-empty">尚未加入出貨商品</div>'; return; }
    box.innerHTML=state.selected.map((it,i)=>{ const p=splitProduct(it.product_text); return `
      <div class="result-card yx-ship-selected-card">
        <div><strong>${esc(it.material)}</strong>｜${esc(p.size)}＝${esc(p.support)} <span class="muted">${esc(it.source||'')}</span></div>
        <input class="text-input yx-ship-selected-qty" type="number" min="1" value="${Number(it.qty||1)}" data-selected-qty="${i}">
        <button class="ghost-btn small-btn" type="button" data-selected-remove="${i}">刪除</button>
      </div>`; }).join('');
    const hidden=$('ocr-text'); if(hidden) hidden.value=state.selected.map(it=>it.product_text).join('\n');
  }
  function addItem(i){
    const it=state.items[Number(i)]; if(!it) return toast('找不到商品','warn');
    const max=qtyFromText(it.product_text,it.qty)||9999; const qtyInput=document.querySelector(`[data-ship-qty="${Number(i)}"]`);
    let qty=Math.max(1,parseInt(qtyInput?.value||max,10)||1); if(max && qty>max) qty=max;
    const product_text=productForQty(it,qty);
    const pref=sourcePreferenceOf(it);
    const row={ product_text, qty, material:materialOf(it), product_code:materialOf(it), source:sourceOf(it), source_preference:pref, id:it.id };
    // 出貨選取不在前端二次合併，避免和後端 _merge_items_by_size_material 重複重算件數。
    state.selected.push(row);
    renderSelected(); toast('已加入出貨商品','ok');
  }
  window.clearShipSelectedItems=function(){ state.selected=[]; renderSelected(); };
  async function confirmSubmit(){
    if(!state.customer) return toast('請先輸入客戶名稱','warn');
    if(!state.selected.length) return toast('請先加入出貨商品','warn');
    const btn=$('submit-btn'); if(btn){ btn.disabled=true; btn.textContent='預覽中…'; }
    const payload={customer_name:state.customer,items:state.selected,allow_inventory_fallback:true,skip_snapshot:true,request_key:'ship_single_'+Date.now()+'_'+Math.random().toString(36).slice(2)};
    try{ const preview=await api('/api/ship-preview',{method:'POST',body:JSON.stringify(payload)}); showPreview(preview,payload); }
    catch(e){ toast(e.message||'出貨預覽失敗','error'); }
    finally{ if(btn){ btn.disabled=false; btn.textContent='確認送出'; } }
  }
  function showPreview(data,payload){
    const panel=$('ship-preview-panel')||$('module-result'); if(!panel) return;
    const rows=Array.isArray(data.breakdown)?data.breakdown:(Array.isArray(data.items)?data.items:[]);
    panel.classList.remove('hidden'); panel.style.display='block';
    panel.innerHTML=`<div class="section-title">出貨預覽</div>
      <div class="yx-ship-preview-table"><table><thead><tr><th>商品</th><th>出貨</th><th>總單</th><th>訂單</th><th>庫存</th><th>狀態</th></tr></thead><tbody>
      ${rows.map(r=>`<tr><td>${esc(r.product_text||r.product||'')}</td><td>${Number(r.qty||r.need_qty||0)}</td><td>${Number(r.master_available||0)}</td><td>${Number(r.order_available||0)}</td><td>${Number(r.inventory_available||0)}</td><td>${Number(r.shortage||0)>0?'<span class="danger-text">不足</span>':'可出貨'}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="btn-row compact-row"><button class="ghost-btn" type="button" id="ship-preview-cancel">取消</button><button class="primary-btn" type="button" id="ship-preview-confirm">確認扣除</button></div>`;
    $('ship-preview-cancel')?.addEventListener('click',()=>panel.classList.add('hidden'),{once:true});
    $('ship-preview-confirm')?.addEventListener('click',async()=>{
      const b=$('ship-preview-confirm'); if(b){b.disabled=true;b.textContent='扣除中…';}
      try{ const r=await api('/api/ship',{method:'POST',body:JSON.stringify({...payload,request_key:'ship_confirm_'+Date.now()+'_'+Math.random().toString(36).slice(2)})});
        panel.innerHTML='<div class="section-title">出貨完成</div><div class="muted">已完成扣除，客戶商品清單已刷新。</div>'; state.selected=[]; renderSelected(); state.itemCache.delete(state.customer); await loadItems(state.customer,{force:true}); toast('出貨完成','ok');
      }catch(e){ toast(e.message||'出貨失敗','error'); if(b){b.disabled=false;b.textContent='確認扣除';} }
    },{once:true});
  }
  window.confirmSubmit=confirmSubmit;
  window.YX116ShipPicker = { load: loadItems, addItem, renderItems, renderSelected };
  window.reverseLookup=function(){ toast('請使用倉庫圖搜尋商品位置','warn'); };
  function bind(){
    document.addEventListener('click',(e)=>{
      const c=e.target.closest('[data-ship-customer]'); if(c){ e.preventDefault(); loadItems(c.dataset.shipCustomer).catch(err=>toast(err.message,'error')); return; }
      const add=e.target.closest('[data-ship-add], [data-ship-pick]'); if(add){ e.preventDefault(); addItem(add.dataset.shipAdd ?? add.dataset.shipPick); return; }
      const rm=e.target.closest('[data-selected-remove]'); if(rm){ e.preventDefault(); state.selected.splice(Number(rm.dataset.selectedRemove),1); renderSelected(); return; }
      if(e.target.id==='ship-refresh-customer-items'){ e.preventDefault(); loadItems(state.customer||$('customer-name')?.value||$('ship-customer-search')?.value).then(()=>toast('已重新載入','ok')).catch(err=>toast(err.message,'error')); }
    },true);
    document.addEventListener('keydown',(e)=>{
      if((e.target.id==='customer-name' || e.target.id==='ship-customer-search') && e.key==='Enter'){ e.preventDefault(); loadItems(state.customer,{force:true}).catch(err=>toast(err.message,'error')); }
    },true);
    document.addEventListener('change',(e)=>{
      if(e.target.id==='customer-name' || e.target.id==='ship-customer-search'){ loadItems(state.customer,{force:true}).catch(err=>toast(err.message,'error')); }
    },true);
    document.addEventListener('input',(e)=>{
      if(e.target.id==='customer-name' || e.target.id==='ship-customer-search'){
        setCustomer(e.target.value);
        renderCustomers();
        renderItems();
      }
      if(e.target.matches('[data-selected-qty]')){ const i=Number(e.target.dataset.selectedQty); const q=Math.max(1,parseInt(e.target.value||1,10)||1); if(state.selected[i]){ state.selected[i].qty=q; state.selected[i].product_text=productForQty(state.selected[i],q); } }
    },true);
  }
  function install(){
    document.documentElement.dataset.yxShipSingle='locked';
    bind(); window.addEventListener('yx:customers-loaded',e=>{ state.customers=Array.isArray(e.detail?.items)?e.detail.items:state.customers; renderCustomers(); }, false); setTimeout(loadCustomers,120); renderSelected();
    const name=clean($('customer-name')?.value||''); if(name) loadItems(name).catch(()=>{}); else renderItems();
    window.confirmSubmit=confirmSubmit;
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true}); else install();
})();
