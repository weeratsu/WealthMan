// ui-confirm.js (Nov 23 2026) — WealthMan copy of the CashMan universal popup (same format as other apps).
// Overrides window.confirm / window.alert app-wide: card, title, message, footer Cancel (left, ghost) + OK (right, primary / red Delete).
// Enter = OK, Esc = Cancel, click backdrop = Cancel (drag-select released outside does NOT close).
// confirm() is synchronous: shows the popup, returns false, then on OK re-clicks the element that triggered it with a one-shot "yes".
(function(){
var _yes=false,_lastEl=null;
document.addEventListener('click',function(e){_lastEl=e.target;},true);
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
window.cmConfirm=function(msg,onOk,opt){opt=opt||{};
  var old=document.getElementById('cm-confirm-ov');if(old)old.remove();
  var danger=opt.danger!=null?opt.danger:/delete|remove|clear|ลบ|คืนค่า/i.test(msg);
  var ov=document.createElement('div');ov.id='cm-confirm-ov';
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:10050;display:flex;align-items:center;justify-content:center;padding:16px';
  var down=null;ov.addEventListener('mousedown',function(e){down=e.target;});
  ov.addEventListener('mouseup',function(e){if(down===ov&&e.target===ov)close();down=null;});
  ov.innerHTML='<div style="background:var(--surface,#fff);color:var(--text);border-radius:10px;padding:16px 18px;width:min(380px,94vw);box-shadow:0 10px 40px rgba(0,0,0,.3)">'+
    '<h3 style="margin:0 0 8px;font-size:14px">'+(opt.icon||(danger?'⚠️':'❓'))+' '+esc(opt.title||(danger?'ยืนยันการลบ':'ยืนยัน'))+'</h3>'+
    '<div style="font-size:13px;line-height:1.5;white-space:pre-wrap;margin-bottom:14px">'+esc(msg)+'</div>'+
    '<div style="display:flex;justify-content:space-between;gap:8px"><button class="btn secondary" id="cm-cf-no">Cancel</button>'+
    '<button class="btn" id="cm-cf-yes"'+(danger?' style="background:#dc2626;border-color:#dc2626;color:#fff"':'')+'>'+(opt.ok||(danger?'🗑️ Delete':'✓ OK'))+'</button></div></div>';
  document.body.appendChild(ov);
  function close(){ov.remove();document.removeEventListener('keydown',key,true);}
  function key(e){if(e.key==='Escape'){e.preventDefault();close();}else if(e.key==='Enter'){e.preventDefault();close();onOk&&onOk();}}
  document.addEventListener('keydown',key,true);
  ov.querySelector('#cm-cf-no').onclick=close;
  ov.querySelector('#cm-cf-yes').onclick=function(){close();onOk&&onOk();};
  if(opt.cancel===false)ov.querySelector('#cm-cf-no').style.visibility='hidden';
  setTimeout(function(){var b=ov.querySelector('#cm-cf-yes');if(b)b.focus();},20);
};
var nat=window.confirm.bind(window);
window.confirm=function(msg){
  if(_yes){_yes=false;return true;}           // re-run after OK
  var el=_lastEl;
  if(!el||!document.contains(el))return nat(msg);   // not from a click -> native fallback
  window.cmConfirm(msg,function(){_yes=true;try{el.click();}finally{_yes=false;}});
  return false;
};
// promise version: await cmAsk(msg,{title,ok,cancel:false,icon}) -> true/false
window.cmAsk=function(msg,opt){opt=opt||{};return new Promise(function(res){
  window.cmConfirm(msg,function(){res(true);},{title:opt.title,danger:!!opt.danger,ok:opt.ok,icon:opt.icon,cancel:opt.cancel});
  var ov=document.getElementById('cm-confirm-ov');if(!ov)return res(false);
  ov.querySelector('#cm-cf-no').addEventListener('click',function(){res(false);});
  new MutationObserver(function(m,o){if(!document.contains(ov)){o.disconnect();res(false);}}).observe(document.body,{childList:true});
});};
window.wmConfirm=function(msg,opt){return window.cmAsk(msg,Object.assign({danger:/ลบ|คืนค่า/.test(msg)},opt||{}));};
// native alert() never shown — styled info popup with OK only
window.alert=function(msg){window.cmAsk(msg,{title:'แจ้งเตือน',icon:'ℹ️',ok:'✓ OK',cancel:false});};
})();
