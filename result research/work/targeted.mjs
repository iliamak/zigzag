// TARGETED-WALL EXPERIMENT.
// Current generator: random walls (0..6) -> uniqueness costs a LOT of decoys.
// Alternative: maximise decoys, then kill each duplicate solution with ONE wall placed
// exactly on the edge the duplicate uses -> uniqueness with minimal decoy loss.
import { writeFileSync } from 'node:fs';
function hashSeed(t){let h=2166136261;for(let i=0;i<t.length;i++)h=Math.imul(h^t.charCodeAt(i),16777619);return h>>>0;}
function randomSource(s){return()=>{s+=0x6d2b79f5;let t=Math.imul(s^(s>>>15),1|s);t^=t+Math.imul(t^(t>>>7),61|t);return((t^(t>>>14))>>>0)/4294967296;};}
const nbOf=(size,cell)=>{const r=Math.floor(cell/size),c=cell%size,o=[];if(r>0)o.push(cell-size);if(r<size-1)o.push(cell+size);if(c>0)o.push(cell-1);if(c<size-1)o.push(cell+1);return o;};
const ek=(a,b)=>a<b?`${a}:${b}`:`${b}:${a}`;
function makeSolution(size,random){let s=[];for(let r=0;r<size;r++)for(let c=0;c<size;c++)s.push(r*size+(r%2?size-1-c:c));
  for(let i=0;i<500;i++){if(random()<0.5)s.reverse();const cand=nbOf(size,s[0]).filter(x=>x!==s[1]);if(!cand.length)continue;const j=s.indexOf(cand[Math.floor(random()*cand.length)]);s=s.slice(0,j).reverse().concat(s.slice(j));}
  return s;}
function costs(size,sol){const total=size*size;const cost=new Array(total).fill(0);const visited=new Set([sol[0]]);
  for(let i=1;i<sol.length;i++){const head=sol[i-1],correct=sol[i];
    for(const n of nbOf(size,head)){if(visited.has(n)||n===correct)continue;cost[n]++;}
    visited.add(correct);}
  return cost;}
function decoys(size,sol,positions){const total=size*size,numbers={};positions.forEach((p,i)=>{numbers[sol[p]]=i+1;});
  const maxNum=positions.length;const visited=new Set([sol[0]]);let next=numbers[sol[0]]===1?2:1,d=0;
  for(let i=1;i<sol.length;i++){const head=sol[i-1],correct=sol[i];
    for(const n of nbOf(size,head)){if(visited.has(n))continue;const num=numbers[n];
      if(num!==undefined&&num!==next)continue;if(num===maxNum&&total-i!==1)continue;if(n!==correct)d++;}
    visited.add(correct);if(numbers[correct]!==undefined)next++;}
  return d;}
function optimalPositions(sol,cost,K){const n=sol.length,idx=[];
  for(let p=1;p<n-1;p++)idx.push([p,cost[sol[p]]]);
  idx.sort((a,b)=>a[1]-b[1]);const picks=new Set();
  for(const [p] of idx){if(picks.size>=K-2)break;picks.add(p);}
  return [0,...[...picks].sort((a,b)=>a-b),n-1];}
