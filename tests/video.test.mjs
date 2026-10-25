import test from 'node:test';
import assert from 'node:assert/strict';
import {createStudio} from '../server.mjs';
import {wanVideoPayload,sirayVideoPayload,validateVideoJob,finalVideoPrompt,SIRAY_VIDEO_MODELS,createVideoController,fitWanReference} from '../video.mjs';
import {importSocialVideo,validateVideoLink} from '../social-video.mjs';
import {writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFile,spawnSync} from 'node:child_process';
import {promisify} from 'node:util';

const execFileAsync=promisify(execFile);
const videoToolsAvailable=['ffmpeg','ffprobe'].every(command=>spawnSync(command,['-version'],{windowsHide:true}).status===0);

test('Wan trims a 29.8-second local reference to the selected segment before upload',{skip:!videoToolsAvailable},async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'wan-reference-test-'));
 try{
  const source=path.join(dir,'reference.mp4');
  await execFileAsync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=blue:s=64x64:r=4:d=29.8','-c:v','libx264','-pix_fmt','yuv420p',source],{timeout:30000,windowsHide:true});
  const result=await fitWanReference(source,12);
  assert.equal(result.trimmed,true);
  assert.notEqual(result.file,source);
  assert.ok(result.duration>14&&result.duration<=15,`trimmed duration ${result.duration}`);
  const original=await fitWanReference(result.file);
  assert.equal(original.trimmed,false);
 }finally{await rm(dir,{recursive:true,force:true})}
});

const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=';
const avatar='data:image/png;base64,'+png;
const mp4=Buffer.from([0,0,0,16,102,116,121,112,105,115,111,109,0,0,0,0]);
const videoData='data:video/mp4;base64,'+mp4.toString('base64');
const videoUrl='https://cdn.example.test/dance.mp4';
const render={action:'render',avatar,videoData,videoUrl,prompt:'Keep avatar identity and follow the turns and arm movements.',provider:'wan',duration:5,resolution:'720p',aspectRatio:'9:16'};

test('two video jobs may run together and both remain in the job list',async()=>{
 let release;const gate=new Promise(resolve=>{release=resolve});
 const controller=createVideoController({getKeys:()=>({siray:'test-key'}),uploadVideo:async()=>{await gate;return videoUrl},fetcher:async(url)=>{
  if(url==='https://api.siray.ai/v1/video/generations')return Response.json({code:'success',data:{task_id:'task'}});
  if(url.endsWith('/task'))return Response.json({code:'success',data:{status:'SUCCESS',outputs:[videoUrl]}});
  if(url===videoUrl)return new Response(mp4);
  throw Error('Unexpected URL '+url);
 },pollDelay:0});
 try{const request={...render,provider:'wan',videoUrl:''};const a=controller.create(request),b=controller.create(request);
  assert.equal(controller.list().length,2);assert.equal(controller.list()[0].status,'running');
  assert.throws(()=>controller.create(request),/Two video jobs/);
  release();for(let i=0;i<50;i++){if(controller.list().every(job=>job.status==='done'))break;await new Promise(r=>setTimeout(r,10))}
  assert.equal(controller.get(a.id).status,'done');assert.equal(controller.get(b.id).status,'done');
  assert.equal(controller.list().length,2);
 }finally{release()}
});

test('video payloads preserve avatar, motion reference, and settings',()=>{
 const wan=wanVideoPayload(render,render.prompt);
 assert.equal(wan.model,'alibaba/wan-3.0-ref2v-spicy');assert.deepEqual(wan.images,[avatar]);assert.deepEqual(wan.videos,[videoData]);assert.equal(wan.duration,5);assert.equal(wan.aspect_ratio,'9:16');
 assert.equal('prompt_expansion_enable' in wan,false);
 assert.throws(()=>validateVideoJob({...render,videoData:null,videoUrl:'https://x.com/example/status/123'}),/social post page/);
});

