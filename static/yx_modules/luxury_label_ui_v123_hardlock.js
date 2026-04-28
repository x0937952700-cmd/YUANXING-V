/* FIX123 華麗異形框母版硬鎖：主頁功能標籤改成金色異形外框，寬度只包住文字；只改視覺，不改功能 / API / 事件 */
(function(){
  'use strict';
  const STYLE_ID = 'yx123-luxury-frame-ui-style';

  function injectStyle(){
    const old = document.getElementById(STYLE_ID);
    if (old) old.remove();
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
:root{
  --yx123-gold:#c98418;
  --yx123-gold-mid:#e2ad51;
  --yx123-gold-light:#ffe7a5;
  --yx123-gold-deep:#8a5007;
  --yx123-panel:#f8f7f0;
  --yx123-panel-2:#ffffff;
  --yx123-ink:#152238;
}
html[data-yx123-frame-ui="locked"] body{
  background:radial-gradient(circle at 18% 0%, rgba(201,132,24,.07), transparent 36%),radial-gradient(circle at 90% 14%, rgba(13,85,88,.055), transparent 34%),#f5f6f8!important;
}
html[data-yx123-frame-ui="locked"] .home-screen{text-align:center!important;}
html[data-yx123-frame-ui="locked"] .home-screen .hero.center{width:min(92vw,860px)!important;margin:0 auto 14px!important;text-align:center!important;}
html[data-yx123-frame-ui="locked"] .home-screen .page-title,
html[data-yx123-frame-ui="locked"] .home-screen h1.page-title{
  display:block!important;text-align:center!important;font-size:clamp(34px,5.2vw,48px)!important;font-weight:950!important;letter-spacing:.16em!important;color:var(--yx123-ink)!important;margin:8px auto 10px!important;width:100%!important;
}
html[data-yx123-frame-ui="locked"] .home-screen .home-menu.vertical,
html[data-yx123-frame-ui="locked"] .home-screen .home-menu{
  width:100%!important;max-width:none!important;margin:18px auto 0!important;display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;gap:18px!important;
}
html[data-yx123-frame-ui="locked"] .home-screen .menu-btn,
html[data-yx123-frame-ui="locked"] .home-screen a.menu-btn{
  position:relative!important;width:auto!important;min-width:clamp(214px,28vw,300px)!important;max-width:calc(100vw - 28px)!important;min-height:82px!important;margin:0 auto!important;padding:24px 94px!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;text-align:center!important;overflow:visible!important;isolation:isolate!important;color:var(--yx123-ink)!important;font-size:clamp(26px,3.2vw,32px)!important;line-height:1.05!important;font-weight:950!important;letter-spacing:.14em!important;text-decoration:none!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;transform:translateZ(0)!important;white-space:nowrap!important;clip-path:none!important;z-index:0!important;-webkit-tap-highlight-color:transparent!important;
}
html[data-yx123-frame-ui="locked"] .home-screen .menu-btn::before,
html[data-yx123-frame-ui="locked"] .home-screen a.menu-btn::before{
  content:""!important;position:absolute!important;z-index:-2!important;pointer-events:none!important;inset:0!important;border-radius:0!important;background:radial-gradient(circle at 8% 50%, rgba(255,239,176,.9) 0 7px, transparent 8px),radial-gradient(circle at 92% 50%, rgba(255,239,176,.9) 0 7px, transparent 8px),repeating-radial-gradient(circle at center, rgba(255,255,255,.18) 0 1px, rgba(255,255,255,0) 1px 7px),linear-gradient(180deg,var(--yx123-gold-light) 0%,var(--yx123-gold-mid) 16%,var(--yx123-gold) 42%,var(--yx123-gold-deep) 78%,var(--yx123-gold-mid) 100%)!important;clip-path:polygon(12% 0%,88% 0%,90.5% 8%,95% 9%,96.5% 28%,100% 50%,96.5% 72%,95% 91%,90.5% 92%,88% 100%,12% 100%,9.5% 92%,5% 91%,3.5% 72%,0% 50%,3.5% 28%,5% 9%,9.5% 8%)!important;filter:drop-shadow(0 12px 22px rgba(80,50,8,.22))!important;
}
html[data-yx123-frame-ui="locked"] .home-screen .menu-btn::after,
html[data-yx123-frame-ui="locked"] .home-screen a.menu-btn::after{
  content:""!important;position:absolute!important;z-index:-1!important;pointer-events:none!important;inset:10px 34px!important;border-radius:0!important;background:radial-gradient(circle at 50% -14%, rgba(255,255,255,.95), transparent 33%),repeating-radial-gradient(circle at center, rgba(80,80,80,.04) 0 1px, transparent 1px 10px),linear-gradient(90deg,rgba(255,255,255,.88),rgba(255,255,255,.44) 44%,rgba(255,255,255,.84)),linear-gradient(180deg,var(--yx123-panel-2),var(--yx123-panel))!important;clip-path:polygon(11% 0%,89% 0%,91.5% 10%,94.5% 13%,95.5% 31%,100% 50%,95.5% 69%,94.5% 87%,91.5% 90%,89% 100%,11% 100%,8.5% 90%,5.5% 87%,4.5% 69%,0% 50%,4.5% 31%,5.5% 13%,8.5% 10%)!important;box-shadow:inset 0 0 0 1px rgba(175,113,22,.28),inset 0 0 0 3px rgba(255,255,255,.46),inset 0 7px 18px rgba(255,255,255,.5),inset 0 -8px 16px rgba(120,82,20,.08)!important;
}
html[data-yx123-frame-ui="locked"] .home-screen .menu-btn:hover,
html[data-yx123-frame-ui="locked"] .home-screen a.menu-btn:hover{transform:translateY(-2px)!important;filter:brightness(1.035)!important;}
html[data-yx123-frame-ui="locked"] .home-screen .menu-btn:active,
html[data-yx123-frame-ui="locked"] .home-screen a.menu-btn:active{transform:scale(.985)!important;}
html[data-yx123-frame-ui="locked"] .yx113-product-actions,
html[data-yx123-frame-ui="locked"] .yx112-product-card .btn-row,
html[data-yx123-frame-ui="locked"] .yx113-product-card .btn-row,
html[data-yx123-frame-ui="locked"] .deduct-card .yx113-product-actions{display:grid!important;grid-auto-flow:column!important;grid-auto-columns:minmax(0,1fr)!important;align-items:center!important;gap:6px!important;width:100%!important;flex-wrap:nowrap!important;overflow:visible!important;}
@media (max-width:720px){
  html[data-yx123-frame-ui="locked"] .home-screen .home-menu.vertical,html[data-yx123-frame-ui="locked"] .home-screen .home-menu{gap:14px!important;}
  html[data-yx123-frame-ui="locked"] .home-screen .menu-btn,html[data-yx123-frame-ui="locked"] .home-screen a.menu-btn{min-height:72px!important;min-width:min(78vw,286px)!important;padding:20px 72px!important;font-size:clamp(22px,6vw,28px)!important;}
  html[data-yx123-frame-ui="locked"] .home-screen .menu-btn::after,html[data-yx123-frame-ui="locked"] .home-screen a.menu-btn::after{inset:9px 26px!important;}
}
`;
    document.head.appendChild(style);
  }

  function mark(){
    document.documentElement.dataset.yx121LuxuryUi = 'replaced-by-fix123';
    document.documentElement.dataset.yx122LabelUi = 'replaced-by-fix123';
    document.documentElement.dataset.yx123FrameUi = 'locked';
    document.documentElement.classList.add('yx123-frame-ui-locked');
    if (document.body) document.body.classList.add('yx123-frame-ui-locked');
  }
  function enforceHomeButtons(){
    try {
      document.querySelectorAll('.home-screen .menu-btn').forEach(btn => {
        btn.classList.add('yx123-ornate-frame-btn');
        btn.style.setProperty('width','auto','important');
        btn.style.setProperty('border-radius','0','important');
      });
    } catch(_e) {}
  }
  function install(){mark();injectStyle();enforceHomeButtons();}
  function observe(){
    if (window.__YX123_FRAME_OBSERVER__) return;
    const NativeMO = window.__YX96_NATIVE_MUTATION_OBSERVER__ || window.MutationObserver;
    if (typeof NativeMO === 'undefined' || !document.body) return;
    window.__YX123_FRAME_OBSERVER__ = new NativeMO(() => {if (!document.getElementById(STYLE_ID)) injectStyle();enforceHomeButtons();});
    window.__YX123_FRAME_OBSERVER__.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style']});
  }
  function boot(){install();observe();}
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true}); else boot();
  window.addEventListener('pageshow', install);
  window.addEventListener('yx:legacy-rendered', install);
  [0,120,350,900,1800,3200].forEach(ms => setTimeout(install, ms));
  window.YXLuxuryFrameUI123 = {install};
  function registerIfReady(){const YX = window.YXHardLock;if (!YX || !YX.register) return false;YX.register('luxury_label_ui_v123',{install});return true;}
  if (!registerIfReady()) {window.addEventListener('DOMContentLoaded', registerIfReady,{once:true});[80,240,700,1500].forEach(ms => setTimeout(registerIfReady,ms));}
})();
