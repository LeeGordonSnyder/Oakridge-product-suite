# Motion sequence (~1:47)

Source for `docs/media/oakridge-product-suite-motion.mp4`: a Three.js scene
plus an HTML kinetic-type layer. Every frame is a pure function of time
(`window.renderAt(t)` in `scene.js`), so the render is deterministic.

```bash
cd tools/motion
npm install                                   # three + fonts
python3 -m http.server 8790 &
node render.js 0 3219 30 frames               # split the range across 4 processes to go ~3x faster
ffmpeg -framerate 30 -i frames/%05d.png -vf format=yuv420p \
  -c:v libx264 -preset slow -crf 18 -movflags +faststart out.mp4
```

Pacing lives in the TIMELINE block at the top of `scene.js`: the six page
durations, then the back-end, sync and finale panels. Each text panel holds
for 6–9 seconds. Change a duration there and everything after it shifts.
`window.DURATION` gives the total length (frames = DURATION × 30).

`docs/media/oakridge-product-suite-teaser-15s.mp4` is the earlier 15-second cut.

`assets/` holds the app screenshots used on the 3D phones. They come from
`tools/guides/shots.js`; re-copy them after a UI change.
