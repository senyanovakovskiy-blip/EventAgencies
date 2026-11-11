import assert from 'node:assert/strict';
import test from 'node:test';
import {buildEventIdeas,combineEventIdeaOptions,eventIdeaText,renderEventIdeaCombination} from '../admin/event-ideas.js';

const first={title:'Камерный ужин',idea:'Гости встречаются за общим столом и свободно общаются; участие в разговорах добровольное.',sources:[{agencySlug:'one',workSlug:'dinner',title:'Ужин',agencyName:'Команда 1',url:'https://example.org/dinner'}]};
const second={title:'Световой маршрут',idea:'Гости проходят через световые объекты. Не публиковать личные истории без согласия.',sources:[{agencySlug:'two',workSlug:'light',title:'Свет',agencyName:'Команда 2',url:'https://example.org/light'}]};

test('the saved combination carries both full ideas as a proposal to discuss',()=>{
 const result=combineEventIdeaOptions([first,second]);
 assert.ok(result.option);
 const draft=eventIdeaText(result.option);
 assert.ok(draft.includes(first.idea));
 assert.ok(draft.includes(second.idea));
 assert.match(draft,/Выбрать из второго направления один поддерживающий элемент и обсудить его с заказчиком/);
 assert.match(draft,/совместимость ещё не обсуждали с заказчиком/);
 assert.match(draft,/уточнить возможность совместной работы и роли/);
 assert.match(draft,/https:\/\/example\.org\/dinner/);
 assert.match(draft,/https:\/\/example\.org\/light/);
 const reversed=combineEventIdeaOptions([second,first]).option;
 assert.ok(reversed.idea.indexOf(second.idea)<reversed.idea.indexOf(first.idea));
 assert.match(renderEventIdeaCombination(result.option),/Гости проходят через световые объекты/);
});

test('a clarification or a rejected idea cannot be presented as a combined scenario',()=>{
 for(const rejected of [{...second,clientReaction:{key:'declined'}},{...second,clientReaction:{key:'uncertain'}},{...second,revisedFromFeedback:{clarification:true}}]){
  const result=combineEventIdeaOptions([first,rejected]);
  assert.equal(result.option,null);
  assert.ok(result.reason);
 }
});

test('an absent description is explicitly marked and never invented',()=>{
 const result=combineEventIdeaOptions([first,{title:'Без описания',idea:'',sources:[]}]);
 assert.match(result.option.idea,/Направление второго варианта «Без описания»: описание нужно дополнить\./);
});

test('a combination of generated ideas fits an empty scenario field',()=>{
 const generated=buildEventIdeas({entry:{agencySlug:'',workSlug:null},catalog:{agencies:[],projects:[]},receipt:{brief:{format:'corporate'},selection:[]},workflow:{brief:{}},references:[]});
 const [base,alternative]=generated.options;
 const combined=combineEventIdeaOptions([base,alternative]).option;
 const draft=eventIdeaText(combined,generated.commonChecks);
 assert.ok(draft.includes(base.idea));
 assert.ok(draft.includes(alternative.idea));
 assert.ok(draft.length<=4000,'A normal combination should fit in the empty scenario field');
});
