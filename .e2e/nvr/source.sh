#!/bin/sh
# Generates the rig's video source. A synthetic clip, not a real camera: the
# probe decides what is "seen", so the pixels only have to be a valid stream.
#
# Runs in a container so no ffmpeg is needed on the machine.
set -e
out="$(dirname "$0")/media/source.mp4"
mkdir -p "$(dirname "$out")"

if [ -f "$out" ]; then
  echo "source.mp4 already there"
  exit 0
fi

# 20 minutes, not 30 seconds: go2rtc's own looping ends the stream at EOF, and
# `#input=` flags land after the output URL where ffmpeg rejects them. A file
# longer than any run sidesteps the whole question, and testsrc compresses to
# almost nothing.
docker run --rm -v "$(cd "$(dirname "$out")" && pwd)":/out linuxserver/ffmpeg \
  -f lavfi -i testsrc=size=640x480:rate=5 -t 1200 \
  -c:v libx264 -pix_fmt yuv420p -g 10 -preset veryfast /out/source.mp4

echo "wrote $out"
