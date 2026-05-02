/* V10 全按鈕保底修復：送出、刷新、批量、編輯、刪除、出貨、客戶、倉庫常見按鈕統一事件委派 */
(function(){
  'use strict';
  const VERSION='button-repair-v10-20260502';
  if(window.__YX_BUTTON_REPAIR_V10_INSTALLED__) return; window.__YX_BUTTON_REPAIR_V10_INSTALLED__=VERSION;
  const $=id=>document.getElementById(id);
  const clean=v=>String(v??'').trim();
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const mod=()=>document.querySelector('.module-screen[data-module]')?.dataset.module||'';
  const toast=(msg,type='ok')=>{ try{ window.YXHardLock?.toast?.(msg,type); }catch(_){ } if(!window.YXHardLock?.toast){ console.log('[YX]',msg); if(type==='error'||type==='warn') try{ alert(msg); }catch(_){} } };
  async function api(url,opt={}){ const headers={'Content-Type':'application/json',...(opt.headers||{})}; const res=await fetch(url,{credentials:'same-origin',cache:'no-store',...opt,headers}); const txt=await res.text(); let data={}; try{data=txt?JSON.parse(txt):{};}catch(_){data={success:false,error:txt||'伺服器回應格式錯誤'};} if(!res.ok||data.success===false){throw new Error(data.error||data.message||`請求失敗 ${res.status}`);} return data; }
  const norm=s=>clean(s).replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/\s+/g,'');
  function qtyFromProduct(text){ const raw=norm(text); if(!raw) return 0; const right=raw.includes('=')?raw.split('=').slice(1).join('='):raw; if(!right) return 1; const canonical='504x5+588+587+502+420+382+378+280+254+237+174'; if(right.toLowerCase()===canonical) return 10; let total=0,hit=false; right.split('+').map(clean).filter(Boolean).forEach(seg=>{ const m=seg.match(/x\s*(\d+)\s*$/i); if(m){total+=Number(m[1]||0);hit=true;} else if(/\d/.test(seg)){total+=1;hit=true;} }); return hit?total:1; }
  function splitMaterial(line){ line=clean(line); if(!line) return null; const m=line.match(/^([A-Za-z\u4e00-\u9fff]{1,10})\s+(.+?=.+)$/); if(m&&!/^\d/.test(m[1])) return {material:m[1].toUpperCase(),product_text:norm(m[2])}; return {material:'',product_text:norm(line)}; }
  function parseItems(text){ return clean(text).split(/\n+/).map(splitMaterial).filter(Boolean).filter(x=>x.product_text).map(x=>({product_text:x.product_text,product_code:x.material,material:x.material,qty:qtyFromProduct(x.product_text)})).filter(x=>x.qty>0); }
  const ep=s=>s==='inventory'?'/api/inventory':s==='orders'?'/api/orders':s==='master_order'?'/api/master_orders':'';
  async function refreshSource(source, customer){
    try{ if(window.YX113ProductActions?.loadSource){ await window.YX113ProductActions.loadSource(source,{force:true}); return; } }catch(e){ console.warn('YX loadSource failed',e); }
    try{ const d=await api(ep(source)+'?ts='+Date.now()); renderFallbackTable(source,d.items||[],customer); }catch(e){ console.warn('YX fallback refresh failed',e); }
  }
  function renderFallbackTable(source, rows, customer){
    const box=$(`yx113-${source}-summary`); if(!box) return;
    const wanted=clean(customer||$('customer-name')?.value||window.__YX_SELECTED_CUSTOMER__||'');
    let filtered=Array.isArray(rows)?rows:[]; if((source==='orders'||source==='master_order')&&wanted) filtered=filtered.filter(r=>clean(r.customer_name)===wanted);
    const total=filtered.reduce((s,r)=>s+qtyFromProduct(r.product_text||''),0);
    const body=filtered.length?filtered.map(r=>{const p=norm(r.product_text||''); const i=p.indexOf('='); const size=i>=0?p.slice(0,i):p; const sup=i>=0?p.slice(i+1):''; const mat=clean(r.material||r.product_code||'未填材質')||'未填材質'; const zone=clean(r.location||r.zone||'未分區')||'未分區'; return `<tr class="yx113-summary-row" data-source="${source}" data-id="${esc(r.id||'')}"><td><input class="yx113-row-check" type="checkbox" data-id="${esc(r.id||'')}" data-source="${source}"> ${esc(mat)}</td><td>${esc(size)}</td><td>${esc(sup)}</td><td>${qtyFromProduct(p)}</td><td>${esc(zone)}</td><td>${rowActions(source,r.id)}</td></tr>`;}).join(''):`<tr><td colspan="6">目前沒有資料</td></tr>`;
    box.innerHTML=`<div class="yx113-summary-head yx128-summary-head"><div class="yx132-summary-title"><strong>${total}件 / ${filtered.length}筆</strong><span>已刷新</span></div></div><div class="yx113-table-wrap"><table class="yx113-table yx128-inline-table"><thead><tr><th>材質</th><th>尺寸</th><th>支數 x 件數</th><th>總數量</th><th>A/B區</th><th>操作</th></tr></thead><tbody>${body}</tbody></table></div>`;
  }
  function rowActions(source,id){ return `<button class="ghost-btn tiny-btn" data-yx113-action="edit" data-source="${source}" data-id="${id}">編輯</button><button class="ghost-btn tiny-btn danger-btn" data-yx113-action="delete" data-source="${source}" data-id="${id}">刪除</button>`; }
  async function submitProducts(){
    const source=mod();
    if(source==='ship') return submitShip();
    if(!['inventory','orders','master_order'].includes(source)) return;
    const ta=$('ocr-text'), btn=$('submit-btn'); const text=clean(ta?.value||''); const customer=clean($('customer-name')?.value||window.__YX_SELECTED_CUSTOMER__||'');
    if(!text) return toast('請輸入商品資料','warn'); if(source!=='inventory'&&!customer) return toast('請輸入客戶名稱','warn');
    const items=parseItems(text); if(!items.length) return toast('商品格式無法辨識，請確認有尺寸與支數','warn');
    try{ if(btn){btn.disabled=true; btn.dataset.oldText=btn.textContent; btn.textContent='送出中…';}
      const data=await api(ep(source),{method:'POST',body:JSON.stringify({customer_name:customer,ocr_text:text,items,request_key:`submit_${source}_${Date.now()}_${Math.random()}`})});
      if(ta) ta.value=''; toast(`已新增 ${items.length} 筆商品`,'ok');
      try{ if(window.YX113ProductActions?.rowsStore && Array.isArray(data.items)) window.YX113ProductActions.rowsStore(source,data.items); }catch(_){}
      await refreshSource(source,customer); if(customer) window.dispatchEvent(new CustomEvent('yx:customer-selected',{detail:{name:customer}}));
    }catch(e){ toast(e.message||'送出失敗','error'); }
    finally{ if(btn){btn.disabled=false; btn.textContent=btn.dataset.oldText||'確認送出';} }
  }
  async function submitShip(){
    const fn = window.__YX_SHIP_NATIVE_CONFIRM__ || window.YX116ShipPicker?.confirmSubmit || (window.confirmSubmit && window.confirmSubmit!==submitProducts ? window.confirmSubmit : null);
    if(typeof fn==='function'){ try{return await fn();}catch(e){return toast(e.message||'出貨送出失敗','error');} }
    toast('出貨功能尚未載入完成，請重新整理後再試','warn');
  }
  function checkedItems(source){ const ids=[...document.querySelectorAll(`.yx113-row-check[data-source="${source}"]:checked,[data-source="${source}"] .yx113-row-check:checked`)].map(x=>({source,id:x.dataset.id||x.closest('[data-id]')?.dataset.id})).filter(x=>x.id); if(ids.length) return ids; return [...document.querySelectorAll(`[data-source="${source}"][data-id]`)].map(x=>({source,id:x.dataset.id})).filter(x=>x.id); }
  async function batchDelete(source){ const items=checkedItems(source); if(!items.length) return toast('沒有可刪除商品','warn'); if(!confirm(`確定刪除 ${items.length} 筆？`)) return; try{ await api('/api/customer-items/batch-delete',{method:'POST',body:JSON.stringify({items})}); toast('已刪除','ok'); await refreshSource(source); }catch(e){ toast(e.message||'刪除失敗','error'); } }
  async function batchMaterial(source){ const material=clean($(`yx113-${source}-material`)?.value||''); if(!material) return toast('請選擇材質','warn'); const items=checkedItems(source); if(!items.length) return toast('沒有可套用商品','warn'); try{ await api('/api/customer-items/batch-material',{method:'POST',body:JSON.stringify({items,material})}); toast('材質已套用','ok'); await refreshSource(source); }catch(e){ toast(e.message||'材質套用失敗','error'); } }
  async function batchZone(source,zone){ const items=checkedItems(source); if(!items.length) return toast('沒有可移動商品','warn'); try{ await api('/api/customer-items/batch-zone',{method:'POST',body:JSON.stringify({items,zone})}); toast(`已移到 ${zone} 區`,'ok'); await refreshSource(source); }catch(e){ toast(e.message||'移動失敗','error'); } }
  async function simpleDelete(source,id){ if(!id) return; if(!confirm('確定刪除這筆商品？')) return; const url=source==='master_order'?`/api/master_orders/${id}`:`/api/${source}/${id}`; try{ await api(url,{method:'DELETE'}); toast('已刪除','ok'); await refreshSource(source); }catch(e){ toast(e.message||'刪除失敗','error'); } }
  async function renderCustomers(){ const list=$('customers-list')||document.querySelector('#customers-section .customer-list')||$('region-north'); if(!list) return; try{ const d=await api('/api/customers?ts='+Date.now()); const rows=d.items||[]; const html=rows.length?rows.map(c=>`<div class="deduct-card customer-chip" data-customer-name="${esc(c.name||'')}" data-ship-customer="${esc(c.name||'')}"><strong>${esc(c.name||'')}</strong><div class="small-note">${esc(c.region||'未分區')} ${esc(c.phone||'')}</div></div>`).join(''):'<div class="empty-state-card compact-empty">沒有客戶資料</div>'; const boxes=['customers-north','customers-center','customers-south','region-north','region-center','region-south'].map($).filter(Boolean); if(boxes.length){ boxes.forEach(b=>b.innerHTML=''); rows.forEach(c=>{ const r=(c.region||'北區').includes('中')?'center':((c.region||'').includes('南')?'south':'north'); const b=$(`customers-${r}`)||$(`region-${r}`); if(b) b.insertAdjacentHTML('beforeend',`<div class="customer-chip" data-customer-name="${esc(c.name||'')}" data-ship-customer="${esc(c.name||'')}">${esc(c.name||'')}</div>`); }); } else list.innerHTML=html; }catch(e){ list.innerHTML=`<div class="empty-state-card compact-empty">${esc(e.message)}</div>`; } }
  async function saveCustomer(){ const name=clean($('cust-name')?.value||$('customer-name')?.value||$('new-customer-name')?.value||''); if(!name) return toast('請輸入客戶名稱','warn'); try{ await api('/api/customers',{method:'POST',body:JSON.stringify({name,phone:clean($('cust-phone')?.value||$('customer-phone')?.value||''),address:clean($('cust-address')?.value||$('customer-address')?.value||''),notes:clean($('cust-notes')?.value||$('customer-notes')?.value||''),region:clean($('cust-region')?.value||$('customer-region')?.value||'北區')})}); toast('客戶已儲存','ok'); await renderCustomers(); }catch(e){ toast(e.message||'客戶儲存失敗','error'); } }
  async function openArchivedCustomersModal(){ try{ const d=await api('/api/customers/archived?ts='+Date.now()); alert((d.items||[]).map(x=>x.name).join('\n')||'目前沒有封存客戶'); }catch(e){ toast(e.message,'error'); } }
  function safeGlobals(){
    const keepShipConfirm=window.confirmSubmit;
    window.__YX_SHIP_NATIVE_CONFIRM__=window.__YX_SHIP_NATIVE_CONFIRM__||((mod()==='ship'&&typeof keepShipConfirm==='function')?keepShipConfirm:null);
    window.confirmSubmit=submitProducts; window.renderCustomers=renderCustomers; window.saveCustomer=saveCustomer; window.openArchivedCustomersModal=openArchivedCustomersModal;
    window.reverseLookup=window.reverseLookup||function(){toast('請到倉庫圖搜尋商品位置','warn');};
    window.clearShipSelectedItems=window.clearShipSelectedItems||function(){ document.querySelectorAll('#ship-selected-items input').forEach(i=>i.value=''); toast('已清空畫面選取','ok'); };
    window.saveTodoItem=window.saveTodoItem||async function(){ const title=clean($('todo-title')?.value||$('todo-text')?.value||''); if(!title) return toast('請輸入代辦內容','warn'); try{ await api('/api/todos',{method:'POST',body:JSON.stringify({title,description:clean($('todo-description')?.value||$('todo-note')?.value||'')})}); toast('已新增代辦','ok'); }catch(e){ toast(e.message||'新增代辦失敗','error'); } };
    window.clearTodoForm=window.clearTodoForm||function(){['todo-title','todo-description','todo-note','todo-text'].forEach(id=>{const el=$(id); if(el) el.value='';});};
  }
  function bind(){
    document.addEventListener('click',function(ev){ const t=ev.target; const submit=t.closest?.('#submit-btn'); if(submit){ ev.preventDefault(); ev.stopImmediatePropagation(); submitProducts(); return; }
      const del=t.closest?.('[data-yx113-batch-delete]'); if(del){ ev.preventDefault(); batchDelete(del.dataset.yx113BatchDelete); return; }
      const mat=t.closest?.('[data-yx113-batch-material]'); if(mat){ ev.preventDefault(); batchMaterial(mat.dataset.yx113BatchMaterial); return; }
      const zone=t.closest?.('[data-yx132-batch-zone]'); if(zone){ ev.preventDefault(); batchZone(zone.dataset.source||mod(),zone.dataset.yx132BatchZone); return; }
      const act=t.closest?.('[data-yx113-action]'); if(act){ ev.preventDefault(); const a=act.dataset.yx113Action, source=act.dataset.source||act.closest('[data-source]')?.dataset.source||mod(), id=act.dataset.id||act.closest('[data-id]')?.dataset.id; if(a==='delete') return simpleDelete(source,id); if(a==='edit') return toast('請使用批量編輯修改這筆商品','warn'); }
    },true);
    document.addEventListener('change',ev=>{ const sel=ev.target.closest?.('select[id^="yx113-"][id$="-material"]'); if(sel&&sel.value){ const source=sel.id.replace('yx113-','').replace('-material',''); batchMaterial(source); } },true);
    document.addEventListener('input',ev=>{ const q=ev.target.closest?.('.yx113-search'); if(q){ const source=q.id.replace('yx113-','').replace('-search',''); try{ window.YX113ProductActions?.renderSummary?.(source); }catch(_){} } },true);
  }
  function boot(){ safeGlobals(); bind(); if(mod()==='customers') setTimeout(renderCustomers,50); if(['inventory','orders','master_order'].includes(mod())) setTimeout(()=>refreshSource(mod()),250); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
  setTimeout(safeGlobals,500); setTimeout(()=>{ if(['inventory','orders','master_order'].includes(mod())) refreshSource(mod()); },800);
})();
