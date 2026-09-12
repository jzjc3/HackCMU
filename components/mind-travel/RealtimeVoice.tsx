'use client';

import React from 'react';
import {clientApi} from '@/lib/client-api';
import type {Proposal,World} from '@/lib/types';
import {EMOTIONS} from '@/lib/types';
import {Button} from './Primitives';

type EventFamily='output'|'legacy';
type VoiceEvent={
  type?:string; event_id?:string; item_id?:string; response_id?:string; call_id?:string;
  name?:string; arguments?:string; transcript?:string; delta?:string;
  response?:{id?:string;status?:string}; error?:{message?:string};
};
type PendingAssistant={key:string;responseId:string;text:string};
type Resources={
  socket?:WebSocket; stream?:MediaStream; audio?:AudioContext; input?:MediaStreamAudioSourceNode; capture?:AudioWorkletNode;
  playing:Set<AudioBufferSourceNode>; playbackWaiters:Set<()=>void>; nextTime:number; activeResponseId?:string;
  interruptedResponses:Set<string>; seenInputItems:Set<string>; seenAssistantTurns:Set<string>; seenToolCalls:Set<string>;
  toolResponses:Set<string>; continuations:Set<string>; pendingAssistant:PendingAssistant[]; unansweredUserTurns:number;
  audioFamily?:EventFamily; transcriptFamily?:EventFamily;
  lastUserFallback?:{text:string;at:number}; lastAssistantFallback?:{text:string;at:number};
};

const freshResources=():Resources=>({
  playing:new Set(),playbackWaiters:new Set(),nextTime:0,
  interruptedResponses:new Set(),seenInputItems:new Set(),seenAssistantTurns:new Set(),seenToolCalls:new Set(),
  toolResponses:new Set(),continuations:new Set(),pendingAssistant:[],unansweredUserTurns:0,
});
const responseId=(event:VoiceEvent)=>event.response_id||event.response?.id||'';
const family=(type:string|undefined):EventFamily|undefined=>type?.startsWith('response.output_')?'output':type?.startsWith('response.audio')?'legacy':undefined;

