'use client';
import React from 'react';
import type {Dimension,Memory,MemoryDraft,World,Region,Rating} from '@/lib/types';
import {STORE} from './constants';
import {Button,Chip,MonoLabel} from './Primitives';
import {clientApi} from '@/lib/client-api';
import {classify} from './classification';
import {dimForRegion,memsForDim,fmtDate,mix,photoFor} from './WorldMap';
import {swatch} from './Setup';
import {AttachmentEditor} from './Media';
const S2=STORE;
export const pLabel:React.CSSProperties={font:'var(--text-caption)',color:'var(--text-muted)'};
const panelH1:React.CSSProperties={margin:0,font:'var(--text-feature-heading)'};
export const field:React.CSSProperties={font:'var(--text-body)',padding:'12px 16px',border:'1px solid var(--border-hairline)',borderRadius:4,background:'#fff',color:'var(--text-primary)',outline:'none',width:'100%',boxSizing:'border-box'};
export function Panel({title,eyebrow,onBack,backLabel='Back',children,footer,toolbar}:{title:string;eyebrow?:React.ReactNode;onBack?:()=>void;backLabel?:string;children:React.ReactNode;footer?:React.ReactNode;toolbar?:React.ReactNode}){
  return <aside className="mt-detail-panel" style={{width:'var(--panel-w, 400px)',flex:'0 0 var(--panel-w, 400px)',borderLeft:'1px solid var(--border-hairline)',background:'#fff',display:'flex',flexDirection:'column',minHeight:0}} aria-label={title}>
    <div style={{padding:'20px 24px 0',display:'flex',flexDirection:'column',gap:8}}>{onBack&&<button onClick={onBack} style={{alignSelf:'flex-start',background:'none',border:0,padding:0,cursor:'pointer',font:'var(--text-caption)',textDecoration:'underline',textUnderlineOffset:3,color:'var(--text-primary)'}}>← {backLabel}</button>}{eyebrow}<h2 style={panelH1}>{title}</h2></div>
    {toolbar&&<div style={{padding:'12px 24px 0',flexShrink:0}}>{toolbar}</div>}
    <div className="mt-panel-scroll" style={{padding:'16px 24px 24px',overflow:'auto',flex:1,minHeight:0,display:'flex',flexDirection:'column',gap:20}}>{children}</div>
    {footer&&<div style={{padding:'16px 24px',borderTop:'1px solid var(--border-hairline)',display:'flex',gap:20,alignItems:'center',flexWrap:'wrap',flexShrink:0}}>{footer}</div>}
  </aside>;
}
function Scale({label:l,value,onChange,low,high}:{label:string;value:Rating;onChange:(r:Rating)=>void;low:string;high:string}){
  return <div style={{display:'flex',flexDirection:'column',gap:8}}><div style={{display:'flex',justifyContent:'space-between'}}><span style={pLabel}>{l}</span>{value&&<button type="button" onClick={()=>onChange(null)} style={{...pLabel,background:'none',border:0,cursor:'pointer',textDecoration:'underline'}}>Clear</button>}</div>
    <div role="radiogroup" aria-label={l} style={{display:'flex',gap:6}}>{[1,2,3,4,5].map(v=><button key={v} type="button" role="radio" aria-checked={value===v} onClick={()=>onChange(v as Rating)} style={{flex:1,height:36,border:'1px solid '+(value===v?'#17171c':'var(--border-hairline)'),background:value===v?'#17171c':'#fff',color:value===v?'#fff':'var(--text-primary)',borderRadius:30,cursor:'pointer',font:'var(--text-caption)'}}>{v}</button>)}</div>
    <div style={{display:'flex',justifyContent:'space-between',font:'var(--text-micro)',color:'var(--text-muted)'}}><span>{low}</span><span>{high}</span></div></div>;
}
export function MemoryItem({m,world,onOpen,showDims}:{m:Memory;world:World;onOpen:(id:string)=>void;showDims?:boolean}){
  const photo=photoFor(m);
  return <button onClick={()=>onOpen(m.id)} style={{textAlign:'left',background:'none',border:0,borderBottom:'1px solid var(--border-hairline)',padding:'14px 0',cursor:'pointer',display:'flex',gap:14,width:'100%',color:'var(--text-primary)',alignItems:'flex-start'}}>
    {photo&&<img src={photo} alt="" loading="lazy" style={{width:72,height:54,borderRadius:4,objectFit:'cover',flex:'0 0 auto',background:'var(--surface-stone)',display:'block'}}/>}
    <span style={{display:'flex',flexDirection:'column',gap:6,minWidth:0,flex:1}}>
    <span style={{...pLabel,display:'flex',gap:8}}>{fmtDate(m.date)}{m.emotion&&<span>· {m.emotion}</span>}{m.importance&&<span>· Importance {m.importance}</span>}</span>
    {m.title&&<span style={{font:'var(--text-body)',fontWeight:500}}>{m.title}</span>}
    <span style={{font:'var(--text-body)',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden',overflowWrap:'anywhere'}}>{m.text}</span>
    {showDims&&<span style={{display:'flex',gap:6,flexWrap:'wrap'}}>{m.dims.map(id=>{const d=world.dims.find(x=>x.id===id);return d?<span key={id} style={{...pLabel,display:'inline-flex',alignItems:'center',gap:6}}><span style={{width:8,height:8,borderRadius:'50%',background:d.color}}/>{d.name}</span>:null})}</span>}
    </span>
  </button>;
}

export function Composer({world,initial,onCancel,onSave,saveState,onRetry,offline,modeSwitch,useModel,draftKey}:{world:World;initial?:MemoryDraft|null;onCancel:()=>void;onSave:(m:MemoryDraft)=>Promise<void>;saveState:string|null;onRetry:(m:MemoryDraft)=>Promise<void>;offline?:boolean;modeSwitch?:React.ReactNode;useModel?:boolean;draftKey:string}){
  const [m,setM]=React.useState<MemoryDraft>(()=>{try{const saved=localStorage.getItem(draftKey);if(saved)return JSON.parse(saved)}catch{}return initial||{text:'',title:'',date:S2.today(),dims:[],emotion:null,importance:null,clarity:null}});
  const [more,setMore]=React.useState(!!(initial&&(initial.title||initial.emotion||initial.importance||initial.clarity)));
  const [dirty,setDirty]=React.useState(false);
  const [imageBusy,setImageBusy]=React.useState(false);const imagePending=React.useRef(false);
  const imageStatus=(pending:boolean)=>{imagePending.current=pending;setImageBusy(pending)};
  React.useEffect(()=>{try{localStorage.setItem(draftKey,JSON.stringify(m))}catch{}},[m,draftKey]);
  const set=(p:Partial<MemoryDraft>)=>{setM(x=>({...x,...p}));setDirty(true)};
  const active=world.dims.filter(d=>d.active);
  const valid=m.text.trim().length>0&&m.dims.length>0;
  const busy=saveState==='saving'||imageBusy;
  const submit=async(action:(draft:MemoryDraft)=>Promise<void>)=>{if(imagePending.current||saveState==='saving')return;try{await action(m);localStorage.removeItem(draftKey)}catch{/* Parent keeps the failed state and this draft stays in storage. */}};
  const cancel=()=>{if(saveState==='failed'){onCancel();return}if(dirty&&!window.confirm('Discard unsaved changes?'))return;localStorage.removeItem(draftKey);onCancel()};
  // AI suggestion for the single-entry form: proposes dimensions (+emotion) once the text is long enough
  const [sug,setSug]=React.useState<{dims:string[];emotion:MemoryDraft['emotion'];reason:string;source:string}|null>(null);const [sugBusy,setSugBusy]=React.useState(false);const sugFor=React.useRef('');
  const isEdit=!!(initial&&initial.id);
  const suggest=async()=>{const text=m.text.trim();if(text.length<12||sugFor.current===text||sugBusy)return;sugFor.current=text;setSugBusy(true);try{const res=await classify(text,world.dims,{useModel});setSugBusy(false);const dims=[...new Set(res.items.flatMap(i=>i.dims))].slice(0,3);const emo=(res.items.find(i=>i.emotion)||{}).emotion||null;setSug({dims,emotion:emo,reason:res.items.map(i=>i.reason).filter(Boolean).join('; '),source:res.source})}catch{setSug(null)}finally{setSugBusy(false)}};
  const acceptSug=()=>{if(!sug)return;set({dims:[...new Set([...m.dims,...sug.dims])],...(sug.emotion&&!m.emotion?{emotion:sug.emotion}:{})});setSug(null)};
  const pending=sug&&(sug.dims.some(d=>!m.dims.includes(d))||(sug.emotion&&!m.emotion));
  return <Panel title={isEdit?'Edit memory':'Add an experience'} eyebrow={modeSwitch} onBack={cancel} backLabel={isEdit?'Back':'Cancel'}
    footer={<>
      {saveState==='failed'?<><Button onClick={()=>void submit(onRetry)} disabled={busy}>Retry</Button><Button variant="text" onClick={cancel}>Keep draft and close</Button></>:
      <><Button onClick={()=>void submit(onSave)} disabled={!valid||busy}>{imageBusy?'Preparing image…':busy?'Saving…':saveState==='saved'?'Saved':'Save'}</Button><Button variant="text" onClick={cancel} disabled={busy}>Cancel</Button></>}
      {saveState==='failed'&&<span role="alert" style={{font:'var(--text-caption)',color:'var(--state-error)',width:'100%'}}>Couldn't save{offline?' while offline':''}. Your draft is kept here.</span>}
      {offline&&saveState!=='failed'&&<span style={{...pLabel,width:'100%'}}>You're offline. Your draft stays here until you reconnect.</span>}
    </>}>
    <label style={{display:'flex',flexDirection:'column',gap:6}}><span style={pLabel}>What happened?</span><textarea autoFocus value={m.text} onChange={e=>set({text:e.target.value})} rows={6} placeholder="Write it the way you'd tell a friend." style={{...field,resize:'vertical',lineHeight:1.5}} onFocus={e=>e.target.style.borderColor='var(--input-focus)'} onBlur={e=>{e.target.style.borderColor='var(--border-hairline)';if(!isEdit)suggest()}}/></label>
    {!isEdit&&sug&&(sugBusy||pending)&&<div role="status" style={{display:'flex',flexDirection:'column',gap:8,padding:'12px 14px',borderRadius:8,background:'var(--surface-stone)'}}>{sugBusy?<span style={{...pLabel,fontFamily:'var(--font-mono)'}}>Suggesting dimensions…</span>:<>
      <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}><span style={{font:'var(--text-caption)'}}>Suggested:</span>{sug.dims.map(id=>{const d=world.dims.find(x=>x.id===id);return d?<span key={id} style={{display:'inline-flex',alignItems:'center',gap:6,font:'var(--text-caption)'}}><span style={{width:8,height:8,borderRadius:'50%',background:d.color}}/>{d.name}</span>:null})}{sug.emotion&&!m.emotion&&<span style={pLabel}>· feels {sug.emotion.toLowerCase()}</span>}</div>
      {sug.reason&&<span style={{font:'var(--text-micro)',color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>{sug.reason}</span>}
      <div style={{display:'flex',gap:14}}><Button size="sm" onClick={acceptSug}>Use suggestion</Button><Button size="sm" variant="text" onClick={()=>setSug(null)}>Dismiss</Button></div></>}</div>}
    <div style={{display:'flex',flexDirection:'column',gap:8}}><span style={pLabel}>Which parts of your life does this belong to? <span aria-hidden="true">·</span> pick one or more</span>
      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{active.map(d=>{const on=m.dims.includes(d.id);return <button key={d.id} type="button" aria-pressed={on} onClick={()=>set({dims:on?m.dims.filter(x=>x!==d.id):[...m.dims,d.id]})} style={{display:'inline-flex',alignItems:'center',gap:8,padding:'8px 14px',borderRadius:30,border:'1px solid '+(on?'#17171c':'var(--border-hairline)'),background:on?'#17171c':'#fff',color:on?'#fff':'var(--text-primary)',cursor:'pointer',font:'var(--text-caption)'}}><span style={{width:10,height:10,borderRadius:'50%',background:d.color,outline:on?'1px solid #fff':'none'}}/>{d.name}<span style={{opacity:.6}}>· {d.region}</span></button>})}</div>
    </div>
    <label style={{display:'flex',flexDirection:'column',gap:6,maxWidth:200}}><span style={pLabel}>Date</span><input type="date" value={m.date} onChange={e=>set({date:e.target.value})} style={field}/></label>
    <div style={{borderTop:'1px solid var(--border-hairline)',paddingTop:16}}>
      <button type="button" onClick={()=>setMore(!more)} aria-expanded={more} style={{background:'none',border:0,padding:0,cursor:'pointer',font:'var(--text-body)',textDecoration:'underline',textUnderlineOffset:3,color:'var(--text-primary)'}}>{more?'Hide details':'Add details (optional)'}</button>
      {!more&&<p style={{...pLabel,margin:'8px 0 0'}}>Title, feeling, importance and clarity. Skipping these changes nothing about how the memory is treated.</p>}
    </div>
    <fieldset disabled={saveState==='saving'} style={{border:0,padding:0,margin:0,minWidth:0}}><AttachmentEditor value={m.attachmentIds||[]} onChange={ids=>set({attachmentIds:ids,photo:undefined})} memoryId={m.id} description={m.text} onBusyChange={imageStatus}/></fieldset>
    {more&&<>
      <label style={{display:'flex',flexDirection:'column',gap:6}}><span style={pLabel}>Title</span><input value={m.title} onChange={e=>set({title:e.target.value})} style={field}/></label>
      <div style={{display:'flex',flexDirection:'column',gap:8}}><div style={{display:'flex',justifyContent:'space-between'}}><span style={pLabel}>How did it feel?</span>{m.emotion&&<button type="button" onClick={()=>set({emotion:null})} style={{...pLabel,background:'none',border:0,cursor:'pointer',textDecoration:'underline'}}>Clear</button>}</div><div style={{display:'flex',gap:6,flexWrap:'wrap'}}>{S2.EMOTIONS.map(e=><Chip key={e} tone="outline" size="sm" active={m.emotion===e} onClick={()=>set({emotion:m.emotion===e?null:e})}>{e}</Chip>)}</div></div>
      <Scale label="How important was it?" value={m.importance} onChange={v=>set({importance:v})} low="A small moment" high="A turning point"/>
      <Scale label="How clearly do you remember it?" value={m.clarity} onChange={v=>set({clarity:v})} low="Hazy" high="Vivid"/>
    </>}
  </Panel>;
}

export function RegionPanel({world,region,onBack,onOpenMemory,onAdd,onPreview,onApplyOverride,onRestore}:{world:World;region:Region;onBack:()=>void;onOpenMemory:(id:string)=>void;onAdd:()=>void;onPreview:(v:{region:Region;color:string|null;opacity:number|null}|null)=>void;onApplyOverride:(r:Region,v:{color:string|null;opacity:number|null})=>void;onRestore:(r:Region)=>void}){
  const dim=dimForRegion(world,region);
  const mems=dim?memsForDim(world,dim.id):[];
  const ov=world.overrides[region]||{};
  const [custom,setCustom]=React.useState(false);
  const [draft,setDraft]=React.useState({color:ov.color??null,opacity:ov.opacity??null});
  React.useEffect(()=>{onPreview(custom?{region,...draft}:null);return()=>onPreview(null)},[custom,draft]);
  const hasOv=ov.color!=null||ov.opacity!=null;
  return <Panel title={dim?dim.name:'Unassigned region'} eyebrow={<MonoLabel>{region}{hasOv?' · customized':''}</MonoLabel>} onBack={onBack} backLabel="Full map"
    footer={custom?<><Button onClick={()=>{onApplyOverride(region,draft);setCustom(false)}}>Apply</Button><Button variant="text" onClick={()=>{setDraft({color:ov.color??null,opacity:ov.opacity??null});setCustom(false)}}>Cancel preview</Button></>:<><Button onClick={onAdd}>{dim?'Add an experience here':'Assign in World settings'}</Button>{dim&&<Button variant="text" onClick={()=>setCustom(true)}>Customize appearance</Button>}</>}>
    {!dim&&<p style={{margin:0,font:'var(--text-body)'}}>This region isn't assigned to a dimension. It stays neutral until you give it one.</p>}
    {dim&&custom&&<div style={{display:'flex',flexDirection:'column',gap:16,padding:16,border:'1px solid var(--border-hairline)',borderRadius:8}}>
      <span style={pLabel}>Preview only. Nothing is saved until you apply.</span>
      <div style={{display:'flex',flexDirection:'column',gap:8}}><span style={pLabel}>Color {draft.color==null&&<span>· automatic</span>}</span><div style={{display:'flex',gap:8}}>{S2.PALETTE.map(p=>swatch(p.hex,(draft.color??dim.color)===p.hex,()=>setDraft(d=>({...d,color:p.hex})),p.name))}</div></div>
      <label style={{display:'flex',flexDirection:'column',gap:8}}><span style={pLabel}>Fill opacity {draft.opacity==null&&<span>· automatic (from memory clarity)</span>}</span><input type="range" min=".3" max="1" step=".05" value={draft.opacity??.85} onChange={e=>setDraft(d=>({...d,opacity:+e.target.value}))} style={{accentColor:'#17171c'}}/></label>
      {(draft.color!=null||draft.opacity!=null)&&<Button variant="text" onClick={()=>{setDraft({color:null,opacity:null});onRestore(region)}}>Restore automatic</Button>}
    </div>}
    {dim&&<div><div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline'}}><span style={pLabel}>{mems.length===0?'':`${mems.length} ${mems.length===1?'memory':'memories'} · newest first`}</span></div>
      {mems.length===0?<div style={{padding:'32px 0',display:'flex',flexDirection:'column',gap:8}}><span style={{font:'var(--text-body)'}}>No memories here yet.</span><span style={pLabel}>When you add one, this region gains its first contour.</span></div>
      :mems.map(m=><MemoryItem key={m.id} m={m} world={world} onOpen={onOpenMemory} showDims={m.dims.length>1}/>)}
    </div>}
  </Panel>;
}

export function MemoryPanel({world,memory:m,onBack,backLabel,onEdit,onDelete,onGoDim}:{world:World;memory:Memory;onBack:()=>void;backLabel:string;onEdit:(m:Memory)=>void;onDelete:(id:string)=>Promise<void>;onGoDim:(d:Dimension)=>void}){
  const photo=photoFor(m);
  const [confirm,setConfirm]=React.useState(false);
  return <Panel title={m.title||'Memory'} eyebrow={<MonoLabel>{fmtDate(m.date)}</MonoLabel>} onBack={onBack} backLabel={backLabel}
    footer={confirm?<><Button onClick={()=>onDelete(m.id)} style={{background:'var(--state-error)'}}>Delete memory</Button><Button variant="text" onClick={()=>setConfirm(false)}>Keep it</Button><span style={{...pLabel,width:'100%'}}>This removes it from every linked dimension. The map updates immediately.</span></>:<><Button onClick={()=>onEdit(m)}>Edit</Button><Button variant="text" onClick={()=>setConfirm(true)}>Delete</Button></>}>
    {photo&&<img src={photo} alt="" style={{width:'100%',aspectRatio:'16/10',borderRadius:8,objectFit:'cover',display:'block',background:'var(--surface-stone)'}}/>}
    <p style={{margin:0,font:'var(--text-body-large)',lineHeight:1.5,whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{m.text}</p>
    <div style={{display:'flex',flexDirection:'column',gap:8}}><span style={pLabel}>Linked to</span><div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{m.dims.map(id=>{const d=world.dims.find(x=>x.id===id);if(!d)return null;return <button key={id} onClick={()=>onGoDim(d)} style={{display:'inline-flex',alignItems:'center',gap:8,padding:'8px 14px',borderRadius:30,border:'1px solid var(--border-hairline)',background:'#fff',cursor:'pointer',font:'var(--text-caption)',color:'var(--text-primary)'}}><span style={{width:10,height:10,borderRadius:'50%',background:d.color}}/>{d.name}{!d.active&&<span style={{opacity:.6}}>· inactive</span>}</button>})}</div></div>
    <dl style={{margin:0,display:'grid',gridTemplateColumns:'auto 1fr',gap:'8px 16px',font:'var(--text-caption)'}}>
      <dt style={pLabel}>Feeling</dt><dd style={{margin:0}}>{m.emotion||'Not recorded'}</dd>
      <dt style={pLabel}>Importance</dt><dd style={{margin:0}}>{m.importance?`${m.importance} of 5`:'Not recorded'}</dd>
      <dt style={pLabel}>Clarity</dt><dd style={{margin:0}}>{m.clarity?`${m.clarity} of 5`:'Not recorded'}</dd>
    </dl>
  </Panel>;
}
