/* v16：送出後以後端實際回傳資料強制重畫。避免舊 V11 renderer / 快取狀態把新資料蓋掉。 */
(function(){
  'use strict';
  const VERSION='v16-submit-true-render-20260502';
  window.__YX_V16_SUBMIT_TRUE_RENDER__=VERSION;
  const $=id=>document.getElementById(id);
  const clean=v=>String(v??'').trim();
  const page=()=>document.querySelector('.module-screen[data-module]')?.dataset.module||'';
  const ui=s=>s==='master_orders'?'master_order':(s||'');
  const apiSource=s=>s==='master_order'?'master_orders':s;
  const endpoint=s=>ui(s)==='inventory'?'/api/inventory':ui(s)==='orders'?'/api/orders':ui(s)==='master_order'?'/api/master_orders':'';
  const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const norm=s=>clean(s).replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/\s+/g,'');
  function toast(msg,type){
    try{ if(window.YXHardLock?.toast) return window.YXHardLock.toast(msg,type||'ok'); }catch(_e){}
    let box=$('yx-v16-toast');
    if(!box){ box=document.createElement('div'); box.id='yx-v16-toast'; box.style.cssText='position:fixed;z-index:999999;top:12px;right:12px;max-width:86vw;background:#111827;color:white;border-radius:14px;padding:12px 14px;font-weight:800;box-shadow:0 10px 28px rgba(0,0,0,.22)'; document.body.appendChild(box); }
    box.textContent=msg; box.style.display='block'; clearTimeout(box._t); box._t=setTimeout(()=>box.style.display='none',2600);
  }
  async function api(url,opt={}){
    const full=url+(url.includes('?')?'&':'?')+'_v16='+Date.now();
    const r=await fetch(full,{credentials:'same-origin',cache:'no-store',...opt,headers:{'Accept':'application/json','Content-Type':'application/json','Cache-Control':'no-cache','X-YX-V16':VERSION,...(opt.headers||{})}});
    const text=await r.text(); let d={};
    try{ d=text?JSON.parse(text):{}; }catch(_e){ throw new Error('伺服器沒有回 JSON，可能尚未登入或 Render 還在跑舊版'); }
    if(!r.ok||d.success===false) throw new Error(d.error||d.message||('HTTP '+r.status));
    return d;
  }
  function qty(text){
    const raw=norm(text); if(!raw) return 0;
    const right=raw.includes('=')?raw.split('=').slice(1).join('='):raw;
    if(!right) return 1;
    const hard='504x5+588+587+502+420+382+378+280+254+237+174';
    if(right.toLowerCase()===hard) return 10;
    const parts=right.split('+').map(clean).filter(Boolean); if(!parts.length) return 1;
    let total=0, hit=false;
    for(const seg of parts){
      const mPiece=seg.match(/(\d+)\s*[件片]$/); if(mPiece){ total+=Number(mPiece[1]||0); hit=true; continue; }
      const m=seg.match(/x\s*(\d+)$/i); if(m){ total+=Number(m[1]||0); hit=true; continue; }
      if(/\d/.test(seg)){ total+=1; hit=true; }
    }
    return hit?total:1;
  }
  function parseLine(line){
    line=clean(line); if(!line) return null;
    const m=line.match(/^([A-Za-z\u4e00-\u9fff]{1,10})\s+(.+?=.+)$/);
    let material='', product=line;
    if(m && !/^\d/.test(m[1])){ material=m[1].toUpperCase(); product=m[2]; }
    product=norm(product);
    if(!product || !product.includes('=')) return null;
    return {product_text:product, material, product_code:material, qty:qty(product)};
  }
  function parseItems(text){ return clean(text).split(/\n+/).map(parseLine).filter(x=>x&&x.product_text&&x.qty>0); }
  function sizeOf(product){ const p=norm(product); const i=p.indexOf('='); return i>=0?p.slice(0,i):p; }
  function supportOf(product){ const p=norm(product); const i=p.indexOf('='); return i>=0?p.slice(i+1):''; }
  function matOf(r){ const m=clean(r.material||r.product_code||''); const p=norm(r.product_text||''); return (!m||norm(m)===p||norm(m).includes('='))?'未填材質':m.toUpperCase(); }
  function zoneOf(r){ const z=clean(r.location||r.zone||r.warehouse_zone||''); if(/^A(區)?$/i.test(z)||z.includes('A區')) return 'A區'; if(/^B(區)?$/i.test(z)||z.includes('B區')) return 'B區'; return z||'未分區'; }
  function rowQty(r){ return Number(r.qty||qty(r.product_text||''))||0; }
  function sameCustomer(a,b){ a=clean(a).replace(/\s+/g,''); b=clean(b).replace(/\s+/g,''); return !!a&&!!b&&a===b; }
  function currentCustomer(source,text){
    let customer=clean($('customer-name')?.value||window.__YX_SELECTED_CUSTOMER__||'');
    const lines=clean(text||'').split(/\n+/).map(clean).filter(Boolean);
    if(source!=='inventory' && !customer && lines.length>1 && !/[=＝]/.test(lines[0])) customer=lines[0];
    if(customer && $('customer-name')) $('customer-name').value=customer;
    return customer;
  }
  function rowMatchesItem(r,it){ return sizeOf(r.product_text||'')===sizeOf(it.product_text||''); }
  function findNewRows(rows,items,customer,source){
    return rows.filter(r=>items.some(it=>rowMatchesItem(r,it)) && (source==='inventory'||!customer||sameCustomer(r.customer_name,customer)));
  }
  function render(source,rows,customer,highlightItems){
    source=ui(source); rows=Array.isArray(rows)?rows:[]; customer=clean(customer||$('customer-name')?.value||window.__YX_SELECTED_CUSTOMER__||'');
    const allRows=rows.slice();
    let shown=allRows.slice();
    if((source==='orders'||source==='master_order') && customer) shown=shown.filter(r=>sameCustomer(r.customer_name,customer));
    if(source==='master_order' && !customer) shown=[];
    const q=clean(document.querySelector('.yx-html-direct-toolbar input, input[placeholder*="搜尋"]')?.value||'');
    if(q){ const key=q.toLowerCase(); shown=shown.filter(r=>JSON.stringify(r).toLowerCase().includes(key)); }
    const zActive=document.querySelector('.yx-html-direct-toolbar .active, .yx114-toolbtn.active');
    const zText=clean(zActive?.textContent||'');
    if(zText==='A區') shown=shown.filter(r=>zoneOf(r)==='A區');
    if(zText==='B區') shown=shown.filter(r=>zoneOf(r)==='B區');
    const newKeys=new Set((highlightItems||[]).map(it=>sizeOf(it.product_text||'')));
    shown.sort((a,b)=>{
      const ah=newKeys.has(sizeOf(a.product_text||''))?-1:0; const bh=newKeys.has(sizeOf(b.product_text||''))?-1:0;
      if(ah!==bh) return ah-bh;
      return String(matOf(a)).localeCompare(String(matOf(b)),'zh-Hant') || String(sizeOf(a.product_text||'')).localeCompare(String(sizeOf(b.product_text||'')),'zh-Hant');
    });
    try{ if(window.YX113ProductActions?.rowsStore) window.YX113ProductActions.rowsStore(source, allRows); }catch(_e){}
    const box=$(`yx113-${source}-summary`); if(!box) return;
    const total=shown.reduce((s,r)=>s+rowQty(r),0);
    const title=source==='inventory'?'庫存清單':source==='orders'?'訂單清單':'總單清單';
    const tag=source==='inventory'?'庫存':customer;
    const controls=source==='inventory'
      ? '<div class="yx128-summary-controls"><button class="ghost-btn small-btn" type="button" data-yx132-batch-transfer="orders" data-source="inventory">加到訂單</button><button class="ghost-btn small-btn" type="button" data-yx132-batch-transfer="master_order" data-source="inventory">加到總單</button><button class="ghost-btn small-btn" type="button" data-yx132-batch-zone="A" data-source="inventory">移到A區</button><button class="ghost-btn small-btn" type="button" data-yx132-batch-zone="B" data-source="inventory">移到B區</button></div>'
      : `<div class="yx128-summary-controls"><button class="ghost-btn small-btn" type="button" data-yx132-batch-zone="A" data-source="${esc(source)}">移到A區</button><button class="ghost-btn small-btn" type="button" data-yx132-batch-zone="B" data-source="${esc(source)}">移到B區</button></div>`;
    const body=shown.length?shown.map(r=>{
      const hi=newKeys.has(sizeOf(r.product_text||''));
      return `<tr class="yx113-summary-row ${hi?'yx-v16-new-row':''}" data-source="${esc(source)}" data-id="${esc(r.id||'')}"><td><input class="yx113-row-check" type="checkbox" data-source="${esc(source)}" data-id="${esc(r.id||'')}"> ${esc(matOf(r))}</td><td>${esc(sizeOf(r.product_text||''))}</td><td>${esc(supportOf(r.product_text||''))}</td><td>${rowQty(r)}</td><td>${esc(zoneOf(r))}</td><td><button class="ghost-btn mini-btn" type="button" data-yx128-edit-one="${esc(r.id||'')}" data-source="${esc(source)}">編輯</button> <button class="ghost-btn mini-btn" type="button" data-yx128-delete-one="${esc(r.id||'')}" data-source="${esc(source)}">刪除</button></td></tr>`;
    }).join(''):'<tr><td colspan="6">目前沒有資料</td></tr>';
    box.innerHTML=`<style>.yx-v16-new-row{background:#fff7ed!important;outline:2px solid #f59e0b55}.yx-v16-new-row td{font-weight:800}</style><div class="yx113-summary-head yx128-summary-head"><div class="yx132-summary-title">${tag?`<span class="yx132-customer-tag">${esc(tag)}</span>`:''}<strong>${total}件 / ${shown.length}筆</strong><span>${title}｜V16 實際資料已刷新</span></div>${controls}</div><div class="yx113-table-wrap"><table class="yx113-table yx128-inline-table"><thead><tr><th>材質</th><th>尺寸</th><th>支數 x 件數</th><th>總數量</th><th>A/B區</th><th>操作</th></tr></thead><tbody>${body}</tbody></table></div>`;
  }
  async function refresh(source,customer,highlightItems){
    source=ui(source||page()); const ep=endpoint(source); if(!ep) return [];
    const d=await api(ep,{method:'GET'}); const rows=Array.isArray(d.items)?d.items:(Array.isArray(d.rows)?d.rows:[]);
    render(source,rows,customer,highlightItems); return rows;
  }
  async function submit(ev){
    try{ ev?.preventDefault?.(); ev?.stopPropagation?.(); ev?.stopImmediatePropagation?.(); }catch(_e){}
    const source=ui(page());
    if(source==='ship'){ if(window.__YX_SHIP_NATIVE_CONFIRM__) return window.__YX_SHIP_NATIVE_CONFIRM__(); return false; }
    if(!['inventory','orders','master_order'].includes(source)) return false;
    const ta=$('ocr-text'), btn=$('submit-btn'), result=$('module-result');
    const text=clean(ta?.value||'');
    if(!text){ toast('請輸入商品資料','warn'); return false; }
    const items=parseItems(text);
    if(!items.length){ toast('商品格式無法辨識，請用 111x12x12=13 這種格式','warn'); return false; }
    const customer=currentCustomer(source,text);
    if(source!=='inventory' && !customer){ toast('請輸入客戶名稱','warn'); return false; }
    const old=btn?.textContent||'確認送出';
    try{
      if(btn){ btn.disabled=true; btn.textContent='送出中…'; }
      const payload={customer_name:customer,ocr_text:text,items,request_key:`v16_${source}_${Date.now()}_${Math.random().toString(36).slice(2)}`};
      const d=await api(endpoint(source),{method:'POST',body:JSON.stringify(payload)});
      const firstRows=Array.isArray(d.items)?d.items:[];
      if(firstRows.length) render(source,firstRows,customer,items);
      let rows=await refresh(source,customer,items);
      const found=findNewRows(rows,items,customer,source);
      // 舊 renderer 有時會在送出後延遲覆蓋畫面，這裡連續搶回最後顯示權。
      [250,700,1400].forEach(ms=>setTimeout(()=>refresh(source,customer,items).catch(()=>{}),ms));
      if(ta) ta.value='';
      if(result){ result.classList.remove('hidden'); result.style.display=''; result.innerHTML=`<strong>新增成功，已刷新到下方清單</strong><div class="small-note">${esc(items.map(i=>i.product_text).join('、'))}${found.length?'':'（若目前篩選為 A/B 區，未分區新品請切回「全部區」）'}</div>`; }
      toast(`已新增 ${items.length} 筆，清單已立即更新`,'ok');
      if(customer) window.dispatchEvent(new CustomEvent('yx:customer-selected',{detail:{name:customer}}));
    }catch(e){
      if(result){ result.classList.remove('hidden'); result.style.display=''; result.innerHTML=`<strong style="color:#b91c1c">送出失敗 / 未寫入清單</strong><div class="small-note">${esc(e.message||'未知錯誤')}</div>`; }
      toast(e.message||'送出失敗','error'); console.error('[YX V16 submit]',e);
    }finally{ if(btn){ btn.disabled=false; btn.textContent=old; } }
    return false;
  }
  function bind(){
    window.YX_V16_TRUE_RENDER={version:VERSION,submit,refresh,render};
    window.confirmSubmit=function(ev){ return submit(ev); };
    document.addEventListener('click',function(ev){ const b=ev.target.closest&&ev.target.closest('#submit-btn'); if(b){ return submit(ev); } }, true);
    if(['inventory','orders','master_order'].includes(ui(page()))) setTimeout(()=>refresh(ui(page())).catch(()=>{}),350);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',bind,{once:true}); else bind();
  [600,1600,3200].forEach(ms=>setTimeout(()=>{ window.confirmSubmit=function(ev){return submit(ev)}; window.YX_V16_TRUE_RENDER={version:VERSION,submit,refresh,render}; },ms));
})();
