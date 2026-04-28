/* FIX121 華麗標籤介面母版硬鎖：用新標籤風格取代蘋果風；只改視覺，不改功能 / API / 事件 */
(function(){
  'use strict';
  const STYLE_ID = 'yx121-luxury-label-ui-style';
  function injectStyle(){
    const old = document.getElementById(STYLE_ID);
    if (old) old.remove();
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
:root{
  --yx121-gold:#c98217;
  --yx121-gold-deep:#9b5b08;
  --yx121-cream:#f7f0d9;
  --yx121-cream-2:#fffaf0;
  --yx121-ink:#102033;
  --yx121-teal:#082f32;
  --yx121-teal-2:#0e5156;
}
html[data-yx121-luxury-ui="locked"] body{
  background:
    radial-gradient(circle at 18% 0%, rgba(201,130,23,.08), transparent 34%),
    radial-gradient(circle at 86% 12%, rgba(8,81,86,.07), transparent 36%),
    #f4f5f7!important;
}
/* 主頁功能：圖一樣式，純 CSS 乾淨版，沒有旁邊馬賽克 */
html[data-yx121-luxury-ui="locked"] .home-screen .home-menu{
  gap:16px!important;
  max-width:900px!important;
}
html[data-yx121-luxury-ui="locked"] .home-screen .menu-btn{
  position:relative!important;
  min-height:68px!important;
  width:min(92vw, 820px)!important;
  margin:8px auto!important;
  padding:18px 38px!important;
  display:flex!important;
  align-items:center!important;
  justify-content:center!important;
  overflow:visible!important;
  isolation:isolate!important;
  color:#1c2740!important;
  font-size:22px!important;
  font-weight:900!important;
  letter-spacing:.08em!important;
  text-decoration:none!important;
  border:0!important;
  border-radius:0!important;
  background:transparent!important;
  box-shadow:none!important;
  transform:translateZ(0)!important;
  clip-path:polygon(4% 0, 96% 0, 96% 10%, 99% 24%, 96% 38%, 96% 62%, 99% 76%, 96% 90%, 96% 100%, 4% 100%, 4% 90%, 1% 76%, 4% 62%, 4% 38%, 1% 24%, 4% 10%)!important;
}
html[data-yx121-luxury-ui="locked"] .home-screen .menu-btn::before{
  content:""!important;
  position:absolute!important;
  inset:0!important;
  z-index:-2!important;
  background:
    linear-gradient(90deg, transparent 0 3%, var(--yx121-gold) 3% 4.4%, transparent 4.4% 95.6%, var(--yx121-gold) 95.6% 97%, transparent 97%),
    linear-gradient(180deg, var(--yx121-gold), #e3a747 14%, var(--yx121-gold-deep) 28%, var(--yx121-gold) 50%, var(--yx121-gold-deep) 72%, #e3a747 86%, var(--yx121-gold))!important;
  clip-path:inherit!important;
  filter:drop-shadow(0 14px 26px rgba(85,48,8,.16))!important;
}
html[data-yx121-luxury-ui="locked"] .home-screen .menu-btn::after{
  content:""!important;
  position:absolute!important;
  inset:7px 12px!important;
  z-index:-1!important;
  background:
    linear-gradient(90deg, rgba(255,255,255,.72), rgba(255,255,255,.18) 45%, rgba(255,255,255,.62)),
    linear-gradient(180deg, var(--yx121-cream-2), var(--yx121-cream))!important;
  clip-path:polygon(3% 0, 97% 0, 97% 9%, 99.5% 23%, 97% 37%, 97% 63%, 99.5% 77%, 97% 91%, 97% 100%, 3% 100%, 3% 91%, .5% 77%, 3% 63%, 3% 37%, .5% 23%, 3% 9%)!important;
  box-shadow:inset 0 0 0 2px rgba(145,82,8,.33), inset 0 2px 9px rgba(255,255,255,.86)!important;
}
html[data-yx121-luxury-ui="locked"] .home-screen .menu-btn:hover{ transform:translateY(-2px)!important; }
html[data-yx121-luxury-ui="locked"] .home-screen .menu-btn:active{ transform:scale(.985)!important; }
/* 一般按鈕：圖二樣式，深綠金邊標籤。只套視覺，事件不動。 */
html[data-yx121-luxury-ui="locked"] .primary-btn,
html[data-yx121-luxury-ui="locked"] .ghost-btn,
html[data-yx121-luxury-ui="locked"] .secondary-btn,
html[data-yx121-luxury-ui="locked"] .danger-btn,
html[data-yx121-luxury-ui="locked"] .btn-danger,
html[data-yx121-luxury-ui="locked"] .back-btn,
html[data-yx121-luxury-ui="locked"] .home-mini-btn,
html[data-yx121-luxury-ui="locked"] .chip,
html[data-yx121-luxury-ui="locked"] .icon-btn,
html[data-yx121-luxury-ui="locked"] button:not(.customer-region-card):not(.yx113-product-main):not(.warehouse-cell):not(.cell-card):not(.menu-btn){
  position:relative!important;
  overflow:hidden!important;
  min-height:42px!important;
  border:2px solid rgba(223,169,74,.88)!important;
  border-radius:18px!important;
  color:#fef7df!important;
  background:
    radial-gradient(circle at 20% 18%, rgba(255,225,130,.22), transparent 22%),
    radial-gradient(circle at 82% 88%, rgba(255,225,130,.16), transparent 24%),
    repeating-radial-gradient(circle at center, rgba(255,255,255,.045) 0 1px, transparent 1px 6px),
    linear-gradient(180deg, var(--yx121-teal-2), var(--yx121-teal))!important;
  box-shadow:
    0 10px 24px rgba(8,47,50,.22),
    inset 0 0 0 1px rgba(255,245,200,.32),
    inset 0 3px 10px rgba(255,255,255,.14)!important;
  font-weight:850!important;
  letter-spacing:.035em!important;
  -webkit-tap-highlight-color:transparent!important;
  transition:transform .14s ease, filter .14s ease, box-shadow .14s ease!important;
}
html[data-yx121-luxury-ui="locked"] .primary-btn::before,
html[data-yx121-luxury-ui="locked"] .ghost-btn::before,
html[data-yx121-luxury-ui="locked"] .secondary-btn::before,
html[data-yx121-luxury-ui="locked"] .danger-btn::before,
html[data-yx121-luxury-ui="locked"] .btn-danger::before,
html[data-yx121-luxury-ui="locked"] .back-btn::before,
html[data-yx121-luxury-ui="locked"] .home-mini-btn::before,
html[data-yx121-luxury-ui="locked"] .chip::before,
html[data-yx121-luxury-ui="locked"] .icon-btn::before,
html[data-yx121-luxury-ui="locked"] button:not(.customer-region-card):not(.yx113-product-main):not(.warehouse-cell):not(.cell-card):not(.menu-btn)::before{
  content:""!important;
  position:absolute!important;
  inset:4px!important;
  pointer-events:none!important;
  border-radius:14px!important;
  border:1px solid rgba(255,232,154,.38)!important;
  box-shadow:inset 0 0 18px rgba(0,0,0,.14)!important;
}
html[data-yx121-luxury-ui="locked"] .primary-btn:hover,
html[data-yx121-luxury-ui="locked"] .ghost-btn:hover,
html[data-yx121-luxury-ui="locked"] .secondary-btn:hover,
html[data-yx121-luxury-ui="locked"] .back-btn:hover,
html[data-yx121-luxury-ui="locked"] .home-mini-btn:hover,
html[data-yx121-luxury-ui="locked"] .chip:hover,
html[data-yx121-luxury-ui="locked"] button:not(.customer-region-card):not(.yx113-product-main):not(.warehouse-cell):not(.cell-card):not(.menu-btn):hover{
  transform:translateY(-1px)!important;
  filter:saturate(1.06) brightness(1.04)!important;
  box-shadow:0 14px 30px rgba(8,47,50,.26), inset 0 0 0 1px rgba(255,245,200,.40)!important;
}
html[data-yx121-luxury-ui="locked"] .primary-btn:active,
html[data-yx121-luxury-ui="locked"] .ghost-btn:active,
html[data-yx121-luxury-ui="locked"] .secondary-btn:active,
html[data-yx121-luxury-ui="locked"] .back-btn:active,
html[data-yx121-luxury-ui="locked"] .home-mini-btn:active,
html[data-yx121-luxury-ui="locked"] .chip:active,
html[data-yx121-luxury-ui="locked"] button:not(.customer-region-card):not(.yx113-product-main):not(.warehouse-cell):not(.cell-card):not(.menu-btn):active{
  transform:scale(.982)!important;
}
html[data-yx121-luxury-ui="locked"] .danger-btn,
html[data-yx121-luxury-ui="locked"] .btn-danger,
html[data-yx121-luxury-ui="locked"] button.danger-btn{
  color:#fff2e8!important;
  border-color:rgba(255,170,130,.78)!important;
  background:linear-gradient(180deg, #6f1b1b, #471010)!important;
}
/* 頁面標題與面板也統一到標籤風，不碰資料功能 */
html[data-yx121-luxury-ui="locked"] .page-title,
html[data-yx121-luxury-ui="locked"] .module-title{
  color:#172033!important;
  text-shadow:0 1px 0 rgba(255,255,255,.65)!important;
  letter-spacing:.08em!important;
}
html[data-yx121-luxury-ui="locked"] .module-topbar,
html[data-yx121-luxury-ui="locked"] .hero{
  background:linear-gradient(180deg, rgba(255,250,239,.84), rgba(255,255,255,.68))!important;
  border:1px solid rgba(201,130,23,.18)!important;
  box-shadow:0 16px 36px rgba(47,28,8,.07)!important;
}
html[data-yx121-luxury-ui="locked"] .glass.panel,
html[data-yx121-luxury-ui="locked"] .category-box,
html[data-yx121-luxury-ui="locked"] .zone-card,
html[data-yx121-luxury-ui="locked"] .table-card{
  border-color:rgba(201,130,23,.16)!important;
  box-shadow:0 18px 42px rgba(47,28,8,.07)!important;
}
html[data-yx121-luxury-ui="locked"] select,
html[data-yx121-luxury-ui="locked"] .text-input,
html[data-yx121-luxury-ui="locked"] .text-area{
  border-radius:16px!important;
  border:1px solid rgba(201,130,23,.24)!important;
  background:rgba(255,252,244,.96)!important;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.92), 0 6px 18px rgba(75,45,10,.04)!important;
}
@media (max-width: 680px){
  html[data-yx121-luxury-ui="locked"] .home-screen .menu-btn{min-height:60px!important;font-size:20px!important;padding-inline:28px!important;}
}
`;
    document.head.appendChild(style);
  }
  function install(){
    document.documentElement.dataset.yx118AppleUi = 'replaced-by-fix121';
    document.documentElement.dataset.yx121LuxuryUi = 'locked';
    document.documentElement.classList.add('yx121-luxury-ui-locked');
    if (document.body) document.body.classList.add('yx121-luxury-ui-locked');
    injectStyle();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once:true}); else install();
  window.YXLuxuryLabelUI = {install};
  function registerIfReady(){
    const YX = window.YXHardLock;
    if (!YX || !YX.register) return false;
    YX.register('luxury_label_ui', {install});
    return true;
  }
  if (!registerIfReady()) {
    window.addEventListener('DOMContentLoaded', registerIfReady, {once:true});
    setTimeout(registerIfReady, 120);
    setTimeout(registerIfReady, 500);
  }
})();
