import {INQUIRY_KEY,submissionPayload,samePayload,validReceipt} from './inquiry-model.js';

export function createInquiryClient({storage,transport=fetch,uuid=()=>crypto.randomUUID(),timeout=15000}){
 let remembered=null,pending=null;
 function read(){
  try{const value=JSON.parse(storage.getItem(INQUIRY_KEY));if(value&&typeof value.key==='string'&&value.payload&&!(value.key===remembered?.key&&validReceipt(remembered.receipt)&&!validReceipt(value.receipt)))remembered=value;}catch{}
  return remembered;
 }
 function accepted(state){const entry=read();return entry&&samePayload(entry.payload,state)&&validReceipt(entry.receipt)?entry.receipt:null;}
 function hasPending(state){const entry=read();return Boolean(entry&&samePayload(entry.payload,state)&&!validReceipt(entry.receipt));}
 async function perform(state,{beforeNewRequest}={}){
  const candidate=submissionPayload(state);let entry=read();
  if(!entry||!samePayload(entry.payload,candidate)){
   let validationError;
   try{await beforeNewRequest?.(candidate);}catch(error){validationError=error;}
   // Another document may have saved this attempt while the catalog was loading.
   entry=read();
   if(!entry||!samePayload(entry.payload,candidate)){
    if(validationError)throw validationError;
    entry={key:uuid(),payload:candidate,receipt:null};
   }
  }
  if(validReceipt(entry.receipt))return entry.receipt;
  // Retry the whole original payload. Catalog changes cannot block receipt recovery.
  const payload=entry.payload;
  // Persist the retry key BEFORE any request; a reload or lost response reuses it.
  try{storage.setItem(INQUIRY_KEY,JSON.stringify(entry));remembered=entry;}catch{throw Error('retry_storage_unavailable');}
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),timeout);
  try{
   const response=await transport('/api/inquiries',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({requestId:entry.key,payload}),signal:abort.signal});
   let result;try{result=await response.json();}catch{throw Error(response.ok?'unconfirmed_receipt':'send_failed');}
   if(!response.ok){const code=result?.error==='invalid_selection'?'invalid_selection':'send_failed';throw Object.assign(new Error(code),{code,status:response.status});}
   if(result.ok!==true||!validReceipt(result.receipt)||!samePayload(result.receipt,payload))throw Error('unconfirmed_receipt');
   remembered={...entry,receipt:result.receipt};
   // The server is authoritative even if browser storage becomes unavailable afterwards.
   try{storage.setItem(INQUIRY_KEY,JSON.stringify(remembered));}catch{}
   return result.receipt;
  }finally{clearTimeout(timer);}
 }
 function send(state,options){
  if(pending)return pending;
  const run=()=>perform(state,options);
  const task=globalThis.navigator?.locks?navigator.locks.request('eventagencies-inquiry-send',run):run();
  pending=Promise.resolve(task).finally(()=>{pending=null;});return pending;
 }
 return {accepted,hasPending,send};
}