export function RealtimeVoice({world,onMessage,onProposals}:{world:World;onMessage:(who:'me'|'ai',text:string)=>void;onProposals:(p:Proposal[])=>void}){
  const [state,setState]=React.useState<'off'|'connecting'|'live'>('off');
  const [error,setError]=React.useState<string|null>(null);
  const ref=React.useRef<Resources>(freshResources());
  const generation=React.useRef(0);
  const callbacks=React.useRef({onMessage,onProposals}); callbacks.current={onMessage,onProposals};

  const releasePlayback=(r:Resources)=>{if(r.playing.size)return;for(const resolve of r.playbackWaiters)resolve();r.playbackWaiters.clear()};
  const stopPlayback=(r:Resources,audio?:AudioContext)=>{for(const node of r.playing){try{node.stop()}catch{}}r.playing.clear();r.nextTime=audio?.currentTime??0;releasePlayback(r)};
  const stop=React.useCallback(()=>{generation.current++;const r=ref.current;r.socket?.close();r.stream?.getTracks().forEach(t=>t.stop());r.input?.disconnect();r.capture?.disconnect();stopPlayback(r,r.audio);void r.audio?.close();ref.current=freshResources();setState('off')},[]);
  React.useEffect(()=>()=>stop(),[stop]);

  const start=async()=>{
    setState('connecting');setError(null);const attempt=++generation.current;
    try{
      const audio=new AudioContext({sampleRate:24000});const r=freshResources();r.audio=audio;ref.current=r;await audio.resume();
      const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,channelCount:1}});if(attempt!==generation.current){stream.getTracks().forEach(t=>t.stop());return}r.stream=stream;
      const token=await clientApi.getVoiceToken();if(attempt!==generation.current)return;
      await audio.audioWorklet.addModule('/audio-capture.js');if(attempt!==generation.current)return;
      const ws=new WebSocket(token.url,[`xai-client-secret.${token.token}`]);r.socket=ws;
      const send=(event:unknown)=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(event))};
      const active=world.dims.filter(d=>d.active),ids=new Set(active.map(d=>d.id));
      const flushAssistant=()=>{while(r.unansweredUserTurns>0&&r.pendingAssistant.length){const next=r.pendingAssistant.shift()!;if(r.interruptedResponses.has(next.responseId))continue;r.unansweredUserTurns--;callbacks.current.onMessage('ai',next.text)}};
      const waitForPlayback=()=>r.playing.size===0?Promise.resolve():new Promise<void>(resolve=>r.playbackWaiters.add(resolve));
      const continueAfterTools=async(id:string)=>{if(!id||r.continuations.has(id)||r.interruptedResponses.has(id))return;r.continuations.add(id);await waitForPlayback();if(attempt!==generation.current||r.interruptedResponses.has(id)||ws.readyState!==WebSocket.OPEN)return;send({type:'response.create'})};

      ws.onopen=()=>{
        if(attempt!==generation.current){ws.close();return}
        send({type:'session.update',session:{
          voice:'eve',
          instructions:`You are Mind Travel, a warm concise reflective assistant. Help the user describe real experiences. Their active life dimensions are ${active.map(d=>`${d.id}: ${d.name}`).join(', ')}. Preserve facts and never judge their life. Ask concise clarifying questions. When they are ready, call propose_experiences with at most six experiences for them to review visually. This only drafts proposals; never say anything is saved. Never infer importance or clarity.`,
          turn_detection:{type:'server_vad'},
          audio:{input:{format:{type:'audio/pcm',rate:24000},transcription:{model:'grok-transcribe'}},output:{format:{type:'audio/pcm',rate:24000}}},
          tools:[{type:'function',name:'propose_experiences',description:'Prepare experience proposals for explicit visual review. This does not save.',parameters:{type:'object',properties:{items:{type:'array',maxItems:6,items:{type:'object',properties:{text:{type:'string'},dims:{type:'array',items:{type:'string',enum:[...ids]}},reason:{type:'string'},emotion:{type:['string','null'],enum:[...EMOTIONS,null]},confidence:{type:'number'}},required:['text','dims','reason','emotion','confidence']}}},required:['items']}}],
        }});
        const input=audio.createMediaStreamSource(stream),capture=new AudioWorkletNode(audio,'mind-travel-capture');r.input=input;r.capture=capture;
        capture.port.onmessage=e=>{if(ws.readyState!==WebSocket.OPEN)return;const samples=e.data as Float32Array,bytes=new Uint8Array(samples.length*2),view=new DataView(bytes.buffer);for(let i=0;i<samples.length;i++)view.setInt16(i*2,Math.max(-1,Math.min(1,samples[i]))*32767,true);let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);send({type:'input_audio_buffer.append',audio:btoa(binary)})};
        input.connect(capture);capture.connect(audio.destination);setState('live');
      };

      ws.onmessage=e=>{
        if(attempt!==generation.current)return;
        try{
          const event=JSON.parse(String(e.data)) as VoiceEvent,type=event.type||'',id=responseId(event);
          if(type==='error'){setError(event.error?.message||'Voice session failed.');return}
          if(type==='response.created')r.activeResponseId=id||r.activeResponseId;
          if(type==='input_audio_buffer.speech_started'){if(r.activeResponseId)r.interruptedResponses.add(r.activeResponseId);stopPlayback(r,audio)}
          if(type==='conversation.item.input_audio_transcription.completed'&&event.transcript?.trim()){
            const text=event.transcript.trim(),key=event.item_id||event.event_id||'',repeatedFallback=!key&&r.lastUserFallback?.text===text&&Date.now()-r.lastUserFallback.at<2000;
            if(!repeatedFallback&&(!key||!r.seenInputItems.has(key))){if(key)r.seenInputItems.add(key);else r.lastUserFallback={text,at:Date.now()};callbacks.current.onMessage('me',text);r.unansweredUserTurns++;flushAssistant()}
          }
          if(type==='response.output_audio_transcript.done'||type==='response.audio_transcript.done'){
            const eventFamily=family(type);if(!r.transcriptFamily)r.transcriptFamily=eventFamily;
            if(eventFamily===r.transcriptFamily&&event.transcript?.trim()&&!r.interruptedResponses.has(id)){
              const text=event.transcript.trim(),key=id||event.item_id||event.event_id||'',repeatedFallback=!key&&r.lastAssistantFallback?.text===text&&Date.now()-r.lastAssistantFallback.at<2000;
              if(!repeatedFallback&&(!key||!r.seenAssistantTurns.has(key))){if(key)r.seenAssistantTurns.add(key);else r.lastAssistantFallback={text,at:Date.now()};r.pendingAssistant.push({key,responseId:id,text});flushAssistant()}
            }
          }
          if(type==='response.output_audio.delta'||type==='response.audio.delta'){
            const eventFamily=family(type);if(!r.audioFamily)r.audioFamily=eventFamily;
            if(eventFamily===r.audioFamily&&event.delta&&!r.interruptedResponses.has(id)){
              const binary=atob(event.delta),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0)),view=new DataView(bytes.buffer),buffer=audio.createBuffer(1,bytes.length/2,24000),samples=buffer.getChannelData(0);
              for(let i=0;i<samples.length;i++)samples[i]=view.getInt16(i*2,true)/32768;
              const source=audio.createBufferSource();source.buffer=buffer;source.connect(audio.destination);const at=Math.max(audio.currentTime,r.nextTime);source.start(at);r.nextTime=at+buffer.duration;r.playing.add(source);source.onended=()=>{r.playing.delete(source);releasePlayback(r)};
            }
          }
          if(type==='response.function_call_arguments.done'){
            const callKey=event.call_id||event.event_id||`${id}:${event.name}:${event.arguments}`;
            if(!r.seenToolCalls.has(callKey)){
              r.seenToolCalls.add(callKey);let result='Unknown tool';
              if(event.name==='propose_experiences'){
                const value=JSON.parse(event.arguments||'{}') as {items?:Proposal[]};if(!Array.isArray(value.items)||value.items.length>6)throw new Error('Invalid proposal');
                const proposals:Proposal[]=value.items.map(x=>{if(typeof x.text!=='string'||!x.text.trim()||!Array.isArray(x.dims)||!x.dims.length||x.dims.some(d=>!ids.has(d)))throw new Error('Invalid proposal');return{text:x.text.slice(0,1200),dims:[...new Set(x.dims)].slice(0,2),reason:String(x.reason||'').slice(0,240),emotion:EMOTIONS.includes(x.emotion as never)?x.emotion:null,confidence:Math.max(0,Math.min(1,Number(x.confidence)||.5))}});
                callbacks.current.onProposals(proposals);result='Proposals shown. The user must press Save to persist them.';
              }
              send({type:'conversation.item.create',item:{type:'function_call_output',call_id:event.call_id,output:JSON.stringify({result})}});r.toolResponses.add(id||r.activeResponseId||'pending');
            }
          }
          if(type==='response.done'){const doneId=id||r.activeResponseId||'pending';if(r.activeResponseId===doneId)r.activeResponseId=undefined;if(r.toolResponses.has(doneId)){r.toolResponses.delete(doneId);void continueAfterTools(doneId)}}
        }catch{setError('A voice response could not be processed. Your saved memories are unchanged.')}
      };
      ws.onerror=()=>{if(attempt===generation.current){setError('Voice connection failed. You can reconnect or use dictation.');stop()}};
      ws.onclose=()=>{if(attempt===generation.current){setError('Voice session ended. You can reconnect.');stop()}};
    }catch(e){if(attempt===generation.current){setError(e instanceof Error?e.message:'Voice is unavailable.');stop()}}
  };

  return <div style={{display:'flex',flexDirection:'column',gap:8}}><Button variant="text" size="sm" onClick={()=>state==='off'?void start():stop()}>{state==='off'?'Talk live with Grok':state==='connecting'?'Cancel connecting':'End live conversation'}</Button>{state==='live'&&<span role="status" style={{font:'var(--text-micro)',color:'var(--text-muted)'}}>Listening · ask to review your experiences when ready</span>}{error&&<span role="alert" style={{font:'var(--text-caption)',color:'var(--state-error)'}}>{error}</span>}</div>;
}
