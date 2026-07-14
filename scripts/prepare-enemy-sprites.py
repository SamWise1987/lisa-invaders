#!/usr/bin/env python3
"""Converte foto prodotto su sfondo bianco in sprite PNG trasparenti per il gioco."""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / 'assets' / 'source'
OUT_DIR = ROOT / 'assets'
TARGET_HEIGHT = 600
WHITE_FUZZ = 28

ENEMIES = (
    'lustweiser',
    'necks',
    'borona',
    'bennets',
)


def find_source(name: str) -> Path | None:
    for ext in ('.png', '.jpg', '.jpeg', '.webp'):
        path = SOURCE_DIR / f'{name}{ext}'
        if path.exists():
            return path
    return None


def prepare(path_in: Path, path_out: Path, height: int = TARGET_HEIGHT, fuzz: int = WHITE_FUZZ) -> tuple[int, int]:
    img = Image.open(path_in).convert('RGBA')
    data = np.array(img)
    r, g, b = data[:, :, 0], data[:, :, 1], data[:, :, 2]
    white = (r >= 255 - fuzz) & (g >= 255 - fuzz) & (b >= 255 - fuzz)
    data[:, :, 3] = np.where(white, 0, 255)
    img = Image.fromarray(data)
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)
    width, img_height = img.size
    new_width = max(1, int(width * height / img_height))
    img = img.resize((new_width, height), Image.Resampling.LANCZOS)
    path_out.parent.mkdir(parents=True, exist_ok=True)
    img.save(path_out, 'PNG', optimize=True)
    return img.size


def main() -> int:
    missing = []
    for name in ENEMIES:
        source = find_source(name)
        if not source:
            missing.append(name)
            continue
        size = prepare(source, OUT_DIR / f'{name}.png')
        print(f'OK {name}: {source.name} -> {size[0]}x{size[1]}')

    if missing:
        print('File mancanti in assets/source/:', ', '.join(f'{n}.png' for n in missing), file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
