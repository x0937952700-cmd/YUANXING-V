/* YX diagnostics client: passive error collector; no timer loops, no DOM observers, no DOM renderer. */
(function(){
  if(window.__YX_DIAGNOSTICS_CLIENT__) return; window.__YX_DIAGNOSTICS_CLIENT__=true;
  const KEY='yx_diagnostics_events_v1';
  function read(){try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch(_){return []}}
  function write(items){try{localStorage.setItem(KEY, JSON.stringify(items.slice(-80)))}catch(_){}}
  function add(type, detail){const item={type:String(type||'event'), page:location.pathname, at:new Date().toISOString(), detail:detail||{}}; const list=read(); list.push(item); write(list);}
  window.addEventListener('error', function(e){add('window.error',{message:e.message, source:e.filename, line:e.lineno, col:e.colno});});
  window.addEventListener('unhandledrejection', function(e){add('promise.unhandled',{message:String(e.reason && (e.reason.message||e.reason) || '')});});
  window.YXDiagnostics={snapshot:()=>({success:true, page:location.pathname, app_version:window.__YX_APP_VERSION__||'', static_version:window.__YX_STATIC_VERSION__||'', events:read()}), clear:()=>write([]), add};
})();
