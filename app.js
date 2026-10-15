// app.js - Web + H5 PWA 颜色/污渍检测（本地运行）
// 特性：后置摄像头优先、白卡校准、红/黄/棕判定、语音 + 触觉反馈、PWA 注册
// 新增：点击任意处拍照并检测，语音引导用户把纸张放在框内

const video = document.getElementById('video');
const cameraSelect = document.getElementById('cameraSelect');
const captureBtn = document.getElementById('captureBtn');
const calibrateBtn = document.getElementById('calibrateBtn');
const swatchEl = document.getElementById('swatch');
const valsEl = document.getElementById('vals');
const statusEl = document.getElementById('status');
const exportBtn = document.getElementById('exportBtn');
const repeatBtn = document.getElementById('repeatBtn');
const saveBtn = document.getElementById('saveBtn');
const toggleTorch = document.getElementById('toggleTorch');
const fullBtn = document.getElementById('fullBtn');
const guideBtn = document.getElementById('guideBtn');
const guideModal = document.getElementById('guideModal');
const closeGuide = document.getElementById('closeGuide');
const hintText = document.getElementById('hintText');

let stream = null;
let videoTrack = null;
let whiteRef = null;
let lastResult = null;
let torchOn = false;
let lastTapAt = 0;
const STORAGE_KEY = 'color-check-history-v1';

const ENTRY_PROMPT = '相机已启动。请把纸张放进虚线框内，然后点击屏幕任意位置拍照。';

/* === debug + overlay + manual TTS fallback === */
const ENABLE_DEBUG = true;
function dbg(...args){ if(ENABLE_DEBUG) console.log('[cam-debug]', ...args); }

let tapOverlay = null;
let ttsButton = null;
let audioCtx = null;
let wakeAudio = null;
// Use a small hosted beep as MP3/OGG to maximize compatibility
const BEEP_PATH = 'https://actions.google.com/sounds/v1/alarms/beep_short.ogg';

function ensureTapOverlay(){
  if(tapOverlay) return;
  tapOverlay = document.createElement('div');
  tapOverlay.id = 'tapOverlay';
  Object.assign(tapOverlay.style, {
    position: 'absolute',
    left: 0, top: 0, right: 0, bottom: 0,
    zIndex: 9999,
    background: 'transparent',
    // capture pointer events
  });
  tapOverlay.addEventListener('touchend', function(e){
    dbg('tapOverlay touchend');
    e.preventDefault();
    handleGlobalTap(e);
  }, {passive:false});
  tapOverlay.addEventListener('click', function(e){
    dbg('tapOverlay click');
    handleGlobalTap(e);
  }, true);
  const parent = video.parentElement || document.body;
  parent.style.position = parent.style.position || 'relative';
  parent.appendChild(tapOverlay);
}

function showTapOverlay(show){
  if(!tapOverlay) ensureTapOverlay();
  tapOverlay.style.display = show ? 'block' : 'none';
  dbg('tapOverlay display', show);
}

function ensureWakeAudio(){
  if(wakeAudio) return;
  try{
    wakeAudio = new Audio(BEEP_PATH);
    wakeAudio.preload = 'auto';
    wakeAudio.crossOrigin = 'anonymous';
  }catch(e){ dbg('ensureWakeAudio failed', e); wakeAudio = null; }
}

function playWakeBeep(){
  return new Promise(async (resolve)=>{
    ensureWakeAudio();
    if(wakeAudio){
      try{
        const p = wakeAudio.play();
        if(p && p.then){
          // wait for ended event
          const onEnded = ()=>{ wakeAudio.removeEventListener('ended', onEnded); resolve(); };
          wakeAudio.addEventListener('ended', onEnded);
          p.catch((e)=>{
            dbg('wakeAudio play rejected', e);
            // fallback to WebAudio beep
            playShortBeep().then(resolve).catch(()=>resolve());
          });
        }else{
          // older browsers
          const onEnded = ()=>{ wakeAudio.removeEventListener('ended', onEnded); resolve(); };
          wakeAudio.addEventListener('ended', onEnded);
        }
      }catch(e){
        dbg('wakeAudio play error', e);
        playShortBeep().then(resolve).catch(()=>resolve());
      }
    } else {
      // fallback
      playShortBeep().then(resolve).catch(()=>resolve());
    }
  });
}

