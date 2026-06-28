const { createDeck, shuffle, evaluateBestHand, compareHands, HAND_RANKS } = require('./poker.js');

// ============================
// 德州扑克游戏引擎（本地多人/AI模式）
// 支持 2-12 人，轮流在一台设备上操作
// ============================

const PHASES = ['PRE_FLOP', 'FLOP', 'TURN', 'RIVER', 'SHOWDOWN'];

class TexasHoldemGame {
  constructor(options = {}) {
    this.maxPlayers = options.maxPlayers || 12;
    this.minPlayers = 2;
    this.defaultChips = options.defaultChips || 10000;
    this.smallBlind = options.smallBlind || 10;
    this.bigBlind = options.bigBlind || 20;
    this.players = [];
    this.deck = [];
    this.communityCards = [];
    this.pot = 0;
    this.sidePots = [];
    this.phase = 'PRE_FLOP';
    this.phaseIndex = 0;
    this.dealerIndex = 0;
    this.currentPlayerIndex = 0;
    this.currentBet = 0;
    this.minRaise = this.bigBlind;
    this.activePlayerCount = 0;
    this.roundBets = {};
    this.gameHistory = [];
    this.isGameOver = false;
    this.winners = [];
  }

  // 初始化玩家
  addPlayer(name, isHuman = true, avatar = '') {
    if (this.players.length >= this.maxPlayers) return false;
    const id = `p_${this.players.length}`;
    this.players.push({
      id,
      name: name || `玩家${this.players.length + 1}`,
      isHuman,
      avatar: avatar || `/images/avatar-${(this.players.length % 8) + 1}.png`,
      chips: this.defaultChips,
      holeCards: [],
      isActive: true,
      isAllIn: false,
      hasActed: false,
      totalBetThisRound: 0,
      handResult: null,
      seat: this.players.length
    });
    return true;
  }

  addAI(name) {
    const aiNames = ['老K', '赌神', '鲨鱼', '铁头', '幽灵', '火箭', '毒蛇', '山猫', '王牌', '炸弹', '闪电', '风暴'];
    const aiName = name || aiNames[this.players.length % aiNames.length];
    return this.addPlayer(aiName, false);
  }

  startNewHand() {
    if (this.players.length < this.minPlayers) return false;

    // 重置状态
    this.deck = shuffle(createDeck());
    this.communityCards = [];
    this.pot = 0;
    this.sidePots = [];
    this.phase = 'PRE_FLOP';
    this.phaseIndex = 0;
    this.currentBet = 0;
    this.minRaise = this.bigBlind;
    this.isGameOver = false;
    this.winners = [];
    this.roundBets = {};
    this.gameHistory = [];

    this.players.forEach(p => {
      p.holeCards = [];
      p.isActive = p.chips > 0;
      p.isAllIn = false;
      p.hasActed = false;
      p.totalBetThisRound = 0;
      p.handResult = null;
    });

    this.activePlayerCount = this.players.filter(p => p.isActive).length;
    if (this.activePlayerCount < 2) return false;

    // 发底牌
    const activePlayers = this.players.filter(p => p.isActive);
    for (let i = 0; i < 2; i++) {
      for (const p of activePlayers) {
        p.holeCards.push(this.deck.pop());
      }
    }

    // 强制盲注
    this._postBlinds();

    // 确定第一个行动玩家（大盲注下家）
    this._setFirstActor();
    this._log('新局开始', 'dealer');

    return true;
  }

  _postBlinds() {
    const active = this.players.filter(p => p.isActive);
    if (active.length < 2) return;
    // 小盲注（庄家下家）
    const sbIdx = (this.dealerIndex + 1) % this.players.length;
    const sbPlayer = this.players[sbIdx];
    if (sbPlayer && sbPlayer.isActive) {
      const sbAmt = Math.min(this.smallBlind, sbPlayer.chips);
      sbPlayer.chips -= sbAmt;
      sbPlayer.totalBetThisRound += sbAmt;
      this.pot += sbAmt;
      this._log(`${sbPlayer.name} 下小盲注 ${sbAmt}`, 'bet');
    }
    // 大盲注
    const bbIdx = (this.dealerIndex + 2) % this.players.length;
    const bbPlayer = this.players[bbIdx];
    if (bbPlayer && bbPlayer.isActive) {
      const bbAmt = Math.min(this.bigBlind, bbPlayer.chips);
      bbPlayer.chips -= bbAmt;
      bbPlayer.totalBetThisRound += bbAmt;
      this.pot += bbAmt;
      this.currentBet = bbAmt;
      this._log(`${bbPlayer.name} 下大盲注 ${bbAmt}`, 'bet');
    }
  }

