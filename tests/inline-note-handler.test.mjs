import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Run the actual delegated input branch with an unsaved in-memory project.
const source=fs.readFileSync(new URL('../public/custom/selection.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const start=source.indexOf("document.addEventListener('input',event=>{\n const field=event.target.closest('[data-work-note]');");
const begin=source.indexOf('{',start)+1,end=source.indexOf('},true);',begin);
assert(start>=0&&end>begin);
const create=new Function('inlineNotes','initial','document',`let available=false,sending=false,draft=initial;const syncComparisonNote=()=>{};return {run:event=>{${source.slice(begin,end)}},state:()=>draft};`);

test('unsaved project prevents inline input from reading or replacing the in-memory draft',()=>{
 const status={textContent:''},field={value:'Новый ввод',closest:()=>({querySelector:()=>status})},draft={brief:{city:'Несохранённый город'}},calls=[];
 const event={target:{closest:()=>field},stopImmediatePropagation(){calls.push('stop');}};
 const handler=create({defer(value){assert.equal(value,field);calls.push('defer');},input(){throw Error('must not read or write');}},draft,{});handler.run(event);
 assert.deepEqual(calls,['defer','stop']);assert.equal(handler.state(),draft);assert.equal(draft.brief.city,'Несохранённый город');
});

test('storage event cannot replace an unsaved in-memory project',()=>{
 const start=source.indexOf("addEventListener('storage',e=>{");const begin=source.indexOf('{',start)+1,end=source.indexOf('\n});',begin);assert(start>=0&&end>begin);
 const createStorage=new Function('inlineNotes','initial','document','localStorage',`let available=false,draft=initial;return {run:e=>{${source.slice(begin,end)}},state:()=>draft};`);
 const field={matches:()=>true},draft={brief:{city:'Локальный город'}},seen=[],storage={};
 const handler=createStorage({defer(value){assert.equal(value,field);seen.push('defer');}},draft,{activeElement:field},storage);
 handler.run({storageArea:storage,key:'eventagencies-project-v1',newValue:'{}'});
 assert.deepEqual(seen,['defer']);assert.equal(handler.state(),draft);
});
