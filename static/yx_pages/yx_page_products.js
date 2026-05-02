// CLEAN V22 products page JS. One page = one JS. Old FIX JS is not loaded.
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
    let el = $('#yx-clean-toast'); if(!el){ el=document.createElement('div'); el.id='yx-clean-toast'; el.style.cssText='position:fixed;right:18px;top:18px;z-index:99999;background:#111827;color:#fff;padding:10px 14px;border-radius:12px;box-shadow:0 8px 24px #0002;font-weight:700;max-width:70vw'; document.body.appendChild(el); }
    el.textContent=msg; el.style.display='block'; clearTimeout(el._t); el._t=setTimeout(()=>el.style.display='none',2600);
  };
  window.yxErr = e => yxToast((e && e.message) ? e.message : String(e||'操作失敗'));
  window.yxQty = function(text){
    text=String(text||''); const rhs=(text.split('=')[1]||text).trim(); if(!rhs) return 0;
    return rhs.split('+').map(x=>x.trim()).filter(Boolean).reduce((sum,p)=>{ const m=p.match(/(?:^|\D)(\d+)\s*[xX×*]\s*(\d+)$/); if(m) return sum+parseInt(m[2]||0,10); return sum+1; },0);
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
        box.innerHTML = list.map(c=>`<button class="customer-chip" type="button" data-yx-region-customer="${c.name}">${c.name}</button>`).join('') || '<div class="muted">無客戶</div>';
      });
    }catch(e){ yxErr(e); }
  };
  document.addEventListener('click', e=>{
    const b=e.target.closest('[data-yx-region-customer]'); if(!b) return;
    activeCustomer=b.dataset.yxRegionCustomer||'';
    const inp=$('#customer-name'); if(inp) { inp.value=activeCustomer; inp.dispatchEvent(new Event('input',{bubbles:true})); }
    if(window.__YX_CLEAN_PRODUCTS__ && typeof render==='function') render();
  });
  document.addEventListener('DOMContentLoaded', ()=>{ yxLoadRegionPicker(); });

})();
(function(){
'use strict'; if(window.__YX_CLEAN_PRODUCTS__) return; window.__YX_CLEAN_PRODUCTS__=true;
const pageMap={inventory:{api:'/api/inventory',title:'庫存',summary:'#yx113-inventory-summary',tbody:'#yx113-inventory-summary tbody',mat:'#yx113-inventory-material',search:'#yx113-inventory-search'},orders:{api:'/api/orders',title:'訂單',summary:'#yx113-orders-summary',tbody:'#yx113-orders-summary tbody',mat:'#yx113-orders-material',search:'#yx113-orders-search'},master_order:{api:'/api/master_orders',title:'總單',summary:'#yx113-master_order-summary',tbody:'#yx113-master_order-summary tbody',mat:'#yx113-master_order-material',search:'#yx113-master_order-search'}};
let key=(document.querySelector('.module-screen')||{}).dataset?.module; if(!pageMap[key]) return; let cfg=pageMap[key], rows=[], edit=false, zone='ALL', activeCustomer='', submitting=false, materialBusy=false;
function selected(){ const checks=$$('input.yx-clean-check:checked'); return checks.length?checks.map(c=>({source:key,id:Number(c.dataset.id)})):rows.map(r=>({source:key,id:Number(r.id)})); }
function esc(v){ return String(v==null?'':v).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function tr(r){
  const loc=(r.location||'').toUpperCase().startsWith('A')?'A區':((r.location||'').toUpperCase().startsWith('B')?'B區':'');
  const full=yxSize(r);
  const size=full.split('=')[0]||'';
  const rhs=full.includes('=') ? full.split('=').slice(1).join('=') : full;
  const qty=Number(r.qty||yxQty(full)||0);
  return `<tr data-id="${esc(r.id)}"><td><input class="yx-clean-check" data-id="${esc(r.id)}" type="checkbox"> <span class="material-tag">${esc(yxMaterial(r))}</span></td><td>${esc(size)}</td><td>${edit?`<input class="text-input small yx-edit-text" value="${esc(full)}">`:esc(rhs)}</td><td>${qty}</td><td>${esc(loc)}</td></tr>`;
}
function currentCustomer(){ return (($('#customer-name')||{}).value||activeCustomer||'').trim(); }
function render(){ let q=($(cfg.search)||{}).value||''; let cust=currentCustomer(); let list=rows.filter(r=>(zone==='ALL'||String(r.location||'').toUpperCase().startsWith(zone)) && (!cust || key==='inventory' || String(r.customer_name||'')===cust) && JSON.stringify(r).toLowerCase().includes(q.toLowerCase())); const body=$(cfg.tbody); if(body) body.innerHTML=list.length?list.map(tr).join(''):`<tr><td colspan="5">沒有資料</td></tr>`; const head=document.querySelector(cfg.summary+' .yx132-summary-title strong, '+cfg.summary+' .yx113-summary-head strong'); if(head) head.textContent=`${list.reduce((s,r)=>s+Number(r.qty||0),0)}件 / ${list.length}筆`; }
async function load(){ try{ const d=await yxApi(cfg.api); rows=d.items||[]; render(); }catch(e){yxErr(e);} }
window.confirmSubmit=async function(){ if(submitting) return; submitting=true; try{ const txt=($('#ocr-text')||{}).value||''; const customer=($('#customer-name')||{}).value||''; if(key!=='inventory' && !customer.trim()) throw new Error('請輸入客戶名稱'); if(!txt.trim()) throw new Error('請輸入商品資料'); const btn=$('#submit-btn'); if(btn) btn.disabled=true; await yxApi(cfg.api,{method:'POST',body:JSON.stringify({customer_name:customer,ocr_text:txt,location:($('#location-input')||{}).value||'',request_key:String(Date.now())})}); if($('#ocr-text')) $('#ocr-text').value=''; await load(); if(window.yxLoadRegionPicker) window.yxLoadRegionPicker(); yxToast('已送出並更新'); }catch(e){yxErr(e);} finally{ const btn=$('#submit-btn'); if(btn) btn.disabled=false; submitting=false; } };
async function batchMaterial(mat){
  if(!mat || materialBusy) return;
  materialBusy=true;
  const items=selected();
  rows.forEach(r=>{ if(items.some(x=>x.id===Number(r.id))) {r.material=mat; r.product_code=mat;} });
  render();
  const sel=$(cfg.mat); if(sel) sel.disabled=true;
  try{ await yxApi('/api/customer-items/batch-material',{method:'POST',body:JSON.stringify({material:mat,items})}); yxToast('材質已套用'); await load(); }
  catch(e){yxErr(e); await load();}
  finally{ if(sel) sel.disabled=false; materialBusy=false; }
}

async function batchToMaster(){
  try{
    if(key!=='orders') throw new Error('只有訂單可以加到總單');
    const ids = selected().map(x=>Number(x.id));
    const list = rows.filter(r=>ids.includes(Number(r.id)));
    if(!list.length) throw new Error('請先勾選要加到總單的訂單商品；未勾選時會套用全部');
    for(const r of list){
      await yxApi('/api/orders/to-master',{method:'POST',body:JSON.stringify({customer_name:r.customer_name||($('#customer-name')||{}).value||'', product_text:yxSize(r), product_code:yxMaterial(r), qty:Number(r.qty||yxQty(yxSize(r))||0), request_key:String(Date.now())+'-'+r.id})});
    }
    yxToast('已加到總單');
  }catch(e){yxErr(e);} }
async function batchZone(z){
  try{
    const items=selected();
    if(!items.length) throw new Error('沒有可移動商品');
    rows.forEach(r=>{ if(items.some(x=>x.id===Number(r.id))) r.location=z; });
    render();
    await yxApi('/api/customer-items/batch-zone',{method:'POST',body:JSON.stringify({zone:z,items})});
    yxToast('已移到 '+z+' 區'); await load();
  }catch(e){yxErr(e); await load();}
}

async function batchDelete(src){ try{ const items=selected(); if(!items.length) throw new Error('沒有可刪除商品'); if(!confirm('確定刪除選取商品？')) return; await yxApi('/api/customer-items/batch-delete',{method:'POST',body:JSON.stringify({items})}); await load(); }catch(e){yxErr(e);} }
async function saveEdits(){ const changes=$$('tr[data-id]').map(tr=>({id:Number(tr.dataset.id),input:$('.yx-edit-text',tr)})).filter(x=>x.input); for(const c of changes){ await yxApi('/api/customer-item',{method:'POST',body:JSON.stringify({source:key,id:c.id,product_text:c.input.value})}); } }
document.addEventListener('click',async e=>{ const submit=e.target.closest('[data-yx-action="confirm-submit"], #submit-btn'); if(submit){ e.preventDefault(); await window.confirmSubmit(); return; } const z=e.target.closest('[data-yx132-zone-filter]'); if(z&&z.dataset.source===key){ zone=z.dataset.yx132ZoneFilter||'ALL'; $$('[data-yx132-zone-filter][data-source="'+key+'"]').forEach(b=>b.classList.toggle('is-active',b===z)); render(); } const trf=e.target.closest('[data-yx132-batch-transfer]'); if(trf&&trf.dataset.source===key) batchToMaster(); const mz=e.target.closest('[data-yx132-batch-zone]'); if(mz&&mz.dataset.source===key) batchZone(mz.dataset.yx132BatchZone); const del=e.target.closest('[data-yx113-batch-delete]'); if(del&&del.dataset.yx113BatchDelete===key) batchDelete(key); const editBtn=e.target.closest('[data-yx128-edit-all]'); if(editBtn&&editBtn.dataset.yx128EditAll===key){ try{ if(edit){ await saveEdits(); edit=false; editBtn.textContent='批量編輯全部'; await load(); yxToast('已儲存批量編輯'); } else { edit=true; editBtn.textContent='儲存並關閉編輯'; render(); } }catch(err){yxErr(err);} } });
document.addEventListener('change',e=>{ if(e.target && e.target.id===cfg.mat.slice(1)){ batchMaterial(e.target.value); e.target.value=''; } });
document.addEventListener('input',e=>{ if(e.target && e.target.id===cfg.search.slice(1)) render(); if(e.target && e.target.id==='customer-name'){ activeCustomer=e.target.value.trim(); render(); } });
document.addEventListener('DOMContentLoaded',load); if(document.readyState!=='loading') load();
})();


// V28_EVENT_COMPLETE_PRODUCTS_COMPAT: 補回目前滿意的舊入口名稱，但實際走本頁 clean 事件/API。
(function(){'use strict'; if(window.__YX_V28_EVENT_COMPLETE_PRODUCTS_COMPAT__) return; window.__YX_V28_EVENT_COMPLETE_PRODUCTS_COMPAT__=true;
  function clickSel(sel){ const el=document.querySelector(sel); if(el){ el.click(); return true; } return false; }
  window.yxProductSubmit = window.confirmSubmit || window.yxProductSubmit;
  window.submitProductText = window.confirmSubmit || window.submitProductText;
  window.applyBatchMaterial = function(source){ const map={inventory:'#yx113-inventory-material',orders:'#yx113-orders-material',master_order:'#yx113-master_order-material'}; const el=document.querySelector(map[source]||''); if(el) el.dispatchEvent(new Event('change',{bubbles:true})); };
  window.batchDeleteProducts = function(source){ clickSel('[data-yx113-batch-delete="'+source+'"]'); };
  window.toggleBatchEdit = function(source){ clickSel('[data-yx128-edit-all="'+source+'"]'); };
  window.moveSelectedToZone = function(source,zone){ clickSel('[data-source="'+source+'"][data-yx132-batch-zone="'+zone+'"]'); };
  window.addSelectedOrdersToMaster = function(){ clickSel('[data-yx132-batch-transfer][data-source="orders"]'); };
  document.addEventListener('DOMContentLoaded',()=>{document.body.classList.add('yx-v27-products-satisfied');});
})();


// CLEAN_EVENTS_V28_EVENT_COMPLETE: 補齊產品頁所有 HTML 按鈕/事件入口；不恢復舊 FIX 多支載入。
(function(){'use strict'; if(window.__YX_V28_PRODUCTS_EVENT_COMPLETE__) return; window.__YX_V28_PRODUCTS_EVENT_COMPLETE__=true;
  function call(fn){ try{ if(typeof window[fn]==='function') return window[fn](); if(window.yxToast) yxToast(fn+' 尚未接上'); }catch(e){ if(window.yxErr) yxErr(e); else console.error(e); } }
  document.addEventListener('click', function(e){
    const a=e.target.closest('[data-yx-action]');
    if(a){
      if(a.dataset.yxAction==='confirm-submit'){ e.preventDefault(); call('confirmSubmit'); return; }
      if(a.dataset.yxAction==='reverse-lookup'){ e.preventDefault(); call('reverseLookup'); return; }
    }
  }, true);
  window.reverseLookup = window.reverseLookup || function(){ if(window.yxToast) yxToast('請到倉庫圖搜尋商品位置'); };
})();