  _setFirstActor() {
    // 翻牌前：大盲注下家开始
    // 翻牌后：小盲注位置（如果还在）或第一个活跃玩家
    const active = this.players.filter(p => p.isActive && !p.isAllIn);
    if (this.phase === 'PRE_FLOP') {
      const bbIdx = (this.dealerIndex + 2) % this.players.length;
      this.currentPlayerIndex = (bbIdx + 1) % this.players.length;
    } else {
      this.currentPlayerIndex = (this.dealerIndex + 1) % this.players.length;
    }
    // 跳过非活跃或allin的玩家
    this._advanceToNextValidPlayer();
  }

  _advanceToNextValidPlayer() {
    const start = this.currentPlayerIndex;
    do {
      const p = this.players[this.currentPlayerIndex];
      if (p && p.isActive && !p.isAllIn) break;
      this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
    } while (this.currentPlayerIndex !== start);
  }

  // 玩家行动
  playerAction(action, amount = 0) {
    const player = this.players[this.currentPlayerIndex];
    if (!player || !player.isActive || player.isAllIn) return { success: false, error: '不是你的回合' };

    const toCall = this.currentBet - player.totalBetThisRound;

    switch (action) {
      case 'fold':
        player.isActive = false;
        this.activePlayerCount--;
        this._log(`${player.name} 弃牌`, 'fold');
        break;

      case 'check':
        if (toCall > 0) return { success: false, error: '需要跟注才能过牌' };
        this._log(`${player.name} 过牌`, 'check');
        break;

      case 'call':
        const callAmt = Math.min(toCall, player.chips);
        player.chips -= callAmt;
        player.totalBetThisRound += callAmt;
        this.pot += callAmt;
        if (player.chips === 0) {
          player.isAllIn = true;
          this._log(`${player.name} 全押跟注 ${callAmt}`, 'allin');
        } else {
          this._log(`${player.name} 跟注 ${callAmt}`, 'call');
        }
        break;

      case 'raise':
        if (amount < toCall + this.minRaise) return { success: false, error: '加注不够' };
        if (amount > player.chips + player.totalBetThisRound) return { success: false, error: '筹码不足' };
        const raiseAmt = Math.min(amount, player.chips + player.totalBetThisRound);
        const actualRaise = raiseAmt - player.totalBetThisRound;
        player.chips -= actualRaise;
        player.totalBetThisRound = raiseAmt;
        this.pot += actualRaise;
        this.currentBet = raiseAmt;
        this.minRaise = raiseAmt - this.currentBet + this.minRaise; // 简化

        // 重置其他玩家行动状态（除了allin和fold）
        this.players.forEach(p => {
          if (p.id !== player.id && p.isActive && !p.isAllIn) p.hasActed = false;
        });

        if (player.chips === 0) {
          player.isAllIn = true;
          this._log(`${player.name} 全押加注到 ${raiseAmt}`, 'allin');
        } else {
          this._log(`${player.name} 加注到 ${raiseAmt}`, 'raise');
        }
        break;

      case 'allin':
        const allInAmt = player.chips + player.totalBetThisRound;
        const addAmt = player.chips;
        player.chips = 0;
        player.totalBetThisRound += addAmt;
        this.pot += addAmt;
        if (allInAmt > this.currentBet) {
          this.currentBet = allInAmt;
          this.players.forEach(p => {
            if (p.id !== player.id && p.isActive && !p.isAllIn) p.hasActed = false;
          });
        }
        player.isAllIn = true;
        this._log(`${player.name} 全押 ${allInAmt}`, 'allin');
        break;

      default:
        return { success: false, error: '未知操作' };
    }

    player.hasActed = true;

    // 检查是否进入下一阶段
    if (this._shouldAdvancePhase()) {
      this._advancePhase();
    } else {
      this._nextPlayer();
    }

    // 检查是否只剩一个玩家
    if (this.activePlayerCount <= 1) {
      this._endHandEarly();
    }

    return { success: true };
  }

  _shouldAdvancePhase() {
    const activePlayers = this.players.filter(p => p.isActive);
    const allActed = activePlayers.every(p => p.hasActed || p.isAllIn);
    const allMatched = activePlayers.every(p => p.isAllIn || p.totalBetThisRound === this.currentBet || p.chips === 0);
    return allActed && allMatched;
  }

  _nextPlayer() {
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
    this._advanceToNextValidPlayer();
  }

  _advancePhase() {
    this.phaseIndex++;
    if (this.phaseIndex >= PHASES.length - 1) {
      this._showdown();
      return;
    }
    this.phase = PHASES[this.phaseIndex];

    // 发公共牌
    this.deck.pop(); // 烧牌
    if (this.phase === 'FLOP') {
      this.communityCards.push(this.deck.pop(), this.deck.pop(), this.deck.pop());
      this._log(`翻牌: ${this.communityCards.map(c => c.toString()).join(' ')}`, 'card');
    } else if (this.phase === 'TURN') {
      this.communityCards.push(this.deck.pop());
      this._log(`转牌: ${this.communityCards[this.communityCards.length - 1].toString()}`, 'card');
    } else if (this.phase === 'RIVER') {
      this.communityCards.push(this.deck.pop());
      this._log(`河牌: ${this.communityCards[this.communityCards.length - 1].toString()}`, 'card');
    }

    // 重置行动状态
    this.players.forEach(p => {
      p.hasActed = false;
      p.totalBetThisRound = 0;
    });
    this.currentBet = 0;
    this.minRaise = this.bigBlind;
    this._setFirstActor();
  }

