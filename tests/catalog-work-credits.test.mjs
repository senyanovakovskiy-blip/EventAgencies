import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {presentCatalog} from '../client-presentation.mjs';
import {buildCatalogSearch} from '../public/custom/catalog-search.js';
import {workAgencyLabel,workPortfolioCredits,workCardVisibleSearchText,workClientMention} from '../public/custom/work-presentation.js';

const source=JSON.parse(fs.readFileSync(new URL('../content/catalog.json',import.meta.url),'utf8'));
const presentation=JSON.parse(fs.readFileSync(new URL('../content/client-presentation.json',import.meta.url),'utf8'));
const catalog=presentCatalog(source,presentation);
const agencies=new Map(catalog.agencies.map(agency=>[agency.slug,agency]));

test('a work credits its agency while its client remains searchable',()=>{
 const work=catalog.projects.find(project=>project.slug==='positive-hack-days');
 assert.equal(work.client,'Positive Technologies');
 const credits=workPortfolioCredits(work,agencies,'/catalog?view=projects');
 assert.deepEqual(credits.agencies.map(agency=>agency.name),['ARS COM']);
 assert.match(credits.links,/href="\/agency\/ars-com\?from=%2Fcatalog%3Fview%3Dprojects"/);
 assert.match(credits.links,/>ARS COM ↗<\/a>/);
 assert.doesNotMatch(credits.links,/Positive Technologies/);
 const visible=workCardVisibleSearchText(work,credits.agencies);
 assert.match(visible,/ARS COM/);
 assert.doesNotMatch(visible,/Positive Technologies/);
 assert.equal(workClientMention(work,agencies),'Positive Technologies');
 const found=buildCatalogSearch(catalog).searchWork(work.slug,'Positive Technologies');
 assert.equal(found.matches,true);
 assert.equal(found.detail.label,'Упоминание в работе');
 const agencyMatch=buildCatalogSearch(catalog).searchWork(work.slug,'ARS COM');
 assert.equal(agencyMatch.matches,true);
});

test('a shared work credits each real team once',()=>{
 const work=catalog.projects.find(project=>project.slug==='case-round2-88');
 const credits=workPortfolioCredits(work,agencies,'/catalog?view=projects&agency=c4');
 assert.deepEqual(credits.agencies.map(agency=>agency.name),['C4','C4 Group']);
 assert.match(credits.links,/\/agency\/c4\?from=/);
 assert.match(credits.links,/\/agency\/c4-group\?from=/);
 assert.equal(workAgencyLabel(work,agencies),'C4, C4 Group');
 assert.equal(workClientMention(work,agencies),'');
 assert.equal(buildCatalogSearch(catalog).searchWork(work.slug,'C4 Group').matches,true);
});

test('missing team data never substitutes the client as the agency',()=>{
 const work={agencySlug:'unknown',client:'Известный заказчик'};
 assert.equal(workAgencyLabel(work,agencies),'Команда не указана');
 assert.equal(workClientMention({agencySlug:'unknown',client:'Клиент не указан'},agencies),'');
 assert.equal(workClientMention({agencySlug:'unknown',client:'Заказчик не указан'},agencies),'');
 assert.deepEqual(workPortfolioCredits(work,agencies,'/catalog'),{agencies:[],links:''});
});

test('agency names are indexed independently of the client field',()=>{
 const search=buildCatalogSearch({agencies:[{slug:'team',name:'Точная команда'}],projects:[{slug:'work',agencySlug:'team',fullTitle:'Вечер',client:'Другой заказчик'}]});
 assert.equal(search.searchWork('work','Точная команда').detail.label,'Агентство');
 assert.equal(search.searchWork('work','Другой заказчик').detail.label,'Упоминание в работе');
});