function ensureTtsButton(){
  if(ttsButton) return;
  ttsButton = document.createElement('button');
  ttsButton.id = 'ttsButton';
  ttsButton.textContent = '播放提示音';
  Object.assign(ttsButton.style, {
    position: 'fixed',
    right: '12px',
    bottom: '80px',
    zIndex: 99999,
    padding: '8px 12px',
    background: '#0b84ff',
    color: '#fff',
    border: 'none',
    borderRadius: '6px'
  });
  ttsButton.addEventListener('click', async ()=>{
    dbg('ttsButton clicked');
    await playWakeBeep();
    speak(ENTRY_PROMPT);
    ttsButton.style.display = 'none';
  });
  document.body.appendChild(ttsButton);
  // show by default on mobile so user can force audio
  ttsButton.style.display = 'block';
}

window.addEventListener('beforeunload', ()=>{ showTapOverlay(false); });
/* === end overlay code === */

function speak(text){
  if('speechSynthesis' in window){
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }
}

function tactile(pattern=50){
  if(navigator.vibrate) navigator.vibrate(pattern);
}

function canUseGlobalTap(event){
  if(!stream || !video || !video.videoWidth || !video.videoHeight) return false;
  if(!event || !event.target) return false;
  if(event.target.closest && (
    event.target.closest('button') ||
    event.target.closest('select') ||
    event.target.closest('.modal') ||
    event.target.closest('#guideModal') ||
    event.target.closest('.modalContent')
  )) return false;
  return true;
}

function captureNow(){
  const sample = sampleROI();
  if(!sample){
    statusEl.textContent = '拍摄失败，请重试';
    speak('拍摄失败，请重试');
    return;
  }
  const res = analyzeColor(sample);
  showResult(res);
}

function handleGlobalTap(event){
  dbg('handleGlobalTap target=', event && event.target && (event.target.id || event.target.tagName), 'videoReady=', !!(video && video.videoWidth));
  if(!canUseGlobalTap(event)) return;
  const now = performance.now();
  if(now - lastTapAt < 500) return;
  lastTapAt = now;
  const target = event.target;
  if(target && target.id === 'video') {
    captureNow();
    return;
  }
  if(target && target.closest && target.closest('#video')) {
    captureNow();
    return;
  }
  if(!target.closest || !target.closest('button,select')) {
    captureNow();
  }
}

