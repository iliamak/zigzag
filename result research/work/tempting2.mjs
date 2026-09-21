// CORRECTED temptation metric.
// At each step the player's habit is "keep going" (inertia). The tempting move is the one
// collinear with the INCOMING heading. Measure:
//   mustTurn  : correct move is a turn AND the straight-ahead cell is legal (a live temptation)
//   trapStraight: ... and that straight cell is not visited/blocked and is a real legal decoy
//   sideDecoys: decoys that are turns (side branches)
//   straightRunMax: longest forced straight run
import { readFileSync, writeFileSync } from 'node:fs';
const L = JSON.parse(readFileSync('/home/user/uploads/levels.json','utf8'));
const gridNeighbors=(size,cell)=>{const r=Math.floor(cell/size),c=cell%size,out=[];if(r>0)out.push(cell-size);if(r<size-1)out.push(cell+size);if(c>0)out.push(cell-1);if(c<size-1)out.push(cell+1);return out;};
const edgeKey=(a,b)=>a<b?`${a}:${b}`:`${b}:${a}`;
const dirOf=(size,a,b)=>[Math.floor(b/size)-Math.floor(a/size),(b%size)-(a%size)];
const same=(d1,d2)=>d1[0]===d2[0]&&d1[1]===d2[1];

function tm(l){
  const {size,numbers,walls}=l, sol=l._solution, total=size*size;
  const blocked=new Set(walls.map(([a,b])=>edgeKey(a,b)));
  const maxNum=Math.max(...Object.values(numbers));
  const visited=new Set([sol[0]]);
  let next=numbers[sol[0]]===1?2:1;
  let decoys=0, sideDecoys=0, straightDecoys=0, backDecoys=0;
  let decisions=0, mustTurn=0, mustTurnLive=0, turnWithOpenStraight=0, straightCorrect=0, turnCorrect=0;
  let straightRunMax=0, straightRunCur=0;
  for(let i=1;i<sol.length;i++){
    const head=sol[i-1], correct=sol[i];
    const incoming = i>=2 ? dirOf(size, sol[i-2], sol[i-1]) : null;
    // legal moves
    const legal=[];
    for(const n of gridNeighbors(size,head)){
      if(visited.has(n)||blocked.has(edgeKey(head,n)))continue;
      const num=numbers[n]; if(num!==undefined&&num!==next)continue;
      if(num===maxNum&&total-i!==1)continue;
      legal.push(n);
    }
    if(legal.length>=2)decisions++;
    const correctDir=dirOf(size,head,correct);
    const isStraight = incoming ? same(incoming, correctDir) : null;
    if(isStraight===true)straightCorrect++; if(isStraight===false)turnCorrect++;
    for(const d of legal){
      if(d===correct)continue;
      decoys++;
      const dd=dirOf(size,head,d);
      if(incoming&&same(incoming,dd))straightDecoys++;
      else if(incoming&&dd[0]===-incoming[0]&&dd[1]===-incoming[1])backDecoys++;
      else sideDecoys++;
    }
    // how tempting was the "keep going" option when the correct move is a turn?
    if(isStraight===false && incoming){
      const straightCell = head + incoming[0]*size + incoming[1];
      // valid only if inside board and orthogonal neighbours relation
      const r=Math.floor(head/size)+incoming[0], c=(head%size)+incoming[1];
      if(r>=0&&r<size&&c>=0&&c<size){
        mustTurn++;
        const sc=r*size+c;
        if(!visited.has(sc) && !blocked.has(edgeKey(head,sc))) mustTurnLive++;
      }
    }
    if(i>=2){
      const prev=dirOf(size,sol[i-2],sol[i-1]);
      if(same(prev,correctDir)){straightRunCur++;straightRunMax=Math.max(straightRunMax,straightRunCur);}else straightRunCur=0;
    }
    visited.add(correct);
    if(numbers[correct]!==undefined)next++;
  }
  return {id:l.id,size,total,nodes:l.metrics.solverNodes,flags:Object.keys(numbers).length,
    decoys,sideDecoys,straightDecoys,backDecoys,decisions,mustTurn,mustTurnLive,
    straightCorrect,turnCorrect,straightRunMax,
    mustTurnShare:+(mustTurnLive/Math.max(1,turnCorrect)).toFixed(2),
    sidePerDecision:+(sideDecoys/Math.max(1,decisions)).toFixed(2),
    decisionsPerCell:+(decisions/(total-1)).toFixed(2),
  };
}
const rows=L.map(tm);
const med=a=>{const s=[...a].sort((x,y)=>x-y);return s.length%2?s[(s.length-1)/2]:(s[s.length/2-1]+s[s.length/2])/2;};
const out=[];const P=s=>out.push(s);
P('id\tsize\tnodes\tdecoys\tside\tstraight\tback\tdecisions\tmustTurn\tmustTurnLive\tturnCorrect\tstraightCorrect\tmustTurnShare\tside/dec\tdec/cell\tstraightRunMax');
for(const r of rows)P([r.id,r.size,r.nodes,r.decoys,r.sideDecoys,r.straightDecoys,r.backDecoys,r.decisions,r.mustTurn,r.mustTurnLive,r.turnCorrect,r.straightCorrect,r.mustTurnShare,r.sidePerDecision,r.decisionsPerCell,r.straightRunMax].join('\t'));
P('');
P('=== by decade (median) ===');
P('dec\trange\tsize\tnodes\tdecoys\tside\tstraight\tback\tdecisions\tmustTurnLive\tturnCorrect\tmustTurnShare\tside/dec\tdec/cell');
for(let d=0;d<10;d++){const rs=rows.slice(d*10,d*10+10);
 P([`dec${d+1}`,`${rs[0].id}-${rs[9].id}`,rs[0].size,med(rs.map(r=>r.nodes)),med(rs.map(r=>r.decoys)),med(rs.map(r=>r.sideDecoys)),med(rs.map(r=>r.straightDecoys)),med(rs.map(r=>r.backDecoys)),med(rs.map(r=>r.decisions)),med(rs.map(r=>r.mustTurnLive)),med(rs.map(r=>r.turnCorrect)),+med(rs.map(r=>r.mustTurnShare)).toFixed(2),+med(rs.map(r=>r.sidePerDecision)).toFixed(2),+med(rs.map(r=>r.decisionsPerCell)).toFixed(2)].join('\t'));}
