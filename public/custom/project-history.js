import {validReceipt} from './inquiry-model.js';
import {contactMethods} from './project-store.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateLabel=value=>new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
const validDate=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
function validHistory(value){
 return value&&Number.isSafeInteger(value.total)&&value.total>=0&&Number.isSafeInteger(value.page)&&value.page>=1&&Number.isSafeInteger(value.pages)&&value.pages>=value.page&&Array.isArray(value.items)&&value.items.length<=10&&value.items.every(item=>Number.isSafeInteger(item.recordId)&&item.recordId>0&&/^EA-\d{4}-\d{6,}$/.test(item.id)&&validDate(item.createdAt)&&['status','statusLabel','format','city','date'].every(key=>typeof item[key]==='string')&&typeof item.dateUnknown==='boolean'&&Array.isArray(item.agencies)&&item.agencies.every(name=>typeof name==='string'));
}
async function fetchRecord(url,controller){
 const timer=setTimeout(()=>controller.abort(),15000);
 try{
  const response=await fetch(url,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'},signal:controller.signal});
  if(!response.ok)throw Object.assign(new Error('request_failed'),{status:response.status});
  if(!response.headers.get('content-type')?.includes('application/json'))throw Object.assign(new Error('authentication_required'),{status:401});
  return await response.json();
 }finally{clearTimeout(timer);}
}

export function setupProjectHistory({briefRows,formatName}){
 const section=document.getElementById('project-history');if(!section||section.hidden)return;
 const panel=section.querySelector('details'),list=section.querySelector('[data-history-list]'),status=section.querySelector('[data-history-status]'),empty=section.querySelector('[data-history-empty]'),pages=section.querySelector('[data-history-pages]'),pageLabel=section.querySelector('[data-history-page-label]'),refresh=section.querySelector('[data-history-refresh]'),previous=section.querySelector('[data-history-page="previous"]'),next=section.querySelector('[data-history-page="next"]');
 let page=1,pageCount=1,loaded=false,loading=false,listVersion=0,listController=null,detailVersion=0,detailController=null,currentReceipt=null,trigger=null;
 const signIn='<a href="/signin-with-chatgpt?return_to=%2Fmy-project%23project-history" target="_top">Войти в мой аккаунт ↗</a>';
 const dialog=document.createElement('dialog');dialog.id='project-history-dialog';dialog.setAttribute('aria-labelledby','history-receipt-title');
 dialog.innerHTML=`<button class="brief-close" type="button" data-close-history-receipt aria-label="Закрыть заявку">×</button><span class="eyebrow">Отправленная заявка</span><h2 id="history-receipt-title">Описание заявки</h2><div data-history-receipt-body></div><p class="brief-local-note" role="status" data-history-receipt-status></p><div class="history-receipt-actions"><button class="primary-action" type="button" data-close-history-receipt>Закрыть</button><button class="secondary-action" type="button" data-copy-history-number disabled>Скопировать номер</button></div>`;
 document.body.append(dialog);
 const detailBody=dialog.querySelector('[data-history-receipt-body]'),detailStatus=dialog.querySelector('[data-history-receipt-status]'),copy=dialog.querySelector('[data-copy-history-number]');
 async function load(requestedPage=page){
  listController?.abort();const controller=new AbortController();listController=controller;const version=++listVersion;
  loading=true;refresh.disabled=true;previous.disabled=true;next.disabled=true;list.replaceChildren();empty.hidden=true;pages.hidden=true;status.textContent='Загружаем отправленные заявки…';
  try{
   const result=await fetchRecord('/api/inquiries?page='+requestedPage,controller);if(version!==listVersion)return;
   if(!validHistory(result))throw Error('invalid_history');
   page=result.page;pageCount=result.pages;loaded=true;
   list.innerHTML=result.items.map(item=>`<li><button class="project-history-open" type="button" data-history-record="${item.recordId}" aria-label="Открыть заявку ${esc(item.id)}"><span class="project-history-main"><span class="project-history-id">${esc(item.id)} · ${esc(dateLabel(item.createdAt))}</span><strong>${esc([item.format?formatName(item.format):'Событие',item.city].filter(Boolean).join(' · '))}</strong><span class="project-history-context">${esc(item.dateUnknown?'Дата пока неизвестна':item.date||'Дата не указана')}${item.agencies.length?' · '+esc(item.agencies.join(', ')):' · Помощь с подбором команды'}</span></span><span class="project-history-state"><span class="project-history-badge" data-status="${esc(item.status)}">${esc(item.statusLabel)}</span><span aria-hidden="true">Открыть ↗</span></span></button></li>`).join('');
   empty.hidden=result.total>0;empty.textContent='Отправленных заявок пока нет. После отправки задачи её номер и описание появятся здесь.';
   status.textContent=result.total?'Показаны '+((page-1)*10+1)+'–'+((page-1)*10+result.items.length)+' из '+result.total:'Заявок пока нет.';
   pages.hidden=pageCount<=1;pageLabel.textContent=page+' / '+pageCount;previous.disabled=page<=1;next.disabled=page>=pageCount;
  }catch(error){
   if(version!==listVersion)return;loaded=false;empty.hidden=false;
   status.textContent=error.status===401?'Нужен вход в аккаунт.':'Не удалось загрузить заявки.';
   empty.innerHTML=error.status===401?'<p>Войдите в аккаунт, в котором отправляли заявки.</p>'+signIn:'<p>Попробуйте обновить список.</p>';
  }finally{if(version===listVersion){loading=false;refresh.disabled=false;}}
 }
 async function openReceipt(recordId,button){
  if(dialog.open)return;trigger=button;currentReceipt=null;copy.disabled=true;detailBody.replaceChildren();detailStatus.textContent='Загружаем описание…';document.getElementById('history-receipt-title').textContent='Описание заявки';dialog.showModal();
  detailController?.abort();const controller=new AbortController();detailController=controller;const version=++detailVersion;
  try{
   const result=await fetchRecord('/api/inquiries/'+recordId,controller);if(version!==detailVersion||!dialog.open)return;
   if(result.recordId!==recordId||!validReceipt(result.receipt)||typeof result.statusLabel!=='string')throw Error('invalid_receipt');
   currentReceipt=result.receipt;const receipt=result.receipt,rows=briefRows(receipt.brief);
   document.getElementById('history-receipt-title').textContent='Заявка '+receipt.id;
   detailBody.innerHTML=`<div class="history-receipt-meta"><span class="project-history-badge">${esc(result.statusLabel)}</span><p>Отправлена ${esc(dateLabel(receipt.createdAt))}${validDate(result.updatedAt)?'<br>Статус записи на '+esc(dateLabel(result.updatedAt)):''}</p></div><p class="history-receipt-intro">Описание на момент отправки заявки.</p><dl class="review-brief">${rows.filter(([label])=>label!=='Пожелания').map(([label,value])=>`<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl><section class="history-receipt-section"><h3>Пожелания</h3><p class="history-receipt-wishes">${esc(receipt.brief.description||'Пока не указаны.')}</p></section><section class="history-receipt-section"><h3>Выбранные команды и работы</h3>${receipt.selection.length?`<ol>${receipt.selection.map(item=>`<li><strong>${esc(item.name)}</strong>${item.work?`<a href="/work/${esc(item.work.slug)}?from=%2Fmy-project%23project-history">${esc(item.work.title)} ↗</a>`:'<span>Работа не выбрана</span>'}</li>`).join('')}</ol>`:'<p>Помощь с подбором; команды пока не выбраны.</p>'}</section><section class="history-receipt-section"><h3>Контакт для ответа</h3><p>${esc(receipt.contact.name)}<br>${esc(contactMethods[receipt.contact.method])}: ${esc(receipt.contact.value)}</p></section>`;
   detailStatus.textContent='';copy.disabled=false;
  }catch(error){
   if(version!==detailVersion||!dialog.open)return;
   detailStatus.textContent=error.status===404?'Эта заявка не найдена в вашем аккаунте.':error.status===401?'Войдите в свой аккаунт, чтобы открыть заявку.':'Не удалось загрузить описание. Закройте окно и попробуйте ещё раз.';
   if(error.status===401)detailBody.innerHTML=signIn;
  }
 }
 panel.addEventListener('toggle',()=>{section.querySelector('[data-history-toggle-label]').textContent=panel.open?'Свернуть ↑':'Показать ↓';if(panel.open&&!loaded&&!loading)load(1);});
 refresh.addEventListener('click',()=>load(page));previous.addEventListener('click',()=>{if(page>1)load(page-1);});next.addEventListener('click',()=>{if(page<pageCount)load(page+1);});
 list.addEventListener('click',event=>{const button=event.target.closest('[data-history-record]');if(button)openReceipt(Number(button.dataset.historyRecord),button);});
 dialog.querySelectorAll('[data-close-history-receipt]').forEach(button=>button.addEventListener('click',()=>dialog.close()));
 dialog.addEventListener('close',()=>{detailVersion++;detailController?.abort();currentReceipt=null;detailBody.replaceChildren();(trigger?.isConnected?trigger:panel.querySelector('summary'))?.focus({preventScroll:true});});
 copy.addEventListener('click',async()=>{
  if(!currentReceipt)return;const id=currentReceipt.id,version=detailVersion;
  try{await navigator.clipboard.writeText(id);if(dialog.open&&version===detailVersion)detailStatus.textContent='Номер заявки скопирован: '+id;}
  catch{if(dialog.open&&version===detailVersion)detailStatus.textContent='Номер заявки: '+id+'. Выделите его и скопируйте.';}
 });
 document.addEventListener('ea:inquiry-accepted',()=>{loaded=false;if(panel.open)load(1);});
 if(location.hash==='#project-history')panel.open=true;
}
