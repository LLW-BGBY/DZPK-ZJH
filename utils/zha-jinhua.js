// ============================
// 炸金花 (Zha Jin Hua) 游戏引擎
// 所有局部变量统一使用 zjh_ 前缀，避免与德州扑克 (toCall, callAmount 等) 命名冲突
// 复用现有筹码、底池、玩家余额校验底层逻辑
// ============================

const { PokerCard, createDeck, shuffle } = require('./poker.js');

// ============================
// 炸金花牌型定义 (3张牌)
// 牌型从高到低: 豹子 > 同花顺 > 同花 > 顺子 > 对子 > 散牌
// ============================

const ZJH_HAND_RANKS = {
  SAN_PAI: 1,       // 散牌 (高牌)
  DUI_ZI: 2,        // 对子
  SHUN_ZI: 3,       // 顺子
  TONG_HUA: 4,      // 同花
  TONG_HUA_SHUN: 5, // 同花顺
  BAO_ZI: 6         // 豹子 (三条)
};

const ZJH_HAND_NAMES = {
  1: '散牌',
  2: '对子',
  3: '顺子',
  4: '同花',
  5: '同花顺',
  6: '豹子'
};

// 花色权重 (用于同牌型比较)
const ZJH_SUIT_WEIGHT = { '♠': 4, '♥': 3, '♣': 2, '♦': 1 };

// ============================
// 牌型评估
// ============================

/**
 * 评估3张牌炸金花牌型
 * @param {Array} zjh_cards - 3张牌数组
 * @returns {Object} { rank, score, name, values, cards }
 */
function zjh_evaluateHand(zjh_cards) {
  if (!zjh_cards || zjh_cards.length !== 3) {
    return { rank: 0, score: 0, name: '无效', values: [], cards: [] };
  }

  const zjh_sorted = [...zjh_cards].sort((a, b) => b.value - a.value);
  const zjh_values = zjh_sorted.map(c => c.value);
  const zjh_suits = zjh_sorted.map(c => c.suit);

  const zjh_isFlush = zjh_suits[0] === zjh_suits[1] && zjh_suits[1] === zjh_suits[2];
  const zjh_isStraight = zjh_checkStraight(zjh_values);
  const zjh_isThreeKind = zjh_values[0] === zjh_values[1] && zjh_values[1] === zjh_values[2];
  const zjh_isPair = !zjh_isThreeKind && (zjh_values[0] === zjh_values[1] || zjh_values[1] === zjh_values[2]);

  // 特殊: 235散牌可以击败AAA豹子
  const zjh_is235 = zjh_check235(zjh_values, zjh_suits);

  let zjh_rank, zjh_name, zjh_score;

  if (zjh_isThreeKind) {
    zjh_rank = ZJH_HAND_RANKS.BAO_ZI;
    zjh_name = '豹子';
    // 豹子分数: 6000000 + 牌值*10000, AAA=6130000, 222=6020000
    zjh_score = 6000000 + zjh_values[0] * 10000;
  } else if (zjh_isFlush && zjh_isStraight) {
    zjh_rank = ZJH_HAND_RANKS.TONG_HUA_SHUN;
    zjh_name = '同花顺';
    // 同花顺分数: 5000000 + 高牌值*10000 + 花色权重
    zjh_score = 5000000 + zjh_values[0] * 10000 + ZJH_SUIT_WEIGHT[zjh_suits[0]];
  } else if (zjh_isFlush) {
    zjh_rank = ZJH_HAND_RANKS.TONG_HUA;
    zjh_name = '同花';
    // 同花分数: 4000000 + 高牌*10000 + 中牌*100 + 低牌
    zjh_score = 4000000 + zjh_values[0] * 10000 + zjh_values[1] * 100 + zjh_values[2];
  } else if (zjh_isStraight) {
    zjh_rank = ZJH_HAND_RANKS.SHUN_ZI;
    zjh_name = '顺子';
    // 顺子分数: 3000000 + 高牌值*10000
    zjh_score = 3000000 + zjh_values[0] * 10000;
  } else if (zjh_isPair) {
    zjh_rank = ZJH_HAND_RANKS.DUI_ZI;
    zjh_name = '对子';
    const zjh_pairVal = zjh_values[0] === zjh_values[1] ? zjh_values[0] : zjh_values[1];
    const zjh_kicker = zjh_values.find(v => v !== zjh_pairVal);
    zjh_score = 2000000 + zjh_pairVal * 10000 + zjh_kicker * 100;
  } else {
    zjh_rank = ZJH_HAND_RANKS.SAN_PAI;
    zjh_name = '散牌';
    zjh_score = 1000000 + zjh_values[0] * 10000 + zjh_values[1] * 100 + zjh_values[2];
  }

  return {
    rank: zjh_rank,
    score: zjh_score,
    name: zjh_name,
    values: zjh_values,
    cards: zjh_sorted,
    is235: zjh_is235
  };
}

