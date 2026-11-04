import {selectionView} from './project-selection-view.js';
import {projectPresentation} from './project-presentation.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl=value=>{try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)?url.href:'';}catch{return '';}};

function presentationFields(pick){
 const {scope,title,lead,fit,participation}=projectPresentation(pick);
 if(scope==='unavailable')return [['Публичное описание','Публичное описание недоступно.']];
 const fields=[[scope==='work'?'Описание работы':'Описание агентства',title||'Название не указано.']];
 const hasLead=Boolean(lead.trim()),hasFit=Boolean(fit.trim());
 if(hasLead)fields.push(['Публичное описание',lead]);
 if(!hasLead&&!hasFit)fields.push(['Публичное описание','Публичное описание не указано.']);
 if(hasFit)fields.push(['Если вам близко',fit]);
 if(scope==='work'&&participation.trim())fields.push(['Участие в работе',participation]);
 return fields;
}

function selectionFields(pick,data,includeNotes,includePresentation){
 const {s,a,p,work,workStatus,note}=pick;
 const fields=a?[
  ['Специализация',(a.types||[]).map(t=>data.types[t]).filter(Boolean).join(', ')||'Нужно уточнить'],
  ['Город команды',a.city||'Нужно уточнить'],
  ['География работы',a.geography||'Нужно уточнить'],
  ['Услуги',a.services||'Нужно уточнить'],
  ['Условия по бюджету',a.budgetConditions||'Нужно уточнить']
 ]:[
  ['Статус команды','Профиль команды недоступен в каталоге. Сохранённый выбор остаётся в подборке.'],
  ['Сохранённый идентификатор команды',s.agencySlug]
 ];
 fields.push(['Выбранная работа',p?p.fullTitle||'Название работы не указано.':workStatus]);
 if(p){
  fields.push(['О работе',[p.category,p.eventCity,p.guestLabel].filter(Boolean).join(' · ')||'Нужно уточнить']);
  if(p.role)fields.push(['Роль агентства',p.role]);
 }else if(s.workSlug){
  if(work?.fullTitle)fields.push(['Прежняя работа',work.fullTitle]);
  fields.push(['Сохранённый идентификатор работы',s.workSlug]);
 }
 if(includePresentation===true)fields.push(...presentationFields(pick));
 if(includeNotes===true&&note){
  if(!p)fields.push(['Сохранённая пара заметки',`Команда: ${s.agencySlug} · работа: ${s.workSlug}. Связь команды с работой сейчас не подтверждена.`]);
  fields.push([p?'Заметка автора':'Заметка автора к сохранённой паре',note]);
 }
 return fields;
}

/**
 * Pure public snapshot. Notes and editorial descriptions are separate opt-ins.
 * The third argument retains its existing boolean meaning; no draft is mutated.
 */
export function selectionShare(state,data,includeNotes=false,{includePresentation=false}={}){
 const seen=new Set();
 const entries=(state.selection||[])
  .filter(s=>{if(seen.has(s.agencySlug))return false;seen.add(s.agencySlug);return true;})
  .slice(0,3)
  .map(s=>{
   const pick=selectionView(data,s,includeNotes===true?state.workNotes||{}:{});
   return {
    name:pick.label,
    fields:selectionFields(pick,data,includeNotes,includePresentation),
    website:safeUrl(pick.a?.website),
    source:safeUrl(pick.p?.source)
   };
  });
 const footer='Это копия подборки на момент подготовки. Дату, стоимость и состав предложения нужно уточнить у агентств.';
 const text=['ПОДБОРКА АГЕНТСТВ · EventAgencies','',...entries.flatMap((a,i)=>[`${i+1}. ${a.name}`,...a.fields.map(([k,v])=>`${k}: ${v}`),...(a.website?['Сайт агентства: '+a.website]:[]),...(a.source?['Источник работы: '+a.source]:[]),'']),footer].join('\n');
 const cards=entries.map(a=>`<article><h2>${esc(a.name)}</h2><dl>${a.fields.map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl><p class="links">${a.website?`<a href="${esc(a.website)}" target="_blank" rel="noopener noreferrer">Сайт агентства ↗</a>`:''} ${a.source?`<a href="${esc(a.source)}" target="_blank" rel="noopener noreferrer">Источник работы ↗</a>`:''}</p></article>`).join('');
 const html=`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Подборка агентств — EventAgencies</title><style>body{margin:0;background:#f5f2e9;color:#20251e;font:16px/1.6 system-ui,sans-serif}main{max-width:1250px;margin:auto;padding:32px 24px}h1{font-size:clamp(30px,5vw,52px);line-height:1.1;letter-spacing:-.04em}h2{font-size:26px;margin-top:0;overflow-wrap:anywhere}.grid{display:grid;grid-template-columns:repeat(${Math.max(1,entries.length)},minmax(0,1fr));gap:20px}article{background:#fff;border:1px solid #d8d8ce;border-radius:16px;padding:24px;min-width:0}dl{margin:0}dl div{border-top:1px solid #e0e0d6;padding:16px 0}dt{font-size:13px;color:#65705b}dd{margin:6px 0 0;white-space:pre-wrap;overflow-wrap:anywhere}a{color:#41622e;overflow-wrap:anywhere}.links{display:flex;gap:16px;flex-wrap:wrap}footer{margin-top:30px;color:#65705b}@media(max-width:800px){.grid{grid-template-columns:1fr}main{padding:24px 16px}}@media print{body{background:white}article{break-inside:avoid}.grid{display:block}article{margin-bottom:20px}}</style></head><body><main><p>EventAgencies · подборка для обсуждения</p><h1>Выбранные агентства</h1><p>${entries.length} ${entries.length===1?'сохранённый вариант':entries.length>1?'сохранённых варианта':'сохранённых вариантов'} · можно открыть без доступа к EventAgencies</p><div class="grid">${cards}</div><footer>${esc(footer)}</footer></main></body></html>`;
 return {text,html,count:entries.length};
}
