(function(){'use strict';
  const disabled=['master_integrator','fix135','fix136','fix138','fix140','fix142','product_source_bridge','customer_regions','warehouse_hardlock','ship_picker','today_changes_hardlock','settings_audit_hardlock','apple_ui_hardlock','legacy_isolation'];
  window.__YX145_DEPRECATED_MASTERS_DISABLED__=true;
  window.__YX_LEGACY_ASSIST_ONLY__=true;
  document.documentElement.dataset.yx145ConsolidationGuard='locked';
  try{window.YXHardLock?.cancelLegacyTimers?.('fix145-consolidation');}catch(_e){}
  const kill=()=>{
    try{window.YXHardLock?.cancelLegacyTimers?.('fix145-consolidation-tick');}catch(_e){}
    document.querySelectorAll('.legacy-view,.yx-legacy-visual,[data-legacy-visual="1"],.yx140-readme-banner,.fix142-speed-panel').forEach(el=>{el.style.display='none'; el.setAttribute('aria-hidden','true');});
    document.querySelectorAll('script[src]').forEach(s=>{const src=s.getAttribute('src')||''; if(disabled.some(k=>src.includes(k))){s.dataset.yx145Disabled='1';}});
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',kill,{once:true}); else kill();
  window.addEventListener('pageshow',kill);
  document.addEventListener('yx144:installed',kill);
})();
