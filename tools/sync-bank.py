#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把网页版的题库同步到小程序工程，生成 js 模块与首页题量统计。

为什么生成 .js 而不是 .json：
  微信开发者工具打包时把 .json 当配置文件处理，项目里的 data/questions.json
  不会被计入代码包。实测（preview --info-output）：
    只有代码时            TOTAL = 36,412 字节
    放入 1MB _probe.bin    TOTAL = 1,084,988 字节（差值正好 1MB）
  → data/ 目录会被打包，但其中的 .json 被当作配置跳过，598KB 题库贡献 0 字节。
  因此题库必须以 .js 模块形式存在，用 require 引入。

产物：
  miniprogram/data/questions.js   module.exports = [...]
  miniprogram/data/syllabus.js    module.exports = {...}
  miniprogram/data/counts.js      module.exports = {A,B,C,ALL}

用法：python tools/sync-bank.py
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(ROOT, 'data')
DST_DIR = os.path.join(ROOT, 'miniprogram', 'data')

# 小程序端保留的旧 JSON 文件，避免重复占包体积
LEGACY = ('questions.json', 'syllabus.json', 'counts.json')


def write_js(path, payload):
    """写成 module.exports，末尾换行保持文件规范"""
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write('module.exports = ')
        f.write(payload)
        f.write(';\n')


def build_counts(questions):
    """与 utils/questions.js 的 countByLevel 保持同一口径"""
    counts = {'A': 0, 'B': 0, 'C': 0, 'ALL': len(questions)}
    for q in questions:
        for lv in q.get('levels') or []:
            if lv in counts:
                counts[lv] += 1
    return counts


def main():
    os.makedirs(DST_DIR, exist_ok=True)

    for name in LEGACY:
        p = os.path.join(DST_DIR, name)
        if os.path.isfile(p):
            os.remove(p)
            print('已移除旧文件:', name)

    qsrc = os.path.join(SRC_DIR, 'questions.json')
    if os.path.isfile(qsrc):
        with open(qsrc, encoding='utf-8') as f:
            questions = json.load(f)
        payload = json.dumps(questions, ensure_ascii=False, separators=(',', ':'))
        dst = os.path.join(DST_DIR, 'questions.js')
        write_js(dst, payload)
        print('已生成: questions.js  %d 题  %.0fKB'
              % (len(questions), os.path.getsize(dst) / 1024))

        cpath = os.path.join(DST_DIR, 'counts.js')
        write_js(cpath, json.dumps(build_counts(questions), separators=(',', ':')))
        print('已生成: counts.js', build_counts(questions))
    else:
        print('跳过（源不存在）:', qsrc)

    ssrc = os.path.join(SRC_DIR, 'syllabus.json')
    if os.path.isfile(ssrc):
        with open(ssrc, encoding='utf-8') as f:
            syllabus = json.load(f)
        payload = json.dumps(syllabus, ensure_ascii=False, separators=(',', ':'))
        dst = os.path.join(DST_DIR, 'syllabus.js')
        write_js(dst, payload)
        print('已生成: syllabus.js  %.0fKB' % (os.path.getsize(dst) / 1024))
    else:
        print('跳过（源不存在）:', ssrc)


if __name__ == '__main__':
    main()
