import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {addAgency,emptyDraft,readDraft,replaceAgency,writeDraft} from '../public/custom/project-store.js';

// Exercise the real add/replace click branches without booting the full page.
const source=fs.readFileSync(new URL('../public/custom/selection.js',import.meta.url),'utf8');
const start=source.indexOf(" const save=event.target.closest('[data-save-agency]');");
const end=source.indexOf(" if(event.target.closest('[data-cancel-replacement]'))",start);
assert(start>=0&&end>start,'selection click branches must be present');
const setup=new Function('addAgency','replaceAgency','initial',`
 let draft=structuredClone(initial),pendingReplacement=null,selectionPageIdentity=null;
 const refresh=()=>{};
 const freshSelection=()=>({current:draft,identity:{marker:'initial',existed:true}}),persistFresh=(_snapshot,value)=>(draft=value,true),notice=()=>{};
 const selectionBasis=()=>({identity:{marker:'initial',existed:true},selection:draft.selection});
 const replacementUndo={record(){}},replacement={close(){}};
 async function offerReplacement(agencySlug,workSlug,basis){pendingReplacement={agencySlug,workSlug,basis,name:agencySlug};}
 return {dispatch:async(event)=>{${source.slice(start,end)}},state:()=>draft};
`);
const restoreStart=source.indexOf('restore:(selection,expected,project)=>{',source.indexOf('replacementUndo=setupReplacementUndo'));
const restoreBodyStart=restoreStart+'restore:(selection,expected,project)=>{'.length;
const restoreEnd=source.indexOf('},onResult:',restoreBodyStart);
assert(restoreStart>=0&&restoreEnd>restoreBodyStart,'replacement undo handler must be present');
const makeRestore=new Function('readDraft','writeDraft','localStorage','initial',`
 let draft=initial,available=true,selectionFailure='failed';
 const freshSelection=({selection})=>{const current=readDraft(localStorage);return JSON.stringify(current.selection)===JSON.stringify(selection)?{current}:null;};
 const persistFresh=(_snapshot,next)=>(draft=writeDraft(localStorage,next),true);
 const restore=(selection,expected,project={marker:'initial',existed:true})=>{${source.slice(restoreBodyStart,restoreEnd)}};
 return {restore,state:()=>draft};
`);
const eventFor=(kind,data)=>({preventDefault(){},target:{closest(selector){return selector===kind?{dataset:data}:null;}}});

test('adding or changing a team for a shared work preserves each team’s notes',async()=>{
 const initial=emptyDraft();initial.workNotes={'c4/shared':'Заметка C4','c4-group/shared':'Своя заметка C4 Group'};
 const ui=setup(addAgency,replaceAgency,initial);
 await ui.dispatch(eventFor('[data-save-agency]',{saveAgency:'c4-group',saveWork:'shared',referenceNoteAgency:'c4'}));
 assert.deepEqual(ui.state().workNotes,initial.workNotes);
 await ui.dispatch(eventFor('[data-save-agency]',{saveAgency:'c4-group',saveWork:'other',referenceNoteAgency:'c4'}));
 assert.deepEqual(ui.state().workNotes,initial.workNotes);
 await ui.dispatch(eventFor('[data-save-agency]',{saveAgency:'c4-group',saveWork:'other',referenceNoteAgency:'c4'}));
 assert.deepEqual(ui.state().workNotes,initial.workNotes);
 const noTarget=emptyDraft();noTarget.workNotes={'c4/shared':'Только заметка C4'};
 const other=setup(addAgency,replaceAgency,noTarget);
 await other.dispatch(eventFor('[data-save-agency]',{saveAgency:'c4-group',saveWork:'shared',referenceNoteAgency:'c4'}));
 assert.deepEqual(other.state().workNotes,noTarget.workNotes);
});

test('replacing a team and undoing the replacement leave notes attached to their original teams',async()=>{
 const initial=emptyDraft();initial.selection=['c4','alpha','beta'].map(agencySlug=>({agencySlug,workSlug:null}));
 initial.workNotes={'c4/shared':'Заметка C4','c4-group/shared':'Заметка C4 Group'};
 const ui=setup(addAgency,replaceAgency,initial);
 await ui.dispatch(eventFor('[data-save-agency]',{saveAgency:'c4-group',saveWork:'shared',referenceNoteAgency:'c4'}));
 await ui.dispatch(eventFor('[data-replace-agency]',{replaceAgency:'alpha',replaceName:'Alpha'}));
 assert.deepEqual(ui.state().workNotes,initial.workNotes);
 assert(ui.state().selection.some(entry=>entry.agencySlug==='c4-group'));
 const values=new Map(),storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
 writeDraft(storage,ui.state());
 const undo=makeRestore(readDraft,writeDraft,storage,ui.state());
 assert.equal(undo.restore(initial.selection,ui.state().selection),'saved');
 assert.deepEqual(undo.state().selection,initial.selection);assert.deepEqual(undo.state().workNotes,initial.workNotes);
 const withoutTarget={...initial,workNotes:{'c4/shared':'Только заметка C4'}};
 const other=setup(addAgency,replaceAgency,withoutTarget);
 await other.dispatch(eventFor('[data-save-agency]',{saveAgency:'c4-group',saveWork:'shared',referenceNoteAgency:'c4'}));
 await other.dispatch(eventFor('[data-replace-agency]',{replaceAgency:'alpha',replaceName:'Alpha'}));
 assert.deepEqual(other.state().workNotes,withoutTarget.workNotes);
});
