import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {KEY,emptyDraft,normalizeDraft,readDraft,writeDraft,addAgency,moveAgency,removeAgency,replaceAgency,restoreAgency,submitLocal} from '../public/custom/project-store.js';

// Use the production guard and click branches with a shared storage stand-in.
const source=fs.readFileSync(new URL('../public/custom/selection.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const helperStart=source.indexOf('function selectionIdentity()');
const helperEnd=source.indexOf('\nconst inlineNotes=',helperStart);
assert(helperStart>=0&&helperEnd>helperStart,'selection guard must exist');
const restoreAnchor='restore:(selection,expected,project)=>{';
const restoreStart=source.indexOf(restoreAnchor,source.indexOf('replacementUndo=setupReplacementUndo'))+restoreAnchor.length;
const restoreEnd=source.indexOf('},onResult:',restoreStart);
assert(restoreStart>=restoreAnchor.length&&restoreEnd>restoreStart,'replacement undo callback must exist');
const memory=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};};
const setupGuard=new Function('KEY','emptyDraft','normalizeDraft','readDraft','writeDraft','storage','initial',`
 let draft=structuredClone(initial),available=true,marker='initial',noticeText='';
 const localStorage=storage,referenceProjectMarker=()=>marker,refresh=()=>{},notice=(title)=>noticeText=title,document={getElementById:()=>null};
 const persist=next=>{draft=writeDraft(localStorage,next);return true;};
 ${source.slice(helperStart,helperEnd)}
 return {basis:selectionBasis,fresh:freshSelection,save:persistFresh,undo:(selection,expected,project)=>{${source.slice(restoreStart,restoreEnd)}},state:()=>draft,notice:()=>noticeText,setMarker:value=>marker=value,setAvailable:value=>available=value};
`);

test('fresh selection keeps unrelated changes made by another tab',()=>{
 const storage=memory(),initial=emptyDraft();initial.selection=[{agencySlug:'alpha',workSlug:null}];writeDraft(storage,initial);
 const ui=setupGuard(KEY,emptyDraft,normalizeDraft,readDraft,writeDraft,storage,initial),newer=structuredClone(initial);
 newer.contact.name='Анна';newer.brief.city='Москва';newer.workNotes={'alpha/work':'Важная заметка'};writeDraft(storage,newer);
 const snapshot=ui.fresh(),result=addAgency(snapshot.current,'beta','work');assert.equal(ui.save(snapshot,result.state),true);
 const saved=readDraft(storage);assert.equal(saved.contact.name,'Анна');assert.equal(saved.brief.city,'Москва');assert.deepEqual(saved.workNotes,newer.workNotes);assert.deepEqual(saved.selection,result.state.selection);
});

test('changed selection, project identity and unsaved in-memory state prevent writes',()=>{
 const storage=memory(),initial=emptyDraft();initial.selection=[{agencySlug:'alpha',workSlug:null}];writeDraft(storage,initial);
 const ui=setupGuard(KEY,emptyDraft,normalizeDraft,readDraft,writeDraft,storage,initial),newer=structuredClone(initial);newer.selection.push({agencySlug:'beta',workSlug:null});writeDraft(storage,newer);
 assert.equal(ui.fresh(),null);assert.deepEqual(readDraft(storage),newer);assert.match(ui.notice(),/изменился/);
 const basis=ui.basis();ui.setMarker('backup:new');assert.equal(ui.fresh(basis),null);assert.deepEqual(readDraft(storage),newer);
 ui.setMarker('initial');ui.setAvailable(false);assert.equal(ui.fresh(),null);assert.deepEqual(readDraft(storage),newer);assert.match(ui.notice(),/не сохранён/);
});

