import {preparationFields,preparationKey,emptyPreparation,normalizePreparation,preparationLength,PREPARATION_LIMIT,PREPARATION_MAX_ITEMS} from './preparation-model.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const text=value=>Array.isArray(value)?value.join(', '):typeof value==='string'?value:'';
const worksFor=(catalog,slug)=>catalog.projects.filter(p=>p.agencySlug===slug||p.agencySlugs?.includes(slug));
const sourceLink=(url,label)=>{try{const parsed=new URL(url);return ['https:','http:'].includes(parsed.protocol)?`<a href="${esc(parsed.href)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`:'';}catch{return '';}};
const fact=(label,value)=>`<div><dt>${esc(label)}</dt><dd>${esc(text(value)||'В текущей справке не указано')}</dd></div>`;
function identity(entry,catalog,receipt){
 const agency=catalog.agencies.find(a=>a.slug===entry.agencySlug),work=catalog.projects.find(p=>p.slug===entry.workSlug),original=receipt?.selection.find(s=>s.agencySlug===entry.agencySlug);
 return {agency,work,name:agency?.name||original?.name||'Недоступное агентство · '+entry.agencySlug,title:work?.fullTitle||(original?.work?.slug===entry.workSlug?original.work.title:null)||(entry.workSlug?'Недоступная работа · '+entry.workSlug:'Без конкретной работы')};
}
function unknowns(agency,work,linked){
 const items=[];
 if(!agency)items.push('Агентство отсутствует в текущем каталоге; сведения нужно восстановить по исходному выбору и источникам.');
 if(!work)items.push('Конкретная работа не выбрана или недоступна. Сначала уточнить, какой пример обсуждаем.');
 else{
  if(!linked)items.push('Текущий каталог не связывает эту работу с агентством. Уточнить авторство и участие; нельзя приписывать агентству весь проект.');
  for(const [key,label]of Object.entries({task:'задача',idea:'идея',result:'результат'}))if(!work.details?.[key])items.push('В подробной справке не раскрыта часть «'+label+'». Проверить первоисточник и уточнить у команды.');
  if(!work.role&&!work.details?.role)items.push('Роль и границы участия команды не указаны в справке.');
  if(!work.source&&!work.details?.source)items.push('Ссылка на первоисточник работы не указана.');
 }
 items.push('Дата, доступность команды, состав работ, стоимость и применимость опыта к новому событию требуют отдельного обсуждения. Это неизвестные условия, а не недостатки агентства.');
 return items;
}
function dossier(entry,catalog,receipt){
 const {agency,work,name}=identity(entry,catalog,receipt),works=worksFor(catalog,entry.agencySlug),linked=works.some(p=>p.slug===entry.workSlug),detail=work?.details||{};
 return `<details class="operator-dossier" open><summary>Досье: исходные сведения и источники</summary><p class="small muted">Сведения каталога и публикаций о прошедших работах. Они не подтверждают качество, текущий состав команды или условия будущего события.</p>
 <h4>${esc(name)}</h4>${agency?`<p class="dossier-links"><a href="/agency/${esc(agency.slug)}" target="_blank" rel="noopener">Профиль ↗</a> ${sourceLink(agency.website,'Сайт агентства')}</p><dl class="dossier-facts">${fact('Специализация в каталоге',(agency.types||[]).map(key=>catalog.types[key]||key))}${fact('Город',agency.city)}${fact('География',agency.geography)}${fact('Услуги',agency.services)}${fact('Условия бюджета в справке',agency.budgetConditions)}</dl><h5>Исходная справка каталога</h5><p class="dossier-copy">${esc(agency.rawDescription||'Исходное описание агентства не заполнено.')}</p><p class="small muted">Текст сохранён как исходная справка; утверждения следует сверять с сайтом агентства.</p>`:'<p>Профиль сейчас недоступен. Название из исходной заявки, если оно сохранено, показано выше.</p>'}
 <label>Изучить работу этого агентства<select data-dossier-work><option value="">Без конкретной работы</option>${entry.workSlug&&!linked?`<option value="${esc(entry.workSlug)}" selected>${esc(work?.fullTitle||entry.workSlug)} · прежний выбор, связь недоступна</option>`:''}${works.map(p=>`<option value="${esc(p.slug)}" ${p.slug===entry.workSlug?'selected':''}>${esc(p.fullTitle)}${p.kind==='case'?'':' · портфолио'}</option>`).join('')}</select></label><p class="small muted">${works.length} работ в текущем каталоге. Этот переключатель не меняет исходный выбор и рекомендации.</p>
 ${work?`<h4>${esc(work.fullTitle)}</h4><p class="dossier-links"><a href="/work/${esc(work.slug)}" target="_blank" rel="noopener">Страница работы ↗</a> ${sourceLink(work.source,'Первоисточник работы')}</p><h5>Исходная справка каталога</h5><p class="dossier-copy">${esc(work.rawDescription||'Исходное описание работы не заполнено.')}</p><dl class="dossier-facts">${fact('Тип записи',work.kind==='case'?'Кейс':'Работа из портфолио')}${fact('Формат',work.format||work.category)}${fact('Место',work.eventCity)}${fact('Площадка по каталогу',work.venue)}${fact('Дата прошедшей работы',work.eventDate||work.year)}${fact('Участники',work.guestLabel)}${fact('Роль команды по каталогу',work.role)}</dl><h5>Опубликованные сведения по первоисточнику</h5><p class="small muted">${detail.source?'Редакционная выжимка опубликованного описания; не независимая проверка.':'Подробная выжимка из первоисточника пока не заполнена. Общая справка выше не заменяет её.'}${detail.reviewedAt?' Дата разбора: '+esc(detail.reviewedAt)+'.':''}</p><dl class="dossier-facts dossier-long">${fact('Задача',detail.task)}${fact('Идея / приём',detail.idea)}${fact('Роль',detail.role)}${fact('Результат и опубликованные оговорки',detail.result)}</dl>${sourceLink(detail.source,'Источник подробного разбора')}`:`<p class="muted">${entry.workSlug?'Сохранённая работа отсутствует в текущем каталоге.':'Работа пока не выбрана: доступна подготовка разговора об агентстве.'}</p>`}
 <h5>Неизвестное и что уточнить</h5><ul>${unknowns(agency,work,linked).map(item=>`<li>${esc(item)}</li>`).join('')}</ul></details>`;
}
function cardMarkup(entry,catalog,receipt,saved=false){
 const {name,title}=identity(entry,catalog,receipt);
 return `<article class="preparation-card" data-preparation-card="${esc(preparationKey(entry))}" data-agency="${esc(entry.agencySlug)}" data-work="${esc(entry.workSlug||'')}" data-saved="${saved}" hidden><h4>${esc(name)} · ${esc(title)}</h4><p class="small muted" data-preparation-origin></p>${dossier(entry,catalog,receipt)}<div class="preparation-editor"><h4>Внутренняя подготовка разговора</h4><p class="small muted">Возможные сильные стороны и сценарий — рабочие предположения. Отделяйте слова клиента и сведения источников от своих идей. Здесь ничего не подтверждает бриф, согласия или готовность агентства.</p><div class="preparation-actions"><button type="button" class="secondary" data-prepare-draft>Заполнить пустые поля наброском</button><button type="button" class="text-button" data-replace-preparation>Заменить все поля наброском…</button></div><p class="small muted" data-generation-status role="status"></p>${Object.entries(preparationFields).map(([key,{label,max}])=>`<label>${esc(label)}<textarea data-preparation-field="${key}" maxlength="${max}" rows="${key==='scenario'?8:3}" aria-describedby="preparation-privacy">${esc(entry[key])}</textarea><span class="small muted">До ${max.toLocaleString('ru-RU')} символов</span></label>`).join('')}</div></article>`;
}
export function preparationMarkup(){
 return `<section class="operator-subsection" id="admin-preparation" data-stage-panel="preparation"><h3>Разговор и сценарий</h3><p id="preparation-privacy" class="small muted">Только для оператора. Подготовка сохраняется с заявкой; автоматически не попадает в бриф, рекомендации или ответ клиенту. Переключение команды и работы сохраняет введённые поля на странице.</p><label>Чей опыт обсуждаем<select data-preparation-context aria-label="Агентство и работа для подготовки"></select></label><p class="small muted" data-preparation-empty hidden>В заявке пока нет выбранных команд. Добавьте рекомендацию или команду для обсуждения.</p><div data-preparation-cards></div><p class="small muted" data-preparation-count role="status"></p></section>`;
}
export function readPreparation(form,fallback=[]){
 const host=form.querySelector('[data-preparation-cards]');if(host?.dataset.ready!=='true')return normalizePreparation(fallback);
 return [...host.querySelectorAll('[data-preparation-card]')].map(card=>{
  const item=emptyPreparation(card.dataset.agency,card.dataset.work||null);
  for(const field of card.querySelectorAll('[data-preparation-field]'))item[field.dataset.preparationField]=field.value;
  return card.dataset.saved==='true'||Object.keys(preparationFields).some(key=>item[key].trim())?item:null;
 }).filter(Boolean);
}
const excerpt=(value,max=450)=>{const copy=text(value).trim();return copy.length>max?copy.slice(0,max-1)+'…':copy;};
function draftFor(entry,catalog,receipt,workflow){
 const {agency,work,name,title}=identity(entry,catalog,receipt),linked=worksFor(catalog,entry.agencySlug).some(p=>p.slug===entry.workSlug),d=work?.details||{},b=workflow.brief;
 const chosen=receipt.selection.some(s=>preparationKey(s)===preparationKey(entry));
 const goal=excerpt(b.goal)||'согласовать цель с заказчиком',idea=linked?excerpt(d.idea):'',role=linked?excerpt(d.role||work?.role):'';
 const anchor=work?`Работа для обсуждения: «${title}».`:`Команда для обсуждения: ${name}; релевантную работу ещё нужно выбрать.`;
 const source=excerpt(d.source||work?.source||agency?.website,250);
 const draft={
  attraction:(chosen?'Этот вариант есть в исходном выборе клиента; причину выбора нужно спросить.':'Это рабочий вариант подбора; интерес клиента к нему ещё нужно проверить.')+'\n'+(b.expectations?'Записанное ожидание в рабочем брифе: «'+excerpt(b.expectations,650)+'». Уточнить, что относится к этой работе.':'Спросить, что привлекло: формат, настроение, конкретный приём или роль команды.'),
  strengths:'Гипотеза для обсуждения, не оценка команды.\n'+anchor+'\n'+(role?'В источнике описана роль: «'+role+'». Обсудить, какая часть этого опыта нужна для цели «'+goal+'».':'Уточнить роль команды в похожей задаче, прежде чем считать опыт подходящим.'),
  unknowns:unknowns(agency,work,linked).join('\n'),
  questions:[`Что именно нравится клиенту в ${work?'работе «'+title+'»':'опыте '+name} и что он хотел бы получить иначе?`,d.task?'В разборе задача: «'+excerpt(d.task,300)+'». Чем наша цель отличается?':'Какую задачу решал пример и как её сопоставить с нашим мероприятием?',idea?'Как применить приём «'+excerpt(idea,300)+'» к нашей аудитории, не копируя чужое событие?':'Какой приём из опыта команды подходит аудитории и почему?', 'Что делала сама команда, а что — партнёры? Какие ресурсы нужны?', 'Какие дата, площадка, состав услуг и бюджет реалистичны? Что пока не подтверждено?', 'По каким признакам заказчик будет оценивать результат? Какие данные команда сможет предоставить?'].join('\n'),
  scenario:['РАБОЧАЯ ГИПОТЕЗА — для обсуждения, не согласованное предложение.',anchor,source?'Источник для сверки: '+source:'Первоисточник нужно уточнить.',idea?'Исторический приём из разбора: «'+idea+'».':linked&&work?.format?'Отправная точка из каталога: формат «'+excerpt(work.format)+'».':'Сначала выбрать конкретный пример и подтвердить роль команды.',`1. В разговоре уточнить цель: ${goal}. Выделить ожидание аудитории и одно главное действие гостя.`,idea?'2. Обсудить адаптацию указанного приёма: вход в событие → основной опыт → завершение. Для каждого блока записать роль команды и нужные ресурсы.':'2. Вместе с командой предложить основной опыт гостя: вход в событие → ключевой блок → завершение. Подтвердить, какие элементы команда действительно может выполнить.', '3. Сопоставить набросок с площадкой, числом гостей, датой и бюджетом. Отдельно отметить неподтверждённые условия.', '4. Записать альтернативу, способ обратной связи и критерии результата. Эффект заранее не обещать.'].join('\n\n'),
  nextStep:`Обсудить с заказчиком ${work?'работу «'+title+'»':'опыт '+name}, затем уточнить у команды роль, доступные ресурсы и условия. После разговора записать ответственного, срок и договорённость. Это план действий, сообщения ещё не отправлены.`
 };
 return Object.fromEntries(Object.entries(preparationFields).map(([key,{max}])=>[key,excerpt(draft[key],max)]));
}
export function wirePreparation(form,catalog,data,{getValues,selectStage}){
 const host=form.querySelector('[data-preparation-cards]'),select=form.querySelector('[data-preparation-context]'),count=form.querySelector('[data-preparation-count]');
 const saved=normalizePreparation(data.workflow?.preparation),visited=new Map();let active='',optionKey='';
 host.innerHTML=saved.map(item=>cardMarkup(item,catalog,data.receipt,true)).join('');host.dataset.ready='true';
 const cards=()=>[...host.querySelectorAll('[data-preparation-card]')];
 function contexts(){
  const entries=new Map(),values=getValues();
  function add(item,origin){const key=preparationKey(item),entry=entries.get(key)||{agencySlug:item.agencySlug,workSlug:item.workSlug||null,origins:[]};if(!entry.origins.includes(origin))entry.origins.push(origin);entries.set(key,entry);}
  data.receipt.selection.forEach((item,i)=>add(item,'Выбор клиента · '+(i+1)));
  values.recommendations.forEach((item,i)=>add(item,'Рекомендация · '+(i+1)));
  values.workflow.teams.forEach(item=>add({...item,workSlug:null},'Команда в работе'));
  readPreparation(form).forEach(item=>add(item,'Внутренняя подготовка'));
  visited.forEach(item=>{if(!entries.has(preparationKey(item)))add(item,'Просмотр досье');});
  return entries;
 }
 function show(entry){
  active=preparationKey(entry);let card=cards().find(node=>node.dataset.preparationCard===active);
  if(!card){host.insertAdjacentHTML('beforeend',cardMarkup(emptyPreparation(entry.agencySlug,entry.workSlug),catalog,data.receipt));card=cards().find(node=>node.dataset.preparationCard===active);}
  for(const node of cards())node.hidden=node!==card;
  card.querySelector('[data-preparation-origin]').textContent=entry.origins?.join(' · ')||'Просмотр досье';select.value=active;
 }
 function sync(){
  const entries=contexts(),key=[...entries].map(([id,item])=>id+':'+item.origins.join(',')).join('|');
  if(key!==optionKey){optionKey=key;select.innerHTML=[...entries.values()].map(item=>{const id=identity(item,catalog,data.receipt);return `<option value="${esc(preparationKey(item))}">${esc(id.name+' · '+id.title+' — '+item.origins.join(', '))}</option>`;}).join('');}
  form.querySelector('[data-preparation-empty]').hidden=entries.size>0;select.hidden=!entries.size;
  if(entries.size)show(entries.get(active)||entries.values().next().value);
  const items=readPreparation(form),length=preparationLength(items),tooLarge=length>PREPARATION_LIMIT||items.length>PREPARATION_MAX_ITEMS;
  count.textContent=`Подготовка: ${length.toLocaleString('ru-RU')} / ${PREPARATION_LIMIT.toLocaleString('ru-RU')} символов во всех записях; ${items.length} / ${PREPARATION_MAX_ITEMS} записей.`+(tooLarge?' Сократите текст перед сохранением.':' Сохраняется общей кнопкой заявки.');count.classList.toggle('reply-warning',tooLarge);
 }
 function open(item){if(form.dataset.busy==='true')return;visited.set(preparationKey(item),item);active=preparationKey(item);sync();selectStage(form,'preparation');form.querySelector('#admin-preparation').scrollIntoView({block:'start'});select.focus({preventScroll:true});}
 select.addEventListener('change',()=>{const entry=contexts().get(select.value);if(entry){active=select.value;show(entry);}});
 host.addEventListener('change',event=>{if(!event.target.matches('[data-dossier-work]'))return;const card=event.target.closest('[data-preparation-card]'),workSlug=event.target.value||null;event.target.value=card.dataset.work;open({agencySlug:card.dataset.agency,workSlug});});
 host.addEventListener('click',event=>{
  const button=event.target.closest('[data-prepare-draft],[data-replace-preparation]');if(!button||form.dataset.busy==='true')return;
  const card=button.closest('[data-preparation-card]'),replace=button.hasAttribute('data-replace-preparation'),fields=[...card.querySelectorAll('[data-preparation-field]')];
  if(replace&&fields.some(field=>field.value.trim())&&!confirm('Заменить все шесть полей подготовки для этой работы? Ручной текст будет заменён наброском. Остальные команды и работы не изменятся.'))return;
  const draft=draftFor({agencySlug:card.dataset.agency,workSlug:card.dataset.work||null},catalog,data.receipt,getValues().workflow);let changed=0;
  for(const field of fields)if(replace||!field.value.trim()){field.value=draft[field.dataset.preparationField];changed++;}
  card.querySelector('[data-generation-status]').textContent=changed?'Набросок подготовлен. Проверьте источники, предположения и формулировки, затем сохраните заявку.':'Пустых полей нет. Ручной текст сохранён; для замены есть отдельное действие.';
  form.dispatchEvent(new Event('input',{bubbles:true}));
 });
 function shortcut(event){if(form.dataset.busy==='true')return;const button=event.target.closest('[data-open-preparation]');if(button){const recommendation=button.closest('[data-recommendation]');open({agencySlug:button.dataset.openPreparation,workSlug:(recommendation?recommendation.querySelector('[data-rec-field=workSlug]').value:button.dataset.preparationWork)||null});}}
 form.addEventListener('click',shortcut);form.ownerDocument.querySelector('.source-request')?.addEventListener('click',shortcut);
 sync();return {sync};
}
export function preparationHistory(items,catalog){
 const entries=normalizePreparation(items);if(!entries.length)return '';
 return `<h4>Внутренняя подготовка на этот момент</h4>${entries.map(entry=>{const id=identity(entry,catalog||{agencies:[],projects:[]});return `<details><summary>${esc(id.name+' · '+id.title)}</summary><dl>${Object.entries(preparationFields).map(([key,{label}])=>`<dt>${esc(label)}</dt><dd class="preparation-history">${esc(entry[key]||'Не заполнено')}</dd>`).join('')}</dl></details>`;}).join('')}`;
}
