/* FIX145 設定返回主頁速度修復：只處理導頁卡頓，不刪功能按鈕 */
(function(){
  'use strict';
  var V='fix145-fast-nav-guard';
  if(window.__YX145_FAST_NAV_GUARD__) return;
  window.__YX145_FAST_NAV_GUARD__=true;
  function path(){ return location.pathname || '/'; }
  function isSettings(){ return path().indexOf('/settings')>=0 || !!document.getElementById('old-password'); }
  function isHome(){ return path()==='/' || path()===''; }
  function setFlags(){
    var d=document.documentElement.dataset;
    d.yx124OrnateLabel='locked'; d.yx124MasterLabel='locked'; d.yx127GrayRingEqualHome='locked';
    d.yx135MasterFinal='locked'; d.yx136LabelText='locked'; d.yx137Final='locked'; d.yx138Final='locked';
    if(isHome()) d.yx133HomeBg='locked';
    if(isSettings()) { d.yx113Settings='locked'; d.yx115Settings='locked'; }
  }
  function installNeededModules(){
    try{
      if(window.YXHardLock && isSettings()){
        window.YXHardLock.install('settings_audit',{force:true,fast:true});
        window.YXHardLock.install('apple_ui',{force:true,fast:true});
        window.YXHardLock.install('ornate_label',{force:true,fast:true});
      }
      if(window.YXHardLock && isHome()){
        window.YXHardLock.install('apple_ui',{force:true,fast:true});
        window.YXHardLock.install('ornate_label',{force:true,fast:true});
      }
    }catch(_e){}
  }
  function showFastLeaving(){
    try{
      document.documentElement.classList.add('yx145-leaving');
      var old=document.getElementById('yx145-fast-nav-mask');
      if(old) return;
      var mask=document.createElement('div');
      mask.id='yx145-fast-nav-mask';
      mask.textContent='返回主頁…';
      mask.style.cssText='position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(250,248,244,.72);backdrop-filter:blur(4px);font:700 18px system-ui,"Noto Sans TC",sans-serif;color:#3b2b1f;pointer-events:none;';
      document.body && document.body.appendChild(mask);
    }catch(_e){}
  }
  function go(url, replace){
    if(!url) return;
    showFastLeaving();
    try{ window.__YX145_NAVIGATING__=true; }catch(_e){}
    setTimeout(function(){ replace ? location.replace(url) : location.assign(url); },0);
  }
  function isPlainLeftClick(e){ return !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && (e.button===undefined || e.button===0); }
  function bindFastNav(){
    document.addEventListener('click', function(e){
      var a=e.target && e.target.closest && e.target.closest('a[href]');
      if(!a || !isPlainLeftClick(e)) return;
      var href=a.getAttribute('href') || '';
      var target=a.getAttribute('target') || '';
      if(target && target !== '_self') return;
      var url;
      try{ url=new URL(href, location.origin); }catch(_e){ return; }
      if(url.origin !== location.origin) return;
      var p=url.pathname;
      var fastBack = a.classList.contains('back-btn') && (p==='/' || p==='');
      var fastHomeMenu = isHome() && a.classList.contains('menu-btn');
      var fastTop = isHome() && a.classList.contains('home-mini-btn');
      if(!(fastBack || fastHomeMenu || fastTop)) return;
      e.preventDefault(); e.stopPropagation(); if(e.stopImmediatePropagation) e.stopImmediatePropagation();
      go(url.pathname + url.search + url.hash, false);
    }, true);
    ['pointerdown','touchstart','mousedown'].forEach(function(type){
      document.addEventListener(type,function(e){
        var a=e.target && e.target.closest && e.target.closest('a.back-btn[href]');
        if(!a) return;
        var href=a.getAttribute('href')||'';
        try{ var url=new URL(href, location.origin); if(url.origin===location.origin && url.pathname==='/') showFastLeaving(); }catch(_e){}
      }, {capture:true, passive:true});
    });
  }
  function stopLegacyLoopsOnHomeAndSettings(){
    if(!(isHome() || isSettings())) return;
    try{
      if(window.YXHardLock && typeof window.YXHardLock.cancelLegacyTimers==='function'){
        window.YXHardLock.cancelLegacyTimers('fix145-home-settings-fast');
      }
    }catch(_e){}
  }
  function install(){ setFlags(); bindFastNav(); installNeededModules(); stopLegacyLoopsOnHomeAndSettings(); }
  window.YX145FastNavGuard=Object.freeze({version:V,install:install});
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', install, {once:true}); else install();
  window.addEventListener('pageshow', function(){ setFlags(); installNeededModules(); stopLegacyLoopsOnHomeAndSettings(); });
})();
