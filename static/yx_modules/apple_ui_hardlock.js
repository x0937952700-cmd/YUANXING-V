/* FIX118 蘋果風按鈕介面母版硬鎖：只改視覺，不改 API / 資料 / 按鈕事件 */
(function(){
  'use strict';
  const YX = window.YXHardLock;
  if (!YX) return;
  const STYLE_ID = 'yx118-apple-ui-runtime-style';
  function injectStyle(){
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
html[data-yx118-apple-ui="locked"] button,
html[data-yx118-apple-ui="locked"] a.menu-btn,
html[data-yx118-apple-ui="locked"] a.home-mini-btn,
html[data-yx118-apple-ui="locked"] a.back-btn,
html[data-yx118-apple-ui="locked"] .primary-btn,
html[data-yx118-apple-ui="locked"] .ghost-btn,
html[data-yx118-apple-ui="locked"] .secondary-btn,
html[data-yx118-apple-ui="locked"] .home-mini-btn,
html[data-yx118-apple-ui="locked"] .menu-btn,
html[data-yx118-apple-ui="locked"] .back-btn,
html[data-yx118-apple-ui="locked"] .icon-btn,
html[data-yx118-apple-ui="locked"] .chip{
  -webkit-tap-highlight-color:transparent!important;
  border-radius:18px!important;
  border:1px solid rgba(17,24,39,.10)!important;
  background:linear-gradient(180deg, rgba(255,255,255,.94), rgba(247,248,250,.90))!important;
  color:#111827!important;
  box-shadow:0 10px 28px rgba(15,23,42,.10), inset 0 1px 0 rgba(255,255,255,.95)!important;
  backdrop-filter:blur(20px) saturate(1.3)!important;
  -webkit-backdrop-filter:blur(20px) saturate(1.3)!important;
  font-weight:760!important;
  letter-spacing:.01em!important;
  transition:transform .16s cubic-bezier(.2,.8,.2,1), box-shadow .16s ease, background .16s ease, border-color .16s ease, opacity .16s ease!important;
  touch-action:manipulation!important;
}
html[data-yx118-apple-ui="locked"] button:hover,
html[data-yx118-apple-ui="locked"] a.menu-btn:hover,
html[data-yx118-apple-ui="locked"] a.home-mini-btn:hover,
html[data-yx118-apple-ui="locked"] a.back-btn:hover,
html[data-yx118-apple-ui="locked"] .primary-btn:hover,
html[data-yx118-apple-ui="locked"] .ghost-btn:hover,
html[data-yx118-apple-ui="locked"] .chip:hover{
  transform:translateY(-1px)!important;
  box-shadow:0 14px 34px rgba(15,23,42,.14), inset 0 1px 0 rgba(255,255,255,.96)!important;
}
html[data-yx118-apple-ui="locked"] button:active,
html[data-yx118-apple-ui="locked"] a.menu-btn:active,
html[data-yx118-apple-ui="locked"] a.home-mini-btn:active,
html[data-yx118-apple-ui="locked"] a.back-btn:active,
html[data-yx118-apple-ui="locked"] .primary-btn:active,
html[data-yx118-apple-ui="locked"] .ghost-btn:active,
html[data-yx118-apple-ui="locked"] .chip:active{
  transform:scale(.982)!important;
  box-shadow:0 5px 16px rgba(15,23,42,.10), inset 0 1px 0 rgba(255,255,255,.78)!important;
}
html[data-yx118-apple-ui="locked"] .primary-btn,
html[data-yx118-apple-ui="locked"] button.primary-btn,
html[data-yx118-apple-ui="locked"] .menu-btn,
html[data-yx118-apple-ui="locked"] a.menu-btn{
  background:linear-gradient(180deg, rgba(31,31,34,.98), rgba(17,24,39,.98))!important;
  color:#fff!important;
  border-color:rgba(255,255,255,.14)!important;
  box-shadow:0 14px 32px rgba(17,24,39,.22), inset 0 1px 0 rgba(255,255,255,.20)!important;
}
html[data-yx118-apple-ui="locked"] .danger-btn,
html[data-yx118-apple-ui="locked"] button.danger-btn,
html[data-yx118-apple-ui="locked"] .btn-danger{
  color:#d70015!important;
  background:linear-gradient(180deg, rgba(255,247,247,.96), rgba(255,241,242,.92))!important;
  border-color:rgba(255,59,48,.24)!important;
}
html[data-yx118-apple-ui="locked"] button:disabled,
html[data-yx118-apple-ui="locked"] .primary-btn:disabled,
html[data-yx118-apple-ui="locked"] .ghost-btn:disabled{
  opacity:.46!important; transform:none!important; cursor:not-allowed!important;
}
html[data-yx118-apple-ui="locked"] select,
html[data-yx118-apple-ui="locked"] .text-input,
html[data-yx118-apple-ui="locked"] .text-area{
  border-radius:18px!important;
  border:1px solid rgba(17,24,39,.10)!important;
  background:rgba(255,255,255,.92)!important;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.92), 0 6px 18px rgba(15,23,42,.05)!important;
}
html[data-yx118-apple-ui="locked"] .yx113-toolbar,
html[data-yx118-apple-ui="locked"] .yx114-toolbar,
html[data-yx118-apple-ui="locked"] .btn-row,
html[data-yx118-apple-ui="locked"] .query-bar,
html[data-yx118-apple-ui="locked"] .search-row{
  gap:10px!important;
}
`;
    document.head.appendChild(style);
  }
  function install(){
    const root = document.documentElement;
    root.dataset.yx117AppleUi = 'locked';
    root.dataset.yx118AppleUi = 'locked';
    root.classList.add('yx118-apple-ui-locked');
    if (document.body) document.body.classList.add('yx118-apple-ui-locked');
    injectStyle();
  }
  YX.register('apple_ui', {install});
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once:true}); else install();
})();
