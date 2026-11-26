import fs from 'node:fs';
export async function confirmationLink(email,redirectTo){
 const status=JSON.parse(fs.readFileSync('.cache/readiness/status.json','utf8'));
 const inbox=status.MAILPIT_URL||status.INBUCKET_URL||'http://127.0.0.1:54324';
 if(!['localhost','127.0.0.1'].includes(new URL(inbox).hostname))throw Error('Refusing nonlocal mail inbox');
 const mailbox=encodeURIComponent(email.split('@')[0]);let lastStatus;
 for(let i=0;i<60;i++){
  const messages=[];
  // Recent Supabase CLI releases run Mailpit; older releases used Inbucket.
  const mailpit=await fetch(`${inbox}/api/v1/messages`);lastStatus=mailpit.status;
  if(mailpit.ok){
   const list=await mailpit.json();
   for(const item of list.messages||[]){
    if(!(item.To||[]).some(to=>to.Address?.toLowerCase()===email.toLowerCase()))continue;
    const msg=await (await fetch(`${inbox}/api/v1/message/${item.ID}`)).json();messages.push([msg.HTML,msg.Text].filter(Boolean).join('\n'));
   }
  }else{
   const r=await fetch(`${inbox}/api/v1/mailbox/${mailbox}`);lastStatus=r.status;
   if(r.ok){for(const item of await r.json()){
    const msg=await (await fetch(`${inbox}/api/v1/mailbox/${mailbox}/${item.id}`)).json();messages.push([msg.body?.html,msg.body?.text].filter(Boolean).join('\n'));
   }}
  }
  for(const body of messages){
   const text=body.replace(/&amp;/g,'&');
   const match=text.match(/https?:\/\/[^\s"<>]*\/auth\/v1\/verify\?[^\s"<>]+/);
   if(match){const url=new URL(match[0]);if(url.origin!==new URL(process.env.SUPABASE_URL).origin)throw Error('Unexpected email verification origin');if(redirectTo)url.searchParams.set('redirect_to',redirectTo);return url.toString();}
  }
  await new Promise(r=>setTimeout(r,500));
 }
 throw Error(`Real confirmation email not received in local inbox (last mailbox HTTP ${lastStatus})`);
}
export async function confirmEmail(email){
 const url=await confirmationLink(email);const r=await fetch(url,{redirect:'manual'});
 if(![302,303].includes(r.status))throw Error(`Email confirmation HTTP ${r.status}`);
 const location=r.headers.get('location')||'';if(location.includes('error='))throw Error('Provider rejected email confirmation');
 return r.status;
}
