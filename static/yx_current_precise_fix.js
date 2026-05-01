
(function(){
'use strict';
if(window.__YX_CURRENT_PRECISE_FIX__) return; window.__YX_CURRENT_PRECISE_FIX__=true;
document.documentElement.dataset.yxCurrentPrecise='locked';
const MATERIALS=['TD','MER','DF','SP','SPF','HF','RDT','尤加利','LVL'];
const $=id=>document.getElementById(id);
const $$=(sel,root=document)=>Array.from(root.querySelectorAll(sel));
const clean=s=>String(s||'').replace(/\s+/g,'').trim();
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const page=()=>document.querySelector('.module-screen')?.dataset.module||'';
function toast(msg){const t=$('clean-toast'); if(t){t.textContent=msg;t.classList.remove('hidden');setTimeout(()=>t.classList.add('hidden'),1600)}else console.log(msg)}
async function api(url,opt={}){const r=await fetch(url,Object.assign({headers:{'Content-Type':'application/json'},cache:'no-store'},opt)); const ct=r.headers.get('content-type')||''; const d=ct.includes('json')?await r.json():await r.text(); if(!r.ok||d.ok===false||d.success===false) throw new Error(d.error||d.message||String(d).slice(0,200)||'操作失敗'); return d;}
function patchMaterialSelects(){
  $$('select').forEach(sel=>{
    const id=sel.id||''; const txt=Array.from(sel.options||[]).map(o=>o.textContent).join('|');
    if(id==='yx-batch-material'||id==='batch-material'||id.includes('material')||/批量增加材質|不指定材質|TD|MER|SPF|RDT|尤加利|LVL|紅木|花梨|黑檀|柚木/.test(txt)){
      const current=sel.value; const first=/不指定/.test(txt)?'不指定材質':'批量增加材質';
      sel.innerHTML=`<option value="">${first}</option>`+MATERIALS.map(m=>`<option value="${m}">${m}</option>`).join('');
      if(MATERIALS.includes(current)) sel.value=current;
    }
  });
}
function sourceByPage(){const p=page(); return p==='orders'?'orders':p==='master_order'?'master_orders':'inventory'}
function rowInfo(tr){return {tr,id:tr.dataset.id||tr.querySelector('.yx-row-check')?.value,source:tr.dataset.source||tr.querySelector('.yx-row-check')?.dataset.source||sourceByPage()}}
function allRows(){return $$('.yx-product-table tbody tr').filter(tr=>tr.querySelector('.yx-row-check') && (tr.dataset.id||tr.querySelector('.yx-row-check')?.value));}
function targetRows(){const checked=allRows().filter(tr=>tr.querySelector('.yx-row-check')?.checked); return (checked.length?checked:allRows()).map(rowInfo).filter(x=>x.id);}
function splitProductFromRow(tr){const size=tr.querySelector('.yx-size,td:nth-child(3)')?.textContent.trim()||''; const expr=tr.querySelector('.yx-qty,td:nth-child(4)')?.textContent.trim()||''; return expr && !size.includes('=') ? `${size}=${expr}` : (size||expr);}
function normalizeMaterialCells(){
  $$('.yx-product-table tbody tr').forEach(tr=>{
    const td=tr.querySelector('.yx-material,td:nth-child(2)'); if(!td||td.querySelector('select'))return;
    let txt=td.textContent.trim(); if(!txt)return; if(/^批量增加材質/.test(txt)){txt=txt.replace(/^批量增加材質/,'').trim();}
    if(!txt) txt='未填材質';
    td.classList.add('yx-material'); td.innerHTML=`<span class="yx-material-tag">${esc(txt)}</span>`;
  });
}
function dedupeBatchButtons(){
  const tools=document.querySelector('.yx-table-tools'); if(!tools)return;
  const editBtns=$$('button',tools).filter(b=>clean(b.textContent)==='批量編輯');
  let edit=editBtns[0]; editBtns.slice(1).forEach(b=>b.remove());
  const del=$('yx-batch-delete')||$$('button',tools).find(b=>clean(b.textContent)==='批量刪除');
  if(!edit){edit=document.createElement('button'); edit.type='button'; edit.textContent='批量編輯';}
  edit.id='yx-current-batch-edit'; edit.className='yx-chip-btn yx-batch-edit-btn';
  if(del && edit.previousElementSibling!==del) del.insertAdjacentElement('afterend',edit); else if(!del) tools.appendChild(edit);
  edit.onclick=(e)=>{e.preventDefault(); e.stopImmediatePropagation(); startBatchEdit();};
  // direct delete selected only, no confirm; if no selected, avoid deleting all by accident
  if(del && !del.dataset.yxCurrentDelete){del.dataset.yxCurrentDelete='1'; del.onclick=async(e)=>{e.preventDefault();e.stopImmediatePropagation(); const rows=allRows().filter(tr=>tr.querySelector('.yx-row-check')?.checked).map(rowInfo).filter(x=>x.id); if(!rows.length){toast('請先勾選要刪除的商品');return;} for(const r of rows){await api(`/api/item/${r.source}/${r.id}`,{method:'DELETE'});} toast('已批量刪除'); refreshCurrent();};}
  const apply=$('yx-apply-material'); if(apply&&!apply.dataset.yxCurrentApply){apply.dataset.yxCurrentApply='1'; apply.onclick=async(e)=>{e.preventDefault();e.stopImmediatePropagation(); const mat=($('yx-batch-material')||$('batch-material'))?.value||''; if(!mat){toast('請先選擇材質');return;} const rows=targetRows(); for(const r of rows){await api(`/api/item/${r.source}/${r.id}`,{method:'POST',body:JSON.stringify({material:mat})});} toast('已套用材質'); refreshCurrent();};}
}
function startBatchEdit(){
  const rows=targetRows(); if(!rows.length){toast('目前沒有商品可編輯');return;}
  rows.forEach(({tr})=>{
    if(tr.classList.contains('yx-editing'))return; tr.classList.add('yx-editing');
    const matCell=tr.querySelector('.yx-material,td:nth-child(2)'); const sizeCell=tr.querySelector('.yx-size,td:nth-child(3)'); const exprCell=tr.querySelector('.yx-qty,td:nth-child(4)'); const qtyCell=tr.querySelector('td:nth-child(5)'); const zoneCell=tr.querySelector('td:nth-child(6)');
    const mat=(matCell?.textContent||'').trim().replace(/^批量增加材質/,'')||'';
    if(matCell) matCell.innerHTML=`<select class="yx-inline-select yx-edit-material"><option value="">未填材質</option>${MATERIALS.map(m=>`<option ${m===mat?'selected':''}>${m}</option>`).join('')}</select>`;
    if(sizeCell) sizeCell.innerHTML=`<input class="yx-inline-input yx-edit-size" value="${esc(sizeCell.textContent.trim())}">`;
    if(exprCell) exprCell.innerHTML=`<input class="yx-inline-input yx-edit-expr" value="${esc(exprCell.textContent.trim())}">`;
    if(qtyCell) qtyCell.innerHTML=`<input class="yx-inline-input yx-edit-total" type="number" min="0" value="${esc(qtyCell.textContent.trim())}">`;
    const z=(zoneCell?.textContent||'').trim().replace('區','');
    if(zoneCell) zoneCell.innerHTML=`<select class="yx-inline-select yx-edit-zone"><option value="A" ${z==='A'?'selected':''}>A</option><option value="B" ${z==='B'?'selected':''}>B</option></select>`;
  });
  ensureSaveButton();
}
function ensureSaveButton(){
  const tools=document.querySelector('.yx-table-tools'); if(!tools)return;
  let b=$('yx-current-save-batch-edit'); if(!b){b=document.createElement('button'); b.type='button'; b.id='yx-current-save-batch-edit'; b.textContent='儲存批量編輯'; b.className='yx-chip-btn yx-save-batch-edit'; const edit=$('yx-current-batch-edit'); (edit||tools.lastElementChild).insertAdjacentElement('afterend',b);} b.onclick=saveBatchEdit;
}
async function saveBatchEdit(){
  const rows=$$('.yx-product-table tbody tr.yx-editing').map(rowInfo).filter(x=>x.id); if(!rows.length){toast('沒有正在編輯的商品');return;}
  for(const r of rows){const tr=r.tr; const size=tr.querySelector('.yx-edit-size')?.value.trim()||''; const expr=tr.querySelector('.yx-edit-expr')?.value.trim()||''; const product=expr && !size.includes('=') ? `${size}=${expr}` : size; const payload={material:tr.querySelector('.yx-edit-material')?.value||'', product, product_text:product, qty:Number(tr.querySelector('.yx-edit-total')?.value||0), quantity:Number(tr.querySelector('.yx-edit-total')?.value||0), location:tr.querySelector('.yx-edit-zone')?.value||'', zone:tr.querySelector('.yx-edit-zone')?.value||''}; await api(`/api/item/${r.source}/${r.id}`,{method:'POST',body:JSON.stringify(payload)});}
  toast('已儲存批量編輯'); refreshCurrent();
}
function refreshCurrent(){ if(typeof window.reloadCurrentCustomerOrTable==='function') return window.reloadCurrentCustomerOrTable(); setTimeout(()=>location.reload(),250); }
function patchRowSelection(){
  $$('.yx-product-table tbody tr').forEach(tr=>{if(tr.dataset.yxCurrentRowClick)return; tr.dataset.yxCurrentRowClick='1'; tr.addEventListener('click',e=>{if(e.target.closest('input,select,button,a'))return; const cb=tr.querySelector('.yx-row-check'); if(cb){cb.checked=!cb.checked; tr.classList.toggle('is-selected',cb.checked);}},true);});
}
async function getUnplaced(){try{const d=await api('/api/today-summary?current=1&ts='+Date.now()); const s=d.unplaced_summary||d.summary||{}; const A=Number(s.A||0),B=Number(s.B||0),T=Number(d.unplaced_total||d.total||A+B)||A+B; return {A,B,T};}catch(e){return {A:0,B:0,T:0,error:e.message};}}
function unplacedHTML(x){return `<span>A區 <span class="count">${x.A}件</span></span><span class="sep">｜</span><span>B區 <span class="count">${x.B}件</span></span><span class="sep">｜</span><span>總計 <span class="count">${x.T}件</span></span>`;}
async function renderUnplaced(manual=false){const x=await getUnplaced(); const html=unplacedHTML(x); if(page()==='today'){['today-inbound-list','today-outbound-list','today-order-list'].forEach(id=>{const el=$(id); if(el)el.innerHTML='<span class="muted">無</span>';}); const el=$('today-unplaced-list'); if(el)el.innerHTML=`<div class="yx-current-unplaced-line">${html}</div>`; const badge=$('today-unread-badge'); if(badge)badge.textContent='0';}
  if(page()==='warehouse'){let pill=$('warehouse-unplaced-pill')||$$('.warehouse-meta-bar .pill.warn,.warehouse-toolbar-panel .pill.warn').find(p=>/未入|未錄|A區|B區/.test(p.textContent)); if(pill){pill.id='warehouse-unplaced-pill'; pill.className='pill warn interactive-pill yx-current-unplaced-line'; pill.innerHTML=html; pill.onclick=null;} $$('.warehouse-meta-bar .pill.warn,.warehouse-toolbar-panel .pill.warn,#yx22-unplaced-summary').forEach(p=>{if(p!==pill)p.classList.add('yx-hide-duplicate-unplaced')}); bindLongPress(pill);} if(manual)toast('已更新未入倉件數');}
function bindLongPress(el){if(!el||el.dataset.yxCurrentLong)return; el.dataset.yxCurrentLong='1'; let timer=null; const start=()=>{timer=setTimeout(()=>renderUnplaced(true),650)}; const stop=()=>clearTimeout(timer); el.addEventListener('mousedown',start); el.addEventListener('touchstart',start,{passive:true}); ['mouseup','mouseleave','touchend','touchcancel'].forEach(ev=>el.addEventListener(ev,stop));}

function customerNameFromCard(card){return (card.querySelector('.yx-cust-main,.cust-name,.customer-name')?.textContent||card.textContent||'').replace(/\s*(FOB代付|FOB代|FOB|CNF)\s*/g,' ').replace(/\d+件.*$/,'').trim();}
function moduleForRegion(){const p=page(); return p==='master_order'?'master_orders':p;}
async function moveCustomerRegion(card, region){const name=customerNameFromCard(card); if(!name)return; await api('/api/customer-action/move',{method:'POST',body:JSON.stringify({module:moduleForRegion(),name,region})}); const targetId=region==='中區'?'region-center':region==='南區'?'region-south':'region-north'; const target=$(targetId); if(target){const empty=target.querySelector('.muted'); if(empty) empty.remove(); target.prepend(card);} toast('已移到'+region);}
function bindCustomerLongPress(){ if(!['orders','master_order','ship'].includes(page()))return; $$('#region-picker-section .customer-list .customer-chip,#region-picker-section .customer-list .customer-card,#region-picker-section .customer-list .yx-customer-chip-final,#region-picker-section .customer-list .yx-direct-region-card').forEach(card=>{ if(card.dataset.yxCurrentLongPress)return; card.dataset.yxCurrentLongPress='1'; let tm=null, moved=false; const open=(ev)=>{ev&&ev.preventDefault(); const name=customerNameFromCard(card); const act=prompt(`${name}\n輸入：北 / 中 / 南 / 刪除`, ''); if(act===null)return; const v=act.trim(); if(/^北/.test(v)) return moveCustomerRegion(card,'北區'); if(/^中/.test(v)) return moveCustomerRegion(card,'中區'); if(/^南/.test(v)) return moveCustomerRegion(card,'南區'); if(v.includes('刪')) return api('/api/customer-action/delete',{method:'POST',body:JSON.stringify({module:moduleForRegion(),name})}).then(()=>{card.remove();toast('已刪除')}).catch(e=>toast(e.message));}; const start=()=>{moved=false; tm=setTimeout(open,650)}; const stop=()=>clearTimeout(tm); card.addEventListener('contextmenu',open); card.addEventListener('mousedown',start); card.addEventListener('touchstart',start,{passive:true}); ['mouseup','mouseleave','touchend','touchcancel'].forEach(ev=>card.addEventListener(ev,stop)); card.addEventListener('mousemove',()=>{moved=true; stop();}); });}

function boot(){patchMaterialSelects(); dedupeBatchButtons(); normalizeMaterialCells(); patchRowSelection(); bindCustomerLongPress(); if(page()==='today') renderUnplaced(false); if(page()==='warehouse') renderUnplaced(false);}
const mo=new MutationObserver(()=>{clearTimeout(window.__yxCurrentPreciseTimer); window.__yxCurrentPreciseTimer=setTimeout(boot,100);});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{boot(); mo.observe(document.body,{childList:true,subtree:true});}); else {boot(); mo.observe(document.body,{childList:true,subtree:true});}
})();
