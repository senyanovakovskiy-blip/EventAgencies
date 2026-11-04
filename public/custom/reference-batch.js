import {setupReferenceBatchCopy} from './reference-batch-copy.js';
import {referenceBatchSession as session} from './reference-batch-session.js';

const controllers=new WeakMap();

export function syncReferenceBatch(host){controllers.get(host)?.sync();}
export function resetReferenceBatch(host){const controller=controllers.get(host);if(controller)controller.reset();else session.reset();}
export function reconcileReferenceBatch(slugs){session.reconcile();session.prune(slugs);}
export function resumeReferenceBatch(host){controllers.get(host)?.suspend();return session.resume();}
export function suspendReferenceBatch(host){controllers.get(host)?.suspend();session.reconcile();session.save();}

export function setupReferenceBatch(host,onRemove){
 // A render replaces cards, not the selection belonging to this project.
 const previous=controllers.get(host),state=session.state;
 session.reconcile();
 previous?.destroy();
 controllers.delete(host);host.querySelector('.reference-batch-bar')?.remove();
 const grid=host.querySelector('#saved-reference-grid');
 if(!grid){session.reset();delete host.dataset.referenceSelecting;return;}
 const bar=document.createElement('div');bar.className='reference-batch-bar';
 bar.innerHTML=`<button class="reference-batch-open" type="button">Выбрать несколько</button><div class="reference-batch-tools" hidden>
  <p role="status" aria-live="polite" aria-atomic="true" data-batch-count></p>
  <div class="reference-batch-actions" role="group" aria-label="Управление выбором примеров"><button type="button" data-batch-all>Выбрать показанные</button><button type="button" data-batch-clear>Снять весь выбор</button><button type="button" data-batch-clear-hidden hidden>Снять скрытые</button><button type="button" data-batch-finish>Готово</button></div>
  <p class="reference-batch-scope" id="reference-batch-scope" data-batch-scope></p>
  <div class="reference-batch-actions" role="group" aria-label="Действия со всеми выбранными примерами" aria-describedby="reference-batch-scope"><button type="button" data-batch-download data-download-brief data-export-reference-selection="[]" aria-describedby="reference-batch-scope" disabled>Скачать выбранные…</button><button type="button" data-batch-copy aria-describedby="reference-batch-scope reference-batch-copy-status" disabled>Скопировать ссылки</button><button type="button" data-batch-wishes data-add-wishes-selection="[]" aria-describedby="reference-batch-scope" disabled>В пожелания…</button><button type="button" data-batch-remove aria-describedby="reference-batch-scope" disabled>Убрать выбранные</button></div>
  <p class="reference-batch-copy-status" id="reference-batch-copy-status" data-batch-copy-status role="status" aria-live="polite" aria-atomic="true"></p>
  <div class="reference-batch-copy-manual" data-batch-copy-manual hidden><label for="reference-batch-copy-text">Названия и ссылки на выбранные работы</label><textarea id="reference-batch-copy-text" rows="6" readonly spellcheck="false" aria-describedby="reference-batch-copy-help"></textarea><p id="reference-batch-copy-help">Выделите текст и используйте команду «Копировать» или Ctrl+C / ⌘C.</p><div class="reference-batch-actions"><button type="button">Выделить текст</button></div></div>
  <small>Копируются только названия и ссылки на работы, без личных заметок и контактов.</small>
  <small>«Выбрать показанные» добавляет видимые примеры к выбору. Заметки сохранятся после удаления примеров.</small>
  <small data-batch-retention role="status"></small>
 </div>`;
 grid.before(bar);
 const opener=bar.querySelector('.reference-batch-open'),panel=bar.querySelector('.reference-batch-tools'),count=bar.querySelector('[data-batch-count]'),scope=bar.querySelector('[data-batch-scope]');
 const all=bar.querySelector('[data-batch-all]'),clear=bar.querySelector('[data-batch-clear]'),clearHidden=bar.querySelector('[data-batch-clear-hidden]'),remove=bar.querySelector('[data-batch-remove]'),finish=bar.querySelector('[data-batch-finish]');
 const download=bar.querySelector('[data-batch-download]'),wishes=bar.querySelector('[data-batch-wishes]');
 const cardsInOrder=()=>[...grid.querySelectorAll('[data-saved-reference]')];
 // Hidden cards remain in the DOM's current sort order and in every action.
 const selectedInOrder=()=>cardsInOrder().filter(card=>state.selected.has(card.dataset.savedReference)).map(card=>card.dataset.savedReference);
 const copyLinks=setupReferenceBatchCopy({bar,getSelectedCards:()=>cardsInOrder().filter(card=>state.selected.has(card.dataset.savedReference))});
 const options=cardsInOrder().map(card=>{
  card.querySelector('.reference-batch-choice')?.remove();
  const label=document.createElement('label');label.className='reference-batch-choice';label.hidden=true;
  const input=document.createElement('input');input.type='checkbox';input.setAttribute('aria-label','Выбрать пример «'+(card.querySelector('h3')?.textContent||'Сохранённая работа')+'»');
  const text=document.createElement('span');text.textContent='Выбрать пример';label.append(input,text);card.prepend(label);
  return {card,label,input,slug:card.dataset.savedReference};
 });
 function sync(){
  if(session.reconcile())copyLinks.reset();
  const cards=cardsInOrder(),available=new Set(cards.map(card=>card.dataset.savedReference)),visible=cards.filter(card=>!card.hidden);
  for(const slug of state.selected)if(!available.has(slug))state.selected.delete(slug);
  const total=state.selected.size,visibleSelected=visible.filter(card=>state.selected.has(card.dataset.savedReference)).length,hiddenSelected=total-visibleSelected;
  host.dataset.referenceSelecting=String(state.active);opener.hidden=state.active;panel.hidden=!state.active;
  count.textContent='Выбрано всего: '+total+' · Видно сейчас: '+visibleSelected+' · Скрыто фильтрами: '+hiddenSelected;
  scope.textContent=total?'Скачивание, копирование ссылок, добавление в пожелания и удаление применятся ко всем выбранным примерам: '+total+(hiddenSelected?', включая скрытые фильтрами: '+hiddenSelected:'')+'. Порядок — как в текущей сортировке карточек.':'Отметьте примеры. Поиск и фильтры сохраняют выбор; действия включают и скрытые выбранные примеры.';
  for(const option of options){option.label.hidden=!state.active;option.input.checked=state.selected.has(option.slug);option.input.disabled=state.busy;option.card.dataset.batchSelected=String(state.active&&state.selected.has(option.slug));}
  all.disabled=state.busy||!visible.length||visibleSelected===visible.length;
  clear.disabled=state.busy||!total;clearHidden.hidden=!hiddenSelected;clearHidden.disabled=state.busy||!hiddenSelected;
  remove.disabled=state.busy||!total;download.disabled=state.busy||!total;wishes.disabled=state.busy||!total;finish.disabled=state.busy;
  download.textContent='Скачать выбранные'+(total?' · '+total:'')+'…';
  wishes.textContent='В пожелания'+(total?' · '+total:'')+'…';
  remove.textContent=state.busy?'Убираем…':'Убрать выбранные'+(total?' · '+total:'');
  copyLinks.sync({unavailable:state.busy||!state.active});
  session.save();
  const retention=bar.querySelector('[data-batch-retention]');
  const retentionText=session.available?'Режим и выбор сохраняются в этой вкладке при переходе к работе и перезагрузке. «Готово» завершает выбор.':'Выбор работает на этой странице. Не удалось сохранить его для переходов и перезагрузки.';
  if(retention.textContent!==retentionText)retention.textContent=retentionText;
 }
 function reset(){copyLinks.reset();session.reset();sync();}
 opener.addEventListener('click',()=>{state.active=true;sync();options.find(option=>!option.card.hidden)?.input.focus({preventScroll:true});});
 options.forEach(option=>option.input.addEventListener('change',()=>{if(state.busy)return;if(option.input.checked)state.selected.add(option.slug);else state.selected.delete(option.slug);sync();}));
 all.addEventListener('click',()=>{if(state.busy)return;for(const card of cardsInOrder())if(!card.hidden)state.selected.add(card.dataset.savedReference);sync();});
 clear.addEventListener('click',()=>{if(state.busy)return;state.selected.clear();sync();});
 clearHidden.addEventListener('click',()=>{
  if(state.busy)return;
  for(const card of cardsInOrder())if(card.hidden)state.selected.delete(card.dataset.savedReference);
  sync();(clear.disabled?finish:clear).focus({preventScroll:true});
 });
 download.addEventListener('click',()=>{download.dataset.exportReferenceSelection=JSON.stringify(selectedInOrder());});
 wishes.addEventListener('click',()=>{wishes.dataset.addWishesSelection=JSON.stringify(selectedInOrder());});
 finish.addEventListener('click',()=>{if(state.busy)return;reset();opener.focus({preventScroll:true});});
 remove.addEventListener('click',async()=>{
  if(state.busy)return;const slugs=selectedInOrder();if(!slugs.length)return;
  const generation=state.generation;state.busy=true;sync();
  try{if(await onRemove(slugs)&&generation===state.generation){state.active=false;state.selected.clear();}}
  finally{if(generation===state.generation){state.busy=false;syncReferenceBatch(host);}}
 });
 controllers.set(host,{state,sync,reset,suspend:()=>copyLinks.reset(),destroy:()=>copyLinks.destroy()});sync();
}
