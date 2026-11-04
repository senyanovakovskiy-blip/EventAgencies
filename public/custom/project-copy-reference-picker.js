const PAGE_SIZE=12;
const text=value=>String(value??'').trim();
const normalize=value=>text(value).toLocaleLowerCase('ru').replace(/ё/g,'е');
const unique=values=>[...new Set(values.filter(Boolean))];

export function setupCopyReferencePicker({host,data,referenceSlugs=[],selectedSlugs=[],onChange}){
 const doc=host.ownerDocument;
 const element=(tag,className,value)=>{const node=doc.createElement(tag);if(className)node.className=className;if(value!==undefined)node.textContent=value;return node;};
 const works=new Map((data?.projects||[]).map(work=>[work.slug,work]));
 const agencies=new Map((data?.agencies||[]).map(agency=>[agency.slug,agency]));
 const slugs=unique(referenceSlugs).filter(slug=>works.has(slug));
 const allowed=new Set(slugs),selected=new Set(selectedSlugs.filter(slug=>allowed.has(slug)));
 const items=slugs.map(slug=>{
  const work=works.get(slug),teamSlugs=unique([...(work.agencySlugs||[]),work.agencySlug]);
  const teams=teamSlugs.map(teamSlug=>agencies.get(teamSlug)).filter(Boolean);
  const team=unique(teams.map(agency=>text(agency.name))).join(', ')||text(work.client)||'Команда не указана';
  const title=text(work.fullTitle)||text(work.title)||'Название работы не указано';
  const formats=unique((work.types||[]).map(type=>text(data?.types?.[type]||type)));
  const facts=unique([text(work.category)||formats.join(', '),text(work.eventCity),text(work.guestLabel),text(work.year)]).join(' · ');
  const search=normalize([title,team,work.eventCity,...teams.map(agency=>agency.city),work.category,...formats].filter(Boolean).join(' '));
  return {slug,work,title,team,facts,search};
 });
 let disabled=false,destroyed=false,visibleLimit=PAGE_SIZE,matches=items;
 const cards=new Map();
 const picker=element('section','copy-import-picker');picker.setAttribute('aria-label','Выбор примеров из копии');
 const searchLabel=element('label','copy-import-search');
 const search=element('input');search.type='search';search.maxLength=160;search.autocomplete='off';search.placeholder='Название, команда, город или формат';
 searchLabel.append(element('span',null,'Найти примеры в копии'),search);
 const controls=element('div','copy-import-tools');
 const selectFound=element('button','secondary-action','Выбрать найденные');selectFound.type='button';
 const clear=element('button','secondary-action','Снять весь выбор');clear.type='button';
 controls.append(selectFound,clear);
 const count=element('p','copy-import-count');count.setAttribute('role','status');count.setAttribute('aria-live','polite');count.setAttribute('aria-atomic','true');
 const grid=element('div','copy-import-grid');grid.setAttribute('role','group');grid.setAttribute('aria-label','Доступные примеры из копии');
 const empty=element('p','copy-import-empty');
 const more=element('button','secondary-action copy-import-more');more.type='button';
 picker.append(searchLabel,controls,count,grid,empty,more);host.replaceChildren(picker);

 function createCard(item){
  const card=element('label','copy-import-card');
  const checkbox=element('input');checkbox.type='checkbox';checkbox.value=item.slug;checkbox.dataset.copyImportReference=item.slug;
  checkbox.setAttribute('aria-label','Выбрать пример: '+item.title+'. Команда: '+item.team);
  const photo=element('div','copy-import-photo');
  const source=item.work.hasPhotos&&(item.work.preview||item.work.reelMobile||item.work.image);
  if(source){const image=element('img');image.src=source;image.alt='';image.loading='lazy';image.decoding='async';image.width=240;image.height=180;photo.append(image);}
  else photo.append(element('span',null,'Фотографии пока не добавлены'));
  const copy=element('div','copy-import-card-copy');copy.append(element('strong',null,item.title),element('span',null,'Команда — '+item.team));
  if(item.facts)copy.append(element('span',null,item.facts));
  card.append(checkbox,photo,copy);cards.set(item.slug,{card,checkbox});return card;
 }

 function syncSelection(){
  cards.forEach(({card,checkbox},slug)=>{checkbox.checked=selected.has(slug);checkbox.disabled=disabled;card.classList.toggle('is-selected',checkbox.checked);});
  const selectedFound=matches.reduce((total,item)=>total+Number(selected.has(item.slug)),0);
  const outside=selected.size-selectedFound,shown=Math.min(visibleLimit,matches.length);
  count.textContent='Выбрано: '+selected.size+' из '+items.length+'. Найдено: '+matches.length+'. Показано: '+shown+'.'+(outside?' Вне текущего поиска выбрано: '+outside+' — они остаются выбранными.':'')+(matches.length>shown?' «Выбрать найденные» выбирает все '+matches.length+', включая ещё не показанные.':'');
  search.disabled=disabled;
  selectFound.disabled=disabled||!matches.length||selectedFound===matches.length;
  clear.disabled=disabled||!selected.size;
  more.disabled=disabled;
  more.hidden=shown>=matches.length;
  more.textContent='Показать ещё '+Math.min(PAGE_SIZE,Math.max(0,matches.length-shown));
  empty.hidden=Boolean(matches.length);
  empty.textContent=items.length?'По этому запросу примеров нет. Измените или очистите поиск.':'В этой копии нет доступных примеров для добавления.';
 }

 function renderMatches(){
  const fragment=doc.createDocumentFragment();
  matches.slice(0,visibleLimit).forEach(item=>fragment.append(cards.get(item.slug)?.card||createCard(item)));
  grid.replaceChildren(fragment);syncSelection();
 }

 function notifyChange(){syncSelection();if(typeof onChange==='function')onChange(slugs.filter(slug=>selected.has(slug)));}
 function handleSearch(){
  if(disabled||destroyed)return;
  const words=normalize(search.value).split(/\s+/).filter(Boolean);
  matches=items.filter(item=>words.every(word=>item.search.includes(word)));visibleLimit=PAGE_SIZE;renderMatches();
 }
 function handleSelection(event){
  const checkbox=event.target;
  if(!checkbox.matches?.('input[data-copy-import-reference]'))return;
  const slug=checkbox.dataset.copyImportReference;
  if(disabled||destroyed||!allowed.has(slug)){checkbox.checked=selected.has(slug);return;}
  if(checkbox.checked===selected.has(slug))return;
  if(checkbox.checked)selected.add(slug);else selected.delete(slug);
  notifyChange();
 }
 function handleSelectFound(){
  if(disabled||destroyed)return;
  const before=selected.size;matches.forEach(item=>selected.add(item.slug));
  if(selected.size!==before)notifyChange();
 }
 function handleClear(){if(disabled||destroyed||!selected.size)return;selected.clear();notifyChange();}
 function handleMore(){
  if(disabled||destroyed||visibleLimit>=matches.length)return;
  const firstNew=visibleLimit;visibleLimit+=PAGE_SIZE;
  matches.slice(firstNew,visibleLimit).forEach(item=>grid.append(cards.get(item.slug)?.card||createCard(item)));
  syncSelection();cards.get(matches[firstNew].slug)?.checkbox.focus({preventScroll:true});
 }
 function handlePhotoError(event){
  const image=event.target;if(destroyed||image.tagName!=='IMG'||!image.parentElement?.classList.contains('copy-import-photo'))return;
  image.parentElement.replaceChildren(element('span',null,'Фотография не загрузилась'));
 }
 search.addEventListener('input',handleSearch);
 grid.addEventListener('change',handleSelection);
 selectFound.addEventListener('click',handleSelectFound);
 clear.addEventListener('click',handleClear);
 more.addEventListener('click',handleMore);
 picker.addEventListener('error',handlePhotoError,true);
 renderMatches();
 return {
  setDisabled(value){if(destroyed)return;disabled=Boolean(value);syncSelection();},
  destroy(){
   if(destroyed)return;disabled=true;syncSelection();destroyed=true;
   search.removeEventListener('input',handleSearch);
   grid.removeEventListener('change',handleSelection);
   selectFound.removeEventListener('click',handleSelectFound);
   clear.removeEventListener('click',handleClear);
   more.removeEventListener('click',handleMore);
   picker.removeEventListener('error',handlePhotoError,true);
   cards.clear();
  }
 };
}
