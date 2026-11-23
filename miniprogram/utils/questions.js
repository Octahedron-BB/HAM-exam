/**
 * 题库数据加载（小程序端）
 *
 * 小程序不支持 fetch 读本地文件，也不能 require JSON，
 * 这里用 wx.getFileSystemManager().readFileSync 读取包内文件。
 *
 * 两个层次：
 *   - loadCounts() 只读 data/counts.json（几百字节），首页专用，冷启动不解析 600KB 题库
 *   - load()       读完整题库（约 600KB），只有进刷题页才调用
 *
 * 首次加载后缓存在内存，后续调用直接复用。
 */

let bankCache = null;
let countsCache = null;

/**
 * 读包内 JSON。不同基础库/真机对相对路径的处理略有差异，
 * 这里按几种常见写法依次尝试，避免真机上直接抛 File not found。
 */
function readJson(relPath) {
  const fs = wx.getFileSystemManager();
  const candidates = [relPath, './' + relPath, '/' + relPath];
  let lastErr = null;

  for (let i = 0; i < candidates.length; i += 1) {
    try {
      const raw = fs.readFileSync(candidates[i], 'utf8');
      return JSON.parse(raw);
    } catch (err) {
      lastErr = err;
    }
  }
  const msg = (lastErr && lastErr.message) || '未知错误';
  throw new Error('读取 ' + relPath + ' 失败：' + msg);
}

/**
 * 完整题库（约 600KB，解析有开销，请勿在首页调用）
 * @returns {{questions: Array, syllabus: Object}}
 */
function load() {
  if (bankCache) return bankCache;
  const questions = readJson('data/questions.json');
  const syllabus = readJson('data/syllabus.json');
  bankCache = { questions, syllabus };
  return bankCache;
}

/**
 * 各级别题量（首页专用）。由 tools/sync-bank.py 预生成，
 * 避免首页为了显示四个数字去解析整个题库。
 */
function loadCounts() {
  if (countsCache) return countsCache;
  countsCache = readJson('data/counts.json');
  return countsCache;
}

/**
 * 按 id 建索引，便于刷题时 O(1) 取题
 */
function buildIndex(questions) {
  const map = {};
  questions.forEach((q) => { map[q.id] = q; });
  return map;
}

/** 各级别题量统计（构建期用，运行期请读 counts.json） */
function countByLevel(questions) {
  const counts = { A: 0, B: 0, C: 0, ALL: questions.length };
  questions.forEach((q) => {
    (q.levels || []).forEach((lv) => {
      if (counts[lv] !== undefined) counts[lv] += 1;
    });
  });
  return counts;
}

module.exports = { load, loadCounts, buildIndex, countByLevel };
