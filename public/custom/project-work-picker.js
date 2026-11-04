import {workNoteKey} from './project-store.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normalize=value=>String(value||'').normalize('NFKC').toLocaleLowerCase('ru-RU').replaceAll('ё','е').trim();
const workFor=(work,agencySlug)=>work.agencySlug===agencySlug||work.agencySlugs?.includes(agencySlug);

export function setupProjectWorkPicker({getState,getData,canChoose,onChoose,onError}){
 if(!document.getElementById('project-board'))return;
 const dialog=document.createElement('dialog');dialog.id='project-work-picker';dialog.setAttribute('aria-labelledby','work-picker-title');
 dialog.innerHTML='<header class="work-picker-header"><button class="brief-close" type="button" data-close-work-picker aria-label="Закрыть выбор работы">×</button><span class="eyebrow">Работа для сравнения</span><h2 id="work-picker-title">Выберите работу</h2><p data-work-picker-agency></p><div class="work-picker-search"><label for="work-picker-search">Поиск по названию, формату или городу</label><div><input id="work-picker-search" type="search" maxlength="120" autocomplete="off" placeholder="Найти работу…"><button type="button" data-clear-work-search hidden>Сбросить</button></div></div></header><div class="work-picker-content"><p class="work-picker-count" data-work-picker-count role="status"></p><fieldset><legend class="work-picker-sr">Выберите одну работу или оставьте агентство без работы</legend><label class="work-picker-none"><input type="radio" name="projectWork" value=""><span>Без выбранной работы<small>Сравнивать агентство в целом</small></span></label><div class="work-picker-grid" data-work-picker-grid></div></fieldset><p class="work-picker-empty" data-work-picker-empty hidden>По этому запросу работ нет. Измените поиск или сбросьте его.</p></div><footer class="work-picker-footer"><div><p class="work-picker-choice" data-work-picker-choice></p><p class="work-picker-status" data-work-picker-status role="status"></p></div><div class="work-picker-actions"><button class="secondary-action" type="button" data-close-work-picker>Отмена</button><button class="primary-action" type="button" data-confirm-work-picker>Выбрать для сравнения</button></div></footer>';
 document.body.append(dialog);
 const search=dialog.querySelector('#work-picker-search'),clearSearch=dialog.querySelector('[data-clear-work-search]'),grid=dialog.querySelector('[data-work-picker-grid]'),count=dialog.querySelector('[data-work-picker-count]'),empty=dialog.querySelector('[data-work-picker-empty]'),choice=dialog.querySelector('[data-work-picker-choice]'),status=dialog.querySelector('[data-work-picker-status]'),confirm=dialog.querySelector('[data-confirm-work-picker]');
 let active=null,selected,opening=false,busy=false,trigger=null;
 function syncChoice(){
  if(!active)return;
  const work=active.works.find(item=>item.slug===selected);
  choice.textContent=selected===null?'Без выбранной работы':work?'Выбрано: '+work.fullTitle:'Выберите работу для сравнения.';
  const changed=selected!==undefined&&selected!==active.expected;
  confirm.textContent=selected===null?'Оставить без работы':'Выбрать для сравнения';
  confirm.disabled=busy||active.unavailable||!changed;confirm.setAttribute('aria-busy',String(busy));
  dialog.querySelectorAll('input[name="projectWork"]').forEach(input=>{input.checked=(input.value||null)===selected;input.disabled=busy||Boolean(active.unavailable);input.closest('.work-picker-card,.work-picker-none')?.classList.toggle('is-selected',input.checked);});
  dialog.querySelectorAll('[data-close-work-picker]').forEach(button=>{button.disabled=busy;});
 }
 function filter(){
  if(!active)return;
  const terms=normalize(search.value).split(/\s+/).filter(Boolean);let visible=0;
  grid.querySelectorAll('[data-work-index]').forEach(card=>{const work=active.works[Number(card.dataset.workIndex)];const text=normalize([work.fullTitle,work.category,work.eventCity,work.guestLabel].filter(Boolean).join(' '));card.hidden=!terms.every(term=>text.includes(term));if(!card.hidden)visible++;});
  count.textContent=active.works.length?'Работ: '+visible+' из '+active.works.length:'В каталоге пока нет работ этого агентства.';
  empty.hidden=!active.works.length||visible>0;clearSearch.hidden=!search.value;
 }
 function render(){
  const state=getState();
  grid.innerHTML=active.works.map((work,index)=>{
   const photo=work.hasPhotos&&(work.preview||work.reelMobile||work.image),note=state.workNotes[workNoteKey(active.agencySlug,work.slug)]?.trim(),facts=[work.category,work.eventCity,work.guestLabel].filter(Boolean).join(' · ');
   return `<article class="work-picker-card" data-work-index="${index}"><label for="work-picker-option-${index}"><input id="work-picker-option-${index}" type="radio" name="projectWork" value="${esc(work.slug)}"><span class="work-picker-photo">${photo?`<img src="${esc(photo)}" srcset="${esc(work.previewSrcSet||'')}" sizes="(max-width:480px) 90vw,(max-width:740px) 44vw,280px" width="${Number(work.imageWidth)||1200}" height="${Number(work.imageHeight)||900}" loading="lazy" decoding="async" alt="">`:'<span>Работа без фотографий</span>'}</span><span class="work-picker-card-copy"><strong>${esc(work.fullTitle)}</strong>${facts?`<span>${esc(facts)}</span>`:''}${work.slug===active.expected?'<small class="work-picker-current">Сейчас в сравнении</small>':''}${note?'<small>Есть моя заметка</small>':''}</span></label><a href="/work/${esc(work.slug)}?from=%2Fmy-project%23project-comparison" target="_blank" rel="noopener noreferrer" aria-label="Открыть работу ${esc(work.fullTitle)} в новой вкладке">Подробнее о работе ↗</a></article>`;
  }).join('');
  filter();syncChoice();
 }
 async function open(opener){
  if(opening||dialog.open)return;
  if(!canChoose()){onError('Дождитесь завершения отправки заявки, затем выберите работу.');return;}
  opening=true;trigger=opener;
  try{
   const agencySlug=opener.dataset.openWorkPicker,data=await getData(),entry=getState().selection.find(item=>item.agencySlug===agencySlug),agency=data.agencies.find(item=>item.slug===agencySlug);
   if(!entry||!agency){onError('Агентство больше не выбрано. Добавьте его в проект, чтобы выбрать работу.');return;}
   const works=data.projects.filter(work=>workFor(work,agencySlug));
   active={agencySlug,expected:entry.workSlug,works};selected=entry.workSlug===null?null:works.some(work=>work.slug===entry.workSlug)?entry.workSlug:undefined;
   search.value='';status.textContent=selected===undefined?'Прежняя работа больше недоступна. Выберите другую или оставьте агентство без работы.':'';
   dialog.querySelector('[data-work-picker-agency]').textContent=agency.name;
   render();dialog.showModal();dialog.querySelector('.work-picker-content').scrollTop=0;search.focus({preventScroll:true});
  }catch{onError('Не удалось загрузить работы. Попробуйте открыть выбор ещё раз.');}
  finally{opening=false;}
 }
 document.addEventListener('click',event=>{const opener=event.target.closest('[data-open-work-picker]');if(opener){event.preventDefault();open(opener);}});
 search.addEventListener('input',filter);
 clearSearch.addEventListener('click',()=>{search.value='';filter();search.focus();});
 dialog.addEventListener('change',event=>{if(!event.target.matches('input[name="projectWork"]')||busy)return;selected=event.target.value||null;status.textContent='';syncChoice();});
 dialog.querySelectorAll('[data-close-work-picker]').forEach(button=>button.addEventListener('click',()=>{if(!busy)dialog.close();}));
 dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
 dialog.addEventListener('close',()=>{const agencySlug=active?.agencySlug;active=null;const target=trigger?.isConnected?trigger:agencySlug&&document.querySelector(`[data-open-work-picker="${agencySlug}"]`);(target||document.getElementById('project-comparison'))?.focus({preventScroll:true});trigger=null;});
 document.addEventListener('ea:project-copy-restored',()=>{if(dialog.open)dialog.close();});
 confirm.addEventListener('click',async()=>{
  if(!active||active.unavailable||busy||selected===undefined||selected===active.expected)return;
  if(!canChoose()){status.textContent='Дождитесь завершения отправки заявки.';return;}
  const request={agencySlug:active.agencySlug,workSlug:selected,expectedWorkSlug:active.expected};
  busy=true;status.textContent='';syncChoice();
  try{
   const result=await onChoose(request);
   if(result==='saved'){dialog.close();return;}
   if(!active)return;
   if(result==='changed'){
    const entry=getState().selection.find(item=>item.agencySlug===active.agencySlug);
    if(!entry){active.unavailable=true;selected=undefined;status.textContent='Агентство уже убрано из проекта. Закройте это окно и продолжите выбор команд.';}
    else{active.expected=entry.workSlug;selected=entry.workSlug===null?null:active.works.some(work=>work.slug===entry.workSlug)?entry.workSlug:undefined;render();status.textContent='Выбранная работа уже изменилась. Показан текущий выбор — выберите работу снова.';}
   }else status.textContent='Не удалось сохранить работу. Разрешите хранение данных сайта, сохраните текущие изменения и попробуйте снова.';
  }catch{status.textContent='Не удалось сохранить работу. Попробуйте ещё раз.';}
  finally{busy=false;syncChoice();}
 });
}
