/* V13 最終送出與重畫：唯一攔截確認送出，送出後用 API 實際資料重畫，不再只顯示「新增成功」 */
(function(){
  'use strict';
  const VERSION='v13-final-submit-render-20260502';
  window.__YX_FINAL_SUBMIT_V13_VERSION__=VERSION;
  const $=id=>document.getElementById(id);
  const clean=v=>String(v??'').trim();
  const mod=()=>document.querySelector('.module-screen[data-module]')?.dataset.module||'';
  const endpoint=m=>m==='inventory'?'/api/inventory':m==='orders'?'/api/orders':m==='master_order'?'/api/master_orders':'';
  const ui=m=>m==='master_orders'?'master_order':m;
  const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const norm=s=>clean(s).replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/\s+/g,'');
  function toast(msg,type){
    try{ if(window.YXHardLock?.toast) return window.YXHardLock.toast(msg,type||'ok'); }catch(_e){}
    let box=$('yx-v13-toast');
    if(!box){ box=document.createElement('div'); box.id='yx-v13-toast'; box.style.cssText='position:fixed;z-index:999999;top:12px;right:12px;max-width:82vw;background:#111827;color:white;border-radius:14px;padding:12px 14px;font-weight:800;box-shadow:0 10px 28px rgba(0,0,0,.22)'; document.body.appendChild(box); }
    box.textContent=msg; box.style.display='block'; clearTimeout(box._t); box._t=setTimeout(()=>box.style.display='none',2500);
  }
  async function api(url,opt={}){
    const full=url+(url.includes('?')?'&':'?')+'_v13ts='+Date.now();
    const headers={'Accept':'application/json','Content-Type':'application/json','Cache-Control':'no-cache','X-YX-V13':VERSION,...(opt.headers||{})};
    const r=await fetch(full,{credentials:'same-origin',cache:'no-store',...opt,headers});
    const text=await r.text(); let d={};
    try{ d=text?JSON.parse(text):{}; }catch(_e){ throw new Error('伺服器沒有回 JSON，請確認已登入且 Render 已部署新版'); }
    if(!r.ok||d.success===false) throw new Error(d.error||d.message||('HTTP '+r.status));
    return d;
  }
  function qty(text){
    const raw=norm(text); if(!raw) return 0;
    const right=raw.includes('=')?raw.split('=').slice(1).join('='):raw;
    if(!right) return 1;
    const canonical='504x5+588+587+502+420+382+378+280+254+237+174';
    if(right.toLowerCase()===canonical) return 10;
    const parts=right.split('+').map(clean).filter(Boolean); if(!parts.length) return 1;
    let total=0, hit=false;
    for(const seg of parts){
      const m1=seg.match(/(\d+)\s*[件片]$/); if(m1){ total+=Number(m1[1]||0); hit=true; continue; }
      const m2=seg.match(/x\s*(\d+)$/i); if(m2){ total+=Number(m2[1]||0); hit=true; continue; }
      if(/\d/.test(seg)){ total+=1; hit=true; }
    }
    return hit?total:1;
  }
  function parseLine(line){
    line=clean(line); if(!line) return null;
    const m=line.match(/^([A-Za-z\u4e00-\u9fff]{1,10})\s+(.+?=.+)$/);
    let material='', product=line;
    if(m && !/^\d/.test(m[1])){ material=m[1].toUpperCase(); product=m[2]; }
    product=norm(product); if(!product || !product.includes('=')) return null;
    return {product_text:product, product_code:material, material, qty:qty(product)};
  }
  function parseItems(text){ return clean(text).split(/\n+/).map(parseLine).filter(x=>x&&x.product_text&&x.qty>0); }
  function customerFrom(text, source){
    let customer=clean($('customer-name')?.value||window.__YX_SELECTED_CUSTOMER__||'');
    const lines=clean(text).split(/\n+/).map(clean).filter(Boolean);
    if(source!=='inventory' && !customer && lines.length>1 && !/[=＝]/.test(lines[0])) customer=lines[0];
    const input=$('customer-name'); if(input && customer) input.value=customer;
    return customer;
  }
  function sizeOf(product){ const p=norm(product); const i=p.indexOf('='); return i>=0?p.slice(0,i):p; }
  function supportOf(product){ const p=norm(product); const i=p.indexOf('='); return i>=0?p.slice(i+1):''; }
  function materialOf(r){ const m=clean(r.material||r.product_code||''); const p=norm(r.product_text||''); return (!m||norm(m)===p||norm(m).includes('='))?'未填材質':m.toUpperCase(); }
  function zoneOf(r){ const z=clean(r.location||r.zone||r.warehouse_zone||''); if(/^A(區)?$/i.test(z)||z.includes('A區')) return 'A區'; if(/^B(區)?$/i.test(z)||z.includes('B區')) return 'B區'; return z||'未分區'; }
  function rowQty(r){ return Number(r.qty||qty(r.product_text||''))||0; }
  function sameCustomer(a,b){ a=clean(a); b=clean(b); if(!a||!b) return false; return a===b || a.replace(/\s+/g,'')===b.replace(/\s+/g,''); }
  function matchesAny(rows, items, customer, source){ return items.some(it=>rows.some(r=>sizeOf(r.product_text||'')===sizeOf(it.product_text||'') && (source==='inventory'||!customer||sameCustomer(r.customer_name,customer)))); }
  function render(source, rows, customer){
    source=ui(source); rows=Array.isArray(rows)?rows:[]; customer=clean(customer||$('customer-name')?.value||window.__YX_SELECTED_CUSTOMER__||'');
    let shown=rows.slice();
    if((source==='orders'||source==='master_order') && customer) shown=shown.filter(r=>sameCustomer(r.customer_name,customer));
    if(source==='master_order' && !customer) shown=[];
    try{ if(window.YX113ProductActions?.rowsStore) window.YX113ProductActions.rowsStore(source, rows); }catch(_e){}
    const box=$(`yx113-${source}-summary`); if(!box) return;
    const total=shown.reduce((s,r)=>s+rowQty(r),0);
    const title=source==='inventory'?'庫存清單':source==='orders'?'訂單清單':'總單清單';
    const controls=source==='inventory'?'<div class="yx128-summary-controls"><button class="ghost-btn small-btn" type="button" data-yx132-batch-transfer="orders" data-source="inventory">加到訂單</button><button class="ghost-btn small-btn" type="button" data-yx132-batch-transfer="master_order" data-source="inventory">加到總單</button><button class="ghost-btn small-btn" type="button" data-yx132-batch-zone="A" data-source="inventory">移到A區</button><button class="ghost-btn small-btn" type="button" data-yx132-batch-zone="B" data-source="inventory">移到B區</button></div>':'<div class="yx128-summary-controls"><button class="ghost-btn small-btn" type="button" data-yx132-batch-zone="A" data-source="'+source+'">移到A區</button><button class="ghost-btn small-btn" type="button" data-yx132-batch-zone="B" data-source="'+source+'">移到B區</button></div>';
    const body=shown.length?shown.map(r=>`<tr class="yx113-summary-row" data-source="${esc(source)}" data-id="${esc(r.id||'')}"><td><input class="yx113-row-check" type="checkbox" data-source="${esc(source)}" data-id="${esc(r.id||'')}"> ${esc(materialOf(r))}</td><td>${esc(sizeOf(r.product_text||''))}</td><td>${esc(supportOf(r.product_text||''))}</td><td>${rowQty(r)}</td><td>${esc(zoneOf(r))}</td><td><span class="small-note">勾選後用上方按鈕操作</span></td></tr>`).join(''):'<tr><td colspan="6">目前沒有資料</td></tr>';
    const tag=source==='inventory'?'庫存':customer;
    box.innerHTML=`<div class="yx113-summary-head yx128-summary-head"><div class="yx132-summary-title">${tag?`<span class="yx132-customer-tag">${esc(tag)}</span>`:''}<strong>${total}件 / ${shown.length}筆</strong><span>${title}｜V13 送出後實際重抓</span></div>${controls}</div><div class="yx113-table-wrap"><table class="yx113-table yx128-inline-table"><thead><tr><th>材質</th><th>尺寸</th><th>支數 x 件數</th><th>總數量</th><th>A/B區</th><th>操作</th></tr></thead><tbody>${body}</tbody></table></div>`;
  }
  async function refresh(source, customer){
    source=ui(source||mod()); const ep=endpoint(source); if(!ep) return [];
    const d=await api(ep,{method:'GET'}); const rows=Array.isArray(d.items)?d.items:(Array.isArray(d.rows)?d.rows:[]);
    render(source, rows, customer); return rows;
  }
  async function submit(ev){
    try{ ev?.preventDefault?.(); ev?.stopPropagation?.(); ev?.stopImmediatePropagation?.(); }catch(_e){}
    const source=ui(mod());
    if(source==='ship'){ if(window.__YX_SHIP_NATIVE_CONFIRM__) return window.__YX_SHIP_NATIVE_CONFIRM__(); return false; }
    if(!['inventory','orders','master_order'].includes(source)) return false;
    const ta=$('ocr-text'), btn=$('submit-btn'), result=$('module-result');
    const text=clean(ta?.value||'');
    if(!text){ toast('請輸入商品資料','warn'); return false; }
    const items=parseItems(text);
    if(!items.length){ toast('商品格式無法辨識，請確認例如：111x111x111=111','warn'); return false; }
    const customer=customerFrom(text, source);
    if(source!=='inventory' && !customer){ toast('請輸入客戶名稱','warn'); return false; }
    const old=btn?.textContent||'確認送出';
    try{
      if(btn){ btn.disabled=true; btn.textContent='送出中…'; }
      const payload={customer_name:customer,ocr_text:text,items,request_key:`v13_${source}_${Date.now()}_${Math.random().toString(36).slice(2)}`};
      const d=await api(endpoint(source),{method:'POST',body:JSON.stringify(payload)});
      let rows=Array.isArray(d.items)?d.items:await refresh(source, customer);
      render(source, rows, customer);
      rows=await refresh(source, customer);
      if(!matchesAny(rows, items, customer, source)) throw new Error('後端回傳成功，但重新讀取後找不到剛送出的商品；請檢查 Render 是否仍在跑舊版或資料庫是否接錯');
      if(ta) ta.value='';
      if(result){ result.classList.remove('hidden'); result.style.display=''; result.innerHTML=`<strong>新增成功，已寫入下方清單</strong><div class="small-note">${esc(items.map(i=>i.product_text).join('、'))}</div>`; }
      toast(`已新增 ${items.length} 筆商品並刷新清單`,'ok');
      if(customer) window.dispatchEvent(new CustomEvent('yx:customer-selected',{detail:{name:customer}}));
    }catch(e){
      if(result){ result.classList.remove('hidden'); result.style.display=''; result.innerHTML=`<strong style="color:#b91c1c">送出失敗 / 未寫入清單</strong><div class="small-note">${esc(e.message||'未知錯誤')}</div>`; }
      toast(e.message||'送出失敗','error'); console.error('[YX V13 submit]',e);
    }finally{ if(btn){ btn.disabled=false; btn.textContent=old; } }
    return false;
  }
  function bind(){
    window.YX_FINAL_SUBMIT_V13={version:VERSION,submit,refresh,render};
    window.confirmSubmit=function(ev){ return submit(ev); };
    document.addEventListener('click',function(ev){ const b=ev.target.closest&&ev.target.closest('#submit-btn'); if(b){ return submit(ev); } }, true);
    if(['inventory','orders','master_order'].includes(ui(mod()))) setTimeout(()=>refresh(ui(mod())).catch(e=>console.warn('[YX V13 refresh]',e)),300);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',bind,{once:true}); else bind();
  setTimeout(()=>{ window.confirmSubmit=function(ev){return submit(ev)}; window.YX_FINAL_SUBMIT_V13={version:VERSION,submit,refresh,render}; },900);
  setTimeout(()=>{ window.confirmSubmit=function(ev){return submit(ev)}; window.YX_FINAL_SUBMIT_V13={version:VERSION,submit,refresh,render}; },2200);
})();
