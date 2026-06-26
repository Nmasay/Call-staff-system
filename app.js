/**
 * AIカメラ連動 接客呼び出しシステム (プロトタイプ)
 * コアロジック & UI制御
 */

let db = null;
let messaging = null;
let activeCallsListener = null;

// ローカルフォールバック用のダミーデータ
const localDummyStaff = [
  { id: 1, name: '佐藤さん', status: '出勤中', group: 'A-early', callCount: 0, order: 1 },
  { id: 2, name: '鈴木さん', status: '出勤中', group: 'A-early', callCount: 0, order: 2 },
  { id: 3, name: '高橋さん', status: '出勤中', group: 'A-early', callCount: 0, order: 3 },
  { id: 4, name: '田中さん', status: 'ストップ', group: 'A-early', callCount: 0, order: 4 },
  { id: 5, name: '渡辺さん', status: 'ストップ', group: 'A-early', callCount: 0, order: 5 },
  { id: 6, name: '伊藤さん', status: '出勤中', group: 'A-late', callCount: 0, order: 6 },
  { id: 7, name: '山本さん', status: '出勤中', group: 'A-late', callCount: 0, order: 7 },
  { id: 8, name: '中村さん', status: 'ストップ', group: 'A-late', callCount: 0, order: 8 },
  { id: 9, name: '小林さん', status: '出勤中', group: 'A-late', callCount: 0, order: 9 },
  { id: 10, name: '加藤さん', status: 'ストップ', group: 'A-late', callCount: 0, order: 10 },
  { id: 11, name: '吉田さん', status: '出勤中', group: 'B-early', callCount: 0, order: 11 },
  { id: 12, name: '山田さん', status: '出勤中', group: 'B-early', callCount: 0, order: 12 },
  { id: 13, name: '佐々木さん', status: 'ストップ', group: 'B-early', callCount: 0, order: 13 },
  { id: 14, name: '山口さん', status: '出勤中', group: 'B-early', callCount: 0, order: 14 },
  { id: 15, name: '松本さん', status: 'ストップ', group: 'B-early', callCount: 0, order: 15 },
  { id: 16, name: '井上さん', status: '出勤中', group: 'B-late', callCount: 0, order: 16 },
  { id: 17, name: '木村さん', status: '出勤中', group: 'B-late', callCount: 0, order: 17 },
  { id: 18, name: '林さん', status: 'ストップ', group: 'B-late', callCount: 0, order: 18 },
  { id: 19, name: '斎藤さん', status: '出勤中', group: 'B-late', callCount: 0, order: 19 },
  { id: 20, name: '清水さん', status: 'ストップ', group: 'B-late', callCount: 0, order: 20 }
];

// アプリケーションのグローバル状態
const state = {
  rois: [
    { id: 1, x: 5, y: 35, w: 14, h: 30, active: false, detected: false, brightness: 0, pixelRatio: 0 },
    { id: 2, x: 24, y: 35, w: 14, h: 30, active: false, detected: false, brightness: 0, pixelRatio: 0 },
    { id: 3, x: 43, y: 35, w: 14, h: 30, active: false, detected: false, brightness: 0, pixelRatio: 0 },
    { id: 4, x: 62, y: 35, w: 14, h: 30, active: false, detected: false, brightness: 0, pixelRatio: 0 },
    { id: 5, x: 81, y: 35, w: 14, h: 30, active: false, detected: false, brightness: 0, pixelRatio: 0 }
  ],
  staff: [], // Firestoreから同期
  settings: {
    threshold: 180,
    ratioThreshold: 15, // %
    analysisInterval: 300 // ms
  },
  currentCall: null, // { id(docId), roiId, staffId, timeLeft, intervalId }
  systemActive: false,
  isPaused: false,
  isDummyMode: true,
  analysisIntervalId: null,
  activeUtterance: null, // GC対策のグローバル参照
  lastStaffId: null, // ラウンドロビン（順番）選定用の前回指名ID
  lastCallResolvedTime: 0, // 前回の呼び出し完了時間（ダミークールダウン用）
  activeGroup: 'A-early', // アクティブな呼び出しグループ
  currentStaffId: null // スマホログイン中のスタッフID
};

// --- ダミー映像シミュレーターモジュール ---
let dummyLitRoi = 0;
let dummyLitEndTime = 0;

function shouldSimulateLit(roiId) {
  const now = Date.now();
  if (dummyLitRoi === roiId && now < dummyLitEndTime) {
    return true;
  }
  
  // クールダウン中（呼び出しクリア後10秒以内）または呼び出し発生中は、新しい点灯を発生させない
  const isCooldown = now < state.lastCallResolvedTime + 10000;
  if (state.currentCall || isCooldown || dummyLitRoi !== 0) {
    if (now >= dummyLitEndTime) {
      dummyLitRoi = 0;
    }
    return false;
  }
  
  // 発生確率を下げて、ゆったりしたペース（約15〜30秒に一度）で点灯させる
  if (Math.random() < 0.001) {
    dummyLitRoi = Math.floor(Math.random() * 5) + 1;
    dummyLitEndTime = now + 5000; // 5秒間点灯
  }
  
  return false;
}

