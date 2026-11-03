const numberFormat=new Intl.NumberFormat('ru-RU');
const fields=[['format','Формат','Выбрать формат'],['city','Город','Указать город'],['date','Дата или период','Указать дату'],['guests','Гости','Указать количество'],['budget','Бюджет','Указать бюджет']];
const formatNumber=value=>value!==''&&Number.isFinite(Number(value))?numberFormat.format(Number(value)):value;

export function setupBriefSummary(formatName){
 const host=document.getElementById('project-summary');
 if(!host)return()=>{};
 const description=document.getElementById('project-description'),toggle=document.querySelector('[data-toggle-wishes-summary]');
 let currentDescription='',expanded=false;
 const cards=fields.map(([field,label,placeholder])=>{
  const button=document.createElement('button');button.type='button';button.className='brief-field-card';button.dataset.editBrief='';button.dataset.briefField=field;
  const caption=document.createElement('small');caption.textContent=label;
  const value=document.createElement('strong');
  const arrow=document.createElement('i');arrow.textContent='↗';arrow.setAttribute('aria-hidden','true');
  button.append(caption,value,arrow);host.append(button);
  return {field,label,placeholder,button,value};
 });
 function renderDescription(){
  const lines=currentDescription.split('\n'),firstLines=lines.slice(0,4).join('\n'),characters=Array.from(firstLines);
  const truncated=lines.length>4||characters.length>260;
  const preview=characters.slice(0,260).join('').trimEnd();
  description.textContent=currentDescription?(truncated&&!expanded?preview+'…':currentDescription):'Добавьте задачу события, настроение и важные детали.';
  description.classList.toggle('is-empty',!currentDescription);
  toggle.hidden=!truncated;toggle.setAttribute('aria-expanded',String(expanded&&truncated));
  toggle.textContent=expanded?'Свернуть пожелания ↑':'Читать пожелания полностью ↓';
  document.querySelector('[data-edit-wishes]').textContent=currentDescription?'Изменить':'Добавить';
 }
 toggle.addEventListener('click',()=>{expanded=!expanded;renderDescription();});
 return brief=>{
  const values={format:brief.format&&formatName(brief.format),city:brief.city,date:brief.dateUnknown?'Дата пока неизвестна':brief.date,guests:formatNumber(brief.guests),budget:brief.budgetHelp?'Нужна оценка':brief.budget!==''?formatNumber(brief.budget)+' ₽':''};
  for(const {field,label,placeholder,button,value} of cards){
   const filled=Boolean(values[field]);value.textContent=values[field]||placeholder;button.classList.toggle('is-empty',!filled);
   button.setAttribute('aria-label',filled?label+': '+values[field]+'. Изменить':placeholder);button.title=filled?label+': '+values[field]:placeholder;
  }
  currentDescription=brief.description.trim();if(!currentDescription)expanded=false;
  renderDescription();
  document.querySelector('.project-intro-actions [data-edit-brief]').textContent=Object.values(brief).some(Boolean)?'Изменить описание':'Описать мероприятие';
 };
}
