/* V125 mobile zoom mainline: fit large product tables / warehouse map on phones, with native pan + pinch. No renderer, no polling, no MutationObserver. */
(function(){
  'use strict';
  if(window.__YX_MOBILE_ZOOM_V125__) return;
  window.__YX_MOBILE_ZOOM_V125__ = true;

  const root = window.YX || (window.YX = {});
  const MIN = 0.42;
  const MAX = 1.35;
  const STEP = 0.1;
  const TARGET_SELECTOR = [
    'body[data-module="inventory"] .yx113-table-wrap',
    'body[data-module="orders"] .yx113-table-wrap',
    'body[data-module="master_order"] .yx113-table-wrap',
    'body[data-module="warehouse"] #warehouse-root',
    'body[data-module="warehouse"] .warehouse-zone-wrap',
    'body[data-module="ship"] .yx22-preview-table',
    'body[data-module="ship"] .yx22-preview-table-wrap',
    'body[data-module="shipping_query"] .table-card'
  ].join(',');

  function isPhoneLayout(){
    return window.matchMedia && window.matchMedia('(max-width: 820px)').matches;
  }
  function clamp(n){
    n = Number(n);
    if(!Number.isFinite(n) || n <= 0) n = 1;
    return Math.max(MIN, Math.min(MAX, n));
  }
  function keyFor(el){
    const mod = document.body?.dataset?.module || 'page';
    if(el.id) return 'yx_mobile_zoom_' + mod + '_' + el.id;
    const table = el.querySelector && el.querySelector('table');
    const kind = table ? (table.className || 'table') : (el.className || 'area');
    return 'yx_mobile_zoom_' + mod + '_' + String(kind).replace(/\s+/g,'_').slice(0,64);
  }
  function contentOf(el){
    if(el.matches && el.matches('.yx22-preview-table')) return el;
    if(el.id === 'warehouse-root' || el.classList.contains('warehouse-zone-wrap')) return el;
    return el.querySelector('table') || el.firstElementChild || el;
  }
  function naturalWidth(el){
    const content = contentOf(el);
    const old = content.style.zoom;
    content.style.zoom = '1';
    let w = Math.max(content.scrollWidth || 0, content.offsetWidth || 0, content.getBoundingClientRect().width || 0);
    content.style.zoom = old;
    if(el.id === 'warehouse-root' || el.classList.contains('warehouse-zone-wrap')){
      w = Math.max(w, 1180);
    }
    return w || el.scrollWidth || el.clientWidth || 1;
  }
  function fitScale(el){
    const pad = 10;
    const available = Math.max(320, (el.clientWidth || window.innerWidth || 360) - pad);
    const w = naturalWidth(el);
    return clamp(Math.min(1, available / Math.max(available, w)));
  }
  function readScale(el){
    const saved = localStorage.getItem(keyFor(el));
    if(saved === 'fit') return fitScale(el);
    const n = Number(saved);
    return Number.isFinite(n) ? clamp(n) : fitScale(el);
  }
  function applyScale(el, scale, persist){
    scale = clamp(scale);
    el.classList.add('yx-mobile-zoom-scroll');
    const content = contentOf(el);
    content.classList.add('yx-mobile-zoom-content');
    el.style.setProperty('--yx-mobile-zoom', String(scale));
    content.style.zoom = String(scale);
    el.dataset.yxMobileZoomScale = String(scale.toFixed(2));
    if(persist) localStorage.setItem(keyFor(el), String(scale));
    updateLabel(el);
  }
  function updateLabel(el){
    const bar = el.previousElementSibling;
    if(!bar || !bar.classList || !bar.classList.contains('yx-mobile-zoom-toolbar')) return;
    const label = bar.querySelector('[data-yx-mobile-zoom-label]');
    if(label) label.textContent = Math.round(Number(el.dataset.yxMobileZoomScale || 1) * 100) + '%';
  }
  function ensureToolbar(el){
    if(!isPhoneLayout()) return;
    if(el.previousElementSibling && el.previousElementSibling.classList && el.previousElementSibling.classList.contains('yx-mobile-zoom-toolbar')) return;
    const bar = document.createElement('div');
    bar.className = 'yx-mobile-zoom-toolbar';
    bar.dataset.yxMobileZoomFor = keyFor(el);
    bar.innerHTML = '<span class="yx-mobile-zoom-hint">手機表格：先縮小看全表，可雙指縮放、任意方向滑動</span><button type="button" data-yx-mobile-zoom="fit">看整張</button><button type="button" data-yx-mobile-zoom="out">縮小</button><button type="button" data-yx-mobile-zoom="in">放大</button><button type="button" data-yx-mobile-zoom="one">100%</button><b data-yx-mobile-zoom-label>100%</b>';
    el.parentNode && el.parentNode.insertBefore(bar, el);
    bar.addEventListener('click', function(ev){
      const btn = ev.target && ev.target.closest && ev.target.closest('[data-yx-mobile-zoom]');
      if(!btn) return;
      ev.preventDefault();
      const cmd = btn.dataset.yxMobileZoom;
      let scale = Number(el.dataset.yxMobileZoomScale || readScale(el));
      if(cmd === 'fit') { localStorage.setItem(keyFor(el), 'fit'); scale = fitScale(el); }
      if(cmd === 'out') scale = scale - STEP;
      if(cmd === 'in') scale = scale + STEP;
      if(cmd === 'one') scale = 1;
      applyScale(el, scale, cmd !== 'fit');
    }, {passive:false});
  }
  function prepare(el){
    if(!el || el.dataset.yxMobileZoomReady === '1') return;
    el.dataset.yxMobileZoomReady = '1';
    el.setAttribute('tabindex', el.getAttribute('tabindex') || '0');
    el.classList.add('yx-mobile-zoom-target');
  }
  function refresh(){
    if(!isPhoneLayout()) return;
    document.querySelectorAll(TARGET_SELECTOR).forEach(function(el){
      prepare(el);
      ensureToolbar(el);
      applyScale(el, readScale(el), false);
    });
  }
  function refreshSoon(){
    try{ requestAnimationFrame(refresh); }catch(_e){ refresh(); }
  }
  root.mobileZoom = {refresh, refreshSoon, applyScale, fitScale, version:'125'};
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh, {once:true}); else refresh();
  window.addEventListener('orientationchange', refreshSoon, {passive:true});
  window.addEventListener('resize', refreshSoon, {passive:true});
})();
