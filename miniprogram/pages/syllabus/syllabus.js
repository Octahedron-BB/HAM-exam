const { store } = require('../../utils/store');
const QBank = require('../../utils/questions');
const Engine = require('../../utils/engine');

Page({
  data: {
    loading: true,
    level: 'A',
    levels: [
      { key: 'A', label: 'A类' },
      { key: 'B', label: 'B类' },
      { key: 'C', label: 'C类' },
      { key: 'ALL', label: '总题库' }
    ],
    tree: [],
    openMap: { '1': true }
  },

  onLoad(options) {
    const level = (options && options.level) || store.settings.level || 'A';
    this.setData({ level });
    setTimeout(() => this.loadData(), 0);
  },

  onShow() {
    if (this._questions) {
      this.rebuildTree();
    }
  },

  loadData() {
    const bank = QBank.load();
    this._questions = bank.questions;
    this._syllabus = bank.syllabus;
    this.rebuildTree();
  },

  rebuildTree() {
    const tree = Engine.buildSyllabusStats(
      this._questions,
      this._syllabus,
      store.answered,
      this.data.level
    );
    this.setData({ loading: false, tree });
  },

  onLevelTap(e) {
    const level = e.currentTarget.dataset.key;
    this.setData({ level });
    this.rebuildTree();
  },

  onToggleChapter(e) {
    const id = e.currentTarget.dataset.id;
    const key = 'openMap.' + id;
    this.setData({ [key]: !this.data.openMap[id] });
  },

  onGoPractice(e) {
    const { prefix, mode, title } = e.currentTarget.dataset;
    const level = this.data.level;
    wx.navigateTo({
      url: `/pages/quiz/quiz?level=${level}&mode=${mode || 'seq'}&syllabusPrefix=${encodeURIComponent(prefix)}&customTitle=${encodeURIComponent(title || prefix)}`
    });
  }
});
