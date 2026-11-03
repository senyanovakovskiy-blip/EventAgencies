import {INQUIRY_KEY,submissionPayload,samePayload,validReceipt} from './inquiry-model.js';

export function createInquiryClient({storage,transport=fetch,uuid=()=>crypto.randomUUID(),timeout=15000}){
 let remembered=null,pending=null;
 function read(){
  try{const value=JSON.parse(storage.getItem(INQUIRY_KEY));if(value&&typeof value.key==='string'&&value.payload&&!(value.key===remembered?.key&&validReceipt(remembered.receipt)&&!validReceipt(value.receipt)))remembered=value;}catch{}
  return remembered;
 }
 function accepted(state){const entry=read();return entry&&samePayload(entry.payload,state)&&validReceipt(entry.receipt)?entry.receipt:null;}
 async function perform(state){
  const payload=submissionPayload(state);let entry=read();
  if(!entry||!samePayload(entry.payload,payload))entry={key:uuid(),payload,receipt:null};
  if(validReceipt(entry.receipt))return entry.receipt;
  // Persist the retry key BEFORE any request; a reload or lost response reuses it.
  try{storage.setItem(INQUIRY_KEY,JSON.stringify(entry));remembered=entry;}catch{throw Error('retry_storage_unavailable');}
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),timeout);
  try{
   const response=await transport('/api/inquiries',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({requestId:entry.key,payload}),signal:abort.signal});
   if(!response.ok)throw Error('send_failed');
   const result=await response.json();
   if(result.ok!==true||!validReceipt(result.receipt)||!samePayload(result.receipt,payload))throw Error('unconfirmed_receipt');
   remembered={...entry,receipt:result.receipt};
   // The server is authoritative even if browser storage becomes unavailable afterwards.
   try{storage.setItem(INQUIRY_KEY,JSON.stringify(remembered));}catch{}
   return result.receipt;
  }finally{clearTimeout(timer);}
 }
 function send(state){
  if(pending)return pending;
  const run=()=>perform(state);
  const task=globalThis.navigator?.locks?navigator.locks.request('eventagencies-inquiry-send',run):run();
  pending=Promise.resolve(task).finally(()=>{pending=null;});return pending;
 }
 return {accepted,send};
}
