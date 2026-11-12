import {canonicalAgencySlug,canonicalWorkSlug,canonicalWorkNoteKey,hasLegacyDraftIdentifiers} from './project-aliases.js';
export const KEY='eventagencies-project-v1';
export const occasions={corporate:'Корпоратив',conference:'Конференция',presentation:'Презентация',teambuilding:'Тимбилдинг',private:'Частное событие',wedding:'Свадьба',birthday:'День рождения или юбилей',product_launch:'Запуск продукта или бренда',opening:'Открытие площадки',new_year:'Новогодний вечер',exhibition:'Выставка или экспозиция',sports_day:'Спортивный день или турнир'};
export const contactMethods={email:'Электронная почта',phone:'Телефон',telegram:'Telegram'};
const slug=v=>typeof v==='string'&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v);
export const emptyDraft=()=>({version:1,selection:[],workNotes:{},brief:{format:'',city:'',date:'',dateUnknown:false,guests:'',budget:'',budgetHelp:false,description:''},contact:{name:'',method:'email',value:''},request:null});
export function normalizeSelection(items){
 const selection=[],seenSources=new Set(),sourceIsAlias=new Map();
 for(const item of Array.isArray(items)?items:[]){
  if(!slug(item?.agencySlug)||seenSources.has(item.agencySlug))continue;
  seenSources.add(item.agencySlug);
  const agencySlug=canonicalAgencySlug(item.agencySlug),workSlug=slug(item.workSlug)?canonicalWorkSlug(item.workSlug):null,isAlias=agencySlug!==item.agencySlug;
  const index=selection.findIndex(entry=>entry.agencySlug===agencySlug);
  if(index<0){selection.push({agencySlug,workSlug});sourceIsAlias.set(agencySlug,isAlias);}
  else if(sourceIsAlias.get(agencySlug)&&!isAlias){selection[index]={agencySlug,workSlug:workSlug||selection[index].workSlug};sourceIsAlias.set(agencySlug,false);}
  else if(!selection[index].workSlug&&workSlug)selection[index]={agencySlug,workSlug};
  if(seenSources.size===3)break;
 }
 return selection;
}
export function normalizeDraft(value){
 const state=emptyDraft();if(!value||value.version!==1)return state;
 for(const [key,note] of Object.entries(value.workNotes||{})){const parts=key.split('/');if(parts.length===2&&parts.every(slug)&&typeof note==='string')state.workNotes[key]=note.slice(0,1000);}
 state.selection=normalizeSelection(value.selection);
 const legacyNoteKey='intelsport-bb868/portfolio-intelsport-bb868-8bf1feb',canonicalNoteKey=canonicalWorkNoteKey(legacyNoteKey);
 if(state.workNotes[legacyNoteKey]&&!state.workNotes[canonicalNoteKey])state.workNotes[canonicalNoteKey]=state.workNotes[legacyNoteKey];
 for(const key of ['format','city','date','guests','budget','description'])if(typeof value.brief?.[key]==='string')state.brief[key]=value.brief[key].slice(0,key==='description'?3000:180);
 if(!Object.hasOwn(occasions,state.brief.format)&&state.brief.format!=='other')state.brief.format='';
 state.brief.budgetHelp=value.brief?.budgetHelp===true;
 state.brief.dateUnknown=value.brief?.dateUnknown===true;
 for(const key of ['name','value'])if(typeof value.contact?.[key]==='string')state.contact[key]=value.contact[key].slice(0,key==='name'?120:254);
 if(Object.hasOwn(contactMethods,value.contact?.method))state.contact.method=value.contact.method;
 if(value.request?.localOnly===true&&typeof value.request.id==='string'&&typeof value.request.createdAt==='string')state.request={id:value.request.id.slice(0,80),createdAt:value.request.createdAt,localOnly:true};
 return state;
}
export function readDraft(storage){const raw=storage.getItem(KEY);if(!raw)return emptyDraft();try{return normalizeDraft(JSON.parse(raw));}catch{return emptyDraft();}}
export function readDraftAndMigrateAliases(storage){
 const raw=storage.getItem(KEY);if(!raw)return emptyDraft();
 try{
  const value=JSON.parse(raw),state=normalizeDraft(value);
  if(hasLegacyDraftIdentifiers(value)){
   const migrated=JSON.stringify({...value,selection:state.selection,workNotes:state.workNotes});
   if(migrated!==raw)try{if(storage.getItem(KEY)===raw)storage.setItem(KEY,migrated);}catch{}
  }
  return state;
 }catch{return emptyDraft();}
}
export function writeDraft(storage,state){const next=normalizeDraft(state);storage.setItem(KEY,JSON.stringify(next));return next;}
export function addAgency(state,agencySlug,workSlug){
 if(!slug(agencySlug)||(workSlug!==null&&!slug(workSlug)))return {state,result:'invalid'};
 const found=state.selection.find(s=>s.agencySlug===agencySlug);
 if(found&&(workSlug===null||found.workSlug===workSlug))return {state,result:'existing'};
 if(!found&&state.selection.length>=3)return {state,result:'full'};
 const selection=found?state.selection.map(s=>s.agencySlug===agencySlug?{agencySlug,workSlug}:s):[...state.selection,{agencySlug,workSlug}];
 return {state:{...state,selection,request:null},result:found?'updated':'added'};
}
export const removeAgency=(state,agencySlug)=>({...state,selection:state.selection.filter(s=>s.agencySlug!==agencySlug),request:null});
export function moveAgency(state,agencySlug,direction){
 if(direction!==-1&&direction!==1)return state;
 const index=state.selection.findIndex(item=>item.agencySlug===agencySlug),target=index+direction;
 if(index<0||target<0||target>=state.selection.length)return state;
 const selection=[...state.selection];
 [selection[index],selection[target]]=[selection[target],selection[index]];
 return {...state,selection,request:null};
}
export function restoreAgency(state,item,index){
 if(!item||!slug(item.agencySlug)||(item.workSlug!==null&&!slug(item.workSlug)))return {state,result:'invalid'};
 // A newer choice, including a different case for this team, takes precedence.
 if(state.selection.some(s=>s.agencySlug===item.agencySlug))return {state,result:'existing'};
 if(state.selection.length>=3)return {state,result:'full'};
 const selection=[...state.selection];
 selection.splice(Math.max(0,Math.min(Number.isInteger(index)?index:selection.length,selection.length)),0,{...item});
 return {state:{...state,selection,request:null},result:'restored'};
}
export function updateBrief(state,brief){
 const next=normalizeDraft({...state,brief:{...state.brief,...brief},request:null});
 return JSON.stringify(next.brief)===JSON.stringify(state.brief)?state:next;
}
export function updateContact(state,contact){
 const next=normalizeDraft({...state,contact:{...state.contact,...contact},request:null});
 return JSON.stringify(next.contact)===JSON.stringify(state.contact)?state:next;
}
export function replaceAgency(state,oldSlug,agencySlug,workSlug){
 if(!state.selection.some(s=>s.agencySlug===oldSlug)||!slug(agencySlug)||(workSlug!==null&&!slug(workSlug)))return {state,result:'invalid'};
 if(state.selection.some(s=>s.agencySlug===agencySlug))return {state,result:'existing'};
 return {state:{...state,selection:state.selection.map(s=>s.agencySlug===oldSlug?{agencySlug,workSlug}:s),request:null},result:'replaced'};
}
export function submitLocal(state,id,createdAt){
 if(state.request)return {state,result:'saved'};
 return {state:{...state,request:{id,createdAt,localOnly:true}},result:'saved'};
}

export const workNoteKey=(agencySlug,workSlug)=>agencySlug+'/'+workSlug;
export function updateWorkNote(state,agencySlug,workSlug,text){
 if(!slug(agencySlug)||!slug(workSlug)||typeof text!=='string')return state;
 const workNotes={...state.workNotes},key=workNoteKey(agencySlug,workSlug);
 if(text)workNotes[key]=text.slice(0,1000);else delete workNotes[key];
 return {...state,workNotes};
}
