// Двусторонний синк FEEDBACK.md <-> доска Buildin Feedback.
//   node sync-feedback.cjs          — bidirectional: превью + подтверждение
//   node sync-feedback.cjs --push   — только маркдаун -> доска
//   node sync-feedback.cjs --pull   — только доска -> маркдаун
//   node sync-feedback.cjs --dry    — только превью, без записи
//   node sync-feedback.cjs --yes --prefer-md   — неинтерактивно: споры в пользу маркдауна
// Связь записей: ID вида [FR-1]/[BUG-1] в начале заголовка карточки.
// Спорное (изменилось с двух сторон после синка и по-разному) — спрашиваем.
// Тело синкается поблочно (block update/append): свои параграфы правятся
// на месте, чужие типы блоков не трогаем. Ручные правки тела на доске —
// конфликт по общим правилам. (markdown put для строк базы отвечает 404.)
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const DIR = __dirname;
const DB_ID = 'aa0c5557-9a22-40b7-ac30-60848df3b947';
const MD_PATH = path.join(DIR, 'FEEDBACK.md');
const STATE_PATH = path.join(DIR, '.feedback-sync.json');
const BUILDIN = 'C:\\Users\\iliam\\AppData\\Local\\Programs\\Buildin\\bin\\buildin.exe';
const ENV = { ...process.env, BUILDIN_CONFIG_DIR: 'C:\\Users\\iliam\\.buildin' };

const MD2BOARD = { 'новое': null, 'сделать': 'Сделать', 'в работе': 'В работе', 'готово': 'Завершено' };
const BOARD2MD = { null: 'новое', undefined: 'новое', 'Сделать': 'сделать', 'В работе': 'в работе', 'Завершено': 'готово' };
let SYNC_STATE = { records: {} };