test('Wan sends ordered same-person identity views with a clear primary reference',()=>{
 const request={...render,identityReferences:[avatar,avatar]};
 assert.doesNotThrow(()=>validateVideoJob(request));
 assert.deepEqual(sirayVideoPayload(request,finalVideoPrompt(request)).images,[avatar,avatar,avatar]);
 assert.match(finalVideoPrompt(request),/Image 1 is the primary avatar identity/);
 assert.match(finalVideoPrompt(request),/Images 2–3 are additional views of that same person/);
 assert.match(finalVideoPrompt(request),/video supplies motion/);
 assert.doesNotThrow(()=>validateVideoJob({...request,provider:'wan-prime'}));
 assert.throws(()=>validateVideoJob({...request,provider:'seedance-2.5'}),/currently available with Wan/);
 assert.throws(()=>validateVideoJob({...request,identityReferences:Array(10).fill(avatar)}),/no more than nine/);
 assert.throws(()=>validateVideoJob({...request,identityReferences:['data:image/jpeg;base64,AAAA']}),/contents are invalid/);
});

test('Siray model choices submit the right references and reject incompatible settings',()=>{
 const cases=[
  ['wan-prime','alibaba/wan-3.0-ref2v-prime-spicy','720p',20],
  ['minimax-h3','minimax/minimax-h3-ref2v-spicy','768p',12],
  ['seedance-2.0','bytedance/seedance-2.0-ref2v-spicy','4k',15],
  ['seedance-2.5','bytedance/seedance-2.5-ref2v-spicy','1080p',25]
 ];
 for(const [provider,id,resolution,duration] of cases){
  const request={...render,provider,resolution,duration,videoUrl:''};
  assert.doesNotThrow(()=>validateVideoJob(request));
  const payload=sirayVideoPayload(request,'Reviewed motion prompt');
  assert.equal(payload.model,id);assert.equal(payload.prompt,'Reviewed motion prompt');
  assert.deepEqual(payload.images,[avatar]);assert.deepEqual(payload.videos,[videoData]);
  assert.equal(payload.duration,duration);assert.equal(payload.size,resolution);
  assert.equal(SIRAY_VIDEO_MODELS[provider].id,id);
 }
 assert.equal(sirayVideoPayload({...render,provider:'wan-prime'},render.prompt).prompt_expansion_enable,false);
 assert.equal('audio_enable' in sirayVideoPayload({...render,provider:'minimax-h3',resolution:'768p'},render.prompt),false);
 assert.throws(()=>validateVideoJob({...render,provider:'minimax-h3',duration:20,resolution:'768p'}),/5–15 seconds/);
 assert.throws(()=>validateVideoJob({...render,provider:'seedance-2.0',duration:20}),/4–15 seconds/);
 assert.throws(()=>validateVideoJob({...render,provider:'minimax-h3'}),/resolution/);
 assert.throws(()=>validateVideoJob({...render,provider:'__proto__'}),/supported video model/);
});

test('a selected Siray model is submitted and reported instead of the Wan default',async()=>{
 const requests=[];
 const fetcher=async(url,options={})=>{
  if(url==='https://api.siray.ai/v1/video/generations'){
   requests.push(JSON.parse(options.body));return Response.json({code:'success',data:{task_id:'seedance-task'}});
  }
  if(url.endsWith('/seedance-task'))return Response.json({code:'success',data:{status:'SUCCESS',outputs:[videoUrl]}});
  if(url===videoUrl)return new Response(mp4,{headers:{'Content-Type':'video/mp4'}});
  throw Error('Unexpected mock URL '+url);
 };
 const server=createStudio({initialSirayKey:'siray-test',videoUploader:async()=>videoUrl,fetcher,videoPollDelay:0});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 try{
  const html=await(await fetch(base+'/video')).text();const token=html.match(/const studioToken='([^']+)'/)[1];
  const headers={'X-Studio-Token':token,'Content-Type':'application/json'};
  const response=await fetch(base+'/api/video-jobs',{method:'POST',headers,body:JSON.stringify({...render,provider:'seedance-2.5',duration:18,videoUrl:''})});
  assert.equal(response.status,202);const {id}=await response.json();let job;
  for(let i=0;i<40;i++){job=await(await fetch(base+'/api/video-jobs/'+id,{headers})).json();if(job.status!=='running')break;await new Promise(r=>setTimeout(r,10))}
  assert.equal(job.status,'done');assert.equal(job.model,'bytedance/seedance-2.5-ref2v-spicy');assert.equal(job.modelLabel,'Seedance 2.5 Spicy');
  assert.equal(requests.length,1);assert.deepEqual(requests[0].videos,[videoUrl]);assert.deepEqual(requests[0].images,[avatar]);
  assert.equal(requests[0].duration,18);
 }finally{await new Promise(resolve=>server.close(resolve))}
});

