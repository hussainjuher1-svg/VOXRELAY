import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const service=process.env.SUPABASE_SERVICE_ROLE_KEY;assert.ok(service);
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
for(const file of walk('dist'))assert.ok(!fs.readFileSync(file).includes(Buffer.from(service)),`Server key leaked: ${file}`);
for(const key of Object.keys(process.env).filter(k=>k.startsWith('VITE_')))assert.ok(!/SERVICE_ROLE|JWT_SECRET|PASSWORD/.test(key),'Forbidden frontend variable');
const ids=execFileSync('docker',['ps','--format','{{.Names}}'],{encoding:'utf8'}).trim().split('\n');const db=ids.find(n=>n.startsWith('supabase_db_'));assert.ok(db,'DB container absent');
const dump=execFileSync('docker',['exec',db,'pg_dump','-U','postgres','-d','postgres','--schema=voxrelay','--schema=public','--no-owner','--no-acl'],{maxBuffer:30*1024*1024});
// Rehearse restore into a separate database, never over the running audit DB.
execFileSync('docker',['exec',db,'createdb','-U','postgres','readiness_restore']);
execFileSync('docker',['exec',db,'psql','-U','postgres','-d','readiness_restore','-v','ON_ERROR_STOP=1','-c',`create schema auth; create function auth.uid() returns uuid language sql as $$select null::uuid$$;`]);
execFileSync('docker',['exec','-i',db,'psql','-U','postgres','-d','readiness_restore','-v','ON_ERROR_STOP=1'],{input:dump,stdio:['pipe','ignore','pipe']});
const count=execFileSync('docker',['exec',db,'psql','-U','postgres','-d','readiness_restore','-Atc',"select count(*) from pg_tables where schemaname='voxrelay'"],{encoding:'utf8'}).trim();assert.ok(Number(count)>0);
fs.writeFileSync('evidence/hardening.json',JSON.stringify({bundleServiceKeyAbsent:true,forbiddenFrontendVariablesAbsent:true,disposableSchemaRestore:true,restoredAppTableCount:Number(count),productionReadiness:'NOT CERTIFIED: production network bindings, restart/pooling, off-host backup automation/retention and production restore RPO/RTO require separate verification'},null,2));
