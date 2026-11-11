import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {KEY,emptyDraft,readDraft,writeDraft} from '../public/custom/project-store.js';
import {setupContactEditor} from '../public/custom/contact-editor.js';
import {setupBriefEditor} from '../public/custom/brief-editor.js';

class Element {
 constructor(){this.children=[];this.listeners=new Map();this.dataset={};this.attributes={};this.hidden=false;this.disabled=false;this.value='';this.type='text';this.validity={badInput:false};}
 addEventListener(type,fn){const callbacks=this.listeners.get(type)||[];callbacks.push(fn);this.listeners.set(type,callbacks);}
 emit(type,target=this){for(const fn of this.listeners.get(type)||[])fn({type,target,preventDefault(){}});}
 dispatchEvent(event){this.emit(event.type,this);return true;}
 setAttribute(key,value){this.attributes[key]=String(value);}
 getAttribute(key){return this.attributes[key]??null;}
 append(...nodes){for(const node of nodes){node.parentElement=this;this.children.push(node);}}
 prepend(node){node.parentElement=this;this.children.unshift(node);}
 after(node){node.parentElement=this.parentElement||this;}
 replaceChildren(...nodes){this.children=[];this.append(...nodes);}
 focus(){} contains(){return false;} querySelector(){return null;}
}
function environment(initial){
 const values=new Map(),storage={failWrite:false,getItem(key){return values.get(key)??null;},setItem(key,value){if(this.failWrite)throw Error('storage unavailable');values.set(key,value);}};
 writeDraft(storage,initial);
 const doc={body:new Element(),activeElement:null,defaultView:{addEventListener(){}},createElement:()=>new Element(),addEventListener(){},querySelectorAll:()=>[],getElementById:()=>null};
 const form=new Element();form.ownerDocument=doc;const controls=new Map(),nodes=new Map();
 form.elements={namedItem:name=>controls.get(name)||null};
 form.querySelector=selector=>nodes.get(selector)||null;
 const field=(name,value,type='text')=>{const node=new Element();node.name=name;node.value=value;node.type=type;node.checked=Boolean(value);controls.set(name,node);return node;};
 return {storage,doc,form,controls,nodes,field};
}
function globals(storage,fn){
 const previous={storage:globalThis.localStorage,listener:globalThis.addEventListener};
 globalThis.localStorage=storage;globalThis.addEventListener=()=>{};
 try{return fn();}finally{globalThis.localStorage=previous.storage;globalThis.addEventListener=previous.listener;}
}
// Use the owner's actual edit gate and read callback, not a copy of their logic.
const source=fs.readFileSync(new URL('../public/custom/selection.js',import.meta.url),'utf8');
function owner(initial,kind){
 const start=source.indexOf(kind==='brief'?'briefEditor=setupBriefEditor(':'contactEditor=setupContactEditor('),end=source.indexOf('\n });',start),section=source.slice(start,end);
 const gate=section.match(/canEdit:\(\)=>([^,]+),blockedMessage/),read=section.match(/onRead:next=>\{([^}]+)\}/);
 assert(gate&&read,kind+' editor ownership bindings exist');
 return new Function('initial',`let draft=structuredClone(initial),available=true,unsavedProject=false,sending=false;const markSelectionSaved=()=>{};
 return {canEdit:()=>${gate[1]},blockedMessage:()=> 'Сначала сохраните черновик проекта. Ввод остаётся в полях.',onRead:next=>{${read[1]}},onSaved:next=>{draft=next;available=true;},onStorageError:()=>{available=false;},block(next){draft=next;available=false;unsavedProject=true;},state:()=>draft,isAvailable:()=>available};`)(initial);
}

test('contact editor keeps input and unsaved project when another action failed',()=>{
 const initial=emptyDraft(),env=environment(initial),state=owner(initial,'contact'),name=env.field('name','');env.field('method','email');env.field('value','');
 const status=new Element();env.nodes.set('#contact-save-status',status);
 globals(env.storage,()=>{
  const editor=setupContactEditor({form:env.form,presentation:{sync(){}},...state});assert(editor);
  const pending=structuredClone(initial);pending.selection=[{agencySlug:'alpha',workSlug:null}];state.block(pending);
  name.value='Анна';env.form.emit('input',name);
  assert.equal(readDraft(env.storage).contact.name,'');assert.deepEqual(state.state(),pending);assert.equal(name.value,'Анна');assert.match(status.textContent,/Сначала сохраните черновик/);
 });
});

test('contact editor retries its own failed write when storage returns',()=>{
 const initial=emptyDraft(),env=environment(initial),state=owner(initial,'contact'),name=env.field('name','');env.field('method','email');env.field('value','');env.nodes.set('#contact-save-status',new Element());
 globals(env.storage,()=>{
  const editor=setupContactEditor({form:env.form,presentation:{sync(){}},...state});env.storage.failWrite=true;name.value='Анна';env.form.emit('input',name);
  assert.equal(readDraft(env.storage).contact.name,'');assert.equal(name.value,'Анна');assert.equal(state.isAvailable(),false);
  env.storage.failWrite=false;assert.equal(editor.flush(),true);assert.equal(readDraft(env.storage).contact.name,'Анна');assert.equal(state.isAvailable(),true);
 });
});

function briefEnvironment(initial){
 const env=environment(initial);for(const [name,value] of Object.entries(initial.brief))env.field(name,value,typeof value==='boolean'?'checkbox':'text');
 const status=new Element();env.nodes.set('#brief-save-status',status);env.nodes.set('.brief-editor-content',new Element());
 const dialog=new Element();dialog.open=false;dialog.showModal=()=>{dialog.open=true;};dialog.close=()=>{dialog.open=false;};
 return {...env,status,dialog};
}
function briefOptions(env,state){return {form:env.form,dialog:env.dialog,...state,updateForm(){},onClose(){},getFallbackBrief:()=>state.state().brief};}

test('brief editor retains input while the project has unsaved changes elsewhere',()=>{
 const initial=emptyDraft(),env=briefEnvironment(initial),state=owner(initial,'brief');
 globals(env.storage,()=>{
  const editor=setupBriefEditor(briefOptions(env,state));editor.open();const pending=structuredClone(initial);pending.selection=[{agencySlug:'alpha',workSlug:null}];state.block(pending);
  const city=env.controls.get('city');city.value='Москва';env.form.emit('input',city);
  assert.equal(readDraft(env.storage).brief.city,'');assert.deepEqual(state.state(),pending);assert.equal(city.value,'Москва');assert.match(env.status.textContent,/Сначала сохраните черновик/);
 });
});

test('brief editor retries its own failed write after storage returns',()=>{
 const initial=emptyDraft(),env=briefEnvironment(initial),state=owner(initial,'brief');
 globals(env.storage,()=>{
  const editor=setupBriefEditor(briefOptions(env,state));editor.open();env.storage.failWrite=true;const city=env.controls.get('city');city.value='Москва';env.form.emit('input',city);
  assert.equal(readDraft(env.storage).brief.city,'');assert.equal(city.value,'Москва');assert.match(env.status.textContent,/Не удалось сохранить/);
  env.storage.failWrite=false;env.form.emit('submit');assert.equal(readDraft(env.storage).brief.city,'Москва');assert.equal(env.dialog.open,false);
 });
});
