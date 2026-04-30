(function(){
  'use strict';
  if (window.__YX_DB_API_GATE_V18__) return;
  window.__YX_DB_API_GATE_V18__ = true;
  const originalFetch = window.fetch.bind(window);
  const MAX_API = 3;
  const inflightGet = new Map();
  const queue = [];
  let active = 0;
  function isApi(input){
    try{
      const u = typeof input === 'string' ? input : (input && input.url) || '';
      const url = new URL(u, location.origin);
      return url.origin === location.origin && url.pathname.startsWith('/api/');
    }catch(_){ return false; }
  }
  function keyOf(input, init){
    try{
      const u = typeof input === 'string' ? input : (input && input.url) || '';
      const url = new URL(u, location.origin);
      return url.pathname + url.search;
    }catch(_){ return String(input); }
  }
  function methodOf(input, init){
    return String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
  }
  function runNext(){
    if (active >= MAX_API || !queue.length) return;
    const job = queue.shift();
    active++;
    originalFetch(job.input, job.init).then(job.resolve, job.reject).finally(function(){
      active--;
      setTimeout(runNext, 0);
    });
  }
  window.fetch = function(input, init){
    if (!isApi(input)) return originalFetch(input, init);
    const method = methodOf(input, init);
    const key = keyOf(input, init);
    if (method === 'GET') {
      const old = inflightGet.get(key);
      if (old) return old.then(r => r.clone());
    }
    const p = new Promise(function(resolve, reject){
      queue.push({input, init, resolve, reject});
      runNext();
    });
    if (method === 'GET') {
      inflightGet.set(key, p);
      p.finally(function(){ setTimeout(function(){ inflightGet.delete(key); }, 250); });
      return p.then(r => r.clone());
    }
    return p;
  };
})();
