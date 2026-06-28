// app.js
App({
  globalData: {
    openId: '',
    userInfo: null
  },

  onLaunch() {
    // 初始化云开发
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({
        env: 'cloudbase-d5gnoqujwe1b8318c',
        traceUser: true
      });
    }

    this.loadUserInfo();
    this.checkUpdate();
    this.login();
  },

  loadUserInfo() {
    try {
      const cached = wx.getStorageSync('poker_user_info');
      if (cached) {
        this.globalData.userInfo = cached;
      }
    } catch (e) {
      // ignore
    }
  },

  saveUserInfo(info) {
    this.globalData.userInfo = info;
    try {
      wx.setStorageSync('poker_user_info', info);
    } catch (e) {
      // ignore
    }
  },

  checkUpdate() {
    if (wx.canIUse('getUpdateManager')) {
      const updateManager = wx.getUpdateManager();
      updateManager.onCheckForUpdate((res) => {
        if (res.hasUpdate) {
          updateManager.onUpdateReady(() => {
            wx.showModal({
              title: '更新提示',
              content: '新版本已准备好，是否重启应用？',
              success: (res) => {
                if (res.confirm) updateManager.applyUpdate();
              }
            });
          });
        }
      });
    }
  },

  login() {
    wx.cloud.callFunction({
      name: 'login'
    }).then(res => {
      if (res.result && res.result.openid) {
        this.globalData.openId = res.result.openid;
        console.log('登录成功，openid:', res.result.openid);
      }
    }).catch(err => {
      console.error('登录失败:', err);
    });
  }
});
