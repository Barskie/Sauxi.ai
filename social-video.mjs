import {execFile} from 'node:child_process';
import {mkdir,mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {existsSync} from 'node:fs';

const MAX_BYTES=36*1024*1024;
const APP_DIR=path.dirname(fileURLToPath(import.meta.url));
const RUNTIME_DIR=path.join(APP_DIR,'.runtime');
const bundledYtDlp=path.join(APP_DIR,'tools','yt-dlp.exe');
const DEFAULT_COMMAND=process.platform==='win32'&&existsSync(bundledYtDlp)?bundledYtDlp:'yt-dlp';
const fail=(message,code=400)=>Object.assign(new Error(message),{code});
export function validateVideoLink(value){
  let url;try{url=new URL(value)}catch{throw fail('Paste a public video or social post URL.');}
  if(url.protocol!=='https:'||url.username||url.password||url.port||url.hostname.length>253)throw fail('Use a public HTTPS video link.');
  const host=url.hostname.toLowerCase();
  if(host==='localhost'||host==='::1'||host.endsWith('.local')||host.endsWith('.internal')||host.endsWith('.test')||/^(\d+\.){3}\d+$/.test(host)||host.startsWith('['))throw fail('Use a public HTTPS video link.');
  return url.href;
}
function runExtractor(command,args){
  return new Promise((resolve,reject)=>execFile(command,args,{timeout:120000,maxBuffer:1024*1024,windowsHide:true},(error,stdout,stderr)=>{
    if(error){
      if(error.code==='ENOENT')return reject(fail('The link importer needs yt-dlp. Install it from the official yt-dlp project, then restart Sauxi.ai.',503));
      const detail=String(stderr||error.message).split('\n').filter(Boolean).slice(-2).join(' ').slice(0,300);
      if(/Unable to rename file|WinError 5|Access is denied/i.test(detail))return reject(fail('Windows blocked the temporary video download. Restart Sauxi.ai and retry the link.',502));
      return reject(fail('Could not import this public post. It may require a login, be unavailable, or be too long. '+detail,502));
    }
    resolve(stdout);
  }));
}
function ffmpegAvailable(){return new Promise(resolve=>{try{execFile('ffmpeg',['-version'],{timeout:5000,windowsHide:true},error=>resolve(!error));}catch{resolve(false)}});}
export async function importSocialVideo(value,{extractor=runExtractor,command=DEFAULT_COMMAND,runtimeDir=RUNTIME_DIR}={}){
  const url=validateVideoLink(value);
  // Windows can lock HLS fragments in the packaged-app Temp folder before
  // yt-dlp renames them. Keep imports in an app-owned runtime directory.
  await mkdir(runtimeDir,{recursive:true});
  const dir=await mkdtemp(path.join(runtimeDir,'video-import-'));
  try{
    // Pinterest often publishes video and audio as separate HLS streams.
    // Merge both when FFmpeg is present; retain a playable video-only path otherwise.
    const mergeAudio=await ffmpegAvailable();
    const formats=mergeAudio?'b[ext=mp4]/bv*[ext=mp4]+ba/bv*[ext=mp4]/b':'b[ext=mp4]/b/bv*[ext=mp4]/bv*';
    await extractor(command,['--no-playlist','--no-progress','--no-warnings','--no-part','--concurrent-fragments','1','--retries','2','--fragment-retries','2','--max-filesize','36M','-f',formats,'--merge-output-format','mp4','--remux-video','mp4','-o',path.join(dir,'reference.%(ext)s'),url]);
    const files=await readdir(dir);const name=files.find(file=>file==='reference.mp4')||files.find(file=>file.toLowerCase().endsWith('.mp4'));
    if(!name)throw fail('This link did not provide a playable MP4. Try another public post or drop an MP4 file.',502);
    const bytes=await readFile(path.join(dir,name));
    if(!bytes.length||bytes.length>MAX_BYTES||bytes.toString('ascii',4,8)!=='ftyp')throw fail('The linked clip must be a valid MP4 under 36 MB.',413);
    return {name:'Imported video.mp4',data:'data:video/mp4;base64,'+bytes.toString('base64'),bytes:bytes.length};
  }finally{await rm(dir,{recursive:true,force:true}).catch(()=>{});}
}
