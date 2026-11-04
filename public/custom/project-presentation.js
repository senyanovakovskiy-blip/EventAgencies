const publicText=value=>typeof value==='string'?value:'';

/**
 * Public editorial context from a current selectionView(data, selection) result.
 * title names the work for scope "work", or the agency for scope "agency".
 * Empty strings need an explicit UI empty state, never a raw-description fallback.
 * This view does not infer client wishes or write any text into the project.
 */
export function projectPresentation({s,a,p}){
 if(!a||a.slug!==s.agencySlug)return {scope:'unavailable',title:'',lead:'',fit:'',participation:''};
 const work=p&&p.slug===s.workSlug&&(p.agencySlug===a.slug||p.agencySlugs?.includes(a.slug))?p:null;
 const entry=work||a;
 return {
  scope:work?'work':'agency',
  title:publicText(work?work.fullTitle:a.name),
  lead:publicText(entry.presentation?.lead),
  fit:publicText(entry.presentation?.fit),
  participation:work?publicText(work.presentation?.participation):''
 };
}
