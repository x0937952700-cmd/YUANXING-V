/* FIX122 華麗圓框標籤母版硬鎖：主頁改圖二白金標籤、商品四顆按鈕同排；只改視覺，不改功能 / API / 事件 */
(function(){
  'use strict';
  const STYLE_ID = 'yx122-luxury-label-ui-style';

  function injectStyle(){
    const old = document.getElementById(STYLE_ID);
    if (old) old.remove();
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
:root{
  --yx122-gold:#c98418;
  --yx122-gold-mid:#e0ad55;
  --yx122-gold-light:#ffe4a2;
  --yx122-gold-deep:#8f5508;
  --yx122-cream:#f8f5ea;
  --yx122-cream-2:#fffdf6;
  --yx122-ink:#152238;
  --yx122-teal:#062f32;
  --yx122-teal-2:#0d5558;
}
html[data-yx122-label-ui="locked"] body{
  background:
    radial-gradient(circle at 18% 0%, rgba(201,132,24,.08), transparent 36%),
    radial-gradient(circle at 90% 14%, rgba(13,85,88,.065), transparent 34%),
    #f5f6f8!important;
}
/* 主頁：改成圖二白底金色圓框標籤，乾淨 CSS 版，沒有馬賽克或浮水印 */
html[data-yx122-label-ui="locked"] .home-screen{
  text-align:center!important;
}
html[data-yx122-label-ui="locked"] .home-screen .hero.center{
  width:min(92vw, 860px)!important;
  margin:0 auto 18px!important;
  text-align:center!important;
}
html[data-yx122-label-ui="locked"] .home-screen .page-title,
html[data-yx122-label-ui="locked"] .home-screen h1.page-title{
  text-align:center!important;
  font-size:clamp(32px, 5vw, 46px)!important;
  font-weight:950!important;
  letter-spacing:.14em!important;
  color:var(--yx122-ink)!important;
  margin-inline:auto!important;
}
html[data-yx122-label-ui="locked"] .home-screen .home-menu.vertical,
html[data-yx122-label-ui="locked"] .home-screen .home-menu{
  width:min(92vw, 860px)!important;
  max-width:860px!important;
  margin:18px auto 0!important;
  display:flex!important;
  flex-direction:column!important;
  align-items:center!important;
  gap:18px!important;
}
html[data-yx122-label-ui="locked"] .home-screen .menu-btn,
html[data-yx122-label-ui="locked"] .home-screen a.menu-btn{
  position:relative!important;
  width:100%!important;
  min-height:86px!important;
  margin:0 auto!important;
  padding:22px 80px!important;
  display:flex!important;
  align-items:center!important;
  justify-content:center!important;
  text-align:center!important;
  overflow:visible!important;
  isolation:isolate!important;
  color:var(--yx122-ink)!important;
  font-size:clamp(24px, 3.2vw, 30px)!important;
  line-height:1.15!important;
  font-weight:950!important;
  letter-spacing:.12em!important;
  text-decoration:none!important;
  border:0!important;
  border-radius:36px!important;
  background:transparent!important;
  box-shadow:none!important;
  transform:translateZ(0)!important;
  clip-path:none!important;
  white-space:nowrap!important;
}
html[data-yx122-label-ui="locked"] .home-screen .menu-btn::before{
  content:""!important;
  position:absolute!important;
  inset:0!important;
  z-index:-2!important;
  pointer-events:none!important;
  border-radius:38px!important;
  clip-path:none!important;
  background:
    radial-gradient(circle at 7% 50%, rgba(255,236,160,.95) 0 8px, transparent 9px),
    radial-gradient(circle at 93% 50%, rgba(255,236,160,.95) 0 8px, transparent 9px),
    repeating-radial-gradient(circle at 50% 50%, rgba(255,255,255,.16) 0 1px, rgba(255,255,255,0) 1px 7px),
    linear-gradient(180deg, var(--yx122-gold-light), var(--yx122-gold-mid) 18%, var(--yx122-gold) 42%, var(--yx122-gold-deep) 76%, var(--yx122-gold-mid))!important;
  box-shadow:
    0 14px 30px rgba(88,53,7,.18),
    inset 0 2px 0 rgba(255,245,196,.72),
    inset 0 -3px 0 rgba(119,68,8,.34)!important;
}
html[data-yx122-label-ui="locked"] .home-screen .menu-btn::after{
  content:""!important;
  position:absolute!important;
  inset:11px 46px!important;
  z-index:-1!important;
  pointer-events:none!important;
  border-radius:28px!important;
  clip-path:none!important;
  background:
    radial-gradient(circle at 50% -14%, rgba(255,255,255,.9), transparent 35%),
    repeating-radial-gradient(circle at center, rgba(75,75,75,.045) 0 1px, transparent 1px 11px),
    linear-gradient(90deg, rgba(255,255,255,.82), rgba(255,255,255,.44) 45%, rgba(255,255,255,.78)),
    linear-gradient(180deg, var(--yx122-cream-2), var(--yx122-cream))!important;
  border:1px solid rgba(169,111,24,.42)!important;
  box-shadow:
    inset 0 0 0 2px rgba(255,255,255,.44),
    inset 0 8px 18px rgba(255,255,255,.44),
    inset 0 -7px 16px rgba(130,96,30,.08)!important;
}
html[data-yx122-label-ui="locked"] .home-screen .menu-btn:hover{ transform:translateY(-2px)!important; filter:brightness(1.03)!important; }
html[data-yx122-label-ui="locked"] .home-screen .menu-btn:active{ transform:scale(.986)!important; }
/* 一般按鈕：保留圖二深綠金邊標籤，只鎖視覺，不改 click / submit / API */
html[data-yx122-label-ui="locked"] .primary-btn,
html[data-yx122-label-ui="locked"] .ghost-btn,
html[data-yx122-label-ui="locked"] .secondary-btn,
html[data-yx122-label-ui="locked"] .danger-btn,
html[data-yx122-label-ui="locked"] .btn-danger,
html[data-yx122-label-ui="locked"] .back-btn,
html[data-yx122-label-ui="locked"] .home-mini-btn,
html[data-yx122-label-ui="locked"] .chip,
html[data-yx122-label-ui="locked"] .icon-btn,
html[data-yx122-label-ui="locked"] button:not(.customer-region-card):not(.yx113-product-main):not(.warehouse-cell):not(.cell-card):not(.menu-btn){
  position:relative!important;
  overflow:hidden!important;
  min-height:40px!important;
  border:2px solid rgba(225,172,78,.92)!important;
  border-radius:18px!important;
  color:#fff7dd!important;
  background:
    radial-gradient(circle at 18% 20%, rgba(255,224,135,.22), transparent 23%),
    radial-gradient(circle at 86% 84%, rgba(255,224,135,.16), transparent 25%),
    repeating-radial-gradient(circle at center, rgba(255,255,255,.048) 0 1px, transparent 1px 6px),
    linear-gradient(180deg, var(--yx122-teal-2), var(--yx122-teal))!important;
  box-shadow:
    0 10px 24px rgba(6,47,50,.22),
    inset 0 0 0 1px rgba(255,245,196,.34),
    inset 0 3px 10px rgba(255,255,255,.14)!important;
  font-weight:900!important;
  letter-spacing:.035em!important;
  white-space:nowrap!important;
  -webkit-tap-highlight-color:transparent!important;
  transition:transform .14s ease, filter .14s ease, box-shadow .14s ease!important;
  clip-path:none!important;
}
html[data-yx122-label-ui="locked"] .primary-btn::before,
html[data-yx122-label-ui="locked"] .ghost-btn::before,
html[data-yx122-label-ui="locked"] .secondary-btn::before,
html[data-yx122-label-ui="locked"] .danger-btn::before,
html[data-yx122-label-ui="locked"] .btn-danger::before,
html[data-yx122-label-ui="locked"] .back-btn::before,
html[data-yx122-label-ui="locked"] .home-mini-btn::before,
html[data-yx122-label-ui="locked"] .chip::before,
html[data-yx122-label-ui="locked"] .icon-btn::before,
html[data-yx122-label-ui="locked"] button:not(.customer-region-card):not(.yx113-product-main):not(.warehouse-cell):not(.cell-card):not(.menu-btn)::before{
  content:""!important;
  position:absolute!important;
  inset:4px!important;
  pointer-events:none!important;
  border-radius:14px!important;
  border:1px solid rgba(255,232,154,.42)!important;
  box-shadow:inset 0 0 18px rgba(0,0,0,.14)!important;
}
html[data-yx122-label-ui="locked"] .danger-btn,
html[data-yx122-label-ui="locked"] .btn-danger,
html[data-yx122-label-ui="locked"] button.danger-btn{
  color:#fff2e8!important;
  border-color:rgba(255,176,134,.82)!important;
  background:
    radial-gradient(circle at 20% 20%, rgba(255,220,170,.15), transparent 24%),
    linear-gradient(180deg, #7b2020, #4b1010)!important;
}
html[data-yx122-label-ui="locked"] .primary-btn:hover,
html[data-yx122-label-ui="locked"] .ghost-btn:hover,
html[data-yx122-label-ui="locked"] .secondary-btn:hover,
html[data-yx122-label-ui="locked"] .back-btn:hover,
html[data-yx122-label-ui="locked"] .home-mini-btn:hover,
html[data-yx122-label-ui="locked"] .chip:hover,
html[data-yx122-label-ui="locked"] button:not(.customer-region-card):not(.yx113-product-main):not(.warehouse-cell):not(.cell-card):not(.menu-btn):hover{
  transform:translateY(-1px)!important;
  filter:saturate(1.06) brightness(1.04)!important;
  box-shadow:0 14px 30px rgba(6,47,50,.26), inset 0 0 0 1px rgba(255,245,200,.42)!important;
}
/* 商品小卡：編輯 / 刪除 / 加到訂單 / 加到總單 強制同一排 */
html[data-yx122-label-ui="locked"] .yx113-product-actions,
html[data-yx122-label-ui="locked"] .yx112-product-card .btn-row,
html[data-yx122-label-ui="locked"] .yx113-product-card .btn-row,
html[data-yx122-label-ui="locked"] .deduct-card .yx113-product-actions{
  display:grid!important;
  grid-auto-flow:column!important;
  grid-auto-columns:minmax(0,1fr)!important;
  align-items:center!important;
  gap:6px!important;
  width:100%!important;
  flex-wrap:nowrap!important;
  overflow:visible!important;
}
html[data-yx122-label-ui="locked"] .yx113-product-actions > button,
html[data-yx122-label-ui="locked"] .yx112-product-card .btn-row > button,
html[data-yx122-label-ui="locked"] .yx113-product-card .btn-row > button{
  min-width:0!important;
  width:100%!important;
  min-height:34px!important;
  padding:6px 5px!important;
  font-size:12px!important;
  line-height:1.05!important;
  border-radius:16px!important;
  text-align:center!important;
}
html[data-yx122-label-ui="locked"] .yx113-product-card,
html[data-yx122-label-ui="locked"] .yx112-product-card{
  min-width:260px!important;
}
@media (max-width: 720px){
  html[data-yx122-label-ui="locked"] .home-screen .menu-btn{min-height:74px!important;font-size:24px!important;padding-inline:54px!important;}
  html[data-yx122-label-ui="locked"] .home-screen .menu-btn::after{inset:9px 34px!important;}
  html[data-yx122-label-ui="locked"] .yx113-product-actions > button,
  html[data-yx122-label-ui="locked"] .yx112-product-card .btn-row > button,
  html[data-yx122-label-ui="locked"] .yx113-product-card .btn-row > button{font-size:11px!important;padding-inline:3px!important;}
}
`;
    document.head.appendChild(style);
  }

  function mark(){
    document.documentElement.dataset.yx121LuxuryUi = 'replaced-by-fix122';
    document.documentElement.dataset.yx122LabelUi = 'locked';
    document.documentElement.classList.add('yx122-label-ui-locked');
    if (document.body) document.body.classList.add('yx122-label-ui-locked');
  }
  function enforceActionRows(){
    try {
      document.querySelectorAll('.yx113-product-actions,.yx112-product-card .btn-row,.yx113-product-card .btn-row').forEach(row => {
        row.classList.add('yx122-action-row-locked');
        row.style.setProperty('display','grid','important');
        row.style.setProperty('grid-auto-flow','column','important');
        row.style.setProperty('grid-auto-columns','minmax(0,1fr)','important');
        row.style.setProperty('flex-wrap','nowrap','important');
      });
    } catch(_e) {}
  }
  function install(){
    mark();
    injectStyle();
    enforceActionRows();
  }
  function observe(){
    if (window.__YX122_LABEL_OBSERVER__) return;
    const NativeMO = window.__YX96_NATIVE_MUTATION_OBSERVER__ || window.MutationObserver;
    if (typeof NativeMO === 'undefined' || !document.body) return;
    window.__YX122_LABEL_OBSERVER__ = new NativeMO(() => {
      if (!document.getElementById(STYLE_ID)) injectStyle();
      enforceActionRows();
    });
    window.__YX122_LABEL_OBSERVER__.observe(document.body, {childList:true, subtree:true});
  }
  function boot(){ install(); observe(); }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true}); else boot();
  window.addEventListener('pageshow', install);
  window.addEventListener('yx:legacy-rendered', install);
  [0,120,350,900,1800,3200].forEach(ms => setTimeout(install, ms));
  window.YXLuxuryLabelUI122 = {install};

  function registerIfReady(){
    const YX = window.YXHardLock;
    if (!YX || !YX.register) return false;
    YX.register('luxury_label_ui_v122', {install});
    return true;
  }
  if (!registerIfReady()) {
    window.addEventListener('DOMContentLoaded', registerIfReady, {once:true});
    [80,240,700,1500].forEach(ms => setTimeout(registerIfReady, ms));
  }
})();
