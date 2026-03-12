// ============================================================
//  BATTLE ARENA - Client Side Game Logic
// ============================================================

let ws = null;
let myId = null;
let myName = '';
let mySurname = '';
let myWins = 0;
let myLosses = 0;
let currentRoomId = null;
let opponentId = null;
let opponentName = '';
let currentGameType = null;
let selectedGameType = 'math';
let duelSelectedGame = 'math';
let pendingDuelFrom = null;
let meReady = false;
let oppReady = false;
let lastRoomForRematch = null;

// --- WebSocket Connection ---
function connect() {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${protocol}://${location.host}`);
  
  ws.onopen = () => {
    setRegStatus('Server bilan ulanildi ✓', 'green');
  };
  
  ws.onclose = () => {
    toast('Serverdan uzildi. Sahifani yangilang.', 'error');
  };
  
  ws.onerror = () => {
    setRegStatus('Serverga ulanib bo\'lmadi!', 'red');
  };
  
  ws.onmessage = (e) => {
    const data = JSON.parse(e.data);
    handleMessage(data);
  };
}

function handleMessage(data) {
  switch(data.type) {
    case 'REGISTERED':
      myId = data.playerId;
      myName = data.name;
      mySurname = data.surname;
      onRegistered();
      break;
    
    case 'LEADERBOARD':
      renderLeaderboard(data.data);
      break;
    
    case 'PLAYERS_LIST':
      renderPlayers(data.players);
      break;
    
    case 'ROOM_CREATED':
      currentRoomId = data.roomId;
      currentGameType = data.gameType;
      lastRoomForRematch = { gameType: data.gameType };
      showWaitingScreen(true);
      break;
    
    case 'ROOM_JOINED':
      currentRoomId = data.roomId;
      currentGameType = data.gameType;
      opponentId = data.opponent.id;
      opponentName = data.opponent.fullName;
      lastRoomForRematch = { gameType: data.gameType };
      showWaitingScreen(false);
      setOppReady(false);
      toast(`${opponentName} bilan o'yin boshlanmoqda!`, 'info');
      break;
    
    case 'OPPONENT_JOINED':
      opponentId = data.opponent.id;
      opponentName = data.opponent.fullName;
      updateReadyPanel();
      toast(`${opponentName} xonaga kirdi!`, 'success');
      break;
    
    case 'PLAYER_READY':
      if (data.playerId !== myId) {
        setOppReady(true);
        toast(`${opponentName} tayyor!`, 'info');
      }
      break;
    
    case 'COUNTDOWN_START':
      document.getElementById('countdown-overlay').classList.remove('hidden');
      break;
    
    case 'COUNTDOWN':
      showCountdown(data.count);
      break;
    
    case 'GAME_START':
      startGame(data);
      break;
    
    case 'NEW_QUESTION':
      updateQuestion(data.question);
      break;
    
    case 'NEW_TARGET':
      spawnTarget(data.target);
      break;
    
    case 'SCORE_UPDATE':
      updateScores(data.scores, data.correct);
      break;
    
    case 'WRONG_ANSWER':
      wrongAnswerFeedback();
      break;
    
    case 'TIMER':
      updateTimer(data.timeLeft);
      break;
    
    case 'GAME_END':
      showResult(data);
      break;
    
    case 'OPPONENT_LEFT':
      toast('Raqibingiz o\'yindan chiqdi!', 'error');
      setTimeout(goLobby, 2000);
      break;
    
    case 'DUEL_INVITE':
      pendingDuelFrom = { id: data.fromId, name: data.fromName };
      showDuelModal(data.fromName);
      break;
    
    case 'DUEL_STARTED':
      currentRoomId = data.roomId;
      currentGameType = data.gameType;
      opponentId = data.opponent.id;
      opponentName = data.opponent.fullName;
      lastRoomForRematch = { gameType: data.gameType };
      hideDuelModal();
      showWaitingScreen(false);
      toast(`Duel: ${opponentName} vs Siz!`, 'info');
      break;
    
    case 'DUEL_DECLINED':
      toast(`${data.byName} duelni rad etdi.`, 'error');
      break;
    
    case 'ERROR':
      toast(data.message, 'error');
      break;
  }
}

// --- REGISTER ---
function register() {
  const name = document.getElementById('inp-name').value.trim();
  const surname = document.getElementById('inp-surname').value.trim();
  if (!name || !surname) {
    toast('Ism va Familiya kiriting!', 'error');
    return;
  }
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    toast('Server bilan ulanilmagan!', 'error');
    return;
  }
  send({ type: 'REGISTER', name, surname });
}

