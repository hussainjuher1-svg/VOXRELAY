// Publish small credential-free assertions through the Checks API as well as artifacts.
import fs from 'node:fs';
for(const name of ['database','http','browser','hardening']){
 const file=`evidence/${name}.json`;if(!fs.existsSync(file))continue;
 const raw=JSON.parse(fs.readFileSync(file,'utf8'));
 const value=name==='database'?{version:raw.version,authMigrations:raw.authMigrations,searchPath:raw.searchPath,storageRls:raw.storageRls,tables:raw.tables,buckets:raw.buckets,policyCount:raw.policies.length}:raw;
 const message=JSON.stringify(value).replace(/%/g,'%25').replace(/\r/g,'%0D').replace(/\n/g,'%0A');
 console.log(`::notice title=Readiness evidence ${name}::${message}`);
}
