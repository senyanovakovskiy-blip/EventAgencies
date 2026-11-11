export function polishExperience(code,file,media){
 if(file!=='Home-LrP0Tb4r.js')return code;
 const replace=(from,to)=>{if(!code.includes(from))throw Error('Visual anchor missing: '+from.slice(0,90));code=code.replaceAll(from,to);};
 const manifest=JSON.stringify(media).replaceAll('<','\\u003c');
 replace('function H4({path:e,alt:a,eager:s}){',`const eaMedia=${manifest};function H4({path:e,alt:a,eager:s}){const meta=eaMedia[e];if(meta)return t.jsx("img",{src:meta.src,srcSet:meta.srcset,sizes:"(max-width:900px) 100vw, 65vw",width:meta.width,height:meta.height,alt:a,draggable:!1,decoding:"async",loading:s?"eager":"lazy",fetchPriority:s?"high":"auto"});`);
 replace('const i=at[e],c=g4();if(!i&&!c)return null;','const i=at[e],c=g4(),meta=eaMedia[e];if(meta)return t.jsx("img",{src:meta.src,srcSet:meta.srcset,sizes:s,width:meta.width,height:meta.height,alt:a,className:n,draggable:r,loading:o?"eager":"lazy",decoding:"async",...l});if(!i&&!c)return null;');
 replace('alt:"",src:C===z1[0]?', 'alt:C.title,width:C.imageWidth||1500,height:C.imageHeight||1000,src:C===z1[0]?');
 replace('alt:"",src:n(z1[0],window.innerWidth', 'alt:z1[0].title,width:z1[0].imageWidth||1500,height:z1[0].imageHeight||1000,src:n(z1[0],window.innerWidth');
 replace('["Команда",e.client]', '["Команда",e.agencyName]');
 replace('children:"Все работы "+e.client+" ↗"', 'children:"Все работы "+e.agencyName+" ↗"');
 replace('className:"pm",ref:c,children:[','className:"pm",ref:c,children:[t.jsxs("header",{className:"ea-case-mobile-head",children:[t.jsx("a",{href:e.agencyUrl,children:"Команда — "+e.agencyName+" ↗"}),t.jsx("h1",{children:e.fullTitle||e.title}),t.jsx("p",{children:[e.format||e.category,e.eventCity,e.eventDate||e.year].filter(v=>v&&v!=="—").join(" · ")}),t.jsx("button",{type:"button",className:"ea-save-button","data-save-agency":e.agencySlug,"data-save-work":e.slug,children:"В мой проект"})]}),');
 replace('t.jsx(EaOccasionPicker,{})','t.jsx("a",{className:"ea-help-link",href:"/my-project?help=1",children:"Помогите подобрать агентство"}),t.jsx(EaOccasionPicker,{})');
 return code;
}