  _showdown() {
    this.phase = 'SHOWDOWN';
    this.isGameOver = true;

    const activePlayers = this.players.filter(p => p.isActive || p.isAllIn);

    // 评估每手牌
    for (const p of activePlayers) {
      const allCards = [...p.holeCards, ...this.communityCards];
      p.handResult = evaluateBestHand(allCards);
    }

    // 排序找出赢家
    activePlayers.sort((a, b) => compareHands(b.handResult, a.handResult));

    // 分配底池（简化版：均分给最佳牌型）
    const bestHand = activePlayers[0].handResult;
    this.winners = activePlayers.filter(p => compareHands(p.handResult, bestHand) === 0);

    const winAmount = Math.floor(this.pot / this.winners.length);
    for (const w of this.winners) {
      w.chips += winAmount;
    }

    this._log(`赢家: ${this.winners.map(w => w.name).join(', ')} 获得 ${winAmount} 筹码`, 'win');
  }

  _endHandEarly() {
    this.isGameOver = true;
    const winner = this.players.find(p => p.isActive);
    if (winner) {
      winner.chips += this.pot;
      this.winners = [winner];
      this._log(`${winner.name} 获胜（其他玩家弃牌）`, 'win');
    }
  }

  _log(message, type = 'info') {
    this.gameHistory.push({ message, type, time: Date.now() });
  }

  // AI 决策
  getAIDecision() {
    const player = this.players[this.currentPlayerIndex];
    if (!player || player.isHuman) return null;

    const toCall = this.currentBet - player.totalBetThisRound;
    const handStrength = this._estimateHandStrength(player);

    // 简单AI策略
    if (handStrength < 0.3) {
      if (toCall === 0) return { action: 'check' };
      if (toCall > player.chips * 0.1) return { action: 'fold' };
      return { action: 'call' };
    }

    if (handStrength < 0.6) {
      if (toCall === 0) return { action: 'check' };
      if (toCall <= player.chips * 0.2) return { action: 'call' };
      return { action: 'fold' };
    }

    if (handStrength < 0.8) {
      if (toCall === 0) return { action: 'raise', amount: this.bigBlind * 3 };
      if (toCall <= player.chips * 0.3) return { action: 'call' };
      return { action: 'fold' };
    }

    // 强牌
    if (player.chips > 0) {
      return { action: 'raise', amount: Math.min(this.pot, player.chips) };
    }
    return { action: 'call' };
  }

  _estimateHandStrength(player) {
    // 简化版：基于底牌强度估计
    const c1 = player.holeCards[0];
    const c2 = player.holeCards[1];
    if (!c1 || !c2) return 0.5;

    let strength = 0;

    // 对子
    if (c1.value === c2.value) {
      strength = 0.4 + (c1.value - 2) / 12 * 0.4;
    }

    // 同花潜力
    if (c1.suit === c2.suit) strength += 0.1;

    // 顺子潜力
    const gap = Math.abs(c1.value - c2.value);
    if (gap <= 4) strength += 0.05 * (5 - gap);

    // 高牌
    strength += (c1.value + c2.value - 4) / 26 * 0.2;

    // 公共牌增强（如果有）
    if (this.communityCards.length > 0) {
      const allCards = [...player.holeCards, ...this.communityCards];
      const result = evaluateBestHand(allCards);
      strength += (result.rank / 10) * 0.3;
    }

    return Math.min(strength, 0.95);
  }

  getState() {
    return {
      phase: this.phase,
      phaseIndex: this.phaseIndex,
      communityCards: this.communityCards,
      pot: this.pot,
      currentBet: this.currentBet,
      currentPlayer: this.players[this.currentPlayerIndex],
      currentPlayerIndex: this.currentPlayerIndex,
      dealerIndex: this.dealerIndex,
      players: this.players.map(p => ({
        id: p.id,
        name: p.name,
        isHuman: p.isHuman,
        avatar: p.avatar,
        chips: p.chips,
        holeCards: p.isHuman || this.phase === 'SHOWDOWN' || !p.isActive ? p.holeCards : p.holeCards.map(() => ({ hidden: true })),
        isActive: p.isActive,
        isAllIn: p.isAllIn,
        totalBetThisRound: p.totalBetThisRound,
        handResult: p.handResult,
        seat: p.seat
      })),
      activePlayerCount: this.activePlayerCount,
      isGameOver: this.isGameOver,
      winners: this.winners.map(w => w.id),
      history: this.gameHistory.slice(-20),
      toCall: this.players[this.currentPlayerIndex] ? this.currentBet - this.players[this.currentPlayerIndex].totalBetThisRound : 0
    };
  }
}

module.exports = { TexasHoldemGame };