const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl=value=>{try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)?url.href:'';}catch{return '';}};
export function selectionShare(state,data,includeNotes=false){
 const seen=new Set();
 const entries=(state.selection||[]).filter(s=>{if(seen.has(s.agencySlug))return false;seen.add(s.agencySlug);return true;}).slice(0,3).flatMap(s=>{
  const a=data.agencies.find(a=>a.slug===s.agencySlug);if(!a)return [];
  const p=data.projects.find(p=>p.slug===s.workSlug&&(p.agencySlug===a.slug||p.agencySlugs?.includes(a.slug)));
  const fields=[['Специализация',(a.types||[]).map(t=>data.types[t]).filter(Boolean).join(', ')||'Нужно уточнить'],['Город команды',a.city||'Нужно уточнить'],['География работы',a.geography||'Нужно уточнить'],['Услуги',a.services||'Нужно уточнить'],['Условия по бюджету',a.budgetConditions||'Нужно уточнить'],['Выбранная работа',p?.fullTitle||'Кейс не выбран']];
  if(p){fields.push(['О работе',[p.category,p.eventCity,p.guestLabel].filter(Boolean).join(' · ')||'Нужно уточнить']);if(p.role)fields.push(['Роль агентства',p.role]);}
  if(includeNotes&&p&&state.workNotes?.[a.slug+'/'+p.slug])fields.push(['Заметка автора',state.workNotes[a.slug+'/'+p.slug]]);
  return [{name:a.name,fields,website:safeUrl(a.website),source:safeUrl(p?.source)}];
 });
 const footer='Это копия подборки на момент отправки. Дату, стоимость и состав предложения нужно уточнить у агентств.';
 const text=['ПОДБОРКА АГЕНТСТВ · EventAgencies','',...entries.flatMap((a,i)=>[`${i+1}. ${a.name}`,...a.fields.map(([k,v])=>`${k}: ${v}`),...(a.website?['Сайт агентства: '+a.website]:[]),...(a.source?['Источник работы: '+a.source]:[]),'']),footer].join('\n');
 const cards=entries.map(a=>`<article><h2>${esc(a.name)}</h2><dl>${a.fields.map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl><p class="links">${a.website?`<a href="${esc(a.website)}" target="_blank" rel="noopener noreferrer">Сайт агентства ↗</a>`:''} ${a.source?`<a href="${esc(a.source)}" target="_blank" rel="noopener noreferrer">Источник работы ↗</a>`:''}</p></article>`).join('');
 const html=`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Подборка агентств — EventAgencies</title><style>body{margin:0;background:#f5f2e9;color:#20251e;font:16px/1.6 system-ui,sans-serif}main{max-width:1250px;margin:auto;padding:32px 24px}h1{font-size:clamp(30px,5vw,52px);line-height:1.1;letter-spacing:-.04em}h2{font-size:26px;margin-top:0}.grid{display:grid;grid-template-columns:repeat(${Math.max(1,entries.length)},minmax(0,1fr));gap:20px}article{background:#fff;border:1px solid #d8d8ce;border-radius:16px;padding:24px;min-width:0}dl{margin:0}dl div{border-top:1px solid #e0e0d6;padding:16px 0}dt{font-size:13px;color:#65705b}dd{margin:6px 0 0;white-space:pre-wrap;overflow-wrap:anywhere}a{color:#41622e;overflow-wrap:anywhere}.links{display:flex;gap:16px;flex-wrap:wrap}footer{margin-top:30px;color:#65705b}@media(max-width:800px){.grid{grid-template-columns:1fr}main{padding:24px 16px}}@media print{body{background:white}article{break-inside:avoid}.grid{display:block}article{margin-bottom:20px}}</style></head><body><main><p>EventAgencies · подборка для обсуждения</p><h1>Выбранные агентства</h1><p>${entries.length} команд${entries.length===1?'а':entries.length<5?'ы':''} · можно открыть без доступа к EventAgencies</p><div class="grid">${cards}</div><footer>${esc(footer)}</footer></main></body></html>`;
 return {text,html,count:entries.length};
}

export function setupSelectionShare({getState,getData}){
 const button=document.querySelector('[data-share-selection]');if(!button)return;
 const dialog=document.createElement('dialog');dialog.id='share-selection-dialog';dialog.setAttribute('aria-labelledby','share-selection-title');
 dialog.innerHTML=`<button class="brief-close" data-close-share aria-label="Закрыть подборку для коллеги">×</button><span class="eyebrow">Обсудить с коллегой</span><h2 id="share-selection-title">Поделиться подборкой</h2><p>Скопируйте текст в сообщение или отправьте HTML-файл. Файл открывается в браузере без доступа к этому сайту.</p><p>В подборке — выбранные агентства, работы и ссылки на их сайты. Контакты и описание вашего мероприятия не включены.</p><label class="share-note-option"><input type="checkbox" data-share-notes> Включить мои заметки к выбранным работам</label><label class="share-preview-label" for="share-selection-preview">Предпросмотр сообщения</label><textarea id="share-selection-preview" rows="10" readonly></textarea><div class="draft-result-actions"><button type="button" class="primary-action" data-copy-selection disabled>Скопировать текст</button><button type="button" class="secondary-action" data-download-selection disabled>Скачать подборку</button></div><p class="brief-local-note" role="status" data-share-status></p>`;
 document.body.append(dialog);
 const preview=dialog.querySelector('textarea'),notes=dialog.querySelector('[data-share-notes]'),status=dialog.querySelector('[data-share-status]'),copy=dialog.querySelector('[data-copy-selection]'),download=dialog.querySelector('[data-download-selection]');
 let prepared=null,version=0;
 async function update(){
  const current=++version;prepared=null;copy.disabled=true;download.disabled=true;status.textContent='Готовим подборку…';preview.value='';
  try{const data=await getData();if(current!==version||!dialog.open)return;prepared=selectionShare(getState(),data,notes.checked);preview.value=prepared.text;copy.disabled=download.disabled=!prepared.count;status.textContent=prepared.count?'Проверьте содержимое перед отправкой.':'Сначала добавьте хотя бы одно агентство в «Мой проект».';}
  catch{if(current===version)status.textContent='Не удалось загрузить подборку. Закройте окно и попробуйте снова.';}
 }
 button.addEventListener('click',()=>{notes.checked=false;dialog.showModal();update();});
 notes.addEventListener('change',update);
 dialog.querySelector('[data-close-share]').addEventListener('click',()=>dialog.close());
 dialog.addEventListener('close',()=>{version++;prepared=null;button.focus();});
 copy.addEventListener('click',async()=>{
  if(!prepared)return;const text=prepared.text;
  try{await navigator.clipboard.writeText(text);status.textContent='Текст скопирован. Вставьте его в сообщение коллеге.';}
  catch{preview.focus();preview.select();status.textContent='Автоматическое копирование недоступно. Текст выделен — нажмите Ctrl+C или выберите «Копировать».';}
 });
 download.addEventListener('click',()=>{
  if(!prepared)return;const url=URL.createObjectURL(new Blob([prepared.html],{type:'text/html;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download='EventAgencies — подборка агентств.html';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status.textContent='Файл подготовлен для скачивания. Отправьте его коллеге как вложение.';
 });
}
