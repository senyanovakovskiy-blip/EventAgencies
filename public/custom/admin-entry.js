// Visibility follows the protected admin session; never infer it from local storage.
let request;
async function refreshAdminEntry(){
 request?.abort();
 const current=new AbortController();
 request=current;
 document.documentElement.removeAttribute('data-ea-admin');
 const timeout=setTimeout(()=>current.abort(),5000);
 try{
  const response=await fetch('/api/admin/session',{credentials:'same-origin',cache:'no-store',signal:current.signal});
  if(!response.ok)return;
  const session=await response.json();
  if(request===current&&!current.signal.aborted&&session.authenticated===true)document.documentElement.setAttribute('data-ea-admin','');
 }catch{
  // Leave the entry hidden when the session cannot be confirmed.
 }finally{clearTimeout(timeout);}
}
refreshAdminEntry();
window.addEventListener('pageshow',event=>{if(event.persisted)refreshAdminEntry();});
window.addEventListener('focus',refreshAdminEntry);
