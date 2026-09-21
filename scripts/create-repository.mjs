// Uses the user's existing Git credential helper; never prints credentials.
import {spawnSync} from 'node:child_process';
const credential=spawnSync('git',['credential','fill'],{input:'protocol=https\nhost=github.com\n\n',encoding:'utf8',windowsHide:true,env:{...process.env,GCM_INTERACTIVE:'never',GIT_TERMINAL_PROMPT:'0'}});
const fields=Object.fromEntries((credential.stdout||'').trim().split('\n').map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1)];}));
if(!fields.password) {console.log('No existing noninteractive GitHub credential.');process.exit(2);}
const headers={Authorization:`Bearer ${fields.password}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'};
const userRes=await fetch('https://api.github.com/user',{headers});if(!userRes.ok)throw new Error(`GitHub authentication HTTP ${userRes.status}`);
const user=await userRes.json();
if(user.login!=='imxiaomin')throw new Error('Existing git credential belongs to a different account; no repository created.');
const existing=await fetch(`https://api.github.com/repos/${user.login}/fitstreak`,{headers});
if(existing.ok){console.log(JSON.stringify({exists:true,url:(await existing.json()).html_url}));process.exit(0);}
if(existing.status!==404)throw new Error(`Repository lookup HTTP ${existing.status}`);
const res=await fetch('https://api.github.com/user/repos',{method:'POST',headers,body:JSON.stringify({name:'fitstreak',description:'FitStreak · 日积一练 — bilingual fitness check-in WeChat mini program, engineering documents and tests',private:false,auto_init:false})});
const repo=await res.json();if(!res.ok)throw new Error(`Repository creation HTTP ${res.status}: ${repo.message}`);
console.log(JSON.stringify({created:true,url:repo.html_url,private:repo.private}));
