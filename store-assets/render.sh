#!/usr/bin/env bash
# Renders the Chrome Web Store images as 24-bit PNGs (no alpha):
#   src/slides.html -> {light,dark}/screenshot-1..5.png  (1280x800)
#   src/promo.html  -> {light,dark}/promo-small.png       (440x280)
#                      {light,dark}/promo-marquee.png     (1400x560)
# Needs Chrome and Python with Pillow. Usage: bash store-assets/render.sh
set -e
cd "$(dirname "$0")"
CHROME="${CHROME:-/c/Program Files/Google/Chrome/Application/chrome.exe}"
PROFILE="$(mktemp -d)"
winpath() { cygpath -w "$1" 2>/dev/null || echo "$1"; }
fileurl() { echo "file:///$(cygpath -m "$PWD/$1" 2>/dev/null || echo "$PWD/$1")"; }

# render <url> <out> <width> <height> <scale>: captures at <scale>x, then crops and resizes to exactly width x height.
render() {
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --allow-file-access-from-files \
    --user-data-dir="$PROFILE" --window-size="$3,$4" --force-device-scale-factor="$5" \
    --virtual-time-budget=5000 --screenshot="$(winpath "$PWD/$2")" "$1" >/dev/null 2>&1
  python - "$2" "$3" "$4" "$5" <<'EOF'
import sys
from PIL import Image
path, w, h, s = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4])
im = Image.open(path).convert('RGB').crop((0, 0, w * s, h * s))
if s != 1:
    im = im.resize((w, h), Image.LANCZOS)
im.save(path, optimize=True)
EOF
  echo "$2"
}

for theme in light dark; do
  mkdir -p "$theme"
  for n in 1 2 3 4 5; do
    render "$(fileurl src/slides.html)?slide=$n&theme=$theme" "$theme/screenshot-$n.png" 1280 800 1
  done
  render "$(fileurl src/promo.html)?tile=small&theme=$theme" "$theme/promo-small.png" 440 280 2
  render "$(fileurl src/promo.html)?tile=marquee&theme=$theme" "$theme/promo-marquee.png" 1400 560 2
done
rm -rf "$PROFILE"
