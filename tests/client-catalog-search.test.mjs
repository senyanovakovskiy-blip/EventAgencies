import assert from 'node:assert/strict';
import test from 'node:test';
import {buildCatalogSearch,normalizeSearchText,publicPresentationText,searchTerms} from '../public/custom/catalog-search.js';

const catalog={
 agencies:[
  {slug:'one',name:'Первое агентство',works:['stale'],presentation:{lead:'Яркие ёлки',intro:'Тёплая команда',private:'SECRET FIELD'},internal:'SECRET AGENCY'},
  {slug:'two',name:'Вторая команда',works:['shared']}
 ],
 projects:[
  {slug:'shared',agencySlug:'one',agencySlugs:['two'],fullTitle:'ＡＢＣ форум',client:'PUBLIC CLIENT',
   presentation:{lead:'Гости у моря',fit:'Семейный формат',participation:'Свет',private:'SECRET WORK'},operatorNotes:'SECRET OPERATOR'},
  {slug:'stale',agencySlug:'two',fullTitle:'Чужая выставка',client:'OTHER CLIENT',presentation:{lead:'Чужой берег'}}
 ]
};

test('search normalizes NFKC, case, ё and whitespace and uses literal AND terms',()=>{
 assert.equal(normalizeSearchText('  ЁЛКА\tＡＢＣ  '),'елка abc');
 assert.deepEqual(searchTerms(' ЁЛКА\tелка ＡＢＣ '),['елка','abc']);
 const index=buildCatalogSearch(catalog);
 assert.equal(index.searchAgency('one','ЕЛКИ abc гости').matches,true);
 assert.equal(index.searchAgency('one','елки abc отсутствует').matches,false);
 assert.equal(index.searchWork('shared',['ГОСТИ','ＡＢＣ']).matches,true);
 assert.equal(index.searchWork('missing','').matches,false);
 assert.deepEqual(index.searchWork('shared',''),{matches:true,detail:null});
 assert.equal(index.searchWork('shared','гост').matches,true);
 assert.equal(index.searchWork('shared','гось').matches,false);
});

test('only allowlisted public fields enter the index',()=>{
 const index=buildCatalogSearch(catalog);
 for(const term of ['SECRET','OPERATOR']){
  assert.equal(index.searchWork('shared',term).matches,false);
  assert.equal(index.searchAgency('one',term).matches,false);
 }
 assert.equal(index.searchWork('shared','PUBLIC CLIENT').matches,true);
 assert.equal(index.searchAgency('one','PUBLIC CLIENT').matches,false);
 assert.equal(publicPresentationText({presentation:{lead:'Текст',fit:42,private:'скрыто'}}),'Текст');
});

test('agency indexes use explicit ownership rather than stale agency work lists',()=>{
 const index=buildCatalogSearch(catalog);
 assert.equal(index.searchAgency('one','выставка').matches,false);
 assert.equal(index.searchAgency('one','чужой берег').matches,false);
 assert.equal(index.searchAgency('two','abc море').matches,false); // Literal matching: "моря" is not "море".
 const linked=index.searchAgency('two','abc моря');
 assert.equal(linked.matches,true);
 assert.ok(Object.hasOwn(linked.detail,'workTitle'));
 assert.equal(linked.detail.workTitle,'ＡＢＣ форум');
 assert.equal(index.searchAgency('two','чужой берег').matches,true);
 linked.detail.text='изменено';
 assert.notEqual(index.searchAgency('two','abc моря').detail.text,'изменено');
});
