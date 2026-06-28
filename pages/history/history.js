// pages/history/history.js - 战绩统计页面
const app = getApp();

Page({
  data: {
    profile: { totalGames: 0, totalWins: 0, totalProfit: 0, bestHand: '', level: 1, winRate: 0, zjhGames: 0, pokerGames: 0 },
    dailyStats: [],
    isLoading: true
  },

  onShow() {
    this.loadStats();
  },

  onPullDownRefresh() {
    this.loadStats().then(() => wx.stopPullDownRefresh());
  },

  async loadStats() {
    this.setData({ isLoading: true });

    try {
      const res = await wx.cloud.callFunction({
        name: 'getStats',
        data: {}
      });

      if (res.result && res.result.success) {
        const { profile, dailyStats } = res.result;
        this.setData({
          profile: {
            totalGames: profile.totalGames || 0,
            totalWins: profile.totalWins || 0,
            totalProfit: profile.totalProfit || 0,
            bestHand: profile.bestHand || '',
            level: profile.level || 1,
            winRate: profile.winRate || 0,
            zjhGames: profile.zjhGames || 0,
            pokerGames: profile.pokerGames || 0
          },
          dailyStats: (dailyStats || []).map(d => ({
            ...d,
            displayDate: this.formatDate(d.date)
          })),
          isLoading: false
        });
      } else {
        this.setData({ isLoading: false });
        wx.showToast({ title: '加载失败', icon: 'none' });
      }
    } catch (err) {
      console.error('loadStats error:', err);
      this.setData({ isLoading: false });
      wx.showToast({ title: '网络错误', icon: 'none' });
    }
  },

  formatDate(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parseInt(parts[1])}月${parseInt(parts[2])}日`;
    }
    return dateStr;
  }
});