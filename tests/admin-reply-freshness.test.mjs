import assert from 'node:assert/strict';
import test from 'node:test';
import {replyKey} from '../admin/manual-model.js';
import {emptyWorkflow} from '../admin/workflow-model.js';
import {emptyPreparation} from '../admin/preparation-model.js';

test('reply review covers client feedback and every saved idea input',()=>{
 const workflow=emptyWorkflow(),preparation=emptyPreparation('ars-com','positive-hack-days');
 workflow.preparation=[preparation];
 const original=replyKey([],workflow.brief,workflow.teams,workflow);
 const changed=[
  ['client discussion',value=>{value.preparation[0].clientFeedback='Клиент попросил меньше конкурсов';}],
  ['scenario revision',value=>{value.preparation[0].scenarioChanges='Убрать конкурсы';}],
  ['scenario',value=>{value.preparation[0].scenario='Больше свободного общения';}],
  ['preparation note',value=>{value.preparation[0].questions='Уточнить формат общения';}],
  ['general idea',value=>{value.ideaDraft='Новый набросок';}],
  ['general feedback',value=>{value.ideaFeedback='Вариант не подошёл';}],
  ['selected idea source',value=>{value.ideaSources=[{agencySlug:'ars-com',workSlug:'positive-hack-days',sources:[{agencySlug:'ars-com',workSlug:'positive-hack-days',momentKey:'idea'}]}];}],
  ['saved idea pitch',value=>{value.ideaPitches=[{agencySlug:'ars-com',workSlug:'positive-hack-days',key:'variant-1',sourceIdentity:'source-1',title:'Вариант',text:'Новая подача'}];}],
  ['idea settings',value=>{value.ideaSettings=[{agencySlug:'ars-com',workSlug:'positive-hack-days',formatOverride:'other',participationMode:'brief',creativeAngle:'brief',audienceProfile:'unspecified',ideaApproach:'all',eventDuration:'',customDirection:'Камерный вечер',allowUnmatchedManualCombination:false}];}]
 ];
 for(const [label,change] of changed){const value=structuredClone(workflow);change(value);assert.notEqual(replyKey([],value.brief,value.teams,value),original,label);}
});

test('reply review key ignores only whitespace trimmed on save',()=>{
 const workflow=emptyWorkflow(),preparation=emptyPreparation('ars-com','positive-hack-days');
 workflow.brief.city='Москва';workflow.preparation=[{...preparation,scenario:'Сценарий',clientFeedback:'Меньше конкурсов',scenarioChanges:'Убрать конкурсы'}];
 workflow.ideaDraft='Общий набросок';workflow.ideaFeedback='Есть сомнения';
 const saved=replyKey([],workflow.brief,workflow.teams,workflow);
 const unsaved=structuredClone(workflow);
 unsaved.brief.city='  Москва  ';unsaved.preparation[0].scenario='  Сценарий  ';unsaved.preparation[0].clientFeedback='  Меньше конкурсов  ';unsaved.preparation[0].scenarioChanges='  Убрать конкурсы  ';unsaved.ideaDraft='  Общий набросок  ';unsaved.ideaFeedback='  Есть сомнения  ';
 assert.equal(replyKey([],unsaved.brief,unsaved.teams,unsaved),saved);
});
