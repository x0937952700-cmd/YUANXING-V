/* 沅興木業 出貨單一母版：HTML 固定顯示完整商品清單，不再用下拉選單當主畫面 */
(function(){
  'use strict';
  if (!window.__YX_SHIP_SINGLE_LOCK__) return;
  const $ = (id)=>document.getElementById(id);
  const state = { customer:'', items:[], selected:[], customers:[], loadingName:'', itemCache:new Map(), bound:false };
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
  function materialOf(it){ return clean(it.material||it.product_code||it.wood_type||it['材質']||'未填材質'); }
  function normalizeSource(v){
    const raw=clean(v);
    if(/總單|master_order|master_orders|master/i.test(raw)) return '總單';
    if(/訂單|orders|order/i.test(raw)) return '訂單';
    if(/庫存|inventory|stock/i.test(raw)) return '庫存';
    return '';
  }
  function sourceOf(it){ return normalizeSource(it.source_preference||it.source||it.deduct_source) || '自動'; }
  function sourcePreferenceOf(it){ return normalizeSource(it.source_preference||it.source||it.deduct_source); }
  function variantsQuery(){
    const arr=Array.isArray(window.__YX_SELECTED_CUSTOMER_VARIANTS__)?window.__YX_SELECTED_CUSTOMER_VARIANTS__.filter(Boolean):[];
    return arr.length?'&variants='+encodeURIComponent(JSON.stringify(arr)):'';
  }
  function withQtySupport(support, qty){
    let s=normalizeText(support); const q=Math.max(1,parseInt(qty||1,10)||1);
    if(!s) return String(q);
    const parts=s.split('+').map(x=>x.trim()).filter(Boolean);
    if(parts.length===1){ const base=parts[0].replace(/x\s*\d+$/i,''); return `${base}x${q}`; }
    return `${parts[0].replace(/x\s*\d+$/i,'')}x${q}`;
  }
  function productForQty(it,qty){ const p=splitProduct(it.product_text||''); return `${p.size}=${withQtySupport(p.support,qty)}`; }
  function productLabel(it){
    const p=splitProduct(it.product_text||it.product||'');
    const q=qtyFromText(it.product_text,it.qty);
    const mat=materialOf(it)||'未填材質';
    const src=sourceOf(it)||'自動';
    return `${src}｜${mat}｜${p.size}${p.support?'='+p.support:''}｜${q}件`;
  }
  function setCustomer(name){
    state.customer=clean(name);
    const input=$('customer-name'); if(input && input.value!==state.customer) input.value=state.customer;
    const search=$('ship-customer-search'); if(search && search.value!==state.customer) search.value=state.customer;
  }
  function setCount(text){ const el=$('ship-customer-item-count'); if(el) el.textContent=text; }
  function renderCustomers(){
    // 出貨頁 HTML 鎖定：不再產生一整排客戶按鈕。
    const box=$('ship-customer-quick-list');
    if(box) box.replaceChildren();
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
  function syncHiddenSelect(){
    const select=$('ship-customer-item-select'); if(!select) return;
    if(!state.customer){ select.innerHTML='<option value="">請先點選北 / 中 / 南客戶</option>'; return; }
    if(!state.items.length){ select.innerHTML='<option value="">此客戶目前沒有可出貨商品</option>'; return; }
    select.innerHTML='<option value="">請選擇商品（來源｜材質｜尺寸 / 支數｜件數）</option>'+state.items.map((it,i)=>`<option value="${i}">${esc(productLabel(it))}</option>`).join('');
  }
  function renderItems(){
    const box=$('ship-customer-item-list');
    syncHiddenSelect();
    if(!state.customer){
      setCount('請先點選北 / 中 / 南客戶');
      if(box) box.innerHTML='<div class="empty-state-card compact-empty">請先點選北 / 中 / 南客戶，這裡會完整顯示該客戶全部商品。</div>';
      return;
    }
    if(state.loadingName===state.customer){
      setCount(`${state.customer}：商品載入中…`);
      if(box) box.innerHTML='<div class="empty-state-card compact-empty">客戶商品載入中…</div>';
      return;
    }
    if(!state.items.length){
      setCount(`${state.customer}：0 筆 / 0 件`);
      if(box) box.innerHTML='<div class="empty-state-card compact-empty">此客戶目前沒有可出貨商品</div>';
      return;
    }
    const total=state.items.reduce((sum,it)=>sum+qtyFromText(it.product_text,it.qty),0);
    setCount(`${state.customer}：${state.items.length} 筆 / ${total} 件`);
    if(box){
      box.innerHTML=state.items.map((it,i)=>{
        const p=splitProduct(it.product_text||it.product||'');
        const q=qtyFromText(it.product_text,it.qty);
        const mat=materialOf(it)||'未填材質';
        const src=sourceOf(it)||'自動';
        return `<button class="yx-ship-open-product-card" type="button" data-ship-add-index="${i}">
          <span class="yx-ship-open-source">${esc(src)}</span>
          <span class="yx-ship-open-material">${esc(mat)}</span>
          <span class="yx-ship-open-product">${esc(p.size)}${p.support?'='+esc(p.support):''}</span>
          <span class="yx-ship-open-total">${q}件</span>
          <span class="yx-ship-open-add">加入</span>
        </button>`;
      }).join('');
    }
  }
  async function loadItems(name, opts={}){
    setCustomer(name||state.customer); renderItems();
    if(!state.customer) return;
    const key=state.customer;
    const cached=state.itemCache.get(key);
    if(!opts.force && cached && Date.now()-cached.at<15000){ state.items=cached.items; renderItems(); return; }
    if(state.loadingName===key) return;
    state.loadingName=key; renderItems();
    try{
      const d=await api('/api/customer-items?name='+encodeURIComponent(state.customer)+'&fast=1&ship_single=1'+variantsQuery()+'&ts='+Date.now());
      state.items=Array.isArray(d.items)?d.items:[];
      state.itemCache.set(key,{items:state.items,at:Date.now()});
      renderItems();
    } finally { state.loadingName=''; renderItems(); }
  }
  function selectedCardHtml(it,i){
    const p=splitProduct(it.product_text);
    const q=Math.max(1,Number(it.qty||qtyFromText(it.product_text)||1));
    return `<div class="yx-ship-selected-html-card yx-ship-selected-tag-card" data-selected-card="${i}">
      <button class="yx-ship-selected-main" type="button" data-focus-qty="${i}" title="點擊可修改件數">
        <span class="yx-ship-source-pill">${esc(it.source||'自動')}</span>
        <span class="yx-ship-material-pill yx-ship-material-green">${esc(it.material||'未填材質')}</span>
        <span class="yx-ship-selected-product" data-selected-product-text="${i}">${esc(p.size)}${p.support?'='+esc(p.support):''}</span>
        <span class="yx-ship-selected-total" data-selected-total="${i}">${q}件</span>
      </button>
      <label class="yx-ship-selected-qty-wrap">修改件數<input class="text-input yx-ship-selected-qty" type="number" min="1" value="${q}" data-selected-qty="${i}"></label>
      <button class="ghost-btn small-btn danger-btn" type="button" data-selected-remove="${i}">刪除</button>
    </div>`;
  }
  function renderSelected(){
    const box=$('ship-selected-items'); if(!box) return;
    if(!state.selected.length){ box.innerHTML='<div class="empty-state-card compact-empty">尚未加入出貨商品</div>'; }
    else { box.innerHTML=state.selected.map(selectedCardHtml).join(''); }
    const hidden=$('ocr-text'); if(hidden) hidden.value=state.selected.map(it=>it.product_text).join('\n');
  }
  function addItem(i){
    const it=state.items[Number(i)]; if(!it) return toast('找不到商品','warn');
    const max=qtyFromText(it.product_text,it.qty)||9999;
    const qty=max || 1;
    const product_text=productForQty(it,qty);
    const pref=sourcePreferenceOf(it);
    const row={ product_text, qty, material:materialOf(it), product_code:materialOf(it), source:sourceOf(it), source_preference:pref, id:it.id };
    state.selected.push(row);
    renderSelected(); toast('已加入出貨商品，可直接修改件數','ok');
    $('ship-selected-items')?.scrollIntoView?.({behavior:'smooth',block:'nearest'});
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
  function calcRowsHtml(calc){
    const rows=calc?.rows||calc?.items||[];
    if(!rows.length) return '<tr><td colspan="5">尚無材積算式</td></tr>';
    return rows.map((r,i)=>`<tr><td>${i+1}</td><td>${esc(r.product||r.product_text||'')}</td><td>${Number(r.pieces_sum||r.qty||0)}</td><td>${esc(r.formula||'')}</td><td>${esc(r.volume||'')}</td></tr>`).join('');
  }
  function previewRowHtml(item, idx, preview){
    const p=splitProduct(item.product_text||preview.product_text||preview.product||'');
    const q=Number(item.qty||preview.qty||preview.need_qty||1);
    const before=Number(preview.master_available||preview.order_available||preview.inventory_available||0);
    const after=before?Math.max(0,before-q):'';
    const loc=preview.location||preview.warehouse_location||preview.slot||'商品位置';
    const bad=Number(preview.shortage||0)>0;
    return `<tr><td>${idx+1}</td><td>${esc(state.customer||item.customer||preview.customer||'')}</td><td><span class="mat-tag">${esc(item.material||preview.material||'未填材質')}</span></td><td>${esc(p.size)}${p.support?'='+esc(p.support):''}</td><td>${q}件</td><td><button type="button" class="yx22-location-btn" data-prod="${esc(item.product_text||preview.product_text||preview.product||'')}">${esc(loc)}</button></td><td>${before?`${before} → ${after}`:'待確認'}</td><td>${bad?'<span class="danger-text">不足</span>':'可出貨'}</td></tr>`;
  }
  function showPreview(data,payload){
    const panel=$('ship-preview-panel')||$('module-result'); if(!panel) return;
    const rows=Array.isArray(data.breakdown)?data.breakdown:(Array.isArray(data.items)?data.items:[]);
    const draft=payload.items||[];
    const calc=data.calc||data.volume_calc||{};
    const totalQty=Number(calc.total_qty||draft.reduce((a,b)=>a+Number(b.qty||1),0));
    panel.classList.remove('hidden'); panel.style.display='block';
    panel.innerHTML=`<div class="yx22-preview"><div class="yx22-preview-title">出貨預覽</div><div class="yx22-stat-grid"><div><span>本次出貨</span><b>${totalQty}</b><em>件</em></div><div><span>商品筆數</span><b>${draft.length||rows.length}</b><em>筆</em></div><div><span>材積合計</span><b>${Number(calc.total_volume||0).toFixed(2)}</b><em>才</em></div><div><span>扣除流程</span><b>預覽</b><em>確認後才扣</em></div></div><table class="yx22-preview-table"><thead><tr><th>#</th><th>客戶</th><th>材質</th><th>尺寸 / 支數</th><th>件數</th><th>倉庫位置</th><th>扣前 → 扣後</th><th>狀態</th></tr></thead><tbody>${(draft.length?draft:rows).map((x,i)=>previewRowHtml(x,i,rows[i]||{})).join('')}</tbody></table><div class="yx22-calc-box"><div class="yx22-preview-title small">材積計算</div><table class="yx22-preview-table"><thead><tr><th>#</th><th>商品</th><th>支數總和</th><th>算式</th><th>材積</th></tr></thead><tbody>${calcRowsHtml(calc)}</tbody></table><div class="yx22-formula-total">總材積：${Number(calc.total_volume||0).toFixed(2)} 才</div></div><div class="yx22-weight"><label>重量</label><input id="yx22-weight" type="number" step="0.01" placeholder="輸入重量，自動算總重"><b id="yx22-total-weight">總重：--</b></div><div class="btn-row"><button class="primary-btn" id="yx22-confirm-ship" type="button">確認扣除</button><button class="ghost-btn" id="yx22-cancel-preview" type="button">取消</button></div></div>`;
    $('yx22-weight')?.addEventListener('input',e=>{const w=Number(e.target.value||0), v=Number(calc.total_volume||0); const out=$('yx22-total-weight'); if(out)out.textContent=w?`總重：${(w*v).toFixed(2)}`:'總重：--';});
    $('yx22-cancel-preview')?.addEventListener('click',()=>panel.classList.add('hidden'),{once:true});
    $('yx22-confirm-ship')?.addEventListener('click',async()=>{ const b=$('yx22-confirm-ship'); if(b){b.disabled=true;b.textContent='扣除中…';} try{ await api('/api/ship',{method:'POST',body:JSON.stringify({...payload,request_key:'ship_confirm_'+Date.now()+'_'+Math.random().toString(36).slice(2)})}); panel.innerHTML='<div class="success-card">出貨完成，已扣除並寫入今日異動</div>'; state.selected=[]; renderSelected(); state.itemCache.delete(state.customer); await loadItems(state.customer,{force:true}); toast('出貨完成','ok'); }catch(e){ toast(e.message||'出貨失敗','error'); if(b){b.disabled=false;b.textContent='確認扣除';} } },{once:true});
    panel.scrollIntoView({behavior:'smooth',block:'start'});
  }
  window.confirmSubmit=confirmSubmit;
  window.YX116ShipPicker = { load: loadItems, addItem, renderItems, renderSelected };
  window.reverseLookup=function(){ toast('請使用倉庫圖搜尋商品位置','warn'); };
  function bind(){
    if(state.bound) return; state.bound=true;
    document.addEventListener('click',(e)=>{
      const c=e.target.closest('[data-ship-customer]'); if(c){ e.preventDefault(); loadItems(c.dataset.shipCustomer).catch(err=>toast(err.message,'error')); return; }
      const add=e.target.closest('[data-ship-add-index]'); if(add){ e.preventDefault(); addItem(add.dataset.shipAddIndex); return; }
      const rm=e.target.closest('[data-selected-remove]'); if(rm){ e.preventDefault(); state.selected.splice(Number(rm.dataset.selectedRemove),1); renderSelected(); return; }
      const focus=e.target.closest('[data-focus-qty]'); if(focus){ e.preventDefault(); const inp=document.querySelector(`[data-selected-qty="${focus.dataset.focusQty}"]`); inp?.focus(); inp?.select?.(); return; }
    },true);
    document.addEventListener('keydown',(e)=>{
      if((e.target.id==='customer-name' || e.target.id==='ship-customer-search') && e.key==='Enter'){ e.preventDefault(); loadItems(state.customer,{force:true}).catch(err=>toast(err.message,'error')); }
    },true);
    document.addEventListener('change',(e)=>{
      if(e.target.id==='ship-customer-item-select' && e.target.value!==''){ addItem(e.target.value); e.target.value=''; }
    },true);
    document.addEventListener('input',(e)=>{
      if(e.target.id==='customer-name' || e.target.id==='ship-customer-search'){
        setCustomer(e.target.value);
        renderCustomers();
        renderItems();
      }
      if(e.target.matches('[data-selected-qty]')){
        const i=Number(e.target.dataset.selectedQty);
        const q=Math.max(1,parseInt(e.target.value||1,10)||1);
        if(state.selected[i]){
          state.selected[i].qty=q;
          state.selected[i].product_text=productForQty(state.selected[i],q);
          const p=splitProduct(state.selected[i].product_text);
          const label=document.querySelector(`[data-selected-product-text="${i}"]`);
          if(label) label.textContent=`${p.size}${p.support?'='+p.support:''}`;
          const total=document.querySelector(`[data-selected-total="${i}"]`);
          if(total) total.textContent=`${q}件`;
          const hidden=$('ocr-text'); if(hidden) hidden.value=state.selected.map(it=>it.product_text).join('\n');
        }
      }
    },true);
  }
  function install(){
    document.documentElement.dataset.yxShipSingle='locked-open-html-list';
    bind();
    loadCustomers();
    window.addEventListener('yx:customers-loaded',e=>{ state.customers=Array.isArray(e.detail?.items)?e.detail.items:state.customers; }, false);
    window.addEventListener('yx:customer-selected',e=>{ const name=clean(e.detail?.name||''); if(name) loadItems(name,{force:true}).catch(err=>toast(err.message,'error')); }, false);
    renderSelected();
    const name=clean($('customer-name')?.value||''); if(name) loadItems(name).catch(()=>{}); else renderItems();
    window.confirmSubmit=confirmSubmit;
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true}); else install();
})();
