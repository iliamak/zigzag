// Сборка уровней для билда: вычищает _solution (спойлеры) из levels.json.
//   node build-levels.mjs           — levels.json -> levels.build.json (+ grep-гейт)
// В dev используется полный levels.json (с _solution для selftest),
// в билд игры запекается только levels.build.json.

import { readFileSync, writeFileSync } from 'node:fs';

const SRC = new URL('./levels.json', import.meta.url);
const DST = new URL('./levels.build.json', import.meta.url);

const levels = JSON.parse(readFileSync(SRC, 'utf8'));

const stripped = levels.map(({ _solution, ...rest }) => rest);
writeFileSync(DST, JSON.stringify(stripped));

// Grep-гейт: ни одного ключа _solution в вычищенном файле
const out = readFileSync(DST, 'utf8');
if (out.includes('_solution')) {
  console.error('ГЕЙТ ПРОВАЛЕН: в levels.build.json остался _solution');
  process.exit(1);
}

// Санити-гейт: у каждого уровня есть id/size/numbers/walls
const adj = (size, a, b) => {
  const dr = Math.abs(Math.floor(a / size) - Math.floor(b / size));
  const dc = Math.abs((a % size) - (b % size));
  return dr + dc === 1;
};
for (const l of stripped) {
  if (typeof l.id !== 'number' || typeof l.size !== 'number' ||
      typeof l.numbers !== 'object' || !Array.isArray(l.walls)) {
    console.error(`ГЕЙТ ПРОВАЛЕН: битый уровень ${JSON.stringify(l).slice(0, 80)}`);
    process.exit(1);
  }
  const start = Number(Object.entries(l.numbers).find(([, n]) => n === 1)?.[0]);
  if (!Number.isInteger(l.hint) || !adj(l.size, start, l.hint)) {
    console.error(`ГЕЙТ ПРОВАЛЕН: битая запечённая подсказка на уровне ${l.id}`);
    process.exit(1);
  }
  // Гейт маски: клетки в поле, флажки и подсказка внутри маски
  if (l.mask !== undefined) {
    const full = l.size * l.size;
    if (!Array.isArray(l.mask) || !l.mask.length || l.mask.length >= full ||
        !l.mask.every((c) => Number.isInteger(c) && c >= 0 && c < full)) {
      console.error(`ГЕЙТ ПРОВАЛЕН: битая маска на уровне ${l.id}`);
      process.exit(1);
    }
    const set = new Set(l.mask);
    const numCells = Object.keys(l.numbers).map(Number);
    if (!numCells.every((c) => set.has(c)) || !set.has(start) || !set.has(l.hint)) {
      console.error(`ГЕЙТ ПРОВАЛЕН: флажки вне маски на уровне ${l.id}`);
      process.exit(1);
    }
    for (const [a, b] of l.walls) {
      if (!set.has(a) || !set.has(b)) {
        console.error(`ГЕЙТ ПРОВАЛЕН: стенка вне маски на уровне ${l.id}`);
        process.exit(1);
      }
    }
  }
}

console.log(`Готово: ${stripped.length} уровней -> levels.build.json, _solution вычищен, гейты зелёные`);
