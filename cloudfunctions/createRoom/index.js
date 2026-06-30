const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function generateRoomNumber() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function hashPassword(pwd) {
  if (!pwd) return '';
  const buf = Buffer.from(pwd + '_poker_salt', 'utf8');
  return buf.toString('base64');
}

exports.main = async (event, context) => {
  const {
    gameType = 'texas',
    roomName = 'Texas Poker',
    maxPlayers = 12,
    defaultChips = 10000,
    smallBlind = 100,
    bigBlind = 200,
    zjhBaseBet = 100,
    zjhMaxRounds = 20,
    maxHands = 10,
    allowMidJoin = false,
    playerName,
    playerAvatar,
    password = ''
  } = event;
  const { OPENID } = cloud.getWXContext();

  if (!OPENID) {
    return { success: false, error: 'Not logged in' };
  }

  const vMaxPlayers = Math.min(Math.max(parseInt(maxPlayers) || 12, 2), 16);
  const vChips = Math.min(Math.max(parseInt(defaultChips) || 10000, 100), 100000);
  const isZjh = gameType === 'zjh';

  if (!isZjh) {
    const vSmallBlind = Math.min(Math.max(parseInt(smallBlind) || 100, 1), 10000);
    const vBigBlind = Math.min(Math.max(parseInt(bigBlind) || 200, 2), 20000);
    if (vBigBlind <= vSmallBlind) {
      return { success: false, error: 'Big blind must exceed small blind' };
    }
  }

  const hasPassword = !!password.trim();
  const passwordHash = hasPassword ? hashPassword(password.trim()) : '';

  try {
    let roomNumber;
    for (let i = 0; i < 100; i++) {
      roomNumber = generateRoomNumber();
      const check = await db.collection('rooms').where({ roomNumber: roomNumber }).count();
      if (check.total === 0) break;
    }
    if (!roomNumber) {
      roomNumber = String(Date.now()).slice(-6);
    }

    const now = Date.now();
    const vSmallBlind = Math.min(Math.max(parseInt(smallBlind) || 100, 1), 10000);
    const vBigBlind = Math.min(Math.max(parseInt(bigBlind) || 200, 2), 20000);
    const vZjhBaseBet = Math.min(Math.max(parseInt(zjhBaseBet) || 100, 10), 1000);
    const vZjhMaxRounds = Math.min(Math.max(parseInt(zjhMaxRounds) || 20, 5), 50);

    const roomData = {
      roomNumber: roomNumber,
      roomName: roomName,
      gameType: gameType,
      creatorOpenId: OPENID,
      status: 'waiting',
      startCountdownAt: 0,
      zjh_lastCompare: {},
      phase: 'PRE_FLOP',
      phaseIndex: 0,
      communityCards: [],
      pot: 0,
      currentBet: 0,
      minRaise: isZjh ? vZjhBaseBet : vBigBlind,
      currentPlayerIndex: 0,
      dealerIndex: 0,
      deck: [],
      hasPassword: hasPassword,
      passwordHash: passwordHash,
      players: [{
        openId: OPENID,
        name: playerName || 'Host',
        avatarUrl: playerAvatar || '',
        isReady: false,
        isActive: true,
        isAllIn: false,
        hasActed: false,
        totalBetThisRound: 0,
        totalBet: 0,
        chips: vChips,
        holeCards: [],
        handResult: null,
        rebuyCount: 0,
        seat: 0,
        joinedAt: now
      }],
      maxPlayers: vMaxPlayers,
      defaultChips: vChips,
      smallBlind: vSmallBlind,
      bigBlind: vBigBlind,
      maxHands: Math.min(Math.max(parseInt(maxHands) || 10, 3), 50),
      allowMidJoin: !!allowMidJoin,
      handCount: 0,
      spectators: [],
      actions: [],
      gameHistory: [],
      createdAt: now,
      updatedAt: now
    };

    if (isZjh) {
      roomData.zjh_baseBet = vZjhBaseBet;
      roomData.zjh_maxRounds = vZjhMaxRounds;
      roomData.zjh_currentRound = 0;
    }

    const result = await db.collection('rooms').add({ data: roomData });

    return {
      success: true,
      roomId: result._id,
      roomNumber: roomNumber
    };
  } catch (err) {
    console.error('createRoom error:', err.message);
    return { success: false, error: err.message || 'Unknown error' };
  }
};