const { store } = require('../../utils/store');

const MOCK_PRESETS = {
  A: { level: 'A', singleCount: 25, multiCount: 5, durationMin: 40, passScore: 25, title: 'A类全真模拟考' },
  B: { level: 'B', singleCount: 40, multiCount: 10, durationMin: 60, passScore: 40, title: 'B类全真模拟考' },
  C: { level: 'C', singleCount: 65, multiCount: 15, durationMin: 90, passScore: 60, title: 'C类全真模拟考' }
};

Page({
  data: {
    level: 'A',
    singleCount: 25,
    multiCount: 5,
    durationMin: 40,
    strategy: 'random',
    levels: [
      { key: 'A', label: 'A类' },
      { key: 'B', label: 'B类' },
      { key: 'C', label: 'C类' },
      { key: 'ALL', label: '总题库' }
    ],
    strategies: [
      { key: 'random', label: '完全随机' },
      { key: 'unanswered', label: '优先未做' },
      { key: 'wrong', label: '优先错题' }
    ],
    chapters: [
      { id: '1', label: '1. 法规', checked: true },
      { id: '2', label: '2. 通信', checked: true },
      { id: '3', label: '3. 天线', checked: true },
      { id: '4', label: '4. 电路', checked: true },
      { id: '5', label: '5. 安全', checked: true }
    ],
    history: []
  },

  onLoad(options) {
    const level = (options && options.level) || store.settings.level || 'A';
    this.setData({ level });
  },

  onShow() {
    this.refreshHistory();
  },

  refreshHistory() {
    const history = (store.examHistory || []).map((r) => {
      const m = Math.floor((r.durationSec || 0) / 60);
      const s = (r.durationSec || 0) % 60;
      const d = new Date(r.createdAt || Date.now());
      const dateStr = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      return Object.assign({}, r, {
        durationText: `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`,
        dateStr
      });
    });
    this.setData({ history });
  },

  onStartMock(e) {
    const key = e.currentTarget.dataset.mock;
    const p = MOCK_PRESETS[key];
    if (!p) return;
    wx.navigateTo({
      url: `/pages/quiz/quiz?mode=exam&level=${p.level}&singleCount=${p.singleCount}&multiCount=${p.multiCount}&durationMin=${p.durationMin}&passScore=${p.passScore}&strategy=random&customTitle=${encodeURIComponent(p.title)}`
    });
  },

  onLevelTap(e) {
    this.setData({ level: e.currentTarget.dataset.key });
  },

  onStrategyTap(e) {
    this.setData({ strategy: e.currentTarget.dataset.key });
  },

  onSingleInput(e) {
    this.setData({ singleCount: Math.max(0, parseInt(e.detail.value || '0', 10) || 0) });
  },

  onMultiInput(e) {
    this.setData({ multiCount: Math.max(0, parseInt(e.detail.value || '0', 10) || 0) });
  },

  onDurationInput(e) {
    this.setData({ durationMin: Math.max(0, parseInt(e.detail.value || '0', 10) || 0) });
  },

  onToggleChapter(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const key = `chapters[${idx}].checked`;
    this.setData({ [key]: !this.data.chapters[idx].checked });
  },

  onBuildPaper(e) {
    const targetMode = e.currentTarget.dataset.mode || 'exam';
    const { level, singleCount, multiCount, durationMin, strategy, chapters } = this.data;
    if (singleCount + multiCount <= 0) {
      wx.showToast({ title: '请至少设置 1 道题', icon: 'none' });
      return;
    }
    const chIds = chapters.filter((c) => c.checked).map((c) => c.id).join(',');
    const total = singleCount + multiCount;
    const passScore = Math.ceil(total * 0.8);
    const lvLabel = level === 'ALL' ? '总题库' : `${level}类`;
    const title = `自定义组卷 (${lvLabel})`;

    wx.navigateTo({
      url: `/pages/quiz/quiz?mode=${targetMode}&level=${level}&singleCount=${singleCount}&multiCount=${multiCount}&durationMin=${targetMode === 'exam' ? durationMin : 0}&passScore=${passScore}&strategy=${strategy}&chapters=${encodeURIComponent(chIds)}&customTitle=${encodeURIComponent(title)}`
    });
  },

  onOpenRecord(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/exam-detail/exam-detail?id=${id}` });
  },

  onClearHistory() {
    if (!this.data.history.length) return;
    wx.showModal({
      title: '清空模考记录',
      content: '确定清空所有历史模考成绩吗？',
      success: (res) => {
        if (!res.confirm) return;
        store.clearExamHistory();
        this.refreshHistory();
        wx.showToast({ title: '已清空', icon: 'none' });
      }
    });
  }
});
