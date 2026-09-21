// HEADROOM EXPERIMENT.
// decoy count is ADDITIVE over flags: decoys(K) = D0 - sum(cost of chosen flag cells).
// So for a fixed board size and flag count, the generator's *uniform random* placement
// leaves a lot of difficulty on the table. Measure the gap: random placement vs optimal.
import { writeFileSync } from 'node:fs';
function hashSeed(t){let h=2166136261;for(let i=0;i<t.length;i++)h=Math.imul(h^t.charCodeAt(i),16777619);return h>>>0;}
function randomSource(s){return()=>{s+=0x6d2b79f5;let t=Math.imul(s^(s>>>15),1|s);t^=t+Math.imul(t^(t>>>7),61|t);return((t^(t>>>14))>>>0)/4294967296;};}
const randInt=(r,a,b)=>a+Math.floor(r()*(b-a+1));
const nbOf=(size,cell)=>{const r=Math.floor(cell/size),c=cell%size,o=[];if(r>0)o.push(cell-size);if(r<size-1)o.push(cell+size);if(c>0)o.push(cell-1);if(c<size-1)o.push(cell+1);return o;};
const ek=(a,b)=>a<b?`${a}:${b}`:`${b}:${a}`;
function makeSolution(size,random){let s=[];for(let r=0;r<size;r++)for(let c=0;c<size;c++)s.push(r*size+(r%2?size-1-c:c));
  for(let i=0;i<500;i++){if(random()<0.5)s.reverse();const cand=nbOf(size,s[0]).filter(x=>x!==s[1]);if(!cand.length)continue;const j=s.indexOf(cand[Math.floor(random()*cand.length)]);s=s.slice(0,j).reverse().concat(s.slice(j));}
  return s;}