/**
 * 检测顺子 (含A23特殊顺子)
 */
function zjh_checkStraight(zjh_values) {
  const [a, b, c] = zjh_values;
  // 标准顺子: 相邻且递减1
  if (a - b === 1 && b - c === 1) return true;
  // A23 特殊顺子 (A=14, 3=3, 2=2)
  if (a === 14 && b === 3 && c === 2) return true;
  return false;
}

/**
 * 检测235散牌 (不同花色，可以击败豹子AAA)
 */
function zjh_check235(zjh_values, zjh_suits) {
  const zjh_has2 = zjh_values.includes(2);
  const zjh_has3 = zjh_values.includes(3);
  const zjh_has5 = zjh_values.includes(5);
  const zjh_diffSuits = new Set(zjh_suits).size >= 2;
  return zjh_has2 && zjh_has3 && zjh_has5 && zjh_diffSuits;
}

/**
 * 比较两手炸金花牌型
 * @returns {number} >0 表示a赢, <0 表示b赢, 0表示平局
 */
function zjh_compareHands(zjh_handA, zjh_handB) {
  // 特殊规则: 235散牌(不同花色)可以击败豹子
  if (zjh_handA.is235 && zjh_handB.rank === ZJH_HAND_RANKS.BAO_ZI) return 1;
  if (zjh_handB.is235 && zjh_handA.rank === ZJH_HAND_RANKS.BAO_ZI) return -1;

  // 正常比较: 先比牌型等级, 再比分数
  if (zjh_handA.rank !== zjh_handB.rank) return zjh_handA.rank - zjh_handB.rank;
  if (zjh_handA.score !== zjh_handB.score) return zjh_handA.score - zjh_handB.score;

  // 分数相同, 比较花色 (豹子同牌值时比较花色)
  if (zjh_handA.rank === ZJH_HAND_RANKS.BAO_ZI) {
    return ZJH_SUIT_WEIGHT[zjh_handA.cards[0].suit] - ZJH_SUIT_WEIGHT[zjh_handB.cards[0].suit];
  }

  // 同牌型同分数, 比较最高牌花色
  for (let i = 0; i < 3; i++) {
    const zjh_suitDiff = ZJH_SUIT_WEIGHT[zjh_handA.cards[i].suit] - ZJH_SUIT_WEIGHT[zjh_handB.cards[i].suit];
    if (zjh_suitDiff !== 0) return zjh_suitDiff;
  }

  return 0;
}

// ============================
// 下注/跟注/加注计算 (明暗牌差异化)
// ============================

/**
 * 4种明暗组合倍率计算:
 * 组合1: 暗牌跟暗牌 -> 暗牌玩家付 1x
 * 组合2: 暗牌跟明牌 -> 暗牌玩家付 1x, 明牌玩家付 2x  
 * 组合3: 明牌跟暗牌 -> 明牌玩家付 2x, 暗牌玩家付 1x
 * 组合4: 明牌跟明牌 -> 双方各付 2x
 * 
 * 简化规则:
 * - zjh_currentBet 是名义下注额
 * - 暗牌玩家实际支付 = zjh_currentBet * 1
 * - 明牌玩家实际支付 = zjh_currentBet * 2
 */

/**
 * 计算玩家需要跟注的金额
 * @param {Object} zjh_player - 当前玩家
 * @param {number} zjh_currentBet - 名义当前下注额
 * @returns {number} 实际需要支付的金额
 */
