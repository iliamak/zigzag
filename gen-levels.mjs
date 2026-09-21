// Генератор уровней для Pikabu-версии «шага».
// Фабрика + контролёр (generate-and-test):
//   змея-гамильтониан -> флажки -> стенки -> решатель (единственность + метрики)
//   -> раскладка по ведрам -> levels.json
//
// Запуск:
//   node gen-levels.mjs --smoke   — по 1 уровню на размер, проверка скорости решателя
//   node gen-levels.mjs           — все 100 уровней по лесенке из PIKABU_PLAN.md
//
// Лесенка: 1–10: 4x4 / 11–35: 5x5 / 36–70: 6x6 / 71–100: 7x7.

import { writeFileSync } from 'node:fs';

const LADDER = [
  { size: 4, count: 10, waypoints: [4, 4], walls: [0, 1] },
  { size: 5, count: 25, waypoints: [5, 6], walls: [1, 3] },
  { size: 6, count: 35, waypoints: [7, 8], walls: [2, 4] },
  { size: 7, count: 30, waypoints: [8, 9], walls: [3, 6] },
];

const MAX_ATTEMPTS_PER_LEVEL = 400;
const SOLVER_NODE_CAP = 300_000; // стоп решателя: кандидат отклоняется

// --- RNG (тот же mulberry-подобный, что в index.html) ---
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

// --- Сетка ---
const gridNeighbors = (size, cell) => {
  const r = Math.floor(cell / size), c = cell % size, out = [];
  if (r > 0) out.push(cell - size);
  if (r < size - 1) out.push(cell + size);
  if (c > 0) out.push(cell - 1);
  if (c < size - 1) out.push(cell + 1);
  return out;
};
const edgeKey = (a, b) => (a < b ? `${a}:${b}` : `${b}:${a}`);

// --- Змея: змейка + backbite (порт из index.html) ---
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

// --- Флажки: равномерно вдоль решения + джиттер ---
function placeWaypoints(solution, count, random) {
  const n = solution.length, positions = [0];
  for (let k = 1; k < count - 1; k++) {
    const ideal = Math.round((k * (n - 1)) / (count - 1));
    const lo = positions[k - 1] + 1;
    const hi = n - (count - k);
    positions.push(Math.max(lo, Math.min(hi, ideal + randInt(random, -2, 2))));
  }
  positions.push(n - 1);
  const numbers = {};
  positions.forEach((pos, i) => { numbers[solution[pos]] = i + 1; });
  return { numbers, positions };
}

// --- Стенки: случайные рёбра вне решения ---
function placeWalls(size, solution, count, random) {
  const solutionEdges = new Set(solution.slice(1).map((cell, i) => edgeKey(solution[i], cell)));
  const possible = [];
  for (let cell = 0; cell < size * size; cell++)
    for (const nb of gridNeighbors(size, cell))
      if (nb > cell && !solutionEdges.has(edgeKey(cell, nb))) possible.push([cell, nb]);
  for (let i = possible.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [possible[i], possible[j]] = [possible[j], possible[i]];
  }
  return possible.slice(0, count);
}

// --- Решатель: DFS с прунингом, считает решения до 2 ---
function solve(size, numbers, walls, start) {
  const total = size * size;
  const blocked = new Set(walls.map(([a, b]) => edgeKey(a, b)));
  const neighbors = Array.from({ length: total }, (_, cell) =>
    gridNeighbors(size, cell).filter((nb) => !blocked.has(edgeKey(cell, nb))));
  const maxNum = Math.max(...Object.values(numbers));
  const visited = new Uint8Array(total);
  let solutions = 0, nodes = 0, timedOut = false;

  // Связность непосещённых от головы: дешёвый прунинг каждые несколько шагов
  function connected(head, left) {
    if (left === 0) return true;
    const seen = new Uint8Array(total);
    const stack = [head];
    seen[head] = 1;
    let reach = 0;
    while (stack.length) {
      const cell = stack.pop();
      for (const nb of neighbors[cell]) {
        if (visited[nb] || seen[nb]) continue;
        // через пронумерованные клетки проходить можно только если это следующий флажок —
        // грубая проверка: считаем проходимой, точность даёт основной DFS
        seen[nb] = 1; reach++;
        stack.push(nb);
      }
    }
    return reach >= left;
  }

  function dfs(head, next, depth) {
    if (timedOut || solutions >= 2) return;
    if (++nodes > SOLVER_NODE_CAP) { timedOut = true; return; }
    const left = total - depth;
    if (depth % 6 === 0 && !connected(head, left)) return;
    if (left === 0) {
      if (next === maxNum + 1) solutions++;
      return;
    }
    for (const nb of neighbors[head]) {
      if (visited[nb]) continue;
      const num = numbers[nb];
      if (num !== undefined && num !== next) continue; // чужой флажок — нельзя
      if (num === maxNum && left !== 1) continue; // финиш только последней клеткой
      visited[nb] = 1;
      dfs(nb, num !== undefined ? next + 1 : next, depth + 1);
      visited[nb] = 0;
      if (timedOut || solutions >= 2) return;
    }
  }

  visited[start] = 1;
  const startNum = numbers[start] === 1 ? 2 : 1;
  dfs(start, startNum, 1);
  return { solutions, nodes, timedOut };
}

