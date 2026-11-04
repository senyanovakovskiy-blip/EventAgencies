import {buildDiscussionPlan,buildComparisonDiscussionPlan,buildDiscussionAgenda,buildComparisonDiscussionAgenda} from './discussion-plan.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const setText=(node,value)=>{if(node.textContent!==value)node.textContent=value;};
const textLabels={
 agenda:{object:'повестку',genitive:'повестки',build:'Собрать повестку',built:'Повестка собрана',copied:'Повестка скопирована',stale:'Повестка устарела'},
 plan:{object:'полный план',genitive:'полного плана',build:'Собрать полный план',built:'Полный план собран',copied:'Полный план скопирован',stale:'Полный план устарел'}
};
const labelsFor=snapshot=>textLabels[snapshot?.kind==='agenda'?'agenda':'plan'];
export function discussionPlanMarkup(id,{comparison=false}={}){
 const key=esc(id),title=comparison?'Повестка и полный план выбранных вариантов':'Повестка и полный план разговора';
 return `<section class="discussion-plan" data-discussion-plan data-discussion-plan-scope="${comparison?'comparison':'single'}" aria-labelledby="${key}-title"><h4 id="${key}-title">${title}</h4><p id="${key}-help" class="small muted">Повестка: задача и ожидания, мотив выбора, вопросы, ответ клиента, изменения и следующий шаг. Полный план добавляет весь бриф с бюджетом, подачу варианта и остальные записи со сценарием. ${comparison?'Варианты идут в порядке выбора в сравнении. ':''}Тексты включаются целиком. Результат остаётся на странице до успешного сохранения заявки или перезагрузки.</p><p id="${key}-unavailable" class="small muted" data-discussion-plan-unavailable role="status" hidden></p><div class="discussion-plan-actions"><button type="button" class="secondary" data-build-discussion-agenda>Собрать повестку</button><button type="button" class="secondary" data-build-discussion-plan>Собрать полный план</button><button type="button" class="secondary" data-copy-discussion-plan disabled>Скопировать собранный текст</button></div><p id="${key}-stale" class="reply-warning" data-discussion-plan-stale role="status" hidden></p><p id="${key}-status" class="small muted" data-discussion-plan-status role="status" aria-atomic="true"></p><details data-discussion-plan-preview hidden><summary data-discussion-plan-summary>Посмотреть собранный текст</summary><p id="${key}-context" class="discussion-plan-context" data-discussion-plan-context></p><label><span data-discussion-plan-label>Собранный текст — только для чтения</span><textarea data-discussion-plan-text readonly rows="18" spellcheck="false" aria-describedby="${key}-help ${key}-context ${key}-unavailable ${key}-stale ${key}-status"></textarea></label></details></section>`;
}

