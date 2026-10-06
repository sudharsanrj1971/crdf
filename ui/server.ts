import express from 'express';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';

const app = express();
const PORT = 3000;

// Increase payload size limit for base64 images
app.use(express.json({ limit: '50mb' }));

// Initialize Gemini
let ai: GoogleGenAI | null = null;
function getAI() {
  if (!ai) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('GEMINI_API_KEY environment variable is required');
    }
    ai = new GoogleGenAI({ 
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return ai;
}

app.post('/api/analyze', async (req, res) => {
  try {
    const { imageBase64, mimeType, claim } = req.body;

    if (!imageBase64 || !claim) {
      return res.status(400).json({ error: 'Image and claim are required' });
    }

    const aiClient = getAI();
    
    const prompt = `You are the Image & Visual Authenticity Agent in CRDF. You are given an uploaded image submitted as evidence for the following claim:
Claim: "${claim}"

Your job is to assess whether the image shows signs of manipulation, out-of-context reuse, or fabrication.

Rules:
1. Look for direct manipulation signs: inconsistent lighting/shadows, cloning artifacts, warped edges, mismatched resolution between regions, visible compositing seams.
2. Look for context-mismatch signs: watermarks or metadata suggesting the image is from an unrelated event, weather/seasonal cues inconsistent with the claimed date/location, visible timestamps that don't match the claim.
3. Do not claim an image is manipulated without citing a specific visual artifact you observed — a vague "looks suspicious" is not sufficient grounds to flag.
4. If the image appears authentic and consistent with the claim's context, say so explicitly rather than defaulting to suspicion.
5. Distinguish between "this image has been edited" and "this image doesn't support the specific claim it's attached to" — these are different findings and should not be conflated.

Return your assessment strictly as JSON matching this schema:
{
  "authenticity_assessment": "authentic" | "likely_manipulated" | "inconclusive",
  "specific_artifacts_observed": string[],
  "context_consistency": "matches_claim" | "contradicts_claim" | "cannot_determine",
  "confidence": number (between 0 and 1)
}`;

    const response = await aiClient.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: {
        parts: [
          { text: prompt },
          {
            inlineData: {
              data: imageBase64,
              mimeType: mimeType || 'image/jpeg',
            },
          },
        ],
      },
      config: {
        responseMimeType: 'application/json',
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error("No output from Gemini API");
    }

    const result = JSON.parse(text);
    res.json(result);
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
