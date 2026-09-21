import json, statistics as st
L=json.load(open('/home/user/uploads/levels.json'))
def nb(size,c):
    r,c2=divmod(c,size); o=[]
    if r>0:o.append(c-size)
    if r<size-1:o.append(c+size)
    if c2>0:o.append(c-1)
    if c2<size-1:o.append(c+1)
    return o
def ek(a,b): return (a,b) if a<b else (b,a)
def dirOf(size,a,b): return (b//size-a//size, b%size-a%size)
def metric(l):
    size=l['size']; sol=l['_solution']; total=size*size
    numbers={int(k):v for k,v in l['numbers'].items()}
    blocked={ek(a,b) for a,b in l['walls']}
    maxNum=max(numbers.values())
    visited={sol[0]}; nxt=2 if numbers[sol[0]]==1 else 1
    decoys=decisions=straightDecoys=trap=0; turnsRight=0
    srMax=srCur=0; forced=0; steps=0
    for i in range(1,len(sol)):
        head,correct=sol[i-1],sol[i]
        legal=[]
        for n in nb(size,head):
            if n in visited or ek(head,n) in blocked: continue
            num=numbers.get(n)
            if num is not None and num!=nxt: continue
            if num==maxNum and total-i!=1: continue
            legal.append(n)
        if len(legal)>=2: decisions+=1
        if len(legal)==1: forced+=1
        inc = dirOf(size,sol[i-2],sol[i-1]) if i>=2 else None
        cd = dirOf(size,head,correct)
        for d in legal:
            if d==correct: continue
            decoys+=1
            if inc and dirOf(size,head,d)==inc: straightDecoys+=1
        if i>=2:
            if inc==cd: srCur+=1; srMax=max(srMax,srCur)
            else: srCur=0
        visited.add(correct); steps+=1
        if correct in numbers: nxt+=1
    pos=sorted((sol.index(c) for c in numbers), key=lambda p:p)
    gaps=[pos[i+1]-pos[i] for i in range(len(pos)-1)]
    return dict(id=l['id'],size=size,decoys=decoys,decoyPerCell=round(decoys/(total-1),3),
        decisions=decisions,straightDecoys=straightDecoys,sm=srMax,
        maxGap=max(gaps),genMaxGap=l['metrics']['maxGap'],walls=len(l['walls']),
        nodes=l['metrics']['solverNodes'],mustTurnLive=0)
R=[metric(l) for l in L]
print("=== decade medians (Python cross-check) ===")
print("dec range size nodes decoys dec/cell decisions straightDec straightRun maxGap walls")
for d in range(10):
    g=R[d*10:d*10+10]
    m=lambda k: st.median([x[k] for x in g])
    print(f"dec{d+1}\t{g[0]['id']}-{g[-1]['id']}\t{g[0]['size']}\t{int(m('nodes'))}\t{int(m('decoys'))}\t{m('decoyPerCell'):.3f}\t{m('decisions')}\t{m('straightDecoys')}\t{m('sm')}\t{m('maxGap')}\t{m('walls')}")
print()
print("=== per-size ranges ===")
for size in (4,5,6,7):
    g=[x for x in R if x['size']==size]
    for k in ('decoys','decoyPerCell','decisions','straightDecoys','sm','maxGap','walls','nodes'):
        v=[x[k] for x in g]
        print(f"{size}x{size} {k:<15} min {min(v)} med {st.median(v)} max {max(v)}")
    print()
print("gen maxGap == recomputed maxGap for all levels:", all(x['maxGap']==x['genMaxGap'] for x in R))
print()
print("=== boundary blocks (median) ===")
for a,b in ((31,35),(36,40),(66,70),(71,75)):
    g=[x for x in R if a<=x['id']<=b]
    print(f"#{a}-{b} ({g[0]['size']}x{g[0]['size']}): nodes {st.median([x['nodes'] for x in g])} dec/cell {st.median([x['decoyPerCell'] for x in g]):.3f} decisions {st.median([x['decisions'] for x in g])} straightDec {st.median([x['straightDecoys'] for x in g])} maxGap {st.median([x['maxGap'] for x in g])} walls {st.median([x['walls'] for x in g])}")
print()
print("=== shipped dec/cell ceiling per size ===")
for size in (4,5,6,7):
    g=[x for x in R if x['size']==size]
    print(f"{size}x{size}: max dec/cell {max(x['decoyPerCell'] for x in g):.3f} (level {max(g,key=lambda x:x['decoyPerCell'])['id']}) | median {st.median([x['decoyPerCell'] for x in g]):.3f}")
