/* FIX117 蘋果風按鈕介面母版硬鎖：只改視覺，不改 API / 資料 / 按鈕事件 */
(function(){
  'use strict';
  const YX = window.YXHardLock;
  if (!YX) return;
  function install(){
    const root = document.documentElement;
    root.dataset.yx117AppleUi = 'locked';
    root.dataset.yx117Customers = 'locked';
    // 視覺母版只加 dataset，所有功能事件仍保留原按鈕與原函式。
  }
  YX.register('apple_ui', {install});
})();
