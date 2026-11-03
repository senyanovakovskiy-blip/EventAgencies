// Keep Motion Folio's navigation, clock and entrance choreography in one photographic space.
export function harmonizeExperience(code, file) {
 if(file !== 'Home-LrP0Tb4r.js') return code;
 const replace=(from,to)=>{if(!code.includes(from))throw new Error('Atmosphere anchor missing: '+from.slice(0,90));code=code.replaceAll(from,to);};
 const helpers=`function eaShowWork(index){const p=z1[index];if(!p)return;const detail={index,total:z1.length,title:p.reelTitle||p.title,agency:p.client,agencyUrl:p.agencyUrl,format:p.category,image:p.hasPhotos?(p.reelMobile||p.image):null};window.__eaCurrentWork=detail;window.dispatchEvent(new CustomEvent("ea:work",{detail}))}function EaWorkCaption(){const[p,set]=h.useState(()=>window.__eaCurrentWork||{index:0,total:z1.length,title:z1[0].title,agency:z1[0].client,agencyUrl:z1[0].agencyUrl,format:z1[0].category});h.useEffect(()=>{const update=e=>set(e.detail);window.addEventListener("ea:work",update);if(window.__eaCurrentWork)set(window.__eaCurrentWork);return()=>window.removeEventListener("ea:work",update)},[]);return t.jsxs("div",{className:"ea-work-caption",children:[t.jsx("span",{className:"ea-work-number",children:String(p.index+1).padStart(2,"0")+" / "+p.total}),t.jsxs("div",{className:"ea-work-caption-copy",children:[t.jsx("p",{children:p.format}),t.jsx("h2",{children:p.title}),t.jsx("a",{href:p.agencyUrl,children:p.agency+" ↗"})]})]})}`;
 replace('function P7(e){',helpers+'function P7(e){');
 replace('j1=w,eaLastFeatured=z1[w].slug,', 'j1=w,eaLastFeatured=z1[w].slug,eaShowWork(w),');
 replace('function r2(w){j1=w,', 'function r2(w){eaShowWork(w);j1=w,');
 replace('t.jsxs("div",{className:"ea-reel-controls",children:[', 't.jsxs("div",{className:"ea-reel-controls",children:[t.jsx(EaWorkCaption,{}),');
 // Lay out an actual picture frame, preserving the image's proportions at every animation size.
 const start=code.indexOf('function _1(w,Q,a1,m1,S1,h1=1){'),end=code.indexOf('const H1=',start);
 if(start<0||end<0)throw new Error('Photograph frame missing');
 code=code.slice(0,start)+`function _1(w,Q,a1,m1,S1,h1=1){w.style.width=a1+"px";w.style.height=m1+"px";w.style.left="50%";w.style.top="50%";w.style.right="auto";w.style.bottom="auto";w.style.transform="translate(-50%,-50%) translateY("+S1+"px)";Q.parentElement.style.transform="none";Q.style.transform="none";Q.style.objectFit="contain"}`+code.slice(end);
 replace('Ye=.5,Ue=1.16', 'Ye=0,Ue=1');
 // Route metadata also changes the atmosphere for directly opened works and internal transitions.
 replace('function Ga(e){document.title=e.title;', 'function Ga(e){window.dispatchEvent(new CustomEvent("ea:route",{detail:{path:e.path,image:e.ogImage}}));document.title=e.title;');
 replace('style:e.image?d4(e.heroFit):{"--hero-fallback":e.gradient}', 'style:e.image?{...d4(e.heroFit),"--ea-ratio":e.imageRatio||1.5}:{"--hero-fallback":e.gradient}');
 replace('className:"project-info-card","data-theme":l,', 'className:"project-info-card",');
 return code;
}
