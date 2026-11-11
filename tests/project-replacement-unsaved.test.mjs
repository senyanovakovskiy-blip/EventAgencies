import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read=name=>fs.readFileSync(new URL('../public/custom/'+name,import.meta.url),'utf8').replace(/\r\n/g,'\n');
function handler(file,anchor){
 const source=read(file),start=source.indexOf(anchor),bodyStart=source.indexOf('\n',start)+1,end=source.indexOf('\n });',bodyStart);
 assert(start>=0&&end>bodyStart,file+' handler exists');return source.slice(bodyStart,end);
}
const newBody=handler('project-new.js',"form.addEventListener('submit',event=>{");
const inquiryBody=handler('project-from-inquiry.js',"form.addEventListener('submit',event=>{");
const accountBody=handler('account-project-copies.js',"confirm.addEventListener('click',async()=>{");
const selection=read('selection.js'),binding=selection.match(/setupAccountProjectCopies\(\{[^\n]*canRestore:\(\)=>([^,]+),blockedMessage:\(\)=>(.+?),onExportCopy:/);
assert(binding,'account copy owner gate exists');
const buildGate=new Function(`let sending=false,unsavedProject=false;return {canRestore:()=>${binding[1]},blockedMessage:()=>${binding[2]},setUnsaved:value=>unsavedProject=value};`);
const event={preventDefault(){}};
const setupNew=new Function('gate',`
 let source={draft:{},references:[]},calls=0,continueToBrief=false;const status={textContent:''};
 const canStart=()=>gate.canRestore(),blockedMessage=gate.blockedMessage,readSource=()=>source,nextCopy=()=>({}),changesProject=()=>true,getState=()=>source.draft;
 const restoreProjectCopy=()=>calls++,onStarted=()=>{},onStorageIssue=()=>{},errorText=()=> 'ошибка';
 const document={dispatchEvent(){}},dialog={close(){}},render=()=>{};
 return {run:event=>{${newBody}},calls:()=>calls,status:()=>status.textContent};
`);
const setupInquiry=new Function('gate',`
 let active={prepared:{loadSnapshot:{draft:{}}},receipt:{id:'EA-1',contact:{}}},calls=0,continueToBrief=false;
 const status={textContent:''},contact={checked:false},canCreate=()=>gate.canRestore(),blockedMessage=gate.blockedMessage,getState=()=>({});
 const restoreProjectCopy=()=>calls++,onCreated=()=>{},onStorageIssue=()=>{},errorText=()=> 'ошибка',dialog={close(){}};
 return {run:event=>{${inquiryBody}},calls:()=>calls,status:()=>status.textContent};
`);
const setupAccount=new Function('gate',`
 let busy=false,editingName=false,mode='restore',active={name:'Копия',loadScope:'full',loadSnapshot:{},changesReady:true},calls=0,returnFocus=null;
 const confirm={textContent:'Загрузить'},actionStatus={textContent:''},saveStatus={textContent:''};
 const canRestore=gate.canRestore,blockedMessage=gate.blockedMessage,renderCopyChanges=()=>false,syncBusy=()=>{},referenceMergeBlocked=()=>false,referenceMergeMessage=()=>'',getState=()=>({});
 const restoreProjectCopy=()=>calls++,syncUndo=()=>{},banner={querySelector:()=>({textContent:''})},dialog={close(){}},document={getElementById:()=>null},errorMessage=()=> 'ошибка';
 return {run:async()=>{${accountBody}},calls:()=>calls,status:()=>actionStatus.textContent};
`);

for(const [label,setup] of [['новый проект',setupNew],['проект из заявки',setupInquiry],['копия в аккаунте',setupAccount]]){
 test(label+': unsaved project blocks restore and allows it after saving',async()=>{
  const gate=buildGate(),ui=setup(gate);gate.setUnsaved(true);await ui.run(event);
  assert.equal(ui.calls(),0);assert.match(ui.status(),/Сначала сохраните черновик/);
  gate.setUnsaved(false);await ui.run(event);assert.equal(ui.calls(),1);
 });
}
