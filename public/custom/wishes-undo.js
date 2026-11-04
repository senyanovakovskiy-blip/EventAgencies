const KEY='eventagencies-wishes-undo-v1';
const addedMessage='Пожелания дополнены. Заявка ещё не отправлена.';
const retainedMessage='Можно отменить последнее добавление примеров в этой вкладке.';

export function setupWishesUndo({getDescription,restore,canUndo}){
 const status=document.getElementById('project-wishes-status');if(!status)return null;
 const host=document.createElement('div');host.className='project-wishes-undo';host.hidden=true;
 const button=document.createElement('button');button.type='button';button.className='secondary-action';button.textContent='Отменить добавление примеров';host.append(button);status.after(host);
 let change=null;
 try{const saved=JSON.parse(sessionStorage.getItem(KEY)||'null');if(saved?.version===1&&typeof saved.before==='string'&&typeof saved.after==='string'&&saved.before.length<=3000&&saved.after.length<=3000&&saved.before!==saved.after)change=saved;}catch{}
 function clear(){change=null;host.hidden=true;try{sessionStorage.removeItem(KEY);}catch{}if([addedMessage,retainedMessage].includes(status.textContent))status.textContent='';}
 function sync(){
  if(change&&getDescription()!==change.after){clear();return;}
  host.hidden=!change;button.disabled=!canUndo();
 }
 button.addEventListener('click',()=>{
  if(!change)return;
  if(!canUndo()){status.textContent='Дождитесь завершения отправки заявки.';return;}
  if(getDescription()!==change.after){clear();status.textContent='Пожелания уже изменены. Отменить прежнее добавление автоматически нельзя.';return;}
  const before=change.before;
  if(!restore(before)){status.textContent='Не удалось отменить добавление. Разрешите хранение данных сайта и попробуйте снова.';return;}
  clear();status.textContent='Последнее добавление отменено. Примеры и личные заметки сохранены.';status.focus({preventScroll:true});
 });
 document.addEventListener('ea:project-copy-restored',clear);
 document.addEventListener('ea:inquiry-accepted',clear);
 sync();if(change)status.textContent=retainedMessage;
 return {sync,clear,record(before,after){if(before===after)return;change={version:1,before,after};try{sessionStorage.setItem(KEY,JSON.stringify(change));}catch{}status.textContent=addedMessage;sync();}};
}
