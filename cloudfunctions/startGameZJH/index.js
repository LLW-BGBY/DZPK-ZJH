// ============================
// 炸金花 开始游戏云函数
// 所有局部变量使用 zjh_ 前缀
// 复用现有房间、玩家数据结构
// ============================

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const SUITS = ['S', 'H', 'D', 'C'];
const VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

function zjh_createDeck() {
  const zjh_deck = [];
  for (let zjh_s = 0; zjh_s < SUITS.length; zjh_s++) {
    for (let zjh_v = 0; zjh_v < VALUES.length; zjh_v++) {
      zjh_deck.push({ value: VALUES[zjh_v], suit: SUITS[zjh_s], rank: zjh_v + 2 });
    }
  }
  return zjh_deck;
}

function zjh_shuffle(zjh_deck) {
  for (let zjh_i = zjh_deck.length - 1; zjh_i > 0; zjh_i--) {
    const zjh_j = Math.floor(Math.random() * (zjh_i + 1));
    [zjh_deck[zjh_i], zjh_deck[zjh_j]] = [zjh_deck[zjh_j], zjh_deck[zjh_i]];
  }
  return zjh_deck;
}

function zjh_findNextActor(zjh_players, zjh_startIdx) {
  const zjh_len = zjh_players.length;
  for (let zjh_i = 1; zjh_i <= zjh_len; zjh_i++) {
    const zjh_idx = (zjh_startIdx + zjh_i) % zjh_len;
    if (zjh_players[zjh_idx].isActive && !zjh_players[zjh_idx].isAllIn) return zjh_idx;
  }
  return -1;
}

