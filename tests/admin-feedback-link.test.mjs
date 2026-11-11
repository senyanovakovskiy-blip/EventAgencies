import assert from 'node:assert/strict';
import test from 'node:test';
import {ideaReactionControls,selectedFeedbackPhrase,transferSelectedFeedbackPhrase} from '../admin/preparation-ui.js';
import {renderEventIdeas} from '../admin/event-ideas.js';

test('reaction controls belong to the clicked idea, including the second card',()=>{
 const makeCard=(detail,note)=>{
  const detailField={value:detail},noteField={value:note},transferStatus={textContent:''};
  return {querySelector(selector){
   if(selector==='[data-event-idea-reaction-detail]')return detailField;
   if(selector==='[data-event-idea-reaction-note]')return noteField;
   if(selector==='[data-event-idea-feedback-transfer-status]')return transferStatus;
   return null;
  }};
 };
 const first=makeCard('concept','Первая заметка'),second=makeCard('pace','Вторая заметка');
 const button={closest(selector){assert.equal(selector,'.event-idea-card');return second;}};
 const controls=ideaReactionControls(button);
 assert.equal(controls.detailField.value,'pace');
 assert.equal(controls.noteField.value,'Вторая заметка');
 assert.notEqual(controls.noteField,first.querySelector('[data-event-idea-reaction-note]'));
 controls.noteField.value='';
 const phrase='меньше конкурсов и больше свободного общения.';
 const feedback={value:'Клиент попросил '+phrase,selectionStart:'Клиент попросил '.length,selectionEnd:('Клиент попросил '+phrase).length};
 const originalFeedback=feedback.value;
 const transferred=transferSelectedFeedbackPhrase(button,feedback);
 assert.equal(transferred.phrase,phrase);
 assert.equal(controls.noteField.value,transferred.phrase);
 assert.equal(first.querySelector('[data-event-idea-reaction-note]').value,'Первая заметка');
 assert.equal(feedback.value,originalFeedback);
 assert.match(transferSelectedFeedbackPhrase(button,feedback).error,/уже заполнена/);
 const item={title:'Вариант',kind:'Новая идея',idea:'Идея',journey:'Путь',why:'Основание',check:'Проверка',question:'Вопрос',sources:[]};
 const html=renderEventIdeas({options:[item,{...item,title:'Другой вариант'}]});
 assert.match(html,/data-use-selected-event-idea-feedback="0"/);
 assert.match(html,/data-use-selected-event-idea-feedback="1"/);
});

test('only an exact selected client phrase can be copied to an idea note',()=>{
 const source='Запись оператора: меньше конкурсов и больше свободного общения.';
 const start=source.indexOf('меньше'),end=source.length-1;
 assert.deepEqual(selectedFeedbackPhrase(source,start,end),{phrase:'меньше конкурсов и больше свободного общения'});
 assert.match(selectedFeedbackPhrase(source,start,start).error,/выделите/i);
 assert.match(selectedFeedbackPhrase('а'.repeat(241),0,241).error,/240/);
 const structured='11.11.2026 · Не подошло: «Вариант» [Источник варианта: abc]';
 const multiline='первая строка\nвторая строка';
 assert.match(selectedFeedbackPhrase(structured,0,structured.length).error,/служебных/);
 const structuredNote='11.11.2026 · Заинтересовало, нужны детали: «Вариант». [Комментарий клиента: больше общения]';
 const noteStart=structuredNote.indexOf('больше общения');
 assert.match(selectedFeedbackPhrase(structuredNote,noteStart,noteStart+'больше общения'.length).error,/служебных/);
 assert.match(selectedFeedbackPhrase(multiline,0,multiline.length).error,/служебных/);
});
