const { store } = require('../../utils/store');
const QBank = require('../../utils/questions');
const Engine = require('../../utils/engine');

const MODE_TITLES = {
  seq: '顺序刷题',
  random: '随机刷题',
  memorize: '背题模式',
  wrong: '错题集',
  favorite: '收藏集',
  notes: '我的笔记'
};

const MODE_EMPTY = {
  wrong: '错题集是空的，答错的题会自动收录进来',
  favorite: '还没有收藏的题目，刷题时点右上角星标即可收藏',
  notes: '还没有写过笔记，刷题时可在题目下方记录'
};

Page({
  data: {
    loading: true,
    emptyText: '',
    title: '',
    index: 0,
    total: 0,
    progressPercent: '0%',
    q: null,
    options: [],
    isMulti: false,
    isMemorize: false,
    submitted: false,
    isCorrect: false,
    answerText: '',
    selectedText: '',
    canSubmitMulti: false,
    noteText: '',
    isFavorite: false,
    isWrong: false
  },

  onLoad(options) {
    this.level = options.level || 'A';
    this.mode = options.mode || 'seq';
    this.sessionResults = {};   // 仅记录本次进入后的作答，用于锁定选项
    this.shuffled = {};         // 选项打乱结果缓存，保证同题顺序稳定
    this.currentQ = null;

    wx.setNavigationBarTitle({ title: MODE_TITLES[this.mode] || '刷题' });
    this.setData({ title: MODE_TITLES[this.mode] || '刷题' });

    try {
      const bank = QBank.load();
      this.map = QBank.buildIndex(bank.questions);
      this.list = this.buildList(bank.questions);
    } catch (err) {
      console.error('[quiz] 题库加载失败', err);
      this.setData({ loading: false, emptyText: '题库加载失败，请退出重试' });
      return;
    }

    if (!this.list.length) {
      this.setData({
        loading: false,
        emptyText: MODE_EMPTY[this.mode] || '暂无题目'
      });
      return;
    }

    // 顺序模式支持断点续刷
    let start = 0;
    if (this.mode === 'seq') {
      const saved = store.getSessionCursor('seq_' + this.level);
      if (saved > 0 && saved < this.list.length) start = saved;
    }

    this.setData({ loading: false, total: this.list.length });
    this.goTo(start);
  },

  buildList(questions) {
    const { mode } = this;

    if (mode === 'wrong') {
      return store.getWrongIds().filter((id) => this.map[id]);
    }
    if (mode === 'favorite') {
      return store.getFavoriteIds().filter((id) => this.map[id]);
    }
    if (mode === 'notes') {
      return store.getNoteIds().filter((id) => this.map[id]);
    }

    let pool = Engine.filterQuestions(questions, { level: this.level });
    if (mode === 'random') pool = Engine.shuffle(pool);
    return pool.map((q) => q.id);
  },

  /** 取题目，必要时按设置打乱选项（同题只打乱一次） */
  resolveQuestion(id) {
    const raw = this.map[id];
    if (!store.settings.shuffleOptions) return raw;
    if (!this.shuffled[id]) this.shuffled[id] = Engine.shuffleOptions(raw);
    return this.shuffled[id];
  },

  /** 生成带展示状态的选项数组 */
  decorate(q, selectedStr, mode) {
    const selected = String(selectedStr || '').split('');
    const answer = String(q.answer || '').split('');
    return Object.keys(q.options).sort().map((key) => {
      let state = '';
      if (mode === 'graded') {
        if (answer.indexOf(key) >= 0) state = 'correct';
        else if (selected.indexOf(key) >= 0) state = 'wrong';
      } else if (mode === 'picked') {
        if (selected.indexOf(key) >= 0) state = 'picked';
      } else if (mode === 'answer') {
        if (answer.indexOf(key) >= 0) state = 'correct';
      }
      return { key, text: q.options[key], state };
    });
  },

  goTo(index) {
    if (index < 0 || index >= this.list.length) return;

    const id = this.list[index];
    const q = this.resolveQuestion(id);
    this.currentQ = q;
    this.selected = [];

    const isMemorize = this.mode === 'memorize';
    const session = this.sessionResults[id];

    let submitted = false;
    let isCorrect = false;
    let selectedText = '';
    let answerText = '';
    let options = [];

    if (isMemorize) {
      submitted = true;
      answerText = q.answer;
      options = this.decorate(q, '', 'answer');
    } else if (session) {
      submitted = true;
      isCorrect = session.isCorrect;
      selectedText = session.selected;
      answerText = q.answer;
      options = this.decorate(q, session.selected, 'graded');
    } else {
      options = this.decorate(q, '', '');
    }

    // 笔记模式下把笔记内容带出来，方便集中复习
    const noteText = store.getNote(q.id);

    this.setData({
      index,
      q: {
        id: q.id,
        seq: q.index,
        text: q.q,
        typeText: q.type === 'multi' ? '多选题' : '单选题',
        point: q.p
      },
      isMulti: q.type === 'multi',
      isMemorize,
      options,
      submitted,
      isCorrect,
      selectedText,
      answerText,
      canSubmitMulti: false,
      noteText,
      isFavorite: store.isFavorite(q.id),
      isWrong: store.isWrong(q.id),
      progressPercent: Math.round(((index + 1) / this.list.length) * 100) + '%'
    });

    // 顺序模式记录断点
    if (this.mode === 'seq') {
      store.saveSessionCursor('seq_' + this.level, index);
    }
  },

  onOptionTap(e) {
    if (this.data.submitted || this.data.isMemorize) return;

    const key = e.currentTarget.dataset.key;
    const q = this.currentQ;

    if (q.type === 'multi') {
      const sel = this.selected.slice();
      const pos = sel.indexOf(key);
      if (pos >= 0) sel.splice(pos, 1);
      else sel.push(key);
      this.selected = sel;

      this.setData({
        options: this.decorate(q, sel.join(''), 'picked'),
        canSubmitMulti: sel.length > 0
      });
      return;
    }

    this.submitAnswer(key);
  },

  onSubmitMulti() {
    if (!this.selected.length) return;
    this.submitAnswer(this.selected.join(''));
  },

  submitAnswer(selectedStr) {
    const q = this.currentQ;
    const result = Engine.grade(q, selectedStr);

    this.sessionResults[q.id] = result;
    store.recordAttempt(q.id, result.selected, result.isCorrect);

    this.setData({
      submitted: true,
      isCorrect: result.isCorrect,
      selectedText: result.selected,
      answerText: result.answer,
      options: this.decorate(q, result.selected, 'graded'),
      canSubmitMulti: false,
      isWrong: store.isWrong(q.id)
    });
  },

  onToggleFavorite() {
    if (!this.currentQ) return;
    const added = store.toggleFavorite(this.currentQ.id);
    this.setData({ isFavorite: added });
    wx.showToast({ title: added ? '已收藏' : '已取消收藏', icon: 'none' });
  },

  onNoteInput(e) {
    this.setData({ noteText: e.detail.value });
  },

  onNoteBlur() {
    this.saveNote(false);
  },

  onSaveNote() {
    this.saveNote(true);
  },

  saveNote(showToast) {
    if (!this.currentQ) return;
    const saved = store.saveNote(this.currentQ.id, this.data.noteText);
    this.setData({ noteText: saved });
    if (showToast) {
      wx.showToast({ title: saved ? '笔记已保存' : '空笔记已清除', icon: 'none' });
    }
  },

  onPrev() {
    if (this.data.index <= 0) return;
    this.saveNote(false);
    this.goTo(this.data.index - 1);
  },

  onNext() {
    if (this.data.index >= this.list.length - 1) {
      this.saveNote(false);
      wx.showToast({ title: '本组题目已完成', icon: 'none' });
      return;
    }
    this.saveNote(false);
    this.goTo(this.data.index + 1);
  },

  onExit() {
    this.saveNote(false);
    wx.navigateBack({ delta: 1 });
  }
});
