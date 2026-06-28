Page({
  data: {
    handRanks: [
      { rank: 1, name: '皇家同花顺', desc: '10-J-Q-K-A 同花' },
      { rank: 2, name: '同花顺', desc: '五张同花色连续牌' },
      { rank: 3, name: '四条', desc: '四张同点数' },
      { rank: 4, name: '葫芦', desc: '三条 + 一对' },
      { rank: 5, name: '同花', desc: '五张同花色' },
      { rank: 6, name: '顺子', desc: '五张连续点数' },
      { rank: 7, name: '三条', desc: '三张同点数' },
      { rank: 8, name: '两对', desc: '两个不同的对子' },
      { rank: 9, name: '一对', desc: '两张同点数' },
      { rank: 10, name: '高牌', desc: '无以上牌型，比最大单张' }
    ]
  },

  backToHome() {
    wx.navigateBack();
  }
});
