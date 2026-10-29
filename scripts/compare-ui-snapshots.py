"""Compare CUA-captured UI snapshots with reviewed baselines; no browser automation."""
import argparse
import json
from pathlib import Path
from PIL import Image, ImageChops, ImageFilter

ROOT = Path(__file__).resolve().parents[1]


def changed_ratio(baseline, actual, threshold):
    if baseline.size != actual.size:
        return 1.0, None
    # Slight blur tolerates JPEG/subpixel noise without hiding spacing or wrapping changes.
    difference = ImageChops.difference(
        baseline.convert('RGB').filter(ImageFilter.GaussianBlur(0.4)),
        actual.convert('RGB').filter(ImageFilter.GaussianBlur(0.4)),
    )
    channels = [channel.point(lambda value: 255 if value > threshold else 0) for channel in difference.split()]
    mask = ImageChops.lighter(ImageChops.lighter(channels[0], channels[1]), channels[2])
    return mask.histogram()[255] / (baseline.width * baseline.height), mask


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--actual', type=Path, required=True, help='Folder containing fresh case-name.jpg screenshots')
    parser.add_argument('--baseline', type=Path, default=ROOT / 'tests/visual/baselines')
    parser.add_argument('--output', type=Path, default=ROOT / 'tests/visual/diffs')
    parser.add_argument('--threshold', type=int, default=25, help='Per-channel tolerance (0–255)')
    parser.add_argument('--max-changed', type=float, default=0.005, help='Maximum changed pixel ratio')
    args = parser.parse_args()
    cases = json.loads((ROOT / 'tests/visual/cases.json').read_text(encoding='utf-8'))
    failed = False
    for case in cases:
        name = case['name']
        baseline_path, actual_path = args.baseline / f'{name}.jpg', args.actual / f'{name}.jpg'
        if not baseline_path.is_file() or not actual_path.is_file():
            print(f'FAIL {name}: missing baseline or actual screenshot')
            failed = True
            continue
        with Image.open(baseline_path) as baseline, Image.open(actual_path) as actual:
            expected_size = (case['width'], case['height'])
            if baseline.size != expected_size or actual.size != expected_size:
                print(f'FAIL {name}: expected {expected_size}, got baseline={baseline.size}, actual={actual.size}')
                failed = True
                continue
            ratio, mask = changed_ratio(baseline, actual, args.threshold)
            passed = ratio <= args.max_changed
            print(f'{"PASS" if passed else "FAIL"} {name}: {ratio:.3%} pixels changed')
            if not passed:
                failed = True
                args.output.mkdir(parents=True, exist_ok=True)
                Image.composite(Image.new('RGB', actual.size, '#ff2457'), actual.convert('RGB'), mask).save(args.output / f'{name}.png')
    return int(failed)


if __name__ == '__main__':
    raise SystemExit(main())
