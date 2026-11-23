#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把网页版的题库同步到小程序工程，并生成首页用的题量统计。

小程序的包是独立目录，无法引用上级目录的文件，所以题库需要副本。
源题库（data/*.json）更新后跑一次本脚本即可。

同时生成 miniprogram/data/counts.json —— 首页只需几百字节就能显示各级题量，
不必为了四个数字去解析 600KB 题库。

用法：python tools/sync-bank.py
"""
import hashlib
import json
import os
import shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(ROOT, 'data')
DST_DIR = os.path.join(ROOT, 'miniprogram', 'data')


def digest(path):
    with open(path, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()


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

    for name in ('questions.json', 'syllabus.json'):
        src = os.path.join(SRC_DIR, name)
        dst = os.path.join(DST_DIR, name)
        if not os.path.isfile(src):
            print('跳过（源不存在）:', name)
            continue
        if os.path.isfile(dst) and digest(src) == digest(dst):
            print('已一致:', name)
            continue
        shutil.copyfile(src, dst)
        print('已同步:', name, '%.0fKB' % (os.path.getsize(dst) / 1024))

    # 题量统计
    qpath = os.path.join(DST_DIR, 'questions.json')
    if os.path.isfile(qpath):
        with open(qpath, encoding='utf-8') as f:
            questions = json.load(f)
        counts = build_counts(questions)
        cpath = os.path.join(DST_DIR, 'counts.json')
        with open(cpath, 'w', encoding='utf-8', newline='\n') as f:
            json.dump(counts, f, ensure_ascii=False, separators=(',', ':'))
        print('已生成: counts.json', counts)


if __name__ == '__main__':
    main()
