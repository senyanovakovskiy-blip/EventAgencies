// Restore the original site-entry animation before the large photo sequence.
(()=>{
 let theme='dark';try{if(localStorage.getItem('zizi-theme')==='light')theme='light';}catch{}
 document.documentElement.dataset.theme=theme;
 const chrome=()=>{const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content=document.documentElement.dataset.theme==='dark'?'#101310':'#d6cdbf';};
 chrome();document.addEventListener('DOMContentLoaded',chrome,{once:true});
 new MutationObserver(chrome).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
})();
window.__eaShowIntro=location.pathname==='/';
if(window.__eaShowIntro){
 window.__eaIntroDone=new Promise(resolve=>window.__eaResolveIntro=resolve);
 window.__eaNativeIntroDone=new Promise(resolve=>{
  let done=false;
  window.__eaNativeIntroFinished=()=>{if(done)return;done=true;clearTimeout(window.__eaNativeWatchdog);document.documentElement.dataset.eaIntro='pending';resolve();};
  window.__eaNativeWatchdog=setTimeout(window.__eaNativeIntroFinished,12000);
 });
}