function zjh_calcCallAmount(zjh_player, zjh_currentBet) {
  const zjh_isDark = zjh_player.zjh_isDark !== false;
  const zjh_multiplier = zjh_isDark ? 1 : 2;
  return zjh_currentBet * zjh_multiplier;
}

/**
 * 计算玩家加注的实际支付金额
 * @param {Object} zjh_player - 当前玩家
 * @param {number} zjh_raiseAmount - 新的名义下注额
 * @returns {number} 实际需要支付的金额
 */
function zjh_calcRaiseAmount(zjh_player, zjh_raiseAmount) {
  const zjh_isDark = zjh_player.zjh_isDark !== false;
  const zjh_multiplier = zjh_isDark ? 1 : 2;
  return zjh_raiseAmount * zjh_multiplier;
}

/**
 * 计算玩家比牌的实际支付金额
 * @param {Object} zjh_player - 当前玩家
 * @param {number} zjh_currentBet - 名义当前下注额
 * @returns {number} 实际需要支付的金额
 */
function zjh_calcCompareAmount(zjh_player, zjh_currentBet) {
  return zjh_calcCallAmount(zjh_player, zjh_currentBet);
}

// ============================
// 边池计算 (复用德州逻辑, 适配炸金花)
// ============================

/**
 * 炸金花边池计算与分配
 * @param {Array} zjh_players - 所有玩家
 * @param {number} zjh_totalPot - 总底池
 * @returns {Object} { pots, playerResults, winnerNames }
 */
function zjh_distributePot(zjh_players, zjh_totalPot) {
  // 收集所有下注信息
  const zjh_betLevels = [];
  for (const p of zjh_players) {
    const zjh_totalBet = (p.totalBet || 0) + (p.totalBetThisRound || 0);
    if (zjh_totalBet > 0) {
      zjh_betLevels.push({ openId: p.openId, amount: zjh_totalBet, folded: !p.isActive });
    }
  }
  zjh_betLevels.sort((a, b) => a.amount - b.amount);

  // 去重下注层级
  const zjh_uniqueLevels = [];
  let zjh_lastAmount = 0;
  for (const bl of zjh_betLevels) {
    if (bl.amount > zjh_lastAmount) {
      zjh_uniqueLevels.push(bl.amount);
      zjh_lastAmount = bl.amount;
    }
  }

  // 活跃玩家 (未弃牌)
  const zjh_active = zjh_players.filter(p => p.isActive);

  // 构建边池
  const zjh_pots = [];
  let zjh_processedAmount = 0;

  for (const zjh_level of zjh_uniqueLevels) {
    const zjh_levelDiff = zjh_level - zjh_processedAmount;
    if (zjh_levelDiff <= 0) continue;

    const zjh_contributors = zjh_betLevels.filter(b => b.amount >= zjh_level);
    const zjh_potAmount = zjh_levelDiff * zjh_contributors.length;

    // 该池的赢家候选人 = 未弃牌且投入达到该层级的玩家
    const zjh_eligible = zjh_active.filter(p => {
      const zjh_totalBet = (p.totalBet || 0) + (p.totalBetThisRound || 0);
      return zjh_totalBet >= zjh_level;
    });

    if (zjh_eligible.length > 0) {
      let zjh_bestScore = -1;
      let zjh_winners = [];

      for (const p of zjh_eligible) {
        if (!p.zjh_handResult) continue;
        if (p.zjh_handResult.score > zjh_bestScore) {
          zjh_bestScore = p.zjh_handResult.score;
          zjh_winners = [p.openId];
        } else if (p.zjh_handResult.score === zjh_bestScore) {
          zjh_winners.push(p.openId);
        }
      }

      zjh_pots.push({ amount: zjh_potAmount, winners: zjh_winners, level: zjh_level });
    } else {
      // 回退: 投入最多的未弃牌玩家获得
      const zjh_fallback = zjh_betLevels
        .filter(b => !b.folded && b.amount >= zjh_level)
        .sort((a, b) => b.amount - a.amount);
      if (zjh_fallback.length > 0) {
        zjh_pots.push({ amount: zjh_potAmount, winners: [zjh_fallback[0].openId], level: zjh_level });
      }
    }

    zjh_processedAmount = zjh_level;
  }

  // 验证: 所有池的总和应该等于总底池
  const zjh_totalPots = zjh_pots.reduce((s, p) => s + p.amount, 0);
  if (zjh_totalPots !== zjh_totalPot) {
    const zjh_diff = zjh_totalPot - zjh_totalPots;
    if (zjh_diff > 0 && zjh_pots.length > 0) {
      zjh_pots[zjh_pots.length - 1].amount += zjh_diff;
    } else if (zjh_diff > 0) {
      zjh_pots.push({ amount: zjh_diff, winners: [zjh_active[0]?.openId].filter(Boolean), level: 0 });
    }
  }

  // 分配筹码
  const zjh_profits = {};
  for (const p of zjh_players) {
    const zjh_totalBet = (p.totalBet || 0) + (p.totalBetThisRound || 0);
    zjh_profits[p.openId] = -zjh_totalBet;
  }

  for (const zjh_pot of zjh_pots) {
    if (zjh_pot.winners.length === 0 || zjh_pot.amount <= 0) continue;
    const zjh_share = Math.floor(zjh_pot.amount / zjh_pot.winners.length);
    const zjh_remainder = zjh_pot.amount - zjh_share * zjh_pot.winners.length;

    zjh_pot.winners.forEach((openId, idx) => {
      const p = zjh_players.find(pl => pl.openId === openId);
      if (!p) return;
      const zjh_extra = idx === 0 ? zjh_remainder : 0;
      p.chips += zjh_share + zjh_extra;
      zjh_profits[openId] = (zjh_profits[openId] || 0) + zjh_share + zjh_extra;
    });
  }

  // 生成结果
  const zjh_winnerNames = [];
  const zjh_playerResults = [];
  for (const p of zjh_players) {
    const zjh_profit = zjh_profits[p.openId] || 0;
    const zjh_result = {
      openId: p.openId,
      name: p.name,
      handName: p.zjh_handResult ? p.zjh_handResult.name : '已弃牌',
      winAmount: zjh_profit > 0 ? zjh_profit : 0,
      lossAmount: zjh_profit < 0 ? -zjh_profit : 0,
      profit: zjh_profit,
      chips: p.chips,
      isWinner: zjh_profit > 0
    };
    zjh_playerResults.push(zjh_result);
    if (zjh_profit > 0) {
      zjh_winnerNames.push(zjh_result);
    }
  }

  return { winnerNames: zjh_winnerNames, pots: zjh_pots, playerResults: zjh_playerResults };
}

