'use client';

import React from 'react';
import type {MemoryDraft, Proposal, World} from '@/lib/types';
import {today} from './constants';
import {classify} from './classification';
import {draftsFromProposals} from './experience-flow';
import {Button} from './Primitives';
import {field, Panel, pLabel} from './Panels';
import {DictationButton} from './Media';
import {RealtimeVoice} from './RealtimeVoice';

function Bubble({who, children}:{who:'me'|'ai';children:React.ReactNode}) {
  const me=who==='me';
  return <div style={{display:'flex',justifyContent:me?'flex-end':'flex-start'}}><div style={{maxWidth:'88%',padding:'10px 14px',borderRadius:me?'12px 12px 2px 12px':'12px 12px 12px 2px',background:me?'#17171c':'var(--surface-stone)',color:me?'#fff':'var(--text-primary)',font:'var(--text-body)',whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{children}</div></div>;
}

function ProposalCard({it,world,onChange,onRemove}:{it:Proposal;world:World;onChange:(item:Proposal)=>void;onRemove:()=>void}) {
  const act=world.dims.filter(d=>d.active);
  const toggle=(id:string)=>onChange({...it,dims:it.dims.includes(id)?it.dims.filter(x=>x!==id):[...it.dims,id]});
  return <div style={{border:'1px solid var(--border-hairline)',borderRadius:8,padding:14,display:'flex',flexDirection:'column',gap:10,background:'#fff',opacity:it.removed?.45:1}}>
    <div style={{display:'flex',gap:10,alignItems:'flex-start'}}><textarea value={it.text} onChange={e=>onChange({...it,text:e.target.value})} rows={2} aria-label="Experience text" style={{flex:1,font:'var(--text-body)',border:0,padding:0,resize:'vertical',outline:'none',background:'transparent',color:'var(--text-primary)'}}/><button onClick={onRemove} aria-label={it.removed?'Restore':'Remove'} style={{...pLabel,background:'none',border:0,cursor:'pointer',textDecoration:'underline',padding:0}}>{it.removed?'Restore':'Remove'}</button></div>
    <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>{act.map(d=>{const on=it.dims.includes(d.id);return <button key={d.id} type="button" aria-pressed={on} onClick={()=>toggle(d.id)} style={{display:'inline-flex',alignItems:'center',gap:6,padding:'4px 10px',borderRadius:30,border:'1px solid '+(on?d.color:'var(--border-hairline)'),background:on?mix(d.color,'#ffffff',.88):'#fff',color:'var(--text-primary)',font:'var(--text-micro)',cursor:'pointer'}}><span style={{width:8,height:8,borderRadius:'50%',background:on?d.color:'var(--border-hairline)'}}/>{d.name}</button>})}</div>
    <div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'center'}}><span style={{font:'var(--text-micro)',color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>{it.reason}{it.emotion?` · feels ${it.emotion.toLowerCase()}`:''}</span>{it.confidence<.5&&<span style={{font:'var(--text-micro)',color:'var(--text-muted)'}}>Unsure — please check</span>}</div>
  </div>;
}
const mix=(a:string,b:string,t:number)=>{const p=(h:string)=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));const x=p(a),y=p(b);return '#'+x.map((v,i)=>Math.round(v+(y[i]-v)*t).toString(16).padStart(2,'0')).join('')};

export function ModeSwitch({mode,onChange}:{mode:'form'|'talk';onChange:(mode:'form'|'talk')=>void}) {return <div role="tablist" aria-label="Capture mode" style={{display:'inline-flex',alignSelf:'flex-start',border:'1px solid var(--border-hairline)',borderRadius:30,padding:2,background:'#fff'}}>{[['form','One experience'],['talk','Describe your day']].map(([k,l])=>{const on=mode===k;return <button key={k} role="tab" aria-selected={on} onClick={()=>onChange(k as 'form'|'talk')} style={{border:0,borderRadius:30,padding:'5px 12px',cursor:'pointer',font:'var(--text-micro)',background:on?'#17171c':'transparent',color:on?'#fff':'var(--text-primary)'}}>{l}</button>})}</div>}

