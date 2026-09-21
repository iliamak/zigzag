// Path-anchored metrics for levels.json (fixed: positions along solution order).
import { readFileSync, writeFileSync } from 'node:fs';
const L = JSON.parse(readFileSync('/home/user/uploads/levels.json','utf8'));

const nb = (size, cell) => {
  const r = Math.floor(cell/size), c = cell%size, out=[];
  if (r>0) out.push(cell-size); if (r<size-1) out.push(cell+size);
  if (c>0) out.push(cell-1); if (c<size-1) out.push(cell+1);
  return out;
};
const ek = (a,b) => a<b?`${a}:${b}`:`${b}:${a}`;

export function pathMetrics(l) {
  const {size, numbers, walls} = l;
  const sol = l._solution;
  const total = size*size;
  const blocked = new Set(walls.map(([a,b])=>ek(a,b)));
  const maxNum = Math.max(...Object.values(numbers));
  const visited = new Set([sol[0]]);
  let decoys=0, forced=0, branchSum=0, bHalf=0, bHalfSteps=0, steps=0;
  let startNum = numbers[sol[0]] === 1 ? 2 : 1;
  for (let i=1;i<sol.length;i++){
    const head = sol[i-1], next = sol[i];
    let legal=0, d=0;
    for (const n of nb(size, head)) {
      if (visited.has(n) || blocked.has(ek(head,n))) continue;
      const num = numbers[n];
      if (num !== undefined && num !== startNum) continue;
      if (num === maxNum && total - i !== 1) continue;
      legal++; if (n !== next) d++;
    }
    decoys+=d; branchSum+=legal;
    if (legal===1) forced++;
    if (i <= sol.length/2) { bHalf+=legal; bHalfSteps++; }
    steps++;
    visited.add(next);
    if (numbers[next] !== undefined) startNum++;
  }
  // flags in solution order
  const idx = new Map(sol.map((c,i)=>[c,i]));
  const flagsInOrder = Object.keys(numbers).map(k=>+k).sort((a,b)=>numbers[a]-numbers[b]);
  const pos = flagsInOrder.map(c=>idx.get(c));
  const gaps = pos.slice(1).map((p,i)=>p-pos[i]);
  const mean = gaps.reduce((a,b)=>a+b,0)/gaps.length;
  const sd = Math.sqrt(gaps.reduce((a,g)=>a+(g-mean)**2,0)/gaps.length);
  // wall structure
  const deg = c => nb(size,c).filter(n=>!blocked.has(ek(c,n))).length;
  let corridor=0, junction=0;
  for (let c=0;c<total;c++){ const d=deg(c); if(d<=2) corridor++; if(d>=4) junction++; }
  let wallFlag=0, wallPath=0;
  for (const [a,b] of walls){ if (numbers[a]!==undefined||numbers[b]!==undefined) wallFlag++;
    if (idx.has(a)&&idx.has(b)) wallPath++; }
  const startCorner = [0,size-1,total-size,total-1].includes(sol[0])?1:0;
  const flagCorner = [0,size-1,total-size,total-1].filter(c=>numbers[c]!==undefined).length;
  const flagEdge = flagsInOrder.filter(c=>{const r=Math.floor(c/size),cc=c%size;return r===0||r===size-1||cc===0||cc===size-1;}).length;
  return {
    id:l.id, size, cells: total,
    nFlags: flagsInOrder.length, density:+(flagsInOrder.length/total).toFixed(3),
    meanGap:+mean.toFixed(2), maxGap:Math.max(...gaps), minGap:Math.min(...gaps),
    gapSD:+sd.toFixed(2), gapCV:+(sd/mean).toFixed(3),
    turns: l.metrics.turns,
    decoys, decoyPerCell: +(decoys/(total-1)).toFixed(3),
    forcedRatio:+(forced/steps).toFixed(2),
    meanBranch:+(branchSum/steps).toFixed(2),
    br1stHalf:+(bHalf/bHalfSteps).toFixed(2),
    walls: walls.length, wallFlag, wallPath,
    corridorCells: corridor, corridorShare: +(corridor/total).toFixed(2),
    junctionCells: junction,
    nodes: l.metrics.solverNodes,
    startCorner, flagCorner, flagEdge,
    score: l.metrics.score,
  };
}

