const API_URL='https://script.google.com/macros/s/AKfycbzuRXFu2AAhvIVUU8yuX0amhZTzJDNnY0dW0lx88qtMOV-ltNSAFGlqoOhDIp8Hx-lDiQ/exec';
let training=[],candidates=[],interviews=[],feedback={},placements=[];
let lastParsedDaily=[]; let notificationItems=[];
let notificationState=JSON.parse(localStorage.otterNotificationState||'{}');
const demoInterviews=[];
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
$('month').value=new Date().toISOString().slice(0,7);if($('interviewMonth'))$('interviewMonth').value=new Date().toISOString().slice(0,7);$('dailyDate').value=new Date().toISOString().slice(0,10);if($('progressDate'))$('progressDate').value=$('dailyDate').value;
function normalizeDate(v){
  let s=String(v??'').trim().replace(/\./g,'/').replace(/\s+/g,'');
  if(!s)return '';
  let m=s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if(m){let a=Number(m[1]),b=Number(m[2]),y=Number(m[3]);if(y<100)y+=y>=70?1900:2000;const mo=a,d=b;if(validDateParts(y,mo,d))return `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;const d2=a,mo2=b;if(validDateParts(y,mo2,d2))return `${y}-${String(mo2).padStart(2,'0')}-${String(d2).padStart(2,'0')}`;return '';}
  m=s.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
  if(m){const y=Number(m[1]),mo=Number(m[2]),d=Number(m[3]);if(!validDateParts(y,mo,d))return '';return `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;}
  if(/^\d{4}-\d{2}-\d{2}T/.test(s)){const iso=s.slice(0,10),[y,mo,d]=iso.split('-').map(Number);return validDateParts(y,mo,d)?iso:'';}
  return '';
}
function validDateParts(y,m,d){const dt=new Date(y,m-1,d);return m>=1&&m<=12&&d>=1&&dt.getFullYear()===y&&dt.getMonth()===m-1&&dt.getDate()===d}
function isValidIsoDate(v){return /^\d{4}-\d{2}-\d{2}$/.test(String(v||'')) && validDateParts(...String(v).split('-').map(Number))}

