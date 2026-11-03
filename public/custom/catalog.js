const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const plural=(n,f)=>f[n%100>=11&&n%100<=14?2:n%10===1?0:n%10>=2&&n%10<=4?1:2];
const themeButton=document.querySelector('.theme-button');
function syncTheme(){const dark=document.documentElement.dataset.theme==='dark';themeButton.textContent=dark?'☀':'◐';themeButton.setAttribute('aria-label',dark?'Включить светлую тему':'Включить тёмную тему');}
themeButton.addEventListener('click',()=>{const update=()=>{if(document.documentElement.dataset.theme==='dark')delete document.documentElement.dataset.theme;else document.documentElement.dataset.theme='dark';try{localStorage.setItem('zizi-theme',document.documentElement.dataset.theme||'light')}catch{}syncTheme();};if(document.startViewTransition&&!matchMedia('(prefers-reduced-motion:reduce)').matches)document.startViewTransition(update);else update();});syncTheme();
const returnLink=document.querySelector('[data-catalog-back]');
if(returnLink){try{const from=new URLSearchParams(location.search).get('from');if(from?.startsWith('/catalog')&&!from.startsWith('//')&&new URL(from,location.origin).pathname==='/catalog')returnLink.href=from;}catch{}}
document.querySelectorAll('[data-project-link]').forEach(a=>{a.href=new URL(a.getAttribute('href'),location.origin).pathname+'?from='+encodeURIComponent(location.pathname+location.search);});
const results=document.getElementById('catalog-results');
if(results)startCatalog().catch(()=>{results.innerHTML='<div class="empty-state"><h2>Не удалось загрузить каталог.</h2><p>Обновите страницу, чтобы попробовать снова.</p><button class="retry">Обновить страницу</button></div>';results.querySelector('.retry').onclick=()=>location.reload();document.getElementById('catalog-count').textContent='Каталог недоступен';});
async function startCatalog(){
 const response=await fetch('/custom/catalog-data.json');if(!response.ok)throw new Error('Catalogue');const data=await response.json();
 const projectMap=new Map(data.projects.map(p=>[p.slug,p])),agencyMap=new Map(data.agencies.map(a=>[a.slug,a]));
 const search=document.getElementById('catalog-search'),city=document.getElementById('catalog-city'),occasion=document.getElementById('catalog-occasion'),format=document.getElementById('catalog-format'),photos=document.getElementById('catalog-photos'),count=document.getElementById('catalog-count');
 let view='companies',scope='',timer;
 const extra=document.querySelector('.filter-options'),mobile=matchMedia('(max-width:760px)');
 const fitFilters=()=>{extra.open=!mobile.matches||Boolean(city.value||format.value||occasion.value||photos.checked);};
 mobile.addEventListener('change',fitFilters);
 function readState(){const q=new URLSearchParams(location.search);view=q.get('view')==='projects'?'projects':'companies';scope=agencyMap.has(q.get('agency'))?q.get('agency'):'';search.value=q.get('q')||'';city.value=q.get('city')||'';format.value=q.get('format')||'';occasion.value=q.get('occasion')||'';photos.checked=q.get('photos')==='1';}
 function route(){const q=new URLSearchParams();if(view==='projects')q.set('view',view);if(search.value.trim())q.set('q',search.value.trim());if(city.value)q.set('city',city.value);if(format.value)q.set('format',format.value);if(occasion.value)q.set('occasion',occasion.value);if(photos.checked)q.set('photos','1');if(scope)q.set('agency',scope);return '/catalog'+(q.size?'?'+q:'');}
 const normalize=v=>String(v).toLocaleLowerCase('ru').replace(/ё/g,'е');
 function matchingAgency(a,q){return (!scope||a.slug===scope)&&(!city.value||a.city===city.value)&&(!format.value||a.types.includes(format.value))&&(!occasion.value||a.works.some(s=>projectMap.get(s)?.occasions?.includes(occasion.value)))&&(!photos.checked||a.photoCount>0)&&(!q||normalize([a.name,...a.works.map(s=>projectMap.get(s).fullTitle)].join(' ')).includes(q));}
 function empty(){return '<div class="empty-state"><span class="empty-mark" aria-hidden="true">↗</span><h2>Ничего не найдено.</h2><p>Попробуйте другое название или уберите часть фильтров.</p><button class="clear-empty text-button">Сбросить фильтры ↺</button></div>';}
 function companyCard(a){return `<article class="company-card"><a class="work-cover ${a.cover?'':'is-empty'}" href="/agency/${a.slug}?from=${encodeURIComponent(route())}" aria-label="Открыть компанию ${esc(a.name)}">${a.cover?`<img src="${projectMap.get(a.coverWork)?.reelMobile||a.cover}" alt="Работа ${esc(a.name)}" loading="lazy" decoding="async">`:`<span class="company-monogram" aria-hidden="true">${esc(a.name.slice(0,2))}</span><span>Портфолио пока без фотографий</span>`}<span class="open-arrow" aria-hidden="true">↗</span></a><div class="card-meta"><span>${esc(a.city)}</span><span>${a.works.length} ${plural(a.works.length,['работа','работы','работ'])}</span></div><h2><a href="/agency/${a.slug}?from=${encodeURIComponent(route())}">${esc(a.name)}</a></h2><p>${a.types.slice(0,3).map(t=>esc(data.types[t])).join(' · ')}</p><div class="card-actions"><button class="ea-save-button" data-save-agency="${a.slug}">В мой проект</button></div></article>`;}
 function projectCard(p){return `<article class="work-card"><a class="work-cover ${p.hasPhotos?'':'is-empty'}" href="/work/${p.slug}?from=${encodeURIComponent(route())}" aria-label="Смотреть ${esc(p.fullTitle)}">${p.hasPhotos?`<img src="${p.reelMobile||p.thumb}" alt="${esc(p.fullTitle)}" loading="lazy" decoding="async">`:`<span class="empty-mark" aria-hidden="true">↗</span><span>Фотографии пока не добавлены</span>`}<span class="open-arrow" aria-hidden="true">↗</span></a><div class="card-meta"><span>${p.kind==='case'?'Кейс':p.kind==='collection'?'Фотоподборка':'Портфолио'}</span><span>${esc(p.year)}</span></div><h2><a href="/work/${p.slug}?from=${encodeURIComponent(route())}">${esc(p.fullTitle)}</a></h2><p class="project-facts">${[p.category,p.eventCity,p.guestLabel].filter(Boolean).map(esc).join(' · ')}</p><p><a class="company-credit" href="${p.agencyUrl}?from=${encodeURIComponent(route())}">Команда — ${esc(p.client)} ↗</a></p><div class="card-actions"><a href="/work/${p.slug}?from=${encodeURIComponent(route())}">Подробнее о проекте ↗</a><button class="ea-save-button" data-save-agency="${p.agencySlug}" data-save-work="${p.slug}">В мой проект</button></div></article>`;}
 function draw(write=true){
  const q=normalize(search.value.trim());let items;
  if(view==='companies')items=data.agencies.filter(a=>matchingAgency(a,q));
  else items=data.projects.filter(p=>(!scope||p.agencySlugs.includes(scope))&&(!city.value||p.eventCity===city.value)&&(!format.value||p.types.includes(format.value))&&(!occasion.value||p.occasions?.includes(occasion.value))&&(!photos.checked||p.hasPhotos)&&(!q||normalize(p.fullTitle+' '+p.client).includes(q)));
  results.innerHTML=items.length?items.map(view==='companies'?companyCard:projectCard).join(''):empty();
  count.textContent=items.length+' '+plural(items.length,view==='companies'?['компания','компании','компаний']:['работа','работы','работ']);
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));
  document.querySelector('.catalog-hint').textContent=scope?'Работы '+agencyMap.get(scope).name:view==='companies'?'Откройте компанию, чтобы посмотреть её проекты и сайт.':'Смотрите фотографии, формат события и роль агентства в проекте.';
  results.querySelector('.clear-empty')?.addEventListener('click',reset);
  document.getElementById('city-field-label').textContent=view==='companies'?'Город команды':'Город события';
  if(write)history.replaceState(null,'',route());
 }
 function reset(){clearTimeout(timer);search.value='';city.value='';format.value='';occasion.value='';photos.checked=false;scope='';draw();}
 search.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(draw,150);});[city,format,occasion,photos].forEach(n=>n.addEventListener('change',()=>draw()));
 document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{clearTimeout(timer);view=b.dataset.view;draw();}));
 document.getElementById('catalog-reset').addEventListener('click',reset);
 addEventListener('popstate',()=>{readState();draw(false);});readState();fitFilters();draw(false);
}
