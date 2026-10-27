'use strict';

const $ = id => document.getElementById(id);
const DB = 'my-dump-media-v1';
const STORE = 'items';

// Increase this number for a slower glide (milliseconds).
const GLIDE_MS = 650;
const GLIDE_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

let db;
let items = [];
let visible = [];
let idx = 0;
let mode = 'all';
let newest = true;
let muted = true;
let toastTimer;

let active = null;   // { el, url } for the visible photo/video
let incoming = null; // { el, url, index, direction } while swiping
let busy = false;
let touch = null;

// Add the styling needed for two media items to slide past each other.
// This leaves index.html and your existing buttons unchanged.
const glideCSS = document.createElement('style');
glideCSS.textContent = `
  #mediaMount {
    position: absolute !important;
    inset: 0 !important;
    width: 100% !important;
    height: 100% !important;
    overflow: hidden !important;
    display: block !important;
    touch-action: pan-x;
  }
  #mediaMount .dump-slide {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #000;
    will-change: transform;
    transform: translate3d(0, 0, 0);
  }
  #mediaMount .dump-slide .media {
    display: block !important;
    position: absolute !important;
    inset: 0 !important;
    width: 100% !important;
    height: 100% !important;
    max-width: none !important;
    max-height: none !important;
    object-fit: contain !important;
  }
`;
document.head.appendChild(glideCSS);

const request = req => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

async function initDB() {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => {
      const store = open.result.createObjectStore(STORE, { keyPath: 'id' });
      store.createIndex('created', 'created');
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
}

async function refresh() {
  items = await request(db.transaction(STORE).objectStore(STORE).getAll());
  buildVisible();
  render();
}

function buildVisible(preserveId) {
  const selected = preserveId ?? visible[idx]?.id;
  visible = items
    .filter(x => mode !== 'favorites' || x.favorite)
    .sort((a, b) => newest ? b.created - a.created : a.created - b.created);

  if (mode === 'shuffle') {
    for (let i = visible.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [visible[i], visible[j]] = [visible[j], visible[i]];
    }
  }

  idx = Math.max(0, visible.findIndex(x => x.id === selected));
}

function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('show'), 2500);
}

function current() {
  return visible[idx];
}

function format(bytes) {
  return bytes >= 1048576
    ? (bytes / 1048576).toFixed(1) + ' MB'
    : Math.max(1, Math.round(bytes / 1024)) + ' KB';
}

function isVideoFile(file) {
  return file.type.startsWith('video/') || /\.(mov|mp4|m4v|webm)$/i.test(file.name);
}

function makeSlide(file) {
  const url = URL.createObjectURL(file.blob);
  const video = isVideoFile(file);
  const wrapper = document.createElement('div');
  wrapper.className = 'dump-slide';

  const node = document.createElement(video ? 'video' : 'img');
  node.className = 'media';
  node.src = url;

  if (video) {
    node.autoplay = true;
    node.loop = true;
    node.playsInline = true;
    node.muted = muted;
    node.controls = false;
    node.addEventListener('click', () => {
      if (node.paused) node.play().catch(() => {});
      else node.pause();
    });
    node.addEventListener('error', () => {
      toast('This video format may not be supported on your iPhone.');
    });
  } else {
    node.alt = file.name;
    node.draggable = false;
  }

  wrapper.appendChild(node);
  return { el: wrapper, url };
}

function releaseSlide(slide) {
  if (!slide) return;
  const video = slide.el.querySelector('video');
  if (video) video.pause();
  slide.el.remove();
  URL.revokeObjectURL(slide.url);
}

function updateDetails() {
  const file = current();
  $('empty').classList.toggle('hidden', visible.length > 0);
  $('details').classList.toggle('hidden', !file);
  $('actions').classList.toggle('hidden', !file);
  $('swipeHint').classList.toggle('hidden', visible.length < 2);
  $('counter').textContent = `${visible.length ? idx + 1 : 0} / ${visible.length}`;

  ['all', 'favorites', 'shuffle'].forEach(id => {
    $(id).classList.toggle('active', mode === id);
  });

  if (!file) {
    $('empty').querySelector('h1').textContent = mode === 'favorites'
      ? 'No favorites yet.' : 'Your private feed.';
    $('empty').querySelector('p').textContent = mode === 'favorites'
      ? 'Tap the heart on an item to save it here.'
      : 'Add photos, videos, or GIFs from your iPhone. Swipe up or down to browse.';
    return;
  }

  $('filename').textContent = file.name;
  $('date').textContent = new Date(file.created).toLocaleDateString() + ' Â· ' + format(file.blob.size);
  $('fav').textContent = file.favorite ? 'â¥' : 'â¡';
  $('fav').classList.toggle('selected', !!file.favorite);
  $('mute').textContent = muted ? 'â))' : 'â«';
  $('mute').classList.toggle('hidden', !isVideoFile(file));
}

