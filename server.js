const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// In-memory storage
const players = new Map();      // playerId -> playerData
const rooms = new Map();        // roomId -> roomData
const leaderboard = [];         // [{name, wins, losses, ...}]

function broadcast(ws, data) {
  ws.send(JSON.stringify(data));
}

function broadcastToRoom(roomId, data, excludeId = null) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.players.forEach(pid => {
    const player = players.get(pid);
    if (player && player.ws && player.ws.readyState === WebSocket.OPEN) {
      if (pid !== excludeId) {
        player.ws.send(JSON.stringify(data));
      }
    }
  });
}

function generateMathQuestion() {
  const operations = ['+', '-', '*'];
  const op = operations[Math.floor(Math.random() * operations.length)];
  let a, b, answer;
  
  if (op === '+') {
    a = Math.floor(Math.random() * 50) + 1;
    b = Math.floor(Math.random() * 50) + 1;
    answer = a + b;
  } else if (op === '-') {
    a = Math.floor(Math.random() * 50) + 20;
    b = Math.floor(Math.random() * 20) + 1;
    answer = a - b;
  } else {
    a = Math.floor(Math.random() * 12) + 2;
    b = Math.floor(Math.random() * 12) + 2;
    answer = a * b;
  }
  
  return { question: `${a} ${op} ${b} = ?`, answer };
}

function generateClickTarget() {
  return {
    id: uuidv4(),
    x: Math.floor(Math.random() * 80) + 10,
    y: Math.floor(Math.random() * 80) + 10,
    createdAt: Date.now()
  };
}

