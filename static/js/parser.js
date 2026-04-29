export function normalizeLine(text=''){
  return text.trim().replace(/[×X✕＊*]/g,'x').replace(/[＝]/g,'=').replace(/[＋]/g,'+').replace(/\s+/g,'').replace(/1\.65/g,'165');
}
export function parsePieces(line=''){
  const s = normalizeLine(line);
  const rhs = (s.split('=')[1] || '');
  if(!rhs) return 0;
  return rhs.split('+').filter(Boolean).reduce((sum,p)=>{
    const m = p.match(/^(\d+)(?:x(\d+))?$/);
    return sum + (m ? Number(m[2] || 1) : 1);
  },0);
}
