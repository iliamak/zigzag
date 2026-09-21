// Experiment harness: parameterised version of gen-levels.mjs.
// Question: can the CURRENT handles (flags/step, walls, size) produce a ramp?
import { writeFileSync } from 'node:fs';

function hashSeed(text){let h=2166136261;for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);return h>>>0;}
function randomSource(seed){return()=>{seed+=0x6d2b79f5;let t=Math.imul(seed^(seed>>>15),1|seed);t^=t+Math.imul(t^(t>>>7),61|t);return((t^(t>>>14))>>>0)/4294967296;};}
const randInt=(r,min,max)=>min+Math.floor(r()*(max-min+1));
const gridNeighbors=(size,cell)=>{const r=Math.floor(cell/size),c=cell%size,out=[];if(r>0)out.push(cell-size);if(r<size-1)out.push(cell+size);if(c>0)out.push(cell-1);if(c<size-1)out.push(cell+1);return out;};
const edgeKey=(a,b)=>a<b?`${a}:${b}`:`${b}:${a}`;

function makeSolution(size,random){
  let s=[];for(let r=0;r<size;r++)for(let c=0;c<size;c++)s.push(r*size+(r%2?size-1-c:c));
  for(let i=0;i<500;i++){if(random()<0.5)s.reverse();const cand=gridNeighbors(size,s[0]).filter(cell=>cell!==s[1]);if(!cand.length)continue;const j=s.indexOf(cand[Math.floor(random()*cand.length)]);s=s.slice(0,j).reverse().concat(s.slice(j));}
  return s;
}
// count flags: number of waypoints. jitter controls gap evenness.
function placeWaypoints(solution,count,random,jitter=2){
  const n=solution.length,positions=[0];
  for(let k=1;k<count-1;k++){const ideal=Math.round(k*(n-1)/(count-1));const lo=positions[k-1]+1,hi=n-(count-k);positions.push(Math.max(lo,Math.min(hi,ideal+randInt(random,-jitter,jitter))));}
  positions.push(n-1);const numbers={};positions.forEach((p,i)=>{numbers[solution[p]]=i+1;});
  return {numbers,positions};
}
function placeWalls(size,solution,count,random,mode='random'){
  const solEdges=new Set(solution.slice(1).map((cell,i)=>edgeKey(solution[i],cell)));
  const solIdx=new Map(solution.map((c,i)=>[c,i]));
  const possible=[];
  for(let cell=0;cell<size*size;cell++)for(const nbn of gridNeighbors(size,cell))if(nbn>cell&&!solEdges.has(edgeKey(cell,nbn))){
    let w=1;
    if(mode==='nearpath'){const a=nbn; // prefer walls adjacent to path cells
      const touchPath=(solIdx.has(cell)?1:0)+(solIdx.has(a)?1:0)+(gridNeighbors(size,cell).some(x=>solIdx.has(x))?1:0)+(gridNeighbors(size,a).some(x=>solIdx.has(x))?1:0);
      w=1+touchPath;}
    possible.push({e:[cell,nbn],w});
  }
  // weighted shuffle
  for(let i=possible.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[possible[i],possible[j]]=[possible[j],possible[i]];}
  if(mode==='weighted')possible.sort((a,b)=>b.w-a.w);
  return possible.slice(0,count).map(x=>x.e);
}
function solve(size,numbers,walls,start,cap=3_000_000){
  const total=size*size;const blocked=new Set(walls.map(([a,b])=>edgeKey(a,b)));
  const neighbors=Array.from({length:total},(_,cell)=>gridNeighbors(size,cell).filter(nbn=>!blocked.has(edgeKey(cell,nbn))));
  const maxNum=Math.max(...Object.values(numbers));
  const visited=new Uint8Array(total);let solutions=0,nodes=0,timedOut=false;
  function connected(head,left){if(left===0)return true;const seen=new Uint8Array(total);const stack=[head];seen[head]=1;let reach=0;
    while(stack.length){const cell=stack.pop();for(const nbn of neighbors[cell]){if(visited[nbn]||seen[nbn])continue;seen[nbn]=1;reach++;stack.push(nbn);}}return reach>=left;}
  function dfs(head,next,depth){
    if(timedOut||solutions>=2)return;
    if(++nodes>cap){timedOut=true;return;}
    const left=total-depth;
    if(depth%6===0&&!connected(head,left))return;
    if(left===0){if(next===maxNum+1)solutions++;return;}
    for(const nbn of neighbors[head]){
      if(visited[nbn])continue;const num=numbers[nbn];
      if(num!==undefined&&num!==next)continue;
      if(num===maxNum&&left!==1)continue;
      visited[nbn]=1;dfs(nbn,num!==undefined?next+1:next,depth+1);visited[nbn]=0;
      if(timedOut||solutions>=2)return;
    }
  }
  visited[start]=1;dfs(start,numbers[start]===1?2:1,1);
  return {solutions,nodes,timedOut};
}
function metrics(size,solution,positions,walls,nodes){
  let turns=0;const dir=(a,b)=>[Math.floor(b/size)-Math.floor(a/size),(b%size)-(a%size)];
  for(let i=2;i<solution.length;i++){const[dr1,dc1]=dir(solution[i-2],solution[i-1]);const[dr2,dc2]=dir(solution[i-1],solution[i]);if(dr1!==dr2||dc1!==dc2)turns++;}
  let maxGap=0;for(let i=1;i<positions.length;i++)maxGap=Math.max(maxGap,positions[i]-positions[i-1]);
  return {solverNodes:nodes,turns,maxGap,walls:walls.length,score:Math.round(nodes/100)+maxGap*10+walls.length*5};
}
function decoysOf(size,numbers,walls,solution){
  const total=size*size;const blocked=new Set(walls.map(([a,b])=>edgeKey(a,b)));
  const maxNum=Math.max(...Object.values(numbers));const visited=new Set([solution[0]]);
  let decoys=0,forced=0,steps=0;let next=numbers[solution[0]]===1?2:1;
  for(let i=1;i<solution.length;i++){
    const head=solution[i-1],nxt=solution[i];let legal=0;
    for(const nbn of gridNeighbors(size,head)){
      if(visited.has(nbn)||blocked.has(edgeKey(head,nbn)))continue;
      const num=numbers[nbn];if(num!==undefined&&num!==next)continue;
      if(num===maxNum&&total-i!==1)continue;
      legal++;if(nbn!==nxt)decoys++;
    }
    if(legal===1)forced++;steps++;visited.add(nxt);if(numbers[nxt]!==undefined)next++;
  }
  return {decoys,decoyPerCell:decoys/(total-1),forcedRatio:forced/steps};
}
export function gen({size,flags,walls,seed,jitter=2,wallMode='random',cap=3_000_000}){
  const random=randomSource(hashSeed(`exp-${size}-${flags}-${walls}-${seed}`));
  const solution=makeSolution(size,random);
  const {numbers,positions}=placeWaypoints(solution,flags,random,jitter);
  const wl=placeWalls(size,solution,walls,random,wallMode);
  const res=solve(size,numbers,wl,solution[0],cap);
  if(res.timedOut||res.solutions!==1)return null;
  const m=metrics(size,solution,positions,wl,res.nodes);
  const d=decoysOf(size,numbers,wl,solution);
  return {size,flags,walls:wl.length,numbers,wallsList:wl,solution,m,...d};
}
const med=a=>{const s=[...a].sort((x,y)=>x-y);return s.length%2?s[(s.length-1)/2]:(s[s.length/2-1]+s[s.length/2])/2;};
const q=(a,p)=>{const s=[...a].sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.round((s.length-1)*p))];};
const f2=x=>typeof x==='number'?+x.toFixed(3):x;

