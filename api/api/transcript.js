import { exec } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import OpenAI from "openai";

const execAsync = promisify(exec);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: "Missing YouTube URL" });
  }

  const tmpDir = "/tmp";
  const audioPath = path.join(tmpDir, "audio.mp3");

  try {
    // 1. Download audio from YouTube
    await execAsync(
      `yt-dlp -x --audio-format mp3 -o "${audioPath}" "${url}"`
    );

    // 2. Send audio to Whisper
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(audioPath),
      model: "whisper-1",
    });

    return res.status(200).json({
      transcript: transcription.text,
      language: transcription.language || "unknown",
      source: "whisper",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: "Failed to extract or transcribe video",
    });
  }
}
