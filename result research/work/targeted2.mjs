// PHASE 2 (corrected): final decoy density AFTER targeted walls, vs shipped levels.
import { writeFileSync } from 'node:fs';
function hashSeed(t){let h=2166136261;for(let i=0;i<t.length;i++)h=Math.imul(h^t.charCodeAt(i),16777619);return h>>>0;}
function randomSource(s){return()=>{s+=0x6d2b79f5;let t=Math.imul(s^(s>>>15),1|s);t^=t+Math.imul(t^(t>>>7),61|t);return((t^(t>>>14))>>>0)/4294967296;};}
const nbOf=(size,cell)=>{const r=Math.floor(cell/size),c=cell%size,o=[];if(r>0)o.push(cell-size);if(r<size-1)o.push(cell+size);if(c>0)o.push(cell-1);if(c<size-1)o.push(cell+1);return o;};
const ek=(a,b)=>a<b?`${a}:${b}`:`${b}:${a}`;
function makeSolution(size,random){let s=[];for(let r=0;r<size;r++)for(let c=0;c<size;c++)s.push(r*size+(r%2?size-1-c:c));
  for(let i=0;i<500;i++){if(random()<0.5)s.reverse();const cand=nbOf(size,s[0]).filter(x=>x!==s[1]);if(!cand.length)continue;const j=s.indexOf(cand[Math.floor(random()*cand.length)]);s=s.slice(0,j).reverse().concat(s.slice(j));}
  return s;}
function costs(size,sol){const cost=new Array(size*size).fill(0);const visited=new Set([sol[0]]);
  for(let i=1;i<sol.length;i++){const head=sol[i-1],correct=sol[i];
    for(const n of nbOf(size,head)){if(visited.has(n)||n===correct)continue;cost[n]++;}
    visited.add(correct);}
  return cost;}
function pathMetrics(size,sol,positions,walls){
  const total=size*size,numbers={};positions.forEach((p,i)=>{numbers[sol[p]]=i+1;});
  const blocked=new Set(walls.map(([a,b])=>ek(a,b)));
  const maxNum=positions.length;const visited=new Set([sol[0]]);let next=numbers[sol[0]]===1?2:1;
  let decoys=0,decisions=0,straightDecoys=0,straightRunMax=0,straightRunCur=0;
  const dirOf=(a,b)=>[Math.floor(b/size)-Math.floor(a/size),(b%size)-(a%size)];
  const same=(d1,d2)=>d1[0]===d2[0]&&d1[1]===d2[1];
  for(let i=1;i<sol.length;i++){
    const head=sol[i-1],correct=sol[i];
    const legal=[];
    for(const n of nbOf(size,head)){if(visited.has(n)||blocked.has(ek(head,n)))continue;const num=numbers[n];
      if(num!==undefined&&num!==next)continue;if(num===maxNum&&total-i!==1)continue;legal.push(n);}
    if(legal.length>=2)decisions++;
    const incoming=i>=2?dirOf(sol[i-2],sol[i-1]):null;
    for(const d of legal){if(d===correct)continue;decoys++;
      if(incoming&&same(incoming,dirOf(head,d)))straightDecoys++;}
    if(i>=2){const prev=dirOf(sol[i-2],sol[i-1]);if(same(prev,dirOf(head,correct))){straightRunCur++;straightRunMax=Math.max(straightRunMax,straightRunCur);}else straightRunCur=0;}
    visited.add(correct);if(numbers[correct]!==undefined)next++;
  }
  return {decoys,decisions,straightDecoys,straightRunMax,decoyPerCell:+(decoys/(total-1)).toFixed(3),walls:walls.length};
}
function optimalPositions(sol,cost,K){const n=sol.length,idx=[];
  for(let p=1;p<n-1;p++)idx.push([p,cost[sol[p]]]);
  idx.sort((a,b)=>a[1]-b[1]);const picks=new Set();
  for(const [p] of idx){if(picks.size>=K-2)break;picks.add(p);}
  return [0,...[...picks].sort((a,b)=>a-b),n-1];}
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
  return {found,nodes,timedOut};}
const med=a=>{const s=[...a].sort((x,y)=>x-y);return s.length%2?s[(s.length-1)/2]:(s[s.length/2-1]+s[s.length/2])/2;};
const q=(a,p)=>{const s=[...a].sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.round((s.length-1)*p))];};
const out=[];const P=s=>out.push(s);
P('=== FINAL: optimal flags + TARGETED walls (kill duplicates only) vs shipped levels ===');
P('size\tK\tN\tunique%\twalls_med\twalls_max\tdecoy/cell_med(AFTER walls)\tdecoy/cell_p90\tdecisions_med\tstraightDecoys_med\tstraightRun_med\tnodes_med');
const rows={};
for (const [size,K,attempts] of [[5,8,40],[6,8,40],[6,10,30],[7,10,25],[7,12,25]]){
  const dens=[],dec=[],sd=[],sr=[],wl=[],nd=[],uniq=[];
  for(let k=0;k<attempts;k++){
    const r=randomSource(hashSeed(`t2-${size}-${k}`));const sol=makeSolution(size,r);
    const cost=costs(size,sol);const positions=optimalPositions(sol,cost,K);
    const numbers={};positions.forEach((p,i)=>{numbers[sol[p]]=i+1;});
    let walls=[],res=solvePaths(size,numbers,walls,sol[0],2),guard=0;
    while(res.found.length>1&&walls.length<10&&guard<15){guard++;
      const keep=new Set(res.found[0].slice(1).map((c,i)=>ek(res.found[0][i],c)));
      const cands=new Set();
      for(const other of res.found.slice(1))for(let i=1;i<other.length;i++){const e=ek(other[i-1],other[i]);if(!keep.has(e))cands.add(e);}
      if(!cands.size)break;
      let best=null,bs=1e9;
      for(const e of cands){const [a,b]=e.split(':').map(Number);const s=cost[a]+cost[b];if(s<bs){bs=s;best=e;}}
      const [a,b]=best.split(':').map(Number);walls=[...walls,[a,b]];
      res=solvePaths(size,numbers,walls,sol[0],2);
    }
    const m=pathMetrics(size,sol,positions,walls);
    uniq.push(res.found.length===1?1:0);dens.push(m.decoyPerCell);dec.push(m.decisions);sd.push(m.straightDecoys);sr.push(m.straightRunMax);wl.push(walls.length);nd.push(res.nodes);
  }
  P([size,K,attempts,Math.round(100*uniq.reduce((a,b)=>a+b,0)/attempts),med(wl),Math.max(...wl),+med(dens).toFixed(3),+q(dens,.9).toFixed(3),med(dec),med(sd),med(sr),med(nd)].join('\t'));
  rows[`${size}_${K}`]={dens:med(dens),walls:med(wl),uniqPct:100*uniq.reduce((a,b)=>a+b,0)/attempts};
}
P('');
P('=== shipped reference (levels.json) ===');
P('size\tdecoy/cell_med\tdecoy/cell_p90\tdecisions_med\tstraightDecoys_med\tstraightRun_med\twalls_med\tnodes_med');
P('5x5\t0.417\t0.458\t8\t3\t3\t3\t442');
P('6x6\t0.457\t0.486\t14\t5\t4\t3\t2573');
P('7x7\t0.521\t0.563\t20\t7\t5\t5\t33565');
writeFileSync('/home/user/work/targeted2.txt',out.join('\n'));
console.log(out.join('\n'));
