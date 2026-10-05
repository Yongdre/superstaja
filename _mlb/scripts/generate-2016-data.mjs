import { readFileSync } from "node:fs";
const raw = JSON.parse(readFileSync(new URL("../docs/sources/mlb-2016-records.json", import.meta.url), "utf8"));
const positions = ["C","1B","2B","3B","SS","LF","CF","RF","DH"];
const battingKeys = ["plateAppearances","atBats","hits","doubles","triples","homeRuns","baseOnBalls","strikeOuts","stolenBases","caughtStealing"];
const clamp = (x,lo,hi) => Math.max(lo,Math.min(hi,x));
const rounded = (x,n=3) => Number(x.toFixed(n));
const grade = p => { const r=(p.stuff+p.movement+p.control)/3; return r>=85?"S":r>=78?"A":r>=70?"B":r>=60?"C":"D"; };
const ownership = new Map();
for(const team of raw.teams) for(const p of [...team.hitting,...team.pitching]) {
  const work = p.plateAppearances ?? p.outs;
  if(!ownership.has(p.id) || ownership.get(p.id).work<work) ownership.set(p.id,{team:team.team.id,work});
}
// 주요 시즌 중 이적자는 시즌 후반 소속팀에 한 번만 배치합니다.
const tradedTo = {547973:"CHC",453192:"CLE",453343:"WSH",518960:"TEX",136860:"TEX",457803:"NYM",502210:"LAD",448179:"LAD",467100:"PIT",519141:"BOS",519043:"SF",461314:"ATL"};
for(const [id,team] of Object.entries(tradedTo)) ownership.set(Number(id),{team});
const forced = {LAD:[448179],CHC:[547973],CLE:[453192],WSH:[453343],SF:[519043],PIT:[467100],BOS:[519141],TEX:[506433]};
const closerOverride = {CHC:547973,WSH:453343};
const owns = (team,p) => ownership.get(p.id)?.team===team.team.id;
const pitcherRole = p => p.gamesStarted>0 && p.gamesStarted>=p.gamesPlayed*.4 ? "SP":"RP";

function selectHitters(team) {
  const players=team.hitting.filter(p=>p.position!=="P" && p.plateAppearances>0 && owns(team,p));
  let dp=new Map([[0,{score:0,slots:[]}]]);
  for(const p of players) {
    const next=new Map(dp);
    for(const [mask,entry] of dp) for(let i=0;i<9;i++) {
      if(mask&(1<<i)) continue;
      const games=team.fielding.filter(f=>f.id===p.id && f.position===positions[i]).reduce((s,f)=>s+f.gamesPlayed,0);
      if(positions[i]!=="DH" && games<10) continue;
      const seasonPA = tradedTo[p.id]===team.team.id ? raw.teams.reduce((s,t)=>s+(t.hitting.find(h=>h.id===p.id)?.plateAppearances??0),0) : p.plateAppearances;
      const score=entry.score+seasonPA+Math.min(games,162)*.6+(p.id===596142?10000:0);
      const key=mask|(1<<i);
      if(!next.has(key)||next.get(key).score<score) {const slots=[...entry.slots];slots[i]=p;next.set(key,{score,slots});}
    }
    dp=next;
  }
  if(!dp.has(511)) throw new Error(`Cannot field nine representatives: ${team.team.id}`);
  return dp.get(511).slots.map((p,i)=>({...p,assignedPosition:positions[i]}));
}
function selectPitchers(team) {
  const eligible=team.pitching.filter(p=>owns(team,p) && p.outs>0);
  const choose = (players,count,priorities,sort) => [...players].sort((a,b)=>Number(priorities.includes(b.id))-Number(priorities.includes(a.id)) || sort(a,b)).slice(0,count);
  const starters=choose(eligible.filter(p=>pitcherRole(p)==="SP"),5,forced[team.team.id]??[],(a,b)=>b.gamesStarted-a.gamesStarted||b.outs-a.outs);
  const bullpen=choose(eligible.filter(p=>pitcherRole(p)==="RP"),6,forced[team.team.id]??[],(a,b)=>(b.outs+b.saves*6+b.holds*2)-(a.outs+a.saves*6+a.holds*2));
  if(starters.length!==5||bullpen.length!==6) throw new Error(`Missing pitchers: ${team.team.id}`);
  const closer=bullpen.find(p=>p.id===closerOverride[team.team.id])??[...bullpen].sort((a,b)=>b.saves-a.saves||b.holds-a.holds||b.outs-a.outs)[0];
  return [...starters.map(p=>({...p,role:"SP"})),...bullpen.filter(p=>p.id!==closer.id).map(p=>({...p,role:"RP"})),{...closer,role:"CP"}];
}
const selected=raw.teams.map(team=>({team:team.team.id,hitters:selectHitters(team),pitchers:selectPitchers(team)}));
if(process.argv.includes("--selection")) {console.log(JSON.stringify(selected));process.exit(0);}
const people=JSON.parse(readFileSync(new URL("../docs/sources/mlb-2016-people.json",import.meta.url),"utf8"));
const personById=new Map(people.map(p=>[p.id,p]));
const annualPitching=new Map();
for(const team of raw.teams) for(const p of team.pitching) {
  const totals=annualPitching.get(p.id)??{outs:0,earnedRuns:0,homeRuns:0,baseOnBalls:0,strikeOuts:0,gamesPlayed:0,gamesStarted:0};
  for(const key of Object.keys(totals)) totals[key]+=p[key];
  annualPitching.set(p.id,totals);
}
const sum = (players,key) => players.reduce((s,p)=>s+p[key],0);
const allPitchers=raw.teams.flatMap(team=>team.pitching);
const rates = players => {const outs=sum(players,"outs");return {era:27*sum(players,"earnedRuns")/outs,k9:27*sum(players,"strikeOuts")/outs,bb9:27*sum(players,"baseOnBalls")/outs,hr9:27*sum(players,"homeRuns")/outs};};
const league=rates(allPitchers);
const speedGrade = attempts => attempts>=55?10:attempts>=43?9:attempts>=31?8:attempts>=15?7:attempts>=9?6:attempts>=5?5:attempts>=2?4:attempts>=1?3:2;

