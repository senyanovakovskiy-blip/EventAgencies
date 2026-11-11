export const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function workSummary(p){if(p.presentation?.lead)return p.presentation.lead;return (p.summary||p.description||p.format||p.category||'').replace(/Фотографии этого проекта пока не добавлены\.?/g,'').trim().split(/(?<=[.!?])\s+/)[0];}
export function workCardScale(p){const label=String(p?.guestLabel||'').trim();if(!/\d/u.test(label)||label.length>70||/[;|]/u.test(label)||/(?:разниц|не заверш|не объяс|не подтвержд|не указаны|не раскры|может быть|по разным)/iu.test(label))return '';return `Масштаб: ${label}`;}
export function workSourceLink(p){const url=typeof p?.source==='string'?p.source.trim():'';if(!/^https?:\/\/[^\s"'<>]+$/iu.test(url))return '';return `<a class="work-participation-source" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${p.kind==='case'?'Источник кейса':'Материалы проекта'} ↗</a>`;}
export function workParticipation(p,{includeSummary=false}={}){const explicit=typeof p?.presentation?.participation==='string'?p.presentation.participation.trim():'';const text=explicit||(includeSummary?workSummary(p):'');const source=workSourceLink(p);if(!text&&!source)return '';const label=explicit?'Участие команды':text?'О проекте · роль команды не указана':'Роль команды не указана';return `<div class="work-participation"><div class="work-participation-head"><span>${label}</span>${source}</div>${text?`<p>${escapeHtml(text)}</p>`:''}</div>`;}
export function referenceAction(p){return `<button class="reference-button" data-reference-work="${escapeHtml(p.slug)}" aria-pressed="false">Сохранить как пример</button>`;}
export function workAgencies(work,agencyMap){
 const slugs=[...new Set([work.agencySlug,...(Array.isArray(work.agencySlugs)?work.agencySlugs:[])].filter(Boolean))];
 return slugs.map(slug=>agencyMap.get(slug)).filter(Boolean);
}
export const workAgencyLabel=(work,agencyMap)=>workAgencies(work,agencyMap).map(agency=>agency.name).join(', ')||'Команда не указана';
export function workClientMention(work,agencyMap){
 const value=typeof work.client==='string'?work.client.trim():'';
 if(!value||/^(?:(?:клиент|заказчик) не указан|не указан в источнике)$/iu.test(value))return '';
 const normalize=name=>name.trim().toLocaleLowerCase('ru-RU').replaceAll('ё','е');
 return workAgencies(work,agencyMap).some(agency=>normalize(agency.name)===normalize(value))?'':value;
}
export const workCardVisibleSearchText=(work,agencies)=>[work.fullTitle,workSummary(work),...agencies.map(agency=>agency.name),work.presentation?.participation].filter(Boolean).join(' ');
export function workPortfolioCredits(work,agencyMap,from){
 const agencies=workAgencies(work,agencyMap);
 const links=agencies.map(agency=>`<a class="company-credit" href="/agency/${encodeURIComponent(agency.slug)}?from=${encodeURIComponent(from)}">${escapeHtml(agency.name)} ↗</a>`).join(' · ');
 return {agencies,links};
}