function drawDummyStoreVideo() {
  const canvas = document.getElementById('dummy-canvas');
  if (!canvas || !state.isDummyMode) return;
  const ctx = canvas.getContext('2d');
  
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#334155';
  ctx.fillRect(50, 300, 540, 150); // レジ台
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(40, 120, 560, 110); // ランプ設置台
  
  state.rois.forEach(roi => {
    const rx = (roi.x / 100) * canvas.width;
    const ry = (roi.y / 100) * canvas.height;
    const rw = (roi.w / 100) * canvas.width;
    const rh = (roi.h / 100) * canvas.height;
    
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(rx, ry, rw, rh);
    
    const isLit = shouldSimulateLit(roi.id);
    ctx.fillStyle = isLit ? '#f59e0b' : '#334155';
    ctx.beginPath();
    ctx.arc(rx + rw/2, ry + rh/2, Math.min(rw, rh)/3, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = isLit ? '#000' : '#9ca3af';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(roi.id, rx + rw/2, ry + rh/2);
  });
  
  requestAnimationFrame(drawDummyStoreVideo);
}

// --- カメラ制御モジュール ---
async function initCamera() {
  const video = document.getElementById('webcam');
  const dummyCanvas = document.getElementById('dummy-canvas');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480 }
    });
    video.srcObject = stream;
    video.classList.remove('hidden');
    dummyCanvas.classList.add('hidden');
    state.isDummyMode = false;
  } catch (err) {
    console.error('Camera init failed, fallback to dummy:', err);
    alert('カメラ起動に失敗しました。シミュレーションモードで動作します。');
    document.getElementById('chk-dummy-video').checked = true;
    switchToDummyMode();
  }
}

function switchToDummyMode() {
  state.isDummyMode = true;
  document.getElementById('webcam').classList.add('hidden');
  document.getElementById('dummy-canvas').classList.remove('hidden');
  stopCameraStream();
  drawDummyStoreVideo();
}

function stopCameraStream() {
  const video = document.getElementById('webcam');
  if (video.srcObject) {
    video.srcObject.getTracks().forEach(track => track.stop());
    video.srcObject = null;
  }
}

// --- ROI操作モジュール ---
function renderROIs() {
  const container = document.getElementById('roi-container');
  container.innerHTML = '';
  state.rois.forEach(roi => {
    const box = document.createElement('div');
    box.className = `roi-box ${roi.detected ? 'detected' : ''}`;
    box.style.left = `${roi.x}%`;
    box.style.top = `${roi.y}%`;
    box.style.width = `${roi.w}%`;
    box.style.height = `${roi.h}%`;
    box.dataset.id = roi.id;
    
    const badge = document.createElement('span');
    badge.className = 'roi-badge';
    badge.innerText = roi.id;
    box.appendChild(badge);
    
    const handle = document.createElement('div');
    handle.className = 'resize-handle';
    box.appendChild(handle);
    
    setupRoiInteractions(box, roi);
    container.appendChild(box);
  });
}

function setupRoiInteractions(box, roi) {
  box.addEventListener('pointerdown', (e) => {
    const isResize = e.target.classList.contains('resize-handle');
    e.preventDefault();
    box.classList.add('active-drag');
    box.setPointerCapture(e.pointerId);
    
    const wrapper = box.parentElement;
    const startX = e.clientX;
    const startY = e.clientY;
    const startLeft = parseFloat(box.style.left);
    const startTop = parseFloat(box.style.top);
    const startWidth = parseFloat(box.style.width);
    const startHeight = parseFloat(box.style.height);
    
    const onPointerMove = (moveEvt) => {
      const deltaX = ((moveEvt.clientX - startX) / wrapper.clientWidth) * 100;
      const deltaY = ((moveEvt.clientY - startY) / wrapper.clientHeight) * 100;
      
      if (isResize) {
        roi.w = Math.max(5, Math.min(startWidth + deltaX, 100 - roi.x));
        roi.h = Math.max(5, Math.min(startHeight + deltaY, 100 - roi.y));
        box.style.width = `${roi.w}%`;
        box.style.height = `${roi.h}%`;
      } else {
        roi.x = Math.max(0, Math.min(startLeft + deltaX, 100 - roi.w));
        roi.y = Math.max(0, Math.min(startTop + deltaY, 100 - roi.h));
        box.style.left = `${roi.x}%`;
        box.style.top = `${roi.y}%`;
      }
      updateRoiStatusDisplay(roi.id);
    };
    
    const onPointerUp = (upEvt) => {
      box.classList.remove('active-drag');
      box.releasePointerCapture(upEvt.pointerId);
      box.removeEventListener('pointermove', onPointerMove);
      box.removeEventListener('pointerup', onPointerUp);
    };
    
    box.addEventListener('pointermove', onPointerMove);
    box.addEventListener('pointerup', onPointerUp);
  });
}

// --- 画像解析モジュール ---
function startAnalysis() {
  state.analysisIntervalId = setInterval(analyzeFrame, state.settings.analysisInterval);
}

