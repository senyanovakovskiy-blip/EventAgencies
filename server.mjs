import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createInquiryStore,inquiryApi} from './inquiry-server.mjs';
import {createAdminHandler} from './admin-server.mjs';
const directory=path.dirname(fileURLToPath(import.meta.url));
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.avif':'image/avif','.webp':'image/webp','.woff2':'font/woff2','.woff':'font/woff','.mp4':'video/mp4','.webm':'video/webm','.m4a':'audio/mp4','.mp3':'audio/mpeg','.wav':'audio/wav','.ogg':'audio/ogg','.ico':'image/x-icon'};
export function createLocalServer({databasePath=path.join(directory,'private-data','inquiries.sqlite3'),root=path.join(directory,'local-dist')}={}){
 const catalog=JSON.parse(fs.readFileSync(path.join(directory,'content','catalog.json'),'utf8'));
 const operatorSources={
  details:JSON.parse(fs.readFileSync(path.join(directory,'content','case-details.json'),'utf8')),
  presentation:JSON.parse(fs.readFileSync(path.join(directory,'content','client-presentation.json'),'utf8'))
 };
 const store=createInquiryStore(databasePath,catalog,operatorSources);
 const adminHandler=createAdminHandler(store.admin);
 const server=http.createServer(async(req,res)=>{
 try{
 if(await adminHandler(req,res))return;
 if(await inquiryApi(req,res,store))return;
 if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405).end();return;}
 let p; try{p=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));}catch{res.writeHead(400).end();return;}
 if(p!==root&&!p.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 if(fs.existsSync(p)&&fs.statSync(p).isDirectory())p=path.join(p,'index.html');
 if(!fs.existsSync(p)){console.log('404',req.url);res.writeHead(404).end('Not found');return;}
 const stat=fs.statSync(p), ext=path.extname(p), etag='W/"'+stat.size.toString(16)+'-'+Math.floor(stat.mtimeMs).toString(16)+'"';
 const cache=/^\.(webp|avif|jpg|jpeg|png|svg|woff2|woff)$/.test(ext)?'public, max-age=86400':'no-cache';
 const headers={'Content-Type':types[ext]||'application/octet-stream','Accept-Ranges':'bytes','Cache-Control':cache,'ETag':etag};
 if(req.headers['if-none-match']===etag&&!req.headers.range){res.writeHead(304,headers).end();return;}
 const range=req.method==='GET'&&/^bytes=(\d*)-(\d*)$/.exec(req.headers.range||'');
 let start=0,end=stat.size-1,status=200;
 if(range&&(range[1]||range[2])){
  if(!range[1])start=Math.max(0,stat.size-Number(range[2]));
  else{start=Number(range[1]);end=Math.min(range[2]?Number(range[2]):end,end);}
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=stat.size){res.writeHead(416,{...headers,'Content-Range':`bytes */${stat.size}`,'Content-Length':0}).end();return;}
  status=206;headers['Content-Range']=`bytes ${start}-${end}/${stat.size}`;
 }
 res.writeHead(status,{...headers,'Content-Length':Math.max(0,end-start+1)});
 if(req.method==='HEAD'||stat.size===0){res.end();return;}
 const stream=fs.createReadStream(p,{start,end});
 stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
 }catch{if(!res.headersSent)res.writeHead(500).end('Server error');else res.destroy();}
 });
 server.headersTimeout=10000;server.requestTimeout=20000;
 server.on('close',()=>store.close());
 return server;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const port=Number(process.env.PORT||8781);
 const server=createLocalServer({databasePath:process.env.EA_INQUIRIES_DB||path.join(directory,'private-data','inquiries.sqlite3')});
 server.listen(port,'127.0.0.1',()=>console.log(`Local: http://127.0.0.1:${port} — inquiries saved locally; no notifications`));
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close(()=>process.exit(0)));
}
