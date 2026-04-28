/* FIX125 簡約淡灰標籤母版硬鎖：取代華麗金框 / 蘋果風；只改視覺，不改事件、API、資料流程 */
(function(){
  'use strict';
  const STYLE_ID = 'yx124-minimal-grey-ui-style';
  const OLD_STYLE_IDS = [
    'yx121-luxury-label-ui-style',
    'yx122-luxury-label-ui-style',
    'yx123-luxury-label-ui-style',
    'yx118-apple-ui-style'
  ];

  function removeOldVisualStyles(){
    OLD_STYLE_IDS.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });
    try {
      if (window.__YX122_LABEL_OBSERVER__ && typeof window.__YX122_LABEL_OBSERVER__.disconnect === 'function') {
        window.__YX122_LABEL_OBSERVER__.disconnect();
        window.__YX122_LABEL_OBSERVER__ = null;
      }
    } catch(_e) {}
  }

  function injectStyle(){
    removeOldVisualStyles();
    const old = document.getElementById(STYLE_ID);
    if (old) old.remove();
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
:root{
  --yx124-bg:#f4f5f7;
  --yx124-card:#ffffff;
  --yx124-ink:#111827;
  --yx124-muted:#64748b;
  --yx124-line:#d8dde5;
  --yx124-line-strong:#c5ccd6;
  --yx124-soft:#f7f8fa;
  --yx124-soft-2:#eceff3;
  --yx124-shadow:0 10px 26px rgba(15,23,42,.07);
  --yx124-shadow-soft:0 5px 14px rgba(15,23,42,.055);
}
html[data-yx124-minimal-grey-ui="locked"] body{
  background:var(--yx124-bg)!important;
}
html[data-yx124-minimal-grey-ui="locked"] .home-screen{
  text-align:center!important;
}
html[data-yx124-minimal-grey-ui="locked"] .home-screen .hero.center{
  width:min(94vw, 760px)!important;
  margin:0 auto 14px!important;
  padding-top:6px!important;
  text-align:center!important;
}
html[data-yx124-minimal-grey-ui="locked"] .home-screen .page-title,
html[data-yx124-minimal-grey-ui="locked"] .home-screen h1.page-title{
  text-align:center!important;
  margin-inline:auto!important;
  color:var(--yx124-ink)!important;
  font-size:clamp(30px, 5vw, 44px)!important;
  font-weight:900!important;
  letter-spacing:.16em!important;
  text-shadow:none!important;
}
html[data-yx124-minimal-grey-ui="locked"] .home-screen .home-menu,
html[data-yx124-minimal-grey-ui="locked"] .home-screen .home-menu.vertical{
  width:min(94vw, 760px)!important;
  margin:16px auto 0!important;
  display:flex!important;
  flex-direction:column!important;
  align-items:center!important;
  justify-content:center!important;
  gap:12px!important;
}
html[data-yx124-minimal-grey-ui="locked"] .home-screen .menu-btn,
html[data-yx124-minimal-grey-ui="locked"] .home-screen a.menu-btn{
  position:relative!important;
  box-sizing:border-box!important;
  width:fit-content!important;
  min-width:178px!important;
  max-width:92vw!important;
  min-height:56px!important;
  margin:0 auto!important;
  padding:13px 38px!important;
  display:inline-flex!important;
  align-items:center!important;
  justify-content:center!important;
  text-align:center!important;
  overflow:hidden!important;
  isolation:isolate!important;
  color:var(--yx124-ink)!important;
  font-size:clamp(22px, 3.1vw, 28px)!important;
  line-height:1.1!important;
  font-weight:900!important;
  letter-spacing:.16em!important;
  text-decoration:none!important;
  white-space:nowrap!important;
  border:1px solid var(--yx124-line)!important;
  border-radius:16px!important;
  background:
    linear-gradient(180deg, rgba(255,255,255,.98), rgba(247,248,250,.96))!important;
  box-shadow:var(--yx124-shadow-soft), inset 0 1px 0 rgba(255,255,255,.95)!important;
  transform:none!important;
  filter:none!important;
  clip-path:none!important;
  transition:transform .12s ease, box-shadow .12s ease, border-color .12s ease, background .12s ease!important;
  -webkit-tap-highlight-color:transparent!important;
}
html[data-yx124-minimal-grey-ui="locked"] .home-screen .menu-btn::before,
html[data-yx124-minimal-grey-ui="locked"] .home-screen .menu-btn::after{
  content:none!important;
  display:none!important;
}
html[data-yx124-minimal-grey-ui="locked"] .home-screen .menu-btn:hover{
  transform:translateY(-1px)!important;
  border-color:var(--yx124-line-strong)!important;
  box-shadow:0 8px 20px rgba(15,23,42,.08), inset 0 1px 0 rgba(255,255,255,.95)!important;
}
html[data-yx124-minimal-grey-ui="locked"] .home-screen .menu-btn:active{
  transform:scale(.985)!important;
  background:linear-gradient(180deg, #eef1f5, #f8fafc)!important;
}
html[data-yx124-minimal-grey-ui="locked"] .primary-btn,
html[data-yx124-minimal-grey-ui="locked"] .ghost-btn,
html[data-yx124-minimal-grey-ui="locked"] .secondary-btn,
html[data-yx124-minimal-grey-ui="locked"] .danger-btn,
html[data-yx124-minimal-grey-ui="locked"] .btn-danger,
html[data-yx124-minimal-grey-ui="locked"] .back-btn,
html[data-yx124-minimal-grey-ui="locked"] .home-mini-btn,
html[data-yx124-minimal-grey-ui="locked"] .chip,
html[data-yx124-minimal-grey-ui="locked"] .icon-btn,
html[data-yx124-minimal-grey-ui="locked"] button:not(.customer-region-card):not(.yx113-product-main):not(.warehouse-cell):not(.cell-card):not(.menu-btn){
  position:relative!important;
  overflow:hidden!important;
  min-height:38px!important;
  border:1px solid var(--yx124-line)!important;
  border-radius:14px!important;
  color:var(--yx124-ink)!important;
  background:linear-gradient(180deg, #ffffff, var(--yx124-soft))!important;
  box-shadow:0 4px 12px rgba(15,23,42,.055), inset 0 1px 0 rgba(255,255,255,.9)!important;
  font-weight:800!important;
  letter-spacing:.02em!important;
  white-space:nowrap!important;
  -webkit-tap-highlight-color:transparent!important;
  transition:transform .12s ease, box-shadow .12s ease, border-color .12s ease, background .12s ease!important;
  clip-path:none!important;
  filter:none!important;
}
html[data-yx124-minimal-grey-ui="locked"] .primary-btn::before,
html[data-yx124-minimal-grey-ui="locked"] .ghost-btn::before,
html[data-yx124-minimal-grey-ui="locked"] .secondary-btn::before,
html[data-yx124-minimal-grey-ui="locked"] .danger-btn::before,
html[data-yx124-minimal-grey-ui="locked"] .btn-danger::before,
html[data-yx124-minimal-grey-ui="locked"] .back-btn::before,
html[data-yx124-minimal-grey-ui="locked"] .home-mini-btn::before,
html[data-yx124-minimal-grey-ui="locked"] .chip::before,
html[data-yx124-minimal-grey-ui="locked"] .icon-btn::before,
html[data-yx124-minimal-grey-ui="locked"] button:not(.customer-region-card):not(.yx113-product-main):not(.warehouse-cell):not(.cell-card):not(.menu-btn)::before,
html[data-yx124-minimal-grey-ui="locked"] .primary-btn::after,
html[data-yx124-minimal-grey-ui="locked"] .ghost-btn::after,
html[data-yx124-minimal-grey-ui="locked"] .secondary-btn::after,
html[data-yx124-minimal-grey-ui="locked"] .danger-btn::after,
html[data-yx124-minimal-grey-ui="locked"] .btn-danger::after,
html[data-yx124-minimal-grey-ui="locked"] .back-btn::after,
html[data-yx124-minimal-grey-ui="locked"] .home-mini-btn::after,
html[data-yx124-minimal-grey-ui="locked"] .chip::after,
html[data-yx124-minimal-grey-ui="locked"] .icon-btn::after,
html[data-yx124-minimal-grey-ui="locked"] button:not(.customer-region-card):not(.yx113-product-main):not(.warehouse-cell):not(.cell-card):not(.menu-btn)::after{
  content:none!important;
  display:none!important;
}
html[data-yx124-minimal-grey-ui="locked"] .primary-btn:hover,
html[data-yx124-minimal-grey-ui="locked"] .ghost-btn:hover,
html[data-yx124-minimal-grey-ui="locked"] .secondary-btn:hover,
html[data-yx124-minimal-grey-ui="locked"] .back-btn:hover,
html[data-yx124-minimal-grey-ui="locked"] .home-mini-btn:hover,
html[data-yx124-minimal-grey-ui="locked"] .chip:hover,
html[data-yx124-minimal-grey-ui="locked"] button:not(.customer-region-card):not(.yx113-product-main):not(.warehouse-cell):not(.cell-card):not(.menu-btn):hover{
  transform:translateY(-1px)!important;
  border-color:var(--yx124-line-strong)!important;
  box-shadow:0 8px 18px rgba(15,23,42,.075), inset 0 1px 0 rgba(255,255,255,.92)!important;
  filter:none!important;
}
html[data-yx124-minimal-grey-ui="locked"] .primary-btn:active,
html[data-yx124-minimal-grey-ui="locked"] .ghost-btn:active,
html[data-yx124-minimal-grey-ui="locked"] .secondary-btn:active,
html[data-yx124-minimal-grey-ui="locked"] .back-btn:active,
html[data-yx124-minimal-grey-ui="locked"] .home-mini-btn:active,
html[data-yx124-minimal-grey-ui="locked"] .chip:active,
html[data-yx124-minimal-grey-ui="locked"] button:not(.customer-region-card):not(.yx113-product-main):not(.warehouse-cell):not(.cell-card):not(.menu-btn):active{
  transform:scale(.985)!important;
  background:linear-gradient(180deg, var(--yx124-soft-2), #f8fafc)!important;
}
html[data-yx124-minimal-grey-ui="locked"] .danger-btn,
html[data-yx124-minimal-grey-ui="locked"] .btn-danger,
html[data-yx124-minimal-grey-ui="locked"] button.danger-btn{
  color:#b42318!important;
  border-color:#f0c8c2!important;
  background:linear-gradient(180deg, #fffafa, #fff1f0)!important;
}
html[data-yx124-minimal-grey-ui="locked"] .module-topbar,
html[data-yx124-minimal-grey-ui="locked"] .hero,
html[data-yx124-minimal-grey-ui="locked"] .glass.panel,
html[data-yx124-minimal-grey-ui="locked"] .category-box,
html[data-yx124-minimal-grey-ui="locked"] .zone-card,
html[data-yx124-minimal-grey-ui="locked"] .table-card{
  border-color:rgba(148,163,184,.22)!important;
  box-shadow:var(--yx124-shadow)!important;
}
html[data-yx124-minimal-grey-ui="locked"] .page-title,
html[data-yx124-minimal-grey-ui="locked"] .module-title{
  color:var(--yx124-ink)!important;
  text-shadow:none!important;
}
html[data-yx124-minimal-grey-ui="locked"] select,
html[data-yx124-minimal-grey-ui="locked"] .text-input,
html[data-yx124-minimal-grey-ui="locked"] .text-area{
  border-radius:14px!important;
  border:1px solid var(--yx124-line)!important;
  background:#fff!important;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.88)!important;
}
/* 延續 FIX122：商品小卡四顆按鈕固定同一排，只改排版，不動事件 */
html[data-yx124-minimal-grey-ui="locked"] .yx113-product-actions,
html[data-yx124-minimal-grey-ui="locked"] .yx112-product-card .btn-row,
html[data-yx124-minimal-grey-ui="locked"] .yx113-product-card .btn-row,
html[data-yx124-minimal-grey-ui="locked"] .deduct-card .yx113-product-actions{
  display:grid!important;
  grid-auto-flow:column!important;
  grid-auto-columns:minmax(0,1fr)!important;
  align-items:center!important;
  gap:6px!important;
  width:100%!important;
  flex-wrap:nowrap!important;
  overflow:visible!important;
}
html[data-yx124-minimal-grey-ui="locked"] .yx113-product-actions > button,
html[data-yx124-minimal-grey-ui="locked"] .yx112-product-card .btn-row > button,
html[data-yx124-minimal-grey-ui="locked"] .yx113-product-card .btn-row > button{
  min-width:0!important;
  width:100%!important;
  min-height:34px!important;
  padding:6px 5px!important;
  font-size:12px!important;
  line-height:1.05!important;
  border-radius:14px!important;
  text-align:center!important;
}
@media (max-width:720px){
  html[data-yx124-minimal-grey-ui="locked"] .home-screen .menu-btn{
    min-width:154px!important;
    min-height:52px!important;
    padding:12px 30px!important;
    font-size:22px!important;
  }
  html[data-yx124-minimal-grey-ui="locked"] .yx113-product-actions > button,
  html[data-yx124-minimal-grey-ui="locked"] .yx112-product-card .btn-row > button,
  html[data-yx124-minimal-grey-ui="locked"] .yx113-product-card .btn-row > button{font-size:11px!important;padding-inline:3px!important;}
}
`;
    document.head.appendChild(style);
  }

  function mark(){
    document.documentElement.dataset.yx118AppleUi = 'disabled-by-fix125';
    document.documentElement.dataset.yx121LuxuryUi = 'disabled-by-fix125';
    document.documentElement.dataset.yx122LabelUi = 'disabled-by-fix125';
    document.documentElement.dataset.yx123LabelUi = 'disabled-by-fix125';
    document.documentElement.dataset.yx124MinimalGreyUi = 'locked';
    document.documentElement.classList.add('yx124-minimal-grey-ui-locked');
    if (document.body) document.body.classList.add('yx124-minimal-grey-ui-locked');
  }

  function enforceActionRows(){
    try {
      document.querySelectorAll('.yx113-product-actions,.yx112-product-card .btn-row,.yx113-product-card .btn-row').forEach(row => {
        row.classList.add('yx124-action-row-locked');
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

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once:true}); else install();
  window.addEventListener('pageshow', install);
  window.addEventListener('yx:legacy-rendered', install);
  // 輕量補強：只跑幾次，不常駐監控，避免影響速度。
  [0,160,500,1200].forEach(ms => setTimeout(install, ms));
  window.YXMinimalGreyUI124 = {install};

  function registerIfReady(){
    const YX = window.YXHardLock;
    if (!YX || !YX.register) return false;
    YX.register('minimal_grey_ui_v124', {install});
    return true;
  }
  if (!registerIfReady()) {
    window.addEventListener('DOMContentLoaded', registerIfReady, {once:true});
    [100,300,900].forEach(ms => setTimeout(registerIfReady, ms));
  }
})();
