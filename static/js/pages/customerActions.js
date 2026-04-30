import { post, put, del } from '../core/api.js';
import { modal, esc, toast } from '../utils/dom.js';

export function openCustomerActionModal(card, { onOpen, onRefresh } = {}) {
  const uid = card.dataset.customerUid;
  const name = card.dataset.customerName;
  const m = modal('客戶操作', `<div class="preview-box"><b>${esc(name)}</b></div>
    <div class="action-list">
      <button class="secondary" data-act="open">打開客戶商品</button>
      <button class="secondary" data-act="edit">編輯客戶</button>
      <button class="secondary" data-act="north">移到北區</button>
      <button class="secondary" data-act="middle">移到中區</button>
      <button class="secondary" data-act="south">移到南區</button>
      <button class="danger" data-act="archive">封存客戶</button>
      <button class="danger" data-act="delete">刪除客戶</button>
    </div>`);
  m.addEventListener('click', async (e) => {
    const act = e.target.dataset.act;
    if (!act) return;
    if (act === 'open') { m.remove(); if (onOpen) await onOpen(uid, name); return; }
    if (act === 'edit') {
      const newName = prompt('修改客戶名稱', name) || name;
      const tradeType = prompt('CNF / FOB / FOB代（留空可不填）', card.querySelector('.trade')?.textContent?.trim() || '') || '';
      await put(`/api/customers/${uid}`, { name: newName.trim(), trade_type: tradeType.trim() });
      toast('客戶已更新');
      m.remove();
      if (onRefresh) await onRefresh();
      return;
    }
    const regionMap = { north: '北區', middle: '中區', south: '南區' };
    if (regionMap[act]) {
      await post('/api/customers/move', { customer_uid: uid, region: regionMap[act] });
      toast(`已移到${regionMap[act]}`);
      m.remove();
      if (onRefresh) await onRefresh();
      return;
    }
    if (act === 'archive' || act === 'delete') {
      const label = act === 'delete' ? '刪除' : '封存';
      if (!confirm(`確定${label} ${name}？\n系統會先移到封存，避免誤刪資料。`)) return;
      await del(`/api/customers/${uid}`);
      toast(act === 'delete' ? '已移到封存，避免誤刪' : '已封存客戶');
      m.remove();
      if (onRefresh) await onRefresh();
    }
  });
}

export async function submitWithDuplicateCheck({ target, payload, postPath, onDone }) {
  const check = await post('/api/duplicate-check', { target, ...payload });
  if (check.has_duplicate && check.items?.length) {
    const first = check.items[0];
    const yes = confirm(`發現相同客戶 + 相同尺寸 + 相同材質，要合併嗎？\n\n舊資料：${first.product_text}｜${first.material || '未填材質'}｜${first.qty}件\n新資料：${check.normalized_text}｜${payload.material || '未填材質'}｜${check.qty}件\n\n按「確定」合併，按「取消」另外新增。`);
    if (yes) {
      await post('/api/items/merge', { target, duplicate_id: first.id, product_text: payload.product_text, material: payload.material, qty: check.qty });
      if (onDone) await onDone('已合併商品');
      return;
    }
  }
  await post(postPath, payload);
  if (onDone) await onDone('已新增');
}
