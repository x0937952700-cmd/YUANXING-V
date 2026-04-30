export function normalizeSymbols(text='') {
  return String(text)
    .replace(/[×ＸX✕＊*]/g, 'x')
    .replace(/＝/g, '=')
    .replace(/[，,；;＋]/g, '+')
    .replace(/[ \t\u3000]/g, '')
    .replace(/\++/g, '+')
    .replace(/=+/g, '=')
    .replace(/^\+|\+$/g, '');
}
export async function parseProduct(text) {
  const res = await fetch('/api/product/parse', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ text }) });
  return await res.json();
}
