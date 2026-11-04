import {briefFields} from './workflow-model.js';
import {preparationFields} from './preparation-model.js';
import {getPreparationComparisonOptions,buildPreparationComparison} from './preparation-comparison.js';

const title='Внутренний план разговора';
const presentationFields={lead:'Краткое описание',intro:'Описание',fit:'Если вам близко',participation:'Участие команды и его границы'};
const preparationOrder=['attraction','strengths','unknowns','questions','scenario','nextStep'];
const valueBlock=(label,value,empty='Не заполнено.')=>label+'\n'+(typeof value==='string'&&value.length?value:empty);

function safeOrigin(value){
 // Accept an origin, not an arbitrary URL: credentials, path/query/hash and
 // control characters must not enter copied links. Invalid input is not echoed.
 if(typeof value!=='string'||!/^https?:\/\//i.test(value)||/[\s\u0000-\u001f\u007f\\?#]/.test(value))return null;
 try{
  const url=new URL(value);
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.pathname!=='/'||url.search||url.hash||url.origin==='null')return null;
  return url.origin;
 }catch{return null;}
}
function pageSection(heading,copy){
 return [heading,...Object.entries(presentationFields).map(([key,label])=>valueBlock(label,copy?.[key],'В текущей подаче не передано.'))].join('\n\n');
}

/**
 * Pure, deterministic plain-text projection for ONE active agency/work pair.
 * `preparation` must be a fresh readPreparation(form) array; `workflow` must be
 * readEditor(form).workflow. Missing inputs throw TypeError rather than silently
 * using a saved workflow/receipt brief. An invalid pair returns null; a valid but
 * missing/unlinked catalogue entry remains usable with comparison warnings.
 *
 * Returns {key, title, contextTitle, text, warnings:[{code,message}],
 *          links:[{kind:'agency'|'work', label, href}]}.
 * All six preparation strings, briefFields and presentation strings are included
 * without trimming, shortening, rewriting or generating missing content. Empty
 * values receive explicit labels in the text. Comparison's exact-pair receipt
 * fallback and last-duplicate-preparation-row semantics are preserved.
 *
 * siteOrigin is optional. A safe http(s) origin makes available page links
 * absolute; otherwise they remain root-relative. No source URLs, contacts,
 * consent/history metadata or tokens are selected from the input objects.
 * Explicit free text is carried verbatim, not inspected or redacted. UI must
 * render `text` as plain text, not innerHTML; this module performs no DOM, I/O,
 * clipboard, save, clock or random operations. Equality of text can detect stale
 * previews; selection and preview state stay outside the workflow.
 */
export function buildDiscussionPlan({entry,preparation,workflow,catalog,receipt,siteOrigin}={}){
 if(!Array.isArray(preparation))throw new TypeError('Pass current readPreparation(form) values as preparation');
 if(!workflow||!workflow.brief||typeof workflow.brief!=='object'||Array.isArray(workflow.brief))throw new TypeError('Pass current readEditor(form).workflow as workflow');
 const option=getPreparationComparisonOptions([entry],catalog,receipt)[0];
 if(!option)return null;
 const comparison=buildPreparationComparison({selectedKeys:[option.key],contexts:[entry],preparation,catalog,receipt});
 const column=comparison.columns[0],origin=safeOrigin(siteOrigin);
 const links=[
  {kind:'agency',label:'Профиль агентства',href:column.agency.href},
  {kind:'work',label:column.work.status==='unlinked'?'Страница работы — связь с агентством не подтверждена':'Страница работы',href:column.work.href}
 ].filter(link=>link.href).map(link=>({...link,href:origin?origin+link.href:link.href}));
 const workHeading=column.work.status==='unlinked'?'Подача работы при составлении плана — отдельно от агентства':column.work.status==='not_selected'?'Подача работы — конкретная работа не выбрана':'Подача работы при составлении плана';
 const sections=[
  title,
  'Собрано из текущих данных страницы, включая возможные несохранённые правки. Это внутренний рабочий план, не подтверждённый сценарий и не сообщение клиенту.',
  'Контекст разговора\nАгентство: '+column.agency.name+'\nРабота: '+column.work.title,
  column.warnings.length?'Состояние выбранного варианта\n'+column.warnings.map(warning=>warning.message).join('\n'):'',
  links.length?'Ссылки на доступные страницы сайта\n'+links.map(link=>link.label+': '+link.href).join('\n'):'Ссылки на актуальные страницы этого варианта недоступны.',
  'Задача — полный рабочий бриф со страницы\n\n'+Object.entries(briefFields).map(([key,label])=>valueBlock(label,workflow.brief[key])).join('\n\n'),
  'Как вариант представлен на сайте при составлении плана\nЭто редакционные тексты сайта на момент составления плана, не слова клиента и не подтверждение его интереса. Неизвестно, видел ли клиент именно этот текст при выборе.',
  pageSection('Подача агентства при составлении плана — '+column.agency.name,column.presentation.agency),
  pageSection(workHeading+' — '+column.work.title,column.presentation.work),
  'Рабочие записи и гипотезы по выбранному варианту\nНиже — записанный на странице текст оператора. Его формулировки не подтверждают условия, интерес команды или согласие клиента.',
  ...preparationOrder.map(key=>valueBlock(preparationFields[key].label,column.fields[key],'Пока не записано.'))
 ];
 return {key:column.key,title,contextTitle:column.label,text:sections.filter(section=>section!=='').join('\n\n'),warnings:column.warnings,links};
}
