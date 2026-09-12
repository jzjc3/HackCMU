import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

// Transpile these pure server modules in memory; no Workers bindings are needed.
const compile = source => ts.transpileModule(source, {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const url = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const typesUrl = url(compile(await readFile(new URL('../lib/server/world-types.ts',import.meta.url),'utf8')));
const validation = compile(await readFile(new URL('../lib/server/validation.ts',import.meta.url),'utf8')).replace('"./world-types"',JSON.stringify(typesUrl));
const {parseWorld,detectImageType}=await import(url(validation));
const {emptyWorld}=await import(typesUrl);
const world=emptyWorld();
world.memories=[{id:'test-1',title:'A walk',text:'I walked with my sister.',date:'2026-09-12',dims:['health','relationships'],emotion:null,importance:null,clarity:null,created:1}];
assert.equal(parseWorld(world,new Set()).memories.length,1);
assert.throws(()=>parseWorld({...world,memories:[{...world.memories[0],date:'2026-02-30'}]},new Set()),/date/);
assert.throws(()=>parseWorld({...world,memories:[{...world.memories[0],attachmentIds:['someone-elses-file']}]},new Set()),/unavailable attachment/);
assert.throws(()=>parseWorld({...world,memories:[{...world.memories[0],photo:'https://unowned.example/image.png'}]},new Set()),/owned attachment/);
assert.throws(()=>parseWorld({...world,memories:[world.memories[0],world.memories[0]]},new Set()),/unique/);
assert.throws(()=>parseWorld({...world,memories:[{...world.memories[0],dims:['unknown']}]},new Set()),/dims/);
assert.throws(()=>parseWorld({...world,memories:[{...world.memories[0],importance:6}]},new Set()),/ratings/);
assert.equal(parseWorld({...world,memories:[{...world.memories[0],attachmentIds:['owned']}]},new Set(['owned'])).memories[0].photo,'/api/attachments/owned');
assert.equal(detectImageType(new TextEncoder().encode('<svg onload="alert(1)">')),null);
console.log('9 validation checks passed: dates, ownership, IDs, dimensions, ratings and image type.');
