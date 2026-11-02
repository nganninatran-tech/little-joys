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


  function persist() {
    try { localStorage.setItem(STORAGE_KEY,JSON.stringify(moments)); return true; }
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
    moments.unshift(item);persist();render();
    if(celebrate)celebrateSavedMoment(type,previous);
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
      <div class="moment-actions-inline"><button class="small-icon-button" type="button" data-edit="${escapeHtml(m.id)}" aria-label="${m.note?'Edit note':'Add a note'} for ${momentName(m)}" title="${m.note?'Edit note':'Add a note'}">${icon('edit',16)}</button><button class="small-icon-button" type="button" data-delete="${escapeHtml(m.id)}" aria-label="Delete ${momentName(m)}" title="Delete">${icon('trash',16)}</button></div>
    </article>`;
  }
  function renderToday() {
    const today=todayMoments(), counts=countTypes(today);
    return `<div class="date-line">${escapeHtml(dateText(new Date()))}</div>
      <h1 class="welcome-title">Here's to the <em>little</em> things.</h1>
      <section class="hero-card" aria-label="Today's moments">
        ${smileButton('sunshine-hero')}
        <div class="hero-top">${icon('sparkle',14)} Your day, in little moments</div>
        <div class="hero-numbers"><div><div class="hero-number"><strong data-count="laugh">${counts.laugh}</strong><span>little<br>laughs</span></div></div><div><div class="hero-number"><strong data-count="joy">${counts.joy}</strong><span>happy<br>moments</span></div></div></div>
        <p class="hero-note">Not a score. Just the moments you noticed.</p>
      </section>
      <div class="section-heading"><h2>Catch a little moment</h2></div>
      <div class="moment-actions"><button type="button" class="moment-trigger laugh" data-add="laugh">${icon('laugh',28)}<strong>I laughed</strong><small>Save a little giggle</small></button><button type="button" class="moment-trigger joy" data-add="joy">${icon('heart',28)}<strong>I felt happy</strong><small>Keep this feeling</small></button></div>
      <button type="button" class="capture-button" data-capture="joy">${icon('camera',22)}<span><strong>Capture a happy moment</strong><small>Take a photo or keep one from your gallery, with a little note</small></span>${icon('arrow',17)}</button>
      ${hourlySunshineCard()}
      ${micCard()}
      <div class="gentle-note">${icon('leaf',17)}<span>You don't have to feel joyful all day. One small moment can still be worth remembering.</span></div>
      <div class="section-heading"><h2>Today's little memories</h2><button type="button" class="text-link" data-goto="journal">See journal →</button></div>
      ${today.length?`<div class="moment-list">${today.slice(0,5).map(momentCard).join('')}</div>`:emptyState('A fresh little page','When something makes you laugh or smile, tap above to save it. No pressure.','sun')}
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
      <label class="search-field">${icon('search',16)}<span class="sr-only">Search memories</span><input id="journal-search" placeholder="Search your little memories" value="${escapeHtml(journalQuery)}" maxlength="100"></label>
      <div id="journal-list">${journalListHtml()}</div>`;
  }
  function getWeek() {
    const now=new Date();now.setHours(12,0,0,0);
    return Array.from({length:7},(_,i)=> {const d=new Date(now);d.setDate(now.getDate() - (6-i));const entries=moments.filter(m=>momentDay(m)===dateKey(d));return {date:d,items:entries,...countTypes(entries)};});
  }
  function renderPatterns() {
    const week=getWeek();const laughs=week.reduce((n,d)=>n+d.laugh,0);const joys=week.reduce((n,d)=>n+d.joy,0);const days=week.filter(d=>d.items.length).length;const max=Math.max(...week.map(d=>Math.max(d.laugh,d.joy)),1);
    return `<span class="eyebrow">A GENTLER KIND OF REFLECTION</span><h1 class="page-title">Look at the little things.</h1><p class="page-description">Your past seven days, without goals to hit or streaks to keep.</p>
      <section class="week-card"><div class="subtle-row"><strong style="font-size:13px">A week of moments</strong><span class="eyebrow" style="font-size:9px">LAST 7 DAYS</span></div><p class="week-intro">Only moments you chose to log are shown.</p>
        <div class="week-bars" role="img" aria-label="Over the last seven days, you logged ${laughs} laughs and ${joys} happy moments.">${week.map((d,i)=>`<div class="day-column"><div class="day-total">${d.items.length||''}</div><div class="bar-pair"><div class="bar laugh ${d.laugh?'':'zero'}" style="height:${d.laugh?Math.max(7,d.laugh/max*100):3}%" title="${d.laugh} laughs"></div><div class="bar joy ${d.joy?'':'zero'}" style="height:${d.joy?Math.max(7,d.joy/max*100):3}%" title="${d.joy} happy moments"></div></div><span class="day-name ${i===6?'today':''}">${escapeHtml(d.date.toLocaleDateString(undefined,{weekday:'short'}).slice(0,2))}</span></div>`).join('')}</div>
        <div class="chart-legend"><span><i class="legend-mark laugh"></i>Laughs</span><span><i class="legend-mark joy"></i>Happy moments</span></div>
      </section>
      <div class="insight-grid"><div class="insight-card"><strong>${laughs+joys}</strong><span>little moments saved<br>this week</span></div><div class="insight-card"><strong>${days}<span style="font-family:inherit;font-size:16px"> / 7</span></strong><span>days with at least<br>one saved moment</span></div></div>
      <div class="reflection-card"><strong>A note to yourself</strong><p>${days===0?'This week is still yours, even without a single entry. There is nothing to catch up on.':'A day with fewer saved moments is not a less happy day. This is a record of what you noticed, not a measure of how much joy you deserve.'}</p></div>`;
  }
  function renderTogether() {
    const shared=moments.slice(0,8);
    return `<span class="eyebrow">GOOD THINGS CAN BE SHARED</span><h1 class="page-title">A little joy, for someone.</h1><div class="people-header"><span class="eyebrow">THINKING OF YOU</span><h2>Send a little<br>piece of your day.</h2><p>Choose a memory and share it with someone you love. A tiny note can go a long way.</p></div>
      <div class="section-heading"><h2>Choose a moment to share</h2></div>
      ${shared.length?shared.map(m=>`<article class="share-card"><div class="share-card-header"><div class="moment-dot ${m.type==='joy'?'joy':''}">${icon(m.type==='laugh'?'laugh':'heart',15)}</div><div><div class="moment-kind">${momentName(m)}</div><div class="moment-meta">${escapeHtml(dateGroupText(new Date(m.timestamp)))}</div></div></div><p>${m.note?escapeHtml(m.note):m.type==='laugh'?'Something made me laugh today.':'Something made me happy today.'}</p>${m.photo?`<img class="share-photo" data-photo-id="${escapeHtml(m.id)}" alt="Photo saved with this moment" loading="lazy">`:''}<div class="share-card-actions"><button type="button" class="outline-button" data-share="${escapeHtml(m.id)}">${icon('share',14)} Share this moment</button></div></article>`).join(''):emptyState('Sharing starts with a moment','Save a little laugh or happy moment on Today, then you can share it here.','hearts')}
      <p class="info-note">Your journal stays private. Only the message you deliberately share leaves the app. This version uses your phone's share menu or copies a message; it does not connect accounts or send automatic alerts.</p>`;
  }
  function renderYou() {
    return `<span class="eyebrow">MADE TO BE YOURS</span><h1 class="page-title">Your space, your pace.</h1><p class="page-description">Your little moments are yours to keep. This version saves everything on this device, without an account.</p>
      ${sunshineSettingsHtml()}
      <div class="section-heading"><h2>Your journal</h2></div>
      <div class="settings-card">
      <button type="button" class="settings-row" data-tool="export">${icon('download',22)}<span><strong>Save a backup</strong><small>Download your journal as a JSON file.</small></span><span class="row-arrow">›</span></button>
      <button type="button" class="settings-row" data-tool="import">${icon('upload',22)}<span><strong>Restore a backup</strong><small>Import a journal backup from this app.</small></span><span class="row-arrow">›</span></button>
      <button type="button" class="settings-row" data-tool="sample">${icon('sparkle',22)}<span><strong>Try three demo moments</strong><small>Add clearly marked examples to explore the app.</small></span><span class="row-arrow">›</span></button>
      <button type="button" class="settings-row danger" data-tool="clear">${icon('trash',22)}<span><strong>Erase all moments</strong><small>Clear your saved journal from this device.</small></span><span class="row-arrow">›</span></button></div>
      <div class="privacy-box">${icon('shield',21)}<strong> Your privacy matters.</strong><p>The optional microphone experiment processes sound levels locally only when you start it; it never records or uploads audio. No location tracking, no ads, and no account in this prototype. Your notes and photos are stored in this browser only. Your exported backup includes both. Clearing browser data or changing devices may erase them unless you've made a backup.</p></div>
      <p class="app-version">Little Joys · prototype v1.0 · not a happiness score</p>`;
  }
  function render() {
    const html={today:renderToday,journal:renderJournal,patterns:renderPatterns,together:renderTogether,you:renderYou};
    content.innerHTML=(html[currentTab]||renderToday)();
    hydratePhotos(content);
    document.querySelectorAll('[data-tab]').forEach(button=>{
      const active=button.dataset.tab===currentTab;button.classList.toggle('active',active);
      if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
    });
  }
  function navigate(tab) {
    if (!['today','journal','patterns','together','you'].includes(tab))return;
    if(tab!=='today' && (mic.status==='on'||mic.status==='starting'))stopMic(true);
    currentTab=tab;render();content.scrollTop=0;
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
})();
