import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {emptyDraft} from '../public/custom/project-store.js';
import {unsavedProjectText} from '../public/custom/project-recovery-text.js';

test('recovery text retains the in-memory brief, contact, selection and every note',()=>{
 const draft=emptyDraft();Object.assign(draft.brief,{format:'wedding',city:'Казань',date:'2027-05-10',dateUnknown:true,guests:'50',budget:'250000',budgetHelp:true,description:'Тихий вечер'});
 Object.assign(draft.contact,{name:'Анна',method:'phone',value:'+70000000000'});
 draft.selection=[{agencySlug:'alpha',workSlug:'work'},{agencySlug:'beta',workSlug:null}];
 draft.workNotes={'alpha/work':'Тёплый свет','other/work':'Вторая заметка'};
 const text=unsavedProjectText(draft);
 for(const value of ['Казань','2027-05-10','пока неизвестна','50','250000','нужна помощь с оценкой','Тихий вечер','Анна','+70000000000','alpha','beta','Тёплый свет','Вторая заметка'])assert.ok(text.includes(value),value);
});

test('recovery action displays selectable text on the current page',async()=>{
 const source=fs.readFileSync(new URL('../public/custom/selection.js',import.meta.url),'utf8');
 const start=source.indexOf(" const recovery=event.target.closest('[data-show-unsaved-project]');");
 const end=source.indexOf("  const copyRequestId=",start);
 assert(start>=0&&end>start);
 const create=new Function('unsavedProjectText','draft',`
  let field=null;
  const document={createElement:tag=>tag==='textarea'?{dataset:{},focus(){this.focused=true;},select(){this.selected=true;}}:{append(value){field=value;}}};
  const pop={querySelector:()=>field,append(){}};
  return {click:async(event)=>{${source.slice(start,end)}},field:()=>field};
 `);
 const draft=emptyDraft();draft.brief.city='Казань';const ui=create(unsavedProjectText,draft);
 await ui.click({preventDefault(){},target:{closest:()=>({})}});
 assert.match(ui.field().value,/Казань/);assert.equal(ui.field().readOnly,true);assert.equal(ui.field().selected,true);
});