// ============================
// 游戏状态检查
// ============================

/**
 * 检查封顶条件: 是否达到最大下注轮数
 * @param {Array} zjh_players - 所有玩家
 * @param {number} zjh_maxRounds - 封顶轮数
 * @param {number} zjh_currentRound - 当前轮数
 * @returns {boolean}
 */
function zjh_isCapReached(zjh_players, zjh_maxRounds, zjh_currentRound) {
  if (zjh_currentRound >= zjh_maxRounds) return true;
  return false;
}

/**
 * 检查是否只剩一名活跃玩家
 */
function zjh_isOnlyOneActive(zjh_players) {
  return zjh_players.filter(p => p.isActive).length <= 1;
}

/**
 * 找到下一个可行动的玩家
 */
function zjh_findNextActor(zjh_players, zjh_startIdx) {
  const zjh_len = zjh_players.length;
  for (let zjh_i = 1; zjh_i <= zjh_len; zjh_i++) {
    const zjh_idx = (zjh_startIdx + zjh_i) % zjh_len;
    if (zjh_players[zjh_idx].isActive && !zjh_players[zjh_idx].isAllIn) return zjh_idx;
  }
  return -1;
}

// ============================
// 游戏动作处理 (核心)
// ============================

/**
 * 处理炸金花玩家动作
 * 
 * 支持的动作:
 * - zjh_fold: 弃牌
 * - zjh_call: 跟注 (暗牌1x, 明牌2x)
 * - zjh_raise: 加注 (暗牌1x, 明牌2x)
 * - zjh_allin: 梭哈
 * - zjh_see: 看牌 (暗转明)
 * - zjh_compare: 比牌 (与指定玩家比牌, 输者弃牌)
 * 
 * @param {Object} zjh_ctx - 游戏上下文
 * @param {string} zjh_action - 动作类型
 * @param {number} zjh_amount - 加注金额 (仅raise时有效)
 * @param {string} zjh_targetOpenId - 比牌目标玩家openId (仅compare时有效)
 * @returns {Object} { success, error, phaseChanged, gameEnded, actionMsg, actionType }
 */
