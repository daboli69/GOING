import {constants,createCipheriv,createDecipheriv,privateDecrypt,publicEncrypt,randomBytes} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const rsa=key=>({key,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'});
const b64=data=>data.toString('base64');
const decode=value=>Buffer.from(value,'base64');
export function sealEvaluation(payload,publicKey){
  const key=randomBytes(32), nonce=randomBytes(12);
  const cipher=createCipheriv('aes-256-gcm',key,nonce);
  const body=Buffer.concat([cipher.update(JSON.stringify(payload),'utf8'),cipher.final()]);
  return {version:1,key:b64(publicEncrypt(rsa(publicKey),key)),nonce:b64(nonce),tag:b64(cipher.getAuthTag()),body:b64(body)};
}
export function openEvaluation(payload,privateKey){
  if(payload.version!==1)throw Error('Unsupported archive version.');
  const key=privateDecrypt(rsa(privateKey),decode(payload.key));
  const decipher=createDecipheriv('aes-256-gcm',key,decode(payload.nonce));
  decipher.setAuthTag(decode(payload.tag));
  return JSON.parse(Buffer.concat([decipher.update(decode(payload.body)),decipher.final()]));
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  const [archive,key,output]=process.argv.slice(2);
  if(!archive||!key||!output)throw Error('Usage: node scripts/gta-vault.mjs ENCRYPTED_ARCHIVE PRIVATE_KEY OUTPUT_JSON');
  const data=JSON.parse(await readFile(archive,'utf8'));
  await writeFile(output,JSON.stringify(openEvaluation(data,await readFile(key))),{flag:'wx'});
}
