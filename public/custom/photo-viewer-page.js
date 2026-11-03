import {createPhotoViewer} from './photo-viewer.js';

// Direct project URLs use the catalog shell; share the same photo experience.
const page=document.querySelector('.case-page');
if(page){
  const pictures=[...page.querySelectorAll('.case-hero img,.case-gallery img')];
  const media=pictures.map(image=>({type:'image',src:image.getAttribute('src'),alt:image.alt,title:page.querySelector('h1')?.textContent}));
  const viewer=createPhotoViewer({media,rootRef:{current:page},onIndex:()=>{}});
  pictures.forEach((image,index)=>{
    let button=image.closest('a');
    if(!button){button=document.createElement('button');button.type='button';button.className='ea-case-photo';image.before(button);button.append(image);}
    button.classList.add('case-photo-depth');
    const ambient=document.createElement('span');ambient.className='case-photo-ambient';ambient.setAttribute('aria-hidden','true');
    const glow=image.cloneNode(false);glow.alt='';glow.removeAttribute('fetchpriority');glow.loading='lazy';glow.decoding='async';
    ambient.append(glow);button.append(ambient);
    button.dataset.mediaIndex=String(index);button.setAttribute('aria-label',`Открыть фото ${index+1} в полном размере`);
    button.addEventListener('click',event=>{if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();viewer.open(index,button);});
  });
  // Browser Back may restore this same document from the page cache.
  window.addEventListener('pagehide',()=>viewer.suspend());
}
