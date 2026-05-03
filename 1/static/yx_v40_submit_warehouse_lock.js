/* V40 final submit + warehouse lock. Loaded last; only fixes event/db persistence paths. */
(function(){
  'use strict';
  if (window.__YX_V40_SUBMIT_WAREHOUSE_LOCK__) return;
  window.__YX_V40_SUBMIT_WAREHOUSE_LOCK__ = true;
  const $ = id => document.getElementById(id);
  const clean = v => String(v ?? '').trim();
  const page = () => (document.querySelector('.module-screen[data-module]')?.dataset.module || document.body?.dataset.module || '').trim();
  const esc = v => String(v ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  const apiPath = m => m === 'inventory' ? '/api/inventory' : m === 'orders' ? '/api/orders' : '/api/master_orders';
  let submitting = false;
  async function api(url, opt={}){
    const r = await fetch(url,{credentials:'same-origin',cache:'no-store',...opt,headers:{'Accept':'application/json','Content-Type':'application/json','Cache-Control':'no-cache','X-YX-V40':'true',...(opt.headers||{})}});
    const text = await r.text(); let data={};
    try{data=text?JSON.parse(text):{};}catch(_e){data={success:false,error:text||'後端沒有回傳 JSON'};}
    if(!r.ok || data.success===false) throw new Error(data.error || data.message || '操作失敗');
    return data;
  }
  function toast(msg,type){
    try{ const fn=window.YXHardLock?.toast || window.toast || window.showToast || window.notify; if(typeof fn==='function') return fn(msg,type); }catch(_e){}
    try{console.log('[YX V40]',msg);}catch(_e){}
  }
  function normalizeText(v){
    let s=clean(v).replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/[＋，,；;]/g,'+');
    const m=s.match(/(?:^|\s)([1-9]|1[0-2])\s*(?:月|月份)(?=\s|\d|x|$)/);
    if(m){ const month=Number(m[1])+'月'; s=(s.slice(0,m.index)+' '+s.slice(m.index+m[0].length)).replace(/\s+/g,''); if(!s.startsWith(month)) s=month+s; return s; }
    return s.replace(/\s+/g,'');
  }
  function splitMaterial(line){
    line=clean(line); const m=line.match(/^([A-Za-z\u4e00-\u9fff]{1,8})\s+(.+?=.+)$/);
    if(m && !/^\d/.test(m[1])) return {material:m[1].toUpperCase(), product_text:normalizeText(m[2])};
    return {material:'',product_text:normalizeText(line)};
  }
  function qtyFromProduct(text){
    try{ if(typeof window.YX30EffectiveQty==='function') return Math.max(1,Number(window.YX30EffectiveQty(text,1))||1); }catch(_e){}
    const right=(clean(text).split('=')[1]||clean(text)).replace(/\([^)]*\)/g,'');
    const m=right.match(/(?:^|\+)\s*\d+\s*x\s*(\d+)/i); if(m) return Math.max(1,Number(m[1])||1);
    const parts=right.split('+').map(x=>x.trim()).filter(Boolean); return Math.max(1,parts.length||1);
  }
  function parseItems(text){
    return clean(text).split(/\n+/).map(splitMaterial).filter(x=>x.product_text).map(x=>({product_text:x.product_text,material:x.material,product_code:x.material,qty:qtyFromProduct(x.product_text)})).filter(x=>x.qty>0);
  }
  function activeZone(m){
    const b=document.querySelector(`[data-yx132-zone-filter].is-active[data-source="${m}"]`);
    const z=(b?.dataset?.yx132ZoneFilter||'').toUpperCase(); return (z==='A'||z==='B')?z:'';
  }
  function sizeKey(t){
    const s=normalizeText(t).replace(/^([1-9]|1[0-2])月/,''); const left=s.split('=')[0]||s; const m=left.match(/(\d+)x(\d+)x(\d+)/i); return m?`${Number(m[1])}x${Number(m[2])}x${Number(m[3])}`:left.toLowerCase();
  }
  function materialKey(v){return clean(v||'未填材質').toUpperCase();}
  function duplicateMode(m,customer,items){
    const act=window.YX113ProductActions||window.YX132ProductActions||window.YX128ProductActions; let rows=[];
    try{rows=act?.rowsStore?.(m)||[];}catch(_e){}
    const map=new Map(); const add=(k,label)=>{ if(!map.has(k)) map.set(k,[]); map.get(k).push(label); };
    items.forEach((it,i)=>add(`${sizeKey(it.product_text)}|${materialKey(it.material)}`,`新增第${i+1}筆 ${it.material||'未填材質'} ${it.product_text}`));
    (Array.isArray(rows)?rows:[]).forEach(r=>{ if((m==='orders'||m==='master_order')&&clean(customer)&&clean(r.customer_name||r.customer||'')!==clean(customer)) return; const k=`${sizeKey(r.product_text)}|${materialKey(r.material||r.product_code)}`; if(map.has(k)) add(k,`既有 ${r.material||r.product_code||'未填材質'} ${r.product_text}`); });
    const dups=Array.from(map.values()).filter(a=>a.length>1).slice(0,6); if(!dups.length) return 'merge';
    return window.confirm(`偵測到相同尺寸＋材質的商品，是否要合併？\n\n${dups.map(a=>'・'+a.slice(0,4).join(' / ')).join('\n')}\n\n確定＝合併數量；取消＝分開新增保存。`)?'merge':'separate';
  }
  function optimisticRows(customer,items,zone){ const now=Date.now(); return items.map((it,i)=>({id:`tmp-v40-${now}-${i}`,product_text:it.product_text,material:it.material||'',product_code:it.material||'',qty:it.qty,customer_name:customer||'',location:zone||'',zone:zone||'',warehouse_zone:zone||'',__optimistic:true})); }
  function applyRows(m,customer,data,items,zone){
    const act=window.YX113ProductActions||window.YX132ProductActions||window.YX128ProductActions; if(!act?.rowsStore) return;
    let rows=[]; const snaps=data?.snapshots||{};
    if(Array.isArray(snaps[m])) rows=snaps[m]; else if(m==='master_order'&&Array.isArray(snaps.master_orders)) rows=snaps.master_orders; else if(Array.isArray(data?.items)) rows=data.items;
    if((!rows||!rows.length)&&Array.isArray(data?.exact_customer_items)&&data.exact_customer_items.length){ const before=act.rowsStore(m)||[]; rows=before.filter(r=>clean(r.customer_name||r.customer||'')!==clean(customer)).concat(data.exact_customer_items); }
    if(Array.isArray(rows)&&rows.length) act.rowsStore(m,rows); else act.rowsStore(m,[...optimisticRows(customer,items,zone),...(act.rowsStore(m)||[]).filter(r=>!r.__optimistic&&!String(r.id||'').startsWith('tmp-'))]);
    try{act.renderSummary?.(m); act.renderCards?.(m);}catch(_e){}
    if(customer){ window.__YX_SELECTED_CUSTOMER__=customer; const input=$('customer-name'); if(input) input.value=customer; }
    try{ if(Array.isArray(data?.customers)&&window.YX113CustomerRegions?.renderBoards) window.YX113CustomerRegions.renderBoards(data.customers); }catch(_e){}
    try{ if(customer&&window.YX113CustomerRegions?.selectCustomer) window.YX113CustomerRegions.selectCustomer(customer).catch(()=>{}); }catch(_e){}
  }
  async function submitNow(ev){
    if(ev){ev.preventDefault?.();ev.stopPropagation?.();ev.stopImmediatePropagation?.();}
    const m=page(); if(!['inventory','orders','master_order'].includes(m)) return; if(submitting) return;
    const btn=$('submit-btn'), ta=$('ocr-text'), result=$('module-result');
    const text=clean(ta?.value||''); const customer=clean($('customer-name')?.value||window.__YX_SELECTED_CUSTOMER__||'');
    if(!text){toast('請輸入商品資料','warn');return;} if(m!=='inventory'&&!customer){toast('請輸入客戶名稱','warn');return;}
    const items=parseItems(text); if(!items.length){toast('商品格式無法辨識，請確認有尺寸與支數','warn');return;}
    const z=activeZone(m), mode=duplicateMode(m,customer,items); submitting=true;
    try{
      if(btn){btn.disabled=true;btn.textContent='送出中…';}
      toast(`送出中：${items.length} 筆商品`,'ok');
      const act=window.YX113ProductActions||window.YX132ProductActions||window.YX128ProductActions;
      try{ if(act?.rowsStore){act.rowsStore(m,[...optimisticRows(customer,items,z),...(act.rowsStore(m)||[])]);act.renderSummary?.(m);act.renderCards?.(m);} }catch(_e){}
      const posted=await api(apiPath(m),{method:'POST',body:JSON.stringify({customer_name:customer,ocr_text:text,items,duplicate_mode:mode,location:z,zone:z,region:(m==='orders'||m==='master_order')?'北區':'',request_key:`v40-submit-${m}-${Date.now()}-${Math.random().toString(36).slice(2)}`})});
      if(ta) ta.value=''; applyRows(m,customer,posted,items,z);
      if(result){result.classList.remove('hidden');result.style.display='';result.innerHTML=`<strong>新增成功，已永久寫入資料庫</strong><div class="small-note">${items.map(i=>esc(i.product_text)).join('、')}</div>`;}
      toast(`已新增 ${items.length} 筆商品`,'ok');
    }catch(e){
      try{ const act=window.YX113ProductActions||window.YX132ProductActions||window.YX128ProductActions; if(act?.rowsStore){act.rowsStore(m,(act.rowsStore(m)||[]).filter(r=>!r.__optimistic&&!String(r.id||'').startsWith('tmp-')));act.renderSummary?.(m);act.renderCards?.(m);} }catch(_e){}
      if(result){result.classList.remove('hidden');result.style.display='';result.innerHTML=`<strong style="color:#b91c1c">送出失敗 / 未寫入清單</strong><div class="small-note">${esc(e.message||'未知錯誤')}</div>`;}
      toast(e.message||'送出失敗','error');
    }finally{ submitting=false; if(btn){btn.disabled=false;btn.textContent='確認送出';} }
  }
  function bindSubmit(){ const btn=$('submit-btn'); if(btn){ btn.type='button'; btn.disabled=false; btn.onclick=submitNow; btn.style.pointerEvents='auto'; } window.confirmSubmit=submitNow; window.YXConfirmSubmit=submitNow; }
  document.addEventListener('click',ev=>{ const b=ev.target?.closest?.('#submit-btn'); if(!b) return; if(!['inventory','orders','master_order'].includes(page())) return; submitNow(ev); },true);
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',bindSubmit,{once:true}); else bindSubmit();

  // Warehouse final: make save button always call existing save function and refresh local slot after DB response.
  document.addEventListener('click',async ev=>{
    const btn=ev.target?.closest?.('#yx121-save-cell'); if(!btn) return;
    ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.();
    try{ if(typeof window.saveWarehouseCell==='function'){ await window.saveWarehouseCell(); return; } }
    catch(e){ toast(e.message||'儲存格位失敗','error'); return; }
  },true);
})();
