import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

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
 ['Только на этом компьютере','Доступ только владельцу'],
 ['<form id="login-form"','<a class="primary" href="/signin-with-chatgpt?return_to=/admin" target="_top">Войти в мой аккаунт</a><form hidden id="login-form"'],
]);
const framework=spawnSync(process.execPath,['scripts/run-framework.mjs','build'],{cwd:root,stdio:'inherit'});
if(framework.status!==0)process.exit(framework.status??1);
console.log('Hosted build includes static pages, protected API and D1 migrations.');
