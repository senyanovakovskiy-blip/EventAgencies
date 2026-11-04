const controllers=new WeakMap();

export function syncReferenceBatch(host){controllers.get(host)?.sync();}

export function setupReferenceBatch(host,onRemove){
 controllers.delete(host);delete host.dataset.referenceSelecting;
 const grid=host.querySelector('#saved-reference-grid');if(!grid)return;
 const bar=document.createElement('div');bar.className='reference-batch-bar';
 bar.innerHTML='<button class="reference-batch-open" type="button">Выбрать несколько</button><div class="reference-batch-tools" hidden><p role="status" aria-live="polite" data-batch-count></p><div class="reference-batch-actions"><button type="button" data-batch-all>Выбрать показанные</button><button type="button" data-batch-clear>Снять выбор</button><button type="button" data-batch-remove disabled>Убрать выбранные</button><button type="button" data-batch-finish>Готово</button></div><small>Выбор действует на показанные примеры. Заметки сохранятся после удаления.</small></div>';
 grid.before(bar);
 const opener=bar.querySelector('.reference-batch-open'),panel=bar.querySelector('.reference-batch-tools'),count=bar.querySelector('[data-batch-count]'),all=bar.querySelector('[data-batch-all]'),clear=bar.querySelector('[data-batch-clear]'),remove=bar.querySelector('[data-batch-remove]'),finish=bar.querySelector('[data-batch-finish]');
 const cards=[...grid.querySelectorAll('[data-saved-reference]')];
 const options=cards.map(card=>{
  const label=document.createElement('label');label.className='reference-batch-choice';label.hidden=true;
  const input=document.createElement('input');input.type='checkbox';input.setAttribute('aria-label','Выбрать пример «'+(card.querySelector('h3')?.textContent||'Сохранённая работа')+'»');
  const text=document.createElement('span');text.textContent='Выбрать пример';label.append(input,text);card.prepend(label);
  return {card,label,input,slug:card.dataset.savedReference};
 });
 let active=false,busy=false;const selected=new Set();
 function sync(){
  const visible=options.filter(option=>!option.card.hidden),visibleSlugs=new Set(visible.map(option=>option.slug));
  for(const slug of selected)if(!visibleSlugs.has(slug))selected.delete(slug);
  host.dataset.referenceSelecting=String(active);opener.hidden=active;panel.hidden=!active;
  count.textContent='Выбрано: '+selected.size+' из '+visible.length;
  for(const option of options){option.label.hidden=!active;option.input.checked=selected.has(option.slug);option.input.disabled=busy;option.card.dataset.batchSelected=String(active&&selected.has(option.slug));}
  all.disabled=busy||!visible.length||selected.size===visible.length;clear.disabled=busy||!selected.size;remove.disabled=busy||!selected.size;finish.disabled=busy;
  remove.textContent=busy?'Убираем…':'Убрать выбранные'+(selected.size?' · '+selected.size:'');
 }
 opener.addEventListener('click',()=>{active=true;sync();options.find(option=>!option.card.hidden)?.input.focus({preventScroll:true});});
 options.forEach(option=>option.input.addEventListener('change',()=>{if(busy)return;if(option.input.checked)selected.add(option.slug);else selected.delete(option.slug);sync();}));
 all.addEventListener('click',()=>{for(const option of options)if(!option.card.hidden)selected.add(option.slug);sync();});
 clear.addEventListener('click',()=>{selected.clear();sync();});
 finish.addEventListener('click',()=>{active=false;selected.clear();sync();opener.focus({preventScroll:true});});
 remove.addEventListener('click',async()=>{
  if(busy||!selected.size)return;const slugs=[...selected];busy=true;sync();
  try{if(await onRemove(slugs)){active=false;selected.clear();}}
  finally{busy=false;if(bar.isConnected)sync();}
 });
 controllers.set(host,{sync});sync();
}
