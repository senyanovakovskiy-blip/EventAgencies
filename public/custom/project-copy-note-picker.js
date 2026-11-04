const PAGE_SIZE=10;
const text=value=>String(value??'').trim();
const normalize=value=>text(value).normalize('NFKC').toLocaleLowerCase('ru').replace(/ё/g,'е');
const asSet=value=>new Set(Array.isArray(value)?value:[]);
const sameSet=(left,right)=>left.size===right.size&&[...left].every(value=>right.has(value));
const sameMap=(left,right)=>left.size===right.size&&[...left].every(([key,value])=>right.has(key)&&right.get(key)===value);

/** Pick missing notes from a copy without changing either the copy or the project. */
export function setupCopyNotePicker({host,data,sourceNotes={},referenceSlugs=[],selectedKeys=[],currentNotes={},onChange}){
 const doc=host.ownerDocument;
 const element=(tag,className,value)=>{const node=doc.createElement(tag);if(className)node.className=className;if(value!==undefined)node.textContent=value;return node;};
 const works=new Map((data?.projects||[]).map(work=>[work.slug,work]));
 const agencies=new Map((data?.agencies||[]).map(agency=>[agency.slug,agency]));
 const items=Object.entries(sourceNotes||{}).filter(([key,note])=>key.split('/').length===2&&key.split('/').every(Boolean)&&typeof note==='string'&&note.trim()).map(([key,note])=>{
  const [agencySlug,workSlug]=key.split('/'),work=works.get(workSlug),agency=agencies.get(agencySlug);
  return {key,note,workSlug,title:text(work?.fullTitle)||text(work?.title)||'Работа недоступна · '+workSlug,agency:text(agency?.name)||'Команда недоступна · '+agencySlug};
 });
 const allowed=new Set(items.map(item=>item.key)),selected=new Set((Array.isArray(selectedKeys)?selectedKeys:[]).filter(key=>allowed.has(key)));
 const currentMap=value=>new Map(items.filter(item=>value&&Object.hasOwn(value,item.key)).map(item=>[item.key,String(value[item.key]??'')]));
 let references=asSet(referenceSlugs),current=currentMap(currentNotes),visibleLimit=PAGE_SIZE,disabled=false,destroyed=false;
 let eligible=items.filter(item=>references.has(item.workSlug)),matches=eligible;
 const cards=new Map();
 const picker=element('details','copy-note-picker');
 const heading=element('summary','copy-note-heading');
 const help=element('p','copy-note-help','Здесь заметки к отмеченным примерам. Выберите новые заметки для переноса. Текущие записи сохранятся. Выбор запоминается при переключении примеров.');
 const filters=element('div','copy-note-filters');
 const searchLabel=element('label','copy-note-search'),search=element('input');search.type='search';search.maxLength=160;search.autocomplete='off';search.placeholder='Текст заметки, работа или команда';
 searchLabel.append(element('span',null,'Найти заметки'),search);
 const filterLabel=element('label','copy-note-filter'),filter=element('select');
 const optionLabels={all:'Все',new:'Новые',different:'С другим текстом',same:'Уже совпадают'},options=new Map();
 Object.entries(optionLabels).forEach(([value,label])=>{const option=element('option',null,label);option.value=value;filter.append(option);options.set(value,option);});
 filterLabel.append(element('span',null,'Показать заметки'),filter);
 const reset=element('button','secondary-action copy-note-reset','Сбросить поиск и фильтр');reset.type='button';filters.append(searchLabel,filterLabel,reset);
 const controls=element('div','copy-note-tools');
 const selectNew=element('button','secondary-action','Выбрать найденные новые');selectNew.type='button';
 const clear=element('button','secondary-action','Снять выбор у найденных');clear.type='button';
 controls.append(selectNew,clear);
 const count=element('p','copy-note-count');count.tabIndex=-1;count.setAttribute('role','status');count.setAttribute('aria-live','polite');count.setAttribute('aria-atomic','true');
 const list=element('div','copy-note-list');list.setAttribute('role','group');list.setAttribute('aria-label','Заметки к отмеченным примерам');
 const empty=element('p','copy-note-empty');
 const more=element('button','secondary-action copy-note-more');more.type='button';
 picker.append(heading,help,filters,controls,count,list,empty,more);host.replaceChildren(picker);

 function createCard(item){
  const card=element('article','copy-note-card');
  const choice=element('label','copy-note-choice');
  const checkbox=element('input');checkbox.type='checkbox';checkbox.value=item.key;checkbox.dataset.copyNoteKey=item.key;
  const copy=element('span');copy.append(element('strong',null,item.title),element('small',null,item.agency));choice.append(checkbox,copy);
  const state=element('span','copy-note-state');
  const details=element('details','copy-note-text'),summary=element('summary',null,'Прочитать заметку');
  const versions=element('div','copy-note-versions');
  const savedVersion=element('div'),savedText=element('p');savedVersion.append(element('strong',null,'В текущем проекте'),savedText);
  const sourceVersion=element('div');sourceVersion.append(element('strong',null,'В сохранённой копии'),element('p',null,item.note));
  versions.append(savedVersion,sourceVersion);details.append(summary,versions);card.append(choice,state,details);
  cards.set(item.key,{item,card,checkbox,state,details,summary,savedVersion,savedText});return card;
 }

 function syncSelection(){
  cards.forEach(({item,card,checkbox,state,summary,savedVersion,savedText})=>{
   const existing=current.has(item.key),conflicting=existing&&current.get(item.key)!==item.note;
   const wasFocused=doc.activeElement===checkbox;
   checkbox.checked=!existing&&selected.has(item.key);checkbox.disabled=disabled||existing;
   const label=existing?(conflicting?'Сохранится текущая заметка':'Уже в проекте'):'Новая заметка';
   state.textContent=label;checkbox.setAttribute('aria-label','Заметка к работе «'+item.title+'», '+item.agency+'. '+label);
   card.classList.toggle('is-existing',existing);card.classList.toggle('is-selected',checkbox.checked);
   savedVersion.hidden=!conflicting;savedText.textContent=conflicting?(current.get(item.key)||'Пустая заметка'):'';
   summary.textContent=conflicting?'Сравнить тексты':'Прочитать заметку';
   if(wasFocused&&checkbox.disabled)summary.focus({preventScroll:true});
  });
  const newItems=eligible.filter(item=>!current.has(item.key)),foundNew=matches.filter(item=>!current.has(item.key));
  const selectedNew=newItems.filter(item=>selected.has(item.key)).length,selectedFound=foundNew.filter(item=>selected.has(item.key)).length;
  const outside=selectedNew-selectedFound;
  const existing=eligible.length-newItems.length,conflicting=eligible.filter(item=>current.has(item.key)&&current.get(item.key)!==item.note).length;
  const totals={all:eligible.length,new:newItems.length,different:conflicting,same:existing-conflicting};
  options.forEach((option,value)=>{option.textContent=optionLabels[value]+' · '+totals[value];});
  const shown=Math.min(visibleLimit,matches.length);
  heading.textContent='Выбрать заметки · новых: '+newItems.length;
  count.textContent='К добавлению выбрано: '+selectedNew+' из '+newItems.length+' новых заметок к отмеченным примерам. Найдено: '+matches.length+' из '+eligible.length+'. Показано: '+shown+'. За пределами поиска и фильтра выбрано: '+outside+'.'+(outside?' Эти заметки тоже добавятся.':'')+(existing?' Уже есть в проекте: '+existing+'.':'')+(conflicting?' С другим текстом: '+conflicting+' — останется текущий текст.':'')+(matches.length>shown?' Кнопки выбора действуют на все найденные новые заметки, включая ещё не показанные.':'');
  search.disabled=disabled;filter.disabled=disabled;reset.disabled=disabled||(!search.value&&filter.value==='all');
  selectNew.disabled=disabled||selectedFound===foundNew.length;
  clear.disabled=disabled||!selectedFound;
  more.disabled=disabled;more.hidden=shown>=matches.length;more.textContent='Показать ещё '+Math.min(PAGE_SIZE,Math.max(0,matches.length-shown));
  empty.hidden=Boolean(matches.length);
  empty.textContent=!references.size?'Сначала отметьте примеры, заметки к которым хотите добавить.':!eligible.length?'У отмеченных примеров нет заметок в этой копии.':'Заметок по этому поиску и фильтру нет. Измените условия или сбросьте их — выбранные заметки сохранятся.';
 }

 function renderMatches(){
  const focused=doc.activeElement,focusedInList=Boolean(focused&&list.contains(focused));
  const visible=matches.slice(0,visibleLimit);
  visible.forEach((item,index)=>{
   const card=cards.get(item.key)?.card||createCard(item);
   if(list.children[index]!==card)list.insertBefore(card,list.children[index]||null);
  });
  while(list.children.length>visible.length)list.lastElementChild.remove();
  syncSelection();
  if(!focusedInList)return;
  if(!list.contains(focused))count.focus({preventScroll:true});
  else if(!focused.disabled&&doc.activeElement!==focused)focused.focus({preventScroll:true});
  else if(focused.disabled)focused.closest('.copy-note-card')?.querySelector('.copy-note-text>summary')?.focus({preventScroll:true});
 }
 function updateMatches({resetPage=false}={}){
  eligible=items.filter(item=>references.has(item.workSlug));
  const words=normalize(search.value).split(/\s+/).filter(Boolean),kind=filter.value;
  const nextMatches=eligible.filter(item=>{
   const existing=current.has(item.key),same=existing&&current.get(item.key)===item.note;
   if(kind==='new'&&existing||kind==='different'&&(!existing||same)||kind==='same'&&!same)return false;
   const haystack=normalize([item.title,item.agency,item.note,current.get(item.key)||''].join(' '));
   return words.every(word=>haystack.includes(word));
  });
  const matchesChanged=nextMatches.length!==matches.length||nextMatches.some((item,index)=>item.key!==matches[index].key);
  if(resetPage&&matchesChanged)visibleLimit=PAGE_SIZE;
  matches=nextMatches;
  renderMatches();
 }
 function handleFilterChange(){if(disabled||destroyed)return;updateMatches({resetPage:true});}
 function handleReset(){
  if(disabled||destroyed)return;
  search.value='';filter.value='all';updateMatches({resetPage:true});search.focus({preventScroll:true});
 }
 function notifyChange(){syncSelection();if(typeof onChange==='function')onChange(items.filter(item=>selected.has(item.key)).map(item=>item.key));}
 function handleSelection(event){
  const checkbox=event.target;if(!checkbox.matches?.('input[data-copy-note-key]'))return;
  const key=checkbox.dataset.copyNoteKey,item=cards.get(key)?.item;
  if(disabled||destroyed||!item||!matches.some(match=>match.key===key)||current.has(key)){syncSelection();return;}
  if(checkbox.checked===selected.has(key))return;
  if(checkbox.checked)selected.add(key);else selected.delete(key);notifyChange();
 }
 function handleSelectNew(){
  if(disabled||destroyed)return;
  const before=selected.size;matches.forEach(item=>{if(!current.has(item.key))selected.add(item.key);});
  if(selected.size!==before)notifyChange();
 }
 function handleClear(){
  if(disabled||destroyed)return;
  const before=selected.size;matches.forEach(item=>{if(!current.has(item.key))selected.delete(item.key);});
  if(selected.size!==before)notifyChange();
 }
 function handleMore(){
  if(disabled||destroyed||visibleLimit>=matches.length)return;
  const firstNew=visibleLimit;visibleLimit+=PAGE_SIZE;
  matches.slice(firstNew,visibleLimit).forEach(item=>list.append(cards.get(item.key)?.card||createCard(item)));
  syncSelection();
  const first=cards.get(matches[firstNew].key);(first.checkbox.disabled?first.summary:first.checkbox).focus({preventScroll:true});
 }
 list.addEventListener('change',handleSelection);selectNew.addEventListener('click',handleSelectNew);clear.addEventListener('click',handleClear);more.addEventListener('click',handleMore);
 search.addEventListener('input',handleFilterChange);filter.addEventListener('change',handleFilterChange);reset.addEventListener('click',handleReset);
 renderMatches();
 return {
  setContext(value={}){
   if(destroyed)return;
   const nextReferences=Object.hasOwn(value,'referenceSlugs')?asSet(value.referenceSlugs):references;
   const nextCurrent=Object.hasOwn(value,'currentNotes')?currentMap(value.currentNotes):current;
   const referencesChanged=!sameSet(references,nextReferences),notesChanged=!sameMap(current,nextCurrent);
   if(!referencesChanged&&!notesChanged)return;
   references=nextReferences;current=nextCurrent;
   updateMatches();
  },
  setDisabled(value){if(destroyed||disabled===Boolean(value))return;disabled=Boolean(value);syncSelection();},
  destroy(){
   if(destroyed)return;disabled=true;syncSelection();destroyed=true;
   list.removeEventListener('change',handleSelection);selectNew.removeEventListener('click',handleSelectNew);clear.removeEventListener('click',handleClear);more.removeEventListener('click',handleMore);
   search.removeEventListener('input',handleFilterChange);filter.removeEventListener('change',handleFilterChange);reset.removeEventListener('click',handleReset);cards.clear();
  }
 };
}
