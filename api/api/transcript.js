import { exec } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import OpenAI from "openai";

const execAsync = promisify(exec);

// CORS (per Hoppscotch/Browser e chiamate cross-origin)
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export default async function handler(req, res) {
  // 1) CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders);
    return res.end();
  }

  // 2) CORS headers su tutte le risposte
  for (const [k, v] of Object.entries(corsHeaders)) {
    res.setHeader(k, v);
  }

  // 3) Solo POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // 4) Validazione input
  const { url } = req.body || {};
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "Missing YouTube URL" });
  }

  // 5) Validazione env var
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "OPENAI_API_KEY is not set" });
  }

  const tmpDir = "/tmp";
  const audioPath = path.join(tmpDir, `audio-${Date.now()}.mp3`);

  try {
    // 6) Download audio from YouTube (yt-dlp)
    // NB: su Vercel potrebbe NON esistere yt-dlp => lo vedrai nei logs
    const cmd = `yt-dlp -x --audio-format mp3 -o "${audioPath}" "${url}"`;
    await execAsync(cmd);

    // 7) Whisper transcription
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(audioPath),
      model: "whisper-1",
    });

    // cleanup best-effort
    try {
      fs.unlinkSync(audioPath);
    } catch (_) {}

    return res.status(200).json({
      transcript: transcription.text,
      language: transcription.language || "unknown",
      source: "whisper",
    });
  } catch (error) {
    console.error("TRANSCRIPT_ERROR:", error);

    // prova a ripulire anche in errore
    try {
      if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
    } catch (_) {}

    // restituiamo un messaggio più utile
    return res.status(500).json({
      error: "Failed to extract or transcribe video",
      hint:
        "Check Vercel Runtime Logs. Common cause on Vercel: yt-dlp not found.",
    });
  }
}
