import assert from 'node:assert/strict';
import test from 'node:test';
import {buildEventIdeas,eventIdeaKey,eventIdeaSourceFingerprint,eventIdeaPitchText,eventIdeaQuickPitchText,eventIdeaText,eventIdeaComparisonText,renderEventIdeas,renderEventIdeaComparison,ideaResponseLabels,ideaReactionDetails} from '../admin/event-ideas.js';
import {openOriginalEventIdea} from '../admin/preparation-ui.js';

const input={entry:{agencySlug:'',workSlug:null},catalog:{agencies:[],projects:[]},receipt:{brief:{format:'corporate'},selection:[]},workflow:{brief:{}},references:[],eventDuration:'120',participationMode:'active',audienceProfile:'team'};
const original=buildEventIdeas(input).options[0];
const originalRecord=`01.11.2026 · ${ideaResponseLabels.uncertain}: «${original.title}». [Комментарий клиента: хочется теплее]`;
const result=buildEventIdeas({...input,clientFeedback:originalRecord});
const clarification=result.options.find(item=>item.revisedFromFeedback?.clarification);

test('free feedback remains an explicit clarification across card, comparison and customer text',()=>{
 assert.ok(clarification);
 assert.equal(clarification.feedbackOriginal.title,original.title);
 assert.equal(clarification.kind,'Доработка по отзыву');
 const old={...clarification,revisedFromFeedback:{...clarification.revisedFromFeedback}};delete old.revisedFromFeedback.clarification;delete old.feedbackOriginal;
 assert.equal(eventIdeaKey(clarification),eventIdeaKey(old));
 assert.equal(eventIdeaSourceFingerprint(clarification),eventIdeaSourceFingerprint(old));
 assert.deepEqual(clarification.timeline,[]);
 for(const value of [clarification.idea,clarification.journey,clarification.resonance.text,eventIdeaPitchText(clarification),eventIdeaQuickPitchText(clarification),eventIdeaText(clarification),eventIdeaComparisonText([clarification,original])]){
  assert.doesNotMatch(value,/Мы учли это замечание|предлагаем новую версию|сценарий пересобран|версия меняет сценарий/i);
 }
 assert.match(eventIdeaPitchText(clarification),/уточним.*затем подготовим/i);
 assert.doesNotMatch(eventIdeaText(clarification),/Сдержанный вариант:|Черновой ритм программы:/);
 assert.match(eventIdeaText(clarification),/Отклик клиента:/);
 assert.doesNotMatch(eventIdeaText(clarification),/Сигнал интереса:/);
 const html=renderEventIdeas(result);
 assert.match(html,/Уточнение отзыва/);
 assert.match(html,/data-open-original-idea="0"/);
 assert.match(html,/Выберите категорию только если её подтвердил заказчик/);
 assert.match(renderEventIdeaComparison([clarification,original]),/Уточнение отзыва/);
 const restored=renderEventIdeas({...result,options:[{...clarification,pitchRestored:true,pitchText:'Мой старый текст'}],firstDiscussion:null});
 assert.match(restored,/Мой старый текст/);
 assert.match(restored,/не обещает ли он готовый сценарий/);
 assert.match(restored,/Выберите путь «Собрать всё»/);
});

test('a confirmed category on the original yields a concrete direction without claiming a completed scenario',()=>{
 const category=`02.11.2026 · ${ideaResponseLabels.uncertain}: «${original.title}». [Клиент отметил: ${ideaReactionDetails.pace}] [Комментарий клиента: хочется теплее]`;
 const options=buildEventIdeas({...input,clientFeedback:originalRecord+'\n'+category}).options;
 const revision=options.find(item=>item.revisedFromFeedback?.title===original.title);
 assert.equal(revision.revisedFromFeedback.clarification,false);
 assert.match(revision.revisedFromFeedback.change,/Снизить темп/);
 assert.match(eventIdeaPitchText(revision),/направление изменения/);
 assert.match(eventIdeaPitchText(revision),/подготовим обновлённый сценарий/);
 assert.doesNotMatch(eventIdeaPitchText(revision),/предлагаем новую версию|Мы учли это замечание/);
 assert.ok(originalRecord.includes('хочется теплее'));
});

test('navigation opens only the exact original idea without modifying the note',()=>{
 const source=clarification.feedbackOriginal,other={title:'Другая идея'},state={ideas:[source,other,clarification],signature:'fresh'};
 const select={focused:false,focus(){this.focused=true;}},note={value:''},status={textContent:''},details={open:false,querySelector(selector){return selector==='[data-event-idea-reaction-detail]'?select:selector==='[data-event-idea-reaction-note]'?note:status;}},target={scrolled:false,querySelector:()=>details,scrollIntoView(){this.scrolled=true;}};
 const button={dataset:{openOriginalIdea:'0'},closest:()=>({dataset:{ideaCardIndex:'2'}})},panel={querySelector:()=>target};
 assert.equal(openOriginalEventIdea(button,state,panel,'fresh'),true);assert.equal(details.open,true);assert.equal(select.focused,true);assert.equal(target.scrolled,true);assert.equal(note.value,'хочется теплее');
 note.value='Новый текст оператора';assert.equal(openOriginalEventIdea(button,state,panel,'fresh'),true);assert.equal(note.value,'Новый текст оператора');assert.match(status.textContent,/уже заполнена/);
 note.value=' ';assert.equal(openOriginalEventIdea(button,state,panel,'fresh'),true);assert.equal(note.value,' ');
 for(const phrase of ['а'.repeat(241),'есть [условие','двойной  пробел']){
  note.value='';const invalid={...clarification,revisedFromFeedback:{...clarification.revisedFromFeedback,note:phrase}};state.ideas[2]=invalid;
  assert.equal(openOriginalEventIdea(button,state,panel,'fresh'),true);assert.equal(note.value,'');assert.match(status.textContent,/без изменений/);
 }
 state.ideas[2]=clarification;note.value='Новый текст оператора';
 details.open=false;assert.equal(openOriginalEventIdea(button,state,panel,'stale'),false);assert.equal(details.open,false);assert.equal(note.value,'Новый текст оператора');
 button.dataset.openOriginalIdea='1';assert.equal(openOriginalEventIdea(button,state,panel,'fresh'),false);assert.equal(details.open,false);
});

test('a free negative comment is not treated as evidence of a matching pace or goal',()=>{
 const negative=`01.11.2026 · ${ideaResponseLabels.declined}: «${original.title}». [Комментарий клиента: не хочу спокойно общаться]`;
 const options=buildEventIdeas({...input,participationMode:'calm',workflow:{brief:{goal:'Знакомства и общение'}},clientFeedback:negative}).options;
 const item=options.find(option=>option.revisedFromFeedback?.clarification);
 assert.ok(item);assert.match(eventIdeaText(item),/Отклик клиента:/);
 const originalWithReaction=options.find(option=>option.title===original.title);
 assert.match(eventIdeaText(originalWithReaction),/Отклик клиента:/);assert.doesNotMatch(eventIdeaText(originalWithReaction),/Сигнал интереса:/);
 assert.ok(!item.briefSupport.signals.some(signal=>/основной ход сценария|поддерживает задачу/i.test(signal)));
 assert.doesNotMatch(item.idea,/необязательный интерактив|ритм участия/i);
});
