import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';

const source=await readFile(new URL('../lib/server/extraction-core.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const core=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const dims=[
 {id:'career',name:'Career',active:true},{id:'health',name:'Physical Health',active:true},
 {id:'relationships',name:'Relationships',active:true},{id:'entertainment',name:'Entertainment',active:true},
 {id:'travel',name:'Travel',active:true},{id:'creativity',name:'Creativity',active:true},{id:'growth',name:'Personal Growth',active:true},
];

const schema=core.responseJsonSchemaFor([...dims,{id:'inactive',name:'Inactive',active:false}]);
assert.deepEqual(schema.schema.properties.items.items.properties.dims.items.enum,dims.map(d=>d.id),'schema constrains output to active category IDs');

const prompt=core.buildExtractionSystem(dims,{recent:[{text:'I practiced watercolor.',dims:['creativity']}]});
assert.match(prompt,/Paid work, career development/);
assert.match(prompt,/I practiced watercolor/);
assert.match(prompt,/never default to the first category/i);

const normalized=core.normalizeExtractionCandidate({proposals:[{action:'Read a novel',dimension:'entertainment',reason:'reading',emotion:null}],question:null});
assert.deepEqual(normalized.items[0].dims,['entertainment']);
assert.equal(normalized.items[0].text,'Read a novel');

const cases=[
 ['I presented the quarterly plan to my manager.',['career']],
 ['I ran five kilometers before breakfast.',['health']],
 ['I had dinner and talked with my parents.',['relationships']],
 ['I watched a movie after work.',['entertainment']],
 ['My flight landed and I checked into the hotel.',['travel']],
 ['I finished a watercolor painting.',['creativity']],
 ['I learned a new programming framework in class.',['growth']],
 ['我今天完成了项目汇报。',['career']],
 ['晚上和父母一起吃饭聊天。',['relationships']],
 ['我和朋友一起爬山，然后聊了很多心事。',['health','relationships']],
];
for(const [text,expected] of cases){
 const result=core.localExtractionFallback(text,dims);
 const actual=[...new Set(result.items.flatMap(item=>item.dims))];
 for(const id of expected)assert.ok(actual.includes(id),`${JSON.stringify(text)} should include ${id}; got ${actual}`);
 if(text==='I watched a movie after work.')assert.deepEqual(actual,['entertainment'],'time context must not become a separate career category');
}
const ambiguous=core.localExtractionFallback('Something happened today.',dims);
assert.equal(ambiguous.items.length,0,'ambiguous text is not silently assigned to the first category');
assert.ok(ambiguous.question);

console.log('Extraction core checks passed: active-ID schema, category guide, response normalization, English/Chinese fallback, and ambiguity refusal.');
