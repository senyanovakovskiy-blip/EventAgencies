import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {packProtectedAssets} from './protected-assets.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target=path.join(root,'.sites-build','static');
// Only generated hosted assets are replaced; local-dist and the database are untouched.
if(path.dirname(target)!==path.join(root,'.sites-build'))throw Error('Invalid build target');
await fs.rm(target,{recursive:true,force:true});
const build=spawnSync(process.execPath,['build.mjs'],{cwd:root,stdio:'inherit',env:{...process.env,EA_BUILD_DIR:target,EA_SITE_ORIGIN:'https://eventagencies-motion.racinggiant1.chatgpt.site'}});
if(build.status!==0)process.exit(build.status??1);
// These demo galleries belong to the retained template, not to the
// EventAgencies catalogue. Keep the original files in source/local builds while
// excluding them from the hosted archive (Sites limits input to 256 MiB).
const templateGalleries=['yamaha-revzone','chat-artify','run-x-ring','hyundai-tc-motor','trip-social','monster-chat-app','travala-travel','playground'];
const currentContent=(await Promise.all(['site','about','projects','moments','catalog'].map(name=>fs.readFile(path.join(root,'content',name+'.json'),'utf8')))).join('\n');
for(const slug of templateGalleries){
 if(currentContent.includes('/media/'+slug+'/')||new RegExp('"slug"\\s*:\\s*"'+slug+'"').test(currentContent))throw Error('Template gallery is now in use: '+slug);
 const gallery=path.resolve(target,'media',slug);
 if(path.dirname(gallery)!==path.join(target,'media'))throw Error('Invalid generated gallery path');
 await fs.rm(gallery,{recursive:true,force:true});
}
// Keep originals in source, but omit unused event photos from the hosted build.
// Event images are referenced explicitly by content JSON; this avoids shipping
// assets that are not referenced by any current page.
const textExtensions=new Set(['.json','.js','.jsx','.ts','.tsx','.mjs','.cjs','.html','.css']);
const references=[];
const collectReferenceFiles=async directory=>{
 try{
  for(const entry of await fs.readdir(directory,{withFileTypes:true})){
   const file=path.join(directory,entry.name);
   if(entry.isDirectory())await collectReferenceFiles(file);
   else if(entry.isFile()&&textExtensions.has(path.extname(entry.name).toLowerCase()))references.push(file);
  }
 }catch(error){if(error.code!=='ENOENT')throw error;}
};
for(const directory of ['content','public','app','admin','cloud','lib','scripts','template-source','worker'])
 await collectReferenceFiles(path.join(root,directory));
