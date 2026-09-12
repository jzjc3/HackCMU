'use client';
import React from 'react';
import {clientApi} from '@/lib/client-api';
import {Button} from './Primitives';

export function AttachmentEditor({value,onChange,memoryId,description,onBusyChange}:{value:string[];onChange:(ids:string[])=>void;memoryId?:string;description:string;onBusyChange?:(busy:boolean)=>void}){
 const [busy,setBusy]=React.useState(false),[error,setError]=React.useState<string|null>(null),[prompt,setPrompt]=React.useState(''),[generating,setGenerating]=React.useState(false);
 const [kinds,setKinds]=React.useState<Record<string,string>>({});const file=React.useRef<HTMLInputElement>(null);
 const alive=React.useRef(true),running=React.useRef(false),latest=React.useRef({value,onChange,onBusyChange});
 React.useLayoutEffect(()=>{latest.current={value,onChange,onBusyChange}},[value,onChange,onBusyChange]);
 React.useEffect(()=>{alive.current=true;return()=>{alive.current=false;latest.current.onBusyChange?.(false)}},[]);
 React.useEffect(()=>{let cancelled=false;for(const id of value){if(kinds[id])continue;void clientApi.getAttachment(id).then(({attachment})=>{if(!cancelled)setKinds(k=>({...k,[id]:attachment.kind}))}).catch(()=>{});}return()=>{cancelled=true}},[value,kinds]);
 const run=async(fn:()=>ReturnType<typeof clientApi.uploadAttachment>)=>{if(running.current||latest.current.value.length>=10)return;running.current=true;setBusy(true);latest.current.onBusyChange?.(true);setError(null);try{const {attachment}=await fn();if(!alive.current){void clientApi.deleteAttachment(attachment.id).catch(()=>{});return}latest.current.onChange([...latest.current.value,attachment.id]);setKinds(k=>({...k,[attachment.id]:attachment.kind}));setGenerating(false)}catch(e){if(alive.current)setError(e instanceof Error?e.message:'Image could not be added.')}finally{running.current=false;if(alive.current){setBusy(false);latest.current.onBusyChange?.(false)}}};
 return <details style={{borderTop:'1px solid var(--border-hairline)',paddingTop:16}} open={value.length>0||undefined}><summary style={{cursor:'pointer',font:'var(--text-body)'}}>Images (optional)</summary><div style={{display:'flex',flexDirection:'column',gap:12,paddingTop:12}}>
 <input hidden ref={file} type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{const f=e.target.files?.[0];if(f)void run(()=>clientApi.uploadAttachment(f));e.currentTarget.value=''}}/>
 <div style={{display:'flex',gap:16,flexWrap:'wrap'}}><Button size="sm" variant="outline" disabled={busy||value.length>=10} onClick={()=>file.current?.click()}>Upload photo</Button><Button size="sm" variant="text" disabled={busy||value.length>=10} onClick={()=>{setPrompt(description);setGenerating(!generating)}}>Generate illustration</Button></div>
 {generating&&<><textarea aria-label="Illustration description" value={prompt} onChange={e=>setPrompt(e.target.value)} rows={3} style={{font:'var(--text-body)',padding:12,border:'1px solid var(--border-hairline)',borderRadius:4}}/><Button size="sm" disabled={busy||prompt.trim().length<5} onClick={()=>void run(()=>clientApi.generateImage(prompt,memoryId))}>Generate image</Button></>}
 {value.map(id=><figure key={id} style={{margin:0}}><img src={`/api/attachments/${encodeURIComponent(id)}`} alt="Memory attachment" style={{width:'100%',borderRadius:8}}/><figcaption style={{font:'var(--text-micro)',display:'flex',justifyContent:'space-between',gap:12}}><span>{kinds[id]==='generated'?'Generated illustration':'Attached image'}</span><Button variant="text" size="sm" disabled={busy} onClick={()=>{onChange(value.filter(x=>x!==id));void clientApi.deleteAttachment(id).catch(e=>{if(!(e instanceof Error&&'status' in e&&(e as {status:number}).status===409))setError('The image was removed from this draft but could not yet be deleted.')})}}>Remove</Button></figcaption></figure>)}
 {busy&&<span role="status" style={{font:'var(--text-caption)'}}>Preparing your image…</span>}{error&&<span role="alert" style={{font:'var(--text-caption)',color:'var(--state-error)'}}>{error}</span>}
 </div></details>;
}

export function DictationButton({onText,onError,disabled=false}:{onText:(s:string)=>void;onError:(s:string)=>void;disabled?:boolean}){
 const [recording,setRecording]=React.useState(false),[busy,setBusy]=React.useState(false);const rec=React.useRef<MediaRecorder|null>(null),tracks=React.useRef<MediaStream|null>(null),timer=React.useRef<ReturnType<typeof setTimeout>|null>(null),alive=React.useRef(true);
 React.useEffect(()=>{alive.current=true;return()=>{alive.current=false;if(timer.current)clearTimeout(timer.current);if(rec.current?.state==='recording')rec.current.stop();tracks.current?.getTracks().forEach(t=>t.stop())}},[]);
 const toggle=async()=>{if(recording){rec.current?.stop();return}try{
 const stream=await navigator.mediaDevices.getUserMedia({audio:true});if(!alive.current){stream.getTracks().forEach(t=>t.stop());return}tracks.current=stream;
 const mime=['audio/webm;codecs=opus','audio/webm','audio/mp4'].find(t=>MediaRecorder.isTypeSupported(t));const recorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);rec.current=recorder;const parts:BlobPart[]=[];
 recorder.ondataavailable=e=>{if(e.data.size)parts.push(e.data)};
 recorder.onerror=()=>{onError('Recording failed. You can still type your experience.');recorder.stop()};
 recorder.onstop=async()=>{if(timer.current)clearTimeout(timer.current);stream.getTracks().forEach(t=>t.stop());if(!alive.current)return;setRecording(false);setBusy(true);try{const type=recorder.mimeType.split(';')[0];const {text}=await clientApi.transcribe(new Blob(parts,{type}),type==='audio/mp4'?'dictation.m4a':'dictation.webm');if(alive.current)onText(text)}catch(e){if(alive.current)onError(e instanceof Error?e.message:'Transcription failed.')}finally{if(alive.current)setBusy(false)}};
 recorder.start();setRecording(true);timer.current=setTimeout(()=>{if(recorder.state==='recording')recorder.stop()},120000);
 }catch{tracks.current?.getTracks().forEach(t=>t.stop());onError('Microphone unavailable. Allow microphone access or type your experience.')}};
 return <button type="button" aria-label={recording?'Stop dictation':busy?'Transcribing':'Dictate'} aria-pressed={recording} title={recording?'Stop dictation':'Dictate'} disabled={disabled||busy} onClick={()=>void toggle()} style={{width:36,height:36,borderRadius:'50%',border:'1px solid var(--border-hairline)',background:recording?'#17171c':'#fff',display:'inline-flex',alignItems:'center',justifyContent:'center',color:recording?'#fff':'var(--text-muted)',flex:'0 0 auto',cursor:'pointer'}}><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5.5" y="1.5" width="5" height="8" rx="2.5"/><path d="M3 7.5a5 5 0 0 0 10 0M8 12.5v2M5.5 14.5h5"/></svg></button>;
}