function render() {
  busy = false;
  touch = null;
  releaseSlide(incoming);
  releaseSlide(active);
  incoming = null;
  active = null;
  $('mediaMount').replaceChildren();

  const file = current();
  if (file) {
    active = makeSlide(file);
    $('mediaMount').appendChild(active.el);
    const video = active.el.querySelector('video');
    if (video) video.play().catch(() => {});
  }
  updateDetails();
}

function stageHeight() {
  return $('mediaMount').getBoundingClientRect().height || window.innerHeight;
}

function translate(slide, y) {
  if (slide) slide.el.style.transform = `translate3d(0, ${y}px, 0)`;
}

function prepareIncoming(direction) {
  releaseSlide(incoming);
  incoming = null;
  if (visible.length < 2) return;

  const nextIndex = (idx + direction + visible.length) % visible.length;
  const slide = makeSlide(visible[nextIndex]);
  incoming = { ...slide, index: nextIndex, direction };
  slide.el.style.transition = 'none';
  translate(slide, direction * stageHeight());
  $('mediaMount').appendChild(slide.el);
}

function settle(advance) {
  if (!active || !incoming || busy) return;
  busy = true;
  const from = active;
  const to = incoming;
  const height = stageHeight();
  const direction = to.direction;
  const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ? 0 : GLIDE_MS;
  const transition = `transform ${duration}ms ${GLIDE_EASE}`;

  from.el.style.transition = transition;
  to.el.style.transition = transition;

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    to.el.removeEventListener('transitionend', onEnd);

    if (advance) {
      releaseSlide(from);
      active = { el: to.el, url: to.url };
      idx = to.index;
      active.el.style.transition = 'none';
      translate(active, 0);
      updateDetails();
    } else {
      releaseSlide(to);
      from.el.style.transition = 'none';
      translate(from, 0);
    }
    incoming = null;
    busy = false;
  };

  const onEnd = event => {
    if (event.target === to.el && event.propertyName === 'transform') finish();
  };
  to.el.addEventListener('transitionend', onEnd);

  // Animate after the browser has registered the starting positions.
  requestAnimationFrame(() => {
    translate(from, advance ? -direction * height : 0);
    translate(to, advance ? 0 : direction * height);
  });

  // Also finish if iOS doesn't dispatch transitionend.
  setTimeout(finish, duration + 100);
}

function step(delta) {
  if (busy || touch || visible.length < 2 || !active) return;
  const direction = delta > 0 ? 1 : -1;
  prepareIncoming(direction);
  if (!incoming) return;
  // Force the offscreen starting position before triggering the glide.
  void incoming.el.offsetHeight;
  settle(true);
}

