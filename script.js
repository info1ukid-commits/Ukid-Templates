import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, FacebookAuthProvider, TwitterAuthProvider, browserLocalPersistence, browserSessionPersistence, setPersistence, signInWithCustomToken, signInWithPopup, signInWithRedirect, getRedirectResult, sendPasswordResetEmail, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const toastEl = document.getElementById('toast');
const welcomeBox = document.getElementById('welcome-box');
const passwordInput = document.getElementById('password');
const otpInput = document.getElementById('email-otp');
let otpSentForEmail = '';
let loginOtpRequired = false;
function showToast(msg, type='error'){ toastEl.textContent=msg; toastEl.className=type; setTimeout(()=>toastEl.textContent='',4000); }
const authNotice=sessionStorage.getItem('authNotice');
if(authNotice){ sessionStorage.removeItem('authNotice'); showToast(authNotice,'success'); }
function setSelectedPersistence(){
  const persistence=document.getElementById('remember-me').checked?browserLocalPersistence:browserSessionPersistence;
  return setPersistence(auth,persistence);
}
function redirectAfterAuth(){
  const returnTo=new URLSearchParams(location.search).get('returnTo');
  if(returnTo?.startsWith('/')&&!returnTo.startsWith('//')){
    const target=new URL(returnTo,location.origin);
    if(target.origin===location.origin){ location.href=target.href; return; }
  }
  location.href='/dashboard.html';
}
function getDeviceId(){
  let deviceId=localStorage.getItem('ukid-auth-device-id');
  if(!deviceId){
    deviceId=crypto.randomUUID();
    localStorage.setItem('ukid-auth-device-id',deviceId);
  }
  return deviceId;
}

// SAVE USER TO FIRESTORE
async function saveUser(user){
  try{
    await setDoc(doc(db, "users", user.uid), {
      email: user.email, name: user.displayName || user.email.split('@')[0],
      photo: user.photoURL || "", provider: user.providerData[0]?.providerId || "email",
      lastLogin: serverTimestamp()
    }, { merge: true });
  }catch(e){ console.log("Firestore not enabled yet:", e.message); }
}

