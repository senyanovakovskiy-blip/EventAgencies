// The template intro belongs to the first home visit, never to inner navigation.
try{if(localStorage.getItem('zizi-theme')!=='light')document.documentElement.dataset.theme='dark';}catch{}
window.__eaShowIntro=false;
try{
 const params=new URLSearchParams(location.search||'');
 const preview=params.get('intro')==='preview'&&location.pathname==='/';
 if(preview){params.delete('intro');const query=params.toString();history.replaceState(history.state,'',location.pathname+(query?'?'+query:'')+(location.hash||''));}
 const seen=sessionStorage.getItem('eventagencies-intro-seen-v2');
 sessionStorage.setItem('eventagencies-intro-seen-v2','1');
 window.__eaShowIntro=(!seen||preview)&&location.pathname==='/'&&!matchMedia('(prefers-reduced-motion:reduce)').matches;
}catch{}
