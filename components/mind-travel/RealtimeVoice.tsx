'use client';

import React from 'react';
import {clientApi} from '@/lib/client-api';
import type {Proposal,World} from '@/lib/types';
import {Button} from './Primitives';
import {VoiceTurnTracker} from './voice-turns';

type EventFamily='output'|'legacy';
type VoiceEvent={
  type?:string; event_id?:string; item_id?:string; response_id?:string; call_id?:string;
  name?:string; arguments?:string; transcript?:string; delta?:string;
  response?:{id?:string;status?:string}; error?:{message?:string};
};
type PendingAssistant={key:string;responseId:string;text:string;turn:number};
type TranscriptWaiter={turn:number;resolve:()=>void};
type Resources={
  socket?:WebSocket; stream?:MediaStream; audio?:AudioContext; input?:MediaStreamAudioSourceNode; capture?:AudioWorkletNode;
  playing:Set<AudioBufferSourceNode>; playbackWaiters:Set<()=>void>; nextTime:number; activeResponseId?:string;
  interruptedResponses:Set<string>; seenAssistantTurns:Set<string>; seenToolCalls:Set<string>;
  toolResponses:Set<string>; completedResponses:Set<string>; pendingToolCounts:Map<string,number>; continuations:Set<string>;
  pendingAssistant:PendingAssistant[]; responseTurns:Map<string,number>; turns:VoiceTurnTracker; transcriptWaiters:Set<TranscriptWaiter>; categorizationInFlight:boolean;
  audioFamily?:EventFamily; transcriptFamily?:EventFamily;
  lastAssistantFallback?:{text:string;at:number}; debug:boolean; audioPackets:number;
};

const freshResources=():Resources=>({
  playing:new Set(),playbackWaiters:new Set(),nextTime:0,
  interruptedResponses:new Set(),seenAssistantTurns:new Set(),seenToolCalls:new Set(),
  toolResponses:new Set(),completedResponses:new Set(),pendingToolCounts:new Map(),continuations:new Set(),
  pendingAssistant:[],responseTurns:new Map(),turns:new VoiceTurnTracker(),transcriptWaiters:new Set(),categorizationInFlight:false,
  debug:false,audioPackets:0,
});
const responseId=(event:VoiceEvent)=>event.response_id||event.response?.id||'';
const family=(type:string|undefined):EventFamily|undefined=>type?.startsWith('response.output_')?'output':type?.startsWith('response.audio')?'legacy':undefined;