// WebAudio fallback short beep
function playShortBeep(durationMs=80, freq=880){
  return new Promise((resolve)=>{
    try{
      if(!audioCtx){
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if(audioCtx.state === 'suspended') audioCtx.resume().catch(()=>{});

      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      const now = audioCtx.currentTime;
      gain.gain.exponentialRampToValueAtTime(0.2, now + 0.01);
      osc.start(now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs/1000);
      osc.stop(now + durationMs/1000 + 0.02);
      osc.onended = () => { resolve(); };
    }catch(e){
      dbg('playShortBeep failed', e);
      resolve();
    }
  });
}

async function listCameras(){
  try{
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter(d => d.kind === 'videoinput');
    cameraSelect.innerHTML = '';
    cams.forEach((c,i)=>{
      const opt = document.createElement('option');
      opt.value = c.deviceId;
      opt.textContent = c.label || `摄像头 ${i+1}`;
      cameraSelect.appendChild(opt);
    });
  }catch(e){
    console.error('listCameras', e);
  }
}

async function startCamera(deviceId){
  if(stream){
    stream.getTracks().forEach(t=>t.stop());
    stream = null; videoTrack = null;
  }
  const constraints = {
    audio: false,
    video: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      facingMode: { ideal: 'environment' },
      width: { ideal: 1280 },
      height: { ideal: 720 }
    }
  };
  try{
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;
    videoTrack = stream.getVideoTracks()[0];
    await video.play();
    await listCameras();
    const cap = videoTrack.getCapabilities && videoTrack.getCapabilities();
    if(cap && cap.torch) toggleTorch.style.display = 'inline-block';
    else toggleTorch.style.display = 'none';
    hintText.textContent = '提示：把纸张放进虚线框内，点击屏幕任意位置即可拍照并检测；也可使用下方按钮。';
    // Try speaking (may be blocked)
    speak(ENTRY_PROMPT);

    // show full-screen overlay to ensure taps are captured even if other elements interfere
    showTapOverlay(true);

    // heuristic: if speech didn't start, show manual TTS button after short delay
    setTimeout(()=>{
      try{
        if('speechSynthesis' in window && !window.speechSynthesis.speaking){
          ensureTtsButton();
          ttsButton.style.display = 'block';
          dbg('TTS likely blocked; showing manual button');
        } else {
          dbg('TTS speaking status:', window.speechSynthesis && window.speechSynthesis.speaking);
        }
      }catch(e){ dbg('tts detection failed', e); }
    }, 800);

  }catch(e){
    console.error('startCamera', e);
    statusEl.textContent = '无法访问相机：' + (e.message || e.name);
    speak('无法访问相机，请在浏览器允许相机权限');
  }
}

function sampleROI(){
  const w = video.videoWidth, h = video.videoHeight;
  if(!w || !h) return null;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, w, h);
  const size = Math.floor(Math.min(w,h) * 0.28);
  const sx = Math.floor((w - size)/2);
  const sy = Math.floor((h - size)/2);
  const img = ctx.getImageData(sx, sy, size, size).data;
  let r=0,g=0,b=0,count=0;
  let lumSum=0, lumSqSum=0;
  for(let i=0;i<img.length;i+=4){
    const ri=img[i], gi=img[i+1], bi=img[i+2];
    r+=ri; g+=gi; b+=bi; count++;
    const lum = 0.2126*ri + 0.7152*gi + 0.0722*bi;
    lumSum += lum; lumSqSum += lum*lum;
  }
  const avgR = Math.round(r/count), avgG = Math.round(g/count), avgB = Math.round(b/count);
  const meanLum = lumSum / count;
  const variance = (lumSqSum / count) - (meanLum*meanLum);
  const stdDevLum = Math.sqrt(Math.max(0, variance));
  return { r: avgR, g: avgG, b: avgB, stdDevLum: Number(stdDevLum.toFixed(2)) };
}

