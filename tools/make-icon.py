#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成「电波题库」小程序头像：纯标准库栅格化 + PNG 编码。
几何定义与 assets/icon.svg 一致（本地 100x100 坐标系，再等比放大）。
用法：python tools/make-icon.py
"""
import math
import os
import struct
import zlib

BG = (0x0F, 0x76, 0x6E)      # #0F766E 主题深青绿
FG = (0xFF, 0xFF, 0xFF)      # 白色

CX, CY = 18.0, 82.0          # 弧心（本地坐标）
RADII = (20.0, 37.0, 54.0)   # 三条弧半径
STROKE = 7.0                 # 线宽
DOT_R = 7.0                  # 圆点半径
# 让图形在画布中居中：bbox 实际为 x[11, 75.5] y[24.5, 89]，中心 (43.25, 56.75) -> (50, 50)
OX, OY = 6.75, -6.75
MARK = 64.5                  # bbox 边长（本地坐标）
FILL_RATIO = 0.66            # 图形 bbox 占画布边长比例（四周留白约 17%）


def _seg_dist(px, py, ax, ay, bx, by):
    vx, vy = bx - ax, by - ay
    wx, wy = px - ax, py - ay
    L2 = vx * vx + vy * vy
    t = 0.0 if L2 == 0 else max(0.0, min(1.0, (wx * vx + wy * vy) / L2))
    dx, dy = wx - t * vx, wy - t * vy
    return math.hypot(dx, dy)


def coverage(x, y, scale, offset):
    """
    x, y: 像素坐标；scale: 本地单位 -> 像素；offset: 画布中心像素
    返回该点被白色图形覆盖的强度 0..1（用距离场做抗锯齿）
    """
    # 像素 -> 本地坐标
    lx = (x - offset) / scale + 50.0 - OX
    ly = (y - offset) / scale + 50.0 - OY

    half = STROKE / 2.0

    # 圆点
    best = math.hypot(lx - CX, ly - CY) - DOT_R

    # 三条四分之一弧（方向：正上方 -> 正右方）
    vx, vy = lx - CX, ly - CY
    d = math.hypot(vx, vy)
    in_quad = (vx >= 0.0 and vy <= 0.0)
    for r in RADII:
        if in_quad:
            dist = abs(d - r) - half
        else:
            # 象限外：按端点的圆头收边处理
            d1 = math.hypot(lx - CX, ly - (CY - r))   # 起点（正上方）
            d2 = math.hypot(lx - (CX + r), ly - CY)   # 终点（正右方）
            dist = min(d1, d2) - half
        best = min(best, dist)

    # 抗锯齿：距离场 1px 过渡带
    px = best * scale
    return max(0.0, min(1.0, 0.5 - px))


def render(size):
    offset = size / 2.0
    scale = size * FILL_RATIO / MARK
    rows = []
    for y in range(size):
        row = bytearray()
        row.append(0)  # PNG filter type 0
        for x in range(size):
            a = coverage(x + 0.5, y + 0.5, scale, offset)
            r = int(BG[0] + (FG[0] - BG[0]) * a + 0.5)
            g = int(BG[1] + (FG[1] - BG[1]) * a + 0.5)
            b = int(BG[2] + (FG[2] - BG[2]) * a + 0.5)
            row += bytes((r, g, b))
        rows.append(bytes(row))
    return b''.join(rows)


def write_png(path, size):
    raw = render(size)
    def chunk(tag, data):
        return (struct.pack('>I', len(data)) + tag + data +
                struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF))
    png = (b'\x89PNG\r\n\x1a\n'
           + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
           + chunk(b'IDAT', zlib.compress(raw, 9))
           + chunk(b'IEND', b''))
    with open(path, 'wb') as f:
        f.write(png)
    print('wrote', path, size, 'x', size, '%.0fKB' % (os.path.getsize(path) / 1024))


if __name__ == '__main__':
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
    out = os.path.join(root, 'assets')
    os.makedirs(out, exist_ok=True)
    for s in (1024, 512, 144):
        write_png(os.path.join(out, 'icon-%d.png' % s), s)
