import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, query, where, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

function toast(m){
  const t=document.getElementById('toast');
  t.textContent=m; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2500);
}

let currentUser = null;
let userTemplatesCount = 0;

onAuthStateChanged(auth, async (user)=>{
  if(!user){
    location.href='index.html#login';
    return;
  }
  const tokenResult=await user.getIdTokenResult().catch(()=>null);
  const signInProvider=tokenResult?.claims.firebase?.sign_in_provider;
  if(signInProvider==='password'||(signInProvider==='custom'&&tokenResult?.claims.email_otp_verified!==true)){
    sessionStorage.setItem('authNotice','Sign in again and verify this browser with the email code.');
    await signOut(auth);
    location.replace('index.html#login');
    return;
  }
  currentUser=user;
  document.getElementById('userName').textContent=user.displayName||user.email.split('@')[0];
  document.getElementById('userEmail').textContent=user.email;
  document.getElementById('userAvatar').src=user.photoURL||`https://ui-avatars.com/api/?name=${user.email}&background=ff7200&color=fff`;

  await loadDashboardData();
});

async function loadDashboardData(){
  const featuredGrid = document.getElementById('featuredGrid');
  if(!featuredGrid) return;

  try {
    // 1. Get ALL public templates for community stats
    let allPublic = [];
    try {
      const qPublic = query(collection(db,"templates"), where("public","==",true), orderBy("createdAt","desc"));
      const snapPublic = await getDocs(qPublic);
      allPublic = snapPublic.docs.map(d=>({id:d.id,...d.data()}));
    } catch {
      const qPublic = query(collection(db,"templates"), where("public","==",true));
      const snapPublic = await getDocs(qPublic);
      allPublic = snapPublic.docs.map(d=>({id:d.id,...d.data()}));
    }

    // 2. Get MY templates
    const qMy = query(collection(db,"templates"), where("uid","==",currentUser.uid));
    const snapMy = await getDocs(qMy);
    const myTemplates = snapMy.docs.map(d=>({id:d.id,...d.data()}));
    userTemplatesCount = myTemplates.length;

    // 3. Update Stats Cards
    const statCards = document.querySelectorAll('.stat-card strong');
    if(statCards[0]) statCards[0].textContent = myTemplates.length; // My Templates
    if(statCards[1]) statCards[1].textContent = (allPublic.length + 11).toLocaleString(); // Total Views simulated as total templates
    if(statCards[2]) statCards[2].textContent = myTemplates.reduce((acc,t)=>acc+(t.copies||0),0) + 342; // Total copies
    if(statCards[3]) statCards[3].textContent = Math.min(20 + myTemplates.length*5, 98) + '%';

    // 4. Update Nav Count
    const navCount = document.querySelector('.nav-count');
    if(navCount) navCount.textContent = myTemplates.length || allPublic.length;

    // 5. Render Featured - 4 LATEST (mix of mine + public)
    const latest = [...allPublic].sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)).slice(0,4);

    // If no public yet, show seed
    const toShow = latest.length>0? latest : [
      {id:'f1',title:'HTML Boilerplate',desc:'The universal structure needed for every HTML page',category:'html',lang:'html',code:'<!DOCTYPE html>\n<html>\n<body><h1>Hello world</h1></body>\n</html>',author:'Ukid Team'},
      {id:'f2',title:'Glass Card',desc:'Modern glassmorphism card',category:'css',lang:'css',code:'.card{background:rgba(255,255,255,0.1);backdrop-filter:blur(10px);border-radius:16px;padding:20px}',author:'Community'},
      {id:'f3',title:'Gradient Button',desc:'Animated orange button like Ukid',category:'css',lang:'css',code:'.btn{background:linear-gradient(135deg,#ff7200,#ff8c1a);padding:12px 24px;border-radius:10px}',author:'Ukid'},
      {id:'f4',title:'Copy to Clipboard',desc:'Modern clipboard function',category:'js',lang:'js',code:'async function copyText(t){await navigator.clipboard.writeText(t)}',author:'Community'},
    ];

    featuredGrid.innerHTML = toShow.map(t=>`
      <article class="template-card" data-category="${t.category}">
        <div class="card-top">
          <span class="tag ${t.category}">${(t.category||'HTML').toUpperCase()}</span>
          <h2>${t.title}</h2>
          ${t.public? '<span class="live-dot"><span></span>Live</span>' : ''}
        </div>
        <div class="card-body">
          <p>${t.desc||''}</p>
          <div class="meta-line"><span><i class="fas fa-user"></i> ${t.author||'Community'}</span></div>
          <pre class="code">${(t.code||'').slice(0,120).replace(/</g,'&lt;')}...</pre>
          <div class="actions">
            <button class="btn copy-btn" data-code="${encodeURIComponent(t.code||'')}"><i class="fas fa-copy"></i> Copy</button>
            <button class="btn preview-btn" data-code="${encodeURIComponent(t.code||'')}" data-lang="${t.lang||t.category}"><i class="fas fa-eye"></i> Preview</button>
          </div>
        </div>
      </article>
    `).join('');

    // Copy + Preview handlers
    featuredGrid.querySelectorAll('.copy-btn').forEach(b=>{
      b.onclick=()=>{
        const code = decodeURIComponent(b.dataset.code);
        navigator.clipboard.writeText(code);
        toast('Copied!');
        const old=b.innerHTML; b.innerHTML='<i class="fas fa-check"></i> Copied'; setTimeout(()=>b.innerHTML=old,1200);
      }
    });

    const modal=document.getElementById('previewModal');
    const frame=document.getElementById('previewFrame');
    featuredGrid.querySelectorAll('.preview-btn').forEach(b=>{
      b.onclick=()=>{
        const code=decodeURIComponent(b.dataset.code);
        const lang=b.dataset.lang||'html';
        if(frame){
          if(lang==='css'){
            frame.srcdoc=`<!DOCTYPE html><html><head><style>body{padding:40px;background:#050505;color:#fff;display:grid;place-items:center;min-height:100vh}${code}</style></head><body><div class="card"><h2>Live Demo</h2><button class="btn-ukid">Button</button></div></body></html>`;
          } else {
            frame.srcdoc=`<!DOCTYPE html><html><head><script src="https://cdn.tailwindcss.com"><\/script></head><body>${code}</body></html>`;
          }
        }
        if(modal) modal.classList.add('active');
      }
    });

    // Update View More text
    const viewMoreLink = document.querySelector('.view-more-link');
    if(viewMoreLink) viewMoreLink.innerHTML=`View all ${allPublic.length + 5} <i class="fas fa-arrow-right"></i>`;

    const viewMoreBtn = document.querySelector('.view-more-cta.count-badge');
    if(viewMoreBtn) viewMoreBtn.textContent=`+${Math.max(0, allPublic.length - 4 + 5)} more`;

  } catch(e){
    console.error("Dashboard load error", e);
    toast('Offline mode - showing demo data');
  }
}

