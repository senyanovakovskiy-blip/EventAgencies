const normalize=value=>String(value??'').normalize('NFKC').toLocaleLowerCase('ru').replace(/ё/g,'е');
const highSurrogate=unit=>unit>=0xd800&&unit<=0xdbff;
const lowSurrogate=unit=>unit>=0xdc00&&unit<=0xdfff;
const segmenter=typeof Intl!=='undefined'&&typeof Intl.Segmenter==='function'?new Intl.Segmenter('ru',{granularity:'grapheme'}):null;

function sourceSegments(value,segmenter){
 if(segmenter)return [...segmenter.segment(value)].map(item=>({text:item.segment,start:item.index,end:item.index+item.segment.length}));
 let offset=0;
 return Array.from(value,point=>{const start=offset;offset+=point.length;return {text:point,start,end:offset};});
}

function mappedText(value,segmenter){
 const segments=sourceSegments(value,segmenter);
 let canonical='',ranges=[];
 for(const segment of segments){
  const piece=segment.text.normalize('NFKC');canonical+=piece;
  for(let index=0;index<piece.length;index++)ranges.push({start:segment.start,end:segment.end});
 }
 const whole=value.normalize('NFKC');
 if(canonical!==whole){
  // A code-point fallback can split a combining sequence; map its changed tail together.
  let prefix='',previous='';ranges=[];
  for(const segment of segments){
   prefix+=segment.text;
   const next=prefix.normalize('NFKC');
   let common=0;while(common<previous.length&&common<next.length&&previous[common]===next[common])common++;
   if(common>0&&((highSurrogate(previous.charCodeAt(common-1))&&lowSurrogate(previous.charCodeAt(common)))||(highSurrogate(next.charCodeAt(common-1))&&lowSurrogate(next.charCodeAt(common)))))common--;
   const start=Math.min(ranges[common]?.start??segment.start,segment.start);
   ranges.length=common;
   for(let index=common;index<next.length;index++)ranges.push({start,end:segment.end});
   previous=next;
  }
  canonical=whole;
 }
 // Lower the complete text for context-sensitive casing, retaining each unit's source span.
 const foldedRanges=[];
 let offset=0;
 for(const point of canonical){
  const range={start:ranges[offset].start,end:ranges[offset+point.length-1].end};
  const folded=point.toLocaleLowerCase('ru');
  for(let index=0;index<folded.length;index++)foldedRanges.push(range);
  offset+=point.length;
 }
 return {text:canonical.toLocaleLowerCase('ru').replace(/ё/g,'е'),ranges:foldedRanges,segments};
}

function snippetAround(value,segments,start,end,limit){
 const requested=Number(limit),length=Number.isFinite(requested)&&requested>0?Math.max(1,Math.floor(requested)):180;
 const width=Math.max(length,end-start);
 let left=Math.max(0,start-Math.floor((width-(end-start))/2)),right=Math.min(value.length,left+width);
 if(right-left<width)left=Math.max(0,right-width);
 const first=segments.find(segment=>segment.end>left),last=segments.find(segment=>segment.end>=right);
 left=first?.start??0;right=last?.end??value.length;
 return (left>0?'…':'')+value.slice(left,right)+(right<value.length?'…':'');
}

/** Find the most relevant note and return original-text ranges, never markup. */
export function findReferenceNoteMatch(notes,query,{limit=180}={}){
 const terms=[...new Set(normalize(query).trim().split(/\s+/).filter(Boolean))];
 if(!terms.length||!Array.isArray(notes))return null;
 let best=null,matchingNotes=0;
 for(const item of notes){
  if(typeof item?.note!=='string'||!item.note)continue;
  const normalized=normalize(item.note),matchedTerms=[];
  let first=-1,firstLength=0;
  for(const term of terms){
   const index=normalized.indexOf(term);if(index<0)continue;
   matchedTerms.push(term);
   if(first<0||index<first||(index===first&&term.length>firstLength)){first=index;firstLength=term.length;}
  }
  if(!matchedTerms.length)continue;
  matchingNotes++;
  if(best&&best.matchedTerms.length>=matchedTerms.length)continue;
  const mapped=mappedText(item.note,segmenter);
  const start=mapped.ranges[first].start,end=mapped.ranges[first+firstLength-1].end;
  best={key:item.key,agencyName:item.agencyName,snippet:snippetAround(item.note,mapped.segments,start,end,limit),start,end,matchedTerms};
 }
 return best?{...best,matchingNotes}:null;
}