P('');
P('=== within-size halves ===');
for(const size of [4,5,6,7]){const rs=rows.filter(r=>r.size===size),h=Math.floor(rs.length/2),A=rs.slice(0,h),B=rs.slice(h);
 P(`${size}x${size}: decoys ${med(A.map(r=>r.decoys))} -> ${med(B.map(r=>r.decoys))} | straightDecoys ${med(A.map(r=>r.straightDecoys))} -> ${med(B.map(r=>r.straightDecoys))} | mustTurnLive ${med(A.map(r=>r.mustTurnLive))} -> ${med(B.map(r=>r.mustTurnLive))} | mustTurnShare ${+med(A.map(r=>r.mustTurnShare)).toFixed(2)} -> ${+med(B.map(r=>r.mustTurnShare)).toFixed(2)} | decisions ${med(A.map(r=>r.decisions))} -> ${med(B.map(r=>r.decisions))}`);}
P('');
P('=== ranges per size ===');
for(const size of [4,5,6,7]){const rs=rows.filter(r=>r.size===size);
 for(const k of ['decoys','straightDecoys','backDecoys','decisions','mustTurnLive','mustTurnShare','sidePerDecision','straightRunMax']){const v=rs.map(r=>r[k]);
 P(`${size}x${size} ${k.padEnd(16)} min ${Math.min(...v)} med ${+med(v).toFixed(3)} max ${Math.max(...v)}`);}P('');}
function corr(a,b){const n=a.length,ma=a.reduce((x,y)=>x+y)/n,mb=b.reduce((x,y)=>x+y)/n;let sa=0,sb=0,sab=0;for(let i=0;i<n;i++){sa+=(a[i]-ma)**2;sb+=(b[i]-mb)**2;sab+=(a[i]-ma)*(b[i]-mb);}return sab/Math.sqrt(sa*sb);}
const ln=x=>Math.log(x+1);
P('=== correlation with log(nodes) ===');
for(const k of ['decoys','straightDecoys','backDecoys','decisions','mustTurnLive','mustTurnShare','sidePerDecision','straightRunMax','nodes'])
 P(`${k.padEnd(16)} r=${corr(rows.map(r=>ln(r.nodes)),rows.map(r=>r[k])).toFixed(2)}`);
writeFileSync('/home/user/work/tempting2.txt',out.join('\n'));
console.log(out.join('\n'));
