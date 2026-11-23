/**
 * 数据层（小程序版）
 *
 * 设计与网页版 js/storage.js 保持一致：业务方法名相同，只把底层的 localStorage
 * 换成 wx.getStorageSync / setStorageSync。后续若开通云同步，只需替换 driver 的
 * get/set/remove 实现，上层业务代码不用改。
 *
 * 用户隔离：所有学习数据都带 `u_{userId}_` 前缀，切换账号不会互相污染。
 * 这是为将来接云端多账号预留的——现在 userId 是本机生成的。
 */

const APP_PREFIX = 'ham_exam_v1_';

const driver = {
  get(key, fallback) {
    try {
      const raw = wx.getStorageSync(APP_PREFIX + key);
      if (raw === '' || raw === null || raw === undefined) return fallback;
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (e) {
      console.warn('[store] read failed', key, e);
      return fallback;
    }
  },
  set(key, value) {
    try {
      wx.setStorageSync(APP_PREFIX + key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn('[store] write failed', key, e);
      return false;
    }
  },
  remove(key) {
    try {
      wx.removeStorageSync(APP_PREFIX + key);
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

// ---------------------------------------------------------------- 登录态

const PROFILE_KEY = 'profile';

function getProfile() {
  const p = driver.get(PROFILE_KEY, null);
  return p && p.userId ? p : null;
}

function isLoggedIn() {
  return Boolean(getProfile());
}

/**
 * 本地登录：生成稳定的本机用户 id，并记录昵称头像。
 * 说明：真正的微信登录需要后端用 code 换 openid；当前为本地实现，
 * 等云服务开通后换成云端身份，userId 改由服务端下发即可。
 */
function login(profile) {
  const prev = getProfile();
  const userId = (prev && prev.userId) || 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  // 首次登录时，把游客期间产生的数据搬到该用户名下，避免"先随便看看"的进度丢失
  if (!prev) {
    migrateGuestData(userId);
  }

  const next = {
    userId,
    nickName: (profile && profile.nickName) || '无线电爱好者',
    avatarUrl: (profile && profile.avatarUrl) || '',
    loginAt: Date.now()
  };
  driver.set(PROFILE_KEY, next);
  return next;
}

const DATA_KEYS = ['settings', 'wrong_book', 'favorites', 'notes', 'answered', 'sessions', 'exam_history'];

function migrateGuestData(userId) {
  DATA_KEYS.forEach((key) => {
    const legacy = driver.get('guest_' + key, null);
    if (legacy === null) return;
    const target = userId + '_' + key;
    // 目标已有数据时不覆盖（例如重复登录）
    if (driver.get(target, null) === null) {
      driver.set(target, legacy);
    }
    driver.remove('guest_' + key);
  });
}

function logout() {
  // 只清登录态，保留学习数据，避免误退导致进度丢失
  driver.remove(PROFILE_KEY);
}

function updateProfile(partial) {
  const p = getProfile();
  if (!p) return null;
  const next = Object.assign({}, p, partial, { userId: p.userId });
  driver.set(PROFILE_KEY, next);
  return next;
}

// ---------------------------------------------------------------- 学习数据

function scopedKey(key) {
  const p = getProfile();
  const uid = p ? p.userId : 'guest';
  return uid + '_' + key;
}

class ExamStore {
  constructor() {
    this.reload();
  }

  reload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, driver.get(scopedKey('settings'), {}));
    this.wrongBook = driver.get(scopedKey('wrong_book'), {});
    this.favorites = driver.get(scopedKey('favorites'), {});
    this.notes = driver.get(scopedKey('notes'), {});
    this.answered = driver.get(scopedKey('answered'), {});
    this.sessions = driver.get(scopedKey('sessions'), {});
    this.examHistory = driver.get(scopedKey('exam_history'), []);
  }

  saveSettings(partial) {
    this.settings = Object.assign({}, this.settings, partial);
    driver.set(scopedKey('settings'), this.settings);
  }

  // ---- 作答与掌握度 ----
  recordAttempt(qid, selected, isCorrect) {
    this.answered[qid] = { correct: isCorrect, lastSelected: selected, updatedAt: Date.now() };
    driver.set(scopedKey('answered'), this.answered);

    if (!isCorrect) {
      const prev = this.wrongBook[qid] || { count: 0 };
      this.wrongBook[qid] = {
        count: prev.count + 1,
        lastWrongAt: Date.now(),
        lastSelected: selected
      };
      driver.set(scopedKey('wrong_book'), this.wrongBook);
    } else if (this.settings.autoRemoveWrong && this.wrongBook[qid]) {
      delete this.wrongBook[qid];
      driver.set(scopedKey('wrong_book'), this.wrongBook);
    }
  }

  // ---- 错题集 ----
  isWrong(qid) { return Boolean(this.wrongBook[qid]); }

  removeWrong(qid) {
    if (this.wrongBook[qid]) {
      delete this.wrongBook[qid];
      driver.set(scopedKey('wrong_book'), this.wrongBook);
    }
  }

  clearWrongBook() {
    this.wrongBook = {};
    driver.set(scopedKey('wrong_book'), this.wrongBook);
  }

  getWrongIds() {
    return Object.keys(this.wrongBook).sort(
      (a, b) => (this.wrongBook[b].lastWrongAt || 0) - (this.wrongBook[a].lastWrongAt || 0)
    );
  }

  // ---- 收藏 ----
  isFavorite(qid) { return Boolean(this.favorites[qid]); }

  toggleFavorite(qid) {
    if (this.favorites[qid]) {
      delete this.favorites[qid];
    } else {
      this.favorites[qid] = Date.now();
    }
    driver.set(scopedKey('favorites'), this.favorites);
    return Boolean(this.favorites[qid]);
  }

  getFavoriteIds() {
    return Object.keys(this.favorites).sort(
      (a, b) => (this.favorites[b] || 0) - (this.favorites[a] || 0)
    );
  }

  // ---- 笔记 ----
  getNote(qid) { return this.notes[qid] ? this.notes[qid].text : ''; }

  saveNote(qid, text) {
    const trimmed = (text || '').trim();
    if (!trimmed) {
      if (this.notes[qid]) {
        delete this.notes[qid];
        driver.set(scopedKey('notes'), this.notes);
      }
      return '';
    }
    this.notes[qid] = { text: trimmed, updatedAt: Date.now() };
    driver.set(scopedKey('notes'), this.notes);
    return trimmed;
  }

  getNoteIds() {
    return Object.keys(this.notes).sort(
      (a, b) => (this.notes[b].updatedAt || 0) - (this.notes[a].updatedAt || 0)
    );
  }

  // ---- 断点续刷 ----
  getSessionCursor(sessionKey) {
    return this.sessions[sessionKey] ? this.sessions[sessionKey].cursor || 0 : 0;
  }

  saveSessionCursor(sessionKey, cursor) {
    if (!this.sessions[sessionKey]) this.sessions[sessionKey] = {};
    this.sessions[sessionKey].cursor = cursor;
    driver.set(scopedKey('sessions'), this.sessions);
  }

  // ---- 考试记录 ----
  addExamRecord(record) {
    this.examHistory.unshift(record);
    if (this.examHistory.length > 50) this.examHistory = this.examHistory.slice(0, 50);
    driver.set(scopedKey('exam_history'), this.examHistory);
  }

  clearExamHistory() {
    this.examHistory = [];
    driver.set(scopedKey('exam_history'), []);
  }

  // ---- 统计 ----
  getStats() {
    const total = Object.keys(this.answered).length;
    const correct = Object.keys(this.answered).filter((id) => this.answered[id].correct).length;
    return {
      total,
      correct,
      wrong: Object.keys(this.wrongBook).length,
      favorites: Object.keys(this.favorites).length,
      notes: Object.keys(this.notes).length,
      accuracy: total ? Math.round((correct / total) * 100) : 0
    };
  }

  // ---- 批量管理 ----
  removeWrongBatch(qids) {
    qids.forEach((id) => { delete this.wrongBook[id]; });
    driver.set(scopedKey('wrong_book'), this.wrongBook);
  }

  addFavoritesBatch(qids) {
    const now = Date.now();
    qids.forEach((id) => { if (!this.favorites[id]) this.favorites[id] = now; });
    driver.set(scopedKey('favorites'), this.favorites);
  }

  removeFavoritesBatch(qids) {
    qids.forEach((id) => { delete this.favorites[id]; });
    driver.set(scopedKey('favorites'), this.favorites);
  }

  deleteNotesBatch(qids) {
    qids.forEach((id) => { delete this.notes[id]; });
    driver.set(scopedKey('notes'), this.notes);
  }

  resetProgress() {
    this.answered = {};
    this.sessions = {};
    driver.set(scopedKey('answered'), {});
    driver.set(scopedKey('sessions'), {});
  }
}

module.exports = {
  store: new ExamStore(),
  ExamStore,
  getProfile,
  isLoggedIn,
  login,
  logout,
  updateProfile
};