test('project removal and changes between read and write do not overwrite storage',()=>{
 const storage=memory(),initial=emptyDraft();initial.selection=[{agencySlug:'alpha',workSlug:null}];writeDraft(storage,initial);
 const ui=setupGuard(KEY,emptyDraft,normalizeDraft,readDraft,writeDraft,storage,initial),snapshot=ui.fresh();
 const newer=structuredClone(initial);newer.contact.name='Новый контакт';writeDraft(storage,newer);
 assert.equal(ui.save(snapshot,removeAgency(snapshot.current,'alpha')),false);assert.deepEqual(readDraft(storage),newer);
 storage.removeItem(KEY);assert.equal(ui.fresh(),null);assert.equal(storage.getItem(KEY),null);
});

test('replacement undo uses the fresh project and refuses changed selection or identity',()=>{
 const storage=memory(),initial=emptyDraft();initial.selection=['alpha','delta','gamma'].map(agencySlug=>({agencySlug,workSlug:null}));writeDraft(storage,initial);
 const ui=setupGuard(KEY,emptyDraft,normalizeDraft,readDraft,writeDraft,storage,initial),before=['alpha','beta','gamma'].map(agencySlug=>({agencySlug,workSlug:null}));
 const newer=structuredClone(initial);newer.contact.name='Анна';newer.workNotes={'alpha/work':'Заметка'};writeDraft(storage,newer);
 assert.equal(ui.undo(before,initial.selection,{marker:'initial',existed:true}),'saved');let saved=readDraft(storage);assert.deepEqual(saved.selection,before);assert.equal(saved.contact.name,'Анна');assert.deepEqual(saved.workNotes,newer.workNotes);
 saved.selection[0].workSlug='other';writeDraft(storage,saved);assert.equal(ui.undo(initial.selection,before,{marker:'initial',existed:true}),'changed');assert.deepEqual(readDraft(storage),saved);
 ui.setMarker('backup:new');assert.equal(ui.undo(initial.selection,saved.selection,{marker:'initial',existed:true}),'changed');assert.deepEqual(readDraft(storage),saved);
});

const branchStart=source.indexOf(" const move=event.target.closest('[data-move-agency]');");
const branchEnd=source.indexOf(" const occasion=event.target.closest('[data-occasion]');",branchStart);
const offerStart=source.indexOf('async function offerReplacement(');
const offerEnd=source.indexOf('\nfunction refresh()',offerStart);
assert(branchStart>=0&&branchEnd>branchStart&&offerStart>=0&&offerEnd>offerStart,'selection action branches must exist');
const setupActions=new Function('KEY','emptyDraft','normalizeDraft','readDraft','writeDraft','addAgency','moveAgency','removeAgency','replaceAgency','restoreAgency','storage','initial',`
 let draft=structuredClone(initial),available=true,marker='initial',noticeText='',pendingReplacement=null,removedAgency=null;
 const localStorage=storage,referenceProjectMarker=()=>marker,refresh=()=>{},notice=(title)=>noticeText=title;
 const persist=next=>{draft=writeDraft(localStorage,next);return true;};
 ${source.slice(helperStart,helperEnd)}
 const nodes=new Map(),node=()=>({hidden:false,textContent:'',querySelectorAll:()=>[],querySelector:()=>({focus(){}}),focus(){}});
 const document={getElementById:id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);}};
 const orderStatus={textContent:''},comparisonView='cards',pop={hidden:false},renderProject=async()=>{},editingBlocked=()=>false,esc=value=>value;
 const getData=async()=>({agencies:['alpha','beta','gamma','delta'].map(slug=>({slug,name:slug}))});
 const selectionView=(_data,item)=>({label:item.agencySlug});let undoRecord=null;
 const replacementUndo={record(...args){undoRecord=args;}},replacement={innerHTML:'',showModal(){},close(){pendingReplacement=null;}};
 ${source.slice(offerStart,offerEnd)}
 return {dispatch:async(event)=>{${source.slice(branchStart,branchEnd)}},state:()=>draft,notice:()=>noticeText,setMarker:value=>marker=value,setAvailable:value=>available=value,undoRecord:()=>undoRecord,node:id=>document.getElementById(id)};
`);
const eventFor=(selector,dataset={})=>({preventDefault(){},target:{closest(query){return query===selector?{dataset,closest:()=>null}:null;}}});
const makeActions=(storage,initial)=>setupActions(KEY,emptyDraft,normalizeDraft,readDraft,writeDraft,addAgency,moveAgency,removeAgency,replaceAgency,restoreAgency,storage,initial);

