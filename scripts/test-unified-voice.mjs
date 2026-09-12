import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {compile,moduleUrl,loader} from './test-loader.mjs';
const {ConversationController}=await loader()('lib/conversation.ts');
let fixture;
globalThis.__voiceTest={React:{useState:initial=>[typeof initial==='function'?initial():initial,()=>{}],useRef:current=>({current}),useCallback:fn=>fn,useEffect:()=>{},useSyncExternalStore:(_,get)=>get(),createElement:(type,props,...children)=>({type,props,children})},Button:'button',clientApi:{getVoiceToken:async()=>({url:'wss://test.invalid',token:'test'}),converse:(...args)=>fixture.converse(...args)}};
const source=(await readFile('components/mind-travel/RealtimeVoice.tsx','utf8')).replace(/^import .*;\r?\n/gm,'');
const {RealtimeVoice}=await import(moduleUrl('const {React,Button,clientApi}=globalThis.__voiceTest;\n'+compile(source)));
globalThis.window={location:{search:''},setTimeout:(fn,ms)=>setTimeout(fn,ms===1800?30:ms),clearTimeout};
Object.defineProperty(globalThis,'navigator',{value:{mediaDevices:{getUserMedia:async()=>{const track={enabled:true,stop(){fixture.stopped=true}};return {getTracks:()=>[track],getAudioTracks:()=>[track]}}}},configurable:true});
globalThis.AudioContext=class{currentTime=0;audioWorklet={addModule:async()=>{}};resume=async()=>{};close=async()=>{};createMediaStreamSource=()=>({connect(){},disconnect(){}});createBuffer=(_,length)=>({duration:length/24000,getChannelData:()=>new Float32Array(length)});createBufferSource=()=>{const source={connect(){},start(){fixture.playback=source},stop(){source.onended?.()}};return source}};
globalThis.AudioWorkletNode=class{port={};connect(){}disconnect(){}};
globalThis.WebSocket=class{static OPEN=1;readyState=1;sent=[];constructor(){fixture.socket=this}send(raw){this.sent.push(JSON.parse(raw))}close(){this.readyState=3}};
const result={reply:'Draft ready.',changes:[{cardId:null,proposal:{text:'Hiked with my sister.',dims:['health'],reason:'Exercise.',emotion:null,confidence:.9,date:null}}]};
const speech=id=>({type:'input_audio_buffer.speech_started',item_id:id});
const user=(id,transcript)=>({type:'conversation.item.input_audio_transcription.completed',item_id:id,transcript});
const response=id=>({type:'response.created',response:{id}}),done=id=>({type:'response.done',response:{id}});
const tool=(call,id)=>({type:'response.function_call_arguments.done',call_id:call,response_id:id,name:'categorize_experiences'});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function setup(){fixture={calls:[],converse:async(context,intent,signal)=>{fixture.calls.push({context,intent,signal});return result}};const controller=new ConversationController();controller.message('user','Earlier typed message.');const view=RealtimeVoice({controller,world:{dims:[{id:'health',name:'Health',active:true}],memories:[]}});view.props.onClick();await tick();fixture.socket.onopen();return {controller,socket:fixture.socket,emit:event=>fixture.socket.onmessage({data:JSON.stringify(event)})}}
{
 const {controller,socket,emit}=await setup();assert.equal(socket.sent[0].session.audio.input.transcription,undefined);assert(socket.sent[0].session.instructions.includes('Earlier typed message.'));
 await emit(speech('a'));await emit(user('a','Last weekend'));for(let i=0;i<12;i++)await emit(user('a','Last weekend I hiked with my sister.'));await emit(response('r'));
 await emit(tool('c','r'));await emit(tool('c','r'));await emit(done('r'));await tick();
 assert.equal(fixture.calls.length,1);assert.equal(fixture.calls[0].context.history.at(-1).text,'Last weekend I hiked with my sister.');assert.equal(controller.getSnapshot().history.filter(e=>e.role==='user').length,2);assert.equal(controller.getSnapshot().cards.length,1);assert.equal(socket.sent.filter(e=>e.type==='response.create').length,1);
 const ev={type:'response.output_audio_transcript.done',item_id:'assistant',response_id:'r2',transcript:'Ready.'};await emit(ev);await emit(ev);assert.equal(controller.getSnapshot().history.filter(e=>e.role==='assistant').length,1);
 await controller.save([controller.getSnapshot().cards[0].id],async()=>{});assert(socket.sent.filter(e=>e.type==='session.update').at(-1).session.instructions.includes('Save succeeded'));controller.switchMode('text');assert(fixture.stopped);
}
{
 const {emit}=await setup();await emit(speech('a'));await emit(response('r'));const pending=emit(tool('c','r'));assert.equal(fixture.calls.length,0);await emit(user('a','I learned to cook.'));await pending;assert.equal(fixture.calls.length,1);
}
{
 const {emit,controller}=await setup();await emit(speech('a'));await emit(user('a','Hiking.'));await emit(response('r'));let finish;fixture.converse=()=>new Promise(resolve=>finish=resolve);const pending=emit(tool('c','r'));await tick();controller.switchMode('text');finish(result);await pending;assert.equal(controller.getSnapshot().cards.length,0);
}
{
 const {emit}=await setup();await emit(speech('a'));await emit(user('a','Old.'));await emit(response('r'));await emit(speech('b'));await emit(user('b','New.'));await emit(tool('c','r'));assert.equal(fixture.calls.length,0,'interrupted tool cannot classify a newer turn');
}
{
 const {emit,controller}=await setup();await emit(speech('a'));await emit(response('r'));await emit(tool('c','r'));assert.equal(fixture.calls.length,0);assert(!controller.getSnapshot().history.some(e=>e.status==='partial'));await emit(speech('b'));await emit(user('b','I ran.'));await emit(response('r2'));await emit(tool('c2','r2'));assert.equal(fixture.calls.length,1,'missing transcript does not poison following turns');
}
{
 const {emit,socket}=await setup();await emit(speech('a'));await emit(user('a','Hiking.'));await emit(response('r'));await emit({type:'response.output_audio.delta',response_id:'r',delta:'AAA='});await emit(tool('c','r'));await emit(done('r'));assert.equal(socket.sent.filter(e=>e.type==='response.create').length,0,'tool continuation waits for playback');fixture.playback.onended();await tick();assert.equal(socket.sent.filter(e=>e.type==='response.create').length,1);
}
console.log('Voice adapter passed: shared context, revised transcripts, duplicate events/tools, early tool calls, Save refresh, cancellation, interruption, timeout recovery and playback ordering.');
{
 const {emit,socket}=await setup();await emit(speech('a'));await emit(user('a','Hiking.'));await emit(response('r'));await emit({type:'response.output_audio.delta',response_id:'r',delta:'AAA='});await emit(tool('c','r'));await emit(done('r'));await emit(speech('b'));await tick();assert.equal(socket.sent.filter(e=>e.type==='response.create').length,0,'speech after response.done cancels queued tool continuation');await emit(tool('late-call','r'));assert.equal(fixture.calls.length,1,'late interrupted tool is ignored');
}
