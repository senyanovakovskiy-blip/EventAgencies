const occasionLabels={corporate:'Корпоратив',conference:'Конференция',presentation:'Презентация',teambuilding:'Тимбилдинг',private:'Частное событие',other:'Другой формат'};
const text=value=>typeof value==='string'?value.trim():'';
const unknownBriefValues=new Set(['нужно уточнить','не указано','не указана','не указан','неизвестно','пока неизвестно','дата пока неизвестна','город пока неизвестен','не определено','не определена','не определён','не определен','пока не знаю','не знаю']);
const hasValue=value=>Boolean(text(value))&&!unknownBriefValues.has(text(value).toLocaleLowerCase('ru'));
const asksBudgetHelp=value=>/^(?:нужна помощь с оценкой бюджета|помогите оценить бюджет|нужно оценить бюджет)$/i.test(text(value));
const excerpt=(value,max=240)=>{
 const valueText=text(value);if(valueText.length<=max)return valueText;
 const cut=valueText.slice(0,max-1),space=cut.lastIndexOf(' ');
 return (space>max*.65?cut.slice(0,space):cut)+'…';
};
const quote=(value,max=150)=>'«'+excerpt(value,max)+'»';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl=value=>{try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url.href:'';}catch{return '';}};

const classicPlans={
 corporate:{title:'Корпоратив с общим сюжетом',idea:'Собрать праздник вокруг одной понятной темы: короткое открытие, несколько способов включиться и общее завершение, которое объединяет гостей.',journey:'Встреча и знакомство с темой → активности или общение на выбор → общий финал.',question:'Гостям важнее участвовать в программе, свободно общаться или получить общее яркое впечатление?'},
 conference:{title:'Деловая программа с ясным ритмом',idea:'Дать гостям понятную навигацию, чередовать содержательные блоки с паузами для общения и завершить программу общим выводом или разговором.',journey:'Приветствие и ориентирование → выступления или сессии → перерыв для встреч → короткое подведение итогов.',question:'Что для участников важнее: содержание выступлений, обмен опытом или новые деловые знакомства?'},
 presentation:{title:'Презентация через опыт',idea:'Начать с задачи аудитории, показать основную идею или продукт, дать желающим попробовать ключевую функцию и оставить время на вопросы.',journey:'Интрига и контекст → представление идеи → демонстрация или проба → вопросы и личное общение.',question:'Нужно прежде всего объяснить идею, показать продукт в деле или дать гостям самим его попробовать?'},
 teambuilding:{title:'Командный день с совместным результатом',idea:'Постепенно вовлечь гостей в короткие задания, завершив их общей задачей, где важен вклад разных участников.',journey:'Общий старт → задания с разными ролями → совместная задача → короткий общий финал.',question:'Хотите, чтобы гости свободно выбирали занятия или вместе шли к одному результату?'},
 private:{title:'Личное событие с тёплым финалом',idea:'Построить день вокруг главного человека или повода: приветствие, личные истории и значимые моменты, время для общения, затем общий финал.',journey:'Встреча гостей → главное событие или тосты → свободное общение → финальный общий момент.',question:'Какое чувство или воспоминание вы хотите оставить гостям после события?'},
 other:{title:'Понятная основа: встреча, главное событие, финал',idea:'Сначала помочь гостям освоиться, затем провести одну центральную программу и завершить её общей точкой, связанной с целью мероприятия.',journey:'Приветствие → основная программа → свободное общение или вопросы → общий финал.',question:'Какой момент должен стать главным для гостей и что они должны унести с собой?'}
};
const freshIdeas={
 corporate:{title:'Общий портрет команды',idea:'Предложить гостям выбрать короткое задание или роль, а в течение события собрать их ответы и маленькие вклады в общий результат. В финале показать, как разные решения сложились в одну историю команды.',journey:'Выбор роли → несколько коротких командных заданий → сбор общего результата → совместное открытие финала.',question:'Вам близка идея, где каждый вносит небольшой вклад в общий результат, или важнее готовая программа?'},
 teambuilding:{title:'Миссия с несколькими путями',idea:'Построить командное испытание так, чтобы разные группы выбирали собственную тактику, а финальная задача требовала обменяться найденными решениями.',journey:'Общий сюжет → самостоятельные командные решения → обмен находками → общая финальная задача.',question:'Насколько вашей команде подходят игровые правила и свободный выбор тактики?'},
 conference:{title:'Вопрос, который проходит через весь день',idea:'Собрать один важный вопрос аудитории, дать участникам отметить наиболее полезные направления обсуждения и в финале вернуть разговор к главным выводам.',journey:'Сбор вопроса → выбор тем для обсуждения → содержательные сессии → финальная карта выводов.',question:'Есть ли вопрос, на который участникам важно вместе найти ответ в течение события?'},
 presentation:{title:'Маршрут от задачи к демонстрации',idea:'Предложить гостям выбрать, с какой задачи начать знакомство с продуктом или идеей, затем показать соответствующее решение и завершить короткой открытой сессией вопросов.',journey:'Выбор задачи → тематическая демонстрация → проба решения → вопросы и следующий шаг.',question:'Какие реальные задачи аудитории стоит положить в основу демонстрации?'},
 private:{title:'Карта общих воспоминаний',idea:'Дать гостям возможность оставить короткое пожелание или историю о поводе и собрать из них общий финальный момент.',journey:'Приветствие → сбор историй и пожеланий → личная часть программы → общий финал из голосов гостей.',question:'Комфортно ли гостям делиться историями, или лучше сохранить более камерный формат?'},
 other:{title:'Свободный маршрут с общей точкой',idea:'Дать гостям выбрать один из нескольких коротких способов участия, а затем свести все маршруты к одному общему открытию или финалу.',journey:'Общий старт → выбор маршрута → короткие активности → встреча всех гостей в одной общей точке.',question:'Что гостям важнее: выбрать собственный путь или вместе пройти одну общую программу?'}
};

