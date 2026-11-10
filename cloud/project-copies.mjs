import {normalizeProjectCopy,copySummary} from '../public/custom/project-copy-model.js';
import {digest,problem} from './store.mjs';

const searchText=value=>value.normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/ё/g,'е');
const names=new Intl.Collator('ru-RU',{numeric:true,sensitivity:'base'});

export function createProjectCopyStore(binding,ownerId){
 if(typeof ownerId!=='string'||!ownerId.trim())throw problem(401,'authentication_required');
 const db=binding.withSession?binding.withSession('first-primary'):binding;
 const stmt=(sql,...args)=>db.prepare(sql).bind(...args);
 const item=row=>({id:row.id,name:row.name,createdAt:row.created_at,...copySummary(JSON.parse(row.snapshot_json))});
 const validId=id=>Number.isSafeInteger(id)&&id>0;
 return {
  async list({page=1,q='',sort='newest'}={}){
   if(!Number.isSafeInteger(page)||page<1)throw problem(400,'invalid_page');
   if(typeof q!=='string'||q.length>120||!['newest','oldest','name'].includes(sort))throw problem(400,'invalid_copy_search');
   // Accounts hold at most 100 copies. Match only their small metadata rows
   // with Unicode-aware text handling; load full snapshots for one page.
   const result=await stmt('SELECT id,name,created_at FROM project_copies WHERE owner_id=? ORDER BY id DESC',ownerId).all(),all=result.results||[];
   const words=searchText(q).trim().split(/\s+/).filter(Boolean);
   const matches=all.filter(row=>{const name=searchText(row.name);return words.every(word=>name.includes(word));});
   if(sort==='oldest')matches.sort((a,b)=>a.id-b.id);
   if(sort==='name')matches.sort((a,b)=>names.compare(a.name,b.name)||b.id-a.id);
   const total=matches.length,pages=Math.max(1,Math.ceil(total/10));page=Math.min(page,pages);
   const selected=matches.slice((page-1)*10,page*10),ids=selected.map(row=>row.id);
   if(!ids.length)return {page,pages,total,totalSaved:all.length,items:[]};
   const snapshots=await stmt('SELECT id,snapshot_json FROM project_copies WHERE owner_id=? AND id IN ('+ids.map(()=>'?').join(',')+')',ownerId,...ids).all();
   const byId=new Map((snapshots.results||[]).map(row=>[row.id,row.snapshot_json]));
   return {page,pages,total,totalSaved:all.length,items:selected.filter(row=>byId.has(row.id)).map(row=>item({...row,snapshot_json:byId.get(row.id)}))};
  },
  async detail(id){
   if(!validId(id))throw problem(404,'not_found');
   const row=await stmt('SELECT id,name,created_at,snapshot_json FROM project_copies WHERE owner_id=? AND id=?',ownerId,id).first();
   if(!row)throw problem(404,'not_found');
   return {...item(row),snapshot:JSON.parse(row.snapshot_json)};
  },
  async save(input){
   if(!input||typeof input.requestId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(input.requestId)||typeof input.name!=='string'||!input.name.trim()||input.name.length>120)throw problem(400,'invalid_copy');
   const snapshot=normalizeProjectCopy(input.snapshot);if(!snapshot)throw problem(400,'invalid_copy');
   const name=input.name.trim(),encoded=JSON.stringify(snapshot),keyHash=await digest(input.requestId.toLowerCase()),payloadHash=await digest(JSON.stringify({name,snapshot}));
   const deleted=await stmt('SELECT key_hash FROM project_copy_tombstones WHERE owner_id=? AND key_hash=?',ownerId,keyHash).first();
   if(deleted)throw problem(410,'copy_deleted');
   const existing=await stmt('SELECT * FROM project_copies WHERE owner_id=? AND key_hash=?',ownerId,keyHash).first();
   if(existing){if(existing.payload_hash!==payloadHash)throw problem(409,'request_changed');return {item:item(existing),duplicate:true};}
   const createdAt=new Date().toISOString();
   const result=await db.batch([
    stmt('INSERT INTO project_copies(owner_id,key_hash,payload_hash,name,created_at,snapshot_json) SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM project_copies WHERE owner_id=?)<100 AND NOT EXISTS(SELECT 1 FROM project_copy_tombstones WHERE owner_id=? AND key_hash=?) ON CONFLICT(owner_id,key_hash) DO NOTHING RETURNING id',ownerId,keyHash,payloadHash,name,createdAt,encoded,ownerId,ownerId,keyHash),
    stmt('SELECT * FROM project_copies WHERE owner_id=? AND key_hash=?',ownerId,keyHash),
   ]);
   const saved=result[1].results?.[0];if(!saved){const deleted=await stmt('SELECT key_hash FROM project_copy_tombstones WHERE owner_id=? AND key_hash=?',ownerId,keyHash).first();if(deleted)throw problem(410,'copy_deleted');throw problem(409,'copy_limit');}
   if(saved.payload_hash!==payloadHash)throw problem(409,'request_changed');
   return {item:item(saved),duplicate:!result[0].results?.length};
  },
  async remove(id){
   if(!validId(id))throw problem(404,'not_found');
   const existing=await stmt('SELECT key_hash FROM project_copies WHERE owner_id=? AND id=?',ownerId,id).first();
   if(!existing)throw problem(404,'not_found');
   const deletedAt=new Date().toISOString(),result=await db.batch([
    stmt('INSERT INTO project_copy_tombstones(owner_id,key_hash,deleted_at) SELECT owner_id,key_hash,? FROM project_copies WHERE owner_id=? AND id=? ON CONFLICT(owner_id,key_hash) DO NOTHING RETURNING key_hash',deletedAt,ownerId,id),
    stmt('DELETE FROM project_copies WHERE owner_id=? AND id=? RETURNING id',ownerId,id),
   ]);
   if(!result[1].results?.length)throw problem(404,'not_found');return {ok:true};
  },
  async rename(id,input){
   if(!validId(id))throw problem(404,'not_found');
   if(typeof input?.name!=='string'||!input.name.trim()||input.name.length>120||typeof input.expectedName!=='string'||!input.expectedName.trim()||input.expectedName.length>120)throw problem(400,'invalid_copy_name');
   const name=input.name.trim();
   // The creation hash remains unchanged so retries of the original save
   // still identify the same snapshot after its display name changes.
   const row=await stmt('UPDATE project_copies SET name=? WHERE owner_id=? AND id=? AND name=? RETURNING id,name',name,ownerId,id,input.expectedName).first();
   if(row)return {ok:true,item:row};
   const current=await stmt('SELECT id,name FROM project_copies WHERE owner_id=? AND id=?',ownerId,id).first();
   if(!current)throw problem(404,'not_found');
   if(current.name===name)return {ok:true,item:current};
   throw problem(409,'copy_name_changed');
  },
 };
}
