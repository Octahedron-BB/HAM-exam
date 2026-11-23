#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""校验生成的 icon PNG：解码像素，检查包围盒/留白/颜色是否与设计一致。"""
import struct
import sys
import zlib


def read_png(path):
    data = open(path, 'rb').read()
    assert data[:8] == b'\x89PNG\r\n\x1a\n'
    pos, w = 8, None
    idat = b''
    while pos < len(data):
        ln = struct.unpack('>I', data[pos:pos + 4])[0]
        tag = data[pos + 4:pos + 8]
        body = data[pos + 8:pos + 8 + ln]
        if tag == b'IHDR':
            w, h, depth, ctype = struct.unpack('>IIBB', body[:10])
            assert depth == 8 and ctype == 2, '仅支持 8bit RGB'
        elif tag == b'IDAT':
            idat += body
        pos += 12 + ln
    raw = zlib.decompress(idat)
    stride = w * 3 + 1
    rows, prev = [], bytearray(w * 3)
    for y in range(h):
        f = raw[y * stride]
        line = bytearray(raw[y * stride + 1:(y + 1) * stride])
        if f == 1:
            for i in range(3, len(line)):
                line[i] = (line[i] + line[i - 3]) & 0xFF
        elif f == 2:
            for i in range(len(line)):
                line[i] = (line[i] + prev[i]) & 0xFF
        elif f == 3:
            for i in range(len(line)):
                a = line[i - 3] if i >= 3 else 0
                line[i] = (line[i] + ((a + prev[i]) >> 1)) & 0xFF
        elif f == 4:
            for i in range(len(line)):
                a = line[i - 3] if i >= 3 else 0
                c = prev[i - 3] if i >= 3 else 0
                b = prev[i]
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pr) & 0xFF
        rows.append(bytes(line))
        prev = line
    return w, h, rows


def check(path):
    w, h, rows = read_png(path)
    minx, miny, maxx, maxy = w, h, -1, -1
    bg_ok = rows[0][0:3] == b'\x0f\x76\x6e'
    dark = 0
    for y in range(h):
        row = rows[y]
        for x in range(w):
            r, g, b = row[x * 3], row[x * 3 + 1], row[x * 3 + 2]
            if r > 200 and g > 200 and b > 200:
                dark += 1
                minx = min(minx, x); maxx = max(maxx, x)
                miny = min(miny, y); maxy = max(maxy, y)
    bw, bh = maxx - minx + 1, maxy - miny + 1
    print(f'{path}')
    print(f'  尺寸 {w}x{h}  背景色 #0F766E: {bg_ok}')
    print(f'  白色像素 {dark} ({dark / (w * h) * 100:.1f}%)')
    print(f'  包围盒 x[{minx},{maxx}] y[{miny},{maxy}]  宽{bw} 高{bh} 边长占比 {max(bw, bh) / w * 100:.1f}%')
    print(f'  四边留白 上{miny} 下{h - 1 - maxy} 左{minx} 右{w - 1 - maxx}')
    lr = abs(miny - (h - 1 - maxy)); tb = abs(minx - (w - 1 - maxx))
    print(f'  居中偏差 上下{lr}px 左右{tb}px  长宽差 {abs(bw - bh)}px')


for p in sys.argv[1:]:
    check(p)
