import {preparationFields,preparationKey} from './preparation-model.js';

const text=value=>typeof value==='string'?value.trim():'';
const excerpt=(value,max=350)=>{const copy=text(value);return copy.length>max?copy.slice(0,max-1)+'…':copy;};
const quote=(value,max)=>'«'+excerpt(value,max)+'»';
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
 return {copy,path:'/'+kind+'/'+entity.slug,label:kind==='work'?'страницы работы':'страницы агентства'};
}
function pageQuote(page,key,max=250){
 return page?.copy[key]?`Редакционный текст ${page.label} ${page.path} при подготовке наброска, ${publicFields[key]} (фрагмент): ${quote(page.copy[key],max)}.`:'';
}
function pageSummary(page){
 if(!page)return '';
 if(!Object.values(page.copy).some(Boolean))return `Текущее клиентское описание ${page.path} в досье отсутствует; не подменять его исходной справкой.`;
 return `Редакционная подача ${page.label} ${page.path} при подготовке наброска:\n`+Object.entries({lead:130,intro:170,fit:200,participation:230}).filter(([key])=>page.copy[key]).map(([key,max])=>`${publicFields[key]} (фрагмент): ${quote(page.copy[key],max)}`).join('\n');
}
function orientation(pages){
 // Prefer the concrete work's fit, then the agency's fit; use other editorial
 // fields only when fit is unavailable, never infer a fit from rawDescription.
 for(const key of ['fit','lead','intro'])for(const page of pages)if(page?.copy[key])return {page,key};
 return null;
}