function blendHitters(team,players) {
  // 타격 기록을 모두 보존하는 노출량 재분배: 주전의 초과 타석과 백업 타석을 빈 자리에 채웁니다.
  const source=team.hitting.filter(p=>p.position!=="P" && p.plateAppearances>0);
  const targetPA=sum(source,"plateAppearances")/9;
  const buckets=players.map(p=>Object.fromEntries(battingKeys.map(key=>[key,p[key]*Math.min(1,targetPA/p.plateAppearances)])));
  const assigned=new Map(players.map((p,i)=>[p.id,i]));
  const pool=source.map(p=>({p,pa:p.plateAppearances-(assigned.has(p.id)?buckets[assigned.get(p.id)].plateAppearances:0)})).filter(row=>row.pa>1e-8);
  const contributions=players.map(()=>[]);
  for(const row of pool) {
    const pos=new Set(team.fielding.filter(f=>f.id===row.p.id && f.position!=="P").map(f=>f.position));
    for(const samePosition of [true,false]) {
      const destinations=players.map((p,i)=>i).filter(i=>targetPA-buckets[i].plateAppearances>1e-8 && (!samePosition||pos.has(players[i].assignedPosition)));
      const need=destinations.reduce((s,i)=>s+targetPA-buckets[i].plateAppearances,0);
      const allocated=Math.min(row.pa,need);
      if(!allocated) continue;
      for(const i of destinations) {
        const pa=allocated*(targetPA-buckets[i].plateAppearances)/need;
        for(const key of battingKeys) buckets[i][key]+=row.p[key]*pa/row.p.plateAppearances;
        contributions[i].push({id:row.p.id,name:row.p.name,plateAppearances:rounded(pa,2)});
      }
      row.pa-=allocated;
    }
    if(row.pa>1e-5) throw new Error("Unallocated batter exposure");
  }
  for(const key of battingKeys) if(Math.abs(sum(buckets,key)-sum(source,key))>1e-5) throw new Error(`Hitting totals not preserved: ${team.team.id} ${key}`);
  const hitters=players.map((p,i)=>{
    const b=buckets[i],info=personById.get(p.id);
    if(!info) throw new Error(`Missing player identity ${p.id}`);
    const fullPA=162*4.1;
    const annualRows=raw.teams.flatMap(t=>t.hitting.filter(h=>h.id===p.id));
    const a=Object.fromEntries(battingKeys.map(key=>[key,sum(annualRows,key)]));
    // 짧은 이적 후 기록/백업 부진이 대표 선수의 특징을 지우지 않도록 개인 연간 비율을 60~85% 유지합니다.
    const share=clamp(1-p.plateAppearances/targetPA,.15,.40);
    const mixed=(key,denom)=>a[key]/a[denom]*(1-share)+b[key]/b[denom]*share;
    const attempts=.75*(a.stolenBases+a.caughtStealing)*fullPA/a.plateAppearances+.25*(b.stolenBases+b.caughtStealing)*fullPA/b.plateAppearances;
    return {id:`${team.team.id}-${p.id}`,name:p.name,position:p.assignedPosition,bats:info.batSide,
      availability:"REGULAR",statProfile:{games:162,avg:mixed("hits","atBats"),homeRuns:mixed("homeRuns","plateAppearances")*fullPA,eye:clamp(Math.round((mixed("baseOnBalls","plateAppearances")-.048)/.008),1,10),speed:speedGrade(attempts)}};
  });
  // 마지막에 팀 타율·홈런/타석 비율로 중심을 맞춥니다. 최종 게임 성적을 강제하는 보정은 아닙니다.
  const targetAvg=sum(source,"hits")/sum(source,"atBats");
  const abWeights=hitters.map(p=>1-(.048+p.statProfile.eye*.008)-.009-.006);
  let low=-1,high=1;
  for(let step=0;step<70;step++) {
    const shift=(low+high)/2,avg=hitters.reduce((s,p,i)=>s+clamp(p.statProfile.avg+shift,.15,.399)*abWeights[i],0)/abWeights.reduce((s,w)=>s+w,0);
    if(avg<targetAvg)low=shift;else high=shift;
  }
  const targetHR=Math.round(sum(source,"homeRuns")/sum(source,"plateAppearances")*162*4.1*9);
  const hrScale=targetHR/hitters.reduce((s,p)=>s+p.statProfile.homeRuns,0);
  const exactHR=hitters.map(p=>p.statProfile.homeRuns*hrScale);
  hitters.forEach((p,i)=>{p.statProfile.avg=rounded(clamp(p.statProfile.avg+(low+high)/2,.15,.399));p.statProfile.homeRuns=Math.floor(exactHR[i]);});
  const residual=targetHR-hitters.reduce((s,p)=>s+p.statProfile.homeRuns,0);
  const fractions=exactHR.map((h,i)=>({i,f:h-Math.floor(h)})).sort((a,b)=>b.f-a.f);
  for(let i=0;i<residual;i++)hitters[fractions[i].i].statProfile.homeRuns++;
  // 이름값이 아니라 조정된 타격/주루 프로필로 간단한 타순을 정합니다.
  const cleanup=[...hitters].sort((a,b)=>(b.statProfile.homeRuns+b.statProfile.avg*40)-(a.statProfile.homeRuns+a.statProfile.avg*40))[0];
  const remaining=hitters.filter(p=>p!==cleanup),lineup=[];
  const pick=score=>{remaining.sort((a,b)=>score(b)-score(a));lineup.push(remaining.shift());};
  pick(p=>p.statProfile.speed*2+p.statProfile.eye*1.5+p.statProfile.avg*120-p.statProfile.homeRuns*.4);
  pick(p=>p.statProfile.avg*100+p.statProfile.eye*2);
  pick(p=>p.statProfile.avg*100+p.statProfile.homeRuns*.5);
  lineup.push(cleanup);
  while(remaining.length) pick(p=>p.statProfile.avg*100+p.statProfile.homeRuns*.5+p.statProfile.eye);
  return {hitters:lineup,audit:{sourceTotals:Object.fromEntries(battingKeys.map(key=>[key,sum(source,key)])),targetPlateAppearances:targetPA,buckets:players.map((p,i)=>({id:p.id,name:p.name,position:p.assignedPosition,original:p,merged:buckets[i],contributions:contributions[i]}))}};
}

