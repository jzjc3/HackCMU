'use client';
import React from 'react';
import type {Dimension,Memory,MemoryDraft,World,Region,Rating} from '@/lib/types';
import {STORE} from './constants';
import {Button,Chip,MonoLabel} from './Primitives';
import {DimRow} from './Setup';
import {pLabel} from './Panels';
import {memsForDim} from './WorldMap';
const S3=STORE;
export function Settings({world,setWorld,onClose,onReassign,onDeleteAll}:{world:World;setWorld:(fn:(w:World)=>World)=>void;onClose:()=>void;onReassign:(a:string,b:string)=>void;onDeleteAll:()=>Promise<void>}){
  const [pending,setPending]=React.useState<Dimension|null>(null); // dimension being deactivated with memories
  const upd=(id:string,patch:Partial<Dimension>)=>setWorld(w=>({...w,dims:w.dims.map(d=>d.id===id?{...d,...patch}:d)}));
  const move=(i:number,dir:number)=>setWorld(w=>{const a=[...w.dims];const j=i+dir;if(j<0||j>=a.length)return w;[a[i],a[j]]=[a[j],a[i]];return {...w,dims:a}});
  const toggle=(d:Dimension)=>{if(d.active&&memsForDim(world,d.id).length>0){setPending(d);return}upd(d.id,{active:!d.active})};
  const active=world.dims.filter(d=>d.active);
  const dupes=active.filter(d=>active.some(x=>x!==d&&x.region===d.region));
  const [confirmDel,setConfirmDel]=React.useState(false);
  const [deleteBusy,setDeleteBusy]=React.useState(false),[deleteError,setDeleteError]=React.useState<string|null>(null);
  const deleteEverything=async()=>{setDeleteBusy(true);setDeleteError(null);try{await onDeleteAll()}catch(e){setDeleteError(e instanceof Error?e.message:'Could not delete your data. Please try again.');setDeleteBusy(false)}};
  const exportJson=()=>{window.location.assign('/api/world/export')};
  const sec:React.CSSProperties={display:'flex',flexDirection:'column',gap:12};
  const h:React.CSSProperties={margin:0,font:'var(--text-feature-heading)'};
  return <div role="dialog" aria-modal="true" aria-label="World settings" style={{position:'absolute',inset:0,background:'rgba(23,23,28,.4)',display:'flex',justifyContent:'flex-end',zIndex:20}} onClick={onClose}>
    <div className="mt-settings-panel" onClick={e=>e.stopPropagation()} style={{width:640,maxWidth:'100%',background:'#fff',height:'100%',overflow:'auto',padding:'32px 40px',display:'flex',flexDirection:'column',gap:40,boxSizing:'border-box'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><h2 style={{margin:0,font:'var(--text-card-heading)',letterSpacing:'var(--tracking-card-heading)'}}>World settings</h2><Button variant="text" onClick={onClose}>Done</Button></div>
      <section style={sec}><h3 style={h}>Dimensions</h3><p style={{...pLabel,margin:0}}>Rename, reorder, reassign or switch off. Renaming keeps every memory. Up to 7 can be active.</p>
        <div>{world.dims.map((d,i)=><DimRow key={d.id} d={d} i={i} total={world.dims.length} world={world} showActive showRegion onChange={p=>p.active!==undefined?toggle(d):upd(d.id,p)} onMove={dir=>move(i,dir)}/>)}</div>
        {dupes.length>0&&<p style={{margin:0,font:'var(--text-caption)',color:'var(--state-error)'}}>Two active dimensions share a region. Only the first will show on the map.</p>}
        {pending&&<div style={{padding:16,border:'1px solid var(--border-hairline)',borderRadius:8,display:'flex',flexDirection:'column',gap:12}}>
          <span style={{font:'var(--text-body)'}}>"{pending.name}" has {memsForDim(world,pending.id).length} memories. What should happen to them?</span>
          <div style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'center'}}>
            <Button size="sm" onClick={()=>{upd(pending.id,{active:false});setPending(null)}}>Keep them, hide the region</Button>
            <select defaultValue="" onChange={e=>{if(!e.target.value)return;onReassign(pending.id,e.target.value);upd(pending.id,{active:false});setPending(null)}} style={{font:'var(--text-caption)',padding:'8px 10px',border:'1px solid var(--border-hairline)',borderRadius:4,background:'#fff'}}><option value="">Move them to…</option>{active.filter(x=>x.id!==pending.id).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select>
            <Button variant="text" onClick={()=>setPending(null)}>Cancel</Button>
          </div><span style={pLabel}>Memories linked only to this dimension stay in your data and return if you switch it on again.</span></div>}
      </section>
      <section style={sec}><h3 style={h}>Appearance</h3>
        <p style={{...pLabel,margin:0}}>Region color and opacity are automatic unless you customize a region from its detail panel. {Object.keys(world.overrides).length} region{Object.keys(world.overrides).length===1?'':'s'} customized.</p>
        <div><Button variant="outline" size="sm" onClick={()=>setWorld(w=>({...w,overrides:{}}))} disabled={Object.keys(world.overrides).length===0}>Reset all to automatic</Button></div>
      </section>
      <section style={sec}><h3 style={h}>Your data</h3>
        <p style={{...pLabel,margin:0}}>Saved to your account. {world.memories.length} memories.</p>
        <div style={{display:'flex',gap:16,alignItems:'center',flexWrap:'wrap'}}><Button variant="outline" size="sm" onClick={exportJson}>Export as JSON</Button>
          {confirmDel?<><Button size="sm" style={{background:'var(--state-error)'}} disabled={deleteBusy} onClick={()=>void deleteEverything()}>{deleteBusy?'Deleting…':'Delete everything'}</Button><Button variant="text" disabled={deleteBusy} onClick={()=>setConfirmDel(false)}>Cancel</Button></>:<Button variant="text" onClick={()=>setConfirmDel(true)}>Delete all data</Button>}</div>
        {confirmDel&&<span style={{font:'var(--text-caption)',color:'var(--state-error)'}}>This removes your world and all memories from your account. Export first if you want a copy.</span>}
        {deleteError&&<span role="alert" style={{font:'var(--text-caption)',color:'var(--state-error)'}}>{deleteError}</span>}
      </section>
    </div></div>;
}
