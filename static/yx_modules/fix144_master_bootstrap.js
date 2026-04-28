/* FIX144 模組化母版總管：每頁/每按鈕/每邏輯分開註冊，舊版只當輔助功能庫 */
(function(){
  'use strict';
  const V='fix145-consolidated-master';
  const root=document.documentElement;
  root.dataset.yx144ModularMaster='locked';
  const YX=window.YXHardLock||{};
  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const moduleKey=()=>{try{return YX.moduleKey?YX.moduleKey():'';}catch(_e){const p=location.pathname; if(p==='/')return'home'; if(p.includes('inventory'))return'inventory'; if(p.includes('orders'))return'orders'; if(p.includes('master-order'))return'master_order'; if(p.includes('ship'))return'ship'; if(p.includes('warehouse'))return'warehouse'; if(p.includes('settings'))return'settings'; if(p.includes('today-changes'))return'today_changes'; return '';}};
  const api=async(url,opt={})=>{if(YX.api)return YX.api(url,opt); const res=await fetch(url,{credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json',...(opt.headers||{})},...opt}); const txt=await res.text(); let d={}; try{d=txt?JSON.parse(txt):{};}catch(_e){d={success:false,error:txt||'回應格式錯誤'};} if(!res.ok||d.success===false)throw new Error(d.error||d.message||'操作失敗'); return d;};
  const toast=(m,k='ok')=>{try{(YX.toast||window.toast||window.showToast||console.log)(m,k);}catch(_e){}};
  const mods={};
  const state={version:V,installed:{},cache:{customers:null,inventory:null,orders:null,master_order:null},lastCustomer:''};
  function register(name, mod){mods[name]=mod||{}; return mod;}
  function install(name, force=false){const m=mods[name]; if(!m||typeof m.install!=='function')return; if(state.installed[name]){try{m.repair&&m.repair({V,api,clean,esc,moduleKey,toast,state});}catch(_e){} return;} try{state.installed[name]=m.install({V,api,clean,esc,moduleKey,toast,state})||true;}catch(e){toast(`${name}母版啟動失敗：${e.message||e}`,'error');}}
  function installAll(force=false){Object.keys(mods).forEach(n=>install(n,force)); document.dispatchEvent(new CustomEvent('yx144:installed',{detail:{version:V,module:moduleKey()}}));}
  function neutralizeLegacyVisuals(){
    window.__YX144_MASTER_READY__=true;
    window.__YX124_BLOCK_LEGACY_VISUAL_BOOT__=true;
    window.__YX_LEGACY_ASSIST_ONLY__=true;
    try{YX.cancelLegacyTimers&&YX.cancelLegacyTimers('fix144-modular-final');}catch(_e){}
    document.querySelectorAll('.legacy-view,.yx-legacy-visual,[data-legacy-visual="1"]').forEach(el=>{el.style.display='none'; el.setAttribute('aria-hidden','true');});
  }
  function fixEmptyButtons(){
    const labels=[['back','返回'],['edit','編輯'],['ship','直接出貨'],['delete','刪除'],['order','加到訂單'],['master','加到總單'],['undo','還原上一筆'],['refresh','重新整理'],['save','儲存'],['submit','確認送出']];
    document.querySelectorAll('button,a.home-mini-btn,a.menu-btn,.ghost-btn,.primary-btn,.chip,.pill').forEach(el=>{
      const text=clean(el.textContent); if(text)return;
      const key=clean([el.id,el.className,el.getAttribute('data-action'),el.getAttribute('aria-label'),el.getAttribute('title')].join(' ')).toLowerCase();
      let found=''; for(const [k,v] of labels){if(key.includes(k)){found=v;break;}}
      if(found){el.textContent=found; el.classList.add('yx144-empty-button');}
    });
  }
  function installButtonGuard(){
    document.addEventListener('click',e=>{
      const btn=e.target.closest?.('button,a,.chip,.pill,.customer-region-card,[role="button"]'); if(!btn)return;
      btn.classList.add('yx144-pressed'); setTimeout(()=>btn.classList.remove('yx144-pressed'),180);
    },true);
  }
  window.YX144={V,register,install,installAll,neutralizeLegacyVisuals,fixEmptyButtons,api,clean,esc,moduleKey,toast,state};
  if(window.YXHardLock&&YX.register)YX.register('fix144_master_bootstrap',{install(){neutralizeLegacyVisuals();fixEmptyButtons();installButtonGuard();}});
  const boot=()=>{neutralizeLegacyVisuals();fixEmptyButtons();installButtonGuard();installAll(false);};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
  window.addEventListener('load',()=>{neutralizeLegacyVisuals();fixEmptyButtons();installAll(false);},{once:true});
})();
