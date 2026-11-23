/**
 * Pure Quiz & Filter Engine (Zero DOM dependencies, Mini-Program ready)
 */

(function () {
  'use strict';

  const HamEngine = {
    /**
     * Filter questions by level ('A'|'B'|'C'|'ALL'), type ('all'|'single'|'multi'),
     * knowledge point prefix ('1', '1.1', '1.1.1', etc.), or explicit id list.
     */
    filterQuestions(questions, opts = {}) {
      const {
        level = 'ALL',
        qtype = 'all',
        syllabusPrefix = '',
        idSet = null,
        keyword = ''
      } = opts;

      const kw = keyword.trim().toLowerCase();

      return questions.filter((q) => {
        if (idSet && !idSet.has(q.id)) return false;
        if (level !== 'ALL' && (!q.levels || !q.levels.includes(level))) return false;
        if (qtype !== 'all' && q.type !== qtype) return false;
        if (syllabusPrefix) {
          if (q.p !== syllabusPrefix && !q.p.startsWith(syllabusPrefix + '.')) {
            return false;
          }
        }
        if (kw) {
          const haystack = (
            q.id + ' ' + q.j + ' ' + q.p + ' ' + q.q + ' ' +
            Object.values(q.options || {}).join(' ')
          ).toLowerCase();
          if (!haystack.includes(kw)) return false;
        }
        return true;
      });
    },

    /**
     * Fisher-Yates shuffle (returns new array)
     */
    shuffle(list) {
      const arr = list.slice();
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
      }
      return arr;
    },

    /**
     * Shuffle A/B/C/D options of a question and remap the answer letters
     */
    shuffleOptions(question) {
      const letters = ['A', 'B', 'C', 'D'].filter((k) => question.options && question.options[k] !== undefined);
      if (letters.length <= 1) return question;

      const entries = letters.map((k) => ({ origKey: k, text: question.options[k] }));
      const shuffled = this.shuffle(entries);

      const newOptions = {};
      const keyMap = {};
      shuffled.forEach((item, idx) => {
        const newKey = letters[idx];
        newOptions[newKey] = item.text;
        keyMap[item.origKey] = newKey;
      });

      const newAnswer = question.answer
        .split('')
        .map((k) => keyMap[k] || k)
        .sort()
        .join('');

      return Object.assign({}, question, {
        options: newOptions,
        answer: newAnswer
      });
    },

    /**
     * Normalize selected answer string (sorted uppercase letters, e.g. 'AC')
     */
    normalizeAnswer(selected) {
      return Array.from(new Set(String(selected || '').toUpperCase().replace(/[^A-D]/g, '')))
        .sort()
        .join('');
    },

    grade(question, selected) {
      const normSelected = this.normalizeAnswer(selected);
      const normAnswer = this.normalizeAnswer(question.answer);
      return {
        selected: normSelected,
        answer: normAnswer,
        isCorrect: normSelected.length > 0 && normSelected === normAnswer
      };
    },

    /**
     * Compute syllabus tree with counts & mastery for a given level
     */
    buildSyllabusStats(questions, syllabusMeta, answeredMap, level = 'ALL') {
      const filtered = this.filterQuestions(questions, { level });
      const chapters = (syllabusMeta && syllabusMeta.chapters) || [];

      return chapters.map((ch) => {
        const chPrefix = ch.id;
        const chQuestions = filtered.filter((q) => q.p.startsWith(chPrefix + '.'));
        const chDone = chQuestions.filter((q) => answeredMap[q.id]).length;
        const chCorrect = chQuestions.filter((q) => answeredMap[q.id] && answeredMap[q.id].correct).length;

        const sectionEntries = Object.entries(ch.sections || {}).map(([secCode, secTitle]) => {
          const secQs = chQuestions.filter((q) => q.p === secCode || q.p.startsWith(secCode + '.'));
          const secDone = secQs.filter((q) => answeredMap[q.id]).length;
          const secCorrect = secQs.filter((q) => answeredMap[q.id] && answeredMap[q.id].correct).length;

          // Collect 3-level sub-codes (e.g., 1.1.1, 1.1.2)
          const subMap = {};
          secQs.forEach((q) => {
            if (!subMap[q.p]) subMap[q.p] = { code: q.p, total: 0, done: 0 };
            subMap[q.p].total += 1;
            if (answeredMap[q.id]) subMap[q.p].done += 1;
          });
          const subPoints = Object.values(subMap).sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));

          return {
            code: secCode,
            title: secTitle,
            total: secQs.length,
            done: secDone,
            correct: secCorrect,
            subPoints
          };
        }).filter((s) => s.total > 0);

        return {
          id: ch.id,
          title: ch.title,
          desc: ch.desc,
          total: chQuestions.length,
          done: chDone,
          correct: chCorrect,
          sections: sectionEntries
        };
      }).filter((ch) => ch.total > 0);
    },

    /**
     * Generate an exam paper (Mock Exam or Custom Paper)
     */
    generatePaper(questions, opts = {}) {
      const {
        level = 'A',
        chapters = [],
        singleCount = 25,
        multiCount = 5,
        strategy = 'random',
        answeredMap = {},
        wrongMap = {}
      } = opts;

      let pool = this.filterQuestions(questions, { level });
      if (chapters && chapters.length > 0) {
        const chSet = new Set(chapters);
        pool = pool.filter((q) => chSet.has(q.p.split('.')[0]));
      }

      const pickByStrategy = (items, count) => {
        if (count <= 0 || items.length === 0) return [];
        const shuffled = this.shuffle(items);
        if (strategy === 'unanswered') {
          const todo = shuffled.filter((q) => !answeredMap[q.id]);
          const done = shuffled.filter((q) => answeredMap[q.id]);
          return todo.concat(done).slice(0, count);
        }
        if (strategy === 'wrong') {
          const wrong = shuffled.filter((q) => wrongMap[q.id]);
          const rest = shuffled.filter((q) => !wrongMap[q.id]);
          return wrong.concat(rest).slice(0, count);
        }
        return shuffled.slice(0, count);
      };

      const singles = pickByStrategy(pool.filter((q) => q.type === 'single'), singleCount);
      const multis = pickByStrategy(pool.filter((q) => q.type === 'multi'), multiCount);
      return {
        list: singles.concat(multis),
        actualSingle: singles.length,
        actualMulti: multis.length
      };
    }
  };

  module.exports = HamEngine;
})();