function monthRows(a){return a.filter(x=>!$('month').value||String(x.date||'').startsWith($('month').value))}
function cleanCell(v){return String(v??'').trim().replace(/^['"]|['"]$/g,'').trim()}
function splitLine(line){let s=line.trim();if(s.startsWith('|'))s=s.slice(1);if(s.endsWith('|'))s=s.slice(0,-1);if(s.includes('\t'))return s.split('\t').map(cleanCell);if(s.includes('|'))return s.split('|').map(cleanCell);return [s]}
function parseDurationStatus(raw){let text=cleanCell(raw),status=/no[- ]?show/i.test(text)?'No-Show':'Attended',duration=text.replace(/\s*[–—-]\s*(attended|no[- ]?show)\s*$/i,'').trim()||'1 Hr';return{duration,status}}
function parseDailyText(raw){
  const lines=String(raw||'').replace(/```[a-z]*|```/gi,'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean),records=[],skipped=[],errors=[];
  for(const line of lines){
    if(/^\|?\s*-{2,}(?:\s*\|\s*-{2,})+\s*\|?$/.test(line)) continue;
    const c=splitLine(line);
    if(c.length<5||/^(s\.?no\.?|date)\b/i.test(c.join(' '))){if(c.length<5)skipped.push(line);continue}
    let x=c.slice(); if(/^\d+$/.test(x[0])) x=x.slice(1);
    if(x.length<5){skipped.push(line);continue}
    const rawDate=cleanCell(x[0]);
    const date=normalizeDate(rawDate);
    const name=cleanCell(x[1]);
    const slot=cleanCell(x[2]);
    const tech=cleanCell(x[3]);
    const ds=parseDurationStatus(x[4]);
    if(!date){errors.push(`Invalid date format: “${rawDate}”. Use dd-mm-yyyy, for example 24-09-2026.`);continue}
    if(!name){errors.push('Candidate name is required.');continue}
    records.push({date,name,slot:(slot==='-'?'':slot),technology:(tech==='-'?'':tech),duration:ds.duration,status:ds.status});
  }
  return{records,skipped,errors};
}

function jsonp(action,payload){return new Promise((resolve,reject)=>{const cb='otter_'+Date.now()+'_'+Math.floor(Math.random()*100000),script=document.createElement('script'),timer=setTimeout(()=>{cleanup();reject(new Error('Google Sheet API timed out'))},30000);window[cb]=data=>{clearTimeout(timer);cleanup();data&&data.success?resolve(data):reject(new Error(data?.message||'Google Sheet API error'))};function cleanup(){delete window[cb];script.remove()}script.onerror=()=>{clearTimeout(timer);cleanup();reject(new Error('Could not reach Google Sheet API'))};let url=API_URL+'?action='+encodeURIComponent(action)+'&callback='+encodeURIComponent(cb)+'&_='+Date.now();if(payload)url+='&payload='+encodeURIComponent(JSON.stringify(payload));script.src=url;document.head.appendChild(script)})}
async function loadAll(){
  showConnection('checking','Connecting to Google Sheet…');
  try{
    const d=await jsonp('getAll');
    const st=d.dataStatus||{};
    if(st.TRAINING?.success!==false && Array.isArray(d.training)) training=mapTraining(d.training);
    if(st.CANDIDATES?.success!==false && Array.isArray(d.candidates)) candidates=mapCandidates(d.candidates);
    if(st.INTERVIEWS?.success!==false && Array.isArray(d.interviews)) interviews=mapInterviews(d.interviews);
    if(st.FEEDBACK?.success!==false && Array.isArray(d.feedback)) feedback=mapFeedback(d.feedback);
    if(st.PLACEMENTS?.success!==false && Array.isArray(d.placements)) placements=d.placements;
    enrichTrainingForDisplay();
    showConnection('ok','Connected to Google Sheet');
    render();
  }catch(e){
    console.error(e);
    showConnection('error',`Google Sheet not connected: ${e.message||'Unknown error'}`);
    render();
  }
}
function keyOf(r,k){const want=String(k).trim().toUpperCase();const hit=Object.keys(r||{}).find(x=>String(x).trim().toUpperCase()===want);return hit?String(r[hit]??''):''}
function mapTraining(a=[]){return a.map(r=>({id:keyOf(r,'ID'),date:normalizeDate(keyOf(r,'DATE')),name:keyOf(r,'NAME').trim(),slot:keyOf(r,'SLOT').trim(),tech:keyOf(r,'TECHNOLOGY').trim(),duration:keyOf(r,'DURATION').trim(),status:(keyOf(r,'STATUS')||'Attended').trim(),candidateId:keyOf(r,'CANDIDATE_ID').trim()})).filter(x=>x.date&&x.name)}
function mapCandidates(a=[]){return a.map(r=>({id:keyOf(r,'ID'),name:keyOf(r,'NAME').trim(),tech:keyOf(r,'TECHNOLOGY').trim(),contact:keyOf(r,'CONTACT').trim(),placement:(keyOf(r,'PLACEMENT_STATUS')||'Training').trim(),company:keyOf(r,'PLACEMENT_COMPANY').trim()})).filter(x=>x.name)}
function mapInterviews(a=[]){
  return a.map(r=>({
    id:keyOf(r,'ID'),
    date:normalizeDate(keyOf(r,'DATE')),
    coordinator:keyOf(r,'COORDINATOR').trim(),
    name:keyOf(r,'NAME').trim(),
    company:keyOf(r,'COMPANY').trim(),
    tech:keyOf(r,'TECHNOLOGY').trim(),
    time:keyOf(r,'TIME').trim(),
    round:keyOf(r,'ROUND').trim(),
    mode:keyOf(r,'INTERVIEW_MODE').trim(),
    virtual:keyOf(r,'VIRTUAL').trim(),
    support:keyOf(r,'SUPPORT').trim(),
    recruiter:keyOf(r,'RECRUITER').trim(),
    response:keyOf(r,'RESPONSE').trim(),
    status:keyOf(r,'STATUS').trim(),
    feedback:keyOf(r,'FEEDBACK').trim(),
    candidateId:keyOf(r,'CANDIDATE_ID').trim()
  })).filter(x=>x.date&&x.name)
}
function mapFeedback(a=[]){const o={};a.forEach(r=>{const name=keyOf(r,'NAME').trim();if(name)o[name]={response:keyOf(r,'RESPONSE'),performance:keyOf(r,'PERFORMANCE'),text:keyOf(r,'FEEDBACK')}});return o}
function showConnection(k,t){
  const cls='status-pill '+(k==='ok'?'status-ok':k==='error'?'status-error':'status-checking');
  const e=$('connectionStatus'); if(e){e.className=cls;e.textContent=t}
  const s=$('sideConnection'); if(s){s.className=cls;s.textContent=t}
  const reason=$('refreshReason');if(reason)reason.textContent=k==='error'?`Refresh failed: ${t}. Check internet, deployment access, and Google Sheet permissions.`:k==='checking'?'Refreshing Google Sheets…':'Auto refresh every 10 minutes';
}
function dateObj(s){return new Date(String(s||'')+'T12:00:00')}
function startOfWeek(dateValue){const d=dateObj(dateValue||$('progressDate')?.value||new Date().toISOString().slice(0,10));const day=d.getDay();const diff=day===0?-6:1-day;d.setDate(d.getDate()+diff);return d}
function inSelectedPeriod(dateValue){const mode=$('progressPeriod')?.value||'weekly';const d=String(dateValue||'');if(!d)return false;if(mode==='monthly')return d.startsWith($('month').value);const start=startOfWeek($('progressDate')?.value||$('dailyDate').value);const end=new Date(start);end.setDate(end.getDate()+4);const target=dateObj(d);return target>=start&&target<=new Date(end.getFullYear(),end.getMonth(),end.getDate(),23,59,59)}
function periodTraining(){return training.filter(x=>inSelectedPeriod(x.date))}
function periodInterviews(){return interviews.filter(x=>inSelectedPeriod(x.date))}
function attendanceLabel(rows){const total=rows.length,att=rows.filter(x=>String(x.status).toLowerCase()==='attended').length,ns=rows.filter(x=>String(x.status).toLowerCase().includes('no-show')||String(x.status).toLowerCase().includes('no show')).length;return {total,att,ns}}
function candidateByName(name){const q=normalizeName(name);return candidates.find(c=>normalizeName(c.name)===q)}
function candidateTechnology(name,rows){const c=candidateByName(name);return c?.tech||rows.find(x=>x.tech)?.tech||''}
function getCandidateRowsForPeriod(name){return periodTraining().filter(x=>normalizeName(x.name)===normalizeName(name))}
function enrichTrainingForDisplay(){
  const byName=new Map(candidates.map(c=>[normalizeName(c.name),c]));
  const counts={};
  const sorted=training.slice().sort((a,b)=>a.date.localeCompare(b.date));
  for(const x of sorted){
    const c=byName.get(normalizeName(x.name));
    if(!x.tech&&c?.tech)x.tech=c.tech;
    const key=weekKeyClient(x.date)+'|'+normalizeName(x.name);
    if(!x.slot){counts[key]=(counts[key]||0)+1;x.slot=ordinalSlotClient(counts[key]);}
    else counts[key]=(counts[key]||0)+1;
  }
}
function weekKeyClient(dateValue){
  const d=dateObj(dateValue);
  if(Number.isNaN(d.getTime()))return '';
  const day=d.getDay();
  d.setDate(d.getDate()+(day===0?-6:1-day));
  if(Number.isNaN(d.getTime()))return '';
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function ordinalSlotClient(n){const m=n%100;if(m>=11&&m<=13)return n+'th Slot';switch(n%10){case 1:return n+'st Slot';case 2:return n+'nd Slot';case 3:return n+'rd Slot';default:return n+'th Slot'}}
function render(){
  const t=monthRows(training),i=monthRows(interviews),a=t.filter(x=>x.status==='Attended').length,n=t.filter(x=>x.status==='No-Show').length,total=a+n,p=total?Math.round(a/total*100):0;
  const set=(id,v)=>{const e=$(id);if(e)e.textContent=v};
  set('heroMonth',new Date($('month').value+'-01').toLocaleString('en-US',{month:'long',year:'numeric'}));
  set('candidatesCount',candidates.length);set('sessionsCount',t.length);set('attendedCount',a);set('noshowCount',n);set('interviewCount',i.length);set('pct',p+'%');set('da',a);set('dn',n);
  const donut=$('donut');if(donut)donut.style.background=`conic-gradient(#3b82f6 0 ${p}%,#ef4444 ${p}% 100%)`;
  const days=['Mon','Tue','Wed','Thu','Fri'],counts=days.map((_,idx)=>t.filter(x=>[1,2,3,4,5][idx]===new Date(x.date+'T12:00:00').getDay()).length),mx=Math.max(1,...counts);
  const bars=$('bars');if(bars)bars.innerHTML=days.map((d,k)=>`<div class="barcol"><small>${counts[k]}</small><div class="bar" style="height:${Math.max(5,counts[k]/mx*130)}px"></div><small>${d}</small></div>`).join('');
  renderCandidateProgress();renderDaily();renderCandidates();renderInterviews();buildNotifications();renderNotificationBadge();
}
function renderCandidateProgress(){
  const body=$('topCandidatePreview'); if(!body)return;
  const q=($('progressSearch')?.value||'').trim().toLowerCase();
  const rows=periodTraining();
  const ints=periodInterviews();
  const list=candidates.filter(c=>!q||c.name.toLowerCase().includes(q));
  const mode=$('progressPeriod')?.value||'weekly';
  const label=mode==='monthly' ? `Monthly · ${new Date($('month').value+'-01').toLocaleString('en-US',{month:'long',year:'numeric'})}` : `Weekly · ${$('progressDate')?.value||$('dailyDate').value}`;
  const sub=$('progressPeriodLabel');if(sub)sub.textContent=label;
  const countEl=$('candidateProgressCount');if(countEl)countEl.textContent=`${list.length} candidate(s)`;
  body.innerHTML=list.map(c=>{
    const tr=rows.filter(x=>normalizeName(x.name)===normalizeName(c.name));
    const ir=ints.filter(x=>normalizeName(x.name)===normalizeName(c.name));
    const stats=attendanceLabel(tr);
    const f=feedback[c.name]||{};
    return `<tr><td>${list.indexOf(c)+1}</td><td><b>${esc(c.name)}</b></td><td><b>${ir.length}</b></td><td><span class="att-count">${stats.att}/${stats.total} Attended</span> &nbsp; <span class="no-count">${stats.ns} No-Show</span></td><td><span class="placement-badge">${esc(c.placement||'Training')}</span>${c.company?' <span class="company">'+esc(c.company)+'</span>':''}</td><td>${esc(f.performance||'Not added')}</td></tr>`;
  }).join('')||'<tr><td colspan="6" class="empty-row">No matching candidates found</td></tr>';
}
function renderDaily(){
  const date=$('dailyDate').value;
  const r=training.filter(x=>x.date===date);
  const dailyTable=$('dailyTable');
  const dailyCount=$('dailyRowCount');if(dailyCount)dailyCount.textContent=`${r.length} record(s)`;
  if(dailyTable)dailyTable.innerHTML=r.map((x,i)=>`<tr><td>${i+1}</td><td>${x.date}</td><td>${esc(x.name)}</td><td>${esc(x.slot)}</td><td>${esc(x.tech)}</td><td><span class="duration-badge ${x.status==='No-Show'?'noshow':''}">${esc(x.duration)} – ${esc(x.status)}</span></td></tr>`).join('')||`<tr><td colspan="6" class="empty-row">No training sessions for ${date}</td></tr>`;
  const m=$('month').value;
  const monthly=training.filter(x=>String(x.date||'').startsWith(m));
  const q=($('dailySearch')?.value||'').trim().toLowerCase();
  const filtered=q?monthly.filter(x=>normalizeName(x.name).includes(normalizeName(q))):monthly;
  const stats=attendanceLabel(filtered);
  const set=(id,v)=>{const e=$(id);if(e)e.textContent=v};
  set('dailyMonthLabel',new Date(m+'-01').toLocaleString('en-US',{month:'long',year:'numeric'}));
  set('dailyMonthCandidates',new Set(monthly.map(x=>normalizeName(x.name))).size);
  set('dailyMonthSessions',monthly.length);
  set('dailyMonthAttended',monthly.filter(x=>String(x.status).toLowerCase()==='attended').length);
  set('dailyMonthNoShows',monthly.filter(x=>String(x.status).toLowerCase().includes('no-show')||String(x.status).toLowerCase().includes('no show')).length);
  const mb=$('dailyMonthlyTable');
  const monthlyCount=$('monthlyRowCount');if(monthlyCount)monthlyCount.textContent=`${new Set(filtered.map(x=>normalizeName(x.name))).size} candidate(s) · ${filtered.length} session(s)`;
  if(mb){const names=[...new Set(filtered.map(x=>x.name))].sort((a,b)=>a.localeCompare(b));mb.innerHTML=names.map((name,i)=>{const rows=filtered.filter(x=>normalizeName(x.name)===normalizeName(name));const st=attendanceLabel(rows);const tech=candidateTechnology(name,rows)||'—';return `<tr><td>${i+1}</td><td><b>${esc(name)}</b></td><td>${rows.length}</td><td>${st.att}</td><td>${st.ns}</td><td>${esc(tech)}</td></tr>`}).join('')||'<tr><td colspan="6" class="empty-row">No matching candidates for this month</td></tr>';  }
  const hint=$('dailySearchHint');if(hint)hint.textContent=q?`Showing monthly results for “${q}”`:'All candidates for selected month';
}
function renderCandidates(){
  const q=$('search').value.trim().toLowerCase();
  if(q&&!candidates.some(c=>c.name.toLowerCase().includes(q))){$('candidateResultHint').textContent='No profile found';$('candidateGrid').innerHTML='';return}
  $('candidateResultHint').textContent=q?`Showing ${candidates.filter(c=>c.name.toLowerCase().includes(q)).length} matching profile(s)`:`All candidate profiles · ${candidates.length} total`;
  const list=(q?candidates.filter(c=>c.name.toLowerCase().includes(q)):candidates);
  $('candidateGrid').innerHTML=list.map(c=>{
    const r=training.filter(x=>normalizeName(x.name)===normalizeName(c.name));
    const f=feedback[c.name]||{};
    const st=attendanceLabel(r);
    const ir=interviews.filter(x=>normalizeName(x.name)===normalizeName(c.name));
    return `<div class="candidate"><div class="candidate-head"><div><h3>${esc(c.name)}</h3><div class="meta">${esc(c.tech||candidateTechnology(c.name,r)||'Technology not added')}</div></div><div class="candidate-actions"><button onclick="editCandidate('${esc(c.name)}')">Edit</button><button class="danger" onclick="deleteCandidate('${esc(c.name)}')">Delete</button></div></div><div class="profile-row"><span class="placement-badge">${esc(c.placement||'Training')}</span>${c.company?`<span class="company">${esc(c.company)}</span>`:''}</div><div class="candidate-stats"><div><b>${st.att}/${st.total}</b><span>Attended</span></div><div><b>${st.ns}</b><span>No-Show</span></div><div><b>${ir.length}</b><span>Interviews</span></div></div><div class="feedback"><b>Response:</b> ${esc(f.response||'Not added')}<br><b>Performance:</b> ${esc(f.performance||'Not added')}<br><b>Feedback:</b> ${esc(f.text||'No feedback added yet.')}</div></div>`
  }).join('')||'<div class="panel">No candidates found.</div>'
}
function renderInterviews(){
  const month=$('interviewMonth')?.value||$('month').value;
  const q=($('interviewSearch')?.value||'').trim().toLowerCase();
  const statusFilter=$('interviewStatusFilter')?.value||'';
  const companyFilter=($('interviewCompanyFilter')?.value||'').trim().toLowerCase();
  const sorted=interviews.slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
  const monthBase=sorted.filter(x=>!month||String(x.date||'').startsWith(month));
  const r=monthBase.filter(x=>(!q||[x.name,x.company,x.tech,x.coordinator,x.round,x.status,x.feedback].some(v=>String(v||'').toLowerCase().includes(q)))&&(!statusFilter||String(x.status||'').toLowerCase()===statusFilter.toLowerCase())&&(!companyFilter||String(x.company||'').toLowerCase().includes(companyFilter)));
  const label=$('interviewMonthLabel'); if(label)label.textContent=month?new Date(month+'-01T12:00:00').toLocaleString('en-US',{month:'long',year:'numeric'}):'All months';
  const set=(id,v)=>{const e=$(id);if(e)e.textContent=v};
  set('interviewTotal',monthBase.length);set('interviewSelected',monthBase.filter(x=>/selected/i.test(x.status)).length);set('interviewRescheduled',monthBase.filter(x=>/reschedul/i.test(x.status)).length);set('interviewPending',monthBase.filter(x=>!String(x.status||'').trim()||/pending|waiting|imported/i.test(x.status)).length);
  const body=$('interviewTable');
  if(body){body.innerHTML=r.map((x,i)=>`<tr><td>${i+1}</td><td>${esc(x.date)}</td><td>${esc(x.coordinator||'—')}</td><td><b>${esc(x.name)}</b></td><td>${esc(x.company||'—')}</td><td>${esc(x.tech||'—')}</td><td>${esc(x.time||'—')}</td><td>${esc(x.round||'—')}</td><td>${esc(x.mode||'—')}</td><td>${esc(x.virtual||'—')}</td><td>${esc(x.support||'—')}</td><td>${esc(x.recruiter||'—')}</td><td>${esc(x.response||'—')}</td><td><select class="inline-interview-edit" aria-label="Status" onchange="updateInterviewField('${esc(x.id)}','status',this.value)">${[...new Set(['','Selected','Rejected','Rescheduled','Waiting for Update','Pending','No Show',x.status||''])].map(v=>`<option value="${esc(v)}" ${String(x.status||'')===v?'selected':''}>${esc(v||'— Blank —')}</option>`).join('')}</select></td><td><select class="inline-interview-edit" aria-label="Feedback" onchange="updateInterviewField('${esc(x.id)}','feedback',this.value)">${[...new Set(['', 'Good','Very Good','Average','Poor','Waiting for response','Moved to Next Round','No feedback',x.feedback||''].filter(v=>v!==undefined))].map(v=>`<option value="${esc(v)}" ${String(x.feedback||'')===v?'selected':''}>${esc(v||'— Blank —')}</option>`).join('')}</select></td></tr>`).join('')||'<tr><td colspan="15" class="empty-row">No interviews match these filters.</td></tr>';}
  const count=$('interviewCountHint');if(count)count.textContent=`Showing ${r.length} of ${interviews.length} interviews`;
  const now=new Date();const today=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const recent=sorted.filter(x=>x.date===today), upcoming=sorted.filter(x=>x.date>today);
  const displayDate=v=>{if(!v)return '—';const d=dateObj(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleDateString('en-US',{month:'short',day:'2-digit',year:'numeric'});};
  const renderList=(id,list,empty)=>{const el=$(id);if(!el)return;el.innerHTML=list.length?`<div class="home-interview-tablewrap"><table class="home-interview-table"><thead><tr><th>Date</th><th>Executive</th><th>Candidate</th><th>Client</th><th>Technology</th><th>Time</th><th>Type of Interview</th><th>Platform</th><th>Mode</th></tr></thead><tbody>${list.slice(0,30).map(x=>`<tr><td>${esc(displayDate(x.date))}</td><td>${esc(x.coordinator||'—')}</td><td><b>${esc(x.name)}</b></td><td>${esc(x.company||'—')}</td><td>${esc(x.tech||'—')}</td><td>${esc(x.time||'—')}</td><td>${esc(x.round||'—')}</td><td>${esc(x.mode||'—')}</td><td>${esc(x.virtual||'—')}</td></tr>`).join('')}</tbody></table></div>`:`<p class="muted">${empty}</p>`};
  renderList('interviewPreview',recent,'No interviews scheduled for today.');renderList('upcomingInterviewPreview',upcoming,'No upcoming interviews.');
}
window.updateInterviewField=async(id,field,value)=>{const rec=interviews.find(x=>String(x.id)===String(id));if(!rec)return alert('Interview record ID missing. Refresh data and try again.');try{await jsonp('updateInterview',{id,field,value});rec[field]=value;renderInterviews();}catch(e){alert('Could not update interview: '+e.message);loadAll();}};

function normalizeName(s){return String(s||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ')}
function candidateSuggestions(name){
  const q=normalizeName(name); if(!q)return [];
  return candidates.filter(c=>{
    const n=normalizeName(c.name);
    return n===q || n.includes(q) || q.includes(n) || q.split(' ').some(w=>w.length>=3 && n.includes(w));
  }).slice(0,3);
}
function notificationKey(type,r){return [type,r.id||'',r.date||'',r.name||'',r.slot||r.round||''].join('|').toLowerCase()}
function buildNotifications(){
  const items=[],seen=new Set();
  const add=(type,r)=>{
    const key=notificationKey(type,r);
    if(seen.has(key)||notificationState[key])return;
    seen.add(key);
    const suggestions=candidateSuggestions(r.name);
    const exact=candidates.find(c=>normalizeName(c.name)===normalizeName(r.name));
    if(r.candidateId || exact)return;
    items.push({type,record:r,suggestions,key});
  };
  training.forEach(r=>add('TRAINING',r));
  interviews.forEach(r=>add('INTERVIEWS',r));
  interviews.filter(r=>/waiting for update/i.test(String(r.status||''))).forEach(r=>{
    const key='FOLLOWUP|'+(r.id||'')+'|'+r.date+'|'+r.name;
    if(!seen.has(key)){seen.add(key);items.push({type:'FOLLOWUP',record:r,suggestions:[],key});}
  });
  notificationItems=items;
}
function saveNotificationState(){localStorage.otterNotificationState=JSON.stringify(notificationState)}
window.markNotificationRead=function(index){const n=notificationItems[index];if(!n)return;notificationState[n.key]='read';saveNotificationState();renderNotifications()};
window.deleteNotification=function(index){const n=notificationItems[index];if(!n)return;notificationState[n.key]='deleted';saveNotificationState();renderNotifications()};

function renderNotificationBadge(){
  const b=$('notificationBadge');if(b){b.textContent=notificationItems.length;b.classList.toggle('hidden',notificationItems.length===0)}
}
function renderNotifications(){
  const box=$('notificationList');if(!box)return;
  buildNotifications();
  if(!notificationItems.length){
    box.innerHTML='<div class="notification-empty"><div class="notification-empty-icon">✓</div><h3>No pending notifications</h3><p>All training and interview records are linked to candidate profiles.</p></div>';
    renderNotificationBadge();return;
  }
  box.innerHTML=notificationItems.map((n,i)=>{
    const r=n.record,s=n.suggestions||[];
    if(n.type==='FOLLOWUP')return `<div class="notification-card followup-notice"><div class="notification-card-head"><div class="notification-icon">⏳</div><div><h3>Interview result follow-up</h3><p>${esc(r.date)} · <b>${esc(r.name)}</b> · ${esc(r.company||'—')}</p></div></div><div class="notification-body"><p>Status is <b>Waiting for Update</b>. Please follow up and update the interview status when the result arrives.</p><div class="notification-actions"><button class="notify-read" onclick="showPage('interviews')">Update Interview Status</button></div></div></div>`;
    const suggestionText=s.length?s.map(c=>`<button class="notify-link" onclick="linkNotification(${i},'${String(c.id||'').replace(/'/g,"\\'")}')">Link to ${esc(c.name)}</button>`).join(''):'';
    return `<div class="notification-card ${s.length?'has-suggestion':'missing'}"><div class="notification-card-head"><div class="notification-icon">${s.length?'?':'!'}</div><div><h3>${s.length?'Candidate name needs confirmation':'Candidate profile not found'}</h3><p>${n.type==='TRAINING'?'Training':'Interview'} · ${esc(r.date)} · <b>${esc(r.name)}</b></p></div></div><div class="notification-body">${s.length?`<p>Did you mean <b>${esc(s[0].name)}</b>?</p>${suggestionText}`:`<p>No matching master candidate was found for this record.</p>`}<div class="notification-actions"><button class="notify-add" onclick="addCandidateFromNotification(${i})">+ Add as New Candidate</button><button class="notify-read" onclick="markNotificationRead(${i})">✓ Mark as Read</button><button class="notify-delete" onclick="deleteNotification(${i})">Delete</button></div></div></div>`;
  }).join('');
  renderNotificationBadge();
}
window.linkNotification=async function(index,candidateId){
  const n=notificationItems[index];if(!n)return;
  try{
    const r=n.record;
    await jsonp('linkCandidate',{type:n.type,candidateId,name:r.name,date:r.date,slot:r.slot,round:r.round});
    await loadAll();showPage('notifications');
  }catch(e){alert('Could not link candidate: '+e.message)}
};
window.addCandidateFromNotification=function(index){
  const n=notificationItems[index];
  if(!n)return;

  const r=n.record||{};

  openCandidate();

  // Candidate name from Training/Daily Report
  $('cName').value=r.name||'';

  // Technology only if it exists in the source record.
  // If Technology is blank in Daily Report, keep it blank.
  $('cTech').value=r.tech||r.technology||'';

  // Keep other fields normal/default.
  $('cContact').value='';
  $('cPlacement').value='Training';
  $('cCompany').value='';

  showPage('candidates');
  $('candidateModal').classList.remove('hidden');

  setTimeout(()=>$('cTech').focus(),50);
};
function showPage(page){
  document.querySelectorAll('.page').forEach(p=>p.classList.add('hidden'));
  const target=$(page); if(target) target.classList.remove('hidden');
  document.querySelectorAll('.nav').forEach(n=>n.classList.toggle('active',n.dataset.page===page));
  const titles={dashboard:'Dashboard',daily:'Daily Report',candidates:'Candidates',interviews:'Interviews',notifications:'Notifications'};
  $('title').textContent=titles[page]||'OTTER Training';
  const monthLabel=$('monthFilterLabel');if(monthLabel)monthLabel.style.display=page==='candidates'?'none':'';
  if(page==='notifications') renderNotifications();
}
window.showPage=showPage;
function openCandidate(name=null){$('candidateModalTitle').textContent=name?'Edit Candidate':'Add Candidate';const c=name?candidates.find(x=>x.name===name):{};$('cName').value=c?.name||'';$('cTech').value=c?.tech||'';$('cContact').value=c?.contact||'';$('cPlacement').value=c?.placement||'Training';$('cCompany').value=c?.company||'';$('candidateModal').dataset.edit=name||'';$('candidateModal').classList.remove('hidden')}
window.editCandidate=openCandidate;
async function saveCandidate(){

  const name=$('cName').value.trim();
  const tech=$('cTech').value.trim();
  const contact=$('cContact').value.trim();
  const placement=$('cPlacement').value;
  const company=$('cCompany').value.trim();

  // Basic validation
  if(!name){
    return alert('Candidate name is required.');
  }

  if(name.length<2){
    return alert('Please enter a valid candidate name.');
  }

  // If candidate is marked as Placed, company is required.
  if(placement==='Placed' && !company){
    return alert('Please enter the placement company for a Placed candidate.');
  }

  const old=$('candidateModal').dataset.edit||'';

  // Prevent duplicate candidate profiles.
  const duplicate=candidates.find(c=>
    normalizeName(c.name)===normalizeName(name) &&
    normalizeName(c.name)!==normalizeName(old)
  );

  if(duplicate){
    return alert(
      `Candidate "${duplicate.name}" already exists. Please edit the existing profile instead.`
    );
  }

  const btn=$('saveCandidate');

  btn.disabled=true;
  btn.dataset.oldText=btn.textContent;
  btn.innerHTML='<span class="btn-spinner"></span> Saving Candidate…';
  btn.style.cursor='wait';

  const rec={
    name,
    tech,
    contact,
    placement,
    company
  };

  try{

    // Save to Google Sheet first.
    const result=await jsonp('saveCandidate',{
      ...rec,
      oldName:old
    });

    if(!result || result.success===false){
      throw new Error(
        result?.message || 'Candidate was not saved.'
      );
    }

    // Reload data FROM GOOGLE SHEET.
    await loadAll();

    // Confirm candidate exists in Google Sheet data.
    const saved=candidates.find(c=>
      normalizeName(c.name)===normalizeName(name)
    );

    if(!saved){
      throw new Error(
        'Candidate save was not confirmed by Google Sheet. Please refresh and try again.'
      );
    }

    // Confirm Technology also came back correctly.
    if(
      tech &&
      normalizeName(saved.tech)!==normalizeName(tech)
    ){
      throw new Error(
        'Candidate was saved, but the Technology value was not confirmed in Google Sheet.'
      );
    }

    // Only after Sheet confirmation, close modal.
    $('candidateModal').classList.add('hidden');

    showPage('candidates');

  }catch(e){

    alert(
      'Could not save candidate: '+e.message
    );

  }finally{

    btn.disabled=false;
    btn.textContent=
      btn.dataset.oldText || 'Save Candidate';

    btn.style.cursor='pointer';
  }
}
window.deleteCandidate=async name=>{if(!confirm(`Delete ${name}? Training history will remain.`))return;try{await jsonp('deleteCandidate',{name});await loadAll();alert('Candidate deleted. Training history preserved.')}catch(e){alert('Could not delete candidate: '+e.message)}};
function saveFeedback(){const rec={name:$('fbName').value,response:$('fbResponse').value,performance:$('fbPerformance').value,text:$('fbText').value.trim()};return jsonp('saveFeedback',rec)}
function openFeedback(){if(!candidates.length)return alert('Add a candidate first.');$('fbName').innerHTML=candidates.map(c=>`<option>${esc(c.name)}</option>`).join('');$('modal').classList.remove('hidden')}
async function importInterviews(records){
  let added=0;
  for(let i=0;i<records.length;i+=20){
    const r=await jsonp('saveInterviews',records.slice(i,i+20));
    if(!r||r.success===false)throw new Error(r?.message||'Interview data could not be saved.');
    added+=r.added||0;
  }
  return{added,duplicates:0};
}

function splitInterviewLine(line){
  let s=line.trim();
  if(s.startsWith('|'))s=s.slice(1);
  if(s.endsWith('|'))s=s.slice(0,-1);
  if(s.includes('\t'))return s.split('\t').map(cleanCell);
  if(s.includes('|'))return s.split('|').map(cleanCell);
  // Basic CSV support for pasted/uploaded text.
  if(s.includes(','))return parseSimpleCsvLine(s);
  return [s];
}
function parseSimpleCsvLine(s){
  const out=[];let cur='';let quoted=false;
  for(let i=0;i<s.length;i++){
    const ch=s[i];
    if(ch==='"'){
      if(quoted && s[i+1]==='"'){cur+='"';i++;}
      else quoted=!quoted;
    }else if(ch===','&&!quoted){out.push(cleanCell(cur));cur='';}
    else cur+=ch;
  }
  out.push(cleanCell(cur));
  return out;
}

function parseInterviewText(raw){
  const lines=String(raw||'').replace(/```[a-z]*|```/gi,'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const records=[],skipped=[];
  for(const line of lines){
    if(/^\|?\s*-{2,}(?:\s*\|\s*-{2,})+\s*\|?$/.test(line))continue;
    const c=splitInterviewLine(line);
    if(c.length<5){skipped.push(line);continue;}
    const joined=c.join(' ').toLowerCase();
    if(joined.includes('date')&&joined.includes('technology')&&joined.includes('round'))continue;
    let x=c.slice();
    if(/^\d+$/.test(x[0]))x=x.slice(1);
    if(x.length<5){skipped.push(line);continue;}
    const date=normalizeDate(x[0]);
    const name=cleanCell(x[2]||x[1]||'');
    const record={
      date,
      coordinator:cleanCell(x[1]||''),
      name,
      company:cleanCell(x[3]||''),
      tech:cleanCell(x[4]||''),
      time:cleanCell(x[5]||''),
      round:cleanCell(x[6]||''),
      mode:cleanCell(x[7]||''),
      virtual:cleanCell(x[8]||''),
      support:cleanCell(x[9]||''),
      recruiter:cleanCell(x[10]||''),
      response:cleanCell(x[11]||''),
      status:cleanCell(x[12]||''),
      feedback:cleanCell(x[13]||'')
    };
    if(!date||!name){skipped.push(line);continue;}
    records.push(record);
  }
  return{records,skipped};
}

function copyText(text,successText){
  if(!navigator.clipboard)return alert('Clipboard access is unavailable. Please copy manually.');
  navigator.clipboard.writeText(text).then(()=>alert(successText||'Copied!')).catch(()=>alert('Could not copy. Please copy manually.'));
}

const DAILY_CHATGPT_PROMPT=`Convert the attached screenshot or raw training data into EXACTLY this table format.

Date | Name | Slot | Technology | Duration
2026-09-24 | Sai vardhan | 1st Slot | Python | 2 Hrs – Attended
2026-09-24 | Bhavana | 1st Slot | Contero Engineer | 1hr – Attended

Rules:
- Return ONLY the table. No explanation.
- Use exactly these 5 columns: Date, Name, Slot, Technology, Duration.
- Keep every training row from the screenshot/data.
- Do not invent or remove rows.
- Preserve candidate names and technology exactly as shown.
- Preserve Attended / No-Show.
- For No-Show, put the text like: no show – No-Show.
- Use YYYY-MM-DD dates.
- If Slot or Technology is blank in the source, use -.
- Keep Duration and attendance together in the Duration column.
- Output pipe-separated rows exactly like the example above.`;

const INTERVIEW_CHATGPT_PROMPT=`Convert the attached screenshot or raw interview table into EXACTLY this pipe-separated table format.

| Date | Coordinator | Name | Company | Technology | Time | Round | Interview Mode | Virtual | Support | Recruiter | Response | Status | Feedback |
| 2026-09-24 | naini | Vamsi krishna | Amazon | AI/ML | 12:15 PM - 12:45 PM EST | 1st Round | Phone Call | Virtual | Support | Sarant | Good | Selected | waiting for response |

Rules:
- Return ONLY the table. No explanation.
- Keep exactly these 14 columns and this order.
- Preserve every interview row.
- Do not invent missing values; leave them blank.
- Keep company, candidate name, technology/role, time, round, mode and status exactly as source.
- Technology/Role may be values such as Control Engineer, AI/ML, or Marketing Executive; do not change the wording.
- Put interview result such as Selected, Rejected, Rescheduled or Waiting for response in Status.
- Put comments such as waiting for response in Feedback.
- Use YYYY-MM-DD dates.
- Do not drop rows because some cells are blank.
- Do not add markdown explanations before or after the table.`;


$('month').onchange=()=>{const m=$('month').value;if(!$('dailyDate').value.startsWith(m))$('dailyDate').value=m+'-01';render()};$('dailySearch')?.addEventListener('input',renderDaily);$('dailyDate').onchange=()=>{renderDaily();if($('progressPeriod')?.value==='weekly'){if($('progressDate'))$('progressDate').value=$('dailyDate').value;renderCandidateProgress();}};$('search').oninput=renderCandidates;$('progressSearch')?.addEventListener('input',renderCandidateProgress);$('progressPeriod')?.addEventListener('change',()=>{const mode=$('progressPeriod').value;if($('progressDate'))$('progressDate').style.display=mode==='weekly'?'block':'none';renderCandidateProgress();});$('progressDate')?.addEventListener('change',renderCandidateProgress);
$('feedbackBtn').onclick=openFeedback;$('close').onclick=()=>$('modal').classList.add('hidden');$('saveFeedback').onclick=async()=>{try{await saveFeedback();$('fbText').value='';$('modal').classList.add('hidden');await loadAll();alert('Feedback saved.')}catch(e){alert('Could not save feedback: '+e.message)}};
$('pasteDailyBtn').onclick=()=>{$('dailyPaste').value='';$('pastePreview').innerHTML='';$('dailyImportModal').classList.remove('hidden');setTimeout(()=>$('dailyPaste').focus(),50)};$('dailyImportClose').onclick=()=>$('dailyImportModal').classList.add('hidden');
$('previewDaily').onclick=()=>{const p=parseDailyText($('dailyPaste').value);lastParsedDaily=p.records;const btn=$('importDaily');if(btn)btn.disabled=!!p.errors.length||!p.records.length;if(p.errors.length){$('pastePreview').innerHTML=`<div class="preview-warn"><b>Fix ${p.errors.length} validation issue(s) before importing.</b><br><br>${p.errors.map(esc).join('<br>')}</div>`;return}if(!p.records.length){$('pastePreview').innerHTML='<div class="preview-warn">No valid rows found.</div>';return}$('pastePreview').innerHTML=`<div class="preview-good"><b>${p.records.length} row(s) ready.</b><br><small>Blank Slot/Technology will be filled automatically.</small><br><br>${p.records.slice(0,8).map(r=>`${esc(r.date)} · ${esc(r.name)} · ${esc(r.slot||'Auto Slot')} · ${esc(r.technology||'Auto from candidate')} · ${esc(r.duration)} – ${esc(r.status)}`).join('<br>')}</div>`};
$('importDaily').onclick=async()=>{

  const p=parseDailyText($('dailyPaste').value);

  if(!p.records.length){
    return alert('No valid daily data found.');
  }

  const b=$('importDaily');

  b.disabled=true;
  b.dataset.oldText=b.textContent;
  b.innerHTML=
    '<span class="btn-spinner"></span> Validating & Importing…';

  b.style.cursor='wait';

  try{

    // Validate required Daily Report fields.
    const invalid=p.records.filter(r=>
      !r.date ||
      !r.name ||
      !r.duration ||
      !r.status
    );

    if(invalid.length){
      throw new Error(
        `${invalid.length} row(s) are missing required data.`
      );
    }

    // Save records into TRAINING Google Sheet.
    const r=await jsonp(
      'addTraining',
      p.records
    );

    if(!r || r.success===false){
      throw new Error(
        r?.message || 'Training data was not saved.'
      );
    }

    // Reload actual data from Google Sheet.
    await loadAll();

    // Verify imported records exist in Sheet data.
    const missing=p.records.filter(x=>
      !training.some(t=>
        t.date===x.date &&
        normalizeName(t.name)===normalizeName(x.name) &&
        normalizeName(t.status)===normalizeName(x.status)
      )
    );

    if(missing.length){

      throw new Error(
        `${missing.length} imported row(s) could not be confirmed from Google Sheet. Please refresh before continuing.`
      );

    }

    // Close only after successful Sheet confirmation.
    $('dailyImportModal').classList.add('hidden');

    alert(
      `Done! ${r.added||0} record(s) added.` +
      (
        r.duplicates
          ? ` ${r.duplicates} duplicate(s) skipped.`
          : ''
      )
    );

  }catch(e){

    alert(
      'Import failed: '+e.message
    );

  }finally{

    b.disabled=false;

    b.innerHTML=
      b.dataset.oldText || 'Import to Google Sheet';

    b.style.cursor='pointer';
  }
};
$('refreshTraining').onclick=loadAll; if($('globalRefresh'))$('globalRefresh').onclick=loadAll;
$('export').onclick=()=>{const r=training.filter(x=>x.date===$('dailyDate').value),csv='Date,Name,Slot,Technology,Duration\n'+r.map(x=>[x.date,x.name,x.slot,x.tech,`${x.duration} - ${x.status}`].map(v=>`"${String(v).replaceAll('"','""')}"`).join(',')).join('\n'),a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='OTTER_Daily_Report.csv';a.click()};
$('refreshTraining').onclick=loadAll;
if($('globalRefresh'))$('globalRefresh').onclick=loadAll;
if($('refreshInterviews'))$('refreshInterviews').onclick=loadAll;

$('export').onclick=()=>{
  const r=training.filter(x=>x.date===$('dailyDate').value);
  const csv='Date,Name,Slot,Technology,Duration\n'+r.map(x=>[x.date,x.name,x.slot,x.tech,`${x.duration} - ${x.status}`].map(v=>`"${String(v).replaceAll('"','""')}"`).join(',')).join('\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  a.download='OTTER_Daily_Report.csv';
  a.click();
};

if($('copyDailyPrompt'))$('copyDailyPrompt').onclick=()=>copyText(DAILY_CHATGPT_PROMPT,'Daily Report prompt copied!');
if($('copyDailyTable'))$('copyDailyTable').onclick=()=>{
  const date=$('dailyDate').value;
  const rows=training.filter(x=>x.date===date);
  if(!rows.length)return alert('No training data for the selected date.');
  // TSV is intentional here: when pasted directly into Excel/Google Sheets,
  // every value lands in its own cell instead of one cell containing pipes.
  const text=[
    ['Date','Name','Slot','Technology','Duration'],
    ...rows.map(x=>[x.date,x.name,x.slot||'-',x.tech||'-',`${x.duration||'-'} – ${x.status||'Attended'}`])
  ].map(row=>row.map(v=>String(v).replace(/\t/g,' ').replace(/\r?\n/g,' ')).join('\t')).join('\n');
  copyText(text,'Selected Daily Report table copied as spreadsheet cells!');
};

if($('copyInterviewPrompt'))$('copyInterviewPrompt').onclick=()=>copyText(INTERVIEW_CHATGPT_PROMPT,'Interview prompt copied!');
if($('previewInterviews'))$('previewInterviews').onclick=()=>{
  const p=parseInterviewText($('interviewPaste').value);
  const btn=$('importInterviewsBtn');
  if(btn)btn.disabled=!p.records.length;
  if(!p.records.length){
    $('interviewPastePreview').innerHTML='<div class="preview-warn">No valid interview rows found.</div>';
    return;
  }
  $('interviewPastePreview').innerHTML=`<div class="preview-good"><b>${p.records.length} interview row(s) ready.</b><br><small>All 14 source columns will be preserved, including Marketing Executive when present and Feedback.</small><br><br>${p.records.slice(0,8).map(r=>`${esc(r.date)} · ${esc(r.name)} · ${esc(r.company||'—')} · ${esc(r.tech||'—')} · ${esc(r.round||'—')} · ${esc(r.status||'—')} · ${esc(r.feedback||'—')}`).join('<br>')}</div>`;
};

if($('importInterviewsBtn'))$('importInterviewsBtn').onclick=async()=>{
  const p=parseInterviewText($('interviewPaste').value);
  if(!p.records.length)return alert('No valid interview data found.');
  const b=$('importInterviewsBtn');
  b.disabled=true;b.dataset.oldText=b.textContent;b.innerHTML='<span class="btn-spinner"></span> Validating & Importing…';b.style.cursor='wait';
  try{
    const result=await importInterviews(p.records);
    await loadAll();
    const missing=p.records.filter(x=>!interviews.some(i=>i.date===x.date&&normalizeName(i.name)===normalizeName(x.name)&&normalizeName(i.company)===normalizeName(x.company)&&normalizeName(i.round)===normalizeName(x.round)));
    if(missing.length)throw new Error(`${missing.length} interview row(s) could not be confirmed from Google Sheet.`);
    $('interviewImportModal').classList.add('hidden');
    alert(`Done! ${result.added||0} interview record(s) added. Duplicate rows were preserved.`);
  }catch(e){alert('Interview import failed: '+e.message)}
  finally{b.disabled=false;b.textContent=b.dataset.oldText||'Import to Google Sheet';b.style.cursor='pointer';}
};

if($('interviewFile'))$('interviewFile').onchange=async e=>{
  const file=e.target.files&&e.target.files[0];
  if(!file)return;
  try{
    const buf=await file.arrayBuffer();
    const wb=XLSX.read(buf,{type:'array',cellDates:true});
    const ws=wb.Sheets[wb.SheetNames[0]];
    const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:false});
    if(!rows.length)return alert('The selected Excel/CSV file is empty.');
    const text=rows.map(r=>r.map(v=>String(v??'').trim()).join('\t')).join('\n');
    $('interviewPaste').value=text;
    $('interviewImportModal').classList.remove('hidden');
    $('interviewPastePreview').innerHTML='<div class="preview-good"><b>File loaded.</b> Click Preview to validate the interview rows.</div>';
  }catch(err){
    alert('Could not read the Excel/CSV file: '+err.message);
  }finally{
    e.target.value='';
  }
};

if($('pasteInterviewBtn'))$('pasteInterviewBtn').onclick=()=>{
  $('interviewPaste').value='';$('interviewPastePreview').innerHTML='';$('interviewImportModal').classList.remove('hidden');setTimeout(()=>$('interviewPaste').focus(),50);
};
if($('interviewImportClose'))$('interviewImportClose').onclick=()=>$('interviewImportModal').classList.add('hidden');

['interviewMonth','interviewSearch','interviewCompanyFilter','interviewStatusFilter'].forEach(id=>$(id)?.addEventListener(id==='interviewSearch'||id==='interviewCompanyFilter'?'input':'change',renderInterviews));

document.querySelectorAll('.nav').forEach(b=>b.onclick=()=>showPage(b.dataset.page));document.querySelectorAll('#addCandidateBtn,#addCandidateBtn2').forEach(b=>b.onclick=()=>openCandidate());$('candidateClose').onclick=()=>$('candidateModal').classList.add('hidden');$('saveCandidate').onclick=saveCandidate;
render();loadAll();
// Periodic data sync: refresh Google Sheets every 10 minutes.
setInterval(()=>{if(!document.hidden)loadAll();},10*60*1000);