test('video frame analysis writes a prompt and Siray receives the reviewed direction',async()=>{
 const calls=[];
 const fetcher=async(url,options={})=>{
  calls.push({url,options});
  if(url==='https://api.openai.com/v1/responses')return Response.json({output:[{content:[{type:'output_text',text:'Avatar performs a side step, arm lift, and turn.'}]}]});
  if(url==='https://api.siray.ai/v1/video/generations')return Response.json({code:'success',data:{task_id:'wan-task'}});
  if(url.endsWith('/wan-task'))return Response.json({code:'success',data:{status:'SUCCESS',outputs:['https://cdn.example.test/result.mp4']}});
  if(url==='https://cdn.example.test/result.mp4')return new Response(mp4,{headers:{'Content-Type':'video/mp4'}});
  throw Error('Unexpected mock URL '+url);
 };
 const server=createStudio({fetcher,videoUploader:async()=>videoUrl,initialKey:'openai-test',initialSirayKey:'siray-test',videoPollDelay:0});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 try{
  const html=await(await fetch(base+'/video')).text();assert.match(html,/Build basic prompt · no OpenAI/);
  const token=html.match(/const studioToken='([^']+)'/)[1];const headers={'X-Studio-Token':token,'Content-Type':'application/json'};
  const post=data=>fetch(base+'/api/video-jobs',{method:'POST',headers,body:JSON.stringify(data)});
  assert.equal((await fetch(base+'/api/video-file/not-a-job')).status,403);
  const wait=async id=>{for(let i=0;i<40;i++){const job=await(await fetch(base+'/api/video-jobs/'+id,{headers})).json();if(job.status!=='running')return job;await new Promise(r=>setTimeout(r,10))}throw Error('Timed out')};
  const analysis=await(await post({action:'analyze',avatar,frames:[0,1,2].map(time=>({time,image:avatar})),notes:'Steady camera'})).json();
  const analyzed=await wait(analysis.id);assert.equal(analyzed.status,'done');assert.match(analyzed.prompt,/side step/);
  const visionCall=calls.find(c=>c.url.endsWith('/responses'));const vision=JSON.parse(visionCall.options.body);
  assert.equal(vision.store,false);assert.equal(vision.model,'gpt-6-luna');assert.equal(vision.max_output_tokens,1800);assert.equal(vision.input[0].content.filter(c=>c.type==='input_image').length,4);
  const creation=await(await post({...render,reviewNotes:'Keep the camera fixed and the movement on the same beats.'})).json();const job=await wait(creation.id);
  assert.equal(job.status,'done');assert.equal(job.provider,'Siray');assert.equal(job.videoReady,true);assert.equal(job.model,'alibaba/wan-3.0-ref2v-spicy');
  const video=await fetch(base+'/api/video-file/'+creation.id,{headers});assert.equal(video.status,200);assert.deepEqual(Buffer.from(await video.arrayBuffer()),mp4);
  assert.equal(calls.filter(c=>c.url==='https://api.siray.ai/v1/video/generations').length,1);
  const wanSubmission=JSON.parse(calls.find(c=>c.url==='https://api.siray.ai/v1/video/generations').options.body);assert.deepEqual(wanSubmission.videos,[videoUrl]);
  assert.match(wanSubmission.prompt,/Keep avatar identity and follow the turns/);assert.match(wanSubmission.prompt,/same beats/);
 }finally{await new Promise(resolve=>server.close(resolve))}
});

