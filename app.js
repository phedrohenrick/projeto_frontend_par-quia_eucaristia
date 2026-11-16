const $ = (id) => document.getElementById(id);
const gallery = $('gallery');
const status = $('status');
const nav = $('sections-nav');
const viewer = $('viewer');
const viewerImg = $('viewer-img');

const thumbUrl = (id, w) => `https://lh3.googleusercontent.com/d/${id}=w${w}`;
// Versão JPG em resolução cheia gerada pelo Drive (as originais são HEIC, que muitos celulares não abrem).
const jpgUrl = (id) => `https://lh3.googleusercontent.com/d/${id}=s0`;
const jpgName = (name) => name.replace(/\.[^.]+$/, '') + '.jpg';
const GRID_SIZE = window.devicePixelRatio > 1 || window.innerWidth > 1400 ? 800 : 500;
const FULL_SIZE = 2000;

const DOWNLOAD_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0-5-5m5 5 5-5M4 19h16"/></svg>';

const plural = (n) => `${n} ${n === 1 ? 'foto' : 'fotos'}`;

let sections = [];
let list = []; // fotos da sessão aberta no visualizador
let current = -1;

async function load() {
  try {
    const res = await fetch('/api/photos');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Erro ao carregar as fotos.');

    sections = data.sections;
    $('count').textContent = plural(data.total);
    const link = $('folder-link');
    link.href = data.folderUrl;
    link.hidden = false;

    if (!sections.length) {
      status.textContent = 'As fotos ainda estão sendo enviadas. Volte em breve!';
      return;
    }
    status.textContent = '';
    renderNav();
    sections.forEach(renderSection);
    observeSections();
    openFromHash();
  } catch (err) {
    status.textContent = err.message;
  }
}

function renderNav() {
  if (sections.length < 2) return;
  for (const s of sections) {
    const a = document.createElement('a');
    a.href = `#${s.id}`;
    a.textContent = s.title;
    a.dataset.id = s.id;
    nav.append(a);
  }
  nav.hidden = false;
}

function renderSection(s) {
  const el = document.createElement('section');
  el.className = 'section';
  el.id = s.id;
  el.innerHTML = `
    <div class="section-head">
      <div><h2></h2><span class="n"></span></div>
      <a target="_blank" rel="noopener">${DOWNLOAD_ICON} Baixar sessão</a>
    </div>
    <div class="grid"></div>`;
  el.querySelector('h2').textContent = s.title;
  el.querySelector('.n').textContent = plural(s.photos.length);
  el.querySelector('.section-head a').href = s.folderUrl;

  const frag = document.createDocumentFragment();
  s.photos.forEach((p, i) => {
    const fig = document.createElement('figure');
    fig.className = 'tile';
    fig.style.setProperty('--r', (p.w / p.h).toFixed(4));

    const open = document.createElement('button');
    open.className = 'open';
    open.type = 'button';
    open.setAttribute('aria-label', `Ampliar foto ${i + 1} de ${s.title}`);
    open.addEventListener('click', () => openViewer(s, i));

    const img = document.createElement('img');
    img.loading = 'lazy';
    img.decoding = 'async';
    img.alt = '';
    img.addEventListener('load', () => img.classList.add('loaded'), { once: true });
    img.src = thumbUrl(p.id, GRID_SIZE);

    const dl = document.createElement('a');
    dl.className = 'dl';
    dl.href = jpgUrl(p.id);
    dl.setAttribute('aria-label', `Baixar ${jpgName(p.name)}`);
    dl.addEventListener('click', (e) => { e.preventDefault(); downloadPhoto(p, dl); });
    dl.innerHTML = DOWNLOAD_ICON;

    open.append(img);
    fig.append(document.createElement('i'), open, dl); // <i> reserva a altura do quadro
    frag.append(fig);
  });
  el.querySelector('.grid').append(frag);
  gallery.append(el);
}

// Destaca no menu a sessão que está na tela e mantém o botão visível no celular.
function observeSections() {
  if (nav.hidden) return;
  const links = new Map([...nav.querySelectorAll('a')].map((a) => [a.dataset.id, a]));
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        links.forEach((a) => a.removeAttribute('aria-current'));
        const a = links.get(e.target.id);
        a.setAttribute('aria-current', 'true');
        nav.scrollTo({ left: a.offsetLeft - (nav.clientWidth - a.offsetWidth) / 2, behavior: 'smooth' });
      }
    },
    { rootMargin: '-45% 0px -50% 0px' }
  );
  document.querySelectorAll('.section').forEach((el) => io.observe(el));
}

