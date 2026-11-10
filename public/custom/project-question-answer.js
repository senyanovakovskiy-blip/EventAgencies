import {readDraft,writeDraft,updateWorkNote,workNoteKey} from './project-store.js';
import {referenceProjectMarker} from './reference-batch-session.js';
import {workDiscussionPrompts} from './project-presentation.js';

const linked=(work,agencySlug)=>work.agencySlug===agencySlug||work.agencySlugs?.includes(agencySlug);
const validSlug=value=>typeof value==='string'&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);

/** Keep an authored question and a client's actual answer together in one private note. */
export function setupProjectQuestionAnswer({getData,canEdit,onSaved,onError}){
 const dialog=document.createElement('dialog');
 dialog.id='project-question-answer';
 dialog.setAttribute('aria-labelledby','project-question-answer-title');
 dialog.innerHTML=`<button class="brief-close" type="button" data-close-question-answer aria-label="Закрыть ответ">×</button><span class="eyebrow">Для вашего события</span><h2 id="project-question-answer-title">Ответить на вопрос</h2><p class="project-question-answer-context" data-answer-context></p><blockquote data-answer-question></blockquote><form><label for="project-question-answer-text">Ваш ответ</label><textarea id="project-question-answer-text" rows="5" maxlength="1000" aria-describedby="project-question-answer-help project-question-answer-count" placeholder="Что вы хотите взять для своего события или изменить?"></textarea><p id="project-question-answer-help">Сохранится в личной заметке к этой работе и команде. Пожелания и заявка изменятся только после отдельного подтверждения.</p><details class="project-question-answer-preview"><summary>Посмотреть всю заметку</summary><p data-answer-preview></p></details><p id="project-question-answer-count" data-answer-count></p><p class="project-question-answer-status" data-answer-status role="status" aria-live="polite"></p><div class="project-question-answer-actions"><button class="primary-action" type="submit">Сохранить мой ответ</button><button class="secondary-action" type="button" data-close-question-answer>Отмена</button></div></form>`;
 document.body.append(dialog);
 const form=dialog.querySelector('form'),field=dialog.querySelector('textarea'),submit=form.querySelector('[type="submit"]'),status=dialog.querySelector('[data-answer-status]'),count=dialog.querySelector('[data-answer-count]'),preview=dialog.querySelector('[data-answer-preview]');
 let active=null,opening=false,busy=false,epoch=0,trigger=null;
 const addition=()=>active&&field.value.trim()?`Вопрос по работе: ${active.question}\nМой ответ: ${field.value.trim()}`:'';
 const proposed=()=>{
  if(!active)return '';
  const next=addition();
  return next?[active.expected.trimEnd(),next].filter(Boolean).join('\n\n'):active.expected;
 };
 function sync(){
  const value=proposed(),answer=field.value.trim(),duplicate=Boolean(answer&&active?.expected.includes(addition())),tooLong=value.length>1000;
  preview.textContent=value||'Заметка пока пуста.';
  count.textContent=value.length+' / 1000 символов';
  if(!busy&&active&&!active.invalid){
   status.textContent=duplicate?'Этот ответ уже есть в заметке.':tooLong?'Ответ не помещается в заметку. Сократите ответ или прежний текст.':'';
  }
  submit.disabled=busy||!active||Boolean(active?.invalid)||!answer||duplicate||tooLong;
  submit.textContent=busy?'Сохраняем…':'Сохранить мой ответ';
  field.readOnly=busy;
  dialog.querySelectorAll('[data-close-question-answer]').forEach(button=>{button.disabled=busy;});
 }
 const stillCurrent=session=>{
  const opener=session.trigger;
  return opener.isConnected&&!opener.disabled&&!opener.closest('[hidden],[inert]')&&opener.dataset.answerWork===session.workSlug&&opener.dataset.answerAgency===session.agencySlug&&opener.dataset.answerWorkQuestion===String(session.questionIndex)&&location.pathname+location.search===session.path;
 };
 async function open(opener){
  if(opening||dialog.open)return;
  const agencySlug=opener.dataset.answerAgency,workSlug=opener.dataset.answerWork,questionIndex=Number(opener.dataset.answerWorkQuestion),path=location.pathname+location.search;
  if(!validSlug(agencySlug)||!validSlug(workSlug)||!Number.isInteger(questionIndex)||questionIndex<0||questionIndex>2)return;
  if(!canEdit()){onError('Дождитесь завершения сохранения проекта и повторите действие.');return;}
  opening=true;const version=epoch;
  try{
   const data=await getData();if(version!==epoch||!opener.isConnected)return;
   const work=data.projects.find(item=>item.slug===workSlug&&linked(item,agencySlug)),agency=data.agencies.find(item=>item.slug===agencySlug),question=workDiscussionPrompts(work)[questionIndex];
   if(!work||!agency||!question||!canEdit()){onError('Работа или вопрос изменились. Откройте актуальную карточку.');return;}
   const marker=referenceProjectMarker();if(marker===null)throw Error('storage');
   const current=readDraft(localStorage),key=workNoteKey(agencySlug,workSlug);
   active={agencySlug,workSlug,questionIndex,question,key,expected:current.workNotes[key]||'',marker,path,trigger:opener,invalid:null};trigger=opener;
   dialog.querySelector('[data-answer-context]').textContent=agency.name+' · '+work.fullTitle;
   dialog.querySelector('[data-answer-question]').textContent=question;
   field.value='';status.textContent='';sync();dialog.showModal();field.focus({preventScroll:true});
  }catch{if(version===epoch&&opener.isConnected)onError('Не удалось открыть ответ. Проверьте сохранение данных в браузере и повторите.');}
  finally{opening=false;}
 }
 document.addEventListener('click',event=>{
  const opener=event.target.closest('[data-answer-work-question]');
  if(!opener||opener.disabled)return;
  event.preventDefault();open(opener);
 });
 field.addEventListener('input',sync);
 dialog.querySelectorAll('[data-close-question-answer]').forEach(button=>button.addEventListener('click',()=>{if(!busy)dialog.close();}));
 dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
 dialog.addEventListener('close',()=>{
  const opener=trigger;active=null;epoch++;trigger=null;field.value='';status.textContent='';preview.textContent='';count.textContent='';
  if(opener?.isConnected)opener.focus({preventScroll:true});
 });
 addEventListener('pagehide',()=>{epoch++;});
 const invalidate=()=>{epoch++;if(active){active.invalid='project';status.textContent='Проект изменился. Ответ оставлен в окне, но его нельзя сохранить в новый проект.';sync();}};
 document.addEventListener('ea:project-started',invalidate);
 document.addEventListener('ea:project-copy-restored',invalidate);
 form.addEventListener('submit',async event=>{
  event.preventDefault();const session=active;if(!session||session.invalid||busy)return;
  if(!canEdit()){status.textContent='Дождитесь завершения сохранения проекта и повторите.';return;}
  const value=proposed();if(!field.value.trim()||value.length>1000||session.expected.includes(addition())){sync();return;}
  let next;
  try{
   // Read, compare and write without yielding so another edit cannot be overwritten.
   if(referenceProjectMarker()!==session.marker||!stillCurrent(session)){session.invalid='project';status.textContent='Карточка или проект изменились. Откройте вопрос снова.';sync();return;}
   const current=readDraft(localStorage);
   if((current.workNotes[session.key]||'')!==session.expected){session.invalid='note';status.textContent='Заметка изменилась в другом месте. Ваш ответ оставлен в окне; скопируйте его и откройте вопрос заново.';sync();return;}
   if(referenceProjectMarker()!==session.marker){session.invalid='project';status.textContent='Проект изменился. Откройте вопрос снова.';sync();return;}
   next=writeDraft(localStorage,updateWorkNote(current,session.agencySlug,session.workSlug,value));
  }catch{status.textContent='Не удалось сохранить. Ваш ответ оставлен в окне; разрешите хранение данных и повторите.';return;}
  busy=true;sync();
  try{await onSaved(next,{agencySlug:session.agencySlug,workSlug:session.workSlug,value});if(active===session)dialog.close();}
  catch{status.textContent='Ответ сохранён. Не удалось обновить экран — закройте окно и обновите страницу.';}
  finally{busy=false;sync();}
 });
}
