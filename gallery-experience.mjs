export function galleryExperience(code, file) {
  if (file !== 'Home-LrP0Tb4r.js') return code;
  const anchor = 'function R4({media:e,rootRef:a,onPreviewScrollLock:s,onPreviewScrollRestore:n}){';
  if (!code.includes(anchor)) throw Error('Photo viewer hook missing');
  // Keep the retained player for non-photographic media.
  code = code.replace(anchor, `function R4(props){
    const legacy=eaOriginalPreview(props),viewer=h.useRef(null),[index,setIndex]=h.useState(null);
    h.useLayoutEffect(()=>{const instance=createPhotoViewer({...props,onIndex:setIndex});viewer.current=instance;return()=>{viewer.current=null;instance.destroy()}},[props.media,props.rootRef]);
    return {index:index??legacy.index,portal:legacy.portal,open:(i,node)=>{if(props.media[i]?.type==="image"&&!props.media[i]?.live)viewer.current?.open(i,node);else legacy.open(i,node)}}
  }function eaOriginalPreview({media:e,rootRef:a,onPreviewScrollLock:s,onPreviewScrollRestore:n}){`);
  return 'import {createPhotoViewer} from "/custom/photo-viewer.js";\n' + code;
}
