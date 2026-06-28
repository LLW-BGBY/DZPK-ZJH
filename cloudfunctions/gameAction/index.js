const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const PHASES = ['PRE_FLOP', 'FLOP', 'TURN', 'RIVER', 'SHOWDOWN'];

// ============ 牌组工具 (移植自新代码库 cards.js) ============

const RANK_VALUES = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };

/** C(n, k) 组合生成 */
function combinations(arr, k) {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  if (k === 1) return arr.map(x => [x]);
  if (k === arr.length) return [arr];
  const result = [];
  const first = arr[0];
  const rest = arr.slice(1);
  for (const combo of combinations(rest, k - 1)) result.push([first, ...combo]);
  for (const combo of combinations(rest, k)) result.push(combo);
  return result;
}

/** 评估5张牌的牌型 (score 数值越大越强) */
function scoreHand(cards) {
  if (cards.length !== 5) return { rank: -1, score: 0, name: '无效', kickers: [] };
  const values = cards.map(c => RANK_VALUES[c.value] || 0).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);
  const isFlush = suits.every(s => s === suits[0]);

  let isStraight = false, straightHigh = 0;
  const uniqueValues = [...new Set(values)];
  if (uniqueValues.length === 5) {
    if (values[0] - values[4] === 4) { isStraight = true; straightHigh = values[0]; }
    if (values[0] === 14 && values[1] === 5 && values[2] === 4 && values[3] === 3 && values[4] === 2) {
      isStraight = true; straightHigh = 5;
    }
  }

  const countMap = {};
  values.forEach(v => countMap[v] = (countMap[v] || 0) + 1);
  const groups = Object.entries(countMap).map(([v, c]) => ({ value: parseInt(v), count: c }))
    .sort((a, b) => b.count - a.count || b.value - a.value);

  // 皇家同花顺
  if (isFlush && isStraight && straightHigh === 14) return { rank: 10, score: 10000000, name: '皇家同花顺', kickers: [14] };
  // 同花顺
  if (isFlush && isStraight) return { rank: 9, score: 9000000 + straightHigh, name: '同花顺', kickers: [straightHigh] };
  // 四条
  if (groups[0].count === 4) {
    const quad = groups[0].value, kicker = groups[1].value;
    return { rank: 8, score: 8000000 + quad * 100 + kicker, name: '四条', kickers: [quad, kicker] };
  }
  // 葫芦
  if (groups[0].count === 3 && groups[1].count === 2) {
    const trip = groups[0].value, pair = groups[1].value;
    return { rank: 7, score: 7000000 + trip * 100 + pair, name: '葫芦', kickers: [trip, pair] };
  }
  // 同花
  if (isFlush) {
    const s = values[0] * 10000 + values[1] * 1000 + values[2] * 100 + values[3] * 10 + values[4];
    return { rank: 6, score: 6000000 + s, name: '同花', kickers: values };
  }
  // 顺子
  if (isStraight) return { rank: 5, score: 5000000 + straightHigh, name: '顺子', kickers: [straightHigh] };
  // 三条
  if (groups[0].count === 3) {
    const trip = groups[0].value;
    const k = groups.filter(g => g.count === 1).map(g => g.value).sort((a, b) => b - a);
    return { rank: 4, score: 4000000 + trip * 10000 + k[0] * 100 + k[1], name: '三条', kickers: [trip, ...k] };
  }
  // 两对
  if (groups[0].count === 2 && groups[1].count === 2) {
    const high = Math.max(groups[0].value, groups[1].value);
    const low = Math.min(groups[0].value, groups[1].value);
    const kicker = groups[2].value;
    return { rank: 3, score: 3000000 + high * 10000 + low * 100 + kicker, name: '两对', kickers: [high, low, kicker] };
  }
  // 一对
  if (groups[0].count === 2) {
    const pair = groups[0].value;
    const k = groups.filter(g => g.count === 1).map(g => g.value).sort((a, b) => b - a);
    return { rank: 2, score: 2000000 + pair * 10000 + k[0] * 1000 + k[1] * 100 + k[2], name: '一对', kickers: [pair, ...k] };
  }
  // 高牌
  const s = values[0] * 10000 + values[1] * 1000 + values[2] * 100 + values[3] * 10 + values[4];
  return { rank: 1, score: s, name: '高牌', kickers: values };
}

