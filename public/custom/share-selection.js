import {selectionShare} from './selection-share-model.js';
import {workNoteKey} from './project-store.js';
export {selectionShare};

export function setupSelectionShare({getState,getData}){
 const button=document.querySelector('[data-share-selection]');if(!button)return;
 const dialog=document.createElement('dialog');dialog.id='share-selection-dialog';dialog.setAttribute('aria-labelledby','share-selection-title');
 dialog.innerHTML=`<button class="brief-close" type="button" data-close-share aria-label="Закрыть подборку для коллеги">×</button><span class="eyebrow">Обсудить с коллегой</span><h2 id="share-selection-title" tabindex="-1">Поделиться подборкой</h2><p>Скопируйте текст в сообщение или отправьте HTML-файл. Файл открывается в браузере без доступа к этому сайту.</p><p>В подборке — выбранные агентства, работы и ссылки на их сайты. Контакты и описание вашего мероприятия не включены.</p><fieldset class="share-options"><legend>Дополнительно включить</legend><label class="share-note-option"><input type="checkbox" data-share-notes><span>Включить мои заметки к выбранным работам</span></label><label class="share-note-option"><input type="checkbox" data-share-presentation aria-describedby="share-presentation-help"><span>Включить описания вариантов</span></label><p id="share-presentation-help">Описания со страниц работ и агентств, включая «Если вам близко».</p></fieldset><label class="share-preview-label" for="share-selection-preview">Предпросмотр сообщения</label><textarea id="share-selection-preview" rows="10" readonly disabled aria-describedby="share-preview-help"></textarea><p id="share-preview-help" class="share-preview-help">Здесь точный текст для копирования. HTML-файл содержит те же сведения из данных этой страницы.</p><div class="draft-result-actions"><button type="button" class="primary-action" data-copy-selection disabled>Скопировать текст</button><button type="button" class="secondary-action" data-download-selection disabled>Скачать подборку</button></div><p class="brief-local-note" role="status" aria-atomic="true" data-share-status></p>`;
 document.body.append(dialog);
 const preview=dialog.querySelector('textarea'),notes=dialog.querySelector('[data-share-notes]'),presentation=dialog.querySelector('[data-share-presentation]'),options=dialog.querySelector('fieldset'),status=dialog.querySelector('[data-share-status]'),copy=dialog.querySelector('[data-copy-selection]'),download=dialog.querySelector('[data-download-selection]');
 let prepared=null,loadedData=null,version=0,session=0,loading=false,copyPending=null,opener=button;
 const isOpen=()=>dialog.isConnected&&dialog.open;
 const isCurrent=(currentSession,currentVersion)=>isOpen()&&session===currentSession&&version===currentVersion;
 function syncControls(){
  const busy=loading||Boolean(copyPending),ready=isOpen()&&Boolean(prepared?.count);
  options.disabled=busy;copy.disabled=download.disabled=preview.disabled=busy||!ready;
  preview.setAttribute('aria-busy',String(busy));
 }
 function readPrepared(){
  const state=getState(),includeNotes=notes.checked,includePresentation=presentation.checked;
  // Only selected pairs and their notes affect this snapshot; other form edits do not.
  const source=JSON.stringify((state.selection||[]).map(item=>[item.agencySlug,item.workSlug||null,item.workSlug?state.workNotes?.[workNoteKey(item.agencySlug,item.workSlug)]||'':'']));
  return {...selectionShare(state,loadedData,includeNotes,{includePresentation}),source,includeNotes,includePresentation};
 }
 function sameSnapshot(a,b){
  return a&&b&&a.source===b.source&&a.includeNotes===b.includeNotes&&a.includePresentation===b.includePresentation&&a.text===b.text&&a.html===b.html&&a.count===b.count;
 }
 function showPrepared(next,message){
  prepared=next;preview.value=next.text;preview.setSelectionRange(0,0);syncControls();
  status.textContent=next.count?(message||'Проверьте содержимое перед копированием или скачиванием.'):(message?message+' ':'')+'Сначала добавьте хотя бы одно агентство в «Мой проект».';
 }
 function preparationFailed(message='Не удалось подготовить подборку. Настройки не изменены. Закройте окно и попробуйте снова.'){
  version++;loading=false;prepared=null;preview.value='';syncControls();status.textContent=message;
 }
 function currentPrepared(message='Выбор или заметки изменились. Проверьте обновлённый текст и повторите действие. Для ручного копирования выделите текст заново.'){
  if(!isOpen()||loading||copyPending||!prepared||!loadedData)return null;
  try{
   const next=readPrepared();
   if(!sameSnapshot(prepared,next)){version++;showPrepared(next,message);return null;}
   return prepared.count?prepared:null;
  }catch{preparationFailed('Не удалось сверить подборку с текущим проектом. Откройте окно снова и проверьте текст.');return null;}
 }
 async function update(){
  if(!isOpen())return;
  const current=++version,currentSession=session;loading=true;prepared=null;preview.value='';syncControls();
  status.textContent=copyPending?'Ждём завершения предыдущего копирования…':'Готовим подборку…';
  try{
   // A reopened dialog owns its next preparation; the old copy cannot write its result here.
   if(copyPending){await copyPending.done;if(!isCurrent(currentSession,current))return;status.textContent='Готовим подборку…';}
   const data=loadedData||await getData();if(!isCurrent(currentSession,current))return;
   loadedData=data;const next=readPrepared();loading=false;showPrepared(next);
  }catch{if(isCurrent(currentSession,current))preparationFailed();}
 }
 button.addEventListener('click',event=>{
  if(isOpen())return;
  opener=event.currentTarget;session++;notes.checked=false;presentation.checked=false;loadedData=null;prepared=null;
  dialog.showModal();dialog.querySelector('h2').focus({preventScroll:true});update();
 });
 for(const option of [notes,presentation])option.addEventListener('change',()=>{if(!copyPending)update();});
 dialog.querySelector('[data-close-share]').addEventListener('click',()=>dialog.close());
 dialog.addEventListener('close',()=>{
  if(dialog.open)return;
  version++;loading=false;prepared=null;loadedData=null;preview.value='';syncControls();
  const target=opener?.isConnected?opener:document.querySelector('[data-share-selection]');
  if(target&&!target.disabled)target.focus({preventScroll:true});
 });
 for(const type of ['copy','cut'])preview.addEventListener(type,event=>{if(!currentPrepared())event.preventDefault();});
 copy.addEventListener('click',async()=>{
  const snapshot=currentPrepared();if(!snapshot)return;
  let finish,copied=false;
  const operation={session,version,snapshot,done:new Promise(resolve=>{finish=resolve;})};
  const stillCurrent=()=>isCurrent(operation.session,operation.version)&&prepared===snapshot&&notes.checked===snapshot.includeNotes&&presentation.checked===snapshot.includePresentation;
  copyPending=operation;syncControls();status.textContent='Копируем текст…';
  try{await navigator.clipboard.writeText(snapshot.text);copied=true;}
  catch{}
  finally{copyPending=null;syncControls();finish();}
  if(!stillCurrent())return;
  const changed=copied?'Во время копирования выбор или заметки изменились. В буфере — предыдущая версия. Проверьте обновлённый текст и скопируйте его снова.':undefined;
  if(!currentPrepared(changed))return;
  if(copied){status.textContent='Текст скопирован. Вставьте его в сообщение коллеге.';return;}
  preview.focus({preventScroll:true});if(!stillCurrent()||!currentPrepared())return;
  preview.select();status.textContent='Автоматическое копирование недоступно. Текст выделен — нажмите Ctrl+C или выберите «Копировать».';
 });
 download.addEventListener('click',()=>{
  const snapshot=currentPrepared();if(!snapshot)return;
  const url=URL.createObjectURL(new Blob([snapshot.html],{type:'text/html;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download='EventAgencies 101 — подборка агентств.html';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status.textContent='Файл подготовлен для скачивания. Отправьте его коллеге как вложение.';
 });
}
