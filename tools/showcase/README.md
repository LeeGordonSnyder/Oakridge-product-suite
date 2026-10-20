# Showcase (staff-meeting reveal)

Stills and, later, the animated tutorial for presenting the app.

- `capture.js`: fresh full-screen iPhone 15 Pro captures (393×852 pt at 3×) of every
  screen used in the video, against the mocked backend in
  `tools/guides/mockdata.js`. The clock is fixed at 11:20am so the shift card shows
  "now". Serve the repo root on :8765, then `node tools/showcase/capture.js`.
- `frames/style.html`: the style frames. Each `<section>` is one 1920×1080 frame.
  `node tools/showcase/render.js` writes them to `out/` (git-ignored).
- `frames/sheets/`: real Google Sheets screenshots for the monitor shots. They show
  staff names, so the folder is git-ignored and stays on your machine.

Look: white background, near-black text (#1D1D1F) with grey for secondary text, Inter /
Inter Display. The app is shown on an iPhone and anything in Sheets on a monitor.
The old ways are grey line drawings.
