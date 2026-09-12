import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {compile,moduleUrl} from './test-loader.mjs';
let slots=[],cursor=0,cleanups=[],api={},busy=[],changes=[],finish;
const React={useState:initial=>{const i=cursor++;slots[i]??={value:typeof initial==='function'?initial():initial};return [slots[i].value,value=>slots[i].value=typeof value==='function'?value(slots[i].value):value]},useRef:value=>{const i=cursor++;return slots[i]??=( {current:value})},useEffect:(fn,deps)=>{const i=cursor++;if(!slots[i]||deps.some((d,j)=>d!==slots[i][j])){slots[i]=deps;const cleanup=fn();if(cleanup)cleanups.push(cleanup)}},createElement:(type,props,...children)=>({type,props,children})};
globalThis.__mediaTest={React,Button:'button',clientApi:new Proxy({},{get:(_,key)=>api[key]})};
React.useLayoutEffect=React.useEffect;
const source=(await readFile('components/mind-travel/Media.tsx','utf8')).replace(/^import .*;\r?\n/gm,'');
const {AttachmentEditor}=await import(moduleUrl('const {React,Button,clientApi}=globalThis.__mediaTest;\n'+compile(source)));
const nodes=view=>!view||typeof view!=='object'?[]:[view,...(view.children??[]).flat(Infinity).flatMap(nodes)];
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function setup(){slots=[];cursor=0;cleanups=[];busy=[];changes=[];api={uploadAttachment:()=>new Promise(resolve=>finish=resolve),getAttachment:async()=>({attachment:{kind:'upload'}}),deleteAttachment:async()=>{}}}
function render(value=[]){cursor=0;return AttachmentEditor({value,onChange:ids=>changes.push(ids),description:'Lunch',onBusyChange:value=>busy.push(value)})}
const choose=view=>nodes(view).find(n=>n.type==='input').props.onChange({target:{files:[new File(['data'],'test.png',{type:'image/png'})]},currentTarget:{value:'test.png'}});
setup();let view=render();choose(view);choose(view);assert.deepEqual(busy,[true],'double selection starts one upload');assert(nodes(render()).find(n=>n.type==='button'&&n.children.includes('Upload photo')).props.disabled);render(['existing']);finish({attachment:{id:'new',kind:'upload'}});await tick();assert.deepEqual(changes,[['existing','new']],'completion uses latest draft attachments');assert.deepEqual(busy,[true,false]);
setup();view=render();choose(view);let removed;api.deleteAttachment=async id=>removed=id;cleanups.forEach(fn=>fn());finish({attachment:{id:'abandoned',kind:'upload'}});await tick();assert.equal(changes.length,0);assert.equal(removed,'abandoned','closing while uploading cleans abandoned image');
setup();api.uploadAttachment=async()=>{throw new Error('Upload failed')};view=render();choose(view);await tick();assert(nodes(render()).some(n=>n.props?.role==='alert'&&n.children.includes('Upload failed')));assert.deepEqual(busy,[true,false]);assert.equal(changes.length,0);
setup();view=render(Array.from({length:10},(_,i)=>String(i)));choose(view);assert.equal(busy.length,0,'ten image limit enforced in handler');
// Execute the actual Composer Save callback, including the synchronous pending guard.
globalThis.localStorage={getItem:()=>null,setItem(){},removeItem(){}};
globalThis.__composerTest={React,AttachmentEditor,Button:'button',Chip:'chip',MonoLabel:'label',STORE:{today:()=> '2026-09-12',EMOTIONS:[]},classify:async()=>({items:[]})};
let composer=(await readFile('components/mind-travel/Panels.tsx','utf8')).replace(/^import .*;\r?\n/gm,'');
const {Composer}=await import(moduleUrl('const {React,AttachmentEditor,Button,Chip,MonoLabel,STORE,classify}=globalThis.__composerTest;\n'+compile(composer)));
setup();let saves=0;const props={world:{dims:[{id:'health',active:true,name:'Health'}]},initial:{text:'Lunch',date:'2026-09-12',dims:['health']},onCancel(){},onSave:async()=>saves++,onRetry:async()=>saves++,saveState:null,draftKey:'test'};
cursor=0;view=Composer(props);const image=nodes(view).find(n=>n.type===AttachmentEditor);const save=nodes(view.props.footer).find(n=>n.type==='button'&&n.children.includes('Save'));image.props.onBusyChange(true);save.props.onClick();await tick();assert.equal(saves,0,'same-tick Save cannot outrun upload');cursor=0;view=Composer(props);assert(nodes(view.props.footer).some(n=>n.type==='button'&&n.children.includes('Preparing image…')&&n.props.disabled));image.props.onBusyChange(false);save.props.onClick();await tick();assert.equal(saves,1);
console.log('Media UI passed: pending Save guard, busy button, duplicate selections, latest draft merge, unmount cleanup, visible errors and ten-image limit.');
