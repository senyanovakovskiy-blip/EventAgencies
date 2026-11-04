import {KEY} from './project-store.js';
import {REFERENCE_KEY,normalizeReferences} from './reference-store.js';
import {restoreProjectActionFocus} from './project-action-focus.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normalize=value=>String(value||'').normalize('NFKC').toLocaleLowerCase('ru-RU').replaceAll('ё','е').trim();
const workFor=(work,agencySlug)=>work.agencySlug===agencySlug||work.agencySlugs?.includes(agencySlug);

export function setupProjectWorkPicker({getState,getData,canChoose,onChoose,onError}){
 if(!document.getElementById('project-board'))return;
 const dialog=document.createElement('dialog');dialog.id='project-work-picker';dialog.setAttribute('aria-labelledby','work-picker-title');
 dialog.innerHTML='<header class="work-picker-header"><button class="brief-close" type="button" data-close-work-picker aria-label="Закрыть выбор работы">×</button><span class="eyebrow">Работа для сравнения</span><h2 id="work-picker-title">Выберите работу</h2><p data-work-picker-agency></p><div class="work-picker-search"><label for="work-picker-search">Поиск по работам и моим заметкам</label><div><input id="work-picker-search" type="search" maxlength="120" autocomplete="off" placeholder="Название, город или слова из заметки"><button type="button" data-clear-work-search hidden>Сбросить</button></div></div></header><div class="work-picker-content"><div class="work-picker-filters" role="group" aria-label="Какие работы показать"><button type="button" data-work-picker-filter="all" aria-pressed="true">Все работы <span data-work-filter-count="all"></span></button><button type="button" data-work-picker-filter="saved" aria-pressed="false">Мои примеры <span data-work-filter-count="saved"></span></button><button type="button" data-work-picker-filter="notes" aria-pressed="false">С заметками <span data-work-filter-count="notes"></span></button></div><p class="work-picker-personal-warning" data-work-picker-personal-warning hidden></p><p class="work-picker-count" data-work-picker-count role="status"></p><fieldset><legend class="work-picker-sr">Выберите одну работу или оставьте агентство без работы</legend><label class="work-picker-none"><input type="radio" name="projectWork" value=""><span>Без выбранной работы<small>Сравнивать агентство в целом</small></span></label><div class="work-picker-grid" data-work-picker-grid></div></fieldset><div class="work-picker-empty" data-work-picker-empty hidden><p data-work-picker-empty-text></p><button class="secondary-action" type="button" data-reset-work-filters>Показать все работы</button></div></div><footer class="work-picker-footer"><div><p class="work-picker-choice" data-work-picker-choice></p><p class="work-picker-status" data-work-picker-status role="status"></p></div><div class="work-picker-actions"><button class="secondary-action" type="button" data-close-work-picker>Отмена</button><button class="primary-action" type="button" data-confirm-work-picker>Выбрать для сравнения</button></div></footer>';
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
  grid.querySelectorAll('[data-work-index]').forEach(card=>{
   const work=active.works[Number(card.dataset.workIndex)],notes=active.notes.get(work.slug)||[];
   const text=normalize([work.fullTitle,work.category,work.eventCity,work.guestLabel,...notes.map(note=>note.text)].filter(Boolean).join(' '));
   const matchesMode=active.mode==='all'||active.mode==='saved'&&active.saved?.has(work.slug)||active.mode==='notes'&&notes.length>0;
   card.hidden=!matchesMode||!terms.every(term=>text.includes(term));if(!card.hidden)visible++;
  });
  count.textContent=active.works.length?'Работ: '+visible+' из '+active.works.length:'В каталоге пока нет работ этого агентства.';
  empty.hidden=!active.works.length||visible>0;clearSearch.hidden=!search.value;
  dialog.querySelector('[data-work-picker-empty-text]').textContent=terms.length?'По этому запросу работ нет. Измените поиск или покажите все работы агентства.':active.mode==='saved'?'Среди работ этого агентства пока нет ваших сохранённых примеров.':active.mode==='notes'?'К работам этого агентства пока нет личных заметок.':'Работы не найдены.';
  dialog.querySelectorAll('[data-work-picker-filter]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.workPickerFilter===active.mode)));
 }
 function syncPersonal(){
  if(!active)return;
  try{active.saved=new Set(normalizeReferences(JSON.parse(localStorage.getItem(REFERENCE_KEY)||'[]')));}catch{active.saved=null;}
  active.notes=new Map();
  for(const [key,text] of Object.entries(getState().workNotes)){
   const [agencySlug,workSlug]=key.split('/');if(!text.trim())continue;
   const notes=active.notes.get(workSlug)||[];notes.push({agencySlug,text});active.notes.set(workSlug,notes);
  }
  const warning=dialog.querySelector('[data-work-picker-personal-warning]');warning.hidden=Boolean(active.saved);warning.textContent=active.saved?'':'Не удалось прочитать сохранённые примеры. Разрешите хранение данных сайта и откройте окно снова.';
  const savedFilter=dialog.querySelector('[data-work-picker-filter="saved"]');savedFilter.disabled=!active.saved;
  if(!active.saved&&active.mode==='saved')active.mode='all';
  const totals={all:active.works.length,saved:active.saved?active.works.filter(work=>active.saved.has(work.slug)).length:'—',notes:active.works.filter(work=>active.notes.has(work.slug)).length};
  dialog.querySelectorAll('[data-work-filter-count]').forEach(node=>{node.textContent=String(totals[node.dataset.workFilterCount]);});
  grid.querySelectorAll('[data-work-index]').forEach(card=>{
   const work=active.works[Number(card.dataset.workIndex)],notes=active.notes.get(work.slug)||[],host=card.querySelector('[data-work-personal]');
   const html=(active.saved?.has(work.slug)?'<p class="work-picker-saved">В моих примерах</p>':'')+(notes.length?`<details class="work-picker-notes"><summary>${notes.length===1?'Моя заметка':'Мои заметки · '+notes.length}</summary><div>${notes.map(note=>`<section>${active.agencyNames.has(note.agencySlug)?`<span>К команде «${esc(active.agencyNames.get(note.agencySlug))}»</span>`:''}<p>${esc(note.text)}</p></section>`).join('')}</div><small>Личные заметки · в заявку автоматически не входят</small></details>`:'');
   if(host.innerHTML!==html){const wasOpen=host.querySelector('details')?.open,focused=host.contains(document.activeElement);host.innerHTML=html;const details=host.querySelector('details');if(details){details.open=Boolean(wasOpen);if(focused)details.querySelector('summary').focus({preventScroll:true});}}
   host.hidden=!html;
  });
  filter();
 }
 function render(){
  grid.innerHTML=active.works.map((work,index)=>{
   const photo=work.hasPhotos&&(work.preview||work.reelMobile||work.image),facts=[work.category,work.eventCity,work.guestLabel].filter(Boolean).join(' · ');
   return `<article class="work-picker-card" data-work-index="${index}"><label for="work-picker-option-${index}"><input id="work-picker-option-${index}" type="radio" name="projectWork" value="${esc(work.slug)}"><span class="work-picker-photo">${photo?`<img src="${esc(photo)}" srcset="${esc(work.previewSrcSet||'')}" sizes="(max-width:480px) 90vw,(max-width:740px) 44vw,280px" width="${Number(work.imageWidth)||1200}" height="${Number(work.imageHeight)||900}" loading="lazy" decoding="async" alt="">`:'<span>Работа без фотографий</span>'}</span><span class="work-picker-card-copy"><strong>${esc(work.fullTitle)}</strong>${facts?`<span>${esc(facts)}</span>`:''}${work.slug===active.expected?'<small class="work-picker-current">Сейчас в сравнении</small>':''}</span></label><div class="work-picker-personal" data-work-personal hidden></div><a href="/work/${esc(work.slug)}?from=%2Fmy-project%23project-comparison" target="_blank" rel="noopener noreferrer" aria-label="Открыть работу ${esc(work.fullTitle)} в новой вкладке">Подробнее о работе ↗</a></article>`;
  }).join('');
  syncPersonal();syncChoice();
 }
 async function open(opener){
  if(opening||dialog.open)return;
  if(!canChoose()){onError('Дождитесь завершения отправки заявки, затем выберите работу.');return;}
  opening=true;trigger=opener;
  try{
   const agencySlug=opener.dataset.openWorkPicker,data=await getData(),entry=getState().selection.find(item=>item.agencySlug===agencySlug),agency=data.agencies.find(item=>item.slug===agencySlug);
   if(!entry||!agency){onError('Агентство больше не выбрано. Добавьте его в проект, чтобы выбрать работу.');return;}
   const works=data.projects.filter(work=>workFor(work,agencySlug));
   active={agencySlug,expected:entry.workSlug,works,mode:'all',saved:new Set(),notes:new Map(),agencyNames:new Map(data.agencies.map(item=>[item.slug,item.name]))};selected=entry.workSlug===null?null:works.some(work=>work.slug===entry.workSlug)?entry.workSlug:undefined;
   search.value='';status.textContent=selected===undefined?'Прежняя работа больше недоступна. Выберите другую или оставьте агентство без работы.':'';
   dialog.querySelector('[data-work-picker-agency]').textContent=agency.name;
   render();dialog.showModal();dialog.querySelector('.work-picker-content').scrollTop=0;search.focus({preventScroll:true});
  }catch{onError('Не удалось загрузить работы. Попробуйте открыть выбор ещё раз.');}
  finally{opening=false;}
 }
 document.addEventListener('click',event=>{const opener=event.target.closest('[data-open-work-picker]');if(opener){event.preventDefault();open(opener);}});
 search.addEventListener('input',filter);
 clearSearch.addEventListener('click',()=>{search.value='';filter();search.focus();});
 dialog.querySelectorAll('[data-work-picker-filter]').forEach(button=>button.addEventListener('click',()=>{if(!active||button.disabled)return;active.mode=button.dataset.workPickerFilter;filter();}));
 dialog.querySelector('[data-reset-work-filters]').addEventListener('click',()=>{if(!active)return;active.mode='all';search.value='';filter();search.focus({preventScroll:true});});
 addEventListener('storage',event=>{if(dialog.open&&[KEY,REFERENCE_KEY,null].includes(event.key))syncPersonal();});
 addEventListener('focus',()=>{if(dialog.open)syncPersonal();});
 dialog.addEventListener('change',event=>{if(!event.target.matches('input[name="projectWork"]')||busy)return;selected=event.target.value||null;status.textContent='';syncChoice();});
 dialog.querySelectorAll('[data-close-work-picker]').forEach(button=>button.addEventListener('click',()=>{if(!busy)dialog.close();}));
 dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
 dialog.addEventListener('close',()=>{const agencySlug=active?.agencySlug;active=null;restoreProjectActionFocus({trigger,agencySlug});trigger=null;});
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
