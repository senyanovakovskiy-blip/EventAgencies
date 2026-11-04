import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const assets=path.join(path.dirname(fileURLToPath(import.meta.url)),'admin');
const cookieName='ea_local_admin';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"};
const reply=(res,status,body,extra={})=>res.writeHead(status,{...headers,'Content-Type':'application/json; charset=utf-8',...extra}).end(JSON.stringify(body));
async function body(req){
 if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw {status:415,code:'json_required'};
 let length=0;const parts=[];
 for await(const chunk of req){length+=chunk.length;if(length>262144)throw {status:413,code:'too_large'};parts.push(chunk);}
 try{return JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{throw {status:400,code:'invalid_json'};}
}
export function createAdminHandler(admin){
 const failures=new Map();
 return async(req,res)=>{
  const url=new URL(req.url,'http://localhost'),isApi=url.pathname.startsWith('/api/admin/');
  const files={'/admin/preparation-draft.js':'preparation-draft.js','/admin/preparation-model.js':'preparation-model.js','/admin/preparation-ui.js':'preparation-ui.js','/admin/workflow-model.js':'workflow-model.js','/admin/workflow-ui.js':'workflow-ui.js','/admin':'index.html','/admin/':'index.html','/admin/admin.js':'admin.js','/admin/admin.css':'admin.css','/admin/manual-model.js':'manual-model.js','/admin/manual-ui.js':'manual-ui.js'};
  if(!isApi&&!Object.hasOwn(files,url.pathname))return false;
  const port=req.socket.localPort,host=req.headers.host;
  if(![`localhost:${port}`,`127.0.0.1:${port}`].includes(host)||req.headers.origin&&req.headers.origin!==`http://${host}`||req.headers['sec-fetch-site']==='cross-site'){reply(res,403,{error:'forbidden_origin'});return true;}
  if(!isApi){
   if(req.method!=='GET'&&req.method!=='HEAD'){reply(res,405,{error:'method_not_allowed'});return true;}
   const file=files[url.pathname];
   const content=fs.readFileSync(path.join(assets,file));
   res.writeHead(200,{...headers,'Content-Type':file.endsWith('.js')?'application/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8','Content-Length':content.length});res.end(req.method==='HEAD'?undefined:content);return true;
  }
  try{
   const token=(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(cookieName+'='))?.slice(cookieName.length+1);
   if(url.pathname==='/api/admin/login'&&req.method==='POST'){
    const address=req.socket.remoteAddress,now=Date.now();let failure=failures.get(address);
    if(failure&&now-failure.since>15*60*1000){failures.delete(address);failure=null;}
    if(failure?.count>=5){reply(res,429,{error:'too_many_attempts'},{'Retry-After':'900'});return true;}
    const input=await body(req),session=admin.login(input?.username,input?.password);
    if(!session){failures.set(address,{since:failure?.since||now,count:(failure?.count||0)+1});reply(res,401,{error:'invalid_credentials'});return true;}
    failures.delete(address);if(token)admin.logout(token);
    reply(res,200,{authenticated:true,username:'admin',csrf:session.csrf},{'Set-Cookie':`${cookieName}=${session.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.max(0,Math.floor((session.expiresAt-Date.now())/1000))}`});return true;
   }
   const session=admin.session(token);
   if(url.pathname==='/api/admin/session'&&req.method==='GET'){reply(res,200,session?{authenticated:true,username:'admin',csrf:session.csrf}:{authenticated:false});return true;}
   if(!session){reply(res,401,{error:'authentication_required'});return true;}
   if(!['GET','HEAD'].includes(req.method)&&req.headers['x-csrf-token']!==session.csrf){reply(res,403,{error:'csrf_required'});return true;}
   if(url.pathname==='/api/admin/logout'&&req.method==='POST'){admin.logout(token);reply(res,200,{ok:true},{'Set-Cookie':`${cookieName}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`});return true;}
   if(url.pathname==='/api/admin/catalog'&&req.method==='GET'){reply(res,200,admin.catalog());return true;}
   if(url.pathname==='/api/admin/inquiries'&&req.method==='GET'){reply(res,200,admin.list({q:url.searchParams.get('q')||'',status:url.searchParams.get('status')||'',page:Number(url.searchParams.get('page')||1)}));return true;}
   const match=/^\/api\/admin\/inquiries\/([1-9]\d*)$/.exec(url.pathname);
   if(match&&req.method==='GET'){reply(res,200,admin.detail(Number(match[1])));return true;}
   if(match&&req.method==='PATCH'){const input=await body(req);reply(res,200,admin.update(Number(match[1]),input||{}));return true;}
   reply(res,404,{error:'not_found'});
  }catch(error){reply(res,error.status||503,{error:error.status?error.code:'storage_unavailable'});}
  return true;
 };
}
