import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {compile,moduleUrl,loader} from './test-loader.mjs';
const {ConversationController}=await loader()('lib/conversation.ts');
let fixture;
const FIND_EXPERIENCES_TOOL={type:'function',function:{name:'find_experiences',description:'Find saved experiences.',parameters:{type:'object',properties:{query:{type:'string'},limit:{type:'integer'}},required:['query'],additionalProperties:false}}};
const LOOKUP_INSTRUCTIONS='Retrieve saved experiences before claiming to remember them. Never draft duplicates from lookup results.';
const FindExperiencesArgsSchema={safeParse:value=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['query','limit'].includes(key)))return {success:false};const query=typeof value.query==='string'?value.query.trim():'';const limit=value.limit===undefined?5:value.limit;return query.length>=1&&query.length<=200&&Number.isInteger(limit)&&limit>=1&&limit<=10?{success:true,data:{query,limit}}:{success:false}}};
globalThis.__voiceTest={React:{useState:initial=>[typeof initial==='function'?initial():initial,()=>{}],useRef:current=>({current}),useCallback:fn=>fn,useEffect:()=>{},useSyncExternalStore:(_,get)=>get(),createElement:(type,props,...children)=>({type,props,children})},Button:'button',FIND_EXPERIENCES_TOOL,FindExperiencesArgsSchema,LOOKUP_INSTRUCTIONS,clientApi:{getVoiceToken:async()=>({url:'wss://test.invalid',token:'test'}),converse:(...args)=>fixture.converse(...args),findExperiences:(...args)=>fixture.findExperiences(...args)}};
const source=(await readFile('components/mind-travel/RealtimeVoice.tsx','utf8')).replace(/^import .*;\r?\n/gm,'');
const {RealtimeVoice}=await import(moduleUrl('const {React,Button,clientApi,FIND_EXPERIENCES_TOOL,FindExperiencesArgsSchema,LOOKUP_INSTRUCTIONS}=globalThis.__voiceTest;\n'+compile(source)));
globalThis.window={location:{search:''},setTimeout:(fn,ms)=>setTimeout(fn,ms===1800?30:ms),clearTimeout};
Object.defineProperty(globalThis,'navigator',{value:{mediaDevices:{getUserMedia:async()=>{const track={enabled:true,stop(){fixture.stopped=true}};return {getTracks:()=>[track],getAudioTracks:()=>[track]}}}},configurable:true});
globalThis.AudioContext=class{currentTime=0;audioWorklet={addModule:async()=>{}};resume=async()=>{};close=async()=>{};createMediaStreamSource=()=>({connect(){},disconnect(){}});createBuffer=(_,length)=>({duration:length/24000,getChannelData:()=>new Float32Array(length)});createBufferSource=()=>{const source={connect(){},start(){fixture.playback=source},stop(){source.onended?.()}};return source}};
globalThis.AudioWorkletNode=class{port={};connect(){}disconnect(){}};
globalThis.WebSocket=class{static OPEN=1;readyState=1;sent=[];constructor(){fixture.socket=this}send(raw){this.sent.push(JSON.parse(raw))}close(){this.readyState=3}};
const result={reply:'Draft ready.',changes:[{cardId:null,proposal:{text:'Hiked with my sister.',dims:['health'],reason:'Exercise.',emotion:null,confidence:.9,date:null}}]};
const lookupResult={query:'hike',results:[{id:'memory-1',text:'Hiked with my sister.',textTruncated:false,categories:[{id:'health',name:'Health'}],date:'2026-09-01',created:123}],hasMore:false};
const speech=id=>({type:'input_audio_buffer.speech_started',item_id:id});
const user=(id,transcript)=>({type:'conversation.item.input_audio_transcription.completed',item_id:id,transcript});
const response=id=>({type:'response.created',response:{id}}),done=id=>({type:'response.done',response:{id}});
const tool=(call,id,name='categorize_experiences',args='{}')=>({type:'response.function_call_arguments.done',call_id:call,response_id:id,name,arguments:args});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function setup(){fixture={calls:[],lookupCalls:[],converse:async(context,intent,signal)=>{fixture.calls.push({context,intent,signal});return result},findExperiences:async(query,limit,signal)=>{fixture.lookupCalls.push({query,limit,signal});return lookupResult}};const controller=new ConversationController();controller.message('user','Earlier typed message.');const view=RealtimeVoice({controller,world:{dims:[{id:'health',name:'Health',active:true}],memories:[]}});view.props.onClick();await tick();fixture.socket.onopen();return {controller,socket:fixture.socket,emit:event=>fixture.socket.onmessage({data:JSON.stringify(event)})}}
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
{
 const {emit,controller,socket}=await setup();await emit(speech('a'));await emit(user('a','Old thread hiking.'));await emit(response('r'));
 let finish;fixture.converse=()=>new Promise(resolve=>finish=resolve);const pending=emit(tool('c','r'));await tick();
 controller.openConversation();assert.equal(socket.readyState,3);assert(fixture.stopped);finish(result);await pending;
 await emit(user('late','Late old thread transcript'));await emit(tool('late','r'));await emit({type:'response.output_audio_transcript.done',item_id:'late-ai',response_id:'r',transcript:'Old reply'});
 assert.deepEqual(controller.context().history,[]);assert.deepEqual(controller.context().cards,[]);
 assert(controller.getSnapshot().archives[0].history.some(e=>e.text==='Old thread hiking.'));
 console.log('Voice thread isolation passed: old socket closed, microphone stopped, late transcript/tool/reply ignored.');
}
{
 const {emit,socket}=await setup();await emit(speech('a'));await emit(user('a','Hiking.'));await emit(response('r'));await emit({type:'response.output_audio.delta',response_id:'r',delta:'AAA='});await emit(tool('c','r'));await emit(done('r'));await emit(speech('b'));await tick();assert.equal(socket.sent.filter(e=>e.type==='response.create').length,0,'speech after response.done cancels queued tool continuation');await emit(tool('late-call','r'));assert.equal(fixture.calls.length,1,'late interrupted tool is ignored');
}
{
 const {controller,emit,socket}=await setup();
 assert.deepEqual(socket.sent[0].session.tools.at(-1),{type:'function',...FIND_EXPERIENCES_TOOL.function},'Grok receives the flattened shared lookup tool');
 await emit(speech('a'));await emit(user('a','Do you remember my hike?'));await emit(response('r'));
 await emit(tool('lookup','r','find_experiences',JSON.stringify({query:' hike ',limit:3})));await emit(tool('lookup','r','find_experiences',JSON.stringify({query:'ignored'})));await emit(done('r'));await tick();
 assert.equal(fixture.lookupCalls.length,1,'duplicate lookup call ids run once');assert.deepEqual(fixture.lookupCalls[0].query,'hike');assert.equal(fixture.lookupCalls[0].limit,3);assert.equal(controller.getSnapshot().cards.length,0,'recall never creates a draft');
 const output=JSON.parse(socket.sent.find(e=>e.item?.call_id==='lookup').item.output);assert.equal(output.status,'ready');assert.deepEqual(output.results,lookupResult.results,'saved records are returned faithfully');
 assert(controller.getSnapshot().history.some(e=>e.role==='event'&&e.text.includes('memory-1')),'lookup facts are retained in shared history');
}
{
 const {emit,socket}=await setup();await emit(response('r'));
 await emit(tool('bad-json','r','find_experiences','{'));await emit(tool('bad-query','r','find_experiences',JSON.stringify({query:' ',limit:99})));await emit(tool('null-args','r','find_experiences','null'));await emit(tool('extra-key','r','find_experiences',JSON.stringify({query:'hike',userId:'someone-else'})));
 assert.equal(fixture.lookupCalls.length,0);assert.equal(fixture.calls.length,0);
 const outputs=Object.fromEntries(socket.sent.filter(e=>e.item?.call_id).map(e=>[e.item.call_id,JSON.parse(e.item.output).status]));
 assert.deepEqual(outputs,{'bad-json':'invalid_arguments','bad-query':'invalid_arguments','null-args':'invalid_arguments','extra-key':'invalid_arguments'});
}
{
 const {emit,socket}=await setup();await emit(response('r'));await emit(tool('unknown','r','not_a_tool','{}'));assert.equal(JSON.parse(socket.sent.find(e=>e.item?.call_id==='unknown').item.output).status,'unsupported_tool');
}
{
 const {controller,emit,socket}=await setup();await emit(speech('a'));await emit(user('a','Find hiking memories.'));
 for(let i=1;i<=5;i++){await emit(response(`r${i}`));await emit(tool(`lookup-${i}`,`r${i}`,'find_experiences',JSON.stringify({query:'hike'})));await emit(done(`r${i}`))}
 assert.equal(fixture.lookupCalls.length,1,'equivalent lookup calls across continuation response ids reuse the completed turn result');
 assert.equal(socket.sent.filter(e=>e.item?.call_id&&/^lookup-[1-4]$/.test(e.item.call_id)).length,4,'every distinct provider call id is settled');
 const limited=JSON.parse(socket.sent.find(e=>e.item?.call_id==='lookup-5').item.output);assert.equal(limited.status,'tool_limit');
 assert.equal(controller.getSnapshot().history.filter(e=>e.role==='event'&&e.text.includes('memory-1')).length,1,'cache hits do not duplicate lookup history');
 await emit(speech('b'));await emit(user('b','Find hiking memories again.'));await emit(response('new-turn'));await emit(tool('lookup-new','new-turn','find_experiences',JSON.stringify({query:'hike'})));
 assert.equal(fixture.lookupCalls.length,2,'a new user input receives a fresh tool budget and cache namespace');
 assert.equal(controller.getSnapshot().history.filter(e=>e.role==='event'&&e.text.includes('memory-1')).length,2,'the fresh turn records its new lookup result');
}
{
 const {controller,emit,socket}=await setup();await emit(speech('a'));await emit(user('a','Find my hike.'));await emit(response('r'));
 let finishLookup;fixture.findExperiences=(query,limit,signal)=>{fixture.lookupCalls.push({query,limit,signal});return new Promise(resolve=>{finishLookup=resolve})};
 const pending=emit(tool('cancelled','r','find_experiences',JSON.stringify({query:'hike'})));await tick();assert.equal(controller.getSnapshot().pending,true);
 await emit(speech('b'));finishLookup(lookupResult);await pending;
 const cancelled=JSON.parse(socket.sent.find(e=>e.item?.call_id==='cancelled').item.output);assert.equal(cancelled.status,'cancelled','same-session cancellation settles without stale records');assert(!controller.getSnapshot().history.some(e=>e.text.includes('memory-1')));
}
{
 const {controller,emit,socket}=await setup();await emit(speech('a'));await emit(user('a','Find my hike.'));await emit(response('r'));
 let finishLookup;fixture.findExperiences=()=>new Promise(resolve=>{finishLookup=resolve});const pending=emit(tool('old-session','r','find_experiences',JSON.stringify({query:'hike'})));await tick();controller.switchMode('text');finishLookup(lookupResult);await pending;
 assert(!socket.sent.some(e=>e.item?.call_id==='old-session'),'a closed session receives no stale tool result');assert(!controller.getSnapshot().history.some(e=>e.text.includes('memory-1')));
}
{
 const {controller,emit,socket:oldSocket}=await setup();await emit(speech('a'));await emit(user('a','Find my hike in this conversation.'));await emit(response('old-r'));
 let finishLookup;fixture.findExperiences=(query,limit,signal)=>{fixture.lookupCalls.push({query,limit,signal});return new Promise(resolve=>{finishLookup=resolve})};
 const pending=emit(tool('old-thread-lookup','old-r','find_experiences',JSON.stringify({query:'hike'})));await tick();assert.equal(fixture.lookupCalls.length,1);
 controller.openConversation();assert.equal(oldSocket.readyState,3,'opening a conversation closes the old voice session');finishLookup(lookupResult);await pending;
 assert(!oldSocket.sent.some(e=>e.item?.call_id==='old-thread-lookup'),'the old session receives no completed lookup output');assert(!controller.getSnapshot().history.some(e=>e.text.includes('memory-1')),'the old lookup result cannot enter the new conversation');
 fixture.findExperiences=async(query,limit,signal)=>{fixture.lookupCalls.push({query,limit,signal});return lookupResult};
 const freshView=RealtimeVoice({controller,world:{dims:[{id:'health',name:'Health',active:true}],memories:[]}});freshView.props.onClick();await tick();const freshSocket=fixture.socket;freshSocket.onopen();
 const freshEmit=event=>freshSocket.onmessage({data:JSON.stringify(event)});await freshEmit(speech('fresh-a'));await freshEmit(user('fresh-a','Find my hike in this new conversation.'));await freshEmit(response('fresh-r'));await freshEmit(tool('fresh-thread-lookup','fresh-r','find_experiences',JSON.stringify({query:'hike'})));
 assert.equal(fixture.lookupCalls.length,2,'the same query is issued again in the fresh conversation');assert(freshSocket.sent.some(e=>e.item?.call_id==='fresh-thread-lookup'),'the fresh session settles its lookup');assert(controller.getSnapshot().history.some(e=>e.text.includes('memory-1')),'only the fresh lookup is recorded in the new conversation');
}
{
 const {controller,emit}=await setup();const draft=controller.begin();controller.apply(draft,result);controller.finish(draft);const card=controller.getSnapshot().cards[0];
 await emit(speech('a'));await emit(user('a','Find my hike.'));await emit(response('r'));let finishLookup;fixture.findExperiences=(query,limit,signal)=>{fixture.lookupCalls.push({query,limit,signal});return new Promise(resolve=>{finishLookup=resolve})};const pending=emit(tool('lookup-save','r','find_experiences',JSON.stringify({query:'hike'})));await tick();
 let finishSave;const saving=controller.save([card.id],()=>new Promise(resolve=>{finishSave=resolve}));assert.equal(controller.getSnapshot().pending,true);assert.deepEqual(controller.getSnapshot().saving,[card.id]);assert.equal(fixture.lookupCalls[0].signal.aborted,false,'Save does not cancel the lookup');finishSave();await saving;finishLookup(lookupResult);await pending;assert.equal(controller.getSnapshot().cards[0].status,'saved');
}
{
 const requests=[];globalThis.fetch=async(url,options)=>{requests.push({url,options});return Response.json(lookupResult)};const {clientApi:realClientApi}=await loader()('lib/client-api.ts');const abort=new AbortController();assert.deepEqual(await realClientApi.findExperiences('山%',2,abort.signal),lookupResult);assert.equal(requests[0].url,'/api/experiences/find');assert.equal(requests[0].options.signal,abort.signal);assert.deepEqual(JSON.parse(requests[0].options.body),{query:'山%',limit:2});assert.equal(requests[0].options.credentials,'same-origin');
}
{
 const {controller,emit,socket}=await setup();await emit(speech('error-turn'));await emit(user('error-turn','Find my hike.'));await emit(response('error-response'));
 fixture.findExperiences=async()=>{throw new Error('Lookup temporarily unavailable.')};
 await emit(tool('failed-lookup','error-response','find_experiences',JSON.stringify({query:'hike'})));
 assert.equal(controller.getSnapshot().pending,false);
 assert.equal(controller.getSnapshot().error,'Lookup temporarily unavailable.','tool settlement must preserve the visible error');
 assert.equal(JSON.parse(socket.sent.find(e=>e.item?.call_id==='failed-lookup').item.output).status,'failed');
}
console.log('Voice adapter passed: shared context, lookup dispatch/results, invalid and duplicate tools, bounded chains, Save independence, cancellation, interruption, timeout recovery, playback ordering and visible failures.');
