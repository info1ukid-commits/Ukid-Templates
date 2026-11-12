import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, query, where, orderBy, serverTimestamp, onSnapshot, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let allTemplates = [];
let firebaseTemplates = [];
let currentFilter = 'all';
let currentPreviewCode = '';
let isCurrentUserAdmin = false;
let currentPremiumId = null;

function toast(m){
  const t=document.getElementById('toast');
  if(!t) return;
  t.textContent=m;
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),3000);
}

onAuthStateChanged(auth, async user=>{
  currentUser=user;
  try {
    isCurrentUserAdmin = user ? (await user.getIdTokenResult()).claims.admin === true : false;
  } catch (error) {
    isCurrentUserAdmin = false;
    console.error('Unable to verify administrator permissions:', error);
  }
  const nameEl=document.getElementById('userName');
  const countEl=document.getElementById('userCount');
  const avatarEl=document.getElementById('userAvatar');
  if(user){
    if(nameEl) nameEl.textContent=user.displayName||user.email.split('@')[0];
    if(countEl) countEl.textContent=user.email;
    if(avatarEl) avatarEl.src=user.photoURL||`https://ui-avatars.com/api/?name=${encodeURIComponent(user.email)}&background=ff7200&color=fff`;
    if(window.checkAdmin) window.checkAdmin(isCurrentUserAdmin);
  } else {
    if(nameEl) nameEl.textContent='Guest';
    if(countEl) countEl.textContent='Login to publish';
    if(window.checkAdmin) window.checkAdmin(false);
  }
});

const sidebar=document.getElementById('dashboardSidebar2');
const overlay=document.getElementById('sidebarOverlay2');
const mobileMenu=document.getElementById('mobileMenu2');
const mobileClose=document.getElementById('mobileClose2');
if(mobileMenu) mobileMenu.onclick=()=>{sidebar.classList.add('active');overlay.classList.add('active')};
if(mobileClose) mobileClose.onclick=()=>{sidebar.classList.remove('active');overlay.classList.remove('active')};
if(overlay) overlay.onclick=()=>{sidebar.classList.remove('active');overlay.classList.remove('active')};