export function RealtimeVoice({world,onMessage,onProposals}:{world:World;onMessage:(who:'me'|'ai',text:string,id?:string)=>void;onProposals:(p:Proposal[])=>void}){
  const [state,setState]=React.useState<'off'|'connecting'|'live'>('off');
  const [error,setError]=React.useState<string|null>(null);
  const ref=React.useRef<Resources>(freshResources());
  const generation=React.useRef(0);
  const callbacks=React.useRef({onMessage,onProposals}); callbacks.current={onMessage,onProposals};

  const releasePlayback=(r:Resources)=>{if(r.playing.size)return;for(const resolve of r.playbackWaiters)resolve();r.playbackWaiters.clear()};
  const stopPlayback=(r:Resources,audio?:AudioContext)=>{for(const node of r.playing){try{node.stop()}catch{}}r.playing.clear();r.nextTime=audio?.currentTime??0;releasePlayback(r)};
  const stop=React.useCallback(()=>{generation.current++;const r=ref.current;r.socket?.close();r.stream?.getTracks().forEach(t=>t.stop());r.input?.disconnect();r.capture?.disconnect();for(const waiter of r.transcriptWaiters)waiter.resolve();r.transcriptWaiters.clear();stopPlayback(r,r.audio);void r.audio?.close();ref.current=freshResources();setState('off')},[]);
  React.useEffect(()=>()=>stop(),[stop]);

  const start=async()=>{
    setState('connecting');setError(null);const attempt=++generation.current;
    try{
      const audio=new AudioContext({sampleRate:24000});const r=freshResources();r.audio=audio;r.debug=new URLSearchParams(window.location.search).get('dev')==='1';ref.current=r;await audio.resume();
      const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,channelCount:1}});if(attempt!==generation.current){stream.getTracks().forEach(t=>t.stop());return}r.stream=stream;
      const token=await clientApi.getVoiceToken();if(attempt!==generation.current)return;
      await audio.audioWorklet.addModule('/audio-capture.js');if(attempt!==generation.current)return;
      const ws=new WebSocket(token.url,[`xai-client-secret.${token.token}`]);r.socket=ws;
      const sessionId=crypto.randomUUID();
      const isCurrent=()=>attempt===generation.current&&ws.readyState===WebSocket.OPEN;
      const send=(event:unknown)=>{if(isCurrent())ws.send(JSON.stringify(event))};
      const display=(who:'me'|'ai',text:string,key:string)=>{if(isCurrent())callbacks.current.onMessage(who,text,`${sessionId}:${key}`)};
      const trace=(event:string,details:Record<string,unknown>={})=>{if(r.debug)console.info('[Mind Travel voice]',event,details)};
      const active=world.dims.filter(d=>d.active),ids=new Set(active.map(d=>d.id));
      const flushAssistant=(forceResponseId?:string)=>{const waiting:PendingAssistant[]=[];for(const next of r.pendingAssistant){if(r.interruptedResponses.has(next.responseId))continue;if(r.turns.hasDisplayed(next.turn)||forceResponseId===next.responseId)display('ai',next.text,`voice-ai-${next.key}`);else waiting.push(next)}r.pendingAssistant=waiting};
      const resolveTranscriptWaiters=()=>{for(const waiter of [...r.transcriptWaiters])if(r.turns.readyThrough(waiter.turn)){r.transcriptWaiters.delete(waiter);waiter.resolve()}};
      const waitForTranscript=async(turn:number)=>{
        if(r.turns.readyThrough(turn))return true;
        return new Promise<boolean>(resolve=>{
          let settled=false,timer=0;
          const finish=(ready:boolean)=>{if(settled)return;settled=true;window.clearTimeout(timer);r.transcriptWaiters.delete(waiter);resolve(ready)};
          const waiter:TranscriptWaiter={turn,resolve:()=>finish(true)};
          timer=window.setTimeout(()=>finish(false),1800);r.transcriptWaiters.add(waiter);
        });
      };
      const waitForPlayback=()=>r.playing.size===0?Promise.resolve():new Promise<void>(resolve=>r.playbackWaiters.add(resolve));
      const continueAfterTools=async(id:string)=>{if(!id||r.continuations.has(id)||r.interruptedResponses.has(id))return;r.continuations.add(id);await waitForPlayback();if(attempt!==generation.current||r.interruptedResponses.has(id)||ws.readyState!==WebSocket.OPEN)return;send({type:'response.create'})};
      const maybeContinue=(id:string)=>{if(r.completedResponses.has(id)&&r.toolResponses.has(id)&&(r.pendingToolCounts.get(id)||0)===0){r.toolResponses.delete(id);void continueAfterTools(id)}};

      ws.onopen=()=>{
        if(attempt!==generation.current){ws.close();return}
        trace('socket_open');
        send({type:'session.update',session:{
          voice:'eve',
          instructions:`You are Mind Travel, a warm concise reflective assistant. Help the user describe real experiences. Their active life dimensions are ${active.map(d=>`${d.id}: ${d.name}`).join(', ')}. Preserve facts and never judge their life. Ask concise clarifying questions. When they are ready, call categorize_experiences so the app's dedicated classifier can prepare proposals for visual review. Do not choose dimensions yourself. This only drafts proposals; never say anything is saved. Never infer importance or clarity.`,
          turn_detection:{type:'server_vad'},
          // Restore v1's default transcription path. Explicit grok-transcribe emitted
          // repeated early completions for the same item in the live regression replay.
          audio:{input:{format:{type:'audio/pcm',rate:24000}},output:{format:{type:'audio/pcm',rate:24000}}},
          tools:[{type:'function',name:'categorize_experiences',description:'Send the exact captured user transcript to the app classifier and show reviewable proposals. The classifier, not the voice model, assigns dimensions. This does not save.',parameters:{type:'object',properties:{},additionalProperties:false,required:[]}}],
        }});
        const input=audio.createMediaStreamSource(stream),capture=new AudioWorkletNode(audio,'mind-travel-capture');r.input=input;r.capture=capture;
        capture.port.onmessage=e=>{if(ws.readyState!==WebSocket.OPEN)return;const samples=e.data as Float32Array,bytes=new Uint8Array(samples.length*2),view=new DataView(bytes.buffer);for(let i=0;i<samples.length;i++)view.setInt16(i*2,Math.max(-1,Math.min(1,samples[i]))*32767,true);let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);send({type:'input_audio_buffer.append',audio:btoa(binary)});r.audioPackets++;if(r.audioPackets===1)trace('audio_stream_started')};
        input.connect(capture);capture.connect(audio.destination);setState('live');
      };

      ws.onmessage=async e=>{
        if(attempt!==generation.current)return;
        try{
          const event=JSON.parse(String(e.data)) as VoiceEvent,type=event.type||'',id=responseId(event);
          if(type==='session.updated'||type==='input_audio_buffer.speech_started'||type==='input_audio_buffer.speech_stopped'||type.startsWith('conversation.item.input_audio_transcription.')||type==='response.function_call_arguments.done'||type==='response.done')trace(type,{itemId:event.item_id,responseId:id,hasTranscript:Boolean(event.transcript?.trim()),audioPackets:r.audioPackets});
          if(type==='error'){setError(event.error?.message||'Voice session failed.');return}
          if(type==='response.created'){r.activeResponseId=id||r.activeResponseId;if(id)r.responseTurns.set(id,r.turns.currentTurn())}
          if(type==='input_audio_buffer.speech_started'){const turn=r.turns.speechStarted(event.item_id);if(!r.turns.hasDisplayed(turn))display('me','Listening…',`voice-user-${turn}`);if(r.activeResponseId)r.interruptedResponses.add(r.activeResponseId);stopPlayback(r,audio)}
          if((type==='conversation.item.input_audio_transcription.updated'||type==='conversation.item.input_audio_transcription.completed')&&typeof event.transcript==='string'){
            const transcript=r.turns.update(event.item_id,event.transcript,type.endsWith('.completed'));
            if(transcript){display('me',transcript.text||(transcript.final?'No words were transcribed. Please try again.':'Listening…'),transcript.id);if(transcript.final)resolveTranscriptWaiters();flushAssistant()}
          }
          if(type==='response.output_audio_transcript.done'||type==='response.audio_transcript.done'){
            const eventFamily=family(type);if(!r.transcriptFamily)r.transcriptFamily=eventFamily;
            if(eventFamily===r.transcriptFamily&&event.transcript?.trim()&&!r.interruptedResponses.has(id)){
              const text=event.transcript.trim(),key=event.item_id||id||event.event_id||'',repeatedFallback=!key&&r.lastAssistantFallback?.text===text&&Date.now()-r.lastAssistantFallback.at<2000;
              if(!repeatedFallback&&(!key||!r.seenAssistantTurns.has(key))){if(key)r.seenAssistantTurns.add(key);else r.lastAssistantFallback={text,at:Date.now()};r.pendingAssistant.push({key:key||`fallback-${Date.now()}`,responseId:id,text,turn:r.responseTurns.get(id)||r.turns.currentTurn()});flushAssistant()}
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
              r.seenToolCalls.add(callKey);const toolResponseId=id||r.activeResponseId||'pending';r.pendingToolCounts.set(toolResponseId,(r.pendingToolCounts.get(toolResponseId)||0)+1);
              let output:{result:string;question?:string|null;source?:string}={result:'Unknown tool'};
              try{
                if(event.name==='categorize_experiences'){
                  if(r.categorizationInFlight)output={result:'Categorization is already in progress. Wait for its result before continuing.'};
                  else{
                    r.categorizationInFlight=true;
                    try{
                      const targetTurn=r.responseTurns.get(toolResponseId)??r.turns.currentTurn();
                      trace('classifier_waiting',{turn:targetTurn});const ready=await waitForTranscript(targetTurn);
                      if(!isCurrent())return;
                      if(!ready||!r.turns.readyThrough(targetTurn))throw new Error('Your voice transcript is still arriving. Please ask to review again in a moment, or use dictation.');
                      const captured=r.turns.unconsumed(targetTurn);
                      if(!captured.text)throw new Error('There is no new transcribed experience to review. Please describe an experience or use dictation.');
                      trace('classifier_started',{turn:targetTurn});const classification=await clientApi.extract(captured.text,world.dims,{recent:world.memories.slice(-8).map(m=>({text:m.text,dims:m.dims}))});
                      if(!isCurrent())return;
                      const proposals=classification.items.filter(x=>x.dims.length&&x.dims.every(d=>ids.has(d))).slice(0,6);
                      if(proposals.length){callbacks.current.onProposals(proposals);r.turns.markConsumed(captured)}setError(null);trace('classifier_completed',{proposalCount:proposals.length});
                      output={result:proposals.length?'Proposals are shown for explicit review. The user must press Save to persist them.':'No distinct experience was found. Ask the user the classifier question.',question:classification.question,source:classification.source};
                    }finally{r.categorizationInFlight=false}
                  }
                }
              }catch(toolError){if(!isCurrent())return;const message=toolError instanceof Error?toolError.message:'The classifier is unavailable.';setError(message);output={result:`Classification failed: ${message}. Ask the user to retry or use typed capture.`}}
              send({type:'conversation.item.create',item:{type:'function_call_output',call_id:event.call_id,output:JSON.stringify(output)}});r.toolResponses.add(toolResponseId);r.pendingToolCounts.set(toolResponseId,Math.max(0,(r.pendingToolCounts.get(toolResponseId)||1)-1));maybeContinue(toolResponseId);
            }
          }
          if(type==='response.done'){const doneId=id||r.activeResponseId||'pending';r.completedResponses.add(doneId);flushAssistant(doneId);if(r.activeResponseId===doneId)r.activeResponseId=undefined;maybeContinue(doneId)}
        }catch{setError('A voice response could not be processed. Your saved memories are unchanged.')}
      };
      ws.onerror=()=>{if(attempt===generation.current){setError('Voice connection failed. You can reconnect or use dictation.');stop()}};
      ws.onclose=()=>{if(attempt===generation.current){setError('Voice session ended. You can reconnect.');stop()}};
    }catch(e){if(attempt===generation.current){setError(e instanceof Error?e.message:'Voice is unavailable.');stop()}}
  };

  return <div style={{display:'flex',flexDirection:'column',gap:8}}><Button variant="text" size="sm" onClick={()=>state==='off'?void start():stop()}>{state==='off'?'Talk live with Grok':state==='connecting'?'Cancel connecting':'End live conversation'}</Button>{state==='live'&&<span role="status" style={{font:'var(--text-micro)',color:'var(--text-muted)'}}>Listening · ask to review your experiences when ready</span>}{error&&<span role="alert" style={{font:'var(--text-caption)',color:'var(--state-error)'}}>{error}</span>}</div>;
}
