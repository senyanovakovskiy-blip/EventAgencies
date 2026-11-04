const visible=node=>Boolean(node?.isConnected&&!node.disabled&&!node.closest('[hidden],[inert]')&&node.getClientRects().length&&getComputedStyle(node).visibility!=='hidden');

/** A dialog's opener may have been replaced, or may belong to the hidden view. */
export function restoreProjectActionFocus({trigger,agencySlug,workSlug,path,action='work'}){
 if(path&&location.pathname+location.search!==path)return;
 const activeView=[document.getElementById('comparison-table'),document.getElementById('project-board')].find(visible);
 if(!activeView&&action==='note'){
  const samePair=button=>(button.dataset.editComparisonNote||button.dataset.saveAgency)===agencySlug&&(button.dataset.noteWork||button.dataset.saveWork)===workSlug;
  const inView=button=>{if(!visible(button))return false;const rect=button.getBoundingClientRect();return rect.bottom>0&&rect.right>0&&rect.top<innerHeight&&rect.left<innerWidth;};
  const target=visible(trigger)&&samePair(trigger)?trigger:[...document.querySelectorAll('.ea-selection-notice [data-edit-comparison-note],[data-save-agency]')].find(button=>samePair(button)&&inView(button));
  target?.focus({preventScroll:true});return;
 }
 const actions=[...(activeView?.querySelectorAll('[data-open-work-picker],[data-edit-comparison-note]')||[])];
 const forAgency=actions.filter(button=>(button.dataset.openWorkPicker||button.dataset.editComparisonNote)===agencySlug&&visible(button));
 const matching=forAgency.find(button=>action==='note'?button.hasAttribute('data-edit-comparison-note'):button.hasAttribute('data-open-work-picker'));
 const target=visible(trigger)?trigger:matching||forAgency[0]||document.querySelector('[data-comparison-view][aria-pressed="true"]')||document.getElementById('project-comparison');
 if(visible(target))target.focus({preventScroll:true});
}