function onRegistered() {
  // Update lobby UI
  document.getElementById('lobby-playername').textContent = `${myName} ${mySurname}`;
  document.getElementById('avatar-initials').textContent = (myName[0] + mySurname[0]).toUpperCase();
  document.getElementById('stat-wins').textContent = myWins;
  document.getElementById('stat-losses').textContent = myLosses;
  showScreen('screen-lobby');
  toast(`Xush kelibsiz, ${myName}!`, 'success');
}

// --- GAME TYPE SELECTION ---
function selectGame(type) {
  selectedGameType = type;
  document.querySelectorAll('.game-card[id^="card-"]').forEach(c => c.classList.remove('selected'));
  document.getElementById(`card-${type}`).classList.add('selected');
}

function selectDuelGame(type) {
  duelSelectedGame = type;
  document.querySelectorAll('.game-card[id^="duel-card-"]').forEach(c => c.classList.remove('selected'));
  document.getElementById(`duel-card-${type}`).classList.add('selected');
}

// Auto-select math on load
selectGame('math');
selectDuelGame('math');

// --- ROOM ---
function createRoom() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  send({ type: 'CREATE_ROOM', gameType: selectedGameType });
}

function joinRoom() {
  const code = document.getElementById('inp-roomcode').value.trim().toUpperCase();
  if (!code) { toast('Xona kodi kiriting!', 'error'); return; }
  send({ type: 'JOIN_ROOM', roomId: code });
}

// --- WAITING SCREEN ---
function showWaitingScreen(isCreator) {
  meReady = false;
  oppReady = false;
  document.getElementById('btn-ready').disabled = false;
  document.getElementById('btn-ready').textContent = '✅ TAYYOR MAN!';
  
  const gameModes = { math: '🧮 Matematik Jang', click: '🎯 Tez Bosish' };
  document.getElementById('wait-gamemode').textContent = gameModes[currentGameType] || currentGameType;
  
  // Show room code only if creator
  if (isCreator) {
    document.getElementById('room-code-display').style.display = 'flex';
    document.getElementById('room-code-val').textContent = currentRoomId;
  } else {
    document.getElementById('room-code-display').style.display = 'none';
  }
  
  // Reset ready panel
  document.getElementById('rp1-name').textContent = `${myName} ${mySurname}`;
  document.getElementById('rp1-status').textContent = 'Tayyor emas';
  document.getElementById('rp1').classList.remove('ready');
  document.getElementById('rp2-name').textContent = opponentName || 'Raqib';
  document.getElementById('rp2-status').textContent = opponentName ? 'Tayyor emas' : 'Kutilmoqda...';
  document.getElementById('rp2').classList.remove('ready');
  
  showScreen('screen-waiting');
}

function updateReadyPanel() {
  document.getElementById('rp2-name').textContent = opponentName;
  document.getElementById('rp2-status').textContent = oppReady ? '✅ Tayyor!' : 'Tayyor emas';
  if (oppReady) document.getElementById('rp2').classList.add('ready');
}

function setReady() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  meReady = true;
  document.getElementById('rp1-status').textContent = '✅ Tayyor!';
  document.getElementById('rp1').classList.add('ready');
  document.getElementById('btn-ready').disabled = true;
  document.getElementById('btn-ready').textContent = '⌛ Raqib kutilyapti...';
  send({ type: 'READY' });
}

function setOppReady(r) {
  oppReady = r;
  document.getElementById('rp2-name').textContent = opponentName;
  document.getElementById('rp2-status').textContent = r ? '✅ Tayyor!' : 'Tayyor emas';
  if (r) document.getElementById('rp2').classList.add('ready');
  else document.getElementById('rp2').classList.remove('ready');
}

// --- COUNTDOWN ---
function showCountdown(count) {
  const overlay = document.getElementById('countdown-overlay');
  const num = document.getElementById('countdown-num');
  overlay.classList.remove('hidden');
  
  if (count > 0) {
    num.textContent = count;
    num.style.animation = 'none';
    void num.offsetWidth;
    num.style.animation = 'countPop 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)';
  } else {
    num.textContent = 'GO!';
    num.style.color = 'var(--green)';
    num.style.animation = 'none';
    void num.offsetWidth;
    num.style.animation = 'countPop 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)';
    setTimeout(() => {
      overlay.classList.add('hidden');
      num.style.color = '';
    }, 800);
  }
}

