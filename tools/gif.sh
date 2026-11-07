#!/bin/zsh
# Frames from capture.mjs -> an optimised GIF for a README.
#   tools/gif.sh <frames-dir> <out.gif> [width=720] [fps=14]
set -e
IN=${1:?frames dir}; OUT=${2:?out.gif}; W=${3:-720}; FPS=${4:-14}
ffmpeg -v error -y -framerate $FPS -pattern_type glob -i "$IN/f*.jpg" \
  -vf "scale=$W:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=192:stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle" \
  -loop 0 "$OUT"
ls -la "$OUT" | awk '{print $5, $NF}'
