import {readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import ts from 'typescript';
export const moduleUrl=source=>`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
export const compile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022,jsx:ts.JsxEmit.React}}).outputText;
export function loader(overrides={}){
 const cache=new Map();
 const load=async path=>{
  path=resolve(path);if(cache.has(path))return cache.get(path);
  let text=compile(await readFile(path,'utf8'));
  const imports=[...text.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)];
  for(const match of imports){const spec=match[1];let target=overrides[spec];
   if(!target){if(spec.startsWith('.')||spec.startsWith('@/'))target=await load(resolve(spec.startsWith('@/')?process.cwd():dirname(path),spec.startsWith('@/')?spec.slice(2):spec)+'.ts');else target=import.meta.resolve(spec)}
   text=text.replace(match[0],`from ${JSON.stringify(target)}`);
  }
  const url=moduleUrl(text);cache.set(path,url);return url;
 };
 return async path=>import(await load(path));
}