/* ---------- Download ---------- */

// No celular abre o menu de compartilhar ("Salvar imagem" manda para a galeria);
// no computador baixa o arquivo .jpg.
async function downloadPhoto(p, btn) {
  if (btn.getAttribute('aria-busy') === 'true') return;
  btn.setAttribute('aria-busy', 'true');
  try {
    const res = await fetch(jpgUrl(p.id));
    if (!res.ok) throw new Error(res.status);
    const blob = await res.blob();
    const file = new File([blob], jpgName(p.name), { type: 'image/jpeg' });

    const mobile = matchMedia('(hover: none)').matches;
    if (mobile && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return; // a pessoa fechou o menu
        // Sem permissão para compartilhar: cai no download normal abaixo.
      }
    }
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: file.name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch {
    window.open(jpgUrl(p.id), '_blank', 'noopener'); // último recurso: abre a foto
  } finally {
    btn.removeAttribute('aria-busy');
  }
}

$('viewer-download').addEventListener('click', (e) => {
  e.preventDefault();
  if (list[current]) downloadPhoto(list[current], e.currentTarget);
});

/* ---------- Visualizador ---------- */

function show(i) {
  if (i < 0 || i >= list.length) return;
  current = i;
  const p = list[i];

  // Mostra primeiro a miniatura (já em cache) e troca pela versão grande quando carregar.
  viewerImg.src = thumbUrl(p.id, GRID_SIZE);
  viewerImg.alt = p.name;
  const full = new Image();
  full.onload = () => { if (list[current] === p) viewerImg.src = full.src; };
  full.src = thumbUrl(p.id, FULL_SIZE);

  // Pré-carrega as vizinhas para a navegação ficar instantânea.
  [i - 1, i + 1].forEach((n) => { if (list[n]) new Image().src = thumbUrl(list[n].id, FULL_SIZE); });

  $('viewer-counter').textContent = `${viewer.dataset.title} · ${i + 1} de ${list.length}`;
  $('viewer-download').href = jpgUrl(p.id);
  $('viewer-prev').disabled = i === 0;
  $('viewer-next').disabled = i === list.length - 1;
  history.replaceState(null, '', `#foto=${p.id}`);
}

function openViewer(section, i) {
  list = section.photos;
  viewer.dataset.title = section.title;
  show(i);
  if (!viewer.open) viewer.showModal();
}

function closeViewer() {
  viewer.close();
}

viewer.addEventListener('close', () => {
  current = -1;
  viewerImg.removeAttribute('src');
  history.replaceState(null, '', location.pathname + location.search);
});

function openFromHash() {
  const m = location.hash.match(/^#foto=([\w-]+)$/);
  if (!m) return;
  for (const s of sections) {
    const i = s.photos.findIndex((p) => p.id === m[1]);
    if (i >= 0) return openViewer(s, i);
  }
}

$('viewer-close').addEventListener('click', closeViewer);
$('viewer-prev').addEventListener('click', () => show(current - 1));
$('viewer-next').addEventListener('click', () => show(current + 1));

viewer.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') show(current - 1);
  if (e.key === 'ArrowRight') show(current + 1);
});

// Clique fora da foto fecha.
viewer.querySelector('.viewer-stage').addEventListener('click', (e) => {
  if (e.target.classList.contains('viewer-stage')) closeViewer();
});

// Deslizar para os lados no celular.
let startX = null;
viewer.addEventListener('touchstart', (e) => {
  startX = e.touches.length === 1 ? e.touches[0].clientX : null;
}, { passive: true });
viewer.addEventListener('touchend', (e) => {
  if (startX === null) return;
  const dx = e.changedTouches[0].clientX - startX;
  if (Math.abs(dx) > 50) show(current + (dx < 0 ? 1 : -1));
  startX = null;
});

/* ---------- Vídeo da capa ---------- */

const video = $('cover-video');
const sound = $('sound');
if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
  video.removeAttribute('autoplay');
  video.pause();
  video.controls = true;
}
sound.addEventListener('click', () => {
  video.muted = !video.muted;
  if (!video.muted && video.paused) video.play();
  sound.setAttribute('aria-pressed', String(!video.muted));
  sound.querySelector('span').textContent = video.muted ? 'Ativar som' : 'Som ativado';
});

load();
