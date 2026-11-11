import assert from 'node:assert/strict';
import test from 'node:test';
import {buildEventIdeas,eventIdeaKey,eventIdeaSourceFingerprint,ideaResponseLabels} from '../admin/event-ideas.js';

const input={entry:{agencySlug:'',workSlug:null},catalog:{agencies:[],projects:[]},receipt:{brief:{format:'corporate'},selection:[]},workflow:{brief:{}},references:[]};
const base=buildEventIdeas(input).options;
const [first,second]=base;
const reaction=(day,key,title,note)=>`${day}.11.2026 · ${ideaResponseLabels[key]}: «${title}». [Комментарий клиента: ${note}]`;

test('two positive reactions yield separate developments in priority order with stable prior keys',()=>{
 const feedback=[reaction('01','interested',first.title,'больше свободного общения'),reaction('02','selected',second.title,'меньше конкурсов')].join('\n');
 const options=buildEventIdeas({...input,clientFeedback:feedback}).options;
 const developments=options.filter(option=>option.kind==='Развитие по отклику');
 assert.equal(developments.length,2);
 assert.deepEqual(developments.map(option=>option.derivedFromReaction.title),[second.title,first.title]);
 assert.deepEqual(developments.map(option=>option.derivedFromReaction.detail),['меньше конкурсов','больше свободного общения']);
 assert.notEqual(developments[0].title,developments[1].title);
 assert.ok(developments.every(option=>option.title.includes(option.derivedFromReaction.title)&&option.title.includes(option.derivedFromReaction.detail)));
 assert.equal(developments[0].legacyTitle,'Развить отмеченный элемент');
 assert.equal(eventIdeaKey(developments[0]),eventIdeaKey({...developments[0],title:'Развить отмеченный элемент',legacyTitle:undefined}));
 assert.match(developments[1].resonance.text,/заинтересовался вариантом/);
 assert.ok(developments[1].briefSupport.signals.some(signal=>signal.includes('заинтересовался исходным вариантом')));
 assert.equal(developments[0].briefSupport.score-developments[1].briefSupport.score,30);
});

test('old generic reaction stays with a single follow-up but is not assigned after another is added',()=>{
 const original=reaction('01','selected',first.title,'меньше конкурсов');
 const oldFollowUp=reaction('02','interested','Развить отмеченный элемент','нужны детали');
 const single=buildEventIdeas({...input,clientFeedback:[original,oldFollowUp].join('\n')}).options.filter(option=>option.kind==='Развитие по отклику');
 assert.equal(single.length,1);
 assert.equal(single[0].clientReaction?.key,'interested');
 const newer=reaction('03','selected',second.title,'больше свободного общения');
 const multiple=buildEventIdeas({...input,clientFeedback:[original,oldFollowUp,newer].join('\n')}).options.filter(option=>option.kind==='Развитие по отклику');
 assert.equal(multiple.length,2);
 assert.deepEqual(multiple.map(option=>option.clientReaction),[null,null]);
 assert.equal(multiple[0].derivedFromReaction.title,second.title);
});

test('follow-ups sharing a nonempty source fingerprint use their own recorded titles',()=>{
 const sourcedInput={...input,entry:{agencySlug:'agency',workSlug:'work'},catalog:{agencies:[{slug:'agency',name:'Команда'}],projects:[{agencySlug:'agency',slug:'work',title:'Работа',details:{idea:'Приём из реальной работы'}}]}};
 const originalIdeas=buildEventIdeas(sourcedInput).options;
 const sourceIdea=originalIdeas.find(option=>option.kind==='Развить элемент кейса');
 const combination=originalIdeas.find(option=>option.kind==='Сочетание');
 assert.ok(sourceIdea&&combination);
 const feedback=[
  `01.11.2026 · ${ideaResponseLabels.selected}: «${sourceIdea.title}». [Источник варианта: ${eventIdeaSourceFingerprint(sourceIdea)}] [Комментарий клиента: сохранить приём]`,
  `02.11.2026 · ${ideaResponseLabels.interested}: «${combination.title}». [Источник варианта: ${eventIdeaSourceFingerprint(combination)}] [Комментарий клиента: обсудить сочетание]`
 ].join('\n');
 const followUps=buildEventIdeas({...sourcedInput,clientFeedback:feedback}).options.filter(option=>option.kind==='Развитие по отклику');
 assert.equal(followUps.length,2);
 assert.ok(eventIdeaSourceFingerprint(followUps[0]));
 assert.equal(eventIdeaSourceFingerprint(followUps[0]),eventIdeaSourceFingerprint(followUps[1]));
 const sharedSource=eventIdeaSourceFingerprint(followUps[0]);
 const generic=`03.11.2026 · ${ideaResponseLabels.interested}: «Развить отмеченный элемент». [Источник варианта: ${sharedSource}]`;
 const ambiguous=buildEventIdeas({...sourcedInput,clientFeedback:feedback+'\n'+generic}).options.filter(option=>option.kind==='Развитие по отклику');
 assert.deepEqual(ambiguous.map(option=>option.clientReaction),[null,null]);
 const specific=`04.11.2026 · ${ideaResponseLabels.interested}: «${followUps[1].title}». [Источник варианта: ${sharedSource}]`;
 const linked=buildEventIdeas({...sourcedInput,clientFeedback:feedback+'\n'+generic+'\n'+specific}).options.filter(option=>option.kind==='Развитие по отклику');
 assert.equal(linked[0].clientReaction,null);
 assert.equal(linked[1].clientReaction?.key,'interested');
});

test('two negative reactions yield separate revisions, newest first, with stable prior keys',()=>{
 const feedback=[reaction('01','uncertain',first.title,'больше свободного общения'),reaction('02','declined',second.title,'меньше конкурсов')].join('\n');
 const options=buildEventIdeas({...input,clientFeedback:feedback}).options;
 const revisions=options.filter(option=>option.kind==='Доработка по отзыву');
 assert.equal(revisions.length,2);
 assert.deepEqual(revisions.map(option=>option.revisedFromFeedback.title),[second.title,first.title]);
 assert.deepEqual(revisions.map(option=>option.revisedFromFeedback.detail),['меньше конкурсов','больше свободного общения']);
 assert.notEqual(revisions[0].title,revisions[1].title);
 assert.ok(revisions.every(option=>option.title.includes(option.revisedFromFeedback.title)&&option.title.includes(option.revisedFromFeedback.detail)));
 assert.match(revisions[0].resonance.text,/не подошёл/);
 assert.match(revisions[1].resonance.text,/высказал сомнения/);
 for(const revision of revisions){
  const priorTitle='Пересобрать: '+revision.revisedFromFeedback.detail;
  assert.equal(revision.legacyTitle,priorTitle);
  assert.equal(eventIdeaKey(revision),eventIdeaKey({...revision,title:priorTitle,legacyTitle:undefined}));
 }
});

test('one old negative reaction does not spread across revisions with identical details',()=>{
 const shared='изменить финал';
 const feedback=[reaction('01','uncertain',first.title,shared),reaction('02','declined',second.title,shared),reaction('03','interested','Пересобрать: '+shared,'старая общая запись')].join('\n');
 const revisions=buildEventIdeas({...input,clientFeedback:feedback}).options.filter(option=>option.kind==='Доработка по отзыву');
 assert.equal(revisions.length,2);
 assert.deepEqual(revisions.map(option=>option.clientReaction),[null,null]);
});
