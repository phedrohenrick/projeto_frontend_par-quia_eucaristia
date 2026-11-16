// Função serverless da Vercel: lista as fotos da pasta do Google Drive, separadas por sessão.
// Cada subpasta da pasta principal vira uma sessão no site (Meninos, Meninas, ...).
// A chave da API fica só aqui no servidor (variável de ambiente), nunca no navegador.

const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const MAX_DEPTH = 3; // subpastas dentro das sessões também entram (na mesma sessão)

// Ordem e nome de exibição das sessões conhecidas (comparação sem acento/maiúscula).
// Pastas com outros nomes aparecem depois destas, em ordem alfabética.
const SECTION_ORDER = ['cerimonia', 'meninas', 'meninos', 'familias'];
const SECTION_LABELS = {
  meninos: 'Meninos',
  meninas: 'Meninas',
  cerimonia: 'Cerimônia',
  familias: 'Famílias',
};

const normalize = (s) =>
  s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
const slugify = (s) => normalize(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function listChildren(folderId, key) {
  const files = [];
  let pageToken;
  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields:
        'nextPageToken, files(id, name, mimeType, imageMediaMetadata(width, height, rotation, time))',
      pageSize: '1000',
      orderBy: 'name_natural',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
      key,
    });
    if (pageToken) params.set('pageToken', pageToken);

    const res = await fetch(`${DRIVE_API}?${params}`);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Google Drive respondeu ${res.status}: ${body}`);
    }
    const data = await res.json();
    files.push(...(data.files || []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return files;
}

// section = pasta de primeiro nível em que a foto está (null = solta na pasta principal)
async function collect(folderId, key, section, depth, out) {
  const children = await listChildren(folderId, key);
  const subfolders = [];

  for (const f of children) {
    if (f.mimeType === FOLDER_MIME) {
      subfolders.push(f);
    } else if (f.mimeType?.startsWith('image/')) {
      const meta = f.imageMediaMetadata || {};
      const rotated = meta.rotation === 1 || meta.rotation === 3;
      const w = (rotated ? meta.height : meta.width) || 4;
      const h = (rotated ? meta.width : meta.height) || 3;
      out.push({ id: f.id, name: f.name, w, h, time: meta.time || null, section });
    }
  }

  if (depth < MAX_DEPTH) {
    await Promise.all(
      subfolders.map((sf) =>
        collect(sf.id, key, section || { id: sf.id, name: sf.name }, depth + 1, out)
      )
    );
  }
}

const byTimeThenName = (a, b) => {
  if (a.time && b.time && a.time !== b.time) return a.time < b.time ? -1 : 1;
  return a.name.localeCompare(b.name, 'pt-BR', { numeric: true });
};

function rank(name) {
  const i = SECTION_ORDER.indexOf(normalize(name));
  return i === -1 ? SECTION_ORDER.length : i;
}

export default async function handler(req, res) {
  const key = process.env.GOOGLE_API_KEY;
  const folderId = process.env.DRIVE_FOLDER_ID;

  if (!key || !folderId) {
    res.status(500).json({
      error: 'Configure GOOGLE_API_KEY e DRIVE_FOLDER_ID nas variáveis de ambiente.',
    });
    return;
  }

  try {
    const photos = [];
    await collect(folderId, key, null, 0, photos);

    const groups = new Map();
    for (const p of photos) {
      const k = p.section?.id || 'root';
      if (!groups.has(k)) groups.set(k, { folder: p.section, photos: [] });
      groups.get(k).photos.push(p);
    }

    const sections = [...groups.values()]
      .map(({ folder, photos }) => {
        const name = folder ? folder.name : 'Outras fotos';
        const title = SECTION_LABELS[normalize(name)] || name;
        return {
          id: slugify(title) || 'sessao',
          title,
          rank: folder ? rank(name) : SECTION_ORDER.length + 1,
          folderUrl: `https://drive.google.com/drive/folders/${folder ? folder.id : folderId}`,
          photos: photos.sort(byTimeThenName).map(({ id, name, w, h }) => ({ id, name, w, h })),
        };
      })
      .sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title, 'pt-BR'))
      .map(({ rank, ...s }) => s);

    // Cache na CDN da Vercel por 5 min: aguenta muitos visitantes sem estourar a cota do Google.
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');
    res.status(200).json({
      sections,
      total: photos.length,
      folderUrl: `https://drive.google.com/drive/folders/${folderId}`,
    });
  } catch (err) {
    console.error(err);
    res.status(502).json({
      error:
        'Não foi possível carregar as fotos do Google Drive. Verifique se a pasta está compartilhada como "Qualquer pessoa com o link".',
    });
  }
}
