let shipItems=[]; let previewItems=[]; let allowBorrow=false; let previewHasError=false;
document.addEventListener('DOMContentLoaded',()=>{
  YX.attachCustomerSuggest(YX.$('#customerInput'));
  YX.$('#loadCustomerItems').onclick=()=>loadItems();
  const addSel=YX.$('#addSelectedShipItem'); if(addSel) addSel.onclick=()=>addSelectedFromDropdown(false);
  const addAll=YX.$('#addAllShipItems'); if(addAll) addAll.onclick=()=>addSelectedFromDropdown(true);
  YX.$('#previewShip').onclick=()=>preview();
  YX.$('#confirmShip').onclick=()=>confirmShip();
  YX.$('#weightUnit').addEventListener('input',()=>{ if(previewItems.length) preview(); });
  document.addEventListener('yx:sync',()=>{ if(document.visibilityState==='visible' && YX.$('#customerInput').value.trim()) loadItems(); });
  const seed=sessionStorage.getItem('shipSeed');
  if(seed){
    sessionStorage.removeItem('shipSeed');
    loadSeed(seed);
  }
});
async function loadSeed(seedText){
  try{
    const seed=JSON.parse(seedText);
    const d=await YX.api(`/api/items/${seed.source}/${seed.id}`);
    const item=d.item;
    if(item.customer_name) YX.$('#customerInput').value=item.customer_name;
    shipItems=[item];
    renderShipItems(true);
    YX.toast('已帶入直接出貨商品');
  }catch(e){ YX.toast('直接出貨商品帶入失敗：'+e.message,true); }
}
async function loadItems(){
  const customer=YX.$('#customerInput').value.trim() || '庫存';
  const token=YX.nextToken('ship-items');
  const d=await YX.api('/api/customer-items?fast=1&customer='+encodeURIComponent(customer)+'&variants='+encodeURIComponent(customer));
  if(!YX.isFresh('ship-items', token)) return;
  shipItems=d.items||[]; if(d.fallback==='inventory') YX.toast('該客戶沒有總單/訂單商品，已顯示庫存可出貨'); fillCustomerItemSelect(); renderShipItems();
}
function fillCustomerItemSelect(){
  const sel=YX.$('#customerItemSelect'); if(!sel) return;
  sel.innerHTML='<option value="">客戶商品下拉選單</option>'+shipItems.map((it,idx)=>`<option value="${idx}">${YX.esc(it.customer_name||'庫存')}｜${YX.esc(it.product_text)}｜${it.pieces}件｜${YX.esc(it.source)}</option>`).join('');
}
function addSelectedFromDropdown(all=false){
  if(!shipItems.length) return YX.toast('請先載入客戶商品', true);
  if(all){ YX.$$('.ship-check').forEach(cb=>cb.checked=true); YX.toast('已加入全部商品到出貨清單'); return; }
  const sel=YX.$('#customerItemSelect'); const idx=Number(sel?.value);
  if(!Number.isFinite(idx) || idx<0 || !shipItems[idx]) return YX.toast('請先選擇商品', true);
  const it=shipItems[idx];
  const cb=YX.$(`.ship-check[data-source="${it.source}"][data-id="${it.id}"]`); if(cb){ cb.checked=true; cb.closest('.ship-card')?.scrollIntoView({behavior:'smooth',block:'center'}); }
}

function renderShipItems(autoCheck=false){
  const box=YX.$('#shipItems');
  if(!shipItems.length){ box.innerHTML='<div class="empty">沒有可出貨商品</div>'; return; }
  box.innerHTML=shipItems.map(it=>`<article class="ship-card"><label class="row gap"><input type="checkbox" class="ship-check" data-source="${it.source}" data-id="${it.id}" ${autoCheck?'checked':''}><strong>${YX.esc(it.product_text)}</strong></label><div class="hint">${YX.esc(it.customer_name||'庫存')}｜${YX.esc(it.material||'未填材質')}｜${it.source}｜目前 ${it.pieces} 件｜${YX.esc(it.warehouse_key||'未錄入倉庫圖')}</div><label>要出件數<input class="ship-pieces" data-source="${it.source}" data-id="${it.id}" type="number" min="1" max="${it.pieces}" value="${it.pieces}"></label></article>`).join('');
}
function selected(){
  return YX.$$('.ship-check:checked').map(cb=>{ const inp=YX.$(`.ship-pieces[data-source="${cb.dataset.source}"][data-id="${cb.dataset.id}"]`); return {source:cb.dataset.source,id:Number(cb.dataset.id),pieces:Number(inp?.value||0)}; });
}
async function preview(){
  const btn=YX.$('#previewShip');
  await YX.safe(btn,async()=>{
    const items=selected(); if(!items.length) throw new Error('請先選取要出貨商品');
    const d=await YX.api('/api/shipping/preview',{method:'POST',body:{customer_name:YX.$('#customerInput').value.trim(), weight_unit:YX.$('#weightUnit').value||0, items}});
    if(d.borrow_required){
      const msg=d.borrow_warnings.map(x=>`該客戶沒有這筆商品，是否向 ${x.from_customer} 借：${x.product_text} = ${x.pieces} 件`).join('\n');
      allowBorrow=confirm(msg);
      if(!allowBorrow) throw new Error('已取消借貨出貨');
    }else{
      allowBorrow=false;
    }
    previewHasError=(d.items||[]).some(x=>x.error);
    previewItems=previewHasError?[]:items;
    const confirmBtn=YX.$('#confirmShip'); if(confirmBtn) confirmBtn.disabled=previewHasError;
    YX.$('#shipPreview').innerHTML=`<h3>出貨預覽</h3>${d.items.map(x=>`<div class="item-card ${x.error?'ship-error':''}"><b>${YX.esc(x.deduct_label)}</b>｜${YX.esc(x.product_text)}｜${x.before} → ${x.after}｜${YX.esc(x.warehouse_key)}<br><span class="hint">${YX.esc(x.formula)} = ${x.volume}</span>${x.error?`<br><b class="danger-text">${YX.esc(x.error)}</b>`:''}</div>`).join('')}<h3>材積：${d.total_volume}　總重：${d.total_weight}</h3>${previewHasError?'<div class="toast err inline">有商品件數錯誤或數量不足，已鎖定確認扣除。</div>':''}`;
  });
}
async function confirmShip(){
  const btn=YX.$('#confirmShip');
  await YX.safe(btn,async()=>{
    if(previewHasError) throw new Error('預覽有錯誤，請修正件數後再出貨'); const items=previewItems.length?previewItems:selected(); if(!items.length) throw new Error('請先預覽出貨');
    if(!confirm('確認扣除出貨資料？')) return;
    const d=await YX.api('/api/shipping/confirm',{method:'POST',body:{customer_name:YX.$('#customerInput').value.trim(), weight_unit:YX.$('#weightUnit').value||0,items,allow_borrow:allowBorrow,request_key:YX.key()}});
    YX.toast('出貨完成'); YX.$('#shipPreview').innerHTML=d.results.map(r=>`${r.label}：${r.before} → ${r.after}${r.borrow||''}`).join('\n'); previewItems=[]; previewHasError=false; const confirmBtn=YX.$('#confirmShip'); if(confirmBtn) confirmBtn.disabled=false; loadItems(); YX.loadBadge();
  });
}
