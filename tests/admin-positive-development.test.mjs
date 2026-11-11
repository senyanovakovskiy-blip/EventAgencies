import assert from 'node:assert/strict';
import test from 'node:test';
import {buildEventIdeas,combineEventIdeaOptions,eventIdeaComparisonText,eventIdeaKey,eventIdeaPitchText,eventIdeaQuickPitchText,eventIdeaSourceFingerprint,eventIdeaText,ideaReactionDetails,ideaResponseLabels,renderEventIdeas} from '../admin/event-ideas.js';
import {openOriginalEventIdea} from '../admin/preparation-ui.js';

const input={entry:{agencySlug:'',workSlug:null},catalog:{agencies:[],projects:[]},receipt:{brief:{format:'corporate'},selection:[]},workflow:{brief:{}},references:[],participationMode:'active',audienceProfile:'team',eventDuration:'120'};
const base=buildEventIdeas(input).options[0];
const record=(key,title,{category='',note='',source=''}={})=>`01.11.2026 · ${ideaResponseLabels[key]}: «${title}».${source?' [Источник варианта: '+source+']':''}${category?' [Клиент отметил: '+category+']':''}${note?' [Комментарий клиента: '+note+']':''}`;
const follow=(feedback,options=input)=>buildEventIdeas({...options,clientFeedback:feedback}).options.find(item=>item.derivedFromReaction);

test('a free positive comment keeps the adapted original and asks rather than assuming its meaning',()=>{
 const result=buildEventIdeas({...input,clientFeedback:record('selected',base.title,{note:'не хочу конкурсы'})});
 const development=result.options.find(item=>item.derivedFromReaction),original=result.options.find(item=>item.title===base.title);
 assert.ok(development.derivedFromReaction.clarification);
 assert.equal(development.feedbackOriginal,original);
 assert.ok(development.idea.includes(original.idea));assert.ok(development.journey.includes(original.journey));
 assert.ok(development.idea.includes('Записанная фраза клиента: «не хочу конкурсы»'));
 assert.doesNotMatch(development.idea,/Сохранить отмеченное клиентом/);
 assert.doesNotMatch(eventIdeaPitchText(development),/особенно|сохранить этот акцент/i);
 assert.match(eventIdeaPitchText(development),/вы выбрали для проработки/);
 assert.match(eventIdeaPitchText(development),/уточним смысл/i);
 assert.equal(eventIdeaQuickPitchText(development),eventIdeaPitchText(development));
 assert.deepEqual(development.timeline,[]);
 assert.doesNotMatch(eventIdeaText(development),/Сдержанный вариант:|Черновой ритм программы:/);
 assert.match(eventIdeaComparisonText([development,original]),/Запись об исходном варианте: не хочу конкурсы/);
 assert.equal(combineEventIdeaOptions([development,original]).option,null);
 assert.ok(!development.briefSupport.signals.some(signal=>/основной ход сценария|поддерживает задачу/i.test(signal)));
});

test('a confirmed category gives a concrete proposal and keeps the client note separate',()=>{
 const feedback=record('interested',base.title,{category:ideaReactionDetails.pace,note:'больше свободного общения'});
 const development=follow(feedback),reaction=development.derivedFromReaction;
 assert.equal(reaction.clarification,false);assert.match(reaction.direction,/Снизить темп/);
 assert.match(development.idea,/Записанная фраза клиента: «больше свободного общения»/);
 assert.match(development.idea,/Возможное направление для обсуждения: Снизить темп/);
 assert.match(eventIdeaPitchText(development),/вас заинтересовал/);
 assert.match(eventIdeaPitchText(development),/Можно обсудить такое направление/);
 const long={...development,idea:'д'.repeat(900),journey:'м'.repeat(500)};
 const compared=eventIdeaComparisonText([long,base]);
 assert.match(compared,/Запись об исходном варианте: Сделать темп спокойнее — больше свободного общения/);
 assert.match(compared,/Предложение для обсуждения: Снизить темп/);
 assert.match(eventIdeaText(development),/Исходный замысел:/);
});

test('a free positive comment can be carried back to its original without overwriting or interpreting it',()=>{
 const result=buildEventIdeas({...input,clientFeedback:record('interested',base.title,{note:'меньше конкурсов'})}),item=result.options.find(option=>option.derivedFromReaction),original=item.feedbackOriginal;
 const index=result.options.indexOf(original),followIndex=result.options.indexOf(item),state={ideas:result.options,signature:'fresh'};
 assert.match(renderEventIdeas(result),new RegExp('data-open-original-idea="'+index+'"'));
 const select={focus(){}},note={value:''},status={textContent:''},details={open:false,querySelector(selector){return selector==='[data-event-idea-reaction-detail]'?select:selector==='[data-event-idea-reaction-note]'?note:status;}},target={querySelector:()=>details,scrollIntoView(){}};
 const button={dataset:{openOriginalIdea:String(index)},closest:()=>({dataset:{ideaCardIndex:String(followIndex)}})},panel={querySelector:()=>target};
 assert.equal(openOriginalEventIdea(button,state,panel,'fresh'),true);assert.equal(note.value,'меньше конкурсов');
 assert.match(status.textContent,/только после уточнения у заказчика/);
 note.value='Введено оператором';assert.equal(openOriginalEventIdea(button,state,panel,'fresh'),true);assert.equal(note.value,'Введено оператором');
 assert.equal(openOriginalEventIdea(button,state,panel,'stale'),false);
});

