#!/usr/bin/env node
"use strict";

/* Adds an ElevenLabs voiceover to the motion video.

   ELEVENLABS_API_KEY=… node voiceover.js <in.mp4> <out.mp4>

   The key is read from the environment only. Never put it in a file in
   this repo: the repo is public. Optional: ELEVENLABS_VOICE_ID,
   ELEVENLABS_MODEL_ID. Each line in narration.json becomes one clip,
   cached in vo/ (git-ignored) so re-runs only re-voice changed lines. */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const KEY = process.env.ELEVENLABS_API_KEY;
const VOICE = process.env.ELEVENLABS_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb";
const MODEL = process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2";
const [input, output] = process.argv.slice(2);

if (!input || !output) {
  console.error("usage: node voiceover.js <in.mp4> <out.mp4>");
  process.exit(1);
}
if (!KEY) {
  console.error("Set ELEVENLABS_API_KEY in the environment first.");
  process.exit(1);
}

const lines = JSON.parse(fs.readFileSync(path.join(__dirname, "narration.json"), "utf8")).lines;
const cacheDir = path.join(__dirname, "vo");
fs.mkdirSync(cacheDir, { recursive: true });

const duration = (file) =>
  parseFloat(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString());

async function voice(line, i) {
  const hash = crypto.createHash("sha1").update(`${VOICE}|${MODEL}|${line.text}`).digest("hex").slice(0, 10);
  const file = path.join(cacheDir, `${String(i).padStart(2, "0")}-${hash}.mp3`);
  if (fs.existsSync(file)) return file;
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": KEY, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({
      text: line.text,
      model_id: MODEL,
      // Neighbouring lines keep the intonation consistent across clips.
      previous_text: lines[i - 1]?.text,
      next_text: lines[i + 1]?.text,
      voice_settings: { stability: 0.55, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true },
    }),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status} on line ${i + 1}: ${(await res.text()).slice(0, 300)}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

(async () => {
  const clips = [];
  for (const [i, line] of lines.entries()) {
    const file = await voice(line, i);
    const len = duration(file);
    const over = line.at + len - line.until;
    console.log(`${String(i + 1).padStart(2)}  ${line.at.toFixed(1).padStart(5)}s  ${len.toFixed(1)}s${over > 0 ? `  OVERRUNS by ${over.toFixed(1)}s` : ""}`);
    clips.push({ file, at: line.at });
  }

  // Delay each clip to its start time, mix them, and lay the result under the
  // untouched video stream.
  const args = ["-y", "-hide_banner", "-loglevel", "error", "-i", input];
  for (const c of clips) args.push("-i", c.file);
  const delays = clips.map((c, i) => `[${i + 1}:a]adelay=${Math.round(c.at * 1000)}:all=1[a${i}]`);
  const mix = `${clips.map((_, i) => `[a${i}]`).join("")}amix=inputs=${clips.length}:normalize=0,apad[vo]`;
  args.push(
    "-filter_complex", [...delays, mix].join(";"),
    "-map", "0:v", "-map", "[vo]",
    "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart",
    output
  );
  execFileSync("ffmpeg", args, { stdio: ["ignore", "ignore", "inherit"] });
  console.log(`Wrote ${output}`);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
