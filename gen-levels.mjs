// Генератор уровней v2 (по result research/ZIGZAG_RAMP.md, приложение).
// Ключ сложности — плотность ложных ходов (decoy/cell), а не score/nodes.
//   змея -> decoyCosts -> optimalWaypoints -> sealUniqueness -> ведро пака
//
// Паки 10x10 (T/P/Э/О — структурой, метрики — ведрами):
//   П1 1-10 4x4 | П2 11-20 5x5 | П3 21-30 5x5 | П4 31-40 5x5 | П5 41-50 6x6
//   П6 51-60 6x6 | П7 61-70 6x6 | П8 71-80 7x7 | П9 81-90 7x7 | П10 91-100 7x7
//
// Запуск: node gen-levels.mjs [--smoke]

import { writeFileSync } from 'node:fs';

// size, K range, maxGap band, straightDecoys min, maxWalls — из шторма §2-3
const PACKS = [
  { size: 4, count: 10, k: [4, 4], gap: [6, 7], straight: 0, maxWalls: 2 },
  { size: 5, count: 10, k: [5, 8], gap: [6, 7], straight: 0, maxWalls: 4 },
  { size: 5, count: 10, k: [5, 8], gap: [7, 8], straight: 3, maxWalls: 4 },
  { size: 5, count: 10, k: [5, 8], gap: [8, 9], straight: 0, maxWalls: 4 },
  { size: 6, count: 10, k: [6, 10], gap: [7, 8], straight: 5, maxWalls: 6 },
  { size: 6, count: 10, k: [6, 10], gap: [8, 9], straight: 0, maxWalls: 6 },
  { size: 6, count: 10, k: [6, 10], gap: [9, 10], straight: 0, maxWalls: 6 },
  { size: 7, count: 10, k: [7, 12], gap: [8, 9], straight: 7, maxWalls: 12 },
  { size: 7, count: 10, k: [7, 12], gap: [9, 10], straight: 0, maxWalls: 12 },
  { size: 7, count: 10, k: [7, 12], gap: [10, 11], straight: 9, maxWalls: 12 },
];

const MAX_ATTEMPTS = 3000;
const SOLVER_CAP = 150000;

