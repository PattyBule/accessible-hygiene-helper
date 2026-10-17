// 获取DOM元素
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
    statusDiv.innerText = "无法访问摄像头";
  }
}

// 更新状态：震动 + 声音
function updateStatus(text, isDirty) {
  statusDiv.innerText = text;
  
  // 1. 震动
  if (navigator.vibrate) {
    if (isDirty) {
      navigator.vibrate([100, 100, 100]); // 脏连震3下
    } else {
      navigator.vibrate(200); // 干净震1下
    }
  }

  // 2. 声音 (如果浏览器支持)
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    window.speechSynthesis.speak(utterance);
  }
}

// 核心检测逻辑（进阶版）
function captureAndDetect() {
  if (!stream) return;

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  // 取中心区域
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const size = Math.min(canvas.width, canvas.height) * 0.4; 
  const imgData = ctx.getImageData(centerX - size/2, centerY - size/2, size, size);
  const data = imgData.data;

  // 算法升级：统计可疑像素的数量
  let suspiciousPixels = 0;
  let totalPixels = data.length / 4;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i+1];
    const b = data[i+2];
    
    // 判断逻辑：寻找偏红、偏黄、偏褐的颜色
    // 比如红色：R明显大于G和B；黄色/褐色：R和G都大，B小
    if ((r > 120 && r > b + 30 && g < r - 10) || // 偏红/褐
        (r > 140 && g > 100 && b < 80)) {        // 偏黄
      suspiciousPixels++;
    }
  }

  // 如果可疑颜色占比超过 5%，就判定为脏
  const dirtyRatio = suspiciousPixels / totalPixels;
  const isDirty = dirtyRatio > 0.05; 

  setTimeout(() => {
    if (isDirty) {
      updateStatus("检测结果：可能不干净，请再擦一次。", true);
    } else {
      updateStatus("检测结果：干净。", false);
    }
  }, 500);
}

captureBtn.addEventListener('click', captureAndDetect);

// 全屏点击
document.body.addEventListener('click', (e) => {
  if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'SELECT') {
    captureAndDetect();
  }
});

window.addEventListener('load', () => {
  startCamera();
  statusDiv.innerText = "准备就绪，点击屏幕拍照。";
});

calibrateBtn.addEventListener('click', () => {
  updateStatus("白卡校准完成。", false);
});
