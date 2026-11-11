import test from 'node:test';
import assert from 'node:assert/strict';
import {KEY,emptyDraft,readDraft,writeDraft} from '../public/custom/project-store.js';
import {setupInlineNoteGuard} from '../public/custom/inline-note-guard.js';

function fixture(){
 let raw=null,project='initial',fail=false,failRead=false,canSave=true;const storage={getItem:key=>{if(failRead)throw Error('storage');return key===KEY?raw:null;},setItem:(key,value)=>{if(fail)throw Error('storage');if(key===KEY)raw=value;}};
 const items={},listeners={};for(const key of ['data-conflict-message','data-conflict-local','data-conflict-current','data-use-current','data-save-local'])items[key]={value:'',textContent:'',disabled:false,addEventListener(type,fn){this[type]=fn;}};
 const dialog={open:false,innerHTML:'',setAttribute(){},querySelector(selector){return items[selector.slice(1,-1)];},addEventListener(type,fn){listeners[type]=fn;},showModal(){this.open=true;},close(){this.open=false;}};
 const field={dataset:{workNote:'c4',noteWork:'shared'},value:'',defaultValue:'',matches:()=>true};
 const doc={activeElement:null,body:{append(){}},createElement:()=>dialog,querySelectorAll:()=>[field]};
 let saved=null;const guard=setupInlineNoteGuard({document:doc,storage,marker:()=>project,canSave:()=>canSave,onSaved:next=>saved=next});
 return {storage,field,doc,guard,dialog,items,setProject:value=>project=value,setRaw:value=>raw=value,setFail:value=>fail=value,setFailRead:value=>failRead=value,setCanSave:value=>canSave=value,getSaved:()=>saved};
}

test('fresh edits preserve other-tab project changes; conflicting note requires an explicit choice',()=>{
 const f=fixture(),initial=emptyDraft();initial.workNotes['c4/shared']='Первое';writeDraft(f.storage,initial);f.field.value=f.field.defaultValue='Первое';f.guard.register(f.field);
 const external=readDraft(f.storage);external.brief.city='Казань';writeDraft(f.storage,external);f.field.value='Первое и дополнение';assert.equal(f.guard.input(f.field).ok,true);assert.equal(readDraft(f.storage).brief.city,'Казань');
 const changed=readDraft(f.storage);changed.workNotes['c4/shared']='Другой текст';writeDraft(f.storage,changed);f.field.value='Мой текст';assert.equal(f.guard.input(f.field).ok,false);assert.equal(readDraft(f.storage).workNotes['c4/shared'],'Другой текст');assert.equal(f.items['data-conflict-local'].value,'Мой текст');
 f.items['data-save-local'].click();assert.equal(readDraft(f.storage).workNotes['c4/shared'],'Мой текст');assert.equal(readDraft(f.storage).brief.city,'Казань');
});

test('deleting or replacing project never saves old input into a new project',()=>{
 const f=fixture();writeDraft(f.storage,emptyDraft());f.field.value=f.field.defaultValue='';f.guard.register(f.field);f.setRaw(null);f.field.value='Старый текст';assert.equal(f.guard.input(f.field).ok,false);assert.equal(f.items['data-save-local'].disabled,true);f.items['data-save-local'].click();assert.equal(f.storage.getItem(KEY),null);
});

test('failed save retains text across external updates and project replacement',()=>{
 const f=fixture();writeDraft(f.storage,emptyDraft());f.guard.register(f.field);f.setFail(true);f.field.value='Несохранённый текст';assert.equal(f.guard.input(f.field).ok,false);assert.equal(f.items['data-conflict-local'].value,'Несохранённый текст');f.setFail(false);f.setProject('backup:next');f.guard.reconcile(emptyDraft(),{projectChanged:true});assert.equal(f.items['data-conflict-local'].value,'Несохранённый текст');assert.equal(f.items['data-save-local'].disabled,true);
});