function blendPitchers(team,players) {
  const output=[],audit=[];
  for(const group of ["SP","RP"]) {
    const pool=team.pitching.filter(p=>pitcherRole(p)===group && p.outs>0);
    const reps=players.filter(p=>group==="SP"?p.role==="SP":p.role!=="SP");
    const target=rates(pool);
    const preliminary=reps.map(p=>{
      const a=annualPitching.get(p.id),r=rates([a]),ip=a.outs/3,weight=ip/(ip+(group==="SP"?30:15));
      return Object.fromEntries(Object.keys(target).map(key=>[key,target[key]+weight*(r[key]-target[key])]));
    });
    const blended=preliminary.map(()=>({}));
    for(const key of Object.keys(target)) {
      const lowBound=key==="era"?.8:key==="k9"?2:key==="bb9"?.5:.1;
      const highBound=key==="era"?9:key==="k9"?16:key==="bb9"?7:3;
      let low=-30,high=30;
      for(let i=0;i<80;i++) {const shift=(low+high)/2,mean=preliminary.reduce((s,p)=>s+clamp(p[key]+shift,lowBound,highBound),0)/reps.length;if(mean<target[key])low=shift;else high=shift;}
      reps.forEach((_,i)=>blended[i][key]=clamp(preliminary[i][key]+(low+high)/2,lowBound,highBound));
    }
    reps.forEach((p,i)=>{
      const r=blended[i],a=annualPitching.get(p.id),info=personById.get(p.id);
      if(!info) throw new Error(`Missing pitcher identity ${p.id}`);
      const quality=(league.era-r.era)*7;
      const out={id:`${team.team.id}-${p.id}`,name:p.name,throws:info.pitchHand,role:p.role,
        stuff:clamp(Math.round(72+quality+(r.k9-league.k9)*4),25,97),movement:clamp(Math.round(72+quality+(league.hr9-r.hr9)*8),25,97),control:clamp(Math.round(72+(league.bb9-r.bb9)*8+quality*.2),25,97),
        stamina:Math.round(group==="SP"?clamp(38+(a.outs/3)/Math.max(1,a.gamesStarted)*8,65,96):clamp(38+(a.outs/3)/Math.max(1,a.gamesPlayed)*5,40,57))};
      out.grade=grade(out);output.push(out);
      audit.push({id:p.id,name:p.name,role:p.role,annual:a,compressedRates:r,ratings:out});
    });
    audit.push({group,sourcePlayers:pool.length,omittedPlayers:pool.filter(p=>!reps.some(r=>r.id===p.id)).map(p=>p.name),targetRates:target,meanCompressedRates:Object.fromEntries(Object.keys(target).map(key=>[key,blended.reduce((s,p)=>s+p[key],0)/reps.length]))});
  }
  const rating=p=>(p.stuff+p.movement+p.control)/3;
  const starters=output.filter(p=>p.role==="SP").sort((a,b)=>rating(b)-rating(a));
  const relievers=output.filter(p=>p.role==="RP").sort((a,b)=>rating(b)-rating(a));
  return {pitchers:[...starters,...relievers,...output.filter(p=>p.role==="CP")],audit};
}
const dataset={schemaVersion:1,label:"2016 MLB 실제 기록 기반 · 주전 9 / 선발 5 / 불펜 6 압축판",sourceSeason:2016,teams:{}};
const audit={season:2016,leagueRates:league,ownershipOverrides:tradedTo,teams:{}};
const filter = process.argv.find(arg=>arg.startsWith("--teams="))?.slice(8).split(",");
for(const team of raw.teams.filter(team=>!filter||filter.includes(team.team.id))) {
  const roster=selected.find(s=>s.team===team.team.id),batting=blendHitters(team,roster.hitters),pitching=blendPitchers(team,roster.pitchers);
  dataset.teams[team.team.id]={...team.team,shortName:team.team.id,primary:team.team.league==="AL"?"#1d4775":"#795228",accent:"#e8b664",strength:70,hitters:batting.hitters,pitchers:pitching.pitchers};
  audit.teams[team.team.id]={hitting:batting.audit,pitching:pitching.audit};
}
console.log(JSON.stringify(process.argv.includes("--audit")?audit:dataset,null,process.argv.includes("--compact")?undefined:2));
