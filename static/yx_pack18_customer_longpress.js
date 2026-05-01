/* PACK18 customer long-press operation sheet for orders/master order */
(function(){
  'use strict';
  const $=(id)=>document.getElementById(id);
  const $$=(sel,root=document)=>Array.from(root.querySelectorAll(sel));
  const clean=(s)=>String(s||'').replace(/\s+/g,' ').trim();
  const page=()=>document.querySelector('.module-screen')?.dataset?.module || document.body.dataset?.module || '';
  const api=window.api || (async (url,opt={})=>{const r=await fetch(url,{headers:{'Content-Type':'application/json'},credentials:'same-origin',...opt}); const d=await r.json().catch(()=>({})); if(!r.ok||d.ok===false||d.success===false) throw new Error(d.error||d.message||'API錯誤'); return d;});
  const toast=window.toast || ((m)=>alert(m));
  const esc=(s)=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

  function extractName(el){
    const ds=el.dataset||{};
    if(ds.customerName) return clean(ds.customerName);
    let clone=el.cloneNode(true);
    clone.querySelectorAll('.yx-cust-count,.pill,.tag,.yx-term,.yx-cnf,.yx-terms,.yx-customer-term,.count,.muted').forEach(x=>x.remove());
    let t=clean(clone.textContent||el.textContent||'');
    t=t.replace(/\d+\s*件\s*\/\s*\d+\s*筆/g,'');
    t=t.replace(/\b(CNF|FOB代|FOB)\b/ig,'');
    t=t.replace(/\s+/g,' ').trim();
    return t;
  }

  function moduleTable(){
    const m=page();
    if(m==='orders') return 'orders';
    if(m==='master_order' || m==='master_orders') return 'master_orders';
    return '';
  }

  function regionOf(el){
    return el.closest('[data-region]')?.dataset?.region || '北區';
  }

  function closeMenu(){ document.querySelectorAll('.yx18-menu,.yx18-backdrop').forEach(e=>e.remove()); }

  async function refreshAfter(name){
    try{
      if(typeof window.loadRegions==='function') await window.loadRegions(page());
    }catch(e){}
    try{
      if(typeof window.refreshPageData==='function') await window.refreshPageData();
    }catch(e){}
    try{
      const c=$('customer-name'); if(c && clean(c.value)===name && typeof window.selectCustomer==='function') await window.selectCustomer(name);
    }catch(e){}
    try{
      const target=$('selected-customer-items') || document.querySelector('.yx-customer-table-panel,.yx-table-wrap');
      if(target) target.scrollIntoView({behavior:'smooth',block:'start'});
    }catch(e){}
  }

  async function editCustomer(name, currentRegion){
    const newName=prompt('編輯客戶名稱', name);
    if(!newName || clean(newName)===name) return;
    try{
      await api('/api/customer-action/edit',{method:'POST',body:JSON.stringify({old_name:name,new_name:clean(newName),region:currentRegion,module:page()})});
      const c=$('customer-name'); if(c && clean(c.value)===name) c.value=clean(newName);
      toast('客戶已更新');
      await refreshAfter(clean(newName));
      if(typeof window.selectCustomer==='function') setTimeout(()=>window.selectCustomer(clean(newName)),80);
    }catch(e){ toast(e.message||'編輯失敗'); }
  }

  async function moveCustomer(name, region){
    try{
      await api('/api/customer-action/move',{method:'POST',body:JSON.stringify({name,region,module:page()})});
      toast('已移到'+region);
      await refreshAfter(name);
    }catch(e){ toast(e.message||'移區失敗'); }
  }

  async function deleteCustomer(name){
    const table=moduleTable();
    const label=table==='orders'?'訂單':(table==='master_orders'?'總單':'此頁');
    if(!confirm(`確定刪除「${name}」在${label}的客戶資料與商品？\n刪除後會立即刷新。`)) return;
    try{
      await api('/api/customer-action/delete',{method:'POST',body:JSON.stringify({name,module:page(),table})});
      const c=$('customer-name'); if(c && clean(c.value)===name) c.value='';
      const items=$('selected-customer-items'); if(items){items.classList.add('hidden'); items.innerHTML='';}
      toast('已刪除並刷新');
      await refreshAfter('');
    }catch(e){ toast(e.message||'刪除失敗'); }
  }

  function openMenu(el,ev){
    const m=page();
    if(!['orders','master_order','master_orders'].includes(m)) return;
    const name=extractName(el);
    if(!name || name==='無') return;
    closeMenu();
    const reg=regionOf(el);
    const back=document.createElement('div');
    back.className='yx18-backdrop';
    back.addEventListener('click',closeMenu);
    const menu=document.createElement('div');
    menu.className='yx18-menu';
    menu.innerHTML=`
      <div class="yx18-title">${esc(name)}</div>
      <button data-act="open">打開客戶商品</button>
      <button data-act="edit">編輯客戶</button>
      <div class="yx18-sub">移動到別區</div>
      <button data-act="move" data-region="北區">移到北區</button>
      <button data-act="move" data-region="中區">移到中區</button>
      <button data-act="move" data-region="南區">移到南區</button>
      <button data-act="delete" class="danger">刪除客戶</button>
      <button data-act="close">關閉</button>`;
    document.body.append(back,menu);
    const x=Math.min((ev?.clientX||window.innerWidth/2), window.innerWidth-270);
    const y=Math.min((ev?.clientY||window.innerHeight/2), window.innerHeight-360);
    menu.style.left=Math.max(12,x)+'px'; menu.style.top=Math.max(12,y)+'px';
    menu.addEventListener('click',async e=>{
      const b=e.target.closest('button'); if(!b) return;
      const act=b.dataset.act;
      if(act==='close'){closeMenu(); return;}
      closeMenu();
      if(act==='open'){ if(typeof window.selectCustomer==='function') await window.selectCustomer(name); refreshAfter(name); return; }
      if(act==='edit') return editCustomer(name,reg);
      if(act==='move') return moveCustomer(name,b.dataset.region);
      if(act==='delete') return deleteCustomer(name);
    });
  }

  function bindCustomerButtons(root=document){
    if(!['orders','master_order','master_orders'].includes(page())) return;
    $$('#region-north .customer-chip,#region-center .customer-chip,#region-south .customer-chip,#region-north .customer-card,#region-center .customer-card,#region-south .customer-card,#region-north button,#region-center button,#region-south button',root).forEach(el=>{
      if(el.dataset.yx18Bound) return;
      const nm=extractName(el); if(!nm || nm==='無') return;
      el.dataset.yx18Bound='1'; el.dataset.customerName=nm;
      let timer=null, moved=false;
      const clear=()=>{ if(timer){clearTimeout(timer); timer=null;} };
      el.addEventListener('pointerdown',ev=>{ moved=false; clear(); timer=setTimeout(()=>{ if(!moved) openMenu(el,ev);},520); });
      el.addEventListener('pointermove',()=>{ moved=true; clear(); });
      el.addEventListener('pointerup',clear);
      el.addEventListener('pointercancel',clear);
      el.addEventListener('contextmenu',ev=>{ ev.preventDefault(); openMenu(el,ev); });
      el.title='點一下打開商品；長按/右鍵可編輯、移區、刪除';
    });
  }

  let _yx18t=null; const mo=new MutationObserver(()=>{clearTimeout(_yx18t); _yx18t=setTimeout(bindCustomerButtons,180);});
  document.addEventListener('DOMContentLoaded',()=>{
    bindCustomerButtons();
    const rg=$('region-picker-section'); if(rg) mo.observe(rg,{childList:true,subtree:true});
  });
  document.addEventListener('click',e=>{
    const el=e.target.closest('#region-north button,#region-center button,#region-south button,.customer-chip,.customer-card');
    if(el && ['orders','master_order','master_orders'].includes(page())) setTimeout(()=>bindCustomerButtons(),60);
  },true);
  window.yx18BindCustomerLongPress=bindCustomerButtons;
})();
