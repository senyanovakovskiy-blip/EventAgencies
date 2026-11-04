import {preparationFields} from './preparation-model.js';
import {PREPARATION_COMPARISON_LIMIT as LIMIT,getPreparationComparisonOptions,buildPreparationComparison} from './preparation-comparison.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const setText=(node,value)=>{if(node.textContent!==value)node.textContent=value;};
export function preparationComparisonMarkup(){
 return `<section class="preparation-comparison" data-preparation-comparison><button type="button" class="secondary" data-comparison-toggle aria-expanded="false" aria-controls="preparation-comparison-panel">Сравнить варианты подготовки</button><div id="preparation-comparison-panel" hidden><h4>Сравнение подготовки</h4><p class="small muted">Выберите до трёх вариантов. Здесь показан ваш текст с этой страницы, включая несохранённые правки. Выбор для сравнения не меняет заявку и не означает интерес клиента.</p><div class="preparation-comparison-picker"><label>Вариант для сравнения<select data-comparison-picker aria-describedby="preparation-comparison-count"><option value="">Выберите вариант</option></select></label><button type="button" class="secondary" data-comparison-add disabled>Добавить в сравнение</button></div><p id="preparation-comparison-count" class="small muted" data-comparison-count role="status" aria-atomic="true"></p><ul class="preparation-comparison-selection" data-comparison-selection></ul><p class="small muted" data-comparison-empty></p><div data-comparison-table></div><details class="preparation-comparison-presentation" data-comparison-presentation hidden><summary>Текущая подача сайта</summary><p class="small muted" data-comparison-notice></p><div class="preparation-comparison-presentations" data-comparison-presentations></div></details></div></section>`;
}
function pageCopy(copy,label,empty){
 return `<section><h6>${label}</h6>${copy?`<dl>${Object.entries({lead:'Краткое описание',intro:'Описание',fit:'Если вам близко',participation:'Участие команды'}).filter(([key])=>copy[key]?.trim()).map(([key,title])=>`<div><dt>${title}</dt><dd>${esc(copy[key])}</dd></div>`).join('')}</dl>`:`<p class="muted">${empty}</p>`}</section>`;
}
function presentationMarkup(column){
 return `<article><h5>${esc(column.label)}</h5>${pageCopy(column.presentation.agency,'Агентство',column.agency.available?'Описание агентства не передано в админку.':'Профиль агентства недоступен.')}${pageCopy(column.presentation.work,'Работа',column.work.status==='not_selected'?'Работа не выбрана.':column.work.status==='missing'?'Работа недоступна.':'Описание работы не передано в админку.')}${column.work.status==='unlinked'?'<p class="preparation-context-warning">Текст этой работы не подтверждает участие выбранной команды.</p>':''}</article>`;
}
function tableMarkup(columns){
 return `<table class="preparation-comparison-table" role="table"><caption>Шесть полей внутренней подготовки. Порядок вариантов — как вы их добавили.</caption><thead role="rowgroup"><tr role="row"><th role="columnheader" scope="col">Поле подготовки</th>${columns.map((column,index)=>`<th role="columnheader" scope="col" id="preparation-compare-col-${index}"><strong>${esc(column.agency.name)}</strong><span>${esc(column.work.title)}</span><small data-comparison-origins="${esc(column.key)}"></small>${column.warnings.length?`<ul class="preparation-comparison-warnings">${column.warnings.map(warning=>`<li>${esc(warning.message)}</li>`).join('')}</ul>`:''}<div class="preparation-comparison-links">${column.agency.href?`<a href="${esc(column.agency.href)}" target="_blank" rel="noopener noreferrer" aria-label="${esc('Профиль '+column.agency.name+' (новая вкладка)')}">Профиль ↗</a>`:''}${column.work.href?`<a href="${esc(column.work.href)}" target="_blank" rel="noopener noreferrer" aria-label="${esc('Работа '+column.work.title+' (новая вкладка)')}">Работа ↗</a>`:''}<button type="button" class="text-button" data-comparison-edit="${esc(column.key)}" aria-label="${esc('Редактировать подготовку: '+column.label)}">Редактировать подготовку</button></div></th>`).join('')}</tr></thead><tbody role="rowgroup">${Object.entries(preparationFields).map(([key,{label}])=>`<tr role="row"><th role="rowheader" scope="row" id="preparation-compare-row-${key}">${esc(label)}</th>${columns.map((column,index)=>`<td role="cell" headers="preparation-compare-row-${key} preparation-compare-col-${index}"><p class="preparation-comparison-mobile-label" aria-hidden="true">${esc(column.label)}</p><p class="preparation-comparison-text" data-comparison-text="${esc(column.key)}" data-comparison-field="${key}"></p><button type="button" class="text-button" data-comparison-edit="${esc(column.key)}" data-comparison-field="${key}" aria-label="${esc('Редактировать «'+label+'»: '+column.label)}">Редактировать это поле</button></td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

// View state only. The caller supplies fresh contexts and preparation on sync.
// No persistence, draft generation or editable preparation controls live here.
export function wirePreparationComparison(form,{catalog,receipt,getContexts,getPreparation,onEdit}){
 const root=form.querySelector('[data-preparation-comparison]'),toggle=root.querySelector('[data-comparison-toggle]'),panel=root.querySelector('#preparation-comparison-panel');
 const picker=root.querySelector('[data-comparison-picker]'),add=root.querySelector('[data-comparison-add]'),count=root.querySelector('[data-comparison-count]'),selection=root.querySelector('[data-comparison-selection]'),empty=root.querySelector('[data-comparison-empty]');
 const table=root.querySelector('[data-comparison-table]'),presentation=root.querySelector('[data-comparison-presentation]'),presentations=root.querySelector('[data-comparison-presentations]');
 let selectedKeys=[],options=[],model=null,optionsKey='',selectionKey='',structureKey='';const labels=new Map();
 const busy=()=>form.dataset.busy==='true';
 function controls(){
  const candidates=options.filter(option=>!selectedKeys.includes(option.key));
  toggle.disabled=busy();picker.disabled=busy()||selectedKeys.length>=LIMIT||!candidates.length;
  add.disabled=picker.disabled||!candidates.some(option=>option.key===picker.value);
  root.querySelectorAll('[data-comparison-remove],[data-comparison-edit]').forEach(button=>button.disabled=busy());
 }
 function setOpen(open){panel.hidden=!open;toggle.setAttribute('aria-expanded',String(open));setText(toggle,open?'Свернуть сравнение':'Сравнить варианты подготовки'+(selectedKeys.length?' · '+selectedKeys.length+'/'+LIMIT:''));}
 function sync(){
  const contexts=getContexts();options=getPreparationComparisonOptions(contexts,catalog,receipt);options.forEach(option=>labels.set(option.key,option.label));
  model=buildPreparationComparison({selectedKeys,contexts,preparation:getPreparation(),catalog,receipt});
  const candidates=options.filter(option=>!selectedKeys.includes(option.key)),nextOptions=JSON.stringify(candidates.map(option=>[option.key,option.label]));
  if(nextOptions!==optionsKey){
   const previous=picker.value;optionsKey=nextOptions;
   // Keep the select element itself: ordinary edits never replace focused controls.
   picker.innerHTML='<option value="">Выберите вариант</option>'+candidates.map(option=>`<option value="${esc(option.key)}">${esc(option.label)}</option>`).join('');
   if(candidates.some(option=>option.key===previous))picker.value=previous;
  }
  const nextSelection=JSON.stringify(selectedKeys.map(key=>[key,labels.get(key),model.unknownKeys.includes(key)]));
  if(nextSelection!==selectionKey){selectionKey=nextSelection;selection.innerHTML=selectedKeys.map(key=>`<li><span>${esc(labels.get(key)||key)}${model.unknownKeys.includes(key)?'<small>Вариант больше не входит в доступные контексты. Он не заменён другим.</small>':''}</span><button type="button" class="text-button" data-comparison-remove="${esc(key)}" aria-label="${esc('Убрать из сравнения: '+(labels.get(key)||key))}">Убрать</button></li>`).join('');}
  const structure=JSON.stringify(model.columns.map(({fields,origins,...column})=>column));
  if(structure!==structureKey){structureKey=structure;table.innerHTML=model.columns.length?tableMarkup(model.columns):'';presentations.innerHTML=model.columns.map(presentationMarkup).join('');}
  const columns=new Map(model.columns.map(column=>[column.key,column]));
  table.querySelectorAll('[data-comparison-text]').forEach(node=>{const value=columns.get(node.dataset.comparisonText)?.fields[node.dataset.comparisonField]||'';setText(node,value.trim()?value:'Не заполнено');node.classList.toggle('muted',!value.trim());});
  table.querySelectorAll('[data-comparison-origins]').forEach(node=>setText(node,columns.get(node.dataset.comparisonOrigins)?.origins.join(' · ')||''));
  setText(root.querySelector('[data-comparison-notice]'),model.presentationNotice);
  presentation.hidden=!model.columns.length;
  setText(count,'Выбрано для сравнения: '+selectedKeys.length+' / '+LIMIT+'.'+(model.unknownKeys.length?' Доступных вариантов: '+model.columns.length+'. Уберите недоступные вручную.':selectedKeys.length===LIMIT?' Чтобы добавить другой вариант, сначала уберите один из выбранных.':''));
  setText(empty,!options.length&&!selectedKeys.length?'Пока нет вариантов для сравнения. Добавьте рекомендацию или откройте работу для обсуждения.':!selectedKeys.length?'Выберите варианты выше. Сравнение начнётся только после добавления.':model.columns.length===1?'Добавьте ещё один вариант, чтобы сопоставить подготовку.':!model.columns.length?'Выбранные контексты сейчас недоступны. Их можно убрать и выбрать другие.':'');
  empty.hidden=!empty.textContent;setOpen(!panel.hidden);controls();
 }
 // These controls affect only the view and must not enter the editor's change flow.
 root.addEventListener('input',event=>event.stopPropagation());
 root.addEventListener('change',event=>{event.stopPropagation();if(busy())return;controls();});
 root.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button||!root.contains(button)||busy())return;
  if(button===toggle){setOpen(panel.hidden);return;}
  if(button===add){
   const option=options.find(item=>item.key===picker.value);if(!option||selectedKeys.includes(option.key)||selectedKeys.length>=LIMIT)return;
   selectedKeys.push(option.key);picker.value='';sync();
   const target=!picker.disabled?picker:[...selection.querySelectorAll('[data-comparison-remove]')].at(-1);target?.focus();return;
  }
  if(button.hasAttribute('data-comparison-remove')){selectedKeys=selectedKeys.filter(key=>key!==button.dataset.comparisonRemove);sync();(picker.disabled?toggle:picker).focus();return;}
  if(button.hasAttribute('data-comparison-edit')){
   const column=model.columns.find(item=>item.key===button.dataset.comparisonEdit);if(!column)return;
   onEdit({agencySlug:column.agencySlug,workSlug:column.workSlug},button.dataset.comparisonField||'questions');
  }
 });
 function capture(){return {selectedKeys:[...selectedKeys],open:!panel.hidden,presentationOpen:presentation.open};}
 function restore(view){
  if(busy())return;
  selectedKeys=[...new Set(Array.isArray(view?.selectedKeys)?view.selectedKeys.filter(key=>typeof key==='string'):[])].slice(0,LIMIT);
  setOpen(view?.open===true);presentation.open=view?.presentationOpen===true;sync();
 }
 sync();return {sync,controls,capture,restore};
}
