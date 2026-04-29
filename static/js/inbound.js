document.addEventListener('DOMContentLoaded',()=>{
  YX.attachCustomerSuggest(YX.$('#customerInput'));
  const submit=YX.$('#submitInbound');
  const file=YX.$('#photoInput');
  if(file) file.onchange=()=>YX.toast('圖片已選取；PWA 版請使用手機內建辨識後貼上文字框');
  const clean=YX.$('#pasteDemo');
  if(clean) clean.onclick=()=>{
    const ta=YX.$('#inboundText');
    ta.value = ta.value.replace(/[×X✕*]/g,'x').replace(/＝/g,'=').replace(/\b(\d+)\.(\d+)\b/g,'$1$2');
    YX.toast('已先整理 x / = / 小數點 OCR');
  };
  submit.onclick=()=>YX.safe(submit,async()=>{
    const body={customer_name:YX.$('#customerInput').value.trim(), material:YX.$('#materialInput').value.trim(), text:YX.$('#inboundText').value, request_key:YX.key()};
    const d=await YX.api('/api/inbound',{method:'POST',body});
    YX.toast(`已入庫 ${d.count} 筆到${d.target}`); YX.$('#inboundText').value=''; YX.loadBadge();
  });
});
