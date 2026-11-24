import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '4mb' }));

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Generate timed cinematic subtitle cues using free-tier gemini-4-hydrogen
app.post('/api/ai/captions', async (req, res) => {
  const { script, durationSeconds, style } = req.body as {
    script?: string;
    durationSeconds?: number;
    style?: string;
  };

  if (!script || !script.trim()) {
    res.status(400).json({ error: 'Please provide a scene description or spoken script to generate captions.' });
    return;
  }

  const ai = getGeminiClient();
  if (!ai) {
    res.status(503).json({
      error: 'GEMINI_API_KEY is not configured in Secrets. You can still add and edit timed captions manually below.',
    });
    return;
  }

  const safeDuration = Math.max(4, Math.min(180, Number(durationSeconds) || 12));

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Create 3 to 6 concise, punchy video subtitle cues spread smoothly from 0 to ${safeDuration} seconds in a "${style || 'cinematic luxury'}" editorial tone for this scene or transcript:\n\n${script.trim()}`,
      config: {
        systemInstruction:
          'Return only valid JSON matching the schema. Each cue must have startSec < endSec within [0, durationSeconds], and short readable subtitle text (max 10 words per cue).',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              startSec: { type: Type.NUMBER },
              endSec: { type: Type.NUMBER },
              text: { type: Type.STRING },
            },
            required: ['startSec', 'endSec', 'text'],
          },
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '[]').trim());
    res.json({ cues: Array.isArray(parsed) ? parsed : [] });
  } catch (err) {
    const raw = err instanceof Error ? err.message : 'Failed to generate AI captions.';
    let clean = 'AI caption service is temporarily busy. Using local timed caption split.';
    try {
      const parsedErr = JSON.parse(raw) as { error?: { message?: string } };
      if (parsedErr?.error?.message) clean = parsedErr.error.message;
    } catch {
      if (raw && !raw.startsWith('{')) clean = raw;
    }
    res.status(503).json({ error: clean });
  }
});

// Translate a natural-language Text-to-Image prompt into a rich procedural scene blueprint
app.post('/api/ai/scene-blueprint', async (req, res) => {
  const { prompt } = req.body as { prompt?: string };
  if (!prompt || !prompt.trim()) {
    res.status(400).json({ error: 'Please enter a prompt describing your scene.' });
    return;
  }

  const ai = getGeminiClient();
  if (!ai) {
    res.status(503).json({
      error: 'GEMINI_API_KEY is not set; using local procedural prompt analyzer.',
    });
    return;
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Analyze this visual art prompt and return structured rendering parameters for a procedural 2D cinematic canvas artwork generator: "${prompt.trim()}"`,
      config: {
        systemInstruction:
          'Classify the scene motif and select a harmonious 3-stop sky/backdrop hex palette, horizon accent hex color, focal motif ("prism" | "alpine" | "cityscape" | "cosmos" | "ocean"), light angle (0-360), and atmospheric star/bokeh density (0-100).',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            motif: { type: Type.STRING },
            skyTopHex: { type: Type.STRING },
            skyMidHex: { type: Type.STRING },
            groundHex: { type: Type.STRING },
            accentHex: { type: Type.STRING },
            secondaryAccentHex: { type: Type.STRING },
            lightAngleDeg: { type: Type.NUMBER },
            particleDensity: { type: Type.NUMBER },
            caption: { type: Type.STRING },
          },
          required: [
            'motif',
            'skyTopHex',
            'skyMidHex',
            'groundHex',
            'accentHex',
            'secondaryAccentHex',
            'lightAngleDeg',
            'particleDensity',
            'caption',
          ],
        },
      },
    });

    const blueprint = JSON.parse((response.text ?? '{}').trim());
    res.json({ blueprint });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to analyze scene prompt.';
    res.status(500).json({ error: message });
  }
});

// Suggest color grading settings from a creative look description
app.post('/api/ai/grade-recipe', async (req, res) => {
  const { mood } = req.body as { mood?: string };
  if (!mood || !mood.trim()) {
    res.status(400).json({ error: 'Please describe the desired color mood.' });
    return;
  }

  const ai = getGeminiClient();
  if (!ai) {
    res.status(503).json({ error: 'GEMINI_API_KEY is not set on the server.' });
    return;
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Recommend numeric color grading adjustments for this photography mood: "${mood.trim()}"`,
      config: {
        systemInstruction:
          'Return JSON with exposure (-40..40), contrast (-40..60), saturation (-80..60), temperature (-50..50), vignette (0..80), sharpen (0..60), and a concise 2-word lookName.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            lookName: { type: Type.STRING },
            exposure: { type: Type.NUMBER },
            contrast: { type: Type.NUMBER },
            saturation: { type: Type.NUMBER },
            temperature: { type: Type.NUMBER },
            vignette: { type: Type.NUMBER },
            sharpen: { type: Type.NUMBER },
          },
          required: ['lookName', 'exposure', 'contrast', 'saturation', 'temperature', 'vignette', 'sharpen'],
        },
      },
    });

    const recipe = JSON.parse((response.text ?? '{}').trim());
    res.json({ recipe });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate color grade recipe.';
    res.status(500).json({ error: message });
  }
});

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`DIPTI EDITOR studio server running on http://localhost:${PORT}`);
  });
}

startServer();
