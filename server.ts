import express from 'express';
import path from 'path';
import multer from 'multer';
import { GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Initialize Gemini client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// Configure multer for file uploads in memory
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json());

// API route for document/OCR analysis
app.post('/api/analyze', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const { buffer, mimetype } = req.file;
    const base64EncodeString = buffer.toString('base64');

    const imagePart = {
      inlineData: {
        mimeType: mimetype,
        data: base64EncodeString,
      },
    };

    const textPart = {
      text: `You are the Document & OCR Analysis Agent in CRDF. You are given an uploaded document, image, or screenshot. Your job is to extract all readable text accurately and prepare it for downstream claim verification.

Rules:
1. Extract text exactly as it appears — do not paraphrase, correct spelling, or "clean up" the original wording; downstream agents need the literal source text.
2. If the image/document quality is poor and parts are illegible, mark those sections explicitly as [illegible] rather than guessing at the content.
3. Preserve structural context where relevant — headings, captions, table data, and any visible dates, sources, or bylines should be extracted separately and labeled.
4. If the uploaded file contains no readable text at all (e.g. a blank image or pure photograph with no text), state this explicitly rather than fabricating placeholder text.
5. Note any visible signs the document may be a screenshot of a screenshot, a cropped/edited image, or otherwise not an original — this is a signal for the Image Authenticity Agent downstream, not something to resolve yourself.

Output: extracted_text (string, literal transcription), structural_elements (object: headings, captions, dates, sources, bylines, table_data — each array, empty if none), illegible_sections (array), authenticity_flags (array, empty if none), text_found (boolean).
`,
    };

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: { parts: [imagePart, textPart] },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            extracted_text: {
              type: Type.STRING,
              description: 'Literal transcription of the readable text. Note if no readable text is found.',
            },
            structural_elements: {
              type: Type.OBJECT,
              properties: {
                headings: { type: Type.ARRAY, items: { type: Type.STRING } },
                captions: { type: Type.ARRAY, items: { type: Type.STRING } },
                dates: { type: Type.ARRAY, items: { type: Type.STRING } },
                sources: { type: Type.ARRAY, items: { type: Type.STRING } },
                bylines: { type: Type.ARRAY, items: { type: Type.STRING } },
                table_data: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Extracted data from any tables found in the document.' },
              },
            },
            illegible_sections: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'List of illegible sections if any.',
            },
            authenticity_flags: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'List of signs the document might not be an original.',
            },
            text_found: {
              type: Type.BOOLEAN,
              description: 'True if readable text is found, false otherwise.',
            },
          },
          required: ['extracted_text', 'structural_elements', 'illegible_sections', 'authenticity_flags', 'text_found'],
        },
      },
    });

    const output = response.text;
    res.json(JSON.parse(output || '{}'));
  } catch (error: any) {
    console.error('Error analyzing document:', error);
    
    // Specific handling for Quota Exceeded
    if (error.status === 429 || (error.message && error.message.includes('429'))) {
      return res.status(429).json({ 
        error: 'API Quota Exceeded. Please try again in a few minutes or check your Gemini API key limits.' 
      });
    }

    res.status(500).json({ error: 'Failed to analyze the document. Please try again later.' });
  }
});

async function startServer() {
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
