/* 庫存/訂單/總單：HTML 固定，送出後直接新增並刷新表格 */
(function(){
  'use strict';
  const page=()=>document.querySelector('.module-screen[data-module]')?.dataset.module||'';
  const apiPath=m=>m==='inventory'?'/api/inventory':m==='orders'?'/api/orders':'/api/master_orders';
  const clean=v=>String(v??'').trim();
  const norm=v=>clean(v).replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/\s+/g,'');
  function qtyFromProduct(text){
    const raw=norm(text); const right=raw.includes('=')?raw.split('=').slice(1).join('='):raw;
    if(!right) return raw?1:0;
    const parts=right.split('+').map(x=>x.trim()).filter(Boolean); if(!parts.length) return 1;
    let total=0, hit=false;
    for(const seg of parts){ const m=seg.match(/x\s*(\d+)\s*$/i); if(m){ total+=Number(m[1]||0); hit=true; } else if(/\d/.test(seg)){ total+=1; hit=true; } }
    return hit?total:1;
  }
  function splitMaterial(line){
    line=clean(line); const m=line.match(/^([A-Za-z\u4e00-\u9fff]{1,8})\s+(.+?=.+)$/);
    if(m && !/^\d/.test(m[1])) return {material:m[1].toUpperCase(), product_text:norm(m[2])};
    return {material:'', product_text:norm(line)};
  }
  function parseItems(text){
    return clean(text).split(/\n+/).map(splitMaterial).filter(x=>x.product_text).map(x=>({product_text:x.product_text, material:x.material, product_code:x.material, qty:qtyFromProduct(x.product_text)})).filter(x=>x.qty>0);
  }
  async function api(url,opt={}){const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}});const t=await r.text();let d={};try{d=t?JSON.parse(t):{}}catch{d={success:false,error:t}};if(!r.ok||d.success===false)throw new Error(d.error||d.message||'送出失敗');return d;}
  function toast(msg,type){try{(window.YXHardLock?.toast||window.alert)(msg,type)}catch{alert(msg)}}
  async function refresh(m, customer){
    try{ if(window.YX113ProductActions?.loadSource) await window.YX113ProductActions.loadSource(m); }catch(_e){}
    try{ if(customer && window.YX113ProductActions?.refreshCurrent) await window.YX113ProductActions.refreshCurrent(); }catch(_e){}
    try{ if(customer) window.dispatchEvent(new CustomEvent('yx:customer-selected',{detail:{name:customer}})); }catch(_e){}
  }
  window.confirmSubmit=async function(){
    const m=page();
    if(m==='ship'&&window.__YX_SHIP_SINGLE_LOCK__)return;
    if(!['inventory','orders','master_order'].includes(m))return;
    const btn=document.getElementById('submit-btn');
    const ta=document.getElementById('ocr-text');
    const text=clean(ta?.value||'');
    const customer=clean(document.getElementById('customer-name')?.value||window.__YX_SELECTED_CUSTOMER__||'');
    if(!text)return toast('請輸入商品資料','warn');
    if(m!=='inventory'&&!customer)return toast('請輸入客戶名稱','warn');
    const items=parseItems(text);
    if(!items.length)return toast('商品格式無法辨識，請確認有尺寸與支數','warn');
    try{
      if(btn){btn.disabled=true;btn.textContent='送出中…'}
      await api(apiPath(m),{method:'POST',body:JSON.stringify({customer_name:customer,ocr_text:text,items,request_key:'submit_'+m+'_'+Date.now()+'_'+Math.random().toString(36).slice(2)})});
      if(ta) ta.value='';
      toast(`已新增 ${items.length} 筆商品`,'ok');
      await refresh(m, customer);
    }catch(e){toast(e.message||'送出失敗','error')}
    finally{if(btn){btn.disabled=false;btn.textContent='確認送出'}}
  };
})();