const seedTemplates = [
  {id:'seed1',title:'HTML Boilerplate',desc:'Universal starter for every HTML page',category:'html',lang:'html',code:'<!DOCTYPE html>\n<html lang="en">\n<head><meta charset="UTF-8"><title>My site</title></head>\n<body><h1>Hello world</h1></body>\n</html>',public:true,isPremium:false,author:'Ukid Team',copies:142, createdAt:{seconds:Date.now()/1000}},
  {id:'seed2',title:'Glass Card',desc:'Modern glassmorphism card with blur effect',category:'css',lang:'css',code:'.card {\n background: rgba(255,255,255,0.1);\n backdrop-filter: blur(10px);\n border: 1px solid rgba(255,255,255,0.2);\n border-radius: 16px;\n padding: 20px;\n}',public:true,isPremium:false,author:'Ukid Team',copies:89, createdAt:{seconds:Date.now()/1000-100}},
  {id:'seed3',title:'Gradient Button Pro 👑',desc:'Premium animated orange gradient - Pro version',category:'css',lang:'css',code:'.btn-ukid {\n background: linear-gradient(135deg,#ff7200,#ff8c1a);\n color: white;\n padding: 12px 24px;\n border-radius: 10px;\n border: none;\n font-weight: 600;\n cursor: pointer;\n transition: 0.3s;\n}\n.btn-ukid:hover {\n transform: translateY(-2px);\n box-shadow: 0 10px 20px rgba(255,114,0,0.3);\n}',public:true,isPremium:true,author:'Ukid Team',copies:210, createdAt:{seconds:Date.now()/1000-200}},
  {id:'seed4',title:'Copy to Clipboard',desc:'Modern clipboard copy function',category:'js',lang:'js',code:'async function copyText(text) {\n try {\n await navigator.clipboard.writeText(text);\n console.log("Copied: " + text);\n } catch (err) {\n console.error("Failed");\n }\n}',public:true,isPremium:false,author:'Community',copies:67, createdAt:{seconds:Date.now()/1000-300}},
  {id:'seed5',title:'Tailwind Hero Premium 👑',desc:'Premium Tailwind landing hero - converts best',category:'tailwind',lang:'html',code:'<section class="bg-black text-white py-20 px-6 text-center">\n <h1 class="text-5xl font-bold mb-4">Build faster</h1>\n <p class="text-gray-400 mb-8">Premium templates for creators</p>\n <button class="bg-orange-500 px-6 py-3 rounded-lg font-semibold">Get Started</button>\n</section>',public:true,isPremium:true,author:'Ukid Team',copies:98, createdAt:{seconds:Date.now()/1000-400}},
  {id:'seed6',title:'Login Form',desc:'Clean login form structure',category:'forms',lang:'html',code:'<form style="max-width:320px;margin:0 auto;background:#111;padding:24px;border-radius:12px">\n <input type="email" placeholder="Email"><input type="password" placeholder="Password"><button>Login</button>\n</form>',public:true,isPremium:false,author:'Ukid',copies:54, createdAt:{seconds:Date.now()/1000-500}},
  {id:'seed7',title:'Accessible Navigation',desc:'Semantic navigation with a descriptive label and useful links',category:'html',lang:'html',code:'<header>\n  <a href="/" aria-label="Acme home">Acme</a>\n  <nav aria-label="Main navigation">\n    <ul>\n      <li><a href="#work">Work</a></li>\n      <li><a href="#about">About</a></li>\n      <li><a href="#contact">Contact</a></li>\n    </ul>\n  </nav>\n</header>',public:true,isPremium:false,author:'Ukid Team',copies:0,createdAt:{seconds:Date.now()/1000-600}},
  {id:'seed8',title:'Project Portfolio Card',desc:'A reusable project card with an image, summary, and clear link',category:'html',lang:'html',code:'<article class="project-card">\n  <img src="project-preview.jpg" alt="Preview of the weather dashboard project">\n  <div>\n    <p class="eyebrow">Web application</p>\n    <h2>Weather dashboard</h2>\n    <p>A small forecast interface built for quick planning.</p>\n    <a href="#weather-project">View project</a>\n  </div>\n</article>',public:true,isPremium:false,author:'Ukid Team',copies:0,createdAt:{seconds:Date.now()/1000-700}},
  {id:'seed9',title:'Accessible Contact Form',desc:'A labelled form with browser-native email validation',category:'forms',lang:'html',code:'<form action="/contact" method="post">\n  <label for="contact-name">Name</label>\n  <input id="contact-name" name="name" autocomplete="name" required>\n  <label for="contact-email">Email</label>\n  <input id="contact-email" name="email" type="email" autocomplete="email" required>\n  <label for="contact-message">Message</label>\n  <textarea id="contact-message" name="message" rows="5" required></textarea>\n  <button type="submit">Send message</button>\n</form>',public:true,isPremium:false,author:'Ukid Team',copies:0,createdAt:{seconds:Date.now()/1000-800}},
  {id:'seed10',title:'Responsive Card Grid',desc:'A content grid that adapts to available space without fixed breakpoints',category:'css',lang:'css',code:'.card-grid {\n  display: grid;\n  grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr));\n  gap: 1.25rem;\n}\n\n.card {\n  min-width: 0;\n  padding: 1.5rem;\n  border: 1px solid #d8dee8;\n  border-radius: 1rem;\n}',public:true,isPremium:false,author:'Ukid Team',copies:0,createdAt:{seconds:Date.now()/1000-900}},
  {id:'seed11',title:'Keyboard Focus States',desc:'Visible keyboard focus styles for links and buttons',category:'css',lang:'css',code:'a:focus-visible,\nbutton:focus-visible {\n  outline: 3px solid #ff8738;\n  outline-offset: 3px;\n}\n\nbutton {\n  border: 0;\n  border-radius: 0.6rem;\n  padding: 0.75rem 1rem;\n  background: #182131;\n  color: #fff;\n  cursor: pointer;\n}',public:true,isPremium:false,author:'Ukid Team',copies:0,createdAt:{seconds:Date.now()/1000-1000}},
  {id:'seed12',title:'CSS Theme Variables',desc:'Centralize colors and spacing for consistent styles',category:'css',lang:'css',code:':root {\n  color-scheme: light;\n  --color-surface: #fff;\n  --color-text: #182131;\n  --color-accent: #d94f00;\n  --space-card: 1.5rem;\n}\n\n.card {\n  padding: var(--space-card);\n  color: var(--color-text);\n  background: var(--color-surface);\n  border: 1px solid color-mix(in srgb, var(--color-text) 15%, transparent);\n}\n\n.card a {\n  color: var(--color-accent);\n}',public:true,isPremium:false,author:'Ukid Team',copies:0,createdAt:{seconds:Date.now()/1000-1100}},
  {id:'seed13',title:'JavaScript Click Counter',desc:'A small accessible interaction using a button and text output',category:'js',lang:'js',code:'const button = document.querySelector(\"#increment\");\nconst output = document.querySelector(\"#count\");\nlet count = 0;\n\nbutton.addEventListener(\"click\", () => {\n  count += 1;\n  output.textContent = String(count);\n});',public:true,isPremium:false,author:'Ukid Team',copies:0,createdAt:{seconds:Date.now()/1000-1200}},
];

