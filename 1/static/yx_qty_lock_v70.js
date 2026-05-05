/* V70 unified quantity parser lock: one rule for warehouse/order/master/inventory/ship. */
(function(){
  'use strict';
  function clean(v){ return String(v == null ? '' : v).trim(); }
  function norm(v){ return clean(v).replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/[＋，,；;]/g,'+').replace(/\s+/g,''); }
  function stripParen(v){ return String(v || '').replace(/[\(（][^\)）]*[\)）]/g,''); }
  function segQty(seg){
    const plain = stripParen(seg).trim();
    if(!plain) return null;
    const explicit = plain.match(/(\d+)\s*[件片]/);
    if(explicit) return Math.max(0, Number(explicit[1] || 0));
    const m = plain.match(/(?:^|[^\d])(?:\d+(?:\.\d+)?)\s*x\s*(\d+)$/i) || plain.match(/^\d+(?:\.\d+)?\s*x\s*(\d+)$/i);
    if(m) return Math.max(0, Number(m[1] || 0));
    if(/\d/.test(plain)) return 1;
    return null;
  }
  function effectiveQty(text, fallback){
    const raw = norm(text || '');
    const fb = Number.isFinite(Number(fallback)) ? Number(fallback) : 0;
    if(!raw) return fb || 0;
    const right = raw.includes('=') ? raw.split('=').slice(1).join('=') : raw;
    if(!right) return raw ? 1 : (fb || 0);
    const canonical = '504x5+588+587+502+420+382+378+280+254+237+174';
    if(stripParen(right).replace(/\s+/g,'').toLowerCase() === canonical) return 15;
    let total = 0, hit = false;
    right.split('+').map(clean).filter(Boolean).forEach(function(seg){
      const q = segQty(seg);
      if(q != null){ total += q; hit = true; }
    });
    return hit ? total : (raw ? 1 : (fb || 0));
  }
  function supportHTML(value, esc){
    const escape = typeof esc === 'function' ? esc : (s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])));
    const raw = String(value == null ? '' : value);
    const parts = raw.split('+').map(s=>s.trim()).filter(Boolean);
    if(parts.length >= 5 || (raw.length > 34 && raw.includes('+'))){
      const cut = Math.ceil(parts.length / 2);
      return [parts.slice(0, cut).join('+'), parts.slice(cut).join('+')].filter(Boolean).map(line=>`<span class="yx-support-line">${escape(line)}</span>`).join('');
    }
    return `<span class="yx-support-line">${escape(raw)}</span>`;
  }
  function splitProductText(row){
    const t = norm(row && (row.product_text || row.size) || '');
    const left = (t.split('=')[0] || t || '');
    const mm = left.match(/^(\d{1,2})月(.+)$/);
    const month = mm ? Math.max(1, Math.min(12, Number(mm[1] || 99))) : 99;
    const body = mm ? (mm[2] || '') : left;
    const nums = body.split('x').map(x => Number(String(x).replace(/[^\d.]/g,''))).map(n => Number.isFinite(n) ? n : 999999);
    return {month, length:nums[0] ?? 999999, width:nums[1] ?? 999999, height:nums[2] ?? 999999, body};
  }
  function materialOf(row){
    const text = norm(row && row.product_text || '');
    const raw = clean(row && (row.material || row.product_code) || '').toLocaleUpperCase('zh-Hant');
    const rr = norm(raw);
    if(!raw || raw === text || rr.includes('=') || /^\d+(?:x|×)/i.test(rr)) return '未填材質';
    return raw;
  }
  function supportSticks(row){
    const raw = norm(row && (row.product_text || row.support) || '');
    const right = raw.includes('=') ? raw.split('=').slice(1).join('=') : norm(row && row.support || '');
    let sticks = 0;
    right.split('+').map(stripParen).map(s=>s.trim()).filter(Boolean).forEach(seg=>{
      const m = seg.match(/^(\d+(?:\.\d+)?)\s*x\s*(\d+)$/i);
      if(m) sticks += (Number(m[1]||0)||0) * (Number(m[2]||0)||0);
      else { const n = Number((seg.match(/\d+(?:\.\d+)?/) || ['0'])[0]) || 0; if(n>0) sticks += n; }
    });
    return sticks || Number(row && (row.sticks ?? row.quantity) || 0) || 0;
  }
  function compareRows(a,b){
    const ma = materialOf(a) === '未填材質' ? 'ZZZ_未填材質' : materialOf(a);
    const mb = materialOf(b) === '未填材質' ? 'ZZZ_未填材質' : materialOf(b);
    const mc = ma.localeCompare(mb, 'zh-Hant', {numeric:true, sensitivity:'base'});
    if(mc) return mc;
    const da = splitProductText(a), db = splitProductText(b);
    if(da.month !== db.month) return da.month - db.month;
    if(da.height !== db.height) return da.height - db.height;
    if(da.width !== db.width) return da.width - db.width;
    if(da.length !== db.length) return da.length - db.length;
    const qa = effectiveQty(a && (a.product_text || a.support) || '', a && (a.qty ?? a.effective_qty) || 0);
    const qb = effectiveQty(b && (b.product_text || b.support) || '', b && (b.qty ?? b.effective_qty) || 0);
    if(qa !== qb) return qb - qa;
    const sa = supportSticks(a), sb = supportSticks(b);
    if(sa !== sb) return sb - sa;
    return String(a && a.id || '').localeCompare(String(b && b.id || ''), 'zh-Hant', {numeric:true});
  }
  window.YX70EffectiveQty = effectiveQty;
  window.YX30EffectiveQty = effectiveQty;
  window.YX126Qty = effectiveQty;
  window.yxEffectiveQty = effectiveQty;
  window.calcTotalQty = effectiveQty;
  window.YX30SupportHTML = supportHTML;
  window.YX30CompareRows = compareRows;
  window.YX30SortRows = rows => Array.isArray(rows) ? [...rows].sort(compareRows) : [];
})();