const rows = L.map(pathMetrics);
const med = a => { const s=[...a].sort((x,y)=>x-y); return s.length%2?s[(s.length-1)/2]:(s[s.length/2-1]+s[s.length/2])/2; };
const q = (a,p) => { const s=[...a].sort((x,y)=>x-y); return s[Math.min(s.length-1,Math.round((s.length-1)*p))]; };
const out = [];
const P = s => out.push(s);
P('=== by decade (median) ===');
P(['dec','range','size','nodes','decoys','dec/cell','meanBr','brHalf1','forced','maxGap','gapSD','gapCV','walls','wallFlag','corridor%','junction','nFlags','density'].join('\t'));
for (let d=0; d<10; d++){
  const rs = rows.slice(d*10, d*10+10);
  const f=k=>{const v=med(rs.map(r=>r[k])); return typeof v==='number'?+v.toFixed(2):v;};
  P([`dec${d+1}`,`${rs[0].id}-${rs[9].id}`,rs[0].size,f('nodes'),f('decoys'),f('decoyPerCell'),f('meanBranch'),f('br1stHalf'),f('forcedRatio'),f('maxGap'),f('gapSD'),f('gapCV'),f('walls'),f('wallFlag'),f('corridorShare'),f('junctionCells'),f('nFlags'),f('density')].join('\t'));
}
P('');
P('=== boundary check: last 5 of a size block vs first 5 of the next ===');
for (const [a0,a1,b0,b1,na,nb_] of [[6,10,11,15,'4x4','5x5'],[31,35,36,40,'5x5','6x6'],[66,70,71,75,'6x6','7x7']]){
  const A=rows.filter(r=>r.id>=a0&&r.id<=a1), B=rows.filter(r=>r.id>=b0&&r.id<=b1);
  P(`${na} #${a0}-${a1} vs ${nb_} #${b0}-${b1}: nodes ${med(A.map(r=>r.nodes))} -> ${med(B.map(r=>r.nodes))} | decoys ${med(A.map(r=>r.decoys))} -> ${med(B.map(r=>r.decoys))} | dec/cell ${med(A.map(r=>r.decoyPerCell))} -> ${med(B.map(r=>r.decoyPerCell))} | meanBr ${med(A.map(r=>r.meanBranch))} -> ${med(B.map(r=>r.meanBranch))} | maxGap ${med(A.map(r=>r.maxGap))} -> ${med(B.map(r=>r.maxGap))}`);
}
P('');
P('=== within-size halves (early half vs late half of the block) ===');
for (const size of [4,5,6,7]){
  const rs=rows.filter(r=>r.size===size), h=Math.floor(rs.length/2), A=rs.slice(0,h), B=rs.slice(h);
  P(`${size}x${size} n=${rs.length}: nodes ${med(A.map(r=>r.nodes))} -> ${med(B.map(r=>r.nodes))} | decoys ${med(A.map(r=>r.decoys))} -> ${med(B.map(r=>r.decoys))} | dec/cell ${med(A.map(r=>r.decoyPerCell))} -> ${med(B.map(r=>r.decoyPerCell))} | meanBr ${med(A.map(r=>r.meanBranch))} -> ${med(B.map(r=>r.meanBranch))} | forced ${med(A.map(r=>r.forcedRatio))} -> ${med(B.map(r=>r.forcedRatio))}`);
}
P('');
P('=== ranges per size (min/median/max) ===');
for (const size of [4,5,6,7]){
  const rs=rows.filter(r=>r.size===size);
  for (const k of ['nodes','decoys','decoyPerCell','meanBranch','maxGap','walls','corridorShare']){
    const v=rs.map(r=>r[k]);
    P(`${size}x${size} ${k.padEnd(14)} min ${Math.min(...v)} | p25 ${q(v,.25)} | med ${+med(v).toFixed(2)} | p75 ${q(v,.75)} | max ${Math.max(...v)}`);
  }
  P('');
}
function corr(a,b){const n=a.length,ma=a.reduce((x,y)=>x+y)/n,mb=b.reduce((x,y)=>x+y)/n;let sa=0,sb=0,sab=0;for(let i=0;i<n;i++){sa+=(a[i]-ma)**2;sb+=(b[i]-mb)**2;sab+=(a[i]-ma)*(b[i]-mb);}return sab/Math.sqrt(sa*sb);}
const ln=x=>Math.log(x+1);
P('=== correlation with log(solverNodes) ===');
for (const k of ['decoys','decoyPerCell','meanBranch','br1stHalf','forcedRatio','maxGap','gapSD','gapCV','walls','wallFlag','nFlags','turns','density','corridorShare','junctionCells','flagEdge','flagCorner'])
  P(`${k.padEnd(16)} r=${corr(rows.map(r=>ln(r.nodes)), rows.map(r=>r[k])).toFixed(2)}`);
P('');
P('=== correlation with decoys (human-ish effort proxy) ===');
for (const k of ['nodes','maxGap','gapSD','walls','wallFlag','nFlags','turns','corridorShare','junctionCells','forcedRatio'])
  P(`${k.padEnd(16)} r=${corr(rows.map(r=>r.decoys), rows.map(r=>r[k])).toFixed(2)}`);
P('');
P('=== per-level dump ===');
P(['id','size','nFlags','density','meanGap','minGap','maxGap','gapSD','gapCV','turns','decoys','dec/cell','meanBr','brHalf1','forced','walls','wallFlag','wallPath','corridor%','junction','nodes','startCorner','flagCorner','flagEdge'].join('\t'));
for (const r of rows) P([r.id,r.size,r.nFlags,r.density,r.meanGap,r.minGap,r.maxGap,r.gapSD,r.gapCV,r.turns,r.decoys,r.decoyPerCell,r.meanBranch,r.br1stHalf,r.forcedRatio,r.walls,r.wallFlag,r.wallPath,r.corridorShare,r.junctionCells,r.nodes,r.startCorner,r.flagCorner,r.flagEdge].join('\t'));
writeFileSync('/home/user/work/analysis.txt', out.join('\n'));
console.log(out.join('\n'));
