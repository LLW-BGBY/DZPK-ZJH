// ============================
// 炸金花 游戏动作云函数
// 所有局部变量使用 zjh_ 前缀，与德州扑克变量 (toCall, callAmount) 完全隔离
// 复用现有房间、筹码、底池、玩家余额校验逻辑
// ============================

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// 数据库更新重试（解决 502001 限流/并发冲突）
async function zjh_updateWithRetry(collection, docId, data, maxRetries = 3) {
  for (let zjh_attempt = 0; zjh_attempt <= maxRetries; zjh_attempt++) {
    try {
      await collection.doc(docId).update({ data });
      return;
    } catch (zjh_err) {
      if (zjh_attempt < maxRetries && (zjh_err.errCode === 502001 || zjh_err.errCode === -1)) {
        const zjh_delay = Math.pow(2, zjh_attempt) * 200;
        console.warn('zjh_updateWithRetry attempt', zjh_attempt + 1, 'retrying in', zjh_delay, 'ms');
        await new Promise(resolve => setTimeout(resolve, zjh_delay));
      } else {
        throw zjh_err;
      }
    }
  }
}

// 引入炸金花引擎 (云函数独立部署，从本地引入)
const {
  zjh_evaluateHand,
  zjh_compareHands,
  zjh_distributePot,
  zjh_isOnlyOneActive,
  zjh_findNextActor,
  zjh_processAction,
  zjh_forceShowdown,
  zjh_isCapReached
} = require('./zha-jinhua.js');

// ============================
// 牌组工具 (与德州共享)
// ============================

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

// ============================
// 游戏记录保存 (复用德州记录结构)
// ============================

async function zjh_saveGameRecord(zjh_roomId, zjh_room, zjh_players, zjh_history) {
  try {
    const zjh_record = {
      roomId: zjh_roomId,
      roomNumber: zjh_room.roomNumber,
      roomName: zjh_room.roomName,
      defaultChips: zjh_room.defaultChips || 10000,
      gameType: 'zjh',
      players: zjh_players.map(p => ({
        openId: p.openId,
        name: p.name,
        avatarUrl: p.avatarUrl || '',
        chips: p.chips,
        totalBet: (p.totalBet || 0) + (p.totalBetThisRound || 0),
        profit: p.profit || 0,
        winAmount: p.winAmount || 0,
        lossAmount: p.lossAmount || 0,
        isActive: p.isActive,
        isAllIn: p.isAllIn,
        zjh_isDark: p.zjh_isDark,
        zjh_handResult: p.zjh_handResult ? {
          name: p.zjh_handResult.name,
          score: p.zjh_handResult.score,
          rank: p.zjh_handResult.rank
        } : null,
        holeCards: p.holeCards || []
      })),
      gameHistory: zjh_history.slice(-10),
      createdAt: Date.now()
    };
    await db.collection('gameRecords').add({ data: zjh_record });
  } catch (zjh_err) {
    console.error('zjh_saveGameRecord error:', zjh_err);
  }
}

// ============================
// 主函数
// ============================

