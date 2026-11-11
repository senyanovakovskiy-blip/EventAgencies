import {createHomeEntrance} from './home-entrance.js';
import {skipHomeEntrance} from './project-transition.js';

// The retained React view owns the markup and routes. This controller owns only
// one continuous, cyclic strip. Every photo shares the same scroll offset.
export function createPhotoReel(frame, {projects, initialSlug, onFocus, onOpenStart, onOpenDone}) {
  const slides = frame.querySelector('.ws-slides');
  const items = [...slides.querySelectorAll('.ws-slide')];
  const pictures = items.map(item => item.querySelector('img'));
  const mobile = matchMedia('(max-width: 900px)');
  const smallImage = matchMedia('(max-width: 600px)');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const entrance = createHomeEntrance(slides);
  const wrap = index => (index % items.length + items.length) % items.length;
  const requests = new WeakMap();
  let current = Math.max(0, projects.findIndex(project => project.slug === initialSlug));
  let position = current, target = current, requested = current, active = false, started = false, disposed = false;
  let moving = false, opening = false, pendingOpen = false, generation = 0;
  let velocity = 0, motionFrame = 0, lastFrame = 0;
  let heights = [], centers = [], circumference = 1, gutter = 0, peek = 0;
  let pointer = null, suppressClickUntil = 0, wheelSum = 0, wheelUsed = false, wheelTimer;
  let hovered = false, layoutFrame = 0, observedWidth = 0;
  const controls = () => {
    const node = frame.parentElement?.querySelector('.ea-reel-controls');
    if (node && !node.hasAttribute('aria-label')) {
      node.setAttribute('role', 'group');
      node.setAttribute('aria-label', 'Управление фотолентой: прокрутка или стрелки вверх и вниз; на телефоне — свайп.');
    }
    return node;
  };
  const caption = () => {
    const node = controls()?.querySelector('.ea-work-caption');
    const title = node?.querySelector('.ea-work-caption-copy h2');
    if (title && !title.hasAttribute('aria-live')) {
      title.setAttribute('aria-live', 'polite');
      title.setAttribute('aria-atomic', 'true');
    }
    return node;
  };

  frame.classList.add('ea-photo-reel');
  frame.dataset.cursor = 'see';
  slides.style.display = 'block';
  const ambient = document.createElement('div');
  ambient.className = 'ea-reel-ambient';
  ambient.setAttribute('aria-hidden', 'true');
  frame.prepend(ambient);
  let ambientSource = '';
  function fitPhotos() {
    const width = frame.clientWidth * .94, available = frame.clientHeight;
    if (!width || !available) return;
    gutter = mobile.matches ? 12 : Math.min(22, available * .035);
    peek = mobile.matches ? Math.min(32, available * .1) : Math.min(48, available * .09);
    const height = Math.max(40, available - 2 * (gutter + peek));
    pictures.forEach((img, index) => {
      const naturalWidth = img.naturalWidth || Number(img.getAttribute('width')) || 1500;
      const naturalHeight = img.naturalHeight || Number(img.getAttribute('height')) || 1000;
      const scale = Math.min(width / naturalWidth, height / naturalHeight);
      const surface = img.closest('.ws-in');
      surface.style.width = naturalWidth * scale + 'px';
      surface.style.height = naturalHeight * scale + 'px';
      heights[index] = naturalHeight * scale;
    });
    centers = [0];
    for (let index = 1; index < items.length; index++)
      centers[index] = centers[index - 1] + heights[index - 1] / 2 + gutter + heights[index] / 2;
    circumference = centers.at(-1) + heights.at(-1) / 2 + gutter + heights[0] / 2;
    if (pointer?.dragging) {
      pointer.offset = centerAt(position) + pointer.dy;
    }
    paint();
  }
  function centerAt(value) {
    const integer = Math.floor(value), index = wrap(integer);
    const start = Math.floor(integer / items.length) * circumference + centers[index];
    return start + (value - integer) * (heights[index] / 2 + gutter + heights[wrap(index + 1)] / 2);
  }
  function positionAt(offset) {
    const cycle = Math.floor(offset / circumference), within = offset - cycle * circumference;
    let index = centers.length - 1;
    while (index > 0 && centers[index] > within) index--;
    const pitch = heights[index] / 2 + gutter + heights[wrap(index + 1)] / 2;
    return cycle * items.length + index + (within - centers[index]) / pitch;
  }
  function paint() {
    if (!heights.length) return;
    const integer = Math.floor(position), fraction = position - integer;
    const height = heights[wrap(integer)] * (1 - fraction) + heights[wrap(integer + 1)] * fraction;
    const windowHeight = Math.min(frame.clientHeight, height + 2 * (gutter + peek));
    slides.style.top = (frame.clientHeight - windowHeight) / 2 + 'px';
    slides.style.height = windowHeight + 'px';
    const offset = centerAt(position);
    items.forEach((item, index) => {
      const cycle = Math.round((offset - centers[index]) / circumference);
      const y = centers[index] + cycle * circumference - offset;
      const visible = Math.abs(y) - heights[index] / 2 < windowHeight / 2 + 2;
      item.style.transform = `translate3d(0,${y}px,0)`;
      item.style.visibility = visible ? 'visible' : 'hidden';
      item.style.opacity = '1';
      item.style.zIndex = '1';
      item.dataset.reelPosition = String(index + cycle * items.length);
      item.toggleAttribute('data-current-photo', index === wrap(Math.round(position)));
    });
    const focused = wrap(Math.round(position));
    if (focused !== current) {
      current = focused;
      onFocus(current);
      lightPhoto();
      warmNeighbours();
    }
    frame.dataset.photoIndex = String(current);
  }
  function lightPhoto(instant = false) {
    const src = source(current);
    if (!src || items[current].hasAttribute('data-photo-error')) return;
    if (instant || reduced.matches) {
      const glow = document.createElement('img');
      glow.alt = ''; glow.src = src; glow.dataset.currentGlow = ''; 
      const previous = ambient.querySelector('img[data-current-glow]') || ambient.lastElementChild;
      ambient.getAnimations({subtree:true}).forEach(animation => animation.cancel());
      ambient.replaceChildren(glow);
      if (previous && !reduced.matches && src !== ambientSource) {
        // Keep the new colour immediate; briefly dissolve the old colour above it.
        previous.removeAttribute('data-current-glow');
        ambient.append(previous);
        previous.animate([{opacity:1},{opacity:0}], {duration:120,easing:'ease-out',fill:'both'})
          .finished.then(()=>previous.remove(),()=>{});
      }
      ambientSource = src;
      return;
    }
    if (src === ambientSource) return;
    ambientSource = src;
    const glow = document.createElement('img');
    glow.alt = ''; glow.src = src; glow.dataset.currentGlow = ''; 
    const old = ambient.lastElementChild;
    ambient.append(glow);
    if (!reduced.matches) {
      glow.animate([{opacity:0},{opacity:1}], {duration:mobile.matches ? 280 : 340,fill:'both'});
      if (old) old.animate([{opacity:1},{opacity:0}],{duration:mobile.matches ? 280 : 340,fill:'both'}).finished.then(()=>old.remove(),()=>{});
    } else old?.remove();
    while(ambient.children.length>2) ambient.firstElementChild.remove();
  }
  pictures.forEach(picture => { picture.decoding = 'async'; picture.draggable = false; });

  function source(index) {
    return (smallImage.matches && pictures[index].dataset.srcMobile) || pictures[index].dataset.srcDesktop;
  }
  function prepare(index) {
    const picture = pictures[index], src = source(index);
    const previous = requests.get(picture);
    if (previous?.src === src) return previous.promise;
    if (picture.getAttribute('src') !== src || (picture.complete && !picture.naturalWidth)) picture.src = src;
    const promise = picture.decode().then(() => {
      if (picture.getAttribute('src') === src) { items[index].removeAttribute('data-photo-error'); fitPhotos(); if(index===current) lightPhoto(); }
    }).catch(() => {
      if (picture.getAttribute('src') !== src) return prepare(index);
      if (picture.getAttribute('src') === src && picture.complete && !picture.naturalWidth) {
        items[index].setAttribute('data-photo-error', '');
        // A temporary failure must not stay cached for the whole visit.
        requests.delete(picture);
      }
    });
    requests.set(picture, {src, promise});
    return promise;
  }
  function warmNeighbours() {
    // Neighbours are visible content, so load them even with data saving enabled.
    if (!disposed && active) {
      prepare(wrap(current - 1));
      prepare(wrap(current + 1));
      if (!navigator.connection?.saveData) {
        prepare(wrap(current - 2));
        prepare(wrap(current + 2));
      }
    }
  }
  function rest() {
    paint();
    frame.dataset.photoIndex = String(current);
    lightPhoto();
  }
  function cancel() {
    generation++;
    cancelAnimationFrame(motionFrame);
    motionFrame = 0;
    velocity = 0;
    moving = false;
    entrance.finish();
    position = target = requested = Math.round(position);
    rest();
    frame.dataset.transition = 'idle';
  }
  function settle() {
    position = target;
    velocity = 0;
    moving = false;
    motionFrame = 0;
    paint();
    frame.dataset.transition = 'idle';
    warmNeighbours();
    if (pendingOpen) { pendingOpen = false; open(); }
  }
  function tick(time) {
    if (disposed || !active || opening || pointer?.dragging) { motionFrame = 0; return; }
    const dt = Math.min((time - lastFrame) / 1000 || 1 / 60, .04);
    lastFrame = time;
    // Critically damped motion keeps its position and velocity on new input.
    const speed = mobile.matches ? 19 : 17;
    const offset = position - target, decay = Math.exp(-speed * dt);
    const travel = (velocity + speed * offset) * dt;
    position = target + (offset + travel) * decay;
    velocity = (velocity - speed * travel) * decay;
    paint();
    if (Math.abs(position - target) < .0005 && Math.abs(velocity) < .01) settle();
    else motionFrame = requestAnimationFrame(tick);
  }
  function run() {
    if (pointer) { moving = true; return; }
    if (reduced.matches || document.hidden) { settle(); return; }
    moving = true;
    frame.dataset.transition = 'moving';
    if (!motionFrame) { lastFrame = performance.now(); motionFrame = requestAnimationFrame(tick); }
  }
  async function moveTo(destination) {
    if (!active || opening || disposed) return;
    entrance.finish();
    const ticket = ++generation;
    const next = Math.round(destination);
    // Keep the decoded strip on screen while the next visible section loads.
    const loads = [];
    for (let index = Math.min(Math.floor(position), next) - 1; index <= Math.max(Math.ceil(position), next) + 1; index++)
      loads.push(prepare(wrap(index)));
    requested = next;
    if (!motionFrame) frame.dataset.transition = 'loading';
    await Promise.all(loads);
    if (ticket !== generation || disposed || !active || opening || pointer?.dragging) return;
    target = next;
    run();
  }
  function step(delta) {
    if (!active || opening || disposed) return;
    pendingOpen = false;
    pointer = null;
    // Bound a burst of wheel/click input without building a long animation queue.
    moveTo(Math.max(Math.floor(position) - 3, Math.min(Math.ceil(position) + 3, requested + (Math.sign(delta) || 1))));
  }
  function open() {
    if (!active || opening || disposed || performance.now() < suppressClickUntil) return;
    // Finish centring this photo before the shared transition reads its bounds.
    if (Math.abs(position - Math.round(position)) > .0005) {
      pendingOpen = true;
      moveTo(Math.round(position));
      return;
    }
    cancel();
    const slug = projects[current].slug;
    if (!onOpenStart(slug)) return;
    opening = true;
    onOpenDone(slug);
  }
  function clickPhoto(event) {
    if (performance.now() < suppressClickUntil) return;
    const item = event.target.closest('.ws-slide');
    if (!item) return;
    const destination = Number(item.dataset.reelPosition);
    if (destination === Math.round(position)) open();
    else { pendingOpen = false; moveTo(destination); }
  }
  function wheel(event) {
    if (!active || mobile.matches || event.ctrlKey) return;
    // One trackpad gesture advances once; its inertial tail must not skip photos.
    event.preventDefault();
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => { wheelUsed = false; wheelSum = 0; }, 140);
    wheelSum += (Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX) * (event.deltaMode === 1 ? 16 : 1);
    if (!wheelUsed && Math.abs(wheelSum) >= 20) {
      wheelUsed = true;
      const delta = wheelSum; wheelSum = 0;
      step(delta);
    }
  }
  function key(event) {
    if (!active || event.ctrlKey || event.altKey || event.metaKey || event.repeat) return;
    if (event.target.closest('input,textarea,select,[contenteditable="true"]')) return;
    if (!controls()?.contains(event.target) && !frame.contains(event.target) && !hovered) return;
    const delta = {ArrowLeft: -1, ArrowRight: 1, ArrowUp: -1, ArrowDown: 1}[event.key];
    if (!delta) return;
    event.preventDefault();
    step(delta);
  }
  function pointerDown(event) {
    if (!event.isPrimary) { pointerCancel(); return; }
    if (!active || opening || event.pointerType === 'mouse') return;
    // Grabbing a moving strip freezes the exact visible position under the finger.
    cancelAnimationFrame(motionFrame);
    motionFrame = 0;
    pointer = {id: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, dy: 0,
      start: position, offset: centerAt(position), dragging: false};
  }
  function pointerMove(event) {
    if (!pointer || event.pointerId !== pointer.id) return;
    pointer.dx = event.clientX - pointer.x;
    pointer.dy = event.clientY - pointer.y;
    if (Math.hypot(pointer.dx, pointer.dy) > 10) suppressClickUntil = performance.now() + 500;
    if (!pointer.dragging && Math.abs(pointer.dy) > 10 && Math.abs(pointer.dy) > Math.abs(pointer.dx) * 1.3) {
      pointer.dragging = true;
      pendingOpen = false;
      generation++;
      cancelAnimationFrame(motionFrame);
      motionFrame = 0;
      velocity = 0;
      entrance.finish();
    }
    if (pointer.dragging && !reduced.matches) {
      position = positionAt(pointer.offset - pointer.dy);
      moving = true;
      frame.dataset.transition = 'dragging';
      paint();
    }
  }
  function pointerUp(event) {
    if (!pointer || event.pointerId !== pointer.id) return;
    const {dx, dy, start, dragging} = pointer;
    pointer = null;
    const swipe = Math.abs(dy) >= Math.max(28, frame.clientHeight * .07) && Math.abs(dy) > Math.abs(dx) * 1.3;
    if (swipe) {
      const direction = Math.sign(-dy);
      const distance = Math.max(1, Math.round(Math.abs(position - start)));
      moveTo(Math.round(start) + direction * distance);
    } else if (dragging) moveTo(Math.round(position));
    else if (moving) run();
  }
  const pointerCancel = () => {
    const dragging = pointer?.dragging;
    pointer = null;
    if (dragging) moveTo(Math.round(position));
    else if (moving) run();
  };
  const pointerEnter = () => { hovered = true; };
  const pointerLeave = () => { hovered = false; };

  // Reserve the tallest actual caption at this width, so the photo doesn't resize
  // when a title wraps. The temporary measurement is removed before painting.
  function measureCaption(immediate = false) {
    cancelAnimationFrame(layoutFrame);
    const measure = () => {
      if (disposed) return;
      const label = caption();
      if (!label || !label.clientWidth) return;
      const clone = label.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      clone.style.cssText = `position:fixed;left:-10000px;top:0;right:auto;bottom:auto;width:${label.getBoundingClientRect().width}px;min-height:0;visibility:hidden;pointer-events:none;transform:none;box-sizing:border-box`;
      frame.closest('.home').append(clone);
      let height = 0;
      for (const project of projects) {
        clone.querySelector('h2').textContent = project.reelTitle || project.title;
        clone.querySelector('.ea-work-caption-copy>p').textContent = project.category;
        clone.querySelector('.ea-work-caption-copy>a').textContent = 'Команда — ' + project.agencyName + ' ↗';
        height = Math.max(height, clone.getBoundingClientRect().height);
      }
      clone.remove();
      label.style.minHeight = Math.ceil(height) + 'px';
      document.documentElement.style.setProperty('--ea-caption-height', Math.ceil(label.getBoundingClientRect().height) + 'px');
    };
    if (immediate) measure(); else layoutFrame = requestAnimationFrame(measure);
  }
  const prepareReturn = () => { measureCaption(true); rest(); };
  const layoutObserver = new ResizeObserver(entries => {
    fitPhotos();
    const width = entries[0]?.contentRect.width;
    if (width !== observedWidth) { observedWidth = width; measureCaption(); }
  });
  layoutObserver.observe(frame);
  document.fonts?.ready.then(() => { if (!disposed) measureCaption(); });
  function changeSource() {
    // Keep the decoded version on screen across orientation changes. Fetch the
    // appropriate size the next time a slide is requested.
    warmNeighbours();
  }
  function changeMotion() {
    if (reduced.matches) {
      pointer = null;
      cancelAnimationFrame(motionFrame);
      settle();
    }
  }
  const visibilityChange = () => { if (document.hidden && moving) { cancelAnimationFrame(motionFrame); settle(); } };
  frame.addEventListener('wheel', wheel, {passive: false});
  frame.addEventListener('click', clickPhoto);
  frame.addEventListener('ea:prepare-return', prepareReturn);
  frame.addEventListener('pointerdown', pointerDown);
  frame.addEventListener('pointerenter', pointerEnter);
  frame.addEventListener('pointerleave', pointerLeave);
  window.addEventListener('pointermove', pointerMove, {passive: true});
  window.addEventListener('pointerup', pointerUp);
  window.addEventListener('pointercancel', pointerCancel);
  window.addEventListener('keydown', key);
  smallImage.addEventListener('change', changeSource);
  reduced.addEventListener('change', changeMotion);
  document.addEventListener('visibilitychange', visibilityChange);
  fitPhotos();
  rest();
  prepare(current);
  frame.dataset.transition = 'idle';
  return {
    step, open,
    setActive(value, ready) {
      active = value;
      frame.classList.toggle('is-active', value);
      if (!value) { pendingOpen = false; pointer = null; cancel(); return; }
      if (!started && ready) {
        started = true;
        onFocus(current);
        prepare(current).then(warmNeighbours);
        if (skipHomeEntrance(projects[current].slug)) entrance.finish();
        else entrance.reveal(pictures[current]);
        measureCaption();
      }
    },
    enterAt(slug) {
      cancel();
      current = position = target = requested = Math.max(0, projects.findIndex(project => project.slug === slug));
      started = true;
      opening = false;
      onFocus(current);
      rest();
      measureCaption();
      return prepare(current);
    },
    destroy() {
      disposed = true;
      cancel();
      entrance.destroy();
      ambient.remove();
      pictures.forEach(img=>{img.closest('.ws-in').style.removeProperty('width');img.closest('.ws-in').style.removeProperty('height');});
      clearTimeout(wheelTimer);
      cancelAnimationFrame(layoutFrame);
      layoutObserver.disconnect();
      frame.removeEventListener('wheel', wheel);
      frame.removeEventListener('click', clickPhoto);
      frame.removeEventListener('ea:prepare-return', prepareReturn);
      frame.removeEventListener('pointerdown', pointerDown);
      frame.removeEventListener('pointerenter', pointerEnter);
      frame.removeEventListener('pointerleave', pointerLeave);
      window.removeEventListener('pointermove', pointerMove);
      window.removeEventListener('pointerup', pointerUp);
      window.removeEventListener('pointercancel', pointerCancel);
      window.removeEventListener('keydown', key);
      smallImage.removeEventListener('change', changeSource);
      reduced.removeEventListener('change', changeMotion);
      document.removeEventListener('visibilitychange', visibilityChange);
    }
  };
}