function zjh_processAction(zjh_ctx, zjh_action, zjh_amount = 0, zjh_targetOpenId = '') {
  const {
    players, currentPlayerIndex, pot, currentBet, minRaise,
    baseBet, maxRounds, roundCount, history, deck
  } = zjh_ctx;

  const zjh_player = players[currentPlayerIndex];
  if (!zjh_player || !zjh_player.isActive || zjh_player.isAllIn) {
    return { success: false, error: '不是你的回合' };
  }

  const zjh_isDark = zjh_player.zjh_isDark !== false;
  const zjh_multiplier = zjh_isDark ? 1 : 2;
  const zjh_actualCall = currentBet * zjh_multiplier;
  const zjh_totalChips = zjh_player.chips + zjh_player.totalBetThisRound;

  let zjh_actionMsg = '';
  let zjh_actionType = '';
  let zjh_phaseChanged = false;
  let zjh_gameEnded = false;
  let zjh_newRoundCount = roundCount;

  switch (zjh_action) {
    // ============================
    // 弃牌
    // ============================
    case 'zjh_fold':
      zjh_player.isActive = false;
      zjh_actionMsg = `${zjh_player.name} 弃牌`;
      zjh_actionType = 'fold';
      break;

    // ============================
    // 跟注 (暗牌1x, 明牌2x)
    // ============================
    case 'zjh_call':
      {
        const zjh_callCost = Math.min(zjh_actualCall, zjh_player.chips);
        zjh_player.chips -= zjh_callCost;
        zjh_player.totalBetThisRound += zjh_callCost;
        zjh_ctx.pot += zjh_callCost;

        if (zjh_player.chips === 0) {
          zjh_player.isAllIn = true;
          zjh_actionMsg = `${zjh_player.name} 全押跟注 ${zjh_callCost}`;
          zjh_actionType = 'allin';
        } else {
          const zjh_darkLabel = zjh_isDark ? '暗牌' : '明牌';
          zjh_actionMsg = `${zjh_player.name} ${zjh_darkLabel}跟注 ${zjh_callCost}`;
          zjh_actionType = 'call';
        }
        zjh_newRoundCount = roundCount + 1;
      }
      break;

    // ============================
    // 加注 (暗牌1x, 明牌2x)
    // ============================
    case 'zjh_raise':
      {
        // 名义加注额必须 >= 当前注 + 最小加注
        if (zjh_amount < currentBet + minRaise) {
          return { success: false, error: `加注至少 ${currentBet + minRaise}` };
        }

        // 实际支付金额 = 名义加注额 * 倍率
        const zjh_actualRaise = zjh_amount * zjh_multiplier;
        const zjh_extraCost = zjh_actualRaise - zjh_player.totalBetThisRound;

        if (zjh_extraCost > zjh_player.chips) {
          return { success: false, error: '筹码不足' };
        }

        zjh_player.chips -= zjh_extraCost;
        zjh_player.totalBetThisRound = zjh_actualRaise;
        zjh_ctx.pot += zjh_extraCost;
        zjh_ctx.currentBet = zjh_amount;
        zjh_ctx.minRaise = zjh_amount - currentBet;

        // 重置其他玩家的行动状态
        players.forEach(p => {
          if (p.openId !== zjh_player.openId && p.isActive && !p.isAllIn) {
            p.hasActed = false;
          }
        });

        if (zjh_player.chips === 0) {
          zjh_player.isAllIn = true;
        }

        const zjh_raiseLabel = zjh_isDark ? '暗牌' : '明牌';
        zjh_actionMsg = `${zjh_player.name} ${zjh_raiseLabel}加注到 ${zjh_amount} (实付 ${zjh_actualRaise})`;
        zjh_actionType = 'raise';
        zjh_newRoundCount = 0; // 加注重置轮数计数
        zjh_ctx.zjh_lastRaiser = zjh_player.openId;
      }
      break;

    // ============================
    // 梭哈
    // ============================
    case 'zjh_allin':
      {
        const zjh_allInAdd = zjh_player.chips;
        zjh_player.chips = 0;
        zjh_player.totalBetThisRound += zjh_allInAdd;
        zjh_ctx.pot += zjh_allInAdd;

        // 如果梭哈金额超过当前注, 更新当前注
        const zjh_allInTotal = zjh_player.totalBetThisRound;
        if (zjh_allInTotal > currentBet * zjh_multiplier) {
          zjh_ctx.currentBet = Math.ceil(zjh_allInTotal / zjh_multiplier);
          zjh_ctx.minRaise = zjh_ctx.currentBet - currentBet;
          players.forEach(p => {
            if (p.openId !== zjh_player.openId && p.isActive && !p.isAllIn) {
              p.hasActed = false;
            }
          });
        }

        zjh_player.isAllIn = true;
        zjh_actionMsg = `${zjh_player.name} 梭哈 ${zjh_allInTotal}`;
        zjh_actionType = 'allin';
        zjh_newRoundCount = roundCount + 1;
      }
      break;

    // ============================
    // 看牌 (暗转明)
    // ============================
    case 'zjh_see':
      if (!zjh_isDark) {
        return { success: false, error: '已经看过牌了' };
      }
      zjh_player.zjh_isDark = false;
      zjh_actionMsg = `${zjh_player.name} 看牌`;
      zjh_actionType = 'see';
      zjh_player.hasActed = false;
      break;

    // ============================
    // 比牌 (与指定玩家比较, 输者弃牌)
    // ============================
    case 'zjh_compare':
      {
        if (!zjh_targetOpenId) {
          return { success: false, error: '请选择要比牌的玩家' };
        }

        const zjh_target = players.find(p => p.openId === zjh_targetOpenId);
        if (!zjh_target || !zjh_target.isActive) {
          return { success: false, error: '目标玩家已弃牌或不存在' };
        }
        if (zjh_target.openId === zjh_player.openId) {
          return { success: false, error: '不能和自己比牌' };
        }

        // 比牌需要支付跟注金额
        const zjh_compareCost = Math.min(zjh_actualCall, zjh_player.chips);
        zjh_player.chips -= zjh_compareCost;
        zjh_player.totalBetThisRound += zjh_compareCost;
        zjh_ctx.pot += zjh_compareCost;

        // 评估双方牌型
        const zjh_myCards = [...zjh_player.holeCards];
        const zjh_targetCards = [...zjh_target.holeCards];
        zjh_player.zjh_handResult = zjh_evaluateHand(zjh_myCards);
        zjh_target.zjh_handResult = zjh_evaluateHand(zjh_targetCards);

        // 比较牌型
        const zjh_compareResult = zjh_compareHands(zjh_player.zjh_handResult, zjh_target.zjh_handResult);

        if (zjh_compareResult > 0) {
          zjh_target.isActive = false;
          zjh_player.zjh_isDark = false;
          zjh_target.zjh_isDark = false;
          zjh_actionMsg = `${zjh_player.name} 比牌胜 ${zjh_target.name}`;
        } else if (zjh_compareResult < 0) {
          zjh_player.isActive = false;
          zjh_player.zjh_isDark = false;
          zjh_target.zjh_isDark = false;
          zjh_actionMsg = `${zjh_player.name} 比牌负于 ${zjh_target.name}`;
        } else {
          zjh_player.isActive = false;
          zjh_player.zjh_isDark = false;
          zjh_target.zjh_isDark = false;
          zjh_actionMsg = `${zjh_player.name} 比牌平局负于 ${zjh_target.name}`;
        }
        zjh_actionType = 'compare';
        zjh_newRoundCount = roundCount + 1;
      }
      break;

    default:
      return { success: false, error: '未知操作' };
  }

  zjh_ctx.roundCount = zjh_newRoundCount;

  const zjh_isSee = (zjh_action === 'zjh_see');
  if (!zjh_isSee) {
    zjh_player.hasActed = true;
  }

  // 检查是否只剩一名活跃玩家
  if (zjh_isOnlyOneActive(players)) {
    zjh_gameEnded = true;
    zjh_phaseChanged = true;
  }

  // 检查封顶条件
  if (!zjh_gameEnded && zjh_isCapReached(players, maxRounds, zjh_newRoundCount)) {
    zjh_gameEnded = true;
    zjh_phaseChanged = true;
  }

  return {
    success: true,
    phaseChanged: zjh_phaseChanged,
    gameEnded: zjh_gameEnded,
    actionMsg: zjh_actionMsg,
    actionType: zjh_actionType,
    skipAdvance: zjh_isSee
  };
}

