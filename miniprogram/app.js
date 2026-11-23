const { store } = require('./utils/store');

App({
  globalData: {
    appName: '电波题库',
    // 题库在首次进入刷题页时才加载，避免拖慢冷启动
    bank: null
  },

  onLaunch() {
    // 预留云同步入口：将来接云端时在这里恢复登录态并拉取用户数据，
    // 现在数据层是本地存储，无需在此做网络请求。
  },

  onShow() {
    // 从后台切回时刷新用户数据（例如在设置页退出登录后切回首页）
    store.reload();
  }
});