// --- GAME START ---
function startGame(data) {
  document.getElementById('countdown-overlay').classList.add('hidden');
  currentGameType = data.gameType;
  
  // Update scoreboard names
  document.getElementById('my-name-game').textContent = `${myName} ${mySurname}`.toUpperCase();
  document.getElementById('opp-name-game').textContent = opponentName.toUpperCase();
  
  // Reset scores
  updateScores(data.scores);
  updateTimer(60);
  
  showScreen('screen-game');
  
  if (data.gameType === 'math') {
    document.getElementById('math-area').classList.remove('hidden');
    document.getElementById('click-area').classList.add('hidden');
    updateQuestion(data.question);
    setTimeout(() => document.getElementById('answer-input').focus(), 100);
  } else {
    document.getElementById('math-area').classList.add('hidden');
    document.getElementById('click-area').classList.remove('hidden');
    document.getElementById('click-hint').style.display = 'none';
    spawnTarget(data.target);
  }
}

// --- MATH GAME ---
function updateQuestion(question) {
  const el = document.getElementById('question-display');
  el.textContent = question;
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = 'countPop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
  
  const inp = document.getElementById('answer-input');
  inp.value = '';
  inp.classList.remove('shake');
  inp.focus();
}

function mathKeydown(e) {
  if (e.key === 'Enter') submitAnswer();
}

function submitAnswer() {
  const val = document.getElementById('answer-input').value.trim();
  if (val === '') return;
  send({ type: 'MATH_ANSWER', answer: parseFloat(val) });
  document.getElementById('answer-input').value = '';
}

function wrongAnswerFeedback() {
  const inp = document.getElementById('answer-input');
  inp.classList.remove('shake');
  void inp.offsetWidth;
  inp.classList.add('shake');
  inp.style.borderColor = 'var(--accent2)';
  setTimeout(() => { inp.style.borderColor = ''; }, 600);
}

// --- CLICK GAME ---
function spawnTarget(target) {
  const arena = document.getElementById('click-arena');
  // Remove old target
  const old = document.getElementById('click-target-el');
  if (old) old.remove();
  
  const el = document.createElement('div');
  el.className = 'click-target';
  el.id = 'click-target-el';
  el.textContent = '🎯';
  el.style.left = target.x + '%';
  el.style.top = target.y + '%';
  el.onclick = () => hitTarget(target.id, el);
  arena.appendChild(el);
}

function hitTarget(targetId, el) {
  send({ type: 'CLICK_HIT', targetId });
  // Visual feedback
  el.style.animation = 'none';
  const flash = document.createElement('div');
  flash.className = 'hit-flash';
  document.body.appendChild(flash);
  setTimeout(() => flash.remove(), 300);
}

// --- SCORES & TIMER ---
function updateScores(scores, correctId) {
  if (!scores) return;
  const myScore = scores[myId] || 0;
  const oppScore = scores[opponentId] || 0;
  
  document.getElementById('my-score').textContent = myScore;
  document.getElementById('opp-score').textContent = oppScore;
  
  if (correctId) {
    const indicator = document.createElement('div');
    indicator.className = 'correct-indicator';
    indicator.textContent = correctId === myId ? '+1 ✓' : '';
    if (correctId === myId) {
      document.body.appendChild(indicator);
      setTimeout(() => indicator.remove(), 600);
    }
  }
}

function updateTimer(timeLeft) {
  const display = document.getElementById('timer-display');
  const bar = document.getElementById('timer-bar');
  
  display.textContent = timeLeft;
  bar.style.width = (timeLeft / 60 * 100) + '%';
  
  if (timeLeft <= 10) {
    display.classList.add('urgent');
    bar.style.background = 'var(--accent2)';
  } else {
    display.classList.remove('urgent');
    bar.style.background = 'linear-gradient(90deg, var(--accent), var(--accent2))';
  }
}

