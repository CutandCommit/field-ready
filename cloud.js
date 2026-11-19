/* Field Ready v6 — optional user-private Firebase sync. Always saves locally first. */
(function(){
'use strict';
const app=window.FieldReadyApp;
const config=window.FIELD_READY_FIREBASE_CONFIG;
const configured=!!(config&&typeof config==='object'&&config.apiKey&&config.authDomain&&config.projectId&&config.appId);
const META_KEY='field-ready-cloud-meta-v6';
const SDK_VER='13.3.0';
const cloud={mode:configured?'loading':'unconfigured',user:null,ref:null,auth:null,db:null,ready:false,busy:false,
  revision:null,remote:null,lastSynced:'',status:'',localHasChanges:false,queued:false,error:'',timer:null};
let meta={};try{meta=JSON.parse(localStorage.getItem(META_KEY)||'{}')||{}}catch{}
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const snapshot=()=>app.getPayload();
const fingerprint=o=>JSON.stringify(o);
const hasData=o=>(Object.keys(o.logs||{}).length+(o.foods||[]).length+(o.weights||[]).length+Object.keys(o.weekSchedules||{}).length+(o.exerciseLibrary||[]).length)>0;
const message=(m)=>{cloud.status=m;paint()};
function storeMeta(){if(!cloud.user)return;meta={uid:cloud.user.uid,revision:cloud.revision,fingerprint:fingerprint(snapshot()),lastSynced:new Date().toISOString()};localStorage.setItem(META_KEY,JSON.stringify(meta));cloud.lastSynced=meta.lastSynced;}
function statusPill(){const pill=document.getElementById('sync-pill');if(!pill)return;
 const labels={unconfigured:'● Saved on this device',loading:'◌ Setting up cloud',signedOut:'● Local only',checking:'◌ Checking cloud',ready:'✓ Cloud synced',saving:'◌ Syncing',offline:'! Offline · saved here',conflict:'! Choose cloud copy',error:'! Cloud needs attention'};
 pill.textContent=labels[cloud.mode]||'● Saved on this device';pill.title='View cloud sync and backups in More';
}
function panel(){
 let html='<h3>☁ Cloud backup & synchronization</h3>';
 if(!configured)return html+'<p class="cloud-status">Not configured · local storage active</p><p class="cloud-small">Your workout sets, food logs, and schedule are still saved locally. For cross-device cloud backup, set up your own free-tier-compatible Firebase project and update <code>cloud-config.js</code>. See <b>CLOUD_SETUP.md</b> in the download. Cloud sync is not active yet.</p>';
 if(cloud.mode==='loading'||cloud.mode==='checking')return html+'<p class="cloud-status">Connecting to your private storage…</p><p class="cloud-small">Your app still works without internet.</p>';
 if(!cloud.user){return html+'<p class="cloud-status">Local data is safe; no cloud account signed in.</p><form class="cloud-login" id="cloud-login-form"><label><span class="field-label">Email</span><input class="field" type="email" id="cloud-email" autocomplete="email" required /></label><label><span class="field-label">Password</span><input class="field" type="password" id="cloud-password" autocomplete="current-password" minlength="6" required /></label><div class="cloud-actions"><button class="btn slim" type="submit" data-mode="signin">Sign in</button><button class="btn secondary slim" type="submit" data-mode="signup">Create cloud account</button></div></form><p class="cloud-small">Sign in using Firebase Authentication. Do not reuse an important password. Your fitness data goes only to your configured Firebase project—not this public GitHub repository.</p>'+(cloud.error?`<div class="cloud-danger">${escape(cloud.error)}</div>`:'')}
 const who='<p class="cloud-small">Signed in as <b>'+escape(cloud.user.email||'your account')+'</b></p>';
 if(cloud.mode==='conflict')return html+who+'<div class="cloud-danger"><b>Two versions of your records were found.</b><p>To prevent lost workouts, automatic sync is paused. Export a backup before choosing which copy to keep.</p></div><div class="cloud-actions"><button class="btn secondary slim" type="button" data-cloud-action="backup-local">Download this device backup</button><button class="btn secondary slim" type="button" data-cloud-action="backup-remote">Download cloud backup</button></div><div class="cloud-actions"><button class="btn slim" type="button" data-cloud-action="pull">Use cloud version</button><button class="btn secondary slim" type="button" data-cloud-action="push">Use this device</button></div><p class="cloud-small">Choosing one version replaces the other after confirmation. The untouched copy can be downloaded first.</p><button class="btn ghost slim" data-cloud-action="signout">Sign out</button>';
 const label=cloud.mode==='ready'?'✓ Synced':cloud.mode==='saving'?'Saving…':cloud.mode==='offline'?'Offline · safely saved here':cloud.mode==='error'?'Sync needs attention':'Connected';
 html+=who+`<p class="cloud-status">${escape(label)}${cloud.lastSynced?' · last successful sync '+escape(new Date(cloud.lastSynced).toLocaleString()):''}</p>`;
 if(cloud.error)html+='<div class="cloud-danger">'+escape(cloud.error)+'</div>';
 html+='<p class="cloud-small">Local saving always stays on. Changes sync when online and signed in. If two devices edit the same history separately, you will choose the version to keep.</p><div class="cloud-actions"><button type="button" class="btn secondary slim" data-cloud-action="sync">Sync now</button><button type="button" class="btn ghost slim" data-cloud-action="signout">Sign out</button></div>';
 return html;
}
function paint(){statusPill();const node=document.getElementById('cloud-panel');if(node)node.innerHTML=panel();}
function setError(err){const code=String(err?.code||'');const raw=String(err?.message||err||'');
 cloud.error=code==='auth/invalid-credential'?'Email or password not recognized.':code==='auth/email-already-in-use'?'An account already uses this email. Sign in instead.':code==='permission-denied'?'Access denied. Check that you published the owner-only Firestore rules.':raw.slice(0,260);
 cloud.mode=navigator.onLine?'error':'offline';paint();}
async function script(src){return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>reject(Error('Could not download Firebase libraries. Try an internet connection.'));document.head.appendChild(s)})}
async function initialize(){if(!configured){paint();return}
 try{
  for(const f of ['firebase-app-compat.js','firebase-auth-compat.js','firebase-firestore-compat.js'])await script('https://www.gstatic.com/firebasejs/'+SDK_VER+'/'+f);
  const fb=window.firebase;fb.initializeApp(config);cloud.auth=fb.auth();cloud.db=fb.firestore();
  cloud.auth.onAuthStateChanged(user=>{cloud.user=user;if(user)checkRemote().catch(setError);else{cloud.ref=null;cloud.ready=false;cloud.mode='signedOut';paint()}},setError);
 }catch(e){setError(e)}
}
function refForUser(){return cloud.db.collection('users').doc(cloud.user.uid).collection('backups').doc('current')}
async function checkRemote(){
 cloud.ready=false;cloud.mode='checking';cloud.error='';paint();cloud.ref=refForUser();
 const doc=await cloud.ref.get({source:'server'});const remote=doc.exists?doc.data():null;
 const local=snapshot(),same=remote?.payload&&fingerprint(remote.payload)===fingerprint(local);
 cloud.remote=remote;cloud.revision=remote?.revision||null;
 if(!remote){cloud.ready=true;cloud.mode='ready';paint();await push(true);return}
 if(same){cloud.ready=true;cloud.mode='ready';storeMeta();paint();return}
 if(!hasData(local)){
  app.adoptPayload(remote.payload);cloud.ready=true;cloud.mode='ready';storeMeta();paint();return;
 }
 // If this device was last synced at the current cloud revision, its local edits
 // can be uploaded; or if the local copy has not changed, pull newer cloud data.
 if(meta.uid===cloud.user.uid&&meta.revision===remote.revision){cloud.ready=true;cloud.mode='ready';paint();await push();return}
 if(meta.uid===cloud.user.uid&&meta.fingerprint===fingerprint(local)){
  app.adoptPayload(remote.payload);cloud.ready=true;cloud.mode='ready';storeMeta();paint();return;
 }
 cloud.mode='conflict';paint();
}
function queueSave(){if(!configured||!cloud.user||!cloud.ready)return;
 const newPrint=fingerprint(snapshot());if(newPrint===meta.fingerprint)return;
 cloud.queued=true;clearTimeout(cloud.timer);cloud.timer=setTimeout(()=>push().catch(setError),1600);
}
async function push(force=false){if(!cloud.user||!cloud.ref||cloud.busy)return;
 if(!navigator.onLine){cloud.mode='offline';cloud.queued=true;paint();return}
 if(!cloud.ready&&!force)return;
 const payload=snapshot(),before=fingerprint(payload),rev=(Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10));
 cloud.busy=true;cloud.mode='saving';cloud.queued=false;paint();
 try{
  const knownRevision=cloud.revision;
  await cloud.db.runTransaction(async tx=>{
   const server=await tx.get(cloud.ref);const current=server.exists?server.data():null;
   if(!force&&current?.revision!==knownRevision)throw Error('cloud-conflict: another device updated the records.');
   tx.set(cloud.ref,{payload,revision:rev,format:1,updatedAt:window.firebase.firestore.FieldValue.serverTimestamp()});
  });
  cloud.revision=rev;cloud.remote={payload,revision:rev};cloud.error='';cloud.ready=true;storeMeta();
  // If the user edited again while the write was in flight, queue another save.
  if(fingerprint(snapshot())!==before)cloud.queued=true;
  cloud.mode='ready';paint();
 }catch(e){if(String(e).includes('cloud-conflict')){cloud.ready=false;try{const latest=await cloud.ref.get({source:'server'});if(latest.exists)cloud.remote=latest.data()}catch{}cloud.mode='conflict';cloud.error='Another device changed the cloud copy. Choose a version to keep.';paint();}else setError(e)}
 finally{cloud.busy=false;if(cloud.queued&&cloud.ready)queueSave();}
}
async function useCloud(){if(!cloud.ref)return;
 if(!confirm('Use your CLOUD copy on this device? This will replace current local workout and nutrition records. Download a backup first.'))return;
 const remote=await cloud.ref.get({source:'server'});if(!remote.exists)throw Error('Cloud copy was not found.');
 app.backup();app.adoptPayload(remote.data().payload);cloud.revision=remote.data().revision;cloud.remote=remote.data();cloud.error='';cloud.ready=true;cloud.mode='ready';storeMeta();paint();app.toast('Cloud copy restored ✓')
}
async function useLocal(){if(!confirm('Replace your CLOUD copy with the records on THIS device? Download the cloud backup first if you need both.'))return;
 cloud.ready=true;await push(true);if(cloud.mode==='ready')app.toast('This device is now your synced copy ✓')
}
function downloadRemote(){const o=cloud.remote?.payload;if(!o){app.toast('No cloud copy available');return}
 const a=document.createElement('a');const url=URL.createObjectURL(new Blob([JSON.stringify(o,null,2)],{type:'application/json'}));a.href=url;a.download='Field_Ready_Cloud_Backup.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000)
}
async function action(type){try{
 if(type==='backup-local'){app.backup();return}
 if(type==='backup-remote'){downloadRemote();return}
 if(type==='signout'){clearTimeout(cloud.timer);cloud.ready=false;await cloud.auth.signOut();cloud.status='Signed out. Local records remain.';return}
 if(!cloud.user)return;
 if(type==='pull')return await useCloud();
 if(type==='push')return await useLocal();
 if(type==='sync'){if(cloud.mode==='conflict')return;if(!cloud.ready)return checkRemote();const server=await cloud.ref.get({source:'server'});if(server.exists&&server.data().revision!==cloud.revision){return checkRemote()}return push()}
 }catch(e){setError(e)}}
