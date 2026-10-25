import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';

const MAX_BYTES=20*1024*1024;
const fail=(message,code=400)=>Object.assign(new Error(message),{code});

function publicAddress(address){
  if(isIP(address)===4){
    const [a,b,c]=address.split('.').map(Number);
    return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a===100&&b>=64&&b<=127||a===192&&b===0&&c===0||a===192&&b===0&&c===2||a===198&&b>=18&&b<=19||a===198&&b===51&&c===100||a===203&&b===0&&c===113);
  }
  if(isIP(address)===6)return /^[23][0-9a-f]/i.test(address);
  return false;
}

async function checkedUrl(value,resolver){
  let url;try{url=new URL(value)}catch{throw fail('Paste a direct HTTPS image link.');}
  if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443'||!url.hostname||url.hostname==='localhost'||url.hostname.endsWith('.local')||url.hostname.endsWith('.internal'))throw fail('Use a public HTTPS image link.');
  const addresses=isIP(url.hostname)?[{address:url.hostname}]:await resolver(url.hostname,{all:true,verbatim:true}).catch(()=>{throw fail('Could not find that image host.',502)});
  if(!addresses.length||!addresses.every(item=>publicAddress(item.address)))throw fail('Use a public HTTPS image link.');
  return url;
}

function imageType(bytes){
  if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return ['image/png','png'];
  if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return ['image/jpeg','jpg'];
  if(bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')return ['image/webp','webp'];
  throw fail('The link did not return a PNG, JPG, or WebP image. Use the image address rather than the post page.');
}

export async function importImageUrl(value,{fetcher=fetch,resolver=lookup}={}){
  if(typeof value!=='string'||value.length>4096)throw fail('Paste a direct HTTPS image link.');
  let current=value;
  for(let redirect=0;redirect<5;redirect++){
    const url=await checkedUrl(current,resolver);
    let response;try{response=await fetcher(url.href,{redirect:'manual',signal:AbortSignal.timeout(30000),headers:{Accept:'image/png,image/jpeg,image/webp'}})}catch{throw fail('Could not download that image. Check the link and try again.',502)}
    if([301,302,303,307,308].includes(response.status)){
      const location=response.headers.get('location');if(!location)throw fail('The image redirect has no destination.',502);
      await response.body?.cancel();current=new URL(location,url).href;continue;
    }
    if(!response.ok)throw fail(`The image link returned HTTP ${response.status}. Try opening the image itself in a new tab and copy its address.`,502);
    const declared=Number(response.headers.get('content-length'));
    if(declared>MAX_BYTES)throw fail('Choose an image smaller than 20 MB.',413);
    let length=0;const parts=[];
    try{for await(const part of response.body){length+=part.length;if(length>MAX_BYTES)throw fail('Choose an image smaller than 20 MB.',413);parts.push(part)}}catch(error){if(error.code)throw error;throw fail('The image download stopped early. Try another link.',502)}
    const bytes=Buffer.concat(parts);const [type,extension]=imageType(bytes);
    let basename;try{basename=decodeURIComponent(url.pathname.split('/').pop()||'')}catch{basename=''}
    basename=basename.replace(/[^a-zA-Z0-9._ -]/g,'_').replace(/^\.+/,'').slice(0,80).replace(/\.(png|jpe?g|webp)$/i,'').trim()||'imported-image';
    return {data:`data:${type};base64,${bytes.toString('base64')}`,name:`${basename}.${extension}`};
  }
  throw fail('The image link redirected too many times.',502);
}
