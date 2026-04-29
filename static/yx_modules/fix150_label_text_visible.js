/* FIX151：保留 FIX150 檔案名稱相容，但停用會改動按鈕 DOM 的文字包裝。
   文字顯示改由 fix151_home_nav_background_guard.css 處理，不再重包按鈕文字，避免導頁與點擊卡住。 */
(function(){
  'use strict';
  var V='fix151-nav-background-unstick';
  window.__YX150_LABEL_TEXT_VISIBLE__ = true;
  window.__YX150_LABEL_TEXT_VISIBLE_SAFE_NOOP__ = true;
  function install(){
    try{
      document.documentElement.dataset.yx150LabelText='locked';
      document.documentElement.dataset.yxFix150=V;
      window.__YX_STATIC_VERSION__=V;
    }catch(_e){}
    return true;
  }
  try{ window.YX150LabelTextVisible = Object.freeze({version:V, install:install, apply:install, safeNoop:true}); }catch(_e){}
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once:true});
  else install();
  window.addEventListener('pageshow', install);
})();
