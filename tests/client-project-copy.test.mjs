import assert from 'node:assert/strict';
import test from 'node:test';
import {emptyDraft} from '../public/custom/project-store.js';
import {makeProjectCopy,normalizeProjectCopy,copySummary} from '../public/custom/project-copy-model.js';
import {describeCopyChanges} from '../public/custom/project-copy-diff.js';
import {copyForLoad} from '../public/custom/project-copy-mode.js';
import {mergeCopyReferences} from '../public/custom/project-copy-reference-merge.js';

function draft(){
 const value=emptyDraft();
 value.selection=[{agencySlug:'alpha',workSlug:'work-one'}];
 value.workNotes={'alpha/work-one':'Заметка выбора','beta/work-two':'Заметка примера','orphan/work-three':'Лишняя заметка'};
 value.brief={...value.brief,format:'corporate',city:'Москва',date:'2027',budget:'100',description:'Пожелания'};
 value.contact={name:'Ирина',method:'telegram',value:'@contact'};
 value.request={id:'private-receipt',createdAt:'2026-01-01',localOnly:true};
 return value;
}

test('snapshot defaults omit contact and request, retaining notes only for selected or saved works',()=>{
 const original=draft(),before=structuredClone(original);
 const copy=makeProjectCopy(original,['work-two','work-two','INVALID']);
 assert.deepEqual(original,before);
 assert.deepEqual(copy.references,['work-two']);
 assert.deepEqual(copy.draft.workNotes,{'alpha/work-one':'Заметка выбора','beta/work-two':'Заметка примера'});
 assert.deepEqual(copy.draft.contact,emptyDraft().contact);
 assert.equal(copy.draft.request,null);
 assert.equal(JSON.stringify(copy).includes('@contact'),false);
 assert.deepEqual(normalizeProjectCopy(copy),copy);
 assert.deepEqual(copySummary(copy),{format:'corporate',city:'Москва',date:'2027',dateUnknown:false,teams:1,references:1,notes:2,includeContact:false});
 const withoutNotes=makeProjectCopy(original,['work-two'],{includeNotes:false,includeContact:true});
 assert.deepEqual(withoutNotes.draft.workNotes,{});
 assert.equal(withoutNotes.draft.contact.value,'@contact');
 assert.deepEqual(normalizeProjectCopy(withoutNotes),withoutNotes);
});

test('serialized copies reject malformed, oversized or privacy-inconsistent data',()=>{
 const valid=makeProjectCopy(draft(),['work-two']);
 const invalid=[
  value=>{value.version=2;},
  value=>{value.includeNotes='true';},
  value=>{value.draft.request={localOnly:true,id:'x',createdAt:'2026'};},
  value=>{value.draft.contact.value='private contact despite opt-out';},
  value=>{value.includeNotes=false;},
  value=>{value.references.push('work-two');},
  value=>{value.references=Array.from({length:201},(_,index)=>'work-'+index);},
  value=>{value.draft.selection=Array.from({length:4},(_,index)=>({agencySlug:'team-'+index,workSlug:null}));},
  value=>{value.draft.selection[0].workSlug='Invalid slug';},
  value=>{value.draft.brief.description='x'.repeat(3001);},
  value=>{value.draft.workNotes['alpha/work-one']='x'.repeat(1001);},
  value=>{value.draft.workNotes=Object.fromEntries(Array.from({length:401},(_,index)=>['team/work-'+index,'note']));}
 ];
 for(const change of invalid){const value=structuredClone(valid);change(value);assert.equal(normalizeProjectCopy(value),null,change.toString());}
});

