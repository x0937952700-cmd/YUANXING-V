(function(){
'use strict';
if(window.__YX_PACK23_SINGLE_FINAL__) return;
window.__YX_PACK23_SINGLE_FINAL__=true;
const $=id=>document.getElementById(id);
const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const clean=s=>String(s||'').trim();
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const api=async(url,opt={})=>{const r=await fetch(url,Object.assign({headers:{'Content-Type':'application/json'},cache:'no-store'},opt));const ct=r.headers.get('content-type')||'';const d=ct.includes('json')?await r.json():await r.text();if(!r.ok||d.ok===false||d.success===false)throw new Error(d.error||d.message||d||'操作失敗');return d;};
const page=()=>document.querySelector('.module-screen')?.dataset.module||'';
const MATERIALS=['TD','MER','DF','SP','SPF','HF','尤加利','LVL','RDT'];
function toast(msg){let el=$('clean-toast'); if(el){el.textContent=msg;el.classList.remove('hidden');clearTimeout(el._t);el._t=setTimeout(()=>el.classList.add('hidden'),1800)}else console.log(msg)}
function normalizeRegion(r){r=clean(r); if(r.includes('中'))return '中區'; if(r.includes('南'))return '南區'; return '北區'}
function patchBase(){document.documentElement.dataset.yxPack23Single='locked';
  patchMaterialSelects(); patchTableControls(); patchMaterialCells(); patchTodayPage(); patchCustomerInputs(); bindCustomerLongPress();
  if(['orders','master_order','ship'].includes(page())){setTimeout(()=>{loadRegionsFast().catch(()=>{});},80)}
}
function patchMaterialSelects(){
  $$('select').forEach(sel=>{const text=clean(sel.textContent); if(sel.id==='yx-batch-material'||sel.id==='batch-material'||/批量增加材質|紅木|花梨|黑檀|柚木|TD|MER|SPF|RDT/.test(text)){
    const first=(text.includes('不指定'))?'不指定材質':'批量增加材質'; sel.innerHTML='<option value="">'+first+'</option>'+MATERIALS.map(m=>`<option value="${m}">${m}</option>`).join('');
  }});
}
function patchTableControls(){
  const tools=$$('.yx-table-tools,.table-tools,.toolbar,.query-bar').find(el=>el.querySelector('#yx-batch-delete')||clean(el.textContent).includes('批量刪除'));
  if(tools){
    const del=$('yx-batch-delete')||$$('button',tools).find(b=>clean(b.textContent)==='批量刪除');
    if(del && !tools.querySelector('.yx23-batch-edit')){const b=document.createElement('button');b.type='button';b.className='yx-chip-btn yx23-batch-edit';b.textContent='批量編輯';b.onclick=batchEdit;del.insertAdjacentElement('afterend',b);}
  }
  patchMaterialSelects();
}
function selectedChecks(){return $$('.yx-row-check:checked,input[type="checkbox"]:checked').filter(x=>x.closest('tr'))}
async function batchEdit(){
  const mat=prompt('批量編輯材質：TD、MER、DF、SP、SPF、HF、尤加利、LVL、RDT','');
  if(mat===null)return; const checks=selectedChecks(); if(!checks.length){toast('請先選取商品');return;}
  for(const c of checks){const tr=c.closest('tr');const id=Number(c.value||tr?.dataset.id||0);const src=c.dataset.source||tr?.dataset.source||(page()==='orders'?'orders':page()==='master_order'?'master_orders':'inventory'); if(id) await api(`/api/item/${src}/${id}`,{method:'POST',body:JSON.stringify({material:mat})});}
  toast('已批量編輯'); setTimeout(()=>location.reload(),250);
}
function patchMaterialCells(){
  $$('.yx-product-table tbody tr, table tbody tr').forEach(tr=>{
    const cells=$$('td',tr); if(cells.length<3)return; let matCell=cells.find(td=>td.classList.contains('yx-material'))||cells[1];
    let val=clean(matCell.textContent); if(!val||val==='材質'||matCell.querySelector('.yx23-material-pill'))return;
    matCell.innerHTML=`<span class="yx23-material-pill">${esc(val)}</span>`;
  });
}
async function refreshToday(){
  try{
    const d=await api('/api/today-summary'); const s=d.unplaced_summary||d.summary||{};
    const html=`<div class="yx23-unplaced-summary"><div><b>A區</b><span>${Number(s.A||0)}件</span></div><div><b>B區</b><span>${Number(s.B||0)}件</span></div><div><b>未指定</b><span>${Number(s['未指定']||0)}件</span></div><div class="total"><b>總計</b><span>${Number(d.unplaced_total||d.total||0)}件</span></div></div>`;
    const unplaced=$('today-unplaced-list'); if(unplaced) unplaced.innerHTML=html;
    const cards=$('today-summary-cards'); if(cards) cards.innerHTML=html;
    const badge=$('today-unread-badge'); if(badge) badge.textContent=String(Number(d.unread||0));
    ['today-inbound-list','today-outbound-list','today-order-list'].forEach(id=>{const el=$(id); if(el&&!clean(el.textContent))el.innerHTML='<span class="muted">無</span>';});
  }catch(e){
    const unplaced=$('today-unplaced-list'); if(unplaced) unplaced.innerHTML='<div class="error-card">刷新失敗：'+esc(e.message)+'</div>';
  }
}
function patchTodayPage(){
  if(!location.pathname.includes('today-changes'))return;
  const btn=$('yx112-refresh-today')||$$('button').find(b=>clean(b.textContent)==='刷新'); if(btn){btn.onclick=refreshToday;}
  setTimeout(refreshToday,80);
}
function stripTerms(name){let s=clean(name);['FOB代付','FOB代','FOB','CNF'].forEach(t=>s=s.replaceAll(t,''));return s.replace(/[|｜/\-]/g,' ').replace(/\s+/g,' ').trim()||name}
function termLabel(name){ if(clean(name).includes('FOB代'))return 'FOB代付'; if(clean(name).includes('FOB'))return 'FOB'; if(clean(name).includes('CNF'))return 'CNF'; return '';}
async function loadRegionsFast(){
  const m=page(); if(!['orders','master_order','ship'].includes(m))return;
  const d=await api('/api/regions/'+m); const map={'北區':'region-north','中區':'region-center','南區':'region-south'};
  for(const r of Object.keys(map)){const el=$(map[r]); if(!el)continue; const arr=(d.details&&d.details[r])||[]; el.innerHTML=arr.length?arr.map(c=>customerChip(c,m)).join(''):'<span class="muted">無</span>';}
  bindCustomerLongPress();
}
function customerChip(c,m){const name=c.name||c.customer||'';return `<button type="button" class="chip customer-chip yx23-customer-chip" data-customer="${esc(name)}" onclick="selectCustomer('${String(name).replace(/\\/g,'\\\\').replace(/'/g,"\\'")}')"><span class="yx23-customer-name">${esc(stripTerms(name))}</span><span class="yx23-term">${esc(termLabel(name))}</span><span class="yx23-count">${Number(c.qty||0)}件 / ${Number(c.count||0)}筆</span></button>`}
function bindCustomerLongPress(){
  $$('.customer-chip,.yx23-customer-chip').forEach(btn=>{if(btn.dataset.yx23Bound)return;btn.dataset.yx23Bound='1';let timer=null,moved=false;
    const open=e=>{e.preventDefault();e.stopPropagation();openCustomerMenu(btn,btn.dataset.customer||clean(btn.textContent));};
    btn.addEventListener('contextmenu',open);
    btn.addEventListener('pointerdown',e=>{moved=false;timer=setTimeout(()=>open(e),650)});
    btn.addEventListener('pointermove',()=>{moved=true;if(timer)clearTimeout(timer)});
    btn.addEventListener('pointerup',()=>{if(timer)clearTimeout(timer)});
    btn.addEventListener('pointercancel',()=>{if(timer)clearTimeout(timer)});
  });
}
function openCustomerMenu(btn,name){
  closeCustomerMenu(); const m=document.createElement('div'); m.className='yx23-customer-menu';
  m.innerHTML=`<button data-act="edit">編輯客戶</button><button data-act="north">移到北區</button><button data-act="center">移到中區</button><button data-act="south">移到南區</button><button data-act="delete" class="danger">刪除客戶</button><button data-act="close">關閉</button>`;
  document.body.appendChild(m); const r=btn.getBoundingClientRect(); m.style.left=Math.min(r.left,innerWidth-220)+'px'; m.style.top=Math.min(r.bottom+6,innerHeight-260)+'px';
  m.onclick=async e=>{const act=e.target?.dataset?.act;if(!act)return; try{if(act==='close'){closeCustomerMenu();return;} if(act==='edit'){let nn=prompt('客戶名稱',name); if(!nn)return; await api('/api/customer-action/edit',{method:'POST',body:JSON.stringify({old_name:name,new_name:nn,region:currentRegionOf(btn)})}); name=nn;}
    if(['north','center','south'].includes(act)){const region=act==='north'?'北區':act==='center'?'中區':'南區'; await api('/api/customer-action/move',{method:'POST',body:JSON.stringify({name,region})}); moveChipDOM(btn,region); toast('已移到'+region); closeCustomerMenu(); setTimeout(()=>loadRegionsFast(),120); return;}
    if(act==='delete'){if(!confirm('確定刪除這個客戶在此頁的資料？'))return; await api('/api/customer-action/delete',{method:'POST',body:JSON.stringify({name,module:page()})});}
    closeCustomerMenu(); await loadRegionsFast(); const panel=$('selected-customer-items'); if(panel){panel.classList.add('hidden');panel.innerHTML='';}
  }catch(err){toast(err.message)}};
}
function currentRegionOf(btn){return btn.closest('[data-region]')?.dataset.region||'北區'}
function moveChipDOM(btn,region){const id=region==='北區'?'region-north':region==='中區'?'region-center':'region-south';const target=$(id); if(!target)return; target.querySelector('.muted')?.remove(); target.prepend(btn);}
function closeCustomerMenu(){document.querySelector('.yx23-customer-menu')?.remove()}
function patchCustomerInputs(){
  $$('input').forEach(inp=>{const label=clean((inp.closest('label')?.textContent||inp.previousElementSibling?.textContent||'')); if(inp.id==='customer-name'||/客戶名稱/.test(label)){inp.setAttribute('list','yx23-customer-datalist'); if(!document.getElementById('yx23-customer-datalist')){const dl=document.createElement('datalist');dl.id='yx23-customer-datalist';document.body.appendChild(dl);} inp.addEventListener('input',()=>loadCustomerHints(inp.value));}});
}
let hintTimer=null;function loadCustomerHints(q){clearTimeout(hintTimer);hintTimer=setTimeout(async()=>{try{const d=await api('/api/customers?q='+encodeURIComponent(q||''));const dl=$('yx23-customer-datalist'); if(dl) dl.innerHTML=(d.items||[]).slice(0,80).map(x=>`<option value="${esc(x.name||x.customer||x)}"></option>`).join('');}catch(e){}},120)}
// Keep existing main renderer, then apply final corrections after it changes DOM.
const obs=new MutationObserver(()=>{clearTimeout(obs._t);obs._t=setTimeout(()=>{patchMaterialSelects();patchTableControls();patchMaterialCells();bindCustomerLongPress();},120)});
function boot(){patchBase(); obs.observe(document.body,{childList:true,subtree:true});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