function analyzeFrame() {
  if (!state.systemActive || state.isPaused) return;
  const canvas = document.getElementById('analysis-canvas');
  const ctx = canvas.getContext('2d');
  const source = state.isDummyMode ? document.getElementById('dummy-canvas') : document.getElementById('webcam');
  
  if (!source) return;
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  
  state.rois.forEach(roi => {
    const rx = Math.floor((roi.x / 100) * canvas.width);
    const ry = Math.floor((roi.y / 100) * canvas.height);
    const rw = Math.floor((roi.w / 100) * canvas.width);
    const rh = Math.floor((roi.h / 100) * canvas.height);
    
    if (rw <= 0 || rh <= 0) return;
    const imgData = ctx.getImageData(rx, ry, rw, rh);
    analyzeRoiPixels(roi, imgData);
  });
}

function analyzeRoiPixels(roi, imgData) {
  const data = imgData.data;
  let brightPixels = 0;
  let totalLuminance = 0;
  const pixelCount = data.length / 4;
  
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i+1];
    const b = data[i+2];
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    totalLuminance += y;
    if (y >= state.settings.threshold) {
      brightPixels++;
    }
  }
  
  roi.brightness = Math.round(totalLuminance / pixelCount);
  roi.pixelRatio = Math.round((brightPixels / pixelCount) * 100);
  
  const isLit = roi.pixelRatio >= state.settings.ratioThreshold;
  checkRoiTransition(roi, isLit);
  updateRoiStatusDisplay(roi.id);
}

function checkRoiTransition(roi, isLit) {
  if (isLit && !roi.detected) {
    roi.detected = true;
    handleRoiTriggered(roi.id);
  } else if (!isLit && roi.detected) {
    roi.detected = false;
    const box = document.querySelector(`.roi-box[data-id="${roi.id}"]`);
    if (box) box.classList.remove('detected');
  }
}

// --- 音声合成 & スタッフ選定モジュール ---
// 電子チャイム音（ピンポン）の再生関数
function playChime() {
  if (!window.AudioContext && !window.webkitAudioContext) return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();
    
    // 1音目: ミ (659.25Hz)
    playTone(ctx, 659.25, 0, 0.4);
    // 2音目: ド (523.25Hz)
    playTone(ctx, 523.25, 0.3, 0.4);
  } catch (e) {
    console.error('Chime playback error:', e);
  }
}

function playTone(ctx, freq, startTime, duration) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  
  osc.type = 'sine';
  osc.frequency.value = freq;
  
  gain.gain.setValueAtTime(0, ctx.currentTime + startTime);
  gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + startTime + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + startTime + duration);
  
  osc.connect(gain);
  gain.connect(ctx.destination);
  
  osc.start(ctx.currentTime + startTime);
  osc.stop(ctx.currentTime + startTime + duration);
}

// 音声合成関数 (ブラウザの沈黙バグ対策を含む遅延再生ハック、男性声優先フラグ対応)
function speak(text, preferMale = false) {
  if (!window.speechSynthesis) return;
  
  try {
    window.speechSynthesis.cancel();
  } catch (e) {
    console.error('SpeechSynthesis cancel error:', e);
  }
  
  // cancelの内部処理完了を待つために100ms遅延させる（Chrome等の沈黙バグ対策）
  setTimeout(() => {
    try {
      window.speechSynthesis.resume(); // 一時停止状態の強制解除
      
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ja-JP';
      utterance.rate = 0.85; // 落ち着いて聞き取りやすいように、速度を少しゆっくり（標準1.0）に変更
      
      const voices = window.speechSynthesis.getVoices();
      const jaVoices = voices.filter(v => v.lang === 'ja-JP' || v.lang.startsWith('ja'));
      
      let selectedVoice = null;
      if (preferMale && jaVoices.length > 0) {
        // デバイスの日本語音声の中から男性と思われる名前（Otoya, Ichiro, maleなど）を検索
        selectedVoice = jaVoices.find(v => 
          v.name.includes('Otoya') || 
          v.name.includes('Ichiro') || 
          v.name.includes('male') || 
          v.name.includes('男性')
        );
      }
      
      // 男性音声が見つからない、または優先しない場合はデフォルトの日本語音声
      if (!selectedVoice) {
        selectedVoice = jaVoices.find(v => v.lang === 'ja-JP' || v.lang.startsWith('ja'));
      }
      
      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }
      
      state.activeUtterance = utterance;
      
      utterance.onerror = (e) => {
        console.error('SpeechSynthesis error:', e);
      };
      
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.error('SpeechSynthesis speak error:', err);
    }
  }, 100);
}

function selectBestStaff() {
  const groupStaff = state.staff.filter(s => s.group === state.activeGroup);
  const total = groupStaff.length;
  if (total === 0) return null;
  
  let startIndex = 0;
  if (state.lastStaffId !== null) {
    const lastIndex = groupStaff.findIndex(s => s.id === state.lastStaffId);
    if (lastIndex !== -1) {
      startIndex = (lastIndex + 1) % total;
    }
  }
  
  for (let i = 0; i < total; i++) {
    const s = groupStaff[(startIndex + i) % total];
    if (s.status === '出勤中') {
      state.lastStaffId = s.id;
      return s;
    }
  }
  return null;
}

