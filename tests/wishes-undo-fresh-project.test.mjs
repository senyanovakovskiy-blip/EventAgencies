import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {KEY,emptyDraft,readDraft,writeDraft,updateBrief} from '../public/custom/project-store.js';
import {setupWishesUndo} from '../public/custom/wishes-undo.js';

// Exercise the real undo callback while another tab changes localStorage.
const source=fs.readFileSync(new URL('../public/custom/selection.js',import.meta.url),'utf8');
const anchor='restore:(description,expected,project)=>{';
const start=source.indexOf(anchor,source.indexOf('wishesUndo=setupWishesUndo'))+anchor.length;
const end=source.indexOf('\n}});',start);
assert(start>=anchor.length&&end>start,'wishes undo callback exists');
const setup=new Function('KEY','readDraft','writeDraft','updateBrief','localStorage','initial',`
 let draft=structuredClone(initial),available=true,lastReceipt=null,sendError='',marker='initial';
 const referenceProjectMarker=()=>marker,refresh=()=>{},markSelectionSaved=()=>{},document={getElementById:()=>null};
 return {restore:(description,expected,project)=>{${source.slice(start,end)}},state:()=>draft,setAvailable:value=>available=value,setMarker:value=>marker=value};
`);
const memory=()=>{const map=new Map();return {getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)};};

test('undo preserves newer contact, teams and notes from another tab',()=>{
 const storage=memory(),initial=emptyDraft();initial.brief.description='Дополнено';writeDraft(storage,initial);
 const ui=setup(KEY,readDraft,writeDraft,updateBrief,storage,initial),newer=structuredClone(initial);
 newer.contact.name='Анна';newer.selection=[{agencySlug:'c4',workSlug:'shared'}];newer.workNotes={'c4/shared':'Заметка'};writeDraft(storage,newer);
 assert.equal(ui.restore('До добавления','Дополнено','initial'),'saved');
 const result=readDraft(storage);assert.equal(result.brief.description,'До добавления');assert.deepEqual(result.contact,newer.contact);assert.deepEqual(result.selection,newer.selection);assert.deepEqual(result.workNotes,newer.workNotes);
});

test('undo refuses changed wishes, removed project and unsaved in-memory data',()=>{
 const storage=memory(),initial=emptyDraft();initial.brief.description='Дополнено';writeDraft(storage,initial);
 const ui=setup(KEY,readDraft,writeDraft,updateBrief,storage,initial),newer=structuredClone(initial);newer.brief.description='Другие пожелания';writeDraft(storage,newer);
 assert.equal(ui.restore('До','Дополнено','initial'),'changed');assert.deepEqual(readDraft(storage),newer);
 ui.setMarker('backup:new');assert.equal(ui.restore('До','Дополнено','initial'),'changed');assert.deepEqual(readDraft(storage),newer);
 ui.setMarker('initial');storage.removeItem(KEY);assert.equal(ui.restore('До','Дополнено','initial'),'changed');assert.equal(storage.getItem(KEY),null);
 writeDraft(storage,newer);ui.setAvailable(false);assert.equal(ui.restore('До','Дополнено','initial'),'unsaved');assert.deepEqual(ui.state(),initial);assert.deepEqual(readDraft(storage),newer);
});

test('undo can retry after temporary storage or marker failures',()=>{
 const backing=memory(),initial=emptyDraft();initial.brief.description='Дополнено';writeDraft(backing,initial);
 let failWrite=false;const storage={getItem:key=>backing.getItem(key),setItem:(key,value)=>{if(failWrite)throw Error('unavailable');backing.setItem(key,value);}};
 const ui=setup(KEY,readDraft,writeDraft,updateBrief,storage,initial);ui.setMarker(null);
 assert.equal(ui.restore('До','Дополнено','initial'),'failed');assert.deepEqual(readDraft(backing),initial);
 ui.setMarker('initial');failWrite=true;assert.equal(ui.restore('До','Дополнено','initial'),'failed');assert.deepEqual(readDraft(backing),initial);assert.deepEqual(ui.state(),initial);
 failWrite=false;assert.equal(ui.restore('До','Дополнено','initial'),'saved');assert.equal(readDraft(backing).brief.description,'До');
});

test('saved undo retains project identity across reload and discards old records',()=>{
 const priorDocument=globalThis.document,priorSession=globalThis.sessionStorage,storage=memory(),listeners=new Map(),status={textContent:'',after(node){this.host=node;},focus(){}};
 const element=()=>({hidden:false,disabled:false,append(node){this.child=node;},addEventListener(type,fn){this[type]=fn;}});
 globalThis.document={getElementById:()=>status,createElement:element,addEventListener(type,fn){listeners.set(type,fn);}};globalThis.sessionStorage=storage;
 try{
  let restored;const ui=setupWishesUndo({getDescription:()=> 'После',canUndo:()=>true,restore:(...args)=>(restored=args,'saved')});
  ui.record('До','После','backup:2026-11-11T08:00:00.000Z');
  const saved=JSON.parse(storage.getItem('eventagencies-wishes-undo-v1'));assert.equal(saved.version,2);assert.equal(saved.project,'backup:2026-11-11T08:00:00.000Z');
  const reloaded=setupWishesUndo({getDescription:()=> 'После',canUndo:()=>true,restore:(...args)=>(restored=args,'saved')});
  status.host.child.click();assert.deepEqual(restored,['До','После',saved.project]);
  storage.setItem('eventagencies-wishes-undo-v1',JSON.stringify({version:1,before:'До',after:'После'}));
  setupWishesUndo({getDescription:()=> 'После',canUndo:()=>true,restore:()=>{throw Error('old record must not restore');}});assert.equal(status.host.hidden,true);
 }finally{globalThis.document=priorDocument;globalThis.sessionStorage=priorSession;}
});
