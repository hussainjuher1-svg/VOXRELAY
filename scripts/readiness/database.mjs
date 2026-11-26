import fs from 'node:fs';
import pg from 'pg';
const db = new pg.Client({connectionString:process.env.READINESS_DB_URL});
await db.connect();
try {
  const version=(await db.query('show server_version')).rows[0].server_version;
  if(!version.startsWith('17.')) throw new Error(`Expected PostgreSQL17, got ${version}`);
  for(const file of ['db/schema.sql',...fs.readdirSync('db/migrations').filter(f=>f.endsWith('.sql')).sort().map(f=>`db/migrations/${f}`),'db/lockdown.sql']) await db.query(fs.readFileSync(file,'utf8'));
  // Explicit test-only ownership probe; never grant access to locked app tables.
  await db.query(`CREATE TABLE public.readiness_probe(user_id uuid primary key, display_name text);
    ALTER TABLE public.readiness_probe ENABLE ROW LEVEL SECURITY;
    GRANT SELECT,INSERT,UPDATE,DELETE ON public.readiness_probe TO anon,authenticated;
    CREATE POLICY owner_only ON public.readiness_probe TO authenticated USING(auth.uid()=user_id) WITH CHECK(auth.uid()=user_id);
    NOTIFY pgrst, 'reload schema'`);
  const authMigrations = Number((await db.query('select count(*) from auth.schema_migrations')).rows[0].count);
  if (!authMigrations) throw new Error('GoTrue auth migrations absent');
  await db.query('set search_path = auth');
  const searchPath = (await db.query('show search_path')).rows[0].search_path;
  if (searchPath !== 'auth') throw new Error('auth search_path verification failed');
  await db.query('set search_path = public');
  const storageRls=(await db.query("select relrowsecurity from pg_class where oid='storage.objects'::regclass")).rows[0].relrowsecurity;
  if(!storageRls) throw new Error('Storage objects RLS disabled');
  const tables=(await db.query(`select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','voxrelay') and c.relkind='r'`)).rows;
  if(tables.some(t=>!t.relrowsecurity)) throw new Error('Exposed table without RLS');
  const buckets=(await db.query('select id, public from storage.buckets')).rows;
  if(buckets.some(b=>b.public)) throw new Error('Unexpected public storage bucket');
  const policies=(await db.query("select schemaname,tablename,policyname,roles,cmd from pg_policies where schemaname in ('public','voxrelay','storage')")).rows;
  fs.writeFileSync('evidence/database.json',JSON.stringify({version,authMigrations,searchPath,storageRls,tables,buckets,policies},null,2));
} finally {await db.end();}
