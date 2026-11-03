// Review the existing draft and render the immutable server receipt.
import {contactMethods} from './project-store.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function wishesAddition(work,note='',origin=''){
 const source=typeof work?.source==='string'&&/^https?:\/\//i.test(work.source)?work.source:origin+'/work/'+work.slug;
 return ['Пример для обсуждения: '+(work.fullTitle||work.title),source,...(note.trim()?['Что нравится: '+note.trim()]:[])].join('\n');
}
export function mergeWishes(existing,addition){
 const original=String(existing||''),fragment=String(addition||'').trim();
 if(!fragment)return {result:'empty',text:original};
 if(original.includes(fragment))return {result:'duplicate',text:original};
 const text=original.trimEnd()+(original.trimEnd()?'\n\n':'')+fragment;
 return {result:text.length>3000?'too-long':'added',text};
}
export function reviewMarkup(state,data,rows){
 const agencyMap=new Map(data.agencies.map(a=>[a.slug,a]));
 const entries=state.selection.filter(s=>agencyMap.has(s.agencySlug));
 const picked=s=>data.projects.find(p=>p.slug===s.workSlug&&(p.agencySlug===s.agencySlug||p.agencySlugs?.includes(s.agencySlug)));
 return `<section class="request-review-block request-review-event"><div class="request-review-heading"><h3>Параметры мероприятия</h3><button type="button" data-edit-brief data-brief-field="format" aria-label="Изменить параметры мероприятия">Изменить</button></div><dl class="review-brief">${rows.filter(([label])=>label!=='Пожелания').map(([label,value])=>`<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl></section>
 <section class="request-review-block request-review-teams"><div class="request-review-heading"><h3>Команды и работы</h3><a href="#project-comparison" data-edit-selection aria-label="Изменить выбранные агентства">Изменить</a></div>${entries.length?`<p class="request-team-order">В вашем порядке приоритета</p><ol class="request-team-list">${entries.map((s,index)=>{
  const a=agencyMap.get(s.agencySlug),p=picked(s),photo=p?.hasPhotos&&(p.preview||p.reelMobile||p.image);
  return `<li class="request-team"><span class="request-team-priority" aria-label="Приоритет ${index+1}">${String(index+1).padStart(2,'0')}</span><div class="request-team-content"><h4><a href="/agency/${esc(s.agencySlug)}">${esc(a.name)} ↗</a></h4>${p?`<a class="request-team-work" href="/work/${esc(p.slug)}?from=%2Fmy-project%23project-handoff">${photo?`<img src="${esc(photo)}" srcset="${esc(p.previewSrcSet||'')}" sizes="88px" width="88" height="66" loading="lazy" decoding="async" alt="">`:''}<span><small>${p.kind==='case'?'Выбранный кейс':'Выбранная работа'}</small><strong>${esc(p.fullTitle)} ↗</strong></span></a>`:'<p class="request-team-empty">Работа пока не выбрана.</p>'}<button class="request-edit" type="button" data-review-work="${esc(s.agencySlug)}" aria-label="${p?'Изменить':'Выбрать'} работу для ${esc(a.name)}">${p?'Изменить работу':'Выбрать работу'}</button></div></li>`;
 }).join('')}</ol>`:'<div class="request-team-help"><p>Попросим помочь с подбором команды.</p><a href="/catalog">Или выбрать агентства самостоятельно ↗</a></div>'}</section>
 <section class="request-review-block request-review-wishes"><div class="request-review-heading"><h3>Пожелания</h3><button type="button" data-edit-brief data-brief-field="description" aria-label="Изменить пожелания">Изменить</button></div><p class="request-wishes">${esc(state.brief.description||'Пока не указаны.')}</p></section>
 <p class="request-review-scope">В заявку войдут описание события, выбранные команды и их работы. Личные заметки и остальные сохранённые примеры останутся в вашем проекте. Нужные идеи можно перенести в пожелания из раздела <a href="#work-references">«Примеры»</a>.</p>`;
}
export function receiptMarkup(receipt,rows){
 return `<strong>Заявка принята командой EventAgencies</strong><p>Номер заявки: <b>${esc(receipt.id)}</b></p><p>${receipt.localServer?'Сохранена на локальном сервере.':'Сохранена в вашем закрытом рабочем пространстве.'} Сообщения агентствам не отправлялись.</p><dl class="review-brief">${rows.map(([label,value])=>`<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}<div><dt>Выбранные агентства и кейсы</dt><dd>${receipt.selection.length?receipt.selection.map(s=>`${esc(s.name)}${s.work?` — <a href="/work/${esc(s.work.slug)}?from=%2Fmy-project">${esc(s.work.title)} ↗</a>`:' — кейс не выбран'}`).join('<br>'):'Помощь с подбором; агентства пока не выбраны.'}</dd></div><div><dt>Контакт для ответа</dt><dd>${esc(receipt.contact.name)} · ${esc(contactMethods[receipt.contact.method])}: ${esc(receipt.contact.value)}</dd></div></dl><p>Следующий шаг — уточнить задачу и согласовать с вами бриф. После подбора проверяется интерес команд. Знакомство — с согласия обеих сторон.</p><div class="draft-result-actions"><button class="secondary-action" data-return-project>Вернуться к моему проекту</button></div>`;
}
