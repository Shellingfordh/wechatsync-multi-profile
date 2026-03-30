process.env.ALL_PROXY='';
process.env.HTTP_PROXY='';
process.env.HTTPS_PROXY='';
process.env.NO_PROXY='127.0.0.1,localhost';

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import http from 'http';
import https from 'https';

const IMG_URL = 'https://pic3.zhimg.com/v2-dbb64f38b044e9e339bbce31d2ece96c_1440w.jpg';
const TEMP_DIR = '/Users/majia/temp_images';
const PORT = 9222;
const CONTENT = '一张舒服的清透风景，留给今天的心情。光线很柔，细节干净，适合做壁纸或背景。#美图 #壁纸 #风景';
const DEBUG = true;

if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

function sha256(input){
  return crypto.createHash('sha256').update(input).digest('hex');
}
function detectExt(buf){
  if (buf.slice(0,2).toString('hex')==='ffd8') return '.jpg';
  if (buf.slice(0,8).toString('hex')==='89504e470d0a1a0a') return '.png';
  if (buf.slice(0,4).toString()==='GIF8') return '.gif';
  if (buf.slice(0,4).toString('hex')==='52494646') return '.webp';
  return '.jpg';
}
function download(url, outPath){
  return new Promise((resolve,reject)=>{
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      if (res.statusCode !== 200) return reject(new Error('HTTP '+res.statusCode));
      const stream = fs.createWriteStream(outPath);
      res.pipe(stream);
      stream.on('finish', ()=>stream.close(resolve));
    });
    req.on('error', reject);
  });
}
async function resolveImage(url){
  const hash = sha256(url);
  const cached = fs.readdirSync(TEMP_DIR).find(f => f.startsWith(`img_${hash}`));
  if (cached) return path.join(TEMP_DIR, cached);
  const tmp = path.join(TEMP_DIR, `img_${hash}.tmp`);
  await download(url, tmp);
  const buf = fs.readFileSync(tmp);
  const ext = detectExt(buf);
  const finalPath = path.join(TEMP_DIR, `img_${hash}${ext}`);
  fs.renameSync(tmp, finalPath);
  return finalPath;
}

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

const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));

async function main(){
  const imgPath = await resolveImage(IMG_URL);
  const list = await cdpRequest('/json/list');
  let target = list.find(t => t.url && t.url.includes('creator.xiaohongshu.com/publish'));
  if (!target){
    target = await cdpRequest('/json/new?'+encodeURIComponent('https://creator.xiaohongshu.com/publish/publish?source=official'), 'PUT');
  }

  const ws = await connectWS(target.webSocketDebuggerUrl);
  let id = 1;
  const pending = new Map();
  ws.onmessage = (evt)=>{
    const msg = JSON.parse(evt.data);
    if (msg.method === 'Page.fileChooserOpened') {
      ws._lastFileChooser = msg.params || {};
    }
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

  await send('Page.enable');
  await send('Runtime.enable');
  await send('DOM.enable');
  await send('Page.setInterceptFileChooserDialog', { enabled: true });

  // Click 上传图文
  await send('Runtime.evaluate', { expression: `(() => {
    const spans = Array.from(document.querySelectorAll('span.title'));
    const target = spans.find(s => s.textContent?.trim() === '上传图文');
    if (!target) return false;
    const clickable = target.closest('button') || target.closest('div') || target;
    clickable.click();
    return true;
  })()` });

  await sleep(1500);

  // Fill content
  await send('Runtime.evaluate', { expression: `(() => {
    const text = ${JSON.stringify(CONTENT)};
    let el = document.querySelector('textarea');
    if (!el) el = document.querySelector('[contenteditable="true"]');
    if (!el) return false;
    el.focus();
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      el.value = '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.value = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      el.innerText = '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.innerText = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    return true;
  })()` });

  // Try file chooser flow first
  await send('Runtime.evaluate', { expression: `(() => {
    const candidates = Array.from(document.querySelectorAll('button,div,span,a'))
      .filter(el => (el.innerText || '').includes('上传'));
    if (candidates.length) candidates[0].click();
    return candidates.length;
  })()` });
  await sleep(500);
  if (ws._lastFileChooser) {
    await send('Page.handleFileChooser', { action: 'accept', files: [imgPath] }, 8000);
    ws.close();
    console.log('uploaded');
    return;
  }

  // Collect file inputs (including shadow DOM), retry a few times
  let count = 0;
  for (let attempt = 0; attempt < 10; attempt++){
    const countRes = await send('Runtime.evaluate', { expression: `(() => {
      const inputs = [];
      const walk = (node) => {
        if (!node) return;
        if (node.nodeType === 1) {
          if (node.tagName === 'INPUT' && node.type === 'file') inputs.push(node);
          if (node.tagName === 'IFRAME') {
            try { if (node.contentDocument) walk(node.contentDocument); } catch {}
          }
          if (node.shadowRoot) walk(node.shadowRoot);
        }
        const children = node.children || node.childNodes;
        if (children) {
          for (const c of children) walk(c);
        }
      };
      walk(document);
      window.__xhsFileInputs = inputs;
      return inputs.length;
    })()` });
    count = countRes.result.result.value || 0;
    if (count) break;

    // try clicking obvious upload area to reveal file input
    await send('Runtime.evaluate', { expression: `(() => {
      const candidates = Array.from(document.querySelectorAll('button,div,span,a'))
        .filter(el => (el.innerText || '').includes('上传'));
      if (candidates.length) candidates[0].click();
      return candidates.length;
    })()` });
    await sleep(1000);
  }

  if (DEBUG) {
    const infoRes = await send('Runtime.evaluate', { expression: `(() => {
      if (!window.__xhsFileInputs) return [];
      return window.__xhsFileInputs.map(i => ({
        tag: i.tagName,
        id: i.id || '',
        name: i.name || '',
        cls: i.className || '',
        accept: i.accept || '',
        multiple: !!i.multiple
      }));
    })()`, returnByValue: true });
    console.log('file inputs:', JSON.stringify(infoRes.result.result.value));
  }

  if (!count) throw new Error('no file inputs found');

  // Query file input nodes directly from DOM
  const docRes = await send('DOM.getDocument', { depth: -1, pierce: true });
  const rootId = docRes.result.root.nodeId;
  const qRes = await send('DOM.querySelectorAll', { nodeId: rootId, selector: 'input.upload-input, input[type="file"]' });
  const nodeIds = qRes.result.nodeIds || [];

  // Try each file input until it accepts the file
  for (const nodeId of nodeIds){
    await send('DOM.setFileInputFiles', { nodeId, files: [imgPath] }, 8000);

    await sleep(1500);
    const fileRes = await send('Runtime.evaluate', { expression: `(() => {
      const inputs = Array.from(document.querySelectorAll('input[type="file"]'));
      return inputs.some(i => i && i.files && i.files.length > 0);
    })()` });
    const hasFiles = !!fileRes.result.result.value;
    if (hasFiles) {
      ws.close();
      console.log('uploaded');
      return;
    }
  }

  ws.close();
  throw new Error('file input set but no preview detected');
}

main().catch(e=>{ console.error(e); process.exit(1); });
