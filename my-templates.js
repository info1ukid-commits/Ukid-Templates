import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, query, where, getDocs, doc, updateDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let myTemplates = [];
let currentEditId = null;
let isCurrentUserAdmin = false;

function toast(m){const t=document.getElementById('toast');t.textContent=m;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),3000)}
function escapeHtml(s){return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}

// Auth
onAuthStateChanged(auth, async user=>{
  if(!user){ location.href='index.html#login'; return; }
  currentUser=user;
  try {
    isCurrentUserAdmin = (await user.getIdTokenResult()).claims.admin === true;
  } catch (error) {
    isCurrentUserAdmin = false;
    console.error('Unable to verify administrator permissions:', error);
  }

  document.getElementById('userName').textContent=user.displayName||user.email.split('@')[0];
  document.getElementById('userEmail').textContent=user.email;
  document.getElementById('userAvatar').src=user.photoURL||`https://ui-avatars.com/api/?name=${user.email}&background=ff7200&color=fff`;

  // SHOW/HIDE PREMIUM UI FOR ADMINS ONLY
  if(isCurrentUserAdmin) {
    document.querySelectorAll('.admin-only').forEach(el => {
      el.classList.add('show');
      el.style.display = 'block';
    });
    const premRow = document.getElementById('editPremiumRow');
    if(premRow) premRow.style.display = 'block';
  }
  window.isAdmin = isCurrentUserAdmin;

  loadMyTemplates();
});

// Mobile
const sidebar=document.getElementById('dashboardSidebar3'), overlay=document.getElementById('sidebarOverlay3');
document.getElementById('mobileMenu3').onclick=()=>{sidebar.classList.add('active');overlay.classList.add('active')};
document.getElementById('mobileClose3').onclick=()=>{sidebar.classList.remove('active');overlay.classList.remove('active')};
overlay.onclick=()=>{sidebar.classList.remove('active');overlay.classList.remove('active')};

async function loadMyTemplates(){
  const grid=document.getElementById('myTemplatesGrid');
  const resultText=document.getElementById('resultText');
  resultText.textContent='Loading your templates...';
  try {
    const q = query(collection(db,"templates"), where("uid","==",currentUser.uid));
    const snap = await getDocs(q);
    myTemplates = snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));

    // Stats
    document.getElementById('totalMy').textContent=myTemplates.length;
    document.getElementById('publicMy').textContent=myTemplates.filter(t=>t.public).length;
    document.getElementById('privateMy').textContent=myTemplates.filter(t=>!t.public).length;
    document.getElementById('copiesMy').textContent=myTemplates.reduce((a,t)=>a+(t.copies||0),0);
    if(document.getElementById('premiumMy')) {
      document.getElementById('premiumMy').textContent=myTemplates.filter(t=>t.isPremium).length;
    }
    document.getElementById('myCountNav').textContent=myTemplates.length;

    if(myTemplates.length===0){
      grid.innerHTML=`<div class="empty-state"><i class="fas fa-folder-open"></i><h3 style="font-size:16px;margin-bottom:8px">No templates yet</h3><p style="font-size:12px;color:#777;margin-bottom:16px">Create your first template and publish it to the community</p><button class="primary-btn" onclick="location.href='templates.html'" style="margin:0 auto"><i class="fas fa-plus"></i> Create Template</button></div>`;
      resultText.textContent='You have not created any templates yet';
      return;
    }

    resultText.textContent=`Showing ${myTemplates.length} templates you created`;
    renderMy(myTemplates);

  } catch(e){
    console.error(e);
    resultText.textContent='Error loading: '+e.message;
  }
}

