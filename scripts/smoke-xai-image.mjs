import fs from 'node:fs/promises';
import path from 'node:path';
import OpenAI from 'openai';

const envText=await fs.readFile(path.resolve('..','.env'),'utf8');
const line=envText.split(/\r?\n/).find(row=>/^\s*XAI_API_KEY\s*=/.test(row));
if(!line)throw new Error('XAI_API_KEY missing');
const apiKey=line.slice(line.indexOf('=')+1).trim().replace(/^['"]|['"]$/g,'');
const client=new OpenAI({apiKey,baseURL:'https://api.x.ai/v1'});
const result=await client.images.generate({model:'grok-imagine-image-2.0',prompt:'A quiet, minimal editorial illustration of one blue contour rising from a monochrome world map, white background, no words.',response_format:'b64_json'},{timeout:60000,maxRetries:0});
const item=result.data?.[0];
if(!item)throw new Error('No generated image');
let bytes;
if(item.b64_json)bytes=Buffer.from(item.b64_json,'base64');
else if(item.url){const response=await fetch(item.url,{signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error(`Image download HTTP ${response.status}`);bytes=Buffer.from(await response.arrayBuffer())}
else throw new Error('No image bytes or URL');
await fs.writeFile(path.resolve('eval','xai-image-smoke.png'),bytes);
console.log(`xAI image: success — ${bytes.length} bytes persisted for visual inspection`);