exports.main = async (event, context) => {
  const { roomId, action, amount = 0, targetOpenId = '' } = event;
  const zjh_amountInt = Math.floor(Number(amount) || 0);
  const { OPENID } = cloud.getWXContext();

  if (!OPENID) return { success: false, error: '未登录' };
  if (!roomId) return { success: false, error: '缺少房间ID' };

  try {
    const zjh_roomRes = await db.collection('rooms').doc(roomId).get();
    if (!zjh_roomRes.data) return { success: false, error: '房间不存在' };

    const zjh_room = zjh_roomRes.data;
    if (zjh_room.status !== 'playing') return { success: false, error: '游戏未开始' };
    if (zjh_room.phase === 'SHOWDOWN' || zjh_room.phase === 'ENDED') {
      return { success: false, error: '本局已结束' };
    }

    const zjh_currentPlayer = zjh_room.players[zjh_room.currentPlayerIndex];
    if (!zjh_currentPlayer || zjh_currentPlayer.openId !== OPENID) {
      return { success: false, error: '不是你的回合' };
    }
    if (!zjh_currentPlayer.isActive) return { success: false, error: '你已弃牌' };
    if (zjh_currentPlayer.isAllIn) return { success: false, error: '你已全押' };

    const zjh_now = Date.now();
    let zjh_history = zjh_room.gameHistory || [];
    let zjh_players = [...zjh_room.players];
    let zjh_pot = zjh_room.pot;
    let zjh_currentBet = zjh_room.currentBet || zjh_room.zjh_baseBet || 100;
    let zjh_minRaise = zjh_room.minRaise || zjh_room.zjh_baseBet || 100;
    let zjh_baseBet = zjh_room.zjh_baseBet || 100;
    let zjh_maxRounds = zjh_room.zjh_maxRounds || 20;
    let zjh_roundCount = zjh_room.zjh_roundCount || 0;
    let zjh_currentPlayerIndex = zjh_room.currentPlayerIndex;
    let zjh_deck = [...(zjh_room.deck || [])];
    let zjh_phase = zjh_room.phase || 'PLAYING';
    let zjh_lastRaiser = zjh_room.zjh_lastRaiser || '';

    // 构建游戏上下文
    const zjh_ctx = {
      players: zjh_players,
      pot: zjh_pot,
      currentBet: zjh_currentBet,
      minRaise: zjh_minRaise,
      baseBet: zjh_baseBet,
      maxRounds: zjh_maxRounds,
      roundCount: zjh_roundCount,
      currentPlayerIndex: zjh_currentPlayerIndex,
      history: zjh_history,
      deck: zjh_deck,
      zjh_lastRaiser: zjh_lastRaiser
    };

    // 处理玩家动作
    const zjh_result = zjh_processAction(zjh_ctx, action, zjh_amountInt, targetOpenId);

    if (!zjh_result.success) {
      return { success: false, error: zjh_result.error };
    }

    // 回写上下文
    zjh_pot = zjh_ctx.pot;
    zjh_currentBet = zjh_ctx.currentBet;
    zjh_minRaise = zjh_ctx.minRaise;
    zjh_roundCount = zjh_ctx.roundCount;
    zjh_history = zjh_ctx.history;
    zjh_lastRaiser = zjh_ctx.zjh_lastRaiser;

    // 添加历史记录
    if (zjh_result.actionMsg) {
      zjh_history.push({ message: zjh_result.actionMsg, type: zjh_result.actionType, time: zjh_now });
    }

    // 检查是否只剩1名活跃玩家 → 立即结束
    if (zjh_isOnlyOneActive(zjh_players)) {
      const zjh_winner = zjh_players.find(p => p.isActive);
      if (zjh_winner) {
        zjh_winner.chips += zjh_pot;
        // 评估赢家牌型
        if (zjh_winner.holeCards && zjh_winner.holeCards.length > 0) {
          zjh_winner.zjh_handResult = zjh_evaluateHand([...zjh_winner.holeCards]);
        }
        // 评估梭哈玩家的牌型（避免结算时显示"已弃牌"）
        for (const p of zjh_players) {
          if (p.isAllIn && p.holeCards && p.holeCards.length > 0 && !p.zjh_handResult) {
            p.zjh_handResult = zjh_evaluateHand([...p.holeCards]);
          }
        }
        // 计算盈亏
        const zjh_getTotalBet = (p) => (p.totalBet || 0) + (p.totalBetThisRound || 0);
        const zjh_winnerBet = zjh_getTotalBet(zjh_winner);
        for (const p of zjh_players) {
          const zjh_bet = zjh_getTotalBet(p);
          if (p.openId === zjh_winner.openId) {
            p.profit = zjh_pot - zjh_winnerBet;
            p.winAmount = zjh_pot - zjh_winnerBet;
            p.lossAmount = 0;
            p.totalProfit = (p.totalProfit || 0) + p.profit;
          } else if (zjh_bet > 0) {
            p.profit = -zjh_bet;
            p.winAmount = 0;
            p.lossAmount = zjh_bet;
            p.totalProfit = (p.totalProfit || 0) + p.profit;
          } else {
            p.profit = 0;
            p.winAmount = 0;
            p.lossAmount = 0;
          }
        }
        zjh_phase = 'SHOWDOWN';
        zjh_history.push({
          message: `${zjh_winner.name} 获胜（其他玩家弃牌）`,
          type: 'win', time: zjh_now
        });
      }

      const zjh_status = 'ended';
      // 将旁观者自动转为玩家（用于下一局）
      const zjh_spectators = zjh_room.spectators || [];
      let zjh_promoted = [];
      if (zjh_spectators.length > 0) {
        const zjh_joinTime = Date.now();
        zjh_promoted = zjh_spectators.map((s, i) => ({
          openId: s.openId,
          name: s.name,
          avatarUrl: s.avatarUrl || '',
          isReady: false,
          isActive: true,
          isAllIn: false,
          hasActed: false,
          totalBetThisRound: 0,
          totalBet: 0,
          chips: zjh_room.defaultChips || 10000,
          holeCards: [],
          handResult: null,
          rebuyCount: 0,
          seat: zjh_players.length + i,
          joinedAt: zjh_joinTime,
          zjh_isDark: true,
          confirmedNext: false
        }));
        zjh_players.push(...zjh_promoted);
      }
      const zjh_endData = {
        status: zjh_status, phase: zjh_phase, pot: zjh_pot, currentBet: zjh_currentBet,
        minRaise: zjh_minRaise, zjh_roundCount: zjh_roundCount,
        currentPlayerIndex: zjh_currentPlayerIndex, zjh_lastRaiser: zjh_lastRaiser,
        players: JSON.parse(JSON.stringify(zjh_players)), gameHistory: zjh_history, updatedAt: zjh_now,
        spectators: zjh_promoted.length > 0 ? [] : zjh_spectators
      };
      if (zjh_result.compareDetail) {
        zjh_endData.zjh_lastCompare = JSON.parse(JSON.stringify(zjh_result.compareDetail));
        zjh_endData.zjh_compareConfirmMap = {};
      }
      await zjh_updateWithRetry(db.collection('rooms'), roomId, zjh_endData);
      await zjh_saveGameRecord(roomId, zjh_room, zjh_players, zjh_history);
      return { success: true };
    }



    // 检查封顶条件 → 强制比牌
    if (zjh_isCapReached(zjh_players, zjh_maxRounds, zjh_roundCount)) {
      zjh_forceShowdown(zjh_players, zjh_history);

      // 执行边池分配
      const zjh_distResult = zjh_distributePot(zjh_players, zjh_pot);
      const zjh_winnerNames = zjh_distResult.winnerNames;
      const zjh_playerResults = zjh_distResult.playerResults || [];

      // 将盈亏信息保存到每个玩家
      for (const pr of zjh_playerResults) {
        const p = zjh_players.find(pl => pl.openId === pr.openId);
        if (p) {
          p.profit = pr.profit;
          p.winAmount = pr.winAmount;
          p.lossAmount = pr.lossAmount;
          p.totalProfit = (p.totalProfit || 0) + pr.profit;
        }
      }

      if (zjh_winnerNames.length > 0) {
        const zjh_names = zjh_winnerNames.map(w => w.name).join(', ');
        const zjh_totalWin = zjh_winnerNames.reduce((sum, w) => sum + w.winAmount, 0);
        zjh_history.push({
          message: `封顶结算: ${zjh_names}获胜，共获得 ${zjh_totalWin} 筹码`,
          type: 'win', time: zjh_now
        });
      }

      zjh_phase = 'SHOWDOWN';
      const zjh_status = 'ended';
      // 将旁观者自动转为玩家
      const zjh_spectators2 = zjh_room.spectators || [];
      let zjh_promoted2 = [];
      if (zjh_spectators2.length > 0) {
        const zjh_jt = Date.now();
        zjh_promoted2 = zjh_spectators2.map((s, i) => ({
          openId: s.openId, name: s.name, avatarUrl: s.avatarUrl || '',
          isReady: false, isActive: true, isAllIn: false, hasActed: false,
          totalBetThisRound: 0, totalBet: 0, chips: zjh_room.defaultChips || 10000,
          holeCards: [], handResult: null, rebuyCount: 0,
          seat: zjh_players.length + i, joinedAt: zjh_jt,
          zjh_isDark: true, confirmedNext: false
        }));
        zjh_players.push(...zjh_promoted2);
      }
      const zjh_capData = {
        status: zjh_status, phase: zjh_phase, pot: zjh_pot, currentBet: zjh_currentBet,
        minRaise: zjh_minRaise, zjh_roundCount: zjh_roundCount,
        currentPlayerIndex: zjh_currentPlayerIndex, zjh_lastRaiser: zjh_lastRaiser,
        players: JSON.parse(JSON.stringify(zjh_players)), gameHistory: zjh_history, updatedAt: zjh_now,
        spectators: zjh_promoted2.length > 0 ? [] : zjh_spectators2
      };
      if (zjh_result.compareDetail) {
        zjh_capData.zjh_lastCompare = JSON.parse(JSON.stringify(zjh_result.compareDetail));
        zjh_capData.zjh_compareConfirmMap = {};
      }
      await zjh_updateWithRetry(db.collection('rooms'), roomId, zjh_capData);
      await zjh_saveGameRecord(roomId, zjh_room, zjh_players, zjh_history);
      return { success: true };
    }

    // 看牌后不切换玩家，当前玩家继续操作
    if (!zjh_result.skipAdvance) {
      // 正常推进到下一个玩家
      zjh_currentPlayerIndex = zjh_findNextActor(zjh_players, zjh_currentPlayerIndex);

      // 如果找不到下一个玩家 (所有人都allin了), 强制结束
      if (zjh_currentPlayerIndex === -1) {
        zjh_forceShowdown(zjh_players, zjh_history);

        const zjh_distResult = zjh_distributePot(zjh_players, zjh_pot);
        const zjh_winnerNames = zjh_distResult.winnerNames;
        const zjh_playerResults = zjh_distResult.playerResults || [];

        for (const pr of zjh_playerResults) {
          const p = zjh_players.find(pl => pl.openId === pr.openId);
          if (p) {
            p.profit = pr.profit;
            p.winAmount = pr.winAmount;
            p.lossAmount = pr.lossAmount;
            p.totalProfit = (p.totalProfit || 0) + pr.profit;
          }
        }

        if (zjh_winnerNames.length > 0) {
          const zjh_names = zjh_winnerNames.map(w => w.name).join(', ');
          const zjh_totalWin = zjh_winnerNames.reduce((sum, w) => sum + w.winAmount, 0);
          zjh_history.push({
            message: `结算: ${zjh_names}获胜，共获得 ${zjh_totalWin} 筹码`,
            type: 'win', time: zjh_now
          });
        }

        zjh_phase = 'SHOWDOWN';
        const zjh_status = 'ended';
        // 将旁观者自动转为玩家
        const zjh_spectators3 = zjh_room.spectators || [];
        let zjh_promoted3 = [];
        if (zjh_spectators3.length > 0) {
          const zjh_jt3 = Date.now();
          zjh_promoted3 = zjh_spectators3.map((s, i) => ({
            openId: s.openId, name: s.name, avatarUrl: s.avatarUrl || '',
            isReady: false, isActive: true, isAllIn: false, hasActed: false,
            totalBetThisRound: 0, totalBet: 0, chips: zjh_room.defaultChips || 10000,
            holeCards: [], handResult: null, rebuyCount: 0,
            seat: zjh_players.length + i, joinedAt: zjh_jt3,
            zjh_isDark: true, confirmedNext: false
          }));
          zjh_players.push(...zjh_promoted3);
        }
        const zjh_allInData = {
          status: zjh_status, phase: zjh_phase, pot: zjh_pot, currentBet: zjh_currentBet,
          minRaise: zjh_minRaise, zjh_roundCount: zjh_roundCount,
          currentPlayerIndex: zjh_currentPlayerIndex, zjh_lastRaiser: zjh_lastRaiser,
          players: JSON.parse(JSON.stringify(zjh_players)), gameHistory: zjh_history, updatedAt: zjh_now,
          spectators: zjh_promoted3.length > 0 ? [] : zjh_spectators3
        };
        if (zjh_result.compareDetail) {
          zjh_allInData.zjh_lastCompare = JSON.parse(JSON.stringify(zjh_result.compareDetail));
          zjh_allInData.zjh_compareConfirmMap = {};
        }
        await zjh_updateWithRetry(db.collection('rooms'), roomId, zjh_allInData);
        await zjh_saveGameRecord(roomId, zjh_room, zjh_players, zjh_history);
        return { success: true };
      }
    }

    // 更新数据库
    const zjh_status = 'playing';
    const zjh_updateData = {
      status: zjh_status, phase: zjh_phase, pot: zjh_pot, currentBet: zjh_currentBet,
      minRaise: zjh_minRaise, zjh_roundCount: zjh_roundCount,
      currentPlayerIndex: zjh_currentPlayerIndex, zjh_lastRaiser: zjh_lastRaiser,
      deck: zjh_deck.slice(0, 40), players: JSON.parse(JSON.stringify(zjh_players)),
      gameHistory: zjh_history, updatedAt: zjh_now
    };
    if (zjh_result.compareDetail) {
      zjh_updateData.zjh_lastCompare = JSON.parse(JSON.stringify(zjh_result.compareDetail));
      zjh_updateData.zjh_compareConfirmMap = {};
    }
    await zjh_updateWithRetry(db.collection('rooms'), roomId, zjh_updateData);

    return { success: true };
  } catch (zjh_err) {
    console.error('gameActionZJH error:', zjh_err);
    return { success: false, error: zjh_err.message };
  }
};