import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {KEY,emptyDraft,readDraft,writeDraft,updateBrief} from '../public/custom/project-store.js';
import {mergeWishes} from '../public/custom/request-review.js';

// Exercise the actual confirmation handler with another tab's changes already in storage.
const source=fs.readFileSync(new URL('../public/custom/selection.js',import.meta.url),'utf8');
const start=source.indexOf("wishesDialog.querySelector('[data-confirm-wishes]').addEventListener('click',async()=>{");
const bodyStart=source.indexOf('\n',start)+1,end=source.indexOf('\n   });',bodyStart);
assert(start>=0&&end>bodyStart,'wishes confirmation handler must exist');
const setup=new Function('readDraft','writeDraft','updateBrief','mergeWishes','localStorage','initial','KEY',`
 let draft=structuredClone(initial),wishesBase=initial.brief.description,wishesProject='initial',wishesHadDraft=true,marker='initial',markerSequence=[],wishesGenerated='Новый пример',available=true,lastReceipt=null,sendError='',sending=false,wishesPrompt='';
 const fields={'#wishes-addition':{value:'Новый пример'},'[data-wishes-status]':{textContent:''}};
 const wishesDialog={closed:false,querySelector:s=>fields[s],close(){this.closed=true;}};
 let noticeText='';const notice=(title)=>noticeText=title;
 const referenceProjectMarker=()=>markerSequence.length?markerSequence.shift():marker;
 const updateWishesPreview=(message='')=>{wishesBase=draft.brief.description;const result=mergeWishes(wishesBase,fields['#wishes-addition'].value);fields['[data-wishes-status]'].textContent=message;return result;};
 const regenerateWishes=()=>updateWishesPreview();
 const wishesUndo={record(){}},renderProject=async()=>{};
 const document={getElementById:()=>null};
 return {confirm:async()=>{${source.slice(bodyStart,end)}},setMarker:value=>marker=value,setMarkerSequence:value=>markerSequence=value,setAvailable:value=>available=value,state:()=>draft,status:()=>fields['[data-wishes-status]'].textContent,closed:()=>wishesDialog.closed,notice:()=>noticeText};
`);
const memory=()=>{const map=new Map();let writable=true,readable=true;return {getItem:key=>{if(!readable)throw Error('storage unavailable');return map.get(key)??null;},setItem:(key,value)=>{if(!writable)throw Error('storage unavailable');map.set(key,value);},removeItem:key=>map.delete(key),setWritable:value=>writable=value,setReadable:value=>readable=value};};
const openStart=source.indexOf('async function openWishes(trigger){'),openEnd=source.indexOf('\nfunction syncUnknown',openStart);
assert(openStart>=0&&openEnd>openStart,'wishes opening handler must exist');
const setupOpen=new Function(`
 let available=false,wishesOpening=false,wishesDialog=null,noticeText='',reads=0;
 const editingBlocked=()=>false,notice=title=>noticeText=title,referenceProjectMarker=()=>{reads++;return 'initial';};
 ${source.slice(openStart,openEnd)}
 return {open:()=>openWishes({}),notice:()=>noticeText,reads:()=>reads};
`);

test('adding wishes preserves another tab’s newer contact, selection and notes',async()=>{
 const storage=memory(),initial=emptyDraft();initial.brief.description='Исходные пожелания';writeDraft(storage,initial);
 const ui=setup(readDraft,writeDraft,updateBrief,mergeWishes,storage,initial,KEY);
 const newer=structuredClone(initial);newer.contact.name='Анна';newer.selection=[{agencySlug:'c4',workSlug:'shared'}];newer.workNotes={'c4/shared':'Текст заметки'};writeDraft(storage,newer);
 await ui.confirm();const result=readDraft(storage);
 assert.equal(result.brief.description,'Исходные пожелания\n\nНовый пример');assert.deepEqual(result.contact,newer.contact);assert.deepEqual(result.selection,newer.selection);assert.deepEqual(result.workNotes,newer.workNotes);
});