const out=[];const P=s=>out.push(s);

// ---- EXPERIMENT 1: flag count vs achievable metric range, per size, walls fixed ----
P('=== EXP1: flag count ceiling (walls fixed at 0 for 4x4/5x5, 3 for 6x6, 5 for 7x7); N=60 accepted candidates each ===');
P(['size','flags','accepted','reject%','nodes_med','nodes_p90','nodes_max','dec/cell_med','dec/cell_p90','dec/cell_max','maxGap_med','maxGap_max','forced_med','turns_med','seedwall'].join('\t'));
for (const [size,flagList,walls] of [[4,[3,4,5,6,7,8],0],[5,[5,6,7,8,9,10],2],[6,[7,8,9,10,11,12],3],[7,[8,9,10,11,12,13,14],5]]){
  for (const flags of flagList){
    const acc=[];let tries=0,rej=0,timeout=0,nonuniq=0;
    for (let k=0;k<400 && acc.length<60;k++){
      tries++;
      const g=gen({size,flags,walls,seed:k*7919+11});
      if(!g){rej++;continue;}
      acc.push(g);
    }
    if(!acc.length){P([size,flags,0,'-','-','-','-','-','-','-','-','-','-'].join('\t'));continue;}
    const N=acc.map(g=>g.m.solverNodes), D=acc.map(g=>g.decoys/(size*size-1)), G=acc.map(g=>g.m.maxGap), F=acc.map(g=>g.forcedRatio), T=acc.map(g=>g.m.turns);
    P([size,flags,acc.length,Math.round(100*(tries-acc.length)/tries),med(N),q(N,.9),Math.max(...N),f2(med(D)),f2(q(D,.9)),f2(Math.max(...D)),f2(med(G)),Math.max(...G),f2(med(F)),f2(med(T)),walls].join('\t'));
  }
  P('');
}

