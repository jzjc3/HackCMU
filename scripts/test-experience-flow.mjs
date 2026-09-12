import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';

const source=await readFile(new URL('../components/mind-travel/experience-flow.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const flow=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const world={setupDone:true,dims:[
 {id:'career',name:'Career',region:'Asia',color:'#000000',active:true},
 {id:'health',name:'Health',region:'South America',color:'#000000',active:true},
 {id:'relationships',name:'Relationships',region:'Europe',color:'#000000',active:true},
],memories:[],overrides:{},lastOpened:null,revision:1};
const proposals=[
 {text:' Presented the plan. ',dims:['career'],reason:'work',emotion:'Proud',confidence:.9},
 {text:'Hiked with my partner.',dims:['health','relationships','health'],reason:'shared hike',emotion:null,confidence:.9},
];
const drafts=flow.draftsFromProposals(proposals,'2026-09-12');
assert.deepEqual(drafts.map(d=>d.dims),[['career'],['health','relationships']]);
const records=drafts.map((draft,index)=>({...draft,id:`memory-${index}`,created:index+1}));
const saved=flow.appendUniqueMemories(world,records);
assert.equal(saved.memories.length,2);
assert.equal(flow.appendUniqueMemories(saved,records).memories.length,2,'retry cannot duplicate saved memories');
assert.deepEqual(flow.regionsForDimensions(saved,['health','relationships']),['South America','Europe']);
assert.equal(saved.memories.filter(memory=>memory.dims.includes('career')).length,1,'career memory reaches its map category');
assert.equal(saved.memories.filter(memory=>memory.dims.includes('health')).length,1,'multi-category memory reaches health');
assert.equal(saved.memories.filter(memory=>memory.dims.includes('relationships')).length,1,'multi-category memory reaches relationships');
const cleared=flow.clearMapMemories(saved);
assert.equal(cleared.memories.length,0,'clear map removes every saved experience');
assert.deepEqual(cleared.dims,saved.dims,'clear map preserves dimensions and their configuration');
assert.equal(cleared.setupDone,true,'clear map preserves onboarding state');
assert.deepEqual(cleared.overrides,saved.overrides,'clear map preserves appearance overrides');
assert.equal(saved.memories.length,2,'clear map does not mutate the prior world value');
console.log('Experience flow checks passed: proposal review, category preservation, idempotent save, map-region routing, and clear-map preservation.');
