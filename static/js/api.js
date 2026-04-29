export const API = {
  async request(url, opts={}){
    const options = {headers:{}, ...opts};
    if(options.body && !(options.body instanceof FormData)){
      options.headers['Content-Type']='application/json';
      if(typeof options.body !== 'string') options.body = JSON.stringify(options.body);
    }
    const res = await fetch(url, options);
    const type = res.headers.get('content-type') || '';
    const data = type.includes('application/json') ? await res.json().catch(()=>({ok:false,error:'JSON解析失敗'})) : await res.text();
    if(res.status === 401){ location.href='/login'; throw new Error('登入已過期，請重新登入'); }
    if(!res.ok || (data && data.ok === false)) throw new Error((data && data.error) || '操作失敗');
    return data;
  },
  get(url){ return this.request(url); },
  post(url, body){ return this.request(url,{method:'POST',body}); },
  put(url, body){ return this.request(url,{method:'PUT',body}); },
  del(url){ return this.request(url,{method:'DELETE'}); },
  key(){ return `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
};