function rgbToHsv(r,g,b){
  r/=255; g/=255; b/=255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  let h=0, s=0, v=max;
  const d = max - min;
  s = max === 0 ? 0 : d / max;
  if(max === min) h = 0;
  else {
    switch(max){
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: Math.round(h*360), s: Number(s.toFixed(3)), v: Number(v.toFixed(3)) };
}

function normalizeByWhite(sample){
  if(!whiteRef) return sample;
  const r = Math.min(255, Math.round(sample.r * (255 / Math.max(1, whiteRef.r))));
  const g = Math.min(255, Math.round(sample.g * (255 / Math.max(1, whiteRef.g))));
  const b = Math.min(255, Math.round(sample.b * (255 / Math.max(1, whiteRef.b))));
  return { r, g, b, stdDevLum: sample.stdDevLum };
}

function analyzeColor(sample){
  const norm = normalizeByWhite(sample);
  const sum = norm.r + norm.g + norm.b;
  if(sum === 0) return { label: '无法判断（过暗）', classes: [], details: norm };
  const redRatio = norm.r / sum;
  const hsv = rgbToHsv(norm.r, norm.g, norm.b);
  const v = hsv.v, s = hsv.s, h = hsv.h;
  const texture = norm.stdDevLum;

  const isRedHue = (h <= 30 || h >= 330);
  const redHueOk = isRedHue && s >= 0.12 && v >= 0.05;
  const redRatioOk = redRatio >= 0.35;

  const isYellowHue = (h >= 35 && h <= 80);
  const yellowOk = isYellowHue && s >= 0.12 && v >= 0.18 && ((norm.r > norm.g && norm.g > norm.b) || (h >= 40 && h <= 70));

  const isBrownHue = (h >= 10 && h <= 45);
  const brownColorOk = isBrownHue && s >= 0.08 && v <= 0.55;
  const brownTextureOk = texture >= 8.0;

  const detected=[];
  if((redHueOk && redRatioOk) || redRatioOk) detected.push({ cls:'血色/血迹', confidence: Math.min(100, Math.round(redRatio*200)) });
  if(yellowOk) detected.push({ cls:'黄色污渍（可能是尿或其他黄色污渍）', confidence: Math.round(s*100) });
  if(brownColorOk && (brownTextureOk || redRatio < 0.35)) detected.push({ cls:'棕褐/粪便状污渍（可能含粪便）', confidence: brownTextureOk ? 85 : 55 });

  let label;
  if(detected.length===0){
    if(v < 0.06) label='无法判断（过暗）';
    else if(v > 0.96 && s < 0.03) label='无法判断（过曝/反光）';
    else label='看起来干净（未检测到明显血/黄/棕）';
  } else {
    detected.sort((a,b)=>b.confidence - a.confidence);
    label = detected.map(d=>`${d.cls}（${d.confidence}%）`).join('，');
  }

  return { label, classes: detected, details: { normalized:{r:norm.r,g:norm.g,b:norm.b}, hsv, redRatio: Number(redRatio.toFixed(3)), stdDevLum: norm.stdDevLum, calibrated: !!whiteRef } };
}

function showResult(res){
  const detail = res.details;
  let text = res.label;
  statusEl.textContent = `${text} — RGB(${detail.normalized.r},${detail.normalized.g},${detail.normalized.b})，纹理${detail.stdDevLum}`;
  swatchEl.style.background = `rgb(${detail.normalized.r},${detail.normalized.g},${detail.normalized.b})`;
  valsEl.textContent = JSON.stringify(detail, null, 2);
  speak(text);
  tactile(60);
  lastResult = { timestamp: new Date().toISOString(), result: res };
}

calibrateBtn.addEventListener('click', ()=>{
  const sample = sampleROI();
  if(!sample){ statusEl.textContent='校准失败，请确保相机已就绪'; speak('校准失败'); return; }
  whiteRef = { r: sample.r, g: sample.g, b: sample.b };
  statusEl.textContent = `白卡已校准 R:${whiteRef.r} G:${whiteRef.g} B:${whiteRef.b}`;
  hintText.textContent = '白卡已校准。把纸张放进虚线框内，点击屏幕任意位置即可检测。';
  speak('白卡已校准。现在请将纸张放进框内，点击屏幕任意位置拍照检测。');
  tactile([40,20,40]);
});

captureBtn.addEventListener('click', ()=> captureNow());

repeatBtn.addEventListener('click', ()=>{ if(lastResult){ speak(lastResult.result.label); } else { speak('尚未检测'); } });
exportBtn.addEventListener('click', ()=>{
  if(!lastResult){ alert('无可导出结果'); return; }
  const blob = new Blob([JSON.stringify(lastResult, null, 2)], {type:'application/json'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'color-check-result.json'; document.body.appendChild(a); a.click(); a.remove();
});
saveBtn.addEventListener('click', ()=>{
  if(!lastResult){ alert('无可保存结果'); return; }
  const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  existing.push(lastResult);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
  speak('结果已保存到本地');
});

toggleTorch.addEventListener('click', async ()=>{
  if(!videoTrack) return;
  const cap = videoTrack.getCapabilities && videoTrack.getCapabilities();
  if(!cap || !cap.torch){ alert('设备不支持闪光灯控制'); return; }
  try{
    torchOn = !torchOn;
    await videoTrack.applyConstraints({ advanced: [{ torch: torchOn }] });
    toggleTorch.setAttribute('aria-pressed', String(torchOn));
  }catch(e){
    console.error('torch', e);
    alert('闪光灯切换失败：' + e.message);
  }
});

fullBtn.addEventListener('click', async ()=>{
  if(!document.fullscreenElement){
    try{ await video.requestFullscreen(); } catch(e){ console.error(e); }
  } else {
    try{ await document.exitFullscreen(); } catch(e){ console.error(e); }
  }
});

cameraSelect.addEventListener('change', ()=> startCamera(cameraSelect.value));
guideBtn.addEventListener('click', ()=> { guideModal.setAttribute('aria-hidden','false'); guideModal.querySelector('button')?.focus(); });
closeGuide?.addEventListener('click', ()=> { guideModal.setAttribute('aria-hidden','true'); });

// Bind both click and touch events so mobile taps are recognized immediately
document.addEventListener('click', handleGlobalTap, true);
document.addEventListener('touchend', handleGlobalTap, true);

document.addEventListener('keydown', (e)=>{
  if (e.key === 'Escape') {
    if (guideModal && guideModal.getAttribute('aria-hidden') === 'false') {
      guideModal.setAttribute('aria-hidden', 'true');
      return;
    }
    if (stream) {
      speak('已退出相机');
      statusEl.textContent = '已退出相机';
      stream.getTracks().forEach(t => t.stop());
      stream = null;
      videoTrack = null;
      video.srcObject = null;
    }
  }
});

// Attempt to ensure speech plays on load; many mobile browsers block autoplay.
function ensureAudioOnGesture(){
  const handler = async ()=>{
    // play a short wake beep (MP3) first, then speak the entry prompt
    dbg('ensureAudioOnGesture: user gesture received; playing wake beep');
    try{
      await playWakeBeep();
    }catch(e){ dbg('wake beep failed', e); }
    speak(ENTRY_PROMPT);
    try{
      document.body.removeEventListener('touchstart', handler, {passive:true});
      document.body.removeEventListener('click', handler, {capture:true});
    }catch(e){
      // fallback removal
      document.body.removeEventListener('touchstart', handler);
      document.body.removeEventListener('click', handler);
    }
    // hide manual button if visible
    if(ttsButton) ttsButton.style.display = 'none';
  };
  try{
    document.body.addEventListener('touchstart', handler, {passive:true});
    document.body.addEventListener('click', handler, {capture:true});
  }catch(e){
    // older browsers may not support options - fallback
    document.body.addEventListener('touchstart', handler);
    document.body.addEventListener('click', handler);
  }
}

(async function init(){
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    statusEl.textContent='浏览器不支持相机，请使用最新移动浏览器（Chrome/Edge/Firefox）';
    speak('浏览器不支持相机访问');
    return;
  }
  // Try to speak immediately (may be blocked). Also set up gesture fallback.
  // We still attempt speak(), but ensureAudioOnGesture will play a short user-gesture beep then speak.
  speak(ENTRY_PROMPT);
  ensureAudioOnGesture();

  await listCameras();
  const opts = Array.from(cameraSelect.options);
  let idx = opts.findIndex(o=>/back|rear|environment/i.test(o.text));
  if(idx === -1) idx = 0;
  if(cameraSelect.options[idx]) cameraSelect.selectedIndex = idx;
  await startCamera(cameraSelect.value);
  // create tts button but visible by default on mobile so user can force audio
  ensureTtsButton();
  if('serviceWorker' in navigator){
    try{ await navigator.serviceWorker.register('sw.js'); console.log('sw registered'); }catch(e){ console.warn('sw register failed', e); }
  }
})();
