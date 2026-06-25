/**
 * AIカメラ連動 接客呼び出しシステム (プロトタイプ)
 * コアロジック & UI制御
 */

// アプリケーションのグローバル状態
const state = {
  rois: [
    { id: 1, x: 5, y: 35, w: 14, h: 30, active: false, detected: false, brightness: 0, pixelRatio: 0 },
    { id: 2, x: 24, y: 35, w: 14, h: 30, active: false, detected: false, brightness: 0, pixelRatio: 0 },
    { id: 3, x: 43, y: 35, w: 14, h: 30, active: false, detected: false, brightness: 0, pixelRatio: 0 },
    { id: 4, x: 62, y: 35, w: 14, h: 30, active: false, detected: false, brightness: 0, pixelRatio: 0 },
    { id: 5, x: 81, y: 35, w: 14, h: 30, active: false, detected: false, brightness: 0, pixelRatio: 0 }
  ],
  staff: [
    // Aグループ・早番
    { id: 1, name: '佐藤さん', status: '出勤中', group: 'A-early', callCount: 0 },
    { id: 2, name: '鈴木さん', status: '出勤中', group: 'A-early', callCount: 0 },
    { id: 3, name: '高橋さん', status: '出勤中', group: 'A-early', callCount: 0 },
    { id: 4, name: '田中さん', status: 'ストップ', group: 'A-early', callCount: 0 },
    { id: 5, name: '渡辺さん', status: 'ストップ', group: 'A-early', callCount: 0 },
    // Aグループ・遅番
    { id: 6, name: '伊藤さん', status: '出勤中', group: 'A-late', callCount: 0 },
    { id: 7, name: '山本さん', status: '出勤中', group: 'A-late', callCount: 0 },
    { id: 8, name: '中村さん', status: 'ストップ', group: 'A-late', callCount: 0 },
    { id: 9, name: '小林さん', status: '出勤中', group: 'A-late', callCount: 0 },
    { id: 10, name: '加藤さん', status: 'ストップ', group: 'A-late', callCount: 0 },
    // Bグループ・早番
    { id: 11, name: '吉田さん', status: '出勤中', group: 'B-early', callCount: 0 },
    { id: 12, name: '山田さん', status: '出勤中', group: 'B-early', callCount: 0 },
    { id: 13, name: '佐々木さん', status: 'ストップ', group: 'B-early', callCount: 0 },
    { id: 14, name: '山口さん', status: '出勤中', group: 'B-early', callCount: 0 },
    { id: 15, name: '松本さん', status: 'ストップ', group: 'B-early', callCount: 0 },
    // Bグループ・遅番
    { id: 16, name: '井上さん', status: '出勤中', group: 'B-late', callCount: 0 },
    { id: 17, name: '木村さん', status: '出勤中', group: 'B-late', callCount: 0 },
    { id: 18, name: '林さん', status: 'ストップ', group: 'B-late', callCount: 0 },
    { id: 19, name: '斎藤さん', status: '出勤中', group: 'B-late', callCount: 0 },
    { id: 20, name: '清水さん', status: 'ストップ', group: 'B-late', callCount: 0 }
  ],
  settings: {
    threshold: 180,
    ratioThreshold: 15, // %
    analysisInterval: 300 // ms
  },
  currentCall: null, // { roiId, staffId, timeoutId, timeLeft, intervalId }
  systemActive: false,
  isDummyMode: true,
  analysisIntervalId: null,
  activeUtterance: null, // GC対策のグローバル参照
  lastStaffId: null, // ラウンドロビン（順番）選定用の前回指名ID
  lastCallResolvedTime: 0, // 前回の呼び出し完了時間（ダミークールダウン用）
  activeGroup: 'A-early' // アクティブな呼び出しグループ
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
  if (!state.systemActive) return;
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
  state.currentCall = {
    roiId: roiId,
    staffId: staff.id,
    timeLeft: 30,
    intervalId: null
  };
  
  // 音声の前に電子チャイム音を再生
  playChime();
  
  const rawName = staff.name.endsWith('さん') ? staff.name.slice(0, -2) : staff.name;
  const msg = `業務連絡です。 ${rawName} さん、 ${roiId}番 売り場の、 接客対応を、 お願いします。`;
  speak(`${msg} ${msg}`);
  showIncomingCallUI(roiId, staff.name);
  
  const phone = document.getElementById('phone-mock-device');
  phone.classList.add('vibrate');
  startCallCountdown();
}

