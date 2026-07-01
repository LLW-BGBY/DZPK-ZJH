const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const SUITS = ['S', 'H', 'D', 'C'];
const VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const SHORT_DECK_VALUES = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

function createDeck(shortDeck) {
  const vals = shortDeck ? SHORT_DECK_VALUES : VALUES;
  const deck = [];
  for (let s = 0; s < SUITS.length; s++) {
    for (let v = 0; v < vals.length; v++) {
      const rankMap = { '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
                         '2': 2, '3': 3, '4': 4, '5': 5 };
      deck.push({ value: vals[v], suit: SUITS[s], rank: rankMap[vals[v]] });
    }
  }
  return deck;
}

function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function evaluateBestHand(cards, shortDeck) {
  const rankMap = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
  const ranks = cards.map(c => rankMap[c.value]).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);
  const rankCounts = {};
  ranks.forEach(r => rankCounts[r] = (rankCounts[r] || 0) + 1);
  const counts = Object.values(rankCounts).sort((a, b) => b - a);
  const isFlush = suits.every(s => s === suits[0]);
  const isStraight = (() => {
    const uniqueRanks = [...new Set(ranks)].sort((a, b) => b - a);
    if (uniqueRanks.length < 5) return false;
    for (let i = 0; i <= uniqueRanks.length - 5; i++) {
      if (uniqueRanks[i] - uniqueRanks[i + 4] === 4) return true;
    }
    if (uniqueRanks.includes(14) && uniqueRanks.includes(2) && uniqueRanks.includes(3) && uniqueRanks.includes(4) && uniqueRanks.includes(5)) return true;
    // 短牌：A-6-7-8-9 也是顺子
    if (shortDeck && uniqueRanks.includes(14) && uniqueRanks.includes(9) && uniqueRanks.includes(8) && uniqueRanks.includes(7) && uniqueRanks.includes(6)) return true;
    return false;
  })();

  const sortedUniqueRanks = [...new Set(ranks)].sort((a, b) => b - a);
  const straightRanks = [];
  for (let i = 0; i <= sortedUniqueRanks.length - 5; i++) {
    if (sortedUniqueRanks[i] - sortedUniqueRanks[i + 4] === 4) {
      straightRanks.push(sortedUniqueRanks.slice(i, i + 5));
      break;
    }
  }
  if (sortedUniqueRanks.includes(14) && sortedUniqueRanks.includes(2) && sortedUniqueRanks.includes(3) && sortedUniqueRanks.includes(4) && sortedUniqueRanks.includes(5)) {
    straightRanks.push([5, 4, 3, 2, 1]);
  }
  // 短牌：A-6-7-8-9 (A作为5)
  if (shortDeck && sortedUniqueRanks.includes(14) && sortedUniqueRanks.includes(9) && sortedUniqueRanks.includes(8) && sortedUniqueRanks.includes(7) && sortedUniqueRanks.includes(6)) {
    straightRanks.push([9, 8, 7, 6, 5]);
  }

  const getFlushCards = () => {
    const suitCounts = {};
    suits.forEach((s, i) => { if (!suitCounts[s]) suitCounts[s] = []; suitCounts[s].push(ranks[i]); });
    for (const s in suitCounts) {
      if (suitCounts[s].length >= 5) {
        return suitCounts[s].sort((a, b) => b - a).slice(0, 5);
      }
    }
    return null;
  };

  if (isFlush && isStraight) {
    const flushCards = getFlushCards();
    if (flushCards) {
      for (const sr of straightRanks) {
        if (sr.every(r => flushCards.includes(r))) {
          return { rank: 10, name: '皇家同花顺', value: sr };
        }
      }
      return { rank: 9, name: '同花顺', value: straightRanks[0] || flushCards.slice(0, 5) };
    }
  }
  if (counts[0] === 4) {
    const quadRank = parseInt(Object.keys(rankCounts).find(k => rankCounts[k] === 4));
    const kicker = ranks.find(r => r !== quadRank);
    return { rank: 8, name: '四条', value: [quadRank, quadRank, quadRank, quadRank, kicker] };
  }
  // 短牌: 同花(rank 7) > 葫芦(rank 6)
  if (isFlush) {
    const fc = getFlushCards();
    return { rank: shortDeck ? 7 : 6, name: '同花', value: fc };
  }
  if (counts[0] === 3 && counts[1] === 2) {
    const tripRank = parseInt(Object.keys(rankCounts).find(k => rankCounts[k] === 3));
    const pairRank = parseInt(Object.keys(rankCounts).find(k => rankCounts[k] === 2 && k !== tripRank.toString()));
    return { rank: shortDeck ? 6 : 7, name: '葫芦', value: [tripRank, tripRank, tripRank, pairRank, pairRank] };
  }
  // 短牌: 三条(rank 5) > 顺子(rank 4)
  if (counts[0] === 3) {
    const tripRank = parseInt(Object.keys(rankCounts).find(k => rankCounts[k] === 3));
    const kickers = ranks.filter(r => r !== tripRank).slice(0, 2);
    return { rank: shortDeck ? 5 : 4, name: '三条', value: [tripRank, tripRank, tripRank, ...kickers] };
  }
  if (isStraight) {
    return { rank: shortDeck ? 4 : 5, name: '顺子', value: straightRanks[0] || [14, 13, 12, 11, 10] };
  }
  if (counts[0] === 2 && counts[1] === 2) {
    const pairs = Object.keys(rankCounts).filter(k => rankCounts[k] === 2).map(Number).sort((a, b) => b - a);
    const kicker = ranks.find(r => !pairs.includes(r));
    return { rank: 3, name: '两对', value: [pairs[0], pairs[0], pairs[1], pairs[1], kicker] };
  }
  if (counts[0] === 2) {
    const pairRank = parseInt(Object.keys(rankCounts).find(k => rankCounts[k] === 2));
    const kickers = ranks.filter(r => r !== pairRank).slice(0, 3);
    return { rank: 2, name: '一对', value: [pairRank, pairRank, ...kickers] };
  }
  return { rank: 1, name: '高牌', value: ranks.slice(0, 5) };
}

