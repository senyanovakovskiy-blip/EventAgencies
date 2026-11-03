// Enhancements shared by static catalogue routes and the retained React template.
function imageUnavailable(img){
 const frame=img.closest('.work-cover');if(!frame||img.closest('[aria-hidden="true"]'))return;
 const label=document.createElement('span');label.className='image-unavailable';label.textContent='Фотография недоступна';
 img.remove();frame.classList.add('is-empty');frame.prepend(label);
}
document.addEventListener('error',event=>{if(event.target instanceof HTMLImageElement)imageUnavailable(event.target);},true);
function enrich(root){
 for(const img of root.querySelectorAll('img'))if(img.complete&&img.getAttribute('src')&&!img.naturalWidth)imageUnavailable(img);
}
enrich(document);
new MutationObserver(changes=>{for(const change of changes)for(const n of change.addedNodes)if(n.nodeType===1)enrich(n);}).observe(document.getElementById('root')||document.getElementById('content'),{childList:true,subtree:true});

