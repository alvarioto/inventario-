import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';

const __dirname=dirname(fileURLToPath(import.meta.url));
const projectRoot=dirname(__dirname);

async function main(){
 try{
  const chromiumResolved=import.meta.resolve('@sparticuz/chromium');
  const chromiumPath=chromiumResolved.replace(/^file:\/\//,'');
  const chromiumDir=dirname(dirname(dirname(chromiumPath)));
  const binDir=join(chromiumDir,'bin');
  if(!existsSync(binDir)){
   console.log('Chromium bin directory not found; skipping pack generation.');
   return;
  }
  const publicDir=join(projectRoot,'public');
  mkdirSync(publicDir,{recursive:true});
  const output=join(publicDir,'chromium-pack.tar');
  execSync(`tar -cf "${output}" -C "${binDir}" .`,{stdio:'inherit',cwd:projectRoot});
  console.log('Chromium pack ready:',output);
 }catch(error){
  console.error('Could not create Chromium pack:',error?.message||error);
  process.exitCode=1;
 }
}
main();
