// Surface redacted diagnostics in check annotations when artifact/log downloads are unavailable.
import fs from 'node:fs';
let text = process.argv.slice(2).filter(p=>fs.existsSync(p)).map(p=>fs.readFileSync(p,'utf8')).join('\n');
text=text.replace(/\x1b\[[0-9;]*m/g,'').replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,'[REDACTED JWT]').replace(/postgres(?:ql)?:\/\/[^\s]+/g,'[REDACTED DB URL]');
for(const [key,value] of Object.entries(process.env))if(value&&/(?:KEY|SECRET|PASSWORD)/.test(key))text=text.split(value).join('[REDACTED]');
const lines=text.trim().split('\n').filter(line=>!line.trimStart().startsWith('|')).slice(-35).join('\n').slice(-3000);
const escaped=(lines||'No diagnostic output captured').replace(/%/g,'%25').replace(/\r/g,'%0D').replace(/\n/g,'%0A');
console.log(`::error title=Readiness verification failure::${escaped}`);
