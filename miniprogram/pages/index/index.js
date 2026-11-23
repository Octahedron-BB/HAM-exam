const { store, getProfile } = require('../../utils/store');
const QBank = require('../../utils/questions');

Page({
  data: {
    profile: null,
    loggedIn: false,
    stats: { total: 0, correct: 0, wrong: 0, favorites: 0, notes: 0, accuracy: 0 },
    level: 'A',
    order: 'seq',
    counts: { A: 0, B: 0, C: 0, ALL: 0 },
    currentCount: 0,
    levels: [
      { key: 'A', label: 'A 类', desc: '初学' },
      { key: 'B', label: 'B 类', desc: '进阶' },
      { key: 'C', label: 'C 类', desc: '高级' },
      { key: 'ALL', label: '总题库', desc: '全部' }
    ],
    orders: [
      { key: 'seq', label: '顺序' },
      { key: 'random', label: '随机' },
      { key: 'memorize', label: '背题' }
    ]
  },

  onLoad() {
    // 只读 counts.json（几百字节），不解析 600KB 题库，冷启动秒开
    try {
      const counts = QBank.loadCounts();
      this.applyCounts(counts);
    } catch (err) {
      console.error('[index] 题量统计加载失败', err);
      wx.showToast({ title: '题库信息加载失败', icon: 'none' });
    }
  },

  /** 把各级别题量写进 levels，WXML 直接取 item.count */
  applyCounts(counts) {
    const levels = this.data.levels.map((item) =>
      Object.assign({}, item, { count: counts[item.key] || 0 })
    );
    this.setData({
      counts,
      levels,
      currentCount: counts[this.data.level] || 0
    });
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const profile = getProfile();
    const settings = store.settings || {};
    const level = settings.level || 'A';
    this.setData({
      profile,
      loggedIn: Boolean(profile),
      stats: store.getStats(),
      level,
      order: settings.order || 'seq',
      currentCount: this.data.counts[level] || 0
    });
  },

  onLevelTap(e) {
    const level = e.currentTarget.dataset.key;
    this.setData({ level, currentCount: this.data.counts[level] || 0 });
    store.saveSettings({ level });
  },

  onOrderTap(e) {
    const order = e.currentTarget.dataset.key;
    this.setData({ order });
    store.saveSettings({ order });
  },

  onStart() {
    const { level, order } = this.data;
    const mode = order === 'memorize' ? 'memorize' : order;
    wx.navigateTo({ url: '/pages/quiz/quiz?level=' + level + '&mode=' + mode });
  },

  onStartMemorize() {
    const { level } = this.data;
    wx.navigateTo({ url: '/pages/quiz/quiz?level=' + level + '&mode=memorize' });
  },

  onOpenWrong() {
    wx.navigateTo({ url: '/pages/quiz/quiz?mode=wrong&level=ALL' });
  },

  onOpenFavorite() {
    wx.navigateTo({ url: '/pages/quiz/quiz?mode=favorite&level=ALL' });
  },

  onOpenNotes() {
    wx.navigateTo({ url: '/pages/quiz/quiz?mode=notes&level=ALL' });
  },

  onLoginTap() {
    wx.navigateTo({ url: '/pages/login/login?edit=1' });
  }
});