function compareHands(a, b) {
  if (a.rank !== b.rank) return a.rank - b.rank;
  for (let i = 0; i < a.value.length; i++) {
    if (a.value[i] !== b.value[i]) return a.value[i] - b.value[i];
  }
  return 0;
}

function generateRoomNumber() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

exports.main = async (event, context) => {
  const { roomNumber } = event;
  const { OPENID } = cloud.getWXContext();

  if (!OPENID) return { success: false, error: '未登录' };

  try {
    const roomRes = await db.collection('rooms').where({ roomNumber }).get();
    if (!roomRes.data || roomRes.data.length === 0) return { success: false, error: '房间不存在' };

    const room = roomRes.data[0];
    const roomId = room._id;

    // 允许房主在 ended 状态下强制开始新回合（无需所有人准备）
    const isCreator = room.creatorOpenId === OPENID;
    const handCount = room.handCount || 0;
    const maxHands = room.maxHands || 10;
    const canForceStart = isCreator && room.status === 'ended' && handCount < maxHands;
    if (room.status !== 'waiting' && !canForceStart) {
      if (room.status === 'ended' && handCount >= maxHands) {
        return { success: false, error: '已达到最大回合数' };
      }
      return { success: false, error: '游戏已开始' };
    }

    // 只统计有筹码的活跃玩家
    const activePlayers = room.players.filter(p => p.chips > 0);
    if (activePlayers.length < 2) return { success: false, error: '至少需要2人（有筹码）' };

    // 计算新回合数
    const newHandCount = (room.handCount || 0) + 1;
    const isShortDeck = !!room.shortDeck;

    const deck = shuffle(createDeck(isShortDeck));
    const playerCount = activePlayers.length;

    // 如果庄家已出局，找下一个有筹码的人当庄家
    let dealerIdx = room.dealerIndex;
    let originalDealer = room.players[dealerIdx];
    if (!originalDealer || originalDealer.chips <= 0) {
      for (let i = 1; i <= room.players.length; i++) {
        const idx = (dealerIdx + i) % room.players.length;
        if (room.players[idx] && room.players[idx].chips > 0) {
          dealerIdx = idx;
          break;
        }
      }
    }
    const activeDealerIdx = activePlayers.findIndex(p => p.openId === room.players[dealerIdx].openId);

    const defaultChips = room.defaultChips || 10000;

    // 1. 先重置所有玩家状态（不重置筹码，保留上一轮结果）
    const updatedPlayers = room.players.map(p => {
      const isActive = p.chips > 0;
      return {
        ...p,
        isActive: isActive,
        isAllIn: false,
        hasActed: false,
        totalBetThisRound: 0,
        totalBet: 0,
        handResult: null,
        confirmedNext: false,
        holeCards: []
      };
    });

    // 2. 重新获取活跃玩家引用（指向 updatedPlayers 中的对象）
    const activeRefs = updatedPlayers.filter(p => p.isActive);

    // 3. 发手牌
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < activeRefs.length; j++) {
        activeRefs[j].holeCards.push(deck.pop());
      }
    }

    // 4. 扣盲注（在重置之后，避免被覆盖）
    const sbIdx = (activeDealerIdx + 1) % activeRefs.length;
    const bbIdx = (activeDealerIdx + 2) % activeRefs.length;
    const sbAmt = Math.min(room.smallBlind, activeRefs[sbIdx].chips);
    const bbAmt = Math.min(room.bigBlind, activeRefs[bbIdx].chips);
    activeRefs[sbIdx].chips -= sbAmt;
    activeRefs[sbIdx].totalBetThisRound = sbAmt;
    activeRefs[bbIdx].chips -= bbAmt;
    activeRefs[bbIdx].totalBetThisRound = bbAmt;

    const pot = sbAmt + bbAmt;
    const currentBet = bbAmt;
    const firstActorIdx = (bbIdx + 1) % activeRefs.length;

    const firstActorOpenId = activeRefs[firstActorIdx].openId;
    const currentPlayerIndex = updatedPlayers.findIndex(p => p.openId === firstActorOpenId);
    const fullDealerIdx = updatedPlayers.findIndex(p => p.openId === room.players[dealerIdx].openId);

    const now = Date.now();
    const historyMsg = newHandCount > 1 ? `第 ${newHandCount}/${room.maxHands || 10} 回合开始` : '新局开始';
    await db.collection('rooms').doc(roomId).update({
      data: {
        status: 'playing',
        startCountdownAt: 0,
        phase: 'PRE_FLOP',
        phaseIndex: 0,
        communityCards: [],
        pot,
        currentBet,
        minRaise: room.bigBlind,
        currentPlayerIndex: currentPlayerIndex,
        dealerIndex: fullDealerIdx,
        deck: deck.slice(0, 40).map(c => ({ value: c.value, suit: c.suit, rank: c.rank })),
        players: updatedPlayers,
        actions: [],
        gameHistory: [{ message: historyMsg, type: 'dealer', time: now }],
        updatedAt: now,
        handCount: newHandCount,
        maxHands: room.maxHands || 10
      }
    });

    const updatedRoom = await db.collection('rooms').doc(roomId).get();
    return { success: true, roomData: updatedRoom.data };
  } catch (err) {
    console.error('startGame error:', err);
    return { success: false, error: err.message };
  }
};