// The generated catalog and HTML pages carry the exact image references for
// this build. Keep them in the hosted asset set while leaving source assets intact.
await collectReferenceFiles(target);
const referenceText=(await Promise.all(references.map(file=>fs.readFile(file,'utf8')))).join('\n');
const staleCatalogData=path.resolve(root,'public/custom/catalog-data.json');
const mediaManifestPath=path.resolve(root,'content/media.json');
const assetReferenceFiles=references.filter(file=>{
 const resolved=path.resolve(file);
 return resolved!==staleCatalogData&&resolved!==mediaManifestPath;
});
const assetReferenceText=(await Promise.all(assetReferenceFiles.map(file=>fs.readFile(file,'utf8')))).join('\n');
const pruneUnusedEventImages=async eventsRoot=>{
 const eventFiles=[];
 const collectEventFiles=async directory=>{
 try{
  for(const entry of await fs.readdir(directory,{withFileTypes:true})){
   const file=path.join(directory,entry.name);
   if(entry.isDirectory())await collectEventFiles(file);
   else if(entry.isFile())eventFiles.push(file);
  }
 }catch(error){if(error.code!=='ENOENT')throw error;}
 };
 await collectEventFiles(eventsRoot);
 let removed=0;
 for(const file of eventFiles){
  const relative=path.relative(eventsRoot,file).split(path.sep).join('/');
  const url='/custom/events/'+relative;
  if(!referenceText.includes(url)){
   const resolved=path.resolve(file);
   if(!resolved.startsWith(path.resolve(eventsRoot)+path.sep))throw Error('Invalid hosted event asset path');
   await fs.rm(file);
   removed++;
  }
 }
 return removed;
};
const pruneUnusedCatalogMedia=async assetsRoot=>{
 const used=new Set([...assetReferenceText.matchAll(/\/custom\/(?:library|optimized)\/[A-Za-z0-9._-]+/g)].map(match=>match[0]));
 const media=JSON.parse(await fs.readFile(mediaManifestPath,'utf8'));
 for(const url of [...used]){
  if(!url.startsWith('/custom/library/'))continue;
  const entry=media[url];
  if(!entry)continue;
  const candidates=[entry.src,entry.preview,...(String(entry.srcset||'').match(/\/custom\/(?:library|optimized)\/[A-Za-z0-9._-]+/g)||[])];
  for(const candidate of candidates)if(typeof candidate==='string'&&candidate.startsWith('/custom/'))used.add(candidate);
 }
 let removed=0;
 for(const folder of ['library','optimized']){
  const directory=path.resolve(assetsRoot,'custom',folder);
  const collect=async current=>{
   let entries=[];try{entries=await fs.readdir(current,{withFileTypes:true});}catch(error){if(error.code==='ENOENT')return;throw error;}
   for(const entry of entries){
    const file=path.join(current,entry.name);
    if(entry.isDirectory())await collect(file);
    else if(entry.isFile()){
     const relative=path.relative(directory,file).split(path.sep).join('/'),url='/custom/'+folder+'/'+relative;
     if(used.has(url))continue;
     const resolved=path.resolve(file);
     if(!resolved.startsWith(directory+path.sep))throw Error('Invalid hosted catalogue asset path');
     await fs.rm(resolved);removed++;
    }
   }
  };
  await collect(directory);
 }
 return removed;
};
await fs.cp(path.join(root,'admin'),path.join(target,'admin'),{recursive:true});
const rewrite=async(file,replacements)=>{
 let text=await fs.readFile(path.join(target,file),'utf8');
 for(const [from,to]of replacements)text=text.replaceAll(from,to);
 await fs.writeFile(path.join(target,file),text);
};
await rewrite('my-project/index.html',[
 ['data-cloud-history hidden','data-cloud-history'],
 ['data-cloud-copy hidden','data-cloud-copy'],
 ['Сейчас заявки сохраняются на локальном сервере этого сайта.','Заявки сохраняются в вашем закрытом рабочем пространстве.'],
 ['Заявка сохранится локально. Агентствам ничего не отправляется.','Заявка сохранится в вашем закрытом рабочем пространстве. Агентствам ничего не отправляется.'],
]);
await rewrite('admin/index.html',[
 ['<body>','<body data-hosted="true">'],
 ['Локальная версия · без рассылок','Личное рабочее пространство · без рассылок'],
 ['Только на этом компьютере','Владелец и приглашённый администратор'],
 ['<form id="login-form"','<a class="primary" href="/signin-with-chatgpt?return_to=/admin" target="_top">Войти в мой аккаунт</a><form hidden id="login-form"'],
]);
const protectedCount=await packProtectedAssets(target,path.join(root,'.sites-build','protected-assets.mjs'));
console.log(`Bundled ${protectedCount} protected pages and scripts behind the Worker access gate.`);
const prunedCatalogMedia=await pruneUnusedCatalogMedia(target);
if(prunedCatalogMedia)console.log(`Excluded ${prunedCatalogMedia} unreferenced catalogue images from the hosted build; source files are preserved.`);
const framework=spawnSync(process.execPath,['scripts/run-framework.mjs','build'],{cwd:root,stdio:'inherit'});
if(framework.status!==0)process.exit(framework.status??1);
const prunedEventImages=await pruneUnusedEventImages(path.join(root,'dist','client','custom','events'));
if(prunedEventImages)console.log(`Excluded ${prunedEventImages} unreferenced event images from the hosted build; source files are preserved.`);
console.log('Hosted build includes static pages, protected API and D1 migrations.');
