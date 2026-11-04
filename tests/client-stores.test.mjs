import assert from 'node:assert/strict';
import test from 'node:test';
import {KEY,emptyDraft,normalizeDraft,readDraft,writeDraft,addAgency,moveAgency,removeAgency,restoreAgency,updateWorkNote} from '../public/custom/project-store.js';
import {REFERENCE_KEY,normalizeReferences} from '../public/custom/reference-store.js';
import {PREVIOUS_PROJECT_KEY,restoreProjectCopy} from '../public/custom/project-copy-client.js';

function memoryStorage(initial={}){
 const data=new Map(Object.entries(initial));
 return {
  data,
  getItem:key=>data.has(key)?data.get(key):null,
  setItem(key,value){data.set(key,String(value));},
  removeItem:key=>data.delete(key)
 };
}

function withBrowserGlobals(storage,run){
 const priorStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 const priorDocument=Object.getOwnPropertyDescriptor(globalThis,'document');
 const events=[];
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:storage});
 Object.defineProperty(globalThis,'document',{configurable:true,value:{dispatchEvent:event=>events.push(event.type)}});
 try{return run(events);}finally{
  if(priorStorage)Object.defineProperty(globalThis,'localStorage',priorStorage);else delete globalThis.localStorage;
  if(priorDocument)Object.defineProperty(globalThis,'document',priorDocument);else delete globalThis.document;
 }
}

test('draft storage falls back on invalid JSON and normalizes values before persistence',()=>{
 const storage=memoryStorage({[KEY]:'{bad json'});
 assert.deepEqual(readDraft(storage),emptyDraft());
 const source={version:1,selection:[
  {agencySlug:'alpha',workSlug:'work-one'}, {agencySlug:'alpha',workSlug:'other'},
  {agencySlug:'bad slug',workSlug:null}, {agencySlug:'beta',workSlug:'BAD'},
  {agencySlug:'gamma',workSlug:null}, {agencySlug:'delta',workSlug:null}
 ],workNotes:{'alpha/work-one':'x'.repeat(1001),'bad/key/parts':'no'},
 brief:{format:'fake',city:'m'.repeat(181),dateUnknown:1,description:'x'.repeat(3001)},
 contact:{name:'n'.repeat(121),method:'carrier-pigeon',value:'v'.repeat(255)}};
 const result=writeDraft(storage,source);
 assert.deepEqual(result.selection,[{agencySlug:'alpha',workSlug:'work-one'},{agencySlug:'beta',workSlug:null},{agencySlug:'gamma',workSlug:null}]);
 assert.equal(result.workNotes['alpha/work-one'].length,1000);
 assert.equal(result.workNotes['bad/key/parts'],undefined);
 assert.equal(result.brief.format,'');
 assert.equal(result.brief.city.length,180);
 assert.equal(result.brief.description.length,3000);
 assert.equal(result.brief.dateUnknown,false);
 assert.equal(result.contact.method,'email');
 assert.equal(result.contact.name.length,120);
 assert.equal(result.contact.value.length,254);
 assert.deepEqual(readDraft(storage),result);
 assert.deepEqual(JSON.parse(storage.getItem(KEY)),result);
 assert.throws(()=>writeDraft({setItem(){throw Error('quota');}},source),/quota/);
});

test('selection operations preserve newer choices and enforce the three-team limit',()=>{
 let state=emptyDraft();
 for(const slug of ['alpha','beta','gamma']){const added=addAgency(state,slug,null);assert.equal(added.result,'added');state=added.state;}
 assert.equal(addAgency(state,'delta',null).result,'full');
 const moved=moveAgency(state,'gamma',-1);
 assert.deepEqual(moved.selection.map(item=>item.agencySlug),['alpha','gamma','beta']);
 const removed=removeAgency(moved,'alpha');
 assert.equal(restoreAgency(removed,{agencySlug:'alpha',workSlug:'work-one'},0).result,'restored');
 assert.equal(restoreAgency(state,{agencySlug:'alpha',workSlug:'work-two'},0).result,'existing');
 state=updateWorkNote(state,'alpha','work-one','n'.repeat(1001));
 assert.equal(state.workNotes['alpha/work-one'].length,1000);
 assert.equal(updateWorkNote(state,'alpha','work-one','').workNotes['alpha/work-one'],undefined);
 assert.equal(normalizeDraft({version:99}).selection.length,0);
});

test('reference normalization validates slugs, deduplicates in order and caps at 200',()=>{
 const source=['first','first','INVALID','second',...Array.from({length:201},(_,i)=>'work-'+i)];
 const result=normalizeReferences(source);
 assert.deepEqual(result.slice(0,3),['first','second','work-0']);
 assert.equal(result.length,200);
 assert.equal(result.at(-1),'work-197');
 assert.deepEqual(normalizeReferences(null),[]);
 assert.equal(REFERENCE_KEY,'eventagencies-work-references-v1');
});

