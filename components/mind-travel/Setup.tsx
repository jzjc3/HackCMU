'use client';
import React from 'react';
import type {Dimension,Memory,MemoryDraft,World,Region,Rating} from '@/lib/types';
import {STORE} from './constants';
import {Button,Chip,MonoLabel} from './Primitives';
import {WorldMap,THEMES,type Direction,type Geography} from './WorldMap';
import type {RegionFeature} from './geo';
const S=STORE;
const label:React.CSSProperties={font:'var(--text-caption)',color:'var(--text-muted)'};
export const swatch=(hex:string,on:boolean,onClick:()=>void,name:string)=><button key={hex} type="button" aria-label={name} aria-pressed={on} onClick={onClick} style={{width:20,height:20,borderRadius:'50%',background:hex,border:on?'2px solid #17171c':'2px solid transparent',boxShadow:on?'inset 0 0 0 2px #fff':'none',cursor:'pointer',padding:0}}/>;

export function DimRow({d,i,total,world,onChange,onMove,showRegion,showActive}:{d:Dimension;i:number;total:number;world:World;onChange:(p:Partial<Dimension>)=>void;onMove?:(n:number)=>void;showRegion?:boolean;showActive?:boolean}){
  const takenBy=(r:Region)=>world.dims.find(x=>x.active&&x.id!==d.id&&x.region===r);
  return <div className={`mt-dimension-row ${showActive?'mt-dim-has-toggle':''}`} style={{display:'grid',gridTemplateColumns:showActive?'auto minmax(120px,1fr) auto':'minmax(120px,1fr) auto',gridTemplateRows:showRegion?'auto auto':'auto',gap:'8px 12px',alignItems:'center',padding:'12px 0',borderBottom:'1px solid var(--border-hairline)',opacity:d.active?1:.55}}>
    {showActive&&<input type="checkbox" checked={d.active} onChange={e=>onChange({active:e.target.checked})} aria-label={`Include ${d.name}`} style={{width:18,height:18,accentColor:'#17171c'}}/>}
    <input value={d.name} onChange={e=>onChange({name:e.target.value})} aria-label="Dimension name" style={{font:'var(--text-body)',border:'1px solid transparent',borderRadius:4,padding:'6px 8px',background:'transparent',minWidth:0}} onFocus={e=>e.target.style.borderColor='var(--input-focus)'} onBlur={e=>e.target.style.borderColor='transparent'}/>
    <div className="mt-dim-swatches" style={{display:'flex',gap:4}}>{S.PALETTE.map(p=>swatch(p.hex,d.color===p.hex,()=>onChange({color:p.hex}),p.name))}</div>
    {showRegion&&<select value={d.region} onChange={e=>onChange({region:e.target.value as Region})} aria-label="Region" disabled={!d.active} title={takenBy(d.region)?.name?`Also used by ${takenBy(d.region)?.name}`:''} style={{gridColumn:showActive?'2 / -1':'1 / -1',justifySelf:'start',font:'var(--text-caption)',padding:'6px 8px',border:'1px solid var(--border-hairline)',borderRadius:4,background:'#fff',color:takenBy(d.region)?'var(--state-error)':'var(--text-primary)'}}>{S.REGIONS.map(r=>{const t=takenBy(r);return <option key={r} value={r}>{r}{t?' (taken)':''}</option>})}</select>}
    {onMove&&<div style={{display:'flex',gap:2}}><button type="button" aria-label="Move up" disabled={i===0} onClick={()=>onMove(-1)} style={{...miniBtn}}>↑</button><button type="button" aria-label="Move down" disabled={i===total-1} onClick={()=>onMove(1)} style={{...miniBtn}}>↓</button></div>}
  </div>;
}
export const miniBtn:React.CSSProperties={width:28,height:28,border:'1px solid var(--border-hairline)',background:'#fff',borderRadius:4,cursor:'pointer',font:'var(--text-caption)'};

