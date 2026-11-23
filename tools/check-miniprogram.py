#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
小程序工程静态校验（不依赖微信开发者工具）

检查项：
1. 所有 JSON 严格可解析（无注释/尾逗号）
2. app.json.pages 声明的页面，.js/.wxml/.json 三件套齐全
3. project.config.json 的 miniprogramRoot 指向含 app.json 的目录
4. WXML 中 bind*/catch* 事件绑定的方法，在对应 Page 对象里确实存在
5. WXML 里禁止的语法：?.  ??  箭头函数  函数调用
6. WXSS 花括号配对、@import 目标存在
7. WXML 标签闭合（按标签栈）
8. 体积估算（主包 2MB 限制）

用法：python tools/check-miniprogram.py
"""
import json
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'miniprogram')
ROOT = os.path.abspath(ROOT)

errors = []
warnings = []


def err(msg):
    errors.append(msg)


def warn(msg):
    warnings.append(msg)


def load_json(path, label):
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except json.JSONDecodeError as e:
        err('%s JSON 解析失败: %s' % (label, e))
        return None


# ---------------------------------------------------------------- 1. JSON
app_json = load_json(os.path.join(ROOT, 'app.json'), 'app.json')
for name in ['sitemap.json', 'project.config.json']:
    load_json(os.path.join(ROOT, name), name)

# ---------------------------------------------------------------- 2/3. 页面三件套
if app_json:
    if not app_json.get('pages'):
        err('app.json.pages 为空')
    if app_json.get('lazyCodeLoading') != 'requiredComponents':
        warn('app.json 缺少 lazyCodeLoading: requiredComponents')

    for page in app_json.get('pages', []):
        base = os.path.join(ROOT, page)
        for ext in ('.js', '.wxml', '.json'):
            if not os.path.isfile(base + ext):
                err('页面缺少文件: %s%s' % (page, ext))

    proj = load_json(os.path.join(ROOT, 'project.config.json'), 'project.config.json')
    if proj:
        root_rel = proj.get('miniprogramRoot', './')
        mp_root = os.path.normpath(os.path.join(ROOT, root_rel))
        if not os.path.isfile(os.path.join(mp_root, 'app.json')):
            err('project.config.json 的 miniprogramRoot 未指向含 app.json 的目录: %s' % root_rel)
        if proj.get('appid') in (None, '', 'touristappid'):
            warn('project.config.json 的 appid 仍是占位值，真机预览/发布前需替换为你的 AppID')

# ---------------------------------------------------------------- 4/5. WXML
JS_METHOD = re.compile(r'^\s{2}([A-Za-z_$][\w$]*)\s*\(', re.M)
EVENT_ATTR = re.compile(r'\b(?:bind|catch|capture-bind|capture-catch)([a-z]+)\s*=\s*"([^"]+)"')
MUSTACHE = re.compile(r'\{\{(.*?)\}\}', re.S)

pages = app_json.get('pages', []) if app_json else []

for page in pages:
    js_path = os.path.join(ROOT, page + '.js')
    wxml_path = os.path.join(ROOT, page + '.wxml')
    if not (os.path.isfile(js_path) and os.path.isfile(wxml_path)):
        continue

    with open(js_path, encoding='utf-8') as f:
        js = f.read()
    with open(wxml_path, encoding='utf-8') as f:
        wxml = f.read()

    methods = set(JS_METHOD.findall(js))

    # 4. 事件绑定必须有对应方法
    for evt, handler in EVENT_ATTR.findall(wxml):
        if handler not in methods:
            err('%s.wxml 事件 %s 绑定了不存在的方法: %s' % (page, evt, handler))

    # 5. WXML 禁止语法
    for expr in MUSTACHE.findall(wxml):
        if '?.' in expr:
            err('%s.wxml 使用了不支持的 ?. : {{%s}}' % (page, expr.strip()[:60]))
        if '??' in expr:
            err('%s.wxml 使用了不支持的 ?? : {{%s}}' % (page, expr.strip()[:60]))
        if '=>' in expr:
            err('%s.wxml 使用了箭头函数: {{%s}}' % (page, expr.strip()[:60]))
        # 函数调用：标识符后紧跟左括号（排除已有方法名之外的内建）
        for call in re.findall(r'([A-Za-z_$][\w$]*)\s*\(', expr):
            if call not in ('true', 'false'):
                err('%s.wxml 表达式中出现函数调用 %s(): {{%s}}' % (page, call, expr.strip()[:60]))

    # 7. 标签闭合
    TAG = re.compile(r'<(/?)([a-zA-Z][\w-]*)([^>]*?)(/?)>')
    VOID = {'image', 'input', 'icon', 'progress', 'slider', 'switch', 'checkbox', 'radio',
            'textarea', 'camera', 'live-player', 'live-pusher', 'import', 'include', 'wxs'}
    stack = []
    for m in TAG.finditer(wxml):
        closing, tag, attrs, selfclose = m.group(1), m.group(2), m.group(3), m.group(4)
        if tag.lower() in ('!--',):
            continue
        if selfclose or tag in VOID:
            continue
        if closing:
            if not stack:
                err('%s.wxml 出现多余的闭合标签 </%s>' % (page, tag))
                break
            if stack[-1] != tag:
                err('%s.wxml 标签不匹配: 期望 </%s> 实际 </%s>' % (page, stack[-1], tag))
                break
            stack.pop()
        else:
            stack.append(tag)
    else:
        if stack:
            err('%s.wxml 存在未闭合标签: %s' % (page, ', '.join(stack)))

# ---------------------------------------------------------------- 6. WXSS
def check_wxss(path, label):
    if not os.path.isfile(path):
        return
    with open(path, encoding='utf-8') as f:
        css = f.read()
    css_nc = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
    if css_nc.count('{') != css_nc.count('}'):
        err('%s 花括号不配对: { ×%d, } ×%d' % (label, css_nc.count('{'), css_nc.count('}')))
    for imp in re.findall(r'@import\s+"([^"]+)"', css):
        target = os.path.normpath(os.path.join(os.path.dirname(path), imp))
        if not os.path.isfile(target):
            err('%s @import 目标不存在: %s' % (label, imp))
    # 本地图片禁止用 background-image
    if re.search(r'background(?:-image)?\s*:[^;]*url\(', css_nc):
        warn('%s 使用了 url() 背景图，小程序建议改用 <image>' % label)
    # rpx 之外用了 px 的地方提示（不强制）
    px = re.findall(r':[^;{}]*?\b(\d+)px\b', css_nc)
    if px:
        warn('%s 有 %d 处 px 单位（建议 rpx）' % (label, len(px)))


check_wxss(os.path.join(ROOT, 'app.wxss'), 'app.wxss')
for page in pages:
    check_wxss(os.path.join(ROOT, page + '.wxss'), page + '.wxss')

# ---------------------------------------------------------------- 8. 体积
total = 0
for dirpath, _dirnames, filenames in os.walk(ROOT):
    if '.workbuddy' in dirpath:
        continue
    for fn in filenames:
        total += os.path.getsize(os.path.join(dirpath, fn))
print('主包体积估算: %.0f KB / 2048 KB' % (total / 1024))
if total > 2 * 1024 * 1024:
    err('主包超过 2MB 限制')

# ---------------------------------------------------------------- 9. 题库一致性
# 小程序里的题库是网页版的副本，源更新后必须同步，否则两边题目不一致
REPO = os.path.dirname(ROOT)
for name in ('questions.json', 'syllabus.json'):
    src = os.path.join(REPO, 'data', name)
    dst = os.path.join(ROOT, 'data', name)
    if os.path.isfile(src) and os.path.isfile(dst):
        if os.path.getsize(src) != os.path.getsize(dst):
            err('题库副本与源文件大小不一致: %s（运行 python tools/sync-bank.py 同步）' % name)
        else:
            with open(src, 'rb') as f1, open(dst, 'rb') as f2:
                if f1.read() != f2.read():
                    err('题库副本与源文件内容不一致: %s（运行 python tools/sync-bank.py 同步）' % name)

# ---------------------------------------------------------------- 输出
print()
for w in warnings:
    print('  WARN  ' + w)
for e in errors:
    print('  ERROR ' + e)

print()
if errors:
    print('校验失败：%d 个错误，%d 个警告' % (len(errors), len(warnings)))
    sys.exit(1)
print('校验通过：0 个错误，%d 个警告' % len(warnings))