test('deletion after a conflict opens cannot recreate the removed project',()=>{
 const f=fixture();const first=emptyDraft();first.workNotes['c4/shared']='Первое';writeDraft(f.storage,first);f.field.value=f.field.defaultValue='Первое';f.guard.register(f.field);
 const other=readDraft(f.storage);other.workNotes['c4/shared']='Другая версия';writeDraft(f.storage,other);f.field.value='Мой текст';assert.equal(f.guard.input(f.field).ok,false);
 f.setRaw(null);f.items['data-save-local'].click();assert.equal(f.storage.getItem(KEY),null);assert.equal(f.items['data-save-local'].disabled,true);assert.equal(f.items['data-conflict-local'].value,'Мой текст');
});

test('read failure on the first edit preserves input in the conflict window',()=>{
 const f=fixture();f.setFailRead(true);f.field.value='Несохранённый ввод';assert.equal(f.guard.input(f.field).ok,false);assert.equal(f.dialog.open,true);assert.equal(f.items['data-conflict-local'].value,'Несохранённый ввод');
});

test('a temporary unavailable project marker allows a retry after it recovers',()=>{
 const f=fixture();writeDraft(f.storage,emptyDraft());f.guard.register(f.field);f.setProject(null);f.field.value='Мой текст';assert.equal(f.guard.input(f.field).ok,false);assert.equal(f.items['data-save-local'].disabled,false);
 f.setProject('initial');f.items['data-save-local'].click();assert.equal(readDraft(f.storage).workNotes['c4/shared'],'Мой текст');
});

test('a second external edit requires another explicit choice before overwriting',()=>{
 const f=fixture();const draft=emptyDraft();draft.workNotes['c4/shared']='Первая';writeDraft(f.storage,draft);f.field.value=f.field.defaultValue='Первая';f.guard.register(f.field);
 const other=readDraft(f.storage);other.workNotes['c4/shared']='Вторая';writeDraft(f.storage,other);f.field.value='Моя';f.guard.input(f.field);
 other.workNotes['c4/shared']='Третья';writeDraft(f.storage,other);f.items['data-save-local'].click();assert.equal(readDraft(f.storage).workNotes['c4/shared'],'Третья');assert.equal(f.items['data-conflict-current'].value,'Третья');assert.equal(f.items['data-conflict-local'].value,'Моя');
 f.items['data-save-local'].click();assert.equal(readDraft(f.storage).workNotes['c4/shared'],'Моя');
});

test('clear and undo cannot write after another tab changes or removes the note',()=>{
 const f=fixture();const draft=emptyDraft();draft.workNotes['c4/shared']='Первая';writeDraft(f.storage,draft);f.field.value=f.field.defaultValue='Первая';f.guard.register(f.field);
 const other=readDraft(f.storage);delete other.workNotes['c4/shared'];writeDraft(f.storage,other);assert.equal(f.guard.check(f.field,'Первая'),false);assert.equal(f.items['data-conflict-local'].value,'Первая');assert.equal(readDraft(f.storage).workNotes['c4/shared'],undefined);
});

test('unsaved project changes block resolving a note conflict without replacing in-memory draft',()=>{
 const f=fixture(),draft=emptyDraft();draft.workNotes['c4/shared']='Первая';writeDraft(f.storage,draft);f.field.value=f.field.defaultValue='Первая';f.guard.register(f.field);
 const other=readDraft(f.storage);other.workNotes['c4/shared']='Другая';writeDraft(f.storage,other);f.field.value='Локальный ввод';f.guard.input(f.field);f.setCanSave(false);
 f.items['data-save-local'].click();assert.equal(readDraft(f.storage).workNotes['c4/shared'],'Другая');assert.equal(f.items['data-conflict-local'].value,'Локальный ввод');assert.equal(f.getSaved(),null);
 f.items['data-use-current'].click();assert.equal(f.getSaved(),null);assert.equal(readDraft(f.storage).workNotes['c4/shared'],'Другая');
});