// --- RESULT ---
function showResult(data) {
  const overlay = document.getElementById('result-overlay');
  const title = document.getElementById('result-title');
  
  let p1, p2;
  if (data.p1.id === myId) {
    p1 = data.p1; p2 = data.p2;
  } else {
    p1 = data.p2; p2 = data.p1;
  }
  
  document.getElementById('res-p1-name').textContent = p1.name || 'Siz';
  document.getElementById('res-p2-name').textContent = p2.name || 'Raqib';
  document.getElementById('res-p1-score').textContent = p1.score;
  document.getElementById('res-p2-score').textContent = p2.score;
  
  if (!data.winnerId) {
    title.textContent = 'DURRANG!';
    title.className = 'result-title draw';
  } else if (data.winnerId === myId) {
    title.textContent = '🏆 G\'ALABA!';
    title.className = 'result-title win';
    myWins++;
    document.getElementById('stat-wins').textContent = myWins;
  } else {
    title.textContent = '💀 MAG\'LUB!';
    title.className = 'result-title lose';
    myLosses++;
    document.getElementById('stat-losses').textContent = myLosses;
  }
  
  overlay.classList.remove('hidden');
}

// --- LEADERBOARD ---
function renderLeaderboard(data) {
  const el = document.getElementById('leaderboard-list');
  if (!data || data.length === 0) {
    el.innerHTML = '<p style="color:var(--text2);font-size:0.85rem;text-align:center;padding:12px;">Hali o\'yinchi yo\'q</p>';
    return;
  }
  el.innerHTML = data.slice(0, 10).map((p, i) => `
    <div class="lb-entry">
      <div class="lb-rank ${i === 0 ? 'r1' : i === 1 ? 'r2' : i === 2 ? 'r3' : ''}">${i + 1}</div>
      <div class="lb-name">${escHtml(p.fullName)}</div>
      <div class="lb-wins">${p.wins}W</div>
    </div>
  `).join('');
}

// --- PLAYERS ONLINE ---
function renderPlayers(players) {
  const el = document.getElementById('players-list');
  if (!players || players.length === 0) {
    el.innerHTML = '<p style="color:var(--text2);font-size:0.85rem;text-align:center;padding:12px;">Boshqa o\'yinchi yo\'q</p>';
    return;
  }
  el.innerHTML = players.map(p => `
    <div class="player-entry">
      <div class="player-dot"></div>
      <div class="player-name-lb">${escHtml(p.fullName)}</div>
      <button class="duel-btn" onclick="inviteDuel('${p.id}', '${escHtml(p.fullName)}')">⚔️ DUEL</button>
    </div>
  `).join('');
}

// --- DUEL ---
function inviteDuel(toId, toName) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  send({ type: 'DUEL_INVITE', toId, gameType: selectedGameType });
  toast(`${toName}ga duel yuborildi!`, 'info');
}

function showDuelModal(fromName) {
  document.getElementById('duel-modal-desc').textContent = `${fromName} sizni duelga chaqirmoqda!`;
  document.getElementById('duel-modal').classList.remove('hidden');
}

function hideDuelModal() {
  document.getElementById('duel-modal').classList.add('hidden');
}

function acceptDuel() {
  if (!pendingDuelFrom) return;
  send({ type: 'DUEL_ACCEPT', fromId: pendingDuelFrom.id, gameType: duelSelectedGame });
  hideDuelModal();
}

function declineDuel() {
  if (!pendingDuelFrom) return;
  send({ type: 'DUEL_DECLINE', fromId: pendingDuelFrom.id });
  pendingDuelFrom = null;
  hideDuelModal();
}

// --- NAVIGATION ---
function goLobby() {
  document.getElementById('result-overlay').classList.add('hidden');
  document.getElementById('countdown-overlay').classList.add('hidden');
  currentRoomId = null;
  opponentId = null;
  opponentName = '';
  showScreen('screen-lobby');
  send({ type: 'GET_LEADERBOARD' });
}

function rematch() {
  document.getElementById('result-overlay').classList.add('hidden');
  goLobby();
  toast('Qayta o\'yin uchun xona yarating!', 'info');
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// --- UTILS ---
function send(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

function toast(msg, type = 'info') {
  const container = document.getElementById('toasts');
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${icons[type]}</span> ${escHtml(msg)}`;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function setRegStatus(msg, color) {
  const el = document.getElementById('reg-status');
  el.textContent = msg;
  el.style.color = color === 'green' ? 'var(--green)' : 'var(--accent2)';
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Enter key for register
document.getElementById('inp-name').addEventListener('keydown', e => { if(e.key==='Enter') document.getElementById('inp-surname').focus(); });
document.getElementById('inp-surname').addEventListener('keydown', e => { if(e.key==='Enter') register(); });

// Init
connect();
