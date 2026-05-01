/* PACK27: targeted fixes only: batch selection/edit/delete + single region board + customer item labels. */
(function(){
'use strict';
if(window.__YX_PACK27_BATCH_REGION_FIX__) return;
window.__YX_PACK27_BATCH_REGION_FIX__=true;
const $=id=>document.getElementById(id);
const $$=(sel,root=document)=>Array.from(root.querySelectorAll(sel));
const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const page=()=>document.querySelector('.module-screen')?.dataset?.module||'';
const MATERIALS=['TD','MER','DF','SP','SPF','HF','RDT','尤加利','LVL','未填材質'];
const selected=new Set();
function keyOf(src,id){return `${src||''}:${id||''}`}
async function api(url,opt={}){const r=await fetch(url,{credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json',...(opt.headers||{})},...opt});const txt=await r.text();let d={};try{d=txt?JSON.parse(txt):{};}catch(e){d={ok:false,error:txt};}if(!r.ok||d.ok===false||d.success===false) throw new Error(d.error||d.message||txt||('HTTP '+r.status));return d;}
function toast(msg){let t=$('clean-toast'); if(t){t.textContent=msg||'完成';t.classList.remove('hidden');clearTimeout(window.__yx27toast);window.__yx27toast=setTimeout(()=>t.classList.add('hidden'),1700)}else console.log(msg)}
function rowInfoFromTr(tr){const cb=tr?.querySelector('.yx-row-check'); return {tr, id:cb?.value||tr?.dataset.id||'', source:cb?.dataset.source||tr?.dataset.source||sourceByPage()};}
function sourceByPage(){const m=page(); return m==='orders'?'orders':m==='master_order'?'master_orders':'inventory';}
function selectedRows(){return $$('#yx-table-body tr').map(rowInfoFromTr).filter(x=>x.id && selected.has(keyOf(x.source,x.id)));}
function checkedRows(){return $$('.yx-row-check:checked').map(cb=>({id:cb.value,source:cb.dataset.source||sourceByPage(),tr:cb.closest('tr')}));}
function syncSelectedFromChecks(){ $$('.yx-row-check').forEach(cb=>{const k=keyOf(cb.dataset.source||sourceByPage(),cb.value); if(cb.checked) selected.add(k); else selected.delete(k);}); }
function applySelection(){ $$('.yx-row-check').forEach(cb=>{const k=keyOf(cb.dataset.source||sourceByPage(),cb.value); cb.checked=selected.has(k); cb.closest('tr')?.classList.toggle('yx27-row-selected',cb.checked);}); updateSelectCount(); }
function updateSelectCount(){const n=$$('.yx-row-check:checked').length; document.documentElement.style.setProperty('--yx-selected-count', `'${n}'`);}
function bindRowSelection(){
  const body=$('yx-table-body'); if(!body || body.dataset.yx27SelectBound) return; body.dataset.yx27SelectBound='1';
  body.addEventListener('change',e=>{const cb=e.target.closest('.yx-row-check'); if(!cb) return; const k=keyOf(cb.dataset.source||sourceByPage(),cb.value); if(cb.checked) selected.add(k); else selected.delete(k); cb.closest('tr')?.classList.toggle('yx27-row-selected',cb.checked); updateSelectCount();},true);
  body.addEventListener('click',e=>{ if(e.target.closest('button,select,input,textarea,a,[contenteditable="true"]')) return; const tr=e.target.closest('tr'); if(!tr || !tr.querySelector('.yx-row-check')) return; const cb=tr.querySelector('.yx-row-check'); cb.checked=!cb.checked; cb.dispatchEvent(new Event('change',{bubbles:true})); },false);
}
function patchSelectAll(){const btn=$('yx-select-all') || $$('button').find(b=>clean(b.textContent)==='全選目前清單'); if(!btn || btn.dataset.yx27All) return; btn.dataset.yx27All='1'; btn.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation(); const checks=$$('.yx-row-check'); const all=checks.length && checks.every(c=>c.checked); checks.forEach(c=>{c.checked=!all; const k=keyOf(c.dataset.source||sourceByPage(),c.value); if(c.checked) selected.add(k); else selected.delete(k); c.closest('tr')?.classList.toggle('yx27-row-selected',c.checked);}); updateSelectCount();},true);}
function dedupeBatchEdit(){
  if(!['inventory','orders','master_order'].includes(page())) return;
  const tools=document.querySelector('.yx-table-tools'); if(!tools) return;
  const edits=$$('button',tools).filter(b=>clean(b.textContent)==='批量編輯');
  let keep=edits[0]; edits.slice(1).forEach(b=>b.remove());
  if(!keep){ keep=document.createElement('button'); keep.type='button'; keep.textContent='批量編輯'; keep.id='yx27-batch-edit'; keep.className='yx-chip-btn yx22-unified-btn yx27-batch-edit'; }
  keep.classList.add('yx-chip-btn','yx22-unified-btn','yx27-batch-edit');
  const del=$('yx-batch-delete') || $$('button',tools).find(b=>clean(b.textContent)==='批量刪除');
  if(del && keep.previousElementSibling!==del) del.insertAdjacentElement('afterend',keep);
}
function matSelect(value){return `<select class="yx27-edit-material">${MATERIALS.map(m=>`<option value="${esc(m)}" ${clean(value)===m?'selected':''}>${esc(m)}</option>`).join('')}</select>`}
function zoneSelect(value){let v=clean(value); if(v.includes('A'))v='A'; else if(v.includes('B'))v='B'; else v='未入倉'; return `<select class="yx27-edit-zone"><option value="未入倉" ${v==='未入倉'?'selected':''}>未入倉</option><option value="A" ${v==='A'?'selected':''}>A</option><option value="B" ${v==='B'?'selected':''}>B</option></select>`}
function splitProduct(size,expr){size=clean(size); expr=clean(expr).replace(/件$/,''); return expr?`${size}=${expr}`:size;}
function startBatchEdit(){
  let rows=selectedRows(); if(!rows.length) rows=checkedRows(); if(!rows.length){toast('請先勾選要批量編輯的商品'); return;}
  rows.forEach(({tr})=>{
    if(!tr || tr.dataset.yx27Editing) return; tr.dataset.yx27Editing='1'; tr.classList.add('yx27-editing-row');
    const tds=tr.children; if(tds.length<6) return;
    const mat=clean(tds[1].textContent), size=clean(tds[2].textContent), pieces=clean(tds[3].textContent), qty=clean(tds[4].textContent), zone=clean(tds[5].textContent);
    tds[1].innerHTML=matSelect(mat);
    tds[2].innerHTML=`<input class="yx27-edit-size" value="${esc(size)}">`;
    tds[3].innerHTML=`<input class="yx27-edit-pieces" value="${esc(pieces)}">`;
    tds[4].innerHTML=`<input class="yx27-edit-qty" type="number" min="0" value="${esc(qty)}">`;
    tds[5].innerHTML=zoneSelect(zone);
  });
  ensureSaveButton();
  toast('已開啟批量編輯，修改完成請按「儲存批量編輯」');
}
function ensureSaveButton(){const tools=document.querySelector('.yx-table-tools'); if(!tools) return; let b=$('yx27-save-batch-edit'); if(!b){b=document.createElement('button'); b.id='yx27-save-batch-edit'; b.type='button'; b.textContent='儲存批量編輯'; b.className='yx-chip-btn yx22-unified-btn yx27-save-edit'; tools.appendChild(b);} b.onclick=saveBatchEdit; b.style.display='inline-flex';}
async function saveBatchEdit(){
  const rows=$$('.yx27-editing-row').map(rowInfoFromTr); if(!rows.length){toast('沒有正在編輯的資料'); return;}
  const btn=$('yx27-save-batch-edit'); if(btn) btn.disabled=true;
  try{
    for(const {tr,id,source} of rows){const tds=tr.children; const material=tds[1].querySelector('select')?.value||''; const size=tds[2].querySelector('input')?.value||''; const pieces=tds[3].querySelector('input')?.value||''; const qty=Number(tds[4].querySelector('input')?.value||0); const zone=tds[5].querySelector('select')?.value||''; const product=splitProduct(size,pieces); await api(`/api/item/${source}/${id}`,{method:'POST',body:JSON.stringify({material,product,qty,location:zone,zone})});}
    toast('批量編輯已儲存'); selected.clear(); setTimeout(()=>location.reload(),250);
  }catch(e){toast(e.message||'批量編輯失敗'); if(btn) btn.disabled=false;}
}
async function directBatchDelete(){let rows=selectedRows(); if(!rows.length) rows=checkedRows(); if(!rows.length){toast('請先勾選要刪除的商品'); return;} try{for(const r of rows){await api(`/api/item/${r.source}/${r.id}`,{method:'DELETE'}); r.tr?.remove(); selected.delete(keyOf(r.source,r.id));} toast('已批量刪除'); updateSelectCount();}catch(e){toast(e.message||'批量刪除失敗');}}
function interceptToolbarClicks(){ if(document.documentElement.dataset.yx27ToolbarCapture) return; document.documentElement.dataset.yx27ToolbarCapture='1'; document.addEventListener('click',e=>{const b=e.target.closest('button'); if(!b) return; const txt=clean(b.textContent); if(txt==='批量刪除'){e.preventDefault();e.stopImmediatePropagation(); directBatchDelete();} if(txt==='批量編輯'){e.preventDefault();e.stopImmediatePropagation(); startBatchEdit();}},true);}
function canonicalCustomerName(el){let t=clean(el.dataset.customerName||el.dataset.customer||''); if(t) return t; const clone=el.cloneNode(true); clone.querySelectorAll('.yx-cust-count,.yx-term-label,.cust-term,.pill,.muted,.count').forEach(x=>x.remove()); t=clean(clone.textContent).replace(/\d+\s*件\s*\/\s*\d+\s*筆/g,'').replace(/\b(FOB代付|FOB代|FOB|CNF)\b/g,'').trim(); return t;}
function customerButton(c){const name=c.name||''; const display=c.display_name||name.replace(/\b(FOB代付|FOB代|FOB|CNF)\b/g,'').trim()||name; const terms=(c.terms||[]).map(t=>`<span class="yx-term-label">${esc(t)}</span>`).join(''); return `<button class="chip customer-chip yx-customer-chip-final yx27-customer-card" data-customer-name="${esc(name)}" onclick="selectCustomer('${String(name).replace(/\\/g,'\\\\').replace(/'/g,"\\'")}')"><span class="yx-cust-main">${esc(display)}</span>${terms}<span class="yx-cust-count">${Number(c.qty||0)}件 / ${Number(c.count||0)}筆</span></button>`;}
async function renderOnlyOneRegionBoard(){
  if(!['orders','master_order','ship'].includes(page())) return;
  const keep=$('region-picker-section'); if(!keep) return;
  $$('.category-grid').forEach(g=>{ if(!keep.contains(g)) g.classList.add('yx27-hide-board'); });
  $$('.customer-board').forEach(g=>{ if(!keep.contains(g) && !$('customers-section')?.contains(g)) g.classList.add('yx27-hide-board'); });
  try{const d=await api('/api/regions/'+page()+'?ts='+Date.now()); const map={'北區':'region-north','中區':'region-center','南區':'region-south'}; Object.entries(map).forEach(([region,id])=>{const el=$(id); if(!el) return; const arr=(d.details&&d.details[region])||[]; el.innerHTML=arr.length?arr.map(customerButton).join(''):'<span class="muted">無</span>';}); if(typeof window.yx18BindCustomerLongPress==='function') setTimeout(()=>window.yx18BindCustomerLongPress(),60);}catch(e){console.warn('pack27 regions',e)}
}
function bindRegionMoveRefresh(){ if(document.documentElement.dataset.yx27MoveRefresh) return; document.documentElement.dataset.yx27MoveRefresh='1'; document.addEventListener('click',e=>{const b=e.target.closest('.yx18-menu button[data-act="move"]'); if(!b) return; const menu=b.closest('.yx18-menu'); const name=clean(menu?.querySelector('.yx18-title')?.textContent||''); const region=b.dataset.region; setTimeout(async()=>{ await renderOnlyOneRegionBoard(); const host=$({'北區':'region-north','中區':'region-center','南區':'region-south'}[region]); const card=$$('#region-north .customer-chip,#region-center .customer-chip,#region-south .customer-chip').find(x=>canonicalCustomerName(x)===name); if(host&&card){host.querySelectorAll('.muted').forEach(x=>x.remove());host.prepend(card);} },300); setTimeout(renderOnlyOneRegionBoard,900);},true);}
function cleanCustomerItemDropdown(){ if(page()!=='ship') return; const sel=$('ship-customer-item-select'); const cust=$('customer-name'); if(!sel||!cust||sel.dataset.yx27ItemClean) return; sel.dataset.yx27ItemClean='1'; async function reload(){const name=clean(cust.value); if(!name) return; try{const d=await api('/api/customer-items?module=ship&customer='+encodeURIComponent(name)+'&ts='+Date.now()); const items=d.items||[]; sel.innerHTML='<option value="">請選擇商品（尺寸｜支數｜件數｜材質）</option>'+items.map((it,i)=>{const p=String(it.product||''); const [size,expr='']=p.split('='); const q=Number(it.qty||it.quantity||0)||''; const mat=it.material||'未填材質'; return `<option value="${i}" data-product="${esc(p)}">${esc(size)}｜${esc(expr||q+'件')}｜${esc(q)}件｜${esc(mat)}</option>`;}).join(''); window.__shipItems=items;}catch(e){console.warn(e)}} sel.addEventListener('focus',reload); cust.addEventListener('change',reload); setTimeout(reload,100); }
function hideDuplicateUnplacedTags(){ if(page()!=='warehouse') return; const items=$$('.warehouse-meta-bar .pill.warn, .warehouse-toolbar-panel .pill.warn, #yx22-unplaced-summary').filter(x=>/未入|未錄|A區/.test(clean(x.textContent))); if(items.length>1){items.forEach((x,i)=>{ if(i>0) x.classList.add('yx27-hide-dup-unplaced');});} }
function boot(){bindRowSelection(); patchSelectAll(); applySelection(); dedupeBatchEdit(); interceptToolbarClicks(); renderOnlyOneRegionBoard(); bindRegionMoveRefresh(); cleanCustomerItemDropdown(); hideDuplicateUnplacedTags();}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,90),{once:true}); else setTimeout(boot,90);
let timer=null; new MutationObserver(()=>{clearTimeout(timer); timer=setTimeout(boot,180);}).observe(document.documentElement,{childList:true,subtree:true});
window.yx27TargetedRefresh=boot;
})();
