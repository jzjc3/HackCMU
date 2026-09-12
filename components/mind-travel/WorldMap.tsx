'use client';
import React from 'react';
import type {Dimension,Memory,MemoryDraft,World,Region,Rating} from '@/lib/types';
import {STORE} from './constants';
import {Button,Chip,MonoLabel} from './Primitives';
import * as d3 from 'd3';
import {buildTerrain} from './terrain';
import type {RegionFeature} from './geo';
import {MapExplorerCursor} from './MapExplorerCursor';
const NEUTRAL = '#d9d9dd';
const W=960,H=500;
export const mix=(a:string,b:string,t:number)=>{const p=(h:string)=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));const x=p(a),y=p(b);return '#'+x.map((v,i)=>Math.round(v+(y[i]-v)*t).toString(16).padStart(2,'0')).join('')};
export const dimForRegion=(w:World,r:Region)=>w.dims.find(d=>d.active&&d.region===r)||null;
export const memsForDim=(w:World,id:string)=>w.memories.filter(m=>m.dims.includes(id)).sort((a,b)=>b.date.localeCompare(a.date)||b.created-a.created);
const bandsFor=(n:number)=>n<=0?0:Math.min(7,Math.floor(Math.log2(n))+1);
export const fmtDate=(s:string)=>new Date(s+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
export const THEMES={
  cartographic:{bg:'#ffffff',ocean:'#ffffff',dot:'#cfd2d9',shoal:'#dfe2e8',grat:'#e6e8ec',gratDash:'',sphere:'#c4c7ce',coast:'#17171c',coastW:.7,land:'#f7f7f5',wash:.62,line:'#17171c',lineOp:.26,rimLight:'#ffffff',fillOp:.86,bridge:'#17171c',labelFont:'var(--font-mono)',labelCase:'uppercase',labelSize:11.5,labelSpacing:.9,labelWeight:400,hatch:'#c9cad0'},
  atlas:{bg:'#eeece7',ocean:'#e3ded1',dot:'#c8c0ad',shoal:'#d3ccbb',grat:'#c9c2b2',gratDash:'2 4',sphere:'#9a8f7d',coast:'#4a4238',coastW:1,land:'#f6f2e8',wash:.55,line:'#3b3227',lineOp:.32,rimLight:'#fffdf7',fillOp:.9,bridge:'#4a4238',labelFont:'var(--font-display)',labelCase:'none',labelSize:14,labelSpacing:-0.2,labelWeight:500,hatch:'#bfb7a6'}
};
const STOP=new Set('the a an and or of to in on for with my me i was were is at before from into one once whole night hour first last new old along that this it but so'.split(' '));
const keywords=(mems:Memory[],k=6)=>{const f:Record<string,number>={};mems.forEach(m=>((m.title||'')+' '+m.text).toLowerCase().replace(/[^a-z\s]/g,' ').split(/\s+/).forEach(w=>{if(w.length>3&&!STOP.has(w))f[w]=(f[w]||0)+1}));return Object.entries(f).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,k)};
export const photoFor=(m:Memory)=>m.attachmentIds?.[0]?`/api/attachments/${encodeURIComponent(m.attachmentIds[0])}`:null;
const withPhotoCount=(R:{mems:Memory[]})=>R.mems.filter(photoFor).length;
const tint=(base:string,T:typeof THEMES.cartographic,k:number)=>k>=7?mix(base,'#000000',.16):mix(base,T.land,T.wash*(1-k/7));

export type Direction=keyof typeof THEMES; export type Geography='recognizable'|'abstract'; export type HoverMode='none'|'keywords'|'photos';
export type ZoomApi={in:()=>void;out:()=>void;reset:()=>void};
export type Preview={region:Region;color?:string|null;opacity?:number|null}|null;
type MapProps={features:RegionFeature[];world:World;selected:Region|null;onSelect:(r:Region)=>void;direction?:Direction;geography?:Geography;highlight?:Region[];reducedMotion?:boolean;preview?:Preview;zoomRef?:React.MutableRefObject<ZoomApi|undefined>;fitPad?:number;hoverMode?:HoverMode;bridgeFloor?:number;bridgeHalfLife?:number;explorerCursor?:boolean};

