import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {confirmationLink} from './mail.mjs';
import {chromium} from '../../.cache/readiness/browser/node_modules/playwright/index.mjs';
const origin='http://localhost:5173';
let ready=false;
for(let i=0;i<60;i++){try{if((await fetch(origin)).ok){ready=true;break;}}catch{/* server starting */}await new Promise(r=>setTimeout(r,1000));}
assert.ok(ready,'Frontend startup timeout');
const browser=await chromium.launch();const results=[];
try{for(const width of [390,1440]){
 const context=await browser.newContext({viewport:{width,height:1000}});const page=await context.newPage();const errors=[];let validFlow=false;
 page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(validFlow&&[401,403,500].includes(r.status()))errors.push(`HTTP ${r.status()} ${new URL(r.url()).pathname}`);});
 page.on('console',m=>{if(validFlow&&m.type()==='error')errors.push(m.text());});
 console.log(`Viewport ${width}: checking anonymous redirect`);
 await page.goto(origin+'/app/assignments');await page.waitForURL(/\/login/);
 validFlow=true;
 console.log(`Viewport ${width}: real app signup`);
 await page.goto(origin+'/login?mode=signup');
 const email=`browser-${randomUUID()}@example.com`,password=`Audit-${randomUUID()}-aA9!`;
 await page.getByLabel('Full name',{exact:true}).fill('Readiness Interpreter');await page.getByLabel('Work email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);
 await page.locator('form').getByRole('button',{name:'Create account',exact:true}).click();
 await page.getByRole('status').filter({hasText:/check your inbox/i}).waitFor({timeout:15000});
 const link=await confirmationLink(email,origin+'/login');await page.goto(link);await page.waitForURL(/\/app(?:\/|$)/,{timeout:30000});
 await page.reload();await page.waitForURL(/\/app(?:\/|$)/);
 // Live browser CRUD uses genuine GoTrue credentials, never fabricated tokens.
 const crud=await page.evaluate(async({base,key,email,password})=>{
  const tokenResponse=await fetch(base+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({email,password})});if(!tokenResponse.ok)throw Error(`Browser token issuance HTTP ${tokenResponse.status}`);const session=await tokenResponse.json();
  const headers={apikey:key,Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json',Prefer:'return=representation'};
  const path=base+'/rest/v1/readiness_probe';const statuses=[];
  for(const [method,url,body] of [['POST',path,{user_id:session.user.id,display_name:'Browser'}],['GET',path+'?user_id=eq.'+session.user.id],['PATCH',path+'?user_id=eq.'+session.user.id,{display_name:'Changed'}],['DELETE',path+'?user_id=eq.'+session.user.id]]){
    const r=await fetch(url,{method,headers,body:body?JSON.stringify(body):undefined});statuses.push(r.status);if(!r.ok)throw Error(`Browser CRUD ${method}: ${r.status}`);
  }return statuses;
 },{base:process.env.SUPABASE_URL,key:process.env.SUPABASE_ANON_KEY,email,password});
 const signout=page.getByRole('button',{name:'Sign out',exact:true});
 if(!await signout.isVisible()){const menu=page.getByRole('button',{name:/menu/i}).first();await menu.click();}
 await signout.click();await page.waitForURL(/\/(login)?$/);
 validFlow=false;await page.goto(origin+'/app/assignments');await page.waitForURL(/\/login/);
 validFlow=true;await page.getByLabel('Work email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.locator('form').getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL(/\/app(?:\/|$)/);await page.reload();
 await page.screenshot({path:`evidence/browser-${width}.png`});assert.deepEqual(errors,[]);results.push({width,crud,errors,status:'PASS'});await context.close();
}}finally{await browser.close();fs.writeFileSync('evidence/browser.json',JSON.stringify(results,null,2));}
