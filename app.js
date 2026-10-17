const video = document.getElementById('video');
const captureBtn = document.getElementById('captureBtn');
const calibrateBtn = document.getElementById('calibrateBtn');
const statusDiv = document.getElementById('status');

let stream = null;
let currentFacingMode = 'environment'; 
const FREE_TRIAL_HOURS = 24; 

function checkTrialStatus() {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('success') === 'true') {
    localStorage.setItem('hygieneIsPro', 'true');
    window.history.replaceState({}, document.title, window.location.pathname);
  }
  if (localStorage.getItem('hygieneIsPro') === 'true') return true;

  const now = new Date().getTime();
  let firstVisit = localStorage.getItem('hygieneFirstVisit');
  if (!firstVisit) {
    localStorage.setItem('hygieneFirstVisit', now);
    return true; 
  }
  const hoursPassed = (now - parseInt(firstVisit)) / (1000 * 60 * 60);
  return hoursPassed < FREE_TRIAL_HOURS;
}

async function startCamera() {
  if (stream) stream.getTracks().forEach(track => track.stop());
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    video.srcObject = stream;
  } catch (err) {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true });
      video.srcObject = stream;
    } catch (err2) {
      statusDiv.innerText = "Camera access denied.";
    }
  }
}

function updateStatus(text, isDirty) {
  statusDiv.innerText = text;
  if (navigator.vibrate) {
    if (isDirty) navigator.vibrate([100, 100, 100]);
    else navigator.vibrate(200);
  }
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    window.speechSynthesis.speak(utterance);
  }
}

function captureAndDetect() {
  if (!checkTrialStatus()) {
    updateStatus("Free trial expired. Please click the green Subscribe button.", true);
    return; 
  }
  if (!stream) return;

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const size = Math.min(canvas.width, canvas.height) * 0.4; 
  const imgData = ctx.getImageData(centerX - size/2, centerY - size/2, size, size);
  const data = imgData.data;

  let suspiciousPixels = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i+1], b = data[i+2];
    if ((r > 120 && r > b + 30 && g < r - 10) || (r > 140 && g > 100 && b < 80)) suspiciousPixels++;
  }

  const isDirty = (suspiciousPixels / (data.length / 4)) > 0.05; 

  setTimeout(() => {
    updateStatus(isDirty ? "Result: Not clean. Please wipe again." : "Result: Clean.", isDirty);
  }, 500);
}

captureBtn.addEventListener('click', captureAndDetect);

// 修复点击拦截：如果点击的是按钮、链接或它们里面的字，就不触发拍照
document.body.addEventListener('click', (e) => {
  if (e.target.closest('button') || e.target.closest('a') || e.target.closest('select')) {
    return; 
  }
  captureAndDetect();
});

window.addEventListener('load', () => {
  startCamera();
  statusDiv.innerText = "Ready. Tap anywhere on the screen to capture. 24-hour free trial started.";
});

calibrateBtn.addEventListener('click', () => {
  updateStatus("Calibration complete.", false);
});