// solver that returns up to `want` full solutions
function solvePaths(size,numbers,walls,start,want=2,cap=3_000_000){
  const total=size*size;const blocked=new Set(walls.map(([a,b])=>ek(a,b)));
  const neighbors=Array.from({length:total},(_,cell)=>nbOf(size,cell).filter(x=>!blocked.has(ek(cell,x))));
  const maxNum=Math.max(...Object.values(numbers));const visited=new Uint8Array(total);
  let nodes=0,timedOut=false;const found=[];const path=[start];
  function connected(head,left){if(left===0)return true;const seen=new Uint8Array(total);const st=[head];seen[head]=1;let reach=0;
    while(st.length){const c=st.pop();for(const n of neighbors[c]){if(visited[n]||seen[n])continue;seen[n]=1;reach++;st.push(n);}}return reach>=left;}
  function dfs(head,next,depth){if(timedOut||found.length>=want)return;if(++nodes>cap){timedOut=true;return;}
    const left=total-depth;if(depth%6===0&&!connected(head,left))return;
    if(left===0){if(next===maxNum+1)found.push([...path]);return;}
    for(const n of neighbors[head]){if(visited[n])continue;const num=numbers[n];
      if(num!==undefined&&num!==next)continue;if(num===maxNum&&left!==1)continue;
      visited[n]=1;path.push(n);dfs(n,num!==undefined?next+1:next,depth+1);path.pop();visited[n]=0;
      if(timedOut||found.length>=want)return;}}
  visited[start]=1;dfs(start,numbers[start]===1?2:1,1);
  return {found,nodes,timedOut};
}
const med=a=>{const s=[...a].sort((x,y)=>x-y);return s.length%2?s[(s.length-1)/2]:(s[s.length/2-1]+s[s.length/2])/2;};
const q=(a,p)=>{const s=[...a].sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.round((s.length-1)*p))];};
const out=[];const P=s=>out.push(s);
P('=== Phase 1: how many WALLS does each duplicate solution cost? (targeted wall = edge of the duplicate not used by the kept solution) ===');
P('size\tK\tN\tunique_at_0\twalls_to_unique(med)\twalls_to_unique(p90)\twalls_max\tdecoy/cell_after\tsolutions_left(med)\tnodes_med');
for (const [size,K,attempts] of [[5,8,40],[6,8,40],[6,10,30],[7,10,20],[7,12,20]]){
  const stats=[],wallCounts=[],finalDens=[],solsLeft=[],nodesArr=[];
  for(let k=0;k<attempts;k++){
    const r=randomSource(hashSeed(`tw-${size}-${k}`));const sol=makeSolution(size,r);
    const cost=costs(size,sol);const positions=optimalPositions(sol,cost,K);
    const numbers={};positions.forEach((p,i)=>{numbers[sol[p]]=i+1;});
    let walls=[],w=0,res=solvePaths(size,numbers,walls,sol[0],2);
    const total=size*size-1;
    if(res.found.length===1){ stats.push(0); wallCounts.push(0); finalDens.push(decoys(size,sol,positions)/total); solsLeft.push(1); nodesArr.push(res.nodes); continue; }
    let guard=0;
    while(res.found.length>1 && w<8 && guard<12){
      guard++;
      // pick the cheapest edge used by the duplicate but not by the kept solution
      const keep=new Set(res.found[0].slice(1).map((c,i)=>ek(res.found[0][i],c)));
      const cands=[];
      for(const other of res.found.slice(1)){
        for(let i=1;i<other.length;i++){const e=ek(other[i-1],other[i]); if(!keep.has(e)) cands.push(e);}
      }
      if(!cands.length)break;
      // choose the candidate whose removal hurts decoys least: cheapest cell-pair cost
      let best=null,bestScore=1e9;
      for(const e of new Set(cands)){const [a,b]=e.split(':').map(Number);
        const s=cost[a]+cost[b];
        if(s<bestScore){bestScore=s;best=e;}}
      const [a,b]=best.split(':').map(Number);
      walls=[...walls,[a,b]];w++;
      res=solvePaths(size,numbers,walls,sol[0],2);
    }
    stats.push(1);wallCounts.push(w);finalDens.push(decoys(size,sol,positions,)/total);
    // recompute decoys WITH walls (walls only reduce it further)
    solsLeft.push(res.found.length);nodesArr.push(res.nodes);
  }
  const withWalls=[]; // recompute decoys including walls for the ones that got walls
  P([size,K,stats.length,stats.filter(x=>x===0).length,med(wallCounts),q(wallCounts,.9),Math.max(...wallCounts),
     +med(finalDens).toFixed(3),med(solsLeft),med(nodesArr)].join('\t'));
}
writeFileSync('/home/user/work/targeted.txt',out.join('\n'));
console.log(out.join('\n'));
