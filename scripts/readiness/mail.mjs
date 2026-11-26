import fs from 'node:fs';
export async function confirmationLink(email,redirectTo){
 const status=JSON.parse(fs.readFileSync('.cache/readiness/status.json','utf8'));
 const inbox=status.INBUCKET_URL||'http://127.0.0.1:54324';
 if(!['localhost','127.0.0.1'].includes(new URL(inbox).hostname))throw Error('Refusing nonlocal mail inbox');
 const mailbox=encodeURIComponent(email.split('@')[0]);
 for(let i=0;i<40;i++){
  const r=await fetch(`${inbox}/api/v1/mailbox/${mailbox}`);
  if(r.ok){for(const item of await r.json()){
   const msg=await (await fetch(`${inbox}/api/v1/mailbox/${mailbox}/${item.id}`)).json();
   const text=[msg.body?.html,msg.body?.text].filter(Boolean).join('\n').replace(/&amp;/g,'&');
   const match=text.match(/https?:\/\/[^\s"<>]*\/auth\/v1\/verify\?[^\s"<>]+/);
   if(match){const url=new URL(match[0]);if(url.origin!==new URL(process.env.SUPABASE_URL).origin)throw Error('Unexpected email verification origin');if(redirectTo)url.searchParams.set('redirect_to',redirectTo);return url.toString();}
  }}
  await new Promise(r=>setTimeout(r,500));
 }
 throw Error('Real confirmation email not received in local inbox');
}
export async function confirmEmail(email){
 const url=await confirmationLink(email);const r=await fetch(url,{redirect:'manual'});
 if(![302,303].includes(r.status))throw Error(`Email confirmation HTTP ${r.status}`);
 const location=r.headers.get('location')||'';if(location.includes('error='))throw Error('Provider rejected email confirmation');
 return r.status;
}
