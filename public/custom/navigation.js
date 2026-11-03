// Keep the catalogue context when closing a work opened from search or a company.
document.addEventListener('click',event=>{
 const control=event.target.closest('button,a');
 if(!control||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
 if(!location.pathname.startsWith('/work/'))return;
 const from=new URLSearchParams(location.search).get('from');
 if(!from||!from.startsWith('/')||from.startsWith('//'))return;
 let target;try{target=new URL(from,location.origin);}catch{return;}
 if(target.origin!==location.origin||!(target.pathname==='/catalog'||target.pathname==='/my-project'||/^\/agency\/[a-z0-9-]+$/.test(target.pathname)))return;
 const close=control.getAttribute('aria-label')==='Закрыть проект';
 const agency=control.matches('.ea-company-link')&&target.pathname===new URL(control.href).pathname;
 if(close||agency){event.preventDefault();event.stopPropagation();location.assign(target.pathname+target.search);}
},true);
