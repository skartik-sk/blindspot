#!/bin/bash
# Renders each slide segment from timeline.json to an MP4 (1080p, 24 fps) with its build animation, using the ego
# browser to pose frames deterministically (window.setT). Serve this folder first: python3 -m http.server 8899
set -e
V="$(cd "$(dirname "$0")" && pwd)"
OUT="${OUT:-$V/out}"; FR="${FR:-/tmp/blindspot-frames}"
mkdir -p "$OUT" "$FR"
ONLY="$1" # optional: render one segment id
ego-browser nodejs <<JS
const fs = await import("node:fs/promises");
const tl = JSON.parse(await fs.readFile("$V/timeline.json", "utf8"));
const task = await taskSpace(4);
const page = task.page("p1");
await page.cdp("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await page.goto("http://127.0.0.1:8899/slides.html?anim#1", { timeout: 30000 });
await page.evaluate(() => document.fonts.ready.then(() => true));
await page.waitForTimeout(1200);
for (const seg of tl.segments) {
  if (!seg.slide || ("$ONLY" && seg.id !== "$ONLY")) continue;
  const dir = "$FR/" + seg.id; await fs.rm(dir, { recursive: true, force: true }); await fs.mkdir(dir, { recursive: true });
  await page.evaluate((n) => { location.hash = "#" + n; }, seg.slide);
  await page.waitForTimeout(300);
  await page.evaluate((d) => window.prep(d), seg.dur);
  const end = Math.min(seg.dur, seg.dur * 0.6 + 1.6);
  const frames = Math.ceil(end * 24);
  for (let f = 0; f < frames; f++) {
    await page.evaluate((t) => window.setT(t), f / 24);
    const s = await page.cdp("Page.captureScreenshot", { format: "jpeg", quality: 92, clip: { x: 0, y: 0, width: 1920, height: 1080, scale: 1 } });
    await fs.writeFile(dir + "/" + String(f).padStart(5, "0") + ".jpg", Buffer.from(s.data, "base64"));
  }
  console.log("frames", seg.id, frames);
}
await page.cdp("Emulation.clearDeviceMetricsOverride", {});
JS
python3 - "$V/timeline.json" "$ONLY" <<'PY' | while read id dur; do
import json,sys
for s in json.load(open(sys.argv[1]))["segments"]:
    if s.get("slide") and (not sys.argv[2] or s["id"]==sys.argv[2]): print(s["id"], s["dur"])
PY
  ffmpeg -y -loglevel error -framerate 24 -i "$FR/$id/%05d.jpg" -vf "tpad=stop_mode=clone:stop_duration=$dur,trim=duration=$dur,format=yuv420p" -r 24 -c:v libx264 -crf 18 -preset veryfast "$OUT/$id.mp4"
  echo "rendered $id ($dur s)"
done
