import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {creditProjectsToAgencies} from '../project-agency-credit.mjs';

const projects=JSON.parse(fs.readFileSync(new URL('../content/projects.json',import.meta.url),'utf8'));
const agencies=JSON.parse(fs.readFileSync(new URL('../content/catalog.json',import.meta.url),'utf8')).agencies;

test('home and mobile project credits name the linked agency, not its client',()=>{
 const credited=creditProjectsToAgencies(projects,agencies),bySlug=new Map(credited.map(project=>[project.slug,project]));
 const golf=bySlug.get('sber-golf-cup');
 assert.equal(golf.client,'Sber Private Banking');
 assert.equal(golf.agencyUrl,'/agency/tvin');
 assert.equal(golf.agencyName,'TVIN');
 const shared=bySlug.get('case-enriched-122');
 assert.equal(shared.client,'Эвотор');
 assert.equal(shared.agencyUrl,'/agency/c4');
 assert.equal(shared.agencyName,agencies.find(agency=>agency.slug==='c4').name);
 assert.equal(projects.find(project=>project.slug==='sber-golf-cup').agencyName,undefined);
});

test('a missing agency credit never borrows the client name',()=>{
 const [project]=creditProjectsToAgencies([{slug:'missing',agencySlug:'gone',client:'Заказчик'}],agencies);
 assert.equal(project.agencyName,'не указана');
 assert.equal(project.client,'Заказчик');
});