function cli(...args) {
  const out = execFileSync(BUILDIN, args, { env: ENV, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  return JSON.parse(out).data;
}
// body только через файл (Windows не переваривает инлайн-JSON)
function cliBody(cmd, ...args) {
  const i = args.indexOf('__BODY__');
  const f = path.join(DIR, '.fb-body-arg.json');
  fs.writeFileSync(f, JSON.stringify(args[i + 1]));
  const out = execFileSync(BUILDIN, [...args.slice(0, i), '--body', f, ...args.slice(i + 2)], { env: ENV, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  fs.unlinkSync(f);
  return JSON.parse(out).data;
}
const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();

// --- Markdown ---
function parseMD() {
  const text = fs.readFileSync(MD_PATH, 'utf8');
  const entries = [];
  const re = /^### (FR-\d+|BUG-\d+):\s*(.+?)\s*\(([^)]+)\)\s*$/gm;
  let m;
  const blocks = [];
  while ((m = re.exec(text))) blocks.push({ id: m[1], title: m[2], status: m[3], start: m.index });
  for (let i = 0; i < blocks.length; i++) {
    const bodyStart = text.indexOf('\n', blocks[i].start) + 1;
    let bodyEnd = text.length;
    const nextH = text.slice(bodyStart).search(/^#{2,3} /m);
    if (nextH >= 0) bodyEnd = bodyStart + nextH;
    entries.push({ ...blocks[i], body: text.slice(bodyStart, bodyEnd).trim() });
  }
  return entries;
}

function writeMD(entries, intro) {
  const fr = entries.filter((e) => e.id.startsWith('FR-'));
  const bugs = entries.filter((e) => e.id.startsWith('BUG-'));
  const render = (e) => `### ${e.id}: ${e.title} (${e.status})\n${e.body}\n`;
  const out = `${intro}\n## Фич-реквесты\n\n${fr.map(render).join('\n')}## Баг-репорты\n\n${bugs.length ? bugs.map(render).join('\n') : 'Пока пусто.\n'}`;
  fs.writeFileSync(MD_PATH, out);
}
function mdIntro() {
  const text = fs.readFileSync(MD_PATH, 'utf8');
  return text.slice(0, text.indexOf('## Фич-реквесты')).trim();
}

// --- Board ---
function boardPages() {
  const res = cliBody(0, '--json', 'database', 'query', DB_ID, '__BODY__', { page_size: 100 });
  return (res.results || res.pages || []).map((p) => {
    const props = p.properties || {};
    const titleArr = props['Заголовок']?.title || props.title?.title || [];
    const title = titleArr.map((t) => t.plain_text || '').join('');
    const cat = props['Категория']?.select?.name ?? null;
    return { id: p.id, title, category: cat, updated: p.last_edited_time };
  });
}
function childBlocks(id) {
  try {
    const res = cli('--json', 'block', 'children', id, '--page-size', '100');
    const out = [];
    for (const b of res.results || []) {
      if (b.type !== 'paragraph') { out.push({ id: b.id, text: null }); continue; } // чужой блок — не трогаем
      const s = (b.paragraph?.rich_text || []).map((x) => x.plain_text || '').join('');
      out.push({ id: b.id, text: s });
    }
    return out;
  } catch { return []; }
}
function childTexts(id) {
  return childBlocks(id).filter((b) => b.text).map((b) => b.text);
}
function pageBody(id) {
  try {
    const md = norm(cli('markdown', 'get', id).markdown || '');
    if (md) return md;
  } catch { /* строки базы отдают тело только через блоки */ }
  return norm(childTexts(id).join('\n'));
}
function para(text) {
  return { object: 'block', type: 'paragraph', paragraph: { rich_text: rich(text) } };
}
function updateBlock(blockId, text) {
  cliBody(0, '--json', 'block', 'update', blockId, '__BODY__', { paragraph: { rich_text: rich(text) } });
}
// Полный рерайт тела поблочно: свои параграфы правим на месте,
// недостающие дописываем, лишние гасим в пустую строку. Чужие типы блоков не трогаем.
// Возвращает 'manual', если пользователь менял тело на доске (тогда это конфликт/pull).
function setBody(id, text, mdId) {
  const lines = text.split('\n').map((s) => s.trim()).filter(Boolean);
  const cur = childBlocks(id);
  const snap = SYNC_STATE.records[mdId]?.blocks;
  if (snap && norm(cur.filter((b) => b.text).map((b) => b.text).join('\n')) !== norm(snap.map((b) => b.text).filter(Boolean).join('\n'))) return 'manual';
  const paras = cur.filter((b) => b.text !== null);
  const n = Math.min(paras.length, lines.length);
  for (let i = 0; i < n; i++) {
    if (paras[i].text !== lines[i]) updateBlock(paras[i].id, lines[i]);
  }
  if (lines.length > paras.length) {
    cliBody(0, '--json', 'block', 'append', id, '__BODY__', { children: lines.slice(paras.length).map(para) });
  } else if (paras.length > lines.length) {
    for (let i = lines.length; i < paras.length; i++) {
      if (paras[i].text !== '') updateBlock(paras[i].id, '');
    }
  }
  return 'ok';
}
function rich(text) {
  return [{ type: 'text', text: { content: text }, annotations: { bold: false, code: false, color: 'default', italic: false, strikethrough: false, underline: false } }];
}
function setTitle(id, title) {
  cliBody(0, '--json', 'page', 'update', id, '__BODY__', {
    properties: { 'Заголовок': { title: rich(title), type: 'title' } },
  });
}
function setCategory(id, name) {
  cliBody(0, '--json', 'page', 'update', id, '__BODY__', {
    properties: { 'Категория': name ? { select: { name }, type: 'select' } : { select: null, type: 'select' } },
  });
}
function pushBody(id, text, label) {
  const r = setBody(id, text);
  if (r === 'manual') console.log(`ВНИМАНИЕ [${label}]: тело на доске не пустое, правится вручную.`);
  return r;
}
function createCard(title, category, body) {
  const props = { 'Заголовок': { title: rich(title), type: 'title' } };
  if (category) props['Категория'] = { select: { name: category }, type: 'select' };
  const res = cliBody(0, '--json', 'page', 'create', '__BODY__', { parent: { database_id: DB_ID }, properties: props });
  const id = res.id || res.page?.id;
  if (body) pushBody(id, body, title);
  return id;
}

// --- Diff ---
function entryFullText(e) {
  return norm(`${e.title}\n${e.body}`);
}
async function main() {
  const args = new Set(process.argv.slice(2));
  const mdEntries = parseMD();
  const pages = boardPages();
  SYNC_STATE = fs.existsSync(STATE_PATH) ? JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) : { records: {} };
  const state = SYNC_STATE;

  // Сопоставление по [ID] в заголовке; пустые без ID — кандидаты на adoption
  const byId = new Map();
  const orphans = [];
  for (const p of pages) {
    const m = p.title.match(/^\[(FR-\d+|BUG-\d+)\]\s*/);
    if (m) byId.set(m[1], p);
    else orphans.push(p);
  }
  const bodies = new Map();
  for (const p of pages) bodies.set(p.id, pageBody(p.id));

  const ops = []; // {dir, kind, id, detail, apply}
  const mdIds = new Set(mdEntries.map((e) => e.id));

  // Adoption: md-записи без карточки забирают пустые orphan-страницы по порядку
  const adoptable = orphans.filter((p) => !norm(p.title));
  let adoptIdx = 0;
  const adopted = new Map(); // mdId -> page
  for (const e of mdEntries) {
    if (!byId.has(e.id) && adoptIdx < adoptable.length) {
      adopted.set(e.id, adoptable[adoptIdx++]);
      byId.set(e.id, adoptable[adoptIdx - 1]);
    }
  }

  for (const e of mdEntries) {
    const p = byId.get(e.id);
    const snap = state.records[e.id];
    if (!p) {
      ops.push({ dir: 'push', kind: 'create', id: e.id, detail: `создать карточку [${e.id}] ${e.title}`, apply: () => {
        const pid = createCard(`[${e.id}] ${e.title}`, MD2BOARD[e.status] || null, e.body);
        return { pageId: pid };
      } });
      continue;
    }
    const boardTitle = norm(p.title.replace(/^\[(FR-\d+|BUG-\d+)\]\s*/, ''));
    const boardStatus = BOARD2MD[p.category] || 'новое';
    const boardText = norm(`${boardTitle}\n${bodies.get(p.id)}`);
    const mdText = entryFullText(e);
    const mdChanged = !snap || snap.text !== mdText || snap.status !== e.status;
    const boardChanged = !snap || snap.boardText !== boardText || snap.boardStatus !== boardStatus;
    if (adopted.has(e.id)) {
      ops.push({ dir: 'push', kind: 'adopt', id: e.id, detail: `заполнить пустую карточку ${p.id.slice(0, 8)} ← [${e.id}] ${e.title}`, apply: () => {
        setTitle(p.id, `[${e.id}] ${e.title}`);
        setCategory(p.id, MD2BOARD[e.status] || null);
        pushBody(p.id, e.body, e.id);
        return { pageId: p.id };
      } });
      continue;
    }
    if (mdChanged && boardChanged && (mdText !== boardText || e.status !== boardStatus)) {
      ops.push({ dir: 'conflict', kind: 'conflict', id: e.id, detail: `MD(${e.status}): ${mdText.slice(0, 80)}… | BOARD(${boardStatus}): ${boardText.slice(0, 80)}…`, entry: e, page: p, boardText, boardStatus });
    } else if (!mdChanged && !boardChanged && (mdText !== boardText || e.status !== boardStatus)) {
      // Замороженное расхождение: слепок зафиксировал разные стороны как «норму».
      ops.push({ dir: 'conflict', kind: 'conflict', id: e.id, detail: `ЗАМОРОЗКА MD(${e.status}): ${mdText.slice(0, 80)}… | BOARD(${boardStatus}): ${boardText.slice(0, 80)}…`, entry: e, page: p, boardText, boardStatus });
    } else if (mdChanged && !args.has('--pull')) {
      ops.push({ dir: 'push', kind: 'update', id: e.id, detail: `доска ← [${e.id}] ${e.title} (${e.status})`, apply: () => {
        setTitle(p.id, `[${e.id}] ${e.title}`);
        setCategory(p.id, MD2BOARD[e.status] || null);
        pushBody(p.id, e.body, e.id);
        return { pageId: p.id };
      } });
    } else if (boardChanged && !args.has('--push')) {
      ops.push({ dir: 'pull', kind: 'update', id: e.id, detail: `MD ← [${e.id}] ${boardTitle} (${boardStatus})`, apply: null,
        pullData: { title: boardTitle || e.title, status: boardStatus, body: bodies.get(p.id).replace(new RegExp('^' + boardTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*'), '').trim() || e.body } });
    }
  }

  // Карточки с ID, которых нет в маркдауне → новые записи с доски
  const maxN = (pfx) => Math.max(0, ...mdEntries.filter((e) => e.id.startsWith(pfx)).map((e) => Number(e.id.split('-')[1])));
  let nextFr = maxN('FR-') + 1, nextBug = maxN('BUG-') + 1;
  for (const [id, p] of byId) {
    if (mdIds.has(id)) continue;
    const isBug = /баг|bug|ошибк|fix/i.test(p.title + ' ' + (bodies.get(p.id) || ''));
    const newId = isBug ? `BUG-${nextBug++}` : `FR-${nextFr++}`;
    const boardTitle = norm(p.title.replace(/^\[(FR-\d+|BUG-\d+)\]\s*/, '')) || 'Без названия';
    ops.push({ dir: 'pull', kind: 'create', id: newId, detail: `MD ← новая ${newId}: ${boardTitle} (со страницы ${p.id.slice(0, 8)})`, apply: null,
      pullData: { title: boardTitle, status: BOARD2MD[p.category] || 'новое', body: bodies.get(p.id) || 'Описание с доски.', pageId: p.id, rename: true } });
  }

  if (!ops.length) { console.log('Синк не нужен: всё совпадает.'); return; }
  console.log('=== Превью синка ===');
  for (const op of ops) console.log(`[${op.dir}${op.kind === 'conflict' ? ':СПОР' : ''}] ${op.detail}`);
  if (args.has('--dry')) return;

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise((r) => rl.question(q, r));
  const pullUpdates = new Map(); // mdId -> pullData
  const skipped = new Set();
  const autoYes = args.has('--yes');
  const prefer = args.has('--prefer-md') ? 'm' : args.has('--prefer-board') ? 'b' : null;
  for (const op of ops) {
    if (op.kind === 'conflict') {
      let ans = prefer;
      if (!ans && !autoYes) ans = (await ask(`СПОР ${op.id}: (m)arkdown / (b)oard? `)).trim().toLowerCase();
      if (!ans && autoYes) { console.log(`СПОР ${op.id}: пропущен (нужен --prefer-md/--prefer-board)`); skipped.add(op.id); continue; }
      if (ans === 'b') {
        pullUpdates.set(op.id, { title: norm(op.page.title.replace(/^\[(FR-\d+|BUG-\d+)\]\s*/, '')) || op.entry.title, status: op.boardStatus, body: op.boardText.replace(/^[^\n]*\n?/, '').trim() || op.entry.body });
      } // иначе остаётся версия маркдауна → пойдёт push ниже
    }
  }
  let go = autoYes ? 'y' : (await ask(`Применить ${ops.length} оп.? (y/n) `)).trim().toLowerCase();
  if (go !== 'y' && go !== 'д') { console.log('Отмена.'); rl.close(); return; }

  // push: доска
  for (const op of ops) {
    if ((op.dir === 'push') && !(op.kind === 'conflict')) {
      const r = op.apply();
      op._pageId = r.pageId;
    }
  }
  // conflicts, решённые в пользу markdown → push
  for (const op of ops) {
    if (op.kind === 'conflict' && !pullUpdates.has(op.id) && !skipped.has(op.id)) {
      const e = op.entry;
      setTitle(op.page.id, `[${e.id}] ${e.title}`);
      setCategory(op.page.id, MD2BOARD[e.status] || null);
      pushBody(op.page.id, e.body, e.id);
      op._pageId = op.page.id;
    }
  }
  // pull: маркдаун
  const mdMap = new Map(mdEntries.map((e) => [e.id, e]));
  for (const op of ops) {
    if (op.pullData || pullUpdates.has(op.id)) {
      const d = pullUpdates.get(op.id) || op.pullData;
      if (mdMap.has(op.id)) Object.assign(mdMap.get(op.id), { title: d.title, status: d.status, body: d.body });
      else mdEntries.push({ id: op.id, title: d.title, status: d.status, body: d.body });
      if (d.rename && d.pageId) {
        const cur = byId.get(op.id) || pages.find((p) => p.id === d.pageId);
        if (cur) setTitle(cur.id, `[${op.id}] ${d.title}`);
      }
    }
  }
  if ([...pullUpdates.keys()].length || ops.some((o) => o.dir === 'pull')) writeMD(mdEntries, mdIntro());

  // снепшот: обновляем только применённые/неизменные записи;
  // пропущенные споры оставляем как были, иначе расхождение «заморозится».
  const fresh = boardPages();
  const freshBodies = new Map();
  for (const p of fresh) freshBodies.set(p.id, pageBody(p.id));
  const snap = { updated: new Date().toISOString(), records: {} };
  const curMd = new Map(parseMD().map((e) => [e.id, e]));
  for (const p of fresh) {
    const m = p.title.match(/^\[(FR-\d+|BUG-\d+)\]/);
    if (!m || !curMd.has(m[1])) continue;
    if (skipped.has(m[1]) && SYNC_STATE.records[m[1]]) {
      snap.records[m[1]] = SYNC_STATE.records[m[1]];
      continue;
    }
    const e = curMd.get(m[1]);
    const bt = norm(p.title.replace(/^\[(FR-\d+|BUG-\d+)\]\s*/, ''));
    snap.records[m[1]] = {
      text: entryFullText(e), status: e.status,
      boardText: norm(`${bt}\n${freshBodies.get(p.id)}`), boardStatus: BOARD2MD[p.category] || 'новое',
      pageId: p.id,
      blocks: childBlocks(p.id).filter((b) => b.text !== null),
    };
  }
  fs.writeFileSync(STATE_PATH, JSON.stringify(snap, null, 1));
  rl.close();
  console.log('Готово. Сводка записана в .feedback-sync.json');
}

main().catch((e) => { console.error('ОШИБКА:', e.message); process.exit(1); });