async function loadTemplates(){
  const resultText=document.getElementById('resultText');
  const totalCount=document.getElementById('totalCount');
  const liveCount=document.getElementById('livePublicCount');
  const libEyebrow=document.getElementById('libEyebrow');
  if(resultText) resultText.textContent='Loading community...';
  try {
    let q;
    try {
      q = query(collection(db,"templates"), where("public","==",true), orderBy("createdAt","desc"));
      const snap = await getDocs(q);
      firebaseTemplates = snap.docs.map(d=>({id:d.id,...d.data()}));
    } catch {
      q = query(collection(db,"templates"), where("public","==",true));
      const snap = await getDocs(q);
      firebaseTemplates = snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
    }
    allTemplates = [...firebaseTemplates,...seedTemplates];
    if(resultText) resultText.textContent= firebaseTemplates.length>0? `Showing ${allTemplates.length} templates (${firebaseTemplates.length} user + ${seedTemplates.length} official)` : `Showing ${seedTemplates.length} official templates - Be the first to publish!`;
    if(totalCount) totalCount.textContent=allTemplates.length;
    if(liveCount && firebaseTemplates.length>0) liveCount.textContent=`• ${firebaseTemplates.length} user published`;
    if(libEyebrow) libEyebrow.textContent=`Community • ${allTemplates.length} snippets`;
    renderTemplates(allTemplates);
    try {
      const realtimeQ = query(collection(db,"templates"), where("public","==",true));
      onSnapshot(realtimeQ, (snapshot)=>{
        const fresh = snapshot.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
        if(fresh.length!== firebaseTemplates.length){
          firebaseTemplates = fresh;
          allTemplates = [...firebaseTemplates,...seedTemplates];
          renderTemplates(currentFilter==='all'? allTemplates : allTemplates.filter(t=>t.category===currentFilter||t.lang===currentFilter|| (currentFilter==='premium' && t.isPremium)));
          if(totalCount) totalCount.textContent=allTemplates.length;
          if(fresh.length>0 && fresh[0].title) toast(`🔥 New: ${fresh[0].title}`);
        }
      });
    } catch(e){}
  } catch(e){
    allTemplates=[...seedTemplates];
    renderTemplates(allTemplates);
    if(resultText) resultText.textContent=`Offline - Showing ${seedTemplates.length} official templates`;
  }
}

