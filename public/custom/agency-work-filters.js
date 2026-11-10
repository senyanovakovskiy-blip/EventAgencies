import {saveWorkReferences} from './work-references.js';
 const content=document.querySelector('.agency-content'),grid=content?.querySelector('.catalog-grid');
if(content&&grid){
 const cards=[...content.querySelectorAll('.catalog-grid > .work-card')];
 if(cards.length>=4){
  const kindLabels={case:'Кейсы',collection:'Фотоподборки',portfolio:'Работы в портфолио'};
  const rows=cards.map((card,index)=>{
   const meta=card.querySelector('.card-meta span')?.textContent?.trim()||'';
   const kind=meta.startsWith('Кейс')?'case':meta.startsWith('Фотоподборка')?'collection':meta.startsWith('Портфолио')||meta.startsWith('Работа в портфолио')?'portfolio':'';
   const title=card.querySelector('h3')?.textContent?.trim()||'',yearText=card.querySelector('.card-meta span:last-child')?.textContent||'',year=Number(yearText.match(/\b(?:19|20|21)\d{2}\b/)?.[0]||0);
   return {card,parent:card.parentElement,index,kind,year,title,hasPhoto:Boolean(card.querySelector('.work-cover img')),text:[title,card.querySelector('.work-summary')?.textContent].filter(Boolean).join(' ').toLocaleLowerCase('ru')};
  });
  const kinds=[...new Set(rows.map(row=>row.kind).filter(Boolean))],hasPhotoMix=rows.some(row=>row.hasPhoto)&&rows.some(row=>!row.hasPhoto);
  const agencySlug=content.closest('.agency-layout')?.dataset.agency||location.pathname.split('/').filter(Boolean).at(-1)||'agency',storageKey='ea:agency-work-filters:v1:'+agencySlug;
  const toolbar=document.createElement('section');toolbar.className='agency-work-filters';toolbar.setAttribute('aria-label','Поиск по работам агентства');
  const searchLabel=document.createElement('label');searchLabel.className='agency-work-search';searchLabel.textContent='Найти работу';
  const search=document.createElement('input');search.type='search';search.placeholder='Название или описание';search.setAttribute('aria-label','Найти работу по названию или описанию');searchLabel.append(search);toolbar.append(searchLabel);
  let kindSelect=null;
  if(kinds.length>1){const kindLabel=document.createElement('label');kindLabel.className='agency-work-kind';kindLabel.textContent='Тип работы';kindSelect=document.createElement('select');kindSelect.setAttribute('aria-label','Фильтр по типу работы');const all=document.createElement('option');all.value='';all.textContent='Все типы';kindSelect.append(all);for(const kind of kinds){const option=document.createElement('option');option.value=kind;option.textContent=kindLabels[kind]||kind;kindSelect.append(option);}kindLabel.append(kindSelect);toolbar.append(kindLabel);}
  const sortLabel=document.createElement('label');sortLabel.className='agency-work-sort';sortLabel.textContent='Порядок';const sortSelect=document.createElement('select');sortSelect.setAttribute('aria-label','Сортировка работ');for(const [value,label] of [['default','Как в профиле'],['recent','Сначала новые'],['oldest','Сначала старые'],['title','По названию']]){const option=document.createElement('option');option.value=value;option.textContent=label;sortSelect.append(option);}sortLabel.append(sortSelect);toolbar.append(sortLabel);
  let photos=null;
  if(hasPhotoMix){const label=document.createElement('label');label.className='agency-work-photos';photos=document.createElement('input');photos.type='checkbox';label.append(photos,document.createTextNode('Только с фотографиями'));toolbar.append(label);}
  const reset=document.createElement('button');reset.type='button';reset.className='agency-work-reset';reset.textContent='Сбросить';
  const actions=document.createElement('div');actions.className='agency-work-filter-actions';toolbar.append(actions);actions.append(reset);
  const saveExamples=document.createElement('button');saveExamples.type='button';saveExamples.className='reference-button agency-work-save-examples';saveExamples.textContent='Сохранить показанные как примеры';saveExamples.hidden=true;actions.append(saveExamples);
  const share=document.createElement('button');share.type='button';share.className='reference-button agency-work-share';share.textContent='Поделиться подборкой';share.hidden=true;actions.append(share);
  const shareStatus=document.createElement('p');shareStatus.className='agency-work-share-status';shareStatus.setAttribute('role','status');shareStatus.setAttribute('aria-live','polite');shareStatus.hidden=true;actions.append(shareStatus);
  const shareUrl=document.createElement('input');shareUrl.type='url';shareUrl.className='agency-work-share-url';shareUrl.readOnly=true;shareUrl.setAttribute('aria-label','Ссылка на отфильтрованные работы');shareUrl.hidden=true;actions.append(shareUrl);
  const count=document.createElement('p');count.className='agency-work-count';count.setAttribute('role','status');count.setAttribute('aria-live','polite');count.setAttribute('aria-atomic','true');toolbar.append(count);
  const empty=document.createElement('p');empty.className='agency-work-empty';empty.hidden=true;empty.textContent='Работы по таким условиям не найдены. Измените запрос или сбросьте фильтры.';
  grid.before(toolbar,empty);
  function update(){
   const query=search.value.trim().toLocaleLowerCase('ru'),kind=kindSelect?.value||'',photosOnly=Boolean(photos?.checked),order=sortSelect.value,filtered=Boolean(query||kind||photosOnly||order!=='default');let visible=0;
   const sorted=[...rows].sort((a,b)=>order==='title'?a.title.localeCompare(b.title,'ru'):order==='recent'?(b.year||-1)-(a.year||-1)||a.index-b.index:order==='oldest'?(a.year||Infinity)-(b.year||Infinity)||a.index-b.index:a.index-b.index);
   for(const row of sorted){const show=(!query||row.text.includes(query))&&(!kind||row.kind===kind)&&(!photosOnly||row.hasPhoto);row.card.hidden=!show;if(show)visible++;row.parent.append(row.card);}
   const noPhotoGroup=content.querySelector('details.catalog-no-photo-group'),textOnly=rows.filter(row=>!row.hasPhoto).length;if(noPhotoGroup)noPhotoGroup.open=filtered&&rows.some(row=>!row.hasPhoto&&!row.card.hidden);
   count.textContent=filtered?`Показано ${visible} из ${rows.length} работ`:`В профиле ${rows.length} работ${textOnly?` · без фото ${textOnly} (свернуты)`:''}`;
   empty.hidden=visible>0;
   reset.hidden=!filtered;saveExamples.hidden=!filtered||visible===0;saveExamples.textContent=`Сохранить показанные как примеры (${visible})`;share.hidden=!filtered;shareStatus.textContent='';shareStatus.hidden=true;shareUrl.hidden=true;
   try{if(query||kind||photosOnly||order!=='default')sessionStorage.setItem(storageKey,JSON.stringify({query,kind,photosOnly,order}));else sessionStorage.removeItem(storageKey);}catch{}
  }
  const params=new URLSearchParams(location.search),sharedKeys=['eaWorkQ','eaWorkKind','eaWorkOrder','eaWorkPhotos'],sharedState=sharedKeys.some(key=>params.has(key));
  try{const saved=sharedState?{query:params.get('eaWorkQ')||'',kind:params.get('eaWorkKind')||'',order:params.get('eaWorkOrder')||'default',photosOnly:params.get('eaWorkPhotos')==='1'}:JSON.parse(sessionStorage.getItem(storageKey)||'null');if(saved&&typeof saved==='object'){if(typeof saved.query==='string')search.value=saved.query.slice(0,180);if(kindSelect&&kinds.includes(saved.kind))kindSelect.value=saved.kind;if(['default','recent','oldest','title'].includes(saved.order))sortSelect.value=saved.order;if(photos&&typeof saved.photosOnly==='boolean')photos.checked=saved.photosOnly;}}catch{}
  function visibleWorkSlugs(){return rows.filter(row=>!row.card.hidden).map(row=>{const href=row.card.querySelector('a[href^="/work/"]')?.getAttribute('href');if(!href)return '';try{return decodeURIComponent(new URL(href,location.origin).pathname.split('/').filter(Boolean).at(-1)||'');}catch{return '';}}).filter(slug=>/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug));}
  saveExamples.addEventListener('click',async()=>{const slugs=visibleWorkSlugs();if(!slugs.length)return;saveExamples.disabled=true;try{const result=await saveWorkReferences(slugs);shareStatus.textContent=result.message;shareStatus.hidden=false;}finally{saveExamples.disabled=false;}});
  share.addEventListener('click',async()=>{
   const url=new URL(location.href);for(const key of sharedKeys)url.searchParams.delete(key);
   const query=search.value.trim(),kind=kindSelect?.value||'',order=sortSelect.value;if(query)url.searchParams.set('eaWorkQ',query);if(kind)url.searchParams.set('eaWorkKind',kind);if(order!=='default')url.searchParams.set('eaWorkOrder',order);if(photos?.checked)url.searchParams.set('eaWorkPhotos','1');
   const title=content.closest('.agency-layout')?.querySelector('h1')?.textContent?.trim()||'Работы агентства';share.disabled=true;
   try{if(typeof navigator.share==='function'){await navigator.share({title,text:'Подборка работ — EventAgencies 101',url:url.href});shareStatus.textContent='Подборка передана через меню устройства.';shareStatus.hidden=false;return;}await navigator.clipboard.writeText(url.href);shareStatus.textContent='Ссылка на эту подборку скопирована.';shareStatus.hidden=false;}
   catch(error){if(error?.name==='AbortError')return;shareUrl.value=url.href;shareUrl.hidden=false;shareUrl.focus({preventScroll:true});shareUrl.select();shareStatus.textContent='Не удалось скопировать автоматически. Ссылка выделена в поле — скопируйте её.';shareStatus.hidden=false;}
   finally{share.disabled=false;}
  });
  search.addEventListener('input',update);kindSelect?.addEventListener('change',update);sortSelect.addEventListener('change',update);photos?.addEventListener('change',update);
  reset.addEventListener('click',()=>{search.value='';if(kindSelect)kindSelect.value='';sortSelect.value='default';if(photos)photos.checked=false;update();search.focus({preventScroll:true});});
  update();
 }
}