// --- Метрики сложности ---
function metrics(size, solution, positions, walls, solverNodes) {
  let turns = 0;
  const dir = (a, b) => [Math.floor(b / size) - Math.floor(a / size), (b % size) - (a % size)];
  for (let i = 2; i < solution.length; i++) {
    const [dr1, dc1] = dir(solution[i - 2], solution[i - 1]);
    const [dr2, dc2] = dir(solution[i - 1], solution[i]);
    if (dr1 !== dr2 || dc1 !== dc2) turns++;
  }
  let maxGap = 0;
  for (let i = 1; i < positions.length; i++) maxGap = Math.max(maxGap, positions[i] - positions[i - 1]);
  return {
    solverNodes,
    turns,
    maxGap,
    walls: walls.length,
    // скор сложности: усилия решателя + длина самого свободного сегмента
    score: Math.round(solverNodes / 100) + maxGap * 10 + walls.length * 5,
  };
}

function genCandidate(bucket, attempt) {
  const { size } = bucket;
  const random = randomSource(hashSeed(`pikabu-${size}-${attempt}`));
  const solution = makeSolution(size, random);
  const wCount = randInt(random, bucket.waypoints[0], bucket.waypoints[1]);
  const { numbers, positions } = placeWaypoints(solution, wCount, random);
  const walls = placeWalls(size, solution, randInt(random, bucket.walls[0], bucket.walls[1]), random);
  const res = solve(size, numbers, walls, solution[0]);
  if (res.timedOut || res.solutions !== 1) return null; // брак: неединственное или слишком тяжёлое
  return { size, numbers, walls, solution, m: metrics(size, solution, positions, walls, res.nodes) };
}

function main() {
  const smoke = process.argv.includes('--smoke');
  const levels = [];
  let id = 1;
  for (const bucket of LADDER) {
    const need = smoke ? 1 : bucket.count;
    const accepted = [];
    let attempt = 0;
    const t0 = Date.now();
    while (accepted.length < need && attempt < need * MAX_ATTEMPTS_PER_LEVEL) {
      attempt++;
      const cand = genCandidate(bucket, attempt * 7919 + bucket.size);
      if (cand) accepted.push(cand);
    }
    if (accepted.length < need)
      throw new Error(`Ведро ${bucket.size}x${bucket.size}: набрано ${accepted.length}/${need} за ${attempt} попыток`);
    accepted.sort((a, b) => a.m.score - b.m.score); // лёгкие раньше — плавный рамп
    for (const cand of accepted.slice(0, need)) {
      levels.push({
        id: id++,
        size: cand.size,
        numbers: cand.numbers, // {клетка: флажок}
        walls: cand.walls,     // [[a,b]]
        hint: cand.solution[1], // первая подсказка с пустого поля (мгновенно, без перебора)
        metrics: cand.m,
        // solution НЕ отдаём в билд (спойлер), храним только для selftest:
        _solution: cand.solution,
      });
    }
    console.log(`${bucket.size}x${bucket.size}: ${need} уровней, попыток ${attempt}, ${Date.now() - t0} мс`);
  }
  writeFileSync(new URL('./levels.json', import.meta.url), JSON.stringify(levels, null, 1));
  const uniq = new Set(levels.map((l) => JSON.stringify([l.size, l.numbers, l.walls]))).size;
  console.log(`Готово: ${levels.length} уровней, уникальных ${uniq}. Файл levels.json`);
  // Мини-гейт: все решения единственны (уже проверено решателем), размеры по лесенке
  const sizes = levels.map((l) => l.size).join(',');
  console.log(`Лесенка: ${sizes}`);
}

main();