export function Converse({world,onCancel,onSaveAll,useModel=true,modeSwitch,draftKey}:{world:World;onCancel:()=>void;onSaveAll:(items:MemoryDraft[])=>Promise<void>;useModel?:boolean;modeSwitch?:React.ReactNode;draftKey:string}) {
  const [msgs,setMsgs]=React.useState<{id?:string;who:'me'|'ai';text:string}[]>([{who:'ai',text:'Tell me about your day, or one thing that happened. I’ll sort it into your dimensions and you confirm before anything is saved.'}]);
  const [draft,setDraft]=React.useState(''); const [items,setItems]=React.useState<Proposal[]|null>(null); const [busy,setBusy]=React.useState(false); const [source,setSource]=React.useState<'model'|'local'|null>(null); const [error,setError]=React.useState<string|null>(null);
  const listRef=React.useRef<HTMLDivElement>(null);
  const [hydrated,setHydrated]=React.useState(false);
  React.useEffect(()=>{try{const saved=JSON.parse(localStorage.getItem(draftKey)||'null');if(saved){if(typeof saved.draft==='string')setDraft(saved.draft);if(Array.isArray(saved.msgs))setMsgs(saved.msgs);if(Array.isArray(saved.items))setItems(saved.items)}}catch{}setHydrated(true)},[draftKey]);
  React.useEffect(()=>{if(hydrated)try{localStorage.setItem(draftKey,JSON.stringify({draft,msgs,items}))}catch{}},[draft,msgs,items,draftKey,hydrated]);
  React.useEffect(()=>{const el=listRef.current;if(el)el.scrollTop=el.scrollHeight},[msgs,items,busy,error]);
  const accept=(proposals:Proposal[])=>setItems(proposals.map((it,i)=>({...it,key:it.key??`${Date.now()}-${i}`,removed:false})));
  const showVoiceMessage=(who:'me'|'ai',text:string,id?:string)=>setMsgs(messages=>{if(!id)return [...messages,{who,text}];const at=messages.findIndex(message=>message.id===id);if(at<0)return [...messages,{id,who,text}];const next=[...messages];next[at]={id,who,text};return next});
  const send=async()=>{const text=draft.trim();if(!text||busy)return;setDraft('');setMsgs(m=>[...m,{who:'me',text}]);setBusy(true);setItems(null);setError(null);try {const res=await classify(text,world.dims,{useModel,context:{recent:world.memories.slice(-8).map(m=>({text:m.text,dims:m.dims}))}});setSource(res.source);const n=res.items.length;const names=[...new Set(res.items.flatMap(i=>i.dims))].map(id=>world.dims.find(d=>d.id===id)?.name).filter(Boolean);setMsgs(m=>[...m,{who:'ai',text:n===0?'I couldn’t find a distinct experience in that. Could you say a little more?':`I heard ${n} ${n===1?'experience':'separate experiences'}${names.length?`, touching ${names.join(', ')}`:''}. Check the list, then save what you want to keep.${res.question?'\n\n'+res.question:''}`}]);accept(res.items)} catch(e) {setDraft(text);setError(e instanceof Error?e.message:'The assistant could not sort that yet. Your text remains in the conversation.')} finally {setBusy(false)}};
  const keep=(items||[]).filter(i=>!i.removed&&i.text.trim()&&i.dims.length);
  const saveAll=async()=>{if(!keep.length||busy)return;setBusy(true);setError(null);try {await onSaveAll(draftsFromProposals(keep,today()));setItems(null);try{localStorage.removeItem(draftKey)}catch{}setMsgs(m=>[...m,{who:'ai',text:`Saved ${keep.length} ${keep.length===1?'experience':'experiences'}. Your map has been updated. Anything else from today?`}])} catch(e) {setError(e instanceof Error?e.message:'Could not save. Review is still here; retry when ready.')} finally {setBusy(false)}};
  return <Panel title="Describe your day" eyebrow={modeSwitch} onBack={onCancel} backLabel="Close" footer={items&&keep.length>0?<><Button onClick={()=>void saveAll()} disabled={busy}>{busy?'Saving…':`Save ${keep.length} ${keep.length===1?'experience':'experiences'}`}</Button><Button variant="text" onClick={()=>setItems(null)} disabled={busy}>Discard</Button></>:<><textarea value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey))void send()}} placeholder="e.g. Ran before work, then presented the quarterly plan. Called mom in the evening." rows={2} aria-label="Describe your experiences" style={{...field,flex:1,resize:'none',minWidth:0}}/><DictationButton disabled={busy} onText={text=>setDraft(d=>d?`${d} ${text}`:text)} onError={setError}/><Button size="sm" style={{whiteSpace:'nowrap'}} onClick={()=>void send()} disabled={!draft.trim()||busy}>{busy?'Sorting…':'Send'}</Button></>}>
    <div ref={listRef} style={{display:'flex',flexDirection:'column',gap:12,flex:1,minHeight:0}}>{msgs.map((m,i)=><Bubble key={m.id||i} who={m.who}>{m.text}</Bubble>)}{busy&&<Bubble who="ai"><span style={{fontFamily:'var(--font-mono)',color:'var(--text-muted)'}}>Sorting into your dimensions…</span></Bubble>}{items&&<div style={{display:'flex',flexDirection:'column',gap:10}}>{items.map((it,i)=><ProposalCard key={String(it.key)} it={it} world={world} onChange={v=>setItems(a=>a?.map((x,j)=>j===i?v:x)??null)} onRemove={()=>setItems(a=>a?.map((x,j)=>j===i?{...x,removed:!x.removed}:x)??null)}/>) }<span style={pLabel}>Nothing is saved until you press Save. {source==='local'?'Sorted on this device (no model available).':'Sorted by the assistant; your text was sent for classification only.'}</span></div>}{!items&&!busy&&msgs.length===1&&<><span style={pLabel}>The assistant sorts, you confirm. Nothing is saved without your review.</span></>}<RealtimeVoice world={world} onMessage={showVoiceMessage} onProposals={accept}/>{error&&<span role="alert" style={{font:'var(--text-caption)',color:'var(--state-error)'}}>{error}</span>}</div>
  </Panel>;
}
