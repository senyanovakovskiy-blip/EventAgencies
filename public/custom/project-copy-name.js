import {copyRequest} from './project-copy-client.js';

const message=error=>({authentication_required:'Войдите в свой аккаунт, затем откройте копию снова.',not_found:'Этой копии уже нет в аккаунте.',invalid_copy_name:'Введите название длиной от 1 до 120 символов.',copy_name_changed:'Название уже изменили на другом устройстве. Вернитесь к списку, нажмите «Обновить» и откройте копию заново.'}[error?.code]||'Не удалось подтвердить переименование. Попробуйте сохранить название ещё раз.');

export function setupCopyNameEditor({body,item,onBusy,onEditing,onRenamed,isCurrent}){
 const root=document.createElement('div');root.className='copy-name-controls';
 root.innerHTML='<button class="account-copy-back" type="button" data-edit-copy-name>Переименовать</button><form class="copy-name-editor" hidden><fieldset><label>Название копии<input name="title" maxlength="120" required autocomplete="off"></label><div class="copy-name-actions"><button class="secondary-action" type="submit">Сохранить название</button><button class="account-copy-back" type="button" data-cancel-copy-name>Отмена</button></div></fieldset><p class="brief-local-note" role="status"></p></form>';
 const heading=body.querySelector('h3');heading.after(root);
 const opener=root.querySelector('[data-edit-copy-name]'),form=root.querySelector('form'),fieldset=form.querySelector('fieldset'),input=form.elements.namedItem('title'),status=form.querySelector('[role=status]'),save=form.querySelector('[type=submit]');
 let pending=false;
 function close(){if(pending)return;form.hidden=true;opener.hidden=false;onEditing(false);opener.focus({preventScroll:true});}
 opener.addEventListener('click',()=>{input.value=item.name;status.textContent='';form.hidden=false;opener.hidden=true;onEditing(true);input.focus({preventScroll:true});input.select();input.scrollIntoView({block:'nearest'});});
 root.querySelector('[data-cancel-copy-name]').addEventListener('click',close);
 form.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}});
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(pending)return;const name=input.value.trim();
  if(!name||name.length>120){status.textContent='Введите название длиной от 1 до 120 символов.';input.focus();return;}
  if(name===item.name){close();return;}
  pending=true;fieldset.disabled=true;onBusy(true);save.textContent='Сохраняем…';status.textContent='Сохраняем название…';
  try{
   const result=await copyRequest('/api/project-copies/'+item.id,{method:'PATCH',body:JSON.stringify({name,expectedName:item.name})});
   if(result.ok!==true||result.item?.id!==item.id||result.item?.name!==name)throw Error('unconfirmed_rename');
   item.name=name;
   if(isCurrent()){heading.textContent=name;status.textContent='Название сохранено.';form.hidden=true;opener.hidden=false;onEditing(false);opener.focus({preventScroll:true});}
   onRenamed({id:item.id,name});
  }catch(error){if(isCurrent())status.textContent=message(error);}
  finally{pending=false;fieldset.disabled=false;save.textContent='Сохранить название';onBusy(false);}
 });
}
