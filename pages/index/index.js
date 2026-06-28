Page({
  data: {
    isReady: false,
    announcements: [],
    currentAnnounce: null,
    announceIndex: 0
  },

  onLoad() {
    if (wx.cloud) {
      this.setData({ isReady: true });
      this.loadAnnouncements();
    }
  },

  async loadAnnouncements() {
    try {
      const res = await wx.cloud.callFunction({ name: 'getAnnouncements', data: { limit: 5 } });
      if (res.result && res.result.success) {
        const list = res.result.data || [];
        this.setData({
          announcements: list,
          currentAnnounce: list.length > 0 ? list[0] : null
        });
      }
    } catch (err) {
      console.error('loadAnnouncements error:', err);
    }
  },

  onSwitchAnnounce(e) {
    const index = e.currentTarget.dataset.index;
    const list = this.data.announcements;
    if (index >= 0 && index < list.length) {
      this.setData({ announceIndex: index, currentAnnounce: list[index] });
    }
  },

  onCreateTexas() {
    const app = getApp();
    app.globalData.openCreateModal = true;
    app.globalData.createGameType = 'texas';
    wx.switchTab({ url: '/pages/room/room' });
  },

  onCreateZJH() {
    const app = getApp();
    app.globalData.openCreateModal = true;
    app.globalData.createGameType = 'zjh';
    wx.switchTab({ url: '/pages/room/room' });
  },

  onJoinRoom() {
    const app = getApp();
    app.globalData.openJoinModal = true;
    wx.switchTab({ url: '/pages/room/room' });
  },

  onShareAppMessage() {
    return {
      title: '纸牌桌 - 好友聚会德州扑克 & 炸金花',
      path: '/pages/index/index'
    };
  }
});