function startCallCountdown() {
  const call = state.currentCall;
  const fill = document.getElementById('pb-timeout');
  const text = document.getElementById('lbl-timeout-sec');
  
  fill.style.width = '100%';
  text.innerText = '30';
  
  call.intervalId = setInterval(() => {
    call.timeLeft--;
    text.innerText = call.timeLeft;
    fill.style.width = `${(call.timeLeft / 30) * 100}%`;
    if (call.timeLeft <= 0) {
      declineCurrentCall();
    }
  }, 1000);
}

function acceptCurrentCall() {
  if (!state.currentCall) return;
  clearInterval(state.currentCall.intervalId);
  
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
  
  const prevRoiId = state.currentCall.roiId;
  
  // selectBestStaff() は自動的に lastStaffId (現在の指名ID) の次から探索を開始するため、
  // 面倒なステータスの一時書き換えなしで、次の「出勤中」メンバーを安全に選択できます。
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
  state.currentCall = null;
  state.lastCallResolvedTime = Date.now(); // 呼び出しが解消された時間を記録（クールダウン開始）
  resetPhoneToIdle();
  document.querySelectorAll('.roi-box').forEach(box => {
    box.classList.remove('detected');
  });
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
    staffMember.status = e.target.value;
    tr.classList.toggle('status-stopped', staffMember.status === 'ストップ');
  });
  tr.querySelector('.btn-delete-staff').addEventListener('click', () => {
    state.staff = state.staff.filter(s => s.id !== staffMember.id);
    renderStaffList();
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
  const newStaffList = [];
  ['A-early', 'A-late', 'B-early', 'B-late'].forEach(group => {
    const rows = document.querySelectorAll(`#staff-list-body-${group} tr`);
    rows.forEach(row => {
      const id = parseInt(row.getAttribute('data-id'));
      const staffMember = state.staff.find(s => s.id === id);
      if (staffMember) {
        staffMember.group = group;
        newStaffList.push(staffMember);
      }
    });
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
  
  const newId = state.staff.length > 0 ? Math.max(...state.staff.map(s => s.id)) + 1 : 1;
  state.staff.push({
    id: newId,
    name: name,
    status: statusSelect.value,
    group: groupSelect.value,
    callCount: 0
  });
  
  nameInput.value = '';
  renderStaffList();
  closeAddStaffModal();
}

function startSystem() {
  const btn = document.getElementById('btn-start-system');
  const statusDot = document.getElementById('system-status-dot');
  
  if (state.systemActive) {
    state.systemActive = false;
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
    btn.innerHTML = `<svg class="icon" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg> システム停止`;
    btn.className = 'btn btn-secondary';
    statusDot.className = 'pulse-dot running';
    speak('システムを開始しました。');
    startAnalysis();
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

// --- 初期化 ---
document.addEventListener('DOMContentLoaded', () => {
  initRoiStatusCards();
  renderROIs();
  renderStaffList();
  initSliders();
  initVideoToggle();
  initGroupSwitcher();
  initTableBodyDragAndDrop();
  drawDummyStoreVideo();
  
  // 音声リストの初期ロードを促す（ウォームアップ）
  if (window.speechSynthesis) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.getVoices();
    };
  }
  
  document.getElementById('btn-start-system').addEventListener('click', startSystem);
  document.getElementById('btn-add-staff').addEventListener('click', openAddStaffModal);
  document.getElementById('btn-close-modal').addEventListener('click', closeAddStaffModal);
  document.getElementById('btn-cancel-staff').addEventListener('click', closeAddStaffModal);
  document.getElementById('btn-save-staff').addEventListener('click', saveNewStaff);
  document.getElementById('btn-accept').addEventListener('click', acceptCurrentCall);
  document.getElementById('btn-decline').addEventListener('click', declineCurrentCall);
});
