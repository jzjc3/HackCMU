'use client';
import type {ConversationController} from "@/lib/conversation";
import {clientApi} from "@/lib/client-api";


import React from 'react';
import type {MemoryDraft, Proposal, World} from '@/lib/types';
import {today} from './constants';
import {draftsFromProposals} from './experience-flow';
import {Button} from './Primitives';
import {field, Panel, pLabel} from './Panels';
import {RealtimeVoice} from './RealtimeVoice';
import {DictationButton} from './Media';

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

export function Converse({world,onCancel,onSaveAll,useModel=true,modeSwitch,controller}:{world:World;onCancel:()=>void;onSaveAll:(items:MemoryDraft[])=>Promise<void>;useModel?:boolean;modeSwitch?:React.ReactNode;controller:ConversationController}) {
  const state=React.useSyncExternalStore(controller.subscribe,controller.getSnapshot,controller.getSnapshot);
  React.useEffect(()=>()=>controller.switchMode('text'),[controller]);
  const send=async()=>{
    const current=controller.getSnapshot(),text=current.draft.trim();if(!text||current.pending||current.mode!=='text')return;
    controller.setDraft('');controller.message('user',text);
    const request=controller.begin();if(!request)return;
    try{
      if(!useModel)throw new Error('Live model is disabled in developer controls. Enable it to use the shared conversation.');
      const result=await clientApi.converse(request.context,'chat',request.signal);
      if(!controller.current(request))return;
      const applied=controller.apply(request,result);
      controller.message('assistant',applied.conflicts?'Your edits were kept. Please ask again if you want me to revise this card.':result.reply);
      controller.finish(request);
    }catch(error){if(controller.current(request)){if(!controller.getSnapshot().draft.trim())controller.setDraft(text);controller.finish(request,error instanceof Error?error.message:'The assistant could not respond. Please retry.')}}
  };
  const cards=state.cards.filter(c=>c.status==='draft');
  const keep=cards.filter(c=>!c.removed&&c.text.trim()&&c.dims.length);
  const save=()=>controller.save(keep.map(c=>c.id),async selected=>{
    const drafts=selected.map(card=>({...draftsFromProposals([card],card.date??today())[0],id:card.id}));
    await onSaveAll(drafts);
  });
  const conversationTitle=(history:typeof state.history)=>history.find(e=>e.role==='user')?.text.slice(0,55)||'New conversation';
  return <Panel title="Describe your day" eyebrow={modeSwitch} onBack={onCancel} backLabel="Close" toolbar={<div style={{display:'flex',flexDirection:'column',gap:10}}>
    <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
      {state.archives.length>0&&<select aria-label="Conversation history" value={state.conversationId} disabled={state.saving.length>0} onChange={e=>controller.openConversation(e.target.value)} style={{...field,flex:'1 1 140px',minWidth:0,width:0,padding:'8px 10px'}}>
        <option value={state.conversationId}>{conversationTitle(state.history)}</option>
        {state.archives.map(session=><option key={session.id} value={session.id}>{conversationTitle(session.history)}</option>)}
      </select>}
      <Button size="sm" variant="text" onClick={()=>controller.openConversation()} disabled={state.saving.length>0} title={state.saving.length?'Please wait for Save to finish':undefined}>+ New conversation</Button>
    </div>
    <RealtimeVoice key={state.conversationId} controller={controller} world={world} disabled={!useModel}/>
  </div>} footer={<div style={{display:'flex',flexDirection:'column',gap:10,width:'100%'}}>
    {keep.length>0&&<div style={{display:'flex',gap:8,flexWrap:'wrap'}}><Button onClick={()=>void save()} disabled={state.saving.length>0}>{state.saving.length?'Saving…':`Save ${keep.length} ${keep.length===1?'experience':'experiences'}`}</Button><Button variant="text" onClick={()=>controller.discard(cards.map(c=>c.id))} disabled={state.saving.length>0}>Discard</Button></div>}
    {state.mode==='text'&&<div style={{display:'flex',gap:8,alignItems:'center'}}><textarea value={state.draft} onChange={e=>controller.setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey))void send()}} placeholder="Describe an experience, or correct a draft…" maxLength={8000} rows={2} aria-label="Describe your experiences" style={{...field,flex:1,resize:'none',minWidth:0}}/><DictationButton key={state.conversationId} onText={text=>controller.setDraft([controller.getSnapshot().draft,text].filter(Boolean).join(" "))} onError={error=>controller.setError(error)} disabled={state.pending}/><Button size="sm" onClick={()=>void send()} disabled={!state.draft.trim()||state.pending}>{state.pending?'Thinking…':'Send'}</Button></div>}
  </div>}>
    <div style={{display:'flex',flexDirection:'column',gap:12,flex:1,minHeight:0}}>
      {!state.history.length&&<Bubble who="ai">Tell me about your day, or one thing that happened. I’ll prepare a draft for you to review before saving.</Bubble>}
      {state.history.filter(e=>e.role!=='event').map(entry=><Bubble key={entry.id} who={entry.role==='user'?'me':'ai'}>{entry.text}</Bubble>)}
      {state.pending&&<span role="status" style={pLabel}>{state.mode==='voice'?'Preparing your drafts…':'Thinking…'}</span>}
      {cards.map(card=><fieldset key={card.id} disabled={state.saving.includes(card.id)} style={{margin:0,padding:0,border:0,minWidth:0}}><ProposalCard it={card} world={world} onChange={proposal=>controller.edit(card.id,proposal)} onRemove={()=>controller.edit(card.id,{...card,removed:!card.removed})}/>{card.date&&<span style={pLabel}>Date: {card.date}</span>}</fieldset>)}
      {cards.length>0&&<span style={pLabel}>Drafts only. Nothing is saved until you press Save.</span>}
      {state.history.filter(e=>e.role==='event'&&e.text.startsWith('Save ')).slice(-1).map(e=><span key={e.id} role="status" style={pLabel}>{e.text.startsWith('Save succeeded')?'Saved. Your map has been updated.':'Save failed. Your drafts are ready to retry.'}</span>)}
      {state.error&&<span role="alert" style={{font:'var(--text-caption)',color:'var(--state-error)'}}>{state.error}</span>}
    </div>
  </Panel>;
}
