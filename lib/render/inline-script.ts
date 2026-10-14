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
var f=document.getElementById('sz-fix');if(f){var E=f.elements,F=E.field,V=document.getElementById('sz-fix-v'),M=document.getElementById('sz-fix-msg');
function nv(){var o=F.options[F.selectedIndex];V.hidden=!!(o&&o.hasAttribute('data-nv'))}
function say(i){M.hidden=false;for(var k=0;k<M.children.length;k++)M.children[k].hidden=k!==i}
F.addEventListener('change',nv);nv();
f.addEventListener('submit',function(e){e.preventDefault();var a=f.getAttribute('data-api');if(!a)return say(1);
var p={slug:d.slug,versionId:d.version,field:F.value},v=E.sv.value.trim(),n=E.note.value.trim(),B=f.querySelector('button');
if(!V.hidden){if(!v)return say(3);p.suggestedValue=v}if(n)p.note=n;B.disabled=true;
fetch(a,{method:'POST',body:JSON.stringify(p),headers:{'Content-Type':'application/json'}}).then(function(r){
if(r.ok){f.reset();nv();return say(0)}return r.json().then(function(j){var c=j&&j.error&&j.error.code;say(c==='personal_info'?2:c==='value_required'?3:1)})
}).catch(function(){say(1)}).then(function(){B.disabled=false})})}
send('view')})();`

/** Base64 SHA-256 of INLINE_SCRIPT; CSP source expression is `'sha256-<this>'`. */
export const INLINE_SCRIPT_SHA256 = createHash('sha256').update(INLINE_SCRIPT, 'utf8').digest('base64')
