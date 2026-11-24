const { store } = require('../../utils/store');
const QBank = require('../../utils/questions');
const Engine = require('../../utils/engine');

const MODE_TITLES = {
  seq: '顺序刷题',
  random: '随机刷题',
  memorize: '背题模式',
  wrong: '错题集',
  favorite: '收藏集',
  notes: '我的笔记',
  exam: '模拟考试',
  paper_practice: '组卷刷题'
};

const MODE_EMPTY = {
  wrong: '错题集是空的，答错的题会自动收录进来',
  favorite: '还没有收藏的题目，刷题时点右上角星标即可收藏',
  notes: '还没有写过笔记，刷题时可在题目下方记录'
};

function formatSec(sec) {
  const m = Math.floor(Math.max(0, sec) / 60);
  const s = Math.max(0, sec) % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

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
    isExam: false,
    examTimerText: '',
    examUrgent: false,
    submitted: false,
    isCorrect: false,
    answerText: '',
    selectedText: '',
    canSubmitMulti: false,
    noteText: '',
    explanation: null,
    isFavorite: false,
    isWrong: false,
    showSheet: false,
    sheetItems: [],
    scrollTop: 0,
    showResult: false,
    resultPassed: false,
    resultScore: 0,
    resultTotal: 0,
    resultSub: '',
    resultWrongCount: 0
  },

  onLoad(options) {
    this.options = options || {};
    this.level = this.options.level || 'A';
    this.mode = this.options.mode || 'seq';
    this.qtype = this.options.qtype || 'all';
    this.syllabusPrefix = this.options.syllabusPrefix ? decodeURIComponent(this.options.syllabusPrefix) : '';
    this.customIds = this.options.customIds ? decodeURIComponent(this.options.customIds).split(',').filter(Boolean) : null;
    this.startIdxParam = this.options.startIdx ? parseInt(this.options.startIdx, 10) : -1;

    this.sessionResults = {};
    this.examDraft = {};
    this.eliminated = {};
    this.shuffled = {};
    this.currentQ = null;
    this._timerId = null;

    const title = this.options.customTitle
      ? decodeURIComponent(this.options.customTitle)
      : (MODE_TITLES[this.mode] || '刷题');

    wx.setNavigationBarTitle({ title });
    this.setData({ title, isExam: this.mode === 'exam' });

    setTimeout(() => this.initSession(), 0);
  },

  onUnload() {
    this.stopTimer();
  },

  stopTimer() {
    if (this._timerId) {
      clearInterval(this._timerId);
      this._timerId = null;
    }
  },

  initSession() {
    try {
      const bank = QBank.load();
      this.map = QBank.buildIndex(bank.questions);
      this._explanations = require('../../data/explanations');
      this.list = this.buildList(bank.questions);
    } catch (err) {
      console.error('[quiz] 题库加载失败', err);
      this.setData({ loading: false, emptyText: '题库加载失败，请退出重试' });
      return;
    }

    if (!this.list.length) {
      this.setData({
        loading: false,
        emptyText: MODE_EMPTY[this.mode] || '当前筛选条件下暂无题目'
      });
      return;
    }

    let start = 0;
    if (this.startIdxParam >= 0 && this.startIdxParam < this.list.length) {
      start = this.startIdxParam;
    } else if (this.mode === 'seq' && !this.syllabusPrefix && this.qtype === 'all' && !this.customIds) {
      const saved = store.getSessionCursor('seq_' + this.level);
      if (saved > 0 && saved < this.list.length) start = saved;
    }

    // 模拟考计时器
    if (this.mode === 'exam') {
      const durationMin = parseInt(this.options.durationMin || '0', 10) || 0;
      this.examPassScore = parseInt(this.options.passScore || String(Math.ceil(this.list.length * 0.8)), 10);
      this.examDurationSec = durationMin * 60;
      this.examSecondsLeft = this.examDurationSec;
      this.examStartedAt = Date.now();

      if (this.examDurationSec > 0) {
        this.setData({ examTimerText: formatSec(this.examSecondsLeft), examUrgent: false });
        this._timerId = setInterval(() => {
          this.examSecondsLeft -= 1;
          this.setData({
            examTimerText: formatSec(this.examSecondsLeft),
            examUrgent: this.examSecondsLeft <= 180
          });
          if (this.examSecondsLeft <= 0) {
            this.stopTimer();
            wx.showToast({ title: '时间到，自动交卷', icon: 'none' });
            this.finishExam();
          }
        }, 1000);
      } else {
        this.setData({ examTimerText: '不限时', examUrgent: false });
      }
    }

    this.setData({ loading: false, total: this.list.length });
    this.goTo(start);
  },

  buildList(questions) {
    const { mode } = this;

    if (this.customIds && this.customIds.length) {
      return this.customIds.filter((id) => this.map[id]);
    }
    if (mode === 'wrong') {
      return store.getWrongIds().filter((id) => this.map[id]);
    }
    if (mode === 'favorite') {
      return store.getFavoriteIds().filter((id) => this.map[id]);
    }
    if (mode === 'notes') {
      return store.getNoteIds().filter((id) => this.map[id]);
    }
    if (mode === 'exam' || mode === 'paper_practice') {
      const singleCount = parseInt(this.options.singleCount || '25', 10);
      const multiCount = parseInt(this.options.multiCount || '5', 10);
      const chapters = this.options.chapters ? decodeURIComponent(this.options.chapters).split(',').filter(Boolean) : [];
      const strategy = this.options.strategy || 'random';
      const { list } = Engine.generatePaper(questions, {
        level: this.level,
        chapters,
        singleCount,
        multiCount,
        strategy,
        answeredMap: store.answered,
        wrongMap: store.wrongBook
      });
      return list.map((q) => q.id);
    }

    let pool = Engine.filterQuestions(questions, {
      level: this.level,
      qtype: this.qtype,
      syllabusPrefix: this.syllabusPrefix
    });
    if (mode === 'random') pool = Engine.shuffle(pool);
    return pool.map((q) => q.id);
  },

  resolveQuestion(id) {
    const raw = this.map[id];
    if (!store.settings.shuffleOptions) return raw;
    if (!this.shuffled[id]) this.shuffled[id] = Engine.shuffleOptions(raw);
    return this.shuffled[id];
  },

  decorate(q, selectedStr, mode, elimMap) {
    const selected = String(selectedStr || '').split('');
    const answer = String(q.answer || '').split('');
    const elim = elimMap || {};
    return Object.keys(q.options).sort().map((key) => {
      let state = '';
      if (mode === 'graded') {
        if (answer.indexOf(key) >= 0) state = 'correct';
        else if (selected.indexOf(key) >= 0) state = 'wrong';
      } else if (mode === 'picked') {
        if (selected.indexOf(key) >= 0) state = 'picked';
        else if (elim[key]) state = 'eliminated';
      } else if (mode === 'answer') {
        if (answer.indexOf(key) >= 0) state = 'correct';
      } else if (elim[key]) {
        state = 'eliminated';
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

    const isExam = this.mode === 'exam';
    const isMemorize = this.mode === 'memorize';
    const session = this.sessionResults[id];
    const elimMap = this.eliminated[id] || {};

    let submitted = false;
    let isCorrect = false;
    let selectedText = '';
    let answerText = '';
    let options = [];

    if (isExam) {
      const picked = this.examDraft[id] || '';
      options = this.decorate(q, picked, picked ? 'picked' : '', elimMap);
    } else if (isMemorize) {
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
      options = this.decorate(q, '', '', elimMap);
    }

    const noteText = store.getNote(q.id);
    const explanation = (this._explanations && this._explanations[q.id]) || null;

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
      isExam,
      options,
      submitted,
      isCorrect,
      selectedText,
      answerText,
      canSubmitMulti: false,
      noteText,
      explanation,
      isFavorite: store.isFavorite(q.id),
      isWrong: store.isWrong(q.id),
      scrollTop: 0,
      progressPercent: Math.round(((index + 1) / this.list.length) * 100) + '%'
    });

    if (this.mode === 'seq' && !this.syllabusPrefix && this.qtype === 'all' && !this.customIds) {
      store.saveSessionCursor('seq_' + this.level, index);
    }
  },

  onOptionLongPress(e) {
    if (this.data.isMemorize || this.data.submitted) return;
    const key = e.currentTarget.dataset.key;
    const q = this.currentQ;
    if (!q) return;

    if (!this.eliminated[q.id]) this.eliminated[q.id] = {};
    const elimMap = this.eliminated[q.id];
    const nextElim = !elimMap[key];
    if (nextElim) elimMap[key] = true;
    else delete elimMap[key];

    if (this.mode === 'exam') {
      if (nextElim && this.examDraft[q.id] && this.examDraft[q.id].indexOf(key) >= 0) {
        this.examDraft[q.id] = this.examDraft[q.id].split('').filter((k) => k !== key).join('');
      }
      const picked = this.examDraft[q.id] || '';
      this.setData({ options: this.decorate(q, picked, picked ? 'picked' : '', elimMap) });
      return;
    }

    if (nextElim && q.type === 'multi') {
      const pos = this.selected.indexOf(key);
      if (pos >= 0) this.selected.splice(pos, 1);
    }
    const selStr = this.selected.join('');
    this.setData({
      options: this.decorate(q, selStr, selStr ? 'picked' : '', elimMap),
      canSubmitMulti: this.selected.length > 0
    });
    try { wx.vibrateShort({ type: 'light' }); } catch (err) {}
    wx.showToast({ title: nextElim ? `已排除 ${key}` : `已恢复 ${key}`, icon: 'none', duration: 900 });
  },

  onOptionTap(e) {
    if (this.data.isMemorize) return;
    const key = e.currentTarget.dataset.key;
    const q = this.currentQ;
    const elimMap = this.eliminated[q.id] || {};

    if (!this.data.submitted && elimMap[key]) {
      wx.showToast({ title: '已排除该选项，长按可恢复', icon: 'none' });
      return;
    }

    if (this.mode === 'exam') {
      if (q.type === 'single') {
        this.examDraft[q.id] = key;
      } else {
        const cur = (this.examDraft[q.id] || '').split('').filter(Boolean);
        const pos = cur.indexOf(key);
        if (pos >= 0) cur.splice(pos, 1);
        else cur.push(key);
        this.examDraft[q.id] = cur.sort().join('');
      }
      const picked = this.examDraft[q.id] || '';
      this.setData({ options: this.decorate(q, picked, picked ? 'picked' : '', elimMap) });
      return;
    }

    if (this.data.submitted) return;

    if (q.type === 'multi') {
      const sel = this.selected.slice();
      const pos = sel.indexOf(key);
      if (pos >= 0) sel.splice(pos, 1);
      else sel.push(key);
      this.selected = sel;

      this.setData({
        options: this.decorate(q, sel.join(''), 'picked', elimMap),
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

  onConfirmSubmitExam() {
    const answeredCount = this.list.filter((id) => Boolean(this.examDraft[id])).length;
    const todo = this.list.length - answeredCount;
    wx.showModal({
      title: '确认交卷',
      content: todo > 0 ? `还有 ${todo} 道题未作答，确定交卷吗？` : '所有题目已作答，确定交卷并查看成绩吗？',
      success: (res) => {
        if (res.confirm) this.finishExam();
      }
    });
  },

  finishExam() {
    this.stopTimer();
    this.saveNote(false);
    let score = 0;
    const wrongIds = [];

    this.list.forEach((id) => {
      const q = this.resolveQuestion(id);
      const picked = this.examDraft[id] || '';
      const res = Engine.grade(q, picked);
      this.sessionResults[id] = res;
      store.recordAttempt(id, res.selected, res.isCorrect);
      if (res.isCorrect) score += 1;
      else wrongIds.push(id);
    });

    const elapsedSec = Math.max(1, Math.round((Date.now() - (this.examStartedAt || Date.now())) / 1000));
    const passed = score >= (this.examPassScore || 0);

    const items = this.list.map((id) => {
      const q = this.resolveQuestion(id);
      const res = this.sessionResults[id] || {};
      return {
        id,
        selected: this.examDraft[id] || '',
        answer: q.answer,
        isCorrect: Boolean(res.isCorrect),
        options: q.options
      };
    });

    store.addExamRecord({
      id: Date.now(),
      title: this.data.title,
      score,
      total: this.list.length,
      passScore: this.examPassScore || 0,
      passed,
      durationSec: elapsedSec,
      createdAt: Date.now(),
      items
    });

    this._examWrongIds = wrongIds;
    this.setData({
      showResult: true,
      resultPassed: passed,
      resultScore: score,
      resultTotal: this.list.length,
      resultWrongCount: wrongIds.length,
      resultSub: `及格线 ${this.examPassScore} 题 · 用时 ${formatSec(elapsedSec)} · 错题 ${wrongIds.length} 道`
    });
  },

  onReviewWrong() {
    if (!this._examWrongIds || !this._examWrongIds.length) return;
    this.mode = 'seq';
    this.list = this._examWrongIds.slice();
    this.setData({ showResult: false, isExam: false, total: this.list.length });
    this.goTo(0);
  },

  onReviewAll() {
    this.mode = 'seq';
    this.setData({ showResult: false, isExam: false });
    this.goTo(0);
  },

  onResultClose() {
    this.setData({ showResult: false });
    wx.navigateBack({ delta: 1 });
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
      if (this.mode === 'exam') {
        this.onConfirmSubmitExam();
      } else {
        wx.showToast({ title: '本组题目已完成', icon: 'none' });
      }
      return;
    }
    this.saveNote(false);
    this.goTo(this.data.index + 1);
  },

  onSwitchMode(e) {
    if (this.mode === 'exam') return;
    const target = e.currentTarget.dataset.mode;
    if (!target || target === (this.mode === 'memorize' ? 'memorize' : 'practice')) return;
    if (target === 'memorize') {
      this._prevMode = this.mode === 'memorize' ? 'seq' : this.mode;
      this.mode = 'memorize';
    } else {
      this.mode = this._prevMode || 'seq';
    }
    this.goTo(this.data.index);
  },

  onOpenSheet() {
    const sheetItems = this.list.map((id, idx) => {
      let cls = '';
      if (idx === this.data.index) cls = 'current';
      else if (this.mode === 'exam') {
        if (this.examDraft[id]) cls = 'answered';
      } else {
        const res = this.sessionResults[id];
        if (res) cls = res.isCorrect ? 'correct' : 'wrong';
      }
      return { idx, num: idx + 1, cls };
    });
    this.setData({ showSheet: true, sheetItems });
  },

  onCloseSheet() {
    this.setData({ showSheet: false });
  },

  onJumpTo(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    this.saveNote(false);
    this.setData({ showSheet: false });
    this.goTo(idx);
  },

  onTouchStart(e) {
    if (!e.touches || !e.touches.length) return;
    this._touchX = e.touches[0].clientX;
    this._touchY = e.touches[0].clientY;
  },

  onTouchEnd(e) {
    if (this._touchX === undefined || !e.changedTouches || !e.changedTouches.length) return;
    const dx = e.changedTouches[0].clientX - this._touchX;
    const dy = e.changedTouches[0].clientY - this._touchY;
    this._touchX = undefined;
    if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      if (dx < 0) this.onNext();
      else this.onPrev();
    }
  },

  noop() {},

  onExit() {
    this.stopTimer();
    this.saveNote(false);
    wx.navigateBack({ delta: 1 });
  }
});
