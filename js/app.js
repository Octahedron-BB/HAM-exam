/**
 * CQ · Amateur Radio Exam Prep — UI Controller
 */

(function () {
  'use strict';

  const Store = window.HamStorage;
  const Engine = window.HamEngine;

  const state = {
    questions: [],
    questionMap: {},
    syllabus: null,
    activeTab: 'practice',
    syllabusLevel: Store.settings.level || 'A',
    libSubTab: 'wrong',

    // Active quiz session
    session: {
      active: false,
      key: '',
      title: '',
      mode: 'practice', // 'practice' | 'memorize'
      list: [],
      cursor: 0,
      results: {},      // { [qid]: { selected, isCorrect } } in current session
      multiDraft: new Set()
    }
  };

  // --- DOM Helpers ---
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  function showToast(msg, ms = 2000) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => el.classList.add('hidden'), ms);
  }

  function showConfirm(title, message) {
    return new Promise((resolve) => {
      $('#confirm-title').textContent = title;
      $('#confirm-message').textContent = message;
      $('#confirm-modal').classList.remove('hidden');

      const cleanup = (val) => {
        $('#confirm-modal').classList.add('hidden');
        $('#confirm-ok-btn').onclick = null;
        $('#confirm-cancel-btn').onclick = null;
        resolve(val);
      };

      $('#confirm-ok-btn').onclick = () => cleanup(true);
      $('#confirm-cancel-btn').onclick = () => cleanup(false);
    });
  }

  function applyTheme() {
    document.documentElement.classList.toggle('dark', Boolean(Store.settings.darkMode));
    const chk = $('#setting-dark-mode');
    if (chk) chk.checked = Boolean(Store.settings.darkMode);
  }

  // --- Initialization ---
  async function init() {
    applyTheme();
    try {
      const [qRes, sRes] = await Promise.all([
        fetch('data/questions.json'),
        fetch('data/syllabus.json')
      ]);
      if (!qRes.ok || !sRes.ok) throw new Error('题库加载失败');
      state.questions = await qRes.json();
      state.syllabus = await sRes.json();
      state.questions.forEach((q) => {
        state.questionMap[q.id] = q;
      });
    } catch (err) {
      showToast('题库数据加载失败，请刷新重试', 4000);
      console.error(err);
      return;
    }

    bindNavigation();
    bindPracticeHub();
    bindSyllabusTab();
    bindLibraryTab();
    bindSettingsTab();
    bindQuizView();
    bindKeyboardShortcuts();

    syncPracticeUI();
    renderSyllabus();
    renderLibrary();
    renderStats();
  }

  // --- Navigation ---
  function switchTab(tabName) {
    state.activeTab = tabName;
    $$('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === `tab-${tabName}`));
    $$('.nav-btn, .tabbar-item').forEach((b) => {
      b.classList.toggle('active', b.dataset.tab === tabName);
    });

    if (tabName === 'practice') syncPracticeUI();
    if (tabName === 'syllabus') renderSyllabus();
    if (tabName === 'library') renderLibrary();
    if (tabName === 'settings') renderStats();
  }

  function bindNavigation() {
    $$('.nav-btn, .tabbar-item').forEach((btn) => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
    $('#theme-toggle-btn').addEventListener('click', () => {
      Store.saveSettings({ darkMode: !Store.settings.darkMode });
      applyTheme();
    });
  }

  // --- TAB 1: Practice Hub ---
  function getCurrentSessionKey() {
    const { level, order, qtype } = Store.settings;
    return `main_${level}_${order}_${qtype}`;
  }

  function syncPracticeUI() {
    const { level, order, qtype } = Store.settings;

    $$('#level-selector .level-card').forEach((card) => {
      card.classList.toggle('active', card.dataset.level === level);
    });
    $$('#order-selector .seg-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.order === order);
    });
    $$('#qtype-selector .seg-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.qtype === qtype);
    });

    // Update level progress bars
    ['A', 'B', 'C', 'ALL'].forEach((lv) => {
      const qs = Engine.filterQuestions(state.questions, { level: lv });
      const done = qs.filter((q) => Store.answered[q.id]).length;
      const pct = qs.length ? Math.round((done / qs.length) * 100) : 0;
      const bar = $(`[data-level-bar="${lv}"]`);
      if (bar) bar.style.width = `${pct}%`;
    });

    const filtered = Engine.filterQuestions(state.questions, { level, qtype });
    const levelLabel = level === 'ALL' ? '总题库' : `${level}类`;
    $('#current-level-pill').textContent = `${levelLabel} · ${filtered.length}题`;

    const key = getCurrentSessionKey();
    const cursor = Store.getSessionCursor(key);
    if (order === 'seq' && cursor > 0 && cursor < filtered.length) {
      $('#resume-hint-text').textContent = `当前筛选共 ${filtered.length} 题 · 上次刷到第 ${cursor + 1} 题`;
    } else {
      $('#resume-hint-text').textContent = `当前筛选共 ${filtered.length} 题`;
    }
  }

  function bindPracticeHub() {
    $('#level-selector').addEventListener('click', (e) => {
      const card = e.target.closest('.level-card');
      if (!card) return;
      Store.saveSettings({ level: card.dataset.level });
      syncPracticeUI();
    });

    $('#order-selector').addEventListener('click', (e) => {
      const btn = e.target.closest('.seg-btn');
      if (!btn) return;
      Store.saveSettings({ order: btn.dataset.order });
      syncPracticeUI();
    });

    $('#qtype-selector').addEventListener('click', (e) => {
      const btn = e.target.closest('.seg-btn');
      if (!btn) return;
      Store.saveSettings({ qtype: btn.dataset.qtype });
      syncPracticeUI();
    });

    const launchMain = (mode) => {
      const { level, order, qtype } = Store.settings;
      let list = Engine.filterQuestions(state.questions, { level, qtype });
      if (!list.length) {
        showToast('当前筛选条件下没有题目');
        return;
      }
      const key = getCurrentSessionKey();
      let startIdx = 0;
      if (order === 'random') {
        list = Engine.shuffle(list);
      } else {
        const saved = Store.getSessionCursor(key);
        if (saved > 0 && saved < list.length) startIdx = saved;
      }

      const levelLabel = level === 'ALL' ? '总题库' : `${level}类`;
      const orderLabel = order === 'random' ? '随机' : '顺序';
      const typeLabel = qtype === 'single' ? '单选' : qtype === 'multi' ? '多选' : '';
      const title = `${levelLabel} · ${orderLabel}${typeLabel}`;
      startSession({ key: order === 'seq' ? key : '', title, mode, list, startIdx });
    };

    $('#start-quiz-btn').addEventListener('click', () => launchMain('practice'));
    $('#start-memorize-btn').addEventListener('click', () => launchMain('memorize'));

    // Quick search
    const runSearch = () => {
      const kw = $('#quick-search-input').value.trim();
      const box = $('#quick-search-results');
      if (!kw) {
        box.classList.add('hidden');
        box.innerHTML = '';
        return;
      }
      const matches = Engine.filterQuestions(state.questions, { keyword: kw }).slice(0, 30);
      box.classList.remove('hidden');
      if (!matches.length) {
        box.innerHTML = '<div class="empty-state">未找到匹配的题目</div>';
        return;
      }
      box.innerHTML = matches.map((q) => `
        <div class="search-item" data-qid="${q.id}">
          <div class="search-item-meta">
            <span class="badge badge-type ${q.type === 'multi' ? 'multi' : ''}">${q.type === 'multi' ? '多选' : '单选'}</span>
            <span class="mono-id">${q.id}</span>
            <span class="mono-id">[${q.p}]</span>
            <span class="mono-id">${q.levels.join('/')}</span>
          </div>
          <div class="search-item-q">${escapeHtml(q.q)}</div>
        </div>
      `).join('');
    };

    $('#quick-search-btn').addEventListener('click', runSearch);
    $('#quick-search-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') runSearch();
    });
    $('#quick-search-results').addEventListener('click', (e) => {
      const item = e.target.closest('.search-item');
      if (!item) return;
      const q = state.questionMap[item.dataset.qid];
      if (!q) return;
      startSession({
        key: '',
        title: `搜索结果 · ${q.id}`,
        mode: 'practice',
        list: [q],
        startIdx: 0
      });
    });
  }

  // --- TAB 2: Syllabus Tree ---
  function bindSyllabusTab() {
    $('#syllabus-level-filter').addEventListener('click', (e) => {
      const btn = e.target.closest('.seg-btn');
      if (!btn) return;
      state.syllabusLevel = btn.dataset.slevel;
      $$('#syllabus-level-filter .seg-btn').forEach((b) => {
        b.classList.toggle('active', b.dataset.slevel === state.syllabusLevel);
      });
      renderSyllabus();
    });
  }

  function renderSyllabus() {
    if (!state.syllabus) return;
    $$('#syllabus-level-filter .seg-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.slevel === state.syllabusLevel);
    });

    const tree = Engine.buildSyllabusStats(
      state.questions,
      state.syllabus,
      Store.answered,
      state.syllabusLevel
    );

    const container = $('#syllabus-tree');
    container.innerHTML = tree.map((ch, idx) => `
      <div class="chapter-box ${idx === 0 ? 'open' : ''}" data-chapter="${ch.id}">
        <div class="chapter-header">
          <div class="chapter-title-wrap">
            <div class="chapter-title">
              <span>第${ch.id}章 · ${escapeHtml(ch.title)}</span>
              <span class="mono-pill">${ch.done}/${ch.total}</span>
            </div>
            <div class="chapter-desc">${escapeHtml(ch.desc)}</div>
          </div>
          <div class="chapter-actions">
            <button class="btn btn-sm btn-primary syllabus-go" data-prefix="${ch.id}" data-title="第${ch.id}章 ${escapeHtml(ch.title)}" data-mode="practice">刷整章</button>
          </div>
        </div>
        <div class="section-list">
          ${ch.sections.map((sec) => `
            <div class="section-item">
              <div class="section-row-top">
                <div>
                  <span class="section-code">${sec.code}</span>
                  <span class="section-name">${escapeHtml(sec.title)}</span>
                  <span class="mono-id" style="margin-left:6px;">(${sec.done}/${sec.total})</span>
                </div>
                <div class="section-btns">
                  <button class="btn btn-sm btn-secondary syllabus-go" data-prefix="${sec.code}" data-title="${sec.code} ${escapeHtml(sec.title)}" data-mode="memorize">背题</button>
                  <button class="btn btn-sm btn-primary syllabus-go" data-prefix="${sec.code}" data-title="${sec.code} ${escapeHtml(sec.title)}" data-mode="practice">刷题</button>
                </div>
              </div>
              <div class="subpoint-chips">
                ${sec.subPoints.map((sp) => `
                  <button class="sub-chip syllabus-go" data-prefix="${sp.code}" data-title="考点 ${sp.code}" data-mode="practice">
                    ${sp.code} (${sp.done}/${sp.total})
                  </button>
                `).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.chapter-header').forEach((hdr) => {
      hdr.addEventListener('click', (e) => {
        if (e.target.closest('.syllabus-go')) return;
        hdr.closest('.chapter-box').classList.toggle('open');
      });
    });

    container.querySelectorAll('.syllabus-go').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const prefix = btn.dataset.prefix;
        const mode = btn.dataset.mode;
        const list = Engine.filterQuestions(state.questions, {
          level: state.syllabusLevel,
          syllabusPrefix: prefix
        });
        if (!list.length) {
          showToast('该考点下暂无题目');
          return;
        }
        const levelLabel = state.syllabusLevel === 'ALL' ? '总题库' : `${state.syllabusLevel}类`;
        startSession({
          key: `syl_${state.syllabusLevel}_${prefix}`,
          title: `${levelLabel} · ${btn.dataset.title}`,
          mode,
          list,
          startIdx: 0
        });
      });
    });
  }

  // --- TAB 3: Library (Wrong / Favorites / Notes) ---
  function bindLibraryTab() {
    $('#library-subtabs').addEventListener('click', (e) => {
      const btn = e.target.closest('.seg-btn');
      if (!btn) return;
      state.libSubTab = btn.dataset.lib;
      $$('#library-subtabs .seg-btn').forEach((b) => {
        b.classList.toggle('active', b.dataset.lib === state.libSubTab);
      });
      renderLibrary();
    });
  }

  function renderLibrary() {
    const wrongIds = Store.getWrongIds();
    const favIds = Store.getFavoriteIds();
    const noteIds = Store.getNoteIds();

    $('#lib-wrong-count').textContent = wrongIds.length;
    $('#lib-fav-count').textContent = favIds.length;
    $('#lib-note-count').textContent = noteIds.length;

    const actionsEl = $('#library-actions');
    const listEl = $('#library-list');

    if (state.libSubTab === 'wrong') {
      const qs = wrongIds.map((id) => state.questionMap[id]).filter(Boolean);
      actionsEl.innerHTML = qs.length ? `
        <button class="btn btn-sm btn-primary" id="lib-practice-wrong">刷错题 (${qs.length})</button>
        <button class="btn btn-sm btn-secondary" id="lib-memorize-wrong">背题复习</button>
        <button class="btn btn-sm btn-danger-outline" id="lib-clear-wrong">清空错题</button>
      ` : '';

      if (!qs.length) {
        listEl.innerHTML = '<div class="empty-state">暂无错题，继续保持！</div>';
        return;
      }

      listEl.innerHTML = qs.map((q) => {
        const info = Store.wrongBook[q.id] || {};
        return `
          <div class="lib-item">
            <div class="lib-item-main" data-open-qid="${q.id}">
              <div class="lib-item-meta">
                <span class="badge badge-type ${q.type === 'multi' ? 'multi' : ''}">${q.type === 'multi' ? '多选' : '单选'}</span>
                <span class="mono-id">${q.id}</span>
                <span class="badge" style="background:var(--danger-soft);color:var(--danger);">错 ${info.count || 1} 次</span>
                <span class="mono-id">[${q.p}]</span>
              </div>
              <div class="lib-item-q">${escapeHtml(q.q)}</div>
            </div>
            <button class="btn btn-sm btn-ghost" data-remove-wrong="${q.id}" title="移出错题集">移出</button>
          </div>
        `;
      }).join('');

      $('#lib-practice-wrong').onclick = () => startSession({ key: '', title: '错题集重练', mode: 'practice', list: qs, startIdx: 0 });
      $('#lib-memorize-wrong').onclick = () => startSession({ key: '', title: '错题集背题', mode: 'memorize', list: qs, startIdx: 0 });
      $('#lib-clear-wrong').onclick = async () => {
        if (await showConfirm('清空错题集', '确定要清空所有错题记录吗？')) {
          Store.clearWrongBook();
          renderLibrary();
          showToast('已清空错题集');
        }
      };
    } else if (state.libSubTab === 'fav') {
      const qs = favIds.map((id) => state.questionMap[id]).filter(Boolean);
      actionsEl.innerHTML = qs.length ? `
        <button class="btn btn-sm btn-primary" id="lib-practice-fav">刷收藏题 (${qs.length})</button>
        <button class="btn btn-sm btn-secondary" id="lib-memorize-fav">背题复习</button>
      ` : '';

      if (!qs.length) {
        listEl.innerHTML = '<div class="empty-state">还没有收藏任何题目，刷题时点击右上角星标即可收藏</div>';
        return;
      }

      listEl.innerHTML = qs.map((q) => `
        <div class="lib-item">
          <div class="lib-item-main" data-open-qid="${q.id}">
            <div class="lib-item-meta">
              <span class="badge badge-type ${q.type === 'multi' ? 'multi' : ''}">${q.type === 'multi' ? '多选' : '单选'}</span>
              <span class="mono-id">${q.id}</span>
              <span class="mono-id">[${q.p}]</span>
              <span class="mono-id">${q.levels.join('/')}</span>
            </div>
            <div class="lib-item-q">${escapeHtml(q.q)}</div>
          </div>
          <button class="btn btn-sm btn-ghost" data-remove-fav="${q.id}">取消收藏</button>
        </div>
      `).join('');

      $('#lib-practice-fav').onclick = () => startSession({ key: '', title: '收藏集刷题', mode: 'practice', list: qs, startIdx: 0 });
      $('#lib-memorize-fav').onclick = () => startSession({ key: '', title: '收藏集背题', mode: 'memorize', list: qs, startIdx: 0 });
    } else {
      const qs = noteIds.map((id) => state.questionMap[id]).filter(Boolean);
      actionsEl.innerHTML = qs.length ? `
        <button class="btn btn-sm btn-primary" id="lib-memorize-notes">浏览笔记题目 (${qs.length})</button>
      ` : '';

      if (!qs.length) {
        listEl.innerHTML = '<div class="empty-state">还没有记过笔记，刷题时可在题目下方随时写笔记</div>';
        return;
      }

      listEl.innerHTML = qs.map((q) => `
        <div class="lib-item">
          <div class="lib-item-main" data-open-qid="${q.id}">
            <div class="lib-item-meta">
              <span class="mono-id">${q.id}</span>
              <span class="mono-id">[${q.p}]</span>
            </div>
            <div class="lib-item-q">${escapeHtml(q.q)}</div>
            <div class="lib-note-preview">${escapeHtml(Store.getNote(q.id))}</div>
          </div>
        </div>
      `).join('');

      $('#lib-memorize-notes').onclick = () => startSession({ key: '', title: '笔记题目复习', mode: 'memorize', list: qs, startIdx: 0 });
    }

    // Bind item clicks
    listEl.querySelectorAll('[data-open-qid]').forEach((el) => {
      el.addEventListener('click', () => {
        const qid = el.dataset.openQid;
        const pool = (state.libSubTab === 'wrong' ? wrongIds : state.libSubTab === 'fav' ? favIds : noteIds)
          .map((id) => state.questionMap[id]).filter(Boolean);
        const idx = Math.max(0, pool.findIndex((q) => q.id === qid));
        startSession({
          key: '',
          title: state.libSubTab === 'wrong' ? '错题集' : state.libSubTab === 'fav' ? '收藏集' : '我的笔记',
          mode: state.libSubTab === 'notes' ? 'memorize' : 'practice',
          list: pool,
          startIdx: idx
        });
      });
    });

    listEl.querySelectorAll('[data-remove-wrong]').forEach((btn) => {
      btn.addEventListener('click', () => {
        Store.removeWrong(btn.dataset.removeWrong);
        renderLibrary();
      });
    });

    listEl.querySelectorAll('[data-remove-fav]').forEach((btn) => {
      btn.addEventListener('click', () => {
        Store.toggleFavorite(btn.dataset.removeFav);
        renderLibrary();
      });
    });
  }

  // --- TAB 4: Stats & Settings ---
  function renderStats() {
    const answeredEntries = Object.values(Store.answered);
    const totalDone = answeredEntries.length;
    const totalCorrect = answeredEntries.filter((x) => x.correct).length;
    const acc = totalDone ? Math.round((totalCorrect / totalDone) * 100) : 0;

    $('#stat-total-done').textContent = totalDone;
    $('#stat-accuracy').textContent = `${acc}%`;
    $('#stat-wrong').textContent = Store.getWrongIds().length;
    $('#stat-fav').textContent = Store.getFavoriteIds().length;

    $('#setting-auto-remove-wrong').checked = Boolean(Store.settings.autoRemoveWrong);
    $('#setting-dark-mode').checked = Boolean(Store.settings.darkMode);
  }

  function bindSettingsTab() {
    $('#setting-auto-remove-wrong').addEventListener('change', (e) => {
      Store.saveSettings({ autoRemoveWrong: e.target.checked });
    });

    $('#setting-dark-mode').addEventListener('change', (e) => {
      Store.saveSettings({ darkMode: e.target.checked });
      applyTheme();
    });

    $('#export-data-btn').addEventListener('click', () => {
      const json = Store.exportAll();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ham-radio-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('已导出学习记录');
    });

    $('#import-data-input').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          Store.importAll(reader.result);
          applyTheme();
          syncPracticeUI();
          renderStats();
          renderLibrary();
          showToast('学习记录导入成功');
        } catch (err) {
          showToast('导入失败：文件格式无效');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });

    $('#reset-progress-btn').addEventListener('click', async () => {
      if (await showConfirm('重置刷题进度', '将清除已刷题数与顺序断点记录（错题、收藏与笔记会保留）。确定吗？')) {
        Store.resetProgress();
        syncPracticeUI();
        renderStats();
        showToast('已重置刷题进度');
      }
    });
  }

  // --- QUIZ / MEMORIZE VIEW ---
  function startSession({ key, title, mode, list, startIdx = 0 }) {
    state.session = {
      active: true,
      key,
      title,
      mode,
      list,
      cursor: Math.min(Math.max(0, startIdx), list.length - 1),
      results: {},
      multiDraft: new Set()
    };

    $('#quiz-view').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    renderQuestion();
  }

  function closeSession() {
    saveCurrentNoteQuietly();
    state.session.active = false;
    $('#quiz-view').classList.add('hidden');
    document.body.style.overflow = '';
    syncPracticeUI();
    renderLibrary();
    renderSyllabus();
    renderStats();
  }

  function getCurrentQuestion() {
    return state.session.list[state.session.cursor];
  }

  function saveCurrentNoteQuietly() {
    const q = getCurrentQuestion();
    if (!q) return;
    const input = $('#q-note-input');
    if (input) {
      Store.saveNote(q.id, input.value);
    }
  }

  function renderQuestion() {
    const s = state.session;
    const q = getCurrentQuestion();
    if (!q) return;

    if (s.key) {
      Store.saveSessionCursor(s.key, s.cursor);
    }

    // Header
    $('#quiz-session-title').textContent = s.title;
    $('#quiz-counter').textContent = `${s.cursor + 1} / ${s.list.length}`;
    const pct = Math.round(((s.cursor + 1) / s.list.length) * 100);
    $('#quiz-progress-fill').style.width = `${pct}%`;

    $$('#quiz-mode-toggle .mode-pill-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.qmode === s.mode);
    });

    // Badges
    const typeBadge = $('#q-type-badge');
    typeBadge.textContent = q.type === 'multi' ? '多选题' : '单选题';
    typeBadge.classList.toggle('multi', q.type === 'multi');

    $('#q-levels-badge').textContent = q.levels.join(' ');
    $('#q-syllabus-badge').textContent = q.p;
    $('#q-id-badge').textContent = q.id;

    // Favorite
    $('#q-fav-btn').classList.toggle('active', Store.isFavorite(q.id));

    // Stem
    $('#q-stem').textContent = q.q;

    // Figure
    const figBox = $('#q-figure-box');
    if (q.figure) {
      figBox.classList.remove('hidden');
      figBox.innerHTML = `
        <img src="assets/figures/${escapeHtml(q.figure)}" alt="附图 ${escapeHtml(q.figure)}"
             onerror="this.style.display='none'; this.nextElementSibling.style.display='block';" />
        <div style="display:none;">
          附图标记：<code>${escapeHtml(q.figure)}</code>（原题库 PDF 未内嵌图像，可对照官方附图或将图片放入 <code>assets/figures/</code>）
        </div>
      `;
    } else {
      figBox.classList.add('hidden');
      figBox.innerHTML = '';
    }

    // Options
    const prevResult = s.results[q.id];
    const isMemorize = s.mode === 'memorize';
    const isGraded = Boolean(prevResult);
    const ansSet = new Set(q.answer.split(''));

    if (!isGraded) {
      s.multiDraft = new Set();
    }

    const optContainer = $('#q-options');
    const keys = ['A', 'B', 'C', 'D'].filter((k) => q.options[k] !== undefined);

    optContainer.innerHTML = keys.map((k) => {
      let cls = 'option-btn';
      if (isMemorize) {
        if (ansSet.has(k)) cls += ' correct';
      } else if (isGraded) {
        const userPicked = prevResult.selected.includes(k);
        if (ansSet.has(k)) cls += ' correct';
        else if (userPicked && !ansSet.has(k)) cls += ' wrong';
      } else if (q.type === 'multi' && s.multiDraft.has(k)) {
        cls += ' selected';
      }

      return `
        <button class="${cls}" data-opt="${k}" ${isMemorize || isGraded ? 'disabled' : ''}>
          <span class="option-key">${k}</span>
          <span>${escapeHtml(q.options[k])}</span>
        </button>
      `;
    }).join('');

    // Multi submit button
    const multiWrap = $('#q-multi-submit-wrap');
    if (q.type === 'multi' && !isMemorize && !isGraded) {
      multiWrap.classList.remove('hidden');
    } else {
      multiWrap.classList.add('hidden');
    }

    // Feedback banner
    const fb = $('#q-feedback');
    if (isMemorize) {
      fb.className = 'q-feedback is-memorize';
      fb.innerHTML = `<span>背题模式 · 正确答案：<strong class="mono-text">${q.answer}</strong></span>`;
    } else if (isGraded) {
      if (prevResult.isCorrect) {
        fb.className = 'q-feedback is-correct';
        fb.innerHTML = `<span>回答正确！</span><span class="mono-text">答案：${q.answer}</span>`;
      } else {
        fb.className = 'q-feedback is-wrong';
        fb.innerHTML = `<span>回答错误（你选了 ${prevResult.selected}）· 已加入错题集</span><span class="mono-text">正确答案：${q.answer}</span>`;
      }
    } else {
      fb.className = 'q-feedback hidden';
      fb.innerHTML = '';
    }

    // Note
    $('#q-note-input').value = Store.getNote(q.id);
    $('#note-saved-badge').classList.add('hidden');

    // Prev / Next buttons
    $('#quiz-prev-btn').disabled = s.cursor === 0;
    $('#quiz-next-btn').textContent = s.cursor === s.list.length - 1 ? '完成' : '下一题';
  }

  function submitChoice(selectedStr) {
    const q = getCurrentQuestion();
    if (!q || state.session.mode === 'memorize' || state.session.results[q.id]) return;

    const result = Engine.grade(q, selectedStr);
    state.session.results[q.id] = result;
    Store.recordAttempt(q.id, result.selected, result.isCorrect);
    renderQuestion();
  }

  function bindQuizView() {
    $('#quiz-back-btn').addEventListener('click', closeSession);

    $('#quiz-mode-toggle').addEventListener('click', (e) => {
      const btn = e.target.closest('.mode-pill-btn');
      if (!btn) return;
      state.session.mode = btn.dataset.qmode;
      renderQuestion();
    });

    $('#q-fav-btn').addEventListener('click', () => {
      const q = getCurrentQuestion();
      if (!q) return;
      const on = Store.toggleFavorite(q.id);
      $('#q-fav-btn').classList.toggle('active', on);
      showToast(on ? '已加入收藏集' : '已取消收藏');
    });

    $('#q-options').addEventListener('click', (e) => {
      const btn = e.target.closest('.option-btn');
      if (!btn || btn.disabled) return;
      const opt = btn.dataset.opt;
      const q = getCurrentQuestion();
      if (!q) return;

      if (q.type === 'single') {
        submitChoice(opt);
      } else {
        if (state.session.multiDraft.has(opt)) {
          state.session.multiDraft.delete(opt);
          btn.classList.remove('selected');
        } else {
          state.session.multiDraft.add(opt);
          btn.classList.add('selected');
        }
      }
    });

    $('#q-multi-submit-btn').addEventListener('click', () => {
      const picked = Array.from(state.session.multiDraft).join('');
      if (!picked) {
        showToast('请至少选择一个选项');
        return;
      }
      submitChoice(picked);
    });

    // Notes
    const saveNoteNow = (showMsg = false) => {
      const q = getCurrentQuestion();
      if (!q) return;
      Store.saveNote(q.id, $('#q-note-input').value);
      $('#note-saved-badge').classList.remove('hidden');
      if (showMsg) showToast('笔记已保存');
    };

    $('#note-save-btn').addEventListener('click', () => saveNoteNow(true));
    $('#q-note-input').addEventListener('blur', () => saveNoteNow(false));

    // Navigation
    $('#quiz-prev-btn').addEventListener('click', () => {
      if (state.session.cursor > 0) {
        saveCurrentNoteQuietly();
        state.session.cursor -= 1;
        renderQuestion();
      }
    });

    $('#quiz-next-btn').addEventListener('click', () => {
      saveCurrentNoteQuietly();
      if (state.session.cursor < state.session.list.length - 1) {
        state.session.cursor += 1;
        renderQuestion();
      } else {
        showToast('本组题目已全部浏览完成！');
        closeSession();
      }
    });

    // Question Sheet Modal
    $('#quiz-sheet-btn').addEventListener('click', () => {
      const s = state.session;
      const grid = $('#sheet-grid');
      grid.innerHTML = s.list.map((q, idx) => {
        const res = s.results[q.id];
        let cls = 'sheet-num';
        if (idx === s.cursor) cls += ' current';
        if (res) cls += res.isCorrect ? ' correct' : ' wrong';
        return `<button class="${cls}" data-jump="${idx}">${idx + 1}</button>`;
      }).join('');
      $('#sheet-modal').classList.remove('hidden');
    });

    $('#sheet-close-btn').addEventListener('click', () => $('#sheet-modal').classList.add('hidden'));
    $('#sheet-modal').addEventListener('click', (e) => {
      if (e.target === $('#sheet-modal')) $('#sheet-modal').classList.add('hidden');
      const btn = e.target.closest('[data-jump]');
      if (btn) {
        saveCurrentNoteQuietly();
        state.session.cursor = Number(btn.dataset.jump);
        $('#sheet-modal').classList.add('hidden');
        renderQuestion();
      }
    });
  }

  function bindKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (!state.session.active) return;
      if (document.activeElement && ['TEXTAREA', 'INPUT'].includes(document.activeElement.tagName)) return;

      if (e.key === 'ArrowRight') {
        $('#quiz-next-btn').click();
      } else if (e.key === 'ArrowLeft') {
        $('#quiz-prev-btn').click();
      } else if (['1', '2', '3', '4', 'a', 'b', 'c', 'd', 'A', 'B', 'C', 'D'].includes(e.key)) {
        const map = { '1': 'A', '2': 'B', '3': 'C', '4': 'D' };
        const letter = map[e.key] || e.key.toUpperCase();
        const btn = $(`#q-options [data-opt="${letter}"]`);
        if (btn && !btn.disabled) btn.click();
      } else if (e.key === 'Enter') {
        const submitBtn = $('#q-multi-submit-wrap');
        if (!submitBtn.classList.contains('hidden')) {
          $('#q-multi-submit-btn').click();
        }
      }
    });
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
