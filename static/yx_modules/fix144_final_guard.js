(function(){'use strict';
  const run=()=>{
    const M=window.YX144; if(!M)return;
    document.documentElement.dataset.yx144FinalGuard='locked';
    M.neutralizeLegacyVisuals?.(); M.fixEmptyButtons?.(); M.installAll?.(false);
    try{window.YXHardLock?.cancelLegacyTimers?.('fix144-final-guard');}catch(_e){}
    document.querySelectorAll('button,a,.chip,.pill').forEach(el=>{if(!el.textContent.trim())el.classList.add('yx144-empty-button');});
    document.dispatchEvent(new CustomEvent('yx144:final-guard',{detail:{version:M.V,module:M.moduleKey()}}));
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true}); else run();
  window.addEventListener('load',()=>{run();setTimeout(run,600);},{once:true});
})();
