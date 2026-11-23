#!/usr/bin/env python3
"""Rebuild the Traditional Chinese font subsets in public/fonts/.

The app ships only the Chinese characters its own copy and demo menu use, so
the fonts stay around 200 KB each instead of 12 to 17 MB. Characters a shop
types that are outside the subset fall back to the device's own Chinese font.
Run this again after adding Chinese copy to src/.

Needs fonttools and brotli, and the two variable fonts from
https://github.com/google/fonts (ofl/notosanstc and ofl/notoseriftc):

    pip install fonttools brotli
    python3 scripts/subset-zh-fonts.py "NotoSansTC[wght].ttf" "NotoSerifTC[wght].ttf"

A character already in a shipped subset is kept, so a rebuild never drops one.
"""

import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
OUTPUTS = {"sans": ROOT / "public/fonts/noto-sans-tc.woff2", "serif": ROOT / "public/fonts/noto-serif-tc.woff2"}


def wanted() -> set[int]:
    chars = set(range(0x20, 0x7F))
    for path in [*ROOT.glob("src/**/*.ts"), *ROOT.glob("src/**/*.tsx")]:
        chars.update(ord(char) for char in path.read_text(encoding="utf-8") if ord(char) > 0x7F)
    for output in OUTPUTS.values():
        if output.exists():
            chars.update(TTFont(output).getBestCmap())
    return chars


def build(source: str, output: Path, unicodes: set[int]) -> None:
    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = ["*"]
    font = subset.load_font(source, options)
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=sorted(unicodes))
    subsetter.subset(font)
    subset.save_font(font, str(output), options)
    kept = len(TTFont(output).getBestCmap())
    print(f"{output.relative_to(ROOT)}: {kept} characters, {output.stat().st_size // 1024} KB")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    characters = wanted()
    build(sys.argv[1], OUTPUTS["sans"], characters)
    build(sys.argv[2], OUTPUTS["serif"], characters)
