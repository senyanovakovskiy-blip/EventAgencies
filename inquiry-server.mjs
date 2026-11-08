import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {submissionPayload,validPayload} from './public/custom/inquiry-model.js';
import {createAdminStore} from './admin-store.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const fail=(status,code)=>Object.assign(new Error(code),{status,code});
export function createInquiryStore(filename,catalog,operatorSources={}){
 fs.mkdirSync(path.dirname(filename),{recursive:true});
 const db=new DatabaseSync(filename,{timeout:5000});
 db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
  CREATE TABLE IF NOT EXISTS inquiries (
   id INTEGER PRIMARY KEY AUTOINCREMENT,
   key_hash TEXT NOT NULL UNIQUE,
   payload_hash TEXT NOT NULL,
   created_at TEXT NOT NULL,
   snapshot_json TEXT NOT NULL
  );`);
 const find=db.prepare('SELECT * FROM inquiries WHERE key_hash=?');
 const insert=db.prepare('INSERT INTO inquiries(key_hash,payload_hash,created_at,snapshot_json) VALUES(?,?,?,?)');
 const receipt=row=>({id:`EA-${row.created_at.slice(0,4)}-${String(row.id).padStart(6,'0')}`,createdAt:row.created_at,recipient:'EventAgencies 101',localServer:true,...JSON.parse(row.snapshot_json)});
 const admin=createAdminStore(db,receipt,path.join(path.dirname(filename),'admin-access.txt'),catalog,operatorSources);
 return {
  admin,
  save(key,input){
   if(typeof key!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(key)||!validPayload(input))throw fail(400,'invalid_request');
   const payload=submissionPayload(input),keyHash=hash(key.toLowerCase()),payloadHash=hash(JSON.stringify(payload));
   db.exec('BEGIN IMMEDIATE');
   try{
    // UUID hex is case-insensitive. The prior local implementation hashed the
    // spelling as supplied. Prefer its exact key when legacy case variants
    // coexist, then recognize normalized and all-uppercase keys.
    const existing=[...new Set([hash(key),keyHash,hash(key.toUpperCase())])].map(value=>find.get(value)).find(Boolean);
    if(existing){if(existing.payload_hash!==payloadHash)throw fail(409,'request_changed');db.exec('COMMIT');return {receipt:receipt(existing),duplicate:true};}
    const selection=payload.selection.map(s=>{
     const agency=catalog.agencies.find(a=>a.slug===s.agencySlug);
     const work=s.workSlug?catalog.projects.find(p=>p.slug===s.workSlug&&(p.agencySlug===s.agencySlug||p.agencySlugs?.includes(s.agencySlug))):null;
     if(!agency||(s.workSlug&&!work))throw fail(400,'invalid_selection');
     return {...s,name:agency.name,work:work?{slug:work.slug,title:work.fullTitle}:null};
    });
    const createdAt=new Date().toISOString(),snapshot={...payload,selection};
    insert.run(keyHash,payloadHash,createdAt,JSON.stringify(snapshot));
    const saved=find.get(keyHash);
    admin.register(saved.id,snapshot,createdAt);
    db.exec('COMMIT'); // A receipt is returned only after the durable transaction succeeds.
    return {receipt:receipt(saved),duplicate:false};
   }catch(error){if(db.isTransaction)db.exec('ROLLBACK');throw error;}
  },
  close(){db.close();}
 };
}
function send(res,status,body){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).end(JSON.stringify(body));}
export async function inquiryApi(req,res,store){
 const url=new URL(req.url,'http://localhost');
 if(!url.pathname.startsWith('/api/'))return false;
 const localPort=req.socket.localPort;
 const allowedHosts=new Set([`127.0.0.1:${localPort}`,`localhost:${localPort}`]);
 if(!allowedHosts.has(req.headers.host)||req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`||req.headers['sec-fetch-site']==='cross-site'){
  send(res,403,{error:'forbidden_origin'});return true;
 }
 if(url.pathname==='/api/health'&&req.method==='GET'){send(res,200,{service:'eventagencies-local-inquiries',storage:'sqlite',notifications:false});return true;}
 if(url.pathname!=='/api/inquiries'){send(res,404,{error:'not_found'});return true;}
 if(req.method!=='POST'){send(res,405,{error:'method_not_allowed'});return true;}
 if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')){send(res,415,{error:'json_required'});return true;}
 try{
  if(Number(req.headers['content-length'])>32768)throw fail(413,'too_large');
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>32768)throw fail(413,'too_large');chunks.push(chunk);}
  let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw fail(400,'invalid_json');}
  const result=store.save(body?.requestId,body?.payload);
  send(res,result.duplicate?200:201,{ok:true,...result});
 }catch(error){
  send(res,error.status||503,{error:error.code&&error.status?error.code:'storage_unavailable'});
 }
 return true;
}
