const { store } = require('../../utils/store');
const QBank = require('../../utils/questions');

function formatSec(sec) {
  const m = Math.floor(Math.max(0, sec) / 60);
  const s = Math.max(0, sec) % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

Page({
  data: {
    loading: true,
    record: null,
    hasItems: false,
    accuracy: 0,
    durationText: '00:00',
    dateStr: '',
    filterIdx: 0, // 0: 全部, 1: 仅错题, 2: 做对
    totalCount: 0,
    wrongCount: 0,
    rightCount: 0,
    visibleItems: []
  },

  onLoad(options) {
    this.recordId = Number(options && options.id);
    setTimeout(() => this.init(), 0);
  },

  init() {
    const record = (store.examHistory || []).find((r) => r.id === this.recordId);
    if (!record) {
      this.setData({ loading: false, record: null });
      return;
    }

    const bank = QBank.load();
    const map = QBank.buildIndex(bank.questions);

    const d = new Date(record.createdAt || Date.now());
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const accuracy = record.total ? Math.round((record.score / record.total) * 100) : 0;

    const rawItems = Array.isArray(record.items) ? record.items : [];
    const detailed = rawItems.map((it, idx) => {
      const q = map[it.id];
      const opts = it.options || (q ? q.options : {});
      const selected = String(it.selected || '');
      const answer = String(it.answer || (q ? q.answer : ''));
      const optList = Object.keys(opts).sort().map((k) => {
        let cls = '';
        if (answer.indexOf(k) >= 0) cls = 'opt-correct';
        else if (selected.indexOf(k) >= 0) cls = 'opt-wrong';
        return { key: k, text: opts[k], cls };
      });
      return {
        num: idx + 1,
        id: it.id,
        q: q ? q.q : it.id,
        p: q ? q.p : '',
        typeText: (q && q.type === 'multi') || answer.length > 1 ? '多选' : '单选',
        isMulti: (q && q.type === 'multi') || answer.length > 1,
        selected: selected || '未作答',
        answer,
        isCorrect: Boolean(it.isCorrect),
        optList
      };
    });

    this._allItems = detailed;
    const wrongCount = detailed.filter((x) => !x.isCorrect).length;
    const rightCount = detailed.filter((x) => x.isCorrect).length;

    this.setData({
      loading: false,
      record,
      hasItems: detailed.length > 0,
      accuracy,
      durationText: formatSec(record.durationSec || 0),
      dateStr,
      totalCount: detailed.length,
      wrongCount,
      rightCount,
      visibleItems: detailed
    });
  },

  onFilterTap(e) {
    const filterIdx = Number(e.currentTarget.dataset.idx);
    const all = this._allItems || [];
    const visibleItems = filterIdx === 1
      ? all.filter((x) => !x.isCorrect)
      : filterIdx === 2
        ? all.filter((x) => x.isCorrect)
        : all;
    this.setData({ filterIdx, visibleItems });
  },

  onReviewWrong() {
    const ids = (this._allItems || []).filter((x) => !x.isCorrect).map((x) => x.id);
    if (!ids.length) return;
    wx.navigateTo({
      url: `/pages/quiz/quiz?mode=seq&level=ALL&customIds=${encodeURIComponent(ids.join(','))}&customTitle=${encodeURIComponent('模考错题复盘')}`
    });
  },

  onRetryAll() {
    const ids = (this._allItems || []).map((x) => x.id);
    if (!ids.length) return;
    wx.navigateTo({
      url: `/pages/quiz/quiz?mode=seq&level=ALL&customIds=${encodeURIComponent(ids.join(','))}&customTitle=${encodeURIComponent('重刷本套试卷')}`
    });
  }
});
