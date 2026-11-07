import {workSummary,referenceAction} from './work-presentation.js';
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
const results=document.getElementById('catalog-results');
if(results&&matchMedia('(max-width:900px)').matches)document.querySelector('.filter-options').open=false;
if(results)startCatalog().catch(()=>{results.innerHTML='<div class="empty-state"><h2>Не удалось загрузить каталог.</h2><p>Обновите страницу, чтобы попробовать снова.</p><button class="retry">Обновить страницу</button></div>';results.querySelector('.retry').onclick=()=>location.reload();results.setAttribute('aria-busy','false');document.getElementById('catalog-count').textContent='Каталог недоступен';document.dispatchEvent(new Event('ea:catalog-error'));});
async function startCatalog(){
 const response=await fetch('/custom/catalog-data.json');if(!response.ok)throw new Error('Catalogue');const data=await response.json();
 const projectMap=new Map(data.projects.map(p=>[p.slug,p])),agencyMap=new Map(data.agencies.map(a=>[a.slug,a]));
 const searchIndex=buildCatalogSearch(data),matcher=buildCatalogMatches(data,searchIndex),agencyMatches=new Map();
 const search=document.getElementById('catalog-search'),city=document.getElementById('catalog-city'),occasion=document.getElementById('catalog-occasion'),format=document.getElementById('catalog-format'),photos=document.getElementById('catalog-photos'),count=document.getElementById('catalog-count');
 let view='companies',scope='',timer;
 const extra=document.querySelector('.filter-options'),mobile=matchMedia('(max-width:900px)');
 const fitFilters=()=>{extra.open=!mobile.matches||Boolean(city.value||format.value||occasion.value||photos.checked);};
 mobile.addEventListener('change',fitFilters);
 function readState(){const q=new URLSearchParams(location.search);view=q.get('view')==='projects'?'projects':'companies';scope=agencyMap.has(q.get('agency'))?q.get('agency'):'';search.value=q.get('q')||'';city.value=q.get('city')||'';format.value=q.get('format')||'';occasion.value=q.get('occasion')||'';photos.checked=q.get('photos')==='1';}
 function route(){const q=new URLSearchParams();if(view==='projects')q.set('view',view);if(search.value.trim())q.set('q',search.value.trim());if(city.value)q.set('city',city.value);if(format.value)q.set('format',format.value);if(occasion.value)q.set('occasion',occasion.value);if(photos.checked)q.set('photos','1');if(scope)q.set('agency',scope);return '/catalog'+(q.size?'?'+q:'');}

 function searchContext(kind,slug,terms,visibleText){
  const visible=normalizeSearchText(visibleText),missing=terms.filter(term=>!visible.includes(term));
  if(!missing.length)return '';
  const {detail}=kind==='agency'?searchIndex.searchAgency(slug,missing):searchIndex.searchWork(slug,missing);
  if(!detail)return '';
  const source=Object.hasOwn(detail,'workTitle')?`<span>В работе «${esc(detail.workTitle||'Без названия')}»</span>`:'';
  return `<dl class="catalog-search-context"><dt>${source}${esc(detail.label)}</dt><dd>${esc(detail.text)}</dd></dl>`;
 }
 function empty(){return '<div class="empty-state"><span class="empty-mark" aria-hidden="true">↗</span><h2>Ничего не найдено.</h2><p>Попробуйте другое название или уберите часть фильтров.</p><button class="clear-empty text-button">Сбросить фильтры ↺</button></div>';}
 function companyCard(a,terms){
  const lead=a.presentation?.lead||a.description||'',match=agencyMatches.get(a.slug),evidence=match?.contextual?(match.works.find(p=>p.hasPhotos)||match.works[0]):null;
  const coverWork=evidence||projectMap.get(a.coverWork),cover=evidence?(evidence.hasPhotos?evidence.preview||evidence.reelMobile||evidence.image:''):coverWork?.preview||coverWork?.reelMobile||a.cover;
  const agencyUrl='/agency/'+a.slug+'?from='+encodeURIComponent(route()),workUrl=evidence?'/work/'+evidence.slug+'?from='+encodeURIComponent(route()):'';
  return `<article class="company-card" data-catalog-key="agency:${a.slug}">
   <a class="work-cover ${cover?'':'is-empty'}" href="${agencyUrl}" aria-label="Открыть компанию ${esc(a.name)}">${cover?`<img src="${esc(cover)}" srcset="${esc(coverWork?.previewSrcSet||'')}" sizes="(max-width:600px) 100vw, (max-width:900px) 50vw, 40vw" width="${coverWork?.imageWidth||1500}" height="${coverWork?.imageHeight||1000}" alt="${esc(coverWork?.fullTitle||'Работа '+a.name)}" loading="lazy" decoding="async">`:`<span class="company-monogram" aria-hidden="true">${esc(a.name.slice(0,2))}</span><span>${evidence?'У этой работы пока нет фотографий':'Портфолио пока без фотографий'}</span>`}<span class="open-arrow" aria-hidden="true">↗</span></a>
   <div class="card-meta"><span>${esc(a.city)}</span><span>${a.works.length} ${plural(a.works.length,['работа','работы','работ'])}</span></div>
   <h2><a href="${agencyUrl}">${esc(a.name)}</a></h2><p class="company-lead">${esc(lead)}</p>
   <p>${a.types.slice(0,3).map(t=>esc(data.types[t])).join(' · ')}</p>
   ${evidence?`<div class="catalog-work-evidence"><span>Работа к вашему запросу</span><a href="${workUrl}">${esc(evidence.fullTitle)} ↗</a><p>${[evidence.format,evidence.year&&evidence.year!=='—'?evidence.year:''].filter(Boolean).map(esc).join(' · ')}</p></div>`:searchContext('agency',a.slug,terms,[a.name,lead].join(' '))}
   <div class="card-actions"><button class="ea-save-button" data-save-agency="${a.slug}" ${evidence?`data-save-work="${evidence.slug}" aria-label="Добавить ${esc(a.name)} с работой «${esc(evidence.fullTitle)}»"`:''}>${evidence?'В проект с этой работой':'В мой проект'}</button></div>
  </article>`;
 }
 function projectCard(p,terms){const lead=workSummary(p);return `<article class="work-card" data-catalog-key="work:${p.slug}"><a class="work-cover ${p.hasPhotos?'':'is-empty'}" href="/work/${p.slug}?from=${encodeURIComponent(route())}" aria-label="Смотреть ${esc(p.fullTitle)}">${p.hasPhotos?`<img src="${p.preview||p.reelMobile||p.thumb}" srcset="${esc(p.previewSrcSet||'')}" sizes="(max-width:600px) 100vw, (max-width:900px) 50vw, 40vw" width="${p.imageWidth||1500}" height="${p.imageHeight||1000}" alt="${esc(p.fullTitle)}" loading="lazy" decoding="async">`:`<span class="empty-mark" aria-hidden="true">↗</span><span>Фотографии пока не добавлены</span>`}<span class="open-arrow" aria-hidden="true">↗</span></a><div class="card-meta"><span>${p.kind==='case'?'Кейс':p.kind==='collection'?'Фотоподборка':'Портфолио'}</span><span>${esc(p.year)}</span></div><h2><a href="/work/${p.slug}?from=${encodeURIComponent(route())}">${esc(p.fullTitle)}</a></h2><p class="work-summary">${esc(lead)}</p><p class="project-facts">${[p.category,p.eventCity].filter(Boolean).map(esc).join(' · ')}</p><p><a class="company-credit" href="${p.agencyUrl}?from=${encodeURIComponent(route())}">В портфолио ${esc(p.client)} ↗</a></p>${searchContext('work',p.slug,terms,[p.fullTitle,lead,p.client].join(' '))}<div class="card-actions"><a href="/work/${p.slug}?from=${encodeURIComponent(route())}">Подробнее о проекте ↗</a>${referenceAction(p)}${(p.agencySlugs?.length?p.agencySlugs:[p.agencySlug]).map(slug=>`<button class="ea-save-button" data-agency-label="true" data-agency-name="${esc(agencyMap.get(slug)?.name||p.client)}" data-save-agency="${slug}" data-save-work="${p.slug}">Добавить команду с этой работой</button>`).join('')}</div></article>`;}
 function draw(write=true){
  const terms=searchTerms(search.value),filters={query:terms,city:city.value,format:format.value,occasion:occasion.value,photos:photos.checked,scope};let items;
  if(view==='companies')items=data.agencies.filter(a=>{const match=matcher.agency(a,filters);agencyMatches.set(a.slug,match);return match.matches;});
  else items=data.projects.filter(p=>matcher.work(p,filters));
  results.innerHTML=items.length?items.map(item=>view==='companies'?companyCard(item,terms):projectCard(item,terms)).join(''):empty();
  results.querySelectorAll('.work-cover:not(.is-empty)').forEach(cover=>{
   const photo=cover.querySelector('img');if(!photo)return;
   const ambient=document.createElement('span');ambient.className='catalog-photo-ambient';ambient.setAttribute('aria-hidden','true');
   const glow=photo.cloneNode(false);glow.alt='';ambient.append(glow);cover.prepend(ambient);
   cover.classList.add('has-photo-depth');
  });
  results.setAttribute('aria-busy','false');count.textContent=items.length+' '+plural(items.length,view==='companies'?['компания','компании','компаний']:['работа','работы','работ']);
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));
  document.querySelector('.catalog-hint').textContent=[scope?'Работы '+agencyMap.get(scope).name:'',view==='companies'&&(filters.format||filters.occasion||filters.photos)?'Показываем команды, у которых одна работа соответствует выбранным условиям.':''].filter(Boolean).join(' · ');
  results.querySelector('.clear-empty')?.addEventListener('click',reset);
  document.getElementById('city-field-label').textContent=view==='companies'?'Город команды':'Город события';
  if(write)history.replaceState(history.state,'',route());
  document.dispatchEvent(new CustomEvent('ea:catalog-render',{detail:{write}}));
 }
 function reset(){clearTimeout(timer);search.value='';city.value='';format.value='';occasion.value='';photos.checked=false;scope='';draw();}
 search.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>{timer=null;draw();},150);});[city,format,occasion,photos].forEach(n=>n.addEventListener('change',()=>draw()));
 document.addEventListener('ea:catalog-flush',()=>{if(timer){clearTimeout(timer);timer=null;draw();}});
 document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{clearTimeout(timer);view=b.dataset.view;draw();}));
 document.getElementById('catalog-reset').addEventListener('click',reset);
 addEventListener('popstate',()=>{readState();draw(false);});readState();fitFilters();draw(false);
}