test('first and second team can be added from an initially empty browser',async()=>{
 const storage=memory(),initial=emptyDraft(),ui=makeActions(storage,initial);
 await ui.dispatch(eventFor('[data-save-agency]',{saveAgency:'alpha',saveWork:'work'}));
 assert.deepEqual(readDraft(storage).selection,[{agencySlug:'alpha',workSlug:'work'}]);
 await ui.dispatch(eventFor('[data-save-agency]',{saveAgency:'beta',saveWork:'work'}));
 assert.deepEqual(readDraft(storage).selection.map(item=>item.agencySlug),['alpha','beta']);
});

test('the first external contact save is retained when adding a team',async()=>{
 const storage=memory(),initial=emptyDraft(),ui=makeActions(storage,initial),external=emptyDraft();external.contact.name='Анна';writeDraft(storage,external);
 await ui.dispatch(eventFor('[data-save-agency]',{saveAgency:'alpha',saveWork:'work'}));
 assert.equal(readDraft(storage).contact.name,'Анна');assert.equal(readDraft(storage).selection[0].agencySlug,'alpha');
});

test('actual add, update, move, remove and undo preserve unrelated changes',async()=>{
 const storage=memory(),initial=emptyDraft();initial.selection=[{agencySlug:'alpha',workSlug:null},{agencySlug:'beta',workSlug:null}];writeDraft(storage,initial);
 const ui=makeActions(storage,initial),newer=structuredClone(initial);newer.contact.name='Новый контакт';newer.workNotes={'alpha/work':'Новая заметка'};writeDraft(storage,newer);
 await ui.dispatch(eventFor('[data-save-agency]',{saveAgency:'gamma',saveWork:'work'}));
 assert.equal(readDraft(storage).contact.name,'Новый контакт');assert.deepEqual(readDraft(storage).workNotes,newer.workNotes);assert.equal(readDraft(storage).selection.length,3);
 const external=city=>{const current=readDraft(storage);current.brief.city=city;writeDraft(storage,current);};
 external('Казань');await ui.dispatch(eventFor('[data-save-agency]',{saveAgency:'alpha',saveWork:'work'}));assert.equal(readDraft(storage).selection[0].workSlug,'work');assert.equal(readDraft(storage).brief.city,'Казань');
 external('Сочи');await ui.dispatch(eventFor('[data-move-agency]',{moveAgency:'gamma',moveDirection:'-1'}));assert.equal(readDraft(storage).selection[1].agencySlug,'gamma');assert.equal(readDraft(storage).brief.city,'Сочи');
 external('Омск');await ui.dispatch(eventFor('[data-remove-agency]',{removeAgency:'gamma',agencyName:'gamma'}));assert.equal(readDraft(storage).selection.length,2);assert.equal(readDraft(storage).brief.city,'Омск');
 external('Тверь');await ui.dispatch(eventFor('[data-undo-removal]'));assert.equal(readDraft(storage).selection[1].agencySlug,'gamma');assert.equal(readDraft(storage).brief.city,'Тверь');assert.deepEqual(readDraft(storage).workNotes,newer.workNotes);
});

test('replacement preserves unrelated changes made while dialog is open',async()=>{
 const storage=memory(),initial=emptyDraft();initial.selection=['alpha','beta','gamma'].map(agencySlug=>({agencySlug,workSlug:null}));writeDraft(storage,initial);
 const ui=makeActions(storage,initial);await ui.dispatch(eventFor('[data-save-agency]',{saveAgency:'delta',saveWork:'work'}));
 const newer=structuredClone(initial);newer.contact.name='Анна';newer.workNotes={'alpha/work':'Важное'};writeDraft(storage,newer);
 await ui.dispatch(eventFor('[data-replace-agency]',{replaceAgency:'beta',replaceName:'beta'}));const saved=readDraft(storage);
 assert.equal(saved.selection[1].agencySlug,'delta');assert.equal(saved.contact.name,'Анна');assert.deepEqual(saved.workNotes,newer.workNotes);assert(ui.undoRecord());
});