test('old identity and saved pitch remain intact with an explicit review reminder',()=>{
 const development=follow(record('selected',base.title,{note:'больше общения'}));
 const legacy={...development,derivedFromReaction:{title:development.derivedFromReaction.title,detail:development.derivedFromReaction.detail,key:development.derivedFromReaction.key}};delete legacy.feedbackOriginal;
 assert.equal(eventIdeaKey(development),eventIdeaKey(legacy));assert.equal(eventIdeaSourceFingerprint(development),eventIdeaSourceFingerprint(legacy));
 const html=renderEventIdeas({options:[{...development,pitchText:'Ручная подача',pitchRestored:true}]});
 assert.match(html,/Ручная подача/);assert.match(html,/соответствует ли он актуальному отклику/);
});

test('a later reaction to the follow-up takes precedence over the original reaction',()=>{
 for(const key of ['declined','uncertain','interested','selected']){
  const first=record('selected',base.title,{note:'больше общения'}),previous=follow(first);
  const own=record(key,previous.title,{note:'свой отклик',source:eventIdeaSourceFingerprint(previous)});
  const development=follow(first+'\n'+own);
  assert.equal(development.clientReaction?.key,key);
  assert.equal(development.derivedFromReaction.key,'selected');
  assert.match(development.resonance.label,key==='declined'?/не подош/:key==='uncertain'?/сомнения/:key==='selected'?/выбрал/:/интересно/);
  assert.match(eventIdeaPitchText(development),/свой отклик/);
  assert.match(eventIdeaPitchText(development),/По уточнению/);
  assert.doesNotMatch(eventIdeaPitchText(development),/По новому варианту|готовый сценарий/);
  if(key==='selected'||key==='interested')assert.match(eventIdeaPitchText(development),key==='selected'?/выбрали его для проработки/:/заинтересовались им/);
  if(key==='declined'||key==='uncertain'){
   assert.match(eventIdeaPitchText(development),key==='declined'?/не подош/:/сомнения/);
   assert.ok(!development.briefSupport.signals.some(signal=>signal.includes('ранее выбрал исходный')));
  }
 }
});

test('an old unknown category is an explicit clarification without empty or doubled quotes',()=>{
 const development=follow(record('interested',base.title,{category:'Старая категория'}));
 assert.equal(development.derivedFromReaction.clarification,true);
 assert.match(development.question,/«Старая категория»/);assert.doesNotMatch(development.question,/««|»»|«»/);
});

test('a later reaction to a negative revision is distinguished from the initial feedback',()=>{
 const original=record('uncertain',base.title,{category:ideaReactionDetails.pace});
 const revised=buildEventIdeas({...input,clientFeedback:original}).options.find(item=>item.revisedFromFeedback);
 for(const key of ['declined','uncertain','interested','selected']){
  const own=record(key,revised.title,{note:'отдельная реакция на доработку',source:eventIdeaSourceFingerprint(revised)});
  const item=buildEventIdeas({...input,clientFeedback:original+'\n'+own}).options.find(option=>option.revisedFromFeedback);
  assert.equal(item.revisedFromFeedback.key,'uncertain');assert.equal(item.clientReaction?.key,key);
  assert.match(eventIdeaPitchText(item),/отдельная реакция на доработку/);
  assert.match(item.resonance.label,key==='declined'?/не подош/:key==='uncertain'?/сомнения/:key==='selected'?/выбрал/:/интересно/);
  assert.ok(!item.briefSupport.signals.some(signal=>signal.includes('предложено направление изменения')));
 }
});

test('the first discussion asks to clarify a free comment and never recommends its rejected follow-up',()=>{
 const original=record('selected',base.title,{note:'не хочу конкурсы'});
 const first=buildEventIdeas({...input,clientFeedback:original});
 assert.equal(first.options[first.firstDiscussion.index].derivedFromReaction?.clarification,true);
 assert.match(first.firstDiscussion.reason,/уточните смысл/i);
 assert.doesNotMatch(first.firstDiscussion.reason,/элемент, который стоит сохранить/i);
 const development=first.options.find(item=>item.derivedFromReaction);
 for(const ownKey of ['declined','uncertain'])for(const ideaApproach of ['all','develop','fit']){
  const own=record(ownKey,development.title,{note:'ещё не подходит',source:eventIdeaSourceFingerprint(development)});
  const result=buildEventIdeas({...input,ideaApproach,clientFeedback:original+'\n'+own});
  const recommended=result.firstDiscussion&&result.options[result.firstDiscussion.index];
  if(recommended)assert.ok(!((recommended.derivedFromReaction||recommended.revisedFromFeedback)&&['declined','uncertain'].includes(recommended.clientReaction?.key)),ideaApproach+' '+ownKey);
 }
});

test('feedback recorded on a clarification is described as feedback on the question, not a finished scenario',()=>{
 for(const initialKey of ['selected','uncertain']){
  const original=record(initialKey,base.title,{note:'не хочу конкурсы'}),first=buildEventIdeas({...input,clientFeedback:original});
  const clarification=first.options.find(item=>item.derivedFromReaction?.clarification||item.revisedFromFeedback?.clarification);
  for(const ownKey of ['selected','interested']){
   const own=record(ownKey,clarification.title,{note:'обсудим это',source:eventIdeaSourceFingerprint(clarification)});
   const options=buildEventIdeas({...input,clientFeedback:original+'\n'+own}).options;
   const item=options.find(option=>option.derivedFromReaction?.clarification||option.revisedFromFeedback?.clarification);
   assert.equal(item.clientReaction?.key,ownKey);
   assert.match(eventIdeaPitchText(item),/По уточнению/);
   assert.doesNotMatch(eventIdeaPitchText(item),/По новому варианту/);
   assert.doesNotMatch(item.resonance.label,/выбрал вариант/);
  }
 }
});