exports.main = async (event, context) => {
  const { roomNumber } = event;
  const { OPENID } = cloud.getWXContext();

  if (!OPENID) return { success: false, error: '未登录' };

  try {
    const zjh_roomRes = await db.collection('rooms').where({ roomNumber }).get();
    if (!zjh_roomRes.data || zjh_roomRes.data.length === 0) {
      return { success: false, error: '房间不存在' };
    }

    const zjh_room = zjh_roomRes.data[0];
    const zjh_roomId = zjh_room._id;

    // 权限检查
    const zjh_isCreator = zjh_room.creatorOpenId === OPENID;
    const zjh_handCount = zjh_room.handCount || 0;
    const zjh_maxHands = zjh_room.maxHands || 10;
    const zjh_canForceStart = zjh_isCreator && zjh_room.status === 'ended' && zjh_handCount < zjh_maxHands;

    if (zjh_room.status !== 'waiting' && !zjh_canForceStart) {
      if (zjh_room.status === 'ended' && zjh_handCount >= zjh_maxHands) {
        return { success: false, error: '已达到最大回合数' };
      }
      return { success: false, error: '游戏已开始' };
    }

    // 只统计有筹码的活跃玩家
    const zjh_activePlayers = zjh_room.players.filter(p => p.chips > 0);
    if (zjh_activePlayers.length < 2) {
      return { success: false, error: '至少需要2人（有筹码）' };
    }

    // 计算新回合数
    const zjh_newHandCount = (zjh_room.handCount || 0) + 1;

    // 炸金花配置
    const zjh_baseBet = zjh_room.zjh_baseBet || 100;
    const zjh_maxRounds = zjh_room.zjh_maxRounds || 20;

    // 创建牌组并发牌
    const zjh_deck = zjh_shuffle(zjh_createDeck());

    // 如果庄家已出局，找下一个有筹码的人当庄家
    let zjh_dealerIdx = zjh_room.dealerIndex;
    let zjh_originalDealer = zjh_room.players[zjh_dealerIdx];
    if (!zjh_originalDealer || zjh_originalDealer.chips <= 0) {
      for (let zjh_i = 1; zjh_i <= zjh_room.players.length; zjh_i++) {
        const zjh_idx = (zjh_dealerIdx + zjh_i) % zjh_room.players.length;
        if (zjh_room.players[zjh_idx] && zjh_room.players[zjh_idx].chips > 0) {
          zjh_dealerIdx = zjh_idx;
          break;
        }
      }
    }

    // 重置所有玩家状态
    const zjh_updatedPlayers = zjh_room.players.map(p => {
      const zjh_isActive = p.chips > 0;
      return {
        ...p,
        isActive: zjh_isActive,
        isAllIn: false,
        hasActed: false,
        totalBetThisRound: 0,
        totalBet: 0,
        handResult: null,
        zjh_isDark: true,
        zjh_handResult: null,
        confirmedNext: false,
        zjh_compareConfirmed: false,
        holeCards: []
      };
    });

    // 重新获取活跃玩家引用
    const zjh_activeRefs = zjh_updatedPlayers.filter(p => p.isActive);

    // 发3张手牌 (炸金花)
    for (let zjh_i = 0; zjh_i < 3; zjh_i++) {
      for (let zjh_j = 0; zjh_j < zjh_activeRefs.length; zjh_j++) {
        zjh_activeRefs[zjh_j].holeCards.push(zjh_deck.pop());
      }
    }

    // 收取底注 (每人 zjh_baseBet)，底注不计入跟注进度
    let zjh_totalPot = 0;
    const zjh_anteMessages = [];
    for (const p of zjh_activeRefs) {
      const zjh_ante = Math.min(zjh_baseBet, p.chips);
      p.chips -= zjh_ante;
      p.totalBetThisRound = 0;
      zjh_totalPot += zjh_ante;
      zjh_anteMessages.push(`${p.name} 支付底注 ${zjh_ante}`);
    }

    // 确定第一个行动玩家 (庄家下家)
    const zjh_firstActor = zjh_findNextActor(zjh_updatedPlayers, zjh_dealerIdx);
    let zjh_currentPlayerIndex = zjh_firstActor >= 0 ? zjh_firstActor : 0;

    const zjh_now = Date.now();
    const zjh_historyMsg = zjh_newHandCount > 1
      ? `第 ${zjh_newHandCount}/${zjh_maxHands} 回合开始 (炸金花)`
      : '新局开始 (炸金花)';

    const zjh_gameHistory = [
      { message: zjh_historyMsg, type: 'system', time: zjh_now },
      { message: `底注 ${zjh_baseBet}，当前底池 ${zjh_totalPot}`, type: 'system', time: zjh_now }
    ];
    for (const zjh_anteMsg of zjh_anteMessages) {
      zjh_gameHistory.push({ message: zjh_anteMsg, type: 'action', time: zjh_now });
    }

    await db.collection('rooms').doc(zjh_roomId).update({
      data: {
        status: 'playing',
        startCountdownAt: 0,
        zjh_lastCompare: {},
        phase: 'PLAYING',
        phaseIndex: 0,
        communityCards: [],
        pot: zjh_totalPot,
        currentBet: zjh_baseBet,
        minRaise: zjh_baseBet,
        currentPlayerIndex: zjh_currentPlayerIndex,
        dealerIndex: zjh_dealerIdx,
        deck: zjh_deck.slice(0, 40).map(c => ({ value: c.value, suit: c.suit, rank: c.rank })),
        players: zjh_updatedPlayers,
        actions: [],
        gameHistory: zjh_gameHistory,
        updatedAt: zjh_now,
        handCount: zjh_newHandCount,
        maxHands: zjh_room.maxHands || 10,
        // 炸金花特有字段
        zjh_baseBet: zjh_baseBet,
        zjh_maxRounds: zjh_maxRounds,
        zjh_roundCount: 0,
        zjh_lastRaiser: ''
      }
    });

    const zjh_updatedRoom = await db.collection('rooms').doc(zjh_roomId).get();
    return { success: true, roomData: zjh_updatedRoom.data };
  } catch (zjh_err) {
    console.error('startGameZJH error:', zjh_err);
    return { success: false, error: zjh_err.message };
  }
};