/** 从7张牌中选最佳5张组合 */
function evaluateBestHand(cards) {
  if (!cards || cards.length < 2) return { rank: -1, score: 0, name: '未知', value: [] };
  if (cards.length < 5) {
    const s = scoreHand(cards);
    return { ...s, value: cards.map(c => RANK_VALUES[c.value] || 0) };
  }
  const combos = combinations(cards, 5);
  let best = null;
  for (const combo of combos) {
    const result = scoreHand(combo);
    if (!best || result.score > best.score) best = { ...result, value: combo.map(c => RANK_VALUES[c.value] || 0) };
  }
  return best || { rank: 1, score: 0, name: '高牌', value: cards.slice(0, 5).map(c => RANK_VALUES[c.value] || 0) };
}

function compareHands(a, b) {
  if (a.score !== b.score) return a.score - b.score;
  for (let i = 0; i < Math.min(a.kickers.length, b.kickers.length); i++) {
    if (a.kickers[i] !== b.kickers[i]) return a.kickers[i] - b.kickers[i];
  }
  return 0;
}

// ============ 边池计算 (移植自新代码库 GameEngine.distributePot) ============

/**
 * 边池计算与分配 (核心修复版)
 * 正确处理: 主池+多个边池、弃牌玩家不参与分配但其筹码留在池中、平局精确分配、all-in玩家只能赢取其投入额度对应的池
 */
function distributePot(players, communityCards, pot) {
  const active = players.filter(p => !p.isActive ? false : true); // 未弃牌 = isActive === true

  // 收集所有下注信息
  const betLevels = [];
  for (const p of players) {
    const totalBet = p.totalBet || 0;
    if (totalBet > 0) {
      betLevels.push({ openId: p.openId, amount: totalBet, folded: !p.isActive });
    }
  }
  betLevels.sort((a, b) => a.amount - b.amount);

  // 去重下注层级
  const uniqueLevels = [];
  let lastAmount = 0;
  for (const bl of betLevels) {
    if (bl.amount > lastAmount) {
      uniqueLevels.push(bl.amount);
      lastAmount = bl.amount;
    }
  }

  // 构建边池
  const pots = [];
  let processedAmount = 0;

  for (const level of uniqueLevels) {
    const levelDiff = level - processedAmount;
    if (levelDiff <= 0) continue;

    const contributors = betLevels.filter(b => b.amount >= level);
    const potAmount = levelDiff * contributors.length;

    // 该池的赢家候选人 = 未弃牌且投入达到该层级的玩家
    const eligible = active.filter(p => (p.totalBet || 0) >= level);

    if (eligible.length > 0) {
      let bestScore = -1;
      let winners = [];

      for (const p of eligible) {
        if (!p.handResult) continue;
        if (p.handResult.score > bestScore) {
          bestScore = p.handResult.score;
          winners = [p.openId];
        } else if (p.handResult.score === bestScore) {
          winners.push(p.openId);
        }
      }

      pots.push({ amount: potAmount, winners, level });
    } else {
      const fallback = betLevels.filter(b => b.amount >= level).sort((a, b) => b.amount - a.amount);
      if (fallback.length > 0) {
        pots.push({ amount: potAmount, winners: [fallback[0].openId], level });
      }
    }

    processedAmount = level;
  }

  // 验证: 所有池的总和应该等于 pot
  const totalPots = pots.reduce((s, p) => s + p.amount, 0);
  if (totalPots !== pot) {
    const diff = pot - totalPots;
    if (diff > 0 && pots.length > 0) {
      pots[pots.length - 1].amount += diff;
    } else if (diff > 0) {
      pots.push({ amount: diff, winners: [active[0]?.openId].filter(Boolean), level: 0 });
    }
  }

  // 分配筹码
  const profits = {};
  for (const p of players) profits[p.openId] = -(p.totalBet || 0);

  for (const pot of pots) {
    if (pot.winners.length === 0 || pot.amount <= 0) continue;
    const share = Math.floor(pot.amount / pot.winners.length);
    const remainder = pot.amount - share * pot.winners.length;

    pot.winners.forEach((openId, idx) => {
      const p = players.find(pl => pl.openId === openId);
      if (!p) return;
      const extra = idx === 0 ? remainder : 0;
      p.chips += share + extra;
      profits[openId] = (profits[openId] || 0) + share + extra;
    });
  }

  // 生成结果：包含所有玩家的盈亏信息
  const winnerNames = [];
  const playerResults = [];
  for (const p of players) {
    const profit = profits[p.openId] || 0;
    const result = {
      openId: p.openId,
      name: p.name,
      handName: p.handResult ? p.handResult.name : '',
      winAmount: profit > 0 ? profit : 0,
      lossAmount: profit < 0 ? -profit : 0,
      profit: profit,
      chips: p.chips,
      isWinner: profit > 0
    };
    playerResults.push(result);
    if (profit > 0) {
      winnerNames.push(result);
    }
  }

  return { winnerNames, pots, playerResults };
}