function worksFor(entry,catalog,receipt,references){
 const candidates=[entry,...(Array.isArray(references)?references:[])],seen=new Set(),result=[];
 for(const item of candidates){
  const agencySlug=text(item?.agencySlug),workSlug=text(item?.workSlug);if(!agencySlug||!workSlug)continue;
  if(seen.has(workSlug))continue;seen.add(workSlug);
  const work=(catalog.projects||[]).find(p=>p.slug===workSlug&&(p.agencySlug===agencySlug||p.agencySlugs?.includes(agencySlug)));
  if(!work)continue;
  const agency=(catalog.agencies||[]).find(a=>a.slug===agencySlug);
  const detailIdea=text(work.details?.idea),summary=detailIdea||text(work.presentation?.intro)||text(work.rawDescription)||text(work.role);
  if(!summary)continue;
  const selected=(receipt?.selection||[]).some(s=>s.agencySlug===agencySlug&&(s.workSlug===workSlug||s.work?.slug===workSlug));
  result.push({agencySlug,agencyName:agency?.name||work.fullTitle||'Команда из каталога',title:work.fullTitle||work.slug,summary:excerpt(summary,260),kind:detailIdea?'приём из подробной справки':'фрагмент описания проекта',url:safeUrl(work.details?.source)||safeUrl(work.source),selected});
  if(result.length===3)break;
 }
 return result;
}