test('restoring an opted-out copy keeps existing private fields and backs up the prior project',()=>{
 const current=emptyDraft();
 current.selection=[{agencySlug:'alpha',workSlug:'work-one'}];
 current.workNotes={'alpha/work-one':'Keep note'};
 current.contact={name:'Keep name',method:'email',value:'keep@example.test'};
 current.request={id:'receipt',createdAt:'2026-01-01',localOnly:true};
 const incoming=emptyDraft();incoming.brief.city='Казань';
 const storage=memoryStorage({[KEY]:JSON.stringify(current),[REFERENCE_KEY]:JSON.stringify(['work-one'])});
 withBrowserGlobals(storage,events=>{
  restoreProjectCopy({draft:incoming,references:['work-two'],includeContact:false,includeNotes:false},()=>current);
  const restored=JSON.parse(storage.getItem(KEY)),backup=JSON.parse(storage.getItem(PREVIOUS_PROJECT_KEY));
  assert.equal(restored.brief.city,'Казань');
  assert.deepEqual(restored.contact,current.contact);
  assert.deepEqual(restored.workNotes,current.workNotes);
  assert.equal(restored.request,null);
  assert.deepEqual(JSON.parse(storage.getItem(REFERENCE_KEY)),['work-two']);
  assert.deepEqual(backup.draft,current);
  assert.deepEqual(backup.references,['work-one']);
  assert.deepEqual(events,['ea:project-copy-restored']);
 });
});

test('failed reference write restores the original project and references without a success event',()=>{
 const current=emptyDraft(),incoming=emptyDraft();incoming.brief.city='Казань';
 const priorDraft=JSON.stringify(current),priorRefs=JSON.stringify(['work-one']);
 const storage=memoryStorage({[KEY]:priorDraft,[REFERENCE_KEY]:priorRefs});
 const setItem=storage.setItem;let failOnce=true;
 storage.setItem=function(key,value){
  if(key===REFERENCE_KEY&&failOnce){failOnce=false;throw Error('quota');}
  setItem.call(this,key,value);
 };
 withBrowserGlobals(storage,events=>{
  assert.throws(()=>restoreProjectCopy({draft:incoming,references:['work-two'],includeContact:false,includeNotes:false},()=>current),error=>error.code==='browser_storage_unavailable');
  assert.equal(storage.getItem(KEY),priorDraft);
  assert.equal(storage.getItem(REFERENCE_KEY),priorRefs);
  assert.ok(storage.getItem(PREVIOUS_PROJECT_KEY));
  assert.deepEqual(events,[]);
 });
});

test('backup failure prevents any project replacement',()=>{
 const current=emptyDraft(),incoming=emptyDraft();incoming.brief.city='Казань';
 const priorDraft=JSON.stringify(current),priorRefs=JSON.stringify(['work-one']);
 const storage=memoryStorage({[KEY]:priorDraft,[REFERENCE_KEY]:priorRefs});
 const setItem=storage.setItem;
 storage.setItem=function(key,value){if(key===PREVIOUS_PROJECT_KEY)throw Error('quota');setItem.call(this,key,value);};
 withBrowserGlobals(storage,events=>{
  assert.throws(()=>restoreProjectCopy({draft:incoming,references:['work-two'],includeContact:false,includeNotes:false},()=>current),error=>error.code==='browser_storage_unavailable');
  assert.equal(storage.getItem(KEY),priorDraft);
  assert.equal(storage.getItem(REFERENCE_KEY),priorRefs);
  assert.deepEqual(events,[]);
 });
});

test('incomplete rollback reports recovery required and retains the backup',()=>{
 const current=emptyDraft(),incoming=emptyDraft();incoming.brief.city='Казань';
 const priorRefs=JSON.stringify(['work-one']);
 const storage=memoryStorage({[KEY]:JSON.stringify(current),[REFERENCE_KEY]:priorRefs});
 const setItem=storage.setItem;let draftWrites=0,referenceFailed=false;
 storage.setItem=function(key,value){
  if(key===KEY&&++draftWrites>1)throw Error('rollback failed');
  if(key===REFERENCE_KEY&&!referenceFailed){referenceFailed=true;throw Error('quota');}
  setItem.call(this,key,value);
 };
 withBrowserGlobals(storage,events=>{
  assert.throws(()=>restoreProjectCopy({draft:incoming,references:['work-two'],includeContact:false,includeNotes:false},()=>current),error=>error.code==='restore_recovery_required');
  assert.deepEqual(JSON.parse(storage.getItem(PREVIOUS_PROJECT_KEY)).draft,current);
  assert.equal(storage.getItem(REFERENCE_KEY),priorRefs);
  assert.deepEqual(events,[]);
 });
});
