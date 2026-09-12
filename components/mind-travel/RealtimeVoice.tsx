'use client';
import React from 'react';
import {clientApi} from '@/lib/client-api';
import type {World,Proposal} from '@/lib/types';
import {EMOTIONS} from '@/lib/types';
import {Button} from './Primitives';

type Resources={socket?:WebSocket;stream?:MediaStream;audio?:AudioContext;input?:MediaStreamAudioSourceNode;capture?:AudioWorkletNode;playing:Set<AudioBufferSourceNode>;nextTime:number};
export function RealtimeVoice({world,onMessage,onProposals}:{world:World;onMessage:(who:'me'|'ai',text:string)=>void;onProposals:(p:Proposal[])=>void}){
 const [state,setState]=React.useState<'off'|'connecting'|'live'>('off'),[error,setError]=React.useState<string|null>(null);
 const ref=React.useRef<Resources>({playing:new Set(),nextTime:0});const generation=React.useRef(0);const callbacks=React.useRef({onMessage,onProposals});callbacks.current={onMessage,onProposals};
 const stop=React.useCallback(()=>{generation.current++;const r=ref.current;r.socket?.close();r.stream?.getTracks().forEach(t=>t.stop());r.input?.disconnect();r.capture?.disconnect();r.playing.forEach(n=>{try{n.stop()}catch{}});void r.audio?.close();ref.current={playing:new Set(),nextTime:0};setState('off')},[]);
 React.useEffect(()=>()=>stop(),[stop]);
 const start=async()=>{setState('connecting');setError(null);const attempt=++generation.current;try{
 const audio=new AudioContext({sampleRate:24000});ref.current.audio=audio;await audio.resume();
 const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,channelCount:1}});if(attempt!==generation.current){stream.getTracks().forEach(t=>t.stop());return}ref.current.stream=stream;
 const token=await clientApi.getVoiceToken();if(attempt!==generation.current)return;
 await audio.audioWorklet.addModule('/audio-capture.js');if(attempt!==generation.current)return;
 const ws=new WebSocket(token.url,[`xai-client-secret.${token.token}`]);ref.current.socket=ws;
 const send=(event:unknown)=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(event))};
 const active=world.dims.filter(d=>d.active),ids=new Set(active.map(d=>d.id));
 ws.onopen=()=>{if(attempt!==generation.current){ws.close();return}send({type:'session.update',session:{voice:'eve',instructions:`You are Mind Travel, a warm concise reflective assistant. Help the user describe real experiences. Their active life dimensions are ${active.map(d=>`${d.id}: ${d.name}`).join(', ')}. Preserve facts and never judge their life. Ask concise clarifying questions. When they are ready, call propose_experiences with at most six experiences for them to review visually. This only drafts proposals; never say anything is saved. Never infer importance or clarity.`,turn_detection:{type:'server_vad'},audio:{input:{format:{type:'audio/pcm',rate:24000}},output:{format:{type:'audio/pcm',rate:24000}}},tools:[]}});
 // Session tools belong in the session object. Separate update keeps the audio config concise.
 send({type:'session.update',session:{tools:[{type:'function',name:'propose_experiences',description:'Prepare experience proposals for explicit visual review. This does not save.',parameters:{type:'object',properties:{items:{type:'array',maxItems:6,items:{type:'object',properties:{text:{type:'string'},dims:{type:'array',items:{type:'string',enum:[...ids]}},reason:{type:'string'},emotion:{type:['string','null'],enum:[...EMOTIONS,null]},confidence:{type:'number'}},required:['text','dims','reason','emotion','confidence']}}},required:['items']}}]}});
 const input=audio.createMediaStreamSource(stream),capture=new AudioWorkletNode(audio,'mind-travel-capture');ref.current.input=input;ref.current.capture=capture;
 capture.port.onmessage=e=>{if(ws.readyState!==WebSocket.OPEN)return;const samples=e.data as Float32Array,bytes=new Uint8Array(samples.length*2),view=new DataView(bytes.buffer);for(let i=0;i<samples.length;i++)view.setInt16(i*2,Math.max(-1,Math.min(1,samples[i]))*32767,true);let binary='';for(const b of bytes)binary+=String.fromCharCode(b);send({type:'input_audio_buffer.append',audio:btoa(binary)})};input.connect(capture);capture.connect(audio.destination);setState('live');};
 ws.onmessage=e=>{if(attempt!==generation.current)return;try{const event=JSON.parse(String(e.data));
 if(event.type==='error'){setError(event.error?.message||'Voice session failed.');stop();return}
 if(event.type==='input_audio_buffer.speech_started'){ref.current.playing.forEach(n=>{try{n.stop()}catch{}});ref.current.playing.clear();ref.current.nextTime=audio.currentTime}
 if(event.type==='conversation.item.input_audio_transcription.completed'&&event.transcript)callbacks.current.onMessage('me',event.transcript);
 if((event.type==='response.output_audio_transcript.done'||event.type==='response.audio_transcript.done')&&event.transcript)callbacks.current.onMessage('ai',event.transcript);
 if(event.type==='response.output_audio.delta'||event.type==='response.audio.delta'){const binary=atob(event.delta),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0)),view=new DataView(bytes.buffer),buffer=audio.createBuffer(1,bytes.length/2,24000),samples=buffer.getChannelData(0);for(let i=0;i<samples.length;i++)samples[i]=view.getInt16(i*2,true)/32768;const source=audio.createBufferSource();source.buffer=buffer;source.connect(audio.destination);const at=Math.max(audio.currentTime,ref.current.nextTime);source.start(at);ref.current.nextTime=at+buffer.duration;ref.current.playing.add(source);source.onended=()=>ref.current.playing.delete(source)}
 if(event.type==='response.function_call_arguments.done'){let result='Unknown tool';if(event.name==='propose_experiences'){const value=JSON.parse(event.arguments);if(!Array.isArray(value.items)||value.items.length>6)throw new Error('Invalid proposal');const proposals:Proposal[]=value.items.map((x:Proposal)=>{if(typeof x.text!=='string'||!x.text.trim()||!Array.isArray(x.dims)||!x.dims.length||x.dims.some(id=>!ids.has(id)))throw new Error('Invalid proposal');return{text:x.text.slice(0,1200),dims:[...new Set(x.dims)].slice(0,2),reason:String(x.reason||'').slice(0,240),emotion:EMOTIONS.includes(x.emotion as never)?x.emotion:null,confidence:Math.max(0,Math.min(1,Number(x.confidence)||.5))}});callbacks.current.onProposals(proposals);result='Proposals shown. The user must press Save to persist them.'}send({type:'conversation.item.create',item:{type:'function_call_output',call_id:event.call_id,output:JSON.stringify({result})}});send({type:'response.create'})}
 }catch{setError('A voice response could not be processed. Your saved memories are unchanged.')}};
 ws.onerror=()=>{if(attempt===generation.current){setError('Voice connection failed. You can reconnect or use dictation.');stop()}};
 ws.onclose=()=>{if(attempt===generation.current){setError('Voice session ended. You can reconnect.');stop()}};
 }catch(e){if(attempt===generation.current){setError(e instanceof Error?e.message:'Voice is unavailable.');stop()}}};
 return <div style={{display:'flex',flexDirection:'column',gap:8}}><Button variant="text" size="sm" onClick={()=>state==='off'?void start():stop()}>{state==='off'?'Talk live with Grok':state==='connecting'?'Cancel connecting':'End live conversation'}</Button>{state==='live'&&<span role="status" style={{font:'var(--text-micro)',color:'var(--text-muted)'}}>Listening · ask to review your experiences when ready</span>}{error&&<span role="alert" style={{font:'var(--text-caption)',color:'var(--state-error)'}}>{error}</span>}</div>;
}
