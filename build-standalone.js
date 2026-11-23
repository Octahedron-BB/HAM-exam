// 重建 dist/ham-radio-exam-standalone.html（单文件、可离线双击打开）
// 用法：node build-standalone.js
const fs = require('fs');
const path = require('path');

const root = process.argv[2] || process.cwd();
const rd = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let html = rd('index.html');

// 1) CSS 内联
const css = rd('styles.css');
html = html.replace(
  /<link rel="stylesheet" href="styles\.css[^"]*"\s*\/?>/,
  () => `<style>\n${css}\n  </style>`
);

// 2) 数据内联（放在脚本前），并给 init 加读取分支
const questions = rd('data/questions.json');
const syllabus = rd('data/syllabus.json');
const dataTags =
  `<script id="inline-questions-json" type="application/json">${questions}</script>\n` +
  `  <script id="inline-syllabus-json" type="application/json">${syllabus}</script>\n\n  `;

const SRC_FETCH = `      const [qRes, sRes] = await Promise.all([
        fetch('data/questions.json'),
        fetch('data/syllabus.json')
      ]);
      if (!qRes.ok || !sRes.ok) throw new Error('题库加载失败');
      state.questions = await qRes.json();
      state.syllabus = await sRes.json();`;

const INLINE_READ = `      const inlineQ = document.getElementById('inline-questions-json');
      const inlineS = document.getElementById('inline-syllabus-json');
      if (inlineQ && inlineS) {
        state.questions = JSON.parse(inlineQ.textContent);
        state.syllabus = JSON.parse(inlineS.textContent);
      } else {
        const [qRes, sRes] = await Promise.all([
          fetch('data/questions.json'),
          fetch('data/syllabus.json')
        ]);
        if (!qRes.ok || !sRes.ok) throw new Error('题库加载失败');
        state.questions = await qRes.json();
        state.syllabus = await sRes.json();
      }`;

// 3) JS 内联
let scripts = '';
for (const name of ['storage', 'engine', 'app']) {
  let code = rd(`js/${name}.js`);
  if (name === 'app') {
    if (!code.includes(SRC_FETCH)) throw new Error('app.js 中未找到预期的 fetch 片段');
    code = code.replace(SRC_FETCH, INLINE_READ);
  }
  scripts += `\n<script>\n${code}\n</script>`;
}

const scriptRe = /<script src="js\/(storage|engine|app)\.js[^"]*"><\/script>\s*/g;
if ((html.match(scriptRe) || []).length !== 3) throw new Error('未找到 3 个 js 引用');
html = html.replace(scriptRe, '');
html = html.replace('</body>', `${dataTags}${scripts}\n\n</body>`);

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist/ham-radio-exam-standalone.html');
fs.writeFileSync(out, html, 'utf8');
console.log('built', out, (fs.statSync(out).size / 1024).toFixed(0) + 'KB');
