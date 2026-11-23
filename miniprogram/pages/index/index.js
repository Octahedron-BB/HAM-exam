const { store, getProfile } = require('../../utils/store');
const QBank = require('../../utils/questions');

Page({
  data: {
    profile: null,
    loggedIn: false,
    stats: { total: 0, correct: 0, wrong: 0, favorites: 0, notes: 0, accuracy: 0 },
    level: 'A',
    order: 'seq',
    qtype: 'all',
    shuffleOptions: true,
    autoRemoveWrong: true,
    counts: { A: 0, B: 0, C: 0, ALL: 0 },
    currentCount: 0,
    levels: [
      { key: 'A', label: 'A 类', desc: '初学 · 30W以下' },
      { key: 'B', label: 'B 类', desc: '进阶 · 全频段' },
      { key: 'C', label: 'C 类', desc: '高级 · 大功率' },
      { key: 'ALL', label: '总题库', desc: '全部合并' }
    ],
    orders: [
      { key: 'seq', label: '顺序刷题' },
      { key: 'random', label: '随机刷题' },
      { key: 'memorize', label: '背题模式' }
    ],
    qtypes: [
      { key: 'all', label: '全部题型' },
      { key: 'single', label: '单选题' },
      { key: 'multi', label: '多选题' }
    ]
  },

  onLoad() {
    try {
      const counts = QBank.loadCounts();
      this.applyCounts(counts);
    } catch (err) {
      console.error('[index] 题量统计加载失败', err);
      wx.showToast({ title: '题库信息加载失败', icon: 'none' });
    }
  },

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
      qtype: settings.qtype || 'all',
      shuffleOptions: settings.shuffleOptions !== false,
      autoRemoveWrong: Boolean(settings.autoRemoveWrong),
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

  onQtypeTap(e) {
    const qtype = e.currentTarget.dataset.key;
    this.setData({ qtype });
    store.saveSettings({ qtype });
  },

  onStart() {
    const { level, order, qtype } = this.data;
    const mode = order === 'memorize' ? 'memorize' : order;
    wx.navigateTo({ url: `/pages/quiz/quiz?level=${level}&mode=${mode}&qtype=${qtype}` });
  },

  onStartMemorize() {
    const { level, qtype } = this.data;
    wx.navigateTo({ url: `/pages/quiz/quiz?level=${level}&mode=memorize&qtype=${qtype}` });
  },

  onOpenSyllabus() {
    wx.navigateTo({ url: `/pages/syllabus/syllabus?level=${this.data.level}` });
  },

  onOpenExam() {
    wx.navigateTo({ url: `/pages/exam/exam?level=${this.data.level}` });
  },

  onOpenWrong() {
    wx.navigateTo({ url: '/pages/library/library?tab=wrong' });
  },

  onOpenFavorite() {
    wx.navigateTo({ url: '/pages/library/library?tab=fav' });
  },

  onOpenNotes() {
    wx.navigateTo({ url: '/pages/library/library?tab=notes' });
  },

  onToggleShuffle(e) {
    const shuffleOptions = Boolean(e.detail.value);
    this.setData({ shuffleOptions });
    store.saveSettings({ shuffleOptions });
  },

  onToggleAutoRemove(e) {
    const autoRemoveWrong = Boolean(e.detail.value);
    this.setData({ autoRemoveWrong });
    store.saveSettings({ autoRemoveWrong });
  },

  onLoginTap() {
    wx.navigateTo({ url: '/pages/login/login?edit=1' });
  }
});
