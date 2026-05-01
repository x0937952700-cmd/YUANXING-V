/* PACK30: requested cleanup from pack29: A/B only unplaced, batch edit all-or-selected, single region UI. */
(function(){
'use strict';
if(window.__YX_PACK30_REQUESTED_CLEANUP__) return; window.__YX_PACK30_REQUESTED_CLEANUP__=true;
const $=id=>document.getElementById(id);
const $$=(sel,root=document)=>Array.from(root.querySelectorAll(sel));
const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const page=()=>document.querySelector('.module-screen')?.dataset?.module || (/today_changes/.test(location.pathname)?'today':'');
const MATERIALS=['TD','MER','DF','SP','SPF','HF','RDT','尤加利','LVL'];
async function api(url,opt={}){const r=await fetch(url,{credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json',...(opt.headers||{})},...opt});const t=await r.text();let d={};try{d=t?JSON.parse(t):{};}catch(e){d={ok:false,error:t};}if(!r.ok||d.ok===false||d.success===false)throw new Error(d.error||d.message||t||('HTTP '+r.status));return d;}
function toast(m){let t=$('clean-toast'); if(t){t.textContent=m||'完成';t.classList.remove('hidden');clearTimeout(window.__yx30Toast);window.__yx30Toast=setTimeout(()=>t.classList.add('hidden'),1600);}else console.log(m)}
function sourceByPage(){const p=page();return p==='inventory'?'inventory':p==='orders'?'orders':'master_orders'}
function rowSource(tr){let s=tr.dataset.source||tr.querySelector('input[type="checkbox"]')?.dataset.source||sourceByPage(); if(s==='master_order')s='master_orders'; return s;}
function rowId(tr){return Number(tr.dataset.id||tr.querySelector('input[type="checkbox"]')?.value||tr.querySelector('[data-id]')?.dataset.id||0)}
function allRows(){return $$('.yx-product-table tbody tr').filter(tr=>rowId(tr)>0 && tr.offsetParent!==null)}
function selectedRows(){let rows=allRows().filter(tr=>tr.querySelector('.yx-row-check:checked,input[type="checkbox"]:checked'));return rows.map(tr=>({tr,id:rowId(tr),source:rowSource(tr)}));}
function targetRowsAllOrSelected(){let rows=selectedRows(); if(!rows.length) rows=allRows().map(tr=>({tr,id:rowId(tr),source:rowSource(tr)})); return rows.filter(x=>x.id>0)}
function refreshData(){try{if(typeof window.refreshPageData==='function') return window.refreshPageData();}catch(e){} if(typeof window.__yxSelectedCustomer==='string'&&window.__yxSelectedCustomer&&typeof window.selectCustomer==='function'&&['orders','master_order','ship'].includes(page())){try{return window.selectCustomer(window.__yxSelectedCustomer)}catch(e){}} location.reload();}
function patchMaterialOptions(){
  $$('select').forEach(sel=>{const txt=Array.from(sel.options||[]).map(o=>o.textContent).join('|'); const id=sel.id||''; if(id==='yx-batch-material'||id==='batch-material'||id.includes('material')||/批量增加材質|TD|MER|SPF|RDT|尤加利|LVL/.test(txt)){const current=sel.value; const first=/不指定/.test(txt)?'不指定材質':'批量增加材質'; sel.innerHTML=`<option value="">${first}</option>`+MATERIALS.map(m=>`<option value="${m}">${m}</option>`).join(''); if(MATERIALS.includes(current)) sel.value=current;}});
}
function centerMaterialTags(){
  $$('.yx-product-table tbody tr').forEach(tr=>{const td=tr.children[1]; if(!td) return; if(td.querySelector('select,input')) return; let val=clean(td.textContent); if(!val) return; val=val.replace(/^批量增加材質/i,'').trim()||val; td.innerHTML=`<span class="yx30-mat-pill">${esc(val)}</span>`;});
}
function bindRowSelection(){
  const table=document.querySelector('.yx-product-table'); if(!table||table.dataset.yx30Select) return; table.dataset.yx30Select='1';
  table.addEventListener('click',ev=>{if(ev.target.closest('button,a,input,select,textarea,[contenteditable]')) return; const tr=ev.target.closest('tbody tr'); if(!tr) return; const cb=tr.querySelector('.yx-row-check,input[type="checkbox"]'); if(cb){cb.checked=!cb.checked; tr.classList.toggle('yx30-selected',cb.checked);}},true);
  table.addEventListener('change',ev=>{const cb=ev.target.closest('.yx-row-check,input[type="checkbox"]'); if(cb) cb.closest('tr')?.classList.toggle('yx30-selected',cb.checked);},true);
}
function materialSelect(v){return `<select class="yx30-edit-input" data-f="material">${MATERIALS.map(m=>`<option value="${m}" ${clean(v)===m?'selected':''}>${m}</option>`).join('')}</select>`}
function zoneSelect(v){let z=clean(v); if(/^A/.test(z)||z.includes('A'))z='A'; else if(/^B/.test(z)||z.includes('B'))z='B'; else z=''; return `<select class="yx30-edit-input" data-f="zone"><option value="" ${!z?'selected':''}>未入倉</option><option value="A" ${z==='A'?'selected':''}>A</option><option value="B" ${z==='B'?'selected':''}>B</option></select>`}
function startBatchEdit(){
  if(!['inventory','orders','master_order'].includes(page())) return;
  const rows=targetRowsAllOrSelected(); if(!rows.length){toast('目前沒有商品可編輯');return;}
  rows.forEach(({tr})=>{if(tr.dataset.yx30Editing) return; tr.dataset.yx30Editing='1'; tr.classList.add('yx30-editing-row'); const tds=tr.children; if(tds.length<6) return; const mat=clean(tds[1].textContent); const size=clean(tds[2].textContent); const expr=clean(tds[3].textContent).replace(/件$/,''); const qty=clean(tds[4].textContent).replace(/[^0-9]/g,''); const zone=clean(tds[5].textContent); tds[1].innerHTML=materialSelect(mat); tds[2].innerHTML=`<input class="yx30-edit-input" data-f="size" value="${esc(size)}">`; tds[3].innerHTML=`<input class="yx30-edit-input" data-f="expr" value="${esc(expr)}">`; tds[4].innerHTML=`<input class="yx30-edit-input" data-f="qty" type="number" min="0" value="${esc(qty)}">`; tds[5].innerHTML=zoneSelect(zone);});
  ensureSaveEdit(); toast(selectedRows().length?'已編輯勾選商品':'未勾選，已編輯全部商品');
}
function ensureSaveEdit(){const tools=document.querySelector('.yx-table-tools'); if(!tools) return; let b=$('yx30-save-batch-edit'); if(!b){b=document.createElement('button'); b.id='yx30-save-batch-edit'; b.type='button'; b.textContent='儲存批量編輯'; b.className='yx-chip-btn yx22-unified-btn yx30-save-edit'; tools.appendChild(b);} b.onclick=saveBatchEdit; b.style.display='inline-flex';}
async function saveBatchEdit(){const rows=$$('.yx30-editing-row').map(tr=>({tr,id:rowId(tr),source:rowSource(tr)})).filter(x=>x.id>0); if(!rows.length)return toast('沒有正在編輯的商品'); try{for(const {tr,id,source} of rows){const get=f=>tr.querySelector(`[data-f="${f}"]`)?.value||''; const size=get('size'), expr=get('expr'); const product=expr?`${size}=${expr}`:size; await api(`/api/item/${source}/${id}`,{method:'POST',body:JSON.stringify({material:get('material'),product,qty:get('qty'),location:get('zone'),zone:get('zone')})});} toast('已儲存批量編輯'); refreshData();}catch(e){toast(e.message||'批量編輯失敗');}}
async function directDelete(){const rows=selectedRows(); if(!rows.length) return toast('請先勾選要刪除的商品'); try{for(const {tr,id,source} of rows){await api(`/api/item/${source}/${id}`,{method:'DELETE'}); tr.remove();} toast('已批量刪除');}catch(e){toast(e.message||'刪除失敗');}}
async function applyMaterial(){const sel=$('yx-batch-material')||$('batch-material')||$$('select').find(s=>/批量增加材質|TD|MER|RDT/.test(Array.from(s.options||[]).map(o=>o.textContent).join('|'))); const mat=sel?.value||''; if(!mat)return toast('請選擇材質'); const rows=targetRowsAllOrSelected(); if(!rows.length)return toast('目前沒有商品'); try{for(const {id,source} of rows){await api(`/api/item/${source}/${id}`,{method:'POST',body:JSON.stringify({material:mat})});} toast('已套用材質'); refreshData();}catch(e){toast(e.message||'套用失敗');}}
function patchToolbar(){
  if(!['inventory','orders','master_order'].includes(page())) return; const tools=document.querySelector('.yx-table-tools'); if(!tools) return; tools.classList.add('yx30-tools-row');
  // dedupe batch edit buttons, keep one after delete
  const edits=$$('button',tools).filter(b=>clean(b.textContent)==='批量編輯'); let edit=edits[0]; edits.slice(1).forEach(b=>b.remove()); if(!edit){edit=document.createElement('button'); edit.textContent='批量編輯'; edit.type='button'; edit.id='yx30-batch-edit'; edit.className='yx-chip-btn yx22-unified-btn';}
  const del=$('yx-batch-delete')||$$('button',tools).find(b=>clean(b.textContent)==='批量刪除'); if(del) del.insertAdjacentElement('afterend',edit); else tools.appendChild(edit);
  edit.className='yx-chip-btn yx22-unified-btn yx30-batch-edit'; edit.onclick=(e)=>{e.preventDefault();e.stopImmediatePropagation();startBatchEdit();};
  if(del){const d=del.cloneNode(true); d.className='yx-chip-btn yx22-unified-btn'; d.onclick=(e)=>{e.preventDefault();e.stopImmediatePropagation();directDelete();}; del.replaceWith(d); d.insertAdjacentElement('afterend',edit);}
  const apply=$('yx-apply-material')||$$('button',tools).find(b=>clean(b.textContent)==='套用材質'); if(apply){const a=apply.cloneNode(true); a.className='yx-chip-btn yx22-unified-btn'; a.onclick=(e)=>{e.preventDefault();e.stopImmediatePropagation();applyMaterial();}; apply.replaceWith(a);} 
  patchMaterialOptions();
}
function hideDuplicateRegionBoards(){
  if(!['orders','master_order','ship'].includes(page())) return; const keep=$('region-picker-section'); if(!keep) return;
  $$('.category-grid,.customer-board').forEach(el=>{if(keep.contains(el)) return; if($('customers-section')&&$('customers-section').contains(el)) return; el.classList.add('yx30-hidden');});
  $$('#region-picker-section .customer-chip,#region-picker-section .yx-customer-chip-final').forEach(el=>el.classList.add('yx-customer-chip-final'));
}
function canonicalName(el){let n=clean(el.dataset.customerName||el.dataset.customer||''); if(n)return n; const c=el.cloneNode(true); c.querySelectorAll('.yx-cust-count,.yx-term-label,.pill,.muted').forEach(x=>x.remove()); return clean(c.textContent).replace(/\d+\s*件\s*\/\s*\d+\s*筆/g,'').trim();}
function host(region){return $({'北區':'region-north','中區':'region-center','南區':'region-south'}[region]||'region-north')}
function moveCardNow(name,region){const h=host(region); if(!h)return; const cards=$$('#region-north .customer-chip,#region-center .customer-chip,#region-south .customer-chip'); const card=cards.find(c=>canonicalName(c)===name||canonicalName(c).replace(/\s/g,'')===name.replace(/\s/g,'')); if(card){h.querySelectorAll('.muted').forEach(x=>x.remove()); h.prepend(card); ['region-north','region-center','region-south'].forEach(id=>{const box=$(id); if(box&&!box.querySelector('.customer-chip,.yx-customer-chip-final')) box.innerHTML='<span class="muted">無</span>';});}}
function patchRegionMove(){if(document.documentElement.dataset.yx30Move)return;document.documentElement.dataset.yx30Move='1';document.addEventListener('click',e=>{const b=e.target.closest('.yx18-menu button[data-act="move"]'); if(!b)return; const menu=b.closest('.yx18-menu'); const name=clean(menu?.querySelector('.yx18-title')?.textContent||''); const region=b.dataset.region; setTimeout(()=>moveCardNow(name,region),50); setTimeout(()=>moveCardNow(name,region),500);},true);}
async function getUnplacedSummary(){const d=await api('/api/today-summary?pack30=1&ts='+Date.now()); const s=d.unplaced_summary||d.summary||{}; const A=Number(s.A||0), B=Number(s.B||0); return {A,B,T:A+B};}
function unplacedHTML({A,B,T}){return `<span>A區 <span class="count">${A}件</span></span><span class="sep">｜</span><span>B區 <span class="count">${B}件</span></span><span class="sep">｜</span><span>總計 <span class="count">${T}件</span></span>`}
async function renderToday(){if(page()!=='today')return; try{const s=await getUnplacedSummary(); ['today-inbound-list','today-outbound-list','today-order-list'].forEach(id=>{const el=$(id); if(el)el.innerHTML='<span class="muted">無</span>';}); const el=$('today-unplaced-list'); if(el)el.innerHTML=`<div class="yx30-unplaced-line">${unplacedHTML(s)}</div>`; const sum=$('today-summary-cards'); if(sum)sum.innerHTML=`<div class="yx30-unplaced-line">${unplacedHTML(s)}</div>`; const badge=$('today-unread-badge'); if(badge)badge.textContent='0';}catch(e){const el=$('today-unplaced-list')||$('today-summary-cards'); if(el)el.innerHTML=`<div class="error-card">${esc(e.message)}</div>`;}}
async function renderWarehouseUnplaced(manual=false){if(page()!=='warehouse')return; try{const s=await getUnplacedSummary(); const pill=$('warehouse-unplaced-pill'); if(pill){pill.className='pill warn interactive-pill yx30-unplaced-line'; pill.innerHTML=unplacedHTML(s); pill.onclick=null;} const dup=$('yx22-unplaced-summary'); if(dup)dup.remove(); $$('.warehouse-meta-bar .pill.warn, .warehouse-toolbar-panel .pill.warn').forEach((x,i)=>{if(x!==pill)x.classList.add('yx30-hidden')});}catch(e){if(manual)toast(e.message||'未入倉更新失敗');}}
function bindLongPressRefresh(){const bind=el=>{if(!el||el.dataset.yx30Long)return;el.dataset.yx30Long='1';let tm=null;const start=()=>{tm=setTimeout(()=>{renderWarehouseUnplaced(true);toast('已更新未入倉件數');},650)};const stop=()=>{clearTimeout(tm)};el.addEventListener('mousedown',start);el.addEventListener('touchstart',start,{passive:true});['mouseup','mouseleave','touchend','touchcancel'].forEach(ev=>el.addEventListener(ev,stop));};bind($('warehouse-unplaced-pill'));}
function cleanCustomerItemDropdown(){ if(page()!=='ship') return; const sel=$('ship-customer-item-select'); if(!sel)return; $$('option',sel).forEach(o=>{let txt=clean(o.textContent); if(!txt||txt.includes('請'))return; // Ensure product detail format: 尺寸｜支數件數｜件數｜材質
    txt=txt.replace(/\s*\|\s*/g,'｜'); o.textContent=txt;}); }
function boot(){patchMaterialOptions(); bindRowSelection(); patchToolbar(); centerMaterialTags(); hideDuplicateRegionBoards(); patchRegionMove(); cleanCustomerItemDropdown(); renderWarehouseUnplaced(false); bindLongPressRefresh(); if(page()==='today') renderToday();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,120),{once:true});else setTimeout(boot,120);
let moTimer=null;new MutationObserver(()=>{clearTimeout(moTimer);moTimer=setTimeout(boot,220)}).observe(document.documentElement,{childList:true,subtree:true});
window.yx30RefreshUnplaced=()=>{renderToday();renderWarehouseUnplaced(true)};
})();
