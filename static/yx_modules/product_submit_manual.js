/* 庫存/訂單/總單：只送資料，不渲染頁面外殼 */
(function(){
  'use strict';
  const page=()=>document.querySelector('.module-screen[data-module]')?.dataset.module||'';
  const apiPath=m=>m==='inventory'?'/api/inventory':m==='orders'?'/api/orders':'/api/master_orders';
  async function api(url,opt={}){const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}});const t=await r.text();let d={};try{d=t?JSON.parse(t):{}}catch{d={success:false,error:t}};if(!r.ok||d.success===false)throw new Error(d.error||d.message||'送出失敗');return d;}
  function toast(msg){try{(window.YXHardLock?.toast||window.alert)(msg)}catch{alert(msg)}}
  window.confirmSubmit=async function(){const m=page();if(m==='ship'&&window.__YX_SHIP_SINGLE_LOCK__)return; if(!['inventory','orders','master_order'].includes(m))return;const btn=document.getElementById('submit-btn');const text=(document.getElementById('ocr-text')?.value||'').trim();const customer=(document.getElementById('customer-name')?.value||'').trim();if(!text)return toast('請輸入商品資料');if(m!=='inventory'&&!customer)return toast('請輸入客戶名稱');try{if(btn){btn.disabled=true;btn.textContent='送出中…'}const d=await api(apiPath(m),{method:'POST',body:JSON.stringify({customer_name:customer,ocr_text:text,request_key:'submit_'+m+'_'+Date.now()+'_'+Math.random().toString(36).slice(2)})});document.getElementById('ocr-text').value='';toast('已送出'); if(window.YX113ProductActions?.loadSource){await window.YX113ProductActions.loadSource(m);} }catch(e){toast(e.message||'送出失敗')}finally{if(btn){btn.disabled=false;btn.textContent='確認送出'}}};
})();