test('changed wishes require a new confirmation and a changed project is never overwritten',async()=>{
 const storage=memory(),initial=emptyDraft();initial.brief.description='Исходные пожелания';writeDraft(storage,initial);
 const ui=setup(readDraft,writeDraft,updateBrief,mergeWishes,storage,initial,KEY),newer=structuredClone(initial);newer.brief.description='Изменено в другой вкладке';writeDraft(storage,newer);
 await ui.confirm();assert.equal(readDraft(storage).brief.description,newer.brief.description);assert.match(ui.status(),/подтвердите добавление ещё раз/);
 await ui.confirm();assert.equal(readDraft(storage).brief.description,'Изменено в другой вкладке\n\nНовый пример');
 const other=emptyDraft();other.contact.name='Другой проект';writeDraft(storage,other);ui.setMarker('backup:new');await ui.confirm();assert.deepEqual(readDraft(storage),other);assert.equal(ui.closed(),true);assert.equal(ui.notice(),'Проект изменился');
});

test('unsaved in-memory changes and a removed project are never replaced',async()=>{
 const storage=memory(),initial=emptyDraft();initial.brief.description='Не сохранённый текст';
 const older=emptyDraft();older.brief.description='Старая версия';writeDraft(storage,older);
 const ui=setup(readDraft,writeDraft,updateBrief,mergeWishes,storage,initial,KEY);ui.setAvailable(false);
 await ui.confirm();assert.equal(ui.state().brief.description,'Не сохранённый текст');assert.equal(readDraft(storage).brief.description,'Старая версия');assert.match(ui.status(),/Проект не сохранён/);
 const removed=setup(readDraft,writeDraft,updateBrief,mergeWishes,storage,older,KEY);storage.removeItem(KEY);await removed.confirm();assert.equal(storage.getItem(KEY),null);assert.equal(removed.closed(),true);assert.equal(removed.notice(),'Проект изменился');
 const opening=setupOpen();await opening.open();assert.equal(opening.notice(),'Проект не сохранён');assert.equal(opening.reads(),0);
});

test('a failed wishes write can be retried safely after storage recovers',async()=>{
 const storage=memory(),initial=emptyDraft();initial.brief.description='Исходные пожелания';writeDraft(storage,initial);
 const ui=setup(readDraft,writeDraft,updateBrief,mergeWishes,storage,initial,KEY);storage.setWritable(false);
 await ui.confirm();assert.equal(readDraft(storage).brief.description,initial.brief.description);assert.match(ui.status(),/Не удалось сохранить пожелания/);
 storage.setWritable(true);await ui.confirm();assert.equal(readDraft(storage).brief.description,'Исходные пожелания\n\nНовый пример');
});

test('a failed wishes read can be retried after storage recovers',async()=>{
 const storage=memory(),initial=emptyDraft();writeDraft(storage,initial);
 const ui=setup(readDraft,writeDraft,updateBrief,mergeWishes,storage,initial,KEY);storage.setReadable(false);
 await ui.confirm();assert.match(ui.status(),/Не удалось прочитать проект/);
 storage.setReadable(true);await ui.confirm();assert.equal(readDraft(storage).brief.description,'Новый пример');
});

test('an unavailable project marker leaves the dialog open for a retry',async()=>{
 for(const sequence of [[null],['initial',null]]){
  const storage=memory(),initial=emptyDraft();writeDraft(storage,initial);
  const ui=setup(readDraft,writeDraft,updateBrief,mergeWishes,storage,initial,KEY);ui.setMarkerSequence(sequence);
  await ui.confirm();assert.equal(ui.closed(),false);assert.match(ui.status(),/Не удалось прочитать проект/);assert.equal(readDraft(storage).brief.description,'');
  await ui.confirm();assert.equal(readDraft(storage).brief.description,'Новый пример');
 }
});
