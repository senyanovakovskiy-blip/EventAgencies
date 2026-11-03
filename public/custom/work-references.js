import {readDraft,workNoteKey} from './project-store.js';
import {escapeHtml as esc} from './work-presentation.js';
export const REFERENCE_KEY='eventagencies-work-references-v1';
export function normalizeReferences(value){return Array.isArray(value)?[...new Set(value.filter(s=>typeof s==='string'&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s)))].slice(0,200):[];}
let saved=[];try{saved=normalizeReferences(JSON.parse(localStorage.getItem(REFERENCE_KEY)||'[]'));}catch{}
const status=document.createElement('div');status.className='reference-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');document.body.append(status);
let timer;
function announce(text){status.textContent=text;clearTimeout(timer);timer=setTimeout(()=>status.textContent='',4500);}
function sync(){document.querySelectorAll('[data-reference-work]').forEach(b=>{const active=saved.includes(b.dataset.referenceWork);const label=active?'Пример сохранён ✓':'Сохранить как пример';if(b.textContent!==label)b.textContent=label;b.setAttribute('aria-pressed',String(active));});}
let data;
async function renderReferences(){
 if(location.pathname.replace(/\/$/,'')!=='/my-project')return;
 let host=document.getElementById('work-references');if(!host){host=document.createElement('section');host.id='work-references';host.className='saved-references';document.querySelector('main').append(host);}
 try{data ||= await fetch('/custom/catalog-data.json').then(r=>{if(!r.ok)throw Error();return r.json();});
 let notes={};try{notes=readDraft(localStorage).workNotes;}catch{}
 const noteMarkup=p=>`<section class="work-note-block"><label for="reference-note-${esc(p.slug)}">Моя заметка к примеру</label><textarea id="reference-note-${esc(p.slug)}" data-work-note="${esc(p.agencySlug)}" data-note-work="${esc(p.slug)}" rows="3" maxlength="1000" placeholder="Что нравится в этой работе?">${esc(notes[workNoteKey(p.agencySlug,p.slug)]||'')}</textarea><p>Личная заметка · сохраняется в этом браузере.</p><button class="secondary-action" type="button" data-add-wishes-work="${esc(p.slug)}" data-add-wishes-agency="${esc(p.agencySlug)}">Добавить в пожелания…</button><p role="status"></p></section>`;
 const works=saved.map(slug=>data.projects.find(p=>p.slug===slug)).filter(Boolean);
 host.innerHTML='<span class="eyebrow">Вдохновение</span><h2>Примеры для моего события</h2><p>Личные примеры не добавляют агентства в подборку. Чтобы передать пример или заметку вместе с заявкой, выберите «Добавить в пожелания» и проверьте текст.</p>'+(works.length?'<div class="reference-grid">'+works.map(p=>'<article>'+ (p.hasPhotos?'<a href="/work/'+esc(p.slug)+'"><img src="'+esc(p.preview||p.thumb||p.image)+'" alt="'+esc(p.fullTitle)+'" loading="lazy"></a>':'')+'<h3><a href="/work/'+esc(p.slug)+'">'+esc(p.fullTitle)+'</a></h3><p>'+esc(p.client)+'</p>'+noteMarkup(p)+'<button data-remove-reference="'+esc(p.slug)+'">Убрать пример</button></article>').join('')+'</div>':'<a href="/catalog?view=projects">Найти примеры в работах агентств ↗</a>');
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
const back=document.querySelector('[data-case-back]');if(back){try{const from=new URLSearchParams(location.search).get('from');const url=new URL(from||'/catalog?view=projects',location.origin);if(url.origin===location.origin&&(/^\/agency\/[a-z0-9-]+$/.test(url.pathname)||url.pathname==='/catalog'||url.pathname==='/my-project')){back.href=url.pathname+url.search;back.textContent=url.pathname.startsWith('/agency/')?'← К работам агентства':'← К работам';}}catch{}}
sync();renderReferences();
