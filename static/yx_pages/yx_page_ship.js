// CLEAN EVENTS V23 ship page JS. One page = one JS. Old FIX JS is not loaded.
(function(){
  'use strict';
  if (window.__YX_CLEAN_COMMON__) return; window.__YX_CLEAN_COMMON__ = true;
  window.$ = window.$ || ((s, r=document)=>r.querySelector(s));
  window.$$ = window.$$ || ((s, r=document)=>Array.from(r.querySelectorAll(s)));
  window.yxApi = async function(url, opt={}){
    const o = Object.assign({credentials:'same-origin'}, opt);
    o.headers = Object.assign({'Content-Type':'application/json'}, o.headers||{});
    const r = await fetch(url, o); let data={}; try{data=await r.json();}catch(e){}
    if(!r.ok || data.success===false){ throw new Error(data.message || data.error || ('HTTP '+r.status)); }
    return data;
  };
  window.yxToast = function(msg){
    let el = $('#yx-clean-toast');
    if(!el){ el=document.createElement('div'); el.id='yx-clean-toast'; el.style.cssText='position:fixed;right:18px;top:18px;z-index:99999;background:#111827;color:#fff;padding:10px 14px;border-radius:12px;box-shadow:0 8px 24px #0002;font-weight:700;max-width:70vw'; document.body.appendChild(el); }
    el.textContent=msg; el.style.display='block'; clearTimeout(el._t); el._t=setTimeout(()=>el.style.display='none',2600);
  };
  window.yxErr = e => yxToast((e && e.message) ? e.message : String(e||'操作失敗'));
  window.yxQty = function(text){
    text=String(text||''); const rhs=(text.split('=')[1]||text).trim(); if(!rhs) return 0;
    return rhs.split('+').map(x=>x.trim()).filter(Boolean).reduce((sum,p)=>{ const m=p.match(/^(\d+)\s*[xX×*]\s*(\d+)$/); if(m) return sum+parseInt(m[2]||0,10); return sum+1; },0);
  };
  window.yxMaterial = function(row){ return (row.material || row.product_code || '未填材質').trim(); };
  window.yxSize = function(row){ return (row.product_text || row.product || '').trim(); };
  window.yxLoadRegionPicker = async function(){
    const mod = (document.querySelector('.module-screen')||{}).dataset?.module;
    if(!['orders','master_order','ship'].includes(mod)) return;
    try{
      const d = await yxApi('/api/customers');
      const items = d.items || [];
      const boxes = {'北區':'#region-north','中區':'#region-center','南區':'#region-south'};
      Object.entries(boxes).forEach(([region, sel])=>{
        const box = $(sel); if(!box) return;
        const list = items.filter(c=>(c.region||'北區')===region);
        box.innerHTML = list.map(c=>`<button class="customer-chip" type="button" data-yx-region-customer="${String(c.name||'').replace(/"/g,'&quot;')}">${c.name}</button>`).join('') || '<div class="muted">無客戶</div>';
      });
    }catch(e){ yxErr(e); }
  };
  document.addEventListener('click', e=>{
    const b=e.target.closest('[data-yx-region-customer]'); if(!b) return;
    const inp=$('#customer-name'); if(inp) { inp.value=b.dataset.yxRegionCustomer; inp.dispatchEvent(new Event('input',{bubbles:true})); }
  });
  document.addEventListener('DOMContentLoaded', ()=>{ yxLoadRegionPicker(); });
})();

