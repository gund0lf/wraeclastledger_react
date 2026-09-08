"""Build small runtime and Discord copies from preserved semantic icon masters.

Run from any directory with Python and Pillow. This only downsamples; it does
not crop, recolor, or regenerate artwork. The source manifest pins input bytes.
"""
from pathlib import Path
import argparse
import hashlib
import json
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
MASTERS = ROOT / 'resources/icons'
APP = ROOT / 'src/renderer/src/assets/semantic'
DISCORD = MASTERS / 'discord'
WEB_NAMES = {'wl_public', 'wl_home', 'wl_loot_league', 'wl_loot_other'}
APP_NAMES = {'wl_loot_league', 'wl_loot_other'}

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--website', type=Path, help='Explicit website source checkout for optional PNG derivatives.')
args = parser.parse_args()
web = None
if args.website is not None:
    website = args.website.resolve()
    if not (website / 'package.json').is_file() or not (website / 'public').is_dir():
        parser.error('--website must point to an existing website source checkout with package.json and public/.')
    web = website / 'public/icons/semantic'

for asset in json.loads((MASTERS / 'manifest.json').read_text(encoding='utf-8-sig'))['assets']:
    source = MASTERS / asset['file']
    assert hashlib.sha256(source.read_bytes()).hexdigest() == asset['sha256'], source
    with Image.open(source) as image:
        assert image.mode == 'RGBA', source
        targets = [(DISCORD, 128)]
        if web is not None and asset['name'] in WEB_NAMES:
            targets.append((web, 96))
        if asset['name'] in APP_NAMES:
            targets.append((APP, 96))
        for directory, size in targets:
            directory.mkdir(parents=True, exist_ok=True)
            dest = directory / source.name
            image.resize((size, size), Image.Resampling.LANCZOS).save(dest, optimize=True)
            assert dest.stat().st_size < 256 * 1024, dest
            print(f'{dest}: {dest.stat().st_size} bytes')
