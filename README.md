# CRDF — Claim vs Reality Determination Framework

Multimodal fact-checking and claim verification framework assessing text, image manipulation, video signals, and document OCR.

## Run Locally

> **Important Note:** The AI Studio preview runs in a remote cloud sandbox and cannot reach a backend running on your local machine (`127.0.0.1` / `localhost`). When running in the AI Studio preview, the app automatically switches to Mock Mode so you can preview all UI states and features. To perform real analysis with your live Python backend, run the app locally.

### Steps to run locally:

1. **Start the backend:**
   In this folder, run:
   ```bash
   pip install -r requirements.txt
   cp .env.example .env   # then fill in GEMINI_API_KEY and SERPER_API_KEY
   uvicorn web_app:app --host 127.0.0.1 --port 8000
   ```

2. **Install frontend dependencies:**
   In this folder, run:
   ```bash
   npm install
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```

4. **Open the application:**
   Navigate in your browser to:
   ```
   http://localhost:3000
   ```

5. **Environment configuration:**
   Configure `VITE_BACKEND_URL=http://127.0.0.1:8000` (and optional `VITE_API_KEY`) in your `.env` or `.env.local` file. **Restart `npm run dev` after any `.env` change.**

## How it works

`POST /analyze` (multipart: `claim`, optional `session_id`, `image`, `video`, `document`) runs the pipeline in `crdf_pipeline.py`:
uploaded files are checked by Gemini (manipulation + content match, or OCR), the findings are added to the claim as
*Multimodal Context*, and the remaining tasks in `crew.jsonc` run as a CrewAI crew. The Report Writer's markdown report comes back as
`text_pipeline_report`, and `POST /generate_pdf` lays that report out as a PDF (title block, header table, verdict/confidence banner,
numbered sections, references). Edit `crew.jsonc` / `agents/*.jsonc` to change agents and tasks.

## Tests

```bash
pip install -r requirements-dev.txt
pytest tests -v
npm run lint
```