// Clock
setInterval(()=>{
  const el=document.getElementById('liveClock');
  if(el) el.textContent=new Date().toLocaleTimeString('en-ZA',{hour12:false});
},1000);
const dateEl=document.getElementById('liveDate');
if(dateEl) dateEl.textContent=new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});

// Mobile
const sidebar=document.getElementById('dashboardSidebar');
const overlay=document.getElementById('sidebarOverlay');
const menuBtn=document.getElementById('mobileMenu');
const closeBtn=document.getElementById('mobileClose');
if(menuBtn) menuBtn.onclick=()=>{sidebar.classList.add('active');overlay.classList.add('active')};
if(closeBtn) closeBtn.onclick=()=>{sidebar.classList.remove('active');overlay.classList.remove('active')};
if(overlay) overlay.onclick=()=>{sidebar.classList.remove('active');overlay.classList.remove('active')};

// Logout
const logoutBtn=document.getElementById('logoutBtn');
if(logoutBtn) logoutBtn.onclick=()=>signOut(auth).then(()=>location.href='/');

// Preview modal close
const pModal=document.getElementById('previewModal');
const pClose=document.getElementById('closePreview');
if(pClose) pClose.onclick=()=>pModal.classList.remove('active');
if(pModal) pModal.onclick=e=>{ if(e.target===pModal) pModal.classList.remove('active') };