test('full selection replacement respects a changed project or selection while dialog is open',async()=>{
 const storage=memory(),initial=emptyDraft();initial.selection=['alpha','beta','gamma'].map(agencySlug=>({agencySlug,workSlug:null}));writeDraft(storage,initial);
 const ui=makeActions(storage,initial);await ui.dispatch(eventFor('[data-save-agency]',{saveAgency:'delta',saveWork:'work'}));
 const newer=structuredClone(initial);newer.selection[0].workSlug='other';newer.contact.name='Анна';writeDraft(storage,newer);
 await ui.dispatch(eventFor('[data-replace-agency]',{replaceAgency:'beta',replaceName:'beta'}));assert.deepEqual(readDraft(storage),newer);assert.equal(ui.undoRecord(),null);
});

test('actual selection actions reject unsaved local state and changed project',async()=>{
 const storage=memory(),initial=emptyDraft();initial.selection=[{agencySlug:'alpha',workSlug:null}];writeDraft(storage,initial);
 const ui=makeActions(storage,initial);ui.setAvailable(false);
 await ui.dispatch(eventFor('[data-save-agency]',{saveAgency:'beta',saveWork:'work'}));assert.deepEqual(readDraft(storage),initial);
 ui.setAvailable(true);ui.setMarker('backup:new');await ui.dispatch(eventFor('[data-remove-agency]',{removeAgency:'alpha',agencyName:'alpha'}));assert.deepEqual(readDraft(storage),initial);
});

test('undo removal asks again after selection changes and closes after project replacement',async()=>{
 const storage=memory(),initial=emptyDraft();initial.selection=['alpha','beta'].map(agencySlug=>({agencySlug,workSlug:null}));writeDraft(storage,initial);
 const ui=makeActions(storage,initial);await ui.dispatch(eventFor('[data-remove-agency]',{removeAgency:'alpha',agencyName:'alpha'}));
 const newer=readDraft(storage);newer.selection.push({agencySlug:'gamma',workSlug:null});writeDraft(storage,newer);
 await ui.dispatch(eventFor('[data-undo-removal]'));assert.deepEqual(readDraft(storage),newer);assert.match(ui.notice(),/изменился/);
 await ui.dispatch(eventFor('[data-undo-removal]'));assert.deepEqual(readDraft(storage).selection.map(item=>item.agencySlug),['alpha','beta','gamma']);
 await ui.dispatch(eventFor('[data-remove-agency]',{removeAgency:'alpha',agencyName:'alpha'}));const replacement=readDraft(storage);
 ui.setMarker('backup:new');await ui.dispatch(eventFor('[data-undo-removal]'));assert.deepEqual(readDraft(storage),replacement);assert.equal(ui.node('project-undo').hidden,true);
});

