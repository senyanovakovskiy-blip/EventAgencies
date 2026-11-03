import fs from 'node:fs';
import path from 'node:path';
import {randomBytes,createHash,scryptSync,timingSafeEqual} from 'node:crypto';
import {statusLabels,recommendationKey} from './admin/manual-model.js';

export const statuses=statusLabels;
const hash=text=>createHash('sha256').update(text).digest('hex');
const problem=(status,code)=>Object.assign(new Error(code),{status,code});
export function createAdminStore(db,receipt,accessFile,catalog){
 db.exec(`CREATE TABLE IF NOT EXISTS inquiry_management(
  inquiry_id INTEGER PRIMARY KEY REFERENCES inquiries(id),
  status TEXT NOT NULL DEFAULT 'new', note TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL, search_text TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS inquiry_history(
  id INTEGER PRIMARY KEY AUTOINCREMENT, inquiry_id INTEGER NOT NULL REFERENCES inquiries(id),
  created_at TEXT NOT NULL, actor TEXT NOT NULL, status TEXT NOT NULL, note TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS admin_account(
  username TEXT PRIMARY KEY, salt TEXT NOT NULL, password_hash TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS admin_sessions(
  token_hash TEXT PRIMARY KEY, csrf TEXT NOT NULL, expires_at INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS inquiry_history_item ON inquiry_history(inquiry_id,id);`);
 const columns=new Set(db.prepare('PRAGMA table_info(inquiry_management)').all().map(c=>c.name));
 for(const [name,definition]of Object.entries({closure_reason:"TEXT NOT NULL DEFAULT ''",status_changed_at:"TEXT NOT NULL DEFAULT ''",recommendations_json:"TEXT NOT NULL DEFAULT '[]'",reply_text:"TEXT NOT NULL DEFAULT ''",reply_basis:"TEXT NOT NULL DEFAULT ''"}))if(!columns.has(name))db.exec(`ALTER TABLE inquiry_management ADD COLUMN ${name} ${definition}`);
 if(!db.prepare('PRAGMA table_info(inquiry_history)').all().some(c=>c.name==='details_json'))db.exec("ALTER TABLE inquiry_history ADD COLUMN details_json TEXT NOT NULL DEFAULT '{}'");
 const register=(id,snapshot,createdAt)=>db.prepare('INSERT OR IGNORE INTO inquiry_management(inquiry_id,updated_at,search_text) VALUES(?,?,?)').run(id,createdAt,(`${receipt({id,created_at:createdAt,snapshot_json:JSON.stringify(snapshot)}).id} ${JSON.stringify(snapshot)}`).toLocaleLowerCase('ru'));
 for(const row of db.prepare('SELECT i.* FROM inquiries i LEFT JOIN inquiry_management m ON i.id=m.inquiry_id WHERE m.inquiry_id IS NULL').all())register(row.id,JSON.parse(row.snapshot_json),row.created_at);
 // Preserve the meaning of the previous completed status; it never proves a shortlist is ready.
 db.exec("UPDATE inquiry_management SET status='closed',closure_reason=CASE WHEN closure_reason='' THEN 'Завершена в предыдущей версии' ELSE closure_reason END WHERE status='done'");
 for(const row of db.prepare("SELECT m.inquiry_id,i.created_at FROM inquiry_management m JOIN inquiries i ON i.id=m.inquiry_id WHERE m.status_changed_at='' ").all()){
  let previous='new',changedAt=row.created_at;
  for(const h of db.prepare('SELECT status,created_at FROM inquiry_history WHERE inquiry_id=? ORDER BY id').all(row.inquiry_id)){if(h.status!==previous)changedAt=h.created_at;previous=h.status;}
  db.prepare('UPDATE inquiry_management SET status_changed_at=? WHERE inquiry_id=?').run(changedAt,row.inquiry_id);
 }
 if(!db.prepare('SELECT 1 FROM admin_account LIMIT 1').get()){
  const savedPassword=fs.existsSync(accessFile)?fs.readFileSync(accessFile,'utf8').match(/Пароль: ([A-Za-z0-9_-]{32})/)?.[1]:null;
  const password=savedPassword||randomBytes(24).toString('base64url'),salt=randomBytes(16).toString('hex');
  fs.mkdirSync(path.dirname(accessFile),{recursive:true});
  if(!savedPassword)fs.writeFileSync(accessFile,`EventAgencies — локальная админка\nЛогин: admin\nПароль: ${password}\n\nВход: http://127.0.0.1:8780/admin\nЭтот файл не публикуется и не выдаётся сайтом. Храните его на своём компьютере.\n`,{encoding:'utf8',mode:0o600,flag:'wx'});
  db.prepare('INSERT INTO admin_account VALUES(?,?,?)').run('admin',salt,scryptSync(password,salt,64).toString('hex'));
 }
 const detail=id=>{
  const row=db.prepare('SELECT i.*,m.status,m.note,m.revision,m.updated_at,m.status_changed_at,m.closure_reason,m.recommendations_json,m.reply_text,m.reply_basis FROM inquiries i JOIN inquiry_management m ON m.inquiry_id=i.id WHERE i.id=?').get(id);
  if(!row)throw problem(404,'not_found');
  const recommendations=JSON.parse(row.recommendations_json);
  return {recordId:row.id,receipt:receipt(row),status:row.status,note:row.note,revision:row.revision,updatedAt:row.updated_at,statusChangedAt:row.status_changed_at||row.created_at,closureReason:row.closure_reason,recommendations,replyText:row.reply_text,replyBasis:row.reply_basis,replyStale:Boolean(row.reply_text&&row.reply_basis!==hash(recommendationKey(recommendations))),history:db.prepare('SELECT created_at AS createdAt,actor,status,note,details_json FROM inquiry_history WHERE inquiry_id=? ORDER BY id DESC LIMIT 100').all(id).map(({details_json,...h})=>({...h,details:JSON.parse(details_json)}))};
 };
 const resolveRecommendations=value=>{
  if(!Array.isArray(value)||value.length>3)throw problem(400,'invalid_recommendations');
  const seen=new Set();
  return value.map(r=>{
   if(!r||typeof r.agencySlug!=='string'||seen.has(r.agencySlug)||typeof r.reason!=='string'||r.reason.length>1200||typeof r.questions!=='string'||r.questions.length>1200)throw problem(400,'invalid_recommendations');
   seen.add(r.agencySlug);
   const a=catalog.agencies.find(a=>a.slug===r.agencySlug),p=r.workSlug?catalog.projects.find(p=>p.slug===r.workSlug&&(p.agencySlug===r.agencySlug||p.agencySlugs?.includes(r.agencySlug))):null;
   if(!a||r.workSlug!==null&&typeof r.workSlug!=='string'||r.workSlug&&!p)throw problem(400,'invalid_recommendations');
   return {agencySlug:a.slug,name:a.name,workSlug:p?.slug||null,work:p?{slug:p.slug,title:p.fullTitle,source:p.source||''}:null,reason:r.reason,questions:r.questions};
  });
 };
 return {
  register,
  catalog(){return {types:catalog.types,agencies:catalog.agencies.map(({slug,name,city,types,geography,services,budgetConditions})=>({slug,name,city,types,geography,services,budgetConditions})),projects:catalog.projects.map(({slug,agencySlug,agencySlugs,fullTitle,kind,category,eventCity,source})=>({slug,agencySlug,agencySlugs,fullTitle,kind,category,eventCity,source}))};},
  login(username,password){
   const account=db.prepare('SELECT * FROM admin_account WHERE username=?').get('admin');
   if(typeof password!=='string'||password.length>512||!account)return null;
   const candidate=scryptSync(password,account.salt,64);
   if(!timingSafeEqual(candidate,Buffer.from(account.password_hash,'hex'))||username!==account.username)return null;
   const token=randomBytes(32).toString('base64url'),csrf=randomBytes(24).toString('base64url'),expiresAt=Date.now()+8*60*60*1000;
   db.prepare('DELETE FROM admin_sessions WHERE expires_at < ?').run(Date.now());
   db.prepare('INSERT INTO admin_sessions VALUES(?,?,?)').run(hash(token),csrf,expiresAt);
   return {token,csrf,expiresAt};
  },
  session(token){if(typeof token!=='string'||token.length>100)return null;return db.prepare('SELECT csrf,expires_at AS expiresAt FROM admin_sessions WHERE token_hash=? AND expires_at>?').get(hash(token),Date.now())||null;},
  logout(token){db.prepare('DELETE FROM admin_sessions WHERE token_hash=?').run(hash(token||''));},
  list({status='',q='',page=1}={}){
   if(status&&!Object.hasOwn(statuses,status))throw problem(400,'invalid_status');
   if(typeof q!=='string'||q.length>180||!Number.isSafeInteger(page)||page<1)throw problem(400,'invalid_filter');
   const clauses=[],params=[];
   if(status){clauses.push('m.status=?');params.push(status);}
   if(q.trim()){clauses.push("m.search_text LIKE ? ESCAPE '\\'");params.push('%'+q.trim().toLocaleLowerCase('ru').replace(/[\\%_]/g,'\\$&')+'%');}
   const where=clauses.length?' WHERE '+clauses.join(' AND '):'';
   const total=db.prepare('SELECT COUNT(*) AS n FROM inquiry_management m'+where).get(...params).n;
   const pages=Math.max(1,Math.ceil(total/25));page=Math.min(page,pages);
   const rows=db.prepare("SELECT i.*,m.status,m.updated_at FROM inquiries i JOIN inquiry_management m ON m.inquiry_id=i.id"+where+" ORDER BY CASE WHEN m.status='new' THEN 0 ELSE 1 END,i.id DESC LIMIT 25 OFFSET ?").all(...params,(page-1)*25);
   const counts=Object.fromEntries(Object.keys(statuses).map(s=>[s,0]));
   for(const row of db.prepare('SELECT status,COUNT(*) AS n FROM inquiry_management GROUP BY status').all())counts[row.status]=row.n;
   return {total,page,pages,counts,statuses,items:rows.map(row=>{const r=receipt(row);return {recordId:row.id,id:r.id,createdAt:r.createdAt,status:row.status,name:r.contact.name,format:r.brief.format,city:r.brief.city,date:r.brief.date,dateUnknown:r.brief.dateUnknown,budget:r.brief.budget,budgetHelp:r.brief.budgetHelp,guests:r.brief.guests,agencies:r.selection.map(s=>s.name),test:/^\s*ТЕСТ(?:ОВАЯ ЗАЯВКА|\.)/.test(r.brief.description)};})};
  },
  detail,
  update(id,input){
   const {status,note,revision}=input;
   if(!Object.hasOwn(statuses,status)||typeof note!=='string'||note.length>5000||!Number.isSafeInteger(revision)||revision<0)throw problem(400,'invalid_update');
   db.exec('BEGIN IMMEDIATE');
   try{
    const current=detail(id);
    const closureReason=input.closureReason??current.closureReason,replyText=input.replyText??current.replyText,replyBasis=input.replyBasis??current.replyBasis;
    if(typeof closureReason!=='string'||closureReason.length>1500||typeof replyText!=='string'||replyText.length>16000||typeof replyBasis!=='string'||replyBasis!==''&&!/^[a-f0-9]{64}$/.test(replyBasis))throw problem(400,'invalid_update');
    const recommendations=input.recommendations===undefined?current.recommendations:resolveRecommendations(input.recommendations);
    if(status==='prepared'&&(!recommendations.length||recommendations.some(r=>!r.reason.trim()||!r.questions.trim())))throw problem(400,'shortlist_incomplete');
    const changes=Object.keys({status,note,closureReason,replyText,replyBasis}).filter(k=>current[k]!==({status,note,closureReason,replyText,replyBasis})[k]);
    if(recommendationKey(current.recommendations)!==recommendationKey(recommendations))changes.push('recommendations');
    if(!changes.length){db.exec('COMMIT');return current;}
    if(current.revision!==revision)throw problem(409,'revision_conflict');
    const now=new Date().toISOString();
    const statusChangedAt=status===current.status?current.statusChangedAt:now;
    db.prepare('UPDATE inquiry_management SET status=?,note=?,revision=revision+1,updated_at=?,status_changed_at=?,closure_reason=?,recommendations_json=?,reply_text=?,reply_basis=? WHERE inquiry_id=?').run(status,note,now,statusChangedAt,closureReason,JSON.stringify(recommendations),replyText,replyBasis,id);
    db.prepare('INSERT INTO inquiry_history(inquiry_id,created_at,actor,status,note,details_json) VALUES(?,?,?,?,?,?)').run(id,now,'admin',status,note,JSON.stringify({changes,closureReason,recommendations,replyText,replyBasis}));
    const updated=detail(id);db.exec('COMMIT');return updated;
   }catch(error){if(db.isTransaction)db.exec('ROLLBACK');throw error;}
  }
 };
}
