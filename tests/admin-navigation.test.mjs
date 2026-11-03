import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

// Exercise the actual UI handlers with deferred HTTP responses and an editable form.
const source=fs.readFileSync(new URL('../admin/admin.js',import.meta.url),'utf8');
const openSource=source.slice(source.indexOf('async function openDetail(id){'),source.indexOf('async function saveDetail(event){'));
const logoutSource=source.slice(source.indexOf("$('#logout').addEventListener"),source.indexOf("$('#reauth').addEventListener"));
function harness(){
 const requests=[],renders=[],prompts=[];
 const form={value:{note:''}},nodes=new Map();let logout;
 const node=selector=>{
  if(selector==='#operator-form')return form;
  if(!nodes.has(selector))nodes.set(selector,{textContent:'',disabled:false,innerHTML:'',classList:{add(){},remove(){}},replaceChildren(){},addEventListener(type,fn){if(selector==='#logout')logout=fn;}});
  return nodes.get(selector);
 };
 const context=vm.createContext({
  current:{recordId:1},detailVersion:0,listVersion:0,loggingOut:false,saving:false,csrf:'test',emptyDetail:'empty',
  readEditor:editor=>editor?.value??null,
  allowLeave:()=>!form.value.note||(prompts.push(form.value.note),context.confirmLeave),
  confirmLeave:false,$:node,
  api:url=>new Promise((resolve,reject)=>requests.push({url,resolve,reject})),getCatalog:async()=>({}),
  renderDetail:data=>{renders.push(data);form.value={note:''};},
  setEditorBusy:(editor,busy)=>{if(editor)editor.disabled=busy;},showLogin:()=>{context.loggedOut=true;},
  history:{replaceState(){}},document:{querySelectorAll:()=>[]},matchMedia:()=>({matches:false})
 });
 vm.runInContext(openSource+logoutSource,context);
 return {context,form,requests,renders,prompts,node,open:id=>context.openDetail(id),logout:()=>logout()};
}

test('delayed navigation preserves new edits when leaving is declined',async()=>{
 const h=harness(),pending=h.open(2);
 h.form.value.note='Typed while the next request was loading';
 h.requests[0].resolve({recordId:2});await pending;
 assert.equal(h.context.current.recordId,1);assert.equal(h.renders.length,0);
 assert.equal(h.form.value.note,'Typed while the next request was loading');
 assert.equal(h.prompts.length,1);
});

test('unchanged edits approved before loading do not prompt twice',async()=>{
 const h=harness();h.form.value.note='Existing draft';h.context.confirmLeave=true;
 const pending=h.open(2);h.requests[0].resolve({recordId:2});await pending;
 assert.equal(h.prompts.length,1);assert.equal(h.context.current.recordId,2);
});

test('additional edits after approval require another decision',async()=>{
 const h=harness();h.form.value.note='Existing draft';h.context.confirmLeave=true;
 const pending=h.open(2);h.form.value.note='More edits';h.context.confirmLeave=false;
 h.requests[0].resolve({recordId:2});await pending;
 assert.equal(h.prompts.length,2);assert.equal(h.form.value.note,'More edits');
 assert.equal(h.context.current.recordId,1);
});

test('only the newest requested detail may render',async()=>{
 const h=harness(),one=h.open(2),two=h.open(3);
 h.requests[1].resolve({recordId:3});await two;
 h.requests[0].resolve({recordId:2});await one;
 assert.deepEqual(h.renders.map(r=>r.recordId),[3]);
});

test('logout invalidates pending detail and blocks new navigation until complete',async()=>{
 const h=harness(),pending=h.open(2),leaving=h.logout();
 assert.equal(h.form.disabled,true);assert.equal(h.node('#logout').disabled,true);
 await h.open(3);assert.equal(h.requests.length,2);
 h.requests[1].resolve({ok:true});await leaving;
 h.requests[0].resolve({recordId:2});await pending;
 assert.equal(h.context.current,null);assert.equal(h.context.loggedOut,true);
 assert.equal(h.renders.length,0);assert.equal(h.form.disabled,false);
});

test('failed logout retains edits and stale detail errors do not replace its message',async()=>{
 const h=harness(),pending=h.open(2);h.form.value.note='Keep this draft';h.context.confirmLeave=true;
 const leaving=h.logout();h.requests[1].reject(Error('Logout failed'));await leaving;
 h.requests[0].reject(Error('Old detail failed'));await pending;
 assert.equal(h.context.current.recordId,1);assert.equal(h.form.value.note,'Keep this draft');
 assert.equal(h.node('#workspace-status').textContent,'Logout failed');
 assert.equal(h.form.disabled,false);assert.equal(h.context.loggingOut,false);
});
