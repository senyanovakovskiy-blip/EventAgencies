import {KEY,readDraft,writeDraft,updateBrief} from './project-store.js';
import {BRIEF_UNDO_GROUPS} from './brief-session-undo.js';
import {PREVIOUS_PROJECT_KEY} from './project-copy-client.js';
import {referenceProjectMarker} from './reference-batch-session.js';

const same=(a,b,keys)=>keys.every(key=>a[key]===b[key]);
const pick=(brief,keys)=>Object.fromEntries(keys.map(key=>[key,brief[key]]));
const fields=BRIEF_UNDO_GROUPS.flatMap(group=>group.keys);
const wishPrompts={
 corporate:[['Общее чувство','После события гости должны почувствовать: '],['Командный момент','В программе особенно важно отметить: '],['Участие','Команде будет комфортно: '],['Финал','В финале хочется: ']],
 conference:[['Главная польза','Участники должны унести с собой: '],['Темы','Важно включить темы: '],['Знакомства','Для общения нужны: '],['Финал','В конце важно: ']],
 presentation:[['Главное сообщение','Гости должны понять: '],['Демонстрация','Показать или дать попробовать: '],['Вопросы','Оставить время на вопросы о: '],['Финал','После события гости должны: ']],
 teambuilding:[['Командная задача','Команде важно попробовать: '],['Активность','По уровню активности нам подходит: '],['Комфорт','Важно, чтобы никто не был обязан: '],['Финал','Вместе хочется прийти к результату: ']],
 private:[['Личный момент','Для нас особенно важно: '],['Настроение','Хочется, чтобы встреча ощущалась: '],['Гости','Для гостей важно предусмотреть: '],['Финал','В финале хочется: ']],
 wedding:[['История пары','Для пары особенно важно: '],['Церемония','В главном моменте хочется сохранить: '],['Комфорт гостей','Гостям важно предусмотреть: '],['Финал','Этот день хочется завершить: ']],
 birthday:[['Именинник','Для именинника важно: '],['Настроение','Встреча должна ощущаться: '],['Гости','Для гостей важно предусмотреть: '],['Памятный момент','Хочется запомнить: ']],
 product_launch:[['Главная задача','Гости должны понять: '],['Показ','Важно показать или дать попробовать: '],['Аудитория','Для этих гостей важно: '],['Следующий шаг','После события гости смогут: ']],
 opening:[['Идея пространства','Гости должны понять, что это место: '],['Маршрут','Особенно важно показать: '],['Комфорт','Нужно предусмотреть: '],['Открытие','Общий момент открытия должен: ']],
 new_year:[['Итог года','Особенно хочется отметить: '],['Настроение','Вечер должен ощущаться: '],['Программа','Гостям будет комфортно: '],['Праздник','Вместе хочется: ']],
 exhibition:[['Тема экспозиции','Гости должны увидеть: '],['Маршрут','Особенно важно показать: '],['Демонстрации','Нужно предусмотреть: '],['Встречи','Посетителям важно пообщаться с: ']],
 sports_day:[['Уровень активности','Гостям подойдут: '],['Участие','Важно, чтобы каждый мог: '],['Комфорт и безопасность','Нужно предусмотреть: '],['Общий итог','Вместе хочется: ']],
 other:[['Ощущение','Гости должны почувствовать: '],['Обязательно','Важно включить: '],['Избежать','Лучше избежать: '],['Финал','В финале хочется: ']]
};
const experiencePrompts=[
 ['Спокойное общение','Гостям важно спокойно пообщаться друг с другом без плотной обязательной программы.'],
 ['Свободный выбор','Хочется, чтобы гости могли сами выбирать активности и свой темп.'],
 ['Яркий общий момент','В программе нужен один яркий общий момент, который объединит гостей и запомнится.'],
 ['Новые знакомства','Важно помочь гостям познакомиться и найти темы для общения без обязательных выступлений.'],
 ['Попробовать новое','Гостям будет интересно попробовать что-то новое, если участие останется по желанию.'],
 ['Без конкурсов','Предпочитаем обойтись без обязательных конкурсов и публичных заданий.']
];

