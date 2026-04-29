/* FIX151：首頁背景與導頁遮罩防卡保護
   原則：不刪功能、不改頁面結構、不動按鈕。 */
(function(){
  'use strict';
  var V='fix151-nav-background-unstick';
  if(window.__YX151_HOME_NAV_BACKGROUND_GUARD__) return;
  window.__YX151_HOME_NAV_BACKGROUND_GUARD__=true;
  var d=document;
  var maskTimer=0;
  function pathKind(){
    try{
      var p=location.pathname||'/';
      if(p==='/'||p==='') return 'home';
      if(p.indexOf('/settings')===0) return 'settings';
      if(p.indexOf('/today-changes')===0) return 'today_changes';
      if(p.indexOf('/inventory')===0) return 'inventory';
      if(p.indexOf('/orders')===0) return 'orders';
      if(p.indexOf('/master-order')===0) return 'master_order';
      if(p.indexOf('/ship')===0) return 'ship';
      if(p.indexOf('/shipping-query')===0) return 'shipping_query';
      if(p.indexOf('/warehouse')===0) return 'warehouse';
      if(p.indexOf('/customers')===0) return 'customers';
      if(p.indexOf('/todos')===0) return 'todos';
      if(p.indexOf('/login')===0) return 'login';
      return p.split('/').filter(Boolean)[0]||'';
    }catch(_e){ return ''; }
  }
  function isHome(){ return pathKind()==='home'; }
  function removeMasks(){
    try{
      d.documentElement.classList.remove('yx111-fast-navigating','yx145-leaving','yx146-leaving','yx148-leaving','yx151-leaving');
      ['yx151-fast-nav-mask','yx148-fast-nav-mask','yx146-fast-nav-mask','yx145-fast-nav-mask'].forEach(function(id){ var el=d.getElementById(id); if(el) el.remove(); });
      if(maskTimer){ clearTimeout(maskTimer); maskTimer=0; }
    }catch(_e){}
  }
  function showMask(text){
    try{
      d.documentElement.classList.add('yx151-leaving');
      var el=d.getElementById('yx151-fast-nav-mask')||d.getElementById('yx148-fast-nav-mask')||d.getElementById('yx146-fast-nav-mask')||d.getElementById('yx145-fast-nav-mask');
      if(!el){ el=d.createElement('div'); el.id='yx151-fast-nav-mask'; (d.body||d.documentElement).appendChild(el); }
      el.textContent=text||'開啟中…';
      if(maskTimer) clearTimeout(maskTimer);
      maskTimer=setTimeout(removeMasks, 1600);
    }catch(_e){}
  }
  function ensureHomeBackground(){
    try{
      d.documentElement.dataset.yxFix151=V;
      d.documentElement.dataset.yx151TextVisible='locked';
      d.documentElement.dataset.yxPageKind=window.__YX_PAGE_ENDPOINT__==='home'?'home':pathKind();
      if(isHome() || window.__YX_PAGE_ENDPOINT__==='home'){
        d.documentElement.dataset.yx133HomeBg='locked';
        d.documentElement.dataset.yx151HomeBg='locked';
        if(d.body) d.body.dataset.yx151HomeBg='locked';
      }
      window.__YX_STATIC_VERSION__=V;
    }catch(_e){}
  }
  function sameUrl(u){
    try{ return (location.pathname+location.search+location.hash)===u; }catch(_e){ return false; }
  }
  function urlOf(a){
    try{ var u=new URL(a.getAttribute('href')||a.href, location.href); return u.origin===location.origin?(u.pathname+u.search+u.hash):''; }
    catch(_e){ return ''; }
  }
  function navOk(a){
    return a&&a.matches&&a.matches('a.back-btn[href],a.menu-btn[href],a.home-mini-btn[href],a[data-fast-nav][href]')&&(!a.target||a.target==='_self')&&urlOf(a);
  }
  function installNavSafety(){
    if(window.__YX151_NAV_SAFETY_INSTALLED__) return;
    window.__YX151_NAV_SAFETY_INSTALLED__=true;
    d.addEventListener('click', function(ev){
      if(ev.metaKey||ev.ctrlKey||ev.shiftKey||ev.altKey||ev.button===1) return;
      var a=ev.target&&ev.target.closest&&ev.target.closest('a[href]');
      if(!navOk(a)) return;
      var u=urlOf(a);
      if(!u) return;
      if(sameUrl(u)){ removeMasks(); return; }
      showMask(u==='/'?'返回主頁…':'開啟中…');
      setTimeout(function(){
        try{
          if(sameUrl(u)) removeMasks();
        }catch(_e){}
      },1800);
    }, true);
  }
  function install(){
    ensureHomeBackground();
    installNavSafety();
    /* 進入/返回頁面後主動清掉上一頁留下的遮罩；不影響真的導頁，因為導頁後會載入新頁。 */
    [0,120,500,1200,2500].forEach(function(ms){ setTimeout(function(){ ensureHomeBackground(); removeMasks(); }, ms); });
  }
  try{ window.YX151HomeNavBackgroundGuard={version:V, install:install, removeMasks:removeMasks, showMask:showMask}; }catch(_e){}
  if(d.readyState==='loading') d.addEventListener('DOMContentLoaded', install, {once:true}); else install();
  window.addEventListener('pageshow', install);
  window.addEventListener('load', install);
  window.__YX151_SHOW_NAV_MASK__=showMask;
  window.__YX151_CLEAN_NAV_MASK__=removeMasks;
})();
