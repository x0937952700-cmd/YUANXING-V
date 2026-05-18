/* YX front-end performance watcher: no setInterval, no MutationObserver. */
(function(){
  if(window.__YX_PERF_WATCH__) return; window.__YX_PERF_WATCH__=true;
  var KEY='yx_perf_events_v1';
  function read(){try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch(_){return []}}
  function write(list){try{localStorage.setItem(KEY, JSON.stringify((list||[]).slice(-120)))}catch(_){}}
  function add(type, detail){var list=read(); list.push({type:type||'perf', page:location.pathname, at:new Date().toISOString(), detail:detail||{}}); write(list);}
  window.YXPerfWatch={snapshot:function(){return {success:true, static_version:window.__YX_STATIC_VERSION__||'', page:location.pathname, events:read()};}, clear:function(){write([]);}};
  if('performance' in window){window.addEventListener('load', function(){try{var nav=(performance.getEntriesByType&&performance.getEntriesByType('navigation')[0])||null; if(nav){add('page.load',{duration_ms:Math.round(nav.duration||0), dom_ms:Math.round(nav.domContentLoadedEventEnd||0), transfer_ms:Math.round((nav.responseEnd||0)-(nav.requestStart||0))});}}catch(_e){}}, {once:true});}
  if(window.fetch && !window.__YX_FETCH_TIMING_PATCHED__){
    window.__YX_FETCH_TIMING_PATCHED__=true;
    var nativeFetch=window.fetch.bind(window);
    window.fetch=function(input, init){
      var url=''; try{url=typeof input==='string'?input:(input&&input.url)||'';}catch(_e){}
      var watch=/\/api\/(ship-preview|ship\/preview|warehouse|warehouse\/available-items|warehouse\/cells|performance\/last-api-timings|performance\/trace-snapshot)/.test(url);
      var t0=(performance&&performance.now)?performance.now():Date.now();
      return nativeFetch(input, init).then(function(res){
        if(watch){var t1=(performance&&performance.now)?performance.now():Date.now(); add('api.fetch',{url:url, status:res.status, ok:res.ok, duration_ms:Math.round(t1-t0)});} return res;
      }).catch(function(err){if(watch){var t2=(performance&&performance.now)?performance.now():Date.now(); add('api.fetch.error',{url:url, duration_ms:Math.round(t2-t0), message:String(err&&err.message||err)});} throw err;});
    };
  }
})();
