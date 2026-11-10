export function homeOccasionPicker(){
 const primary=[['corporate','Корпоратив'],['conference','Конференция'],['presentation','Презентация'],['teambuilding','Тимбилдинг'],['private','Частное событие']],more=[['wedding','Свадьба'],['birthday','День рождения или юбилей'],['product_launch','Запуск продукта или бренда'],['opening','Открытие площадки'],['new_year','Новогодний вечер'],['exhibition','Выставка или экспозиция'],['sports_day','Спортивный день или турнир'],['other','Другой формат']];
 return `function EaOccasionPicker(){const related={wedding:"private",birthday:"private",product_launch:"presentation",opening:"public",new_year:"corporate",exhibition:"business",sports_day:"sport"},link=([id,label])=>t.jsx("a",{href:id==="other"?"/my-project":"/catalog?view=projects&occasion="+(related[id]||id)+(related[id]?"&inspiration="+id:""),"data-occasion":id,children:label},id);return t.jsxs("div",{className:"ea-occasion-picker",children:[t.jsx("h2",{children:"Какое событие планируете?"}),t.jsx("div",{className:"ea-occasion-options",children:${JSON.stringify(primary)}.map(link)}),t.jsxs("details",{className:"ea-occasion-more",children:[t.jsx("summary",{children:"Ещё форматы"}),t.jsx("div",{className:"ea-occasion-options",children:${JSON.stringify(more)}.map(link)})]})]})}function EaProjectNav(){return t.jsxs("a",{className:"ea-project-nav",href:"/my-project","data-my-project-link":"",children:["Мой проект",t.jsx("span",{"data-project-count":""})]})}`;
}

export function selectionExperience(code,file,{site}){
 if(file!=='Home-LrP0Tb4r.js')return code;
 const replace=(from,to)=>{if(!code.includes(from))throw Error('Selection anchor missing: '+from.slice(0,100));code=code.replaceAll(from,to);};
 const picker=homeOccasionPicker();
 replace('function P7(e){',picker+'function P7(e){');
 replace('className:"ea-home-cta",href:"/catalog"','className:"ea-home-cta",href:"/catalog?view=projects"');
 replace('t.jsx("a",{className:"ea-home-guide",href:"/about",children:"Как сравнивать агентства ↗"})','t.jsx(EaOccasionPicker,{})');
 replace('className:"ea-mobile-intro",children:[t.jsx("p",{children:"Выбирайте агентство по его работам."}),t.jsx("a",{href:"/catalog",children:"Все компании ↗"})]',`className:"ea-mobile-intro",children:[t.jsx("h1",{children:${JSON.stringify(site.home.title)}}),t.jsx("p",{className:"ea-mobile-copy",children:${JSON.stringify(site.home.copy)}}),t.jsx("a",{className:"ea-home-cta",href:"/catalog?view=projects",children:"Смотреть проекты"}),t.jsx(EaOccasionPicker,{})]`);
 replace('format:p.category,image:', 'format:p.category,city:p.eventCity,guests:p.guestLabel,slug:p.slug,agencySlug:p.agencySlug,image:');
 replace('format:z1[0].category}', 'format:z1[0].category,city:z1[0].eventCity,guests:z1[0].guestLabel,slug:z1[0].slug,agencySlug:z1[0].agencySlug}');
 replace('children:p.format}', 'children:[p.format,p.city].filter(Boolean).join(" · ")}');
 replace('t.jsx("a",{href:p.agencyUrl,children:p.agency+" ↗"})','t.jsx("a",{href:p.agencyUrl,children:"Команда — "+p.agency+" ↗"}),t.jsx("button",{type:"button",className:"ea-save-button","data-save-agency":p.agencySlug,"data-save-work":p.slug,children:"В мой проект"})');
 replace('children:"Открыть проект ↗"','children:"Подробнее о проекте ↗"');
 replace('className:"site-header",children:[','className:"site-header",children:[t.jsx(EaProjectNav,{}),');
 // Keep the owner entry visible beside the brand, including on small screens.
 replace('children:t.jsx(Y1,{text:__TEMPLATE_LOCATION__,tone:"title",play:e})','children:[t.jsx(Y1,{text:__TEMPLATE_LOCATION__,tone:"title",play:e}),t.jsx("a",{className:"ea-admin-nav",href:"/admin",children:"Админка"})]');
 replace('{id:"catalog",label:"Каталог"},','{id:"catalog",label:"Каталог"},{id:"my-project",label:"Мой проект"},');
 replace('V==="catalog"?void 0:', '(V==="catalog"||V==="my-project")?void 0:');
 const source='e.source&&t.jsx("a",{className:"ea-project-source mono",href:e.source,target:"_blank",rel:"noopener noreferrer",children:"Материалы проекта ↗"})';
 replace(source,source+',t.jsx("button",{type:"button",className:"ea-save-button","data-save-agency":e.agencySlug,"data-save-work":e.slug,children:"В мой проект"})');
 return code;
}
