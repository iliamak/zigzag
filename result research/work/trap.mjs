// trapDepth analysis: how deep does a WRONG path run before it dies?
// Deep failure = "the level fights back". Shallow failure = "I see it immediately".
import { readFileSync, writeFileSync } from 'node:fs';
const L = JSON.parse(readFileSync('/home/user/uploads/levels.json','utf8'));
const gridNeighbors=(size,cell)=>{const r=Math.floor(cell/size),c=cell%size,out=[];if(r>0)out.push(cell-size);if(r<size-1)out.push(cell+size);if(c>0)out.push(cell-1);if(c<size-1)out.push(cell+1);return out;};
const edgeKey=(a,b)=>a<b?`${a}:${b}`:`${b}:${a}`;

function analyse(l, cap=20_000_000){
  const {size,numbers,walls}=l, sol=l._solution, total=size*size;
  const blocked=new Set(walls.map(([a,b])=>edgeKey(a,b)));
  const neighbors=Array.from({length:total},(_,cell)=>gridNeighbors(size,cell).filter(n=>!blocked.has(edgeKey(cell,n))));
  const maxNum=Math.max(...Object.values(numbers));
  const visited=new Uint8Array(total);
  let nodes=0, solutions=0, timedOut=false;
  const failDepths=[];          // depth at which each failing subtree was rooted
  const failLeafDepth=[];       // depth reached by a failing leaf/dead end
  let maxFalseDepth=0;          // deepest cell index reached on a path that ultimately fails
  // successful path set for reference
  const onSolution=new Set();
  { // mark correct path edges for "is this branch the correct one"
    for(let i=1;i<sol.length;i++) onSolution.add(edgeKey(sol[i-1],sol[i]));
  }
  function connected(head,left){if(left===0)return true;
    const seen=new Uint8Array(total);const stack=[head];seen[head]=1;let reach=0;
    while(stack.length){const cell=stack.pop();for(const n of neighbors[cell]){if(visited[n]||seen[n])continue;seen[n]=1;reach++;stack.push(n);}}
    return reach>=left;}
  // returns number of solutions in subtree
  function dfs(head,next,depth){
    if(timedOut)return 0;
    if(++nodes>cap){timedOut=true;return 0;}
    const left=total-depth;
    if(depth%6===0&&!connected(head,left)){failLeafDepth.push(depth); if(depth>maxFalseDepth)maxFalseDepth=depth; return 0;}
    if(left===0){ if(next===maxNum+1){solutions++; return 1;} failLeafDepth.push(depth); if(depth>maxFalseDepth)maxFalseDepth=depth; return 0; }
    let found=0;
    for(const n of neighbors[head]){
      if(visited[n])continue;const num=numbers[n];
      if(num!==undefined&&num!==next)continue;
      if(num===maxNum&&left!==1)continue;
      visited[n]=1;
      const sub=dfs(n,num!==undefined?next+1:next,depth+1);
      visited[n]=0;
      found+=sub;
      if(timedOut)return found;
    }
    if(found===0){ failDepths.push(depth); if(depth>maxFalseDepth)maxFalseDepth=depth; }
    return found;
  }
  visited[sol[0]]=1;
  dfs(sol[0],numbers[sol[0]]===1?2:1,1);
  failDepths.sort((a,b)=>a-b);
  failLeafDepth.sort((a,b)=>a-b);
  const n=failLeafDepth.length;
  const deepFails = failLeafDepth.filter(d=>d >= total*0.75).length;
  const midFails = failLeafDepth.filter(d=>d >= total*0.5 && d < total*0.75).length;
  return {id:l.id,size,nodes,solutions,timedOut,
    trapDepth: maxFalseDepth,                  // deepest cell index of any doomed path
    trapDepthRatio: +(maxFalseDepth/total).toFixed(2),
    failRoots: failDepths.length,
    failRootDepthMed: failDepths.length? failDepths[Math.floor(failDepths.length/2)] : null,
    deepFailShare: n? +(deepFails/n).toFixed(2) : 0,
    midFailShare: n? +(midFails/n).toFixed(2) : 0,
    fails: n,
  };
}
const rows=L.map(l=>analyse(l));
writeFileSync('/home/user/work/trap.json', JSON.stringify(rows,null,1));
const med=a=>{const s=[...a].sort((x,y)=>x-y);return s.length%2?s[(s.length-1)/2]:(s[s.length/2-1]+s[s.length/2])/2;};
const q=(a,p)=>{const s=[...a].sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.round((s.length-1)*p))];};
const out=[];const P=s=>out.push(s);
P('id\tsize\ttotal\tnodes\ttrapDepth\ttrapDepth%\tfailRoots\tfailRootDepthMed\tdeepFailShare\tmidFailShare');
for(const r of rows)P([r.id,r.size,r.size*r.size,r.nodes,r.trapDepth,r.trapDepthRatio,r.failRoots,r.failRootDepthMed,r.deepFailShare,r.midFailShare].join('\t'));
P('');
P('=== by decade (median) ===');
P('dec\trange\tsize\tnodes\ttrapDepth\ttrapRatio\tdeepFail\tmidFail\tfailRoots');
for(let d=0;d<10;d++){const rs=rows.slice(d*10,d*10+10);
  P([`dec${d+1}`,`${rs[0].id}-${rs[9].id}`,rs[0].size,med(rs.map(r=>r.nodes)),med(rs.map(r=>r.trapDepth)),+med(rs.map(r=>r.trapDepthRatio)).toFixed(2),+med(rs.map(r=>r.deepFailShare)).toFixed(2),+med(rs.map(r=>r.midFailShare)).toFixed(2),med(rs.map(r=>r.failRoots))].join('\t'));}
