Page({
  data: {
    roomId: '',
    room: null,
    isLoading: true,
    isCreator: false,
    isMyTurn: false,
    myOpenId: '',
    myPlayer: null,
    myPlayerIndex: -1,
    currentPhase: '',
    communityCards: [],
    pot: 0,
    currentBet: 0,
    toCall: 0,
    callAmount: 0,
    players: [],
    ringPlayers: [],
    ringPositions: [],
    ringPlayerIndices: [],
    gameHistory: [],
    showActionButtons: false,
    raiseAmount: 6,
    raiseMultiplier: 3,
    minRaise: 2,
    maxRaise: 100,
    showRaiseInput: false,
    isGameEnded: false,
    winners: [],
    watchInstance: null,
    reconnectTimer: null,
    showShareModal: false,
    showWaitingHint: false,
    callButtonText: '跟注',
    quickRaiseOptions: [],
    activePlayerCount: 0,
    allPlayersHand: [],
    confirmedCount: 0,
    totalToConfirm: 0,
    allConfirmed: false,
    allPlayersReady: false,
    countdown: 0,
    turnTimer: null,
    pendingAction: '',
    pendingConfirm: false,
    autoStarting: false,
    pendingReady: false,
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
    quickMessages: [
      { text: ' 我很大你们注意一下', emoji: '👋' },
      { text: ' 郭锦航利索点', emoji: '😎' },
      { text: ' 我直接梭哈', emoji: '🤔' },
      { text: ' 哈哈哈', emoji: '😂' },
      { text: ' 原来是小瘪三啊', emoji: '😡' },
      { text: ' 什么烂牌，真服了', emoji: '🙏' },
      { text: ' 这把吃定你们了', emoji: '💪' },
      { text: ' 直接就是弃牌，垃圾玩意', emoji: '👋' },
    ],
    // watch 保活
    lastWatchTime: 0,
    watchKeepTimer: null,
    waitSyncTimer: null,
    cloudUrlCache: {},
    watchRetryCount: 0,
    isDebug: false
  },

  onLoad(options) {
    const app = getApp();
    const poker_roomId = options.roomId || '';

    if (poker_roomId === 'debug') {
      this.setData({ roomId: 'debug', myOpenId: 'debug_self', isDebug: true });
      this.poker_loadDebugData();
      return;
    }

    if (!poker_roomId) {
      this.setData({ roomId: 'debug', myOpenId: 'debug_self', isDebug: true });
      this.poker_loadDebugData();
      return;
    }
    this.setData({ roomId: poker_roomId, myOpenId: app.globalData.openId || '' });
  },

  onReady() {
    if (this.data.isDebug) return;
    this.watchRoom(); this.startWatchKeepAlive();
  },

  onShow() {
    if (this.data.isDebug) return;
    const now = Date.now();
    if (this.data.watchRetryCount > 3) {
      this.setData({ watchRetryCount: 0 });
    }
    if (this.data.lastWatchTime > 0 && now - this.data.lastWatchTime > 30000 && this.data.roomId) {
      console.log('onShow: watch 可能已断线，重新连接...');
      if (this.data.watchInstance) { try { this.data.watchInstance.close(); } catch(e){} }
      this.setData({ watchInstance: null, watchRetryCount: 0 });
      this.watchRoom();
    }
    if (this.data.roomId && this.data.room && this.data.room.status === 'waiting') {
      this.fetchRoomData(this.data.roomId, 0);
    }
  },

  poker_computeRingPositions(players, myOpenId) {
    if (!players || players.length === 0) return { ringPlayers: [], ringPositions: [], ringPlayerIndices: [] };

    const total = players.length;
    const selfIdx = players.findIndex(p => p.openId === myOpenId);
    const selfPlayer = selfIdx >= 0 ? players[selfIdx] : null;

    // 其他玩家（排除自己）
    const others = [];
    const otherIndices = [];
    for (let i = 0; i < players.length; i++) {
      if (i !== selfIdx) {
        others.push(players[i]);
        otherIndices.push(i);
      }
    }

    // 固定位置：我自己在左下角（seat-lower-left）
    // 其他玩家从左上开始顺时针排列
    const basePositions = [
      { top: '8%', left: '12%' },    // 左上
      { top: '8%', left: '50%' },    // 中上
      { top: '8%', left: '88%' },    // 右上
      { top: '30%', left: '100%' },  // 右中上
      { top: '70%', left: '100%' },  // 右中下
      { top: '92%', left: '88%' },   // 右下
      { top: '70%', left: '0%' },    // 左中下
      { top: '30%', left: '0%' },    // 左中上
    ];

    const ringPlayers = [];
    const ringPositions = [];
    const ringPlayerIndices = [];

    // 其他玩家按顺序填入位置
    for (let i = 0; i < others.length && i < basePositions.length; i++) {
      ringPlayers.push(others[i]);
      ringPositions.push(basePositions[i]);
      ringPlayerIndices.push(otherIndices[i]);
    }

    // 我自己固定在左下角
    if (selfPlayer) {
      ringPlayers.push(selfPlayer);
      ringPositions.push({ top: '97%', left: '12%' }); // 左下
      ringPlayerIndices.push(selfIdx);
    }

    return { ringPlayers, ringPositions, ringPlayerIndices };
  },

  poker_loadDebugData() {
    const poker_self = {
      openId: 'debug_self',
      name: '我',
      chips: 2000,
      isActive: true,
      isAllIn: false,
      isFolded: false,
      isReady: true,
      rebuyCount: 1,
      totalBetThisRound: 2,
      holeCards: [{ value: 'J', suit: 'C' }, { value: '10', suit: 'S' }],
      profit: 0,
      avatarUrl: ''
    };

    const poker_players = [
      poker_self,
      {
        openId: 'debug_p1',
        name: '小明',
        chips: 1500,
        isActive: true,
        isAllIn: false,
        isFolded: false,
        isReady: true,
        rebuyCount: 0,
        totalBetThisRound: 4,
        holeCards: [],
        avatarUrl: ''
      },
      {
        openId: 'debug_p2',
        name: '小红',
        chips: 800,
        isActive: false,
        isAllIn: false,
        isFolded: true,
        isReady: true,
        rebuyCount: 0,
        totalBetThisRound: 1,
        holeCards: [],
        avatarUrl: ''
      },
      {
        openId: 'debug_p3',
        name: '阿强',
        chips: 500,
        isActive: true,
        isAllIn: true,
        isFolded: false,
        isReady: true,
        rebuyCount: 2,
        totalBetThisRound: 500,
        holeCards: [],
        avatarUrl: ''
      },
      {
        openId: 'debug_p4',
        name: '老王',
        chips: 3200,
        isActive: true,
        isAllIn: false,
        isFolded: false,
        isReady: true,
        rebuyCount: 0,
        totalBetThisRound: 2,
        holeCards: [],
        avatarUrl: ''
      },
      {
        openId: 'debug_p5',
        name: '小李',
        chips: 0,
        isActive: false,
        isAllIn: false,
        isFolded: false,
        isReady: false,
        rebuyCount: 3,
        totalBetThisRound: 0,
        holeCards: [],
        avatarUrl: ''
      },
      {
        openId: 'debug_p6',
        name: '阿呆',
        chips: 1800,
        isActive: true,
        isAllIn: false,
        isFolded: false,
        isReady: true,
        rebuyCount: 0,
        totalBetThisRound: 2,
        holeCards: [],
        avatarUrl: ''
      },
      {
        openId: 'debug_p7',
        name: '大壮',
        chips: 2200,
        isActive: true,
        isAllIn: false,
        isFolded: false,
        isReady: true,
        rebuyCount: 0,
        totalBetThisRound: 2,
        holeCards: [],
        avatarUrl: ''
      },
      {
        openId: 'debug_p8',
        name: '小美',
        chips: 900,
        isActive: true,
        isAllIn: false,
        isFolded: false,
        isReady: true,
        rebuyCount: 0,
        totalBetThisRound: 2,
        holeCards: [],
        avatarUrl: ''
      }
    ];

    const poker_room = {
      name: '常规桌',
      sb: 1,
      bb: 2,
      maxP: 9,
      dealerIndex: 0,
      currentPlayerIndex: 8,
      status: 'playing',
      phase: 'FLOP',
      pot: 12,
      currentBet: 4,
      minRaise: 2,
      handCount: 5,
      maxHands: 10,
      communityCards: [
        { value: 'A', suit: 'H' },
        { value: 'K', suit: 'S' },
        { value: 'Q', suit: 'D' },
        { value: 'J', suit: 'C' },
        { value: '10', suit: 'H' }
      ],
      gameHistory: [
        { id: 1, text: '第5手牌开始' },
        { id: 2, text: '小红 弃牌' },
        { id: 3, text: '阿强 全押 500' },
        { id: 4, text: '老王 跟注 4' }
      ],
      chatMessages: []
    };

    const poker_toCall = Math.max(0, poker_room.currentBet - poker_self.totalBetThisRound);
    const poker_callAmount = Math.min(poker_toCall, poker_self.chips);

    const poker_ring = this.poker_computeRingPositions(poker_players, 'debug_self');

    this.setData({
      room: poker_room,
      myOpenId: 'debug_self',
      myPlayer: poker_self,
      players: poker_players,
      ringPlayers: poker_ring.ringPlayers,
      ringPositions: poker_ring.ringPositions,
      ringPlayerIndices: poker_ring.ringPlayerIndices,
      isLoading: false,
      isCreator: false,
      isMyTurn: true,
      currentPhase: poker_room.phase,
      communityCards: poker_room.communityCards,
      pot: poker_room.pot,
      currentBet: poker_room.currentBet,
      toCall: poker_toCall,
      callAmount: poker_callAmount,
      showActionButtons: true,
      showWaitingHint: false,
      callButtonText: poker_self.chips <= poker_toCall ? '全押 ' + poker_self.chips : '跟注 ' + poker_room.currentBet,
      quickRaiseOptions: [
        { label: '最小', value: 6 },
        { label: '1/2池', value: 10 },
        { label: '全池', value: 16 },
        { label: '全押', value: 2002 }
      ],
      isGameEnded: false,
      activePlayerCount: 9,
      handCount: poker_room.handCount,
      maxHands: poker_room.maxHands
    });
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
    if (this.data.turnTimer) clearInterval(this.data.turnTimer);
    if (this.data.watchKeepTimer) clearInterval(this.data.watchKeepTimer);
    if (this.waitSyncTimer) clearInterval(this.waitSyncTimer);
    if (this.data._countdownTimer) clearInterval(this.data._countdownTimer);
  },

  startWatchKeepAlive() {
    const timer = setInterval(() => {
      const now = Date.now();
      if (this.data.watchRetryCount > 3) return;
      if (this.data.lastWatchTime > 0 && now - this.data.lastWatchTime > 30000 && this.data.roomId) {
        console.log('keepalive: watch 超时，重新连接...');
        if (this.data.watchInstance) { try { this.data.watchInstance.close(); } catch(e){} }
        this.setData({ watchInstance: null, watchRetryCount: 0 });
        this.watchRoom();
      }
    }, 15000);
    this.setData({ watchKeepTimer: timer });
  },

  watchRoom() {
    const { roomId } = this.data;
    if (!roomId) return;
    const db = wx.cloud.database();
    db.collection('rooms').doc(roomId).get().then(res => {
      if (res && res.data) {
        this.setData({ lastWatchTime: Date.now(), watchRetryCount: 0 });
        this.updateRoomState(res.data);
        this.setupWatch();
      } else {
        console.warn('watchRoom: 数据为空，2秒后重试');
        this.setData({ reconnectTimer: setTimeout(() => this.watchRoom(), 2000) });
      }
    }).catch(err => {
      console.error('watchRoom fetch error:', err);
      this.setData({ reconnectTimer: setTimeout(() => this.watchRoom(), 2000) });
    });
  },

  setupWatch() {
    const { roomId } = this.data;
    if (!roomId) return;
    const db = wx.cloud.database();
    try {
      const watchInstance = db.collection('rooms').doc(roomId).watch({
        onChange: (snapshot) => {
          try {
            this.setData({ lastWatchTime: Date.now(), watchRetryCount: 0 });
            let room = null;
            if (snapshot && snapshot.docChanges && snapshot.docChanges.length > 0) {
              const change = snapshot.docChanges[0];
              if (change.dataType !== 'remove' && change.doc) {
                room = change.doc;
              }
            }
            if (!room && snapshot && snapshot.docs && snapshot.docs.length > 0) {
              room = snapshot.docs[0];
            }
            if (room) {
              this.updateRoomState(room);
            }
          } catch (e) { console.error('watch onChange error:', e); }
        },
        onError: (err) => {
          console.error('watch error:', err);
          if (this.data.watchInstance) { try { this.data.watchInstance.close(); } catch(e){} }
          const retry = this.data.watchRetryCount + 1;
          this.setData({ watchInstance: null, watchRetryCount: retry });
          const delay = Math.min(Math.pow(2, retry) * 1000, 30000);
          console.log('watch 重连，第' + retry + '次，延迟' + delay + 'ms');
          this.setData({ reconnectTimer: setTimeout(() => this.watchRoom(), delay) });
        }
      });
      this.setData({ watchInstance });
    } catch (e) {
      console.error('watch setup error:', e);
      const retry = this.data.watchRetryCount + 1;
      this.setData({ watchRetryCount: retry });
      const delay = Math.min(Math.pow(2, retry) * 1000, 30000);
      this.setData({ reconnectTimer: setTimeout(() => this.watchRoom(), delay) });
    }
  },

  fetchRoomData(roomId, retryCount) {
    const db = wx.cloud.database();
    db.collection('rooms').doc(roomId).get().then(res => {
      if (res && res.data) {
        this.setData({ lastWatchTime: Date.now() });
        this.updateRoomState(res.data);
      } else {
        if (retryCount < 3) {
          this.setData({ reconnectTimer: setTimeout(() => this.fetchRoomData(roomId, retryCount + 1), 2000) });
        } else {
          this.setData({ isLoading: false });
        }
      }
    }).catch(err => {
      console.error('fetch error:', err);
      if (retryCount < 3) {
        this.setData({ reconnectTimer: setTimeout(() => this.fetchRoomData(roomId, retryCount + 1), 2000) });
      } else {
        this.setData({ isLoading: false });
      }
    });
  },

  onRetryLoad() {
    this.setData({ isLoading: true });
    this.fetchRoomData(this.data.roomId, 0);
  },

  manageWaitSync(isWaiting) {
    if (!isWaiting) {
      if (this.waitSyncTimer) {
        clearInterval(this.waitSyncTimer);
        this.waitSyncTimer = null;
      }
      return;
    }
    if (this.waitSyncTimer) return;
    this.waitSyncTimer = setInterval(() => {
      const { roomId, room } = this.data;
      if (!roomId || !room || room.status !== 'waiting') {
        if (this.waitSyncTimer) {
          clearInterval(this.waitSyncTimer);
          this.waitSyncTimer = null;
        }
        return;
      }
      if (this.data.lastWatchTime > 0 && Date.now() - this.data.lastWatchTime < 3000) return;
      this.fetchRoomData(roomId, 0);
    }, 5000);
  },

  async convertCloudAvatars(room) {
    if (!room || !room.players) return;
    const cache = this.data.cloudUrlCache || {};
    const needConvert = [];
    room.players.forEach((p, i) => {
      if (p.avatarUrl && p.avatarUrl.startsWith('cloud://')) {
        if (cache[p.avatarUrl]) {
          p.avatarUrl = cache[p.avatarUrl];
        } else {
          needConvert.push({ index: i, cloudUrl: p.avatarUrl });
        }
      }
    });
    if (needConvert.length === 0) return;
    const fileList = needConvert.map(item => item.cloudUrl);
    try {
      const res = await wx.cloud.callFunction({
        name: 'batchGetTempUrls',
        data: { fileList }
      });
      const result = res.result;
      if (result && result.success && result.fileList) {
        const newCache = { ...cache };
        result.fileList.forEach(item => {
          if (item.tempFileURL) {
            newCache[item.fileID] = item.tempFileURL;
          }
        });
        this.setData({ cloudUrlCache: newCache });
        needConvert.forEach(({ index, cloudUrl }) => {
          if (newCache[cloudUrl] && room.players[index]) {
            room.players[index].avatarUrl = newCache[cloudUrl];
          } else {
            room.players[index].avatarUrl = '';
          }
        });
      } else {
        needConvert.forEach(({ index }) => {
          if (room.players[index]) room.players[index].avatarUrl = '';
        });
      }
    } catch (err) {
      console.error('convertCloudAvatars error:', err);
      needConvert.forEach(({ index }) => {
        if (room.players[index]) room.players[index].avatarUrl = '';
      });
    }
  },

  onAvatarError(e) {
    console.error('头像加载失败:', e.detail);
  },

  async updateRoomState(room) {
    if (!room || !room.players) { this.setData({ isLoading: false }); return; }
    try {
      await this.convertCloudAvatars(room);
      // 准备操作进行中时，保留本地乐观更新的准备状态，避免轮询覆盖
      if (this.data.pendingReady && this.data.myOpenId) {
        const localReady = this.data.myPlayer ? this.data.myPlayer.isReady : false;
        room = {
          ...room,
          players: room.players.map(p =>
            p.openId === this.data.myOpenId ? { ...p, isReady: localReady } : p
          )
        };
      }

      // 确认操作进行中时，保留本地乐观更新的确认状态
      if (this.data.pendingConfirm && this.data.myOpenId) {
        const localConfirmed = this.data.myPlayer ? this.data.myPlayer.confirmedNext : false;
        room = {
          ...room,
          players: room.players.map(p =>
            p.openId === this.data.myOpenId ? { ...p, confirmedNext: localConfirmed } : p
          )
        };
      }

      let activePs = [];
      const app = getApp();
      const myOpenId = app.globalData.openId || '';
      const myPlayer = room.players.find(p => p.openId === myOpenId) || null;
      const myPlayerIndex = myPlayer ? room.players.findIndex(p => p.openId === myOpenId) : -1;
      const isCreator = room.creatorOpenId === myOpenId;
      const currentPlayer = room.players[room.currentPlayerIndex] || null;
      const isMyTurn = currentPlayer && currentPlayer.openId === myOpenId && room.status === 'playing';
      const isGameEnded = room.status === 'ended' || room.phase === 'SHOWDOWN';
      const toCall = myPlayer ? Math.max(0, room.currentBet - myPlayer.totalBetThisRound) : 0;
      const callAmount = myPlayer ? Math.min(toCall, myPlayer.chips) : 0;
      const showActionButtons = isMyTurn && !isGameEnded && myPlayer && myPlayer.isActive && !myPlayer.isAllIn;
      const showWaitingHint = !isMyTurn && room.status === 'playing' && myPlayer && myPlayer.isActive && !myPlayer.isAllIn && !isGameEnded;

      // 当游戏已正式开始（status=playing），清除 autoStarting 过渡状态
      const autoStarting = room.status === 'playing' ? false : this.data.autoStarting;

      let callButtonText = '跟注';
      if (myPlayer && toCall > 0) {
        callButtonText = myPlayer.chips <= toCall ? '全押 ' + myPlayer.chips : '跟注 ' + room.currentBet;
      }

      let quickRaiseOptions = [];
      if (room && myPlayer) {
        const minTotal = room.currentBet + room.minRaise;
        const halfPot = Math.floor(room.pot / 2);
        const maxR = myPlayer.chips + myPlayer.totalBetThisRound;
        const opts = [
          { label: '最小', value: Math.min(minTotal, maxR) },
          { label: '1/2池', value: Math.min(halfPot + room.currentBet, maxR) },
          { label: '全池', value: Math.min(room.pot + room.currentBet, maxR) },
          { label: '全押', value: maxR }
        ];
        const seen = new Set();
        quickRaiseOptions = opts.filter(o => { if (o.value < minTotal || o.value > maxR) return false; if (seen.has(o.value)) return false; seen.add(o.value); return true; });
      }

      let winners = [];
      let allPlayersHand = [];
      let confirmedCount = 0;
      let totalToConfirm = 0;
      let allConfirmed = false;
      const handCount = room.handCount || 1;
      const maxHands = room.maxHands || 10;
      const isFinalHand = room.isFinalHand || handCount >= maxHands;
      if (isGameEnded && room.players) {
        activePs = room.players.filter(p => (p.isActive || p.isAllIn) && p.chips > 0);
        totalToConfirm = activePs.length;
        // 所有参与本局的玩家（有下注记录的都算），显示牌型和盈亏
        const handPlayers = room.players.filter(p => (p.totalBet || 0) > 0);
        allPlayersHand = handPlayers.map(p => {
          const displayProfit = p.profit || 0;
          const isWinner = displayProfit > 0;
          return {
            name: p.name,
            openId: p.openId,
            avatarUrl: p.avatarUrl || '',
            hasRebuy: p.hasRebuy || false,
            rebuyCount: p.rebuyCount || 0,
            chips: p.chips,
            handName: p.handResult ? p.handResult.name : '已弃牌',
            holeCards: p.holeCards || [],
            isWinner: isWinner,
            confirmedNext: p.confirmedNext || false,
            profit: p.profit || 0,
            winAmount: p.winAmount || 0,
            lossAmount: p.lossAmount || 0,
            totalProfit: p.totalProfit || 0,
          };
        });
        confirmedCount = allPlayersHand.filter(p => p.confirmedNext).length;
        totalToConfirm = allPlayersHand.length;
        allConfirmed = totalToConfirm > 0 && confirmedCount >= totalToConfirm;
      }

      // 重买资格：等待或结算阶段 + 我是玩家 + 筹码为0 + 重买次数未用完
      const canRebuy = (room.status === 'waiting' || room.status === 'ended') && myPlayer &&
        myPlayer.chips <= 0 &&
        (myPlayer.rebuyCount || 0) < 3;

      // 聊天消息：仅在数量变化时更新
      const newChatMessages = (room.chatMessages || []).slice(-20);
      const oldChatLen = (this.data.chatMessages || []).length;
      const newChatLen = newChatMessages.length;
      let chatUnread = this.data.chatUnread;
      const chatChanged = newChatLen !== oldChatLen;
      if (newChatLen > oldChatLen && !this.data.showChat) {
        chatUnread += newChatLen - oldChatLen;
      }
      // 取最近1-2条消息显示在牌桌中央
      const recentChatMessages = newChatMessages.slice(-2);

      // 游戏日志：仅在长度变化时更新
      const newHistory = (room.gameHistory || []).slice(-30);
      const historyChanged = newHistory.length !== (this.data.gameHistory || []).length;

      const activePlayers = (room.players || []).filter(p => p.chips > 0);
      const activePlayerCount = activePlayers.length;
      const allPlayersReady = room.status === 'waiting' && activePlayerCount >= 2 && activePlayers.every(p => p.isReady);

      const poker_ring = this.poker_computeRingPositions(room.players || [], myOpenId);

      const setDataObj = {
        room: room, isLoading: false, isCreator, isMyTurn, myOpenId, myPlayer, myPlayerIndex,
        ringPlayers: poker_ring.ringPlayers,
        ringPositions: poker_ring.ringPositions,
        ringPlayerIndices: poker_ring.ringPlayerIndices,
        activePlayerCount,
        allPlayersHand, confirmedCount, totalToConfirm, allConfirmed,
        currentPhase: room.phase, communityCards: room.communityCards || [],
        currentBet: room.currentBet || 0, toCall, callAmount, players: room.players || [],
        showActionButtons, showWaitingHint,
        callButtonText, quickRaiseOptions, isGameEnded, winners, autoStarting,
        pendingAction: '',
        chatUnread, canRebuy, allPlayersReady,
        handCount, maxHands, isFinalHand,
        recentChatMessages: recentChatMessages
      };

      if (chatChanged) setDataObj.chatMessages = newChatMessages;
      if (historyChanged) setDataObj.gameHistory = newHistory;

      this.setData(setDataObj);
      this.animatePot(room.pot || 0);
      // 等待阶段轮询兜底，确保全员准备状态实时同步
      this.manageWaitSync(room.status === 'waiting');

      // 服务器同步倒计时管理（所有玩家可见）
      this._manageCountdown(room);

      // 等待阶段：全员准备后触发倒计时
      this.checkAutoStartGame(room);

      // 倒计时管理
      this.manageTurnTimer(isMyTurn, toCall);
      // 如果游戏结束且所有人确认 → 触发倒计时确认
      if (isGameEnded && allConfirmed && activePs.length > 1) {
        this.checkAutoStart(room);
      }
    } catch (e) {
      console.error('updateRoomState error:', e);
      this.setData({ isLoading: false });
    }
  },

  manageTurnTimer(isMyTurn, toCall) {
    // 清除旧计时器
    if (this.data.turnTimer) { clearInterval(this.data.turnTimer); this.data.turnTimer = null; }
    if (!isMyTurn) { this.setData({ countdown: 0 }); return; }
    // 开始30秒倒计时
    let sec = 30;
    this.setData({ countdown: sec });
    const timer = setInterval(() => {
      sec--;
      this.setData({ countdown: sec });
      if (sec <= 0) {
        clearInterval(timer);
        this.data.turnTimer = null;
        if (toCall === 0) this.doAction('check');
        else this.doAction('call');
      }
    }, 1000);
    this.data.turnTimer = timer;
  },

  startGame() {
    const { roomId, isCreator, room } = this.data;
    if (!isCreator) { wx.showToast({ title: '只有房主可以开始', icon: 'none' }); return; }
    if (room.status !== 'waiting') { wx.showToast({ title: '游戏已开始', icon: 'none' }); return; }
    const activeCount = room.players.filter(p => p.chips > 0).length;
    if (activeCount < 2) { wx.showToast({ title: '至少需要2人（有筹码）', icon: 'none' }); return; }
    if (this.data._countdownTimer) { clearInterval(this.data._countdownTimer); this.data._countdownTimer = null; }
    this.setData({ startCountdown: 0, autoStarting: false, _prevStartCountdownAt: 0 });
    this._clearRoomCountdown(room);
    wx.showLoading({ title: '发牌中...' });
    wx.cloud.callFunction({ name: 'startGame', data: { roomNumber: room.roomNumber } }).then(res => {
      wx.hideLoading();
      const result = (res && res.result) || {};
      if (result.success && result.roomData) {
        wx.showToast({ title: '游戏开始！', icon: 'success' });
        this.updateRoomState(result.roomData);
      } else if (result.success) {
        wx.showToast({ title: '游戏开始！', icon: 'success' });
        this.fetchRoomData(roomId, 0);
      } else {
        wx.showToast({ title: result.error || '开始失败', icon: 'none' });
      }
    }).catch(err => { wx.hideLoading(); wx.showToast({ title: '开始失败', icon: 'none' }); });
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

  onFold() { this.doAction('fold'); },
  onCheck() { this.doAction('check'); },
  onCall() { this.doAction('call'); },
  onAllIn() { this.doAction('allin'); },

  onShowRaise() {
    const { myPlayer, room } = this.data;
    if (!myPlayer || !room) return;
    const minTotal = room.currentBet + room.minRaise;
    const maxTotal = myPlayer.chips + myPlayer.totalBetThisRound;
    const dft = minTotal;
    this.setData({ 
      showRaiseInput: true, 
      raiseAmount: dft,
      minRaise: minTotal,
      maxRaise: maxTotal,
      callAmount: room.currentBet
    });
  },
  onRaiseAmountInput(e) { this.setData({ raiseAmount: parseInt(e.detail.value) || 0 }); },
  onQuickRaise(e) {
    const { room, myPlayer } = this.data;
    if (!room || !myPlayer) return;
    const multiplier = parseInt(e.currentTarget.dataset.value) || 3;
    const bb = room.bigBlind || 2;
    const minTotal = room.currentBet + (room.minRaise || bb);
    const maxTotal = myPlayer.chips + (myPlayer.totalBetThisRound || 0);
    const target = multiplier * bb;
    const amount = Math.min(Math.max(target, minTotal), maxTotal);
    this.setData({ raiseAmount: amount, raiseMultiplier: multiplier, minRaise: minTotal, maxRaise: maxTotal });
  },
  onSliderChange(e) { this.setData({ raiseAmount: parseInt(e.detail.value) || 0 }); },
  onSliderChanging(e) { this.setData({ raiseAmount: parseInt(e.detail.value) || 0 }); },
  onConfirmRaise() {
    const { raiseAmount, room, myPlayer } = this.data;
    const amount = Math.floor(raiseAmount);
    const minTotal = room.currentBet + room.minRaise;
    if (amount < minTotal) { wx.showToast({ title: '加注至少 ' + minTotal, icon: 'none' }); return; }
    if (amount > myPlayer.chips + myPlayer.totalBetThisRound) { wx.showToast({ title: '筹码不足', icon: 'none' }); return; }
    this.doAction('raise', amount);
    this.setData({ showRaiseInput: false });
  },
  onCancelRaise() { this.setData({ showRaiseInput: false }); },

  doAction(action, amount) {
    const { roomId, isMyTurn, isDebug } = this.data;
    if (!isMyTurn && !isDebug) { wx.showToast({ title: '不是你的回合', icon: 'none' }); return; }
    if (this.data.turnTimer) { clearInterval(this.data.turnTimer); this.data.turnTimer = null; }
    this.setData({ countdown: 0, pendingAction: action, showActionButtons: false });
    const amt = Math.floor(amount || 0);
    if (isDebug) {
      wx.showToast({ title: '操作: ' + action + (amt > 0 ? ' ' + amt : ''), icon: 'none' });
      return;
    }
    wx.cloud.callFunction({ name: 'gameAction', data: { roomId, action, amount: amt } }).then(res => {
      const result = (res && res.result) || {};
      if (!result.success && result.error) {
        wx.showToast({ title: result.error, icon: 'none' });
      }
      this.setData({ pendingAction: '', showActionButtons: true });
    }).catch(() => { this.setData({ pendingAction: '', showActionButtons: true }); });
  },

  onLeaveRoom() {
    wx.showModal({
      title: '确认离开', content: '离开房间后无法继续参与本局游戏',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '退出中...' });
          wx.cloud.callFunction({ name: 'leaveRoom', data: { roomId: this.data.roomId } }).then(() => {
            wx.hideLoading(); wx.navigateBack();
          }).catch(err => { wx.hideLoading(); wx.showToast({ title: '退出失败', icon: 'none' }); });
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

  onReadyToggle() {
    const { room, myPlayer, roomId, pendingReady } = this.data;
    if (!myPlayer || room.status !== 'waiting') return;
    if (pendingReady) return;

    const isReady = myPlayer.isReady || false;
    const newIsReady = !isReady;

    // 乐观更新：立即更新本地状态
    const players = room.players.map(p =>
      p.openId === myPlayer.openId ? { ...p, isReady: newIsReady } : p
    );
    this.setData({ pendingReady: true });
    const newRoom = { ...room, players };
    this.updateRoomState(newRoom);

    // 调用云函数（有管理员权限，不受创建者限制）
    wx.cloud.callFunction({
      name: 'setReady',
      data: { roomId, isReady: newIsReady }
    }).then(res => {
      this.setData({ pendingReady: false });
      if (res.result && res.result.success) {
        wx.showToast({ title: newIsReady ? '已准备' : '取消准备', icon: 'none' });
        this.checkAutoStartGame(newRoom);
      } else {
        wx.showToast({ title: (res.result && res.result.error) || '操作失败', icon: 'none' });
        this.fetchRoomData(roomId, 0);
      }
    }).catch(err => {
      this.setData({ pendingReady: false });
      console.error('setReady callFunction error:', err);
      wx.showToast({ title: '网络错误，请重试', icon: 'none' });
      this.fetchRoomData(roomId, 0);
    });
  },

  _manageCountdown(room) {
    const startCountdownAt = room.startCountdownAt || 0;
    const prevAt = this.data._prevStartCountdownAt || 0;

    if (room.status === 'playing') {
      if (this.data._countdownTimer) { clearInterval(this.data._countdownTimer); this.data._countdownTimer = null; }
      if (this.data.startCountdown > 0 || this.data._prevStartCountdownAt > 0) {
        this.setData({ startCountdown: 0, autoStarting: false, _prevStartCountdownAt: 0, _startGameFired: false });
      }
      return;
    }

    if (startCountdownAt > 0) {
      const duration = room.status === 'waiting' ? 5 : 3;
      const calcRemaining = () => Math.max(0, duration - Math.floor((Date.now() - startCountdownAt) / 1000));
      const remaining = calcRemaining();

      if (remaining <= 0) {
        if (this.data._countdownTimer) { clearInterval(this.data._countdownTimer); this.data._countdownTimer = null; }
        this.setData({ startCountdown: 0, autoStarting: false });
        if (!this.data._startGameFired) {
          this.data._startGameFired = true;
          const app = getApp();
          if (room.creatorOpenId === app.globalData.openId) {
            this._clearRoomCountdown(room);
            if (room.status === 'waiting') {
              this.doStartGame(room);
            } else {
              this.autoStartNextHand(room);
            }
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
            this.setData({ startCountdown: 0, autoStarting: false });
            if (!this.data._startGameFired) {
              this.data._startGameFired = true;
              const app2 = getApp();
              if (room.creatorOpenId === app2.globalData.openId) {
                this._clearRoomCountdown(room);
                if (room.status === 'waiting') {
                  this.doStartGame(room);
                } else {
                  this.autoStartNextHand(room);
                }
              }
            }
          } else {
            this.setData({ startCountdown: r });
          }
        }, 1000);
        this.data._countdownTimer = timer;
      }
    } else if (startCountdownAt === 0 && prevAt > 0) {
      if (this.data._countdownTimer) return;
      if (this.data._countdownTimer) { clearInterval(this.data._countdownTimer); this.data._countdownTimer = null; }
      this.setData({ startCountdown: 0, autoStarting: false, _prevStartCountdownAt: 0, _startGameFired: false });
    }
  },

  _clearRoomCountdown(room) {
    const db = wx.cloud.database();
    db.collection('rooms').doc(room._id).update({
      data: { startCountdownAt: 0 }
    }).catch(() => {});
  },

  onCancelCountdown() {
    const { room, isCreator } = this.data;
    if (!room || !isCreator) return;

    if (this.data._countdownTimer) { clearInterval(this.data._countdownTimer); this.data._countdownTimer = null; }

    const db = wx.cloud.database();
    const updates = {
      startCountdownAt: 0
    };
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

  checkAutoStartGame(room) {
    const activePs = room.players.filter(p => p.chips > 0);
    const allReady = activePs.length >= 2 && activePs.every(p => p.isReady);
    if (!allReady) return;
    if (room.status !== 'waiting') return;

    if (room.startCountdownAt) return;
    if (this.data.startCountdown > 0) return;

    const app = getApp();
    if (room.creatorOpenId !== app.globalData.openId) return;

    const startAt = Date.now();
    const db = wx.cloud.database();
    db.collection('rooms').doc(room._id).update({
      data: { startCountdownAt: startAt }
    }).then(() => {
      this._manageCountdown({ ...room, startCountdownAt: startAt });
    }).catch(() => {
      this._manageCountdown({ ...room, startCountdownAt: startAt });
    });
  },

  doStartGame(room) {
    wx.showToast({ title: '游戏开始！', icon: 'success', duration: 2000 });
    wx.cloud.callFunction({ name: 'startGame', data: { roomNumber: room.roomNumber } }).then(res => {
      const result = (res && res.result) || {};
      if (result.success && result.roomData) {
        this.updateRoomState(result.roomData);
      } else if (result.success) {
        this.fetchRoomData(this.data.roomId, 0);
      } else {
        wx.showToast({ title: result.error || '开始失败', icon: 'none' });
      }
    }).catch(() => { wx.showToast({ title: '开始失败', icon: 'none' }); });
  },

  onConfirmNext() {
    const { roomId, room, pendingConfirm, isCreator } = this.data;
    if (!room || !roomId) return;
    if (pendingConfirm) return;

    const app = getApp();
    const myOpenId = app.globalData.openId || '';
    const myPlayer = room.players.find(p => p.openId === myOpenId);
    if (!myPlayer) return;

    const isAlreadyConfirmed = myPlayer.confirmedNext || false;
    const newConfirmed = !isAlreadyConfirmed;

    // 乐观更新
    const updatedPlayers = room.players.map(p =>
      p.openId === myOpenId ? { ...p, confirmedNext: newConfirmed } : p
    );
    const updatedMyPlayer = { ...myPlayer, confirmedNext: newConfirmed };
    this.setData({ pendingConfirm: true, myPlayer: updatedMyPlayer });
    const newRoom = { ...room, players: updatedPlayers };
    this.updateRoomState(newRoom);

    // 调用云函数
    wx.cloud.callFunction({
      name: 'setConfirmNext',
      data: { roomId, isConfirmNext: newConfirmed }
    }).then(res => {
      const result = (res && res.result) || {};
      this.setData({ pendingConfirm: false });
      if (result.success) {
        if (isCreator) {
          this.checkAutoStart(newRoom);
        }
      } else {
        wx.showToast({ title: result.error || '操作失败，请重试', icon: 'none' });
        this.fetchRoomData(roomId, 0);
      }
    }).catch(() => {
      this.setData({ pendingConfirm: false });
      wx.showToast({ title: '网络错误，请重试', icon: 'none' });
      this.fetchRoomData(roomId, 0);
    });
  },

  checkAutoStart(room) {
    if (this.data.autoStarting) return;

    const activePs = room.players.filter(p => (p.isActive || p.isAllIn) && p.chips > 0);
    const allConfirmed = activePs.length > 0 && activePs.every(p => p.confirmedNext);
    if (!allConfirmed) return;
    if (activePs.length <= 1) return;

    if (room.startCountdownAt) return;
    if (this.data.startCountdown > 0) return;

    const app = getApp();
    if (room.creatorOpenId !== app.globalData.openId) return;

    const startAt = Date.now();
    const db = wx.cloud.database();
    db.collection('rooms').doc(room._id).update({
      data: { startCountdownAt: startAt }
    }).then(() => {
      this._manageCountdown({ ...room, startCountdownAt: startAt });
    }).catch(() => {
      this._manageCountdown({ ...room, startCountdownAt: startAt });
    });
  },

  autoStartNextHand(room) {
    const { roomId } = this.data;
    wx.showLoading({ title: '准备新对局...' });
    wx.cloud.callFunction({
      name: 'resetGame',
      data: { roomId }
    }).then(res => {
      wx.hideLoading();
      if (res.result && res.result.success) {
        // 开始新对局
        setTimeout(() => {
          wx.cloud.callFunction({ name: 'startGame', data: { roomNumber: room.roomNumber } }).then(res2 => {
            const result = (res2 && res2.result) || {};
            if (result.success && result.roomData) {
              this.updateRoomState(result.roomData);
            } else if (result.success) {
              this.fetchRoomData(roomId, 0);
            } else {
              wx.showToast({ title: result.error || '自动开始失败', icon: 'none' });
            }
            this.setData({ autoStarting: false });
          }).catch(err => {
            console.error('autoStartNextHand startGame error:', err);
            this.setData({ autoStarting: false });
            wx.showToast({ title: '自动开始失败，请手动开始', icon: 'none' });
          });
        }, 1500);
      } else {
        wx.showToast({ title: (res.result && res.result.error) || '重置失败', icon: 'none' });
        this.setData({ autoStarting: false });
      }
    }).catch(() => {
      wx.hideLoading();
      wx.showToast({ title: '重置失败', icon: 'none' });
      this.setData({ autoStarting: false });
    });
  },

  // 房主手动开始下一回合（无需所有人准备）
  onStartNextHand() {
    const { roomId, isCreator, room } = this.data;
    if (!isCreator) { wx.showToast({ title: '只有房主可以开始', icon: 'none' }); return; }
    if (room.status !== 'ended') { wx.showToast({ title: '当前回合未结束', icon: 'none' }); return; }

    this._clearRoomCountdown(room);
    if (this.data._countdownTimer) { clearInterval(this.data._countdownTimer); this.data._countdownTimer = null; }
    this.setData({ startCountdown: 0, autoStarting: false, _prevStartCountdownAt: 0 });

    wx.showLoading({ title: '准备新回合...' });
    // 直接调用 startGame，云函数会处理 ended 状态的强制开始
    wx.cloud.callFunction({
      name: 'startGame',
      data: { roomNumber: room.roomNumber }
    }).then(res => {
      wx.hideLoading();
      const result = (res && res.result) || {};
      if (result.success) {
        wx.showToast({ title: `第 ${(room.handCount || 0) + 1} 回合开始`, icon: 'success' });
        this.fetchRoomData(roomId, 0);
      } else {
        wx.showToast({ title: result.error || '开始失败', icon: 'none' });
      }
    }).catch((err) => {
      wx.hideLoading();
      console.error('onStartNextHand error:', err);
      wx.showToast({ title: '开始失败，请重试', icon: 'none' });
    });
  },

  onNextHand() {
    const { roomId, isCreator, room, isFinalHand } = this.data;
    if (!isCreator) { wx.showToast({ title: '只有房主可以重置', icon: 'none' }); return; }

    // 如果是最终回合，显示总排名
    if (isFinalHand) {
      const sorted = [...room.players].sort((a, b) => b.chips - a.chips);
      const rankText = sorted.map((p, i) => `${i + 1}. ${p.name}: ${p.chips} 筹码`).join('\n');
      wx.showModal({
        title: '🏆 最终排名',
        content: rankText,
        showCancel: false,
        confirmText: '确定'
      });
      return;
    }

    const playersWithChips = room.players.filter(p => p.chips > 0);
    if (playersWithChips.length > 1) {
      wx.showToast({ title: '还有多人有筹码，无需手动重置', icon: 'none' });
      return;
    }
    const wName = playersWithChips[0] ? playersWithChips[0].name : '无人';
    wx.showModal({
      title: '最终胜利', content: wName + ' 赢得了整场游戏！点击确定开始全新对局',
      success: (r) => {
        if (r.confirm) {
          wx.showLoading({ title: '重置中...' });
          wx.cloud.callFunction({
            name: 'resetGame',
            data: { roomId }
          }).then(res => {
            if (res.result && res.result.success) {
              this.setData({ isGameEnded: false, handCount: 0 });
              wx.hideLoading();
              wx.showToast({ title: '新游戏已就绪', icon: 'success' });
              // 自动开始新对局
              setTimeout(() => {
                wx.cloud.callFunction({ name: 'startGame', data: { roomNumber: room.roomNumber } }).then(res2 => {
                  const result = (res2 && res2.result) || {};
                  if (result.success) this.fetchRoomData(roomId, 0);
                  else wx.showToast({ title: result.error || '开始失败', icon: 'none' });
                }).catch(() => { wx.showToast({ title: '开始失败', icon: 'none' }); });
              }, 1500);
            } else {
              wx.hideLoading();
              wx.showToast({ title: (res.result && res.result.error) || '重置失败', icon: 'none' });
            }
          }).catch(() => {
            wx.hideLoading();
            wx.showToast({ title: '重置失败', icon: 'none' });
          });
        }
      }
    });
  },

  // ===== 聊天 =====

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
    this.sendChatMessage(text);
    this.setData({ chatInput: '' });
  },

  onSendQuickMsg(e) {
    const msg = e.currentTarget.dataset.msg;
    if (!msg) return;
    this.sendChatMessage(msg.emoji + ' ' + msg.text);
  },

  sendChatMessage(message) {
    const { roomId, myPlayer, room } = this.data;
    if (!myPlayer || !room) return;

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

  onShareAppMessage() {
    const { room } = this.data;
    if (!room) return { title: '来一局德州扑克！', path: '/pages/room/room' };
    return { title: '德州扑克房间 ' + room.roomNumber + ' - 快来加入！', path: '/pages/room/room' };
  },

  // ========== 重买（补充筹码） ==========
  onShowRebuy() {
    const { room, myPlayer } = this.data;
    if (!this.data.canRebuy) {
      wx.showToast({ title: '当前无法重买', icon: 'none' });
      return;
    }
    const amount = Math.floor((room.defaultChips || 10000) / 2);
    this.setData({ showRebuyModal: true, rebuyAmount: amount });
  },

  onRebuyAmountInput(e) {
    this.setData({ rebuyAmount: parseInt(e.detail.value) || 0 });
  },

  onHideRebuyModal() {
    this.setData({ showRebuyModal: false });
  },

  onConfirmRebuy() {
    const { roomId, rebuyAmount } = this.data;
    if (rebuyAmount <= 0) {
      wx.showToast({ title: '重买金额无效', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '补充中...' });
    wx.cloud.callFunction({
      name: 'rebuy',
      data: { roomId }
    }).then(res => {
      wx.hideLoading();
      const result = (res && res.result) || {};
      if (result.success) {
        wx.showToast({ title: result.message || '补充成功', icon: 'success' });
        this.setData({ showRebuyModal: false });
      } else {
        wx.showToast({ title: result.error || '补充失败', icon: 'none' });
      }
    }).catch(() => {
      wx.hideLoading();
      wx.showToast({ title: '补充失败', icon: 'none' });
    });
  },

  stopBubble() {},

  animatePot(newPot) {
    const oldPot = this.data.pot || 0;
    if (oldPot === newPot) return;
    const diff = newPot - oldPot;
    const duration = Math.min(600, Math.max(200, Math.abs(diff) * 10));
    const steps = Math.max(10, Math.min(30, Math.abs(diff)));
    const stepVal = diff / steps;
    const interval = duration / steps;
    let currentStep = 0;
    const timer = setInterval(() => {
      currentStep++;
      const val = Math.round(oldPot + stepVal * currentStep);
      if (currentStep >= steps) {
        clearInterval(timer);
        this.setData({ pot: newPot });
      } else {
        this.setData({ pot: val });
      }
    }, interval);
  }
});