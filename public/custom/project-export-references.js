import {normalizeReferences} from './reference-store.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl=value=>{try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)?url.href:'';}catch{return '';}};
const link=(url,label)=>url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`:'';

export function exportReferenceSection(state,data,{referenceSlugs,includeNotes,origin,excludedNotes=[]}){
 const agencies=new Map(data.agencies.map(agency=>[agency.slug,agency])),works=new Map(data.projects.map(work=>[work.slug,work])),usedNotes=new Set(excludedNotes);
 const entries=normalizeReferences(referenceSlugs).map((slug,index)=>{
  const work=works.get(slug),notes=[];
  if(includeNotes)for(const [key,text]of Object.entries(state.workNotes)){
   const [agencySlug,workSlug]=key.split('/');if(workSlug!==slug||!text.trim()||usedNotes.has(key))continue;
   usedNotes.add(key);notes.push({label:agencies.has(agencySlug)?'Моя заметка · '+agencies.get(agencySlug).name:'Моя заметка',text});
  }
  const teamNames=work?[...new Set([work.agencySlug,...(work.agencySlugs||[])].filter(Boolean))].map(slug=>agencies.get(slug)?.name).filter(Boolean):[];
  return {title:work?.fullTitle||'Сохранённый пример №'+(index+1),unavailable:!work,teams:teamNames.join(', '),facts:work?[work.category,work.eventCity,work.guestLabel].filter(Boolean).join(' · '):'',notes,workUrl:work?safeUrl(origin+'/work/'+work.slug):'',source:safeUrl(work?.source)};
 });
 const lines=['','СОХРАНЁННЫЕ ПРИМЕРЫ',...entries.flatMap((entry,index)=>['',`${index+1}. ${entry.title}`,...(entry.unavailable?['Пример больше недоступен в текущем каталоге.']:[]),...(entry.teams?['Команды: '+entry.teams]:[]),...(entry.facts?['О работе: '+entry.facts]:[]),...entry.notes.map(note=>note.label+': '+note.text),...(entry.workUrl?['Работа: '+entry.workUrl]:[]),...(entry.source?['Источник работы: '+entry.source]:[])]),...(!entries.length?['Сохранённых примеров пока нет.']:[])];
 const html=`<section><h2>Сохранённые примеры</h2>${entries.map((entry,index)=>`<article class="team reference"><header><span class="number">${String(index+1).padStart(2,'0')}</span><div><p class="eyebrow">Пример ${index+1}</p><h3>${esc(entry.title)}</h3></div></header>${entry.unavailable?'<p class="reference-unavailable">Пример больше недоступен в текущем каталоге.</p>':''}${entry.teams?`<p><strong>Команды:</strong> ${esc(entry.teams)}</p>`:''}${entry.facts?`<p>${esc(entry.facts)}</p>`:''}${entry.notes.map(note=>`<aside class="note"><h4>${esc(note.label)}</h4><p>${esc(note.text)}</p></aside>`).join('')}<div class="links">${link(entry.workUrl,'Работа')}${link(entry.source,'Источник работы')}</div></article>`).join('')||'<p>Сохранённых примеров пока нет.</p>'}</section>`;
 return {lines,html,count:entries.length,noteCount:entries.reduce((total,entry)=>total+entry.notes.length,0),unavailableCount:entries.filter(entry=>entry.unavailable).length};
}