function renderMy(list){
  const grid=document.getElementById('myTemplatesGrid');
  grid.innerHTML=list.map(t=>`
    <article class="template-card" style="${t.isPremium?'border:1px solid #ff7200;':''}">
      <div class="card-top">
        <span class="tag ${t.category}">${(t.category||'HTML').toUpperCase()}</span>
        ${t.isPremium?'<span class="premium-badge"><i class="fas fa-crown"></i> PREMIUM</span>':''}
        <h2>${escapeHtml(t.title).slice(0,26)}</h2>
        <span class="${t.public?'live-dot':'private-dot'} status-toggle" data-toggle-id="${t.id}" title="Click to toggle public/private">
          ${t.public?'<span></span>Public':'Private'}
        </span>
      </div>
      <div class="card-body">
        <p>${escapeHtml(t.desc||'No description')}</p>
        <div class="meta-line"><span><i class="fas fa-copy"></i> ${t.copies||0} copies</span><span><i class="fas fa-clock"></i> ${t.createdAt? new Date(t.createdAt.seconds*1000).toLocaleDateString():''}</span> ${t.isPremium?'<span style="color:#ff7200"><i class="fas fa-crown"></i> Premium</span>':''}</div>
        <pre class="code">${escapeHtml((t.code||'').slice(0,200))}</pre>
        <div class="actions" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-top:10px">
          <button class="btn preview-btn" data-preview="${t.id}"><i class="fas fa-eye"></i> Preview</button>
          <button class="btn" data-edit="${t.id}"><i class="fas fa-pen"></i> Edit</button>
          <button class="btn copy-btn" data-copy="${t.id}"><i class="fas fa-copy"></i> Copy</button>
        </div>
        ${isCurrentUserAdmin? `<button class="btn" style="width:100%;margin-top:6px;background:${t.isPremium?'#1a1200':'#101010'};border-color:${t.isPremium?'#ff7200':'#222'};color:${t.isPremium?'#ff7200':'#888'}" data-premium-toggle="${t.id}"><i class="fas fa-crown"></i> ${t.isPremium?'Remove Premium':'Make Premium'}</button>` : ''}
      </div>
    </article>
  `).join('');

  // Bind events
  grid.querySelectorAll('[data-edit]').forEach(btn=>{
    btn.onclick=()=>{
      const t = myTemplates.find(x=>x.id===btn.dataset.edit);
      if(t) openEdit(t);
    }
  });

  grid.querySelectorAll('[data-preview]').forEach(btn=>{
    btn.onclick=()=>{
      const t = myTemplates.find(x=>x.id===btn.dataset.preview);
      if(t) openPreview(t);
    }
  });

  grid.querySelectorAll('[data-copy]').forEach(btn=>{
    btn.onclick=()=>{
      const t = myTemplates.find(x=>x.id===btn.dataset.copy);
      if(t){ navigator.clipboard.writeText(t.code); toast('Copied!'); }
    }
  });

  grid.querySelectorAll('[data-toggle-id]').forEach(el=>{
    el.onclick=async()=>{
      const id = el.dataset.toggleId;
      const t = myTemplates.find(x=>x.id===id);
      if(!t) return;
      const newPublic =!t.public;
      try {
        await updateDoc(doc(db,"templates",id),{public:newPublic});
        t.public=newPublic;
        renderMy(list);
        updateStats();
        toast(newPublic?'🌍 Now Public':'🔒 Now Private');
      } catch(e){ toast('Error: '+e.message); }
    }
  });

  // PREMIUM TOGGLE - ADMIN ONLY
  grid.querySelectorAll('[data-premium-toggle]').forEach(el=>{
    el.onclick=async()=>{
      if(!isCurrentUserAdmin) { toast('Only admins can set premium'); return; }
      const id = el.dataset.premiumToggle;
      const t = myTemplates.find(x=>x.id===id);
      if(!t) return;
      const newPremium =!t.isPremium;
      try {
        await updateDoc(doc(db,"templates",id),{isPremium:newPremium});
        t.isPremium=newPremium;
        renderMy(list);
        updateStats();
        toast(newPremium?'👑 Now Premium - earns from ads':'Removed from Premium');
      } catch(e){ toast('Error: '+e.message); }
    }
  });
}

function updateStats(){
  document.getElementById('publicMy').textContent=myTemplates.filter(t=>t.public).length;
  document.getElementById('privateMy').textContent=myTemplates.filter(t=>!t.public).length;
  if(document.getElementById('premiumMy')) {
    document.getElementById('premiumMy').textContent=myTemplates.filter(t=>t.isPremium).length;
  }
}

// Edit Modal
const editModal=document.getElementById('editModal');
function openEdit(t){
  currentEditId=t.id;
  document.getElementById('eTitle').value=t.title||'';
  document.getElementById('eCategory').value=t.category||'html';
  document.getElementById('eLang').value=t.lang||'html';
  document.getElementById('eDesc').value=t.desc||'';
  document.getElementById('eCode').value=t.code||'';
  document.getElementById('ePublic').checked=!!t.public;
  if(document.getElementById('ePremium')) {
    document.getElementById('ePremium').checked=!!t.isPremium;
  }
  document.getElementById('editSub').textContent=`Editing: ${t.title}`;
  updateEditBadge();

  // Show premium toggle only for admins in edit modal
  const premRow = document.getElementById('editPremiumRow');
  if(premRow) premRow.style.display = isCurrentUserAdmin? 'block' : 'none';

  editModal.classList.add('active');
}

function updateEditBadge(){
  const isPublic=document.getElementById('ePublic').checked;
  document.getElementById('eBadge').innerHTML=isPublic?'<i class="fas fa-globe"></i> Public':'<i class="fas fa-lock"></i> Private';
  document.getElementById('eBadge').style.background=isPublic?'rgba(0,255,136,0.12)':'#1a1a1a';
  document.getElementById('eBadge').style.color=isPublic?'#00ff88':'#777';
  document.getElementById('ePublicText').textContent=isPublic?'Publish Publicly':'Keep Private';
}

