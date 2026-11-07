import assert from 'node:assert/strict';
import test from 'node:test';
import {buildCatalogSearch} from '../public/custom/catalog-search.js';
import {buildCatalogMatches} from '../public/custom/catalog-matches.js';

const agency={slug:'one',name:'Первая команда',city:'Москва',types:['business','sport'],works:['wrong'],presentation:{lead:'Креативные события'}};
const data={agencies:[agency,{slug:'empty',name:'Без кейсов',city:'Москва',presentation:{lead:'Личный подход'}}],projects:[
 {slug:'conference',agencySlug:'one',fullTitle:'Научный форум',eventCity:'Казань',types:['business'],occasions:['conference'],hasPhotos:false,presentation:{lead:'Лекции учёных'}},
 {slug:'sports',agencySlugs:['one','two'],fullTitle:'Большая регата',eventCity:'Сочи',types:['sport'],occasions:['teambuilding'],hasPhotos:true,presentation:{lead:'Лодки в море'}},
 {slug:'wrong',agencySlug:'other',fullTitle:'Чужая конференция',types:['business'],occasions:['conference'],hasPhotos:true,presentation:{lead:'Лекции и море'}}
]};
const matcher=buildCatalogMatches(data,buildCatalogSearch(data));

test('one work must support all conditions; photographs of a different event do not qualify',()=>{
 assert.equal(matcher.agency(agency,{occasion:'conference',photos:true}).matches,false);
 assert.equal(matcher.agency(agency,{format:'sport',occasion:'conference'}).matches,false);
 const result=matcher.agency(agency,{occasion:'teambuilding',photos:true});
 assert.equal(result.matches,true); assert.deepEqual(result.works.map(p=>p.slug),['sports']);
 assert.equal(matcher.agency(agency,{query:'лекции море'}).matches,false);
 assert.equal(matcher.agency(agency,{query:'лекции',occasion:'teambuilding'}).matches,false);
 assert.equal(matcher.agency(agency,{query:'чужая'}).matches,false);
});

test('own agency description combines with a real case, retains exact names and does not invent evidence',()=>{
 const result=matcher.agency(agency,{query:'КРЕАТИВНЫЕ форум'});
 assert.equal(result.matches,true); assert.deepEqual(result.works.map(p=>p.slug),['conference']);
 assert.equal(matcher.agency(agency,{query:'Первая команда',format:'sport'}).works[0].slug,'sports');
 const withoutCases=matcher.agency(data.agencies[1],{query:'личный подход'});
 assert.equal(withoutCases.matches,true); assert.deepEqual(withoutCases.works,[]);
 assert.equal(matcher.agency(data.agencies[1],{photos:true}).matches,false);
 assert.equal(matcher.agency(agency,{}).contextual,false);
});

test('team city and event city keep distinct meanings and shared authorship is preserved',()=>{
 assert.equal(matcher.agency(agency,{city:'Москва',occasion:'conference'}).matches,true);
 assert.equal(matcher.agency(agency,{city:'Казань'}).matches,false);
 assert.equal(matcher.work(data.projects[0],{city:'Казань'}),true);
 assert.equal(matcher.work(data.projects[0],{city:'Москва'}),false);
 assert.equal(matcher.work(data.projects[1],{scope:'two'}),true);
 assert.equal(matcher.work(data.projects[1],{scope:'other'}),false);
});
