const { store } = require('../../utils/store');
const QBank = require('../../utils/questions');

Page({
  data: {
    loading: true,
    tab: 'wrong', // 'wrong' | 'fav' | 'notes'
    tabIdx: 0,
    wrongCount: 0,
    favCount: 0,
    noteCount: 0,
    batchMode: false,
    selectedMap: {},
    selectedCount: 0,
    allSelected: false,
    items: []
  },

  onLoad(options) {
    const tab = (options && options.tab) || 'wrong';
    const tabIdx = tab === 'fav' ? 1 : tab === 'notes' ? 2 : 0;
    this.setData({ tab, tabIdx });
    setTimeout(() => this.init(), 0);
  },

  onShow() {
    if (this._map) {
      this.refresh();
    }
  },

  init() {
    const bank = QBank.load();
    this._map = QBank.buildIndex(bank.questions);
    this.setData({ loading: false });
    this.refresh();
  },

  refresh() {
    if (!this._map) return;
    const wrongIds = store.getWrongIds().filter((id) => this._map[id]);
    const favIds = store.getFavoriteIds().filter((id) => this._map[id]);
    const noteIds = store.getNoteIds().filter((id) => this._map[id]);

    const activeIds = this.data.tab === 'wrong'
      ? wrongIds
      : this.data.tab === 'fav'
        ? favIds
        : noteIds;

    const selectedMap = Object.assign({}, this.data.selectedMap);
    const validSet = new Set(activeIds);
    Object.keys(selectedMap).forEach((id) => {
      if (!validSet.has(id)) delete selectedMap[id];
    });

    const items = activeIds.map((id) => {
      const q = this._map[id];
      const wrongInfo = store.wrongBook[id] || {};
      return {
        id: q.id,
        q: q.q,
        p: q.p,
        typeText: q.type === 'multi' ? '多选' : '单选',
        isMulti: q.type === 'multi',
        wrongCount: wrongInfo.count || 1,
        note: store.getNote(id),
        selected: Boolean(selectedMap[id])
      };
    });

    const selectedCount = items.filter((it) => it.selected).length;
    this.setData({
      wrongCount: wrongIds.length,
      favCount: favIds.length,
      noteCount: noteIds.length,
      selectedMap,
      selectedCount,
      allSelected: items.length > 0 && selectedCount === items.length,
      items
    });
  },

  onTabTap(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === this.data.tab) return;
    const tabIdx = tab === 'fav' ? 1 : tab === 'notes' ? 2 : 0;
    this.setData({ tab, tabIdx, batchMode: false, selectedMap: {}, selectedCount: 0, allSelected: false });
    this.refresh();
  },

  onToggleBatch() {
    const next = !this.data.batchMode;
    this.setData({ batchMode: next, selectedMap: {}, selectedCount: 0, allSelected: false });
    this.refresh();
  },

  onToggleSelectAll() {
    const nextAll = !this.data.allSelected;
    const selectedMap = {};
    if (nextAll) {
      this.data.items.forEach((it) => { selectedMap[it.id] = true; });
    }
    this.setData({ selectedMap });
    this.refresh();
  },

  onItemTap(e) {
    const id = e.currentTarget.dataset.id;
    const idx = Number(e.currentTarget.dataset.idx);
    if (this.data.batchMode) {
      const selectedMap = Object.assign({}, this.data.selectedMap);
      if (selectedMap[id]) delete selectedMap[id];
      else selectedMap[id] = true;
      this.setData({ selectedMap });
      this.refresh();
      return;
    }
    const mode = this.data.tab === 'wrong' ? 'wrong' : this.data.tab === 'fav' ? 'favorite' : 'notes';
    wx.navigateTo({ url: `/pages/quiz/quiz?mode=${mode}&level=ALL&startIdx=${idx}` });
  },

  onPracticeAll(e) {
    const mode = e.currentTarget.dataset.mode || (this.data.tab === 'wrong' ? 'wrong' : this.data.tab === 'fav' ? 'favorite' : 'notes');
    wx.navigateTo({ url: `/pages/quiz/quiz?mode=${mode}&level=ALL` });
  },

  onPracticeSelected() {
    const ids = Object.keys(this.data.selectedMap);
    if (!ids.length) return;
    const mode = this.data.tab === 'notes' ? 'memorize' : 'seq';
    const title = `所选${this.data.tab === 'wrong' ? '错题' : this.data.tab === 'fav' ? '收藏' : '笔记'} (${ids.length}题)`;
    wx.navigateTo({
      url: `/pages/quiz/quiz?mode=${mode}&level=ALL&customIds=${encodeURIComponent(ids.join(','))}&customTitle=${encodeURIComponent(title)}`
    });
  },

  onBatchAddFav() {
    const ids = Object.keys(this.data.selectedMap);
    if (!ids.length) return;
    store.addFavoritesBatch(ids);
    wx.showToast({ title: `已收藏 ${ids.length} 题`, icon: 'none' });
    this.refresh();
  },

  onBatchDelete() {
    const ids = Object.keys(this.data.selectedMap);
    if (!ids.length) return;
    const label = this.data.tab === 'wrong' ? '移出错题集' : this.data.tab === 'fav' ? '取消收藏' : '清空笔记';
    wx.showModal({
      title: `批量${label}`,
      content: `确定对选中的 ${ids.length} 道题目执行「${label}」吗？`,
      success: (res) => {
        if (!res.confirm) return;
        if (this.data.tab === 'wrong') store.removeWrongBatch(ids);
        else if (this.data.tab === 'fav') store.removeFavoritesBatch(ids);
        else store.deleteNotesBatch(ids);
        this.setData({ selectedMap: {} });
        this.refresh();
        wx.showToast({ title: `已${label} ${ids.length} 题`, icon: 'none' });
      }
    });
  }
});
