process.env.ALL_PROXY='';
process.env.HTTP_PROXY='';
process.env.HTTPS_PROXY='';
process.env.NO_PROXY='127.0.0.1,localhost';

import http from 'http';

const PORT = 9222;
const URL = 'https://creator.xiaohongshu.com/publish/publish?source=official';

function cdpRequest(pathname, method='GET'){
  return new Promise((resolve, reject)=>{
    const req = http.request({ host: '127.0.0.1', port: PORT, path: pathname, method }, res => {
      let data='';
      res.on('data', c=>data+=c);
      res.on('end', ()=>{
        if (!data) return reject(new Error('Empty response from CDP'));
        try { resolve(JSON.parse(data)); } catch(e){ reject(e); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function connectWS(wsUrl){
  return new Promise((resolve, reject)=>{
    const ws = new WebSocket(wsUrl);
    const to = setTimeout(()=>reject(new Error('ws connect timeout')), 5000);
    ws.onopen = () => { clearTimeout(to); resolve(ws); };
    ws.onerror = err => { clearTimeout(to); reject(err); };
  });
}

async function main(){
  let target;
  try {
    const list = await cdpRequest('/json/list');
    target = list.find(t => t.url && t.url.includes('creator.xiaohongshu.com/publish'));
  } catch {}
  if (!target){
    target = await cdpRequest('/json/new?'+encodeURIComponent(URL), 'PUT');
  }

  const ws = await connectWS(target.webSocketDebuggerUrl);
  let id = 1;
  const pending = new Map();
  ws.onmessage = (evt)=>{
    const msg = JSON.parse(evt.data);
    if (msg.id && pending.has(msg.id)){
      pending.get(msg.id).resolve(msg);
      pending.delete(msg.id);
    }
  };
  const send = (method, params={}, timeoutMs=5000) => new Promise((resolve, reject)=>{
    const msg = { id: id++, method, params };
    const to = setTimeout(()=>{
      if (pending.has(msg.id)) pending.delete(msg.id);
      reject(new Error('timeout '+method));
    }, timeoutMs);
    pending.set(msg.id, { resolve: (m)=>{ clearTimeout(to); resolve(m);} });
    ws.send(JSON.stringify(msg));
  });

  await send('Runtime.enable');

  await send('Runtime.evaluate', { expression: `(() => {
    const byClass = document.querySelector('button.d-button.custom-button.bg-red');
    const byText = Array.from(document.querySelectorAll('button'))
      .find(b => (b.innerText || '').trim() === '发布');
    const btn = byClass || byText;
    if (!btn) return false;
    const text = (btn.innerText || '').trim();
    if (text !== '发布') return false;
    btn.click();
    return true;
  })()` });

  ws.close();
  console.log('clicked');
}

main().catch(e=>{ console.error(e); process.exit(1); });