document.addEventListener('click',e=>{const b=e.target.closest('[data-cloud-action]');if(!b)return;action(b.dataset.cloudAction)});
document.addEventListener('submit',async e=>{
 if(e.target.id!=='cloud-login-form')return;e.preventDefault();const form=e.target;
 const email=form.querySelector('#cloud-email').value.trim(),password=form.querySelector('#cloud-password').value;
 const which=e.submitter?.dataset.mode||'signin';
 if(!email||password.length<6)return;
 cloud.mode='loading';cloud.error='';paint();
 try{if(which==='signup')await cloud.auth.createUserWithEmailAndPassword(email,password);
     else await cloud.auth.signInWithEmailAndPassword(email,password)}catch(err){cloud.user=null;setError(err)}
});
window.addEventListener('online',()=>{if(cloud.user){if(cloud.ready)queueSave();else checkRemote().catch(setError)}});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&cloud.user&&!cloud.busy){
 if(cloud.ready){cloud.ref.get({source:'server'}).then(doc=>{if(doc.exists&&doc.data().revision!==cloud.revision)checkRemote().catch(setError);else queueSave()}).catch(()=>{})}
 }});
window.FieldReadyCloud={paint,queueSave,status:()=>({mode:cloud.mode,ready:cloud.ready})};
paint();initialize();
})();
