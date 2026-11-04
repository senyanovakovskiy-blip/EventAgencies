const KEY='eventagencies-comparison-criteria-v1';
const controllers=new WeakMap();
export function syncComparisonCriteria(host){controllers.get(host)?.apply();}

/** View preferences only: the project and the comparison data are untouched. */
export function setupComparisonCriteria(host,rows){
 const previous=controllers.get(host);if(previous){previous.update(rows);return previous;}
 const doc=host.ownerDocument,panel=doc.createElement('section'),content=doc.createElement('div'),empty=doc.createElement('div');
 panel.className='comparison-criteria';panel.setAttribute('aria-label','Видимые критерии сравнения');
 panel.innerHTML='<div class="comparison-criteria-heading"><p data-criteria-count role="status" aria-live="polite" aria-atomic="true"></p><button type="button" data-criteria-all>Показать все</button></div><label class="comparison-same-toggle"><input type="checkbox" data-criteria-same aria-describedby="comparison-same-help"><span>Скрыть одинаковые данные</span></label><p class="comparison-same-help" id="comparison-same-help">Совпадением считаем только полные известные значения у всех команд. Неизвестные данные и оговорки этот режим не скрывает.</p><details><summary>Выбрать критерии</summary><fieldset><legend class="visually-hidden">Какие критерии показывать в сравнении</legend><div class="comparison-criteria-options"></div></fieldset></details><p class="comparison-criteria-storage" data-criteria-storage role="status" hidden>Настройка действует на этой странице. Не удалось сохранить её для переходов и перезагрузки.</p>';
 content.className='comparison-content';empty.className='comparison-criteria-empty';empty.hidden=true;
 empty.innerHTML='<h3>Все критерии скрыты</h3><p>Отметьте нужные критерии, выключите скрытие одинаковых данных или верните все строки. Команды и управление их приоритетом остаются доступны.</p><button type="button" data-criteria-empty-all>Показать все критерии</button>';
 host.replaceChildren(panel,content,empty);
 const count=panel.querySelector('[data-criteria-count]'),all=panel.querySelector('[data-criteria-all]'),same=panel.querySelector('[data-criteria-same]'),details=panel.querySelector('details'),options=panel.querySelector('.comparison-criteria-options'),storageNote=panel.querySelector('[data-criteria-storage]');
 let definitions=[],signature='',hidden=new Set(),hideSame=false,storageAvailable=true;
 try{
  const raw=sessionStorage.getItem(KEY);
  if(raw&&raw.length<=4000){
   const value=JSON.parse(raw);
   if(value?.version===1&&Array.isArray(value.hidden)&&value.hidden.length<=50){hidden=new Set(value.hidden.filter(id=>typeof id==='string'&&/^[a-z][a-z0-9-]{0,59}$/.test(id)));hideSame=value.hideSame===true;}
  }
 }catch{storageAvailable=false;}
 function update(nextRows){
  definitions=nextRows.map(({id,label,equal})=>({id,label,equal}));
  const ids=new Set(definitions.map(row=>row.id));hidden=new Set([...hidden].filter(id=>ids.has(id)));
  const nextSignature=JSON.stringify(definitions.map(({id,label})=>({id,label})));if(signature===nextSignature)return;
  signature=nextSignature;options.replaceChildren();
  for(const {id,label} of definitions){
   const choice=doc.createElement('label'),input=doc.createElement('input'),text=doc.createElement('span'),match=doc.createElement('small');
   input.type='checkbox';input.dataset.comparisonCriterionToggle=id;input.setAttribute('aria-controls','comparison-row-'+id);text.textContent=label;
   match.className='comparison-criterion-match';match.dataset.criterionMatch='';match.textContent='Совпадает у всех';match.hidden=true;text.append(match);
   choice.append(input,text);options.append(choice);
  }
 }
 function remember(){
  try{if(hidden.size||hideSame)sessionStorage.setItem(KEY,JSON.stringify({version:1,hidden:definitions.filter(row=>hidden.has(row.id)).map(row=>row.id),hideSame}));else sessionStorage.removeItem(KEY);storageAvailable=true;}
  catch{storageAvailable=false;}
 }
 // The single visibility boundary for existing table rows, on every layout.
 function apply(){
  const inputs=[...options.querySelectorAll('[data-comparison-criterion-toggle]')];
  const matches=new Set(definitions.filter(row=>hideSame&&row.equal?.()===true).map(row=>row.id));
  same.checked=hideSame;
  for(const input of inputs){const id=input.dataset.comparisonCriterionToggle;input.checked=!hidden.has(id);input.closest('label').querySelector('[data-criterion-match]').hidden=hidden.has(id)||!matches.has(id);}
  let shown=0,total=0,manual=0,matching=0;
  for(const row of content.querySelectorAll('[data-comparison-criterion]')){
   const id=row.dataset.comparisonCriterion,byChoice=hidden.has(id),byMatch=!byChoice&&matches.has(id),concealed=byChoice||byMatch;row.id='comparison-row-'+id;
   if(concealed&&row.contains(doc.activeElement)){if(byMatch)same.focus({preventScroll:true});else{details.open=true;inputs.find(input=>input.dataset.comparisonCriterionToggle===id)?.focus({preventScroll:true});}}
   row.hidden=concealed;row.inert=concealed;total++;if(!concealed)shown++;
   if(byChoice)manual++;else if(byMatch)matching++;
  }
  const message='Показано критериев: '+shown+' из '+total+' · Отключено вручную: '+manual+' · Скрыто совпадений: '+matching;
  if(count.textContent!==message)count.textContent=message;
  empty.hidden=shown!==0||total===0;
  content.querySelector('.comparison-scroll')?.after(empty);
  storageNote.hidden=storageAvailable;
 }
 options.addEventListener('change',event=>{
  const input=event.target.closest('[data-comparison-criterion-toggle]');if(!input||!definitions.some(row=>row.id===input.dataset.comparisonCriterionToggle))return;
  if(input.checked)hidden.delete(input.dataset.comparisonCriterionToggle);else hidden.add(input.dataset.comparisonCriterionToggle);
  remember();apply();
 });
 same.addEventListener('change',()=>{hideSame=same.checked;remember();apply();});
 const showAll=()=>{hidden.clear();hideSame=false;remember();apply();};
 all.addEventListener('click',showAll);
 empty.querySelector('[data-criteria-empty-all]').addEventListener('click',()=>{showAll();all.focus({preventScroll:true});});
 const controller={content,update,apply};controllers.set(host,controller);update(rows);return controller;
}
