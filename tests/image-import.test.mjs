import test from 'node:test';
import assert from 'node:assert/strict';
import {importImageUrl} from '../image-import.mjs';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=','base64');
const publicDns=async()=>[{address:'93.184.216.34'}];

test('imports a direct image and keeps its bytes as a local copy',async()=>{
  const result=await importImageUrl('https://images.example.com/avatar.jpg?size=large',{resolver:publicDns,fetcher:async()=>new Response(png,{headers:{'Content-Type':'image/jpeg'}})});
  assert.equal(result.name,'avatar.png');
  assert.equal(result.data,'data:image/png;base64,'+png.toString('base64'));
});

test('rejects private hosts, private redirects, and non-images',async()=>{
  await assert.rejects(importImageUrl('http://images.example.com/a.png',{resolver:publicDns}),/public HTTPS/);
  await assert.rejects(importImageUrl('https://127.0.0.1/a.png',{resolver:publicDns}),/public HTTPS/);
  await assert.rejects(importImageUrl('https://images.example.com/a.png',{resolver:async()=>[{address:'10.0.0.4'}]}),/public HTTPS/);
  await assert.rejects(importImageUrl('https://images.example.com/a.png',{resolver:publicDns,fetcher:async()=>new Response(null,{status:302,headers:{Location:'https://127.0.0.1/private'}})}),/public HTTPS/);
  await assert.rejects(importImageUrl('https://images.example.com/post',{resolver:publicDns,fetcher:async()=>new Response('<html>post</html>')}),/did not return a PNG/);
});
