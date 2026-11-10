const numberFormat=new Intl.NumberFormat('ru-RU');
const fields=[['format','Формат','Выбрать формат'],['city','Город','Указать город'],['date','Дата или период','Указать дату'],['guests','Гости','Указать количество'],['budget','Бюджет','Указать бюджет']];
const formatWishPrompts={corporate:'Что команда хотела бы отметить, какое настроение ей близко и чего лучше избежать?',conference:'Какие вопросы или знания участники должны унести с собой?',presentation:'Что гостям важно понять или попробовать, и какой следующий шаг будет полезен?',teambuilding:'Какая совместная задача подойдёт команде и какой уровень активности будет комфортен?',private:'Какой личный момент или настроение хочется сохранить?',wedding:'Что паре важно прожить вместе и какие традиции или форматы хочется учесть?',birthday:'Что особенно порадует именинника и чего стоит избежать?',product_launch:'Что аудитории важно понять, увидеть или попробовать?',opening:'Что нужно показать гостям о пространстве и какой момент открытия важен?',new_year:'Что хочется отметить по итогам года и каким сделать праздник для команды?',exhibition:'Кого ждёте на выставке и что посетителям важно увидеть, попробовать или обсудить?',sports_day:'Какой уровень активности будет комфортен и какие условия безопасности важно учесть?',other:'Какую задачу должно решить событие, что важно для гостей и чего хочется избежать?'};
const formatNumber=value=>value!==''&&Number.isFinite(Number(value))?numberFormat.format(Number(value)):value;

export function setupBriefSummary(formatName){
 const host=document.getElementById('project-summary');
 if(!host)return()=>{};
 const description=document.getElementById('project-description'),toggle=document.querySelector('[data-toggle-wishes-summary]'),nextDetail=document.querySelector('[data-project-next-detail]'),nextText=nextDetail?.querySelector('[data-project-next-text]'),nextButton=nextDetail?.querySelector('[data-project-next-action]');
 let currentDescription='',expanded=false;
 let currentNextKey='';
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
 function renderNextDetail(brief){
  if(!nextDetail||!nextText||!nextButton)return;
  const has=value=>typeof value==='string'&&Boolean(value.trim());
  const next=[
   !has(brief.description)&&{key:'description',label:'Добавить пожелания',text:formatWishPrompts[brief.format]||'Коротко опишите задачу, настроение или то, чего хочется избежать. Формат события можно определить позже.'},
   !has(brief.city)&&{key:'city',label:'Указать город',text:'Город поможет понять, какие команды смогут работать на вашей площадке.'},
   !has(brief.date)&&!brief.dateUnknown&&{key:'date',label:'Уточнить дату',text:'Дата или примерный период помогут командам обсудить доступность. Если пока неизвестно, это можно отметить в форме.'},
   !has(brief.guests)&&{key:'guests',label:'Указать число гостей',text:'Даже примерное число гостей поможет подобрать подходящий масштаб события.'},
   !has(brief.budget)&&!brief.budgetHelp&&{key:'budget',label:'Указать бюджет',text:'Можно добавить ориентир или попросить команды помочь с оценкой.'}
  ].find(Boolean);
  const key=next?.key==='description'?'description:'+ (brief.format||'unspecified'):next?.key||'ready',text=next?.text||'Основные детали для первого обсуждения уже собраны. Формат события можно оставить открытым, а остальное уточнить вместе с командами.';
  nextDetail.hidden=false;
  if(currentNextKey!==key){nextText.textContent=text;currentNextKey=key;}
  nextButton.hidden=!next;nextButton.dataset.briefField=next?.key||'';nextButton.textContent=next?.label||'';
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
  renderNextDetail(brief);
  document.querySelector('.project-intro-actions [data-edit-brief]').textContent=Object.values(brief).some(Boolean)?'Изменить описание':'Описать мероприятие';
 };
}