P('');
P('=== within-size halves ===');
for(const size of [4,5,6,7]){const rs=rows.filter(r=>r.size===size),h=Math.floor(rs.length/2),A=rs.slice(0,h),B=rs.slice(h);
  P(`${size}x${size}: trapDepth ${med(A.map(r=>r.trapDepth))} -> ${med(B.map(r=>r.trapDepth))} | trapRatio ${+med(A.map(r=>r.trapDepthRatio)).toFixed(2)} -> ${+med(B.map(r=>r.trapDepthRatio)).toFixed(2)} | deepFail ${+med(A.map(r=>r.deepFailShare)).toFixed(2)} -> ${+med(B.map(r=>r.deepFailShare)).toFixed(2)} | nodes ${med(A.map(r=>r.nodes))} -> ${med(B.map(r=>r.nodes))}`);}
P('');
P('=== boundary: last 5 of size N vs first 5 of size N+1 ===');
for(const [a0,a1,b0,b1,na,nb] of [[6,10,11,15,'4x4','5x5'],[31,35,36,40,'5x5','6x6'],[66,70,71,75,'6x6','7x7']]){
  const A=rows.filter(r=>r.id>=a0&&r.id<=a1),B=rows.filter(r=>r.id>=b0&&r.id<=b1);
  P(`${na} #${a0}-${a1} -> ${nb} #${b0}-${b1}: trapDepth ${med(A.map(r=>r.trapDepth))} -> ${med(B.map(r=>r.trapDepth))} | trapRatio ${+med(A.map(r=>r.trapDepthRatio)).toFixed(2)} -> ${+med(B.map(r=>r.trapDepthRatio)).toFixed(2)} | deepFail ${+med(A.map(r=>r.deepFailShare)).toFixed(2)} -> ${+med(B.map(r=>r.deepFailShare)).toFixed(2)} | nodes ${med(A.map(r=>r.nodes))} -> ${med(B.map(r=>r.nodes))}`);}
P('');
P('=== ranges per size ===');
for(const size of [4,5,6,7]){const rs=rows.filter(r=>r.size===size);
  for(const k of ['nodes','trapDepth','trapDepthRatio','deepFailShare','failRoots']){const v=rs.map(r=>r[k]);P(`${size}x${size} ${k.padEnd(16)} min ${Math.min(...v)} p25 ${q(v,.25).toFixed(2)} med ${med(v).toFixed(2)} p75 ${q(v,.75).toFixed(2)} max ${Math.max(...v)}`);}P('');}
P(`timeouts/censored: ${rows.filter(r=>r.timedOut).length}`);
console.log(out.join('\n'));
