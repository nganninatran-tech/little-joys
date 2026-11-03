/* Little Joys — a privacy-first, no-account-needed MVP.
   All moments are stored on this device in localStorage.
   Laughter and happiness can be logged manually. An opt-in, foreground-only,
   on-device acoustic heuristic can suggest possible laughs for user confirmation.
   It does not record, retain, transmit, or accurately classify speech.
*/
(() => {
  'use strict';

  // A little punctuation can turn into sunshine. Purely decorative: never changes a user's moment count.
  let sunshineOn = false;
  const sunArtwork = `<svg class="sun-art" viewBox="0 0 100 100" role="presentation" focusable="false" aria-hidden="true">
    <g class="sun-rays" fill="none" stroke="#E8A644" stroke-width="3.5" stroke-linecap="round">
      <path d="M50 5v8 M50 87v8 M5 50h8 M87 50h8 M18 18l6 6 M76 76l6 6 M18 82l6-6 M76 24l6-6"/>
    </g>
    <circle cx="50" cy="50" r="33" fill="#FFE19A" stroke="#E4A34C" stroke-width="2"/>
    <circle cx="39" cy="45" r="3.2" fill="#865A40"/>
    <circle cx="61" cy="45" r="3.2" fill="#865A40"/>
    <path d="M36 58 Q50 74 64 58" stroke="#865A40" stroke-width="3.8" stroke-linecap="round" fill="none"/>
    <circle cx="29" cy="54" r="4" fill="#F6B6A1" opacity=".6"/>
    <circle cx="71" cy="54" r="4" fill="#F6B6A1" opacity=".6"/>
  </svg>`;
  function smileButton(extraClass) {
    return `<button type="button" data-sun-toggle class="sunshine-toggle ${extraClass} ${sunshineOn?'is-sunny':''}" aria-pressed="${sunshineOn}" aria-label="${sunshineOn?'Turn the sunshine back into a smile':'Flip the smile into a little sun'}" title="Tap for a little sunshine">
      <span class="smile-punctuation" aria-hidden="true"><svg class="face-art" viewBox="0 0 100 100" aria-hidden="true" focusable="false"><circle cx="31" cy="37" r="7.5" fill="currentColor"/><circle cx="69" cy="37" r="7.5" fill="currentColor"/><path d="M25 59.5Q50 87 75 59.5" fill="none" stroke="currentColor" stroke-width="8.5" stroke-linecap="round"/></svg></span>
      <span class="sunshine-face" aria-hidden="true">${sunArtwork}</span>
    </button>`;
  }
  function syncSunshine() {
    document.querySelectorAll('[data-sun-toggle]').forEach(button=>{
      button.classList.toggle('is-sunny',sunshineOn);
      button.setAttribute('aria-pressed',String(sunshineOn));
      button.setAttribute('aria-label',sunshineOn?'Turn the sunshine back into a smile':'Flip the smile into a little sun');
    });
  }
  const STORAGE_KEY = 'little-joys.moments.v1';
  const MAX_IMPORT = 5000;
  const MAX_PHOTO_BYTES = 12*1024*1024;
  const MAX_PHOTO_DATA = 1400000;
  const PHOTO_DB = 'little-joys-photos-v1';
  let photoDbPromise;
  function openPhotoDb() {
    if (!('indexedDB' in window)) return Promise.reject(new Error('Photo storage unavailable'));
    if (!photoDbPromise) photoDbPromise = new Promise((resolve,reject)=>{
      const request=indexedDB.open(PHOTO_DB,1);
      request.onupgradeneeded=()=>request.result.createObjectStore('photos');
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
      request.onblocked=()=>reject(new Error('Photo storage blocked'));
    }).catch(err=>{photoDbPromise=null;throw err;});
    return photoDbPromise;
  }
  async function photoTransaction(mode, operation) {
    const db=await openPhotoDb();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('photos',mode); const store=tx.objectStore('photos');
      const request=operation(store);
      let result;
      if(request) request.onsuccess=()=>{result=request.result;};
      tx.oncomplete=()=>resolve(result);
      tx.onerror=()=>reject(tx.error || new Error('Photo storage failed'));
      tx.onabort=()=>reject(tx.error || new Error('Photo storage cancelled'));
    });
  }
  const getPhoto = id=>photoTransaction('readonly',store=>store.get(id));
  const putPhoto = (id,data)=>photoTransaction('readwrite',store=>store.put(data,id));
  const deletePhoto = id=>photoTransaction('readwrite',store=>store.delete(id));
  const clearPhotos = ()=>photoTransaction('readwrite',store=>store.clear());
  async function compressPhoto(file) {
    if (!file.type.startsWith('image/')) throw new Error('Please choose an image');
    if (file.size > MAX_PHOTO_BYTES) throw new Error('Photo is too large (12MB maximum)');
    const url=URL.createObjectURL(file);
    try {
      const img=new Image();
      await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('Could not open this photo'));img.src=url;});
      const maxDim=1000, ratio=Math.min(1,maxDim/Math.max(img.naturalWidth,img.naturalHeight));
      const canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(img.naturalWidth*ratio));
      canvas.height=Math.max(1,Math.round(img.naturalHeight*ratio));
      const ctx=canvas.getContext('2d');
      if(!ctx)throw new Error('Photo processing is unavailable');
      ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
      const data=canvas.toDataURL('image/jpeg',.73);
      if(data.length>MAX_PHOTO_DATA)throw new Error('Photo is too large after processing');
      return data;
    } finally {URL.revokeObjectURL(url);}
  }
  async function hydratePhotos(root=document) {
    const nodes=[...root.querySelectorAll('[data-photo-id]')];
    await Promise.all(nodes.map(async node=>{
      const id=node.dataset.photoId;
      try {const data=await getPhoto(id);if(data && node.isConnected && node.dataset.photoId===id)node.src=data;}
      catch{ /* A photo may be unavailable in this browser; keep notes visible. */ }
    }));
  }

  const content = document.querySelector('#app-content');
  const toastEl = document.querySelector('#toast');
  const dialog = document.querySelector('#note-dialog');
  const noteField = document.querySelector('#moment-note');
  const noteCounter = document.querySelector('#note-counter');
  const importField = document.querySelector('#import-file');

  const paths = {
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>',
    chart: '<path d="M3 3v18h18M7 15v3m5-9v9m5-13v13"/>',
    hearts: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06-1.9 1.9-.06-.06A1.7 1.7 0 0 0 16 18.45a1.7 1.7 0 0 0-1 .95V21h-3v-1.6a1.7 1.7 0 0 0-1-.95 1.7 1.7 0 0 0-1.87.34l-.06.06-1.9-1.9.06-.06A1.7 1.7 0 0 0 7.55 15a1.7 1.7 0 0 0-.95-1H5v-3h1.6a1.7 1.7 0 0 0 .95-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06 1.9-1.9.06.06A1.7 1.7 0 0 0 11 6.55a1.7 1.7 0 0 0 1-.95V4h3v1.6a1.7 1.7 0 0 0 1 .95 1.7 1.7 0 0 0 1.87-.34l.06-.06 1.9 1.9-.06.06A1.7 1.7 0 0 0 19.45 10a1.7 1.7 0 0 0 .95 1H22v3h-1.6a1.7 1.7 0 0 0-1 .95Z" transform="translate(-1.5 -1) scale(.98)"/>',
    laugh: '<circle cx="12" cy="12" r="9"/><path d="M8 9h.01M16 9h.01M8 14c2 4 6 4 8 0M8 14h8"/>',
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
    sparkle: '<path d="m12 3 1.7 6.3L20 11l-6.3 1.7L12 19l-1.7-6.3L4 11l6.3-1.7L12 3Zm7 14 .6 1.4L21 19l-1.4.6L19 21l-.6-1.4L17 19l1.4-.6L19 17Z"/>',
    edit: '<path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L9 17l-4 1 1-4Z"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2m3 0-1 15H6L5 6m5 4v7m4-7v7"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    share: '<path d="M12 16V3m-4 4 4-4 4 4M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
    download: '<path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4"/>',
    upload: '<path d="M12 17V4m-4 4 4-4 4 4M4 17v4h16v-4"/>',
    shield: '<path d="M12 2 4 6v6c0 5 3.5 8.8 8 10 4.5-1.2 8-5 8-10V6l-8-4Z"/><path d="m9 12 2 2 4-4"/>',
    leaf: '<path d="M20 4c-9 0-16 3-16 11a5 5 0 0 0 5 5c8 0 11-7 11-16Z"/><path d="M4 20c2-5 6-9 12-12"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
    dots: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    camera: '<path d="M4 7h4l2-3h4l2 3h4v13H4z"/><circle cx="12" cy="13" r="3.5"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="1.4"/><path d="m3 17 5-5 4 4 3-3 6 5"/>',
    microphone: '<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5m-4 0h8"/>',
    smile: '<circle cx="12" cy="12" r="9"/><path d="M8.5 10h.01M15.5 10h.01M8 14c2.3 3.3 5.7 3.3 8 0"/>', 
  };
  const icon = (name, size=20) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.sparkle}</svg>`;
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const pad = n => String(n).padStart(2, '0');
  const dateKey = (date) => `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;
  const momentDay = m => dateKey(new Date(m.timestamp));
  const dateText = d => d.toLocaleDateString(undefined, {weekday:'long',month:'long',day:'numeric'});
  const dateGroupText = d => d.toLocaleDateString(undefined, {weekday:'long',month:'short',day:'numeric',year:'numeric'});
  const timeText = d => d.toLocaleTimeString(undefined, {hour:'numeric',minute:'2-digit'});
  const randomId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const momentName = m => m.type === 'laugh' ? 'A little laugh' : 'A happy moment';

  function cleanMoment(obj) {
    if (!obj || (obj.type !== 'laugh' && obj.type !== 'joy')) return null;
    const timestamp = String(obj.timestamp || '');
    const date = new Date(timestamp);
    if (!Number.isFinite(date.getTime()) || date.getTime() < new Date('2000-01-01').getTime() || date.getTime() > Date.now() + 86400000) return null;
    return {id: String(obj.id || randomId()).slice(0,100), type: obj.type, timestamp: date.toISOString(), note: String(obj.note || '').slice(0,300), photo:!!obj.photo, sample: !!obj.sample};
  }
  function loadMoments() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if (!Array.isArray(saved)) return [];
      return saved.slice(0,MAX_IMPORT).map(cleanMoment).filter(Boolean).sort((a,b) => new Date(b.timestamp)-new Date(a.timestamp));
    } catch { return []; }
  }
  // Gentle hourly sunshine: original, offline-friendly messages. No accounts or external APIs.
  // The card can update on the hour while the app is in use; browser alerts are strictly opt-in.
  const SUNSHINE_SETTINGS_KEY = 'little-joys.sunshine.v1';
  const SUNSHINE_MESSAGES = {
    quote: [
      'The tiniest good thing still counts.',
      'Not every beautiful moment announces itself.',
      'A small laugh can make room in a crowded day.',
      'Today does not need to be perfect to hold something good.',
      'Take the ordinary moment. It may be the one you remember.',
      'A little joy is still joy, even if it lasts five seconds.',
      'There is no quota for happiness here.',
      'Sometimes enough is a warm drink and a quiet minute.',
      'You can notice the good without denying the hard.',
      'A day can be messy and still have a lovely moment.',
      'Your smile doesn’t need a special occasion.',
      'The good stuff is often tucked between errands.',
      'Small moments have a way of becoming big memories.',
      'You don’t have to earn a moment of peace.',
      'There is beauty in an ordinary afternoon.',
      'Joy can show up quietly. That still counts.',
      'A shared laugh is a tiny kind of magic.',
      'An uneventful day can be a very good day.',
      'Some of the sweetest memories began as nothing special.',
      'If something made you smile, it mattered for a moment.',
      'Be gentle with today. It is still unfolding.',
      'You are allowed to enjoy a simple thing just because.',
      'Life happens in the little in-between moments.',
      'One lovely minute does not need to fix the whole day.',
      'Notice the sunlight. Notice the silly things. Notice yourself.',
      'You can be grateful and still have a hard day.',
      'There’s no race to have a happier life.',
      'A moment doesn’t have to last to be real.',
      'The days you call ordinary are still your life.',
      'Sometimes a little is plenty.',
      'A laugh you almost forgot was still a laugh.',
      'There is no right way to have a good moment.'
    ],
    joke: [
      'Why did the sun bring sunglasses? It was having a bright idea.',
      'What did the coffee say to the morning? You’ve bean lovely.',
      'Why did the cloud take a day off? It needed a little sky-time.',
      'What’s a plant’s favorite compliment? You grow, girl.',
      'Why did the cookie smile? Life was pretty sweet.',
      'What did one sock say to the other? We make a great pair.',
      'Why was the notebook so calm? It had everything written down.',
      'Why did the lamp feel proud? It brightened someone’s day.',
      'What did the blanket say after a long day? I’ve got you covered.',
      'Why did the orange stop rushing? It wanted to enjoy the zest of life.',
      'What did the window say to the sunshine? You make my day.',
      'Why did the bicycle tell a joke? It wanted to lighten the cycle.',
      'Why was the tiny bell so cheerful? It knew how to ring in the good times.',
      'Why did the spoon get invited everywhere? It always stirred up a smile.',
      'What did the pillow say? Rest is kind of my thing.',
      'Why did the garden throw a party? Everything was blooming marvelous.',
      'What did one candle tell another? You glow, friend.',
      'Why did the rain love the sidewalk? It always made a splash.',
      'Why did the toast feel appreciated? Someone buttered it up.',
      'What did the moon say to the stars? You’re looking radiant.',
      'Why did the dog sit by the clock? It was waiting for a pawsitive moment.',
      'What does a happy clock say? It’s about time!',
      'What did the tea bag tell the mug? Thanks for making room.',
      'Why did the pencil laugh? The joke had a good point.',
      'Why did the honeybee hum? It couldn’t remember the words.',
      'What did the little pebble say? I’m taking life one step at a time.',
      'Why did the fridge tell jokes? It wanted to keep things cool.',
      'What did the happy potato say? I’m feeling a-peel-ing.',
      'Why did the book visit the park? It needed a change of scenery.',
      'What’s a sunny day’s favorite greeting? Hey, sunshine!',
      'Why did the lemon grin? It found the sweet side.',
      'What did the chair tell its friend? Take a seat. You deserve a break.'
    ]
  };
  function loadSunshineSettings(){
    try {
      const saved=JSON.parse(localStorage.getItem(SUNSHINE_SETTINGS_KEY)||'{}');
      return {
        show:saved.show!==false,
        type:['mix','joke','quote'].includes(saved.type)?saved.type:'mix',
        alerts:saved.alerts===true
      };
    } catch {return {show:true,type:'mix',alerts:false};}
  }
  let sunshineSettings=loadSunshineSettings();
  const hourKey=(when=new Date())=>`${dateKey(when)}-${when.getHours()}`;
  let sunshineHour=hourKey();
  let sunshineOffset=0;
  let lastSunshineAlertHour=sunshineHour;
  function saveSunshineSettings(){
    try{localStorage.setItem(SUNSHINE_SETTINGS_KEY,JSON.stringify(sunshineSettings));}
    catch{showToast('Could not save this preference on your device.');}
  }
  function hourHash(value){
    let hash=2166136261;
    for(const char of value){hash=Math.imul(hash ^ char.charCodeAt(0),16777619);}
    return hash>>>0;
  }
  function currentSunshine(){
    const key=hourKey();
    const hash=hourHash(key);
    const type=sunshineSettings.type==='mix'?(hash%2===0?'joke':'quote'):sunshineSettings.type;
    const pool=SUNSHINE_MESSAGES[type];
    return {type,text:pool[(hourHash(`${key}:${type}`)+sunshineOffset)%pool.length]};
  }
  function hourlySunshineCard(){
    if(!sunshineSettings.show)return '';
    const note=currentSunshine();
    return `<section class="sunshine-note-card" aria-label="A little sunshine for this hour">
      <div class="sunshine-note-heading">${icon('sun',18)} <span>A little sunshine</span><span class="sunshine-note-hour">A NEW NOTE EACH HOUR</span></div>
      <div class="sunshine-note-type">${note.type==='joke'?'A LITTLE JOKE':'A LITTLE REMINDER'}</div>
      <p class="sunshine-note-text" id="sunshine-note-text">${escapeHtml(note.text)}</p>
      <div class="sunshine-note-bottom"><span>No pressure, just a little something.</span><button type="button" class="sunshine-another" data-sun-another aria-label="Show another joke or reminder">${icon('sparkle',14)} Another one</button></div>
    </section>`;
  }
  function sunshineSettingsHtml(){
    return `<div class="section-heading"><h2>A little sunshine</h2></div>
      <div class="settings-card">
        <button class="settings-row" type="button" data-sun-toggle-card aria-pressed="${sunshineSettings.show}">
          ${icon('sun',22)}<span><strong>Hourly joke or reminder</strong><small>${sunshineSettings.show?'On — a fresh note appears every hour in Today.':'Off — you can turn it back on whenever you like.'}</small></span><span class="settings-status">${sunshineSettings.show?'On':'Off'}</span>
        </button>
        <div class="sunshine-settings-type"><span>Show me</span><div class="sunshine-choice-group" role="group" aria-label="Hourly note type">
          ${[['mix','A mix'],['joke','Jokes'],['quote','Little reminders']].map(([key,label])=>`<button type="button" class="sunshine-choice ${sunshineSettings.type===key?'active':''}" aria-pressed="${sunshineSettings.type===key}" data-sun-category="${key}">${label}</button>`).join('')}
        </div></div>
        <button class="settings-row" type="button" data-sun-alerts aria-pressed="${sunshineSettings.alerts}">
          ${icon('sparkle',22)}<span><strong>Browser reminders (experimental)</strong><small>${sunshineSettings.alerts?'On while Little Joys is open, between 9 AM and 9 PM.':'Off — optionally allow alerts while Little Joys is open.'}</small></span><span class="settings-status">${sunshineSettings.alerts?'On':'Off'}</span>
        </button>
      </div>
      <p class="info-note">This website cannot reliably send hourly reminders when it is closed or your phone is locked. That will need the future native app. You can always turn alerts off.</p>`;
  }
  async function toggleSunshineAlerts(){
    if(sunshineSettings.alerts){sunshineSettings.alerts=false;saveSunshineSettings();render();showToast('Browser reminders turned off.');return;}
    if(!('Notification' in window) || !window.isSecureContext){showToast('Browser alerts are not available here. The hourly note will still appear in the app.');return;}
    let permission=Notification.permission;
    if(permission==='default'){
      try{permission=await Notification.requestPermission();}
      catch{permission='denied';}
    }
    if(permission==='granted'){
      sunshineSettings.alerts=true;
      lastSunshineAlertHour=hourKey();
      saveSunshineSettings();render();showToast('Hourly browser reminders are on while the app is open.');
    } else showToast('Notifications weren’t allowed. You can still enjoy the notes in the app.');
  }
  function maybeHourlySunshineAlert(){
    const now=new Date();
    const key=hourKey(now);
    if(key===lastSunshineAlertHour)return;
    lastSunshineAlertHour=key;
    if(!sunshineSettings.alerts || document.hidden || now.getHours()<9 || now.getHours()>=21 ||
       !('Notification' in window) || Notification.permission!=='granted')return;
    try{
      const note=currentSunshine();
      new Notification(note.type==='joke'?'A little joke from Little Joys':'A little sunshine from Little Joys',
        {body:note.text,icon:'icons/icon-192.png',tag:'little-joys-hourly'});
    } catch { /* Not every browser supports page-level notifications. */ }
  }
  let moments = loadMoments();
  let currentTab = 'today';
  let journalFilter = 'all';
  let journalQuery = '';
  let editingId = null;
  let creatingType = null;
  let draftPhoto = null;
  let removeExistingPhoto = false;
  let photoDialogSession = 0;
  let previousMoment = null;
  let toastTimer = null;
  let lastDate = dateKey(new Date());
  // Microphone is ALWAYS off until the user expressly starts a session.
  // No audio data is written to storage or transmitted anywhere.
  const mic = {
    status:'off',stream:null,context:null,source:null,analyser:null,samples:null,
    raf:0,token:0,noise:0.008,above:false,lastOnset:0,onsets:[],
    cooldownUntil:0,lastSample:0,pending:false,level:0,error:''
  };
  function isMicSupported() {
    return !!(window.isSecureContext && navigator.mediaDevices?.getUserMedia && (window.AudioContext||window.webkitAudioContext));
  }
  function micStatusText(){
    if(mic.status==='on')return 'Listening only while this page is open';
    if(mic.status==='starting')return 'Waiting for microphone permission…';
    if(mic.status==='error')return mic.error || 'Could not start microphone';
    return 'Microphone is off';
  }
  function micCard() {
    return `<section class="mic-card" aria-labelledby="mic-heading">
      <div class="mic-heading"><span class="mic-symbol">${icon('microphone',20)}</span><div><div class="eyebrow">OPTIONAL · EXPERIMENTAL</div><h2 id="mic-heading">Listen for little laughs</h2></div></div>
      <p class="mic-description">Try a microphone-based experiment that notices laughter-like sounds. It can mistake talking or other sounds for laughter, so <strong>you decide what to save.</strong></p>
      <div class="mic-control-row"><button type="button" class="mic-toggle ${mic.status==='on'?'active':''}" data-mic-toggle aria-pressed="${mic.status==='on'}">${mic.status==='on'||mic.status==='starting'?'Stop listening':'Start listening'}</button><div class="mic-status"><span class="mic-status-dot ${mic.status==='on'?'listening':''}"></span><span>${escapeHtml(micStatusText())}</span></div></div>
      <div class="mic-visual" ${mic.status==='on'?'':'hidden'}><div class="mic-level-track"><div class="mic-level-fill" id="mic-level" style="width:${Math.round(mic.level)}%"></div></div><small>Microphone activity · not a happiness score</small></div>
      ${mic.pending?`<div class="mic-candidate" role="status"><strong>Was that a laugh?</strong><p>I heard a possible laugh. Sound alone can be misleading.</p><div class="mic-candidate-actions"><button type="button" data-mic-confirm>Yes, save a laugh</button><button type="button" class="mic-dismiss" data-mic-dismiss>No, dismiss</button></div></div>`:''}
      <p class="mic-privacy">${icon('shield',14)} No audio recordings, transcription, uploads, or automatic saving. Listening stops when you leave this screen, switch apps, or lock your phone.</p>
    </section>`;
  }
  function updateMicLevel() {
    const bar=document.querySelector('#mic-level');
    if(bar)bar.style.width=`${Math.round(mic.level)}%`;
  }
  async function stopMic(silent=false) {
    mic.token++;
    if(mic.raf){cancelAnimationFrame(mic.raf);mic.raf=0;}
    if(mic.stream){mic.stream.getTracks().forEach(track=>track.stop());mic.stream=null;}
    mic.source?.disconnect(); mic.source=null; mic.analyser=null; mic.samples=null;
    const context=mic.context;mic.context=null;
    if(context && context.state!=='closed')context.close().catch(()=>{});
    const wasOn=mic.status==='on'||mic.status==='starting';
    mic.status='off';mic.level=0;mic.above=false;mic.onsets=[];
    if(!silent&&wasOn)showToast('Microphone off. Nothing was recorded.');
    if(currentTab==='today')render();
  }
  function detectLaughLikeBurst(now, rms) {
    // A deliberately conservative volume/rhythm experiment, NOT voice or emotion AI.
    // Speech, music, coughing or other short repeated sounds can trigger it.
    if(rms<mic.noise*1.6)mic.noise=.985*mic.noise+.015*rms;
    const gate=Math.max(.018, mic.noise*2.6);
    const above=rms>gate;
    if(above&&!mic.above&&now-mic.lastOnset>135){
      mic.lastOnset=now;
      mic.onsets.push(now);
      mic.onsets=mic.onsets.filter(t=>now-t<3000);
      if(mic.onsets.length>=3 && !mic.pending && now>mic.cooldownUntil){
        const last=mic.onsets.slice(-3), a=last[1]-last[0], b=last[2]-last[1];
        if(a>=140&&a<=970&&b>=140&&b<=970){
          mic.pending=true;mic.cooldownUntil=now+9000;mic.onsets=[];
          if(currentTab==='today')render();
        }
      }
    }
    mic.above=above;
  }
  function micFrame(now) {
    if(mic.status!=='on'||!mic.analyser||document.hidden||currentTab!=='today')return;
    mic.raf=requestAnimationFrame(micFrame);
    if(now-mic.lastSample<85)return;
    mic.lastSample=now;
    mic.analyser.getFloatTimeDomainData(mic.samples);
    let sum=0;
    for(let i=0;i<mic.samples.length;i++)sum+=mic.samples[i]*mic.samples[i];
    const rms=Math.sqrt(sum/mic.samples.length);
    mic.level=Math.max(2,Math.min(100,Math.round(100*rms*10)));
    updateMicLevel();
    detectLaughLikeBurst(now,rms);
  }
  async function startMic() {
    if(mic.status==='on'||mic.status==='starting')return;
    if(!isMicSupported()){
      mic.status='error';mic.error='Open your published HTTPS app in Safari or Chrome to try this.';
      render();showToast('Microphone unavailable in this browser.');return;
    }
    mic.status='starting';mic.error='';mic.pending=false;mic.onsets=[];
    const token=++mic.token;
    render();
    let stream=null,context=null;
    try {
      stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
      if(token!==mic.token||currentTab!=='today'||document.hidden){stream.getTracks().forEach(t=>t.stop());return;}
      const AudioCtx=window.AudioContext||window.webkitAudioContext;
      context=new AudioCtx();
      await context.resume();
      if(token!==mic.token||currentTab!=='today'||document.hidden){stream.getTracks().forEach(t=>t.stop());context.close().catch(()=>{});return;}
      mic.stream=stream;mic.context=context;
      mic.source=context.createMediaStreamSource(stream);
      mic.analyser=context.createAnalyser();mic.analyser.fftSize=2048;mic.analyser.smoothingTimeConstant=.2;
      mic.source.connect(mic.analyser);
      mic.samples=new Float32Array(mic.analyser.fftSize);
      mic.noise=.008;mic.above=false;mic.lastSample=0;mic.lastOnset=0;mic.onsets=[];
      mic.cooldownUntil=performance.now()+2000;
      mic.status='on';
      stream.getTracks().forEach(track=>track.addEventListener('ended',()=>{if(mic.stream===stream)stopMic();}));
      render();mic.raf=requestAnimationFrame(micFrame);
      showToast('Listening started. No audio is stored.');
    } catch(e) {
      stream?.getTracks().forEach(t=>t.stop());
      if(context&&context.state!=='closed')context.close().catch(()=>{});
      if(token!==mic.token)return;
      mic.status='error';
      mic.error=e?.name==='NotAllowedError'?'Microphone blocked. Check your browser’s site permissions.':e?.name==='NotFoundError'?'No microphone was found.':'Microphone unavailable. Try Safari or Chrome.';
      render();showToast(mic.error);
    }
  }
  function micConfirm() {
    if(!mic.pending)return;
    mic.pending=false; mic.cooldownUntil=performance.now()+4500;
    record('laugh');
  }
  function micDismiss() {
    mic.pending=false;mic.cooldownUntil=performance.now()+4500;render();
  }


  // Native iOS-only widget journal bridge. Does nothing in an ordinary browser.
  const joyBridge = window.Capacitor?.isNativePlatform?.() && window.Capacitor?.getPlatform?.()==='ios'
    ? window.Capacitor.registerPlugin('JoyBridge') : null;
  let syncBusy=false;
  async function syncWidgetJournal() {
    if(!joyBridge || syncBusy)return;
    syncBusy=true;
    try {
      const response=await joyBridge.getEvents();
      const events=Array.isArray(response.events)?response.events:[];
      const known=new Set(moments.map(m=>m.id));
      let changed=false;
      for(const e of events){
        if(e && typeof e.id==='string' && !known.has(e.id) && (e.type==='laugh'||e.type==='joy')){
          const m=cleanMoment({id:e.id,type:e.type,timestamp:e.timestamp,note:'',sample:false});
          if(m){moments.push(m);known.add(m.id);changed=true;}
        }
      }
      if(changed){moments.sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp));persist();render();}
      // Ack only after journal persists. Never drop entries on write failure.
      if(events.length && localStorage.getItem(STORAGE_KEY)){
        await joyBridge.ackEvents({ids:events.filter(e=>known.has(e.id)).map(e=>e.id)});
      }
      await joyBridge.setCounts({laugh:countTypes(todayMoments()).laugh,joy:countTypes(todayMoments()).joy});
    }catch(error){console.warn('Widget synchronization unavailable:',error);}
    finally{syncBusy=false;}
  }
  function persist() {
    try { localStorage.setItem(STORAGE_KEY,JSON.stringify(moments)); if(joyBridge) setTimeout(syncWidgetJournal,0); return true; }
    catch { showToast('Could not save on this device. Try freeing storage.'); return false; }
  }
  function showToast(message, actionLabel='', action) {
    clearTimeout(toastTimer);
    toastEl.replaceChildren();
    const label = document.createElement('span'); label.className='toast-content'; label.textContent=message;
    toastEl.append(label);
    if (actionLabel && typeof action === 'function') {
      const button=document.createElement('button');button.type='button';button.textContent=actionLabel;
      button.addEventListener('click',()=>{toastEl.classList.remove('show');clearTimeout(toastTimer);action();});
      toastEl.append(button);
    }
    toastEl.classList.add('show');
    toastTimer=setTimeout(()=>toastEl.classList.remove('show'),4400);
  }
  function todayMoments() { const today=dateKey(new Date()); return moments.filter(m=>momentDay(m)===today); }
  function countTypes(items) { return {laugh:items.filter(m=>m.type==='laugh').length,joy:items.filter(m=>m.type==='joy').length}; }
  function emptyState(title,detail, symbol='sparkle') { return `<div class="empty-state"><div class="empty-icon">${icon(symbol,24)}</div><h3>${title}</h3><p>${detail}</p></div>`; }
  // A saved moment deserves a soft celebration: rising number, tiny sparkles, and a glowing sun.
  // All feedback is decorative. Saving happens immediately, even if animations are reduced/disabled.
  const prefersLessMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  function animateMomentCount(type, previous) {
    const countEl = content.querySelector(`[data-count="${type}"]`);
    if (!countEl) return;
    const target = previous + 1;
    if (prefersLessMotion()) {countEl.textContent=String(target);return;}
    countEl.textContent=String(previous);
    countEl.classList.add('number-pop');
    const start=performance.now();
    const duration=560;
    const tick=(now)=>{
      if(!countEl.isConnected)return;
      const progress=Math.min(1,(now-start)/duration);
      const eased=1-Math.pow(1-progress,3);
      countEl.textContent=String(Math.round(previous+(target-previous)*eased));
      if(progress<1)requestAnimationFrame(tick);
      else countEl.textContent=String(target);
    };
    requestAnimationFrame(tick);
  }
  function sparkleAt(button,type) {
    if(prefersLessMotion())return;
    const rect=button.getBoundingClientRect();
    const layer=document.createElement('div');
    layer.className=`moment-sparkle-layer ${type}`;
    layer.setAttribute('aria-hidden','true');
    const centerX=rect.left+rect.width*.5, centerY=rect.top+rect.height*.4;
    for(let i=0;i<10;i++){
      const spark=document.createElement('span');
      spark.className='moment-spark';
      spark.textContent=i%3===0?'✦':i%3===1?'✧':'•';
      const angle=(i/10)*Math.PI*2-Math.PI/2;
      const distance=42+((i*13)%24);
      spark.style.left=`${centerX}px`;
      spark.style.top=`${centerY}px`;
      spark.style.setProperty('--spark-dx',`${Math.cos(angle)*distance}px`);
      spark.style.setProperty('--spark-dy',`${Math.sin(angle)*distance}px`);
      spark.style.setProperty('--spark-delay',`${(i%3)*32}ms`);
      layer.append(spark);
    }
    document.body.append(layer);
    window.setTimeout(()=>layer.remove(),1050);
  }
  function glowSavedSun() {
    const sunNodes=document.querySelectorAll('.sunshine-header, .sunshine-hero');
    for(const node of sunNodes){
      node.classList.remove('joy-sun-saved');
      // Restart the animation even when saving two moments in quick succession.
      void node.offsetWidth;
      node.classList.add('joy-sun-saved');
      if(node._joyGlowTimer)clearTimeout(node._joyGlowTimer);
      node._joyGlowTimer=window.setTimeout(()=>node.classList.remove('joy-sun-saved'),1200);
    }
  }
  function celebrateSavedMoment(type, previous) {
    const button=content.querySelector(`.moment-trigger.${type}`);
    if(button){
      button.classList.add(type==='laugh'?'glow-laugh':'glow-joy','moment-celebrate');
      sparkleAt(button,type);
      window.setTimeout(()=>{
        button.classList.remove('glow-laugh','glow-joy','moment-celebrate');
      },950);
    }
    animateMomentCount(type,previous);
    glowSavedSun();
  }
  function record(type, celebrate=false) {
    const previous=celebrate?countTypes(todayMoments())[type]:0;
    const item={id:randomId(),type,timestamp:new Date().toISOString(),note:'',sample:false};
    moments.unshift(item);persist();render();syncWidgetJournal();
    if(celebrate)celebrateSavedMoment(type,previous);
    if(type==='laugh')companion.water(()=>garden.celebrateLaugh());
    showToast(type==='laugh'?'That little laugh is saved.':'That happy moment is saved.','Add a note',()=>openNote(item.id));
  }
  function pulseMomentTrigger(button,type){record(type,true);}
  function removeMoment(id) {
    const index=moments.findIndex(m=>m.id===id); if (index<0) return;
    const [deleted]=moments.splice(index,1);persist();render();
    showToast('Moment removed.','Undo',()=>{moments.unshift(deleted);moments.sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp));persist();render();showToast('Your moment is back.');});
    setTimeout(()=>{if(!moments.some(m=>m.id===id))deletePhoto(id).catch(()=>{});},7000);
  }
  function momentCard(m) {
    const d=new Date(m.timestamp);
    return `<article class="moment-card">
      <div class="moment-dot ${m.type==='joy'?'joy':''}">${icon(m.type==='laugh'?'laugh':'heart',19)}</div>
      <div class="moment-body"><div class="moment-meta"><time datetime="${escapeHtml(m.timestamp)}">${escapeHtml(timeText(d))}</time>${m.sample?'<span>· demo</span>':''}</div><div class="moment-kind">${momentName(m)}</div>${m.note?`<p class="moment-note">${escapeHtml(m.note)}</p>`:''}${m.photo?`<img class="moment-photo" data-photo-id="${escapeHtml(m.id)}" alt="Photo saved with this moment" loading="lazy">`:''}</div>
      <div class="moment-actions-inline"><button class="small-icon-button" type="button" data-share="${escapeHtml(m.id)}" aria-label="Share ${momentName(m)} with a friend" title="Share this memory">${icon('share',16)}</button><button class="small-icon-button" type="button" data-edit="${escapeHtml(m.id)}" aria-label="${m.note?'Edit note':'Add a note'} for ${momentName(m)}" title="${m.note?'Edit note':'Add a note'}">${icon('edit',16)}</button><button class="small-icon-button" type="button" data-delete="${escapeHtml(m.id)}" aria-label="Delete ${momentName(m)}" title="Delete">${icon('trash',16)}</button></div>
    </article>`;
  }
  const garden = (function gardenBuilder(){
  const BEE_KEY='little-joys.bumble.tone.v1';
  let tone=localStorage.getItem(BEE_KEY)||'gentle', messageOffset=0;
  const beeLines=[
    'Bee honest… did something make you smile today?',
    'The tiny moments matter too. I saved you a sunny spot!',
    'Why did the bee have sticky hair? It used a honeycomb!',
    'Your garden is always yours, even on a quiet day.',
    'A little joy can bloom whenever it wants to.',
    'How does a flower ride a bike? It petals!'
  ];
  // Real flowers and traditional symbolic associations; hours are imaginative assignments.
  const FLOWER_CLOCK = [["Snowdrop","Hope"],["Violet","Faithfulness"],["Forget-me-not","Remembrance"],["Bluebell","Kindness"],["Lily of the valley","Return of happiness"],["Crocus","Cheerfulness"],["Daffodil","New beginnings"],["Daisy","Innocence"],["Freesia","Friendship"],["Tulip","Love and passion"],["Garden pink","Pure love"],["Pansy","Thoughtfulness"],["Sunflower","Adoration and dedication"],["Goldenrod","Encouragement"],["Coreopsis","Cheerfulness"],["Peony","Bashfulness"],["Orchid","Elegance"],["Gladiolus","Strength of character"],["Pink rose","Gratitude and admiration"],["Lavender","Devotion"],["Iris","A flame of love"],["Sweet pea","Delicate pleasures"],["Hyacinth","Steadfastness"],["Aster","Patience"]];
  const petals=['#f1b5b1','#f7d28c','#e6b7cb','#f4c69e','#d9c5ed','#fff1b4','#f4a99a'];
  function seed(str){let h=2166136261;for(const c of String(str))h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;}
  function rnd(key,salt){return seed(key+':'+salt)/4294967295;}
  function weekOf(date){const d=new Date(date);d.setHours(0,0,0,0);d.setDate(d.getDate()-(d.getDay()+6)%7);return d;}
  function weekKey(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
  function items(start){const end=new Date(start);end.setDate(end.getDate()+7);return moments.filter(m=>{const t=new Date(m.timestamp);return t>=start&&t<end;});}
  function label(start){const end=new Date(start);end.setDate(end.getDate()+6);return start.toLocaleDateString(undefined,{month:'short',day:'numeric'})+' – '+end.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});}
  // One moment = one flower. Local hour (0–23) chooses one of 24 distinct botanical designs.
  // Its shape is stable across visits, and morning vs evening flowers differ.
  // 24 hand-illustrated botanical silhouettes for the Flower Clock.
  // One type per local hour; flower meaning is the Flower Book's traditional association.
  // No decorative flowers are added to the count.
  function flower(moment){
    const hour=new Date(moment.timestamp).getHours();
    const [name,meaning]=FLOWER_CLOCK[hour];
    const pet=(x,y,rx,ry,c,rot=0,stroke='')=>'<ellipse cx="'+x+'" cy="'+y+'" rx="'+rx+'" ry="'+ry+'" fill="'+c+'" stroke="'+(stroke||c)+'" stroke-width=".65" transform="rotate('+rot+' '+x+' '+y+')"/>';
    const path=(d,c,stroke='',w=1)=>'<path d="'+d+'" fill="'+c+'" stroke="'+(stroke||c)+'" stroke-width="'+w+'" stroke-linejoin="round" stroke-linecap="round"/>';
    const circle=(x,y,r,c)=>'<circle cx="'+x+'" cy="'+y+'" r="'+r+'" fill="'+c+'"/>';
    const repeat=(n,f)=>Array.from({length:n},(_,i)=>f(i)).join('');
    const radial=(n,rx,ry,c,offset=28,shift=0)=>repeat(n,i=>'<g transform="rotate('+(i*360/n+shift)+' 50 50)">'+pet(50,offset,rx,ry,c)+'</g>');
    const littleBloom=(x,y,color,r=5,mid='#f3d77e')=>repeat(5,i=>{const a=i*Math.PI*2/5;return pet(x+Math.sin(a)*r*.69,y-Math.cos(a)*r*.69,r*.52,r*.8,color,i*72);})+circle(x,y,r*.38,mid);
    const pointed=(n,color,length=28,width=12)=>repeat(n,i=>'<path d="M50 50Q'+(50-width)+' '+(50-length*.65)+' 50 '+(50-length)+'Q'+(50+width)+' '+(50-length*.65)+' 50 50Z" fill="'+color+'" stroke="'+color+'" stroke-width=".8" transform="rotate('+(i*360/n)+' 50 50)"/>');

    let head='',stem='',leaves='',accent='';
    const normalStem=()=>{stem=path('M50 55 Q47 82 50 121','none','#76966a',3.5);leaves=path('M49 96Q20 76 23 100Q38 108 49 99','#91b582')+path('M50 105Q79 81 77 102Q65 115 50 108','#82a473');};
    const bell=(x,y,c)=>path('M'+(x-7)+' '+(y-9)+' Q'+x+' '+(y-16)+' '+(x+7)+' '+(y-9)+' L'+(x+8)+' '+(y+3)+' Q'+x+' '+(y+12)+' '+(x-8)+' '+(y+3)+' Z',c,'#9b9ab2');
    normalStem();
    switch(hour){
      case 0: // Snowdrop — hanging white, three long petals
        stem=path('M46 121Q45 71 57 39Q65 28 69 38','none','#809d73',3);
        head=path('M68 36Q49 47 53 68Q60 74 68 51Z','#fffdf1','#c5cbba')+path('M68 37Q65 60 77 68Q84 55 68 37Z','#f7fcf0','#c5cabc')+path('M68 39Q65 62 66 73Q73 64 68 39Z','#e5f0dd','#a7c1a1');
        break;
      case 1: // Violet — asymmetrical purple heart-shaped petals
        head=pet(34,39,15,13,'#8b78c0',-22)+pet(64,39,15,13,'#9b8ad0',18)+pet(50,30,12,15,'#a89ada')+pet(37,61,16,14,'#9178be',22)+pet(64,60,16,15,'#947ac0',-24)+circle(50,52,7,'#f2e4b1');break;
      case 2: // Forget-me-not: loose sprays of small blue five-petaled flowers
        stem=path('M50 121Q54 80 46 44M49 88Q29 65 28 40M49 75Q68 50 74 32','none','#7a9c72',3);
        leaves=path('M48 94Q20 76 27 96Q41 106 49 99','#8cad83');
        head=[[29,38],[48,28],[69,33],[39,51],[61,52],[25,66],[49,69],[73,67],[43,86]].map(([x,y])=>littleBloom(x,y,'#85b9df',7,'#edcc69')).join('');
        break;
      case 3: // Bluebell: arching stem with downward-facing blue bells
        stem=path('M46 123Q41 65 68 28','none','#729678',3.1);
        leaves=path('M48 104Q30 75 35 74Q51 87 51 110','#82aa7d');
        head=repeat(6,i=>{const x=67-i*6.2,y=30+i*11;return path('M'+x+' '+y+'Q'+(x+13)+' '+(y+4)+' '+(x+9)+' '+(y+14),'none','#739978',1.4)+path('M'+(x+1)+' '+(y+12)+'Q'+(x-7)+' '+(y+16)+' '+(x-4)+' '+(y+27)+'Q'+(x+4)+' '+(y+34)+' '+(x+11)+' '+(y+24)+'Q'+(x+15)+' '+(y+16)+' '+(x+1)+' '+(y+12)+'Z','#8298d1','#6f83b4');});
        break;
      case 4: // Lily of the valley: suspended ivory bells and broad leaf
        stem=path('M48 122Q56 85 56 24','none','#75996d',3);
        leaves=path('M45 112Q18 82 31 59Q49 68 50 110Z','#91b481')+path('M55 113Q83 85 71 69Q53 77 53 111Z','#86aa78');
        head=repeat(7,i=>{const x=55+(i%2?18:-17),y=29+i*10;return path('M55 '+(y-6)+'Q'+x+' '+(y-8)+' '+x+' '+y,'none','#739976',1.5)+bell(x,y,'#fffdf3');});
        break;
      case 5: // Crocus: six upward violet tepals surrounding orange stamens
        stem=path('M50 75Q50 103 50 122','none','#78976d',3);
        leaves=path('M48 117Q32 92 39 83Q48 90 52 118','#7fa76f')+path('M52 120Q67 91 61 84Q52 93 50 118','#98b87e');
        head=pointed(6,'#baa6dc',36,15)+path('M50 61L48 27M52 59L55 31','none','#e4ad50',3.2)+circle(50,39,4,'#f1c36b');
        break;
      case 6: // Daffodil — six pointed yellow tepals and a golden projecting trumpet
        head=pointed(6,'#f1d36c',29,14)
          +circle(50,50,13,'#edb34f')
          +path('M38 43Q50 36 62 43L65 57Q50 65 35 57Z','#efae42','#cd9045')
          +path('M38 45Q50 41 62 45','none','#f8d27c',1.8)
          +circle(50,52,5,'#d99836');
        break;
      case 7: // Daisy — white radial ray florets and golden textured disk
        head=radial(18,5.5,17,'#fffef2',29,8)
          +radial(18,4.5,14,'#f6f3e7',31,18)
          +circle(50,50,12,'#e8bf63')
          +repeat(14,i=>{const t=i*2.39996,r=3+Math.sqrt(i)*2.15;return circle(50+Math.sin(t)*r,50+Math.cos(t)*r,1.1,'#dca34d');});
        break;
      case 8: // Freesia: curved inflorescence and flared funnel blossoms
        stem=path('M49 122Q59 75 32 26','none','#78976a',3);
        leaves=path('M49 115Q22 87 31 74Q47 83 53 117','#91ab7d');
        head=repeat(5,i=>{const x=31+i*11,y=27+i*13;return path('M'+(x-4)+' '+(y+13)+'Q'+(x-18)+' '+(y-5)+' '+(x-3)+' '+(y-12)+'Q'+(x+7)+' '+(y-17)+' '+(x+14)+' '+(y-2)+'Q'+(x+14)+' '+(y+11)+' '+(x-4)+' '+(y+13)+'Z',i%2?'#f4d7ac':'#fff0c9','#dfbd8e')+circle(x+3,y+1,3,'#e8ba69');});
        break;
      case 9: // Tulip — upright goblet
        head=path('M28 58Q22 38 29 23Q39 30 50 39Q60 23 70 22Q79 44 72 58Q65 79 50 79Q33 78 28 58Z','#eca7a5','#d78d92')+path('M43 70Q39 42 49 26Q62 41 58 71Z','#f5c7b7','#dba7a2');break;
      case 10: // Dianthus: frilled petal edges, compact pink flower
        head=repeat(6,i=>path('M50 50L35 24l5 1 2-7 5 5 5-7 5 7 7-3-2 30Z','#e6a1b8','#ce83a4').replace('<path ','<path transform="rotate('+(i*60)+' 50 50)" '))+circle(50,50,7,'#ac789a');
        break;
      case 11: // Pansy — broad upper lobes and contrasting lower face
        head=pet(31,37,18,18,'#9475bd',-20)
          +pet(69,37,18,18,'#9b82c6',20)
          +pet(50,27,15,18,'#ae9dd5')
          +pet(34,62,18,18,'#e2c272',-21)
          +pet(66,62,18,18,'#e7c87e',21)
          +path('M35 46Q42 36 50 49Q59 36 65 46Q59 60 50 60Q42 61 35 46Z','#675085','#675085')
          +circle(50,50,3.3,'#f1ca68');
        break;
      case 12: // Sunflower — a proper radial yellow ray and detailed brown seed disk
        head=radial(20,7.5,19,'#eab748',24,0)
          +radial(20,6.2,17,'#f4cb60',25,9)
          +circle(50,50,19,'#765335')
          +circle(50,50,15,'#89613b')
          +repeat(33,i=>{const t=i*2.39996,r=3+Math.sqrt(i)*2.6;return circle(50+Math.sin(t)*r,50+Math.cos(t)*r,1.1,i%2?'#b78a51':'#dbb36d');});
        break;
      case 13: // Goldenrod: branching golden plume rather than a solitary daisy
        stem=path('M49 122Q44 82 51 23','none','#73926a',3);
        head=repeat(8,i=>{const y=33+i*8.4,span=9+i*2.8;return path('M50 '+y+'Q'+(50-span/2)+' '+(y-3)+' '+(50-span)+' '+(y-8),'none','#7f9e6a',1.1)+path('M50 '+y+'Q'+(50+span/2)+' '+(y-5)+' '+(50+span)+' '+(y-10),'none','#7f9e6a',1.1)+repeat(3,j=>circle(50-span+(j*3.6),y-8+j*.6,2,'#e7b84d')+circle(50+span-(j*3.6),y-10+j*.7,2,'#eac052'));});
        break;
      case 14: // Coreopsis: sunny toothed yellow rays and brown center
        head=repeat(9,i=>path('M50 51Q36 33 36 23L41 25L44 18L51 24L57 18L60 26Q66 39 50 51Z','#eec964','#d8a74b').replace('<path ','<path transform="rotate('+(i*40)+' 50 50)" '))+circle(50,50,11,'#a87540');
        break;
      case 15: // Peony — lush ruffled whorls that fill a broad rounded blossom
        head=radial(8,14,18,'#df9da9',31,9)
          +radial(10,11,15,'#edb3bd',33,0)
          +radial(9,8,12,'#f5c8c8',39,16)
          +repeat(6,i=>pet(50+Math.cos(i*Math.PI/3)*5,50+Math.sin(i*Math.PI/3)*5,5.3,8.2,'#f7d9d0',i*40))
          +circle(50,51,4.5,'#edc09f');
        break;
      case 16: // Orchid — lateral sepals and a distinct central lip
        head=pet(29,34,17,12,'#d8b3d6',-30)
          +pet(71,34,17,12,'#d8b3d6',30)
          +pet(50,23,14,19,'#e8cee2')
          +pet(30,60,15,11,'#c9a5d0',20)
          +pet(70,60,15,11,'#c9a5d0',-20)
          +path('M39 46Q50 54 61 46Q66 63 57 76L50 82L43 76Q34 61 39 46Z','#a56cb0','#8d5d9b')
          +path('M44 52Q50 58 56 52','none','#f3d39d',3)
          +circle(50,60,4,'#efd29c');
        break;
      case 17: // Gladiolus: alternating blossoms on a tall, single spike
        stem=path('M50 123Q50 70 49 18','none','#77996a',3);
        head=repeat(6,i=>{const y=26+i*14,x=50+(i%2?13:-13);return repeat(5,k=>{const a=k*Math.PI*2/5;return pet(x+Math.sin(a)*9,y-Math.cos(a)*9,6,10,i%2?'#e3a2b4':'#efb4c0',k*72)})+circle(x,y,3.4,'#f1d29b');});
        break;
      case 18: // Pink rose — overlapping pink petals and a small spiraling center
        head=radial(7,14,17,'#da8f9f',32,7)
          +radial(8,10.5,14,'#e8a9b4',36,16)
          +radial(7,8,10,'#f1bcc2',41,0)
          +path('M46 58Q35 48 44 42Q55 34 60 45Q62 54 52 58Q42 57 45 50Q50 46 55 50','none','#c57f91',2.6)
          +path('M37 56Q36 65 49 66Q63 66 66 55','none','#d999a5',2);
        break;
      case 19: // Lavender — slender green stalk dotted with purple calyxes
        stem=path('M50 123Q50 70 49 23','none','#708c70',2.6);
        leaves=path('M49 115Q29 95 34 86Q48 93 51 119','#8eac83')+path('M51 115Q69 95 66 84Q54 94 50 119','#91ad84');
        head=repeat(13,i=>{const y=22+i*4.5,w=3.5+Math.sin(i/13*Math.PI)*3.6;return pet(50-w,y,3.3,5.8,'#9682be',-35)+pet(50+w,y,3.3,5.8,'#a491cb',35);});
        break;
      case 20: // Iris — upright standards and hanging falls
        head=pet(50,27,12,26,'#a4a7d4')+pet(31,37,10,20,'#9ba1cf',-35)+pet(69,37,10,20,'#9ba1cf',35)+path('M43 49Q17 44 19 71Q30 93 47 60Z','#778fbe','#7586ab')+path('M57 49Q83 44 81 71Q70 93 53 60Z','#8395c4','#7586ab')+path('M43 47Q50 43 57 47L52 66L48 66Z','#e5c575');break;
      case 21: // Sweet pea — butterfly wing pairs and curved banner
        head=pet(31,37,20,17,'#d1a6cb',-28)+pet(67,37,20,17,'#e4b8d6',26)+path('M34 53Q27 30 47 27Q63 23 66 53Q57 70 50 60Q41 70 34 53Z','#e5bbd5','#c79abf')+path('M42 53Q48 57 50 72Q54 56 61 53','none','#ad77ad',3);break;
      case 22: // Hyacinth: dense cylindrical cluster of small lilac star florets
        stem=path('M50 121V26','none','#77996d',4);
        leaves=path('M48 121Q27 90 36 72Q49 84 51 121','#83a977')+path('M51 121Q72 92 66 70Q51 86 50 121','#93b283');
        head=repeat(7,i=>repeat(4,j=>{const x=30+j*13+(i%2?5:0),y=23+i*10;return littleBloom(x,y,i%2?'#a994cd':'#b8a6db',7,'#f4e5be');}));
        break;
      case 23: // Aster — thin lavender rays forming a soft starburst
        head=radial(24,4.1,19,'#aa98cc',27,0)
          +radial(24,3.2,16,'#c2b0df',28,7.5)
          +circle(50,50,11,'#e1b95b')
          +repeat(13,i=>{const t=i*2.4,r=2.1+Math.sqrt(i)*2.2;return circle(50+Math.sin(t)*r,50+Math.cos(t)*r,1.05,'#f8e1a4');});
        break;
    }
    // Soft translucent watercolor glazing keeps the illustration warm and light.
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 125" role="img" aria-label="'+name+' — '+meaning+'"><g opacity=".98">'+stem+leaves+'<g class="lj-bloom-head">'+head+accent+'</g><g class="lj-bud-mark"><ellipse cx="50" cy="50" rx="8" ry="12" fill="#e6b2af" stroke="#ce8b95" stroke-width="1"/></g></g></svg>';
  }
  // Bumble faithfully follows the round, side-facing yellow-and-black bee reference.
  function bee(){return '<svg viewBox="0 0 160 130" role="img" aria-label="Bumble the bee"><g stroke="#171512" stroke-linecap="round" stroke-linejoin="round"><path d="M64 35 C65 15 85 7 101 19 C113 28 105 46 90 50Z" fill="#d6f0ff" stroke-width="3.5"/><path d="M88 40 C93 13 125 11 136 34 C143 56 117 66 98 51Z" fill="#e0f3ff" stroke-width="3.5"/><path d="M68 18Q80 30 89 21M66 31Q82 40 100 35M85 17Q85 33 102 47M102 18Q104 40 127 41M119 20Q116 35 139 35M101 50Q113 40 125 61" fill="none" stroke-width="2.2"/><path d="M63 51 C81 41 128 45 140 70 C155 104 124 120 91 113 L66 101Z" fill="#302c25" stroke-width="4"/><path d="M86 47Q99 46 107 54Q122 82 110 114L87 113Q94 78 79 49Z" fill="#ffdc59" stroke="none"/><path d="M129 58Q143 71 143 91Q141 102 137 106L128 103Q136 83 121 53Z" fill="#ffdb59" stroke="none"/><path d="M65 48 C37 38 14 50 10 72 C2 103 31 118 57 111 C79 105 93 91 87 67 C84 56 77 50 65 48Z" fill="#ffdb57" stroke-width="4"/><path d="M37 49Q31 32 23 27M61 47Q62 30 54 25" fill="none" stroke-width="4"/><circle cx="23" cy="25" r="6" fill="#ff9c42" stroke="none"/><circle cx="54" cy="23" r="6" fill="#ff9c42" stroke="none"/><circle cx="27" cy="76" r="2.8" fill="#151410" stroke="none"/><circle cx="60" cy="76" r="2.8" fill="#151410" stroke="none"/><path d="M39 78Q44 91 50 79" fill="none" stroke-width="4.5"/><circle cx="22" cy="85" r="5" fill="#f88e70" stroke="none"/><circle cx="67" cy="86" r="5" fill="#f88e70" stroke="none"/></g></svg>';}
  function positions(entries){
    const joys=entries.filter(m=>m.type==='joy').sort((a,b)=>String(a.timestamp).localeCompare(String(b.timestamp)));
    // Compact painterly flower bed; stems and leaves overlap softly, never a long grid.
    const bands=[[10,25,39,55,70,86],[17,31,46,61,77,91],[9,24,40,56,72,87],[16,31,47,62,77,91]];
    return joys.map((m,i)=>{
      const row=Math.floor(i/6),col=i%6;
      const x=bands[row%bands.length][col]+(rnd(m.id,'x')-.5)*4;
      const y=128+row*58+(col%2?13:-8)+(rnd(m.id,'y')-.5)*12;
      const s=.60+rnd(m.id,'size')*.13;
      return {m,x,y,s,row};
    });
  }
  function growthStage(m,entries){const t=new Date(m.timestamp).getTime();return Math.min(3,entries.filter(x=>x.type==='laugh'&&new Date(x.timestamp).getTime()>t).length);}
  function celebrateLaugh(){
    if(currentTab!=='today')return;
    const el=content.querySelector('.lj-garden-scene');if(!el)return;
    el.classList.remove('lj-watering');void el.offsetWidth;el.classList.add('lj-watering');
    for(const f of el.querySelectorAll('.lj-flower')){
      const stage=Number((f.className.match(/lj-stage-(\d)/)||[])[1]||0);
      if(stage===0)continue;
      // Re-create the earlier growth stage, then animate toward the new bloom.
      const prev=Math.max(0,stage-1);
      f.classList.remove('lj-stage-'+stage);
      f.classList.add('lj-stage-'+prev,'lj-growing');
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        if(!f.isConnected)return;
        f.classList.remove('lj-stage-'+prev);
        f.classList.add('lj-stage-'+stage);
      }));
      window.setTimeout(()=>f.classList.remove('lj-growing'),1750);
    }
    window.setTimeout(()=>el.classList.remove('lj-watering'),1900);
  }
  // A decorative storybook landscape. None of these count as a saved flower.
  function gardenBackdrop(height){
    const hills=Math.max(360,height),wave=(y,depth,color,opacity=1)=>'<path d="M0 '+y+'Q90 '+(y-depth)+' 180 '+(y-2)+'T360 '+(y-8)+'T600 '+(y-5)+'V'+hills+'H0Z" fill="'+color+'" opacity="'+opacity+'"/>';
    const grass=[];
    for(let i=0;i<95;i++){
      const x=8+(i*137)%588,y=145+(i*83)%Math.max(150,hills-170);
      const len=7+(i%4)*2;
      grass.push('<path d="M'+x+' '+y+'q'+((i%2)?-4:4)+' -'+(len*.5)+' '+((i%3)-1)*5+' -'+len+'" fill="none" stroke="#8ca97c" stroke-width="1.5" stroke-linecap="round" opacity=".45"/>');
    }
    const tufts=[];
    for(let i=0;i<Math.ceil(hills/110);i++){
      const y=169+i*108,x=i%2?547:36;
      tufts.push('<path d="M'+x+' '+(y+12)+'Q'+(x-17)+' '+(y-16)+' '+(x-23)+' '+(y+9)+'Q'+(x-7)+' '+(y+23)+' '+x+' '+(y+12)+'M'+x+' '+(y+12)+'Q'+(x+17)+' '+(y-18)+' '+(x+23)+' '+(y+9)+'Q'+(x+6)+' '+(y+23)+' '+x+' '+(y+12)+'Z" fill="#9ab887" opacity=".55"/>');
    }
    return '<svg class="lj-landscape" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 '+hills+'" preserveAspectRatio="none" aria-hidden="true">'+
      '<defs><linearGradient id="lj-garden-sky" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#fff0c4"/><stop offset=".26" stop-color="#fff8e8"/><stop offset="1" stop-color="#e8efd8"/></linearGradient><radialGradient id="lj-garden-sun"><stop stop-color="#ffe69b" stop-opacity=".8"/><stop offset="1" stop-color="#ffe69b" stop-opacity="0"/></radialGradient></defs>'+
      '<rect width="600" height="'+hills+'" fill="url(#lj-garden-sky)"/>'+
      '<circle cx="492" cy="69" r="108" fill="url(#lj-garden-sun)"/><circle cx="492" cy="69" r="35" fill="#f9d981" opacity=".8"/>'+
      wave(116,22,'#e8ebd5')+wave(145,18,'#d7e4bf')+
      wave(204,20,'#c7dab0')+
      '<path d="M304 '+hills+'Q350 '+(hills*.83)+' 306 '+(hills*.67)+'T309 193" stroke="#f5e9cb" stroke-width="49" fill="none" opacity=".43"/>'+
      '<path d="M304 '+hills+'Q350 '+(hills*.83)+' 306 '+(hills*.67)+'T309 193" stroke="#decca8" stroke-width="2" fill="none" stroke-dasharray="3 10" opacity=".38"/>'+
      '<g>'+grass.join('')+tufts.join('')+'</g>'+
      '<path d="M0 0Q22 52 29 97M-5 37Q23 39 48 68M604 0Q562 41 564 91M600 29Q578 51 548 54" fill="none" stroke="#a7bc91" stroke-width="5" opacity=".46"/>'+
      '</svg>';
  }
  function scene(entries,start){
    const pos=positions(entries),laughs=entries.filter(x=>x.type==='laugh').length;
    const rows=Math.max(1,Math.ceil(pos.length/6)),sceneHeight=Math.max(345,160+rows*58);
    const flowers=pos.map(({m,x,y,s,row})=>{
      const stage=growthStage(m,entries),sp=FLOWER_CLOCK[new Date(m.timestamp).getHours()];
      const twist=(rnd(m.id,'twist')-.5)*12;
      return '<button class="lj-flower lj-stage-'+stage+'" type="button" data-edit="'+escapeHtml(m.id)+'" style="left:'+x+'%;top:'+y+'px;--flower-size:'+s+';--flower-rotate:'+twist+'deg;z-index:'+(10+row)+'" title="'+escapeHtml(new Date(m.timestamp).toLocaleString()+' · '+sp.join(' — '))+'" aria-label="'+escapeHtml(sp[0]+'. Bloom stage '+stage+' of 3. Open memory')+'">'+flower(m)+'</button>';
    }).join('');
    return '<div class="lj-garden-scene'+(laughs?' has-laughs':'')+'" style="height:'+sceneHeight+'px;min-height:'+sceneHeight+'px" role="group" aria-label="'+pos.length+' flowers, one per happy moment"><div class="lj-landscape-wrap">'+gardenBackdrop(sceneHeight)+'</div>'+flowers+(!pos.length?'<p class="lj-empty">A sunny little space for your first flower.<small>No rush to grow.</small></p>':'')+'<span class="lj-water-drops" aria-hidden="true">✧ ✧ ✧</span></div>';
  }
  let timelineZoom=1;
  function timelineScene(){
    const planted=moments.filter(m=>m.type==='joy').sort((a,b)=>new Date(a.timestamp)-new Date(b.timestamp));
    const rows=Math.max(1,Math.ceil(planted.length/7));
    const width=790,height=Math.max(400,285+rows*93);
    const pos=planted.map((m,i)=>{
      const row=Math.floor(i/7),col=i%7;
      const offset=(row%2?25:0);
      const x=70+col*103+offset+(rnd(m.id,'x')-.5)*24;
      const y=218+row*91+(col%2?15:-8)+(rnd(m.id,'y')-.5)*17;
      return {m,x,y,row,s:.80+rnd(m.id,'scale')*.20};
    });
    const flow=pos.map(({m,x,y,row,s})=>{
      const h=new Date(m.timestamp).getHours(),stage=growthStage(m,moments),sp=FLOWER_CLOCK[h];
      return '<button type="button" class="lj-flower lj-stage-'+stage+'" data-edit="'+escapeHtml(m.id)+'" style="left:'+x+'px;top:'+y+'px;--flower-size:'+s+';--flower-rotate:'+((rnd(m.id,'twist')-.5)*13)+'deg;z-index:'+(10+row)+'" title="'+escapeHtml(sp[0]+' · '+new Date(m.timestamp).toLocaleDateString())+'" aria-label="'+escapeHtml('Open '+sp[0]+' memory, '+new Date(m.timestamp).toLocaleString())+'">'+flower(m)+'</button>';
    }).join('');
    // Milestones are labels, never decorative flowers or journal records.
    let milestones='',previous='';
    pos.forEach(({m,y},i)=>{
      const d=new Date(m.timestamp),month=d.toLocaleDateString(undefined,{month:'long',year:'numeric'});
      if(month!==previous){milestones+='<div class="lj-timeline-date" style="top:'+Math.max(80,y-79)+'px">'+escapeHtml(month)+'</div>';previous=month;}
    });
    return '<div class="lj-timeline-shell"><div class="lj-timeline-toolbar"><span>Explore your forever garden</span><div><button type="button" data-timeline-zoom="out" aria-label="Zoom out">−</button><button type="button" data-timeline-zoom="in" aria-label="Zoom in">+</button><button type="button" data-timeline-latest>Newest</button></div></div>'+
      '<div class="lj-timeline-viewport" id="lj-timeline-viewport" aria-label="Scrollable garden map. Move horizontally and vertically to explore your flowers." tabindex="0">'+
      '<div class="lj-timeline-spacer" style="width:'+(width*timelineZoom)+'px;height:'+(height*timelineZoom)+'px">'+
      '<div class="lj-timeline-world" style="width:'+width+'px;height:'+height+'px;transform:scale('+timelineZoom+')">'+
      '<div class="lj-landscape-wrap">'+gardenBackdrop(height)+'</div>'+milestones+flow+
      (!planted.length?'<div class="lj-timeline-empty">Your first little joy will plant your first flower here.</div>':'')+
      '</div></div></div><p class="lj-timeline-help">Drag or swipe to explore your garden. Zoom in to find your flowers, then tap one to revisit its memory.</p></div>';
  }
  function focusTimeline(latest=true){
    const el=content.querySelector('#lj-timeline-viewport');
    if(!el)return;
    if(latest){el.scrollTop=el.scrollHeight;el.scrollLeft=Math.max(0,(el.scrollWidth-el.clientWidth)/2);}
  }
  function zoomTimeline(direction){
    const view=content.querySelector('#lj-timeline-viewport'),spacer=view?.querySelector('.lj-timeline-spacer'),world=view?.querySelector('.lj-timeline-world');
    if(!view||!spacer||!world)return;
    const before=timelineZoom;
    timelineZoom=Math.max(.7,Math.min(1.65,Math.round((timelineZoom+(direction==='in'?.15:-.15))*100)/100));
    const centerX=(view.scrollLeft+view.clientWidth/2)/before,centerY=(view.scrollTop+view.clientHeight/2)/before;
    spacer.style.width=(790*timelineZoom)+'px';
    spacer.style.height=(Number(world.style.height.replace('px',''))*timelineZoom)+'px';
    world.style.transform='scale('+timelineZoom+')';
    view.scrollLeft=Math.max(0,centerX*timelineZoom-view.clientWidth/2);
    view.scrollTop=Math.max(0,centerY*timelineZoom-view.clientHeight/2);
  }
  function home(){
    const planted=moments.filter(m=>m.type==='joy').length,laughs=moments.filter(m=>m.type==='laugh').length;
    return '<section class="lj-garden"><div class="lj-garden-head"><div><span class="eyebrow">YOUR FOREVER GARDEN</span><h2>A pocketful of sunshine.</h2><p>Every flower you have ever planted lives here.</p></div><div class="lj-count"><strong>'+planted+'</strong> '+(planted===1?'flower':'flowers')+'<small>'+laughs+' little laughs</small></div></div>'+
      timelineScene()+
      '<div class="lj-garden-actions"><button type="button" class="lj-garden-camera" data-garden-photo="daily">'+icon('camera',18)+' Bumble, snap today’s garden!</button><button type="button" class="lj-garden-camera secondary" data-garden-photo="weekly">Weekly keepsake</button></div>'+
      '<p class="lj-tip">Your garden never resets. Happy moments plant flowers; laughs help them grow. Weekly photos are keepsakes of this same garden.</p></section>'+
      '<button type="button" class="lj-bumble-chat-link" data-goto="together">'+bee()+'<span><strong>Want to talk to Bumble?</strong><small>Ask about flowers, jokes, weather and garden status.</small></span><span aria-hidden="true">›</span></button>';
  }
  function flowerBook(){
    const counts=Array(24).fill(0);
    for(const m of moments){if(m.type==='joy'){const hour=new Date(m.timestamp).getHours();if(hour>=0&&hour<24)counts[hour]++;}}
    const discovered=counts.filter(Boolean).length;
    return '<section class="lj-flowerbook"><span class="eyebrow">THE LITTLE JOYS FLOWER CLOCK</span><h2>24 hours. 24 meaningful blooms.</h2><p>One real flower for every hour, each with its own traditional symbolic meaning.</p><span class="lj-book-count">'+discovered+' of 24 discovered</span><div class="lj-book-grid">'+FLOWER_CLOCK.map(([name,meaning],hour)=>{const label=String(hour%12||12)+(hour<12?' AM':' PM');const example={timestamp:new Date(2026,0,1,hour).toISOString()};return '<div class="lj-book-flower '+(counts[hour]?'discovered':'')+'"><div class="lj-book-illustration">'+flower(example)+'</div><span class="lj-book-hour">'+label+'</span><strong>'+escapeHtml(name)+'</strong><small>'+escapeHtml(meaning)+'</small><span class="lj-book-grown">'+(counts[hour]?counts[hour]+' grown':'Yet to grow')+'</span></div>';}).join('')+'</div><p class="lj-book-note">Flower meanings vary by tradition and culture. Hour assignments are a Little Joys story, not actual blooming schedules.</p></section>';
  }
  function weeks(){const map=new Map(),now=weekOf(new Date());map.set(weekKey(now),now);for(const m of moments){const d=new Date(m.timestamp);if(!Number.isFinite(d.getTime()))continue;const wk=weekOf(d);map.set(weekKey(wk),wk);}const dates=[...map.values()].sort((a,b)=>b-a);return '<section class="lj-weeks"><span class="eyebrow">YOUR GARDEN ALBUM</span><h2>Your weeks in bloom.</h2><p>A different little garden for every week. Each flower is a memory you saved.</p>'+dates.map(start=>{const records=items(start),joys=records.filter(x=>x.type==='joy').length,laughs=records.filter(x=>x.type==='laugh').length;return '<article class="lj-week-card"><span class="eyebrow">YOUR WEEK IN BLOOM</span><h3>'+escapeHtml(label(start))+'</h3>'+scene(records,start)+'<p><b>'+joys+'</b> '+(joys===1?'flower':'flowers')+' · <b>'+laughs+'</b> '+(laughs===1?'laugh':'laughs')+'</p><button type="button" class="lj-save" data-garden-week="'+weekKey(start)+'">Save this week’s garden picture ↗</button></article>';}).join('')+'</section><details class="lj-collection-details"><summary>Explore the Flower Clock — 24 meaningful flowers</summary>'+flowerBook()+'</details>';}
  function settings(){return '<section class="lj-bee-settings"><h2>Meet Bumble</h2><p>Choose how often Bumble shares a gentle message. No pressure, no streaks.</p><div class="lj-tone-options">'+[['chatty','Chatty'],['gentle','Gentle'],['quiet','Quiet']].map(([value,name])=>'<button class="lj-tone '+(tone===value?'chosen':'')+'" data-garden-tone="'+value+'" type="button" aria-pressed="'+(tone===value)+'">'+name+'</button>').join('')+'</div></section>';}
  function recapSvg(start,entries){const pos=positions(entries),n=pos.length,laughs=entries.filter(m=>m.type==='laugh').length;let floral='';for(const {m,x,y,s} of pos){const xx=40+x*8.8,yy=230+Math.max(25,y)*3.2,scale=.6*s;const stage=growthStage(m,entries),factor=[.07,.42,.72,1][stage],budOpacity=[1,.7,.25,0][stage];
      const art=flower(m).replace(/^<svg[^>]*>/,'').replace(/<\/svg>$/,'').replace('<g class="lj-bloom-head">','<g transform="translate(50 54) scale('+factor+') translate(-50 -54)" opacity="'+(stage===0?.07:1)+'">').replace('<g class="lj-bud-mark">','<g opacity="'+budOpacity+'">');
      floral+='<g transform="translate('+xx.toFixed(0)+' '+yy.toFixed(0)+') scale('+scale.toFixed(2)+') translate(-50 -60)">'+art+'</g>';}const title=escapeHtml(label(start));return '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="640" viewBox="0 0 960 640"><rect width="960" height="640" fill="#fff4cc"/><rect x="24" y="24" width="912" height="592" rx="32" fill="#fffaf0" stroke="#dfc794" stroke-width="3"/><text x="480" y="98" font-family="Georgia,serif" font-size="42" text-anchor="middle" fill="#76572f">Your week in bloom</text><text x="480" y="139" font-family="Georgia,serif" font-size="23" text-anchor="middle" fill="#9b7b50">'+title+'</text><circle cx="777" cy="227" r="65" fill="#ffe49a"/><path d="M24 470Q200 370 405 464T936 460V610H24Z" fill="#d2dcb7"/><path d="M24 523Q280 420 510 508T936 497V610H24Z" fill="#b9d09a"/>'+floral+(laughs?'<text x="130" y="240" fill="#d7ae58" font-size="35">✧ ✦ ✧</text>':'')+'<text x="480" y="580" font-family="Georgia,serif" font-size="22" text-anchor="middle" fill="#82643e">'+n+' flowers · '+laughs+' laughs · Little Joys (: </text></svg>';}
  async function save(key){const start=new Date(key+'T00:00:00');if(!Number.isFinite(start.getTime()))return;let url;try{const blob=new Blob([recapSvg(start,items(start))],{type:'image/svg+xml'});url=URL.createObjectURL(blob);const image=new Image();await new Promise((ok,no)=>{image.onload=ok;image.onerror=no;image.src=url;});const canvas=document.createElement('canvas');canvas.width=960;canvas.height=640;canvas.getContext('2d').drawImage(image,0,0);const png=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!png)throw new Error('Export failed');const downloadUrl=URL.createObjectURL(png),a=document.createElement('a');a.href=downloadUrl;a.download='little-joys-garden-'+key+'.png';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(downloadUrl),4000);showToast('Your little garden postcard is saved.');}catch(e){showToast('Could not export this picture on this device.');}finally{if(url)URL.revokeObjectURL(url);}}
  function click(el){if(el.hasAttribute('data-garden')){messageOffset++;render();return true;}if(el.dataset.gardenTone){tone=el.dataset.gardenTone;localStorage.setItem(BEE_KEY,tone);render();return true;}if(el.dataset.gardenWeek){save(el.dataset.gardenWeek);return true;}return false;}
  function status(scope='week'){
    const entries=scope==='all'?moments:items(weekOf(new Date()));
    const planted=entries.filter(m=>m.type==='joy');
    const laughed=entries.filter(m=>m.type==='laugh');
    const stages=[0,0,0,0];
    const varieties=new Map();
    for(const m of planted){
      const h=new Date(m.timestamp).getHours();
      if(!Number.isInteger(h)||h<0||h>23)continue;
      const name=FLOWER_CLOCK[h][0];
      varieties.set(name,(varieties.get(name)||0)+1);
      stages[growthStage(m,entries)]++;
    }
    const hours={joy:Array(24).fill(0),laugh:Array(24).fill(0)};
    for(const m of entries){
      const h=new Date(m.timestamp).getHours();
      if((m.type==='joy'||m.type==='laugh')&&Number.isInteger(h)&&h>=0&&h<24)hours[m.type][h]++;
    }
    return {scope,flowers:planted.length,laughs:laughed.length,stages,varieties:[...varieties.entries()].sort((a,b)=>b[1]-a[1]),hours};
  }
  return {home,weeks,settings,click,celebrateLaugh,bee,status,focusTimeline,zoomTimeline};
})();
  // Bumble is a lightweight, on-screen companion. It never changes saved journal data.
  const companion=(function(){
    const KEY='little-joys.bumble.follow.v1';
    let enabled=localStorage.getItem(KEY)!=='off';
    let node=null, bubble=null, can=null, busy=false, hop=0, bubbleTimer=null,waterTimer=null;
    const sayings=['Buzz! I’m right here.','Want to explore together?','A little sunshine follows you.','I love your little moments.','Where should we fly next?','Your garden is looking lovely.'];
    const calm=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true;
    const bounds=()=>({w:window.innerWidth||375,h:window.innerHeight||700});
    let flyingAnimation=null;
    function move(left,top,fast=false){
      if(!node)return;
      const {w,h}=bounds(),size=62;
      const x=Math.max(10,Math.min(w-size-10,left));
      const y=Math.max(82,Math.min(h-size-107,top));
      if(flyingAnimation){
        const old=node.getBoundingClientRect();
        flyingAnimation.cancel();flyingAnimation=null;
        node.style.left=old.left+'px';node.style.top=old.top+'px';
      }
      if(fast||calm()||typeof node.animate!=='function'){
        node.style.left=x+'px';node.style.top=y+'px';return;
      }
      const from=node.getBoundingClientRect();
      const dx=x-from.left,dy=y-from.top;
      const d=Math.hypot(dx,dy);
      if(d<12){node.style.left=x+'px';node.style.top=y+'px';return;}
      // Bumble rises, arcs through a gentle curved path, and settles at his destination.
      // Animate the composited transform rather than interpolating left/top.
      const lift=Math.min(78,Math.max(25,d*.20));
      const sway=dx>0?-Math.min(26,d*.12):Math.min(26,d*.12);
      const duration=Math.min(1850,Math.max(700,d*3.0));
      const keyframes=[
        {transform:'translate(0px,0px) rotate(0deg)',offset:0},
        {transform:'translate('+(dx*.22+sway)+'px,'+(dy*.18-lift)+'px) rotate('+(dx>0?'-10deg':'9deg')+')',offset:.27},
        {transform:'translate('+(dx*.76-sway*.4)+'px,'+(dy*.72-lift*.45)+'px) rotate('+(dx>0?'7deg':'-6deg')+')',offset:.76},
        {transform:'translate('+dx+'px,'+dy+'px) rotate(0deg)',offset:1}
      ];
      flyingAnimation=node.animate(keyframes,{duration,easing:'ease-in-out',fill:'forwards'});
      const flight=flyingAnimation;
      flight.onfinish=()=>{
        if(flyingAnimation!==flight)return;
        node.style.left=x+'px';node.style.top=y+'px';
        flight.cancel();flyingAnimation=null;
      };
    }
    function say(message){
      if(!node||!enabled)return;
      bubble.textContent=message;node.classList.add('lj-companion-talking');
      clearTimeout(bubbleTimer);bubbleTimer=setTimeout(()=>node?.classList.remove('lj-companion-talking'),2900);
    }
    function ensure(){
      if(!node){
        node=document.createElement('div');node.id='little-joys-bumble';node.className='lj-companion';
        node.innerHTML='<button type="button" class="lj-companion-tap" aria-label="Tap Bumble to fly around with you" title="Tap Bumble to fly around">'+garden.bee()+'</button><span class="lj-companion-can" aria-hidden="true"><svg viewBox="0 0 55 55"><g transform="translate(55 0) scale(-1 1)"><path d="M12 18h30l-5 28H18Z" fill="#ffce70" stroke="#8d693f" stroke-width="3" stroke-linejoin="round"/><path d="M17 18Q15 6 26 6Q38 6 37 18" fill="none" stroke="#8d693f" stroke-width="3"/><path d="M11 21Q-1 20 4 30Q8 36 15 31" fill="none" stroke="#8d693f" stroke-width="3"/><path d="M40 18L51 11L50 19L41 27" fill="#e7b55a" stroke="#8d693f" stroke-width="2.5"/><path d="M22 31h13" stroke="#fff6d8" stroke-width="3" stroke-linecap="round"/></g></svg></span><span class="lj-companion-bubble" aria-live="polite" role="status"></span><span class="lj-companion-splash" aria-hidden="true">💧 💧 ✧</span>';
        document.body.append(node);
        bubble=node.querySelector('.lj-companion-bubble');can=node.querySelector('.lj-companion-can');
        node.querySelector('button').addEventListener('click',()=>{if(busy)return;roam(true);});
        const {w,h}=bounds();move(w-82,h*.55,true);
        window.addEventListener('resize',()=>{if(node&&!busy){const r=node.getBoundingClientRect();move(r.left,r.top,true);}});
      }
      node.hidden=!enabled;
    }
    function roam(withMessage=false){
      ensure();if(!enabled||busy)return;
      hop++;
      const {w,h}=bounds();
      // Small hops alternate with longer loops: no mechanically repeating corners.
      const angle=hop*2.399963229728653;
      const radius=62+(hop%3)*42;
      const from=node.getBoundingClientRect();
      const x=from.left+Math.cos(angle)*radius;
      const y=from.top+Math.sin(angle)*radius*.8;
      node.classList.add('lj-companion-flying');
      move(Math.max(15,Math.min(w-90,x)),Math.max(94,Math.min(h-175,y)));
      if(withMessage)say(sayings[hop%sayings.length]);
      setTimeout(()=>node?.classList.remove('lj-companion-flying'),1650);
    }
    function followTab(){
      if(!enabled||busy)return;
      // Bumble wanders to a new spot when you change screens.
      roam(false);
    }
    function water(onGrow){
      ensure();
      if(!enabled){onGrow?.();return;}
      if(busy){onGrow?.();return;}
      const gardenScene=document.querySelector('.lj-garden-scene');
      const flowers=[...(gardenScene?.querySelectorAll('.lj-flower')||[])];
      const visible=flowers.filter(f=>{const r=f.getBoundingClientRect();return r.bottom>145&&r.top<bounds().h-155;});
      const target=(visible.find(f=>!f.classList.contains('lj-stage-3'))||visible[0]||flowers[0]);
      if(!target){onGrow?.();say('First plant a flower, then I can water it!');return;}
      busy=true;
      const rect=target.getBoundingClientRect();
      const {w,h}=bounds();
      // Align Bumble's left-facing watering-can spout above a visible flower.
      const x=Math.max(14,Math.min(w-82,rect.left+rect.width/2+30));
      const y=Math.max(104,Math.min(h-180,rect.top-42));
      node.classList.add('lj-companion-flying','lj-companion-watering');
      say('A little water for your joy!');
      move(x,y);
      clearTimeout(waterTimer);
      const from=node.getBoundingClientRect(),travel=Math.hypot(x-from.left,y-from.top);
      const flightMs=calm()?50:Math.min(1850,Math.max(700,travel*3.0));
      waterTimer=setTimeout(()=>{
        if(!enabled){busy=false;onGrow?.();return;}
        node?.classList.remove('lj-companion-flying');
        node?.classList.add('lj-companion-pouring');
        onGrow?.();
        const burst=document.createElement('span');
        burst.className='lj-flower-water-burst';
        burst.textContent='💧 💧';
        target.appendChild(burst);
        waterTimer=setTimeout(()=>{
          burst.remove();
          node?.classList.remove('lj-companion-pouring','lj-companion-watering');
          busy=false;
          // Return to an unobtrusive edge, rather than sitting across the garden note.
          move(w-79,Math.max(110,Math.min(h-190,155)));
        },1150);
      },flightMs+100);
    }
    function toggle(){
      enabled=!enabled;
      localStorage.setItem(KEY,enabled?'on':'off');
      if(!enabled){busy=false;clearTimeout(waterTimer);}
      ensure();
      if(enabled)say('Buzz! I’m back!');
    }
    function settings(){
      return '<section class="lj-companion-settings"><h2>Your little travel buddy</h2><p>Bumble can fly with you around Garden, Memories, Blooms and My Space. Tap Bumble to see where he flies next.</p><button type="button" class="lj-companion-toggle" data-bumble-toggle aria-pressed="'+enabled+'">'+(enabled?'Bumble follows me: On':'Bumble follows me: Off')+'</button></section>';
    }
    return {ensure,water,followTab,toggle,settings};
  })();
  function renderToday() {
    const today=todayMoments(),counts=countTypes(today);
    return `<div class="lj-home-intro"><span class="eyebrow">YOUR POCKETFUL OF SUNSHINE</span><h1 class="welcome-title">Your little garden.</h1><p>A happy moment plants a flower. A laugh helps it bloom.</p></div>
      <div class="lj-quick-actions">
        <button type="button" class="moment-trigger joy" data-add="joy">${icon('heart',24)}<strong>I felt happy</strong><small>Plant a flower</small></button>
        <button type="button" class="moment-trigger laugh" data-add="laugh">${icon('laugh',24)}<strong>I laughed</strong><small>Water your garden</small></button>
      </div>
      ${garden.home()}
      <button type="button" class="capture-button lj-photo-action" data-capture="joy">${icon('camera',20)}<span><strong>Add a photo memory</strong><small>Optional photo, note and one new flower</small></span>${icon('arrow',16)}</button>
      <div class="lj-mini-stats"><span><strong data-count="joy">${counts.joy}</strong> happy moments today</span><span><strong data-count="laugh">${counts.laugh}</strong> laughs today</span></div>
      <div class="lj-today-bottom">
        <div class="section-heading"><h2>Today's little memories</h2><button type="button" class="text-link" data-goto="journal">See all →</button></div>
        ${today.length?`<div class="moment-list">${today.slice(0,2).map(momentCard).join('')}</div>`:emptyState('A fresh little page','A lovely moment can bloom whenever it happens.','sun')}
      </div>
      <details class="lj-sunshine-details"><summary>More sunshine from Bumble</summary>${hourlySunshineCard()}</details>
    `;
  }
  function filteredMoments() {
    return moments.filter(m => (journalFilter==='all'||m.type===journalFilter) && (!journalQuery || `${m.note} ${momentName(m)}`.toLowerCase().includes(journalQuery.toLowerCase())));
  }
  function journalListHtml() {
    const filtered=filteredMoments();
    if (!filtered.length) return emptyState(journalQuery?'No matching moments yet':'Nothing in this part of your journal','Try another search, or save a little moment from Today.','book');
    const groups=new Map();
    for(const m of filtered){ const k=momentDay(m);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(m); }
    return [...groups.entries()].map(([k,group])=> `<h3 class="date-group-label">${escapeHtml(dateGroupText(new Date(`${k}T12:00:00`)))}</h3><div class="moment-list">${group.map(momentCard).join('')}</div>`).join('');
  }
  function renderJournal() {
    return `<span class="eyebrow">YOUR POCKET-SIZED TIME CAPSULE</span><h1 class="page-title">The moments you kept.</h1><p class="page-description">Some days are full. Some are quiet. Every saved moment belongs here.</p>
      <div class="pill-filters" aria-label="Filter your moments"><button class="filter-btn ${journalFilter==='all'?'selected':''}" data-filter="all" aria-pressed="${journalFilter==='all'}">All (${moments.length})</button><button class="filter-btn ${journalFilter==='laugh'?'selected':''}" data-filter="laugh" aria-pressed="${journalFilter==='laugh'}">Little laughs</button><button class="filter-btn ${journalFilter==='joy'?'selected':''}" data-filter="joy" aria-pressed="${journalFilter==='joy'}">Happy moments</button></div>
      <p class="lj-memories-hint">Your memories stay private until you tap the share icon on a moment.</p>
      <label class="search-field">${icon('search',16)}<span class="sr-only">Search memories</span><input id="journal-search" placeholder="Search your little memories" value="${escapeHtml(journalQuery)}" maxlength="100"></label>
      <div id="journal-list">${journalListHtml()}</div>`;
  }
  function getWeek() {
    const now=new Date();now.setHours(12,0,0,0);
    return Array.from({length:7},(_,i)=> {const d=new Date(now);d.setDate(now.getDate() - (6-i));const entries=moments.filter(m=>momentDay(m)===dateKey(d));return {date:d,items:entries,...countTypes(entries)};});
  }
  function renderPatterns() {
    const week=getWeek();const laughs=week.reduce((n,d)=>n+d.laugh,0);const joys=week.reduce((n,d)=>n+d.joy,0);const days=week.filter(d=>d.items.length).length;const max=Math.max(...week.map(d=>Math.max(d.laugh,d.joy)),1);
    return `${garden.weeks()}<details class="lj-reflections-details"><summary>Gentle reflections from the last 7 days</summary><span class="eyebrow">A GENTLER KIND OF REFLECTION</span><h1 class="page-title">Look at the little things.</h1><p class="page-description">Your past seven days, without goals to hit or streaks to keep.</p>
      <section class="week-card"><div class="subtle-row"><strong style="font-size:13px">A week of moments</strong><span class="eyebrow" style="font-size:9px">LAST 7 DAYS</span></div><p class="week-intro">Only moments you chose to log are shown.</p>
        <div class="week-bars" role="img" aria-label="Over the last seven days, you logged ${laughs} laughs and ${joys} happy moments.">${week.map((d,i)=>`<div class="day-column"><div class="day-total">${d.items.length||''}</div><div class="bar-pair"><div class="bar laugh ${d.laugh?'':'zero'}" style="height:${d.laugh?Math.max(7,d.laugh/max*100):3}%" title="${d.laugh} laughs"></div><div class="bar joy ${d.joy?'':'zero'}" style="height:${d.joy?Math.max(7,d.joy/max*100):3}%" title="${d.joy} happy moments"></div></div><span class="day-name ${i===6?'today':''}">${escapeHtml(d.date.toLocaleDateString(undefined,{weekday:'short'}).slice(0,2))}</span></div>`).join('')}</div>
        <div class="chart-legend"><span><i class="legend-mark laugh"></i>Laughs</span><span><i class="legend-mark joy"></i>Happy moments</span></div>
      </section>
      <div class="insight-grid"><div class="insight-card"><strong>${laughs+joys}</strong><span>little moments saved<br>this week</span></div><div class="insight-card"><strong>${days}<span style="font-family:inherit;font-size:16px"> / 7</span></strong><span>days with at least<br>one saved moment</span></div></div>
      <div class="reflection-card"><strong>A note to yourself</strong><p>${days===0?'This week is still yours, even without a single entry. There is nothing to catch up on.':'A day with fewer saved moments is not a less happy day. This is a record of what you noticed, not a measure of how much joy you deserve.'}</p></div></details>`;
  }
  // Bumble's private on-device chat: curated flowers and jokes, optional live weather.
  // This is a lightweight rule-based companion, not a generative AI service.
  const bumbleChat=(function(){
    const KEY='little-joys.bumble.chat.v1';
    const flowerFacts=[
      ['Snowdrop','hope and new beginnings','Snowdrops are among the earliest spring flowers and often push through cold ground.'],
      ['Violet','faithfulness and modesty','Violets have heart-shaped leaves and small flowers, often purple.'],
      ['Forget-me-not','remembrance and lasting connection','Their tiny blue flowers have bright yellow centers.'],
      ['Bluebell','kindness and humility','Bluebells form nodding bells on slender stems; many bloom in woodland.'],
      ['Lily of the valley','the return of happiness','These fragrant flowers hang like little white bells; they are poisonous if eaten.'],
      ['Crocus','cheerfulness and renewal','Crocuses are low-growing flowers that often signal spring.'],
      ['Daffodil','new beginnings','Daffodils have a distinctive central trumpet; their bulbs are toxic if eaten.'],
      ['Daisy','innocence and simplicity','Many daisies have white ray florets surrounding a yellow disk.'],
      ['Freesia','friendship and trust','Freesia grows fragrant, funnel-shaped flowers along arching stems.'],
      ['Tulip','love and affection','Tulips are spring bulbs with a recognizable cup-shaped blossom.'],
      ['Garden pink','love and admiration','Dianthus flowers often have fringed petals and a spicy scent.'],
      ['Pansy','thoughtfulness','Pansies have broad overlapping petals, often with a dark face-like blotch.'],
      ['Sunflower','adoration and loyalty','Young sunflowers often track the sun; their central head contains many tiny florets.'],
      ['Goldenrod','encouragement and good fortune','Goldenrod grows golden sprays of small composite flower heads.'],
      ['Coreopsis','cheerfulness','Coreopsis has sunny daisy-like blooms, often bright yellow.'],
      ['Peony','good fortune and affection','Peonies are beloved for their lush, layered petals.'],
      ['Orchid','beauty and elegance','Orchids are a vast family of flowers, often with a specialized central lip.'],
      ['Gladiolus','strength and integrity','Gladiolus grows tall spikes with blossoms opening along the stem.'],
      ['Pink rose','gratitude and admiration','Pink roses often represent appreciation, though meanings vary with tradition.'],
      ['Lavender','calm and devotion','Lavender grows aromatic spikes of purple blossoms; the scent is widely used in gardens.'],
      ['Iris','hope and wisdom','Irises commonly have three upright petals and three downward-curving falls.'],
      ['Sweet pea','delicate pleasures and gratitude','Sweet peas are climbing flowers with fluttering, butterfly-like blooms.'],
      ['Hyacinth','steadfastness','Hyacinths grow dense spikes of fragrant starry flowers.'],
      ['Aster','patience and affection','Asters have many slender ray petals surrounding a central disk.']
    ];
    const jokes=[
      'Why did the bee have sticky hair? It used a honeycomb!',
      'What do you call a flower that runs on electricity? A power plant!',
      'Why did the gardener quit? His celery was too low!',
      'What did the flower say after telling a joke? I was only pollen your leg!',
      'How do flowers ride bicycles? They pedal!',
      'Why did the sunflower get promoted? It was outstanding in its field!',
      'What did one flower say to another? What’s up, buttercup?',
      'Why do bees have such neat hair? Honeycombs!'
    ];
    let messages;
    try{const raw=JSON.parse(localStorage.getItem(KEY)||'[]');messages=Array.isArray(raw)?raw.filter(x=>x&&['you','bumble'].includes(x.who)&&typeof x.text==='string').slice(-30).map(x=>({who:x.who,text:x.text.slice(0,700)})):[];}catch{messages=[];}
    if(!messages.length)messages=[{who:'bumble',text:'Buzz buzz! I’m Bumble, your little flower, joke, and weather buddy. Ask me about a flower, tell me to make you laugh, or ask for the weather!'}];
    let jokeIndex=0,weatherBusy=false;
    function save(){try{localStorage.setItem(KEY,JSON.stringify(messages.slice(-30)));}catch{}}
    function add(who,text){messages.push({who,text:String(text).slice(0,700)});messages=messages.slice(-30);save();}
    function history(){return messages.map(m=>'<div class="lj-chat-message '+(m.who==='you'?'mine':'theirs')+'"><span class="lj-chat-speaker">'+(m.who==='you'?'You':'Bumble 🐝')+'</span><p>'+escapeHtml(m.text)+'</p></div>').join('');}
    function render(){
      return '<section class="lj-chat"><span class="eyebrow">YOUR BUZZY LITTLE FRIEND</span><h1 class="page-title">Chat with Bumble.</h1><p class="page-description">He loves flowers, silly jokes, weather, and checking how your garden is growing. This version has helpful built-in replies, not open-ended AI conversations.</p><div class="lj-chat-profile"><div class="lj-chat-profile-bee">'+garden.bee()+'</div><div><strong>Bumble the garden buddy</strong><small>Flower expert · Jokes · Weather · Garden status</small></div></div><div class="lj-chat-messages" id="lj-chat-messages" aria-live="polite">'+history()+'</div><div class="lj-chat-prompts"><button type="button" data-bumble-prompt="Tell me a joke">Tell me a joke</button><button type="button" data-bumble-prompt="Tell me about a flower">Flower facts</button><button type="button" data-bumble-prompt="What’s the weather?">Weather</button><button type="button" data-bumble-prompt="How is my garden doing?">Garden status</button><button type="button" data-bumble-prompt="What hour am I happiest?">Happy hours</button><button type="button" data-bumble-prompt="When did I laugh the most?">Laugh hours</button></div><form class="lj-chat-form" id="lj-chat-form"><label class="sr-only" for="lj-chat-input">Message Bumble</label><input id="lj-chat-input" maxlength="300" autocomplete="off" placeholder="Ask Bumble something..." required><button class="lj-chat-send" type="submit" aria-label="Send message">'+icon('arrow',20)+'</button></form><p class="lj-chat-note">Weather uses your approximate device location only after you allow it. Your chat stays in this browser.</p></section>';
    }
    function refresh(){
      const area=document.querySelector('#lj-chat-messages');
      if(area){area.innerHTML=history();area.scrollTop=area.scrollHeight;}
    }
    async function weather(){
      if(weatherBusy)return;
      weatherBusy=true;
      if(!navigator.geolocation){add('bumble','I need location permission to check the local weather, and this browser doesn’t offer it. You can check your weather app instead.');refresh();weatherBusy=false;return;}
      add('bumble','Let me peek outside! I’ll ask permission to use your approximate location.');
      refresh();
      try{
        const position=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:false,timeout:12000,maximumAge:900000}));
        const lat=position.coords.latitude,lon=position.coords.longitude;
        const url='https://api.open-meteo.com/v1/forecast?latitude='+encodeURIComponent(lat.toFixed(3))+'&longitude='+encodeURIComponent(lon.toFixed(3))+'&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto';
        const response=await fetch(url,{cache:'no-store'});
        if(!response.ok)throw Error('weather');
        const data=await response.json();
        if(!data.current||typeof data.current.temperature_2m!=='number')throw Error('weather');
        const c=data.current,code=c.weather_code;
        const description=code===0?'clear skies':code<=3?'a few clouds':code<=48?'foggy skies':code<=67?'rain or drizzle':code<=77?'snow':code<=82?'showers':code<=86?'snow showers':'stormy conditions';
        add('bumble','Buzz! Right now it’s about '+Math.round(c.temperature_2m)+'°F (feels like '+Math.round(c.apparent_temperature)+'°F) with '+description+'. Wind: '+Math.round(c.wind_speed_10m)+' mph. If you’re visiting the garden outside, check for rain and dress comfortably! This is current weather, not a full forecast.');
      }catch(err){
        add('bumble',err&&err.code===1?'No worries! You didn’t allow location access, so I won’t check your weather.':'Oh honey! I couldn’t reach the live weather right now. Try again when you have a connection.');
      }finally{weatherBusy=false;refresh();}
    }
    function hourText(hour){
      return String(hour%12||12)+(hour<12?' AM':' PM');
    }
    function busiestHours(counts,type){
      const peak=Math.max(...counts);
      if(!peak)return 'No '+type+' moments have been recorded during this period yet.';
      const winners=counts.map((count,h)=>({count,h})).filter(x=>x.count===peak);
      const shown=winners.slice(0,4).map(x=>hourText(x.h)).join(', ');
      return 'The most '+type+' moments you recorded were at '+shown+(winners.length>4?' and '+(winners.length-4)+' other hours':'')+' ('+peak+' '+(peak===1?'moment':'moments')+' at each of those hours).';
    }
    function gardenReport(input){
      const all=/all.time|ever|overall|total|entire|since i started|whole history|lifetime/.test(input);
      const stats=garden.status(all?'all':'week');
      const scope=all?'across all your saved moments':'in this week’s garden';
      const hourScope=all?'across all your saved moments':'this week';
      if(/hour|time of day|when do i|when am i|when have i|most happy|happiest|laugh.*most|most.*laugh/.test(input)){
        if(/laugh|giggl|funny/.test(input)&&!/happy|joy/.test(input))
          return 'Buzz! Looking at the times of your saved laughs '+hourScope+': '+busiestHours(stats.hours.laugh,'laugh')+' Those are logging times, not a measure of your actual happiness.';
        if(/happy|joy|happiest/.test(input)&&!/laugh/.test(input))
          return 'Buzz! Looking at the times of your saved happy moments '+hourScope+': '+busiestHours(stats.hours.joy,'happy')+' Those are the moments you logged, not necessarily when you felt happiest.';
        return 'Here’s when you logged the most moments '+hourScope+'. Happy: '+busiestHours(stats.hours.joy,'happy')+' Laughs: '+busiestHours(stats.hours.laugh,'laugh');
      }
      if(/what flowers|which flowers|flower types|variet|species|flower list/.test(input)){
        if(!stats.varieties.length)return 'Your garden has no planted flowers '+scope+' yet. Try tapping “I felt happy” to plant a bud!';
        return 'Buzz! These are the flowers '+scope+': '+stats.varieties.map(([name,count])=>name+' ×'+count).join(', ')+'. Each flower represents one saved happy moment.';
      }
      if(/grow|bloom|bud|water|need.*laugh|stage/.test(input)){
        if(!stats.flowers)return 'There are no flowers to water '+scope+' yet. Save a happy moment to plant your first bud!';
        return 'Your flower growth '+scope+': '+stats.stages[0]+' buds, '+stats.stages[1]+' beginning to open, '+stats.stages[2]+' nearly bloomed, and '+stats.stages[3]+' fully blooming. Each laugh after a flower is planted helps it grow by one stage, up to three.';
      }
      const varieties=stats.varieties.length?stats.varieties.slice(0,5).map(([name,count])=>count+' '+name+(count===1?'':'s')).join(', '):'none planted yet';
      return 'Garden check! '+scope.charAt(0).toUpperCase()+scope.slice(1)+': '+stats.flowers+' '+(stats.flowers===1?'flower':'flowers')+' and '+stats.laughs+' '+(stats.laughs===1?'laugh':'laughs')+'. Your flowers include '+varieties+'. '+stats.stages[3]+' fully blooming; '+(stats.stages[0]+stats.stages[1]+stats.stages[2])+' still growing. Want to know which flowers you have or which hours you log the most joy and laughter?';
    }
    async function send(text){
      text=String(text||'').trim().slice(0,300);if(!text)return;
      add('you',text);
      const input=text.toLowerCase();
      if(/weather|temperature|forecast|outside|rain today|sunny today/.test(input)){refresh();await weather();return;}
      if(/garden status|garden doing|how is my garden|my garden|my flowers|flowers do i have|what flowers|which flowers|flower types|flower list|varieties|species|still growing|fully bloom|watered|flower growth|growth stage|grow my flowers|when did i laugh|laugh.*most|most.*laugh|when am i happy|when am i happiest|what hour|which hour|happy hours|laugh hours|happiest hour|time of day|happiness pattern/.test(input)){
        add('bumble',gardenReport(input));refresh();return;
      }
      let answer='';
      if(/joke|funny|laugh|giggle|make me smile/.test(input)){answer=jokes[jokeIndex++%jokes.length];}
      else if(/flower|bloom|plant|petal|garden|rose|daisy|lavender|tulip|sunflower|orchid|iris|peony|daffodil|hyacinth|pansy|violet|crocus|aster/.test(input)){
        const found=flowerFacts.find(([name])=>input.includes(name.toLowerCase()));
        if(found)answer=found[0]+' symbolizes '+found[1]+' in some flower traditions. '+found[2];
        else{
          const h=new Date().getHours(),f=flowerFacts[h];
          answer='My flower for this hour is '+f[0]+'! It often represents '+f[1]+'. '+f[2]+' Ask me about another flower by name!';
        }
      }else if(/hello|hey|hi|buzz|bumble/.test(input))answer='Buzz buzz! I’m here! Want a flower fact, a joke, a weather check, or your garden status?';
      else if(/thank/.test(input))answer='You’re so welcome! Sending you a tiny golden sunshine hug.';
      else if(/sad|tired|stress|hard day|down/.test(input))answer='I’m sorry it’s been a rough day. We don’t need to turn every feeling into a flower. Want a gentle flower fact or a silly joke?';
      else answer='Buzz! I’m still learning. I know my 24 flowers, silly jokes, live weather with permission, and your garden status—including when you’ve logged the most happy moments and laughs. Try asking!';
      add('bumble',answer);refresh();
    }
    function clear(){messages=[{who:'bumble',text:'Fresh little page! Want a flower fact, joke, or weather check?'}];save();refresh();}
    return {render,send,refresh,clear};
  })();
  function renderTogether(){return bumbleChat.render();}
  function renderYou() {
    return `<span class="eyebrow">MADE TO BE YOURS</span><h1 class="page-title">Your space, your pace.</h1><p class="page-description">Your little moments are yours to keep. This version saves everything on this device, without an account.</p>
      ${companion.settings()}
      ${sunshineSettingsHtml()}
      <details class="lj-microphone-details"><summary>Experimental laughter listener</summary>${micCard()}</details>
      <div class="section-heading"><h2>Your journal</h2></div>
      <div class="settings-card">
      <button type="button" class="settings-row" data-tool="export">${icon('download',22)}<span><strong>Save a backup</strong><small>Download your journal as a JSON file.</small></span><span class="row-arrow">›</span></button>
      <button type="button" class="settings-row" data-tool="import">${icon('upload',22)}<span><strong>Restore a backup</strong><small>Import a journal backup from this app.</small></span><span class="row-arrow">›</span></button>
      <button type="button" class="settings-row" data-tool="sample">${icon('sparkle',22)}<span><strong>Try three demo moments</strong><small>Add clearly marked examples to explore the app.</small></span><span class="row-arrow">›</span></button>
      <button type="button" class="settings-row danger" data-tool="clear">${icon('trash',22)}<span><strong>Erase all moments</strong><small>Clear your saved journal from this device.</small></span><span class="row-arrow">›</span></button></div>
      <div class="privacy-box">${icon('shield',21)}<strong> Your privacy matters.</strong><p>The optional microphone experiment processes sound levels locally only when you start it; it never records or uploads audio. No location tracking, no ads, and no account in this prototype. Your notes and photos are stored in this browser only. Your exported backup includes both. Clearing browser data or changing devices may erase them unless you've made a backup.</p></div>
      <p class="app-version">Little Joys · sunshine garden v1.2 · not a happiness score</p>`;
  }
  function render() {
    const html={today:renderToday,journal:renderJournal,patterns:renderPatterns,together:renderTogether,you:renderYou};
    content.innerHTML=(html[currentTab]||renderToday)();
    hydratePhotos(content);
    companion.ensure();
    if(currentTab==='today')garden.focusTimeline();
    document.querySelectorAll('[data-tab]').forEach(button=>{
      const active=button.dataset.tab===currentTab;button.classList.toggle('active',active);
      if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
    });
  }
  function navigate(tab) {
    if (!['today','journal','patterns','together','you'].includes(tab))return;
    if(tab!==currentTab && (mic.status==='on'||mic.status==='starting'))stopMic(true);
    currentTab=tab;render();content.scrollTop=0;
    companion.followTab();
  }
  const photoPreview=document.querySelector('#photo-preview');
  function showPhotoPreview(data) {
    photoPreview.replaceChildren();
    if(!data){photoPreview.hidden=true;return;}
    photoPreview.hidden=false;
    const img=document.createElement('img');img.alt='Photo selected for this happy moment';img.src=data;
    const desc=document.createElement('span');desc.textContent='A little moment worth keeping.';
    const remove=document.createElement('button');remove.type='button';remove.className='photo-remove';remove.textContent='Remove';
    remove.addEventListener('click',()=>{draftPhoto=null;removeExistingPhoto=true;showPhotoPreview(null);});
    photoPreview.append(img,desc,remove);
  }
  function showEditor(type, m) {
    photoDialogSession++;
    editingId=m?.id || null; creatingType=m?null:type;
    draftPhoto=null;removeExistingPhoto=false;
    noteField.value=m?.note || '';noteCounter.textContent=`${noteField.value.length} / 300`;
    document.getElementById('dialog-kind').textContent=type==='laugh'?'A LITTLE LAUGH':'A HAPPY MOMENT';
    document.getElementById('dialog-title').textContent=m?'Keep this memory close':'Capture this happy moment';
    showPhotoPreview(null);
    try{dialog.showModal();}catch{dialog.setAttribute('open','');}
    if(m?.photo){const session=photoDialogSession;getPhoto(m.id).then(data=>{if(session===photoDialogSession && data && !draftPhoto && !removeExistingPhoto)showPhotoPreview(data);}).catch(()=>showToast('Could not load this photo.'));}
    noteField.focus();
  }
  function openNote(id) {const m=moments.find(m=>m.id===id);if(m)showEditor(m.type,m);}
  function openCapture() {showEditor('joy',null);}
  function closeNote() {photoDialogSession++;try{dialog.close();}catch{dialog.removeAttribute('open');}editingId=null;creatingType=null;draftPhoto=null;removeExistingPhoto=false;}
  async function saveNote() {
    const creating=!!creatingType;
    let m=creating?{id:randomId(),type:creatingType,timestamp:new Date().toISOString(),note:'',photo:false,sample:false}:moments.find(m=>m.id===editingId);
    if(!m)return;
    let photoError=false;
    try {
      if(draftPhoto){await putPhoto(m.id,draftPhoto);m.photo=true;}
      else if(removeExistingPhoto){await deletePhoto(m.id);m.photo=false;}
    } catch {photoError=true;}
    m.note=noteField.value.trim().slice(0,300);
    if(creating)moments.unshift(m);
    persist();closeNote();render();
    showToast(photoError?'Moment saved, but the photo could not be saved.':'Your little moment is saved.');
  }
  async function shareMoment(id) {
    const m=moments.find(m=>m.id===id);if(!m)return;
    const kind=m.type==='laugh'?'I had a little laugh':'I had a happy moment';
    const message=`A little joy I wanted to share with you ♡\n\n${kind}${m.note?`: ${m.note}`:'.'}\n\n— sent with Little Joys`;
    if (navigator.share) {
      try {
        let payload={title:'A little joy for you',text:message};
        if(m.photo && navigator.canShare){
          try {
            const data=await getPhoto(m.id);
            if(data){const blob=await(await fetch(data)).blob();const file=new File([blob],'a-little-joy.jpg',{type:'image/jpeg'});
              if(navigator.canShare({files:[file]}))payload.files=[file];
            }
          } catch { /* Text sharing still works even if photo share is unavailable. */ }
        }
        await navigator.share(payload);showToast(payload.files?'Photo and moment shared.':'Your little joy is on its way.');return;}
      catch(e){if(e && e.name==='AbortError')return;}
    }
    try {
      if(navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(message);
      else {
        const temp=document.createElement('textarea');temp.value=message;temp.style.position='fixed';temp.style.opacity='0';document.body.append(temp);temp.select();
        const copied=document.execCommand('copy');temp.remove();if(!copied)throw new Error('Copy failed');
      }
      showToast('Message copied. Paste it to someone you love.');
    } catch {showToast('Could not share here. Try from a secure browser.');}
  }
  async function exportMoments() {
    const photos=[];
    try {for(const m of moments.filter(x=>x.photo)){const data=await getPhoto(m.id);if(data)photos.push({id:m.id,data});}}
    catch {showToast('Could not read all photos. Please retry your backup.');return;}
    const file=new Blob([JSON.stringify({app:'Little Joys',version:2,exportedAt:new Date().toISOString(),moments,photos},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(file), a=document.createElement('a');a.href=url;a.download=`little-joys-backup-${dateKey(new Date())}.json`;
    document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);showToast('Your notes and photos are backed up.');
  }
  function handleTool(tool) {
    if(tool==='export'){exportMoments();return;}
    if(tool==='import'){importField.value='';importField.click();return;}
    if(tool==='clear'){
      if(!moments.length){showToast('Your journal is already empty.');return;}
      if(window.confirm('Erase every moment and photo saved in this browser? This cannot be undone unless you have a backup.')){clearPhotos().then(()=>{moments=[];persist();render();showToast('All moments erased from this browser.');}).catch(()=>showToast('Could not erase photos. Please retry.'));}
      return;
    }
    if(tool==='sample'){
      const now=Date.now();const sample=[
        {id:randomId(),type:'laugh',timestamp:new Date(now-1000*60*18).toISOString(),note:'Someone made me laugh when I least expected it.',sample:true},
        {id:randomId(),type:'joy',timestamp:new Date(now-1000*60*68).toISOString(),note:'A little ordinary moment felt special.',sample:true},
        {id:randomId(),type:'laugh',timestamp:new Date(now-1000*60*145).toISOString(),note:'I laughed at something wonderfully silly.',sample:true}
      ];
      moments.push(...sample);moments.sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp));persist();navigate('today');showToast('Three labeled demo moments added.');
    }
  }

  document.querySelector('#brand-smile-anchor').outerHTML = smileButton('sunshine-header');
  document.querySelector('#story-smile-anchor').outerHTML = smileButton('sunshine-story');
  document.addEventListener('click', event=>{
    if(!event.target.closest('[data-sun-toggle]')) return;
    sunshineOn = !sunshineOn;
    syncSunshine();
  });
  document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon,20));
  document.querySelector('.bottom-nav').addEventListener('click',e=>{const tab=e.target.closest('[data-tab]');if(tab)navigate(tab.dataset.tab);});
  content.addEventListener('click',e=>{
    const target=e.target.closest('button');if(!target)return;
    if(target.dataset.add)pulseMomentTrigger(target,target.dataset.add);
    else if(target.dataset.goto)navigate(target.dataset.goto);
    else if(target.dataset.bumblePrompt)bumbleChat.send(target.dataset.bumblePrompt);
    else if(target.dataset.timelineZoom)garden.zoomTimeline(target.dataset.timelineZoom);
    else if(target.hasAttribute('data-timeline-latest'))garden.focusTimeline();
    else if(target.hasAttribute('data-bumble-toggle')){companion.toggle();render();}
    else if(target.hasAttribute('data-garden')||target.hasAttribute('data-garden-tone')||target.hasAttribute('data-garden-week'))garden.click(target);
    else if(target.hasAttribute('data-sun-another')){sunshineOffset++;render();}
    else if(target.hasAttribute('data-sun-toggle-card')){sunshineSettings.show=!sunshineSettings.show;saveSunshineSettings();render();}
    else if(target.dataset.sunCategory){sunshineSettings.type=target.dataset.sunCategory;sunshineOffset=0;saveSunshineSettings();render();}
    else if(target.hasAttribute('data-sun-alerts')){toggleSunshineAlerts();}
    else if(target.hasAttribute('data-mic-toggle')){if(mic.status==='on'||mic.status==='starting')stopMic();else startMic();}
    else if(target.hasAttribute('data-mic-confirm'))micConfirm();
    else if(target.hasAttribute('data-mic-dismiss'))micDismiss();
    else if(target.dataset.capture)openCapture();
    else if(target.dataset.edit)openNote(target.dataset.edit);
    else if(target.dataset.delete)removeMoment(target.dataset.delete);
    else if(target.dataset.share)shareMoment(target.dataset.share);
    else if(target.dataset.filter){journalFilter=target.dataset.filter;render();}
    else if(target.dataset.tool)handleTool(target.dataset.tool);
  });
  content.addEventListener('submit',e=>{
    if(e.target.id!=='lj-chat-form')return;
    e.preventDefault();
    const input=e.target.querySelector('#lj-chat-input');
    const value=input?.value||'';
    if(input)input.value='';
    bumbleChat.send(value);
  });
  content.addEventListener('input',e=>{
    if(e.target.id==='journal-search'){
      journalQuery=e.target.value;
      const list=document.getElementById('journal-list');if(list){list.innerHTML=journalListHtml();hydratePhotos(list);}
    }
  });
  document.getElementById('close-dialog').addEventListener('click',closeNote);
  const noteForm=document.getElementById('note-form');
  noteForm.addEventListener('submit',async e=>{e.preventDefault();const saveBtn=noteForm.querySelector('[type="submit"]');if(saveBtn.disabled)return;saveBtn.disabled=true;try{await saveNote();}finally{saveBtn.disabled=false;}});
  document.querySelectorAll('[data-photo-icon]').forEach(el=>el.innerHTML=icon(el.dataset.photoIcon,16));
  document.getElementById('take-photo').addEventListener('click',()=>document.getElementById('take-photo-input').click());
  document.getElementById('choose-photo').addEventListener('click',()=>document.getElementById('choose-photo-input').click());
  async function pickPhoto(e) {
    const file=e.target.files?.[0];e.target.value='';if(!file)return;
    const session=photoDialogSession;
    try{const data=await compressPhoto(file);if(session!==photoDialogSession)return;draftPhoto=data;removeExistingPhoto=false;showPhotoPreview(data);showToast('Photo ready to save with your moment.');}
    catch(error){showToast(error?.message || 'Could not use this image.');}
  }
  document.getElementById('take-photo-input').addEventListener('change',pickPhoto);
  document.getElementById('choose-photo-input').addEventListener('change',pickPhoto);
  noteField.addEventListener('input',()=>{noteCounter.textContent=`${noteField.value.length} / 300`;});
  dialog.addEventListener('close',()=>{photoDialogSession++;editingId=null;creatingType=null;draftPhoto=null;removeExistingPhoto=false;});
  dialog.addEventListener('click',e=>{if(e.target===dialog)closeNote();});
  importField.addEventListener('change',async()=>{
    const file=importField.files?.[0];if(!file)return;
    if(file.size>30000000){showToast('This backup is too large to import (30MB maximum).');return;}
    try {
      const parsed=JSON.parse(await file.text());
      if(!parsed || parsed.app!=='Little Joys' || !Array.isArray(parsed.moments) || parsed.moments.length>MAX_IMPORT)throw new Error('Invalid file');
      const cleaned=parsed.moments.map(cleanMoment);
      if(cleaned.some(x=>!x))throw new Error('Invalid entry');
      const photos=Array.isArray(parsed.photos)?parsed.photos:[];
      const ids=new Set(cleaned.map(m=>m.id));
      if(photos.length>MAX_IMPORT || photos.some(p=>!p || !ids.has(p.id) || typeof p.data!=='string' || p.data.length>MAX_PHOTO_DATA || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(p.data)))throw new Error('Invalid photos');
      if(!window.confirm(`Restore ${cleaned.length} moments${photos.length?` and ${photos.length} photos`:''}? This will replace the ${moments.length} moments currently saved in this browser.`))return;
      await clearPhotos();
      for(const p of photos)await putPhoto(p.id,p.data);
      const photoIds=new Set(photos.map(p=>p.id));
      moments=cleaned.map(m=>({...m,photo:photoIds.has(m.id)})).sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp));
      persist();navigate('journal');showToast('Your journal and photos have been restored.');
    } catch {showToast('Could not restore this backup. Please check the file and try again.');}
  });
  window.addEventListener('storage',e=>{if(e.key===STORAGE_KEY){moments=loadMoments();render();}});
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden)syncWidgetJournal();
    if(document.hidden&&(mic.status==='on'||mic.status==='starting'))stopMic(true);
    if(!document.hidden){
      const hour=hourKey();
      if(hour!==sunshineHour){sunshineHour=hour;sunshineOffset=0;lastDate=dateKey(new Date());render();}
      lastSunshineAlertHour=hour; // Don't deliver missed alerts all at once on return.
    }
  });
  window.addEventListener('pagehide',()=>{
    if(mic.stream)mic.stream.getTracks().forEach(track=>track.stop());
    if(mic.raf)cancelAnimationFrame(mic.raf);
  });
  setInterval(()=>{
    const today=dateKey(new Date());
    const hour=hourKey();
    if(today!==lastDate || hour!==sunshineHour){
      const hourChanged=hour!==sunshineHour;
      lastDate=today;sunshineHour=hour;
      sunshineOffset=0;
      if(hourChanged)maybeHourlySunshineAlert();
      render();
    }
  },30000);
  if ('serviceWorker' in navigator && (location.protocol==='https:' || location.hostname==='localhost')) {
    window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
  }
  render();
  syncWidgetJournal();
  window.addEventListener('focus',syncWidgetJournal);
})();
