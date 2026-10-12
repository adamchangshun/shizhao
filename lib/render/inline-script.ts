// The only script on a generated page: tracking beacons and "copy WeChat id".
// Its bytes never vary per page — all configuration is read from <body data-*> — so a
// single CSP hash covers every page. Changing this text changes INLINE_SCRIPT_SHA256.
import { createHash } from 'node:crypto'

export const INLINE_SCRIPT = `(function(){
var b=document.body,d=b.dataset,t=d.track,src='link';
try{if(new URLSearchParams(location.search).get('src')==='qr')src='qr'}catch(e){}
function send(a){if(!t)return;try{
var p=JSON.stringify({slug:d.slug,versionId:d.version,source:src,action:a});
if(navigator.sendBeacon&&navigator.sendBeacon(t,new Blob([p],{type:'application/json'})))return;
fetch(t,{method:'POST',body:p,keepalive:true,headers:{'Content-Type':'application/json'}}).catch(function(){})
}catch(e){}}
var toast=document.getElementById('sz-toast'),timer;
function show(ok){if(!toast)return;toast.hidden=false;toast.children[0].hidden=!ok;toast.children[1].hidden=ok;
clearTimeout(timer);timer=setTimeout(function(){toast.hidden=true},2000)}
function fallback(v){var ok=false,x=document.createElement('textarea');x.value=v;x.setAttribute('readonly','');
x.style.position='fixed';x.style.opacity='0';b.appendChild(x);x.select();
try{ok=document.execCommand('copy')}catch(e){}b.removeChild(x);show(ok)}
function copy(v){if(navigator.clipboard&&window.isSecureContext){
navigator.clipboard.writeText(v).then(function(){show(true)},function(){fallback(v)})}else fallback(v)}
document.addEventListener('click',function(e){
var el=e.target&&e.target.closest?e.target.closest('[data-act]'):null;if(!el)return;
var a=el.getAttribute('data-act');if(a==='wechat_copy')copy(el.getAttribute('data-copy')||'');send(a)});
send('view')})();`

/** Base64 SHA-256 of INLINE_SCRIPT; CSP source expression is `'sha256-<this>'`. */
export const INLINE_SCRIPT_SHA256 = createHash('sha256').update(INLINE_SCRIPT, 'utf8').digest('base64')