async function postOtpRequest(payload){
  const response=await fetch('/api/auth-otp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const result=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(result.error||'Email verification is temporarily unavailable.');
  return result;
}

getRedirectResult(auth).then(res=>{ if(res?.user){ saveUser(res.user); showToast(`Welcome ${res.user.displayName}!`,'success'); redirectAfterAuth(); } }).catch(e=>showToast(e.message));

onAuthStateChanged(auth, async user=>{
  if(user){
    const tokenResult=await user.getIdTokenResult().catch(()=>null);
    const signInProvider=tokenResult?.claims.firebase?.sign_in_provider;
    if(signInProvider==='password'||(signInProvider==='custom'&&tokenResult?.claims.email_otp_verified!==true)){
      showToast('Verify this browser with the email code before continuing.');
      await signOut(auth);
      return;
    }
    welcomeBox.style.display='block';
    welcomeBox.textContent=`Welcome, ${user.displayName||user.email}. Redirecting to dashboard...`;
    document.getElementById('logout-btn').style.display='block';
    document.getElementById('login-btn').style.display='none';
    document.getElementById('signup-btn').style.display='none';
    document.getElementById('otp-group').hidden=true;
    document.getElementById('send-otp-btn').hidden=true;
    saveUser(user);
    setTimeout(()=>{ if(location.pathname==='/'||location.pathname.includes('index')) redirectAfterAuth(); }, 1500);
  } else {
    welcomeBox.style.display='none';
    document.getElementById('logout-btn').style.display='none';
  }
});

document.getElementById('login-btn').onclick=async()=>{
  const email=document.getElementById('email').value.trim(), password=document.getElementById('password').value;
  if(!email||!password) return showToast('Enter email & password');
  try{
    const deviceId=getDeviceId();
    const result=loginOtpRequired
      ? await postOtpRequest({action:'verify-login',email,code:otpInput.value.trim(),deviceId})
      : await postOtpRequest({action:'login',email,password,deviceId});
    if(result.requiresOtp){
      loginOtpRequired=true;
      otpInput.value='';
      document.getElementById('otp-group').hidden=false;
      document.getElementById('send-otp-btn').hidden=false;
      document.getElementById('send-otp-btn').textContent='Resend code';
      document.getElementById('login-btn').textContent='Verify code & sign in';
      return showToast('New device detected. Enter the code sent to your email.','success');
    }
    await setSelectedPersistence();
    await signInWithCustomToken(auth,result.customToken);
    loginOtpRequired=false;
  }
  catch(e){ showToast(e.message); }
};
document.getElementById('signup-btn').onclick=async()=>{
  const email=document.getElementById('email').value.trim(), password=document.getElementById('password').value;
  const code=otpInput.value.trim();
  if(!email||!password) return showToast('Enter email & password');
  if(otpSentForEmail!==email.toLowerCase()) return showToast('Send a verification code to this email first.');
  if(!/^\d{6}$/.test(code)) return showToast('Enter the six-digit verification code.');
  try{
    const result=await postOtpRequest({action:'verify',email,code,password,deviceId:getDeviceId()});
    await setSelectedPersistence();
    await signInWithCustomToken(auth,result.customToken);
    showToast('Email verified. Your account is ready.','success');
  }
  catch(e){ showToast(e.message); }
};
document.getElementById('send-otp-btn').onclick=async()=>{
  const email=document.getElementById('email').value.trim();
  if(!email||!document.getElementById('email').checkValidity()) return showToast('Enter a valid email address first.');
  const button=document.getElementById('send-otp-btn');
  button.disabled=true;
  try{
    if(loginOtpRequired){
      const password=document.getElementById('password').value;
      if(!password) return showToast('Enter your password to request a new sign-in code.');
      await postOtpRequest({action:'login',email,password,deviceId:getDeviceId()});
    }else{
      await postOtpRequest({action:'request',email});
      otpSentForEmail=email.toLowerCase();
    }
    document.getElementById('otp-group').hidden=false;
    button.textContent='Resend code';
    showToast('If this address can be registered, a code has been sent.','success');
  }catch(e){ showToast(e.message); }
  finally{ button.disabled=false; }
};
document.getElementById('forgot-btn').onclick=async(e)=>{
  e.preventDefault(); const email=document.getElementById('email').value.trim();
  if(!email) return showToast('Enter your email first to reset');
  try{ await sendPasswordResetEmail(auth,email); showToast('Reset email sent! Check inbox','success'); }
  catch(err){ showToast(err.message); }
};
document.getElementById('logout-btn').onclick=()=>signOut(auth);
document.getElementById('google-login').onclick=async(e)=>{
  e.preventDefault(); const provider=new GoogleAuthProvider();
  try{ await setSelectedPersistence(); await signInWithPopup(auth,provider); }
  catch(err){ if(err.code==='auth/popup-blocked'){ await setSelectedPersistence(); await signInWithRedirect(auth,provider); } else showToast(err.message); }
};
document.getElementById('facebook-login').onclick=async e=>{ e.preventDefault(); try{ await setSelectedPersistence(); await signInWithPopup(auth,new FacebookAuthProvider()); }catch{ showToast('Enable Facebook in Firebase or check the provider configuration.'); } };
document.getElementById('twitter-login').onclick=async e=>{ e.preventDefault(); try{ await setSelectedPersistence(); await signInWithPopup(auth,new TwitterAuthProvider()); }catch{ showToast('Enable Twitter in Firebase or check the provider configuration.'); } };
document.getElementById('toggle-password').onclick=e=>{
  const button=e.currentTarget, visible=passwordInput.type==='password';
  passwordInput.type=visible?'text':'password';
  button.setAttribute('aria-label',visible?'Hide password':'Show password');
  button.setAttribute('aria-pressed',String(visible));
  button.innerHTML=`<i class="fas fa-eye${visible?'-slash':''}" aria-hidden="true"></i>`;
};
document.getElementById('toggle-auth').onclick=e=>{
  e.preventDefault(); const isLogin=document.getElementById('login-btn').style.display!=='none';
  document.getElementById('form-title').textContent=isLogin?'Create Account':'Login Here';
  document.getElementById('form-subtitle').textContent=isLogin?'Join us today!':'Welcome back!';
  document.getElementById('login-btn').style.display=isLogin?'none':'block';
  document.getElementById('signup-btn').style.display=isLogin?'block':'none';
  document.getElementById('send-otp-btn').hidden=!isLogin;
  document.getElementById('forgot-row').hidden=isLogin;
  if(!isLogin){
    document.getElementById('otp-group').hidden=true;
    otpInput.value='';
    otpSentForEmail='';
    loginOtpRequired=false;
    document.getElementById('login-btn').textContent='Login';
    document.getElementById('send-otp-btn').textContent='Send verification code';
  }else{
    document.getElementById('otp-group').hidden=true;
    otpInput.value='';
    loginOtpRequired=false;
    document.getElementById('login-btn').textContent='Login';
  }
  e.target.textContent=isLogin?'Login':'Sign up';
};
if(location.hash==='#signup') document.getElementById('toggle-auth').click();