function missingBrief(b,original,budget,budgetHelp){
 const missing=[];
 if(!hasValue(b.city)&&!hasValue(original?.city))missing.push('город');
 if(!hasValue(b.date)&&!hasValue(original?.date)&&!original?.dateUnknown)missing.push('дата или период');
 if(!hasValue(b.guests)&&!hasValue(original?.guests))missing.push('число гостей');
 if(!hasValue(b.services))missing.push('границы и состав услуг');
 if(!budget&&!budgetHelp)missing.push('бюджет');
 return missing;
}
function sourceLine(source){return source.title+' — '+source.agencyName+(source.url?' — '+source.url:'');}
function tailoredFreshIdea(formatKey,goal){
 const brief=text(goal).toLocaleLowerCase('ru');
 if(/знаком|нетворк|сообществ|связ/.test(brief))return {title:'Карта полезных знакомств',idea:'Предложить гостям выбрать тему или задачу, с которой они пришли, и соединить людей вокруг пересекающихся интересов. Завершить короткой общей картой тем, которые собрались.',journey:'Выбор темы → несколько коротких знакомств по интересу → фиксация общих тем → общий вывод или следующий шаг.',question:'Хотите ли вы, чтобы знакомство было свободным или организованным вокруг тем и задач?'};
 if(/презент|запуск|показ|продукт/.test(brief))return {title:'Маршрут от задачи к демонстрации',idea:'Пусть гости выберут одну из реальных задач аудитории, затем увидят соответствующую демонстрацию и смогут попробовать решение. Не привязывать показ к функциям, пока их не согласовали.',journey:'Выбор задачи → короткая демонстрация → проба или вопросы → открытая финальная сессия.',question:'Какие реальные задачи аудитории стоит положить в основу демонстрации?'};
 if(/обуч|обмен|знани|практик|эксперт/.test(brief))return {title:'Мастерская вопросов',idea:'Собрать важные вопросы участников до события, выбрать несколько тем и предложить малым группам подготовить короткие решения для общего обсуждения.',journey:'Сбор вопросов → выбор тем → работа в небольших группах → обмен решениями и комментарии эксперта.',question:'Какие вопросы участникам важно разобрать на практике, а не только услышать в докладах?'};
 if(/команд|сотруд|сплот|вовлеч/.test(brief))return {title:'Общий результат из вкладов команды',idea:'Дать группам разные короткие задачи и соединить их результаты в общий финальный объект или решение. Участники увидят, как отдельные вклады складываются в целое.',journey:'Общий контекст → задачи в небольших группах → соединение результатов → совместный финал.',question:'Что команде будет интереснее создать вместе: предмет, решение или общую историю?'};
 return freshIdeas[formatKey]||freshIdeas.other;
}
function guestPlanning(value){
 const nums=[...text(value).matchAll(/\d[\d\s\u00a0]*/g)].map(match=>Number(match[0].replace(/[\s\u00a0]/g,''))).filter(Number.isFinite);
 if(!nums.length)return 'Число гостей пока не уточнено; перед выбором механики определить размер групп и потоков.';
 const guests=Math.max(...nums);
 if(guests>350)return `Предварительный ориентир для аудитории «${text(value)}»: рассмотреть распределение по зонам или слотам, навигацию и управление очередями; это не расчёт вместимости.`;
 if(guests>=80)return `Предварительный ориентир для аудитории «${text(value)}»: продумать несколько потоков или малых групп и ясный маршрут; точный расчёт подтвердить с площадкой.`;
 return `Предварительный ориентир для аудитории «${text(value)}»: рассмотреть компактный общий формат и небольшие группы; подтвердить вместимость с площадкой.`;
}

export function eventIdeasSignature({entry,receipt,workflow,references=[],formatOverride=''}){
 const b=workflow?.brief||{},original=receipt?.brief||{};
 return JSON.stringify({entry:{agencySlug:entry?.agencySlug||'',workSlug:entry?.workSlug||''},original:{format:original.format||'',description:original.description||'',city:original.city||'',date:original.date||'',guests:original.guests||'',budget:original.budget||'',budgetHelp:Boolean(original.budgetHelp),dateUnknown:Boolean(original.dateUnknown)},formatOverride,brief:{goal:b.goal||'',city:b.city||'',date:b.date||'',guests:b.guests||'',services:b.services||'',budget:b.budget||'',expectations:b.expectations||'',confirmed:Boolean(b.confirmed),version:b.version||0},references:(references||[]).map(r=>[r.agencySlug||'',r.workSlug||'']).sort((a,b)=>a.join('/').localeCompare(b.join('/')))});
}

