// Content-only adaptations of the retained public browser build.
// Exact anchors make a future template change fail visibly instead of corrupting it.
export function adaptTemplate(code,filename,{site,moments,featuredSlugs}) {
 if(filename==='index-CF3Ad5Zo.js'){
  for(const [from,to] of Object.entries({'SEE DETAILS':'О ПРОЕКТЕ',CLOSE:'ЗАКРЫТЬ',INFO:'О СОБЫТИИ',FOCUS:'СМОТРЕТЬ',SCROLL:'ЛИСТАТЬ','CLICK TO ENABLE SOUND':'ВКЛЮЧИТЬ ЗВУК'}))code=code.replaceAll(JSON.stringify(from),JSON.stringify(to));
  return code;
 }
 if(filename!=='Home-LrP0Tb4r.js')return code;
 code=code.replaceAll('z1.find(', 'eaAllProjects.find(').replaceAll('z1.some(', 'eaAllProjects.some(');
 const original='const z1=S7.map(e=>e.gallery?{...e,gallery:F4(e.title,e.gallery)}:e);';
 if(!code.includes(original))throw Error('Home selection anchor missing');
 code=code.replace(original,'const eaAllProjects=S7.map(e=>e.gallery?{...e,gallery:F4(e.title,e.gallery)}:e);const z1='+JSON.stringify(featuredSlugs)+'.map(slug=>eaAllProjects.find(p=>p.slug===slug));');
 const replace=(from,to)=>{if(!code.includes(from))throw new Error('Template anchor missing: '+from.slice(0,70));code=code.replaceAll(from,to);};
 replace('href:`mailto:${n}`','href:'+JSON.stringify(site.contactUrl));
 replace('href:`mailto:${Et}`','href:'+JSON.stringify(site.contactUrl));
 replace('const $7=[{id:"work",label:"Work"},','const $7=[{id:"work",label:"Work"},{id:"catalog",label:"Каталог"},');
 replace('onClick:B=>Dt(B,()=>b(V))','onClick:B=>V==="catalog"?void 0:Dt(B,()=>b(V))');
 replace('text:C.title,base:2','text:C.reelTitle||C.title,base:2');
 replace('ref:n,"data-theme":"light",children:[t.jsx("h1",{className:"pl-project-title"','ref:n,children:[t.jsx("h1",{className:"pl-project-title"');
 replace('["Year",e.year]','["Year",e.eventDate??e.year]');
 replace('`Preview ${','`Смотреть ${');
 replace('`Preview item ${s+1}`','`Смотреть фотографию ${s+1}`');
 replace('`${tt.length} items`','`${tt.length} фотографии`');
 replace('text:"Info",tone:"body",delay:r()','text:"О проекте",tone:"body",delay:r()');
 replace('`Open ${e.title}`','`Открыть ${e.title}`');
 const start=code.indexOf('const la="Playground",ca=');
 const end=code.indexOf(',P3={title:la,copy:ca,items:da}',start);
 if(start<0||end<0)throw new Error('Atmosphere gallery anchor missing');
 code=code.slice(0,start)+'const la="Атмосфера",ca='+JSON.stringify(site.playgroundDescription)+',da='+JSON.stringify(moments)+code.slice(end);
 replace('D7=e=>{const a=e.category.replace(/\\bapplication\\b/i,"App").replace(/\\b\\w/g,s=>s.toUpperCase());return`${e.title} — ${/\\bdesign$/i.test(a)?a:`${a} Design`}`}','D7=e=>e.title+" — "+'+JSON.stringify(site.name));
 const sourceLink=',t.jsx("a",{className:"ea-company-link mono",href:e.agencyUrl,children:"Все работы "+e.client+" ↗"}),e.source&&t.jsx("a",{className:"ea-project-source mono",href:e.source,target:"_blank",rel:"noopener noreferrer",children:"Материалы проекта ↗"})';
 replace('text:i,tone:"title",play:!0,delay:d})})','text:i,tone:"title",play:!0,delay:d})})'+sourceLink);
 replace('text:i,tone:"title",play:!0,instant:!r,delay:u})})','text:i,tone:"title",play:!0,instant:!r,delay:u})})'+sourceLink);
 const labels={Work:'Проекты',About:'О проекте',Playground:'Атмосфера',Primary:'Навигация','Real Life':'Впечатления','Let’s Talk':'Найти команду',Clock:'Часы',Info:'О событии',Experiences:'Как выбирать','Trusted by':'Команды в подборке',Capabilities:'Форматы',"Let's talk":'Найти команду',Portfolio:'Продолжить',Social:'Первоисточники','Sound:':'Звук:','Invert color':'Сменить тему','Close project information':'Закрыть информацию о проекте',Close:'Закрыть','Project info':'О событии','Close project':'Закрыть проект',Year:'Когда',Category:'Формат',Client:'Команда',Industry:'Место',Personal:'Не указано'};
 for(const [from,to] of Object.entries(labels))code=code.replaceAll(JSON.stringify(from),JSON.stringify(to));
 for(const [from,to] of Object.entries({Prev:'Назад',Next:'Далее','Media preview':'Просмотр фотографии'}))code=code.replaceAll(JSON.stringify(from),JSON.stringify(to));
 for(const [from,to] of Object.entries({'Switch to light colours':'Светлая тема','Switch to dark colours':'Тёмная тема','Enable sound':'Включить звук','Disable sound':'Выключить звук','Preview media':'Смотреть фото',Dark:'Тёмная',Light:'Светлая',On:'Вкл',Off:'Выкл'}))code=code.replaceAll(JSON.stringify(from),JSON.stringify(to));
 return code;
}
