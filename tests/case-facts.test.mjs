import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import {caseBody} from '../case-pages.mjs';
import {presentCatalog} from '../client-presentation.mjs';
import {escapeHtml} from '../public/custom/work-presentation.js';

const catalog=presentCatalog(
 JSON.parse(await fs.readFile(new URL('../content/catalog.json',import.meta.url),'utf8')),
 JSON.parse(await fs.readFile(new URL('../content/client-presentation.json',import.meta.url),'utf8'))
);

test('case facts preserve real scale qualifications and the limited team role beside its source',()=>{
 const work=catalog.projects.find(item=>item.slug==='case-10');
 const html=caseBody(work,catalog.agencies);
 assert.match(html,/Более 6 000 очных участников/);
 const role=escapeHtml(work.presentation.participation);
 assert(html.includes(role));
 assert.equal(html.split(role).length-1,1,'participation is not repeated as a second claim');
 const participationPosition=html.indexOf(role);
 assert(participationPosition>html.indexOf('Масштаб проекта'));
 assert(participationPosition<html.indexOf('Чуть ближе к событию'));
 assert(html.includes('href="'+escapeHtml(work.source)+'"'));
 assert.match(role,/не заявлено единственным организатором/);
 for(const slug of ['vkusy-rossii','case-17','case-30']){
  const qualified=catalog.projects.find(item=>item.slug===slug);
  assert(caseBody(qualified,catalog.agencies).includes(escapeHtml(qualified.guestLabel)),slug+' must retain the complete audience qualification');
 }
});

test('missing scale and task scope do not become invented facts or expose operator fields',()=>{
 const work={slug:'sample',fullTitle:'Работа без уточнений',kind:'portfolio',year:'—',agencySlug:'team',agencySlugs:['team'],client:'Команда',hasPhotos:false,
  presentation:{lead:'Пример',intro:'Описание',fit:'Обсудите детали'},operatorNotes:'PRIVATE OPERATOR DATA'};
 const html=caseBody(work,[{slug:'team',name:'Команда'}]);
 assert(!html.includes('Масштаб проекта'));
 assert.match(html,/Состав задач команды в каталоге пока не указан/);
 assert(!html.includes('PRIVATE OPERATOR DATA'));
 assert(html.includes('data-save-agency="team" data-save-work="sample"'));
 assert(html.includes('data-reference-work="sample"'));
 const unconfirmed=caseBody({...work,guestLabel:'Показатель посещаемости отдельного кейса здесь не подтверждён'},[]);
 assert(!unconfirmed.includes('Масштаб проекта'));
 const escaped=caseBody({...work,guestLabel:'100 гостей <уточнить>',role:'Работа с площадкой <без декора>'},[]);
 assert(escaped.includes('100 гостей &lt;уточнить&gt;'));
 assert(escaped.includes('Работа с площадкой &lt;без декора&gt;'));
});
