export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
export function esc(value) {
  return String(value ?? '').replace(/[&<>'"]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[s]));
}
export function toast(message, type = 'info') {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.hidden = false;
  el.dataset.type = type;
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}
export function errorHtml(err) { return `<div class="error-card">${esc(err.message || err)}</div>`; }
export function emptyHtml(text='目前沒有資料') { return `<div class="empty">${esc(text)}</div>`; }
export function pageShell(title, inner, actions = '') {
  return `<section class="page"><div class="page-head"><div class="page-left"><button class="secondary" data-route="home">← 返回</button></div><div class="page-title">${esc(title)}</div><div class="page-actions"><button class="secondary" data-global-undo>還原上一步</button>${actions}</div></div>${inner}</section>`;
}
export function modal(title, body, footer = '') {
  const div = document.createElement('div');
  div.className = 'modal-backdrop';
  div.innerHTML = `<div class="modal"><div class="modal-head"><h3>${esc(title)}</h3><button class="ghost small" data-close-modal>關閉</button></div>${body}${footer ? `<div class="toolbar">${footer}</div>` : ''}</div>`;
  div.addEventListener('click', (e) => { if (e.target === div || e.target.matches('[data-close-modal]')) div.remove(); });
  document.body.appendChild(div);
  return div;
}

export function installLongPress(root, selector, handler, delay = 520) {
  let timer = null;
  let startX = 0;
  let startY = 0;
  let target = null;
  const clear = () => { clearTimeout(timer); timer = null; target = null; };
  root.addEventListener('pointerdown', (e) => {
    target = e.target.closest(selector);
    if (!target) return;
    startX = e.clientX; startY = e.clientY;
    timer = setTimeout(() => handler(target, e), delay);
  });
  root.addEventListener('pointermove', (e) => {
    if (!timer) return;
    if (Math.abs(e.clientX - startX) > 8 || Math.abs(e.clientY - startY) > 8) clear();
  });
  root.addEventListener('pointerup', clear);
  root.addEventListener('pointercancel', clear);
  root.addEventListener('contextmenu', (e) => {
    const el = e.target.closest(selector);
    if (!el) return;
    e.preventDefault();
    handler(el, e);
  });
}
