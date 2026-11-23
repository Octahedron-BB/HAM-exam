/**
 * 题库数据加载（小程序端）
 *
 * 为什么用 require 而不是 readFileSync：
 *   微信开发者工具打包时把 .json 当配置文件，data/*.json 不会进代码包
 *   （实测 598KB 题库贡献 0 字节）。题库因此以 .js 模块形式存在，
 *   由 tools/sync-bank.py 生成。
 *
 * 分层：
 *   - loadCounts() 只 require 几十字节的 counts.js，首页专用
 *   - load()        require 完整题库（约 598KB），只有进刷题页才调用
 *
 * require 有模块缓存，重复调用不会重复解析。
 */

let bankCache = null;

/** 完整题库（约 598KB，请勿在首页调用） */
function load() {
  if (bankCache) return bankCache;
  const questions = require('../data/questions.js');
  const syllabus = require('../data/syllabus.js');
  bankCache = { questions, syllabus };
  return bankCache;
}

/** 各级别题量（首页专用，只加载几十字节） */
function loadCounts() {
  return require('../data/counts.js');
}

/** 按 id 建索引，便于刷题时 O(1) 取题 */
function buildIndex(questions) {
  const map = {};
  questions.forEach((q) => { map[q.id] = q; });
  return map;
}

/** 各级别题量统计（构建期用，运行期请读 counts.js） */
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
