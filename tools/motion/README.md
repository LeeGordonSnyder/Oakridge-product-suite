# Motion sequence (15s)

Source for `docs/media/oakridge-product-suite-motion.mp4`: a Three.js scene
plus an HTML kinetic-type layer. Every frame is a pure function of time
(`window.renderAt(t)` in `scene.js`), so the render is deterministic.

```bash
cd tools/motion
npm install                                   # three + fonts
python3 -m http.server 8790 &
node render.js 0 900 60 frames                # 60fps frames (split the range across processes to go faster)
ffmpeg -framerate 60 -i frames/%05d.png \
  -vf "tmix=frames=2:weights='1 1',fps=30,format=yuv420p" \
  -c:v libx264 -preset slow -crf 17 -movflags +faststart out.mp4
```

`assets/` holds the app screenshots used on the 3D phones. They come from
`tools/guides/shots.js`; re-copy them after a UI change.
