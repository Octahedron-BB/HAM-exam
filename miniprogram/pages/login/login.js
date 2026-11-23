const { login, getProfile, store } = require('../../utils/store');

Page({
  data: {
    avatarUrl: '',
    nickName: '',
    canSubmit: false,
    submitting: false,
    isEdit: false
  },

  onLoad(options) {
    const existing = getProfile();
    if (existing) {
      // 从首页「编辑资料」进来时带上原值，避免用户重填
      this.setData({
        avatarUrl: existing.avatarUrl || '',
        nickName: existing.nickName || '',
        canSubmit: true,
        isEdit: Boolean(options && options.edit)
      });
    }
  },

  onChooseAvatar(e) {
    this.setData({
      avatarUrl: e.detail.avatarUrl,
      canSubmit: true
    });
  },

  onNickInput(e) {
    const val = e.detail.value;
    this.setData({
      nickName: val,
      canSubmit: Boolean(val.trim())
    });
  },

  onSubmit() {
    if (this.data.submitting) return;
    const nickName = (this.data.nickName || '').trim();
    if (!nickName) {
      wx.showToast({ title: '请填写昵称', icon: 'none' });
      return;
    }

    // 头像与昵称属于隐私接口，先走一次官方隐私授权（后台需配好《用户隐私保护指引》）
    if (wx.requirePrivacyAuthorize) {
      wx.requirePrivacyAuthorize({
        success: () => this.doLogin(nickName),
        fail: () => wx.showToast({ title: '需同意隐私保护指引后才能登录', icon: 'none' })
      });
    } else {
      this.doLogin(nickName);
    }
  },

  doLogin(nickName) {
    this.setData({ submitting: true });
    try {
      login({ nickName, avatarUrl: this.data.avatarUrl });
      // 登录后数据作用域变化，必须重新加载
      store.reload();
    } catch (err) {
      this.setData({ submitting: false });
      wx.showToast({ title: '保存失败，请重试', icon: 'none' });
      console.error('[login] failed', err);
      return;
    }

    wx.showToast({ title: this.data.isEdit ? '已保存' : '登录成功', icon: 'success' });
    setTimeout(() => {
      if (this.data.isEdit) {
        wx.navigateBack({ delta: 1 });
      } else {
        wx.reLaunch({ url: '/pages/index/index' });
      }
    }, 500);
  },

  onSkip() {
    wx.reLaunch({ url: '/pages/index/index' });
  }
});
