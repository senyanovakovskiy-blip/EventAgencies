import {KEY,normalizeDraft} from './project-store.js';
import {REFERENCE_KEY,normalizeReferences} from './reference-store.js';
import {makeProjectCopy,normalizeProjectCopy} from './project-copy-model.js';

const RETRY_KEY='eventagencies-account-copy-retry-v1';
export const PREVIOUS_PROJECT_KEY='eventagencies-previous-project-v1';
export async function copyRequest(path,options={}){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
 try{
  const response=await fetch(path,{credentials:'same-origin',cache:'no-store',...options,headers:{Accept:'application/json',...(options.body?{'Content-Type':'application/json'}:{}),...options.headers},signal:controller.signal});
  if(!response.headers.get('content-type')?.includes('application/json'))throw Object.assign(new Error('authentication_required'),{code:'authentication_required'});
  const result=await response.json();if(!response.ok)throw Object.assign(new Error(result.error||'request_failed'),{code:result.error||'request_failed',status:response.status});
  return result;
 }finally{clearTimeout(timer);}
}
export function currentProjectCopy(getState,options){
 const references=normalizeReferences(JSON.parse(localStorage.getItem(REFERENCE_KEY)||'[]'));
 const snapshot=makeProjectCopy(getState(),references,options);
 if(!normalizeProjectCopy(snapshot))throw Object.assign(new Error('copy_too_large'),{code:'copy_too_large'});
 return snapshot;
}
export async function saveAccountCopy(name,snapshot){
 const run=async()=>{
  const content=JSON.stringify({name,snapshot});if(new TextEncoder().encode(content).length>1000000)throw Object.assign(new Error('copy_too_large'),{code:'copy_too_large'});
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(content))),byte=>byte.toString(16).padStart(2,'0')).join('');
  let retry=null;try{retry=JSON.parse(localStorage.getItem(RETRY_KEY)||'null');}catch{}
  if(retry?.hash!==hash||typeof retry?.key!=='string'||!/^[a-f0-9-]{36}$/i.test(retry.key))retry={key:crypto.randomUUID(),hash};
  try{localStorage.setItem(RETRY_KEY,JSON.stringify(retry));}catch{throw Object.assign(new Error('browser_storage_unavailable'),{code:'browser_storage_unavailable'});}
  const result=await copyRequest('/api/project-copies',{method:'POST',body:JSON.stringify({requestId:retry.key,name,snapshot})});
  if(result.ok!==true||!Number.isSafeInteger(result.item?.id)||result.item.id<1)throw Error('unconfirmed_save');
  try{if(JSON.parse(localStorage.getItem(RETRY_KEY)||'null')?.key===retry.key)localStorage.removeItem(RETRY_KEY);}catch{}
  return result.item;
 };
 return navigator.locks?navigator.locks.request('eventagencies-account-copy-save',run):run();
}
export function previousProject(){
 try{
  const value=JSON.parse(localStorage.getItem(PREVIOUS_PROJECT_KEY)||'null');
  if(value?.version!==1||value.draft?.version!==1||!Array.isArray(value.references))return null;
  return {version:1,draft:normalizeDraft(value.draft),references:normalizeReferences(value.references),includeNotes:true,includeContact:true};
 }catch{return null;}
}
export function restoreProjectCopy(snapshot,getState){
 const original=normalizeDraft(getState()),references=normalizeReferences(JSON.parse(localStorage.getItem(REFERENCE_KEY)||'[]'));
 const next=normalizeDraft(snapshot.draft);next.request=null;
 if(!snapshot.includeContact)next.contact=original.contact;
 if(!snapshot.includeNotes)next.workNotes=original.workNotes;
 const priorDraft=localStorage.getItem(KEY),priorReferences=localStorage.getItem(REFERENCE_KEY);
 const backup=JSON.stringify({version:1,draft:original,references,createdAt:new Date().toISOString()});
 // Keep the prior project before changing either browser record. If browser
 // storage is full, refuse the replacement; never erase data to make room.
 try{localStorage.setItem(PREVIOUS_PROJECT_KEY,backup);}catch{throw Object.assign(new Error('browser_storage_unavailable'),{code:'browser_storage_unavailable'});}
 try{
  localStorage.setItem(KEY,JSON.stringify(next));
  localStorage.setItem(REFERENCE_KEY,JSON.stringify(normalizeReferences(snapshot.references)));
 }catch{
  let recovered=true;
  for(const [key,value]of [[KEY,priorDraft],[REFERENCE_KEY,priorReferences]])try{if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);}catch{recovered=false;}
  throw Object.assign(new Error(recovered?'browser_storage_unavailable':'restore_recovery_required'),{code:recovered?'browser_storage_unavailable':'restore_recovery_required'});
 }
 document.dispatchEvent(new Event('ea:project-copy-restored'));
}
