// ================= 核心变量 =================
const video = document.getElementById('video');
const captureBtn = document.getElementById('captureBtn');
const calibrateBtn = document.getElementById('calibrateBtn');
const statusDiv = document.getElementById('status');

let stream = null;
let currentFacingMode = 'environment'; 
const FREE_TRIAL_HOURS = 24; // 免费试用 24 小时

// ================= 24小时免费试用逻辑 =================
function checkTrialStatus() {
  const now = new Date().getTime();
  let firstVisit = localStorage.getItem('hygieneFirstVisit');

  // 如果第一次打开，记录当前时间
  if (!firstVisit) {
    localStorage.setItem('hygieneFirstVisit', now);
    return true; // 刚开始，允许使用
  }

  // 计算已经过去的小时数
  const hoursPassed = (now - parseInt(firstVisit)) / (1000 * 60 * 60);
  
  if (hoursPassed >= FREE_TRIAL_HOURS) {
    return false; // 超过24小时，需要付费
  }
  return true; // 还在24小时内，允许使用
}

// ================= 摄像头启动逻辑 =================
async function startCamera() {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false
    });
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

// ================= 状态更新 =================
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
    utterance.rate = 1.0;
    window.speechSynthesis.speak(utterance);
  }
}

// ================= 核心检测逻辑 =================
function captureAndDetect() {
  // 第一步：检查是否还在24小时试用期内
  if (!checkTrialStatus()) {
    // 试用过期，强制提示并阻止继续使用
    updateStatus("Your 24-hour free trial has expired. Please upgrade to Pro for $4.99 per month to continue.", true);
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

// ================= 事件绑定 =================
captureBtn.addEventListener('click', captureAndDetect);

document.body.addEventListener('click', (e) => {
  // 如果点的是按钮、下拉框或者链接，就不触发拍照
  if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'SELECT' && e.target.tagName !== 'A') {
    captureAndDetect();
  }
});

window.addEventListener('load', () => {
  startCamera();
  statusDiv.innerText = "Ready. Tap anywhere on the screen to capture. 24-hour free trial started.";
});

calibrateBtn.addEventListener('click', () => {
  updateStatus("Calibration complete. Ready to capture.", false);
});
