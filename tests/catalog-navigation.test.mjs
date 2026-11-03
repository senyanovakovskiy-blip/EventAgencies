import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source=name=>fs.readFileSync(new URL('../public/custom/'+name,import.meta.url),'utf8');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function page(route,storage=new Map(),navigation='navigate'){
 const events=new Map(),windowEvents=new Map(),assigned=[],scrolls=[];
 const location=new URL(route,'https://eventagencies.test');location.assign=to=>assigned.push(to);
 const main={dataset:{},style:{removeProperty(){}},querySelectorAll:()=>[]};
 const back={href:'/catalog',textContent:'',hasAttribute:name=>name==='data-catalog-back',closest:()=>back};
 const filters={open:false};
 const document={documentElement:{dataset:{}},fonts:{ready:Promise.resolve()},
  getElementById:id=>id==='content'?main:id==='catalog-results'?{getAttribute:()=> 'false'}:null,
  querySelector:selector=>selector==='[data-catalog-back]'?back:selector==='.filter-options'?filters:null,
  querySelectorAll:()=>[],addEventListener:(type,fn)=>events.set(type,fn),dispatchEvent(){}};
 const context=vm.createContext({URL,URLSearchParams,Date,Promise,Map,WeakSet,Event,document,location,
  history:{state:{},replaceState(state){this.state=state;}},crypto:{randomUUID:()=> 'entry-'+Math.random()},
  sessionStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
  performance:{getEntriesByType:()=>[{type:navigation}]},matchMedia:()=>({matches:true,addEventListener(){}}),
  innerWidth:1200,innerHeight:900,scrollY:630,setTimeout:()=>1,clearTimeout(){},
  requestAnimationFrame:fn=>fn(),window:{addEventListener:(type,fn)=>windowEvents.set(type,fn),scrollTo:options=>scrolls.push(options.top)}});
 vm.runInContext(source('catalog-navigation.js'),context);
 const click=link=>events.get('click')({target:{closest:()=>link},button:0,preventDefault(){}});
 return {context,events,assigned,scrolls,back,filters,main,click,storage};
}

test('catalogue → agency → catalogue retains filters and scroll through hosted slash redirects',async()=>{
 const catalog=page('/catalog/?q=INKAPRI&photos=1');
 const agencyLink={href:'https://eventagencies.test/agency/inkapri',hasAttribute:()=>false,closest:()=>null};
 catalog.click(agencyLink);await settle();
 const agencyURL=new URL(catalog.assigned[0],'https://eventagencies.test');
 agencyURL.pathname+='/'; // Production dispatch canonicalizes directory pages.
 const agency=page(agencyURL.href,catalog.storage);
 agency.events.get('DOMContentLoaded')();await settle();
 assert.equal(agency.back.href,'/catalog?q=INKAPRI&photos=1');
 agency.click(agency.back);await settle();
 assert.equal(agency.assigned[0],'/catalog?q=INKAPRI&photos=1');
 const returned=page('/catalog/?q=INKAPRI&photos=1',catalog.storage);
 returned.events.get('DOMContentLoaded')();await settle();
 assert.ok(returned.scrolls.includes(630),'restores the catalogue position after redirect');
 assert.equal(returned.main.dataset.catalogReady,'true');
});

test('agency accepts an existing trailing-slash catalogue return URL',async()=>{
 const agency=page('/agency/inkapri/?from='+encodeURIComponent('/catalog/?view=projects&q=summer'));
 agency.events.get('DOMContentLoaded')();await settle();
 assert.equal(agency.back.href,'/catalog?view=projects&q=summer');
});

test('work close returns to each allowed route with or without a trailing slash',()=>{
 for(const from of ['/catalog?q=summer','/catalog/?q=summer','/agency/inkapri?from=%2Fcatalog%3Fq%3Dsummer','/agency/inkapri/?from=%2Fcatalog%3Fq%3Dsummer','/my-project','/my-project/']){
  const listeners=[],assigned=[];
  const control={getAttribute:()=> 'Закрыть проект',matches:()=>false};
  vm.runInNewContext(source('navigation.js'),{URL,URLSearchParams,
   location:{pathname:'/work/example/',search:'?from='+encodeURIComponent(from),origin:'https://eventagencies.test',assign:to=>assigned.push(to)},
   document:{addEventListener:(type,fn)=>listeners.push(fn)}});
  listeners[0]({target:{closest:()=>control},preventDefault(){},stopPropagation(){}});
  const expected=new URL(from,'https://eventagencies.test');
  assert.equal(assigned[0],expected.pathname.replace(/\/$/,'')+expected.search,from);
 }
});

test('work close ignores external and unsupported return URLs',()=>{
 for(const from of ['https://other.test/catalog','//other.test/catalog','/admin','/catalogue']){
  const listeners=[],assigned=[];
  vm.runInNewContext(source('navigation.js'),{URL,URLSearchParams,
   location:{pathname:'/work/example/',search:'?from='+encodeURIComponent(from),origin:'https://eventagencies.test',assign:to=>assigned.push(to)},
   document:{addEventListener:(type,fn)=>listeners.push(fn)}});
  listeners[0]({target:{closest:()=>({getAttribute:()=> 'Закрыть проект'})},preventDefault(){},stopPropagation(){}});
  assert.equal(assigned.length,0,from);
 }
});
