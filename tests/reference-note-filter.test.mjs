import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {hasScopedReferenceNote,referenceNoteLabels} from '../public/custom/reference-note-model.js';

const catalog=JSON.parse(fs.readFileSync(new URL('../content/catalog.json',import.meta.url),'utf8'));

test('notes filter follows the selected agency on a shared work',()=>{
 const work=catalog.projects.find(project=>project.slug==='case-round2-88');
 assert.deepEqual(work.agencySlugs,['c4','c4-group']);
 const notes=[
  {agencySlug:'c4',note:'   '},
  {agencySlug:'c4-group',note:'Нравится формат обсуждения'}
 ];
 assert.equal(hasScopedReferenceNote(notes,'c4'),false);
 assert.equal(hasScopedReferenceNote(notes,'c4-group'),true);
 assert.equal(hasScopedReferenceNote(notes,''),true);
});

test('empty notes do not pass either filter',()=>{
 const notes=[{agencySlug:'c4',note:''},{agencySlug:'c4-group',note:'  '}];
 assert.equal(hasScopedReferenceNote(notes,''),false);
 assert.equal(hasScopedReferenceNote(notes,'c4-group'),false);
});

test('shared work names the primary team in its note, single work keeps the short label',()=>{
 const shared=catalog.projects.find(project=>project.slug==='case-round2-88');
 const primary=referenceNoteLabels({isPrimary:true,agencyName:'C4'},shared);
 assert.equal(primary.label,'Моя заметка · C4');
 assert.match(primary.context,/команды «C4»/);
 const secondary=referenceNoteLabels({isPrimary:false,agencyName:'C4 Group'},shared);
 assert.equal(secondary.label,'Моя заметка · C4 Group');
 const single=catalog.projects.find(project=>project.slug==='positive-hack-days');
 assert.equal(referenceNoteLabels({isPrimary:true,agencyName:'ARS COM'},single).label,'Моя заметка к примеру');
});