/**
 * 执行封顶强制比牌 (所有剩余玩家比较牌型)
 * @param {Array} zjh_players - 所有玩家
 * @param {Array} zjh_history - 游戏历史
 * @returns {string} 比牌结果消息
 */
function zjh_forceShowdown(zjh_players, zjh_history) {
  const zjh_active = zjh_players.filter(p => p.isActive || p.isAllIn);

  // 评估所有活跃玩家牌型
  for (const p of zjh_active) {
    p.zjh_handResult = zjh_evaluateHand([...p.holeCards]);
  }

  // 按牌型排序
  zjh_active.sort((a, b) => zjh_compareHands(b.zjh_handResult, a.zjh_handResult));

  const zjh_best = zjh_active[0].zjh_handResult;
  const zjh_winners = zjh_active.filter(p => zjh_compareHands(p.zjh_handResult, zjh_best) === 0);

  // 非赢家弃牌
  for (const p of zjh_active) {
    if (!zjh_winners.includes(p)) {
      p.isActive = false;
    }
  }

  // 胜者手牌变为明牌
  for (const w of zjh_winners) {
    w.zjh_isDark = false;
  }

  const zjh_names = zjh_winners.map(w => w.name).join(', ');
  const zjh_msg = `封顶比牌: ${zjh_names} 胜出`;

  zjh_history.push({ message: zjh_msg, type: 'showdown', time: Date.now() });
  return zjh_msg;
}

