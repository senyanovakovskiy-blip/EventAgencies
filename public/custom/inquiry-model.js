import {normalizeDraft,occasions,contactMethods} from './project-store.js';

export const INQUIRY_KEY='eventagencies-inquiry-v1';
export const submissionPayload=state=>{
 const {brief,contact,selection}=normalizeDraft({...state,version:1});
 return {brief,contact,selection};
};
export const samePayload=(a,b)=>JSON.stringify(submissionPayload(a))===JSON.stringify(submissionPayload(b));
export function contactFieldError(contact,field){
 if(field==='name')return typeof contact?.name!=='string'||!contact.name.trim()?{field:'name',message:'Укажите, как к вам обращаться.'}:null;
 if(field!=='value')return null;
 if(!Object.hasOwn(contactMethods,contact?.method)||typeof contact?.value!=='string'||!contact.value.trim())return {field:'value',message:'Укажите один удобный способ связи.'};
 const value=contact.value.trim();
 if(contact.method==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))return {field:'value',message:'Проверьте адрес электронной почты.'};
 if(contact.method==='phone'&&(!/^[+\d\s().-]+$/.test(value)||value.replace(/\D/g,'').length<7||value.replace(/\D/g,'').length>15))return {field:'value',message:'Проверьте номер телефона.'};
 if(contact.method==='telegram'&&!/^(?:@|https:\/\/t\.me\/)?[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(value))return {field:'value',message:'Укажите Telegram в формате @username или https://t.me/username.'};
 return null;
}
export function contactError(contact){return contactFieldError(contact,'name')||contactFieldError(contact,'value');}
// Reject malformed server inputs instead of silently truncating or dropping them.
export function validPayload(input){
 if(!input||!input.brief||!input.contact||!Array.isArray(input.selection)||input.selection.length>3)return false;
 const b=input.brief,c=input.contact;
 for(const key of ['format','city','date','guests','budget','description'])if(typeof b[key]!=='string'||b[key].length>(key==='description'?3000:180))return false;
 if(!['', 'other', ...Object.keys(occasions)].includes(b.format)||typeof b.dateUnknown!=='boolean'||typeof b.budgetHelp!=='boolean')return false;
 if(b.guests&&(!/^\d+$/.test(b.guests)||Number(b.guests)<1||Number(b.guests)>10000000))return false;
 if(b.budget&&(!/^\d+$/.test(b.budget)||!Number.isSafeInteger(Number(b.budget))))return false;
 if(typeof c.name!=='string'||c.name.length>120||typeof c.value!=='string'||c.value.length>254||contactError(c))return false;
 const seen=new Set();
 for(const s of input.selection){if(!s||typeof s.agencySlug!=='string'||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s.agencySlug)||seen.has(s.agencySlug)||(s.workSlug!==null&&(typeof s.workSlug!=='string'||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s.workSlug))))return false;seen.add(s.agencySlug);}
 return true;
}
export function validReceipt(value){
 return Boolean(value&&/^EA-\d{4}-\d{6,}$/.test(value.id)&&typeof value.createdAt==='string'&&Number.isFinite(Date.parse(value.createdAt))&&value.recipient==='EventAgencies'&&typeof value.localServer==='boolean'&&validPayload(value)&&value.selection.every(s=>typeof s.name==='string'&&s.name.length<300&&(s.work===null||s.work?.slug===s.workSlug&&typeof s.work.title==='string'&&s.work.title.length<1000)));
}
