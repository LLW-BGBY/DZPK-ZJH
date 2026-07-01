// ============================
// 炸金花 游戏页面
// 所有 data 字段使用 zjh_ 前缀避免与德州变量冲突
// 复用现有房间 watch、筹码、底池等逻辑
// ============================

// 下注筹码动画版本追踪
let _zjhBetVers = {};

Page({
  data: {
    // 房间基础
    roomId: '',
    room: null,
    isLoading: true,
    isCreator: false,
    isMyTurn: false,
    myOpenId: '',
    myPlayer: null,

    // 炸金花特有 - 所有字段加 zjh_ 前缀
    zjh_players: [],
    zjh_playerPositions: [],
    zjh_pot: 0,
    zjh_potChanged: false,
    zjh_currentBet: 0,
    zjh_isDark: true,
    zjh_callAmount: 0,
    zjh_roundCount: 0,
    zjh_maxRounds: 20,
    zjh_baseBet: 100,
    zjh_capWarning: false,
    zjh_roundsLeft: 0,

    // 游戏状态
    zjh_phase: '',
    zjh_myHandRank: '',
    zjh_gameHistory: [],
    zjh_showActionButtons: false,
    zjh_showWaitingHint: false,
    zjh_isGameEnded: false,
    zjh_winners: [],
    zjh_allPlayersHand: [],
    zjh_confirmedCount: 0,
    zjh_totalToConfirm: 0,
    zjh_allConfirmed: false,
    allPlayersReady: false,

    // 操作按钮
    zjh_pendingAction: '',
    zjh_callButtonText: '跟注',
    zjh_raiseAmount: 0,
    zjh_raiseMultiplier: 2,
    zjh_minRaiseNominal: 0,
    zjh_minRaiseActual: 0,
    zjh_maxRaise: 0,
    zjh_showRaiseInput: false,
    zjh_quickRaiseOptions: [],
    zjh_compareTargets: [],
    zjh_showCompareSelect: false,
    zjh_selectedCompareTarget: '',
    zjh_comparingPlayers: [],

    // 倒计时
    zjh_countdown: 0,
    zjh_turnTimer: null,

    // watch 保活
    watchInstance: null,
    reconnectTimer: null,
    lastWatchTime: 0,
    watchKeepTimer: null,
    watchRetryCount: 0,
    waitSyncTimer: null,
    cloudUrlCache: {},

    // 重买
    canRebuy: false,
    showRebuyModal: false,
    rebuyAmount: 0,

    // 聊天
    showChat: false,
    chatUnread: 0,
    chatMessages: [],
    recentChatMessages: [],
    chatInput: '',

    // 准备阶段倒计时（内联显示，不弹窗）
    startCountdown: 0,
    autoStarting: false,
    pendingReady: false,
    pendingConfirm: false,

    // 快捷消息
    quickMessages: [
      { text: ' 我很大你们注意一下', emoji: '👋' },
      { text: ' 我直接梭哈', emoji: '😎' },
      { text: ' 来跟我比比', emoji: '🤔' },
      { text: ' 郭锦航利索点', emoji: '💩' },
      { text: ' 哈哈哈', emoji: '😂' },
      { text: ' 原来是豹子啊', emoji: '😡' },
      { text: ' 什么烂牌，真服了', emoji: '🙏' },
      { text: ' 我是马牛逼，我头像有粑粑', emoji: '💩' },
      { text: ' 介么大？？？', emoji: '💪' },
      { text: ' 直接就是弃牌，垃圾玩意', emoji: '👋' }
    ],

    handCount: 1,
    maxHands: 10,
    isFinalHand: false,
    activePlayerCount: 0,
    readyCount: 0,

    // 比牌动画
    zjh_showCompareAnim: false,
    zjh_compareAnimPhase: 0,
    zjh_compareAnimData: null,
    zjh_showTotalResult: false,
    zjh_sortedTotalPlayers: [],
    zjh_compareAnimResult: '',
    zjh_compareAnimMyConfirm: false,
    zjh_compareAnimOppConfirm: false,
    zjh_compareAnimInitiatorOpenId: '',
    zjh_compareAnimTargetOpenId: '',
    zjh_compareAnimClosing: false,
    zjh_compareCloseCountdown: 0,
    _zjh_compareClosing: false,
    zjh_compareLoser: '',
    zjh_outPlayers: [],
    zjh_comparingPlayers: [],
    zjh_isSpectator: false,
    _lastZjhRoundCount: -1,
    _zjhCompareCloseTimer: null,
    _lastCompareTimestamp: 0,
    _compareAnimTimers: []
  },

  zjh_computePlayerPositions(players, myOpenId) {
    const total = players.length;
    if (total === 0) return [];
    if (total === 1) return [{ top: 'calc(50% + 0rpx)', left: 'calc(50% + 0rpx)' }];

    const positions = [];
    const selfIdx = players.findIndex(p => p.openId === myOpenId);
    const idx = selfIdx >= 0 ? selfIdx : 0;

    for (let i = 0; i < total; i++) {
      let angle;
      if (total === 2) {
        angle = i === idx ? 90 : 270;
      } else if (total === 3) {
        const angles = [90, 210, 330];
        const offset = (i - idx + total) % total;
        angle = angles[offset];
      } else {
        angle = 90 + (360 / total) * ((i - idx + total) % total);
      }
      if (angle >= 360) angle -= 360;

      const rad = (angle * Math.PI) / 180;
      const hRadiusRpx = 280;
      const vRadiusRpx = 320;
      const leftRpx = Math.round(hRadiusRpx * Math.cos(rad));
      const topRpx = Math.round(vRadiusRpx * Math.sin(rad));
      const left = leftRpx >= 0 ? `calc(50% + ${leftRpx}rpx)` : `calc(50% - ${-leftRpx}rpx)`;
      const top = topRpx >= 0 ? `calc(50% + ${topRpx}rpx)` : `calc(50% - ${-topRpx}rpx)`;

      positions.push({ top, left });
    }
    return positions;
  },

  zjh_computeRingData(players, myOpenId) {
    const ringPlayers = [];
    const ringIndices = [];
    for (let i = 0; i < players.length; i++) {
      if (players[i].openId !== myOpenId) {
        ringPlayers.push(players[i]);
        ringIndices.push(i);
      }
    }
    const total = ringPlayers.length;
    if (total === 0) return { ringPlayers: [], ringPositions: [], ringIndices: [] };

    // 围绕牌桌均匀分布 - 位置相对于牌桌(zjh-table-oval)
    // 牌桌是竖椭圆，头像压在牌桌边缘显示（部分超出牌桌）
    // 避开底部中央区域（留给我的手牌）
    // 从顶部中央开始顺时针：顶中 -> 右上 -> 右中 -> 右下 -> 左下 -> 左中 -> 左上 -> 回顶中
    const positionSchemes = {
      1: [
        { top: '0%', left: '50%' },
      ],
      2: [
        { top: '0%', left: '28%' },
        { top: '0%', left: '72%' },
      ],
      3: [
        { top: '0%', left: '50%' },
        { top: '30%', left: '100%' },
        { top: '30%', left: '0%' },
      ],
      4: [
        { top: '0%', left: '25%' },
        { top: '0%', left: '75%' },
        { top: '45%', left: '100%' },
        { top: '45%', left: '0%' },
      ],
      5: [
        { top: '0%', left: '50%' },
        { top: '20%', left: '100%' },
        { top: '60%', left: '100%' },
        { top: '60%', left: '0%' },
        { top: '20%', left: '0%' },
      ],
      6: [
        { top: '0%', left: '25%' },
        { top: '0%', left: '75%' },
        { top: '30%', left: '100%' },
        { top: '62%', left: '100%' },
        { top: '62%', left: '0%' },
        { top: '30%', left: '0%' },
      ],
      7: [
        { top: '0%', left: '50%' },
        { top: '8%', left: '88%' },
        { top: '35%', left: '100%' },
        { top: '60%', left: '100%' },
        { top: '60%', left: '0%' },
        { top: '35%', left: '0%' },
        { top: '8%', left: '12%' },
      ],
      8: [
        { top: '0%', left: '25%' },
        { top: '0%', left: '75%' },
        { top: '18%', left: '100%' },
        { top: '45%', left: '100%' },
        { top: '62%', left: '100%' },
        { top: '62%', left: '0%' },
        { top: '45%', left: '0%' },
        { top: '18%', left: '0%' },
      ],
      9: [
        { top: '0%', left: '50%' },
        { top: '5%', left: '82%' },
        { top: '22%', left: '100%' },
        { top: '45%', left: '100%' },
        { top: '62%', left: '100%' },
        { top: '62%', left: '0%' },
        { top: '45%', left: '0%' },
        { top: '22%', left: '0%' },
        { top: '5%', left: '18%' },
      ],
    };

    // 使用预设方案，超过9人时循环使用
    const scheme = positionSchemes[Math.min(total, 9)] || positionSchemes[9];
    const positions = [];
    for (let i = 0; i < total; i++) {
      const pos = scheme[i % scheme.length];
      // 根据位置判断类型：左侧(left)头像在左筹码在右，右侧(right)头像在右筹码在左，其余顶部(top)筹码在下方
      let type = 'top';
      if (pos.left === '0%') type = 'left';
      else if (pos.left === '100%') type = 'right';
      // 筹码动画版本：每次下注金额变化时递增，触发 CSS 动画重播
      const player = ringPlayers[i];
      const betKey = player.openId + '_bet';
      const prev = _zjhBetVers[betKey];
      const curBet = player.totalBetThisRound || 0;
      let ver = 0;
      if (!prev || prev.bet !== curBet) {
        ver = prev ? prev.ver + 1 : 0;
        _zjhBetVers[betKey] = { bet: curBet, ver: ver };
      } else {
        ver = prev.ver;
      }
      positions.push({ top: pos.top, left: pos.left, type: type, betKey: ver });
    }

    return { ringPlayers, ringPositions: positions, ringIndices };
  },

  // 炸金花三张牌牌型评估
  zjh_evaluateHand(holeCards) {
    if (!holeCards || holeCards.length < 3) return '';
    const rankMap = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14 };
    const cards = holeCards.map(c => ({ ...c, rank: rankMap[c.value] || 0 }));
    const ranks = cards.map(c => c.rank).sort((a, b) => b - a);
    const suits = cards.map(c => c.suit);

    const isFlush = suits.every(s => s === suits[0]);
    const isTriple = ranks[0] === ranks[1] && ranks[1] === ranks[2];

    // 顺子检测（含 A-2-3）
    let isStraight = false;
    if (ranks[0] - ranks[2] === 2 && new Set(ranks).size === 3) {
      isStraight = true;
    } else if (ranks[0] === 14 && ranks[1] === 3 && ranks[2] === 2) {
      isStraight = true; // A-3-2
    }

    if (isTriple) return '豹子';
    if (isFlush && isStraight) return '同花顺';
    if (isFlush) return '同花';
    if (isStraight) return '顺子';
    if (ranks[0] === ranks[1] || ranks[1] === ranks[2]) return '对子';
    return '散牌';
  },

  onLoad(options) {
    const app = getApp();
    const zjh_roomId = options.roomId || '';

    if (zjh_roomId === 'debug') {
      this.setData({ roomId: 'debug', myOpenId: 'debug_self', isDebug: true });
      this.zjh_loadDebugData();
      return;
    }

    if (!zjh_roomId) {
      this.setData({ roomId: 'debug', myOpenId: 'debug_self', isDebug: true });
      this.zjh_loadDebugData();
      return;
    }
    this.setData({ roomId: zjh_roomId, myOpenId: app.globalData.openId || '' });
  },

  onReady() {
    if (this.data.isDebug) return;
    this.zjh_watchRoom(); this.zjh_startWatchKeepAlive();
  },

  onShow() {
    if (this.data.isDebug) return;
    const zjh_now = Date.now();
    if (this.data.watchRetryCount > 3) {
      this.setData({ watchRetryCount: 0 });
    }
    if (this.data.lastWatchTime > 0 && zjh_now - this.data.lastWatchTime > 30000 && this.data.roomId) {
      if (this.data.watchInstance) { try { this.data.watchInstance.close(); } catch(e){} }
      this.setData({ watchInstance: null, watchRetryCount: 0 });
      this.zjh_watchRoom();
    }
    if (this.data.roomId && this.data.room && this.data.room.status === 'waiting') {
      this.zjh_fetchRoomData(this.data.roomId, 0);
    }
  },

  onHide() {
    if (this.data.watchInstance) {
      try { this.data.watchInstance.close(); } catch(e) {}
      this.setData({ watchInstance: null });
    }
  },

  onUnload() {
    if (this.data.watchInstance) this.data.watchInstance.close();
    if (this.data.reconnectTimer) clearTimeout(this.data.reconnectTimer);
    if (this.data.zjh_turnTimer) clearInterval(this.data.zjh_turnTimer);
    if (this.data.watchKeepTimer) clearInterval(this.data.watchKeepTimer);
    if (this.waitSyncTimer) clearInterval(this.waitSyncTimer);
    if (this.data._countdownTimer) clearInterval(this.data._countdownTimer);
    if (this.data._compareAnimTimers && this.data._compareAnimTimers.length > 0) {
      this.data._compareAnimTimers.forEach(t => clearTimeout(t));
      this.data._compareAnimTimers = [];
    }
    if (this.data._zjhComparePollTimer) {
      clearInterval(this.data._zjhComparePollTimer);
      this.data._zjhComparePollTimer = null;
    }
    if (this.data._zjhCompareCloseTimer) {
      clearInterval(this.data._zjhCompareCloseTimer);
      this.data._zjhCompareCloseTimer = null;
    }
  },

  // ============================
  // 调试模式 - 使用 roomId=debug 进入，无需数据库
  // ============================

  zjh_loadDebugData() {
    const zjh_self = {
      openId: 'debug_self',
      name: '我',
      chips: 5000,
      avatarUrl: '',
      isActive: true,
      isAllIn: false,
      isCreator: true,
      isReady: true,
      zjh_isDark: true,
      totalBetThisRound: 0,
      totalBet: 0,
      holeCards: [
        { suit: 'S', value: 'A', rank: 14 },
        { suit: 'H', value: 'K', rank: 13 },
        { suit: 'D', value: 'Q', rank: 12 }
      ],
      handRank: '同花顺',
      handType: 'straight_flush',
      rebuyCount: 3,
      isFolded: false
    };

    const zjh_opponents = [
      {
        openId: 'debug_p1',
        name: '小明',
        chips: 3800,
        avatarUrl: '',
        isActive: true,
        isAllIn: false,
        isCreator: false,
        isReady: true,
        zjh_isDark: false,
        totalBetThisRound: 200,
        totalBet: 200,
        holeCards: [
          { suit: 'C', value: '9', rank: 9 },
          { suit: 'D', value: '9', rank: 9 },
          { suit: 'H', value: '9', rank: 9 }
        ],
        handRank: '豹子',
        handType: 'triple',
        rebuyCount: 0,
        isFolded: false
      },
      {
        openId: 'debug_p2',
        name: '小红',
        chips: 2100,
        avatarUrl: '',
        isActive: true,
        isAllIn: false,
        isCreator: false,
        isReady: true,
        zjh_isDark: true,
        totalBetThisRound: 100,
        totalBet: 100,
        holeCards: [
          { suit: 'S', value: '5', rank: 5 },
          { suit: 'D', value: '7', rank: 7 },
          { suit: 'H', value: '2', rank: 2 }
        ],
        handRank: '散牌',
        handType: 'high_card',
        rebuyCount: 1,
        isFolded: false
      },
      {
        openId: 'debug_p3',
        name: '老张',
        chips: 0,
        avatarUrl: '',
        isActive: false,
        isAllIn: false,
        isCreator: false,
        isReady: true,
        zjh_isDark: false,
        totalBetThisRound: 0,
        totalBet: 600,
        holeCards: [
          { suit: 'C', value: 'J', rank: 11 },
          { suit: 'H', value: 'J', rank: 11 },
          { suit: 'D', value: '3', rank: 3 }
        ],
        handRank: '对子',
        handType: 'pair',
        rebuyCount: 0,
        isFolded: false,
        profit: -600
      },
      {
        openId: 'debug_p4',
        name: '阿强',
        chips: 1500,
        avatarUrl: '',
        isActive: true,
        isAllIn: true,
        isCreator: false,
        isReady: true,
        zjh_isDark: true,
        totalBetThisRound: 1500,
        totalBet: 1500,
        holeCards: [],
        handRank: '',
        handType: '',
        rebuyCount: 2,
        isFolded: false
      },
      {
        openId: 'debug_p5',
        name: '王五',
        chips: 3200,
        avatarUrl: '',
        isActive: false,
        isAllIn: false,
        isCreator: false,
        isReady: true,
        zjh_isDark: false,
        totalBetThisRound: 0,
        totalBet: 400,
        holeCards: [],
        handRank: '',
        handType: '',
        rebuyCount: 0,
        isFolded: true
      },
      {
        openId: 'debug_p6',
        name: '赵六',
        chips: 1800,
        avatarUrl: '',
        isActive: false,
        isAllIn: false,
        isCreator: false,
        isReady: true,
        zjh_isDark: false,
        totalBetThisRound: 0,
        totalBet: 300,
        holeCards: [],
        handRank: '',
        handType: '',
        rebuyCount: 0,
        isFolded: false
      }
    ];

    const zjh_allPlayers = [zjh_self, ...zjh_opponents];

    this.setData({
      isLoading: false,
      isCreator: true,
      isMyTurn: true,
      myPlayer: zjh_self,
      zjh_players: zjh_allPlayers.map(p => ({
        ...p,
        isComparing: p.openId === 'debug_p1'
      })),
      zjh_playerPositions: this.zjh_computePlayerPositions(zjh_allPlayers, 'debug_self'),
      ...this.zjh_computeRingData(zjh_allPlayers, 'debug_self'),
      zjh_selfIndex: 0,
      zjh_pot: 2400,
      zjh_currentBet: 200,
      zjh_isDark: true,
      zjh_myHandRank: this.zjh_evaluateHand(zjh_self.holeCards),
      zjh_callAmount: 200,
      zjh_roundCount: 8,
      zjh_maxRounds: 20,
      zjh_baseBet: 100,
      zjh_capWarning: true,
      zjh_roundsLeft: 2,
      zjh_phase: 'PLAYING',
      zjh_comparingPlayers: ['debug_p1'],
      zjh_gameHistory: [
        { type: 'system', message: '游戏开始！底注 100', time: Date.now() - 60000 },
        { type: 'action', message: '我 下注 100（暗牌）', time: Date.now() - 55000 },
        { type: 'action', message: '小明 下注 200（明牌）', time: Date.now() - 50000 },
        { type: 'action', message: '小红 下注 100（暗牌）', time: Date.now() - 45000 },
        { type: 'action', message: '老张 输光出局', time: Date.now() - 40000 },
        { type: 'action', message: '阿强 ALL IN 1500！', time: Date.now() - 35000 },
        { type: 'action', message: '王五 弃牌', time: Date.now() - 30000 },
        { type: 'action', message: '赵六 比牌负于 我', time: Date.now() - 25000 },
        { type: 'system', message: '当前底池 2400', time: Date.now() - 20000 }
      ],
      zjh_showActionButtons: true,
      zjh_showWaitingHint: false,
      zjh_isGameEnded: false,
      zjh_callButtonText: '跟注 200',
      zjh_compareTargets: zjh_opponents.filter(p => p.isActive && !p.isAllIn).map(p => ({ openId: p.openId, name: p.name })),
      zjh_minRaiseNominal: 300,
      zjh_minRaiseActual: 300,
      zjh_maxRaise: 5000,
      zjh_quickRaiseOptions: [
        { label: '最小加注', value: 300, nominal: 300 },
        { label: '翻倍', value: 400, nominal: 400 },
        { label: '半池', value: 1200, nominal: 1200 },
        { label: '满池', value: 2400, nominal: 2400 },
        { label: '梭哈', value: 5000, nominal: 5000 }
      ],
      zjh_countdown: 15,
      room: {
        status: 'playing',
        players: zjh_allPlayers,
        dealerIndex: 0,
        currentPlayerIndex: 1,
        roomNumber: '123456'
      },
      handCount: 1,
      maxHands: 10,
      isFinalHand: false,
      activePlayerCount: 3
    });
  },
// ============================
  // Watch 保活 (复用德州逻辑)
  // ============================

  zjh_startWatchKeepAlive() {
    const zjh_timer = setInterval(() => {
      const zjh_now = Date.now();
      if (this.data.watchRetryCount > 3) return;
      if (this.data.lastWatchTime > 0 && zjh_now - this.data.lastWatchTime > 30000 && this.data.roomId) {
        if (this.data.watchInstance) { try { this.data.watchInstance.close(); } catch(e){} }
        this.setData({ watchInstance: null, watchRetryCount: 0 });
        this.zjh_watchRoom();
      }
    }, 15000);
    this.setData({ watchKeepTimer: zjh_timer });
  },

  zjh_watchRoom() {
    const { roomId } = this.data;
    if (!roomId) return;
    const db = wx.cloud.database();
    db.collection('rooms').doc(roomId).get().then(res => {
      if (res && res.data) {
        this.setData({ lastWatchTime: Date.now(), watchRetryCount: 0 });
        this.zjh_updateRoomState(res.data);
        this.zjh_setupWatch();
      } else {
        this.setData({ reconnectTimer: setTimeout(() => this.zjh_watchRoom(), 2000) });
      }
    }).catch(() => {
      this.setData({ reconnectTimer: setTimeout(() => this.zjh_watchRoom(), 2000) });
    });
  },

  zjh_setupWatch() {
    const { roomId } = this.data;
    if (!roomId) return;
    const db = wx.cloud.database();
    try {
      const zjh_watch = db.collection('rooms').doc(roomId).watch({
        onChange: (snapshot) => {
          try {
            this.setData({ lastWatchTime: Date.now(), watchRetryCount: 0 });
            let zjh_room = null;
            if (snapshot && snapshot.docChanges && snapshot.docChanges.length > 0) {
              const zjh_change = snapshot.docChanges[0];
              if (zjh_change.dataType !== 'remove' && zjh_change.doc) {
                zjh_room = zjh_change.doc;
              }
            }
            if (!zjh_room && snapshot && snapshot.docs && snapshot.docs.length > 0) {
              zjh_room = snapshot.docs[0];
            }
            if (zjh_room) {
              this.zjh_updateRoomState(zjh_room);
            }
          } catch (e) { console.error('zjh watch onChange error:', e); }
        },
        onError: (err) => {
          console.error('zjh watch error:', err);
          if (this.data.watchInstance) { try { this.data.watchInstance.close(); } catch(e){} }
          const zjh_retry = this.data.watchRetryCount + 1;
          this.setData({ watchInstance: null, watchRetryCount: zjh_retry });
          const zjh_delay = Math.min(Math.pow(2, zjh_retry) * 1000, 30000);
          this.setData({ reconnectTimer: setTimeout(() => this.zjh_watchRoom(), zjh_delay) });
        }
      });
      this.setData({ watchInstance: zjh_watch });
    } catch (e) {
      const zjh_retry = this.data.watchRetryCount + 1;
      this.setData({ watchRetryCount: zjh_retry });
      const zjh_delay = Math.min(Math.pow(2, zjh_retry) * 1000, 30000);
      this.setData({ reconnectTimer: setTimeout(() => this.zjh_watchRoom(), zjh_delay) });
    }
  },

  zjh_fetchRoomData(zjh_roomId, zjh_retryCount) {
    const db = wx.cloud.database();
    db.collection('rooms').doc(zjh_roomId).get().then(res => {
      if (res && res.data) {
        this.setData({ lastWatchTime: Date.now() });
        this.zjh_updateRoomState(res.data);
      } else {
        if (zjh_retryCount < 3) {
          this.setData({ reconnectTimer: setTimeout(() => this.zjh_fetchRoomData(zjh_roomId, zjh_retryCount + 1), 2000) });
        } else {
          this.setData({ isLoading: false });
        }
      }
    }).catch(() => {
      if (zjh_retryCount < 3) {
        this.setData({ reconnectTimer: setTimeout(() => this.zjh_fetchRoomData(zjh_roomId, zjh_retryCount + 1), 2000) });
      } else {
        this.setData({ isLoading: false });
      }
    });
  },

  onRetryLoad() {
    this.setData({ isLoading: true });
    this.zjh_fetchRoomData(this.data.roomId, 0);
  },

  // ============================
  // 房间状态更新 (炸金花专用)
  // ============================

  async zjh_updateRoomState(zjh_room) {
    if (!zjh_room || !zjh_room.players) {
      this.setData({ isLoading: false });
      return;
    }

    try {
      await this.zjh_convertCloudAvatars(zjh_room);
    } catch (e) { console.error('zjh avatar convert error:', e); }

    // 乐观更新处理
    if (this.data.pendingReady && this.data.myOpenId) {
      const zjh_localReady = this.data.myPlayer ? this.data.myPlayer.isReady : false;
      zjh_room = {
        ...zjh_room,
        players: zjh_room.players.map(p =>
          p.openId === this.data.myOpenId ? { ...p, isReady: zjh_localReady } : p
        )
      };
    }
    if (this.data.pendingConfirm && this.data.myOpenId) {
      const zjh_localConfirmed = this.data.myPlayer ? this.data.myPlayer.confirmedNext : false;
      zjh_room = {
        ...zjh_room,
        players: zjh_room.players.map(p =>
          p.openId === this.data.myOpenId ? { ...p, confirmedNext: zjh_localConfirmed } : p
        )
      };
    }

    const app = getApp();
    const zjh_myOpenId = app.globalData.openId || '';
    const zjh_myPlayer = zjh_room.players.find(p => p.openId === zjh_myOpenId) || null;
    const zjh_isSpectator = !zjh_myPlayer && (zjh_room.spectators || []).some(s => s.openId === zjh_myOpenId);
    const zjh_isCreator = zjh_room.creatorOpenId === zjh_myOpenId;
    const zjh_currentPlayer = zjh_room.players[zjh_room.currentPlayerIndex] || null;
    const zjh_isMyTurn = zjh_currentPlayer && zjh_currentPlayer.openId === zjh_myOpenId && zjh_room.status === 'playing';
    const zjh_isGameEnded = zjh_room.status === 'ended' || zjh_room.phase === 'SHOWDOWN';

    // 炸金花特有计算
    const zjh_currentBet = zjh_room.currentBet || zjh_room.zjh_baseBet || 100;
    const zjh_isDark = zjh_myPlayer ? (zjh_myPlayer.zjh_isDark !== false) : true;
    const zjh_multiplier = zjh_isDark ? 1 : 2;
    const zjh_callAmount = zjh_myPlayer ? Math.min(zjh_currentBet * zjh_multiplier, zjh_myPlayer.chips) : 0;
    const zjh_maxRounds = zjh_room.zjh_maxRounds || 20;
    const zjh_roundCount = zjh_room.zjh_roundCount || 0;
    const zjh_roundsLeft = zjh_maxRounds - zjh_roundCount;
    const zjh_capWarning = zjh_roundsLeft <= 3;
    const zjh_baseBet = zjh_room.zjh_baseBet || 100;

    // 新回合开始，重置所有OUT状态
    if (zjh_roundCount !== this.data._lastZjhRoundCount && this.data._lastZjhRoundCount !== -1) {
      this.setData({ zjh_outPlayers: [], zjh_comparingPlayers: [] });
    }
    this.setData({ _lastZjhRoundCount: zjh_roundCount });

    // 从服务器 zjh_lastCompare 推导比牌状态和OUT玩家（所有玩家可见）
    let zjh_comparingPlayers = this.data.zjh_comparingPlayers || [];
    let zjh_outPlayers = this.data.zjh_outPlayers || [];
    const zjh_lastCompare = zjh_room.zjh_lastCompare;
    if (zjh_lastCompare && zjh_lastCompare.initiatorOpenId && zjh_lastCompare.targetOpenId) {
      const zjh_compareTimestamp = zjh_lastCompare.timestamp || 0;
      const zjh_compareAge = Date.now() - zjh_compareTimestamp;
      // 只处理 15 秒内的比牌（超时的忽略，防止旧数据污染）
      if (zjh_compareAge < 15000) {
        zjh_comparingPlayers = [zjh_lastCompare.initiatorOpenId, zjh_lastCompare.targetOpenId];
        // 推导输家
        const zjh_result = zjh_lastCompare.result;
        const zjh_loser = zjh_result === 'win' ? zjh_lastCompare.targetOpenId
          : zjh_result === 'lose' ? zjh_lastCompare.initiatorOpenId
          : zjh_lastCompare.initiatorOpenId; // 平局发起者输
        zjh_outPlayers = [...new Set([...zjh_outPlayers, zjh_loser])];
      }
    }

    const zjh_showActionButtons = zjh_isMyTurn && !zjh_isGameEnded && zjh_myPlayer &&
      zjh_myPlayer.isActive && !zjh_myPlayer.isAllIn;
    const zjh_showWaitingHint = !zjh_isMyTurn && zjh_room.status === 'playing' && zjh_myPlayer &&
      zjh_myPlayer.isActive && !zjh_myPlayer.isAllIn && !zjh_isGameEnded;

    const zjh_autoStarting = zjh_room.status === 'playing' ? false : this.data.autoStarting;

    // 跟注按钮文字（跟上次下注金额，第一人跟底注）
    let zjh_callButtonText = '跟注';
    if (zjh_myPlayer && zjh_currentBet > 0) {
      const zjh_actualCall = zjh_currentBet * zjh_multiplier;
      if (zjh_myPlayer.chips <= zjh_actualCall) {
        zjh_callButtonText = '全押 ' + zjh_myPlayer.chips;
      } else {
        zjh_callButtonText = '跟注 ' + zjh_actualCall + (zjh_isDark ? '' : ' (明牌x2)');
      }
    }

    // 快速加注选项（value=实际支付金额, nominal=名义下注额传给后端）
    const zjh_minRaise = zjh_room.minRaise || zjh_baseBet;
    const zjh_minRaiseNominal = zjh_currentBet + zjh_minRaise;
    const zjh_minRaiseActual = zjh_minRaiseNominal * zjh_multiplier;
    const zjh_totalChips = zjh_myPlayer ? zjh_myPlayer.chips : 0;
    const zjh_maxRaise = zjh_totalChips;

    let zjh_quickRaiseOptions = [];
    if (zjh_myPlayer && zjh_room) {
      const zjh_doubleActual = zjh_currentBet * 2 * zjh_multiplier;
      const zjh_halfPot = Math.floor(zjh_room.pot / 2);
      const zjh_potSize = zjh_room.pot;

      const zjh_opts = [
        { label: '最小加注', value: zjh_minRaiseActual, nominal: zjh_minRaiseNominal },
        { label: '翻倍', value: zjh_doubleActual, nominal: zjh_currentBet * 2 },
        { label: '半池', value: Math.max(zjh_halfPot, zjh_minRaiseActual), nominal: Math.max(Math.floor(zjh_halfPot / zjh_multiplier), zjh_minRaiseNominal) },
        { label: '满池', value: Math.max(zjh_potSize, zjh_minRaiseActual), nominal: Math.max(Math.floor(zjh_potSize / zjh_multiplier), zjh_minRaiseNominal) },
        { label: '梭哈', value: zjh_totalChips, nominal: Math.floor(zjh_totalChips / zjh_multiplier) }
      ];

      const zjh_seen = new Set();
      zjh_quickRaiseOptions = zjh_opts.filter(o => {
        if (o.value < zjh_minRaiseActual || o.value > zjh_totalChips) return false;
        if (zjh_seen.has(o.value)) return false;
        zjh_seen.add(o.value);
        return true;
      });
    }

    // 可比的玩家列表
    const zjh_compareTargets = zjh_room.players
      .filter(p => p.openId !== zjh_myOpenId && p.isActive && !p.isAllIn)
      .map(p => ({ openId: p.openId, name: p.name }));

    // 结算数据
    let zjh_allPlayersHand = [];
    let zjh_confirmedCount = 0;
    let zjh_totalToConfirm = 0;
    let zjh_allConfirmed = false;
    const zjh_handCount = zjh_room.handCount || 1;
    const zjh_maxHandsGlobal = zjh_room.maxHands || 10;
    const zjh_isFinalHand = zjh_room.isFinalHand || zjh_handCount >= zjh_maxHandsGlobal;

    if (zjh_isGameEnded && zjh_room.players) {
      zjh_allPlayersHand = zjh_room.players.map(p => {
        const zjh_displayProfit = p.profit || 0;
        const zjh_isWinner = zjh_displayProfit > 0;
        const zjh_hasBet = (p.totalBet || 0) > 0 || (p.totalBetThisRound || 0) > 0;
        return {
          name: p.name,
          openId: p.openId,
          avatarUrl: p.avatarUrl || '',
          hasRebuy: p.hasRebuy || false,
          rebuyCount: p.rebuyCount || 0,
          chips: p.chips,
          handName: p.zjh_handResult ? p.zjh_handResult.name : (p.isActive || p.isAllIn ? '全部押注' : '已弃牌'),
          isFolded: !p.isActive && !p.isAllIn && !p.zjh_handResult,
          holeCards: p.holeCards || [],
          isWinner: zjh_isWinner,
          isActive: p.isActive,
          hasBet: zjh_hasBet,
          confirmedNext: p.confirmedNext || false,
          profit: p.profit || 0,
          winAmount: p.winAmount || 0,
          lossAmount: p.lossAmount || 0,
          totalProfit: p.totalProfit || 0,
          zjh_isDark: p.zjh_isDark
        };
      });
      zjh_confirmedCount = zjh_allPlayersHand.filter(p => p.confirmedNext).length;
      zjh_totalToConfirm = zjh_allPlayersHand.length;
      zjh_allConfirmed = zjh_totalToConfirm > 0 && zjh_confirmedCount >= zjh_totalToConfirm;

      const zjh_sortedTotalPlayers = [...zjh_allPlayersHand].sort((a, b) => b.chips - a.chips);
      this.setData({ zjh_sortedTotalPlayers });
    }

    const zjh_canRebuy = (zjh_room.status === 'waiting' || zjh_room.status === 'ended') &&
      zjh_myPlayer && zjh_myPlayer.chips <= 0 && (zjh_myPlayer.rebuyCount || 0) < 3;

    // 聊天消息：仅在数量变化时更新，避免每次 setData 都传整个数组
    const zjh_newChatMessages = (zjh_room.chatMessages || []).slice(-20).map(m => {
      if (typeof m === 'string') {
        return { name: '', message: m, type: 'chat', time: 0 };
      }
      return m;
    });
    const zjh_oldChatLen = (this.data.chatMessages || []).length;
    const zjh_newChatLen = zjh_newChatMessages.length;
    let zjh_chatUnread = this.data.chatUnread;
    const zjh_chatChanged = zjh_newChatLen !== zjh_oldChatLen;
    if (zjh_newChatLen > zjh_oldChatLen && !this.data.showChat) {
      zjh_chatUnread += zjh_newChatLen - zjh_oldChatLen;
    }

    // 游戏日志：仅在长度变化时更新
    const zjh_newHistory = (zjh_room.gameHistory || []).slice(-30);
    const zjh_historyChanged = zjh_newHistory.length !== (this.data.zjh_gameHistory || []).length;

    const zjh_activePlayers = (zjh_room.players || []).filter(p => p.chips > 0);
    const zjh_activePlayerCount = zjh_activePlayers.length;
    const zjh_readyCount = zjh_activePlayers.filter(p => p.isReady).length;
    const allPlayersReady = zjh_room.status === 'waiting' && zjh_activePlayerCount >= 2 && zjh_activePlayers.every(p => p.isReady);

    // 底池变化检测 —— 用于触发数字跳动动画
    const zjh_newPot = zjh_room.pot || 0;
    const zjh_potValueChanged = zjh_newPot !== this.data.zjh_pot;

    const zjh_setData = {
      room: zjh_room, isLoading: false, isCreator: zjh_isCreator, isMyTurn: zjh_isMyTurn,
      myOpenId: zjh_myOpenId, myPlayer: zjh_myPlayer, zjh_isSpectator,
      activePlayerCount: zjh_activePlayerCount,
      readyCount: zjh_readyCount,

      zjh_players: (zjh_room.players || []).map(p => ({
        ...p,
        isFolded: !p.isActive && !p.isAllIn,
        isComparing: zjh_comparingPlayers.indexOf(p.openId) > -1
      })),
      zjh_playerPositions: this.zjh_computePlayerPositions(zjh_room.players || [], zjh_myOpenId),
      ...this.zjh_computeRingData(zjh_room.players || [], zjh_myOpenId),
      zjh_selfIndex: (zjh_room.players || []).findIndex(p => p.openId === zjh_myOpenId),
      zjh_pot: zjh_newPot,
      zjh_potChanged: false,
      zjh_currentBet: zjh_currentBet,
      zjh_isDark: zjh_isDark,
      zjh_myHandRank: zjh_myPlayer ? this.zjh_evaluateHand(zjh_myPlayer.holeCards || []) : '',
      zjh_callAmount: zjh_callAmount,
      zjh_roundCount: zjh_roundCount,
      zjh_maxRounds: zjh_maxRounds,
      zjh_baseBet: zjh_baseBet,
      zjh_capWarning: zjh_capWarning,
      zjh_roundsLeft: zjh_roundsLeft,
      zjh_phase: zjh_room.phase || '',
      zjh_showActionButtons: zjh_showActionButtons,
      zjh_showWaitingHint: zjh_showWaitingHint,
      zjh_isGameEnded: zjh_isGameEnded,
      zjh_allPlayersHand: zjh_allPlayersHand,
      zjh_confirmedCount: zjh_confirmedCount,
      zjh_totalToConfirm: zjh_totalToConfirm,
      zjh_allConfirmed: zjh_allConfirmed,
      zjh_callButtonText: zjh_callButtonText,
      zjh_minRaiseNominal: zjh_minRaiseNominal,
      zjh_minRaiseActual: zjh_minRaiseActual,
      zjh_maxRaise: zjh_maxRaise,
      zjh_quickRaiseOptions: zjh_quickRaiseOptions,
      zjh_compareTargets: zjh_compareTargets,
      zjh_comparingPlayers: zjh_comparingPlayers,
      zjh_outPlayers: zjh_outPlayers,
      zjh_pendingAction: '',
      autoStarting: zjh_autoStarting,
      chatUnread: zjh_chatUnread,
      recentChatMessages: zjh_newChatMessages.slice(-2),
      canRebuy: zjh_canRebuy,
      allPlayersReady,
      handCount: zjh_handCount,
      maxHands: zjh_maxHandsGlobal,
      isFinalHand: zjh_isFinalHand
    };

    if (zjh_chatChanged) zjh_setData.chatMessages = zjh_newChatMessages;
    if (zjh_historyChanged) zjh_setData.zjh_gameHistory = zjh_newHistory;

    // 如果底池变化，先开启动画，稍后关闭
    if (zjh_potValueChanged) {
      zjh_setData.zjh_potChanged = true;
    }

    this.setData(zjh_setData);

    // 动画结束后重置状态（略长于 CSS 动画时间）
    if (zjh_potValueChanged) {
      setTimeout(() => {
        if (this.data.zjh_potChanged) {
          this.setData({ zjh_potChanged: false });
        }
      }, 600);
    }

    // 回合倒计时管理
    this.zjh_manageTurnTimer(zjh_isMyTurn, zjh_callAmount);

    // 等待阶段轮询
    this.zjh_manageWaitSync(zjh_room.status === 'waiting' || zjh_room.status === 'ended');

    // 比牌动画
    this._checkCompareAnim(zjh_room);

    // 比牌确认状态同步 —— 通过 watcher 驱动，确认双方后自动关闭
    if (this.data.zjh_showCompareAnim) {
      const { zjh_compareAnimInitiatorOpenId, zjh_compareAnimTargetOpenId, myOpenId } = this.data;
      const opponentOpenId = myOpenId === zjh_compareAnimInitiatorOpenId ? zjh_compareAnimTargetOpenId : zjh_compareAnimInitiatorOpenId;
      const confirmMap = zjh_room.zjh_compareConfirmMap || {};

      const opponentConfirmed = confirmMap[opponentOpenId] === true;
      const meConfirmed = this.data.zjh_compareAnimMyConfirm;

      if (opponentConfirmed && !this.data.zjh_compareAnimOppConfirm) {
        this.setData({ zjh_compareAnimOppConfirm: true });
      }
      if (meConfirmed && !this.data.zjh_compareAnimMyConfirm) {
        this.setData({ zjh_compareAnimMyConfirm: true });
      }

      // 双方都确认后，启动3秒关闭倒计时
      if (opponentConfirmed && meConfirmed && !this.data._zjh_compareClosing) {
        this.data._zjh_compareClosing = true;
        if (this.data._zjhComparePollTimer) { clearInterval(this.data._zjhComparePollTimer); this.data._zjhComparePollTimer = null; }
        if (this.data._compareAnimTimers) {
          this.data._compareAnimTimers.forEach(t => clearTimeout(t));
        }
        if (this.data._zjhCompareCloseTimer) {
          clearInterval(this.data._zjhCompareCloseTimer);
        }
        this.setData({ zjh_compareAnimPhase: 8, zjh_compareAnimClosing: true });
        let zjh_closeCountdown = 3;
        this.setData({ zjh_compareCloseCountdown: zjh_closeCountdown });
        this.data._zjhCompareCloseTimer = setInterval(() => {
          zjh_closeCountdown--;
          if (zjh_closeCountdown <= 0) {
            clearInterval(this.data._zjhCompareCloseTimer);
            this.data._zjhCompareCloseTimer = null;
            this.data._zjh_compareClosing = false;
            const outPlayers = [...(this.data.zjh_outPlayers || [])];
            if (this.data.zjh_compareLoser) {
              outPlayers.push(this.data.zjh_compareLoser);
            }
            this.setData({
              zjh_showCompareAnim: false,
              zjh_compareAnimData: null,
              zjh_compareAnimPhase: 0,
              zjh_compareAnimMyConfirm: false,
              zjh_compareAnimOppConfirm: false,
              zjh_compareAnimClosing: false,
              zjh_compareCloseCountdown: 0,
              zjh_compareLoser: '',
              zjh_outPlayers: outPlayers,
              zjh_comparingPlayers: [],
              zjh_players: (this.data.zjh_players || []).map(p => ({
                ...p,
                isComparing: false
              }))
            });
          } else {
            this.setData({ zjh_compareCloseCountdown: zjh_closeCountdown });
          }
        }, 1000);
      }
    } else {
      // 比牌动画关闭时清理轮询
      if (this.data._zjhComparePollTimer) {
        clearInterval(this.data._zjhComparePollTimer);
        this.data._zjhComparePollTimer = null;
      }
    }

    // 全员准备倒计时
    this.zjh_checkAutoStartGame(zjh_room);

    // 结算阶段全员确认倒计时
    if (zjh_isGameEnded && zjh_allConfirmed) {
      this.zjh_checkAutoStart(zjh_room);
    }

    // 服务器同步倒计时管理（所有玩家可见，放在checkAutoStart之后）
    this._manageCountdown(zjh_room);
  },

  zjh_manageWaitSync(zjh_isWaiting) {
    const zjh_isEnded = this.data.room && this.data.room.status === 'ended';
    const zjh_needPoll = zjh_isWaiting || zjh_isEnded;

    if (!zjh_needPoll) {
      if (this.waitSyncTimer) { clearInterval(this.waitSyncTimer); this.waitSyncTimer = null; }
      return;
    }
    if (this.waitSyncTimer) return;
    this.waitSyncTimer = setInterval(() => {
      const { roomId, room } = this.data;
      if (!roomId || !room) {
        if (this.waitSyncTimer) { clearInterval(this.waitSyncTimer); this.waitSyncTimer = null; }
        return;
      }
      if (this.data.lastWatchTime > 0 && Date.now() - this.data.lastWatchTime < 2000) return;
      this.zjh_fetchRoomData(roomId, 0);
    }, 3000);
  },

  async zjh_convertCloudAvatars(zjh_room) {
    if (!zjh_room || !zjh_room.players) return;
    const zjh_cache = this.data.cloudUrlCache || {};
    const zjh_needConvert = [];
    zjh_room.players.forEach((p, i) => {
      if (p.avatarUrl && p.avatarUrl.startsWith('cloud://')) {
        if (zjh_cache[p.avatarUrl]) {
          p.avatarUrl = zjh_cache[p.avatarUrl];
        } else {
          zjh_needConvert.push({ index: i, cloudUrl: p.avatarUrl });
        }
      }
    });
    if (zjh_needConvert.length === 0) return;
    const zjh_fileList = zjh_needConvert.map(item => item.cloudUrl);
    try {
      const zjh_res = await wx.cloud.callFunction({
        name: 'batchGetTempUrls',
        data: { fileList: zjh_fileList }
      });
      const zjh_result = zjh_res.result;
      if (zjh_result && zjh_result.success && zjh_result.fileList) {
        const zjh_newCache = { ...zjh_cache };
        zjh_result.fileList.forEach(item => {
          if (item.tempFileURL) zjh_newCache[item.fileID] = item.tempFileURL;
        });
        this.setData({ cloudUrlCache: zjh_newCache });
        zjh_needConvert.forEach(({ index, cloudUrl }) => {
          if (zjh_newCache[cloudUrl] && zjh_room.players[index]) {
            zjh_room.players[index].avatarUrl = zjh_newCache[cloudUrl];
          } else {
            zjh_room.players[index].avatarUrl = '';
          }
        });
      }
    } catch (e) { console.error('zjh avatar convert error:', e); }
  },

  onAvatarError(e) {
    console.error('头像加载失败:', e.detail);
    const idx = e.currentTarget && e.currentTarget.dataset ? e.currentTarget.dataset.idx : undefined;
    if (idx !== undefined && this.data.zjh_players && this.data.zjh_players[idx]) {
      const players = this.data.zjh_players.slice();
      players[idx] = { ...players[idx], avatarUrl: '' };
      this.setData({ zjh_players: players });
    }
  },

  // ============================
  // 倒计时管理
  // ============================

  zjh_manageTurnTimer(zjh_isMyTurn, zjh_callAmount) {
    if (this.data.zjh_turnTimer) { clearInterval(this.data.zjh_turnTimer); this.data.zjh_turnTimer = null; }
    if (!zjh_isMyTurn) { this.setData({ zjh_countdown: 0 }); return; }
    let zjh_sec = 30;
    this.setData({ zjh_countdown: zjh_sec });
    const zjh_timer = setInterval(() => {
      zjh_sec--;
      this.setData({ zjh_countdown: zjh_sec });
      if (zjh_sec <= 0) {
        clearInterval(zjh_timer);
        this.data.zjh_turnTimer = null;
        this.zjh_doAction('zjh_call');
      }
    }, 1000);
    this.data.zjh_turnTimer = zjh_timer;
  },

  // ============================
  // 游戏操作
  // ============================

  zjh_doAction(zjh_action, zjh_amount = 0, zjh_targetOpenId = '') {
    const { roomId, isMyTurn } = this.data;
    if (!isMyTurn) { wx.showToast({ title: '不是你的回合', icon: 'none' }); return; }
    if (this.data.zjh_pendingAction) { return; }
    if (this.data.zjh_turnTimer) { clearInterval(this.data.zjh_turnTimer); this.data.zjh_turnTimer = null; }

    this.setData({ zjh_countdown: 0, zjh_pendingAction: zjh_action, zjh_showActionButtons: false });
    const zjh_amt = Math.floor(zjh_amount || 0);

    wx.showLoading({ title: '处理中...', mask: true });

    wx.cloud.callFunction({
      name: 'gameActionZJH',
      data: { roomId, action: zjh_action, amount: zjh_amt, targetOpenId: zjh_targetOpenId }
    }).then(res => {
      wx.hideLoading();
      const zjh_result = (res && res.result) || {};
      if (!zjh_result.success && zjh_result.error) {
        wx.showToast({ title: zjh_result.error, icon: 'none', duration: 2000 });
        this.setData({ zjh_pendingAction: '' });
      } else {
        this.setData({ zjh_pendingAction: '' });
        setTimeout(() => this.zjh_fetchRoomData(roomId, 0), 300);
      }
    }).catch((err) => {
      wx.hideLoading();
      console.error('zjh_doAction error:', err);
      wx.showToast({ title: '网络请求失败，请重试', icon: 'none', duration: 2000 });
      this.setData({ zjh_pendingAction: '' });
      setTimeout(() => this.zjh_fetchRoomData(roomId, 0), 300);
    });
  },

  // 弃牌
  onZjhFold() { this.zjh_doAction('zjh_fold'); },

  // 跟注
  onZjhCall() { this.zjh_doAction('zjh_call'); },

  // 看牌
  onZjhSee() {
    if (!this.data.zjh_isDark) {
      wx.showToast({ title: '已经看过牌了', icon: 'none' });
      return;
    }
    this.zjh_doAction('zjh_see');
  },

  // 梭哈
  onZjhAllIn() { this.zjh_doAction('zjh_allin'); },

  // 加注弹窗
  onZjhShowRaise() {
    const { zjh_minRaiseActual, zjh_quickRaiseOptions } = this.data;
    this.setData({
      zjh_showRaiseInput: true,
      zjh_raiseAmount: zjh_minRaiseActual,
      zjh_raiseMultiplier: 2
    });
  },

  onZjhRaiseAmountInput(e) {
    this.setData({ zjh_raiseAmount: parseInt(e.detail.value) || 0 });
  },

  onZjhQuickRaise(e) {
    const zjh_val = parseInt(e.currentTarget.dataset.value) || 0;
    this.setData({ zjh_raiseAmount: zjh_val });
  },

  onZjhConfirmRaise() {
    const { zjh_raiseAmount, zjh_isDark, zjh_minRaiseActual, zjh_maxRaise, zjh_quickRaiseOptions } = this.data;
    const zjh_actual = Math.floor(zjh_raiseAmount);
    const zjh_multiplier = zjh_isDark ? 1 : 2;
    if (zjh_actual < zjh_minRaiseActual) {
      wx.showToast({ title: '加注至少 ' + zjh_minRaiseActual, icon: 'none' });
      return;
    }
    if (zjh_actual > zjh_maxRaise) {
      wx.showToast({ title: '筹码不足', icon: 'none' });
      return;
    }
    const zjh_nominal = Math.floor(zjh_actual / zjh_multiplier);
    this.zjh_doAction('zjh_raise', zjh_nominal);
    this.setData({ zjh_showRaiseInput: false });
  },

  onZjhCancelRaise() { this.setData({ zjh_showRaiseInput: false }); },

  // 滑块快捷加注按钮
  onZjhQuickRaiseAmount(e) {
    const { zjh_currentBet, zjh_minRaiseActual, zjh_maxRaise } = this.data;
    const multiplier = parseInt(e.currentTarget.dataset.value) || 2;
    const target = zjh_currentBet * multiplier;
    const amount = Math.min(Math.max(target, zjh_minRaiseActual), zjh_maxRaise);
    this.setData({ zjh_raiseAmount: amount, zjh_raiseMultiplier: multiplier });
  },

  // 滑块变化
  onZjhSliderChange(e) {
    this.setData({ zjh_raiseAmount: parseInt(e.detail.value) || 0, zjh_raiseMultiplier: 0 });
  },
  onZjhSliderChanging(e) {
    this.setData({ zjh_raiseAmount: parseInt(e.detail.value) || 0, zjh_raiseMultiplier: 0 });
  },

  // 直接通过滑块确认加注
  onZjhConfirmRaiseDirect() {
    const { zjh_raiseAmount, zjh_isDark, zjh_minRaiseActual, zjh_maxRaise, isMyTurn } = this.data;
    if (!isMyTurn) { wx.showToast({ title: '不是你的回合', icon: 'none' }); return; }
    const zjh_actual = Math.floor(zjh_raiseAmount);
    const zjh_multiplier = zjh_isDark ? 1 : 2;
    if (zjh_actual < zjh_minRaiseActual) {
      wx.showToast({ title: '加注至少 ' + zjh_minRaiseActual, icon: 'none' });
      return;
    }
    if (zjh_actual > zjh_maxRaise) {
      wx.showToast({ title: '筹码不足', icon: 'none' });
      return;
    }
    const zjh_nominal = Math.floor(zjh_actual / zjh_multiplier);
    this.zjh_doAction('zjh_raise', zjh_nominal);
  },

  // 比牌弹窗
  onZjhShowCompare() {
    const { zjh_compareTargets } = this.data;
    if (zjh_compareTargets.length === 0) {
      wx.showToast({ title: '没有可比的玩家', icon: 'none' });
      return;
    }
    this.setData({
      zjh_showCompareSelect: true,
      zjh_selectedCompareTarget: zjh_compareTargets[0].openId
    });
  },

  onZjhSelectCompareTarget(e) {
    this.setData({ zjh_selectedCompareTarget: e.currentTarget.dataset.openid || '' });
  },

  onZjhConfirmCompare() {
    const { zjh_selectedCompareTarget } = this.data;
    if (!zjh_selectedCompareTarget) {
      wx.showToast({ title: '请选择要比牌的玩家', icon: 'none' });
      return;
    }
    this.zjh_doAction('zjh_compare', 0, zjh_selectedCompareTarget);
    this.setData({ zjh_showCompareSelect: false });
  },

  onZjhCancelCompare() { this.setData({ zjh_showCompareSelect: false }); },

  // ============================
  // 游戏控制
  // ============================

  startGame() {
    const { roomId, isCreator, room } = this.data;
    if (!isCreator) { wx.showToast({ title: '只有房主可以开始', icon: 'none' }); return; }
    if (room.status !== 'waiting') { wx.showToast({ title: '游戏已开始', icon: 'none' }); return; }
    const zjh_activeCount = room.players.filter(p => p.chips > 0).length;
    if (zjh_activeCount < 2) { wx.showToast({ title: '至少需要2人（有筹码）', icon: 'none' }); return; }

    if (this.data._countdownTimer) { clearInterval(this.data._countdownTimer); this.data._countdownTimer = null; }
    this.setData({ startCountdown: 0, autoStarting: false, _prevStartCountdownAt: 0 });
    this._clearRoomCountdown(room);

    wx.showLoading({ title: '发牌中...' });
    wx.cloud.callFunction({
      name: 'startGameZJH',
      data: { roomNumber: room.roomNumber }
    }).then(res => {
      wx.hideLoading();
      const zjh_result = (res && res.result) || {};
      if (zjh_result.success && zjh_result.roomData) {
        wx.showToast({ title: '游戏开始！', icon: 'success' });
        this.zjh_updateRoomState(zjh_result.roomData);
      } else if (zjh_result.success) {
        wx.showToast({ title: '游戏开始！', icon: 'success' });
        this.zjh_fetchRoomData(roomId, 0);
      } else {
        wx.showToast({ title: zjh_result.error || '开始失败', icon: 'none' });
      }
    }).catch(() => { wx.hideLoading(); wx.showToast({ title: '开始失败', icon: 'none' }); });
  },

  onStartGame() {
    const { room, isCreator, allPlayersReady } = this.data;
    if (!isCreator) { wx.showToast({ title: '只有房主可以开始', icon: 'none' }); return; }
    if (!allPlayersReady) { wx.showToast({ title: '请等待所有人准备', icon: 'none' }); return; }
    if (room.startCountdownAt) return;
    if (this.data.startCountdown > 0) return;

    const startAt = Date.now();
    wx.showToast({ title: '倒计时开始', icon: 'none', duration: 1000 });

    const db = wx.cloud.database();
    db.collection('rooms').doc(room._id).update({
      data: { startCountdownAt: startAt }
    }).then(() => {
      this._manageCountdown({ ...room, startCountdownAt: startAt });
    }).catch(() => {
      this._manageCountdown({ ...room, startCountdownAt: startAt });
    });
  },

  zjh_checkAutoStartGame(zjh_room) {
    const zjh_activePs = zjh_room.players.filter(p => p.chips > 0);
    const zjh_allReady = zjh_activePs.length >= 2 && zjh_activePs.every(p => p.isReady);
    if (!zjh_allReady) return;
    if (zjh_room.status !== 'waiting') return;

    if (zjh_room.startCountdownAt) return;
    if (this.data.startCountdown > 0) return;
    if (this.data.autoStarting) return;
    if (this.data._startGameFired) return;

    const app = getApp();
    if (zjh_room.creatorOpenId !== app.globalData.openId) return;

    const startAt = Date.now();
    const db = wx.cloud.database();
    db.collection('rooms').doc(zjh_room._id).update({
      data: { startCountdownAt: startAt }
    }).then(() => {
      this._manageCountdown({ ...zjh_room, startCountdownAt: startAt });
    }).catch(() => {
      this._manageCountdown({ ...zjh_room, startCountdownAt: startAt });
    });
  },

  zjh_doStartGame(zjh_room) {
    wx.showToast({ title: '游戏开始！', icon: 'success', duration: 2000 });
    wx.cloud.callFunction({
      name: 'startGameZJH',
      data: { roomNumber: zjh_room.roomNumber }
    }).then(res => {
      this._clearRoomCountdown(zjh_room);
      const zjh_result = (res && res.result) || {};
      if (zjh_result.success && zjh_result.roomData) {
        this.zjh_updateRoomState(zjh_result.roomData);
      } else if (zjh_result.success) {
        this.zjh_fetchRoomData(this.data.roomId, 0);
      } else {
        wx.showToast({ title: zjh_result.error || '开始失败', icon: 'none' });
      }
    }).catch(() => { wx.showToast({ title: '开始失败', icon: 'none' }); });
  },

  // ============================
  // 准备/确认/结算
  // ============================

  onReadyToggle() {
    const { room, myPlayer, roomId, pendingReady } = this.data;
    if (!myPlayer || room.status !== 'waiting') return;
    if (pendingReady) return;
    const zjh_isReady = myPlayer.isReady || false;
    const zjh_newIsReady = !zjh_isReady;
    const zjh_updatedPlayers = room.players.map(p =>
      p.openId === myPlayer.openId ? { ...p, isReady: zjh_newIsReady } : p
    );
    const zjh_newRoom = { ...room, players: zjh_updatedPlayers };
    this.setData({ pendingReady: true, room: zjh_newRoom });

    // 立即更新环形玩家数据（避免调用整个zjh_updateRoomState的开销）
    const app = getApp();
    const zjh_myOpenId = app.globalData.openId || '';
    const zjh_ring = this.zjh_computeRingData(zjh_updatedPlayers || [], zjh_myOpenId);
    const zjh_activePlayers = (zjh_updatedPlayers || []).filter(p => p.chips > 0);
    const zjh_activePlayerCount = zjh_activePlayers.length;
    const zjh_readyCount = zjh_activePlayers.filter(p => p.isReady).length;
    const zjh_allPlayersReady = room.status === 'waiting' && zjh_activePlayerCount >= 2 && zjh_activePlayers.every(p => p.isReady);
    this.setData({
      zjh_players: zjh_updatedPlayers,
      zjh_playerPositions: this.zjh_computePlayerPositions(zjh_updatedPlayers || [], zjh_myOpenId),
      zjh_playerIndices: zjh_ring.ringIndices,
      ringPlayers: zjh_ring.ringPlayers,
      ringPositions: zjh_ring.ringPositions,
      ringIndices: zjh_ring.ringIndices,
      activePlayerCount: zjh_activePlayerCount,
      readyCount: zjh_readyCount,
      allPlayersReady: zjh_allPlayersReady,
      myPlayer: { ...myPlayer, isReady: zjh_newIsReady }
    });

    // 点击后立即弹出提示
    wx.showToast({ title: zjh_newIsReady ? '准备中...' : '取消准备...', icon: 'none', duration: 800 });

    wx.cloud.callFunction({
      name: 'setReady',
      data: { roomId, isReady: zjh_newIsReady }
    }).then(res => {
      this.setData({ pendingReady: false });
      if (res.result && res.result.success) {
        wx.showToast({ title: zjh_newIsReady ? '✓ 已准备' : '✓ 取消准备', icon: 'success', duration: 1000 });
        this.zjh_checkAutoStartGame(zjh_newRoom);
        this._manageCountdown(zjh_newRoom);
        if (zjh_newIsReady && !this.data._fetchingCountdown) {
          this.data._fetchingCountdown = true;
          setTimeout(() => {
            this.data._fetchingCountdown = false;
            this.zjh_fetchRoomData(this.data.roomId, 0);
          }, 300);
        }
      } else {
        wx.showToast({ title: (res.result && res.result.error) || '操作失败', icon: 'none' });
      }
    }).catch(() => {
      this.setData({ pendingReady: false });
      wx.showToast({ title: '网络错误', icon: 'none' });
    });
  },

  onConfirmNext() {
    const { roomId, room, pendingConfirm, isCreator } = this.data;
    if (!room || !roomId) return;
    if (pendingConfirm) return;
    const app = getApp();
    const zjh_myOpenId = app.globalData.openId || '';
    const zjh_myPlayer = room.players.find(p => p.openId === zjh_myOpenId);
    if (!zjh_myPlayer) return;
    const zjh_isAlreadyConfirmed = zjh_myPlayer.confirmedNext || false;
    const zjh_newConfirmed = !zjh_isAlreadyConfirmed;
    const zjh_updatedPlayers = room.players.map(p =>
      p.openId === zjh_myOpenId ? { ...p, confirmedNext: zjh_newConfirmed } : p
    );
    const zjh_updatedMyPlayer = { ...zjh_myPlayer, confirmedNext: zjh_newConfirmed };
    this.setData({ pendingConfirm: true, myPlayer: zjh_updatedMyPlayer });
    const zjh_newRoom = { ...room, players: zjh_updatedPlayers };
    this.zjh_updateRoomState(zjh_newRoom);

    wx.cloud.callFunction({
      name: 'setConfirmNext',
      data: { roomId, isConfirmNext: zjh_newConfirmed }
    }).then(res => {
      const zjh_result = (res && res.result) || {};
      this.setData({ pendingConfirm: false });
      if (zjh_result.success) {
        if (isCreator) {
          this.zjh_checkAutoStart(zjh_newRoom);
        }
      } else {
        wx.showToast({ title: zjh_result.error || '操作失败', icon: 'none' });
        this.zjh_fetchRoomData(roomId, 0);
      }
    }).catch(() => {
      this.setData({ pendingConfirm: false });
      wx.showToast({ title: '网络错误', icon: 'none' });
      this.zjh_fetchRoomData(roomId, 0);
    });
  },

  zjh_checkAutoStart(zjh_room) {
    if (this.data.autoStarting) return;
    const zjh_activePs = zjh_room.players.filter(p => p.chips > 0);
    const zjh_allConfirmed = zjh_activePs.length > 0 && zjh_activePs.every(p => p.confirmedNext);
    if (!zjh_allConfirmed) return;
    if (zjh_activePs.length <= 1) return;

    if (zjh_room.startCountdownAt) return;
    if (this.data.startCountdown > 0) return;

    const app = getApp();
    if (zjh_room.creatorOpenId !== app.globalData.openId) return;

    const startAt = Date.now();
    const db = wx.cloud.database();
    db.collection('rooms').doc(zjh_room._id).update({
      data: { startCountdownAt: startAt }
    }).then(() => {
      this._manageCountdown({ ...zjh_room, startCountdownAt: startAt });
    }).catch(() => {
      this._manageCountdown({ ...zjh_room, startCountdownAt: startAt });
    });
  },

  _manageCountdown(zjh_room) {
    const startCountdownAt = zjh_room.startCountdownAt || 0;
    const prevAt = this.data._prevStartCountdownAt || 0;

    if (zjh_room.status === 'playing') {
      if (this.data._countdownTimer) { clearInterval(this.data._countdownTimer); this.data._countdownTimer = null; }
      if (this.data.startCountdown > 0 || this.data._prevStartCountdownAt > 0) {
        this.setData({ startCountdown: 0, autoStarting: false, _prevStartCountdownAt: 0, _startGameFired: false });
      }
      return;
    }

    if (startCountdownAt > 0) {
      const duration = zjh_room.status === 'waiting' ? 5 : 3;
      const calcRemaining = () => Math.max(0, duration - Math.floor((Date.now() - startCountdownAt) / 1000));
      const remaining = calcRemaining();

      if (remaining <= 0) {
        if (this.data._countdownTimer) { clearInterval(this.data._countdownTimer); this.data._countdownTimer = null; }
        this.setData({ startCountdown: 0 });
        if (!this.data._startGameFired) {
          this.data._startGameFired = true;
          const app = getApp();
          if (zjh_room.creatorOpenId === app.globalData.openId) {
            this.zjh_doStartGame(zjh_room);
          }
        }
      } else if (startCountdownAt !== prevAt) {
        if (this.data._countdownTimer) { clearInterval(this.data._countdownTimer); }
        this.setData({ startCountdown: remaining, autoStarting: true, _prevStartCountdownAt: startCountdownAt, _startGameFired: false });
        const timer = setInterval(() => {
          const r = calcRemaining();
          if (r <= 0) {
            clearInterval(timer);
            this.data._countdownTimer = null;
            this.setData({ startCountdown: 0 });
            if (!this.data._startGameFired) {
              this.data._startGameFired = true;
              const app2 = getApp();
              if (zjh_room.creatorOpenId === app2.globalData.openId) {
                this.zjh_doStartGame(zjh_room);
              }
            }
          } else {
            this.setData({ startCountdown: r });
          }
        }, 1000);
        this.data._countdownTimer = timer;
      }
    } else if (startCountdownAt === 0 && prevAt > 0) {
      if (this.data.autoStarting || this.data._startGameFired) return;
      if (this.data._countdownTimer) { clearInterval(this.data._countdownTimer); this.data._countdownTimer = null; }
      this.setData({ startCountdown: 0, autoStarting: false, _prevStartCountdownAt: 0, _startGameFired: false });
    } else if (startCountdownAt === 0 && !this.data._startGameFired) {
      const zjh_activePs = zjh_room.players.filter(p => p.chips > 0);
      const zjh_needCountdown = zjh_room.status === 'waiting'
        ? zjh_activePs.length >= 2 && zjh_activePs.every(p => p.isReady)
        : zjh_room.status === 'ended' && zjh_activePs.length >= 2
          && zjh_activePs.every(p => p.confirmedNext);
      if (zjh_needCountdown && !this.data._fetchingCountdown) {
        this.data._fetchingCountdown = true;
        setTimeout(() => {
          this.data._fetchingCountdown = false;
          this.zjh_fetchRoomData(this.data.roomId, 0);
        }, 500);
      }
    }
  },

  _clearRoomCountdown(zjh_room) {
    const db = wx.cloud.database();
    db.collection('rooms').doc(zjh_room._id).update({
      data: { startCountdownAt: 0 }
    }).catch(() => {});
  },

  onCancelCountdown() {
    const { room, isCreator } = this.data;
    if (!room || !isCreator) return;

    if (this.data._countdownTimer) { clearInterval(this.data._countdownTimer); this.data._countdownTimer = null; }

    const db = wx.cloud.database();
    const updates = { startCountdownAt: 0 };
    const resetPlayers = room.players.map(p => {
      if (room.status === 'waiting') {
        return { ...p, isReady: false };
      }
      return { ...p, confirmedNext: false };
    });
    updates.players = resetPlayers;

    db.collection('rooms').doc(room._id).update({ data: updates }).then(() => {
      this.setData({ startCountdown: 0, autoStarting: false, _prevStartCountdownAt: 0 });
    }).catch(() => {
      this.setData({ startCountdown: 0, autoStarting: false, _prevStartCountdownAt: 0 });
    });
  },

  _checkCompareAnim(zjh_room) {
    const { zjh_lastCompare } = zjh_room;
    if (!zjh_lastCompare) return;
    if (zjh_lastCompare.timestamp === this.data._lastCompareTimestamp) return;
    this.data._lastCompareTimestamp = zjh_lastCompare.timestamp;

    // 清除旧的比牌确认状态和轮询
    if (this.data._zjhComparePollTimer) {
      clearInterval(this.data._zjhComparePollTimer);
      this.data._zjhComparePollTimer = null;
    }
    if (this.data._zjhCompareCloseTimer) {
      clearInterval(this.data._zjhCompareCloseTimer);
      this.data._zjhCompareCloseTimer = null;
    }
    this.data._zjh_compareClosing = false;

    // 清除旧的确认映射，防止旧确认数据污染新比牌
    const { roomId } = this.data;
    if (roomId) {
      wx.cloud.callFunction({
        name: 'zjhCompareConfirm',
        data: { roomId, clear: true }
      }).catch(() => {});
    }

    const { myOpenId } = this.data;
    const { initiator, target, result, initiatorOpenId, targetOpenId } = zjh_lastCompare;

    if (!initiator || !target || !initiator.cards || !target.cards) return;
    if (initiator.cards.length < 3 || target.cards.length < 3) return;

    const zjh_isMe = initiatorOpenId === myOpenId;
    const zjh_isTarget = targetOpenId === myOpenId;
    if (!zjh_isMe && !zjh_isTarget) return;

    const zjh_myCards = zjh_isMe ? initiator.cards : target.cards;
    const zjh_oppCards = zjh_isMe ? target.cards : initiator.cards;
    const zjh_myName = zjh_isMe ? initiator.name : target.name;
    const zjh_oppName = zjh_isMe ? target.name : initiator.name;
    const zjh_myHand = zjh_isMe ? initiator.handName : target.handName;
    const zjh_oppHand = zjh_isMe ? target.handName : initiator.handName;

    let zjh_animResult;
    if (zjh_isMe) {
      zjh_animResult = result === 'win' ? 'win' : (result === 'lose' ? 'lose' : 'draw');
    } else {
      zjh_animResult = result === 'lose' ? 'win' : (result === 'win' ? 'lose' : 'draw');
    }

    const zjh_comparingPair = [initiatorOpenId, targetOpenId];
    const zjh_loser = zjh_isMe ? (zjh_animResult === 'lose' ? myOpenId : (zjh_animResult === 'win' ? targetOpenId : '')) : (zjh_animResult === 'win' ? myOpenId : (zjh_animResult === 'lose' ? targetOpenId : ''));

    this.setData({
      zjh_comparingPlayers: zjh_comparingPair,
      zjh_compareLoser: zjh_loser,
      zjh_players: (this.data.zjh_players || []).map(p => ({
        ...p,
        isComparing: zjh_comparingPair.indexOf(p.openId) > -1,
        zjh_isDark: zjh_comparingPair.indexOf(p.openId) > -1 ? false : p.zjh_isDark
      })),
      zjh_compareAnimData: {
        myCards: zjh_myCards,
        oppCards: zjh_oppCards,
        myName: zjh_myName,
        oppName: zjh_oppName,
        myHand: zjh_myHand,
        oppHand: zjh_oppHand
      },
      zjh_compareAnimResult: zjh_animResult,
      zjh_compareAnimPhase: 0,
      zjh_showCompareAnim: true,
      zjh_compareAnimMyConfirm: false,
      zjh_compareAnimOppConfirm: false,
      zjh_compareAnimInitiatorOpenId: initiatorOpenId,
      zjh_compareAnimTargetOpenId: targetOpenId,
      zjh_compareAnimClosing: false,
      zjh_compareCloseCountdown: 0
    });
    this.data._zjh_compareClosing = false;

    this._startCompareAnim();
  },

  _startCompareAnim() {
    if (this.data._compareAnimTimers && this.data._compareAnimTimers.length > 0) {
      this.data._compareAnimTimers.forEach(t => clearTimeout(t));
    }
    this.data._compareAnimTimers = [];

    const steps = [
      { phase: 1, delay: 300 },
      { phase: 2, delay: 600 },
      { phase: 3, delay: 900 },
      { phase: 4, delay: 1200 },
      { phase: 5, delay: 1500 },
      { phase: 6, delay: 1800 },
      { phase: 7, delay: 2100 }
    ];

    steps.forEach(step => {
      const timerId = setTimeout(() => {
        if (!this.data.zjh_showCompareAnim) return;
        this.setData({ zjh_compareAnimPhase: step.phase });
      }, step.delay);
      this.data._compareAnimTimers.push(timerId);
    });
  },

  onZjhCompareConfirm() {
    const { myOpenId, zjh_compareAnimInitiatorOpenId, zjh_compareAnimTargetOpenId, zjh_compareAnimMyConfirm } = this.data;
    if (zjh_compareAnimMyConfirm) return;

    const amIMe = myOpenId === zjh_compareAnimInitiatorOpenId || myOpenId === zjh_compareAnimTargetOpenId;
    if (!amIMe) return;

    this.setData({ zjh_compareAnimMyConfirm: true });

    const { roomId, _lastCompareTimestamp } = this.data;
    wx.cloud.callFunction({
      name: 'zjhCompareConfirm',
      data: { roomId, compareTimestamp: _lastCompareTimestamp }
    }).then(res => {
      if (res && res.result && !res.result.success) {
        wx.showToast({ title: res.result.error || '确认失败', icon: 'none' });
      }
    }).catch(err => {
      console.error('zjhCompareConfirm error:', err);
    });
  },

  // ============================
  // 辅助功能
  // ============================

  onLeaveRoom() {
    wx.showModal({
      title: '确认离开', content: '离开房间后无法继续参与本局游戏',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '退出中...' });
          wx.cloud.callFunction({ name: 'leaveRoom', data: { roomId: this.data.roomId } }).then(() => {
            wx.hideLoading(); wx.navigateBack();
          }).catch(() => { wx.hideLoading(); wx.showToast({ title: '退出失败', icon: 'none' }); });
        }
      }
    });
  },

  onShareRoom() { this.setData({ showShareModal: true }); },
  onHideShareModal() { this.setData({ showShareModal: false }); },
  onCopyRoomNumber() {
    const { room } = this.data;
    if (!room) return;
    wx.setClipboardData({ data: room.roomNumber, success: () => wx.showToast({ title: '房间号已复制', icon: 'success' }) });
  },

  onToggleChat() {
    const showChat = !this.data.showChat;
    const data = { showChat };
    if (showChat) data.chatUnread = 0;
    this.setData(data);
  },

  onChatInput(e) { this.setData({ chatInput: e.detail.value }); },

  onSendChat() {
    const text = this.data.chatInput.trim();
    if (!text) return;
    this.zjh_sendChatMessage(text);
    this.setData({ chatInput: '' });
  },

  onSendQuickMsg(e) {
    const zjh_msg = e.currentTarget.dataset.msg;
    if (!zjh_msg) return;
    const zjh_message = zjh_msg.emoji + ' ' + zjh_msg.text;
    this.zjh_sendChatMessage(zjh_message);
  },

  zjh_sendChatMessage(message) {
    const { roomId, myPlayer } = this.data;
    if (!myPlayer || !roomId) return;

    const newMsg = {
      name: myPlayer.name,
      message,
      type: 'user',
      time: Date.now()
    };

    const localChatMessages = [...(this.data.chatMessages || []), newMsg].slice(-20);
    const recentChatMessages = localChatMessages.slice(-2);
    this.setData({ chatMessages: localChatMessages, recentChatMessages: recentChatMessages });

    wx.cloud.callFunction({
      name: 'sendChat',
      data: { roomId, message: message, name: myPlayer.name }
    }).catch(() => {});
  },

  stopBubble() {},

  onShowRebuy() {
    const { room } = this.data;
    if (!room) return;
    this.setData({ showRebuyModal: true, rebuyAmount: room.defaultChips || 10000 });
  },

  onHideRebuyModal() { this.setData({ showRebuyModal: false }); },

  onShowTotalResult() { this.setData({ zjh_showTotalResult: true }); },
  onHideTotalResult() { this.setData({ zjh_showTotalResult: false }); },

  onConfirmRebuy() {
    const { roomId, rebuyAmount } = this.data;
    wx.showLoading({ title: '重买中...' });
    wx.cloud.callFunction({
      name: 'rebuy',
      data: { roomId, amount: rebuyAmount }
    }).then(res => {
      wx.hideLoading();
      const zjh_result = (res && res.result) || {};
      if (zjh_result.success) {
        wx.showToast({ title: '补充成功', icon: 'success' });
        this.setData({ showRebuyModal: false });
        this.zjh_fetchRoomData(roomId, 0);
      } else {
        wx.showToast({ title: zjh_result.error || '重买失败', icon: 'none' });
      }
    }).catch(() => { wx.hideLoading(); wx.showToast({ title: '重买失败', icon: 'none' }); });
  },

  onStartNextHand() {
    const { room } = this.data;
    if (!room) return;
    if (this.data._countdownTimer) { clearInterval(this.data._countdownTimer); this.data._countdownTimer = null; }
    this.setData({ startCountdown: 0, autoStarting: false, _prevStartCountdownAt: 0 });
    this._clearRoomCountdown(room);
    this.zjh_doStartGame(room);
  },

  onNextHand() {
    const { roomId } = this.data;
    wx.showModal({
      title: '重置游戏',
      content: '确定要重置游戏吗？所有玩家筹码将恢复初始值。',
      success: (res) => {
        if (res.confirm) {
          wx.cloud.callFunction({
            name: 'resetGame',
            data: { roomId }
          }).then(() => {
            this.zjh_fetchRoomData(roomId, 0);
          });
        }
      }
    });
  }
});