document.addEventListener('click',async event=>{
 const button=event.target.closest('[data-share-agency]');
 if(!button)return;
 const tools=button.closest('.agency-share-tools'),status=tools?.querySelector('[data-share-agency-status]'),field=tools?.querySelector('[data-share-agency-url]');
 if(!tools||!status||!field)return;
 const url=new URL(location.pathname,location.origin).href,title=document.querySelector('.agency-aside h1')?.textContent?.trim()||document.title;
 button.disabled=true;
 try{
  if(typeof navigator.share==='function'){
   await navigator.share({title,text:title+' — EventAgencies 101',url});
   status.textContent='Ссылка передана через меню устройства.';
   return;
  }
  await navigator.clipboard.writeText(url);
  status.textContent='Ссылка скопирована. Можно отправить её коллегам или клиенту.';
 }catch(error){
  if(error?.name==='AbortError')return;
  field.value=url;field.hidden=false;field.focus({preventScroll:true});field.select();
  status.textContent='Не удалось скопировать автоматически. Ссылка выделена в поле — скопируйте её.';
 }finally{button.disabled=false;}
});
