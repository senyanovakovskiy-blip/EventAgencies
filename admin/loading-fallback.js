// Keep a failed admin module from leaving the page on an endless loading message.
const status=document.getElementById('initial-status');
const retry=document.getElementById('initial-retry');
if(status&&retry){
 setTimeout(()=>{
  if(status.hidden||status.textContent.trim()!=='Открываем рабочее пространство…')return;
  status.textContent='Админка не загрузилась. Обновите страницу, чтобы попробовать ещё раз.';
  retry.textContent='Обновить страницу';
  retry.hidden=false;
  retry.addEventListener('click',()=>location.reload(),{once:true});
 },14000);
}