// ============================
// 游戏初始化
// ============================

/**
 * 初始化炸金花游戏
 * @param {Array} zjh_players - 玩家数组 (复用现有玩家数据)
 * @param {Object} zjh_config - 游戏配置
 * @returns {Object} 初始化后的游戏上下文
 */
function zjh_initGame(zjh_players, zjh_config = {}) {
  const zjh_baseBet = zjh_config.baseBet || 100;
  const zjh_maxRounds = zjh_config.maxRounds || 20;
  const zjh_defaultChips = zjh_config.defaultChips || 10000;

  // 重置玩家状态
  zjh_players.forEach(p => {
    p.isActive = p.chips > 0;
    p.isAllIn = false;
    p.hasActed = false;
    p.totalBetThisRound = 0;
    p.totalBet = 0;
    p.holeCards = [];
    p.zjh_isDark = true;       // 默认暗牌
    p.zjh_handResult = null;
    p.handResult = null;
    p.confirmedNext = false;
  });

  // 创建牌组并发牌
  const zjh_deck = shuffle(createDeck());
  const zjh_activePlayers = zjh_players.filter(p => p.isActive);

  if (zjh_activePlayers.length < 2) {
    return { success: false, error: '至少需要2名有筹码的玩家' };
  }

  // 每个玩家发3张牌
  for (let zjh_i = 0; zjh_i < 3; zjh_i++) {
    for (const p of zjh_activePlayers) {
      p.holeCards.push(zjh_deck.pop());
    }
  }

  // 所有人下底注，底注不计入跟注进度
  let zjh_totalPot = 0;
  for (const p of zjh_activePlayers) {
    const zjh_ante = Math.min(zjh_baseBet, p.chips);
    p.chips -= zjh_ante;
    p.totalBetThisRound = 0;
    zjh_totalPot += zjh_ante;
  }

  // 确定庄家 (第一个活跃玩家)
  const zjh_dealerIdx = zjh_players.findIndex(p => p.isActive);
  // 确定第一个行动玩家 (庄家下家)
  const zjh_firstActor = zjh_findNextActor(zjh_players, zjh_dealerIdx);

  const zjh_gameCtx = {
    players: zjh_players,
    deck: zjh_deck,
    pot: zjh_totalPot,
    currentBet: zjh_baseBet,       // 名义当前注 = 底注
    minRaise: zjh_baseBet,         // 最小加注 = 底注
    baseBet: zjh_baseBet,
    maxRounds: zjh_maxRounds,
    roundCount: 0,
    currentPlayerIndex: zjh_firstActor >= 0 ? zjh_firstActor : 0,
    dealerIndex: zjh_dealerIdx >= 0 ? zjh_dealerIdx : 0,
    history: [],
    phase: 'PLAYING',
    zjh_lastRaiser: '',
    zjh_isCapReached: false
  };

  return { success: true, gameCtx: zjh_gameCtx };
}

