export function setupProjectSections(){
 const nav=document.querySelector('.project-section-nav');if(!nav)return;
 const links=[...nav.querySelectorAll('a[href^="#"]')];
 const sections=links.map(link=>document.querySelector(link.getAttribute('href')));
 let scheduled=false;
 function update(){
  scheduled=false;
  const edge=Math.max(110,nav.getBoundingClientRect().bottom+28);
  let active=0;
  sections.forEach((section,index)=>{if(section&&section.getBoundingClientRect().top<=edge)active=index;});
  links.forEach((link,index)=>{if(index===active)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');});
 }
 function schedule(){if(!scheduled){scheduled=true;requestAnimationFrame(update);}}
 addEventListener('scroll',schedule,{passive:true});addEventListener('resize',schedule);
 nav.addEventListener('click',event=>{
  const link=event.target.closest('a[href^="#"]');if(!link||event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
  document.querySelector(link.getAttribute('href'))?.focus({preventScroll:true});
 });
 if(typeof ResizeObserver==='function')new ResizeObserver(schedule).observe(document.querySelector('.my-project'));
 schedule();
}
