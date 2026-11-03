// Retain the template's own scrolling physics and changing photo sizes.
export function entranceExperience(code, file) {
  const replace = (from, to) => {
    if (!code.includes(from)) throw Error('Home entrance anchor missing: ' + from.slice(0, 90));
    code = code.replace(from, to);
  };
  // Preserve the original animated title loader and screen reveal.
  if (file === 'index-CF3Ad5Zo.js') return code;
  if (file !== 'Home-LrP0Tb4r.js') return code;
  replace('function za(e,a){', 'function eaOriginalPhotoReel(e,a){');
  // Undo the later suppression of the template's overview while scrolling.
  replace('if(true){w1=M.pos;return}', 'if(!C1||s1!=="rest"||t1()){w1=M.pos;return}');
  // Restoring a saved frame is not a new scroll gesture.
  replace('r2(M.pos),c.style.display="block"', 'r2(M.pos),w1=M.pos,c.style.display="block"');
  replace('M.pos=M.target=Q,M.vel=0,M.textIn=0', 'M.pos=M.target=Q,w1=Q,M.vel=0,M.textIn=0');
  // The shared project transition and decoded entrance now own route effects.
  const openStart = code.indexOf('const R1=()=>{if(H||!F1()');
  const openEnd = code.indexOf('e.addEventListener("wheel",i1', openStart);
  if (openStart < 0 || openEnd < 0) throw Error('Native reel open handler missing');
  code = code.slice(0, openStart) + 'const R1=()=>{if(H||!F1()||Math.abs(M.target-M.pos)>.01)return;const w=Re(Math.round(M.pos),s),Q=z1[w].slug;a.current.onOpenStart(Q)&&(s1="busy",p2(null),a.current.onOpenDone(Q))};' + code.slice(openEnd);
  replace('if(t1()||p3||!window.__eaShowIntro){V2();return}', 'if(true){V2();return}');
  replace('open:R1,setActive:Q1,enterAt:g1,', 'open:R1,resize:b1,setActive:Q1,enterAt:g1,');
  // Flowing mobile pages should not recenter the photo against the fixed menu.
  replace('l2=I1&&I1.top>i2.top&&I1.top<i2.bottom?Math.round((I1.top-i2.top-Q)/2):0', 'l2=0');
  replace('const a1=M.target-M.pos;if(Math.abs(a1)<5e-4', 'if(t1()){M.pos=M.target=Math.round(M.target);M.vel=0;N1();return}const a1=M.target-M.pos;if(Math.abs(a1)<5e-4');
  replace('width:C.imageWidth||1500,height:C.imageHeight||1000,src:C===z1[0]?', 'width:C.imageWidth||1500,height:C.imageHeight||1000,fetchPriority:C===z1[0]?"high":"auto",src:C===z1[0]?');
  return 'import {connectNativePhotoReel} from "/custom/native-photo-reel.js";\nfunction za(e,a){return connectNativePhotoReel(e,a,eaOriginalPhotoReel,{projects:eaFeatured,initialSlug:eaLastFeatured})}\n' + code;
}
