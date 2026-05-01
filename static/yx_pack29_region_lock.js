/* PACK29: order/master customer region lock. Prevent cards from jumping back to 北區. */
(function(){
  'use strict';
  const $=(id)=>document.getElementById(id);
  const $$=(sel,root=document)=>Array.from(root.querySelectorAll(sel));
  const clean=(s)=>String(s||'').replace(/\s+/g,' ').trim();
  const page=()=>document.querySelector('.module-screen')?.dataset?.module || document.body.dataset?.module || '';
  const api=window.api || (async (url,opt={})=>{const r=await fetch(url,{headers:{'Content-Type':'application/json'},credentials:'same-origin',...opt}); const d=await r.json().catch(()=>({})); if(!r.ok||d.ok===false||d.success===false) throw new Error(d.error||d.message||'API錯誤'); return d;});
  const toast=window.toast || ((m)=>{let t=$('clean-toast'); if(t){t.textContent=m;t.classList.remove('hidden');clearTimeout(window.__yx29Toast);window.__yx29Toast=setTimeout(()=>t.classList.add('hidden'),1500);}else console.log(m);});
  const esc=(s)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const regionHost=(r)=>({'北區':'region-north','中區':'region-center','南區':'region-south'}[r]||'region-north');
  function isRegionPage(){return ['orders','master_order','master_orders','ship'].includes(page());}
  function customerCard(x){
    const terms=(x.terms||[]).join('/');
    const name=x.display_name||x.name||'';
    return `<button type="button" class="customer-chip customer-card yx29-region-card" data-customer="${esc(x.name||name)}" data-customer-name="${esc(x.name||name)}" onclick="selectCustomer('${String(x.name||name).replace(/'/g,"\\'")}')"><span class="cust-name">${esc(name)}</span><span class="cust-term">${esc(terms)}</span><span class="cust-count">${Number(x.qty||0)}件 / ${Number(x.count||0)}筆</span></button>`;
  }
  async function renderRegions29(){
    if(!isRegionPage()) return;
    const mod=page()==='master_orders'?'master_order':page();
    const d=await api('/api/regions/'+encodeURIComponent(mod)+'?pack29=1&ts='+Date.now());
    ['北區','中區','南區'].forEach(region=>{
      const host=$(regionHost(region));
      if(!host) return;
      const arr=(d.details&&d.details[region])||[];
      host.innerHTML=arr.length?arr.map(customerCard).join(''):'<span class="muted">無</span>';
    });
    if(typeof window.yx18BindCustomerLongPress==='function') setTimeout(()=>window.yx18BindCustomerLongPress(),50);
  }
  window.yx29RenderRegions=renderRegions29;

  document.addEventListener('click', async function(ev){
    const btn=ev.target.closest('.yx18-menu button[data-act="move"]');
    if(!btn || !isRegionPage()) return;
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();
    const menu=btn.closest('.yx18-menu');
    const name=clean(menu?.querySelector('.yx18-title')?.textContent || menu?.dataset?.customer || '');
    const region=btn.dataset.region || '北區';
    if(!name) return toast('找不到客戶名稱');
    try{
      await api('/api/customer-action/move',{method:'POST',body:JSON.stringify({name,region,module:page()})});
      $$('.yx18-menu,.yx18-backdrop').forEach(x=>x.remove());
      await renderRegions29();
      toast('已移到'+region);
      setTimeout(renderRegions29,300); // final guard against old delayed redraw
    }catch(e){toast(e.message||'移區失敗');}
  }, true);

  document.addEventListener('DOMContentLoaded',()=>{ if(isRegionPage()) setTimeout(renderRegions29,250); });
})();
