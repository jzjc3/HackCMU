import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';

const compile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022,jsx:ts.JsxEmit.React}}).outputText;
const moduleUrl=source=>`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const tracker=await import(moduleUrl(compile(await readFile('components/mind-travel/voice-turns.ts','utf8'))));
let fixture;
globalThis.__voiceTest={VoiceTurnTracker:tracker.VoiceTurnTracker,React:{
  useState:initial=>[initial,()=>{}],useRef:current=>({current}),useCallback:fn=>fn,useEffect:()=>{},
  createElement:(type,props,...children)=>({type,props,children}),
},Button:'button',clientApi:{getVoiceToken:async()=>({url:'wss://test.invalid',token:'test'}),extract:(...args)=>fixture.extract(...args)}};
let component=await readFile('components/mind-travel/RealtimeVoice.tsx','utf8');
component=component.replace(/^import .*;\r?\n/gm,'');
const {RealtimeVoice}=await import(moduleUrl('const {React,Button,clientApi,VoiceTurnTracker}=globalThis.__voiceTest;\n'+compile(component)));
globalThis.window={location:{search:''},setTimeout:(fn,ms)=>setTimeout(fn,ms),clearTimeout};
Object.defineProperty(globalThis,'navigator',{value:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})}},configurable:true});
globalThis.AudioContext=class{currentTime=0;audioWorklet={addModule:async()=>{}};resume=async()=>{};close=async()=>{};createMediaStreamSource=()=>({connect(){},disconnect(){}})};
globalThis.AudioWorkletNode=class{port={};connect(){}disconnect(){}};
globalThis.WebSocket=class{static OPEN=1;readyState=1;sent=[];constructor(){fixture.socket=this}send(raw){this.sent.push(JSON.parse(raw))}close(){this.readyState=3}};
const world={dims:[{id:'health',active:true,name:'Health'}],memories:[]};
const result={items:[{text:'Hiked with my sister.',dims:['health']}],source:'model'};
const user=(id,text)=>({type:'conversation.item.input_audio_transcription.completed',item_id:id,transcript:text});
const speech=id=>({type:'input_audio_buffer.speech_started',item_id:id});
const response=id=>({type:'response.created',response:{id}});
const done=id=>({type:'response.done',response:{id}});
const tool=(call,id)=>({type:'response.function_call_arguments.done',call_id:call,response_id:id,name:'categorize_experiences',arguments:'{}'});
const assistant=(id,item,text)=>({type:'response.output_audio_transcript.done',response_id:id,item_id:item,transcript:text});
async function setup(){
  fixture={messages:new Map(),calls:[],proposals:[],extract:async text=>{fixture.calls.push(text);return result}};
  const view=RealtimeVoice({world,onMessage:(who,text,id)=>fixture.messages.set(id,{who,text}),onProposals:p=>fixture.proposals.push(p)});
  const button=view.children[0];await button.props.onClick();await new Promise(resolve=>setImmediate(resolve));
  const socket=fixture.socket;socket.onopen();
  return {emit:event=>socket.onmessage({data:JSON.stringify(event)}),socket,view};
}

{
  const {emit,socket}=await setup();
  assert.equal(socket.sent[0].session.audio.input.transcription,undefined,'use the working v1 provider configuration');
  await emit(speech('a'));await emit(user('a','Last weekend'));
  for(let i=0;i<12;i++)await emit(user('a','Last weekend I hiked with my sister.'));
  await emit(response('r'));await emit(assistant('r','ai-1','Let me sort that.'));
  await emit(tool('c','r'));await emit(tool('c','r'));await emit(done('r'));
  await emit(response('r2'));await emit(assistant('r2','ai-2','Your proposal is ready.'));await emit(done('r2'));
  assert.equal([...fixture.messages.values()].filter(m=>m.who==='me').length,1);
  assert.deepEqual(fixture.calls,['Last weekend I hiked with my sister.'],'13 completed events classify the latest full text once');
  assert.equal([...fixture.messages.values()].filter(m=>m.who==='ai').length,2,'tool continuation is not blocked by one-user-one-response counting');
  assert.equal(socket.sent.filter(e=>e.type==='response.create').length,1);
}
{
  const {emit}=await setup();await emit(speech('race'));await emit(response('r'));
  const pending=emit(tool('c','r'));await emit(done('r'));
  assert.equal(fixture.calls.length,0);
  await emit(user('race','I learned to cook.'));await pending;
  assert.deepEqual(fixture.calls,['I learned to cook.'],'early tool waits for final transcript');
}
{
  const {emit}=await setup();await emit(speech('retry'));await emit(user('retry','I went hiking.'));await emit(response('r'));
  fixture.extract=async()=>{throw new Error('temporary failure')};await emit(tool('fail','r'));
  fixture.extract=async text=>{fixture.calls.push(text);return result};await emit(tool('retry','r'));
  assert.deepEqual(fixture.calls,['I went hiking.'],'failed classification retains transcript');
}
{
  const {emit,socket}=await setup();await emit(speech('stop'));await emit(response('r'));
  const pending=emit(tool('c','r'));socket.onclose();await pending;
  assert.equal(fixture.calls.length,0,'ending session while waiting prevents stale classifier calls');
}
{
  const {emit,socket}=await setup();await emit(speech('stop'));await emit(user('stop','I ran.'));await emit(response('r'));
  let finish;fixture.extract=()=>new Promise(resolve=>{finish=resolve});
  const pending=emit(tool('c','r'));await new Promise(resolve=>setImmediate(resolve));socket.onclose();finish(result);await pending;
  assert.equal(fixture.proposals.length,0,'ending session suppresses stale proposals');
}
{
  const {emit}=await setup();await emit(speech('old'));await emit(user('old','First experience.'));await emit(response('r'));
  await emit(speech('new'));await emit(user('new','Second experience.'));await emit(tool('old-call','r'));
  assert.deepEqual(fixture.calls,['First experience.'],'an older tool response cannot consume a newer utterance');
}
{
  const {emit}=await setup();await emit(speech('timeout'));await emit(response('r'));await emit(tool('timeout-call','r'));
  assert.equal(fixture.calls.length,0,'missing final transcription times out without classifying partial text');
  await emit(user('timeout','The delayed transcript.'));await emit(tool('retry-call','r'));
  assert.deepEqual(fixture.calls,['The delayed transcript.']);
}
{
  const first=await setup();await first.emit(speech('same'));await first.emit(user('same','First session.'));
  const firstKey=[...fixture.messages.keys()][0];first.socket.onclose();
  const second=await setup();await second.emit(speech('same'));await second.emit(user('same','Second session.'));
  assert.notEqual([...fixture.messages.keys()][0],firstKey,'reconnecting never overwrites the previous session bubble');
}
console.log('Voice session checks passed: repeated completions, tool races, retries, continuation, disconnects, timeout, turn isolation, and reconnects.');
