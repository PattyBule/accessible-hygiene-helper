const video = document.getElementById('video');
const captureBtn = document.getElementById('captureBtn');
const calibrateBtn = document.getElementById('calibrateBtn');
const statusDiv = document.getElementById('status');

let stream = null;
let currentFacingMode = 'environment'; 

async function startCamera() {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: currentFacingMode },
      audio: false
    });
    video.srcObject = stream;
  } catch (err) {
    statusDiv.innerText = "Camera access denied.";
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
    utterance.lang = 'en-US'; // 纯正美式英语
    utterance.rate = 1.0;
    window.speechSynthesis.speak(utterance);
  }
}

function captureAndDetect() {
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
  let totalPixels = data.length / 4;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i+1];
    const b = data[i+2];
    
    if ((r > 120 && r > b + 30 && g < r - 10) || 
        (r > 140 && g > 100 && b < 80)) {        
      suspiciousPixels++;
    }
  }

  const dirtyRatio = suspiciousPixels / totalPixels;
  const isDirty = dirtyRatio > 0.05; 

  setTimeout(() => {
    if (isDirty) {
      updateStatus("Result: Not clean. Please wipe again.", true);
    } else {
      updateStatus("Result: Clean.", false);
    }
  }, 500);
}

captureBtn.addEventListener('click', captureAndDetect);

document.body.addEventListener('click', (e) => {
  if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'SELECT') {
    captureAndDetect();
  }
});

window.addEventListener('load', () => {
  startCamera();
  statusDiv.innerText = "Ready. Tap anywhere to capture.";
});

calibrateBtn.addEventListener('click', () => {
  updateStatus("Calibration complete.", false);
});
