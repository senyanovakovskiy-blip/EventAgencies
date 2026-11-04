import {buildDiscussionPlan} from './discussion-plan.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const setText=(node,value)=>{if(node.textContent!==value)node.textContent=value;};
export function discussionPlanMarkup(id){
 const key=esc(id);
 return `<section class="discussion-plan" data-discussion-plan><h4>План разговора</h4><p id="${key}-help" class="small muted">Соберите бриф, описание варианта и ваши рабочие записи в один текст. План остаётся только на этой странице до сохранения заявки или перезагрузки. Шесть полей подготовки не изменятся.</p><div class="discussion-plan-actions"><button type="button" class="secondary" data-build-discussion-plan>Собрать план разговора</button><button type="button" class="secondary" data-copy-discussion-plan disabled>Скопировать план</button></div><p id="${key}-stale" class="reply-warning" data-discussion-plan-stale role="status" hidden>После сборки данные изменились. План ниже не обновлён. Нажмите «Обновить план», прежде чем копировать.</p><p id="${key}-status" class="small muted" data-discussion-plan-status role="status" aria-atomic="true"></p><details data-discussion-plan-preview hidden><summary>Посмотреть план разговора</summary><p class="discussion-plan-context" data-discussion-plan-context></p><label>Полный текст плана — только для чтения<textarea data-discussion-plan-text readonly rows="18" spellcheck="false" aria-describedby="${key}-help ${key}-stale ${key}-status"></textarea></label></details></section>`;
}