// cost[cell] = number of times this cell is a legal DECOY target over the walk
function costs(size,sol){
  const total=size*size, idx=new Map(sol.map((c,i)=>[c,i]));
  const cost=new Array(total).fill(0);
  const visited=new Set([sol[0]]);
  for(let i=1;i<sol.length;i++){
    const head=sol[i-1], correct=sol[i];
    for(const n of nbOf(size,head)){
      if(visited.has(n)||n===correct)continue;         // legal decoy candidate
      cost[n]++;                                        // would be legal if no flag there
    }
    // model: a flag on the correct cell does not block the correct move
    visited.add(correct);
  }
  return cost;
}
function decoysFor(size,sol,positions){
  const total=size*size, numbers={}; positions.forEach((p,i)=>{numbers[sol[p]]=i+1;});
  const maxNum=positions.length;
  const visited=new Set([sol[0]]); let next=numbers[sol[0]]===1?2:1, decoys=0;
  for(let i=1;i<sol.length;i++){
    const head=sol[i-1], correct=sol[i];
    for(const n of nbOf(size,head)){
      if(visited.has(n))continue;
      const num=numbers[n];
      if(num!==undefined&&num!==next)continue;
      if(num===maxNum&&total-i!==1)continue;
      if(n!==correct)decoys++;
    }
    visited.add(correct); if(numbers[correct]!==undefined)next++;
  }
  return decoys;
}
// optimal flag placement for K flags: pick K-2 interior path indices with smallest cost
function optimalPositions(sol,cost,K){
  const n=sol.length, idx=[];
  for(let p=1;p<n-1;p++) idx.push([p,cost[sol[p]]]);
  idx.sort((a,b)=>a[1]-b[1]);
  const picks=new Set(); 
  // need K-2 distinct interior positions
  for(const [p] of idx){ if(picks.size>=K-2)break; picks.add(p); }
  const positions=[0,...[...picks].sort((a,b)=>a-b),n-1];
  return positions;
}
function uniformPositions(sol,K,random){
  const n=sol.length, positions=[0];
  for(let k=1;k<K-1;k++){const ideal=Math.round(k*(n-1)/(K-1));const lo=positions[k-1]+1,hi=n-(K-k);
    positions.push(Math.max(lo,Math.min(hi,ideal+randInt(random,-2,2))));}
  positions.push(n-1);return positions;
}
function solve(size,numbers,walls,start,cap=2_000_000){
  const total=size*size;const blocked=new Set(walls.map(([a,b])=>ek(a,b)));
  const neighbors=Array.from({length:total},(_,cell)=>nbOf(size,cell).filter(x=>!blocked.has(ek(cell,x))));
  const maxNum=Math.max(...Object.values(numbers));const visited=new Uint8Array(total);
  let solutions=0,nodes=0,timedOut=false;
  function connected(head,left){if(left===0)return true;const seen=new Uint8Array(total);const st=[head];seen[head]=1;let reach=0;
    while(st.length){const c=st.pop();for(const n of neighbors[c]){if(visited[n]||seen[n])continue;seen[n]=1;reach++;st.push(n);}}return reach>=left;}
  function dfs(head,next,depth){if(timedOut||solutions>=2)return;if(++nodes>cap){timedOut=true;return;}
    const left=total-depth;if(depth%6===0&&!connected(head,left))return;
    if(left===0){if(next===maxNum+1)solutions++;return;}
    for(const n of neighbors[head]){if(visited[n])continue;const num=numbers[n];
      if(num!==undefined&&num!==next)continue;if(num===maxNum&&left!==1)continue;
      visited[n]=1;dfs(n,num!==undefined?next+1:next,depth+1);visited[n]=0;
      if(timedOut||solutions>=2)return;}}
  visited[start]=1;dfs(start,numbers[start]===1?2:1,1);return{solutions,nodes,timedOut};
}
const med=a=>{const s=[...a].sort((x,y)=>x-y);return s.length%2?s[(s.length-1)/2]:(s[s.length/2-1]+s[s.length/2])/2;};
const q=(a,p)=>{const s=[...a].sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.round((s.length-1)*p))];};
const out=[];const P=s=>out.push(s);
P('=== HEADROOM: random uniform flag placement vs optimal placement (no walls) ===');
P('size\tK\tN\td0_max\tunif_med\tunif_p90\topt_med\topt_max\tunif/cell\topt/cell\tuniq_ok\tuniq_pct\tnodes_opt_med\tnodes_opt_p90\tnodes_opt_max');
const plan=[[5,[5,6,7,8,9]],[6,[6,7,8,9,10,11]],[7,[7,8,9,10,11,12]]];
const verify={};
for(const [size,Ks] of plan){
  const N=40;
  const sols=[]; for(let k=0;k<N;k++){const r=randomSource(hashSeed(`head-${size}-${k}`));sols.push(makeSolution(size,r));}
  for(const K of Ks){
    const unif=[],opt=[],nodesOpt=[],uniqOk=[]; let d0=0;
    sols.forEach((sol,si)=>{
      const cost=costs(size,sol);
      d0=Math.max(d0,decoysFor(size,sol,[0,sol.length-1]));
      const r=randomSource(hashSeed(`u-${size}-${K}-${si}`));
      const u=decoysFor(size,sol,uniformPositions(sol,K,r));
      const o=decoysFor(size,sol,optimalPositions(sol,cost,K));
      unif.push(u);opt.push(o);
      // verify optimal placement with the REAL solver
      const positions=optimalPositions(sol,cost,K);
      const numbers={};positions.forEach((p,i)=>{numbers[sol[p]]=i+1;});
      const res=solve(size,numbers,[],sol[0]);
      uniqOk.push(res.solutions===1?1:0); nodesOpt.push(res.timedOut?2_000_000:res.nodes);
    });
    const total=size*size-1;
    P([size,K,N,d0,med(unif),q(unif,.9),med(opt),Math.max(...opt),+(med(unif)/total).toFixed(3),+(med(opt)/total).toFixed(3),
       uniqOk.reduce((a,b)=>a+b,0),Math.round(100*uniqOk.reduce((a,b)=>a+b,0)/N),med(nodesOpt),q(nodesOpt,.9),Math.max(...nodesOpt)].join('\t'));
    verify[`${size}_${K}`]={unifMed:med(unif),optMed:med(opt),optMax:Math.max(...opt),uniq:uniqOk.reduce((a,b)=>a+b,0),N};
  }
  P('');
}
P('=== interpretation ===');
P('d0_max = decoys with only start/finish flags (absolute ceiling for that solution set)');
P('opt/cell = decoy density achievable at the SAME flag count by placing flags smartly');
writeFileSync('/home/user/work/placement.txt',out.join('\n'));
console.log(out.join('\n'));