// --- 呼び出し・シミュレータ制御モジュール ---
function handleRoiTriggered(roiId) {
  if (state.currentCall) return;
  
  const box = document.querySelector(`.roi-box[data-id="${roiId}"]`);
  if (box) box.classList.add('detected');
  
  const staff = selectBestStaff(roiId);
  if (!staff) {
    speak('呼び出しが発生しましたが、対応可能なスタッフがいません。');
    return;
  }
  triggerCallForStaff(roiId, staff);
}

function triggerCallForStaff(roiId, staff) {
  if (db) {
    db.collection('calls').add({
      roiId: roiId,
      staffId: String(staff.id),
      staffName: staff.name,
      active: true,
      status: 'pending',
      timeLeft: 30,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    }).then(docRef => {
      state.currentCall = { id: docRef.id, roiId: roiId, staffId: staff.id, timeLeft: 30, intervalId: null };
      monitorCurrentCallDoc(docRef.id);
      playChime();
      speakCallAnnouncement(staff.name, roiId);
      startCallCountdown();
    }).catch(err => console.error('Failed to trigger call in Firestore:', err));
  } else {
    triggerCallForStaffLocal(roiId, staff);
  }
}

function triggerCallForStaffLocal(roiId, staff) {
  state.currentCall = { roiId: roiId, staffId: staff.id, timeLeft: 30, intervalId: null };
  playChime();
  speakCallAnnouncement(staff.name, roiId);
  showIncomingCallUI(roiId, staff.name);
  document.getElementById('phone-mock-device').classList.add('vibrate');
  startCallCountdown();
}

function speakCallAnnouncement(staffName, roiId) {
  const rawName = staffName.endsWith('さん') ? staffName.slice(0, -2) : staffName;
  const msg = `業務連絡です。 ${rawName} さん、 ${roiId}番 売り場の、 接客対応を、 お願いします。`;
  speak(`${msg} ${msg}`);
}

function startCallCountdown() {
  const call = state.currentCall;
  const fill = document.getElementById('pb-timeout');
  const text = document.getElementById('lbl-timeout-sec');
  
  if (call.timeLeft === undefined) {
    call.timeLeft = 30;
  }
  fill.style.width = `${(call.timeLeft / 30) * 100}%`;
  text.innerText = call.timeLeft;
  
  if (call.intervalId) clearInterval(call.intervalId);

  call.intervalId = setInterval(() => {
    if (state.isPaused) return;
    call.timeLeft--;
    text.innerText = call.timeLeft;
    fill.style.width = `${(call.timeLeft / 30) * 100}%`;
    if (call.timeLeft <= 0) {
      declineCurrentCall();
    }
  }, 1000);
}

let currentCallDocListener = null;

function monitorCurrentCallDoc(docId) {
  if (currentCallDocListener) currentCallDocListener();
  currentCallDocListener = db.collection('calls').doc(docId)
    .onSnapshot(doc => {
      if (!doc.exists) return;
      const data = doc.data();
      if (!data.active) {
        if (currentCallDocListener) currentCallDocListener();
        return;
      }
      handleCallDocumentChange(data, docId);
    }, err => console.error('Call monitoring failed:', err));
}

function handleCallDocumentChange(data, docId) {
  if (data.status === 'accepted') {
    if (currentCallDocListener) currentCallDocListener();
    const displayName = data.staffName.endsWith('さん') ? data.staffName : `${data.staffName}さん`;
    speak(`了解しました。${displayName}が対応します。`, true);
    db.collection('calls').doc(docId).update({ active: false, status: 'resolved' })
      .then(() => {
        incrementCallCount(data.staffId);
        resetCallState();
      })
      .catch(err => console.error('Failed to resolve call doc:', err));
  } else if (data.status === 'declined') {
    if (currentCallDocListener) currentCallDocListener();
    db.collection('calls').doc(docId).update({ active: false })
      .then(() => declineCurrentCall())
      .catch(err => console.error('Failed to deactivate declined call doc:', err));
  }
}

function incrementCallCount(staffId) {
  db.collection('staff').doc(String(staffId)).get()
    .then(doc => {
      if (doc.exists) {
        const newCount = (doc.data().callCount || 0) + 1;
        db.collection('staff').doc(String(staffId)).update({ callCount: newCount });
      }
    })
    .catch(err => console.error('Failed to increment callCount:', err));
}

function acceptCurrentCall() {
  if (!state.currentCall) return;
  clearInterval(state.currentCall.intervalId);
  if (db && state.currentCall.id && state.currentStaffId) {
    db.collection('calls').doc(state.currentCall.id).update({ status: 'accepted' })
      .catch(err => console.error('Failed to accept call:', err));
    resetCallState();
  } else {
    acceptCurrentCallLocal();
  }
}

function acceptCurrentCallLocal() {
  const staff = state.staff.find(s => s.id === state.currentCall.staffId);
  if (staff) {
    staff.callCount++;
    renderStaffList();
    const displayName = staff.name.endsWith('さん') ? staff.name : `${staff.name}さん`;
    speak(`了解しました。${displayName}が対応します。`, true);
  }
  resetCallState();
}

