import {PREVIOUS_PROJECT_KEY} from './project-copy-client.js';

export const REFERENCE_BATCH_KEY='eventagencies-reference-batch-v1';
const validSlug=value=>typeof value==='string'&&value.length<=200&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const selectedSlugs=value=>Array.isArray(value)?[...new Set(value.slice(0,200).filter(validSlug))]:[];
const state={active:false,busy:false,selected:new Set(),generation:0};
let project=null,lastStored,dirty=false,available=true;

// Only the existing backup's timestamp is retained, never its private draft.
export function referenceProjectMarker(){
 try{
  const raw=localStorage.getItem(PREVIOUS_PROJECT_KEY);if(raw===null)return 'initial';
  const backup=JSON.parse(raw);
  return backup?.version===1&&typeof backup.createdAt==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(backup.createdAt)?'backup:'+backup.createdAt:null;
 }catch{return null;}
}
function clear(){state.active=false;state.busy=false;state.selected.clear();state.generation++;}
function decode(raw){
 if(typeof raw!=='string'||raw.length>50000)return null;
 try{
  const value=JSON.parse(raw);
  if(value?.version!==1||typeof value.project!=='string'||value.project.length>80||typeof value.active!=='boolean'||!Array.isArray(value.selected)||value.selected.length>200)return null;
  return {project:value.project,active:value.active,selected:value.active?selectedSlugs(value.selected):[]};
 }catch{return null;}
}
function reconcile(){
 const marker=referenceProjectMarker();if(marker===null){available=false;return false;}
 const changed=project!==null&&project!==marker;
 if(changed){clear();dirty=true;}
 project=marker;
 try{
  const raw=sessionStorage.getItem(REFERENCE_BATCH_KEY);
  // A cached document must adopt the newer document's state on history return.
  // A failed write, with an unchanged stored value, keeps its in-memory choice.
  if(changed||(raw!==lastStored&&!(dirty&&lastStored===undefined))){
   const saved=decode(raw);clear();
   if(saved?.project===project){state.active=saved.active;for(const slug of saved.selected)state.selected.add(slug);}
   dirty=false;
  }
  lastStored=raw;
 }catch{available=false;}
 return changed;
}
function save(){
 // An unknown project marker must not attach a choice to an unrelated project.
 if(state.active&&(project===null||referenceProjectMarker()!==project)){available=false;dirty=true;return;}
 const raw=state.active?JSON.stringify({version:1,project,active:true,selected:selectedSlugs([...state.selected])}):null;
 try{
  if(raw!==lastStored||dirty){if(raw===null)sessionStorage.removeItem(REFERENCE_BATCH_KEY);else sessionStorage.setItem(REFERENCE_BATCH_KEY,raw);}
  lastStored=raw;dirty=false;available=true;
 }catch{dirty=true;available=false;}
}
function reset(){
 const marker=referenceProjectMarker();if(marker!==null)project=marker;
 clear();dirty=true;save();
}
function prune(slugs){
 const current=new Set(selectedSlugs(slugs));
 for(const slug of state.selected)if(!current.has(slug))state.selected.delete(slug);
 save();
}

reconcile();
export const referenceBatchSession={
 state,reconcile,save,reset,prune,
 get available(){return available;},
 resume(){state.busy=false;state.generation++;return reconcile();}
};
