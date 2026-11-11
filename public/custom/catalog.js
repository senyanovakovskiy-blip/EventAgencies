import {workSummary,workCardScale,workParticipation,referenceAction,workPortfolioCredits,workCardVisibleSearchText} from './work-presentation.js';
import {buildCatalogSearch,normalizeSearchText,searchTerms} from './catalog-search.js';
import {buildCatalogMatches} from './catalog-matches.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const plural=(n,f)=>f[n%100>=11&&n%100<=14?2:n%10===1?0:n%10>=2&&n%10<=4?1:2];
const themeButton=document.querySelector('.theme-button');
function syncTheme(){const dark=document.documentElement.dataset.theme==='dark';themeButton.textContent=dark?'☀':'◐';themeButton.setAttribute('aria-label',dark?'Включить светлую тему':'Включить тёмную тему');}
themeButton.addEventListener('click',()=>{const update=()=>{if(document.documentElement.dataset.theme==='dark')delete document.documentElement.dataset.theme;else document.documentElement.dataset.theme='dark';try{localStorage.setItem('zizi-theme',document.documentElement.dataset.theme||'light')}catch{}syncTheme();};if(document.startViewTransition&&!matchMedia('(prefers-reduced-motion:reduce)').matches)document.startViewTransition(update);else update();});syncTheme();
const returnLink=document.querySelector('[data-catalog-back]');
if(returnLink){try{
 const from=new URLSearchParams(location.search).get('from'),url=new URL(from,location.origin),path=url.pathname.replace(/\/$/,'');
 if(url.origin===location.origin&&['/catalog','/my-project'].includes(path)){
  returnLink.href=path+url.search+url.hash;
  if(path==='/my-project')returnLink.textContent=url.hash==='#project-handoff'?'← Вернуться к заявке':'← В мой проект';
 }
}catch{}}
document.querySelectorAll('[data-project-link]').forEach(a=>{a.href=new URL(a.getAttribute('href'),location.origin).pathname+'?from='+encodeURIComponent(location.pathname+location.search);});
const agencyProjects=document.querySelector('.agency-content>.catalog-grid');
if(agencyProjects){
 const cards=[...agencyProjects.querySelectorAll(':scope>.work-card')],withoutPhotos=cards.filter(card=>card.querySelector('.work-cover.is-empty'));
 if(withoutPhotos.length&&withoutPhotos.length<cards.length){
  const group=document.createElement('details'),summary=document.createElement('summary'),note=document.createElement('p'),grid=document.createElement('div'),count=withoutPhotos.length;
  group.className='catalog-no-photo-group';summary.textContent=`Показать ещё ${count} ${plural(count,['работу без фотографий','работы без фотографий','работ без фотографий'])}`;note.textContent='Описание и материалы доступны; фотографий в каталоге пока нет.';grid.className='catalog-grid';withoutPhotos.forEach(card=>grid.append(card));group.append(summary,note,grid);agencyProjects.append(group);
 }
}
const results=document.getElementById('catalog-results');
if(results&&matchMedia('(max-width:900px)').matches)document.querySelector('.filter-options').open=false;
if(results)startCatalog().catch(()=>{results.innerHTML='<div class="empty-state"><h2>Не удалось загрузить каталог.</h2><p>Обновите страницу, чтобы попробовать снова.</p><button class="retry">Обновить страницу</button></div>';results.querySelector('.retry').onclick=()=>location.reload();results.setAttribute('aria-busy','false');document.getElementById('catalog-count').textContent='Каталог недоступен';document.dispatchEvent(new Event('ea:catalog-error'));});
async function startCatalog(){
 const response=await fetch('/custom/catalog-data.json');if(!response.ok)throw new Error('Catalogue');const data=await response.json();
 const projectMap=new Map(data.projects.map(p=>[p.slug,p])),agencyMap=new Map(data.agencies.map(a=>[a.slug,a]));
 const searchIndex=buildCatalogSearch(data),matcher=buildCatalogMatches(data,searchIndex),agencyMatches=new Map();
 const search=document.getElementById('catalog-search'),city=document.getElementById('catalog-city'),occasion=document.getElementById('catalog-occasion'),format=document.getElementById('catalog-format'),kind=document.getElementById('catalog-kind'),participation=document.getElementById('catalog-participation'),photos=document.getElementById('catalog-photos'),count=document.getElementById('catalog-count'),toolbar=document.querySelector('.catalog-toolbar');
 const toolbarControls=document.createElement('div'),sortLabel=document.createElement('label'),sort=document.createElement('select'),projectSortLabel=document.createElement('label'),projectSort=document.createElement('select');toolbarControls.className='catalog-toolbar-controls';sortLabel.className='catalog-sort';sort.id='catalog-sort';sort.setAttribute('aria-label','Порядок компаний в каталоге');for(const [value,label]of [['default','Порядок каталога'],['works','Больше опубликованных работ'],['photos','Больше фотографий']]){const option=document.createElement('option');option.value=value;option.textContent=label;sort.append(option);}sortLabel.append('Сортировать ',sort);projectSortLabel.className='catalog-sort catalog-project-sort';projectSort.id='catalog-project-sort';projectSort.setAttribute('aria-label','Порядок проектов в каталоге');for(const [value,label]of [['default','Сначала с фото'],['recent','Новые события · фото первыми'],['oldest','Ранние события · фото первыми'],['title','Название А—Я · фото первыми']]){const option=document.createElement('option');option.value=value;option.textContent=label;projectSort.append(option);}projectSortLabel.append('Сортировать ',projectSort);toolbarControls.append(sortLabel,projectSortLabel,count);toolbar?.append(toolbarControls);
 const inspirationLabels={wedding:'свадьбы',birthday:'дня рождения или юбилея',product_launch:'запуска продукта',opening:'открытия площадки',new_year:'новогоднего вечера',exhibition:'выставки',sports_day:'спортивного дня'};
 let view='companies',scope='',timer,inspiration='';
 const cityOptions=new Set([...data.agencies.map(a=>a.city).filter(Boolean),...data.projects.map(p=>p.eventCity).filter(Boolean)]);
 const cityByView={companies:'',projects:''};
 const extra=document.querySelector('.filter-options'),mobile=matchMedia('(max-width:900px)');
 const fitFilters=()=>{extra.open=!mobile.matches||Boolean(city.value||format.value||kind.value||occasion.value||participation.checked||photos.checked);};
 mobile.addEventListener('change',fitFilters);
  function readState(){const q=new URLSearchParams(location.search);view=q.get('view')==='projects'?'projects':'companies';scope=agencyMap.has(q.get('agency'))?q.get('agency'):'';search.value=q.get('q')||'';const requestedInspiration=q.get('inspiration');inspiration=Object.hasOwn(inspirationLabels,requestedInspiration)?requestedInspiration:'';const legacy=q.get('city')||'',valid=value=>cityOptions.has(value)?value:'';cityByView.companies=valid(q.get('companyCity')??(view==='companies'?legacy:''));cityByView.projects=valid(q.get('eventCity')??(view==='projects'?legacy:''));city.value=cityByView[view];format.value=q.get('format')||'';kind.value=q.get('kind')||'';occasion.value=q.get('occasion')||'';participation.checked=q.get('participation')==='1';photos.checked=q.get('photos')==='1';sort.value=['works','photos'].includes(q.get('sort'))?q.get('sort'):'default';projectSort.value=['recent','oldest','title'].includes(q.get('projectSort'))?q.get('projectSort'):'default';}
 function route(){cityByView[view]=city.value;const q=new URLSearchParams();if(view==='projects')q.set('view',view);if(search.value.trim())q.set('q',search.value.trim());if(cityByView.companies)q.set('companyCity',cityByView.companies);if(cityByView.projects)q.set('eventCity',cityByView.projects);if(format.value)q.set('format',format.value);if(kind.value)q.set('kind',kind.value);if(occasion.value)q.set('occasion',occasion.value);if(inspiration)q.set('inspiration',inspiration);if(participation.checked)q.set('participation','1');if(photos.checked)q.set('photos','1');if(sort.value!=='default')q.set('sort',sort.value);if(projectSort.value!=='default')q.set('projectSort',projectSort.value);if(scope)q.set('agency',scope);return '/catalog'+(q.size?'?'+q:'');}
 function projectSortExplanation(mode,photosOnly){if(mode==='recent')return photosOnly?'По году события: новые раньше, год без даты в конце.':'Фото сначала; внутри групп — новые события раньше, неизвестный год в конце.';if(mode==='oldest')return photosOnly?'По году события: ранние раньше, год без даты в конце.':'Фото сначала; внутри групп — ранние события раньше, неизвестный год в конце.';if(mode==='title')return photosOnly?'Внутри списка — по названию А—Я.':'Фото сначала; внутри каждой группы — по названию А—Я.';return photosOnly?'Больше фотографий — выше.':'Фото первыми, затем больше фотографий; без фото — ниже.';}

 function searchContext(kind,slug,terms,visibleText){
  const visible=normalizeSearchText(visibleText),missing=terms.filter(term=>!visible.includes(term));
  if(!missing.length)return '';
  const {detail}=kind==='agency'?searchIndex.searchAgency(slug,missing):searchIndex.searchWork(slug,missing);
  if(!detail)return '';
  const source=Object.hasOwn(detail,'workTitle')?`<span>В работе «${esc(detail.workTitle||'Без названия')}»</span>`:'';
  return `<dl class="catalog-search-context"><dt>${source}${esc(detail.label)}</dt><dd>${esc(detail.text)}</dd></dl>`;
 }
  function empty(){
   const actions=[],terms=searchTerms(search.value);
   if(terms.length>1)for(const term of terms.slice(0,3))actions.push(`<button type="button" data-relax-filter="query-term" data-query-term="${esc(term)}">Искать без «${esc(term)}»</button>`);
   if(search.value.trim())actions.push('<button type="button" data-relax-filter="query">Убрать поисковый запрос</button>');
   if(city.value)actions.push(`<button type="button" data-relax-filter="city">Любой ${view==='companies'?'город команды':'город события'}</button>`);
   if(format.value)actions.push(`<button type="button" data-relax-filter="format">Без фильтра «${esc(format.selectedOptions[0]?.textContent||'формат')}»</button>`);
   if(kind.value)actions.push(`<button type="button" data-relax-filter="kind">Без фильтра «${esc(kind.selectedOptions[0]?.textContent||'типа работы')}»</button>`);
   if(participation.checked)actions.push('<button type="button" data-relax-filter="participation">Показать и работы без пояснения команды</button>');
   if(occasion.value)actions.push(`<button type="button" data-relax-filter="occasion">Без фильтра «${esc(occasion.selectedOptions[0]?.textContent||'повод')}»</button>`);
   if(photos.checked)actions.push('<button type="button" data-relax-filter="photos">Показать и работы без фотографий</button>');
   if(scope)actions.push('<button type="button" data-relax-filter="scope">Показать весь каталог</button>');
   const options=actions.length?`<p>Чтобы расширить выбор, попробуйте ослабить одно условие:</p><div class="empty-filter-actions">${actions.join('')}</div>`:'<p>Попробуйте другое название или откройте каталог целиком.</p>';
   return `<div class="empty-state"><span class="empty-mark" aria-hidden="true">↗</span><h2>Ничего не найдено.</h2>${options}<button class="clear-empty text-button" type="button">Сбросить все условия ↺</button></div>`;
  }
 function companyCard(a,terms){
  const lead=a.presentation?.lead||a.description||'',match=agencyMatches.get(a.slug),evidence=match?.contextual?(match.works.find(p=>p.hasPhotos)||match.works[0]):null,workCount=match?.contextual?match.works.length:a.works.length;
  const workCountLabel=match?.contextual?plural(workCount,['подходящая работа','подходящие работы','подходящих работ'])+' по условиям':workCount+' '+plural(workCount,['работа','работы','работ']);
  const coverWork=evidence||projectMap.get(a.coverWork),cover=evidence?(evidence.hasPhotos?evidence.preview||evidence.reelMobile||evidence.image:''):coverWork?.preview||coverWork?.reelMobile||a.cover;
  const agencyUrl='/agency/'+a.slug+'?from='+encodeURIComponent(route()),workUrl=evidence?'/work/'+evidence.slug+'?from='+encodeURIComponent(route()):'';
  return `<article class="company-card" data-catalog-key="agency:${a.slug}">
   <a class="work-cover ${cover?'':'is-empty'}" href="${agencyUrl}" aria-label="Открыть компанию ${esc(a.name)}">${cover?`<img src="${esc(cover)}" srcset="${esc(coverWork?.previewSrcSet||'')}" sizes="(max-width:600px) 100vw, (max-width:900px) 50vw, 40vw" width="${coverWork?.imageWidth||1500}" height="${coverWork?.imageHeight||1000}" alt="${esc(coverWork?.fullTitle||'Работа '+a.name)}" loading="lazy" decoding="async">`:`<span class="company-monogram" aria-hidden="true">${esc(a.name.slice(0,2))}</span><span>${evidence?'У этой работы пока нет фотографий':'Портфолио пока без фотографий'}</span>`}<span class="open-arrow" aria-hidden="true">↗</span></a>
   <div class="card-meta"><span>${esc(a.city)}</span><span>${workCountLabel}</span><span title="Фотографии в работах агентства, опубликованных в этом каталоге">${Number(a.photoCount||0).toLocaleString('ru-RU')} фото</span></div>
   <h2><a href="${agencyUrl}">${esc(a.name)}</a></h2><p class="company-lead">${esc(lead)}</p>
   <p>${a.types.slice(0,3).map(t=>esc(data.types[t])).join(' · ')}</p>
   ${evidence?`<div class="catalog-work-evidence"><span>${match.queryInWork?'Работа к вашему запросу':'Работа по выбранным условиям'}</span><a href="${workUrl}">${esc(evidence.fullTitle)} ↗</a><p>${[evidence.format,evidence.year&&evidence.year!=='—'?evidence.year:''].filter(Boolean).map(esc).join(' · ')}</p>${workParticipation(evidence,{includeSummary:true})}</div>`:searchContext('agency',a.slug,terms,[a.name,lead].join(' '))}
   <div class="card-actions"><button class="ea-save-button" data-save-agency="${a.slug}" ${evidence?`data-save-work="${evidence.slug}" aria-label="Добавить ${esc(a.name)} с работой «${esc(evidence.fullTitle)}»"`:''}>${evidence?'В проект с этой работой':'В мой проект'}</button></div>
  </article>`;
 }
 function projectCard(p,terms){const lead=workSummary(p),credits=workPortfolioCredits(p,agencyMap,route());return `<article class="work-card" data-catalog-key="work:${p.slug}"><a class="work-cover ${p.hasPhotos?'':'is-empty'}" href="/work/${p.slug}?from=${encodeURIComponent(route())}" aria-label="Смотреть ${esc(p.fullTitle)}">${p.hasPhotos?`<img src="${p.preview||p.reelMobile||p.thumb}" srcset="${esc(p.previewSrcSet||'')}" sizes="(max-width:600px) 100vw, (max-width:900px) 50vw, 40vw" width="${p.imageWidth||1500}" height="${p.imageHeight||1000}" alt="${esc(p.fullTitle)}" loading="lazy" decoding="async">`:`<span class="empty-mark" aria-hidden="true">↗</span><span>Фотографии пока не добавлены</span>`}<span class="open-arrow" aria-hidden="true">↗</span></a><div class="card-meta"><span>${p.kind==='case'?'Кейс':p.kind==='collection'?'Фотоподборка':'Портфолио'}${p.hasPhotos&&Number(p.photoCount)>0?' · '+Number(p.photoCount).toLocaleString('ru-RU')+' фото':''}</span><span>${esc(p.year)}</span></div><h2><a href="/work/${p.slug}?from=${encodeURIComponent(route())}">${esc(p.fullTitle)}</a></h2><p class="work-summary">${esc(lead)}</p>${workParticipation(p)}<p class="project-facts">${[p.format||p.category,p.eventCity,workCardScale(p)].filter(Boolean).map(esc).join(' · ')}</p>${credits.links?`<p>В портфолио ${credits.links}</p>`:''}${searchContext('work',p.slug,terms,workCardVisibleSearchText(p,credits.agencies))}<div class="card-actions"><a href="/work/${p.slug}?from=${encodeURIComponent(route())}">Подробнее о проекте ↗</a>${referenceAction(p)}${credits.agencies.map(agency=>`<button class="ea-save-button" data-agency-label="true" data-agency-name="${esc(agency.name)}" data-save-agency="${agency.slug}" data-save-work="${p.slug}">Добавить команду с этой работой</button>`).join('')}</div></article>`;}
 function projectResultsMarkup(items,terms){
  const photoWorks=items.filter(item=>item.hasPhotos),textWorks=items.filter(item=>!item.hasPhotos),photoCards=photoWorks.map(item=>projectCard(item,terms)).join(''),textCards=textWorks.map(item=>projectCard(item,terms)).join('');
  if(!photoWorks.length||!textWorks.length)return photoCards+textCards;
  const count=textWorks.length,label=plural(count,['работа без фотографий','работы без фотографий','работ без фотографий']);
  return photoCards+`<details class="catalog-no-photo-group"><summary>Показать ещё ${count} ${label}</summary><p>Эти работы доступны в каталоге без фотографий.</p><div class="catalog-grid">${textCards}</div></details>`;
 }
 function draw(write=true){
  const terms=searchTerms(search.value),filters={query:terms,city:city.value,format:format.value,kind:kind.value,occasion:occasion.value,participation:participation.checked,photos:photos.checked,scope};let items;
   if(view==='companies'){
    items=data.agencies.filter(a=>{const match=matcher.agency(a,filters);agencyMatches.set(a.slug,match);return match.matches;});
    if(sort.value==='works')items.sort((a,b)=>(b.works?.length||0)-(a.works?.length||0)||a.name.localeCompare(b.name,'ru'));
    else if(sort.value==='photos')items.sort((a,b)=>(b.photoCount||0)-(a.photoCount||0)||(b.works?.length||0)-(a.works?.length||0)||a.name.localeCompare(b.name,'ru'));
   }
   else{items=data.projects.filter(p=>!p.duplicateOf&&matcher.work(p,filters));const yearOf=work=>Number(String(work.year||'').match(/\d{4}/)?.[0])||0,photoTie=(first,second)=>Number(second.hasPhotos)-Number(first.hasPhotos)||(second.photoCount||0)-(first.photoCount||0);if(projectSort.value==='title')items.sort((first,second)=>first.fullTitle.localeCompare(second.fullTitle,'ru')||photoTie(first,second));else if(projectSort.value==='recent')items.sort((first,second)=>{const a=yearOf(first),b=yearOf(second);return a&&b?b-a||photoTie(first,second):a?-1:b?1:photoTie(first,second);});else if(projectSort.value==='oldest')items.sort((first,second)=>{const a=yearOf(first),b=yearOf(second);return a&&b?a-b||photoTie(first,second):a?-1:b?1:photoTie(first,second);});else items.sort(photoTie);}
   const cards=view==='companies'?items.map(item=>companyCard(item,terms)).join(''):projectResultsMarkup(items,terms);
   results.innerHTML=items.length?cards:empty();
  results.querySelectorAll('.work-cover:not(.is-empty)').forEach(cover=>{
   const photo=cover.querySelector('img');if(!photo)return;
   const ambient=document.createElement('span');ambient.className='catalog-photo-ambient';ambient.setAttribute('aria-hidden','true');
   const glow=photo.cloneNode(false);glow.alt='';ambient.append(glow);cover.prepend(ambient);
   cover.classList.add('has-photo-depth');
  });
  results.setAttribute('aria-busy','false');count.textContent=items.length+' '+plural(items.length,view==='companies'?['компания','компании','компаний']:['работа','работы','работ']);
   sortLabel.hidden=view!=='companies';projectSortLabel.hidden=view!=='projects';
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));
   document.querySelector('.catalog-hint').textContent=[view==='projects'&&inspiration?'Работы для '+inspirationLabels[inspiration]+': примеры близкого направления, а не подтверждение точного аналога.':'',scope?'Работы '+agencyMap.get(scope).name:'',view==='companies'&&(filters.format||filters.kind||filters.occasion||filters.participation||filters.photos)?'Показываем команды, у которых есть работы, подходящие под выбранные условия.':'',view==='projects'&&filters.participation?'У каждой показанной работы есть отдельное пояснение об участии команды.':'',view==='projects'?(filters.photos?'Показываем только работы с фотографиями. ':'Работы без фотографий остаются ниже в свёрнутой группе. ')+projectSortExplanation(projectSort.value,filters.photos):''].filter(Boolean).join(' · ');
  results.querySelector('.clear-empty')?.addEventListener('click',reset);
   results.querySelector('.empty-filter-actions')?.addEventListener('click',event=>{
    const button=event.target.closest('[data-relax-filter]');if(!button)return;
    const action=button.dataset.relaxFilter;
    if(action==='query-term')search.value=searchTerms(search.value).filter(term=>term!==button.dataset.queryTerm).join(' ');
    else if(action==='query')search.value='';
    else if(action==='city'){city.value='';cityByView[view]='';}
    else if(action==='format')format.value='';
    else if(action==='kind')kind.value='';
    else if(action==='participation')participation.checked=false;
    else if(action==='occasion'){occasion.value='';inspiration='';}
    else if(action==='photos')photos.checked=false;
    else if(action==='scope')scope='';
    fitFilters();draw();results.focus({preventScroll:true});
   });
  document.getElementById('city-field-label').textContent=view==='companies'?'Город команды':'Город события';
  if(write)history.replaceState(history.state,'',route());
  document.dispatchEvent(new CustomEvent('ea:catalog-render',{detail:{write}}));
 }
 function reset(){clearTimeout(timer);search.value='';city.value='';cityByView.companies='';cityByView.projects='';format.value='';kind.value='';occasion.value='';participation.checked=false;photos.checked=false;sort.value='default';projectSort.value='default';scope='';inspiration='';draw();}
 occasion.addEventListener('change',()=>{inspiration='';draw();});
 search.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>{timer=null;draw();},150);});[city,format,kind,participation,photos,sort,projectSort].forEach(n=>n.addEventListener('change',()=>draw()));
 document.addEventListener('ea:catalog-flush',()=>{if(timer){clearTimeout(timer);timer=null;draw();}});
 document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{clearTimeout(timer);cityByView[view]=city.value;view=b.dataset.view;city.value=cityByView[view];draw();}));
 document.getElementById('catalog-reset').addEventListener('click',reset);
 addEventListener('popstate',()=>{readState();draw(false);});readState();fitFilters();draw(false);
}
