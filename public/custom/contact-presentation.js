import {contactFieldError} from './inquiry-model.js';
import {contactMethods} from './project-store.js';

const methods={
 email:{inputmode:'email',autocomplete:'email',placeholder:'name@example.com',help:'Например, name@example.com. Укажите адрес для ответа.'},
 phone:{inputmode:'tel',autocomplete:'tel',placeholder:'+7 900 000-00-00',help:'Например, +7 900 000-00-00. Нужно от 7 до 15 цифр.'},
 telegram:{inputmode:'text',autocomplete:'off',placeholder:'@username или ссылка на профиль',help:'Ваш @username или ссылка вида https://t.me/username.'}
};

/** Presentation only: no storage, requests, trimming or replacement of input. */
export function setupContactPresentation(form){
 const doc=form.ownerDocument,name=form.elements.namedItem('name'),method=form.elements.namedItem('method'),value=form.elements.namedItem('value');
 const fields={name,value},errors={name:doc.getElementById('contact-name-error'),value:doc.getElementById('contact-value-error')};
 const shown={name:'',value:''};let valueVisited=false;
 const getValues=()=>({name:name.value,method:method.value,value:value.value});
 function setError(field,error){
  const message=error?.message||'',node=errors[field],input=fields[field];
  if(message)input.setAttribute('aria-invalid','true');else input.removeAttribute('aria-invalid');
  input.setAttribute('aria-describedby','contact-'+field+'-help contact-local-note'+(message?' contact-'+field+'-error':''));
  if(message!==shown[field]){node.hidden=!message;node.textContent=message;shown[field]=message;}
 }
 function validateField(field){const error=contactFieldError(getValues(),field);setError(field,error);return error;}
 function sync(){
  const config=methods[method.value]||methods.email;
  doc.getElementById('contact-value-label').textContent=contactMethods[method.value]||'Контакт для ответа';
  const help=doc.getElementById('contact-value-help');if(help.textContent!==config.help)help.textContent=config.help;
  // type=email can sanitize whitespace. Keep the raw text and select the
  // keyboard with inputmode; inquiry-model remains the sole format validator.
  if(value.type!=='text')value.type='text';
  value.inputMode=config.inputmode;value.autocomplete=config.autocomplete;value.placeholder=config.placeholder;
  value.setAttribute('autocapitalize','none');value.setAttribute('autocorrect','off');value.spellcheck=false;
  name.inputMode='text';name.autocomplete='name';name.setAttribute('autocapitalize','words');name.setAttribute('autocorrect','off');name.spellcheck=false;
  for(const field of ['name','value'])if(shown[field])validateField(field);
 }
 function reset(){valueVisited=false;setError('name',null);setError('value',null);sync();}
 function validateForSubmit(contact=getValues(),{focus=true}={}){
  valueVisited=true;let first=null;
  for(const field of ['name','value']){const error=contactFieldError(contact,field);setError(field,error);first ||= error;}
  if(first&&focus)fields[first.field].focus();
  return first;
 }
 name.addEventListener('blur',()=>validateField('name'));
 value.addEventListener('blur',()=>{valueVisited=true;validateField('value');});
 method.addEventListener('blur',()=>{if(valueVisited)validateField('value');});
 form.addEventListener('input',event=>{
  if(event.target===method){sync();return;}
  const field=event.target.name;
  // Once corrected, a new error waits for blur or the next send attempt.
  if((field==='name'||field==='value')&&shown[field])validateField(field);
 });
 form.addEventListener('change',event=>{if(event.target===method)sync();else if(event.target===name||event.target===value){const field=event.target.name;if(shown[field])validateField(field);}});
 sync();
 return {getValues,sync,reset,validateForSubmit};
}
