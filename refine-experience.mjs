// Focus the retained Motion Folio interface on choosing an event agency.
export function refineExperience(code,file,{site}){
 const replace=(from,to)=>{if(!code.includes(from))throw new Error('Experience anchor missing: '+from.slice(0,100));code=code.replaceAll(from,to);};
 if(file==='index-CF3Ad5Zo.js'){
  const start=code.indexOf('function Tw(){'),end=code.indexOf('const Cw=',start);
  if(start<0||end<0)throw new Error('Entrance component missing');
  // Restore the template's animated loader and pixel reveal on the first visit.
  code=code.slice(0,start)+`function Tw(){const[t,e]=ge.useState(Boolean(window.__eaShowIntro)),[r,i]=ge.useState(!window.__eaShowIntro),n=ge.useRef(null);ge.useEffect(()=>t?tv("loader","#070707"):void 0,[t]);const o=ge.useCallback(()=>{Pw.then(()=>{var u;return(u=n.current)==null?void 0:u.play({variant:"intro",revealAt:.8,onReveal:()=>i(!0),onDone:()=>e(!1)})})},[]);return Ae.jsxs(Ae.Fragment,{children:[Ae.jsxs(ge.Suspense,{fallback:null,children:[Ae.jsx(Sw,{clockActive:r,interactive:!t}),Ae.jsx(Ew,{})]}),Ae.jsx(K2,{}),t&&Ae.jsx(W2,{onComplete:o}),Ae.jsx(ov,{ref:n}),Ae.jsx(q2,{})]})}`+code.slice(end);
  const soundStart=code.indexOf('function Aw({children:t})'),soundEnd=code.indexOf('function Iw()',soundStart);
  if(soundStart<0||soundEnd<0)throw new Error('Sound provider missing');
  // Keep the soundtrack switch; create and load audio only when it is enabled.
  code=code.slice(0,soundStart)+`function Aw({children:t}){const audio=ge.useRef(null),enabled=ge.useRef(false),suspended=ge.useRef(false),[soundEnabled,setEnabled]=ge.useState(false);const setSoundEnabled=ge.useCallback(value=>{enabled.current=value;setEnabled(value);if(value&&!audio.current){const track=new Audio(Cw);track.loop=true;track.preload="none";track.volume=.9;audio.current=track}const track=audio.current;if(track){if(value&&!suspended.current)track.play().catch(()=>{});else track.pause()}},[]);const setSoundtrackSuspended=ge.useCallback(value=>{suspended.current=value;const track=audio.current;if(track){if(!value&&enabled.current)track.play().catch(()=>{});else track.pause()}},[]);ge.useEffect(()=>{document.documentElement.dataset.sound=soundEnabled?"on":"off"},[soundEnabled]);ge.useEffect(()=>()=>{const track=audio.current;if(track){track.pause();track.removeAttribute("src");track.load();audio.current=null}},[]);const value=ge.useMemo(()=>({soundEnabled,setSoundEnabled,setSoundtrackSuspended,toggleSound:()=>setSoundEnabled(!enabled.current)}),[soundEnabled,setSoundEnabled,setSoundtrackSuspended]);return Ae.jsx(fv.Provider,{value,children:t})}`+code.slice(soundEnd);
  return code;
 }
 if(file!=='Home-LrP0Tb4r.js')return code;
 // Reading should not wait for a word-by-word reveal on every page.
 replace('function Y1({text:e,play:a,instant:s=!1,delay:n=0,tone:r="title",className:o="",onDone:l}){const i=', 'function Y1({text:e,play:a,instant:s=!1,delay:n=0,tone:r="title",className:o="",onDone:l}){s=true;const i=');
 replace('c.forEach(v=>v.classList.add("is-solid"));return}if(j.set(c,{"--lit":0})', 'c.forEach(v=>v.classList.add("is-solid"));l==null||l();return}if(j.set(c,{"--lit":0})');
 const featured='const eaFeatured=z1;let eaLastFeatured=eaFeatured[0]?.slug;';
 replace('function P7(e){',featured+'function P7(e){');
 replace('onOpenDone:o,onFocus:l},i){var p;','onOpenDone:o,onFocus:l},i){const z1=eaFeatured;var p;');
 replace('function za(e,a){const s=z1.length','function za(e,a){const z1=eaFeatured;const s=z1.length');
 replace('ja=[-3,-2,-1,1,2,3]','ja=[]');
 replace('srcOf:Ja,onOpenStart:Y2','srcOf:(L,H)=>H==="mobile"?L.reelMobile||L.image:L.reelImage||L.image,onOpenStart:Y2');
 replace('src:n(C,"desktop"),"data-src-mobile":','src:C===z1[0]?n(C,window.innerWidth<=600?"mobile":"desktop"):void 0,"data-src-desktop":n(C,"desktop"),"data-src-mobile":');
 replace('src:n(z1[0],"desktop"),decoding:"sync"','src:n(z1[0],window.innerWidth<=600?"mobile":"desktop"),decoding:"async"');
 replace('S=d.map(w=>w.img.getAttribute("src")??"")','S=d.map(w=>w.img.dataset.srcDesktop||w.img.getAttribute("src")||"")');
 replace('w.img.getAttribute("src")!==B[Q]&&(w.img.src=B[Q])','w.img.hasAttribute("src")&&w.img.getAttribute("src")!==B[Q]&&(w.img.src=B[Q])');
 replace('d.forEach(w=>{w.img.decode().catch(()=>{})})','d.filter(w=>w.img.hasAttribute("src")).forEach(w=>{w.img.decode().catch(()=>{})})');
 replace('P&&(_1(n1.s.el,n1.s.img,','P&&(Math.abs(n1.d)<=1.15&&n1.s.img.getAttribute("src")!==B[n1.j]&&(n1.s.img.src=B[n1.j]),_1(n1.s.el,n1.s.img,');
 // Keep the first-entry photo reveal, with three large frames instead of a tiny full-catalog montage.
 replace('if(t1()||p3){V2();return}','if(t1()||p3||!window.__eaShowIntro){V2();return}');
 replace('s1="intro",c1=!0,p3=!0;', 's1="intro",e.classList.add("is-intro"),c1=!0,p3=!0;');
 replace('function A2(){var w,Q;s1="rest",', 'function A2(){var w,Q;e.classList.remove("is-intro");s1="rest",');
 replace('for(let q=1;q<=s;q++)Q.push(q%s);','for(const q of [2,1,0])Q.push(q%s);');
 replace('W0=[.12,.16]','W0=[.4,.4]');
 replace('$.tw=Ne.w*S1,$.th=Ne.h*S1', '$.tw=Math.min(w-2*m1,.76*w),$.th=Math.min(.68*Q,Math.min(w-2*m1,.76*w)*1.1)');
 replace('$.bw=re.w*S1,$.bh=re.h*S1', '$.bw=Math.min(w-2*m1,.86*w),$.bh=Math.min(.78*Q,Math.min(w-2*m1,.86*w)*(re.h/re.w))');
 replace('w.call(()=>{W(Q.length?1%s:0),l.el.style.visibility="visible"}', 'w.call(()=>{W(Q[0]??0),l.el.style.visibility="visible"}');
 replace('h1+=.55;const K1=Y0+Ea','h1+=.15;const K1=Y0+Ea');
 replace('function V2(){S2(),c.style.display="block"','function V2(){S2(),M.pos=M.target=Math.max(0,z1.findIndex(p=>p.slug===eaLastFeatured)),r2(M.pos),c.style.display="block"');
 replace('j1=w,o2(b,f,U0(w),Q)','j1=w,eaLastFeatured=z1[w].slug,o2(b,f,U0(w),Q)');
 replace('t.jsx(Za,{ref:d,active:','E==="work"&&!x&&t.jsx(Za,{ref:d,active:');
 replace(',{id:"reallife",label:"Впечатления"},{id:"playground",label:"Атмосфера"}', '');
 // Keep photographs large even while scrolling between projects.
 replace('if(!C1||s1!=="rest"||t1()){w1=M.pos;return}','if(true){w1=M.pos;return}');
 replace('return e1(),O.addEventListener("change",e1),S2(),{setActive:Q1,enterAt:g1,','return e1(),O.addEventListener("change",e1),S2(),{step:direction=>{if(F1())X(direction,true)},open:R1,setActive:Q1,enterAt:g1,');
 replace('h.useImperativeHandle(i,()=>({enterAt:C=>','h.useImperativeHandle(i,()=>({next:()=>d.current?.step(1),prev:()=>d.current?.step(-1),open:()=>d.current?.open(),enterAt:C=>');
 replace('children:z1.map(L=>t.jsx("li"','children:eaFeatured.map(L=>t.jsx("li"');
 replace('className:`home${F1?', 'className:`home${E==="work"&&!x?" is-landing":""}${F1?');
 const intro=site.home;
 const js=v=>JSON.stringify(v);
 replace('t.jsx(W3,{active:e})',`t.jsxs("div",{className:"ea-clock-home",children:[t.jsx("div",{className:"ea-clock-face",children:t.jsx(W3,{active:e})}),t.jsxs("div",{className:"ea-home-intro",children:[t.jsx("h1",{children:${js(intro.title)}}),t.jsx("p",{className:"ea-home-copy",children:${js(intro.copy)}}),t.jsx("a",{className:"ea-home-cta",href:"/catalog",children:${js(intro.cta)}}),t.jsx("a",{className:"ea-home-guide",href:"/about",children:"Как сравнивать агентства ↗"})]})]})`);
 const reel='srcOf:(L,H)=>H==="mobile"?L.reelMobile||L.image:L.reelImage||L.image,onOpenStart:Y2,onOpenDone:r2,onFocus:Ya})';
 replace(reel,reel+`,E==="work"&&!x&&t.jsxs("div",{className:"ea-reel-controls",children:[t.jsx("button",{type:"button","aria-label":"Предыдущий проект",onClick:()=>d.current?.prev(),children:"↑"}),t.jsx("button",{type:"button",onClick:()=>d.current?.open(),children:"Открыть проект ↗"}),t.jsx("button",{type:"button","aria-label":"Следующий проект",onClick:()=>d.current?.next(),children:"↓"})]}),E==="work"&&!x&&t.jsxs("div",{className:"ea-mobile-intro",children:[t.jsx("p",{children:"Выбирайте агентство по его работам."}),t.jsx("a",{href:"/catalog",children:"Все компании ↗"})]})`);
 replace('[["Когда",e.eventDate??e.year],["Формат",e.category],["Команда",e.client??"Не указано"],["Место",e.industry??e.category]]','[["Когда",e.eventDate??e.year],["Формат",e.format||e.category],["Команда",e.client],["Место",e.industry]].filter(([,value])=>value&&!/не указан|^—$/i.test(value))');
 for(const [from,to] of Object.entries({'Проекты':'Главная','О проекте':'Как выбрать','Команды в подборке':'Примеры агентств','Продолжить':'Начать подбор','Первоисточники':'Сайты агентств'}))code=code.replaceAll(JSON.stringify(from),JSON.stringify(to));
 return code;
}
