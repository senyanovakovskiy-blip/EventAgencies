import {occasions,contactMethods} from './project-store.js';

// Readable copy of the in-memory project; it is not an importable backup.
export function unsavedProjectText(draft){
 const brief=draft?.brief||{},contact=draft?.contact||{},teams=Array.isArray(draft?.selection)?draft.selection:[],notes=draft?.workNotes||{};
 const lines=['Несохранённый проект EventAgencies 101',
  'Формат: '+(occasions[brief.format]||(brief.format==='other'?'Другой формат':brief.format)||'не указан'),
  'Город: '+(brief.city||'не указан'),
  'Дата: '+(brief.date||'не указана')+(brief.dateUnknown?' · отмечено «пока неизвестна»':''),
  'Гостей: '+(brief.guests||'не указано'),
  'Бюджет: '+(brief.budget||'не указан')+(brief.budgetHelp?' · отмечено «нужна помощь с оценкой»':''),
  'Пожелания: '+(brief.description||'не указаны'),
  'Имя: '+(contact.name||'не указано'),
  'Способ связи: '+(contactMethods[contact.method]||contact.method||'не указан'),
  'Контакт: '+(contact.value||'не указан'),'','Выбранные команды и работы:'];
 if(teams.length)for(const team of teams)lines.push('• '+team.agencySlug+(team.workSlug?' · работа: '+team.workSlug:' · без выбранной работы'));
 else lines.push('Нет выбранных команд');
 lines.push('','Личные заметки:');
 const entries=Object.entries(notes).filter(([,value])=>typeof value==='string'&&value);
 if(entries.length)for(const [key,value] of entries)lines.push('• '+key+': '+value);else lines.push('Нет заметок');
 return lines.join('\n');
}
