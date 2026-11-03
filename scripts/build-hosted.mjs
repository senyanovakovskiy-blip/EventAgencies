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
await fs.cp(path.join(root,'admin'),path.join(target,'admin'),{recursive:true});
const rewrite=async(file,replacements)=>{
 let text=await fs.readFile(path.join(target,file),'utf8');
 for(const [from,to]of replacements)text=text.replaceAll(from,to);
 await fs.writeFile(path.join(target,file),text);
};
await rewrite('my-project/index.html',[
 ['Сейчас заявки сохраняются на локальном сервере этого сайта.','Заявки сохраняются в вашем закрытом рабочем пространстве.'],
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
