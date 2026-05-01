(function(){
  if(window.__YX_PACK12_FINAL__) return; window.__YX_PACK12_FINAL__=true;
  document.documentElement.classList.add('yx-pack12-ready');
  document.documentElement.dataset.yxFinalSeal='pack12';
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
  function toast(msg,type){let el=$('.yx-pack12-toast'); if(!el){el=document.createElement('div');el.className='yx-pack12-toast';document.body.appendChild(el);} el.textContent=msg||'完成'; el.style.background=type==='error'?'#991b1b':'#111827'; clearTimeout(el._t); el._t=setTimeout(()=>el.remove(),2400);}
  window.yxToast=toast;
  async function api(url,opt={}){const res=await fetch(url,Object.assign({headers:{'Content-Type':'application/json'}},opt)); let data={}; try{data=await res.json()}catch(e){data={}} if(!res.ok||data.success===false||data.ok===false) throw new Error(data.error||data.message||('HTTP '+res.status)); return data;}
  window.yxApi=window.yxApi||api; window.yxSafeFetch=window.yxSafeFetch||api;
  const norm=s=>String(s||'').replace(/[×ＸX✕＊*]/g,'x').replace(/＝/g,'=').replace(/[，,；;＋]/g,'+').replace(/[ \t]+/g,' ').trim();
  function findShipText(){return $('#shipProductTextarea')||$('#shippingItemsText')||$('#shipItemsText')||$('textarea[name="items"]')||$('textarea[name="product_text"]')||$$('textarea').find(t=>/商品|出貨|product|item/i.test((t.id||'')+(t.name||'')+(t.placeholder||'')))||$('textarea');}
  function appendShip(text){const ta=findShipText(); if(!ta||!text) return false; const line=norm(text); if(!line) return false; const cur=(ta.value||'').trim(); ta.value=cur?cur+'\n\n'+line:line; ta.dispatchEvent(new Event('input',{bubbles:true})); ta.dispatchEvent(new Event('change',{bubbles:true})); toast('已加入商品資料'); return true;}
  window.yxAppendShippingText=appendShip; window.yxPack12AppendShipItem=appendShip;
  function optText(opt){return (opt.dataset.full||opt.dataset.fullText||opt.dataset.productText||opt.dataset.label||opt.getAttribute('title')||opt.textContent||opt.value||'').replace(/^(請選擇|選擇商品)[:：]?/,'').trim();}
  function bindShipDropdown(){ $$('select').forEach(sel=>{const hint=(sel.id||'')+' '+(sel.name||'')+' '+(sel.className||'')+' '+(sel.getAttribute('aria-label')||'')+' '+(sel.closest('label')?.textContent||''); if(!/ship|shipping|出貨|商品|product|item|下拉|選擇/i.test(hint)) return; if(sel.dataset.yxPack12Ship) return; sel.dataset.yxPack12Ship='1'; sel.addEventListener('change',()=>{const opt=sel.selectedOptions&&sel.selectedOptions[0]; if(!opt||!opt.value) return; const txt=optText(opt); if(/x|=|件|材質|A區|B區|總單|訂單|庫存|來源/i.test(txt)) appendShip(txt);},true); }); }
  function hideShipTables(){const isShip=/ship|shipping|出貨/.test(location.pathname+' '+document.title+' '+(document.body.dataset.module||'')); if(!isShip) return; $$('table').forEach(tbl=>{const tx=tbl.textContent||''; if(/材質/.test(tx)&&/尺寸/.test(tx)&&/操作/.test(tx)&&!/出貨查詢/.test(tx)) tbl.classList.add('yx-ship-table-hidden');});}
  function markTradeTags(){ $$('span,div,td,b,strong').forEach(el=>{const tx=(el.textContent||'').trim(); if(/^(FOB|CNF|FOB代付|FOB代)$/.test(tx)) el.classList.add('yx-trade-tag'); }); }
  function noDouble(){ $$('button,form').forEach(el=>{if(el.dataset.yxPack12NoDouble) return; el.dataset.yxPack12NoDouble='1'; const ev=el.tagName==='FORM'?'submit':'click'; el.addEventListener(ev,(e)=>{if(el.dataset.yxBusy==='1'){e.preventDefault();e.stopPropagation();return false;} el.dataset.yxBusy='1'; setTimeout(()=>{el.dataset.yxBusy='0'},1600);},true);}); }
  function mobilePatch(){ $$('button,.btn,input,select,textarea').forEach(el=>{el.style.minHeight=el.style.minHeight||'44px'}); $$('table').forEach(t=>{if(t.parentElement&&/table-wrap|yx-pack12-table-wrap/i.test(t.parentElement.className)) return; const w=document.createElement('div'); w.className='table-wrap yx-pack12-table-wrap'; t.parentNode.insertBefore(w,t); w.appendChild(t);}); }
  window.addEventListener('unhandledrejection',e=>{const host=$('main')||$('.page-shell')||document.body; const d=document.createElement('div'); d.className='yx-pack12-error'; d.textContent='錯誤：'+(e.reason?.message||e.reason||'未知錯誤'); host.prepend(d); setTimeout(()=>d.remove(),6000);});
  function boot(){bindShipDropdown();hideShipTables();markTradeTags();noDouble();mobilePatch();}
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
  document.addEventListener('yx:pagechange',boot); setInterval(boot,5000);
})();
