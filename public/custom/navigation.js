// Keep the catalogue context when closing a work opened from search or a company.
document.addEventListener('click',event=>{
 const control=event.target.closest('button,a');
 if(!control||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
 if(!location.pathname.startsWith('/work/'))return;
 const from=new URLSearchParams(location.search).get('from');
 if(!from||!from.startsWith('/')||from.startsWith('//'))return;
 let target;try{target=new URL(from,location.origin);}catch{return;}
 target.pathname=target.pathname.replace(/\/$/,'')||'/';
 if(target.origin!==location.origin||!(target.pathname==='/catalog'||target.pathname==='/my-project'||/^\/agency\/[a-z0-9-]+$/.test(target.pathname)))return;
 const close=control.getAttribute('aria-label')==='Закрыть проект';
 const agency=control.matches('.ea-company-link')&&target.pathname===new URL(control.href).pathname.replace(/\/$/,'');
 if(close||agency){event.preventDefault();event.stopPropagation();location.assign(target.pathname+target.search+target.hash);}
},true);

// Work links from the animated home use the same detailed pages as the catalogue.
document.addEventListener('click',event=>{const a=event.target.closest('a[href]');if(!a||event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||a.target==='_blank')return;const u=new URL(a.href,location.origin);if(u.origin===location.origin&&(/\/work\/[a-z0-9-]+\/?$/.test(u.pathname)||/^\/about\/?$/.test(u.pathname))&&document.getElementById('root')){event.preventDefault();event.stopPropagation();location.assign(u.href);}},true);