function renderTemplates(list){
  const grid=document.getElementById('allTemplatesGrid');
  if(!grid) return;
  if(list.length===0){ grid.innerHTML=`<div style="grid-column:1/-1;text-align:center;padding:40px;color:#666">No templates</div>`; return; }
  grid.innerHTML=list.map(t=>{
    const isPremium=t.isPremium===true;
    const unlocked=localStorage.getItem('unlocked_'+t.id);
    const shouldLock=isPremium &&!unlocked &&!isCurrentUserAdmin;
    return `
    <article class="template-card ${isPremium?'premium-card':''}" style="position:relative; ${isPremium?'border:1px solid rgba(255,114,0,0.4)':''}">
      ${shouldLock? `<div class="locked-overlay"><i class="fas fa-crown"></i><p>Premium Template</p><small style="color:#aaa;margin-bottom:4px">${escapeHtml(t.author||'Pro')}</small><button class="unlock-btn" data-unlock="${t.id}"><i class="fas fa-play"></i> Watch Ad to Unlock</button></div>` : ''}
      <div class="card-top">
        <span class="tag ${t.category}">${(t.category||'HTML').toUpperCase()}</span>
        ${isPremium?'<span class="premium-badge"><i class="fas fa-crown"></i> PREMIUM</span>':''}
        <h2 title="${t.title}">${escapeHtml(t.title).slice(0,30)}</h2>
        ${t.public? `<span class="live-dot"><span></span>Live</span>` : `<span class="private-dot">Private</span>`}
      </div>
      <div class="card-body">
        <p>${escapeHtml(t.desc||'No description')}</p>
        <div class="meta-line"><span><i class="fas fa-user"></i> ${escapeHtml(t.author||'Anonymous')}</span><span><i class="fas fa-copy"></i> ${t.copies||0}</span>${t.createdAt? `<span><i class="fas fa-clock"></i> ${formatDate(t.createdAt)}</span>`:''}</div>
        <pre class="code" id="${t.id}">${escapeHtml(t.code||'')}</pre>
        <div class="actions">
          <button class="btn copy-btn" data-copy="${t.id}" data-premium="${isPremium}" style="${isPremium &&!unlocked?'background:#ff7200;color:#fff':''}"><i class="fas ${isPremium &&!unlocked?'fa-crown':'fa-copy'}"></i> ${isPremium &&!unlocked?'Unlock':'Copy'}</button>
          <button class="btn preview-btn" data-code="${t.id}" data-lang="${t.lang||t.category}" data-title="${escapeHtml(t.title)}" data-author="${escapeHtml(t.author||'')}" data-cat="${t.category}">Live Preview</button>
        </div>
        ${isCurrentUserAdmin? `<button class="btn" style="width:100%;margin-top:6px;font-size:11px;background:${isPremium?'#1a1200':'#101010'};border-color:${isPremium?'#ff7200':'#222'};color:${isPremium?'#ff7200':'#888'}" data-toggle-premium="${t.id}"><i class="fas fa-crown"></i> ${isPremium?'Remove Premium':'Make Premium'}</button>` : ''}
      </div>
    </article>
  `}).join('');
  attachCardEvents();
}