document.getElementById('ePublic').onchange=updateEditBadge;
document.getElementById('closeEdit').onclick=()=>editModal.classList.remove('active');
editModal.onclick=e=>{ if(e.target===editModal) editModal.classList.remove('active') };

// Update - PREMIUM ONLY FOR ADMINS
document.getElementById('updateBtn').onclick=async()=>{
  if(!currentEditId) return;
  const title=document.getElementById('eTitle').value.trim();
  const category=document.getElementById('eCategory').value;
  const lang=document.getElementById('eLang').value;
  const desc=document.getElementById('eDesc').value.trim();
  const code=document.getElementById('eCode').value.trim();
  const isPublic=document.getElementById('ePublic').checked;
  const isPremiumCheck = document.getElementById('ePremium')?.checked || false;
  if(!title||!code){ toast('Title and code required'); return; }

  const btn=document.getElementById('updateBtn');
  btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> Saving...'; btn.disabled=true;
  try {
    const updateData = {
      title, category, lang, desc, code, public:isPublic, updatedAt:serverTimestamp()
    };
    // ONLY ADMINS CAN CHANGE PREMIUM STATUS
    if(isCurrentUserAdmin) {
      updateData.isPremium = isPremiumCheck;
    }

    await updateDoc(doc(db,"templates",currentEditId), updateData);
    toast('✅ Updated successfully');
    editModal.classList.remove('active');
    const idx=myTemplates.findIndex(x=>x.id===currentEditId);
    if(idx>=0) myTemplates[idx]={...myTemplates[idx],title,category,lang,desc,code,public:isPublic, isPremium: isCurrentUserAdmin? isPremiumCheck : myTemplates[idx].isPremium};
    renderMy(myTemplates);
    updateStats();
  } catch(e){ toast('Error: '+e.message); }
  finally{ btn.innerHTML='<i class="fas fa-save"></i> Save Changes'; btn.disabled=false; }
};

// Delete
document.getElementById('deleteBtn').onclick=async()=>{
  if(!currentEditId) return;
  if(!confirm('Delete this template permanently? This cannot be undone.')) return;
  const btn=document.getElementById('deleteBtn');
  btn.innerHTML='<i class="fas fa-spinner fa-spin"></i>'; btn.disabled=true;
  try {
    await deleteDoc(doc(db,"templates",currentEditId));
    toast('🗑️ Deleted');
    editModal.classList.remove('active');
    myTemplates=myTemplates.filter(x=>x.id!==currentEditId);
    if(myTemplates.length===0) loadMyTemplates(); else { renderMy(myTemplates); updateStats(); document.getElementById('myCountNav').textContent=myTemplates.length; document.getElementById('totalMy').textContent=myTemplates.length; }
  } catch(e){ toast('Error: '+e.message); }
  finally{ btn.innerHTML='<i class="fas fa-trash"></i>'; btn.disabled=false; }
};

// Preview
const pModal=document.getElementById('previewModal'), pFrame=document.getElementById('previewFrame');
function openPreview(t){
  document.getElementById('previewTitle').textContent=t.title;
  if(t.lang==='css'){
    pFrame.srcdoc=`<!DOCTYPE html><html><head><style>body{margin:0;padding:40px;background:#050505;color:#fff;display:grid;place-items:center;min-height:100vh}${t.code}</style></head><body><div class="card"><h2>Preview</h2><p>Live CSS</p></div></body></html>`;
  } else {
    pFrame.srcdoc=`<!DOCTYPE html><html><head><script src="https://cdn.tailwindcss.com"><\/script></head><body>${t.code}</body></html>`;
  }
  pModal.classList.add('active');
}
document.getElementById('closePreview').onclick=()=>pModal.classList.remove('active');
pModal.onclick=e=>{ if(e.target===pModal) pModal.classList.remove('active') };
document.getElementById('openNewTab').onclick=()=>{ const w=window.open(); w.document.write(pFrame.srcdoc); w.document.close(); };

// Filters
document.querySelectorAll('.category-btn').forEach(btn=>{
  btn.onclick=()=>{
    document.querySelectorAll('.category-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    const f=btn.dataset.filter;
    if(f==='all') renderMy(myTemplates);
    else if(f==='public') renderMy(myTemplates.filter(t=>t.public));
    else if(f==='private') renderMy(myTemplates.filter(t=>!t.public));
    else if(f==='premium') renderMy(myTemplates.filter(t=>t.isPremium));
  }
});

document.getElementById('mySearch').oninput=e=>{
  const q=e.target.value.toLowerCase();
  if(!q){ renderMy(myTemplates); return; }
  renderMy(myTemplates.filter(t=>(t.title+t.desc+t.code).toLowerCase().includes(q)));
};

document.getElementById('newTemplateBtn').onclick=()=>location.href='templates.html';