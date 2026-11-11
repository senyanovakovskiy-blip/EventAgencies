import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {KEY,emptyDraft,normalizeDraft,readDraft} from '../public/custom/project-store.js';

const source=fs.readFileSync(new URL('../public/custom/selection.js',import.meta.url),'utf8');
const between=(start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a);assert(a>=0&&b>a);return source.slice(a,b);};
const helper=between('function selectionIdentity()','\nconst inlineNotes=');
const persist=between('function persist(next,','\nconst pop=');
const refresh=between('function refresh(){',"\ndocument.addEventListener('click'");
const render=between('let renderVersion=0;','\nfunction contactNeedsSaving()');
const callbacks=[...source.matchAll(/onRead:next=>\{([^}]+)\}/g)].map(match=>match[1]);
assert.equal(callbacks.length,2);

test('failed save stays in memory through the actual project refresh and editor reads',()=>{
 const stored=emptyDraft(),localStorage={getItem:key=>key===KEY?JSON.stringify(stored):null},referenceProjectMarker=()=> 'initial';
 const execute=new Function('KEY','emptyDraft','normalizeDraft','readDraft','localStorage','referenceProjectMarker',`
 let draft=emptyDraft(),available=true,lastReceipt=null,sendError='',sending=false,comparisonView='cards';
 const elements={ 'project-board':{},'project-storage-note':{removeAttribute(){}} };
 const document={getElementById:id=>elements[id]||null,querySelectorAll:()=>[]};
 const orderStatus={textContent:''},replacementUndo={sync(){}},wishesUndo={sync(){}},briefUndo={sync(){}};
 const writeDraft=()=>{throw Error('quota')},editingBlocked=()=>false,notice=()=>{};
 const getData=()=>new Promise(()=>{});
 const briefEditor={reconcile(){const next=readDraft(localStorage);${callbacks[0]}}};
 const contactEditor={reconcile(){const next=readDraft(localStorage);${callbacks[1]}}};
 ${helper}
 ${persist}
 ${refresh}
 ${render}
 const next=emptyDraft();next.brief.city='Сохранить в памяти';next.selection=[{agencySlug:'alpha',workSlug:null}];
 const result=persist(next);
 return {result,draft,available};
 `);
 const result=execute(KEY,emptyDraft,normalizeDraft,readDraft,localStorage,referenceProjectMarker);
 assert.equal(result.result,false);assert.equal(result.available,false);
 assert.equal(result.draft.brief.city,'Сохранить в памяти');assert.equal(result.draft.selection[0].agencySlug,'alpha');
});