function declineCurrentCall() {
  if (!state.currentCall) return;
  clearInterval(state.currentCall.intervalId);
  if (db && state.currentCall.id) {
    if (state.currentStaffId) {
      db.collection('calls').doc(state.currentCall.id).update({ status: 'declined' })
        .catch(err => console.error('Failed to decline call:', err));
      resetCallState();
    } else {
      db.collection('calls').doc(state.currentCall.id).update({ active: false, status: 'timeout' })
        .then(() => declineCurrentCallLocal())
        .catch(err => {
          console.error('Failed to deactivate timeout call:', err);
          declineCurrentCallLocal();
        });
    }
  } else {
    declineCurrentCallLocal();
  }
}

function declineCurrentCallLocal() {
  const prevRoiId = state.currentCall.roiId;
  const nextStaff = selectBestStaff();
  if (nextStaff) {
    triggerCallForStaff(prevRoiId, nextStaff);
  } else {
    const msg = `業務連絡です。 対応可能なスタッフが、 見つかりません。 ${prevRoiId}番 売り場の、 応援対応を、 お願いします。`;
    speak(`${msg} ${msg}`);
    resetCallState();
  }
}

function resetCallState() {
  if (state.currentCall && state.currentCall.intervalId) {
    clearInterval(state.currentCall.intervalId);
  }
  if (currentCallDocListener) {
    currentCallDocListener();
    currentCallDocListener = null;
  }
  state.currentCall = null;
  state.lastCallResolvedTime = Date.now();
  resetPhoneToIdle();
}

// --- UI連動モジュール ---
function showIncomingCallUI(roiId, staffName) {
  document.getElementById('lbl-alert-roi').innerText = `${roiId}番売場`;
  document.getElementById('lbl-alert-staff').innerText = staffName;
  document.getElementById('screen-idle').classList.remove('active');
  document.getElementById('screen-incoming').classList.add('active');
}

function resetPhoneToIdle() {
  document.getElementById('phone-mock-device').classList.remove('vibrate');
  document.getElementById('screen-incoming').classList.remove('active');
  document.getElementById('screen-idle').classList.add('active');
}

function updateRoiStatusDisplay(roiId) {
  const roi = state.rois.find(r => r.id === roiId);
  if (!roi) return;
  
  const card = document.getElementById(`roi-card-${roi.id}`);
  if (!card) return;
  
  if (roi.pixelRatio >= state.settings.ratioThreshold) {
    card.classList.add('detected');
  } else {
    card.classList.remove('detected');
  }
  card.querySelector('.roi-val').innerText = `${roi.pixelRatio}% (${roi.brightness})`;
  card.querySelector('.roi-state-lbl').innerText = roi.pixelRatio >= state.settings.ratioThreshold ? '点灯 (ON)' : '消灯 (OFF)';
}

function initRoiStatusCards() {
  const grid = document.getElementById('roi-status-container');
  grid.innerHTML = '';
  state.rois.forEach(roi => {
    const card = document.createElement('div');
    card.className = 'roi-status-card';
    card.id = `roi-card-${roi.id}`;
    card.innerHTML = `
      <h4>ROI ${roi.id}</h4>
      <div class="roi-val">0% (0)</div>
      <span class="roi-state-lbl">消灯 (OFF)</span>
    `;
    grid.appendChild(card);
  });
}

let dragSourceEl = null;

function renderStaffList() {
  renderStaffGroup('A-early');
  renderStaffGroup('A-late');
  renderStaffGroup('B-early');
  renderStaffGroup('B-late');
  
  ['A-early', 'A-late', 'B-early', 'B-late'].forEach(group => {
    const wrapper = document.getElementById(`wrapper-${group}`);
    if (wrapper) {
      wrapper.classList.toggle('inactive', state.activeGroup !== group);
    }
  });
}

function renderStaffGroup(group) {
  const tbody = document.getElementById(`staff-list-body-${group}`);
  if (!tbody) return;
  tbody.innerHTML = '';
  
  const groupStaff = state.staff.filter(s => s.group === group);
  groupStaff.forEach(s => {
    const tr = document.createElement('tr');
    tr.setAttribute('data-id', s.id);
    if (s.status === 'ストップ') {
      tr.classList.add('status-stopped');
    }
    tr.innerHTML = `
      <td><div class="drag-handle">☰</div></td>
      <td>${s.name}</td>
      <td>
        <select class="table-select select-status" data-id="${s.id}">
          <option value="出勤中" ${s.status === '出勤中' ? 'selected' : ''}>出勤中</option>
          <option value="ストップ" ${s.status === 'ストップ' ? 'selected' : ''}>ストップ</option>
        </select>
      </td>
      <td>${s.callCount}</td>
      <td>
        <button class="btn btn-sm btn-secondary btn-delete-staff" data-id="${s.id}">削除</button>
      </td>
    `;
    setupStaffRowEvents(tr, s);
    setupStaffRowDragAndDrop(tr, s);
    tbody.appendChild(tr);
  });
}

