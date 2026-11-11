const KEY='eventagencies-replacement-undo-v1';
const slug=value=>typeof value==='string'&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const equal=(left,right)=>JSON.stringify(left)===JSON.stringify(right);
function selection(value){
 if(!Array.isArray(value)||!value.length||value.length>3)return null;
 const seen=new Set(),items=[];
 for(const item of value){
  if(!slug(item?.agencySlug)||seen.has(item.agencySlug)||(item.workSlug!==null&&!slug(item.workSlug)))return null;
  seen.add(item.agencySlug);items.push({agencySlug:item.agencySlug,workSlug:item.workSlug});
 }
 return items;
}
function normalize(value){
 if(value?.version!==2||typeof value.project?.marker!=='string'||value.project.marker.length>80||value.project.existed!==true)return null;
 const before=selection(value.before),after=selection(value.after);
 if(!before||!after||before.length!==after.length)return null;
 const changed=before.map((item,index)=>equal(item,after[index])?-1:index).filter(index=>index!==-1);
 if(changed.length!==1)return null;
 const index=changed[0];if(before[index].agencySlug===after[index].agencySlug)return null;
 const name=(value,fallback)=>typeof value==='string'&&value.trim()?value.trim().slice(0,160):fallback;
 return {version:2,project:{marker:value.project.marker,existed:true},before,after,beforeName:name(value.beforeName,before[index].agencySlug),afterName:name(value.afterName,after[index].agencySlug)};
}

export function setupReplacementUndo({getSelection,getIdentity,canUndo,restore,onResult}){
 const content=document.getElementById('project-selection-content');
 const host=document.createElement('div');host.className='project-replacement-undo';host.hidden=true;
 const status=document.createElement('p');status.setAttribute('role','status');
 const button=document.createElement('button');button.type='button';button.className='secondary-action';button.dataset.undoReplacement='';button.textContent='Отменить замену';
 host.append(status,button);content?.prepend(host);
 let change=null;try{change=normalize(JSON.parse(sessionStorage.getItem(KEY)||'null'));}catch{}
 function clear(){
  change=null;host.hidden=true;try{sessionStorage.removeItem(KEY);}catch{}
  document.querySelectorAll('[data-undo-replacement]').forEach(node=>{node.hidden=true;});
 }
 function sync(){
  const identity=getIdentity();if(change&&identity&&(identity.marker!==change.project.marker||!identity.existed)){clear();return;}
  if(change&&!equal(getSelection(),change.after)){clear();return;}
  host.hidden=!change;
  if(change){const text='Вместо «'+change.beforeName+'» выбрано «'+change.afterName+'». Можно вернуть прежнюю команду с выбранной работой.';if(status.textContent!==text)status.textContent=text;}
  document.querySelectorAll('[data-undo-replacement]').forEach(node=>{node.hidden=!change;node.disabled=!canUndo();});
 }
 document.addEventListener('click',event=>{
  if(!event.target.closest('[data-undo-replacement]'))return;
  event.preventDefault();if(!change||!canUndo())return;
  if(!equal(getSelection(),change.after)){clear();onResult('changed');return;}
  const previous=change,result=restore(previous.before,previous.after,previous.project);
  if(result==='saved'||result==='changed')clear();
  onResult(result,previous.beforeName);
 });
 document.addEventListener('ea:project-copy-restored',clear);
 document.addEventListener('ea:inquiry-accepted',clear);
 sync();
 return {sync,clear,hasChange:()=>Boolean(change),record(before,after,beforeName,afterName){
  const next=normalize({version:2,project:getIdentity(),before,after,beforeName,afterName});if(!next)return;
  change=next;try{sessionStorage.setItem(KEY,JSON.stringify(change));}catch{}sync();
 }};
}