// ============ 游戏记录保存 ============

/** 每局结束时保存记录到 gameRecords 集合，用于战绩统计 */
async function saveGameRecord(roomId, room, players, communityCards, history) {
  try {
    const record = {
      roomId: roomId,
      roomNumber: room.roomNumber,
      roomName: room.roomName,
      defaultChips: room.defaultChips || 10000,
      players: players.map(p => ({
        openId: p.openId,
        name: p.name,
        avatarUrl: p.avatarUrl || '',
        chips: p.chips,
        totalBet: p.totalBet || 0,
        isActive: p.isActive,
        isAllIn: p.isAllIn,
        handResult: p.handResult ? {
          name: p.handResult.name,
          score: p.handResult.score,
          rank: p.handResult.rank
        } : null,
        holeCards: p.holeCards || []
      })),
      gameType: 'poker',
      communityCards: communityCards.map(c => ({
        value: c.value,
        suit: c.suit
      })),
      gameHistory: history.slice(-10),
      createdAt: Date.now()
    };
    await db.collection('gameRecords').add({ data: record });
  } catch (err) {
    console.error('saveGameRecord error:', err);
  }
}

// ============ 辅助函数 ============

function findNextActor(players, startIdx) {
  const len = players.length;
  for (let i = 1; i <= len; i++) {
    const idx = (startIdx + i) % len;
    if (players[idx].isActive && !players[idx].isAllIn) return idx;
  }
  return -1;
}

function shouldAdvancePhase(players, currentBet) {
  const active = players.filter(p => p.isActive);
  if (active.length <= 1) return true;
  const allActed = active.every(p => p.hasActed || p.isAllIn);
  const allMatched = active.every(p => p.isAllIn || p.totalBetThisRound === currentBet || p.chips === 0);
  return allActed && allMatched;
}

function autoAdvanceAllIn(players, communityCards, deck, history) {
  const needed = 5 - communityCards.length;
  if (needed > 0) {
    for (let i = 0; i < needed; i++) {
      if (deck.length > 0) {
        deck.pop(); // burn
        const card = deck.pop();
        if (card) communityCards.push(card);
      }
    }
    if (communityCards.length === 5) {
      const allCards = communityCards.map(c => c.value + c.suit).join(' ');
      history.push({ message: `公共牌: ${allCards}`, type: 'card', time: Date.now() });
    } else if (communityCards.length === 3) {
      const cards = communityCards.slice(0, 3).map(c => c.value + c.suit).join(' ');
      history.push({ message: `翻牌: ${cards}`, type: 'card', time: Date.now() });
    }
  }
  return { communityCards, deck, history };
}

// ============ 主函数 ============

