export const statusLabels={new:'Новая',working:'В работе',clarify:'Ожидаем уточнений',prepared:'Подборка подготовлена',closed:'Закрыта'};
export const historyStatusLabel=status=>statusLabels[status]||(status==='done'?'Завершена (прежний статус)':status);
export const recommendationInputs=items=>items.map(r=>({agencySlug:r.agencySlug,workSlug:r.workSlug||null,reason:r.reason||'',questions:r.questions||''}));
export const recommendationKey=items=>JSON.stringify(recommendationInputs(items));
export async function recommendationFingerprint(items){
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(recommendationKey(items)));
 return Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,'0')).join('');
}
export function buildCustomerReply(receipt,recommendations){
 const sentence=value=>/[.!?…]$/.test(value.trim())?value.trim():value.trim()+'.';
 const b=receipt.brief,formats={corporate:'Корпоратив',conference:'Конференция',presentation:'Презентация',teambuilding:'Тимбилдинг',private:'Частное событие',other:'Другой формат'};
 const lines=[`Здравствуйте, ${receipt.contact.name}!`,'',`По вашей заявке ${receipt.id}:`,
  `Формат: ${formats[b.format]||'нужно уточнить'}.`,
  `Город: ${b.city||'нужно уточнить'}.`,
  `Дата или период: ${b.dateUnknown?'пока неизвестны':b.date||'нужно уточнить'}.`,
  `Количество гостей: ${b.guests||'нужно уточнить'}.`,
  `Ориентировочный бюджет: ${b.budgetHelp?'нужна помощь с оценкой':b.budget?b.budget+' ₽':'нужно уточнить'}.`];
 if(b.description)lines.push(`Ваши пожелания: ${b.description}`);
 if(recommendations.length){
  lines.push('','Предлагаем обсудить следующие команды:');
  recommendations.forEach((r,i)=>{
   lines.push('',`${i+1}. ${r.name}`,`Почему подходит: ${sentence(r.reason||'обоснование нужно дополнить')}`);
   if(r.work){lines.push(`Релевантная работа: ${r.work.title}.`);if(/^https?:\/\//.test(r.work.source||''))lines.push(`Материалы проекта: ${r.work.source}`);}
   else lines.push('Релевантный кейс пока не выбран — уточним опыт команды по вашей задаче.');
   lines.push(`Предстоит уточнить: ${sentence(r.questions||'доступность даты, стоимость и состав работ')}`);
  });
 }else lines.push('','Пока подбираем подходящие команды. Уточним недостающие детали мероприятия, чтобы подготовить рекомендации.');
 lines.push('','Подборка — рекомендация EventAgencies. Участие и интерес агентств, доступность даты и стоимость пока не подтверждены; их нужно согласовать отдельно.',
  '',recommendations.length?'Напишите, какие варианты вам ближе и что важно учесть при дальнейшем подборе.':'Напишите, какие детали мероприятия уже определены и где нужна наша помощь.','','Команда EventAgencies');
 return lines.join('\n');
}