function escapeHtml(str){ return (str||'').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function formatDate(ts){ if(!ts) return ''; const d = ts.seconds? new Date(ts.seconds*1000) : new Date(ts); return d.toLocaleDateString(); }

function attachCardEvents(){
  document.querySelectorAll('.copy-btn').forEach(btn=>{
    btn.onclick=()=>{
      const id=btn.dataset.copy;
      const isPremium=btn.dataset.premium==='true';
      const t=allTemplates.find(x=>x.id===id);
      if(!t) return;
      const unlocked=localStorage.getItem('unlocked_'+id);
      if(isPremium &&!unlocked &&!isCurrentUserAdmin){ openPremiumModal(id); return; }
      const codeEl=document.getElementById(id);
      if(!codeEl) return;

      navigator.clipboard.writeText(codeEl.innerText);
      toast(isPremium?'👑 Premium Copied!':'Copied!');
      const old=btn.innerHTML; btn.innerHTML='<i class="fas fa-check"></i> Copied'; btn.style.background='#ff7200';
      setTimeout(()=>{btn.innerHTML=old; btn.style.background='';},1200);
    }
  });

  document.querySelectorAll('[data-unlock]').forEach(btn=>{ btn.onclick=()=> openPremiumModal(btn.dataset.unlock); });

  document.querySelectorAll('[data-toggle-premium]').forEach(btn=>{
    btn.onclick=async()=>{
      if(!isCurrentUserAdmin){ toast('Only admins can do this'); return; }
      const id=btn.dataset.togglePremium;
      const t=allTemplates.find(x=>x.id===id);
      if(!t) return;
      if(id.startsWith('seed')){ t.isPremium=!t.isPremium; renderTemplates(allTemplates); toast(t.isPremium?'👑 Seed now Premium':'Removed Premium'); return; }
      try {
        const newVal=!t.isPremium;
        await updateDoc(doc(db,"templates",id),{isPremium:newVal});
        t.isPremium=newVal; renderTemplates(allTemplates);
        toast(newVal?'👑 Now Premium':'Removed from Premium');
      } catch(e){ toast('Error: '+e.message); }
    }
  });

  document.querySelectorAll('.preview-btn').forEach(btn=>{
    btn.onclick=()=>{
      const codeEl=document.getElementById(btn.dataset.code);
      if(!codeEl) return;
      const id=btn.dataset.code;
      const t=allTemplates.find(x=>x.id===id);
      if(t && t.isPremium &&!localStorage.getItem('unlocked_'+id) &&!isCurrentUserAdmin){ openPremiumModal(id); return; }
      currentPreviewCode=codeEl.innerText;
      const titleEl=document.getElementById('previewTitle');
      const authorEl=document.getElementById('previewAuthor');
      const catEl=document.getElementById('previewMetaCat');
      const frame=document.getElementById('previewFrame');
      const modal=document.getElementById('previewModal');
      const premBadge=document.getElementById('previewPremiumBadge');
      if(titleEl) titleEl.textContent=btn.dataset.title||'Preview';
      if(authorEl) authorEl.textContent='by '+ (btn.dataset.author||'Community');
      if(catEl) catEl.textContent=(btn.dataset.cat||'').toUpperCase();
      if(premBadge) premBadge.innerHTML= t && t.isPremium? '<span class="premium-badge">PREMIUM</span>' : '';
      if(frame) frame.srcdoc=buildHTML(currentPreviewCode, btn.dataset.lang||'html');
      if(modal) modal.classList.add('active');
    }
  });
}

function openPremiumModal(id){ currentPremiumId=id; const modal=document.getElementById('premiumModal'); if(modal) modal.classList.add('active'); }

function buildHTML(code, lang){
  const l=(lang||'').toLowerCase();
  if(l==='css') return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{margin:0;padding:40px;background:#050505;color:#fff;display:grid;place-items:center;min-height:100vh} ${code}<\/style></head><body><div class="card"><h2>Glass Card Demo</h2><p>Live CSS preview</p><button class="btn-ukid">Ukid Button</button></div></body></html>`;
  if(l==='js') return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{margin:0;padding:40px;background:#050505;color:#fff;font-family:monospace} button{padding:10px 20px;background:#ff7200;color:#fff;border:none;border-radius:8px}<\/style></head><body><h3>JS Live Preview</h3><div class="card">Test Card 1</div><script>${code}<\/script></body></html>`;
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script src="https://cdn.tailwindcss.com"><\/script></head><body>${code}</body></html>`;
}

const previewModal=document.getElementById('previewModal');
const previewFrame=document.getElementById('previewFrame');
const closePreview=document.getElementById('closePreview');
const openNewTab=document.getElementById('openNewTab');
const copyFromPreview=document.getElementById('copyFromPreview');
if(closePreview) closePreview.onclick=()=>previewModal.classList.remove('active');
if(previewModal) previewModal.onclick=e=>{ if(e.target===previewModal) previewModal.classList.remove('active') };
if(openNewTab) openNewTab.onclick=()=>{ const win=window.open(); if(win){ win.document.write(previewFrame.srcdoc); win.document.close(); } };
if(copyFromPreview) copyFromPreview.onclick=()=>{
  if(currentPreviewCode){
    navigator.clipboard.writeText(currentPreviewCode); toast('Copied from preview!');
  }
};

const premiumModal=document.getElementById('premiumModal');
const closePremium=document.getElementById('closePremium');
if(closePremium) closePremium.onclick=()=>premiumModal.classList.remove('active');
if(premiumModal) premiumModal.onclick=e=>{ if(e.target===premiumModal) premiumModal.classList.remove('active') };

const createModal=document.getElementById('createModal');
const createBtn=document.getElementById('createTemplateBtn');
const openCreateBtn=document.getElementById('openCreateBtn');
const closeCreate=document.getElementById('closeCreate');
const saveBtn=document.getElementById('saveTemplateBtn');
function openCreate(){ if(createModal) createModal.classList.add('active'); }
if(createBtn) createBtn.onclick=openCreate;
if(openCreateBtn) openCreateBtn.onclick=openCreate;
if(closeCreate) closeCreate.onclick=()=>createModal.classList.remove('active');
if(createModal) createModal.onclick=e=>{ if(e.target===createModal) createModal.classList.remove('active') };

if(saveBtn){
  saveBtn.onclick=async()=>{
    if(!currentUser){ toast('Please login first!'); return; }
    const titleEl=document.getElementById('tTitle');
    const catEl=document.getElementById('tCategory');
    const langEl=document.getElementById('tLang');
    const descEl=document.getElementById('tDesc');
    const codeEl=document.getElementById('tCode');
    const publicEl=document.getElementById('tPublic');
    const premiumEl=document.getElementById('tPremium');
    const title=titleEl.value.trim(); const category=catEl.value; const lang=langEl.value; const desc=descEl.value.trim(); const code=codeEl.value.trim(); const isPublic=publicEl.checked; const wantPremium=premiumEl? premiumEl.checked : false;
    if(!title||!code){ toast('Title and code required'); return; }
    const finalIsPremium=isCurrentUserAdmin? wantPremium : false;
    if(wantPremium &&!isCurrentUserAdmin){ toast('Only admins can create premium templates'); return; }
    saveBtn.innerHTML='<i class="fas fa-spinner fa-spin"></i> Publishing...'; saveBtn.disabled=true;
    try {
      await addDoc(collection(db,"templates"),{ title, category, lang, desc, code, public:isPublic, isPremium:finalIsPremium, uid:currentUser.uid, author:currentUser.displayName||currentUser.email.split('@')[0], authorEmail:currentUser.email, copies:0, createdAt:serverTimestamp() });
      toast(isPublic? (finalIsPremium?'👑 Premium Published!':'🔥 Published publicly!') : 'Saved privately');
      createModal.classList.remove('active'); titleEl.value=''; descEl.value=''; codeEl.value=''; if(premiumEl) premiumEl.checked=false;
      setTimeout(()=>loadTemplates(), 800);
    } catch(err){ toast('Error: '+err.message); } finally { saveBtn.innerHTML='<i class="fas fa-upload"></i> Publish Template'; saveBtn.disabled=false; }
  }
}

document.querySelectorAll('.category-btn').forEach(btn=>{
  btn.onclick=()=>{
    document.querySelectorAll('.category-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter=btn.dataset.filter;
    let filtered;
    if(currentFilter==='all') filtered=allTemplates;
    else if(currentFilter==='premium') filtered=allTemplates.filter(t=>t.isPremium);
    else filtered=allTemplates.filter(t=>t.category===currentFilter||t.lang===currentFilter);
    renderTemplates(filtered);
    const rt=document.getElementById('resultText');
    if(rt) rt.textContent=`Showing ${filtered.length} of ${allTemplates.length} templates`;
  }
});

const searchInput=document.getElementById('templatesSearch');
if(searchInput){
  searchInput.oninput=e=>{
    const q=e.target.value.toLowerCase();
    if(!q){ renderTemplates(allTemplates); const rt=document.getElementById('resultText'); if(rt) rt.textContent=`Showing ${allTemplates.length} templates`; return; }
    const filtered=allTemplates.filter(t=> (t.title+" "+t.desc+" "+t.code+" "+t.author).toLowerCase().includes(q));
    renderTemplates(filtered);
    const rt=document.getElementById('resultText');
    if(rt) rt.textContent=`Showing ${filtered.length} results for "${e.target.value}"`;
  }
}

const sortSelect=document.getElementById('sortSelect');
if(sortSelect){
  sortSelect.onchange=e=>{
    let sorted=[...allTemplates];
    if(e.target.value==='newest') sorted.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
    if(e.target.value==='popular') sorted.sort((a,b)=>(b.copies||0)-(a.copies||0));
    if(e.target.value==='my'){ if(!currentUser){ toast('Login to see your templates'); return; } sorted=sorted.filter(t=>t.uid===currentUser.uid); }
    renderTemplates(sorted);
  }
}

const myLink=document.getElementById('myTemplatesLink');
if(myLink){
  myLink.onclick=e=>{
    e.preventDefault();
    if(!currentUser){ toast('Login to see your templates'); return; }
    const mine=allTemplates.filter(t=>t.uid===currentUser.uid);
    renderTemplates(mine);
    const rt=document.getElementById('resultText');
    if(rt) rt.textContent=`Showing ${mine.length} of your templates`;
    document.querySelectorAll('.category-btn').forEach(b=>b.classList.remove('active'));
  }
}

loadTemplates();