exports.main = async (event, context) => {
  const { roomId, action, amount = 0 } = event;
  const amountInt = Math.floor(Number(amount) || 0);
  const { OPENID } = cloud.getWXContext();

  if (!OPENID) return { success: false, error: '未登录' };
  if (!roomId) return { success: false, error: '缺少房间ID' };

  try {
    const roomRes = await db.collection('rooms').doc(roomId).get();
    if (!roomRes.data) return { success: false, error: '房间不存在' };

    const room = roomRes.data;
    if (room.status !== 'playing') return { success: false, error: '游戏未开始' };
    if (room.phase === 'SHOWDOWN') return { success: false, error: '本局已结束' };

    const currentPlayer = room.players[room.currentPlayerIndex];
    if (!currentPlayer || currentPlayer.openId !== OPENID) return { success: false, error: '不是你的回合' };
    if (!currentPlayer.isActive) return { success: false, error: '你已弃牌' };
    if (currentPlayer.isAllIn) return { success: false, error: '你已全押' };

    const toCall = room.currentBet - currentPlayer.totalBetThisRound;
    const now = Date.now();
    let history = room.gameHistory || [];
    let players = [...room.players];
    let phase = room.phase;
    let phaseIndex = room.phaseIndex;
    let pot = room.pot;
    let currentBet = room.currentBet;
    let minRaise = room.minRaise;
    let currentPlayerIndex = room.currentPlayerIndex;
    let communityCards = [...room.communityCards];
    let deck = [...room.deck];

    const player = players[currentPlayerIndex];
    let actionMsg = '';
    let actionType = '';

    switch (action) {
      case 'fold':
        player.isActive = false;
        actionMsg = `${player.name} 弃牌`;
        actionType = 'fold';
        break;

      case 'check':
        if (toCall > 0) return { success: false, error: '需要跟注才能过牌' };
        actionMsg = `${player.name} 过牌`;
        actionType = 'check';
        break;

      case 'call':
        const callAmt = Math.min(toCall, player.chips);
        player.chips -= callAmt;
        player.totalBetThisRound += callAmt;
        pot += callAmt;
        if (player.chips === 0) {
          player.isAllIn = true;
          actionMsg = `${player.name} 全押跟注到 ${player.totalBetThisRound}`;
          actionType = 'allin';
        } else {
          actionMsg = `${player.name} 跟注到 ${player.totalBetThisRound}`;
          actionType = 'call';
        }
        break;

      case 'raise':
        // 修复: 使用 currentBet + minRaise 而非 toCall + minRaise
        if (amountInt < currentBet + minRaise) return { success: false, error: '加注不够' };
        if (amountInt > player.chips + player.totalBetThisRound) return { success: false, error: '筹码不足' };
        const raiseAmt = amountInt;
        const actualRaise = raiseAmt - player.totalBetThisRound;
        player.chips -= actualRaise;
        player.totalBetThisRound = raiseAmt;
        pot += actualRaise;
        currentBet = raiseAmt;
        minRaise = Math.max(1, Math.ceil(currentBet * 0.2));
        players.forEach(p => {
          if (p.openId !== player.openId && p.isActive && !p.isAllIn) p.hasActed = false;
        });
        if (player.chips === 0) {
          player.isAllIn = true;
          actionMsg = `${player.name} 全押加注到 ${raiseAmt}`;
          actionType = 'allin';
        } else {
          actionMsg = `${player.name} 加注到 ${raiseAmt}`;
          actionType = 'raise';
        }
        break;

      case 'allin':
        const allInAmt = player.chips + player.totalBetThisRound;
        const addAmt = player.chips;
        player.chips = 0;
        player.totalBetThisRound += addAmt;
        pot += addAmt;
        if (allInAmt > currentBet) {
          currentBet = allInAmt;
          minRaise = Math.max(1, Math.ceil(currentBet * 0.2));
          players.forEach(p => {
            if (p.openId !== player.openId && p.isActive && !p.isAllIn) p.hasActed = false;
          });
        }
        player.isAllIn = true;
        actionMsg = `${player.name} 全押 ${allInAmt}`;
        actionType = 'allin';
        break;

      default:
        return { success: false, error: '未知操作' };
    }

    player.hasActed = true;
    history.push({ message: actionMsg, type: actionType, time: now });

    // 检查是否只剩一个活跃玩家
    const activePlayers = players.filter(p => p.isActive);
    if (activePlayers.length <= 1) {
      const winner = activePlayers[0];
      if (winner) {
        winner.chips += pot;
        // 评估赢家牌型（用于前端展示）
        if (winner.holeCards && winner.holeCards.length > 0) {
          const allCards = [...winner.holeCards, ...communityCards];
          winner.handResult = evaluateBestHand(allCards);
        }
        // 计算盈亏：赢家获利 = 底池 - 自身下注，其他玩家亏损 = 各自下注额
        const getTotalBet = (p) => (p.totalBet || 0) + (p.totalBetThisRound || 0);
        const winnerBet = getTotalBet(winner);
        for (const p of players) {
          const bet = getTotalBet(p);
          if (p.openId === winner.openId) {
            p.profit = pot - winnerBet;
            p.winAmount = pot - winnerBet;
            p.lossAmount = 0;
            p.totalProfit = (p.totalProfit || 0) + p.profit;
          } else if (bet > 0) {
            p.profit = -bet;
            p.winAmount = 0;
            p.lossAmount = bet;
            p.totalProfit = (p.totalProfit || 0) + p.profit;
          } else {
            p.profit = 0;
            p.winAmount = 0;
            p.lossAmount = 0;
          }
        }
        phase = 'SHOWDOWN';
        history.push({ message: `${winner.name} 获胜（其他玩家弃牌），牌型: ${winner.handResult ? winner.handResult.name : '?'}`, type: 'win', time: now });
      }
      const status = 'ended';
      await db.collection('rooms').doc(roomId).update({
        data: {
          status, phase, phaseIndex, communityCards, pot, currentBet, minRaise,
          currentPlayerIndex, deck: deck.slice(0, 40), players, gameHistory: history, updatedAt: now
        }
      });
      await saveGameRecord(roomId, room, players, communityCards, history);
      return { success: true };
    }

    // 检查是否应推进阶段
    const advance = shouldAdvancePhase(players, currentBet);

    if (advance && phaseIndex < PHASES.length - 1) {
      phaseIndex++;
      phase = PHASES[phaseIndex];

      // 归集当前轮下注到 totalBet，重置阶段下注
      players.forEach(p => {
        p.hasActed = false;
        p.totalBet = (p.totalBet || 0) + p.totalBetThisRound;
        p.totalBetThisRound = 0;
      });

      if (phase === 'SHOWDOWN') {
        // 摊牌 - 使用新的 distributePot
        const showdownPlayers = players.filter(p => p.isActive || p.isAllIn);
        for (const p of showdownPlayers) {
          const allCards = [...p.holeCards, ...communityCards];
          p.handResult = evaluateBestHand(allCards);
        }

        const result = distributePot(players, communityCards, pot);
        const winnerNames = result.winnerNames;
        const playerResults = result.playerResults || [];
        // 将盈亏信息保存到每个玩家对象中，供前端展示
        for (const pr of playerResults) {
          const p = players.find(pl => pl.openId === pr.openId);
          if (p) {
            p.profit = pr.profit;
            p.winAmount = pr.winAmount;
            p.lossAmount = pr.lossAmount;
            // 累计总盈亏
            p.totalProfit = (p.totalProfit || 0) + pr.profit;
          }
        }
        if (winnerNames.length > 0) {
          const names = winnerNames.map(w => `${w.name}(${w.handName})`).join(', ');
          const totalWin = winnerNames.reduce((sum, w) => sum + w.winAmount, 0);
          history.push({
            message: `赢家: ${names}，共获得 ${totalWin} 筹码`,
            type: 'win', time: now
          });
        }
      } else if (phase === 'FLOP') {
        if (deck.length > 0) { deck.pop(); communityCards.push(deck.pop(), deck.pop(), deck.pop()); }
        const cards = communityCards.map(c => c.value + c.suit).join(' ');
        history.push({ message: `翻牌: ${cards}`, type: 'card', time: now });
      } else if (phase === 'TURN') {
        if (deck.length > 0) { deck.pop(); communityCards.push(deck.pop()); }
        const card = communityCards[communityCards.length - 1];
        history.push({ message: `转牌: ${card.value + card.suit}`, type: 'card', time: now });
      } else if (phase === 'RIVER') {
        if (deck.length > 0) { deck.pop(); communityCards.push(deck.pop()); }
        const card = communityCards[communityCards.length - 1];
        history.push({ message: `河牌: ${card.value + card.suit}`, type: 'card', time: now });
      }

      if (phase !== 'SHOWDOWN') {
        currentBet = 0;
        minRaise = room.bigBlind;

        const firstActiveIdx = (room.dealerIndex + 1) % players.length;
        currentPlayerIndex = firstActiveIdx;
        let found = false;
        for (let i = 0; i < players.length; i++) {
          const idx = (firstActiveIdx + i) % players.length;
          if (players[idx].isActive && !players[idx].isAllIn) {
            currentPlayerIndex = idx;
            found = true;
            break;
          }
        }

        if (!found) {
          const autoResult = autoAdvanceAllIn(players, communityCards, deck, history);
          communityCards = autoResult.communityCards;
          deck = autoResult.deck;
          history = autoResult.history;
          phase = 'SHOWDOWN';
          phaseIndex = 4;

          const showdownPlayers = players.filter(p => p.isActive || p.isAllIn);
          for (const p of showdownPlayers) {
            const allCards = [...p.holeCards, ...communityCards];
            p.handResult = evaluateBestHand(allCards);
          }
          const result = distributePot(players, communityCards, pot);
          const winnerNames = result.winnerNames;
          const playerResults = result.playerResults || [];
          for (const pr of playerResults) {
            const p = players.find(pl => pl.openId === pr.openId);
            if (p) {
              p.profit = pr.profit;
              p.winAmount = pr.winAmount;
              p.lossAmount = pr.lossAmount;
              p.totalProfit = (p.totalProfit || 0) + pr.profit;
            }
          }
          if (winnerNames.length > 0) {
            const names = winnerNames.map(w => `${w.name}(${w.handName})`).join(', ');
            const totalWin = winnerNames.reduce((sum, w) => sum + w.winAmount, 0);
            history.push({
              message: `赢家: ${names}，共获得 ${totalWin} 筹码`,
              type: 'win', time: now
            });
          }
        }
      }
    } else if (!advance) {
      currentPlayerIndex = findNextActor(players, currentPlayerIndex);
      if (currentPlayerIndex === -1) {
        players.forEach(p => {
          p.totalBet = (p.totalBet || 0) + p.totalBetThisRound;
          p.totalBetThisRound = 0;
          p.hasActed = false;
        });
        const autoResult = autoAdvanceAllIn(players, communityCards, deck, history);
        communityCards = autoResult.communityCards;
        deck = autoResult.deck;
        history = autoResult.history;
        phase = 'SHOWDOWN';
        phaseIndex = 4;

        const showdownPlayers = players.filter(p => p.isActive || p.isAllIn);
        for (const p of showdownPlayers) {
          const allCards = [...p.holeCards, ...communityCards];
          p.handResult = evaluateBestHand(allCards);
        }
        const result = distributePot(players, communityCards, pot);
        const winnerNames = result.winnerNames;
        const playerResults = result.playerResults || [];
        // 将盈亏信息保存到每个玩家对象中，供前端展示
        for (const pr of playerResults) {
          const p = players.find(pl => pl.openId === pr.openId);
          if (p) {
            p.profit = pr.profit;
            p.winAmount = pr.winAmount;
            p.lossAmount = pr.lossAmount;
            p.totalProfit = (p.totalProfit || 0) + pr.profit;
          }
        }
        if (winnerNames.length > 0) {
          const names = winnerNames.map(w => `${w.name}(${w.handName})`).join(', ');
          const totalWin = winnerNames.reduce((sum, w) => sum + w.winAmount, 0);
          history.push({
            message: `赢家: ${names}，共获得 ${totalWin} 筹码`,
            type: 'win', time: now
          });
        }
      }
    }

    const status = phase === 'SHOWDOWN' ? 'ended' : 'playing';
    const handCount = room.handCount || 1;
    const maxHands = room.maxHands || 10;
    const isFinalHand = status === 'ended' && handCount >= maxHands;

    await db.collection('rooms').doc(roomId).update({
      data: {
        status, phase, phaseIndex, communityCards, pot, currentBet, minRaise,
        currentPlayerIndex, deck: deck.slice(0, 40), players, gameHistory: history, updatedAt: now,
        isFinalHand
      }
    });

    if (status === 'ended') {
      await saveGameRecord(roomId, room, players, communityCards, history);
    }

    return { success: true };
  } catch (err) {
    console.error('gameAction error:', err);
    return { success: false, error: err.message };
  }
};