async function save(item) {
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(item);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function remove(id) {
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function importFiles(files) {
  const valid = [...files].filter(f =>
    f.type.startsWith('image/') ||
    f.type.startsWith('video/') ||
    /\.(gif|jpg|jpeg|png|webp|heic|heif|mov|mp4|m4v|webm)$/i.test(f.name)
  );
  if (!valid.length) {
    toast('Choose photo, GIF, or video files.');
    return;
  }

  let success = 0;
  toast(`Importing ${valid.length} item(s)â¦`);
  for (const f of valid) {
    try {
      await save({
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + '-' + Math.random(),
        name: f.name,
        type: f.type || (/\.(mov|mp4|m4v|webm)$/i.test(f.name) ? 'video/mp4' : 'image/jpeg'),
        blob: f,
        created: Date.now() + success,
        favorite: false
      });
      success++;
    } catch (err) {
      console.error(err);
      toast(`Storage full or blocked. Imported ${success}/${valid.length}.`);
      break;
    }
  }
  await refresh();
  idx = 0;
  render();
  if (success === valid.length) toast(`Added ${success} item(s) Â· stored on device`);
}

function showSheet() {
  const total = items.reduce((sum, x) => sum + x.blob.size, 0);
  $('stats').textContent = `${items.length} files Â· ${format(total)} stored on this device`;
  $('sort').textContent = `â Sort: ${newest ? 'newest' : 'oldest'} first`;
  $('delete').disabled = !current();
  $('sheet').classList.remove('hidden');
  $('sheetBackdrop').classList.remove('hidden');
}

function hideSheet() {
  $('sheet').classList.add('hidden');
  $('sheetBackdrop').classList.add('hidden');
}

function setMode(next) {
  mode = next;
  buildVisible();
  render();
}

function handleTouchStart(e) {
  if (busy || visible.length < 2 || e.touches.length !== 1) return;
  if (!$('sheet').classList.contains('hidden')) return;
  if (e.target.closest('button, input, #topbar, #sheet')) return;
  const point = e.touches[0];
  touch = {
    startX: point.clientX,
    startY: point.clientY,
    startedAt: Date.now(),
    dragging: false,
    blocked: false
  };
}

function handleTouchMove(e) {
  if (!touch || touch.blocked || e.touches.length !== 1 || busy) return;
  const point = e.touches[0];
  const dy = point.clientY - touch.startY;
  const dx = point.clientX - touch.startX;

  if (!touch.dragging) {
    if (Math.abs(dx) > 16 && Math.abs(dx) > Math.abs(dy)) {
      touch.blocked = true;
      return;
    }
    if (Math.abs(dy) < 10 || Math.abs(dy) < Math.abs(dx) * 1.2) return;
    touch.dragging = true;
  }

  e.preventDefault();
  if (Math.abs(dy) < 2) {
    translate(active, 0);
    if (incoming) translate(incoming, incoming.direction * stageHeight());
    return;
  }

  const direction = dy < 0 ? 1 : -1;
  if (!incoming || incoming.direction !== direction) prepareIncoming(direction);
  if (!incoming) return;

  const height = stageHeight();
  const distance = Math.max(-height, Math.min(height, dy));
  active.el.style.transition = 'none';
  incoming.el.style.transition = 'none';
  translate(active, distance);
  translate(incoming, direction * height + distance);
}

function handleTouchEnd(e) {
  if (!touch) return;
  const gesture = touch;
  touch = null;
  if (gesture.blocked || busy) return;

  const dy = e.changedTouches[0].clientY - gesture.startY;
  const dx = e.changedTouches[0].clientX - gesture.startX;

  if (!gesture.dragging) {
    if (Math.abs(dy) > 55 && Math.abs(dy) > Math.abs(dx) * 1.3) {
      step(dy < 0 ? 1 : -1);
    }
    return;
  }

  if (!incoming) return;
  const duration = Math.max(1, Date.now() - gesture.startedAt);
  const distance = Math.abs(dy);
  const required = Math.max(65, Math.min(130, stageHeight() * 0.15));
  const fastFlick = distance > 30 && distance / duration > 0.5;
  settle(distance > required || fastFlick);
}

async function start() {
  try {
    db = await initDB();
    await refresh();
    if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  } catch (e) {
    console.error(e);
    toast('Device storage is unavailable. Open via HTTPS in Safari.');
  }

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  const addMedia = () => {
    $('fileInput').value = '';
    $('fileInput').click();
  };
  $('addTop').onclick = addMedia;
  $('emptyAdd').onclick = addMedia;
  $('sheetAdd').onclick = addMedia;
  $('fileInput').onchange = e => {
    hideSheet();
    importFiles(e.target.files);
  };

  $('all').onclick = () => setMode('all');
  $('favorites').onclick = () => setMode('favorites');
  $('shuffle').onclick = () => setMode('shuffle');
  $('library').onclick = showSheet;
  $('more').onclick = showSheet;
  $('closeSheet').onclick = hideSheet;
  $('sheetBackdrop').onclick = hideSheet;

  $('fav').onclick = async () => {
    const file = current();
    if (!file) return;
    file.favorite = !file.favorite;
    await save(file);
    if (mode === 'favorites' && !file.favorite) buildVisible();
    render();
  };
  $('mute').onclick = () => {
    muted = !muted;
    render();
  };
  $('sort').onclick = () => {
    const id = current()?.id;
    newest = !newest;
    buildVisible(id);
    render();
    showSheet();
  };
  $('delete').onclick = async () => {
    const file = current();
    if (!file || !confirm(`Delete "${file.name}" from this app? Your original in Photos/Files is unaffected.`)) return;
    await remove(file.id);
    hideSheet();
    await refresh();
    toast('Removed from app');
  };

  const stage = $('stage');
  stage.style.touchAction = 'pan-x';
  stage.addEventListener('touchstart', handleTouchStart, { passive: true });
  stage.addEventListener('touchmove', handleTouchMove, { passive: false });
  stage.addEventListener('touchend', handleTouchEnd, { passive: true });
  stage.addEventListener('touchcancel', () => {
    touch = null;
    if (incoming && !busy) settle(false);
  }, { passive: true });

  document.addEventListener('keydown', e => {
    if (!$('sheet').classList.contains('hidden')) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      step(e.key === 'ArrowDown' ? 1 : -1);
    }
  });
  stage.addEventListener('wheel', e => {
    if (Math.abs(e.deltaY) > 20) step(e.deltaY > 0 ? 1 : -1);
  }, { passive: true });
}

start();
