import {normalizePreparation,validatePreparation} from './preparation-model.js';
export const briefFields={goal:'Цель мероприятия',city:'Город проведения',date:'Дата или период',guests:'Количество гостей',services:'Нужные услуги',budget:'Уточнённый бюджет',stage:'Стадия выбора',expectations:'Ожидания заказчика'};
export const responses={pending:'Ответ не получен',interested:'Есть интерес к обсуждению',declined:'Отказ',no_response:'Нет ответа после обращения'};
export const consents={unknown:'Не получено',yes:'Получено',no:'Отказ'};
export const evidenceFields={response:'responseBriefVersion',customerConsent:'customerConsentBriefVersion',agencyConsent:'agencyConsentBriefVersion'};
export const emptyWorkflow=()=>({brief:{...Object.fromEntries(Object.keys(briefFields).map(k=>[k,''])),version:1,confirmed:false,confirmedVersion:null,confirmationNote:'',confirmedAt:null},teams:[],preparation:[]});
export const emptyTeam=agencySlug=>({agencySlug,response:'pending',responseNote:'',refusalReason:'',customerConsent:'unknown',customerConsentNote:'',agencyConsent:'unknown',agencyConsentNote:'',responseBriefVersion:null,customerConsentBriefVersion:null,agencyConsentBriefVersion:null,contactsShared:false,contactNote:'',conversationHeld:false,conversationNote:'',nextStep:'',result:'',updatedAt:null,sharedAt:null,sharedBriefVersion:null,conversationAt:null});
const version=v=>Number.isSafeInteger(v)&&v>0?v:null;
// Read compatibility only: never rewrite the original receipt or old history snapshots.
export function normalizeWorkflow(value,original={}){
 const base=emptyWorkflow(),raw=value?.brief||{},legacy=!version(raw.version);
 const brief={...base.brief,...raw,version:version(raw.version)||1};
 for(const key of Object.keys(briefFields))brief[key]=typeof raw[key]==='string'?raw[key]:'';
 for(const [key,fallback]of Object.entries({city:original.city,date:original.dateUnknown?'Дата пока неизвестна':original.date,guests:original.guests}))if(!Object.hasOwn(raw,key))brief[key]=fallback?String(fallback):'Нужно уточнить';
 brief.confirmed=raw.confirmed===true;
 brief.confirmedVersion=brief.confirmed?(legacy?brief.version:version(raw.confirmedVersion)):null;
 brief.confirmedAt=raw.confirmedAt||null;
 const teams=(Array.isArray(value?.teams)?value.teams:[]).map(rawTeam=>{
  const t={...emptyTeam(rawTeam.agencySlug),...rawTeam};
  for(const key of Object.values(evidenceFields))t[key]=version(rawTeam[key]);
  t.sharedBriefVersion=version(rawTeam.sharedBriefVersion);return t;
 });
 return {brief,teams,preparation:normalizePreparation(value?.preparation)};
}
export const briefConfirmed=b=>Boolean(b?.confirmed&&b.confirmedVersion===b.version);
export const evidenceCurrent=(t,b,key)=>Boolean(version(b?.version)&&t?.[evidenceFields[key]]===b.version);
const fail=code=>{throw Object.assign(new Error(code),{status:400,code});};
const text=(v,max=2000)=>{if(typeof v!=='string'||v.length>max)fail('invalid_workflow');return v.trim();};
const bool=v=>{if(typeof v!=='boolean')fail('invalid_workflow');return v;};
export function validateWorkflow(input,previous,catalog,now,selection=[]){
 if(!input||!input.brief||!Array.isArray(input.teams)||input.teams.length>100)fail('invalid_workflow');
 previous=normalizeWorkflow(previous);
 const b=input.brief,old=previous.brief,brief={};
 for(const key of Object.keys(briefFields))brief[key]=text(b[key]===undefined&&['city','date','guests'].includes(key)?old[key]:b[key]);
 const changed=Object.keys(briefFields).some(k=>brief[k]!==old[k]);
 // Versions are derived from the saved state, never trusted from a client PATCH.
 brief.version=old.version+(changed?1:0);
 brief.confirmed=bool(b.confirmed)&&!changed;
 brief.confirmationNote=text(b.confirmationNote);
 if(brief.confirmed&&(Object.keys(briefFields).some(k=>!brief[k])||!brief.confirmationNote))fail('brief_confirmation_required');
 brief.confirmedVersion=brief.confirmed?brief.version:null;
 brief.confirmedAt=brief.confirmed?(briefConfirmed(old)?old.confirmedAt||now:now):null;
 const seen=new Set();
 const teams=input.teams.map(value=>{
  if(!value||!catalog.agencies.some(a=>a.slug===value.agencySlug)||seen.has(value.agencySlug))fail('invalid_workflow');
  seen.add(value.agencySlug);const oldTeam=previous.teams.find(t=>t.agencySlug===value.agencySlug)||emptyTeam(value.agencySlug),t=emptyTeam(value.agencySlug);
  for(const k of ['responseNote','refusalReason','customerConsentNote','agencyConsentNote','contactNote','conversationNote','nextStep','result'])t[k]=text(value[k]);
  for(const [k,options]of [['response',responses],['customerConsent',consents],['agencyConsent',consents]]){if(!Object.hasOwn(options,value[k]))fail('invalid_workflow');t[k]=value[k];}
  t.contactsShared=bool(value.contactsShared);t.conversationHeld=bool(value.conversationHeld);
  if(t.response==='declined'&&!t.refusalReason)fail('refusal_reason_required');
  if(t.response!=='pending'&&!t.responseNote)fail('response_note_required');
  if((t.customerConsent!=='unknown'&&!t.customerConsentNote)||(t.agencyConsent!=='unknown'&&!t.agencyConsentNote))fail('consent_note_required');
  for(const [key,basis]of Object.entries(evidenceFields)){
   const note=key==='response'?'responseNote':key+'Note',neutral=key==='response'?'pending':'unknown';
   const renewed=value.reconfirm?.[key]===true||t[key]!==oldTeam[key]||t[note]!==oldTeam[note]||(key==='response'&&t.refusalReason!==oldTeam.refusalReason);
   t[basis]=t[key]===neutral?null:!changed&&renewed?brief.version:oldTeam[basis];
  }
  if(!oldTeam.contactsShared&&t.contactsShared&&(!briefConfirmed(brief)||t.response!=='interested'||t.customerConsent!=='yes'||t.agencyConsent!=='yes'||!Object.keys(evidenceFields).every(k=>evidenceCurrent(t,brief,k))||!t.contactNote))fail('introduction_not_ready');
  if(oldTeam.contactsShared&&!t.contactsShared||oldTeam.conversationHeld&&!t.conversationHeld)fail('keep_recorded_events');
  if(t.contactsShared&&!t.contactNote)fail('introduction_not_ready');
  if(t.conversationHeld&&(!t.contactsShared||!t.conversationNote||!t.nextStep))fail('conversation_incomplete');
  t.sharedAt=t.contactsShared?(oldTeam.sharedAt||now):null;
  t.sharedBriefVersion=t.contactsShared?(oldTeam.contactsShared?oldTeam.sharedBriefVersion:brief.version):null;
  t.conversationAt=t.conversationHeld?(oldTeam.conversationAt||now):null;
  t.updatedAt=Object.keys(t).filter(k=>k!=='updatedAt').some(k=>t[k]!==oldTeam[k])?now:oldTeam.updatedAt;return t;
 });
 if(previous.teams.some(t=>!seen.has(t.agencySlug)))fail('keep_team_history');
 // Match read normalization, including key order, so an unchanged save stays a no-op.
 const preparation=validatePreparation(input.preparation,previous.preparation,catalog,selection);
 return normalizeWorkflow({brief,teams,preparation});
}
export const stageLabels={brief:'Бриф',confirm:'Подтверждение',selection:'Подбор',preparation:'Разговор и сценарий',introduction:'Знакомство',outcome:'Итог'};
export function teamAction(t,b){
 if(t.result.trim())return 'Результат записан';
 if(t.conversationHeld)return 'Записать результат разговора';
 if(t.contactsShared)return 'Уточнить, состоялся ли разговор';
 if(b&&t.response!=='pending'&&!evidenceCurrent(t,b,'response'))return 'Перепроверить ответ по актуальному брифу';
 if(t.response==='declined')return 'Отказ — продолжить с другой командой';
 const currentRefusal=key=>t[key]==='no'&&(!b||evidenceCurrent(t,b,key));
 if(currentRefusal('customerConsent')||currentRefusal('agencyConsent'))return 'Знакомство отклонено — выбрать другую команду';
 if(t.response==='no_response')return 'Уточнить ответ или выбрать другую команду';
 if(t.response!=='interested')return 'Узнать интерес агентства';
 if(t.customerConsent==='no'&&b&&!evidenceCurrent(t,b,'customerConsent'))return 'Уточнить решение заказчика по актуальному брифу';
 if(t.customerConsent!=='yes'||b&&!evidenceCurrent(t,b,'customerConsent'))return 'Получить согласие заказчика на актуальный бриф';
 if(t.agencyConsent==='no'&&b&&!evidenceCurrent(t,b,'agencyConsent'))return 'Уточнить решение агентства по актуальному брифу';
 if(t.agencyConsent!=='yes'||b&&!evidenceCurrent(t,b,'agencyConsent'))return 'Получить согласие агентства на актуальный бриф';
 return 'Передать контакты и отметить знакомство';
}
export function nextAction(data){
 if(data.status==='closed')return {stage:'outcome',action:'Заявка закрыта',closed:true};
 const w=normalizeWorkflow(data.workflow,data.receipt?.brief),b=w.brief;
 const ongoing=w.teams.find(t=>t.contactsShared&&!t.result.trim());
 // Recorded introductions remain accessible even if a later brief needs clarification.
 if(ongoing)return {stage:'outcome',action:teamAction(ongoing,b),agencySlug:ongoing.agencySlug};
 const missing=Object.keys(briefFields).filter(k=>!b[k]?.trim());
 if(missing.length)return {stage:'brief',action:'Уточнить задачу с заказчиком'};
 if(!briefConfirmed(b))return {stage:'confirm',action:'Получить подтверждение брифа'};
 // A refusal applies to its recorded brief, not automatically to later terms.
 const active=w.teams.find(t=>!t.result.trim()&&
  (t.response!=='declined'||!evidenceCurrent(t,b,'response'))&&
  (t.customerConsent!=='no'||!evidenceCurrent(t,b,'customerConsent'))&&
  (t.agencyConsent!=='no'||!evidenceCurrent(t,b,'agencyConsent')));
 if(active)return {stage:'introduction',action:teamAction(active,b),agencySlug:active.agencySlug};
 if(w.teams.some(t=>t.result.trim()||t.conversationHeld))return {stage:'outcome',action:'Проверить результат и закрыть заявку'};
 if(w.teams.length)return {stage:'selection',action:'Подобрать другую команду'};
 if(data.recommendations?.length&&data.recommendations.every(r=>r.reason.trim()&&r.questions.trim()))return {stage:'introduction',action:'Проверить интерес рекомендованных команд'};
 return {stage:'selection',action:'Подобрать подходящие команды'};
}