test('Kling is absent from video choices and cannot be submitted',async()=>{
 const server=createStudio();
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 try{const html=await(await fetch(base+'/video')).text();const token=html.match(/const studioToken='([^']+)'/)[1];const headers={'X-Studio-Token':token,'Content-Type':'application/json'};
  assert.doesNotMatch(html,/Kling|kling/);
  const response=await fetch(base+'/api/connect-kling',{method:'POST',headers,body:JSON.stringify({key:'unused-test-key'})});assert.equal(response.status,404);
  const status=await(await fetch(base+'/api/status',{headers})).json();assert.equal('klingConnected' in status,false);assert.equal('kling' in status.videoModels,false);
  const job=await fetch(base+'/api/video-jobs',{method:'POST',headers,body:JSON.stringify({...render,provider:'kling'})});assert.equal(job.status,400);
 }finally{await new Promise(resolve=>server.close(resolve))}
});

test('public post import feeds a local MP4 without treating the post as a direct file URL',async()=>{
 assert.throws(()=>validateVideoLink('http://127.0.0.1/private'));
 assert.throws(()=>validateVideoLink('https://localhost/private'));
 const runtimeDir=await mkdtemp(path.join(tmpdir(),'sauxi-import-test-'));
 const importer=async(url,options)=>importSocialVideo(url,{runtimeDir,extractor:async(command,args)=>{
  assert.match(command,/yt-dlp(?:\.exe)?$/);assert.equal(args.at(-1),'https://www.pinterest.com/pin/12345/');assert.match(args[args.indexOf('-f')+1],/bv\*\[ext=mp4\]/);
  assert.equal(args[args.indexOf('--concurrent-fragments')+1],'1');assert.equal(args[args.indexOf('--fragment-retries')+1],'2');assert.ok(args.includes('--no-part'));
  const output=args[args.indexOf('-o')+1];assert.equal(path.dirname(path.dirname(output)),runtimeDir);
  await writeFile(output.replace('%(ext)s','mp4'),mp4);
 }});
 const server=createStudio({videoImporter:importer});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 try{const html=await(await fetch(base+'/video')).text();const token=html.match(/const studioToken='([^']+)'/)[1];
  const response=await fetch(base+'/api/import-video',{method:'POST',headers:{'X-Studio-Token':token,'Content-Type':'application/json'},body:JSON.stringify({url:'https://www.pinterest.com/pin/12345/'})});
  assert.equal(response.status,200);const data=await response.json();assert.equal(data.data,videoData);assert.equal(data.name,'Imported video.mp4');
 }finally{await new Promise(resolve=>server.close(resolve));await rm(runtimeDir,{recursive:true,force:true})}
});

