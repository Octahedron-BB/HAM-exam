#!/usr/bin/env node
/**
 * 小程序业务逻辑测试（无需微信开发者工具）
 *
 * 用 Node 模拟 wx 的存储/文件/UI API，再真实加载 utils 与 page 文件，
 * 跑一遍核心链路：题库加载 → 出题 → 判分 → 错题收录 → 笔记 → 收藏。
 *
 * 用法：node tools/test-miniprogram.js
 */
const path = require('path');
const fs = require('fs');

const MP = path.join(__dirname, '..', 'miniprogram');
const store = new Map();   // 模拟 wx storage

// ---------------------------------------------------------------- wx mock
const toasts = [];
const readLog = [];   // 记录读过的文件，用于验证首页没有解析整个题库
global.wx = {
  getStorageSync(key) {
    return store.has(key) ? store.get(key) : '';
  },
  setStorageSync(key, val) {
    store.set(key, val);
  },
  removeStorageSync(key) {
    store.delete(key);
  },
  getFileSystemManager() {
    return {
      readFileSync(p) {
        const abs = path.isAbsolute(p) ? p : path.join(MP, p);
        readLog.push(path.basename(abs));
        return fs.readFileSync(abs, 'utf8');
      }
    };
  },
  showToast(o) { toasts.push(o.title); },
  setNavigationBarTitle() {},
  navigateTo() {},
  navigateBack() {},
  reLaunch() {}
};

// ---------------------------------------------------------------- Page/App mock
function loadPage(relPath) {
  let captured = null;
  global.Page = (opts) => { captured = opts; };
  global.App = () => {};
  const full = path.join(MP, relPath);
  delete require.cache[require.resolve(full)];
  require(full);
  const page = captured;
  page.data = JSON.parse(JSON.stringify(page.data || {}));
  page.setData = function (patch) { Object.assign(this.data, patch); };
  return page;
}

// ---------------------------------------------------------------- 断言
let pass = 0;
const failures = [];
function ok(cond, label, extra) {
  if (cond) { pass++; console.log('  ✓ ' + label); }
  else { failures.push(label + (extra ? ' — ' + extra : '')); console.log('  ✗ ' + label + (extra ? ' — ' + extra : '')); }
}

const tick = () => new Promise((r) => setTimeout(r, 0));

// ---------------------------------------------------------------- 1. 题库
console.log('\n[1] 题库加载');
const QBank = require(path.join(MP, 'utils/questions.js'));
const bank = QBank.load();
ok(bank.questions.length === 1375, '题库共 1375 题', '实际 ' + bank.questions.length);
ok(Boolean(bank.syllabus && bank.syllabus.chapters), '考纲章节已加载');
const counts = QBank.countByLevel(bank.questions);
ok(counts.A === 683, 'A 类 683 题', '实际 ' + counts.A);
ok(counts.B === 1143, 'B 类 1143 题', '实际 ' + counts.B);
ok(counts.C === 1282, 'C 类 1282 题', '实际 ' + counts.C);
ok(counts.ALL === 1375, '总题库 1375 题', '实际 ' + counts.ALL);

const map = QBank.buildIndex(bank.questions);
ok(Object.keys(map).length === 1375, '题目索引 1375 条');

// ---------------------------------------------------------------- 2. 引擎
console.log('\n[2] 判分引擎');
const Engine = require(path.join(MP, 'utils/engine.js'));
const singleQ = bank.questions.find((q) => q.type === 'single');
ok(Engine.grade(singleQ, singleQ.answer).isCorrect === true, '单选正确答案判对');
ok(Engine.grade(singleQ, singleQ.answer === 'A' ? 'B' : 'A').isCorrect === false, '单选错误答案判错');

const multiQ = bank.questions.find((q) => q.type === 'multi');
const reversed = multiQ.answer.split('').reverse().join('');
ok(Engine.grade(multiQ, reversed).isCorrect === true, '多选答案乱序仍判对（' + multiQ.answer + ' vs ' + reversed + '）');
ok(Engine.grade(multiQ, multiQ.answer.charAt(0)).isCorrect === false, '多选漏选判错');

// ---------------------------------------------------------------- 3. 登录与数据隔离
console.log('\n[3] 登录与数据层');
const storeMod = require(path.join(MP, 'utils/store.js'));
ok(storeMod.isLoggedIn() === false, '初始未登录');
storeMod.login({ nickName: '测试火腿', avatarUrl: '' });
const profile = storeMod.getProfile();
ok(Boolean(profile && profile.userId), '登录后生成 userId: ' + (profile && profile.userId));
ok(profile.nickName === '测试火腿', '昵称已保存');
const store1 = storeMod.store;
store1.reload();
ok(store1.settings.level === 'A', '默认级别为 A 类');

