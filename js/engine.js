/**
 * Pure Quiz & Filter Engine (Zero DOM dependencies, Mini-Program ready)
 */

(function (global) {
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
    }
  };

  global.HamEngine = HamEngine;
})(typeof window !== 'undefined' ? window : globalThis);