test('selected still frame produces a separate identity-to-frame image prompt',async()=>{
 const calls=[];const server=createStudio({initialKey:'openai-test',fetcher:async(url,options)=>{calls.push({url,options});return Response.json({output:[{content:[{type:'output_text',text:'Recreate the full-body outfit and stance using Image 1 identity.'}]}]})}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 try{const html=await(await fetch(base+'/video')).text();const token=html.match(/const studioToken='([^']+)'/)[1];const headers={'X-Studio-Token':token,'Content-Type':'application/json'};
  const response=await fetch(base+'/api/video-jobs',{method:'POST',headers,body:JSON.stringify({action:'analyze-still',avatar,frame:avatar,time:4.5,notes:'Keep the red jacket.'})});
  assert.equal(response.status,202);const {id}=await response.json();let job;
  for(let i=0;i<30;i++){job=await(await fetch(base+'/api/video-jobs/'+id,{headers})).json();if(job.status!=='running')break;await new Promise(r=>setTimeout(r,10))}
  assert.equal(job.status,'done');assert.match(job.prompt,/full-body outfit/);
  const body=JSON.parse(calls[0].options.body);assert.equal(body.model,'gpt-6-luna');assert.equal(body.input[0].content.filter(c=>c.type==='input_image').length,2);
  assert.match(body.input[0].content[0].text,/sole identity reference/);
  const advancedBody={action:'analyze-still',analysisMode:'advanced',requestId:'12345678-1234-1234-1234-123456789abc',avatar,frame:avatar,time:4.5,notes:'Keep the red jacket.'};
  const submit=()=>fetch(base+'/api/video-jobs',{method:'POST',headers,body:JSON.stringify(advancedBody)});
  const advanced=await(await submit()).json();const duplicate=await(await submit()).json();assert.equal(duplicate.id,advanced.id);assert.equal(duplicate.reused,true);
  for(let i=0;i<30;i++){job=await(await fetch(base+'/api/video-jobs/'+advanced.id,{headers})).json();if(job.status!=='running')break;await new Promise(r=>setTimeout(r,10))}
  assert.equal(JSON.parse(calls[1].options.body).model,'gpt-6-astra');assert.equal(calls.length,2);
 }finally{await new Promise(resolve=>server.close(resolve))}
});

test('Wan rejection reports the provider status and validation detail',async()=>{
 const server=createStudio({initialSirayKey:'siray-test',videoUploader:async()=>videoUrl,fetcher:async()=>new Response(JSON.stringify({code:'invalid_parameter',detail:[{loc:['body','videos'],msg:'video reference could not be decoded'}]}),{status:422,headers:{'Content-Type':'application/json'}})});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 try{const html=await(await fetch(base+'/video')).text();const token=html.match(/const studioToken='([^']+)'/)[1];const headers={'X-Studio-Token':token,'Content-Type':'application/json'};
  const response=await fetch(base+'/api/video-jobs',{method:'POST',headers,body:JSON.stringify({...render,provider:'wan',videoUrl:''})});assert.equal(response.status,202);const {id}=await response.json();let job;
  for(let i=0;i<30;i++){job=await(await fetch(base+'/api/video-jobs/'+id,{headers})).json();if(job.status!=='running')break;await new Promise(r=>setTimeout(r,10))}
  assert.equal(job.status,'error');assert.match(job.error,/HTTP 422/);assert.match(job.error,/video reference could not be decoded/);
 }finally{await new Promise(resolve=>server.close(resolve))}
});

test('Wan accepts top-level task responses and shows a completed video',async()=>{
 const fetcher=async(url)=>{
  if(url==='https://api.siray.ai/v1/video/generations')return Response.json({task_id:'top-level-task',message:'submitted'});
  if(url.endsWith('/top-level-task'))return Response.json({status:'SUCCESS',outputs:[videoUrl]});
  if(url===videoUrl)return new Response(mp4,{headers:{'Content-Type':'video/mp4'}});
  throw Error('Unexpected URL '+url);
 };
 const server=createStudio({initialSirayKey:'siray-test',videoUploader:async()=>videoUrl,fetcher,videoPollDelay:0});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 try{const html=await(await fetch(base+'/video')).text();const token=html.match(/const studioToken='([^']+)'/)[1];const headers={'X-Studio-Token':token,'Content-Type':'application/json'};
  const response=await fetch(base+'/api/video-jobs',{method:'POST',headers,body:JSON.stringify({...render,provider:'wan',videoUrl:''})});assert.equal(response.status,202);const {id}=await response.json();let job;
  for(let i=0;i<40;i++){job=await(await fetch(base+'/api/video-jobs/'+id,{headers})).json();if(job.status!=='running')break;await new Promise(r=>setTimeout(r,10))}
  assert.equal(job.status,'done');assert.equal(job.videoReady,true);assert.equal(job.provider,'Siray');
 }finally{await new Promise(resolve=>server.close(resolve))}
});