// ---------------------------------------------------------------- 4. 首页
console.log('\n[4] 首页');
const indexPage = loadPage('pages/index/index.js');
readLog.length = 0;          // 清空记录，只看首页读了什么
indexPage.onLoad();
// 首页把题库解析放在 setTimeout 里，等它跑完
setTimeout(() => {
  ok(readLog.indexOf('counts.json') >= 0, '首页读取了 counts.json');
  ok(readLog.indexOf('questions.json') < 0,
    '首页未解析 600KB 题库（只读了 ' + (readLog.join(', ') || '无') + '）');

  indexPage.onShow();
  ok(indexPage.data.counts.ALL === 1375, '首页题量统计已填充', JSON.stringify(indexPage.data.counts));
  ok(indexPage.data.loggedIn === true, '首页显示已登录');
  indexPage.onLevelTap({ currentTarget: { dataset: { key: 'B' } } });
  ok(indexPage.data.level === 'B', '切换级别到 B 类');
  ok(indexPage.data.currentCount === 1143, 'B 类题量显示 1143', String(indexPage.data.currentCount));

  runQuizTests();
}, 200);

async function runQuizTests() {
  // -------------------------------------------------------------- 5. 刷题主链路
  console.log('\n[5] 刷题页（A 类 · 顺序）');
  const quiz = loadPage('pages/quiz/quiz.js');
  quiz.onLoad({ level: 'A', mode: 'seq' });
  ok(quiz.data.loading === true, '首帧先渲染加载态，不阻塞首屏');
  await tick();
  ok(quiz.data.loading === false, '题库解析完成后切到题目');
  ok(quiz.data.total === 683, 'A 类题目 683 条', String(quiz.data.total));
  ok(quiz.data.loading === false, '加载完成');
  ok(Boolean(quiz.data.q && quiz.data.q.text), '第一题已渲染');
  ok(quiz.data.options.length >= 2, '选项已渲染 ' + quiz.data.options.length + ' 项');

  const q1 = quiz.currentQ;
  const isMultiQ = q1.type === 'multi';
  const allKeys = quiz.data.options.map((o) => o.key);
  const correctKeys = q1.answer.split('');
  const wrongKey = allKeys.find((k) => correctKeys.indexOf(k) < 0);

  ok(Boolean(wrongKey), '能找到错误选项用于制造错题');

  // 故意答错：单选点一下即判分；多选选中后点确认
  quiz.onOptionTap({ currentTarget: { dataset: { key: wrongKey } } });
  if (isMultiQ) {
    ok(quiz.data.submitted === false, '多选点击后仅选中、不立即判分');
    quiz.onSubmitMulti();
  }
  ok(quiz.data.submitted === true, '答错后进入已提交状态');
  ok(quiz.data.isCorrect === false, '判为错误');
  ok(quiz.data.answerText === q1.answer, '反馈显示正确答案 ' + q1.answer);
  ok(store1.isWrong(q1.id) === true, '错题自动收录');
  const gradedWrong = quiz.data.options.filter((o) => o.state === 'wrong');
  ok(gradedWrong.length === 1 && gradedWrong[0].key === wrongKey, '错误选项标记为 wrong');
  const gradedCorrect = quiz.data.options.filter((o) => o.state === 'correct');
  ok(gradedCorrect.length === correctKeys.length, '正确选项全部标记 correct');

  // 笔记
  quiz.onNoteInput({ detail: { value: '  记忆口诀：先看题干关键词  ' } });
  quiz.onNoteBlur();
  ok(store1.getNote(q1.id) === '记忆口诀：先看题干关键词', '笔记已保存并去除首尾空格', store1.getNote(q1.id));
  quiz.onNoteInput({ detail: { value: '' } });
  quiz.onSaveNote();
  ok(store1.getNote(q1.id) === '', '清空笔记后删除记录');

  // 收藏
  quiz.onToggleFavorite();
  ok(store1.isFavorite(q1.id) === true, '收藏成功');
  quiz.onToggleFavorite();
  ok(store1.isFavorite(q1.id) === false, '再次点击取消收藏');

  // 翻页
  quiz.onNext();
  ok(quiz.data.index === 1, '翻到第 2 题');
  ok(quiz.data.submitted === false, '新题重置为未作答');
  ok(store1.getSessionCursor('seq_A') === 1, '断点续刷位置已记录');

  // 上一题回来，本次会话的判分结果保留
  quiz.onPrev();
  ok(quiz.data.index === 0, '返回第 1 题');
  ok(quiz.data.submitted === true && quiz.data.isCorrect === false, '本次会话作答复现');

  // 此时错题集应有 1 题（趁后面答对之前先验证）
  const qWrongNow = loadPage('pages/quiz/quiz.js');
  qWrongNow.onLoad({ mode: 'wrong', level: 'ALL' });
  await tick();
  ok(qWrongNow.list.length === 1 && qWrongNow.list[0] === q1.id,
    '错题集含刚才答错的 1 题', '实际 ' + qWrongNow.list.length);

  // -------------------------------------------------------------- 6. 多选题
  console.log('\n[6] 多选题');
  const quizMulti = loadPage('pages/quiz/quiz.js');
  quizMulti.onLoad({ level: 'ALL', mode: 'seq' });
  await tick();
  let multiIdx = -1;
  for (let i = 0; i < quizMulti.list.length; i++) {
    if (map[quizMulti.list[i]].type === 'multi') { multiIdx = i; break; }
  }
  quizMulti.goTo(multiIdx);
  ok(quizMulti.data.isMulti === true, '多选题 isMulti 为 true');
  const mq = quizMulti.currentQ;
  const mKeys = mq.answer.split('');
  quizMulti.onOptionTap({ currentTarget: { dataset: { key: mKeys[0] } } });
  ok(quizMulti.data.submitted === false, '多选点击不立即判分');
  ok(quizMulti.data.canSubmitMulti === true, '有选中项时可提交');
  if (mKeys.length > 1) {
    quizMulti.onOptionTap({ currentTarget: { dataset: { key: mKeys[1] } } });
  }
  quizMulti.onSubmitMulti();
  ok(quizMulti.data.submitted === true, '提交后判分');
  ok(quizMulti.data.isCorrect === true, '多选全选对判为正确');
  // 这道题正是前面答错的那道，答对后应自动移出错题集
  ok(quizMulti.currentQ.id === q1.id, '（该多选题即前面答错的题）');
  ok(store1.isWrong(q1.id) === false, '答对后自动移出错题集');

  // 多选题取消选中
  const quizToggle = loadPage('pages/quiz/quiz.js');
  quizToggle.onLoad({ level: 'ALL', mode: 'seq' });
  await tick();
  quizToggle.goTo(multiIdx);
  const tk = quizToggle.currentQ.answer.split('')[0];
  quizToggle.onOptionTap({ currentTarget: { dataset: { key: tk } } });
  ok(quizToggle.data.canSubmitMulti === true, '选中后按钮可用');
  quizToggle.onOptionTap({ currentTarget: { dataset: { key: tk } } });
  ok(quizToggle.data.canSubmitMulti === false, '再点一次取消选中，按钮禁用');

  // -------------------------------------------------------------- 7. 专项列表
  console.log('\n[7] 专项列表');
  const qWrong = loadPage('pages/quiz/quiz.js');
  qWrong.onLoad({ mode: 'wrong', level: 'ALL' });
  await tick();
  ok(qWrong.data.emptyText.indexOf('错题') >= 0, '错题全清后给出空态引导');

  const qEmptyFav = loadPage('pages/quiz/quiz.js');
  qEmptyFav.onLoad({ mode: 'favorite', level: 'ALL' });
  await tick();
  ok(qEmptyFav.data.emptyText.indexOf('收藏') >= 0, '收藏集为空时给出引导文案');

  const qNotes = loadPage('pages/quiz/quiz.js');
  qNotes.onLoad({ mode: 'notes', level: 'ALL' });
  await tick();
  ok(qNotes.data.emptyText.indexOf('笔记') >= 0, '笔记为空时给出引导文案');

  // -------------------------------------------------------------- 8. 数据隔离
  console.log('\n[8] 多用户数据隔离');
  storeMod.logout();
  ok(storeMod.isLoggedIn() === false, '退出登录后无登录态');
  const guestStore = storeMod.store;
  guestStore.reload();
  ok(Object.keys(guestStore.wrongBook).length === 0, '游客看不到上一用户的错题');

  // -------------------------------------------------------------- 结果
  console.log('\n' + '='.repeat(52));
  if (failures.length) {
    console.log('失败 ' + failures.length + ' 项 / 通过 ' + pass + ' 项');
    failures.forEach((f) => console.log('  - ' + f));
    process.exit(1);
  }
  console.log('全部通过：' + pass + ' 项断言');
}
