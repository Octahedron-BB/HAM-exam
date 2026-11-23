/**
 * Storage Abstraction Layer (Mini-Program Compatible)
 * 
 * To migrate to WeChat Mini Program / UniApp / Taro:
 * Replace the `driver` object methods with `wx.getStorageSync` / `wx.setStorageSync` / `wx.removeStorageSync`
 * (or `uni.*` / `Taro.*`). All business logic in ExamStore remains 100% unchanged.
 */

(function (global) {
  'use strict';

  const PREFIX = 'ham_exam_v1_';

  const driver = {
    get(key, fallback) {
      try {
        // Mini-program equivalent: const raw = wx.getStorageSync(PREFIX + key);
        const raw = global.localStorage.getItem(PREFIX + key);
        if (raw === null || raw === undefined || raw === '') return fallback;
        return JSON.parse(raw);
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        // Mini-program equivalent: wx.setStorageSync(PREFIX + key, JSON.stringify(value));
        global.localStorage.setItem(PREFIX + key, JSON.stringify(value));
        return true;
      } catch (e) {
        console.warn('Storage write failed:', e);
        return false;
      }
    },
    remove(key) {
      try {
        global.localStorage.removeItem(PREFIX + key);
      } catch (e) {
        // ignore
      }
    }
  };

  const DEFAULT_SETTINGS = {
    level: 'A',           // 'A' | 'B' | 'C' | 'ALL'
    order: 'seq',         // 'seq' | 'random'
    qtype: 'all',         // 'all' | 'single' | 'multi'
    autoRemoveWrong: true,
    shuffleOptions: true,
    darkMode: false
  };

  class ExamStore {
    constructor() {
      this.settings = Object.assign({}, DEFAULT_SETTINGS, driver.get('settings', {}));
      this.wrongBook = driver.get('wrong_book', {});
      this.favorites = driver.get('favorites', {});
      this.notes = driver.get('notes', {});
      this.answered = driver.get('answered', {});     // { [qid]: { correct, lastSelected, updatedAt } }
      this.sessions = driver.get('sessions', {});     // { [sessionKey]: { cursor, orderIds? } }
    }

    saveSettings(partial) {
      this.settings = Object.assign({}, this.settings, partial);
      driver.set('settings', this.settings);
    }

    // --- Answered & Mastery ---
    recordAttempt(qid, selected, isCorrect) {
      this.answered[qid] = {
        correct: isCorrect,
        lastSelected: selected,
        updatedAt: Date.now()
      };
      driver.set('answered', this.answered);

      if (!isCorrect) {
        const prev = this.wrongBook[qid] || { count: 0 };
        this.wrongBook[qid] = {
          count: prev.count + 1,
          lastWrongAt: Date.now(),
          lastSelected: selected
        };
        driver.set('wrong_book', this.wrongBook);
      } else if (this.settings.autoRemoveWrong && this.wrongBook[qid]) {
        delete this.wrongBook[qid];
        driver.set('wrong_book', this.wrongBook);
      }
    }

    // --- Wrong Book ---
    isWrong(qid) {
      return Boolean(this.wrongBook[qid]);
    }

    removeWrong(qid) {
      if (this.wrongBook[qid]) {
        delete this.wrongBook[qid];
        driver.set('wrong_book', this.wrongBook);
      }
    }

    clearWrongBook() {
      this.wrongBook = {};
      driver.set('wrong_book', this.wrongBook);
    }

    getWrongIds() {
      return Object.keys(this.wrongBook).sort(
        (a, b) => (this.wrongBook[b].lastWrongAt || 0) - (this.wrongBook[a].lastWrongAt || 0)
      );
    }

    // --- Favorites ---
    isFavorite(qid) {
      return Boolean(this.favorites[qid]);
    }

    toggleFavorite(qid) {
      if (this.favorites[qid]) {
        delete this.favorites[qid];
      } else {
        this.favorites[qid] = Date.now();
      }
      driver.set('favorites', this.favorites);
      return Boolean(this.favorites[qid]);
    }

    getFavoriteIds() {
      return Object.keys(this.favorites).sort(
        (a, b) => (this.favorites[b] || 0) - (this.favorites[a] || 0)
      );
    }

    // --- Notes ---
    getNote(qid) {
      return this.notes[qid] ? this.notes[qid].text : '';
    }

    saveNote(qid, text) {
      const trimmed = (text || '').trim();
      if (!trimmed) {
        if (this.notes[qid]) {
          delete this.notes[qid];
          driver.set('notes', this.notes);
        }
        return '';
      }
      this.notes[qid] = {
        text: trimmed,
        updatedAt: Date.now()
      };
      driver.set('notes', this.notes);
      return trimmed;
    }

    getNoteIds() {
      return Object.keys(this.notes).sort(
        (a, b) => (this.notes[b].updatedAt || 0) - (this.notes[a].updatedAt || 0)
      );
    }

    // --- Session Cursor (Resume Progress) ---
    getSessionCursor(sessionKey) {
      return this.sessions[sessionKey] ? this.sessions[sessionKey].cursor || 0 : 0;
    }

    saveSessionCursor(sessionKey, cursor) {
      if (!this.sessions[sessionKey]) this.sessions[sessionKey] = {};
      this.sessions[sessionKey].cursor = cursor;
      driver.set('sessions', this.sessions);
    }

    // --- Exam History ---
    addExamRecord(record) {
      this.examHistory.unshift(record);
      if (this.examHistory.length > 50) {
        this.examHistory = this.examHistory.slice(0, 50);
      }
      driver.set('exam_history', this.examHistory);
    }

    clearExamHistory() {
      this.examHistory = [];
      driver.set('exam_history', []);
    }

    // --- Export / Import / Reset ---
    exportAll() {
      return JSON.stringify({
        version: 1,
        exportedAt: new Date().toISOString(),
        settings: this.settings,
        wrongBook: this.wrongBook,
        favorites: this.favorites,
        notes: this.notes,
        answered: this.answered,
        sessions: this.sessions,
        examHistory: this.examHistory
      }, null, 2);
    }

    importAll(jsonStr) {
      const data = JSON.parse(jsonStr);
      if (!data || typeof data !== 'object') throw new Error('无效的备份文件');
      if (data.settings) this.settings = Object.assign({}, DEFAULT_SETTINGS, data.settings);
      if (data.wrongBook) this.wrongBook = data.wrongBook;
      if (data.favorites) this.favorites = data.favorites;
      if (data.notes) this.notes = data.notes;
      if (data.answered) this.answered = data.answered;
      if (data.sessions) this.sessions = data.sessions;
      if (data.examHistory) this.examHistory = data.examHistory;
      driver.set('settings', this.settings);
      driver.set('wrong_book', this.wrongBook);
      driver.set('favorites', this.favorites);
      driver.set('notes', this.notes);
      driver.set('answered', this.answered);
      driver.set('sessions', this.sessions);
      driver.set('exam_history', this.examHistory);
    }

    resetProgress() {
      this.answered = {};
      this.sessions = {};
      driver.set('answered', {});
      driver.set('sessions', {});
    }
  }

  global.HamStorage = new ExamStore();
})(typeof window !== 'undefined' ? window : globalThis);
