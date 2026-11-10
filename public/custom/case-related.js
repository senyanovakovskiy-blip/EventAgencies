const occasionLabels={btl:'промо-событие',business:'деловое событие',conference:'конференция',corporate:'корпоратив',culture:'культурное событие',online:'онлайн-событие',presentation:'презентация',private:'частное событие',public:'публичное событие',sport:'спортивное событие',teambuilding:'тимбилдинг'};
const slug=decodeURIComponent(location.pathname.split('/').filter(Boolean).at(-1)||'');
const main=document.querySelector('.case-page');
const agenciesFor=work=>[...new Set([...(Array.isArray(work.agencySlugs)?work.agencySlugs:[]),work.agencySlug].filter(value=>typeof value==='string'&&/^[a-z0-9-]+$/i.test(value)))];
const summaryFor=work=>[work.presentation?.intro,work.presentation?.fit,work.summary].find(value=>typeof value==='string'&&value.trim())?.trim()||'Подробности и состав работ можно обсудить с агентством.';
const titleFor=work=>work.fullTitle||work.title||'Работа агентства';
function similarity(current,candidate,types){
 const occasions=(candidate.occasions||[]).filter(value=>(current.occasions||[]).includes(value));
 const sharedTypes=(candidate.types||[]).filter(value=>(current.types||[]).includes(value));
 if(!occasions.length&&!sharedTypes.length)return null;
 const labels=occasions.map(value=>occasionLabels[value]||value);
 const typeLabels=sharedTypes.map(value=>types[value]||value);
 return {score:occasions.length*4+sharedTypes.length,reason:occasions.length?'Тот же формат: '+labels.join(', '):'Общее направление: '+typeLabels.join(', ')};
}
function createCard(work,agencies,reason){
 const article=document.createElement('article');article.className='related-work-card';
 const slugValue=encodeURIComponent(work.slug),cover=document.createElement('a');cover.className='related-work-cover';cover.href='/work/'+slugValue;cover.setAttribute('data-project-link','');cover.setAttribute('aria-label','Открыть работу «'+titleFor(work)+'»');
 const image=work.preview||work.reelMobile||work.image,teamNames=agencies.map(agency=>agency.name).join(', ');
 if(work.hasPhotos&&typeof image==='string'&&image.startsWith('/')&&!image.startsWith('//')){const img=document.createElement('img');img.src=image;if(typeof work.previewSrcSet==='string'&&work.previewSrcSet) {img.srcset=work.previewSrcSet;img.sizes='(max-width:560px) calc(100vw - 80px), (max-width:900px) calc((100vw - 114px) / 2), (max-width:1500px) calc((100vw - 152px) / 3), 460px';}if(Number.isFinite(Number(work.imageWidth))&&Number(work.imageWidth)>0)img.width=Number(work.imageWidth);if(Number.isFinite(Number(work.imageHeight))&&Number(work.imageHeight)>0)img.height=Number(work.imageHeight);img.alt=titleFor(work)+' · '+teamNames;img.loading='lazy';img.decoding='async';cover.append(img);}else{cover.classList.add('is-empty');const empty=document.createElement('span');empty.textContent='Фотографии пока не добавлены';cover.append(empty);}
 article.append(cover);
 const meta=document.createElement('p');meta.className='related-work-meta';meta.textContent=[reason,work.year].filter(Boolean).join(' · ');article.append(meta);
 const teams=document.createElement('div');teams.className='related-work-teams';
 for(const agency of agencies){const team=document.createElement('a');team.href='/agency/'+encodeURIComponent(agency.slug);team.textContent=agency.name+' ↗';teams.append(team);}
 article.append(teams);
 const heading=document.createElement('h3'),link=document.createElement('a');link.href='/work/'+slugValue;link.setAttribute('data-project-link','');link.textContent=titleFor(work);heading.append(link);article.append(heading);
 const summary=document.createElement('p');summary.className='related-work-summary';summary.textContent=summaryFor(work);article.append(summary);
 const participation=work.presentation?.participation;
 if(typeof participation==='string'&&participation.trim()){const role=document.createElement('div');role.className='related-work-participation';const label=document.createElement('span');label.textContent='Участие команды';const detail=document.createElement('p');detail.textContent=participation.trim();role.append(label,detail);article.append(role);}
 const actions=document.createElement('div');actions.className='related-work-actions';
 const reference=document.createElement('button');reference.type='button';reference.className='reference-button';reference.dataset.referenceWork=work.slug;reference.setAttribute('aria-pressed','false');reference.textContent='Сохранить как пример';actions.append(reference);
 for(const agency of agencies){const action=document.createElement('button');action.type='button';action.className='related-work-select';action.dataset.agencyLabel='true';action.dataset.agencyName=agency.name;action.dataset.saveAgency=agency.slug;action.dataset.saveWork=work.slug;action.textContent='Добавить эту команду';actions.append(action);}
 article.append(actions);
 return article;
}
async function addRelatedWorks(){
 if(!main||!slug)return;
 const response=await fetch('/custom/catalog-data.json',{credentials:'same-origin'});
 if(!response.ok)return;
 const data=await response.json(),current=data.projects?.find(work=>work.slug===slug);
 if(!current)return;
 const currentAgencies=new Set(agenciesFor(current));
 let related=(data.projects||[]).filter(work=>work.slug!==slug&&!work.duplicateOf).map(work=>{
  const fit=similarity(current,work,data.types||{}),agencies=agenciesFor(work).map(agencySlug=>data.agencies?.find(value=>value.slug===agencySlug)).filter(Boolean);
  return fit&&agencies.length?{work,agencies,fit,diverse:agencies.some(agency=>!currentAgencies.has(agency.slug))}:null;
 }).filter(Boolean).sort((a,b)=>b.fit.score-a.fit.score||Number(b.diverse)-Number(a.diverse)||Number(Boolean(b.work.hasPhotos))-Number(Boolean(a.work.hasPhotos))||titleFor(a.work).localeCompare(titleFor(b.work),'ru')).slice(0,3);
 let portfolioFallback=false;
 if(!related.length){
  portfolioFallback=true;
  related=(data.projects||[]).filter(work=>work.slug!==slug&&!work.duplicateOf).map(work=>{
   const agencies=agenciesFor(work).map(agencySlug=>data.agencies?.find(value=>value.slug===agencySlug)).filter(Boolean);
   return agencies.some(agency=>currentAgencies.has(agency.slug))?{work,agencies,fit:{reason:currentAgencies.size>1?'Из портфолио одной из команд':'Из портфолио этой команды'}}:null;
  }).filter(Boolean).sort((a,b)=>Number(Boolean(b.work.hasPhotos))-Number(Boolean(a.work.hasPhotos))||String(b.work.year||'').localeCompare(String(a.work.year||''),'ru',{numeric:true})||titleFor(a.work).localeCompare(titleFor(b.work),'ru')).slice(0,3);
 }
 if(!related.length)return;
 const section=document.createElement('section');section.className='related-works';section.setAttribute('aria-labelledby','related-works-title');
 const heading=document.createElement('div');heading.className='related-works-heading';
 const title=document.createElement('h2');title.id='related-works-title';title.textContent=portfolioFallback?'Ещё из портфолио':'Похожие работы для сравнения';heading.append(title);
 const note=document.createElement('p');note.textContent=portfolioFallback?'У этой работы нет других записей с общими метками в каталоге. Здесь показаны опубликованные работы агентств, указанных у этого проекта; это портфолио для просмотра, а не утверждение, что проекты похожи.':'Подборка основана на общих отметках формата или направления в каталоге; это подсказка для просмотра, а не гарантия одинакового результата.';heading.append(note);section.append(heading);
 const grid=document.createElement('div');grid.className='related-work-grid';
 for(const item of related)grid.append(createCard(item.work,item.agencies,item.fit.reason));
 section.append(grid);
 const more=new URLSearchParams({view:'projects'}),occasion=(current.occasions||[]).find(value=>occasionLabels[value]),type=(current.types||[]).find(value=>data.types?.[value]);
 if(occasion||type){const link=document.createElement('a');link.className='related-works-more';if(occasion){more.set('occasion',occasion);link.textContent='Смотреть остальные работы по этому событию ↗';}else{more.set('format',type);link.textContent='Смотреть остальные работы в этом направлении ↗';}link.href='/catalog?'+more.toString();section.append(link);}
 const footer=main.querySelector('.case-bottom');
 if(footer)main.insertBefore(section,footer);else main.append(section);
}
document.addEventListener('click',async event=>{
 const button=event.target.closest('[data-share-work]');
 if(!button)return;
 const tools=button.closest('.case-share-tools'),status=tools?.querySelector('[data-share-work-status]'),field=tools?.querySelector('[data-share-work-url]');
 if(!tools||!status||!field)return;
 const url=new URL(location.pathname,location.origin).href,title=document.querySelector('.case-heading h1')?.textContent?.trim()||document.title;
 button.disabled=true;
 try{
  if(typeof navigator.share==='function'){
   await navigator.share({title,text:title+' — EventAgencies 101',url});
   status.textContent='Ссылка передана через меню устройства.';
   return;
  }
  await navigator.clipboard.writeText(url);
  status.textContent='Ссылка скопирована. Можно отправить её коллегам или клиенту.';
 }catch(error){
  if(error?.name==='AbortError')return;
  field.value=url;field.hidden=false;field.focus({preventScroll:true});field.select();
  status.textContent='Не удалось скопировать автоматически. Ссылка выделена в поле — скопируйте её.';
 }finally{button.disabled=false;}
});
addRelatedWorks().catch(()=>{});
