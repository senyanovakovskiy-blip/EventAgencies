import {briefFields,briefConfirmed,evidenceCurrent,normalizeIdeaPitches,normalizeIdeaSettings,normalizeIdeaSources} from './workflow-model.js';
import {preparationContentKey} from './preparation-model.js';
export const statusLabels={new:'Новая',working:'В работе',clarify:'Ожидаем уточнений',prepared:'Подборка подготовлена',closed:'Закрыта'};
export const historyStatusLabel=status=>statusLabels[status]||(status==='done'?'Завершена (прежний статус)':status);
export const recommendationInputs=items=>items.map(r=>({agencySlug:r.agencySlug,workSlug:r.workSlug||null,reason:r.reason||'',questions:r.questions||''}));
export const recommendationKey=items=>JSON.stringify(recommendationInputs(items));
export const replyKey=(items,brief,teams=[],workflow={})=>JSON.stringify({version:2,recommendations:recommendationInputs(items),brief:brief?Object.fromEntries([...Object.keys(briefFields),'confirmed','version','confirmedVersion'].map(k=>[k,typeof brief[k]==='string'&&Object.hasOwn(briefFields,k)?brief[k].trim():brief[k]??null])):null,teams:teams.map(t=>Object.fromEntries(['agencySlug','response','responseBriefVersion','customerConsent','customerConsentBriefVersion','agencyConsent','agencyConsentBriefVersion','contactsShared','sharedBriefVersion','conversationHeld'].map(k=>[k,t[k]??null]))),ideaMaterial:{preparation:preparationContentKey(workflow.preparation),ideaDraft:typeof workflow.ideaDraft==='string'?workflow.ideaDraft.trim():'',ideaFeedback:typeof workflow.ideaFeedback==='string'?workflow.ideaFeedback.trim():'',ideaSources:normalizeIdeaSources(workflow.ideaSources),ideaPitches:normalizeIdeaPitches(workflow.ideaPitches),ideaSettings:normalizeIdeaSettings(workflow.ideaSettings)}});
export async function recommendationFingerprint(items,brief,teams=[],workflow={}){
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(replyKey(items,brief,teams,workflow)));
 return Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,'0')).join('');
}
export function customerTeamStatus(t,b){
 if(!t)return 'Интерес команды ещё не проверен.';
 if(t.contactsShared&&!t.sharedBriefVersion)return 'Контакты уже переданы'+(t.conversationHeld?', первый разговор состоялся':'')+'. В прежней записи версия брифа не указана; актуальность условий нужно уточнить.';
 const past=t.contactsShared&&t.sharedBriefVersion!==b?.version;
 if(past)return 'Знакомство уже состоялось по прежним условиям. Актуальность договорённостей после изменения брифа нужно уточнить.';
 if(t.conversationHeld)return 'Первый разговор состоялся. Окончательные условия работы согласуются с командой.';
 if(t.contactsShared)return 'Контакты переданы с согласия обеих сторон. Следующий шаг — первый разговор.';
 if(t.response==='pending')return 'Ответ команды пока не получен.';
 if(!evidenceCurrent(t,b,'response'))return 'Есть ответ по прежнему брифу; интерес к актуальной задаче нужно перепроверить.';
 if(t.response==='declined')return 'Команда отказалась от обсуждения этой задачи; подберём другой вариант.';
 if(t.response==='no_response')return 'После обращения ответ не получен; уточним его или предложим другую команду.';
 if(t.response==='interested'){
  if(!briefConfirmed(b))return 'Команда проявила предварительный интерес. Перед знакомством нужно подтвердить актуальный бриф.';
  const customer=t.customerConsent==='yes'&&evidenceCurrent(t,b,'customerConsent'),agency=t.agencyConsent==='yes'&&evidenceCurrent(t,b,'agencyConsent');
  if((t.customerConsent==='no'&&evidenceCurrent(t,b,'customerConsent'))||(t.agencyConsent==='no'&&evidenceCurrent(t,b,'agencyConsent')))return 'Предварительный интерес был получен, но знакомство отклонено одной из сторон.';
  return customer&&agency?'Команда заинтересована в обсуждении; знакомство согласовано обеими сторонами. Контакты ещё не переданы.':'Команда заинтересована в обсуждении. Перед знакомством уточним согласие обеих сторон.';
 }
 return 'Интерес команды нужно уточнить.';
}
export function buildCustomerReply(receipt,recommendations,refined,teams=[]){
 const sentence=value=>/[.!?…]$/.test(value.trim())?value.trim():value.trim()+'.';
 const b=receipt.brief,formats={corporate:'Корпоратив',conference:'Конференция',presentation:'Презентация',teambuilding:'Тимбилдинг',private:'Частное событие',wedding:'Свадьба',birthday:'День рождения или юбилей',product_launch:'Запуск продукта или бренда',opening:'Открытие площадки',new_year:'Новогодний вечер',exhibition:'Выставка или экспозиция',sports_day:'Спортивный день или турнир',other:'Другой формат'};
 const lines=[`Здравствуйте, ${receipt.contact.name}!`,'',`По вашей заявке ${receipt.id}:`,
  `Формат: ${formats[b.format]||'нужно уточнить'}.`,
  `Город: ${refined?.city?.trim()||b.city||'нужно уточнить'}.`,
  `Дата или период: ${refined?.date?.trim()||(b.dateUnknown?'пока неизвестны':b.date||'нужно уточнить')}.`,
  `Количество гостей: ${refined?.guests?.trim()||b.guests||'нужно уточнить'}.`,
  `Ориентировочный бюджет: ${refined?.budget|| (b.budgetHelp?'нужна помощь с оценкой':b.budget?b.budget+' ₽':'нужно уточнить')}.`];
 if(refined?.goal){lines.push('',briefConfirmed(refined)?'Уточнённый бриф согласован с вами:':'Уточнения для вашего подтверждения:',`Цель: ${refined.goal}`,`Услуги: ${refined.services}`,`Стадия выбора: ${refined.stage}`,`Ожидания: ${refined.expectations}`);}
 if(b.description)lines.push(`Пожелания из исходной заявки: ${b.description}`);
 if(recommendations.length){
  lines.push('','Команды по вашей задаче:');
  recommendations.forEach((r,i)=>{
   lines.push('',`${i+1}. ${r.name}`,`Почему подходит: ${sentence(r.reason||'обоснование нужно дополнить')}`);
   if(r.work){lines.push(`Релевантная работа: ${r.work.title}.`);if(/^https?:\/\//.test(r.work.source||''))lines.push(`Материалы проекта: ${r.work.source}`);}
   else lines.push('Релевантный кейс пока не выбран — уточним опыт команды по вашей задаче.');
   lines.push(customerTeamStatus(teams.find(t=>t.agencySlug===r.agencySlug),refined));
   lines.push(`Предстоит уточнить: ${sentence(r.questions||'доступность даты, стоимость и состав работ')}`);
  });
 }else lines.push('','Пока готовим рекомендации. Уточним недостающие детали мероприятия и подходящие команды.');
 lines.push('','Предварительный интерес и знакомство не подтверждают бронирование даты, стоимость или обязательство выполнить проект. Эти условия согласуются с агентством отдельно.',
  '',recommendations.length?'Напишите, какие варианты вам ближе и что важно учесть при дальнейшем обсуждении.':'Напишите, какие детали мероприятия уже определены и где нужна наша помощь.','','Команда EventAgencies 101');
 return lines.join('\n');
}
