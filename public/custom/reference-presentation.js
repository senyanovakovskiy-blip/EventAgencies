import {escapeHtml as esc} from './work-presentation.js';
import {normalizeSearchText,searchTerms} from './catalog-search.js';

const detailFields=[['intro','Описание'],['fit','Если вам близко'],['participation','Участие команды']];
const publishedText=value=>typeof value==='string'&&value.trim()?value:'';
const detailsFor=work=>detailFields.map(([key,label])=>({label,text:publishedText(work?.presentation?.[key])})).filter(field=>field.text);

export function referencePresentationMarkup(work){
 const lead=publishedText(work?.presentation?.lead),details=detailsFor(work);
 return `<section class="reference-presentation"><h4>Описание работы</h4>${lead?`<p class="reference-presentation-lead">${esc(lead)}</p>`:''}${!lead&&!details.length?'<p class="reference-presentation-empty">Описание пока не опубликовано.</p>':''}${details.length?`<details class="reference-presentation-details"><summary>Об этой работе</summary><dl>${details.map(field=>`<div><dt>${esc(field.label)}</dt><dd>${esc(field.text)}</dd></div>`).join('')}</dl></details><div class="reference-presentation-match" hidden></div>`:''}</section>`;
}

export function syncReferencePresentationMatch(card,work,query,otherText){
 const host=card.querySelector('.reference-presentation-match');if(!host)return;
 const terms=card.hidden?[]:searchTerms(query);
 const outsideDetails=normalizeSearchText([otherText,publishedText(work?.presentation?.lead)].join(' '));
 // Terms may be supplied by metadata or personal notes. Only the remaining
 // terms need a public source; different terms can belong to different fields.
 const needed=terms.filter(term=>!outsideDetails.includes(term));
 const matches=needed.length?detailsFor(work).filter(field=>needed.some(term=>normalizeSearchText(field.text).includes(term))):[];
 host.hidden=!matches.length;
 host.replaceChildren(...matches.map(field=>{
  const source=host.ownerDocument.createElement('div'),label=host.ownerDocument.createElement('p'),text=host.ownerDocument.createElement('p');
  source.className='reference-presentation-source';label.className='reference-presentation-match-label';text.className='reference-presentation-match-text';
  label.textContent='Найдено в описании работы · '+field.label;text.textContent=field.text;
  source.append(label,text);return source;
 }));
}