test('event-only loading and diff preserve omitted contact and notes and escape catalog data',()=>{
 const current=draft(),incomingDraft=draft();
 incomingDraft.brief={...incomingDraft.brief,city:'<svg onload=alert(1)>',date:'2028',dateUnknown:true,budget:'200',budgetHelp:true};
 incomingDraft.workNotes={'alpha/work-one':'Incoming secret'};
 incomingDraft.contact={name:'Incoming',method:'email',value:'new@example.test'};
 const incoming=makeProjectCopy(incomingDraft,['new-work'],{includeNotes:true,includeContact:true});
 const original=structuredClone({current,incoming});
 const eventOnly=copyForLoad({current,currentReferences:['work-two'],incoming,scope:'event'});
 assert.equal(eventOnly.includeNotes,false);
 assert.equal(eventOnly.includeContact,false);
 assert.deepEqual(eventOnly.draft.selection,current.selection);
 assert.deepEqual(eventOnly.references,['work-two']);
 const result=describeCopyChanges({current,currentReferences:['work-two'],incoming:eventOnly,data:{agencies:[],projects:[]}});
 assert.equal(result.hasChanges,true);
 assert.match(result.html,/&lt;svg onload=alert\(1\)&gt;/);
 assert.ok(!result.html.includes('<svg'));
 assert.match(result.html,/Сохранённая дата или период/);
 assert.match(result.html,/Сохранённая сумма бюджета/);
 assert.match(result.html,/все текущие заметки сохранятся/);
 assert.match(result.html,/текущие имя, способ связи и контакт сохранятся/);
 assert.ok(!result.html.includes('new@example.test'));
 assert.ok(!result.html.includes('Incoming secret'));
 assert.deepEqual({current,incoming},original);
});

test('diff identifies changed teams, works, notes and unavailable or unrelated catalog entries',()=>{
 const current=draft(),next=draft();
 next.selection=[{agencySlug:'alpha',workSlug:'work-two'},{agencySlug:'missing',workSlug:null}];
 next.workNotes={'alpha/work-two':'<script>incoming</script>'};
 const incoming=makeProjectCopy(next,['work-two'],{includeNotes:true,includeContact:true});
 const result=describeCopyChanges({current,currentReferences:[],incoming,data:{
  agencies:[{slug:'alpha',name:'Alpha <unsafe>'}],projects:[{slug:'work-two',agencySlug:'other',fullTitle:'Не эта команда'}]
 }});
 assert.match(result.html,/изменится выбранная работа/);
 assert.match(result.html,/Команда не найдена в каталоге · missing/);
 assert.match(result.html,/Работа не подтверждена для этой команды · work-two/);
 assert.match(result.html,/Alpha &lt;unsafe&gt;/);
 assert.match(result.html,/&lt;script&gt;incoming&lt;\/script&gt;/);
 assert.ok(!result.html.includes('<script>'));
});

test('reference merge adds selected entries and missing notes without overwriting current values',()=>{
 const current=draft(),source=draft();
 source.workNotes={'alpha/work-one':'Конфликт','beta/work-two':'Новая заметка','third/work-three':'Не выбрана'};
 const incoming=makeProjectCopy(source,['work-one','work-two','work-three'],{includeNotes:true});
 const before=structuredClone({current,incoming});
 const merged=mergeCopyReferences({current,currentReferences:['work-one'],incoming,referenceSelection:['work-one','work-two']});
 assert.deepEqual(merged.references,['work-one','work-two']);
 assert.equal(merged.draft.workNotes['alpha/work-one'],'Заметка выбора');
 assert.equal(merged.draft.workNotes['beta/work-two'],'Заметка примера');
 assert.equal(merged.mergeSummary.conflictingNotes,2);
 assert.deepEqual({current,incoming},before);
 delete current.workNotes['beta/work-two'];
 const selected=mergeCopyReferences({current,currentReferences:['work-one'],incoming,referenceSelection:['work-two'],referenceNoteSelection:['beta/work-two']});
 assert.equal(selected.draft.workNotes['beta/work-two'],'Новая заметка');
 assert.equal(selected.mergeSummary.addedNotes,1);
 assert.equal(selected.draft.request,null);
 assert.deepEqual(selected.draft.contact,current.contact);
 const disabled=mergeCopyReferences({current,currentReferences:[],incoming,includeReferenceNotes:false});
 assert.equal(disabled.draft.workNotes['beta/work-two'],undefined);
});

test('reference limit is enforced before returning a merge without mutating inputs',()=>{
 const current=draft(),currentReferences=Array.from({length:200},(_,index)=>'work-'+index);
 const incoming=makeProjectCopy(draft(),['new-work']);
 const before=structuredClone({current,currentReferences,incoming});
 assert.throws(()=>mergeCopyReferences({current,currentReferences,incoming}),error=>{
  assert.equal(error.code,'copy_references_limit');
  assert.equal(error.summary.totalReferences,201);
  assert.equal(error.summary.overflowCount,1);
  return true;
 });
 assert.deepEqual({current,currentReferences,incoming},before);
});
