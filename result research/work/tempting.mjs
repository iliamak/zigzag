// Tempting-decoy metrics: not all decoys are equal.
// forward = decoy keeps the current heading (looks like "just keep going")
// open    = decoy enters a cell with >=2 free unvisited neighbours (leads into space)
// trap    = forward AND open (the classic "I was sure that was right")
import { readFileSync, writeFileSync } from 'node:fs';
const L = JSON.parse(readFileSync('/home/user/uploads/levels.json','utf8'));
const gridNeighbors=(size,cell)=>{const r=Math.floor(cell/size),c=cell%size,out=[];if(r>0)out.push(cell-size);if(r<size-1)out.push(cell+size);if(c>0)out.push(cell-1);if(c<size-1)out.push(cell+1);return out;};
const edgeKey=(a,b)=>a<b?`${a}:${b}`:`${b}:${a}`;
const dir=(size,a,b)=>[(Math.floor(b/size)-Math.floor(a/size)),(b%size)-(a%size)];

function tm(l){
  const {size,numbers,walls}=l, sol=l._solution, total=size*size;
  const blocked=new Set(walls.map(([a,b])=>edgeKey(a,b)));
  const idx=new Map(sol.map((c,i)=>[c,i]));
  const maxNum=Math.max(...Object.values(numbers));
  const visited=new Set([sol[0]]);
  let next=numbers[sol[0]]===1?2:1;
  let decoys=0, forward=0, open=0, trap=0, decSteps=0, straightRunMax=0, straightRunCur=0;
  for(let i=1;i<sol.length;i++){
    const head=sol[i-1], correct=sol[i];
    const [cr,cc]=dir(size,head,correct);
    const legal=[]; 
    for(const n of gridNeighbors(size,head)){
      if(visited.has(n)||blocked.has(edgeKey(head,n)))continue;
      const num=numbers[n]; if(num!==undefined&&num!==next)continue;
      if(num===maxNum&&total-i!==1)continue;
      legal.push(n);
    }
    const decoysHere=legal.filter(n=>n!==correct);
    decoys+=decoysHere.length; if(decoysHere.length)decSteps++;
    for(const d of decoysHere){
      const [dr,dc]=dir(size,head,d);
      const isFwd=(dr===cr&&dc===cc);
      visited.add(d);
      const freeNb=gridNeighbors(size,d).filter(x=>!visited.has(x)&&!blocked.has(edgeKey(d,x))).length;
      visited.delete(d);
      const isOpen=freeNb>=2;
      if(isFwd)forward++;
      if(isOpen)open++;
      if(isFwd&&isOpen)trap++;
    }
    // longest run of forced straight steps along the solution
    if(i>=2){
      const [pr,pc]=dir(size,sol[i-2],sol[i-1]);
      if(pr===cr&&pc===cc){straightRunCur++;straightRunMax=Math.max(straightRunMax,straightRunCur);}else straightRunCur=0;
    }
    visited.add(correct);
    if(numbers[correct]!==undefined)next++;
  }
  const flags=Object.keys(numbers).length;
  return {id:l.id,size,total,flags,nodes:l.metrics.solverNodes,maxGap:l.metrics.maxGap,turns:l.metrics.turns,
    decoys,trap,forward,open,decSteps,straightRunMax,
    trapPerCell:+(trap/(total-1)).toFixed(3), trapPerDecision:+(trap/Math.max(1,decSteps)).toFixed(2),
    decisionDensity:+(decSteps/(total-1)).toFixed(2),
  };
}
const rows=L.map(tm);
const med=a=>{const s=[...a].sort((x,y)=>x-y);return s.length%2?s[(s.length-1)/2]:(s[s.length/2-1]+s[s.length/2])/2;};
const out=[];const P=s=>out.push(s);
P('id\tsize\tnodes\tdecoys\ttrap\tforward\topen\tdecSteps\ttrap/cell\ttrap/decision\tdecSteps/cell\tstraightRunMax');
for(const r of rows)P([r.id,r.size,r.nodes,r.decoys,r.trap,r.forward,r.open,r.decSteps,r.trapPerCell,r.trapPerDecision,r.decisionDensity,r.straightRunMax].join('\t'));
P('');
P('=== by decade (median) ===');
P('dec\trange\tsize\tnodes\tdecoys\ttrap\tforward\topen\tdecSteps\ttrap/cell\ttrap/decision\tdecSteps/cell\tstraightRun');
for(let d=0;d<10;d++){const rs=rows.slice(d*10,d*10+10);
 P([`dec${d+1}`,`${rs[0].id}-${rs[9].id}`,rs[0].size,med(rs.map(r=>r.nodes)),med(rs.map(r=>r.decoys)),med(rs.map(r=>r.trap)),med(rs.map(r=>r.forward)),med(rs.map(r=>r.open)),med(rs.map(r=>r.decSteps)),+med(rs.map(r=>r.trapPerCell)).toFixed(3),+med(rs.map(r=>r.trapPerDecision)).toFixed(2),+med(rs.map(r=>r.decisionDensity)).toFixed(2),med(rs.map(r=>r.straightRunMax))].join('\t'));}
P('');
P('=== within-size halves ===');
for(const size of [4,5,6,7]){const rs=rows.filter(r=>r.size===size),h=Math.floor(rs.length/2),A=rs.slice(0,h),B=rs.slice(h);
 P(`${size}x${size}: trap ${med(A.map(r=>r.trap))} -> ${med(B.map(r=>r.trap))} | trap/decision ${+med(A.map(r=>r.trapPerDecision)).toFixed(2)} -> ${+med(B.map(r=>r.trapPerDecision)).toFixed(2)} | decisionDensity ${+med(A.map(r=>r.decisionDensity)).toFixed(2)} -> ${+med(B.map(r=>r.decisionDensity)).toFixed(2)} | straightRunMax ${med(A.map(r=>r.straightRunMax))} -> ${med(B.map(r=>r.straightRunMax))} | nodes ${med(A.map(r=>r.nodes))} -> ${med(B.map(r=>r.nodes))}`);}
P('');
P('=== ranges per size ===');
for(const size of [4,5,6,7]){const rs=rows.filter(r=>r.size===size);
 for(const k of ['decoys','trap','forward','open','decSteps','trapPerCell','trapPerDecision','straightRunMax']){const v=rs.map(r=>r[k]);
 P(`${size}x${size} ${k.padEnd(16)} min ${Math.min(...v)} med ${+med(v).toFixed(3)} max ${Math.max(...v)}`);}P('');}
function corr(a,b){const n=a.length,ma=a.reduce((x,y)=>x+y)/n,mb=b.reduce((x,y)=>x+y)/n;let sa=0,sb=0,sab=0;for(let i=0;i<n;i++){sa+=(a[i]-ma)**2;sb+=(b[i]-mb)**2;sab+=(a[i]-ma)*(b[i]-mb);}return sab/Math.sqrt(sa*sb);}
const ln=x=>Math.log(x+1);
P('=== correlation with log(nodes) / with trap ===');
for(const k of ['decoys','trap','forward','open','decSteps','straightRunMax','maxGap','turns'])
 P(`${k.padEnd(16)} r(logNodes)=${corr(rows.map(r=>ln(r.nodes)),rows.map(r=>r[k])).toFixed(2)}  r(trap)=${corr(rows.map(r=>r.trap),rows.map(r=>r[k])).toFixed(2)}`);
writeFileSync('/home/user/work/tempting.txt',out.join('\n'));
console.log(out.join('\n'));
