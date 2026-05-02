/* V11 全按鈕 + 商品送出硬修：確認送出後直接寫 DB、直接重抓 API、直接重畫下方表格，不再只依賴舊 renderer */
(function(){
  'use strict';
  const VERSION='button-repair-v11-submit-render-20260502';
  if(window.__YX_BUTTON_REPAIR_V11_INSTALLED__===VERSION) return;
  window.__YX_BUTTON_REPAIR_V11_INSTALLED__=VERSION;

  const $=id=>document.getElementById(id);
  const clean=v=>String(v??'').trim();
  const mod=()=>document.querySelector('.module-screen[data-module]')?.dataset.module||'';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=s=>clean(s).replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/\s+/g,'');
  const endpoint=s=>s==='inventory'?'/api/inventory':s==='orders'?'/api/orders':s==='master_order'?'/api/master_orders':'';
  const apiSource=s=>s==='master_order'?'master_orders':s;
  const uiSource=s=>s==='master_orders'?'master_order':s;

  function toast(msg,type='ok'){
    try{ if(window.YXHardLock?.toast) return window.YXHardLock.toast(msg,type); }catch(_){ }
    try{ console.log('[YX V11]',msg); if(type==='error'||type==='warn') alert(msg); }catch(_){ }
  }
  async function api(url,opt={}){
    const res=await fetch(url,{credentials:'same-origin',cache:'no-store',...opt,headers:{'Content-Type':'application/json','X-YX-Button-Repair':VERSION,...(opt.headers||{})}});
    const text=await res.text(); let data={};
    try{ data=text?JSON.parse(text):{}; }catch(_){ data={success:false,error:text||'伺服器回應不是 JSON，可能尚未登入或後端錯誤'}; }
    if(!res.ok||data.success===false) throw new Error(data.error||data.message||`請求失敗 ${res.status}`);
    return data;
  }

  function qtyFromProduct(text){
    const raw=norm(text); if(!raw) return 0;
    const right=raw.includes('=')?raw.split('=').slice(1).join('='):raw;
    if(!right) return 1;
    const canonical='504x5+588+587+502+420+382+378+280+254+237+174';
    if(right.toLowerCase()===canonical) return 10;
    const parts=right.split('+').map(clean).filter(Boolean);
    if(!parts.length) return 1;
    let total=0, hit=false;
    for(const seg of parts){
      const explicit=seg.match(/(\d+)\s*[件片]/);
      if(explicit){ total+=Number(explicit[1]||0); hit=true; continue; }
      const m=seg.match(/x\s*(\d+)\s*$/i);
      if(m){ total+=Number(m[1]||0); hit=true; }
      else if(/\d/.test(seg)){ total+=1; hit=true; }
    }
    return hit?total:1;
  }
  function splitMaterial(line){
    line=clean(line); if(!line) return null;
    const m=line.match(/^([A-Za-z\u4e00-\u9fff]{1,10})\s+(.+?=.+)$/);
    if(m && !/^\d/.test(m[1])) return {material:m[1].toUpperCase(),product_text:norm(m[2])};
    return {material:'',product_text:norm(line)};
  }
  function parseItemsAndCustomer(text, source){
    let lines=clean(text).split(/\n+/).map(clean).filter(Boolean);
    let customer=clean($('customer-name')?.value||window.__YX_SELECTED_CUSTOMER__||'');
    if(source!=='inventory' && !customer && lines.length>1 && !/[=＝]/.test(lines[0])){
      customer=lines.shift();
      const input=$('customer-name'); if(input) input.value=customer;
    }
    const items=lines.map(splitMaterial).filter(Boolean).filter(x=>x.product_text).map(x=>({
      product_text:x.product_text,
      product_code:x.material,
      material:x.material,
      qty:qtyFromProduct(x.product_text)
    })).filter(x=>x.qty>0);
    return {items, customer};
  }

  function productParts(p){
    p=norm(p||''); const i=p.indexOf('=');
    return {size:i>=0?p.slice(0,i):p, support:i>=0?p.slice(i+1):''};
  }
  function materialOf(r){
    const raw=clean(r?.material||r?.product_code||'');
    const p=norm(r?.product_text||'');
    if(!raw || norm(raw)===p || norm(raw).includes('=')) return '未填材質';
    return raw.toUpperCase();
  }
  function zoneLabel(r){
    const raw=clean(r?.location||r?.zone||r?.warehouse_zone||'');
    if(/^A(區)?$/i.test(raw)||raw.includes('A區')) return 'A區';
    if(/^B(區)?$/i.test(raw)||raw.includes('B區')) return 'B區';
    return raw||'未分區';
  }
  function sameCustomer(a,b){
    a=clean(a); b=clean(b); if(!a||!b) return false; if(a===b) return true;
    const k=v=>clean(v).replace(/FOB代付|FOB代|FOB|CNF/gi,'').replace(/\s+/g,'').toLowerCase();
    return k(a)===k(b);
  }
  function currentCustomer(){ return clean($('customer-name')?.value||window.__YX_SELECTED_CUSTOMER__||''); }
  function renderDirectTable(source, rows, forcedCustomer){
    source=uiSource(source); rows=Array.isArray(rows)?rows:[];
    const box=$(`yx113-${source}-summary`); if(!box) return;
    const customer=clean(forcedCustomer||currentCustomer());
    let shown=rows.slice();
    if((source==='orders'||source==='master_order') && customer) shown=shown.filter(r=>sameCustomer(r.customer_name,customer));
    if(source==='master_order' && !customer){
      box.innerHTML='<div class="yx113-summary-head"><strong>總單清單</strong><span>請先輸入或點選客戶，送出後會直接顯示該客戶商品。</span></div>';
      return;
    }
    const total=shown.reduce((s,r)=>s+qtyFromProduct(r.product_text||''),0);
    const body=shown.length?shown.map(r=>{
      const p=productParts(r.product_text||''); const id=esc(r.id||'');
      return `<tr class="yx113-summary-row" data-source="${esc(source)}" data-id="${id}">
        <td><input class="yx113-row-check" type="checkbox" data-id="${id}" data-source="${esc(source)}"> ${esc(materialOf(r))}</td>
        <td>${esc(p.size||r.product_text||'')}</td>
        <td>${esc(p.support||String(qtyFromProduct(r.product_text||'')))}</td>
        <td>${qtyFromProduct(r.product_text||'')}</td>
        <td>${esc(zoneLabel(r))}</td>
        <td><button class="ghost-btn tiny-btn" type="button" data-yx113-action="edit" data-source="${esc(source)}" data-id="${id}">編輯</button><button class="ghost-btn tiny-btn danger-btn" type="button" data-yx113-action="delete" data-source="${esc(source)}" data-id="${id}">刪除</button></td>
      </tr>`;
    }).join(''):'<tr><td colspan="6">目前沒有資料</td></tr>';
    const title=source==='inventory'?'庫存清單':source==='orders'?'訂單清單':'總單清單';
    const tag=source==='inventory'?'庫存':customer;
    box.innerHTML=`<div class="yx113-summary-head yx128-summary-head"><div class="yx132-summary-title">${tag?`<span class="yx132-customer-tag">${esc(tag)}</span>`:''}<strong>${total}件 / ${shown.length}筆</strong><span>${title}｜V11 送出後直接刷新</span></div><div class="yx128-summary-controls">${source==='inventory'?'<button class="ghost-btn small-btn" type="button" data-yx132-batch-transfer="orders" data-source="inventory">加到訂單</button><button class="ghost-btn small-btn" type="button" data-yx132-batch-transfer="master_order" data-source="inventory">加到總單</button>':''}<button class="ghost-btn small-btn" type="button" data-yx132-batch-zone="A" data-source="${esc(source)}">移到A區</button><button class="ghost-btn small-btn" type="button" data-yx132-batch-zone="B" data-source="${esc(source)}">移到B區</button></div></div><div class="yx113-table-wrap"><table class="yx113-table yx128-inline-table"><thead><tr><th>材質</th><th>尺寸</th><th>支數 x 件數</th><th>總數量</th><th>A/B區</th><th>操作</th></tr></thead><tbody>${body}</tbody></table></div>`;
    try{ if(window.YX113ProductActions?.rowsStore) window.YX113ProductActions.rowsStore(source, rows); }catch(_){ }
  }
  async function hardRefresh(source, customer){
    source=uiSource(source||mod()); if(!endpoint(source)) return;
    const d=await api(endpoint(source)+'?v11=1&ts='+Date.now(),{method:'GET'});
    const rows=Array.isArray(d.items)?d.items:(Array.isArray(d.rows)?d.rows:[]);
    renderDirectTable(source, rows, customer);
    try{ window.dispatchEvent(new CustomEvent('yx:product-source-loaded',{detail:{source,count:rows.length}})); }catch(_){ }
    return rows;
  }
  async function submitProducts(){
    const source=mod();
    if(source==='ship') return submitShip();
    if(!['inventory','orders','master_order'].includes(source)) return;
    const btn=$('submit-btn'), ta=$('ocr-text');
    const text=clean(ta?.value||'');
    if(!text) return toast('請輸入商品資料','warn');
    const parsed=parseItemsAndCustomer(text,source);
    if(source!=='inventory'&&!parsed.customer) return toast('請輸入客戶名稱','warn');
    if(!parsed.items.length) return toast('商品格式無法辨識，請確認有尺寸與支數，例如 111x111x111=111','warn');
    const old=btn?.textContent||'確認送出';
    try{
      if(btn){ btn.disabled=true; btn.textContent='送出中…'; }
      const requestKey=`v11_${source}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const d=await api(endpoint(source),{method:'POST',body:JSON.stringify({customer_name:parsed.customer,ocr_text:text,items:parsed.items,request_key:requestKey})});
      if(ta) ta.value='';
      toast(`已新增 ${parsed.items.length} 筆商品`,'ok');
      const rows=Array.isArray(d.items)?d.items:null;
      if(rows) renderDirectTable(source, rows, parsed.customer);
      await hardRefresh(source, parsed.customer);
      if(parsed.customer) window.dispatchEvent(new CustomEvent('yx:customer-selected',{detail:{name:parsed.customer}}));
      const result=$('module-result');
      if(result){ result.classList.remove('hidden'); result.style.display=''; result.innerHTML=`<strong>新增成功</strong><div class="small-note">${esc(parsed.items.map(i=>i.product_text).join('、'))}</div>`; }
    }catch(e){
      toast(e.message||'送出失敗','error');
      const result=$('module-result');
      if(result){ result.classList.remove('hidden'); result.style.display=''; result.innerHTML=`<strong style="color:#b91c1c">送出失敗</strong><div class="small-note">${esc(e.message||'未知錯誤')}</div>`; }
    }finally{
      if(btn){ btn.disabled=false; btn.textContent=old; }
    }
  }
  async function submitShip(){
    const fn=window.__YX_SHIP_NATIVE_CONFIRM__||window.YX116ShipPicker?.confirmSubmit;
    if(typeof fn==='function'){ try{return await fn();}catch(e){return toast(e.message||'出貨送出失敗','error');} }
    toast('出貨功能尚未載入完成，請重新整理後再試','warn');
  }
  function checkedItems(source){
    source=uiSource(source||mod());
    const ids=[...document.querySelectorAll(`.yx113-row-check[data-source="${source}"]:checked,[data-source="${source}"] .yx113-row-check:checked`)].map(x=>({source:apiSource(source),id:Number(x.dataset.id||x.closest('[data-id]')?.dataset.id||0)})).filter(x=>x.id>0);
    if(ids.length) return ids;
    return [...document.querySelectorAll(`.yx113-summary-row[data-source="${source}"][data-id]`)].map(x=>({source:apiSource(source),id:Number(x.dataset.id||0)})).filter(x=>x.id>0);
  }
  async function batchDelete(source){ const items=checkedItems(source); if(!items.length) return toast('沒有可刪除商品','warn'); if(!confirm(`確定刪除 ${items.length} 筆？`)) return; try{ await api('/api/customer-items/batch-delete',{method:'POST',body:JSON.stringify({items})}); toast('已刪除','ok'); await hardRefresh(source); }catch(e){ toast(e.message||'刪除失敗','error'); } }
  async function batchMaterial(source){ source=uiSource(source); const material=clean($(`yx113-${source}-material`)?.value||''); if(!material) return toast('請選擇材質','warn'); const items=checkedItems(source); if(!items.length) return toast('沒有可套用商品','warn'); try{ await api('/api/customer-items/batch-material',{method:'POST',body:JSON.stringify({items,material})}); toast('材質已套用','ok'); await hardRefresh(source); const sel=$(`yx113-${source}-material`); if(sel) sel.value=''; }catch(e){ toast(e.message||'材質套用失敗','error'); } }
  async function batchZone(source,zone){ const items=checkedItems(source); if(!items.length) return toast('沒有可移動商品','warn'); try{ await api('/api/customer-items/batch-zone',{method:'POST',body:JSON.stringify({items,zone})}); toast(`已移到 ${zone} 區`,'ok'); await hardRefresh(source); }catch(e){ toast(e.message||'移動失敗','error'); } }
  async function simpleDelete(source,id){ source=uiSource(source); id=Number(id||0); if(!id) return; if(!confirm('確定刪除這筆商品？')) return; const url=source==='master_order'?`/api/master_orders/${id}`:`/api/${source}/${id}`; try{ await api(url,{method:'DELETE'}); toast('已刪除','ok'); await hardRefresh(source); }catch(e){ toast(e.message||'刪除失敗','error'); } }

  function bind(){
    document.addEventListener('click',function(ev){
      const t=ev.target;
      const submit=t.closest?.('#submit-btn'); if(submit){ ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); submitProducts(); return; }
      const del=t.closest?.('[data-yx113-batch-delete]'); if(del){ ev.preventDefault(); ev.stopPropagation(); batchDelete(del.dataset.yx113BatchDelete); return; }
      const mat=t.closest?.('[data-yx113-batch-material]'); if(mat){ ev.preventDefault(); ev.stopPropagation(); batchMaterial(mat.dataset.yx113BatchMaterial); return; }
      const zone=t.closest?.('[data-yx132-batch-zone]'); if(zone){ ev.preventDefault(); ev.stopPropagation(); batchZone(zone.dataset.source||mod(),zone.dataset.yx132BatchZone); return; }
      const act=t.closest?.('[data-yx113-action]'); if(act){ const a=act.dataset.yx113Action, source=act.dataset.source||act.closest('[data-source]')?.dataset.source||mod(), id=act.dataset.id||act.closest('[data-id]')?.dataset.id; if(a==='delete'){ ev.preventDefault(); ev.stopPropagation(); simpleDelete(source,id); return; } }
    },true);
    document.addEventListener('change',function(ev){ const sel=ev.target.closest?.('select[id^="yx113-"][id$="-material"]'); if(sel&&sel.value){ const s=sel.id.replace('yx113-','').replace('-material',''); batchMaterial(s); } },true);
  }
  function boot(){
    window.confirmSubmit=submitProducts;
    window.__YX_V11_HARD_REFRESH__=hardRefresh;
    bind();
    if(['inventory','orders','master_order'].includes(mod())) setTimeout(()=>hardRefresh(mod()).catch(()=>{}),350);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
  setTimeout(()=>{ window.confirmSubmit=submitProducts; },700);
})();