// Snapshots belong only to this form and never enter preparation or view capture.
export function wireDiscussionPlans(form,{catalog,receipt,getPreparation,getWorkflow,getActiveKey,siteOrigin}){
 const host=form.querySelector('[data-preparation-cards]'),states=new Map();
 let copyPending=null,activeKey=getActiveKey(),activation=0;
 const busy=()=>form.dataset.busy==='true';
 function observeContext(){const next=getActiveKey();if(next!==activeKey){activeKey=next;activation++;}}
 function stateFor(root){
  const card=root.closest('[data-preparation-card]'),key=card.dataset.preparationCard;
  let state=states.get(key);
  if(!state||state.card!==card){
   state={key,card,root,entry:{agencySlug:card.dataset.agency,workSlug:card.dataset.work||null},snapshot:null,stale:false,message:'',
    build:root.querySelector('[data-build-discussion-plan]'),copy:root.querySelector('[data-copy-discussion-plan]'),
    preview:root.querySelector('[data-discussion-plan-preview]'),area:root.querySelector('[data-discussion-plan-text]'),
    context:root.querySelector('[data-discussion-plan-context]'),warning:root.querySelector('[data-discussion-plan-stale]'),status:root.querySelector('[data-discussion-plan-status]')};
   states.set(key,state);
  }
  return state;
 }
 function currentInputs(){return {preparation:getPreparation(),workflow:getWorkflow(),catalog,receipt,siteOrigin};}
 function fresh(state,inputs=currentInputs()){return buildDiscussionPlan({...inputs,entry:state.entry});}
 function connected(state){return form.isConnected&&state.card.isConnected&&form.contains(state.card);}
 function active(state){return connected(state)&&getActiveKey()===state.key&&!state.card.hidden&&!state.card.closest('[data-stage-panel]')?.hidden;}
 function markFreshness(state,plan){
  const stale=Boolean(state.snapshot&&(!plan||plan.key!==state.snapshot.key||plan.text!==state.snapshot.text));
  if(state.stale!==stale)state.message='';
  state.stale=stale;
 }
 function controls(){
  observeContext();
  for(const root of host.querySelectorAll('[data-discussion-plan]')){
   const state=stateFor(root);
   state.build.disabled=busy()||Boolean(copyPending);
   state.copy.disabled=busy()||Boolean(copyPending)||!state.snapshot||!state.snapshot.text||state.stale;
   state.area.disabled=busy();
   setText(state.build,state.snapshot?'Обновить план':'Собрать план разговора');
   state.warning.hidden=!state.stale;
   setText(state.status,copyPending&&active(state)?copyPending.state===state?'Копируем собранный план…':'Дождитесь завершения копирования предыдущего плана.':state.message);
  }
 }
 function sync(){
  observeContext();const inputs=currentInputs();
  for(const root of host.querySelectorAll('[data-discussion-plan]')){
   const state=stateFor(root);if(state.snapshot)markFreshness(state,fresh(state,inputs));
  }
  // Never rewrite the textarea here: preserve the snapshot and its selection.
  controls();
 }
 function build(state){
  const plan=fresh(state);
  markFreshness(state,plan);
  if(!plan){state.message='Не удалось определить вариант. Выберите агентство и работу для обсуждения.';controls();return;}
  state.snapshot=plan;state.stale=false;state.message='План собран из текущих записей страницы. Просмотрите его перед копированием; сообщение никому не отправлено.';
  state.area.value=plan.text;setText(state.context,plan.contextTitle);
  state.preview.hidden=false;state.preview.open=true;controls();
  state.area.focus({preventScroll:true});state.area.scrollIntoView({block:'center'});
 }
 async function copy(state){
  sync();if(busy()||copyPending||!active(state)||!state.snapshot||state.stale||!state.snapshot.text)return;
  const snapshot=state.snapshot,operation={state,snapshot,activation};copyPending=operation;state.message='';controls();
  const stillCurrent=()=>{observeContext();return copyPending===operation&&active(state)&&!busy()&&state.snapshot===snapshot&&activation===operation.activation;};
  try{
   // The caller admits only a trusted, explicit click. No fallback clipboard writes.
   await navigator.clipboard.writeText(snapshot.text);
   if(!stillCurrent())return;
   markFreshness(state,fresh(state));
   state.message=state.stale?'В буфер скопирован план до последних правок. Новые изменения в него не вошли; обновите план перед следующим копированием.':'План скопирован. Сообщение никому не отправлено.';
  }catch{
   if(!stillCurrent())return;
   markFreshness(state,fresh(state));
   if(state.stale){state.message='Данные изменились во время попытки копирования. Обновите план и повторите.';return;}
   state.message='Автоматическое копирование недоступно. Текст выделен: нажмите Ctrl+C (⌘C на Mac) или выберите «Копировать» в меню устройства.';
   state.area.focus({preventScroll:true});state.area.select();state.area.scrollIntoView({block:'center'});
  }finally{
   if(copyPending===operation)copyPending=null;
   if(form.isConnected)controls();
  }
 }
 host.addEventListener('click',event=>{
  const button=event.target.closest('[data-build-discussion-plan],[data-copy-discussion-plan]');
  if(!button||!host.contains(button)||busy()||copyPending)return;
  const state=stateFor(button.closest('[data-discussion-plan]'));if(!active(state))return;
  if(button.hasAttribute('data-build-discussion-plan'))build(state);
  else if(event.isTrusted)void copy(state);
 });
 // Read-only preview controls do not participate in the editor's dirty flow.
 for(const type of ['input','change'])host.addEventListener(type,event=>{if(event.target.closest('[data-discussion-plan]'))event.stopPropagation();});
 host.addEventListener('copy',event=>{
  if(!event.target.matches('[data-discussion-plan-text]'))return;
  const state=stateFor(event.target.closest('[data-discussion-plan]'));sync();
  if(busy()||copyPending||!active(state)||state.stale||!state.snapshot){event.preventDefault();if(active(state)&&!busy()){state.message=copyPending?'Дождитесь завершения текущей попытки копирования.':'Обновите план перед копированием: показанный текст уже не соответствует рабочим записям.';controls();}}
 });
 controls();return {sync,controls,contextChanged:()=>{observeContext();controls();}};
}