export function WorldMap({features,world,selected,onSelect,direction='cartographic',geography='recognizable',highlight=[],reducedMotion=false,preview,zoomRef,fitPad=16,hoverMode='none',bridgeFloor=8,bridgeHalfLife=12,explorerCursor=false}:MapProps){
  const T=THEMES[direction];
  const svgRef=React.useRef<SVGSVGElement>(null);const gRef=React.useRef<SVGGElement>(null);const wrapRef=React.useRef<HTMLDivElement>(null);
  const [hov,setHov]=React.useState<{r:Region;x:number;y:number;w:number;h:number}|null>(null);
  const track=(r:Region)=>(e:React.MouseEvent)=>{if(hoverMode==='none')return;const b=wrapRef.current!.getBoundingClientRect();setHov({r,x:e.clientX-b.left,y:e.clientY-b.top,w:b.width,h:b.height})};
  const proj=React.useMemo(()=>d3.geoNaturalEarth1().fitExtent([[fitPad,fitPad],[W-fitPad,H-fitPad]],{type:'FeatureCollection',features}),[features]);
  const path=React.useMemo(()=>d3.geoPath(proj),[proj]);
  const grat=React.useMemo(()=>path(d3.geoGraticule().step([30,30])()),[path]);
  const sphere=React.useMemo(()=>path({type:'Sphere'}),[path]);
  const shapes=React.useMemo(()=>features.map(f=>{const c=path.centroid(f);const area=path.area(f);if(geography==='abstract'){const r=Math.max(28,Math.sqrt(area)*.55);return {f,c,d:`M${c[0]-r},${c[1]}a${r},${r*.82} 0 1,0 ${r*2},0a${r},${r*.82} 0 1,0 -${r*2},0`,r,b:[[c[0]-r,c[1]-r*.82],[c[0]+r,c[1]+r*.82]] as [[number,number],[number,number]]}}return {f,c,d:path(f)!,r:Math.sqrt(area)/2,b:path.bounds(f)}}),[features,path,geography]);
  React.useEffect(()=>{const svg=d3.select(svgRef.current!);const z=d3.zoom<SVGSVGElement,unknown>().scaleExtent([1,6]).translateExtent([[0,0],[W,H]]).on('zoom',e=>{d3.select(gRef.current).attr('transform',e.transform.toString())});svg.call(z);if(zoomRef)zoomRef.current={in:()=>svg.transition().duration(reducedMotion?0:240).call(z.scaleBy,1.5),out:()=>svg.transition().duration(reducedMotion?0:240).call(z.scaleBy,1/1.5),reset:()=>svg.transition().duration(reducedMotion?0:240).call(z.transform,d3.zoomIdentity)}},[reducedMotion]);
  // terrain per region (memoised inside MT_TERRAIN)
  const regions=shapes.map(s=>{
    const r=s.f.id;const dim=dimForRegion(world,r);const ov=world.overrides[r];const pv=preview&&preview.region===r?preview:undefined;
    const mems=dim?memsForDim(world,dim.id):[];const n=mems.length;
    const base=pv?.color??ov?.color??(dim?dim.color:NEUTRAL);
    const clar=mems.flatMap(m=>m.clarity===null?[]:[m.clarity]);const autoOp=dim?(clar.length?.6+.4*(clar.reduce((a,b)=>a+b,0)/clar.length/5):T.fillOp):.6;
    const op=pv?.opacity??ov?.opacity??autoOp;
    const terr=dim&&n?buildTerrain(r+'|'+geography,s.d,s.b,[...mems].sort((a,b)=>a.created-b.created).map(m=>({id:m.id,importance:m.importance})),Math.max(8,Math.min(20,s.r*.16))):{levels:[],pts:{},summits:[]};
    return {s,r,dim,mems,n,base,op,terr};
  });
  const byRegion={} as Record<Region,typeof regions[number]>;regions.forEach(x=>{byRegion[x.r]=x});
  // bridges: one arc per dimension pair. Weight = Σ recency (half-life bridgeHalfLife months); share = weight / min(weight of either region).
  // Drawn at rest when count ≥ 2 and share ≥ bridgeFloor, or when one shared memory is rated importance 5. Selection reveals every tie for that region.
  const bridges=React.useMemo(()=>{const now=Date.now();const rec=(m:Memory)=>Math.pow(.5,Math.max(0,(now-new Date(m.date+'T00:00:00').getTime())/864e5)/(bridgeHalfLife*30.4));
    const regW={} as Record<Region,number>;regions.forEach(x=>{regW[x.r]=x.mems.reduce((a,m)=>a+rec(m),0)});
    const pairs={} as Record<string,{a:Region;b:Region;n:number;w:number;maxImp:number;m:Memory|null}>;world.memories.forEach(m=>{const rs=m.dims.map(id=>world.dims.find(d=>d.id===id&&d.active)).filter((d):d is Dimension=>Boolean(d)).map(d=>d.region);for(let i=0;i<rs.length;i++)for(let j=i+1;j<rs.length;j++){const k=[rs[i],rs[j]].sort().join('|');const p=pairs[k]||(pairs[k]={a:rs[i],b:rs[j],n:0,w:0,maxImp:0,m:null});p.n++;p.w+=rec(m);p.maxImp=Math.max(p.maxImp,m.importance||0);if(!p.m||(m.importance||0)>(p.m.importance||0))p.m=m}});
    return Object.values(pairs).map(p=>{const A=byRegion[p.a],B=byRegion[p.b];if(!A||!B||!A.dim||!B.dim||!p.m)return null;const share=p.w/Math.max(1e-6,Math.min(regW[p.a],regW[p.b]));const landmark=p.maxImp>=5;const show=(p.n>=2&&share>=bridgeFloor/100)||landmark;const t=Math.max(0,Math.min(1,(share-bridgeFloor/100)/.42));
      const a=A.terr.pts[p.m!.id]||A.s.c,b=B.terr.pts[p.m!.id]||B.s.c;const mx=(a[0]+b[0])/2,my=(a[1]+b[1])/2;const dx=b[0]-a[0],dy=b[1]-a[1];const L=Math.hypot(dx,dy)||1;const nx=-dy/L,ny=dx/L;const bend=L*.16*(ny<0?1:-1);
      return {...p,share,landmark,show,t,pa:a,pb:b,ca:A.dim.color,cb:B.dim.color,gid:'mt-br-'+(p.a+p.b).replace(/\W/g,''),d:`M${a[0]},${a[1]}Q${mx+nx*bend},${my+ny*bend} ${b[0]},${b[1]}`}}).filter((b):b is NonNullable<typeof b>=>b!==null)},[world,regions.map(x=>x.n+':'+x.r+':'+x.base).join(),bridgeFloor,bridgeHalfLife]);
  const selDim=selected?dimForRegion(world,selected):null;
  const hasSel=!!selected;
  const card=hov&&hoverMode!=='none'&&byRegion[hov.r]&&byRegion[hov.r].dim&&(()=>{const R=byRegion[hov.r];const dim=R.dim;if(!dim)return null;const photos=hoverMode==='photos';const cw=photos?276:236;const ch=photos?(withPhotoCount(R)?300:(R.n?180:96)):(R.n?180:96);const left=Math.max(8,Math.min(hov.x+18,hov.w-cw-8));const top=hov.y+18+ch>hov.h-8?Math.max(8,hov.y-ch-14):hov.y+18;const kws=R.n?keywords(R.mems):[];const recent=R.mems[0];const withPhoto=R.mems.filter(photoFor);
    return <div role="tooltip" style={{position:'absolute',left,top,width:cw,background:'#fff',border:'1px solid var(--border-hairline)',borderRadius:8,padding:14,boxSizing:'border-box',pointerEvents:'none',zIndex:5,display:'flex',flexDirection:'column',gap:10,fontFamily:'var(--font-body)'}}>
      <div style={{display:'flex',alignItems:'center',gap:8}}><span style={{width:10,height:10,borderRadius:'50%',background:dim.color}}/><span style={{font:'var(--text-body)',fontWeight:500,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{dim.name}</span><span style={{font:'var(--text-micro)',fontFamily:'var(--font-mono)',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:.5}}>{R.n} {R.n===1?'memory':'memories'}</span></div>
      {R.n===0&&<span style={{font:'var(--text-caption)',color:'var(--text-muted)'}}>No memories here yet.</span>}
      {R.n>0&&photos&&withPhoto.length>0&&<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>{withPhoto.slice(0,4).map((m,i)=><div key={m.id} style={{position:'relative',aspectRatio:'4/3',borderRadius:4,overflow:'hidden',background:'var(--surface-stone)'}}><img src={photoFor(m)!} alt="" style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}}/>{i===3&&withPhoto.length>4&&<span style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(23,23,28,.55)',color:'#fff',font:'var(--text-caption)',fontFamily:'var(--font-mono)'}}>+{withPhoto.length-4}</span>}</div>)}</div>}
      {R.n>0&&<div style={{display:'flex',flexWrap:'wrap',gap:6}}>{kws.map(([w,c])=><span key={w} style={{font:'var(--text-micro)',fontFamily:'var(--font-mono)',padding:'3px 8px',borderRadius:30,background:mix(dim.color,'#ffffff',.86),color:mix(dim.color,'#000000',.5),textTransform:'lowercase'}}>{w}{c>1?` ·${c}`:''}</span>)}</div>}
      {recent&&<div style={{display:'flex',flexDirection:'column',gap:2,borderTop:'1px solid var(--border-hairline)',paddingTop:10}}><span style={{font:'var(--text-micro)',fontFamily:'var(--font-mono)',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:.5}}>Most recent · {fmtDate(recent.date)}</span><span style={{font:'var(--text-caption)',color:'var(--text-primary)',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'}}>{recent.title||recent.text}</span></div>}
    </div>})();
  return <div ref={wrapRef} style={{position:'relative',width:'100%',height:'100%',isolation:'isolate',zIndex:0}}><svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} style={{width:'100%',height:'100%',display:'block',background:T.bg,cursor:'grab'}} role="group" aria-label="World map of life dimensions">
    <defs>
      {shapes.map(s=><clipPath key={s.f.id} id={'clip-'+s.f.id.replace(/\s/g,'')}><path d={s.d}/></clipPath>)}
      <pattern id="mt-dots" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="2.5" cy="2.5" r=".55" fill={T.dot}/></pattern>
      <pattern id="mt-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="4" stroke={T.hatch} strokeWidth=".6"/></pattern>
      {bridges.map(b=><linearGradient key={b.gid} id={b.gid} gradientUnits="userSpaceOnUse" x1={b.pa[0]} y1={b.pa[1]} x2={b.pb[0]} y2={b.pb[1]}><stop offset="0" stopColor={b.ca}/><stop offset="1" stopColor={b.cb}/></linearGradient>)}
    </defs>
    <g ref={gRef}>
      <path d={sphere||undefined} fill={T.ocean}/>
      <path d={sphere||undefined} fill="url(#mt-dots)"/>
      <path d={grat||undefined} fill="none" stroke={T.grat} strokeWidth=".5" strokeDasharray={T.gratDash}/>
      <path d={sphere||undefined} fill="none" stroke={T.sphere} strokeWidth=".8"/>
      {shapes.map(s=><path key={s.f.id} d={s.d} fill="none" stroke={T.shoal} strokeWidth="5" strokeLinejoin="round" strokeOpacity=".9"/>)}
      {shapes.map(s=><path key={s.f.id} d={s.d} fill={T.land}/>)}
      {regions.map(({s,r,dim,mems,n,base,op,terr})=>{
        const isSel=selected===r;const hi=highlight.includes(r);const clip=`url(#clip-${r.replace(/\s/g,'')})`;const dark=mix(base,'#000000',.45);
        return <g key={r} className={'mt-region'+(hi?' mt-hi'+(reducedMotion?' mt-static':''):'')} tabIndex={0} role="button" aria-pressed={isSel} aria-label={`${dim?dim.name:'Unassigned region'}, ${r}, ${n} ${n===1?'memory':'memories'}`} onClick={()=>onSelect(r)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(r)}}} onMouseEnter={track(r)} onMouseMove={track(r)} onMouseLeave={()=>setHov(null)} style={{cursor:'pointer',outline:'none'}}>
          {dim?<path d={s.d} fill={tint(base,T,0)} fillOpacity={op}/>:<><path d={s.d} fill={NEUTRAL} fillOpacity=".28"/><path d={s.d} fill="url(#mt-hatch)" fillOpacity=".8"/></>}
          <g clipPath={clip}>
            {terr.levels.map((c,i)=><path key={i} className="mt-lvl" d={c.d} fill={tint(base,T,i+1)} fillOpacity={op} stroke={T.line} strokeOpacity={T.lineOp} strokeWidth=".45" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>)}
            <path d={s.d} transform="translate(-.7,-.7)" fill="none" stroke={T.rimLight} strokeOpacity={dim?.7:.5} strokeWidth="1.5"/>
            <path d={s.d} transform="translate(.8,.8)" fill="none" stroke={T.coast} strokeOpacity=".14" strokeWidth="1.5"/>
          </g>
          {dim&&mems.map(m=>{const p=terr.pts[m.id];if(!p)return null;const fresh=Date.now()-new Date(m.date+'T00:00:00').getTime()<30*864e5;return <g key={m.id} pointerEvents="none"><circle cx={p[0]} cy={p[1]} r=".75" fill={dark} fillOpacity=".5"/>{fresh&&<circle cx={p[0]} cy={p[1]} r="3.2" fill="none" stroke={dark} strokeOpacity=".55" strokeWidth=".6"/>}</g>})}
          {terr.summits.map(sm=><path key={sm.id} d="M0,-3.4L3.2,2.4H-3.2Z" transform={`translate(${sm.xy[0]},${sm.xy[1]})`} fill={dark} stroke={T.land} strokeWidth=".7" strokeLinejoin="round" pointerEvents="none"><title>{(mems.find(m=>m.id===sm.id)||{}).title||'An important memory'}</title></path>)}
          {isSel&&<path d={s.d} fill="none" stroke={T.coast} strokeOpacity=".12" strokeWidth="7" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>}
          <path className="coast" d={s.d} fill="none" stroke={isSel?'#17171c':T.coast} strokeWidth={isSel?2.2:T.coastW} strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>
          <path className="mt-hi-ring" d={s.d} fill="none" stroke={dim?dim.color:'#17171c'} strokeWidth="0" vectorEffect="non-scaling-stroke"/>
        </g>})}
      <g pointerEvents="none">{bridges.map(b=>{const touch=hasSel&&(b.a===selected||b.b===selected);if(!b.show&&!touch)return null;const dimA=dimForRegion(world,b.a),dimB=dimForRegion(world,b.b);const weak=!b.show;const w=weak?.5:.8+1.8*b.t;const op=weak?.4:touch?.95:hasSel?.14:.45+.4*b.t;const dash=weak?'1 3':`${2+4*b.t} ${4-2*b.t}`;
        return <g key={b.gid}><path d={b.d} fill="none" stroke={T.bg} strokeOpacity={touch?.9:.45} strokeWidth={w+1.8} vectorEffect="non-scaling-stroke"/><path d={b.d} fill="none" stroke={`url(#${b.gid})`} strokeOpacity={op} strokeWidth={w} strokeDasharray={dash} strokeLinecap="round" vectorEffect="non-scaling-stroke"><title>{`${b.n} shared ${b.n===1?'memory':'memories'} between ${dimA?dimA.name:b.a} and ${dimB?dimB.name:b.b} · ${Math.round(b.share*100)}% of the smaller dimension${b.landmark?' · includes an importance-5 memory':''}`}</title></path>{b.landmark&&!weak&&[b.pa,b.pb].map((p,i)=><circle key={i} cx={p[0]} cy={p[1]} r="1.8" fill={i?b.cb:b.ca} stroke={T.bg} strokeWidth=".7" opacity={touch?1:hasSel?.3:.8}/>)}</g>})}</g>
      {regions.map(({s,r,dim,n})=>{const lx=s.c[0],ly=r==='Antarctica'?s.c[1]-6:s.c[1];const dark=dim?mix(dim.color,'#000000',.6):'#75758a';
        return <g key={r} pointerEvents="none" style={{fontFamily:T.labelFont,textTransform:T.labelCase as React.CSSProperties['textTransform'],letterSpacing:T.labelSpacing}}>
          <text x={lx} y={ly} textAnchor="middle" fontSize={T.labelSize} fill={dim?'#17171c':'#75758a'} stroke={T.land} strokeWidth="2.5" strokeOpacity=".85" paintOrder="stroke" strokeLinejoin="round" fontWeight={T.labelWeight}>{dim?dim.name:'Unassigned'}</text>
          <text x={lx} y={ly+13} textAnchor="middle" fontSize="8" fill={dim?dark:'#8a8a99'} stroke={T.land} strokeWidth="2.5" strokeOpacity=".9" paintOrder="stroke" style={{fontFamily:'var(--font-mono)',textTransform:'uppercase',letterSpacing:.5}}>{dim?(n===0?'No memories yet':n+(n===1?' memory':' memories')):'Available'}</text>
        </g>})}
    </g>
  </svg>{explorerCursor&&<MapExplorerCursor surfaceRef={svgRef} reducedMotion={reducedMotion}/>}{card}</div>;
}
