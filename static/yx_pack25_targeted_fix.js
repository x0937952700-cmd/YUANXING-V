/* PACK25 targeted fixes from Pack22 base only: RDT material, instant region move visual, centered material tag, batch-edit adjacency. */
(function(){
'use strict';
if(window.__YX_PACK25_TARGETED__) return;
window.__YX_PACK25_TARGETED__=true;
const MATERIALS=['TD','MER','DF','SP','SPF','HF','RDT','尤加利','LVL'];
const $=(id)=>document.getElementById(id);
const $$=(sel,root=document)=>Array.from(root.querySelectorAll(sel));
const clean=(s)=>String(s||'').replace(/\s+/g,' ').trim();
const page=()=>document.querySelector('.module-screen')?.dataset?.module||'';
function patchMaterialOptions(){
  $$('select').forEach(sel=>{
    const txt=Array.from(sel.options||[]).map(o=>o.textContent).join('|');
    const id=sel.id||'';
    if(id==='yx-batch-material'||id==='batch-material'||/批量增加材質|不指定材質|TD|MER|SPF|尤加利|LVL/.test(txt)){
      const first=clean(sel.options?.[0]?.textContent||'批量增加材質');
      const label=first.includes('不指定')?'不指定材質':'批量增加材質';
      const current=sel.value;
      sel.innerHTML=`<option value="">${label}</option>`+MATERIALS.map(m=>`<option value="${m}">${m}</option>`).join('');
      if(MATERIALS.includes(current)) sel.value=current;
    }
  });
}
function centerMaterialCells(){
  $$('.yx-product-table td.yx-material').forEach(td=>{
    const val=clean(td.textContent);
    if(!val) return;
    if(!td.querySelector('.yx25-material-pill')) td.innerHTML=`<span class="yx25-material-pill">${val}</span>`;
  });
}
function ensureBatchEditBesideDelete(){
  if(!['inventory','orders','master_order'].includes(page())) return;
  const tools=document.querySelector('.yx-table-tools');
  const del=$('yx-batch-delete');
  if(!tools||!del) return;
  let edit=$('yx22-batch-edit')||$('yx25-batch-edit')||Array.from(tools.querySelectorAll('button')).find(b=>clean(b.textContent)==='批量編輯');
  if(!edit){
    edit=document.createElement('button');
    edit.id='yx25-batch-edit';
    edit.type='button';
    edit.className='yx-chip-btn yx22-unified-btn yx25-batch-edit';
    edit.textContent='批量編輯';
    edit.addEventListener('click',()=>{
      if(typeof window.batchEdit22==='function') return window.batchEdit22();
      const mat=prompt('批量編輯材質（空白不修改）','');
      if(mat===null) return;
      const rows=$$('.yx-row-check:checked').map(x=>({id:x.value,source:x.dataset.source||'inventory'}));
      if(!rows.length) return alert('請先勾選商品');
      Promise.all(rows.map(r=>fetch(`/api/item/${r.source}/${r.id}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({material:mat})}))).then(()=>location.reload());
    });
  }
  del.insertAdjacentElement('afterend', edit);
  edit.classList.add('yx22-unified-btn','yx25-batch-edit');
}
function boot(){patchMaterialOptions(); centerMaterialCells(); ensureBatchEditBesideDelete();}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,50)); else setTimeout(boot,50);
let t=null;
new MutationObserver(()=>{clearTimeout(t); t=setTimeout(boot,120);}).observe(document.documentElement,{childList:true,subtree:true});
window.yx25TargetedRefresh=boot;
})();
