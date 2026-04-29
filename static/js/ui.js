export const $ = (s, root=document) => root.querySelector(s);
export const $$ = (s, root=document) => Array.from(root.querySelectorAll(s));

export function toast(text, type='info'){
  const host = $('#toastHost');
  const div = document.createElement('div');
  div.className = 'toast';
  div.textContent = text;
  host.appendChild(div);
  setTimeout(()=>div.remove(), 2600);
}

export async function lock(btn, fn){
  if(!btn) return fn();
  if(btn.disabled) return;
  const old = btn.textContent;
  btn.disabled = true;
  btn.textContent = '送出中...';
  try{ return await fn(); }
  finally{ btn.disabled = false; btn.textContent = old; }
}

export function empty(text='目前沒有資料'){
  return `<div class="empty">${escapeHtml(text)}</div>`;
}

export function escapeHtml(s=''){
  return String(s).replace(/[&<>'"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]));
}

export function modal(html){
  const dlg = $('#modal');
  dlg.innerHTML = `<div class="modal-inner">${html}</div>`;
  dlg.showModal();
  dlg.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>dlg.close());
  return dlg;
}

export function itemCard(it, actions=[], opts={}){
  const customer = it.customer ? `<span class="tag">${escapeHtml(it.customer)}</span>` : '';
  const unplaced = opts.unplaced ? `<span class="tag red">未錄入倉庫圖</span>` : '';
  const acts = actions.map(a=>`<button class="btn small ${a.cls||'secondary'}" data-act="${a.act}" data-id="${it.id}" data-source="${it.source_table||opts.source||''}">${a.label}</button>`).join('');
  return `<article class="item-card" data-id="${it.id}">
    <div class="item-top"><div><div class="material">${escapeHtml(it.material||'未填材質')}</div><div class="size-line">${escapeHtml(it.product_text||'')}</div><div class="qty-line">${escapeHtml(String(it.pieces ?? it.qty ?? 0))} 件</div></div><div>${customer}${unplaced}</div></div>
    <div class="item-actions">${acts}</div>
  </article>`;
}

export function bindSwipeDelete(root, selector, onDelete){
  root.querySelectorAll(selector).forEach(el=>{
    let sx=0, dx=0;
    el.addEventListener('touchstart',e=>{sx=e.touches[0].clientX;dx=0;},{passive:true});
    el.addEventListener('touchmove',e=>{dx=e.touches[0].clientX-sx; if(dx<-60){el.style.transform='translateX(-18px)';}}, {passive:true});
    el.addEventListener('touchend',()=>{el.style.transform=''; if(dx<-80) onDelete(el);});
  });
}