// ============================
// 前端辅助: 计算可用动作
// ============================

/**
 * 获取当前玩家可执行的动作列表
 * @param {Object} zjh_player - 当前玩家
 * @param {Object} zjh_ctx - 游戏上下文
 * @returns {Object} 可用动作及对应金额
 */
function zjh_getAvailableActions(zjh_player, zjh_ctx) {
  if (!zjh_player || !zjh_player.isActive || zjh_player.isAllIn) {
    return { canAct: false, actions: [] };
  }

  const zjh_isDark = zjh_player.zjh_isDark !== false;
  const zjh_multiplier = zjh_isDark ? 1 : 2;
  const { currentBet, minRaise, pot, players, maxRounds, roundCount } = zjh_ctx;

  const zjh_callAmount = zjh_calcCallAmount(zjh_player, currentBet);
  const zjh_minRaiseNominal = currentBet + minRaise;
  const zjh_minRaiseActual = zjh_calcRaiseAmount(zjh_player, zjh_minRaiseNominal);
  const zjh_totalChips = zjh_player.chips + zjh_player.totalBetThisRound;

  // 可加注的快速选项
  const zjh_doubleBet = currentBet * 2;
  const zjh_halfPot = Math.floor(pot / 2);
  const zjh_potSize = pot;

  const zjh_quickRaiseOptions = [
    { label: '最小加注', value: zjh_minRaiseNominal, actual: zjh_minRaiseActual },
    { label: '翻倍', value: zjh_doubleBet, actual: zjh_doubleBet * zjh_multiplier },
    { label: '半池', value: zjh_halfPot, actual: zjh_halfPot * zjh_multiplier },
    { label: '满池', value: zjh_potSize, actual: zjh_potSize * zjh_multiplier },
    { label: '梭哈', value: Math.ceil(zjh_totalChips / zjh_multiplier), actual: zjh_totalChips }
  ].filter(o => o.value >= zjh_minRaiseNominal && o.actual <= zjh_totalChips);

  // 可比的玩家列表 (排除自己和已弃牌/已allin的玩家)
  const zjh_compareTargets = players
    .filter(p => p.openId !== zjh_player.openId && p.isActive && !p.isAllIn)
    .map(p => ({ openId: p.openId, name: p.name }));

  // 封顶提示
  const zjh_roundsLeft = maxRounds - roundCount;
  const zjh_capWarning = zjh_roundsLeft <= 3;

  return {
    canAct: true,
    isDark: zjh_isDark,
    callAmount: zjh_callAmount,
    minRaiseNominal: zjh_minRaiseNominal,
    minRaiseActual: zjh_minRaiseActual,
    quickRaiseOptions: zjh_quickRaiseOptions,
    compareTargets: zjh_compareTargets,
    canSee: zjh_isDark,
    canCompare: zjh_compareTargets.length > 0,
    capWarning: zjh_capWarning,
    roundsLeft: zjh_roundsLeft,
    maxRounds: maxRounds,
    totalChips: zjh_totalChips
  };
}

// ============================
// 导出
// ============================

module.exports = {
  ZJH_HAND_RANKS,
  ZJH_HAND_NAMES,
  ZJH_SUIT_WEIGHT,
  zjh_evaluateHand,
  zjh_compareHands,
  zjh_calcCallAmount,
  zjh_calcRaiseAmount,
  zjh_calcCompareAmount,
  zjh_distributePot,
  zjh_isCapReached,
  zjh_isOnlyOneActive,
  zjh_findNextActor,
  zjh_processAction,
  zjh_forceShowdown,
  zjh_initGame,
  zjh_getAvailableActions
};