// ---- EXPERIMENT 2: wall count effect, flag count fixed (dense flags = many constraints) ----
P('=== EXP2: wall count effect within a size (N=60 accepted each) ===');
P(['size','flags','walls','accepted','nodes_med','dec/cell_med','maxGap_med','forced_med'].join('\t'));
for (const [size,flags,wallList] of [[5,6,[0,2,4,6,8]],[6,8,[0,2,4,6,8,10]],[7,9,[2,4,6,8,10,12]]]){
  for (const walls of wallList){
    const acc=[];
    for (let k=0;k<600 && acc.length<60;k++){const g=gen({size,flags,walls,seed:k*104729+7});if(g)acc.push(g);}
    if(!acc.length){P([size,flags,walls,0,'-','-','-','-'].join('\t'));continue;}
    P([size,flags,walls,acc.length,med(acc.map(g=>g.m.solverNodes)),f2(med(acc.map(g=>g.decoys/(size*size-1)))),med(acc.map(g=>g.m.maxGap)),f2(med(acc.map(g=>g.forcedRatio)))].join('\t'));
  }
  P('');
}

// ---- EXPERIMENT 3: rare flags (few waypoints) = long free segments; is that harder or easier? ----
P('=== EXP3: sparse flags (maxGap as independent knob), 6x6 and 7x7, walls=3/5 ===');
P(['size','flags','target_maxGap','accepted','maxGap_med','nodes_med','nodes_p90','dec/cell_med','forced_med'].join('\t'));
for (const [size,flags,walls] of [[6,5,3],[6,6,3],[7,6,5],[7,7,5]]){
  for (const jitter of [0,2,5]){
    const acc=[];
    for (let k=0;k<800 && acc.length<50;k++){const g=gen({size,flags,walls,seed:k*31337+jitter,jitter});if(g)acc.push(g);}
    if(!acc.length){P([size,flags,jitter,0,'-','-','-','-','-'].join('\t'));continue;}
    P([size,flags,jitter,acc.length,med(acc.map(g=>g.m.maxGap)),med(acc.map(g=>g.m.solverNodes)),q(acc.map(g=>g.m.solverNodes),.9),f2(med(acc.map(g=>g.decoys/(size*size-1)))),f2(med(acc.map(g=>g.forcedRatio)))].join('\t'));
  }
  P('');
}

// ---- EXPERIMENT 4: can 6x6 be made as hard as an average 7x7, without changing size? ----
P('=== EXP4: 6x6 pushed to the limit: flags x walls grid, best achievable nodes ===');
P(['flags','walls','accepted','nodes_med','nodes_p90','nodes_max','dec/cell_max','maxGap_med','turns_med'].join('\t'));
for (const flags of [10,11,12,13,14]){
  for (const walls of [4,6,8]){
    const acc=[];
    for (let k=0;k<800 && acc.length<40;k++){const g=gen({size:6,flags,walls,seed:k*2654435761%100000+flags*17+walls});if(g)acc.push(g);}
    if(!acc.length){P([flags,walls,0,'-','-','-','-','-','-'].join('\t'));continue;}
    P([flags,walls,acc.length,med(acc.map(g=>g.m.solverNodes)),q(acc.map(g=>g.m.solverNodes),.9),Math.max(...acc.map(g=>g.m.solverNodes)),f2(Math.max(...acc.map(g=>g.decoys/(36-1)))),med(acc.map(g=>g.m.maxGap)),med(acc.map(g=>g.m.turns))].join('\t'));
  }
}
P('');
P('=== EXP5: reference: current levels.json 6x6 / 7x7 stats for comparison ===');
P('6x6 as shipped: nodes med 2573 p90 ~9000 (dec6-7 med 3800-6000); dec/cell 0.40-0.51; 7x7 shipped: nodes med 33565, range 3574-218881');

writeFileSync('/home/user/work/experiments.txt', out.join('\n'));
console.log(out.join('\n'));
