'use strict';
const el=id=>document.getElementById(id);
const split=value=>value.split(/[,，]/).map(x=>x.trim()).filter(Boolean);
let session=sessionStorage.getItem('persona-session')||crypto.randomUUID();
sessionStorage.setItem('persona-session',session);
let approved=null;
function notice(text){el('notice').textContent=text;}
async function api(path,body){
  const response=await fetch('/api/'+path,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','X-Local-Request':'1'},body:JSON.stringify(body)});
  const data=await response.json();if(!response.ok)throw Error(data.error||'请求失败');return data;
}
function invalidate(){approved=null;el('send-chat').disabled=true;}
async function run(button,fn){button.disabled=true;try{await fn();}catch(error){notice(error.message);}finally{button.disabled=button.id==='send-chat'?!approved:false;}}
function bubble(role,text){const div=document.createElement('div');div.className='bubble '+role;const small=document.createElement('small');small.textContent=role==='user'?'你':'模拟回复 · generated_content';div.append(small,document.createTextNode(text));el('chat-log').append(div);div.scrollIntoView({block:'nearest'});}
function fillProfile(p){for(const key of ['user_name','target_name','user_id','target_id','conversation_id','persona','relationship'])el(key).value=p[key]||'';el('aliases').value=(p.aliases||[]).join(', ');}
function fillMemory(m={}){el('memory-id').value=m.id||'';el('memory-summary').value=m.summary||'';el('memory-type').value=m.type||'semantic';el('memory-level').value=m.level||'user_provided';el('memory-confidence').value=m.confidence??.5;el('memory-action').value='update';el('memory-start').value=m.time_start||'';el('memory-end').value=m.time_end||'';el('memory-evidence').value=(m.evidence||[]).join(', ');el('memory-counter').value=m.counterevidence||'';el('memory-stage').value=m.stage||'';}
async function refresh(){const state=await api('state');el('status').textContent=`${state.messages} 条消息 · ${state.model||'未配置模型'} · Key ${state.api_key_configured?'已配置':'未配置'}`;if(state.profile)fillProfile(state.profile);el('memories').replaceChildren();for(const m of state.memories){const card=document.createElement('article');card.className='memory-card';const info=document.createElement('small');info.textContent=`${m.id} · ${m.type} · ${m.level} · 置信度 ${m.confidence}`;const p=document.createElement('p');p.textContent=m.summary;const edit=document.createElement('button');edit.textContent='编辑';edit.onclick=()=>fillMemory(m);const remove=document.createElement('button');remove.className='secondary';remove.textContent='移除';remove.onclick=()=>run(remove,async()=>{if(!confirm('将此记忆移出检索？本地版本历史会保留。'))return;await api('memory/delete',{id:m.id});invalidate();await refresh();notice('已移出检索，版本历史保留');});card.append(info,p,edit,remove);el('memories').append(card);}}
for(const button of document.querySelectorAll('nav button'))button.onclick=()=>{for(const section of document.querySelectorAll('.panel'))section.hidden=section.id!==button.dataset.tab;for(const b of document.querySelectorAll('nav button'))b.classList.toggle('active',b===button);};
el('save-profile').onclick=()=>run(el('save-profile'),async()=>{const profile={};for(const k of ['user_name','target_name','user_id','target_id','conversation_id','persona','relationship'])profile[k]=el(k).value;profile.aliases=split(el('aliases').value);await api('profile',profile);invalidate();await refresh();notice('人物已保存');});
el('profile-file').onchange=async()=>{try{const f=el('profile-file').files[0];if(f){fillProfile(JSON.parse(await f.text()));notice('资料已载入编辑区，请检查后点击保存人物');}}catch(e){notice(e.message);}};
el('import-messages').onclick=()=>run(el('import-messages'),async()=>{const file=el('message-file').files[0];if(!file)throw Error('请先选择文件');if(file.size>32*1024*1024)throw Error('快速版单次文件上限 32 MB，请拆分后增量导入');const result=await api('import',{text:await file.text()});el('import-output').textContent=JSON.stringify(result,null,2);invalidate();await refresh();notice('导入完成');});
el('show-evidence').onclick=()=>run(el('show-evidence'),async()=>{el('evidence-output').textContent=JSON.stringify(await api('evidence',{id:el('evidence-id').value}),null,2);});
el('save-memory').onclick=()=>run(el('save-memory'),async()=>{await api('memory',{id:el('memory-id').value||undefined,summary:el('memory-summary').value,type:el('memory-type').value,level:el('memory-level').value,confidence:Number(el('memory-confidence').value),action:el('memory-action').value,time_start:el('memory-start').value,time_end:el('memory-end').value,evidence:split(el('memory-evidence').value),counterevidence:el('memory-counter').value,stage:el('memory-stage').value});invalidate();fillMemory();await refresh();notice('记忆版本已保存');});
el('clear-memory').onclick=()=>fillMemory();
el('message').oninput=invalidate;
el('preview-chat').onclick=()=>run(el('preview-chat'),async()=>{approved=await api('preview',{message:el('message').value,session_id:session});el('preview-output').textContent=JSON.stringify(approved,null,2);el('preview-box').open=true;el('send-chat').disabled=false;notice(`预览完成：${approved.characters} 字符。确认内容后发送至显示的 URL。`);});
el('send-chat').onclick=()=>run(el('send-chat'),async()=>{if(!approved)throw Error('请先预览');const message=el('message').value;const result=await api('chat',{message,session_id:session,preview_id:approved.preview_id});bubble('user',message);bubble('assistant',result.content);el('message').value='';invalidate();notice('已收到模拟回复；未新增真实记忆');});
el('new-session').onclick=()=>{session=crypto.randomUUID();sessionStorage.setItem('persona-session',session);el('chat-log').replaceChildren();invalidate();notice('新会话已创建，旧会话仍保留在本地数据库');};
async function init(){await refresh();const rows=await api('session',{session_id:session});for(const row of rows)bubble(row.role,row.content);notice('准备就绪。首次使用请打开人物配置。');}
init().catch(e=>notice(e.message));