const persistStart=source.indexOf('function persist(next,');
const persistEnd=source.indexOf('\nconst pop=',persistStart);
const saveDraftStart=source.indexOf(" if(event.target.closest('[data-save-draft]')){");
const saveDraftEnd=source.indexOf('\n\n});',saveDraftStart);
assert(persistStart>=0&&persistEnd>persistStart&&saveDraftStart>=0&&saveDraftEnd>saveDraftStart,'persist and save draft actions exist');
const setupSave=new Function('KEY','emptyDraft','normalizeDraft','readDraft','writeDraft','submitLocal','addAgency','moveAgency','removeAgency','replaceAgency','restoreAgency','storage','initial',`
 let draft=structuredClone(initial),available=true,marker='initial',noticeText='',pendingReplacement=null,removedAgency=null,savingDraft=false,sending=false,focusRequest=false,lastReceipt=null,sendError='';
 const localStorage=storage,referenceProjectMarker=()=>marker,refresh=()=>{},notice=(title)=>noticeText=title,editingBlocked=()=>false,orderStatus={textContent:''};
 const node={hidden:false,disabled:false,textContent:'',removeAttribute(){},querySelectorAll:()=>[],querySelector:()=>({focus(){}}),focus(){}};
 const document={getElementById:()=>node,querySelector:()=>node};
 ${source.slice(helperStart,helperEnd)}
 ${source.slice(persistStart,persistEnd)}
 const renderProject=async()=>{},comparisonView='cards',getData=async()=>({agencies:[]}),replacementUndo={record(){}},replacement={close(){}},pop={hidden:false};
 async function offerReplacement(){}
 return {dispatch:async(event)=>{${source.slice(branchStart,branchEnd)}${source.slice(saveDraftStart,saveDraftEnd)}},state:()=>draft,available:()=>available,notice:()=>noticeText};
`);
const makeSave=(storage,initial)=>setupSave(KEY,emptyDraft,normalizeDraft,readDraft,writeDraft,submitLocal,addAgency,moveAgency,removeAgency,replaceAgency,restoreAgency,storage,initial);

test('first saved project cannot be silently recreated after another tab deletes it',async()=>{
 const storage=memory(),initial=emptyDraft(),ui=makeSave(storage,initial);
 await ui.dispatch(eventFor('[data-save-draft]'));assert.notEqual(storage.getItem(KEY),null);
 storage.removeItem(KEY);await ui.dispatch(eventFor('[data-save-agency]',{saveAgency:'alpha',saveWork:'work'}));
 assert.equal(storage.getItem(KEY),null);assert.match(ui.notice(),/изменился/);
});

test('the first external save in an initially empty project retains its contact',async()=>{
 const storage=memory(),initial=emptyDraft(),ui=makeSave(storage,initial),newer=emptyDraft();newer.contact.name='Анна';writeDraft(storage,newer);
 await ui.dispatch(eventFor('[data-save-agency]',{saveAgency:'alpha',saveWork:'work'}));
 const saved=readDraft(storage);assert.equal(saved.contact.name,'Анна');assert.equal(saved.selection[0].agencySlug,'alpha');
});

test('retry of a failed save preserves local changes only when its baseline is unchanged',async()=>{
 const backing=memory(),initial=emptyDraft();writeDraft(backing,initial);let fail=true;
 const storage={getItem:key=>backing.getItem(key),removeItem:key=>backing.removeItem(key),setItem:(key,value)=>{if(fail)throw Error('unavailable');backing.setItem(key,value);}};
 const ui=makeSave(storage,initial);await ui.dispatch(eventFor('[data-save-agency]',{saveAgency:'alpha',saveWork:'work'}));assert.equal(ui.available(),false);assert.equal(ui.state().selection[0].agencySlug,'alpha');
 fail=false;await ui.dispatch(eventFor('[data-save-draft]'));assert.equal(readDraft(backing).selection[0].agencySlug,'alpha');assert.equal(ui.available(),true);
 const changedBacking=memory();writeDraft(changedBacking,initial);fail=true;
 const changedStorage={getItem:key=>changedBacking.getItem(key),setItem:(key,value)=>{if(fail)throw Error('unavailable');changedBacking.setItem(key,value);}};
 const second=makeSave(changedStorage,initial);await second.dispatch(eventFor('[data-save-agency]',{saveAgency:'alpha',saveWork:'work'}));
 fail=false;const newer=structuredClone(initial);newer.contact.name='Анна';writeDraft(changedBacking,newer);
 await second.dispatch(eventFor('[data-save-draft]'));assert.deepEqual(readDraft(changedBacking),newer);assert.equal(second.state().selection[0].agencySlug,'alpha');assert.match(second.notice(),/безопасно/);
});
