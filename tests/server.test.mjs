import test from 'node:test';
import assert from 'node:assert/strict';
import {createStudio,decodeImage,analysisPayload,validateInput,sirayPayload,editPayload} from '../server.mjs';
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=';
const image={name:'test.png',data:'data:image/png;base64,'+png};
const body={identity:image,reference:image,name:'Avatar',traits:'Blue eyes',notes:'Natural light',mode:'recreate',checks:['Pose & head angle'],size:'auto',quality:'medium',action:'create',provider:'openai'};

test('Standard image analysis is Luna and Astra requires Advanced selection',()=>{
 assert.equal(analysisPayload(body).model,'gpt-6-luna');
 assert.equal(analysisPayload({...body,analysisMode:'advanced'}).model,'gpt-6-astra');
 assert.equal(analysisPayload(body).max_output_tokens,1800);
});

test('image generation keeps Image 2 as direction and adds same-avatar views afterward',()=>{
 const request={...body,identityExtras:[image,image],prompt:'Keep Image 1 identity and Image 2 pose.'};
 assert.doesNotThrow(()=>validateInput(request));
 const siray=sirayPayload(request,request.prompt);
 assert.deepEqual(siray.images,[image.data,image.data,image.data,image.data]);
 assert.match(siray.prompt,/Image 2 gives pose/);
 assert.match(siray.prompt,/Images 3–4 are additional views of the same person/);
 const form=editPayload(request);
 assert.equal(form.getAll('image[]').length,4);
 assert.match(form.get('prompt'),/Image 2 gives pose/);
 assert.equal(analysisPayload(request).input[0].content.filter(item=>item.type==='input_image').length,4);
 assert.throws(()=>validateInput({...request,identityExtras:Array(9).fill(image)}),/no more than eight/);
 assert.throws(()=>validateInput({...request,identityExtras:[{name:'bad.png',data:'data:image/png;base64,aGVsbG8='}]}),/invalid file contents/);
});

