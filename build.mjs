import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {adaptTemplate} from './adapt-template.mjs';
import {buildCatalog} from './build-catalog.mjs';
import {refineExperience} from './refine-experience.mjs';
import {harmonizeExperience} from './harmonize-experience.mjs';
import {selectionExperience} from './selection-experience.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = process.env.EA_BUILD_DIR ? path.resolve(root, process.env.EA_BUILD_DIR) : path.join(root, 'local-dist');
const readJSON = async name => JSON.parse(await fs.readFile(path.join(root, 'content', name + '.json'), 'utf8'));
const [site, about, projects] = await Promise.all(['site','about','projects'].map(readJSON));
if (process.env.EA_SITE_ORIGIN) site.url = new URL(process.env.EA_SITE_ORIGIN).origin;
const moments = await readJSON('moments');
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const text = (value, label) => assert(typeof value === 'string' && value.trim(), label + ' must be a non-empty string');
for (const key of ['name','shortName','title','description','contactLabel','contactUrl','location','url','language','ogImage','favicon','music','playgroundDescription']) text(site[key], 'site.' + key);
assert(/^https?:\/\//.test(site.url), 'site.url must start with http:// or https://');
const origin = new URL(site.url).origin;
assert(site.contactUrl==='/catalog', 'The catalogue belongs to this Site');
assert(Array.isArray(projects) && projects.length > 0, 'Add at least one project');
assert(Array.isArray(about.title) && about.title.length === 2, 'about.title must contain two lines');
for (const key of ['intro','experiences','capabilities','trustedBy','portfolio','social']) assert(Array.isArray(about[key]), 'about.' + key + ' must be an array');
const slugs = new Set();
for (const p of projects) {
  for (const key of ['slug','title','year','category','description','image']) text(p[key], 'project.' + key);
  assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.slug), 'Project slug: use lowercase letters, digits and hyphens');
  assert(!slugs.has(p.slug), 'Duplicate project slug: ' + p.slug); slugs.add(p.slug);
  assert(Array.isArray(p.gallery), p.slug + ': gallery must be an array');
}
// Catch missing custom media before writing the output. Existing responsive
// versions remain managed by the retained browser build.
async function checkFile(url, label) {
  if (!url || /^(https?:|data:)/.test(url)) return;
  assert(url.startsWith('/') && !url.startsWith('//'), label + ': use a root-relative path such as /custom/photo.webp');
  const relative = decodeURIComponent(url.split(/[?#]/)[0]).slice(1);
  assert(!relative.split(/[\\/]/).includes('..'), label + ': invalid path');
  const found = await Promise.all(['public','template-source'].map(folder => fs.access(path.join(root, folder, relative)).then(()=>true,()=>false)));
  assert(found.some(Boolean), label + ': file not found: ' + url);
}
async function checkMedia(object, label) {
  if (!object || typeof object !== 'object') return;
  for (const [key,value] of Object.entries(object)) {
    if (['src','image','imageMobile','poster','ogImage','favicon','music'].includes(key) && typeof value === 'string') await checkFile(value, label + '.' + key);
    if (key === 'images' && Array.isArray(value)) for (const image of value) await checkFile(typeof image === 'string' ? image : image.src, label + '.images');
    if (typeof value === 'object') await checkMedia(value, label + '.' + key);
  }
}
await checkMedia({site,about,projects,moments}, 'content');
const tokens = {
  ABOUT:{...about,email:site.contactLabel}, PROJECTS:projects, LOCATION:site.location,
  NAME:site.name, EMAIL:site.contactLabel, URL:origin, TITLE:site.title,
  ABOUT_PAGE_TITLE:'Как выбрать агентство — ' + site.name, PLAYGROUND_TITLE:'Атмосфера — ' + site.name,
  OG_IMAGE:site.ogImage, DESCRIPTION:site.description, PLAYGROUND_DESCRIPTION:site.playgroundDescription,
  SHORT_NAME:site.shortName, MUSIC:encodeURI(site.music)
};
const json = value => JSON.stringify(value).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
await fs.mkdir(dist, {recursive:true});
await fs.cp(path.join(root, 'template-source'), dist, {recursive:true});
await fs.cp(path.join(root, 'public'), dist, {recursive:true});
for (const filename of ['Home-LrP0Tb4r.js','index-CF3Ad5Zo.js']) {
  const target = path.join(dist, 'assets', filename);
  let code = await fs.readFile(target,'utf8');
  code = adaptTemplate(code,filename,{site,moments});
  code = refineExperience(code,filename,{site});
  code = harmonizeExperience(code,filename);
  code = selectionExperience(code,filename,{site});
  code = code.replace(/__TEMPLATE_([A-Z_]+)__/g, (_, key) => {
    assert(Object.hasOwn(tokens,key), 'Unknown template token: ' + key);
    return json(tokens[key]);
  });
  await fs.writeFile(target,code);
}
const esc = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const absolute = value => new URL(value, origin).href;
const projectList = projects.map(p=>`<article><h2><a href="/work/${p.slug}">${esc(p.title)}</a></h2><p>${esc(p.category)} · ${esc(p.year)}</p><p>${esc(p.description)}</p></article>`).join('');
const pages = [
  {route:'/',title:site.title,description:site.description,body:projectList},
  {route:'/about',title:tokens.ABOUT_PAGE_TITLE,description:about.intro.join(' '),body:about.intro.map(x=>`<p>${esc(x)}</p>`).join('')},
  {route:'/playground',title:tokens.PLAYGROUND_TITLE,description:site.playgroundDescription,body:''},
  ...projects.map(p=>({route:'/work/'+p.slug,title:p.title+' — '+site.name,description:p.seoDescription||p.description,ogImage:p.ogImage,body:`<p>${esc(p.description)}</p><img src="${esc(p.image)}" alt="${esc(p.title)}">`}))
];
const schema = {'@context':'https://schema.org','@type':'WebSite',url:origin,name:site.name,description:site.description};
for (const page of pages) {
  const url=absolute(page.route), cover=absolute(page.ogImage||site.ogImage);
  const sceneProject=page.route==='/'?projects[0]:projects.find(p=>'/work/'+p.slug===page.route);
  const scene=sceneProject?.hasPhotos?(sceneProject.reelMobile||sceneProject.image):'';
  const html = `<!doctype html>
<html lang="${esc(site.language)}" style="--chrome:#070707">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0,viewport-fit=cover">
<meta name="theme-color" content="#070707">
<meta name="color-scheme" content="only light">
<title>${esc(page.title)}</title>
<script src="/custom/visit.js"></script>
<meta name="description" content="${esc(page.description)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(site.name)}">
<meta property="og:title" content="${esc(page.title)}">
<meta property="og:description" content="${esc(page.description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(cover)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(page.title)}">
<meta name="twitter:description" content="${esc(page.description)}">
<meta name="twitter:image" content="${esc(cover)}">
<link rel="icon" href="${esc(site.favicon)}">
<link rel="preload" href="/fonts/HelveticaNowDisplay-Bold.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/JetBrainsMono-Regular.woff2" as="font" type="font/woff2" crossorigin>
<script type="application/ld+json">${json(schema)}</script>
<style>body{margin:0}html,body{background:var(--chrome)}.seo-page{position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}</style>
<noscript><style>.seo-page{position:static;width:auto;height:auto;margin:0;overflow:visible;clip:auto;white-space:normal;max-width:720px;padding:32px;color:#fef3ee;font:16px/1.5 system-ui}.seo-page img{max-width:100%}.seo-page a{color:inherit}</style></noscript>
<script type="module" crossorigin src="/assets/index-CF3Ad5Zo.js"></script>
<link rel="stylesheet" crossorigin href="/assets/index-Ci-2K9Cr.css">
<link rel="modulepreload" crossorigin href="/assets/Home-LrP0Tb4r.js">
<link rel="preload" as="style" crossorigin href="/assets/Home-CqJJnoUv.css">
<link rel="stylesheet" href="/custom/theme.css">
<link rel="stylesheet" href="/custom/cinema.css"><link rel="stylesheet" href="/custom/selection.css"><script type="module" src="/custom/selection.js"></script>
<script defer src="/custom/navigation.js"></script>
<script defer src="/custom/atmosphere.js"></script>
</head>
<body data-scene="${esc(scene)}"><div id="root"><div class="seo-page"><nav><a href="/">Проекты</a> · <a href="/about">О проекте</a> · <a href="/playground">Атмосфера</a> · <a href="${esc(site.contactUrl)}">${esc(site.contactLabel)}</a></nav><main><h1>${esc(page.title)}</h1>${page.body}</main></div></div></body>
</html>`;
  const directory = path.join(dist, page.route.slice(1));
  await fs.mkdir(directory,{recursive:true});
  await fs.writeFile(path.join(directory,'index.html'),html);
}
// Remove only obsolete HTML routes written by this build, never user assets.
const manifestPath=path.join(dist,'.template-pages.json');
const previous=JSON.parse(await fs.readFile(manifestPath,'utf8').catch(()=>'[]'));
for(const route of previous) {
  if(pages.some(p=>p.route===route)||!/^\/work\/[a-z0-9-]+$/.test(route))continue;
  await fs.unlink(path.join(dist,route.slice(1),'index.html')).catch(e=>{if(e.code!=='ENOENT')throw e;});
}
await fs.writeFile(manifestPath,JSON.stringify(pages.map(p=>p.route),null,2));
const catalogRoutes=await buildCatalog(root,dist,site);
await fs.writeFile(path.join(dist,'.site-pages.json'),JSON.stringify([...pages.map(p=>p.route),...catalogRoutes],null,2));
console.log(`Built ${pages.length+catalogRoutes.length} pages in ${dist}`);