// Snapshots belong only to this form and never enter preparation or view capture.
export function wireDiscussionPlans(form,{catalog,receipt,getPreparation,getWorkflow,getActiveKey,getComparison=()=>({selectedKeys:[],contexts:[]}),siteOrigin}){
 const states=new Map();let copyPending=null;
 const busy=()=>form.dataset.busy==='true';
 function stateFor(root){
  const comparison=root.dataset.discussionPlanScope==='comparison',card=root.closest('[data-preparation-card]'),key=comparison?'comparison':card.dataset.preparationCard;
  let state=states.get(key);
  if(!state||state.root!==root){
   state={key,card,root,comparison,entry:comparison?null:{agencySlug:card.dataset.agency,workSlug:card.dataset.work||null},snapshot:null,stale:false,message:'',available:true,currentKey:key,unavailableMessage:'',activation:0,contextStamp:'',
    buildAgenda:root.querySelector('[data-build-discussion-agenda]'),build:root.querySelector('[data-build-discussion-plan]'),copy:root.querySelector('[data-copy-discussion-plan]'),
    preview:root.querySelector('[data-discussion-plan-preview]'),area:root.querySelector('[data-discussion-plan-text]'),
    summary:root.querySelector('[data-discussion-plan-summary]'),label:root.querySelector('[data-discussion-plan-label]'),
    context:root.querySelector('[data-discussion-plan-context]'),warning:root.querySelector('[data-discussion-plan-stale]'),status:root.querySelector('[data-discussion-plan-status]'),unavailable:root.querySelector('[data-discussion-plan-unavailable]')};
   states.set(key,state);
  }
  return state;
 }
 function currentInputs(){return {preparation:getPreparation(),workflow:getWorkflow(),catalog,receipt,siteOrigin};}
 function fresh(state,inputs=currentInputs(),kind=state.snapshot?.kind){
  // Full-plan snapshots have no kind; always compare the current snapshot's
  // projection, so edits to fields omitted from an agenda cannot make it stale.
  if(!state.comparison)return (kind==='agenda'?buildDiscussionAgenda:buildDiscussionPlan)({...inputs,entry:state.entry});
  const {selectedKeys,contexts}=getComparison();return (kind==='agenda'?buildComparisonDiscussionAgenda:buildComparisonDiscussionPlan)({...inputs,selectedKeys,contexts});
 }
 function connected(state){return form.isConnected&&state.root.isConnected&&form.contains(state.root)&&(!state.card||state.card.isConnected);}
 function active(state){return connected(state)&&!state.root.closest('[hidden]')&&(state.comparison||getActiveKey()===state.key);}
 function observeContext(state){
  // Repeated selection/toggle changes invalidate pending results even if the
  // operator returns to the original scope before the clipboard promise settles.
  const stamp=JSON.stringify([state.comparison?state.currentKey:getActiveKey(),state.comparison?state.available:true,active(state)]);
  if(stamp!==state.contextStamp){state.contextStamp=stamp;state.activation++;}
 }
 function markFreshness(state,plan){
  state.available=Boolean(plan&&(!state.comparison||plan.status==='ready'));
  state.currentKey=plan?.key||state.key;
  state.unavailableMessage=state.available?'':state.comparison&&!state.snapshot?'Для сборки выберите от одного до трёх доступных вариантов выше.':plan?.message||'Не удалось определить вариант. Выберите агентство и работу для обсуждения.';
  const stale=Boolean(state.snapshot&&(!state.available||plan.key!==state.snapshot.key||plan.text!==state.snapshot.text));
  if(state.stale!==stale)state.message='';
  state.stale=stale;
 }
 function controls(){
  for(const root of form.querySelectorAll('[data-discussion-plan]')){
   const state=stateFor(root),labels=labelsFor(state.snapshot);observeContext(state);
   state.buildAgenda.disabled=state.build.disabled=busy()||Boolean(copyPending)||!state.available;
   state.copy.disabled=busy()||Boolean(copyPending)||!state.available||!state.snapshot||!state.snapshot.text||state.stale;
   state.area.disabled=busy();
   if(state.snapshot){
    const scope=state.comparison?' выбранных вариантов':' разговора';
    setText(state.copy,'Скопировать '+labels.object);
    setText(state.summary,'Посмотреть '+labels.object+scope);
    setText(state.label,'Текст '+labels.genitive+scope+' — только для чтения');
    setText(state.context,state.snapshot.title+': '+state.snapshot.contextTitle);
    setText(state.warning,labels.stale+': данные или выбор изменились. Прежний текст оставлен ниже. Нажмите «'+labels.build+'» перед копированием.');
   }
   state.warning.hidden=!state.stale;
   setText(state.unavailable,state.unavailableMessage);state.unavailable.hidden=!state.unavailableMessage;
   setText(state.status,copyPending&&active(state)?copyPending.state===state?'Копируем '+labels.object+'…':'Дождитесь завершения копирования '+labelsFor(copyPending.snapshot).genitive+'.':state.message);
  }
 }
 function sync(){
  const inputs=currentInputs();
  for(const root of form.querySelectorAll('[data-discussion-plan]')){
   const state=stateFor(root);if(state.comparison||state.snapshot)markFreshness(state,fresh(state,inputs));
  }
  // Never rewrite the textarea here: preserve the snapshot and its selection.
  controls();
 }
 function build(state,kind){
  const plan=fresh(state,currentInputs(),kind);
  markFreshness(state,plan);
  if(!state.available){state.message='';controls();return;}
  state.snapshot=plan;state.stale=false;state.message=labelsFor(plan).built+' из текущих записей страницы. Проверьте текст перед копированием.';
  state.area.value=plan.text;
  state.preview.hidden=false;state.preview.open=true;controls();
  state.area.focus({preventScroll:true});state.area.scrollIntoView({block:'center'});
 }
 async function copy(state){
  sync();if(busy()||copyPending||!active(state)||!state.available||!state.snapshot||state.stale||!state.snapshot.text)return;
  const snapshot=state.snapshot,labels=labelsFor(snapshot),operation={state,snapshot,activation:state.activation};copyPending=operation;state.message='';controls();
  const stillCurrent=()=>{sync();return copyPending===operation&&active(state)&&!busy()&&state.snapshot===snapshot&&state.activation===operation.activation;};
  try{
   // The caller admits only a trusted, explicit click. No fallback clipboard writes.
   await navigator.clipboard.writeText(snapshot.text);
   if(!stillCurrent())return;
   state.message=state.stale?'В буфере текст '+labels.genitive+' до последних правок. Нажмите «'+labels.build+'» перед следующим копированием.':labels.copied+'. Сообщение никому не отправлено.';
  }catch{
   if(!stillCurrent())return;
   if(state.stale){state.message='Данные изменились во время копирования '+labels.genitive+'. Нажмите «'+labels.build+'» и повторите.';return;}
   state.message='Автоматическое копирование недоступно. Текст '+labels.genitive+' выделен: нажмите Ctrl+C (⌘C на Mac) или выберите «Копировать» в меню устройства.';
   state.preview.hidden=false;state.preview.open=true;
   state.area.focus({preventScroll:true});state.area.select();state.area.scrollIntoView({block:'center'});
  }finally{
   if(copyPending===operation)copyPending=null;
   if(form.isConnected)controls();
  }
 }
 form.addEventListener('click',event=>{
  const button=event.target.closest('[data-build-discussion-agenda],[data-build-discussion-plan],[data-copy-discussion-plan]');
  if(!button||!form.contains(button)||busy()||copyPending)return;
  const state=stateFor(button.closest('[data-discussion-plan]'));if(!active(state))return;
  if(button.hasAttribute('data-build-discussion-agenda'))build(state,'agenda');
  else if(button.hasAttribute('data-build-discussion-plan'))build(state,'plan');
  else if(event.isTrusted)void copy(state);
 });
 // Read-only preview controls do not participate in the editor's dirty flow.
 for(const type of ['input','change'])form.addEventListener(type,event=>{if(event.target.closest('[data-discussion-plan]'))event.stopPropagation();},{capture:true});
 form.addEventListener('copy',event=>{
  if(!event.target.matches('[data-discussion-plan-text]'))return;
  const state=stateFor(event.target.closest('[data-discussion-plan]'));sync();
  if(busy()||copyPending||!active(state)||!state.available||state.stale||!state.snapshot){event.preventDefault();if(active(state)&&!busy()){state.message=copyPending?'Дождитесь завершения копирования '+labelsFor(copyPending.snapshot).genitive+'.':state.unavailableMessage||'Нажмите «'+labelsFor(state.snapshot).build+'» перед копированием: показанный текст уже не соответствует рабочим записям.';controls();}}
 });
 sync();return {sync,controls,contextChanged:controls};
}
