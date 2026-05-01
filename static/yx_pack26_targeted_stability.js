/* PACK26 targeted stability from pack25/22 base: do not wipe existing UI. */
(function(){
'use strict';
if(window.__YX_PACK26_TARGETED_STABILITY__) return;
window.__YX_PACK26_TARGETED_STABILITY__=true;
const $=id=>document.getElementById(id);
const $$=(sel,root=document)=>Array.from(root.querySelectorAll(sel));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
const page=()=>document.querySelector('.module-screen')?.dataset?.module || (location.pathname.includes('today')?'today':'');
async function api(url,opt={}){const r=await fetch(url,{credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json',...(opt.headers||{})},...opt}); const text=await r.text(); let d={}; try{d=text?JSON.parse(text):{};}catch(e){d={ok:false,error:text};} if(!r.ok||d.ok===false||d.success===false) throw new Error(d.error||d.message||text||('HTTP '+r.status)); return d;}
function toast(m){let t=$('clean-toast'); if(t){t.textContent=m||'完成'; t.classList.remove('hidden'); clearTimeout(window.__yx26toast); window.__yx26toast=setTimeout(()=>t.classList.add('hidden'),1600);}else console.log(m);}

const MATERIALS=['TD','MER','DF','SP','SPF','HF','RDT','尤加利','LVL'];
function patchMaterialOptions(){
  $$('select').forEach(sel=>{
    const txt=Array.from(sel.options||[]).map(o=>o.textContent).join('|');
    const id=sel.id||'';
    if(id==='yx-batch-material'||id==='batch-material'||/批量增加材質|不指定材質|TD|MER|SPF|RDT|尤加利|LVL/.test(txt)){
      const first=clean(sel.options?.[0]?.textContent||'批量增加材質');
      const label=first.includes('不指定')?'不指定材質':'批量增加材質';
      const current=sel.value;
      sel.innerHTML=`<option value="">${label}</option>`+MATERIALS.map(m=>`<option value="${m}">${m}</option>`).join('');
      if(MATERIALS.includes(current)) sel.value=current;
    }
  });
}

function centerMaterialTags(){
  $$('.yx-product-table td.yx-material, .yx-product-table td:nth-child(2)').forEach(td=>{
    if(td.querySelector('.yx26-material-pill,.yx25-material-pill,.mat-tag')) return;
    const val=clean(td.textContent);
    if(val) td.innerHTML=`<span class="yx26-material-pill">${esc(val)}</span>`;
  });
  $$('.yx25-material-pill,.mat-tag').forEach(x=>x.classList.add('yx26-material-pill'));
}

function dedupeBatchEdit(){
  if(!['inventory','orders','master_order'].includes(page())) return;
  const tools=document.querySelector('.yx-table-tools');
  if(!tools) return;
  const all=$$('button',tools).filter(b=>clean(b.textContent)==='批量編輯');
  let keep=all[0]||$('yx22-batch-edit')||$('yx25-batch-edit');
  all.slice(1).forEach(b=>b.remove());
  const del=$('yx-batch-delete') || $$('button',tools).find(b=>clean(b.textContent)==='批量刪除');
  if(!keep){
    keep=document.createElement('button');
    keep.type='button'; keep.id='yx26-batch-edit'; keep.textContent='批量編輯';
    keep.className='yx-chip-btn yx22-unified-btn yx26-batch-edit';
    keep.onclick=()=>{ if(typeof window.batchEdit22==='function') return window.batchEdit22(); alert('請先勾選商品後再批量編輯'); };
  }
  keep.classList.add('yx-chip-btn','yx22-unified-btn','yx26-batch-edit');
  if(del && keep.previousElementSibling!==del) del.insertAdjacentElement('afterend', keep);
}

function keepOnlyCurrentRegionBoard(){
  if(!['orders','master_order','ship'].includes(page())) return;
  const keep=$('region-picker-section');
  if(!keep) return;
  // Do not delete the product table; only hide duplicate legacy customer category boards outside the selected region picker.
  $$('.category-grid.compact-grid,.category-grid').forEach(g=>{
    if(keep.contains(g)) return;
    if($('customers-section') && $('customers-section').contains(g)) return;
    if(g.querySelector('#region-north,#region-center,#region-south')) g.classList.add('yx26-hide-legacy-region-board');
  });
  keep.classList.add('yx26-single-region-board');
}

async function renderToday26(){
  if(page()!=='today') return;
  try{
    const d=await api('/api/today-summary?ts='+Date.now());
    const s=d.unplaced_summary||{};
    const A=Number(s.A||0), B=Number(s.B||0), U=Number(s['未指定']||0), T=A+B+U;
    const badge=$('today-unread-badge'); if(badge) badge.textContent='0';
    ['today-inbound-list','today-outbound-list','today-order-list'].forEach(id=>{const el=$(id); if(el) el.innerHTML='<span class="muted">無</span>';});
    const html=`<div class="yx26-unplaced-summary"><div class="yx26-stat"><span>A區</span><b>${A}</b><em>件</em></div><div class="yx26-stat"><span>B區</span><b>${B}</b><em>件</em></div><div class="yx26-stat"><span>未指定</span><b>${U}</b><em>件</em></div><div class="yx26-stat total"><span>總件數</span><b>${T}</b><em>件</em></div></div>`;
    const u=$('today-unplaced-list'); if(u) u.innerHTML=html;
    const sum=$('today-summary-cards'); if(sum) sum.innerHTML='';
    await api('/api/today/read',{method:'POST'}).catch(()=>{});
  }catch(e){
    const host=$('today-unplaced-list')||$('today-summary-cards');
    if(host) host.innerHTML=`<div class="error-card">今日異動讀取失敗：${esc(e.message)}</div>`;
  }
}
function bindToday26(){
  if(page()!=='today') return;
  const rb=$('yx112-refresh-today');
  if(rb){ rb.onclick=(ev)=>{ev.preventDefault(); ev.stopPropagation(); renderToday26();}; }
  setTimeout(renderToday26,80);
}

function makeShipTagsEditable(){
  if(page()!=='ship') return;
  const ta=$('ocr-text');
  if(ta){
    ta.classList.add('yx26-hidden-ship-textarea');
    ta.setAttribute('aria-hidden','true');
  }
  const box=$('yx22-ship-meta');
  if(!box) return;
  $$('.yx22-ship-line',box).forEach((line,idx)=>{
    if(line.dataset.yx26Edit) return;
    line.dataset.yx26Edit='1';
    const spans=$$('span',line);
    const productSpan=spans.find(sp=>!sp.classList.contains('mat-tag')&&!sp.classList.contains('yx26-material-pill')) || spans[spans.length-1];
    if(productSpan){
      productSpan.contentEditable='true';
      productSpan.classList.add('yx26-editable-product');
      productSpan.addEventListener('input',()=>{
        if(window.__yx22ShipDraft && window.__yx22ShipDraft[idx]){
          window.__yx22ShipDraft[idx].product=clean(productSpan.textContent);
          if(ta) ta.value=(window.__yx22ShipDraft||[]).map(x=>x.product).filter(Boolean).join('\n');
        }
      });
    }
  });
}

function patchCustomerMoveNoAlert(){
  if(!['orders','master_order','master_orders'].includes(page())) return;
  // Replace browser alert side-effects by keeping UI in-place. The pack18 menu already does the backend move; this makes visual refresh immediate.
  if(window.__yx26MovePatched) return; window.__yx26MovePatched=true;
  document.addEventListener('click',ev=>{
    const btn=ev.target.closest('.yx18-menu button[data-act="move"]');
    if(!btn) return;
    setTimeout(()=>{
      if(typeof window.yx18BindCustomerLongPress==='function') window.yx18BindCustomerLongPress();
      keepOnlyCurrentRegionBoard();
    },200);
    setTimeout(()=>{
      if(typeof window.yx18BindCustomerLongPress==='function') window.yx18BindCustomerLongPress();
    },800);
  },true);
}

function boot(){
  patchMaterialOptions();
  centerMaterialTags();
  dedupeBatchEdit();
  keepOnlyCurrentRegionBoard();
  bindToday26();
  makeShipTagsEditable();
  patchCustomerMoveNoAlert();
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,60),{once:true}); else setTimeout(boot,60);
let moTimer=null;
new MutationObserver(()=>{clearTimeout(moTimer); moTimer=setTimeout(boot,160);}).observe(document.documentElement,{childList:true,subtree:true});
window.yx26TargetedRefresh=boot;
})();