wss.on('connection', (ws) => {
  const playerId = uuidv4();
  
  ws.on('message', (msg) => {
    let data;
    try { data = JSON.parse(msg); } catch { return; }
    
    switch (data.type) {
      case 'REGISTER': {
        const { name, surname } = data;
        if (!name || !surname) return;
        
        players.set(playerId, {
          id: playerId,
          name,
          surname,
          fullName: `${name} ${surname}`,
          ws,
          roomId: null,
          wins: 0,
          losses: 0,
          score: 0
        });
        
        // Add to leaderboard if not exists
        const existing = leaderboard.find(p => p.fullName === `${name} ${surname}`);
        if (!existing) {
          leaderboard.push({ id: playerId, fullName: `${name} ${surname}`, wins: 0, losses: 0, duels: 0 });
        }
        
        broadcast(ws, { type: 'REGISTERED', playerId, name, surname });
        broadcast(ws, { type: 'LEADERBOARD', data: leaderboard.sort((a,b) => b.wins - a.wins) });
        broadcast(ws, { type: 'PLAYERS_LIST', players: Array.from(players.values()).filter(p => p.id !== playerId).map(p => ({ id: p.id, fullName: p.fullName, wins: p.wins })) });
        
        // Notify others about new player
        players.forEach((p, pid) => {
          if (pid !== playerId && p.ws.readyState === WebSocket.OPEN) {
            p.ws.send(JSON.stringify({ type: 'PLAYERS_LIST', players: Array.from(players.values()).filter(pp => pp.id !== pid).map(pp => ({ id: pp.id, fullName: pp.fullName, wins: pp.wins })) }));
          }
        });
        break;
      }
      
      case 'CREATE_ROOM': {
        const player = players.get(playerId);
        if (!player) return;
        
        const roomId = uuidv4().slice(0, 6).toUpperCase();
        const gameType = data.gameType; // 'math' or 'click'
        
        rooms.set(roomId, {
          id: roomId,
          gameType,
          players: [playerId],
          status: 'waiting',
          ready: {},
          scores: {},
          currentQuestion: null,
          timer: null,
          timeLeft: 60
        });
        
        player.roomId = roomId;
        broadcast(ws, { type: 'ROOM_CREATED', roomId, gameType });
        break;
      }
      
      case 'JOIN_ROOM': {
        const player = players.get(playerId);
        if (!player) return;
        
        const room = rooms.get(data.roomId);
        if (!room) {
          broadcast(ws, { type: 'ERROR', message: 'Xona topilmadi!' });
          return;
        }
        if (room.players.length >= 2) {
          broadcast(ws, { type: 'ERROR', message: 'Xona to\'la!' });
          return;
        }
        
        room.players.push(playerId);
        player.roomId = data.roomId;
        
        const p1 = players.get(room.players[0]);
        const p2 = players.get(room.players[1]);
        
        broadcast(ws, { type: 'ROOM_JOINED', roomId: data.roomId, gameType: room.gameType, opponent: { id: p1.id, fullName: p1.fullName } });
        broadcastToRoom(data.roomId, { type: 'OPPONENT_JOINED', opponent: { id: p2.id, fullName: p2.fullName } }, playerId);
        break;
      }
      
      case 'READY': {
        const player = players.get(playerId);
        if (!player || !player.roomId) return;
        
        const room = rooms.get(player.roomId);
        if (!room) return;
        
        room.ready[playerId] = true;
        broadcastToRoom(player.roomId, { type: 'PLAYER_READY', playerId });
        
        // Both ready - start countdown
        if (room.players.length === 2 && room.players.every(pid => room.ready[pid])) {
          room.status = 'countdown';
          broadcastToRoom(player.roomId, { type: 'COUNTDOWN_START' });
          
          let count = 3;
          const countInterval = setInterval(() => {
            broadcastToRoom(player.roomId, { type: 'COUNTDOWN', count });
            count--;
            if (count < 0) {
              clearInterval(countInterval);
              startGame(player.roomId);
            }
          }, 1000);
        }
        break;
      }
      
      case 'MATH_ANSWER': {
        const player = players.get(playerId);
        if (!player || !player.roomId) return;
        
        const room = rooms.get(player.roomId);
        if (!room || room.status !== 'playing') return;
        
        if (data.answer == room.currentQuestion.answer) {
          room.scores[playerId] = (room.scores[playerId] || 0) + 1;
          broadcastToRoom(player.roomId, { type: 'SCORE_UPDATE', scores: room.scores, correct: playerId });
          
          // New question
          room.currentQuestion = generateMathQuestion();
          broadcastToRoom(player.roomId, { type: 'NEW_QUESTION', question: room.currentQuestion.question });
        } else {
          broadcast(ws, { type: 'WRONG_ANSWER' });
        }
        break;
      }
      
      case 'CLICK_HIT': {
        const player = players.get(playerId);
        if (!player || !player.roomId) return;
        
        const room = rooms.get(player.roomId);
        if (!room || room.status !== 'playing') return;
        
        if (data.targetId === room.currentTarget?.id) {
          room.scores[playerId] = (room.scores[playerId] || 0) + 1;
          broadcastToRoom(player.roomId, { type: 'SCORE_UPDATE', scores: room.scores, correct: playerId });
          
          // New target
          room.currentTarget = generateClickTarget();
          broadcastToRoom(player.roomId, { type: 'NEW_TARGET', target: room.currentTarget });
        }
        break;
      }
      
      case 'DUEL_INVITE': {
        const from = players.get(playerId);
        const to = players.get(data.toId);
        if (!from || !to || !to.ws) return;
        
        broadcast(to.ws, { 
          type: 'DUEL_INVITE', 
          fromId: playerId, 
          fromName: from.fullName,
          gameType: data.gameType
        });
        break;
      }
      
      case 'DUEL_ACCEPT': {
        const accepter = players.get(playerId);
        const inviter = players.get(data.fromId);
        if (!accepter || !inviter) return;
        
        // Create room for duel
        const roomId = uuidv4().slice(0, 6).toUpperCase();
        rooms.set(roomId, {
          id: roomId,
          gameType: data.gameType,
          players: [data.fromId, playerId],
          status: 'waiting',
          ready: {},
          scores: {},
          currentQuestion: null,
          timer: null,
          timeLeft: 60,
          isDuel: true
        });
        
        accepter.roomId = roomId;
        inviter.roomId = roomId;
        
        broadcast(accepter.ws, { type: 'DUEL_STARTED', roomId, gameType: data.gameType, opponent: { id: inviter.id, fullName: inviter.fullName } });
        broadcast(inviter.ws, { type: 'DUEL_STARTED', roomId, gameType: data.gameType, opponent: { id: accepter.id, fullName: accepter.fullName } });
        break;
      }
      
      case 'DUEL_DECLINE': {
        const inviter = players.get(data.fromId);
        if (inviter && inviter.ws) {
          broadcast(inviter.ws, { type: 'DUEL_DECLINED', byName: players.get(playerId)?.fullName });
        }
        break;
      }
      
      case 'GET_LEADERBOARD': {
        broadcast(ws, { type: 'LEADERBOARD', data: leaderboard.sort((a,b) => b.wins - a.wins) });
        break;
      }
    }
  });
  
  ws.on('close', () => {
    const player = players.get(playerId);
    if (player && player.roomId) {
      const room = rooms.get(player.roomId);
      if (room) {
        broadcastToRoom(player.roomId, { type: 'OPPONENT_LEFT' }, playerId);
        if (room.timer) clearInterval(room.timer);
        rooms.delete(player.roomId);
      }
    }
    players.delete(playerId);
    
    // Notify others
    players.forEach((p) => {
      if (p.ws.readyState === WebSocket.OPEN) {
        p.ws.send(JSON.stringify({ type: 'PLAYERS_LIST', players: Array.from(players.values()).filter(pp => pp.id !== p.id).map(pp => ({ id: pp.id, fullName: pp.fullName, wins: pp.wins })) }));
      }
    });
  });
});