function hashSeed(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return hash >>> 0;
}
function randomSource(seed) {
  return () => {
    seed += 0x6d2b79f5;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const randInt = (random, min, max) => min + Math.floor(random() * (max - min + 1));

const gridNeighbors = (size, cell) => {
  const r = Math.floor(cell / size), c = cell % size, out = [];
  if (r > 0) out.push(cell - size);
  if (r < size - 1) out.push(cell + size);
  if (c > 0) out.push(cell - 1);
  if (c < size - 1) out.push(cell + 1);
  return out;
};
const edgeKey = (a, b) => (a < b ? `${a}:${b}` : `${b}:${a}`);

function makeSolution(size, random) {
  let solution = [];
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++) solution.push(r * size + (r % 2 ? size - 1 - c : c));
  for (let i = 0; i < 500; i++) {
    if (random() < 0.5) solution.reverse();
    const candidates = gridNeighbors(size, solution[0]).filter((cell) => cell !== solution[1]);
    if (!candidates.length) continue;
    const joinAt = solution.indexOf(candidates[Math.floor(random() * candidates.length)]);
    solution = solution.slice(0, joinAt).reverse().concat(solution.slice(joinAt));
  }
  return solution;
}

// Сколько раз клетка была бы допустимым ЛОЖНЫМ ходом (по решению)
function decoyCosts(size, solution) {
  const cost = new Array(size * size).fill(0);
  const visited = new Set([solution[0]]);
  for (let i = 1; i < solution.length; i++) {
    const head = solution[i - 1], correct = solution[i];
    for (const n of gridNeighbors(size, head))
      if (!visited.has(n) && n !== correct) cost[n]++;
    visited.add(correct);
  }
  return cost;
}

// K-2 самых «неуловимых» клеток, но с разбегом: решение делим на K-1
// отрезков, в каждом берём мин. cost (иначе picks кластеризуются и maxGap улетает).
function optimalWaypoints(solution, cost, K) {
  const n = solution.length;
  const positions = [0];
  for (let j = 1; j < K - 1; j++) {
    const center = Math.round((j * (n - 1)) / (K - 1));
    const half = Math.max(1, Math.floor((n - 1) / (K - 1) / 2));
    let best = center, bc = Infinity;
    for (let p = Math.max(1, center - half); p <= Math.min(n - 2, center + half); p++) {
      if (positions.includes(p)) continue;
      if (cost[solution[p]] < bc) { bc = cost[solution[p]]; best = p; }
    }
    positions.push(best);
  }
  positions.push(n - 1);
  positions.sort((a, b) => a - b);
  const numbers = {};
  positions.forEach((pos, i) => { numbers[solution[pos]] = i + 1; });
  return { numbers, positions };
}

function buildNeighbors(size, walls) {
  const blocked = new Set(walls.map(([a, b]) => edgeKey(a, b)));
  return Array.from({ length: size * size }, (_, cell) =>
    gridNeighbors(size, cell).filter((nb) => !blocked.has(edgeKey(cell, nb))));
}

// DFS до первых `limit` полных путей. completed=false, если упёрлись в кап —
// тогда found.length===1 НЕ гарантирует единственность!
function solvePaths(size, numbers, walls, maxNum, limit = 2) {
  const total = size * size;
  const neighbors = buildNeighbors(size, walls);
  const end = Number(Object.entries(numbers).find(([, n]) => n === maxNum)[0]);
  const start = Number(Object.entries(numbers).find(([, n]) => n === 1)[0]);
  const visited = new Uint8Array(total);
  const route = [start];
  visited[start] = 1;
  const found = [];
  let nodes = 0;
  let capped = false;
  const deadline = Date.now() + 1500;
  function viable(current) {
    for (let cell = 0; cell < total; cell++) {
      if (visited[cell]) continue;
      let degree = 0;
      for (const nb of neighbors[cell]) if (!visited[nb] || nb === current) degree++;
      if (degree < (cell === end ? 1 : 2)) return false;
    }
    const seen = new Uint8Array(total);
    const stack = [current];
    seen[current] = 1;
    let count = 0;
    while (stack.length) {
      const cell = stack.pop();
      count++;
      for (const nb of neighbors[cell]) {
        if (!seen[nb] && !visited[nb]) { seen[nb] = 1; stack.push(nb); }
      }
    }
    return count === total - route.length + 1;
  }
  function search(current, needed) {
    if (found.length >= limit || Date.now() > deadline) return;
    if (++nodes > SOLVER_CAP) { capped = true; return; }
    if ((nodes & 63) === 0 && !viable(current)) return;
    if (route.length === total) {
      if (current === end && needed === maxNum + 1) found.push([...route]);
      return;
    }
    const cands = neighbors[current]
      .filter((cell) => !visited[cell] && (!(cell in numbers) || numbers[cell] === needed) && (cell !== end || route.length === total - 1))
      .sort((a, b) => neighbors[a].filter((c) => !visited[c]).length - neighbors[b].filter((c) => !visited[c]).length);
    for (const cell of cands) {
      visited[cell] = 1; route.push(cell);
      search(cell, needed + (cell in numbers ? 1 : 0));
      route.pop(); visited[cell] = 0;
      if (found.length >= limit || Date.now() > deadline) return;
    }
  }
  search(start, numbers[start] === 1 ? 2 : 1);
  return { found, nodes, completed: !capped && found.length < limit };
}

// Точечные стенки: якорь — ЭТАЛОННОЕ решение (его рёбра неприкосновенны,
// иначе _solution/hint протухнут). Пока решений >1 — стенка на ребро чужого
// пути с мин. суммарным cost (бьём дешёвые ложные ходы).
function sealUniqueness(size, numbers, solution, cost, maxNum, maxWalls) {
  const walls = [];
  const keep = new Set(solution.slice(1).map((c, i) => edgeKey(solution[i], c)));
  for (let guard = 0; guard < maxWalls * 2 + 4; guard++) {
    const res = solvePaths(size, numbers, walls, maxNum, 2);
    // Единственность засчитываем только при полном переборе без капа,
    // и единственный путь обязан совпадать с эталоном
    if (res.found.length === 1 && res.completed) {
      const only = res.found[0];
      if (only.length === solution.length && only.every((c, i) => c === solution[i]))
        return { ok: true, walls, nodes: res.nodes };
      return { ok: false, walls, nodes: res.nodes };
    }
    if (!res.found.length) return { ok: false, walls, nodes: res.nodes };
    const cands = new Set();
    for (const other of res.found)
      for (let i = 1; i < other.length; i++) {
        const e = edgeKey(other[i - 1], other[i]);
        if (!keep.has(e)) cands.add(e);
      }
    if (!cands.size || walls.length >= maxWalls) return { ok: false, walls, nodes: res.nodes };
    let best = null, bs = Infinity;
    for (const e of cands) {
      const [a, b] = e.split(':').map(Number);
      if (cost[a] + cost[b] < bs) { bs = cost[a] + cost[b]; best = e; }
    }
    walls.push(best.split(':').map(Number));
  }
  return { ok: false, walls, nodes: 0 };
}

// Метрики по решению С УЧЁТОМ стенок (на открытом поле decoys — инвариант
// размера и дисперсии нет; именно стенки создают разброс сложности).
function measure(size, solution, positions, walls, numbers) {
  const n = solution.length;
  const blocked = new Set(walls.map(([a, b]) => edgeKey(a, b)));
  const free = (cell) => gridNeighbors(size, cell).filter((c) => !blocked.has(edgeKey(cell, c)));
  const visited = new Set([solution[0]]);
  let decoys = 0, forks = 0, straight = 0;
  let needed = numbers[solution[0]] === 1 ? 2 : 1;
  const end = solution[n - 1];
  const dir = (a, b) => [Math.floor(b / size) - Math.floor(a / size), (b % size) - (a % size)];
  let turns = 0;
  for (let i = 2; i < n; i++) {
    const [dr1, dc1] = dir(solution[i - 2], solution[i - 1]);
    const [dr2, dc2] = dir(solution[i - 1], solution[i]);
    if (dr1 !== dr2 || dc1 !== dc2) turns++;
  }
  for (let i = 1; i < n; i++) {
    const head = solution[i - 1], correct = solution[i];
    // Опции как их видит игрок: сквозь будущие флажки ходить нельзя
    const options = free(head).filter((c) => !visited.has(c) && (!(c in numbers) || numbers[c] === needed) && (c !== end || i === n - 1));
    decoys += Math.max(0, options.length - 1);
    if (options.length >= 2) forks++;
    if (i >= 2) {
      const [dr, dc] = dir(solution[i - 2], head);
      if (options.some((c) => { const [r2, c2] = dir(head, c); return r2 === dr && c2 === dc && c !== correct; })) straight++;
    }
    visited.add(correct);
    if (correct in numbers) needed = numbers[correct] + 1;
  }
  let maxGap = 0;
  for (let i = 1; i < positions.length; i++) maxGap = Math.max(maxGap, positions[i] - positions[i - 1]);
  return { decoys, forks, straight, maxGap, turns, decoyPerCell: decoys / n };
}

function genCandidate(pack, attempt) {
  const { size } = pack;
  const random = randomSource(hashSeed(`zigzag-v2-${size}-${attempt}`));
  const solution = makeSolution(size, random);
  const cost = decoyCosts(size, solution);
  const K = randInt(random, pack.k[0], pack.k[1]);
  const { numbers, positions } = optimalWaypoints(solution, cost, K);
  const maxNum = K;
  const seal = sealUniqueness(size, numbers, solution, cost, maxNum, pack.maxWalls);
  if (!seal.ok) return null;
  const m = measure(size, solution, positions, seal.walls, numbers);
  return {
    size, numbers, walls: seal.walls, solution, positions,
    m: { ...m, walls: seal.walls.length, solverNodes: seal.nodes, score: Math.round(m.decoyPerCell * 1000) },
  };
}

function main() {
  const smoke = process.argv.includes('--smoke');
  const packs = smoke ? PACKS.map((p) => ({ ...p, count: 1 })) : PACKS;
  const levels = [];
  let id = 1;
  let prevMedian = 0;
  for (let pi = 0; pi < packs.length; pi++) {
    const pack = packs[pi];
    const POOL = 80;
    const pool = [];
    let attempt = 0;
    const t0 = Date.now();
    // Дёшево копим пул уникальных, дорого отбираем под ведро
    while (pool.length < POOL && attempt < POOL * 40) {
      attempt++;
      const cand = genCandidate(pack, pi * 100003 + attempt * 7919);
      if (cand) pool.push(cand);
    }
    const [glo, ghi] = pack.gap;
    const minDecoy = Math.max(0, prevMedian - 0.03);
    const mid = (glo + ghi) / 2;
    const key = (c) => JSON.stringify([c.size, c.numbers, c.walls]);
    const seenPack = new Set();
    // Отбор: пол minDecoy ЖЁСТКИЙ (без bypass — иначе медианы проседают);
    // не хватает — расширяем пул, а не снижаем планку. Полоса и straight слабнут.
    let chosen = [];
    let slack = 0;
    let guard = 0;
    while (chosen.length < pack.count && guard++ < 6) {
      if (slack >= 3 && pool.length < POOL * 3) {
        // Добираем пул вместо снижения пола
        let extra = 0;
        while (pool.length < POOL * 3 && extra++ < POOL * 40) {
          attempt++;
          const cand = genCandidate(pack, pi * 100003 + attempt * 7919);
          if (cand) pool.push(cand);
        }
      }
      const band = (ghi - glo) / 2 + Math.min(slack, 2) + 1;
      chosen = pool
        .filter((c) => c.m.decoyPerCell >= minDecoy)
        .filter((c) => Math.abs(c.m.maxGap - mid) <= band)
        .sort((a, b) => (b.m.decoyPerCell - a.m.decoyPerCell) || (b.m.straight - a.m.straight))
        .filter((c) => { const k = key(c); if (seenPack.has(k)) return false; seenPack.add(k); return true; })
        .slice(0, pack.count);
      if (chosen.length < pack.count) { seenPack.clear(); slack++; }
    }
    if (chosen.length < pack.count)
      throw new Error(`Пак ${pi + 1} (${pack.size}x${pack.size}): отобрано ${chosen.length}/${pack.count} из пула ${pool.length}`);
    // Внутри пака — по возрастанию (рампа)
    chosen.sort((a, b) => a.m.decoyPerCell - b.m.decoyPerCell || a.m.straight - b.m.straight);
    const ds = chosen.map((c) => c.m.decoyPerCell).sort((a, b) => a - b);
    prevMedian = ds[Math.floor(ds.length / 2)];
    for (const cand of chosen) {
      levels.push({
        id: id++,
        size: cand.size,
        numbers: cand.numbers,
        walls: cand.walls,
        hint: cand.solution[1],
        metrics: cand.m,
        _solution: cand.solution,
      });
    }
    const dsv = chosen.map((c) => c.m.decoyPerCell);
    console.log(`Пак ${pi + 1} (${pack.size}x${pack.size}): ${pack.count} ур., пул ${pool.length}/${attempt}, decoy/cell ${Math.min(...dsv).toFixed(2)}–${Math.max(...dsv).toFixed(2)}, ${Date.now() - t0} мс`);
  }
  writeFileSync(new URL('./levels.json', import.meta.url), JSON.stringify(levels, null, 1));
  const uniq = new Set(levels.map((l) => JSON.stringify([l.size, l.numbers, l.walls]))).size;
  console.log(`Готово: ${levels.length} уровней, уникальных ${uniq}. Файл levels.json`);
}

main();
