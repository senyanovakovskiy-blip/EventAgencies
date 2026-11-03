export const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function workSummary(p){return (p.summary||p.description||p.format||p.category||'').replace(/Фотографии этого проекта пока не добавлены\.?/g,'').trim().split(/(?<=[.!?])\s+/)[0];}
export function referenceAction(p){return `<button class="reference-button" data-reference-work="${escapeHtml(p.slug)}" aria-pressed="false">Сохранить как пример</button>`;}
