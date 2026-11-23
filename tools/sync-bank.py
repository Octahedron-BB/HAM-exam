#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把网页版的题库同步到小程序工程。

小程序的包是独立目录，无法引用上级目录的文件，所以题库需要副本。
源题库（data/*.json）更新后跑一次本脚本即可。

用法：python tools/sync-bank.py
"""
import hashlib
import os
import shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(ROOT, 'data')
DST_DIR = os.path.join(ROOT, 'miniprogram', 'data')


def digest(path):
    with open(path, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()


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


if __name__ == '__main__':
    main()