function setupStaffRowEvents(tr, staffMember) {
  tr.querySelector('.select-status').addEventListener('change', (e) => {
    const newStatus = e.target.value;
    if (db) {
      db.collection('staff').doc(String(staffMember.id)).update({ status: newStatus })
        .catch(err => console.error('Failed to update status:', err));
    } else {
      staffMember.status = newStatus;
      tr.classList.toggle('status-stopped', newStatus === 'ストップ');
    }
  });
  tr.querySelector('.btn-delete-staff').addEventListener('click', () => {
    if (db) {
      db.collection('staff').doc(String(staffMember.id)).delete()
        .catch(err => console.error('Failed to delete staff:', err));
    } else {
      state.staff = state.staff.filter(s => s.id !== staffMember.id);
      renderStaffList();
    }
  });
}

function initTableBodyDragAndDrop() {
  const tbodies = document.querySelectorAll('.staff-tbody');
  tbodies.forEach(tbody => {
    tbody.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      tbody.classList.add('drag-over');
    });
    tbody.addEventListener('dragleave', () => tbody.classList.remove('drag-over'));
    tbody.addEventListener('drop', (e) => {
      e.preventDefault();
      tbody.classList.remove('drag-over');
      if (dragSourceEl && dragSourceEl.parentNode !== tbody) {
        tbody.appendChild(dragSourceEl);
        updateStaffOrderFromDOM();
        renderStaffList();
      }
    });
  });
}

function setupStaffRowDragAndDrop(tr, staffMember) {
  tr.setAttribute('draggable', 'true');
  tr.addEventListener('dragstart', (e) => {
    dragSourceEl = tr;
    tr.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', staffMember.id);
  });
  tr.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const targetTr = e.target.closest('tr');
    if (targetTr && targetTr !== dragSourceEl && targetTr.parentNode === dragSourceEl.parentNode) {
      const rect = targetTr.getBoundingClientRect();
      const next = (e.clientY - rect.top) / (rect.bottom - rect.top) > 0.5;
      targetTr.parentNode.insertBefore(dragSourceEl, next ? targetTr.nextSibling : targetTr);
    }
  });
  tr.addEventListener('dragend', () => {
    tr.classList.remove('dragging');
    updateStaffOrderFromDOM();
    renderStaffList();
  });
}

function updateStaffOrderFromDOM() {
  const updates = [];
  let index = 1;
  ['A-early', 'A-late', 'B-early', 'B-late'].forEach(group => {
    const rows = document.querySelectorAll(`#staff-list-body-${group} tr`);
    rows.forEach(row => {
      const idStr = row.getAttribute('data-id');
      updates.push({ id: idStr, group: group, order: index++ });
    });
  });
  if (db) {
    const batch = db.batch();
    updates.forEach(up => {
      const ref = db.collection('staff').doc(up.id);
      batch.update(ref, { group: up.group, order: up.order });
    });
    batch.commit().catch(err => console.error('Batch order update failed:', err));
  } else {
    applyLocalOrderUpdates(updates);
  }
}

function applyLocalOrderUpdates(updates) {
  const newStaffList = [];
  updates.forEach(up => {
    const s = state.staff.find(x => x.id == up.id);
    if (s) {
      s.group = up.group;
      s.order = up.order;
      newStaffList.push(s);
    }
  });
  state.staff = newStaffList;
}

// --- ダイアログ・設定 UI モジュール ---
function openAddStaffModal() {
  document.getElementById('modal-add-staff').classList.remove('hidden');
}

function closeAddStaffModal() {
  document.getElementById('modal-add-staff').classList.add('hidden');
}

function initGroupSwitcher() {
  const switcher = document.getElementById('group-switcher');
  if (!switcher) return;
  
  switcher.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-toggle');
    if (!btn || btn.classList.contains('active')) return;
    
    switcher.querySelectorAll('.btn-toggle').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    state.activeGroup = btn.dataset.group;
    state.lastStaffId = null;
    
    resetCallState();
    renderStaffList();
  });
}

function saveNewStaff() {
  const nameInput = document.getElementById('input-staff-name');
  const statusSelect = document.getElementById('select-staff-status');
  const groupSelect = document.getElementById('select-staff-group');
  const name = nameInput.value.trim();
  if (!name) {
    alert('名前を入力してください');
    return;
  }
  const nextOrder = state.staff.length > 0 ? Math.max(...state.staff.map(s => s.order || 0)) + 1 : 1;
  const newStaff = {
    name: name,
    status: statusSelect.value,
    group: groupSelect.value,
    callCount: 0,
    order: nextOrder
  };
  if (db) {
    db.collection('staff').add(newStaff)
      .then(() => {
        nameInput.value = '';
        closeAddStaffModal();
      })
      .catch(err => alert('スタッフの追加に失敗しました: ' + err.message));
  } else {
    const newId = state.staff.length > 0 ? Math.max(...state.staff.map(s => s.id)) + 1 : 1;
    state.staff.push({ id: newId, ...newStaff });
    nameInput.value = '';
    renderStaffList();
    closeAddStaffModal();
  }
}

