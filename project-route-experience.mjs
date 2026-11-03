export function projectRouteExperience(code, file) {
  if (file !== 'Home-LrP0Tb4r.js') return code;
  function replace(from, to) {
    if (!code.includes(from)) throw Error('Project transition anchor missing: ' + from.slice(0, 100));
    code = code.replace(from, to);
  }
  function region(from, until, replacement) {
    const start = code.indexOf(from), end = code.indexOf(until, start);
    if (start < 0 || end < 0) throw Error('Project transition region missing: ' + from);
    code = code.slice(0, start) + replacement + code.slice(end);
  }
  replace('E1(),g.current=0,u.current=!0,A(!0),!0)', 'E1(),g.current=$(),u.current=!0,A(!0),!0)');
  region('r2=h.useCallback(L=>{const H=()=>{u.current=!1,A(!1)}', 'S2=h.useCallback', `r2=h.useCallback(L=>{const root=n.current;rememberHomePosition();const image=homePhoto();transitionProject({root,source:image,destination:()=>root.querySelector(".pm-hero img"),commit:()=>{m2.flushSync(()=>{S(L),N(!1)});u1()}}).finally(()=>{u.current=false;A(false);requestAnimationFrame(()=>document.querySelector('[aria-label="Закрыть проект"]')?.focus({preventScroll:true}))})},[]),`);
  region('a2=h.useCallback(()=>{var R1;', 'p2=()=>', `a2=h.useCallback(()=>{if(!x||u.current)return;y2.current++;E1();u.current=true;A(true);const root=n.current,project=x,index=eaFeatured.findIndex(p=>p.slug===project);if(index>=0){eaLastFeatured=project;eaShowWork(index)}const image=root.querySelector(".pm-hero img");root.querySelectorAll("video").forEach(video=>video.pause());transitionProject({root,source:image,returningSlug:index>=0?project:eaLastFeatured,destination:homePhoto,commit:()=>{m2.flushSync(()=>{S(null);O(null);N(false)});u1()},afterLayout:restoreHomePosition}).finally(()=>{u.current=false;A(false);requestAnimationFrame(()=>document.querySelector('.ea-reel-controls>button:nth-last-child(2)')?.focus({preventScroll:true}))})},[x]),`);
  replace('h.useEffect(()=>{const L=()=>{y2.current++;const H=e3(window.location.pathname)', 'h.useEffect(()=>{const L=()=>{if(deferProjectHistory())return;y2.current++;const H=e3(window.location.pathname)');
  replace('const image=root.querySelector(".pm-hero img");root.querySelectorAll("video")', 'const image=root.querySelector(".pm-hero .ea-photo-preview")||root.querySelector(".pm-hero img");root.querySelectorAll("video")');
  replace('if(H.slug===x){E!=="work"&&_("work");return}u.current||', 'if(H.slug===x){E!=="work"&&_("work");return}if(E==="work"&&!x){if(Y2(H.slug))r2(H.slug);return}u.current||');
  return 'import {transitionProject,homePhoto,rememberHomePosition,restoreHomePosition,deferProjectHistory} from "/custom/project-transition.js";\n' + code;
}