// The form is a local input buffer. Only explicitly edited groups may be written.
export function setupBriefEditor({form,dialog,undo,updateForm,onRead,onSaved,onClose,onSubmit,getFallbackBrief}){
 if(!form||!dialog)return null;
 const doc=form.ownerDocument,status=form.querySelector('#brief-save-status');
 const promptBox=form.querySelector('[data-brief-prompt-suggestions]'),promptList=form.querySelector('[data-brief-prompt-list]'),promptStatus=form.querySelector('[data-brief-prompt-status]'),description=form.elements.namedItem('description');
 const recovery=doc.createElement('div');recovery.className='brief-editor-recovery';recovery.hidden=true;
 recovery.setAttribute('aria-label','Обновление описания');
 form.querySelector('.brief-editor-content').prepend(recovery);
 let session=null,trigger=null,recoveryKey='';
 function renderWishPrompts(){
  if(!promptBox||!promptList)return;
  const format=form.elements.namedItem('format')?.value||'other',items=wishPrompts[format]||wishPrompts.other;
  promptList.replaceChildren();
  const appendGroup=(heading,rows)=>{
   const groupLabel=doc.createElement('span');groupLabel.className='brief-prompt-group-label';groupLabel.textContent=heading;promptList.append(groupLabel);
   for(const [label,text] of rows){const button=doc.createElement('button');button.type='button';button.className='brief-prompt-chip';button.textContent=label;button.dataset.briefPrompt=text;promptList.append(button);}
  };
  appendGroup('Подсказки по формату',items);appendGroup('По желаемому впечатлению гостей',experiencePrompts);
  promptBox.hidden=false;
 }
 function displayed(){return Object.fromEntries(fields.map(key=>{const field=form.elements.namedItem(key);return [key,field.type==='checkbox'?field.checked:field.value];}));}
 function fill(brief,keys=fields){
  for(const key of keys){const field=form.elements.namedItem(key);if(field.type==='checkbox')field.checked=brief[key];else field.value=brief[key];}
  renderWishPrompts();updateForm();
 }
 function snapshot(){
  const marker=referenceProjectMarker();if(marker===null)throw Error('storage');
  const raw=localStorage.getItem(KEY);
  // readDraft intentionally tolerates corrupt data elsewhere; an editor must not
  // replace an unreadable project with a partially edited empty draft.
  if(raw!==null){const value=JSON.parse(raw);if(value?.version!==1||!value.brief||typeof value.brief!=='object')throw Error('storage');}
  const current=readDraft({getItem:()=>raw});
  if(referenceProjectMarker()!==marker)throw Error('storage');
  // Update the owning in-memory draft without rendering: reconcile also runs
  // during rendering, and a read must not start a refresh loop.
  onRead(current);
  return {marker,raw,current};
 }
 function badInput(group){return group.keys.some(key=>{const field=form.elements.namedItem(key);return !field.disabled&&field.validity.badInput;});}
 function pending(){
  if(!session)return [];
  const input=displayed();return BRIEF_UNDO_GROUPS.filter(group=>session.touched.has(group.id)&&(badInput(group)||!same(input,session.base,group.keys)));
 }
 function paint(){
  if(!session)return;
  const invalid=session.invalid,conflicts=BRIEF_UNDO_GROUPS.filter(group=>session.conflicts.has(group.id));
  status.textContent=invalid?(invalid==='resume'?'Страница вернулась из истории. Ввод сохранён в окне; обновите редактор перед сохранением.':invalid==='unreadable'?'Не удалось прочитать проект. Ввод остаётся в окне; разрешите хранение данных и обновите редактор.':'Проект изменился. Ввод остаётся в окне и не будет записан в другой проект.'):
   conflicts.length?'Поля изменились в проекте: '+conflicts.map(group=>group.label).join(', ')+'. Ваш ввод оставлен в окне. Примите актуальные значения для этих полей, чтобы продолжить.'+(session.error?' '+session.error:''):
   session.error|| (pending().length?'Есть несохранённые поля. Нажмите «Сохранить описание», чтобы повторить сохранение.':session.saved?'Изменения сохранены в этом браузере.':'Изменённые поля сохраняются в этом браузере по мере заполнения.');
  const key=invalid?'all:'+invalid:conflicts.map(group=>group.id).join(',');
  if(key===recoveryKey)return;
  recoveryKey=key;recovery.replaceChildren();recovery.hidden=!key;
  if(!key)return;
  const explanation=doc.createElement('p');explanation.textContent=invalid?'Обновление заменит поля в этом окне актуальным описанием проекта. Если нужен введённый текст, скопируйте его перед обновлением.':'Принятие заменит только указанное поле и отменит ваши правки этого поля в текущем сеансе. Остальной ввод сохранится.';recovery.append(explanation);
  for(const group of invalid?[null]:conflicts){
   const button=doc.createElement('button');button.type='button';button.className='secondary-action';
   button.textContent=group?'Принять из проекта: '+group.label:'Обновить редактор из проекта';
   button.addEventListener('click',()=>accept(group));recovery.append(button);
  }
 }
 function invalidate(reason='project'){
  if(!session)return;
  session.invalid=reason;session.error='';undo?.reset(reason==='resume'?'resume':'project');paint();
 }
 function reconcile(next){
  if(!session)return null;
  if(session.invalid){paint();return null;}
  let state;
  try{state=next||snapshot();}catch{session.error='Не удалось прочитать проект. Ввод сохранён в окне. Разрешите хранение данных и повторите сохранение.';paint();return null;}
  if(state.marker!==session.marker||session.existed&&state.raw===null){invalidate();return null;}
  session.existed ||= state.raw!==null;
  const rebased=[];
  for(const group of BRIEF_UNDO_GROUPS){
   if(same(state.current.brief,session.base,group.keys))continue;
   if(session.touched.has(group.id))session.conflicts.add(group.id);
   else{
    Object.assign(session.base,pick(state.current.brief,group.keys));fill(state.current.brief,group.keys);rebased.push(group.id);
   }
  }
  if(rebased.length)undo?.rebase(state.current.brief,rebased);
  session.error='';paint();return state;
 }
 function save(groups){
  if(!session)return false;
  updateForm();
  const state=reconcile();if(!state)return false;
  const requested=groups||pending(),input=displayed();
  if(requested.some(group=>session.conflicts.has(group.id))){paint();return false;}
  if(requested.some(badInput)){session.error='Завершите ввод числа. Значение остаётся в поле и пока не сохранено.';paint();return false;}
  const changed=requested.filter(group=>!same(input,session.base,group.keys));
  if(!changed.length){paint();return !session.conflicts.size;}
  const patch=Object.assign({},...changed.map(group=>pick(input,group.keys)));
  const next=updateBrief(state.current,patch);
  if(changed.some(group=>!same(next.brief,input,group.keys))){session.error='Не удалось сохранить значение в таком виде. Ввод оставлен в окне — проверьте изменённые поля.';paint();return false;}
  let saved;
  try{
   // No await between the fresh group comparisons and write. Recheck the whole
   // snapshot to avoid discarding an intervening unrelated project update.
   if(referenceProjectMarker()!==session.marker){invalidate();return false;}
   if(localStorage.getItem(KEY)!==state.raw){reconcile();session.error='Проект обновился во время сохранения. Ввод остался в окне; повторите сохранение.';paint();return false;}
   saved=writeDraft(localStorage,next);
  }catch{session.error='Не удалось сохранить. Ввод остаётся в окне. Разрешите хранение данных сайта и нажмите «Сохранить описание» ещё раз.';paint();return false;}
  for(const group of changed)Object.assign(session.base,pick(saved.brief,group.keys));
  session.existed=true;session.saved=true;session.error='';
  undo?.record(state.current.brief,saved.brief);
  onSaved(saved);paint();return !session.invalid&&!session.conflicts.size;
 }
 function start(state){
  session={marker:state.marker,base:{...state.current.brief},existed:state.raw!==null,touched:new Set(),conflicts:new Set(),invalid:'',error:'',saved:false};
  fill(state.current.brief);recoveryKey='';paint();
 }
 function accept(group){
  let state;try{state=snapshot();}catch{session.error='Не удалось прочитать проект. Ввод сохранён; разрешите хранение данных и попробуйте ещё раз.';if(session.invalid)session.invalid='unreadable';paint();return;}
  if(!group){start(state);undo?.restart(state.current.brief);}
  else{
   if(!reconcile(state))return;
   Object.assign(session.base,pick(state.current.brief,group.keys));session.touched.delete(group.id);session.conflicts.delete(group.id);
   fill(state.current.brief,group.keys);undo?.rebase(state.current.brief,[group.id]);session.error='';paint();
  }
  const key=group?.keys[0]||'format',field=form.elements.namedItem(key);
  (field.disabled?form.elements.namedItem(key==='date'?'dateUnknown':'budgetHelp'):field).focus({preventScroll:true});
 }
 function open(fieldName){
  if(!dialog.open){
   trigger=doc.activeElement;
   try{const state=snapshot();start(state);undo?.begin(state.current.brief);}
   catch{session={base:{...getFallbackBrief()},touched:new Set(),conflicts:new Set(),invalid:'unreadable',error:''};fill(session.base);recoveryKey='';paint();}
   dialog.showModal();undo?.sync();
  }else reconcile();
  if(fieldName){const field=form.elements.namedItem(fieldName),fallback=form.elements.namedItem(fieldName==='date'?'dateUnknown':fieldName==='budget'?'budgetHelp':'description');(field?.disabled?fallback:field)?.focus();}
 }
 function close(submit=false){if(save()){onClose();dialog.close();if(submit)onSubmit?.();}}
 function restored(next,{keys,inside}){
  if(!session||!inside)return;
  for(const group of BRIEF_UNDO_GROUPS)if(group.keys.some(key=>keys.includes(key))){Object.assign(session.base,pick(next.brief,group.keys));session.touched.delete(group.id);session.conflicts.delete(group.id);}
  updateForm();paint();
 }
 for(const type of ['input','change'])form.addEventListener(type,event=>{
  const group=BRIEF_UNDO_GROUPS.find(group=>group.keys.includes(event.target.name));if(!session||!group)return;
  session.touched.add(group.id);save([group]);
 });
 form.addEventListener('submit',event=>{event.preventDefault();close(true);});
 form.addEventListener('change',event=>{if(event.target.name==='format')renderWishPrompts();});
 promptList?.addEventListener('click',event=>{
  const button=event.target.closest('[data-brief-prompt]');if(!button||!description)return;
  const prompt=button.dataset.briefPrompt,existing=description.value,trimmed=existing.trimEnd();
  if(trimmed.includes(prompt.trim())){promptStatus.textContent='Эта подсказка уже есть в пожеланиях.';return;}
  const separator=trimmed?(existing.endsWith('\n')?'\n':'\n\n'):'';
  const next=existing+separator+prompt;
  if(next.length>description.maxLength){promptStatus.textContent='Подсказка не помещается в оставшийся лимит. Сократите пожелания или выберите более короткий текст.';return;}
  description.value=next;description.setSelectionRange(next.length,next.length);description.focus();
  description.dispatchEvent(new Event('input',{bubbles:true}));
  promptStatus.textContent='Подсказка добавлена в конец пожеланий. Продолжите фразу своими словами.';
 });
 dialog.querySelector('[data-close-brief]')?.addEventListener('click',()=>close());
 dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
 dialog.addEventListener('close',()=>{
  session=null;recovery.hidden=true;recoveryKey='';
  const visible=node=>node?.isConnected&&!node.disabled&&node.getClientRects().length;
  // The summary can be rebuilt by save/undo while the editor is open.
  if(!visible(doc.activeElement)||doc.activeElement===doc.body||dialog.contains(doc.activeElement)){
   const target=visible(trigger)?trigger:[...doc.querySelectorAll('[data-edit-brief]')].find(visible)||doc.getElementById('project-overview');target?.focus({preventScroll:true});
  }
 });
 for(const type of ['ea:project-started','ea:project-copy-restored'])doc.addEventListener(type,()=>invalidate());
 addEventListener('storage',event=>{
  try{if(event.storageArea!==localStorage)return;}catch{return;}
  if(event.key===null||event.key===PREVIOUS_PROJECT_KEY||event.key===KEY&&event.newValue===null)invalidate();
  else if(event.key===KEY)reconcile();
 });
 addEventListener('pagehide',()=>{if(session)invalidate('resume');});
 addEventListener('pageshow',event=>{if(event.persisted&&session)invalidate('resume');});
 return {open,reconcile,restored};
}