export function buildEventIdeas({entry,catalog,receipt,workflow,references=[],formatOverride=''}){
 const original=receipt?.brief||{},b=workflow?.brief||{},requestFormatKey=text(original.format),requestFormatLabel=occasionLabels[requestFormatKey]||(requestFormatKey?'Формат из заявки':'Формат пока не указан');
 const classicFormatKey=Object.hasOwn(classicPlans,formatOverride)?formatOverride:Object.hasOwn(classicPlans,requestFormatKey)?requestFormatKey:'other';
 const classicFormatLabel=occasionLabels[classicFormatKey]||'Другой формат',classicPlan=classicPlans[classicFormatKey]||classicPlans.other,requestPlan=classicPlans[requestFormatKey]||classicPlans.other;
 const goal=text(b.goal)||text(original.description),expectations=text(b.expectations),budgetHelp=Boolean(original.budgetHelp||asksBudgetHelp(b.budget)),budget=hasValue(b.budget)&&!asksBudgetHelp(b.budget)?text(b.budget):hasValue(original.budget)?text(original.budget):'',services=hasValue(b.services)?text(b.services):'';
 const sources=worksFor(entry,catalog,receipt,references),missing=missingBrief(b,original,budget,budgetHelp);
 const budgetNote=budgetHelp&&!budget?'В заявке просили помочь с оценкой бюджета; подготовить варианты разного масштаба.':'';
 const dateStillUnknown=!hasValue(b.date)&&!hasValue(original.date)&&Boolean(original.dateUnknown);
 const completeNote=dateStillUnknown?'Параметры указаны, точная дата пока неизвестна. Подтвердите, что остальные параметры можно использовать для расчёта и сценария.':'Параметры указаны; подтвердите, что их можно использовать для расчёта и сценария.';
 const openQuestions=(missing.length?'До оценки нужно уточнить: '+missing.join(', ')+'.':completeNote)+(budgetNote?' '+budgetNote:'');
 const notConfirmed=b.confirmed?'Бриф отмечен как подтверждённый. Любое изменение параметров всё равно нужно согласовать.':'Текущий рабочий бриф ещё не подтверждён заказчиком.';
 const goalNote=goal?'Цель или пожелание из брифа: '+quote(goal,170)+'.':'';
 const expectationNote=expectations?'Ожидание заказчика: '+quote(expectations,150)+'.':'';
 const servicesNote=services?'Услуги по заявке: '+quote(services,150)+'. Новые элементы нужно отдельно согласовать.':'';
 const city=hasValue(b.city)?text(b.city):hasValue(original.city)?text(original.city):'город не уточнён';
 const date=hasValue(b.date)?text(b.date):hasValue(original.date)?text(original.date):original.dateUnknown?'дата пока неизвестна':'срок не уточнён';
 const locationTiming=city!=='город не уточнён'||hasValue(b.date)||hasValue(original.date)?`Город и срок: ${city}; ${date}. Если часть программы будет на улице, предусмотреть резерв.`:'Город и дата пока не уточнены.';
 const planning=[locationTiming,services?`Проверить, что сценарий укладывается в состав услуг: ${quote(services,140)}.`:'Уточнить границы услуг, чтобы не включить незаказанные элементы.',budget?`Собрать базовую комплектацию в рамках бюджета «${excerpt(budget,100)}», а расширения просчитать отдельно.`:budgetHelp?'Для оценки бюджета предложить две комплектации разного масштаба.':'Бюджет не указан; отдельно оценить базовую и расширенную комплектации.'];
 const commonChecks=[openQuestions,notConfirmed,...planning].join(' ');
 const novel=tailoredFreshIdea(requestFormatKey,goal||expectations);
 const classicWhy=requestFormatKey&&classicFormatKey===requestFormatKey?'Каркас совпадает с форматом «'+requestFormatLabel+'» из заявки. Это совпадение по формату, не прогноз результата.':requestFormatKey?'Для сравнения выбрана классическая основа «'+classicFormatLabel+'»; в заявке указан формат «'+requestFormatLabel+'». Проверьте её соответствие цели.':'Классическая основа «'+classicFormatLabel+'» выбрана для сравнения; формат события в заявке пока не указан.';
 const options=[{
  kind:'Классическая основа',title:classicPlan.title,idea:classicPlan.idea,journey:classicPlan.journey,
  why:[classicWhy,goalNote,expectationNote,servicesNote].filter(Boolean).join(' '),
  check:'Согласовать главный момент программы, распределение ролей и резервный план.',question:classicPlan.question,sources:[]
 }];
 if(sources.length){
  const source=sources[0],sourceReason=source.selected?'Эта работа есть в исходном выборе клиента; сам мотив выбора не записан — его нужно спросить.':'Эта работа добавлена к внутреннему обсуждению; это не означает, что клиент уже выбрал или одобрил её.';
  options.push({
   kind:'Развить элемент кейса',title:'Взять один приём и адаптировать его',
   idea:'Не переносить весь проект целиком. Взять как отправную точку '+source.kind+': '+quote(source.summary,250)+'. Переработать этот элемент под цель и ожидания нового события.',
   journey:'Понять, что именно привлекло в примере → выбрать один элемент для адаптации → встроить его в основной опыт гостей → завершить общей точкой. '+guestPlanning(b.guests),
   why:[sourceReason,goalNote,expectationNote,servicesNote].filter(Boolean).join(' '),
   check:'Проверить авторство и границы участия команды, возможность адаптации и отличие новой аудитории от аудитории кейса. Не переносить показатели прошлого события на новое.',
   question:'Что именно в этом примере хотелось бы сохранить: сам приём, атмосферу, выбор для гостей или общий финал?',sources:[source]
  });
 }
 const first=sources[0],second=sources[1];
 if(first&&second){
  const joint=first.agencySlug!==second.agencySlug;
  options.push({
   kind:'Сочетание двух кейсов',title:'Гибрид: соединить два элемента в один маршрут',
   idea:'Взять '+quote(first.summary,145)+' из «'+first.title+'» как отправную точку, затем развить '+quote(second.summary,145)+' из «'+second.title+'» в центральный опыт. Связать их общей темой и завершить единым финалом. Это новое сочетание, а не готовый формат из портфолио.',
   journey:'Вступление к общей теме → первый элемент → переход к более активной или содержательной части → общий финал. '+guestPlanning(b.guests),
   why:'Можно соединить два выбранных для обсуждения опыта. '+(first.selected&&second.selected?'Обе работы есть в выборе клиента, но его мотив выбора нужно уточнить.':'Сами источники ещё не подтверждают интерес клиента к такому сочетанию.'),
   check:'Проверить, что элементы поддерживают одну цель, укладываются в тайминг и не перегружают площадку.'+(joint?' Уточнить у обеих команд возможность совместной работы и распределение ответственности.':''),
   question:'Видите ли вы общий смысл, который может связать эти два элемента, или лучше оставить один из них главным?',sources:[first,second]
  });
 }else if(first){
  options.push({
   kind:'Сочетание',title:'Гибрид: приём из кейса внутри классической программы',
   idea:'Оставить понятную структуру «встреча → основная программа → общий финал», а '+quote(first.summary,220)+' из «'+first.title+'» превратить в один центральный момент. Изменить масштаб и подачу под новую аудиторию.',
   journey:'Короткое открытие → основной приём из выбранного примера → свободное общение или обмен → общий финал. '+guestPlanning(b.guests),
   why:'Классический каркас снижает неопределённость структуры, а отдельный элемент из кейса добавляет индивидуальность. Это рабочая гипотеза, а не доказательство высокой вероятности успеха.',
   check:'Подтвердить, что этот элемент подходит новой аудитории и помещается в программу; обсудить, какой блок можно упростить, если не хватает времени или ресурсов.',
   question:'Хотите сохранить простую структуру события и выделить один яркий элемент, или сделать весь день тематическим?',sources:[first]
  });
 }else{
  options.push({
   kind:'Сочетание',title:'Гибрид: классическая программа плюс участие гостей',
   idea:'Сохранить привычную структуру выбранного формата, но дать гостям один небольшой выбор или вклад, который вернётся в общем финале. Так появляется интерактивный момент без перестройки всей программы.',
   journey:requestPlan.journey+' Добавить один выбор гостей, который влияет на общий финал. '+guestPlanning(b.guests),
   why:'Можно начать с понятной основы и ограничить новизну одним проверяемым элементом.',
   check:'Проверить, подходит ли аудитории интерактив и можно ли провести его без очередей и давления на гостей.',
   question:'Насколько комфортно вашей аудитории активно участвовать, а не только наблюдать?',sources:[]
  });
 }
 options.push({
  kind:'Новая идея',title:novel.title,idea:novel.idea,journey:novel.journey,
  why:[goal?'Можно напрямую проверить, поддерживает ли идея заявленную цель '+quote(goal,130)+'.':'Это самостоятельная творческая гипотеза, пока без привязки к сформулированной цели.',expectationNote].filter(Boolean).join(' '),
   check:'У идеи нет подтверждённой статистики для этой аудитории; проверить реакцию клиента и сделать простую схему до разработки.',
  question:novel.question,sources:[]
 });
  const cityContext=hasValue(b.city)?text(b.city):hasValue(original.city)?text(original.city):'';
  const dateContext=hasValue(b.date)?text(b.date):hasValue(original.date)?text(original.date):original.dateUnknown?'Дата пока неизвестна':'';
  const guestsContext=hasValue(b.guests)?text(b.guests):hasValue(original.guests)?text(original.guests):'';
  return {context:[requestFormatKey?requestFormatLabel:'Формат уточняется',goal&&'Цель: '+excerpt(goal,100),cityContext&&'г. '+cityContext,dateContext,guestsContext&&guestsContext+' гостей',budget&&'Бюджет: '+excerpt(budget,60),budgetHelp&&!budget&&'Бюджет нужно оценить',services&&'Услуги: '+excerpt(services,90)].filter(Boolean).join(' · '),commonChecks,options};
}

