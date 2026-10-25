import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
test('UI can submit Siray image generation without OpenAI connected',async()=>{
 const html=await readFile(new URL('../Avatar Studio.html',import.meta.url),'utf8');
 const elements=new Map();
 function element(){return {value:'',children:[],dataset:{},disabled:false,hidden:false,append(...items){this.children.push(...items)},replaceChildren(){this.children=[]},removeAttribute(k){delete this[k]},addEventListener(){},focus(){},click(){},select(){},querySelectorAll(){return []},classList:{add(){},remove(){}}};}
 for(const [,id] of html.matchAll(/\bid="([^"]+)"/g))elements.set(id,element());
 const get=id=>{assert.ok(elements.has(id),'DOM element exists: '+id);return elements.get(id)};
 get('provider').value='siray';
 const store=new Map();let requestBody;
 const context=vm.createContext({console,Blob,URL,crypto:{randomUUID:()=> '12345678-1234-1234-1234-123456789abc'},confirm:()=>true,setTimeout:(f)=>{queueMicrotask(f)},Image:class{decode(){return Promise.resolve()}},location:{protocol:'http:'},sessionStorage:{setItem:(k,v)=>store.set(k,v),getItem:k=>store.get(k),removeItem:k=>store.delete(k)},window:{addEventListener(){}},document:{getElementById:get,createElement:element,createTextNode:s=>s,querySelector:element,querySelectorAll:()=>[]},fetch:async(route,opts)=>({ok:true,json:async()=>{
  if(route==='/health')return {multiIdentityImageEdits:true};
  if(route==='/api/status')return {connected:false,sirayConnected:false};
  if(route==='/api/connect-siray')return {sirayConnected:true};
  if(route==='/api/jobs'){requestBody=JSON.parse(opts.body);return {id:'test-job'}};
  return {status:'done',stage:'Ready',prompt:'Analyzed identity and reference',image:'data:image/png;base64,aGVsbG8=',createdAt:'2026-10-04T00:00:00Z'};
 }})});
 vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],context);
 await vm.runInContext('ready',context);await new Promise(r=>setImmediate(r));
 assert.equal(get('saveImage').disabled,true);
 get('sirayKey').value='siray-local-ui-test';await vm.runInContext('connectSiray()',context);assert.equal(get('sirayKey').value,'');
 get('size').value='auto';get('quality').value='medium';get('analysisMode').value='standard';
 vm.runInContext("state.identity={name:'a.png',data:'identity'};state.reference={name:'b.png',data:'direction'};state.identityExtras=[{name:'side.png',data:'extra'}]",context);
 await vm.runInContext("submitJob('create')",context);
 assert.equal(requestBody.identity.data,'identity');assert.equal(requestBody.reference.data,'direction');assert.equal(requestBody.action,'create');assert.equal(requestBody.provider,'siray');
 assert.equal(requestBody.identityExtras[0].data,'extra');
 assert.equal(get('prompt').value,'Analyzed identity and reference');assert.equal(get('resultImage').hidden,false);assert.match(get('resultImage').src,/^data:image\/png/);assert.equal(get('saveImage').disabled,false);assert.equal(store.size,0);
 vm.runInContext('invalidatePrompt()',context);assert.equal(get('prompt').value,'');
});
