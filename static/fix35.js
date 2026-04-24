/* ==== FIX35：尺寸高度兩位數保留版 ==== */
(function(){
  'use strict';
  const VERSION = 'fix35-height-pad-preserve';
  window.__YUANXING_FIX_VERSION__ = VERSION;
  document.documentElement.dataset.yxVersion = VERSION;

  function normalizeX(v){
    return String(v || '')
      .replace(/[Ｘ×✕＊*X]/g,'x')
      .replace(/[＝]/g,'=')
      .replace(/（/g,'(').replace(/）/g,')')
      .trim();
  }
  function fixSizeText(text){
    const raw = normalizeX(text);
    if(!raw) return raw;
    return raw.replace(/(\d{1,4})x(\d{1,4})x(\d{1,4})(?=\s*(?:=|$|[^0-9]))/g, function(_, a, b, c){
      return `${Number(a)}x${Number(b)}x${String(Number(c)).padStart(2,'0')}`;
    });
  }
  function calcQty(right){
    let total = 0;
    String(right || '').split(/[+＋,，;；]/).forEach(seg => {
      const main = String(seg || '').replace(/[\(（][^\)）]*[\)）]/g, '');
      const nums = main.match(/\d+/g) || [];
      if(nums.length >= 2) total += Number(nums[1] || 0) || 0;
      else if(nums.length === 1) total += 1;
    });
    return Math.max(1, total || 1);
  }
  function parseItemsPreserveHeight(){
    const box = document.getElementById('ocr-text');
    const text = normalizeX(box?.value || '');
    if(!text) return [];
    const out = [];
    let last = ['', '', ''];
    const lines = text.split(/\n+/).map(s => normalizeX(s).replace(/\s+/g,'')).filter(Boolean);
    const parseToken = token => {
      const parts = String(token || '').split(/=|:/);
      const left = parts.shift() || '';
      let right = parts.join('=').replace(/^[=:]+/,'').trim();
      right = right.replace(/[^\dA-Za-z一-鿿xX+＋\-()]/g, '');
      if(!right) return;
      const dimsRaw = String(left || '').split(/x/i).map(x => x.trim());
      const dims = [0,1,2].map(i => {
        const v = dimsRaw[i] || '';
        if(!v || /^[_-]+$/.test(v)) return last[i] || '';
        return String(Number(v));
      });
      if(dims[0] && dims[1] && dims[2]) last = dims.slice();
      if(!dims[0] || !dims[1] || !dims[2]) return;
      const size = `${Number(dims[0])}x${Number(dims[1])}x${String(Number(dims[2])).padStart(2,'0')}`;
      const product_text = `${size}=${right}`;
      out.push({ product_text, product_code: product_text, qty: calcQty(right) });
    };
    lines.forEach(line => {
      const tokens = line.match(/(?:[_-]|\d{1,4})x(?:[_-]|\d{1,4})x(?:[_-]|\d{1,4})\s*(?:=|:)\s*[^\n]+/ig) || [];
      if(tokens.length) tokens.forEach(parseToken);
      else if(line.includes('=') && /x/i.test(line)) parseToken(line);
    });
    return out;
  }
  window.parseTextareaItems = parseItemsPreserveHeight;

  // 後端修復舊資料以前，前端先把畫面上的 132x80x5 顯示成 132x80x05。
  function fixVisibleSizeText(root=document.body){
    if(!root) return;
    const skip = new Set(['SCRIPT','STYLE','TEXTAREA','INPUT','SELECT','OPTION']);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node){
        const p = node.parentElement;
        if(!p || skip.has(p.tagName)) return NodeFilter.FILTER_REJECT;
        return /\d{1,4}[x×X]\d{1,4}[x×X]\d{1,2}/.test(node.nodeValue || '') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    });
    const nodes = [];
    while(walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      const fixed = fixSizeText(node.nodeValue || '');
      if(fixed !== node.nodeValue) node.nodeValue = fixed;
    });
  }
  const obs = new MutationObserver(muts => {
    clearTimeout(window.__yxFix35Timer);
    window.__yxFix35Timer = setTimeout(() => {
      muts.forEach(m => m.addedNodes && m.addedNodes.forEach(n => {
        if(n.nodeType === 1) fixVisibleSizeText(n);
        else if(n.nodeType === 3 && n.parentElement) fixVisibleSizeText(n.parentElement);
      }));
      fixVisibleSizeText();
    }, 60);
  });

  function boot(){
    fixVisibleSizeText();
    try{ obs.observe(document.body, {childList:true, subtree:true}); }catch(_){ }
    try{ localStorage.setItem('yuanxing_fix_version', VERSION); }catch(_){ }
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
