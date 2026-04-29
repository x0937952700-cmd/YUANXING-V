document.addEventListener('DOMContentLoaded',()=>{
  YX.attachCustomerSuggest(YX.$('#customerInput'));
  const submit=YX.$('#submitInbound');
  const regionState=YX.$('#ocrRegionState');
  function updateRegionState(){ const r=localStorage.getItem('yx_ocr_region'); if(regionState) regionState.textContent=r?('框選：'+r):'框選：未設定'; }
  function getRegion(){ try{ const raw=localStorage.getItem('yx_ocr_region')||''; const a=raw.split(',').map(x=>Number(x.trim())); if(a.length===4 && a.every(n=>Number.isFinite(n))) return a; }catch(_){} return null; }
  function setRegion(){ const cur=localStorage.getItem('yx_ocr_region')||'0,0,100,100'; const v=prompt('輸入辨識區域百分比 x,y,w,h，例如 0,0,100,60；同一種圖片下次會記住', cur); if(!v) return; const a=v.split(',').map(x=>Number(x.trim())); if(a.length!==4 || !a.every(n=>Number.isFinite(n))) return YX.toast('框選格式錯誤',true); localStorage.setItem('yx_ocr_region', a.join(',')); updateRegionState(); }
  function clearRegion(){ localStorage.removeItem('yx_ocr_region'); updateRegionState(); }
  async function preprocessImage(file){
    const img=await createImageBitmap(file);
    let sx=0, sy=0, sw=img.width, sh=img.height;
    const reg=getRegion();
    if(reg){ sx=Math.max(0,Math.floor(img.width*reg[0]/100)); sy=Math.max(0,Math.floor(img.height*reg[1]/100)); sw=Math.max(1,Math.floor(img.width*reg[2]/100)); sh=Math.max(1,Math.floor(img.height*reg[3]/100)); }
    const canvas=document.createElement('canvas'); canvas.width=sw; canvas.height=sh;
    const ctx=canvas.getContext('2d',{willReadFrequently:true}); ctx.drawImage(img,sx,sy,sw,sh,0,0,sw,sh);
    const im=ctx.getImageData(0,0,sw,sh); const data=im.data;
    for(let i=0;i<data.length;i+=4){
      const r=data[i], g=data[i+1], b=data[i+2];
      const red = r>115 && r>g*1.18 && r>b*1.18;
      const blue = b>80 && b>r*1.05 && b>g*1.02;
      const dark = r<110 && g<110 && b<130;
      if(red){ data[i]=data[i+1]=data[i+2]=255; }
      else if(blue || dark){ data[i]=data[i+1]=data[i+2]=0; }
      else if(r>185 && g>185 && b>185){ data[i]=data[i+1]=data[i+2]=255; }
    }
    ctx.putImageData(im,0,0);
    return createImageBitmap(canvas);
  }
  async function handleNativeOcr(fileInput){
    const f=fileInput?.files && fileInput.files[0];
    if(!f) return;
    const ta=YX.$('#inboundText');
    const conf=YX.$('#ocrConfidence');
    if('TextDetector' in window){
      try{
        const bmp=await preprocessImage(f);
        const detector=new TextDetector();
        const blocks=await detector.detect(bmp);
        const text=(blocks||[]).map(b=>b.rawValue||'').filter(Boolean).join('\n');
        if(text){
          ta.value=(ta.value?ta.value+'\n':'')+text;
          if(conf) conf.textContent='信心值：原生辨識完成 / 已忽略紅字優先藍字';
          YX.toast('已辨識並輸出到文字框，請確認後送出');
          return;
        }
      }catch(e){}
    }
    if(conf) conf.textContent='信心值：低 / 請手動貼上辨識文字';
    YX.toast('圖片已選取；此裝置未開放瀏覽器 OCR，請用手機內建辨識後貼上文字框');
  }
  const file=YX.$('#photoInput');
  const camera=YX.$('#cameraInput');
  if(file) file.onchange=()=>handleNativeOcr(file);
  if(camera) camera.onchange=()=>handleNativeOcr(camera);
  const sr=YX.$('#setOcrRegion'); if(sr) sr.onclick=setRegion;
  const cr=YX.$('#clearOcrRegion'); if(cr) cr.onclick=clearRegion;
  updateRegionState();
  const clean=YX.$('#pasteDemo');
  if(clean) clean.onclick=()=>{
    const ta=YX.$('#inboundText');
    ta.value = ta.value.replace(/[×X✕*]/g,'x').replace(/＝/g,'=').replace(/：/g,'=').replace(/\b(\d+)\.(\d+)\b/g,'$1$2');
    YX.toast('已整理 x / = / 小數點 OCR；未填客戶時會依客戶行分組');
  };
  submit.onclick=()=>YX.safe(submit,async()=>{
    const body={customer_name:YX.$('#customerInput').value.trim(), material:YX.$('#materialInput').value.trim(), text:YX.$('#inboundText').value, request_key:YX.key()};
    const d=await YX.api('/api/inbound',{method:'POST',body});
    YX.toast(`已入庫 ${d.count} 筆到${d.target}`); YX.$('#inboundText').value=''; YX.loadBadge();
  });
});
