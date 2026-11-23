/**
 * 题库数据加载（小程序端）
 *
 * 小程序不支持 fetch 读本地文件，也不能 require JSON，
 * 这里用 wx.getFileSystemManager().readFileSync 读取包内文件。
 * 首次加载后缓存在内存，后续调用直接复用。
 */

let cache = null;

function readJson(path) {
  const fs = wx.getFileSystemManager();
  const raw = fs.readFileSync(path, 'utf8');
  return JSON.parse(raw);
}

/**
 * @returns {{questions: Array, syllabus: Object}}
 */
function load() {
  if (cache) return cache;
  const questions = readJson('data/questions.json');
  const syllabus = readJson('data/syllabus.json');
  cache = { questions, syllabus };
  return cache;
}

/**
 * 按 id 建索引，便于刷题时 O(1) 取题
 */
function buildIndex(questions) {
  const map = {};
  questions.forEach((q) => { map[q.id] = q; });
  return map;
}

/** 各级别题量统计，用于首页展示 */
function countByLevel(questions) {
  const counts = { A: 0, B: 0, C: 0, ALL: questions.length };
  questions.forEach((q) => {
    (q.levels || []).forEach((lv) => {
      if (counts[lv] !== undefined) counts[lv] += 1;
    });
  });
  return counts;
}

module.exports = { load, buildIndex, countByLevel };