test('local reads and prompt-only jobs never generate images, and a repeated request ID reuses its job',async()=>{
 const calls=[];const server=createStudio({initialKey:'test-key',fetcher:async(url,options)=>{calls.push({url,options});return Response.json({status:'completed',output:[{content:[{type:'output_text',text:'Prompt only.'}]}]})}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 try{const html=await(await fetch(base)).text();const token=html.match(/const studioToken='([^']+)'/)[1];const headers={'X-Studio-Token':token,'Content-Type':'application/json'};
  await fetch(base+'/api/status',{headers});await fetch(base+'/api/jobs',{headers});assert.equal(calls.length,0);
  const request={...body,action:'analyze',requestId:'12345678-1234-1234-1234-123456789abc'};
  const submit=()=>fetch(base+'/api/jobs',{method:'POST',headers,body:JSON.stringify(request)});
  const first=await(await submit()).json();const again=await(await submit()).json();assert.equal(again.id,first.id);assert.equal(again.reused,true);
  for(let i=0;i<30;i++){const job=await(await fetch(base+'/api/jobs/'+first.id,{headers})).json();if(job.status==='done')break;await new Promise(r=>setTimeout(r,10))}
  assert.equal(calls.length,1);assert.match(calls[0].url,/\/responses$/);assert.equal(JSON.parse(calls[0].options.body).model,'gpt-6-luna');
 }finally{await new Promise(resolve=>server.close(resolve))}
});

test('image URL import is available for either reference without provider keys',async()=>{
 const server=createStudio({imageImporter:async url=>({data:image.data,name:url.split('/').pop()})});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 try{const html=await(await fetch(base)).text();const token=html.match(/const studioToken='([^']+)'/)[1];const response=await fetch(base+'/api/import-image',{method:'POST',headers:{'X-Studio-Token':token,'Content-Type':'application/json'},body:JSON.stringify({url:'https://example.com/photo.png'})});assert.equal(response.status,200);assert.deepEqual(await response.json(),{data:image.data,name:'photo.png'});}
 finally{await new Promise(resolve=>server.close(resolve))}
});
test('three image jobs may run together and the fourth waits for capacity',async()=>{
 let release;const gate=new Promise(resolve=>{release=resolve});
 const server=createStudio({initialKey:'test-key',fetcher:async()=>{await gate;return Response.json({output:[{content:[{type:'output_text',text:'Keep identity and pose.'}]}]})}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 try{const html=await(await fetch(base)).text();const token=html.match(/const studioToken='([^']+)'/)[1];const headers={'X-Studio-Token':token,'Content-Type':'application/json'};
  const submit=()=>fetch(base+'/api/jobs',{method:'POST',headers,body:JSON.stringify({...body,action:'analyze'})});
  const responses=await Promise.all([submit(),submit(),submit()]);assert.ok(responses.every(response=>response.status===202));
  assert.equal((await submit()).status,409);
  const jobs=await(await fetch(base+'/api/jobs',{headers})).json();assert.equal(jobs.length,3);assert.ok(jobs.every(job=>job.status==='running'));
  release();
  for(let i=0;i<30;i++){const current=await(await fetch(base+'/api/jobs',{headers})).json();if(current.every(job=>job.status==='done'))break;await new Promise(r=>setTimeout(r,10))}
  assert.equal((await submit()).status,202);
 }finally{release();await new Promise(resolve=>server.close(resolve))}
});
test('local API validates access and runs analysis followed by image editing',async()=>{
 const calls=[];
 const server=createStudio({initialKey:'',fetcher:async(url,options)=>{if(url.endsWith('/models'))return Response.json({data:[]});calls.push({url,options});return Response.json(url.endsWith('/responses')?{status:'completed',output:[{type:'message',content:[{type:'output_text',text:'Image 1 supplies identity. Recreate the pose from Image 2.'}]}]}:{data:[{b64_json:png}]});}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 try{
  const html=await (await fetch(base)).text();assert.match(html,/Create prompt \+ image/);
  const token=html.match(/const studioToken='([^']+)'/)[1];assert.notEqual(token,'__STUDIO_TOKEN__');
  const headers={'Content-Type':'application/json','X-Studio-Token':token,Origin:base};
  const post=(route,data,custom=headers)=>fetch(base+'/api/'+route,{method:'POST',headers:custom,body:JSON.stringify(data)});
  assert.equal((await post('jobs',body)).status,401);
  assert.equal((await post('connect',{key:'fixture-key-1234567890'},{...headers,Origin:'https://untrusted.example'})).status,403);
  assert.equal((await post('connect',{key:'fixture-key-1234567890'})).status,200);
  assert.equal((await post('jobs',{...body,reference:{data:'https://untrusted.example/image'}})).status,400);
  assert.equal((await post('jobs',{...body,quality:'nonsense'})).status,400);
  const wait=async(id)=>{for(let n=0;n<30;n++){const j=await(await fetch(base+'/api/jobs/'+id,{headers})).json();if(j.status!=='running')return j;await new Promise(r=>setTimeout(r,10));}throw Error('Job did not finish')};
  const job=await(await post('jobs',body)).json();const result=await wait(job.id);
  assert.equal(result.status,'done');assert.equal(result.image,image.data);assert.match(result.prompt,/identity/);assert.equal(calls.length,2);
  const analysis=JSON.parse(calls[0].options.body);assert.equal(analysis.store,false);assert.equal(analysis.input[0].content.filter(c=>c.type==='input_image').length,2);
  const form=calls[1].options.body;assert.equal(form.get('model'),'gpt-image-2.5-sunburst');assert.equal(form.get('prompt'),result.prompt);assert.equal(form.getAll('image[]').length,2);assert.equal(form.getAll('image[]')[0].name,'image-1.png');assert.equal(form.getAll('image[]')[1].name,'image-2.png');
  const edited=await(await post('jobs',{...body,action:'render',prompt:'Use this edited prompt exactly.'})).json();assert.equal((await wait(edited.id)).status,'done');assert.equal(calls.length,3);assert.equal(calls[2].options.body.get('prompt'),'Use this edited prompt exactly.');
  const promptOnly=await(await post('jobs',{...body,action:'analyze'})).json();assert.equal((await wait(promptOnly.id)).image,undefined);assert.equal(calls.length,4);
  assert.equal((await fetch(base+'/server.mjs')).status,404);
  await post('disconnect',{});const status=await(await fetch(base+'/api/status',{headers})).json();assert.equal(status.connected,false);assert.ok(!JSON.stringify(status).includes('sk-test'));
 }finally{await new Promise(resolve=>server.close(resolve));}
});
test('provider errors preserve prompt and do not retry paid image calls',async()=>{
 let count=0;const server=createStudio({initialKey:'sk-test-key',initialSirayKey:'siray-test',fetcher:async()=>{count++;return count===1?Response.json({output:[{content:[{type:'output_text',text:'Keep this useful prompt'}]}]}):Response.json({error:{message:'quota'}},{status:429});}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 try{const html=await(await fetch(base)).text();const token=html.match(/const studioToken='([^']+)'/)[1];const headers={'X-Studio-Token':token,'Content-Type':'application/json'};const {id}=await(await fetch(base+'/api/jobs',{method:'POST',headers,body:JSON.stringify(body)})).json();let j;for(let i=0;i<30;i++){j=await(await fetch(base+'/api/jobs/'+id,{headers})).json();if(j.status!=='running')break;await new Promise(r=>setTimeout(r,10));}assert.equal(j.status,'error');assert.equal(j.prompt,'Keep this useful prompt');assert.match(j.error,/billing/);assert.equal(count,2);}finally{await new Promise(r=>server.close(r));}
});
test('rejects fake image payloads',()=>{assert.throws(()=>decodeImage({data:'data:image/png;base64,aGVsbG8='}));});
test('safety rejection falls back to Siray 5.0 Pro Spicy i2i with both images',async()=>{
 const calls=[];
 const server=createStudio({initialKey:'openai-test',initialSirayKey:'siray-test',fetcher:async(url,options)=>{
  calls.push({url,options});
  if(url.endsWith('/responses'))return Response.json({status:'completed',output:[{content:[{type:'output_text',text:'Use Image 1 identity and Image 2 pose.'}]}]});
  if(url.endsWith('/images/edits'))return Response.json({error:{message:'Your request was rejected by the safety system. safety_violations=[sexual].'}},{status:400});
  if(url==='https://api.siray.ai/v1/images/generations/async')return Response.json({code:'200',message:'success',data:{task_id:'task-123'}});
  if(url.endsWith('/task-123'))return Response.json({code:0,message:'success',data:{status:'SUCCESS',progress:'100%',outputs:['https://api.siray.ai/redirect/output']}});
  if(url==='https://api.siray.ai/redirect/output')return new Response(Buffer.from(png,'base64'),{headers:{'Content-Type':'image/png'}});
  throw Error('Unexpected URL: '+url);
 }});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 try{
  const html=await(await fetch(base)).text();const token=html.match(/const studioToken='([^']+)'/)[1];const headers={'X-Studio-Token':token,'Content-Type':'application/json'};
  const {id}=await(await fetch(base+'/api/jobs',{method:'POST',headers,body:JSON.stringify(body)})).json();
  let job;for(let count=0;count<70;count++){job=await(await fetch(base+'/api/jobs/'+id,{headers})).json();if(job.status!=='running')break;await new Promise(resolve=>setTimeout(resolve,100));}
  assert.equal(job.status,'done');assert.equal(job.provider,'Siray');assert.equal(job.usedFallback,true);assert.equal(job.model,'bytedance/seedream-5.0-pro-i2i-spicy');assert.equal(job.image,image.data);
  const submission=calls.find(c=>c.url==='https://api.siray.ai/v1/images/generations/async');const sent=JSON.parse(submission.options.body);
  assert.equal(sent.model,'bytedance/seedream-5.0-pro-i2i-spicy');assert.deepEqual(sent.images,[image.data,image.data]);assert.equal(sent.prompt,job.prompt);assert.equal(sent.size,'1776x2368');assert.equal(sent.output_format,'png');
  assert.equal(calls.length,5);
 }finally{await new Promise(resolve=>server.close(resolve));}
});

test('Siray-only image generation works without an OpenAI key or request',async()=>{
 const calls=[];
 const server=createStudio({initialKey:'',initialSirayKey:'siray-test',fetcher:async(url,options)=>{
  calls.push({url,options});
  if(url==='https://api.siray.ai/v1/images/generations/async')return Response.json({code:200,data:{task_id:'direct-task'}});
  if(url.endsWith('/direct-task'))return Response.json({code:200,data:{status:'SUCCESS',outputs:['https://cdn.example.test/avatar.png']}});
  if(url==='https://cdn.example.test/avatar.png')return new Response(Buffer.from(png,'base64'),{headers:{'Content-Type':'image/png'}});
  throw Error('Unexpected URL: '+url);
 }});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 try{
  const html=await(await fetch(base)).text();const token=html.match(/const studioToken='([^']+)'/)[1];const headers={'X-Studio-Token':token,'Content-Type':'application/json'};
  const post=data=>fetch(base+'/api/jobs',{method:'POST',headers,body:JSON.stringify(data)});
  const sirayBody={...body,provider:'siray'};
  const analysis=await(await post({...sirayBody,action:'analyze'})).json();const basic=await(await fetch(base+'/api/jobs/'+analysis.id,{headers})).json();
  assert.equal(basic.status,'done');assert.match(basic.prompt,/Image 1 is the sole identity reference/);assert.equal(calls.length,0);
  const response=await post(sirayBody);assert.equal(response.status,202);const {id}=await response.json();let job;
  for(let i=0;i<70;i++){job=await(await fetch(base+'/api/jobs/'+id,{headers})).json();if(job.status!=='running')break;await new Promise(resolve=>setTimeout(resolve,100))}
  assert.equal(job.status,'done');assert.equal(job.provider,'Siray');assert.equal(job.usedFallback,undefined);assert.equal(job.image,image.data);
  assert.equal(calls.filter(call=>call.url.includes('api.openai.com')).length,0);
  const payload=JSON.parse(calls[0].options.body);assert.deepEqual(payload.images,[image.data,image.data]);assert.equal(payload.prompt,basic.prompt);
 }finally{await new Promise(resolve=>server.close(resolve))}
});
