const app = getApp();
const _ = wx.cloud.database().command;

Page({
  data: {
    isLoading: false,
    currentRoom: null,
    myRooms: [],
    showCreateModal: false,
    showJoinModal: false,
    gameType: 'texas',
    roomName: '',
    maxPlayers: 12,
    defaultChips: 10000,
    smallBlind: 100,
    bigBlind: 200,
    zjhBaseBet: 100,
    zjhMaxRounds: 20,
    maxHands: 10,
    allowMidJoin: false,
    enablePassword: false,
    roomPassword: '',
    joinRoomNumber: '',
    joinNeedPassword: false,
    joinRoomPassword: '',
    swipedRoomId: '',
    touchStartX: 0,
    touchStartY: 0,
    showProfileModal: false,
    profileName: '',
    profileAvatar: '',
    isAdmin: false,
    showAnnounceModal: false,
    announceTitle: '',
    announceContent: '',
    announcePriority: 0,
    announceDuration: 7
  },

  onLoad() {
    this.checkProfile();
    this.loadMyRooms();
    this.runCleanup();
    this.checkAdmin();
  },

  onShow() {
    this.loadMyRooms();
    const app = getApp();
    if (app.globalData.openCreateModal) {
      app.globalData.openCreateModal = false;
      this.onShowCreateModal();
    }
    if (app.globalData.openJoinModal) {
      app.globalData.openJoinModal = false;
      this.onShowJoinModal();
    }
  },

  checkProfile() {
    const userInfo = app.globalData.userInfo;
    if (userInfo && userInfo.name && userInfo.avatarUrl) {
      this.setData({
        profileName: userInfo.name,
        profileAvatar: userInfo.avatarUrl
      });
    } else {
      this.setData({ showProfileModal: true });
    }
  },

  onChooseAvatar(e) {
    const { avatarUrl } = e.detail;
    this.setData({ profileAvatar: avatarUrl });
  },

  onProfileNameInput(e) {
    this.setData({ profileName: e.detail.value });
  },

  onSkipProfile() {
    const name = this.data.profileName || '玩家' + Math.floor(Math.random() * 1000);
    const avatarUrl = this.data.profileAvatar || '';
    this.setData({
      showProfileModal: false,
      profileName: name,
      profileAvatar: avatarUrl
    });
    app.saveUserInfo({ name, avatarUrl });
  },

  onSaveProfile() {
    const name = this.data.profileName || '玩家' + Math.floor(Math.random() * 1000);
    const avatarUrl = this.data.profileAvatar || '';
    if (!avatarUrl) {
      wx.showToast({ title: '请设置头像', icon: 'none' });
      return;
    }
    this.setData({ showProfileModal: false });
    if (avatarUrl.startsWith('http://') || avatarUrl.startsWith('https://') || avatarUrl.startsWith('data:') || avatarUrl.startsWith('cloud://')) {
      app.saveUserInfo({ name, avatarUrl });
      this.setData({ profileName: name, profileAvatar: avatarUrl });
    } else {
      this.uploadAvatar(avatarUrl, name);
    }
  },

  uploadAvatar(tempPath, name) {
    wx.showLoading({ title: '处理头像...' });
    const fs = wx.getFileSystemManager();
    fs.readFile({
      filePath: tempPath,
      encoding: 'base64',
      success: (readRes) => {
        wx.hideLoading();
        const avatarUrl = 'data:image/jpeg;base64,' + readRes.data;
        this.setData({ profileAvatar: avatarUrl });
        app.saveUserInfo({ name, avatarUrl });
        wx.showToast({ title: '头像已保存', icon: 'success' });
      },
      fail: (err) => {
        wx.hideLoading();
        console.error('readFile error:', err);
        app.saveUserInfo({ name, avatarUrl: '' });
        this.setData({ profileAvatar: '' });
        wx.showToast({ title: '头像处理失败，请重试', icon: 'none' });
      }
    });
  },

  getPlayerInfo() {
    const userInfo = app.globalData.userInfo;
    if (userInfo && userInfo.name) {
      return {
        name: userInfo.name,
        avatarUrl: userInfo.avatarUrl || ''
      };
    }
    return { name: '玩家', avatarUrl: '' };
  },

  runCleanup() {
    wx.cloud.callFunction({
      name: 'cleanupRooms',
      data: {}
    }).then(res => {
      if (res.result && res.result.success) {
        console.log('清理完成:', res.result.message);
      }
    }).catch(() => {});
  },

  loadMyRooms() {
    const db = wx.cloud.database();
    const openId = app.globalData.openId || '';
    if (!openId) return;

    db.collection('rooms').where({
      'players.openId': openId,
      status: _.in(['waiting', 'playing'])
    }).orderBy('updatedAt', 'desc').get().then(res => {
      this.setData({ myRooms: res.data || [] });
    }).catch(err => {
      console.error('loadMyRooms error:', err);
    });
  },

  onSelectGameType(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({ gameType: type });
  },

  onShowCreateModal() {
    const app = getApp();
    const gameType = app.globalData.createGameType || 'texas';
    app.globalData.createGameType = 'texas';
    const defaultName = gameType === 'zjh' ? '炸金花' : '德州扑克';
    this.setData({
      showCreateModal: true,
      gameType: gameType,
      roomName: defaultName,
      enablePassword: false,
      roomPassword: '',
      isLoading: false
    });
  },

  onHideCreateModal() {
    this.setData({ showCreateModal: false });
  },

  onRoomNameInput(e) {
    this.setData({ roomName: e.detail.value });
  },

  onEnablePasswordChange(e) {
    this.setData({ enablePassword: e.detail.value, roomPassword: '' });
  },

  onRoomPasswordInput(e) {
    this.setData({ roomPassword: e.detail.value });
  },

  onMaxPlayersInput(e) {
    const v = e.detail.value;
    if (v === '') { this.setData({ maxPlayers: '' }); return; }
    const n = parseInt(v);
    if (!isNaN(n)) this.setData({ maxPlayers: n });
  },
  onMaxPlayersBlur() {
    const v = parseInt(this.data.maxPlayers);
    if (isNaN(v) || v < 2) { this.setData({ maxPlayers: 2 }); wx.showToast({ title: '最少2人', icon: 'none' }); }
    else if (v > 16) { this.setData({ maxPlayers: 16 }); wx.showToast({ title: '最多16人', icon: 'none' }); }
    else this.setData({ maxPlayers: v });
  },

  onChipsInput(e) {
    const v = e.detail.value;
    if (v === '') { this.setData({ defaultChips: '' }); return; }
    const n = parseInt(v);
    if (!isNaN(n)) this.setData({ defaultChips: n });
  },
  onChipsBlur() {
    const v = parseInt(this.data.defaultChips);
    if (isNaN(v) || v < 100) { this.setData({ defaultChips: 100 }); wx.showToast({ title: '最少100筹码', icon: 'none' }); }
    else if (v > 100000) { this.setData({ defaultChips: 100000 }); wx.showToast({ title: '最多100000筹码', icon: 'none' }); }
    else this.setData({ defaultChips: v });
  },

  onSmallBlindInput(e) {
    const v = e.detail.value;
    if (v === '') { this.setData({ smallBlind: '' }); return; }
    const n = parseInt(v);
    if (!isNaN(n)) this.setData({ smallBlind: n });
  },
  onSmallBlindBlur() {
    const v = parseInt(this.data.smallBlind);
    if (isNaN(v) || v < 1) { this.setData({ smallBlind: 1 }); wx.showToast({ title: '最少1', icon: 'none' }); }
    else if (v > 10000) { this.setData({ smallBlind: 10000 }); wx.showToast({ title: '最多10000', icon: 'none' }); }
    else this.setData({ smallBlind: v });
  },

  onBigBlindInput(e) {
    const v = e.detail.value;
    if (v === '') { this.setData({ bigBlind: '' }); return; }
    const n = parseInt(v);
    if (!isNaN(n)) this.setData({ bigBlind: n });
  },
  onBigBlindBlur() {
    const v = parseInt(this.data.bigBlind);
    if (isNaN(v) || v < 2) { this.setData({ bigBlind: 2 }); wx.showToast({ title: '最少2', icon: 'none' }); }
    else if (v > 20000) { this.setData({ bigBlind: 20000 }); wx.showToast({ title: '最多20000', icon: 'none' }); }
    else this.setData({ bigBlind: v });
  },

  onZjhBaseBetInput(e) {
    const v = e.detail.value;
    if (v === '') { this.setData({ zjhBaseBet: '' }); return; }
    const n = parseInt(v);
    if (!isNaN(n)) this.setData({ zjhBaseBet: n });
  },
  onZjhBaseBetBlur() {
    const v = parseInt(this.data.zjhBaseBet);
    if (isNaN(v) || v < 10) { this.setData({ zjhBaseBet: 10 }); wx.showToast({ title: '底注最少10', icon: 'none' }); }
    else if (v > 1000) { this.setData({ zjhBaseBet: 1000 }); wx.showToast({ title: '底注最多1000', icon: 'none' }); }
    else this.setData({ zjhBaseBet: v });
  },

  onZjhMaxRoundsInput(e) {
    const v = e.detail.value;
    if (v === '') { this.setData({ zjhMaxRounds: '' }); return; }
    const n = parseInt(v);
    if (!isNaN(n)) this.setData({ zjhMaxRounds: n });
  },
  onZjhMaxRoundsBlur() {
    const v = parseInt(this.data.zjhMaxRounds);
    if (isNaN(v) || v < 5) { this.setData({ zjhMaxRounds: 5 }); wx.showToast({ title: '最少5轮', icon: 'none' }); }
    else if (v > 50) { this.setData({ zjhMaxRounds: 50 }); wx.showToast({ title: '最多50轮', icon: 'none' }); }
    else this.setData({ zjhMaxRounds: v });
  },

  onMaxHandsInput(e) {
    const v = e.detail.value;
    if (v === '') { this.setData({ maxHands: '' }); return; }
    const n = parseInt(v);
    if (!isNaN(n)) this.setData({ maxHands: n });
  },
  onMaxHandsBlur() {
    const v = parseInt(this.data.maxHands);
    if (isNaN(v) || v < 3) { this.setData({ maxHands: 3 }); wx.showToast({ title: '最少3回合', icon: 'none' }); }
    else if (v > 50) { this.setData({ maxHands: 50 }); wx.showToast({ title: '最多50回合', icon: 'none' }); }
    else this.setData({ maxHands: v });
  },

  onAllowMidJoinChange(e) {
    this.setData({ allowMidJoin: e.detail.value });
  },

  createRoom() {
    if (this.data.isLoading) return;

    if (this.data.enablePassword && !this.data.roomPassword.trim()) {
      wx.showToast({ title: '请输入房间密码', icon: 'none' });
      return;
    }

    this.setData({ isLoading: true });

    const playerInfo = this.getPlayerInfo();
    const isZjh = this.data.gameType === 'zjh';

    const cloudData = {
      gameType: this.data.gameType,
      roomName: this.data.roomName || (isZjh ? '炸金花' : '德州扑克'),
      maxPlayers: parseInt(this.data.maxPlayers) || 12,
      defaultChips: parseInt(this.data.defaultChips) || 10000,
      maxHands: parseInt(this.data.maxHands) || 10,
      allowMidJoin: this.data.allowMidJoin,
      password: this.data.enablePassword ? this.data.roomPassword.trim() : '',
      playerName: playerInfo.name,
      playerAvatar: playerInfo.avatarUrl
    };

    if (isZjh) {
      cloudData.zjhBaseBet = parseInt(this.data.zjhBaseBet) || 100;
      cloudData.zjhMaxRounds = parseInt(this.data.zjhMaxRounds) || 20;
    } else {
      cloudData.smallBlind = parseInt(this.data.smallBlind) || 100;
      cloudData.bigBlind = parseInt(this.data.bigBlind) || 200;
    }

    wx.cloud.callFunction({
      name: 'createRoom',
      data: cloudData
    }).then(res => {
      this.setData({ isLoading: false, showCreateModal: false });
      const result = (res && res.result) || {};
      if (result.success) {
        wx.showToast({ title: '创建成功', icon: 'success' });
        this.enterRoom(result.roomId, this.data.gameType);
      } else {
        wx.showToast({ title: result.error || '创建失败', icon: 'none' });
      }
    }).catch(err => {
      this.setData({ isLoading: false });
      wx.showToast({ title: '创建失败', icon: 'none' });
    });
  },

  onShowJoinModal() {
    this.setData({ showJoinModal: true, joinRoomNumber: '', joinNeedPassword: false, joinRoomPassword: '' });
  },

  onHideJoinModal() {
    this.setData({ showJoinModal: false });
  },

  onJoinRoomNumberInput(e) {
    const val = e.detail.value;
    this.setData({ joinRoomNumber: val });
    if (val.length === 6) {
      this.checkRoomPassword(val);
    } else {
      this.setData({ joinNeedPassword: false, joinRoomPassword: '' });
    }
  },

  onJoinPasswordInput(e) {
    this.setData({ joinRoomPassword: e.detail.value });
  },

  checkRoomPassword(roomNumber) {
    const db = wx.cloud.database();
    db.collection('rooms').where({ roomNumber }).field({ hasPassword: true }).get().then(res => {
      if (res.data && res.data.length > 0) {
        const room = res.data[0];
        this.setData({ joinNeedPassword: !!room.hasPassword });
      }
    }).catch(() => {});
  },

  joinRoom() {
    const number = this.data.joinRoomNumber.trim();
    if (!number || number.length !== 6) {
      wx.showToast({ title: '请输入6位房间号', icon: 'none' });
      return;
    }
    if (this.data.joinNeedPassword && !this.data.joinRoomPassword.trim()) {
      wx.showToast({ title: '请输入房间密码', icon: 'none' });
      return;
    }
    if (this.data.isLoading) return;
    this.setData({ isLoading: true });

    const playerInfo = this.getPlayerInfo();
    wx.cloud.callFunction({
      name: 'joinRoom',
      data: {
        roomNumber: number,
        password: this.data.joinRoomPassword.trim(),
        playerName: playerInfo.name,
        playerAvatar: playerInfo.avatarUrl
      }
    }).then(res => {
      this.setData({ isLoading: false, showJoinModal: false });
      const result = (res && res.result) || {};
      if (result.success) {
        const msg = result.isSpectator ? '已加入观战' : '加入成功';
        wx.showToast({ title: msg, icon: 'success' });
        this.enterRoom(result.roomId, result.gameType || 'texas', result.isSpectator);
      } else {
        wx.showToast({ title: result.error || '加入失败', icon: 'none' });
      }
    }).catch(err => {
      this.setData({ isLoading: false });
      wx.showToast({ title: '加入失败', icon: 'none' });
    });
  },

  enterRoom(roomId, gameType, isSpectator) {
    const url = gameType === 'zjh'
      ? `/pages/game-zjh/game-zjh?roomId=${roomId}${isSpectator ? '&isSpectator=1' : ''}`
      : `/pages/game-poker/game-poker?roomId=${roomId}${isSpectator ? '&isSpectator=1' : ''}`;
    wx.navigateTo({ url });
  },

  onRoomTap(e) {
    if (this.data.swipedRoomId) {
      this.setData({ swipedRoomId: '' });
      return;
    }
    const roomId = e.currentTarget.dataset.id;
    const room = this.data.myRooms.find(r => r._id === roomId);
    const gameType = room ? (room.gameType || 'texas') : 'texas';
    this.enterRoom(roomId, gameType);
  },

  onTouchStart(e) {
    this.setData({ touchStartX: e.touches[0].clientX, touchStartY: e.touches[0].clientY });
  },
  onTouchMove(e) {
    const dx = e.touches[0].clientX - this.data.touchStartX;
    const dy = e.touches[0].clientY - this.data.touchStartY;
    if (Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy)) {
      const roomId = e.currentTarget.dataset.id;
      if (dx < 0) this.setData({ swipedRoomId: roomId });
      else this.setData({ swipedRoomId: '' });
    }
  },
  onTouchEnd() {},

  onDeleteRoom(e) {
    const roomId = e.currentTarget.dataset.id;
    const room = this.data.myRooms.find(r => r._id === roomId);
    if (!room) return;
    wx.showModal({
      title: '删除房间',
      content: '确定删除房间「' + (room.roomName || room.roomNumber) + '」吗？',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...' });
          wx.cloud.callFunction({
            name: 'deleteRoom',
            data: { roomId }
          }).then(cfRes => {
            wx.hideLoading();
            const result = (cfRes && cfRes.result) || {};
            if (result.success) {
              wx.showToast({ title: '已删除', icon: 'success' });
              this.setData({ swipedRoomId: '' });
              this.loadMyRooms();
            } else {
              wx.showToast({ title: result.error || '删除失败', icon: 'none' });
            }
          }).catch(err => {
            wx.hideLoading();
            wx.showToast({ title: '删除失败', icon: 'none' });
          });
        }
      }
    });
  },

  onShareAppMessage() {
    return {
      title: '来一局德州扑克 & 炸金花！',
      path: '/pages/room/room'
    };
  },

  checkAdmin() {
    wx.cloud.callFunction({ name: 'checkAdmin' }).then(res => {
      if (res.result && res.result.isAdmin) {
        this.setData({ isAdmin: true });
      }
    }).catch(() => {});
  },

  onShowAnnounceModal() {
    this.setData({ showAnnounceModal: true, announceTitle: '', announceContent: '', announcePriority: 0, announceDuration: 7 });
  },

  onHideAnnounceModal() {
    this.setData({ showAnnounceModal: false });
  },

  onAnnounceTitleInput(e) { this.setData({ announceTitle: e.detail.value }); },
  onAnnounceContentInput(e) { this.setData({ announceContent: e.detail.value }); },
  onAnnouncePriorityInput(e) {
    const v = parseInt(e.detail.value);
    this.setData({ announcePriority: isNaN(v) ? 0 : v });
  },
  onAnnounceDurationInput(e) {
    const v = parseInt(e.detail.value);
    this.setData({ announceDuration: isNaN(v) ? 7 : v });
  },

  addAnnouncement() {
    const title = this.data.announceTitle.trim();
    const content = this.data.announceContent.trim();
    if (!title) { wx.showToast({ title: '请输入标题', icon: 'none' }); return; }
    if (!content) { wx.showToast({ title: '请输入内容', icon: 'none' }); return; }

    this.setData({ isLoading: true });
    wx.cloud.callFunction({
      name: 'addAnnouncement',
      data: {
        title,
        content,
        priority: this.data.announcePriority,
        duration: this.data.announceDuration
      }
    }).then(res => {
      this.setData({ isLoading: false });
      const result = (res && res.result) || {};
      if (result.success) {
        wx.showToast({ title: '发布成功', icon: 'success' });
        this.setData({ showAnnounceModal: false });
      } else {
        wx.showToast({ title: result.error || '发布失败', icon: 'none' });
      }
    }).catch(err => {
      this.setData({ isLoading: false });
      wx.showToast({ title: '发布失败', icon: 'none' });
    });
  },

  stopBubble() {}
});