/** Pure draft generation. Does not mutate the receipt, workflow or catalogue. */
export function draftFor(entry,catalog,receipt,workflow){
 const {agency,work,name,title,linked}=preparationContext(entry,catalog,receipt),b=workflow?.brief||{},d=linked?work?.details||{}:{};
 const agencyPage=pageFor(agency,'agency'),workPage=linked?pageFor(work,'work'):null,pages=[workPage,agencyPage].filter(Boolean),hook=orientation(pages);
 const chosen=(receipt?.selection||[]).some(s=>preparationKey(s)===preparationKey(entry));
 const anchor=work?`Работа для обсуждения: ${quote(title,130)}; команда ${excerpt(name,100)}.`:`Команда для обсуждения: ${excerpt(name,130)}; релевантную работу ещё нужно выбрать.`;
 const currentNote='Это редакционная формулировка на момент подготовки наброска, не слова клиента. Неизвестно, видел ли клиент именно этот текст при выборе.';
 const hookText=hook?pageQuote(hook.page,hook.key,260):'Текущий редакционный ориентир не передан. Уточнить, какая работа, фотография или деталь привлекла внимание; не додумывать формулировку сайта.';
 const goal=text(b.goal),expectations=text(b.expectations),idea=text(d.idea),role=linked?text(d.role)||text(work?.role):'';
 const briefText=(max=200)=>[
  goal?'Цель в рабочем брифе: '+quote(goal,max)+'.':'Цель в рабочем брифе пока не записана.',
  expectations?'Ожидание в рабочем брифе: '+quote(expectations,max)+'.':'Ожидание в рабочем брифе пока не записано.'
 ].join('\n');
 const participation=pages.filter(page=>page.copy.participation).map(page=>pageQuote(page,'participation',210));
 const roleText=role?`${text(d.role)?'В подробном разборе':'В исходной справке каталога'} роль описана так (фрагмент): ${quote(role,220)}.`:'Подтверждённая для этого контекста роль в справке не раскрыта; её нужно уточнить.';
 const historicalSource=text(d.source)||text(work?.source);
 const historical=idea?`Исторический приём из подробного разбора работы (фрагмент): ${quote(idea,330)}.\n${historicalSource?'Источник для сверки: '+excerpt(historicalSource,220):'Первоисточник приёма в справке не указан; сначала проверить описание.'}`:
  linked&&work?.format?`Историческая отправная точка из каталога — формат ${quote(work.format,130)}. Конкретный приём в подробном разборе не описан; не выводить его из редакционного «Если вам близко».`:'Конкретный исторический приём для этой команды и работы пока не установлен.';
 const draft={
  attraction:[chosen?'Этот вариант сохранён в исходной заявке; мотив выбора в этом факте не записан.':'Это рабочий вариант обсуждения; интерес клиента к нему ещё нужно выяснить.',hookText,currentNote,briefText(160),'Спросить: что именно близко, что не подходит и что хотелось бы иначе? По какой детали или версии страницы клиент выбирал?'].join('\n'),
  strengths:['Гипотеза для обсуждения, не оценка команды.',hook? pageQuote(hook.page,hook.key,180):'Редакционный ориентир отсутствует; пригодность опыта пока не определена.',goal?'Проверить, какие элементы опыта могут быть полезны для цели '+quote(goal,170)+'.':'Сначала согласовать цель, затем обсуждать применимость опыта.',roleText,...participation,'Редакционный fit не подтверждает интерес клиента, компетенции для всей задачи или готовность команды.'].join('\n'),
  unknowns:[...participation,...preparationUnknowns(agency,work,linked),!hook?'Клиентского ориентира нет в переданных данных; выяснить, что увидел и выбрал клиент.':'Нынешняя формулировка страницы не объясняет мотив прежнего выбора клиента.'].join('\n'),
  questions:[
   hook?pageQuote(hook.page,hook.key,260)+'\nЧто из этого вам близко, что не подходит и что вы хотите иначе? Видели ли вы эту формулировку или выбирали по другой детали?':'На какую работу, фотографию или деталь вы опирались? Что близко и что хотите иначе?',
   briefText(170)+'\nКак соотносится этот ориентир с записанной целью и ожиданием? Что важнее сохранить, а чем можно поступиться?',
   idea?'В историческом разборе описан приём '+quote(idea,240)+'. Что имеет смысл для вашей аудитории, а что нужно изменить?':'Конкретный приём в подробной справке не описан. Какую часть опыта стоит разобрать с командой, прежде чем придумывать сценарий?',
   text(d.task)?'Историческая задача в разборе: '+quote(d.task,150)+'. Чем новая задача отличается?':'Какую задачу решала работа и чем наша ситуация отличается?',
   'Что выполняла сама команда и что — партнёры? Какие границы участия и ресурсы нужно подтвердить?',
   'Какие дата, площадка, состав услуг, бюджет и критерии результата требуют согласования?'
  ].join('\n\n'),
  scenario:[
   'РАБОЧАЯ ГИПОТЕЗА — для разговора, не согласованное предложение.',anchor,
   currentNote,...[agencyPage,workPage].map(pageSummary).filter(Boolean),
   !linked&&work?'Связь этой работы с выбранным агентством сейчас не подтверждена. Не переносить её приёмы и авторство на агентство.':'',
   briefText(190),historical,
   '1. Показать текущий ориентир страницы и выяснить, что клиент действительно хочет сохранить, изменить или исключить. Записать его ответ отдельно от редакционного текста.',
   idea?'2. Если клиенту близок ориентир, обсудить адаптацию указанного исторического приёма к записанной цели и ожиданиям. Наметить вход гостя → основной опыт → завершение; для каждого блока проверить роль команды.':'2. После ответа клиента выбрать один конкретный элемент опыта и проверить его с командой. Только затем наметить вход гостя → основной опыт → завершение; неизвестный приём не придумывать за агентство.',
   '3. Сопоставить набросок с аудиторией, площадкой, датой и бюджетом; предусмотреть альтернативу. Записать ресурсы, ограничения и критерии результата. Эффект и доступность заранее не обещать.'
  ].filter(Boolean).join('\n\n'),
  nextStep:[`На разговоре обсудить ${work?'работу '+quote(title,130):'опыт '+excerpt(name,130)} и нынешний ориентир страницы.`, 'Сначала выяснить мотив клиента и связать его с целью/ожиданием в брифе. Затем проверить исторический приём, роль команды и условия; ответственного и срок записать после договорённости.', 'Это внутренний план. Сообщения не отправлены, подтверждения не получены автоматически.'].join('\n')
 };
 // Existing preparation limits apply. Context excerpts are bounded so the
 // opening attribution and hypothesis labels stay attached to the saved text.
 return Object.fromEntries(Object.entries(preparationFields).map(([key,{max}])=>[key,excerpt(draft[key],max)]));
}