function startSystem() {
  const btn = document.getElementById('btn-start-system');
  const pauseBtn = document.getElementById('btn-pause-system');
  const statusDot = document.getElementById('system-status-dot');
  
  if (state.systemActive) {
    state.systemActive = false;
    state.isPaused = false;
    if (pauseBtn) pauseBtn.classList.add('hidden');
    btn.innerHTML = `<svg class="icon" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> システム開始`;
    btn.className = 'btn btn-primary';
    statusDot.className = 'pulse-dot idle';
    
    // 解析ループのクリア
    clearInterval(state.analysisIntervalId);
    state.analysisIntervalId = null;
    
    // 進行中の呼び出しタイマー、振動、スマホ画面などを強制クリア
    if (state.currentCall && state.currentCall.intervalId) {
      clearInterval(state.currentCall.intervalId);
    }
    resetCallState();
    
    // 再生中の音声を強制停止
    if (window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch (e) {
        console.error('SpeechSynthesis cancel error during stop:', e);
      }
    }
    
    // ROI枠の検知表示をすべてクリア
    state.rois.forEach(roi => {
      roi.detected = false;
      updateRoiStatusDisplay(roi.id);
    });
  } else {
    state.systemActive = true;
    state.isPaused = false;
    if (pauseBtn) {
      pauseBtn.classList.remove('hidden');
      pauseBtn.innerHTML = '<span style="font-size:1.1rem; line-height:1;">⏸</span> 一時停止';
      pauseBtn.className = 'btn btn-secondary';
    }
    btn.innerHTML = `<svg class="icon" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg> システム停止`;
    btn.className = 'btn btn-secondary';
    statusDot.className = 'pulse-dot running';
    speak('システムを開始しました。');
    startAnalysis();
  }
}

function togglePauseSystem() {
  if (!state.systemActive) return;
  state.isPaused = !state.isPaused;
  const btn = document.getElementById('btn-pause-system');
  if (!btn) return;
  
  if (state.isPaused) {
    btn.innerHTML = '<span style="font-size:1.1rem; line-height:1;">▶️</span> 再開する';
    btn.className = 'btn btn-primary';
  } else {
    btn.innerHTML = '<span style="font-size:1.1rem; line-height:1;">⏸</span> 一時停止';
    btn.className = 'btn btn-secondary';
  }
}

function initSliders() {
  const rangeThreshold = document.getElementById('range-threshold');
  const rangeRatio = document.getElementById('range-ratio');
  const valThreshold = document.getElementById('val-threshold');
  const valRatio = document.getElementById('val-ratio');
  
  rangeThreshold.addEventListener('input', (e) => {
    state.settings.threshold = parseInt(e.target.value);
    valThreshold.innerText = state.settings.threshold;
  });
  
  rangeRatio.addEventListener('input', (e) => {
    state.settings.ratioThreshold = parseInt(e.target.value);
    valRatio.innerText = `${state.settings.ratioThreshold}%`;
  });
}

function initVideoToggle() {
  const toggle = document.getElementById('chk-dummy-video');
  const badge = document.getElementById('system-mode-badge');
  
  toggle.addEventListener('change', (e) => {
    state.isDummyMode = e.target.checked;
    badge.innerText = state.isDummyMode ? 'シミュレーション' : 'ライブカメラ';
    if (state.isDummyMode) {
      switchToDummyMode();
    } else {
      initCamera();
    }
  });
}

// Firebase非同期初期化
async function initFirebase() {
  try {
    const res = await fetch('firebase-config.json');
    const config = await res.json();
    if (typeof firebase !== 'undefined') {
      firebase.initializeApp(config);
      db = firebase.firestore();
      state.vapidKey = config.vapidKey;
      await initServiceWorker();
      initFirestoreListeners();
    } else {
      setupLocalFallback();
    }
  } catch (err) {
    console.warn('Firebase initialization failed, fallback to local data:', err);
    setupLocalFallback();
  }
}

// Service Worker & Messagingの初期化
async function initServiceWorker() {
  if ('serviceWorker' in navigator && typeof firebase.messaging !== 'undefined') {
    try {
      const reg = await navigator.serviceWorker.register('firebase-messaging-sw.js');
      messaging = firebase.messaging();
      messaging.useServiceWorker(reg);
    } catch (swErr) {
      console.warn('FCM ServiceWorker registration failed:', swErr);
    }
  }
}

// Firestoreのリアルタイム監視
function initFirestoreListeners() {
  if (!db) return;
  db.collection('staff').orderBy('order').onSnapshot(snapshot => {
    state.staff = [];
    snapshot.forEach(doc => {
      state.staff.push({ id: doc.id, ...doc.data() });
    });
    renderStaffList();
    buildLoginStaffDropdown();
  }, err => {
    console.error('Firestore staff snapshot error:', err);
    setupLocalFallback();
  });
}

// ローカルフォールバック（オフライン動作）
function setupLocalFallback() {
  state.staff = JSON.parse(JSON.stringify(localDummyStaff));
  renderStaffList();
  buildLoginStaffDropdown();
}