export function eventIdeasMarkup(id,format=''){
 const key=esc(id);
 const selectedFormat=Object.hasOwn(classicPlans,format)?format:'other';
 const formats=Object.entries(classicPlans).map(([value,item])=>`<option value="${value}"${value===selectedFormat?' selected':''}>${esc(item.title)}</option>`).join('');
 return `<section class="event-idea-generator" data-event-idea-generator aria-labelledby="${key}-title"><h4 id="${key}-title">Варианты события</h4><p class="small muted">Соберите классическую основу, развитие элемента из кейса, сочетание идей и новый ход по текущему брифу. Идеи остаются внутренними; оценка показывает основания для обсуждения, а не вероятность успеха.</p><label class="event-idea-format">Классический формат для сравнения<select data-event-idea-format>${formats}</select></label><p class="small muted">Смена формата влияет только на классический каркас; остальные идеи учитывают исходный бриф.</p><div class="preparation-actions"><button type="button" class="secondary" data-generate-event-ideas>Собрать варианты по брифу</button></div><p class="small muted" data-event-ideas-status role="status" aria-live="polite" aria-atomic="true" tabindex="-1"></p><div class="event-idea-results" data-event-ideas-results hidden></div></section>`;
}

export function renderEventIdeas({context,commonChecks,options}){
 return `${context?`<p class="event-idea-context">Контекст заявки: ${esc(context)}.</p>`:''}${commonChecks?`<div class="event-idea-common-checks"><strong>Что учесть во всех вариантах.</strong><p>${esc(commonChecks)}</p></div>`:''}<div class="event-idea-grid">${options.map((item,index)=>`<article class="event-idea-card"><span class="eyebrow">${esc(item.kind)}</span><h5>${esc(item.title)}</h5><p><strong>Идея.</strong> ${esc(item.idea)}</p><p><strong>Путь гостей.</strong> ${esc(item.journey)}</p><p><strong>Почему может подойти.</strong> ${esc(item.why)}</p><p><strong>Что проверить.</strong> ${esc(item.check)}</p><p><strong>Спросить заказчика.</strong> ${esc(item.question)}</p>${item.sources?.length?`<div class="event-idea-sources"><strong>Основа из портфолио</strong>${item.sources.map(source=>source.url?`<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.title)} · ${esc(source.agencyName)} ↗</a>`:`<span>${esc(source.title)} · ${esc(source.agencyName)}</span>`).join('')}</div>`:''}<button type="button" class="secondary" data-append-event-idea="${index}" aria-label="Добавить вариант «${esc(item.title)}» в черновой сценарий">Добавить в черновой сценарий</button></article>`).join('')}</div>`;
}

export function eventIdeaText(item,commonChecks=''){
 const parts=[
  'ВАРИАНТ: '+item.title+' ('+item.kind+')',
  'Идея: '+item.idea,
  'Путь гостей: '+item.journey,
  'Почему может подойти: '+item.why,
  commonChecks?'Что учесть во всех вариантах: '+commonChecks:'',
  'Что проверить: '+item.check,
  'Спросить заказчика: '+item.question,
  item.sources?.length?'Основа из портфолио: '+item.sources.map(sourceLine).join(' | '):''
 ];
 return parts.filter(Boolean).join('\n');
}