function startGame(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  
  room.status = 'playing';
  room.scores = {};
  room.players.forEach(pid => room.scores[pid] = 0);
  room.timeLeft = 60;
  
  if (room.gameType === 'math') {
    room.currentQuestion = generateMathQuestion();
    broadcastToRoom(roomId, { type: 'GAME_START', gameType: 'math', question: room.currentQuestion.question, scores: room.scores });
  } else {
    room.currentTarget = generateClickTarget();
    broadcastToRoom(roomId, { type: 'GAME_START', gameType: 'click', target: room.currentTarget, scores: room.scores });
  }
  
  room.timer = setInterval(() => {
    room.timeLeft--;
    broadcastToRoom(roomId, { type: 'TIMER', timeLeft: room.timeLeft });
    
    if (room.timeLeft <= 0) {
      clearInterval(room.timer);
      endGame(roomId);
    }
  }, 1000);
}

function endGame(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  
  room.status = 'ended';
  const [p1id, p2id] = room.players;
  const p1 = players.get(p1id);
  const p2 = players.get(p2id);
  
  const s1 = room.scores[p1id] || 0;
  const s2 = room.scores[p2id] || 0;
  
  let winnerId = null;
  if (s1 > s2) winnerId = p1id;
  else if (s2 > s1) winnerId = p2id;
  
  // Update leaderboard
  if (winnerId) {
    const winner = players.get(winnerId);
    const loserId = winnerId === p1id ? p2id : p1id;
    const loser = players.get(loserId);
    
    if (winner) winner.wins++;
    if (loser) loser.losses++;
    
    const lbWinner = leaderboard.find(p => p.fullName === winner?.fullName);
    if (lbWinner) { lbWinner.wins++; lbWinner.duels++; }
    const lbLoser = leaderboard.find(p => p.fullName === loser?.fullName);
    if (lbLoser) { lbLoser.losses = (lbLoser.losses || 0) + 1; lbLoser.duels++; }
  }
  
  broadcastToRoom(roomId, {
    type: 'GAME_END',
    scores: room.scores,
    winnerId,
    winnerName: winnerId ? players.get(winnerId)?.fullName : null,
    p1: { id: p1id, name: p1?.fullName, score: s1 },
    p2: { id: p2id, name: p2?.fullName, score: s2 }
  });
  
  // Update all leaderboards
  setTimeout(() => {
    players.forEach((p) => {
      if (p.ws.readyState === WebSocket.OPEN) {
        p.ws.send(JSON.stringify({ type: 'LEADERBOARD', data: leaderboard.sort((a,b) => b.wins - a.wins) }));
      }
    });
  }, 2000);
  
  rooms.delete(roomId);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🎮 Battle Arena server running on http://localhost:${PORT}`);
});
