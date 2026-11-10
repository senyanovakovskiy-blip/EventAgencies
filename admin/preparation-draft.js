import {preparationDraftFields,preparationKey} from './preparation-model.js';
import {customerWorkAnswersFromBrief} from './event-ideas.js';

const text=value=>typeof value==='string'?value.trim():'';
const excerpt=(value,max=350)=>{const copy=text(value);return copy.length>max?copy.slice(0,max-1)+'…':copy;};
const quote=(value,max)=>'«'+excerpt(value,max)+'»';
const normalizePrompt=value=>text(value).normalize('NFKC').toLocaleLowerCase('ru-RU').replaceAll('ё','е').replace(/\s+/g,' ');
const publicFields={lead:'краткое описание',intro:'описание',fit:'«Если вам близко»',participation:'участие и его границы'};

export function preparationContext(entry,catalog,receipt){
 const agency=(catalog.agencies||[]).find(a=>a.slug===entry.agencySlug),work=(catalog.projects||[]).find(p=>p.slug===entry.workSlug);
 const original=(receipt?.selection||[]).find(s=>s.agencySlug===entry.agencySlug);
 return {
  agency,work,
  linked:Boolean(work&&(work.agencySlug===entry.agencySlug||work.agencySlugs?.includes(entry.agencySlug))),
  name:agency?.name||original?.name||'Недоступное агентство · '+entry.agencySlug,
  title:work?.fullTitle||(original?.work?.slug===entry.workSlug?original.work.title:null)||(entry.workSlug?'Недоступная работа · '+entry.workSlug:'Без конкретной работы')
 };
}
export function preparationUnknowns(agency,work,linked){
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

// These are current editorial page fields, not source facts, receipt snapshots,
// customer statements or evidence that the customer saw a particular wording.
function pageFor(entity,kind){
 if(!entity)return null;
 const copy=Object.fromEntries(Object.keys(publicFields).map(key=>[key,text(entity.presentation?.[key])]));
 const discussionPrompts=Array.isArray(entity.presentation?.discussionPrompts)?entity.presentation.discussionPrompts.filter(value=>typeof value==='string'&&value.trim()).slice(0,3):[];
 return {copy,discussionPrompts,path:'/'+kind+'/'+entity.slug,label:kind==='work'?'страницы работы':'страницы агентства'};
}
function pageQuote(page,key,max=250){
 return page?.copy[key]?`Редакционный текст ${page.label} ${page.path} при подготовке наброска, ${publicFields[key]} (фрагмент): ${quote(page.copy[key],max)}.`:'';
}
function pageSummary(page,{compact=false,answeredPrompts=new Set()}={}){
 if(!page)return '';
 const limits=compact?{lead:90,fit:140,participation:150}:{lead:130,intro:170,fit:200,participation:230};
 const copy=Object.entries(limits).filter(([key])=>page.copy[key]).map(([key,max])=>`${publicFields[key]} (фрагмент): ${quote(page.copy[key],max)}`).join('\n');
 const remaining=page.discussionPrompts.filter(prompt=>!answeredPrompts.has(normalizePrompt(prompt))).slice(0,compact?1:3);
 const prompts=remaining.length?(answeredPrompts.size?'Ещё не отвеченные вопросы '+page.label+' (редакционные ориентиры):\n':'Вопросы '+page.label+' (редакционные ориентиры, не ответы клиента):\n')+remaining.map(prompt=>'• '+(compact?excerpt(prompt,150):prompt)).join('\n'):'';
 if(!copy&&!prompts)return `Текущее клиентское описание ${page.path} в досье отсутствует; не подменять его исходной справкой.`;
 return `Редакционная подача ${page.label} ${page.path} при подготовке наброска:\n`+[copy,prompts].filter(Boolean).join('\n');
}
function orientation(pages){
 // Prefer the concrete work's fit, then the agency's fit; use other editorial
 // fields only when fit is unavailable, never infer a fit from rawDescription.
 for(const key of ['fit','lead','intro'])for(const page of pages)if(page?.copy[key])return {page,key};
 return null;
}

/** Pure six-field draft generation. Manual follow-up notes are never generated. */
export function draftFor(entry,catalog,receipt,workflow){
 const {agency,work,name,title,linked}=preparationContext(entry,catalog,receipt),b=workflow?.brief||{},d=linked?work?.details||{}:{};
 const agencyPage=pageFor(agency,'agency'),workPage=linked?pageFor(work,'work'):null,pages=[workPage,agencyPage].filter(Boolean),hook=orientation(pages);
 const chosen=(receipt?.selection||[]).some(s=>preparationKey(s)===preparationKey(entry));
 const clientAnswers=linked?customerWorkAnswersFromBrief(receipt?.brief?.description,catalog,entry.agencySlug,entry.workSlug):[];
 const clientAnswer=clientAnswers[0]||null;
 const answerEvidence=(questionMax,answerMax)=>clientAnswer?[
  'Из отправленных пожеланий к этой работе и команде (слова клиента, не оценка нового сценария):',
  'Вопрос к примеру, фрагмент: '+quote(clientAnswer.question,questionMax)+'.',
  'Ответ клиента, дословный фрагмент: '+quote(clientAnswer.answer,answerMax)+'.',
  clientAnswers.length>1?'Есть ещё '+(clientAnswers.length-1)+' ответ(а) в исходной заявке; сверить полный текст у вариантов события.':''
 ].filter(Boolean).join('\n'):'';
 const anchor=work?`Работа для обсуждения: ${quote(title,130)}; команда ${excerpt(name,100)}.`:`Команда для обсуждения: ${excerpt(name,130)}; релевантную работу ещё нужно выбрать.`;
 const currentNote='Это редакционная формулировка на момент подготовки наброска, не слова клиента. Неизвестно, видел ли клиент именно этот текст при выборе.';
 const hookText=hook?pageQuote(hook.page,hook.key,260):'Текущий редакционный ориентир не передан. Уточнить, какая работа, фотография или деталь привлекла внимание; не додумывать формулировку сайта.';
 const goal=text(b.goal),expectations=text(b.expectations),idea=text(d.idea),role=linked?text(d.role)||text(work?.role):'';
 const briefText=(max=200)=>[
  goal?'Цель в рабочем брифе: '+quote(goal,max)+'.':'Цель в рабочем брифе пока не записана.',
  expectations?'Ожидание в рабочем брифе: '+quote(expectations,max)+'.':'Ожидание в рабочем брифе пока не записано.'
 ].join('\n');
 const participation=pages.filter(page=>page.copy.participation).map(page=>pageQuote(page,'participation',210));
 const answeredPrompts=new Set(clientAnswers.map(item=>normalizePrompt(item.question)));
 const casePrompts=pages.flatMap(page=>page.discussionPrompts.map(prompt=>({path:page.path,prompt}))).filter(item=>!answeredPrompts.has(normalizePrompt(item.prompt)));
 const casePromptText=casePrompts.length?'Вопросы со страниц работы и агентства — редакционные ориентиры для уточнения, не пожелания клиента:\n'+casePrompts.map(({prompt})=>'• '+prompt).join('\n'):'';
 const remainingPromptText=casePrompts.length?'Остальные вопросы со страниц работы и агентства, если они ещё актуальны:\n'+casePrompts.slice(0,2).map(({prompt})=>'• '+excerpt(prompt,145)).join('\n')+(casePrompts.length>2?'\nОстальные вопросы смотрите на страницах работы и агентства.':''):'';
 const roleText=role?`${text(d.role)?'В подробном разборе':'В исходной справке каталога'} роль описана так (фрагмент): ${quote(role,220)}.`:'Подтверждённая для этого контекста роль в справке не раскрыта; её нужно уточнить.';
 const historicalSource=text(d.source)||text(work?.source);
 const historical=idea?`Исторический приём из подробного разбора работы (фрагмент): ${quote(idea,330)}.\n${historicalSource?'Источник для сверки: '+excerpt(historicalSource,220):'Первоисточник приёма в справке не указан; сначала проверить описание.'}`:
  linked&&work?.format?`Историческая отправная точка из каталога — формат ${quote(work.format,130)}. Конкретный приём в подробном разборе не описан; не выводить его из редакционного «Если вам близко».`:'Конкретный исторический приём для этой команды и работы пока не установлен.';
 const draft={
  attraction:clientAnswer?[
   chosen?'Работа выбрана в исходной заявке; к ней также передан ответ клиента.':'Клиент добавил эту работу в пожелания и передал ответ к ней; пара «работа — команда» не отмечена в исходном выборе.',
   answerEvidence(110,260),briefText(80),hook?pageQuote(hook.page,hook.key,130):hookText,
   'Уточнить смысл ответа и то, что клиент хотел бы сохранить, изменить или исключить. Сама запись не подтверждает весь новый сценарий.'
  ].join('\n'):[chosen?'Этот вариант сохранён в исходной заявке; мотив выбора в этом факте не записан.':'Это рабочий вариант обсуждения; интерес клиента к нему ещё нужно выяснить.',hookText,currentNote,briefText(160),'Спросить: что именно близко, что не подходит и что хотелось бы иначе? По какой детали или версии страницы клиент выбирал?'].join('\n'),
  strengths:['Гипотеза для обсуждения, не оценка команды.',hook? pageQuote(hook.page,hook.key,180):'Редакционный ориентир отсутствует; пригодность опыта пока не определена.',goal?'Проверить, какие элементы опыта могут быть полезны для цели '+quote(goal,170)+'.':'Сначала согласовать цель, затем обсуждать применимость опыта.',roleText,...participation,'Редакционный fit не подтверждает интерес клиента, компетенции для всей задачи или готовность команды.'].join('\n'),
  unknowns:[...participation,...preparationUnknowns(agency,work,linked),clientAnswer?'Ответ клиента передан с примером; уточнить, как он относится к новой задаче и что остаётся открытым.':!hook?'Клиентского ориентира нет в переданных данных; выяснить, что увидел и выбрал клиент.':'Нынешняя формулировка страницы не объясняет мотив прежнего выбора клиента.'].join('\n'),
  questions:clientAnswer?[
   answerEvidence(100,220),
   'Сверить понимание: что в ответе важно сохранить, что изменить или исключить? Как это связано с целью мероприятия?',
   ...(remainingPromptText?[remainingPromptText]:[]),
   briefText(100)+'\nКакая цель и какое ожидание важнее при выборе сценария?',
   ...(idea?['Исторический приём: '+quote(idea,100)+'. Что подходит этой аудитории, а что нужно изменить?']:[]),
   ...(text(d.task)?['Историческая задача: '+quote(d.task,100)+'. Чем новая задача отличается?']:[]),
   'Что выполняла команда сама, какие ресурсы и границы участия нужно подтвердить?',
   'Какие дата, площадка, состав услуг, бюджет и критерии результата требуют согласования?'
  ].join('\n\n'):[
   hook?pageQuote(hook.page,hook.key,260)+'\nЧто из этого вам близко, что не подходит и что вы хотите иначе? Видели ли вы эту формулировку или выбирали по другой детали?':'На какую работу, фотографию или деталь вы опирались? Что близко и что хотите иначе?',
   ...(casePromptText?[casePromptText]:[]),
   briefText(170)+'\nКак соотносится этот ориентир с записанной целью и ожиданием? Что важнее сохранить, а чем можно поступиться?',
   idea?'В историческом разборе описан приём '+quote(idea,240)+'. Что имеет смысл для вашей аудитории, а что нужно изменить?':'Конкретный приём в подробной справке не описан. Какую часть опыта стоит разобрать с командой, прежде чем придумывать сценарий?',
   text(d.task)?'Историческая задача в разборе: '+quote(d.task,150)+'. Чем новая задача отличается?':'Какую задачу решала работа и чем наша ситуация отличается?',
   'Что выполняла сама команда и что — партнёры? Какие границы участия и ресурсы нужно подтвердить?',
   'Какие дата, площадка, состав услуг, бюджет и критерии результата требуют согласования?'
  ].join('\n\n'),
  scenario:[
   'РАБОЧАЯ ГИПОТЕЗА — для разговора, не согласованное предложение.',anchor,
   ...(clientAnswer?[answerEvidence(140,420)]:[]),
   clientAnswer?'Следующий текст страницы — редакционная формулировка на момент подготовки наброска, не слова клиента. Неизвестно, видел ли клиент именно её.':currentNote,
   ...(clientAnswer?[pageSummary(workPage,{compact:true,answeredPrompts})]:[agencyPage,workPage].map(page=>pageSummary(page))).filter(Boolean),
   clientAnswer?(casePrompts.length?'Часть вопросов из карточки ещё не отвечена. Сначала сверить уже записанный ответ; остальные вопросы задавать по необходимости.':'Ответ на вопрос к этой работе уже записан. Сверить его смысл, не задавая тот же вопрос повторно.'):
    casePrompts.length?'Сначала уточнить, какой из вопросов в карточке действительно близок клиенту. Его ответ, а не сам вопрос, может стать отправной точкой сценария.':'',
   !linked&&work?'Связь этой работы с выбранным агентством сейчас не подтверждена. Не переносить её приёмы и авторство на агентство.':'',
   briefText(190),historical,
   clientAnswer?'1. Сверить уже переданный ответ с клиентом: что сохранить, изменить или исключить в новом событии. Отделить слова клиента от редакционной подачи страницы.':'1. Показать текущий ориентир страницы и выяснить, что клиент действительно хочет сохранить, изменить или исключить. Записать его ответ отдельно от редакционного текста.',
   idea?'2. Если клиенту близок ориентир, обсудить адаптацию указанного исторического приёма к записанной цели и ожиданиям. Наметить вход гостя → основной опыт → завершение; для каждого блока проверить роль команды.':clientAnswer?'2. После сверки ответа выбрать один конкретный элемент опыта и проверить его с командой. Затем наметить вход гостя → основной опыт → завершение; неизвестный приём не придумывать за агентство.':'2. После ответа клиента выбрать один конкретный элемент опыта и проверить его с командой. Только затем наметить вход гостя → основной опыт → завершение; неизвестный приём не придумывать за агентство.',
   '3. Сопоставить набросок с аудиторией, площадкой, датой и бюджетом; предусмотреть альтернативу. Записать ресурсы, ограничения и критерии результата. Эффект и доступность заранее не обещать.'
  ].filter(Boolean).join('\n\n'),
  nextStep:[`На разговоре обсудить ${work?'работу '+quote(title,130):'опыт '+excerpt(name,130)} и нынешний ориентир страницы.`, clientAnswer?'Сначала уточнить уже переданный ответ клиента и связать его с целью/ожиданием в брифе. Затем проверить исторический приём, роль команды и условия; ответственного и срок записать после договорённости.':'Сначала выяснить мотив клиента и связать его с целью/ожиданием в брифе. Затем проверить исторический приём, роль команды и условия; ответственного и срок записать после договорённости.', 'Это внутренний план. Сообщения не отправлены, подтверждения не получены автоматически.'].join('\n')
 };
 // Existing preparation limits apply. Context excerpts are bounded so the
 // opening attribution and final safety question/step stay attached to the saved text.
 const bounded=(key,max)=>{
  const value=text(draft[key]);
  if(!clientAnswer||!['attraction','questions','scenario'].includes(key)||value.length<=max)return excerpt(value,max);
  const boundary=value.lastIndexOf('\n'),tail=value.slice(boundary+1).trim(),headMax=max-tail.length-2;
  return boundary>0&&headMax>=100?excerpt(value.slice(0,boundary),headMax)+'\n\n'+tail:excerpt(value,max);
 };
 return Object.fromEntries(Object.entries(preparationDraftFields).map(([key,{max}])=>[key,bounded(key,max)]));
}
