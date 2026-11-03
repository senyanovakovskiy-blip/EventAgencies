import {readDraft,workNoteKey} from './project-store.js';
import {escapeHtml as esc} from './work-presentation.js';
export const REFERENCE_KEY='eventagencies-work-references-v1';
export function normalizeReferences(value){return Array.isArray(value)?[...new Set(value.filter(s=>typeof s==='string'&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s)))].slice(0,200):[];}
let saved=[];try{saved=normalizeReferences(JSON.parse(localStorage.getItem(REFERENCE_KEY)||'[]'));}catch{}
const status=document.createElement('div');status.className='reference-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');document.body.append(status);
let timer;
function announce(text){status.textContent=text;clearTimeout(timer);timer=setTimeout(()=>status.textContent='',4500);}
function sync(){document.querySelectorAll('[data-reference-work]').forEach(b=>{const active=saved.includes(b.dataset.referenceWork);const label=active?'Пример сохранён ✓':'Сохранить как пример';if(b.textContent!==label)b.textContent=label;b.setAttribute('aria-pressed',String(active));});}
let data,renderVersion=0,shownReferences=false;
const VIEW_KEY='eventagencies-reference-view-v1';
let referenceView={query:'',agency:''};
try{const view=JSON.parse(sessionStorage.getItem(VIEW_KEY)||'null');if(view)referenceView={query:typeof view.query==='string'?view.query.slice(0,200):'',agency:typeof view.agency==='string'?view.agency:''};}catch{}
const normalizeSearch=value=>String(value||'').toLocaleLowerCase('ru').replace(/ё/g,'е');
const workAgencies=work=>work.agencySlugs?.length?work.agencySlugs:[work.agencySlug];
function rememberView(){try{sessionStorage.setItem(VIEW_KEY,JSON.stringify(referenceView));}catch{}}
function filterReferences(host,works){
 const words=normalizeSearch(referenceView.query).trim().split(/\s+/).filter(Boolean);
 let visible=0;
 host.querySelectorAll('[data-saved-reference]').forEach(card=>{
  const work=works.find(work=>work.slug===card.dataset.savedReference);
  const text=normalizeSearch([work.fullTitle,work.client,work.category,work.eventCity,card.querySelector('[data-work-note]')?.value].join(' '));
  const matches=(!referenceView.agency||workAgencies(work).includes(referenceView.agency))&&words.every(word=>text.includes(word));
  card.hidden=!matches;if(matches)visible++;
 });
 host.querySelector('[data-reference-count]').textContent=`Показано ${visible} из ${works.length}`;
 host.querySelector('[data-reference-empty]').hidden=visible!==0;
 host.querySelector('[data-clear-references]').disabled=!referenceView.query&&!referenceView.agency;
}
async function renderReferences(){
 if(location.pathname.replace(/\/$/,'')!=='/my-project')return;
 let host=document.getElementById('work-references');if(!host){host=document.createElement('section');host.id='work-references';host.className='saved-references';document.querySelector('main').append(host);}
 const version=++renderVersion;
 try{data ||= await fetch('/custom/catalog-data.json').then(r=>{if(!r.ok)throw Error();return r.json();});
 if(version!==renderVersion)return;
 let notes={};try{notes=readDraft(localStorage).workNotes;}catch{}
 const noteMarkup=p=>`<section class="work-note-block"><label for="reference-note-${esc(p.slug)}">Моя заметка к примеру</label><textarea id="reference-note-${esc(p.slug)}" data-work-note="${esc(p.agencySlug)}" data-note-work="${esc(p.slug)}" rows="3" maxlength="1000" placeholder="Что нравится в этой работе?">${esc(notes[workNoteKey(p.agencySlug,p.slug)]||'')}</textarea><p>Личная заметка · сохраняется в этом браузере.</p><button class="secondary-action" type="button" data-add-wishes-work="${esc(p.slug)}" data-add-wishes-agency="${esc(p.agencySlug)}">Добавить в пожелания…</button><p role="status"></p></section>`;
 const works=saved.map(slug=>data.projects.find(p=>p.slug===slug)).filter(Boolean);
 const agencySlugs=new Set(works.flatMap(workAgencies));
 const agencies=data.agencies.filter(agency=>agencySlugs.has(agency.slug)).sort((a,b)=>a.name.localeCompare(b.name,'ru'));
 if(referenceView.agency&&!agencies.some(agency=>agency.slug===referenceView.agency)){referenceView.agency='';rememberView();}
 const workLink=work=>'/work/'+esc(work.slug)+'?from=%2Fmy-project%23work-references';
 host.innerHTML=`<div class="reference-heading"><div><span class="eyebrow">Вдохновение</span><h2>Примеры для моего события</h2></div><a class="text-link" href="/catalog?view=projects">Найти ещё примеры ↗</a></div><p>Соберите настроение события: сохраняйте работы и отмечайте, что в них нравится. Чтобы передать пример вместе с заявкой, добавьте его в пожелания.</p>`+(works.length?`
  <div class="reference-filters" role="search" aria-label="Поиск в сохранённых примерах">
   <label class="reference-search">Найти в моих примерах<input id="reference-search" type="search" maxlength="200" placeholder="Название, агентство или ваша заметка" value="${esc(referenceView.query)}" aria-controls="saved-reference-grid"></label>
   <label>Агентство<select id="reference-agency" aria-controls="saved-reference-grid"><option value="">Все агентства</option>${agencies.map(agency=>`<option value="${esc(agency.slug)}"${agency.slug===referenceView.agency?' selected':''}>${esc(agency.name)}</option>`).join('')}</select></label>
   <button type="button" class="text-button" data-clear-references>Сбросить</button>
  </div>
  <p class="reference-count" data-reference-count role="status" aria-live="polite" aria-atomic="true"></p>
  <div class="reference-grid" id="saved-reference-grid">${works.map(p=>`<article data-saved-reference="${esc(p.slug)}">${p.hasPhotos?`<a href="${workLink(p)}"><img src="${esc(p.preview||p.thumb||p.image)}" alt="${esc(p.fullTitle)}" loading="lazy"></a>`:''}<h3><a href="${workLink(p)}">${esc(p.fullTitle)}</a></h3><p>${esc(p.client)}</p>${noteMarkup(p)}<button data-remove-reference="${esc(p.slug)}">Убрать пример</button></article>`).join('')}</div>
  <div class="reference-empty" data-reference-empty hidden><h3>Таких примеров пока нет</h3><p>Попробуйте другое слово или выберите все агентства.</p><button class="secondary-action" type="button" data-reset-references>Показать все сохранённые</button></div>`:
  '<div class="reference-empty"><h3>Начните с того, что нравится</h3><p>Откройте любую работу в каталоге и нажмите «Сохранить как пример». Она появится здесь вместе с вашей личной заметкой.</p><a class="secondary-action" href="/catalog?view=projects">Выбрать первый пример ↗</a></div>');
 if(works.length){
  const search=host.querySelector('#reference-search'),agency=host.querySelector('#reference-agency');
  const apply=()=>{referenceView={query:search.value,agency:agency.value};rememberView();filterReferences(host,works);};
  search.addEventListener('input',apply);agency.addEventListener('change',apply);
  const reset=()=>{search.value='';agency.value='';apply();search.focus({preventScroll:true});};
  host.querySelector('[data-clear-references]').addEventListener('click',reset);
  host.querySelector('[data-reset-references]').addEventListener('click',reset);
  filterReferences(host,works);
 }
 if(!shownReferences&&location.hash==='#work-references')host.scrollIntoView({block:'start'});
 shownReferences=true;
 }catch{host.innerHTML='<h2>Примеры для моего события</h2><p>Не удалось загрузить работы.</p><button data-retry-references>Попробовать снова</button>';}
}
document.addEventListener('click',async event=>{
 if(event.target.closest('[data-retry-references]')){renderReferences();return;}
 const b=event.target.closest('[data-reference-work],[data-remove-reference]');if(!b)return;
 event.preventDefault();const slug=b.dataset.referenceWork||b.dataset.removeReference;const remove=saved.includes(slug);const next=remove?saved.filter(s=>s!==slug):normalizeReferences([...saved,slug]);
 if(!remove&&!next.includes(slug)){announce('Сохранено 200 примеров. Уберите один, чтобы добавить новый.');return;}
 try{localStorage.setItem(REFERENCE_KEY,JSON.stringify(next));saved=next;sync();await renderReferences();announce(remove?'Пример убран.':'Работа сохранена в «Моём проекте». Агентство не добавлено.');if(b.dataset.removeReference)document.querySelector('#work-references h2')?.setAttribute('tabindex','-1');if(b.dataset.removeReference)document.querySelector('#work-references h2')?.focus();}catch{announce('Не удалось сохранить пример. Проверьте доступ к хранилищу браузера.');}
});
addEventListener('storage',event=>{if(event.key===REFERENCE_KEY||event.key===null){try{saved=normalizeReferences(JSON.parse(localStorage.getItem(REFERENCE_KEY)||'[]'));sync();renderReferences();}catch{}}});
new MutationObserver(changes=>{if(changes.some(c=>[...c.addedNodes].some(n=>n.nodeType===1&&(n.matches?.('[data-reference-work]')||n.querySelector?.('[data-reference-work]')))))sync();}).observe(document.querySelector('main')||document.body,{childList:true,subtree:true});
const back=document.querySelector('[data-case-back]');if(back){try{const from=new URLSearchParams(location.search).get('from');const url=new URL(from||'/catalog?view=projects',location.origin);url.pathname=url.pathname.replace(/\/$/,'')||'/';if(url.origin===location.origin&&(/^\/agency\/[a-z0-9-]+$/.test(url.pathname)||url.pathname==='/catalog'||url.pathname==='/my-project')){back.href=url.pathname+url.search+url.hash;back.textContent=url.pathname.startsWith('/agency/')?'← К работам агентства':url.pathname==='/my-project'?'← В мой проект':'← К работам';}}catch{}}
sync();renderReferences();