export function Setup({world,setWorld,features,direction,geography,onDone,busy=false,error=null}:{world:World;setWorld:React.Dispatch<React.SetStateAction<World>>;features:RegionFeature[]|null;direction:Direction;geography:Geography;onDone:()=>void;busy?:boolean;error?:string|null}){
  const [step,setStep]=React.useState(0);
  const upd=(id:string,patch:Partial<Dimension>)=>setWorld(w=>({...w,dims:w.dims.map(d=>d.id===id?{...d,...patch}:d)}));
  const move=(i:number,dir:number)=>setWorld(w=>{const a=[...w.dims];const j=i+dir;if(j<0||j>=a.length)return w;[a[i],a[j]]=[a[j],a[i]];return {...w,dims:a}});
  const active=world.dims.filter(d=>d.active);
  const dupes=active.filter(d=>active.some(x=>x!==d&&x.region===d.region));
  const canAdd=world.dims.length<7;
  const add=()=>{const used=world.dims.map(d=>d.region);const region=S.REGIONS.find(r=>!used.includes(r))||S.REGIONS[0];const color=S.PALETTE.find(p=>!world.dims.some(d=>d.color===p.hex))?.hex||'#93939f';setWorld(w=>({...w,dims:[...w.dims,{id:S.uid(),name:'New dimension',region,color,active:true}]}))};
  const steps=['Dimensions','Regions','Preview'];
  return <div className="mt-setup" style={{height:'100%',display:'grid',gridTemplateColumns:'minmax(360px, 520px) minmax(0, 1fr)',background:'#fff'}}>
    <div className="mt-setup-form" style={{padding:'48px 48px 32px',display:'flex',flexDirection:'column',gap:24,overflow:'auto',borderRight:'1px solid var(--border-hairline)'}}>
      <span style={{font:'400 22px/1 var(--font-display)',letterSpacing:'-0.44px'}}>Mind Travel</span>
      <div style={{display:'flex',gap:16}}>{steps.map((s,i)=><span key={s} style={{font:'var(--text-mono-label)',letterSpacing:'.28px',textTransform:'uppercase',color:i===step?'var(--text-strong)':'var(--text-muted)',borderBottom:i===step?'1px solid #17171c':'1px solid transparent',paddingBottom:4}}>{i+1} {s}</span>)}</div>
      {step===0&&<>
        <h1 style={{margin:0,font:'var(--text-card-heading)',letterSpacing:'var(--tracking-card-heading)'}}>Which parts of your life matter right now?</h1>
        <p style={{margin:0,font:'var(--text-body)'}}>Four are on by default. Three more are suggestions. Rename anything; the order is just your own preference.</p>
        <div>{world.dims.map((d,i)=><DimRow key={d.id} d={d} i={i} total={world.dims.length} world={world} showActive onChange={p=>upd(d.id,p)} onMove={dir=>move(i,dir)}/>)}</div>
        <div style={{display:'flex',gap:20,alignItems:'center'}}><Button variant="text" onClick={add} disabled={!canAdd}>Add your own</Button><span style={label}>{active.length} of 7 regions in use</span></div>
      </>}
      {step===1&&<>
        <h1 style={{margin:0,font:'var(--text-card-heading)',letterSpacing:'var(--tracking-card-heading)'}}>Give each dimension a place.</h1>
        <p style={{margin:0,font:'var(--text-body)'}}>A region is only a shape on the map. It does not mean where something happened. Unused regions stay neutral and can be assigned later.</p>
        <div>{active.map((d,i)=><DimRow key={d.id} d={d} i={i} total={active.length} world={world} showRegion onChange={p=>upd(d.id,p)}/>)}</div>
        {dupes.length>0&&<p style={{margin:0,font:'var(--text-caption)',color:'var(--state-error)'}}>Two dimensions share a region. Pick a different region for one of them.</p>}
      </>}
      {step===2&&<>
        <h1 style={{margin:0,font:'var(--text-card-heading)',letterSpacing:'var(--tracking-card-heading)'}}>Your world is ready.</h1>
        <p style={{margin:0,font:'var(--text-body)'}}>Every region starts flat. Recording an experience adds contour to the dimensions it belongs to. You can change names, regions and colors any time in World settings.</p>
        <ul style={{margin:0,padding:0,listStyle:'none',display:'flex',flexDirection:'column',gap:8}}>{active.map(d=><li key={d.id} style={{display:'flex',gap:12,alignItems:'center',font:'var(--text-body)'}}><span style={{width:12,height:12,borderRadius:'50%',background:d.color}}/>{d.name}<span style={label}>· {d.region}</span></li>)}</ul>
      </>}
      <div style={{marginTop:'auto',display:'flex',gap:20,alignItems:'center',paddingTop:24}}>
        {step<2?<Button onClick={()=>setStep(step+1)} disabled={step===1&&dupes.length>0||active.length===0}>Continue</Button>:<Button onClick={onDone} disabled={busy}>{busy?"Saving…":"Open my world"}</Button>}
        {step>0&&<Button variant="text" onClick={()=>setStep(step-1)}>Back</Button>}
      </div>
      {error&&<span role="alert" style={{color:"var(--state-error)",font:"var(--text-caption)"}}>{error}</span>}
    </div>
    <div className="mt-setup-preview" style={{position:'relative',background:THEMES[direction].bg}}>
      {features?<WorldMap features={features} world={world} selected={null} onSelect={()=>{}} direction={direction} geography={geography}/>:<div style={{...label,padding:24}}>Loading map…</div>}
      <span style={{position:'absolute',left:24,bottom:20,...label}}>Preview · updates as you edit</span>
    </div>
  </div>;
}