// --- 初期化 ---
document.addEventListener('DOMContentLoaded', () => {
  initRoiStatusCards();
  renderROIs();
  initSliders();
  initVideoToggle();
  initGroupSwitcher();
  initTableBodyDragAndDrop();
  initFirebase();
  initStaffMode();
  drawDummyStoreVideo();
  
  // 音声リストの初期ロードを促す（ウォームアップ）
  if (window.speechSynthesis) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.getVoices();
    };
  }
  
  document.getElementById('btn-start-system').addEventListener('click', startSystem);
  document.getElementById('btn-pause-system').addEventListener('click', togglePauseSystem);
  document.getElementById('btn-add-staff').addEventListener('click', openAddStaffModal);
  document.getElementById('btn-close-modal').addEventListener('click', closeAddStaffModal);
  document.getElementById('btn-cancel-staff').addEventListener('click', closeAddStaffModal);
  document.getElementById('btn-save-staff').addEventListener('click', saveNewStaff);
  document.getElementById('btn-accept').addEventListener('click', acceptCurrentCall);
  document.getElementById('btn-decline').addEventListener('click', declineCurrentCall);
});

// --- スタッフログイン（mode=staff）モジュール ---
function initStaffMode() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('mode') !== 'staff') return;
  
  document.body.classList.add('mode-staff');
  const loginView = document.getElementById('staff-login-view');
  if (loginView) loginView.classList.remove('hidden');
  
  buildLoginStaffDropdown();
  document.getElementById('btn-staff-login').addEventListener('click', handleStaffLogin);
}

function buildLoginStaffDropdown() {
  const select = document.getElementById('select-login-staff');
  if (!select) return;
  select.innerHTML = '';
  state.staff.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.innerText = s.name;
    select.appendChild(opt);
  });
}

function handleStaffLogin() {
  const select = document.getElementById('select-login-staff');
  const groupSelect = document.getElementById('select-login-group');
  const idStr = select.value;
  state.currentStaffId = idStr;

  const staffName = select.options[select.selectedIndex].text;
  const userBar = document.getElementById('phone-user-bar');
  const userLbl = document.getElementById('lbl-logged-in-user');
  if (userBar && userLbl) {
    userLbl.textContent = '👤 ' + staffName;
    userBar.style.display = 'block';
  }

  if (db) {
    db.collection('staff').doc(idStr).update({
      status: '出勤中',
      group: groupSelect.value
    }).then(() => {
      requestFCMToken(idStr);
      startStaffCallListener(idStr);
    }).catch(err => console.error('Login update failed:', err));
  } else {
    handleLocalStaffLogin(idStr, groupSelect.value);
  }
  document.getElementById('staff-login-view').classList.add('hidden');
}

function handleLocalStaffLogin(idStr, groupVal) {
  const s = state.staff.find(x => x.id == idStr);
  if (s) {
    s.status = '出勤中';
    s.group = groupVal;
    state.lastStaffId = null;
  }
  renderStaffList();
}

function requestFCMToken(staffId) {
  if (!messaging || !state.vapidKey) return;
  Notification.requestPermission()
    .then(permission => {
      if (permission === 'granted') {
        return messaging.getToken({ vapidKey: state.vapidKey });
      }
    })
    .then(token => {
      if (token) {
        db.collection('staff').doc(String(staffId)).update({ fcmToken: token });
      }
    })
    .catch(err => console.warn('FCM token request failed:', err));
}

function startStaffCallListener(staffId) {
  if (!db) return;
  if (activeCallsListener) activeCallsListener();
  const loginTimeMillis = Date.now();
  activeCallsListener = db.collection('calls')
    .where('active', '==', true)
    .where('staffId', '==', String(staffId))
    .onSnapshot(snapshot => {
      const validDocs = snapshot.docs.filter(doc => {
        const data = doc.data();
        const ts = data.timestamp ? data.timestamp.toDate().getTime() : Date.now();
        return ts >= (loginTimeMillis - 5000) && data.status === 'pending';
      });
      if (validDocs.length === 0) {
        resetPhoneToIdle();
        if (state.currentCall) {
          clearInterval(state.currentCall.intervalId);
          state.currentCall = null;
        }
      } else {
        handleIncomingCallSnapshot(validDocs[0], staffId);
      }
    }, err => console.error('Calls listener error:', err));
}

function handleIncomingCallSnapshot(doc, staffId) {
  const callData = doc.data();
  // 既存の呼び出しが継続している場合は、UIやタイマーをリセットしない
  if (state.currentCall && state.currentCall.id === doc.id) {
    return;
  }
  if (state.currentCall && state.currentCall.intervalId) {
    clearInterval(state.currentCall.intervalId);
  }
  state.currentCall = {
    id: doc.id,
    roiId: callData.roiId,
    staffId: staffId,
    timeLeft: callData.timeLeft || 30,
    intervalId: null
  };

  // --- 通知・アテンション処理の追加 ---
  playChime(); // ピンポン音の再生（※事前に画面タップが必要）
  if (navigator.vibrate) {
    navigator.vibrate([200, 100, 200, 100, 200]); // スマホ実機のバイブ（Android用）
  }
  document.getElementById('phone-mock-device').classList.add('vibrate'); // 画面要素の振動エフェクト
  
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("🚨 接客呼び出し", {
      body: `${callData.roiId}番売場にお客様がお待ちです。`
    });
  }
  // ------------------------------------

  showIncomingCallUI(callData.roiId, 'あなた');
  startCallCountdown();
}