(function(){
'use strict';
if(window.__YX_CLEAN_SHIP_V25__) return; window.__YX_CLEAN_SHIP_V25__=true;
let allItems=[], selected=[], previewData=null, loading=false;
const sourceMap={ '總單':'master_orders','master':'master_orders','master_order':'master_orders','master_orders':'master_orders','訂單':'orders','order':'orders','orders':'orders','庫存':'inventory','stock':'inventory','inventory':'inventory' };
const sourceLabel={master_orders:'總單',orders:'訂單',inventory:'庫存'};
const esc=v=>String(v==null?'':v).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const normSource=v=>sourceMap[String(v||'').trim().toLowerCase()]||sourceMap[String(v||'').trim()]||String(v||'').trim();
const keyOf=r=>[normSource(r.source||r.source_label||r.deduct_source||''), r.id||'', yxSize(r)].join('|');
const itemQty=r=>Number(r.qty||yxQty(yxSize(r))||0);
const rhsOf=t=>String(t||'').split('=').slice(1).join('=').trim();
const lhsOf=t=>String(t||'').split('=')[0].trim();
function selectedProductText(r){ return lhsOf(r.product_text)+'='+(r.ship_expr||''); }
function segmentMap(s){ const m={}; String(s||'').split('+').map(x=>x.trim()).filter(Boolean).forEach(seg=>{ const mm=seg.match(/^(\d+)\s*(?:[xX×*]\s*(\d+))?$/); if(!mm) throw new Error(`支數格式錯誤：${seg}`); const n=String(Number(mm[1])); const q=Number(mm[2]||1); m[n]=(m[n]||0)+q; }); return m; }
function validateLocal(){
  if(!selected.length) throw new Error('請先加入出貨商品');
  const seen=new Set();
  for(const r of selected){
    const src=normSource(r.source||r.source_label||r.deduct_source||'');
    if(!sourceLabel[src]) throw new Error('商品來源不明，請重新選擇商品');
    const k=keyOf(r); if(seen.has(k)) throw new Error('同商品不可重複加入'); seen.add(k);
    const oldMap=segmentMap(rhsOf(r.product_text)); const newMap=segmentMap(r.ship_expr||'');
    for(const n of Object.keys(newMap)){ if(!Object.prototype.hasOwnProperty.call(oldMap,n)) throw new Error(`支數 ${n} 不在原商品內，禁止送出`); if(newMap[n]>oldMap[n]) throw new Error(`支數 ${n} 出貨 ${newMap[n]} 件超過原本 ${oldMap[n]} 件`); }
    const q=yxQty(selectedProductText(r));
    if(q<=0) throw new Error('出貨件數必須大於 0');
    if(q>itemQty(r)) throw new Error(`${r.product_text} 出貨 ${q} 件超過可出 ${itemQty(r)} 件`);
  }
}
function payloadItems(){ return selected.map(r=>{ const src=normSource(r.source||r.source_label||r.deduct_source||''); const text=selectedProductText(r); return {product_text:text, product_code:yxMaterial(r), material:yxMaterial(r), qty:yxQty(text), source_preference:src, deduct_source:src, source:src}; }); }
function coeffLen(n){ n=Number(n||0); return n>210 ? n/1000 : n/100; }
function coeffW(n){ return Number(n||0)/10; }
function coeffH(raw){ const n=Number(String(raw||'').trim()); return n>=100 ? n/100 : n/10; }
function supportTotal(expr){ return String(expr||'').split('+').map(x=>x.trim()).filter(Boolean).reduce((sum,seg)=>{ const m=seg.match(/^(\d+)\s*(?:[xX×*]\s*(\d+))?$/); return m ? sum + Number(m[1]||0)*Number(m[2]||1) : sum; },0); }
function itemVolume(row){ const left=lhsOf(row.product_text); const m=left.match(/(\d+)\s*[xX×*]\s*(\d+)\s*[xX×*]\s*(\d+)/); if(!m) return {formula:'尺寸格式不足，未計材積', volume:0}; const total=supportTotal(row.ship_expr||''); const v=total*coeffLen(m[1])*coeffW(m[2])*coeffH(m[3]); const fmt=n=>Number(n).toFixed(3).replace(/0+$/,'').replace(/\.$/,''); return {formula:`${total} × ${fmt(coeffLen(m[1]))} × ${fmt(coeffW(m[2]))} × ${fmt(coeffH(m[3]))}`, volume:v}; }
function renderList(){
  const box=$('#ship-customer-item-list'), count=$('#ship-customer-item-count'), cust=($('#customer-name')||{}).value||'';
  const list=allItems.filter(r=>!cust||String(r.customer_name||'')===cust);
  if(count) count.textContent=cust?`${cust}：${list.length}筆 / ${list.reduce((s,r)=>s+itemQty(r),0)}件`:'請先選客戶';
  if(box) box.innerHTML=list.length?list.map(r=>`<div class="yx-ship-product-row" data-k="${esc(keyOf(r))}"><span class="pill">${esc(sourceLabel[normSource(r.source)]||r.source_label||r.source||'來源')}</span><span class="material-tag">${esc(yxMaterial(r))}</span><strong>${esc(yxSize(r))}</strong><span class="yx-ship-count">${itemQty(r)}件</span><button class="ghost-btn small-btn" data-add-ship="${esc(keyOf(r))}">加入</button></div>`).join(''):'<div class="empty-state-card compact-empty">此客戶沒有可出貨商品</div>';
}
function renderSel(){
  const box=$('#ship-selected-items'); if(!box) return;
  box.innerHTML=selected.length?selected.map((r,i)=>`<div class="yx-ship-selected-one-line" data-i="${i}"><span class="pill">${esc(sourceLabel[normSource(r.source)]||r.source_label||r.source)}</span><span class="material-tag">${esc(yxMaterial(r))}</span><span class="ship-size-prefix">${esc(lhsOf(r.product_text))}=</span><input class="text-input small yx-ship-support-input" value="${esc(r.ship_expr||rhsOf(r.product_text))}" data-i="${i}"><span class="yx-ship-total">${yxQty(selectedProductText(r))}件</span><button class="ghost-btn small-btn danger-btn" data-del-sel="${i}">刪除</button></div>`).join(''):'<div class="empty-state-card compact-empty">尚未加入出貨商品</div>';
}
function refreshWeight(){ const input=$('#ship-weight-input'), out=$('#ship-weight-total'); if(!input||!out) return; const total=selected.reduce((s,r)=>s+itemVolume(r).volume,0); const w=Number(input.value||0); out.textContent=w?`總重：${(total*w).toFixed(2)}`:'總重：請輸入重量'; }
async function serverPreview(){
  validateLocal();
  const cust=($('#customer-name')||{}).value||''; if(!cust.trim()) throw new Error('請輸入客戶名稱');
  const d=await yxApi('/api/ship-preview',{method:'POST',body:JSON.stringify({customer_name:cust,items:payloadItems(),request_key:String(Date.now())})});
  const bad=(d.items||[]).find(x=>x.strict_ok===false || Number(x.shortage_qty||0)>0);
  if(bad){ const reasons=(bad.shortage_reasons||[]).join('；') || bad.recommendation || '來源不足'; throw new Error(`${bad.product_text} ${reasons}`); }
  previewData=d; return d;
}
async function preview(){
  const p=$('#ship-preview-panel'); if(!p) return;
  p.classList.remove('hidden');
  try{
    const d=await serverPreview();
    const rows=(d.items&&d.items.length?d.items:selected.map(r=>({product_text:selectedProductText(r),material:yxMaterial(r),qty:yxQty(selectedProductText(r)),source_label:sourceLabel[normSource(r.source)]||r.source, deduct_before:{}, deduct_after:{}})));
    p.innerHTML=`<div class="ship-preview-card"><h3>出貨預覽</h3><table class="yx113-table"><thead><tr><th>#</th><th>客戶</th><th>來源</th><th>材質</th><th>尺寸 / 支數</th><th>件數</th><th>扣前 → 扣後</th><th>材積算式</th></tr></thead><tbody>${rows.map((row,i)=>{ const local=selected[i]||{}; const vol=itemVolume(local.product_text?local:{product_text:row.product_text,ship_expr:rhsOf(row.product_text)}); const b=row.deduct_before||{}; const a=row.deduct_after||row.remaining_after||{}; const src=row.source_preference||normSource(local.source); const before=src==='master_orders'?b.master:src==='orders'?b.order:b.inventory; const after=src==='master_orders'?a.master:src==='orders'?a.order:a.inventory; return `<tr><td>${i+1}</td><td>${esc(($('#customer-name')||{}).value||row.ship_customer_name||'')}</td><td>${esc(row.source_label||sourceLabel[src]||'')}</td><td><span class="material-tag">${esc(row.material||row.product_code||yxMaterial(local))}</span></td><td>${esc(row.product_text)}</td><td>${Number(row.qty||0)}件</td><td>${Number.isFinite(Number(before))?`${before} → ${after}`:'-'}</td><td>${esc(vol.formula)} = ${vol.volume.toFixed(2)}</td></tr>`; }).join('')}</tbody></table><div class="result-card"><b>材積合計：</b>${selected.reduce((s,r)=>s+itemVolume(r).volume,0).toFixed(2)} <label class="field-label">重量</label><input id="ship-weight-input" class="text-input small" type="number" step="0.01" placeholder="輸入重量"><span id="ship-weight-total" class="pill">總重：請輸入重量</span></div><div class="btn-row"><button class="primary-btn" id="ship-final-btn" type="button">確認扣除</button></div></div>`;
    refreshWeight();
  }catch(e){ previewData=null; p.innerHTML=`<div class="error-card">${esc(e.message||e)}</div>`; }
}
async function loadForCustomer(){
  const cust=($('#customer-name')||{}).value||''; selected=[]; renderSel(); previewData=null;
  if(!cust){ allItems=[]; renderList(); return; }
  try{ const d=await yxApi('/api/customer-items?name='+encodeURIComponent(cust)+'&fast=1'); allItems=(d.items||[]).map(r=>Object.assign({},r,{source:r.source||r.table||''})); renderList(); }
  catch(e){ yxErr(e); }
}
window.clearShipSelectedItems=function(){selected=[]; previewData=null; renderSel(); preview();};
window.reverseLookup=function(){yxToast('請到倉庫圖搜尋商品位置')};
window.confirmSubmit=function(){preview();};
async function finalShip(btn){
  if(loading) return; loading=true; btn.disabled=true;
  try{
    const cust=($('#customer-name')||{}).value||''; if(!cust.trim()) throw new Error('請輸入客戶名稱');
    await serverPreview();
    const result=await yxApi('/api/ship',{method:'POST',body:JSON.stringify({customer_name:cust,items:payloadItems(),allow_inventory_fallback:false,request_key:String(Date.now())})});
    if(result.success===false) throw new Error(result.error||result.message||'出貨失敗');
    yxToast('出貨完成'); selected=[]; renderSel(); previewData=null; const p=$('#ship-preview-panel'); if(p){ p.classList.add('hidden'); p.innerHTML=''; } await loadForCustomer();
  }catch(e){ yxErr(e); }
  finally{ loading=false; btn.disabled=false; }
}
document.addEventListener('click',async e=>{
  const add=e.target.closest('[data-add-ship]');
  if(add){ const r=allItems.find(x=>keyOf(x)===add.dataset.addShip); if(!r) return; if(selected.some(x=>keyOf(x)===keyOf(r))){yxToast('同商品不可重複加入'); return;} selected.push(Object.assign({},r,{ship_expr:rhsOf(r.product_text)})); renderSel(); await preview(); return; }
  const del=e.target.closest('[data-del-sel]'); if(del){ selected.splice(Number(del.dataset.delSel),1); renderSel(); await preview(); return; }
  if(e.target && e.target.id==='ship-final-btn'){ await finalShip(e.target); return; }
  const a=e.target.closest('[data-yx-action]'); if(a){ const k=a.dataset.yxAction; if(k==='ship-clear-selected') window.clearShipSelectedItems(); if(k==='confirm-submit') window.confirmSubmit(); if(k==='reverse-lookup') window.reverseLookup(); }
});
document.addEventListener('input',e=>{
  if(e.target.id==='ship-weight-input') refreshWeight();
  if(e.target.id==='customer-name') loadForCustomer();
  if(e.target.classList.contains('yx-ship-support-input')){ const i=Number(e.target.dataset.i); if(selected[i]) selected[i].ship_expr=e.target.value.trim(); const row=e.target.closest('.yx-ship-selected-one-line'); const t=row&&row.querySelector('.yx-ship-total'); if(t&&selected[i]){ try{ t.textContent=yxQty(selectedProductText(selected[i]))+'件'; }catch(_){} } clearTimeout(window.__shipPreviewTimer); window.__shipPreviewTimer=setTimeout(preview,250); }
});
document.addEventListener('DOMContentLoaded',loadForCustomer); if(document.readyState!=='loading') loadForCustomer();
})();
