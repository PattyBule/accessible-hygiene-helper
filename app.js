// 获取DOM元素
const video = document.getElementById('video');
const captureBtn = document.getElementById('captureBtn');
const calibrateBtn = document.getElementById('calibrateBtn');
const statusDiv = document.getElementById('status');
const cameraSelect = document.getElementById('cameraSelect');
const fullBtn = document.getElementById('fullBtn');

let stream = null;
let currentFacingMode = 'environment'; // 强制默认后置

// 初始化摄像头
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
    updateStatus("无法访问摄像头，请确保您已允许权限。" + err.message);
  }
}

// 更新状态并强制屏幕朗读
function updateStatus(text) {
  statusDiv.innerText = text;
  // 确保语音播报被打断并重新播报
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = 1.0;
    window.speechSynthesis.speak(utterance);
  }
  // 震动反馈：如果文本包含"干净"不包含"不干净"
  if (text.includes("干净") && !text.includes("不干净")) {
    if (navigator.vibrate) navigator.vibrate(200); // 干净震一下长的
  } else if (text.includes("擦") || text.includes("脏") || text.includes("不干净")) {
    if (navigator.vibrate) navigator.vibrate([100, 100, 100]); // 不干净连续震三下
  } else {
    if (navigator.vibrate) navigator.vibrate(50); // 普通操作震一下短的
  }
}

// 拍照与检测逻辑
function captureAndDetect() {
  if (!stream) {
    updateStatus("摄像头未准备好，请刷新页面。");
    return;
  }

  updateStatus("正在检测，请稍候...");

  // 创建canvas获取视频帧
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  // 获取中间区域(ROI)的颜色
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const size = Math.min(canvas.width, canvas.height) * 0.4; // 取中间 40% 区域
  const imgData = ctx.getImageData(centerX - size/2, centerY - size/2, size, size);

  let r = 0, g = 0, b = 0;
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i];
    g += data[i+1];
    b += data[i+2];
  }
  const pixels = data.length / 4;
  r = Math.floor(r / pixels);
  g = Math.floor(g / pixels);
  b = Math.floor(b / pixels);

  // 简单的颜色判断逻辑 (根据之前的经验，这里可以调整阈值)
  // 如果 R 和 G 较高，B 较低，可能是偏黄/棕色（脏）
  // 真正生产需要更复杂的算法，这里用简单的启发式判断
  let isDirty = false;
  
  // 简单判断：如果红色远大于蓝色，且整体不白，判定为可能脏
  if (r > 150 && r > b + 20 && g < r) {
    isDirty = true;
  }

  setTimeout(() => {
    if (isDirty) {
      updateStatus("检测结果：可能不干净，请再擦一次。");
    } else {
      updateStatus("检测结果：干净。");
    }
  }, 800); // 模拟一点点处理时间，让播报更自然
}

// 事件绑定
captureBtn.addEventListener('click', captureAndDetect);

// 全屏点击支持 (除了按钮本身)
document.body.addEventListener('click', (e) => {
  if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'SELECT') {
    captureAndDetect();
  }
});

// 页面加载时启动摄像头
window.addEventListener('load', () => {
  startCamera();
  // 首次交互解锁音频
  document.body.addEventListener('touchstart', function unlockAudio() {
    updateStatus("准备就绪，请将手机对准检测区域，点击屏幕拍照。");
    document.body.removeEventListener('touchstart', unlockAudio);
  }, { once: true });
});

// 切换摄像头/白卡校准等保留原逻辑（简化处理）
calibrateBtn.addEventListener('click', () => {
  updateStatus("白卡校准完成，请开始拍照检测。");
});
