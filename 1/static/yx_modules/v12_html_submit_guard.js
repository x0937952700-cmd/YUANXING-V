/* V12 HTML 直接送出保護：最後載入、捕獲確認送出、POST 後強制重畫表格 */
(function(){
  'use strict';
  const VERSION='v12-html-submit-guard-20260502';
  window.__YX_V12_HTML_SUBMIT_GUARD__=VERSION;
  const $=id=>document.getElementById(id);
  const clean=v=>String(v??'').trim();
  const screen=()=>document.querySelector('.module-screen[data-module]');
  const mod=()=>screen()?.dataset.module||'';
  const endpoint=m=>m==='inventory'?'/api/inventory':m==='orders'?'/api/orders':m==='master_order'?'/api/master_orders':'';
  const ui=m=>m==='master_orders'?'master_order':m;
  function toast(msg,type){
    try{ if(window.YXHardLock&&typeof window.YXHardLock.toast==='function') return window.YXHardLock.toast(msg,type||'info'); }catch(_){ }
    let box=$('yx-v12-toast');
    if(!box){ box=document.createElement('div'); box.id='yx-v12-toast'; box.style.cssText='position:fixed;z-index:999999;top:14px;right:14px;max-width:78vw;padding:12px 14px;border-radius:14px;background:#111827;color:#fff;box-shadow:0 10px 25px rgba(0,0,0,.2);font-weight:800;'; document.body.appendChild(box); }
    box.textContent=msg; box.style.display='block'; clearTimeout(box._t); box._t=setTimeout(()=>box.style.display='none',2600);
  }
  async function api(url,opt={}){
    const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...opt,headers:{'Content-Type':'application/json','Accept':'application/json',...(opt.headers||{})}});
    const text=await r.text(); let d={};
    try{ d=text?JSON.parse(text):{}; }catch(e){ throw new Error('API 沒有回 JSON，可能尚未登入或 Render 還在跑舊版'); }
    if(!r.ok||d.success===false) throw new Error(d.error||d.message||('HTTP '+r.status));
    return d;
  }
  function norm(s){ return clean(s).replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/\s+/g,''); }
  function qty(text){
    const raw=norm(text); if(!raw) return 0;
    const right=raw.includes('=')?raw.split('=').slice(1).join('='):raw;
    const parts=right.split('+').map(clean).filter(Boolean); if(!parts.length) return 1;
    let total=0, hit=false;
    for(const p of parts){ const m=p.match(/x(\d+)$/i); if(m){ total+=Number(m[1]||0); hit=true; } else if(/\d/.test(p)){ total+=1; hit=true; } }
    return hit?total:1;
  }
  function splitLine(line){
    line=clean(line); if(!line) return null;
    const mm=line.match(/^([A-Za-z\u4e00-\u9fff]{1,10})\s+(.+?=.+)$/);
    let material='', product=line;
    if(mm && !/^\d/.test(mm[1])){ material=mm[1].toUpperCase(); product=mm[2]; }
    product=norm(product); if(!product || !product.includes('=')) return null;
    return {product_text:product, product_code:material, material, qty:qty(product)};
  }
  function parse(text){ return clean(text).split(/\n+/).map(splitLine).filter(x=>x&&x.product_text&&x.qty>0); }
  function customerFromText(text){
    const lines=clean(text).split(/\n+/).map(clean).filter(Boolean);
    if(lines.length>1 && !/[=]/.test(lines[0]) && !/\d+x\d+/i.test(lines[0])) return lines[0];
    return clean($('customer-name')?.value||window.__YX_SELECTED_CUSTOMER__||'');
  }
  function esc(s){ return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
  function materialOf(r){ return clean(r.material||r.product_code||'未填材質'); }
  function productSize(t){ return norm(t).split('=')[0]||t||''; }
  function support(t){ return norm(t).split('=').slice(1).join('=')||''; }
  function rowQty(r){ return Number(r.qty||qty(r.product_text||'')); }
  function sameCustomer(a,b){ a=clean(a); b=clean(b); if(!a||!b) return false; return a===b || a.replace(/\s+/g,'')===b.replace(/\s+/g,''); }
  function render(source,rows,customer){
    source=ui(source); rows=Array.isArray(rows)?rows:[]; customer=clean(customer||$('customer-name')?.value||window.__YX_SELECTED_CUSTOMER__||'');
    const box=$(`yx113-${source}-summary`); if(!box) return;
    let shown=rows.slice();
    if((source==='orders'||source==='master_order') && customer) shown=shown.filter(r=>sameCustomer(r.customer_name,customer));
    const total=shown.reduce((s,r)=>s+rowQty(r),0);
    const title=source==='inventory'?'庫存清單':source==='orders'?'訂單清單':'總單清單';
    const body=shown.length?shown.map(r=>`<tr class="yx113-summary-row" data-source="${esc(source)}" data-id="${esc(r.id||'')}"><td><input class="yx113-row-check" type="checkbox" data-source="${esc(source)}" data-id="${esc(r.id||'')}"> ${esc(materialOf(r))}</td><td>${esc(productSize(r.product_text||''))}</td><td>${esc(support(r.product_text||''))}</td><td>${rowQty(r)}</td><td>${esc(r.location||r.zone||'未分區')}</td><td><button class="ghost-btn tiny-btn" type="button" data-yx113-action="edit" data-source="${esc(source)}" data-id="${esc(r.id||'')}">編輯</button><button class="ghost-btn tiny-btn danger-btn" type="button" data-yx113-action="delete" data-source="${esc(source)}" data-id="${esc(r.id||'')}">刪除</button></td></tr>`).join(''):'<tr><td colspan="6">目前沒有資料</td></tr>';
    box.innerHTML=`<div class="yx113-summary-head yx128-summary-head"><div class="yx132-summary-title">${source==='inventory'?'<span class="yx132-customer-tag">庫存</span>':(customer?`<span class="yx132-customer-tag">${esc(customer)}</span>`:'')}<strong>${total}件 / ${shown.length}筆</strong><span>${title}｜V12 HTML 直連</span></div></div><div class="yx113-table-wrap"><table class="yx113-table yx128-inline-table"><thead><tr><th>材質</th><th>尺寸</th><th>支數 x 件數</th><th>總數量</th><th>A/B區</th><th>操作</th></tr></thead><tbody>${body}</tbody></table></div>`;
  }
  async function refresh(source,customer){
    source=ui(source||mod()); const ep=endpoint(source); if(!ep) return [];
    const d=await api(ep+'?v12='+Date.now(),{method:'GET'}); const rows=Array.isArray(d.items)?d.items:(Array.isArray(d.rows)?d.rows:[]);
    render(source,rows,customer); return rows;
  }
  async function submit(){
    const source=mod(); if(!['inventory','orders','master_order'].includes(source)) return;
    const ep=endpoint(source), ta=$('ocr-text'), btn=$('submit-btn');
    const text=clean(ta?.value||''); if(!text) return toast('請輸入商品資料','warn');
    const items=parse(text); if(!items.length) return toast('商品格式無法辨識，請確認例如：111x111x111=111','warn');
    const customer=source==='inventory'?clean($('customer-name')?.value||''):customerFromText(text);
    if(source!=='inventory'&&!customer) return toast('請輸入客戶名稱','warn');
    const old=btn?.textContent||'確認送出';
    try{
      if(btn){btn.disabled=true;btn.textContent='送出中…';}
      const d=await api(ep,{method:'POST',body:JSON.stringify({customer_name:customer,ocr_text:text,items,request_key:'v12_'+source+'_'+Date.now()+'_'+Math.random().toString(36).slice(2)})});
      if(ta) ta.value=''; if($('customer-name')&&customer) $('customer-name').value=customer;
      toast(`已新增 ${items.length} 筆商品`,'ok');
      if(Array.isArray(d.items)) render(source,d.items,customer);
      await refresh(source,customer);
      try{ window.dispatchEvent(new CustomEvent('yx:customer-selected',{detail:{name:customer}})); }catch(_){ }
    }catch(e){ toast(e.message||'送出失敗','error'); console.error('[V12 submit failed]',e); }
    finally{ if(btn){btn.disabled=false;btn.textContent=old;} }
  }
  function bind(){
    window.confirmSubmit=submit;
    window.__YX_V12_REFRESH__=refresh;
    document.addEventListener('click',function(ev){
      const btn=ev.target.closest&&ev.target.closest('#submit-btn');
      if(btn && ['inventory','orders','master_order'].includes(mod())){ ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation&&ev.stopImmediatePropagation(); submit(); return false; }
    },true);
    if(['inventory','orders','master_order'].includes(mod())) setTimeout(()=>refresh(mod()).catch(e=>console.warn('[V12 refresh]',e)),250);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',bind,{once:true}); else bind();
  setTimeout(()=>{ window.confirmSubmit=submit; },800);
  setTimeout(()=>{ window.confirmSubmit=submit; },1800);
})();
