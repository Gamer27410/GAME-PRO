# ⚔️ BATTLE ARENA — 1v1 Duel Platform

Real-time multiplayer o'yin platformasi. Matematik jang va Tez bosish o'yinlari.

## Xususiyatlar

- 🧮 **Matematik Jang** — 60 soniya ichida eng ko'p matematik masala yeching
- 🎯 **Tez Bosish** — 60 soniya ichida ekrandagi maqsadlarga eng tez bosing
- ⚔️ **Duel tizimi** — Online o'yinchilarga duel yuborish/qabul qilish
- 🏆 **Reyting jadvali** — G'alaba statistikasi
- 🔢 **3-2-1 Countdown** — Ikkala o'yinchi tayyor bo'lgandan keyin kauntdaun
- 👥 **Xona kodi** — Do'stingiz bilan xona kodi orqali o'ynash

## O'rnatish

```bash
# 1. Dependencies o'rnatish
npm install

# 2. Serverni ishga tushurish
npm start

# 3. Brauzerda ochish
# http://localhost:3000
```

## Qanday o'ynash

1. **Ism va Familiya** kiriting → "KIRISH" bosing
2. **Lobby**da o'yin turini tanlang (Matematik yoki Tez Bosish)
3. **Xona yarating** yoki **xona kodini** kiriting
4. Ikki o'yinchi ham **"TAYYOR MAN"** bosgach → 3-2-1 GO!
5. 60 soniya ichida ko'proq ball to'plang
6. Natijada kim yutganini ko'ring

## Fayl strukturasi

```
battle-arena/
├── server.js          ← Node.js + Express + WebSocket server
├── package.json       ← Dependencies
├── README.md          ← Bu fayl
└── public/
    ├── index.html     ← Frontend UI
    └── game.js        ← Frontend game logic
```

## Texnologiyalar

- **Backend**: Node.js, Express, ws (WebSocket)
- **Frontend**: Vanilla HTML/CSS/JavaScript
- **Real-time**: WebSocket (ws library)

## Visual Studio Code bilan ishlatish

1. Papkani VS Code da oching
2. Terminal oching (`Ctrl + ` `)
3. `npm install` yozing
4. `npm start` yozing
5. `http://localhost:3000` ni brauzerda oching
6. Ikkita brauzer tab ochib test qiling!
