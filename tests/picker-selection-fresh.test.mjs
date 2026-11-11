import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {KEY,emptyDraft,normalizeDraft,readDraft,writeDraft} from '../public/custom/project-store.js';

const source=fs.readFileSync(new URL('../public/custom/selection.js',import.meta.url),'utf8');
const picker=fs.readFileSync(new URL('../public/custom/project-work-picker.js',import.meta.url),'utf8');
const helperStart=source.indexOf('function selectionIdentity()'),helperEnd=source.indexOf('\nconst inlineNotes=',helperStart);
const anchor='onChoose:async({agencySlug,workSlug,expectedWorkSlug,basis})=>{';
const start=source.indexOf(anchor)+anchor.length,end=source.indexOf('\n}});',start);
const openStart=picker.indexOf(' async function open(opener){'),openEnd=picker.indexOf("\n document.addEventListener('click'",openStart);
assert(helperStart>=0&&helperEnd>helperStart&&start>=anchor.length&&end>start&&openStart>=0&&openEnd>openStart);
const memory=()=>{const map=new Map();return {getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)};};
const create=new Function('KEY','emptyDraft','normalizeDraft','readDraft','writeDraft','storage','initial',`
 let draft=structuredClone(initial),available=true,marker='initial',sending=false,lastReceipt=null,sendError='',noticeText='';
 const localStorage=storage,referenceProjectMarker=()=>marker,refresh=()=>{},notice=title=>noticeText=title;
 let board=false;const document={getElementById:id=>board&&id==='project-board'?{}:null},renderProject=async()=>{},orderStatus={textContent:''};
 const persist=next=>{draft=writeDraft(localStorage,next);return true;};
 ${source.slice(helperStart,helperEnd)}
 return {basis:selectionBasis,choose:async({agencySlug,workSlug,expectedWorkSlug,basis})=>{${source.slice(start,end)}},setMarker:value=>marker=value,setDraft:value=>draft=value,setDisplayed:value=>{board=true;selectionDisplayed=value;},state:()=>draft,notice:()=>noticeText};
`);

test('work picker rejects a replaced project even if the same team remains selected',async()=>{
 const storage=memory(),initial=emptyDraft();initial.selection=[{agencySlug:'alpha',workSlug:'old'}];writeDraft(storage,initial);
 const ui=create(KEY,emptyDraft,normalizeDraft,readDraft,writeDraft,storage,initial),basis=ui.basis(),other=structuredClone(initial);other.contact.name='Другой проект';writeDraft(storage,other);ui.setMarker('backup:new');
 assert.equal(await ui.choose({agencySlug:'alpha',workSlug:'new',expectedWorkSlug:'old',basis}),'project-changed');
 assert.deepEqual(readDraft(storage),other);
});

test('work picker saves against fresh unrelated fields and refuses a changed selection',async()=>{
 const storage=memory(),initial=emptyDraft();initial.selection=[{agencySlug:'alpha',workSlug:'old'}];writeDraft(storage,initial);
 const ui=create(KEY,emptyDraft,normalizeDraft,readDraft,writeDraft,storage,initial),basis=ui.basis(),newer=structuredClone(initial);newer.contact.name='Анна';writeDraft(storage,newer);
 assert.equal(await ui.choose({agencySlug:'alpha',workSlug:'new',expectedWorkSlug:'old',basis}),'saved');assert.equal(readDraft(storage).contact.name,'Анна');assert.equal(readDraft(storage).selection[0].workSlug,'new');
 const stale=ui.basis(),other=readDraft(storage);other.selection.push({agencySlug:'beta',workSlug:null});writeDraft(storage,other);
 assert.equal(await ui.choose({agencySlug:'alpha',workSlug:'old',expectedWorkSlug:'new',basis:stale}),'changed');assert.deepEqual(readDraft(storage),other);
});

test('selection compares the displayed order even when a form read updates draft without rendering',async()=>{
 const storage=memory(),initial=emptyDraft();initial.selection=['alpha','beta'].map(agencySlug=>({agencySlug,workSlug:null}));writeDraft(storage,initial);
 const ui=create(KEY,emptyDraft,normalizeDraft,readDraft,writeDraft,storage,initial),shown=ui.basis();ui.setDisplayed(shown);
 const newer=structuredClone(initial);newer.selection.reverse();writeDraft(storage,newer);ui.setDraft(newer);
 assert.equal(await ui.choose({agencySlug:'alpha',workSlug:'new',expectedWorkSlug:null,basis:ui.basis()}),'changed');
 assert.deepEqual(readDraft(storage),newer);
});

test('opening the picker checks its captured project after loading the catalog',async()=>{
 let marker='initial',resolveData,shown=false;
 const load=new Promise(resolve=>{resolveData=resolve;});
 const makeOpen=new Function('getData','getBasis','validateBasis','getState','onError','onShown',`
 let opening=false,trigger=null,active=null,selected,dialog={open:false,showModal(){this.open=true;onShown()},querySelector(){return {scrollTop:0,textContent:''}}},search={value:'',focus(){}},status={textContent:''};
 const canChoose=()=>true,workFor=()=>true,buildCatalogSearch=()=>({}),render=()=>{};
 ${picker.slice(openStart,openEnd)}
 return open;
 `);
 // The open function must stop before presenting an old project's picker.
 const open=makeOpen(()=>load,()=>({marker}),basis=>basis.marker===marker,()=>({selection:[{agencySlug:'alpha',workSlug:null}]}),()=>{},()=>{shown=true});
 const pending=open({dataset:{openWorkPicker:'alpha'}});marker='backup:new';
 resolveData({agencies:[{slug:'alpha',name:'Alpha'}],projects:[]});await pending;
 assert.equal(shown,false);
 const normal=makeOpen(async()=>({agencies:[{slug:'alpha',name:'Alpha'}],projects:[]}),()=>({marker}),basis=>basis.marker===marker,()=>({selection:[{agencySlug:'alpha',workSlug:null}]}),()=>{},()=>{shown=true});
 await normal({dataset:{openWorkPicker:'alpha'}});assert.equal(shown,true);
});
