import assert from 'node:assert/strict';
import test from 'node:test';
import {selectionShare} from '../public/custom/selection-share-model.js';

const catalog = {
 types: {event: 'События'},
 agencies: [
  {slug:'alpha',name:'Alpha <script>"&',types:['event'],city:'Москва & область',website:'https://example.test/?a=1&b=2',
   presentation:{lead:'Публичное описание агентства',fit:'Подходит для праздников'}},
  {slug:'beta',name:'Beta',website:'javascript:alert(1)'},
  {slug:'gamma',name:'Gamma'},
  {slug:'delta',name:'Delta'}
 ],
 projects: [
  {slug:'work-one',agencySlug:'alpha',fullTitle:'Работа <b>один</b>',source:'https://source.test/?a=1&b=2',role:'Организатор',
   presentation:{lead:'Публичное описание работы',fit:'Для команды',participation:'Продюсирование'}},
  {slug:'work-two',agencySlug:'beta',fullTitle:'Работа другой команды',source:'data:text/html,secret',role:'Другая роль',
   presentation:{lead:'Чужое описание работы'}}
 ]
};

test('a public share excludes private project fields, notes and presentation by default',()=>{
 const state = {
  selection:[{agencySlug:'alpha',workSlug:'work-one'}],
  workNotes:{'alpha/work-one':'PRIVATE NOTE'},
  contact:{name:'PRIVATE NAME',method:'email',value:'private@example.test'},
  brief:{description:'PRIVATE BRIEF'},request:{id:'PRIVATE REQUEST'}
 };
 const before=structuredClone(state),result=selectionShare(state,catalog);
 assert.equal(result.count,1);
 assert.deepEqual(state,before);
 for(const marker of ['PRIVATE NOTE','PRIVATE NAME','private@example.test','PRIVATE BRIEF','PRIVATE REQUEST','Публичное описание работы']){
  assert.ok(!result.text.includes(marker),marker);
  assert.ok(!result.html.includes(marker),marker);
 }
 assert.match(result.text,/Работа <b>один<\/b>/);
 assert.match(result.html,/Работа &lt;b&gt;один&lt;\/b&gt;/);
 assert.match(result.html,/Alpha &lt;script&gt;&quot;&amp;/);
 assert.ok(!result.html.includes('<script>'));
 assert.match(result.html,/href="https:\/\/example\.test\/\?a=1&amp;b=2"/);
 assert.match(result.html,/rel="noopener noreferrer"/);
 assert.match(result.html,/<meta name="referrer" content="no-referrer">/);
});

test('notes and presentation require independent opt-ins and escape their contents',()=>{
 const state={selection:[{agencySlug:'alpha',workSlug:'work-one'}],workNotes:{'alpha/work-one':'Заметка <img src=x onerror=alert(1)>'}};
 const notes=selectionShare(state,catalog,true);
 assert.match(notes.text,/Заметка автора: Заметка <img/);
 assert.match(notes.html,/Заметка &lt;img src=x onerror=alert\(1\)&gt;/);
 assert.ok(!notes.html.includes('<img'));
 assert.ok(!notes.text.includes('Публичное описание работы'));
 const presentation=selectionShare(state,catalog,false,{includePresentation:true});
 assert.match(presentation.text,/Публичное описание работы/);
 assert.match(presentation.text,/Участие в работе: Продюсирование/);
 assert.ok(!presentation.text.includes('Заметка <img'));
});

test('stale pairs and missing agencies remain explicit; unrelated work and unsafe links are not presented as verified',()=>{
 const state={selection:[
  {agencySlug:'alpha',workSlug:'work-two'},
  {agencySlug:'missing-team',workSlug:'work-one'},
  {agencySlug:'beta',workSlug:null}
 ],workNotes:{'alpha/work-two':'Памятка о паре','missing-team/work-one':'Заметка отсутствующей команды'}};
 const result=selectionShare(state,catalog,true,{includePresentation:true});
 assert.equal(result.count,3);
 assert.match(result.text,/Прежняя работа больше не связана с этой командой/);
 assert.match(result.text,/Сохранённая пара заметки: Команда: alpha · работа: work-two/);
 assert.match(result.text,/Связь команды с работой сейчас не подтверждена/);
 assert.match(result.text,/Профиль команды недоступен в каталоге/);
 assert.match(result.text,/Недоступная команда · missing-team/);
 assert.match(result.text,/Заметка отсутствующей команды/);
 assert.ok(!result.text.includes('Чужое описание работы'));
 assert.ok(!result.text.includes('Другая роль'));
 assert.ok(!result.text.includes('data:text/html'));
 assert.ok(!result.html.includes('javascript:alert(1)'));
});

test('only the first unique three selected agencies are exported, in order',()=>{
 const selection=['beta','alpha','beta','gamma','delta'].map(agencySlug=>({agencySlug,workSlug:null}));
 const result=selectionShare({selection},catalog);
 assert.equal(result.count,3);
 assert.match(result.text,/1\. Beta[\s\S]*2\. Alpha[\s\S]*3\. Gamma/);
 assert.ok(!result.text.includes('Delta'));
});
