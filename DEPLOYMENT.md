# CRDF System - Deployment Guide

## Free hosting (recommended split)

The Python backend (FastAPI + CrewAI) and the React frontend deploy separately.
Prices/limits change - re-check before relying on them.

| Part | Platform | Why / caveats |
|------|----------|---------------|
| Frontend (static `dist/`) | **Cloudflare Pages** (or Netlify) | Free static hosting, no personal-use-only clause. Vercel Hobby also works but is non-commercial only. |
| Backend (Docker) | **Render free web service** | No card needed; 512 MB RAM and spins down after 15 idle min (about 1 min cold start); Render says not for production. CrewAI + matplotlib is tight in 512 MB - if it OOMs, use Google Cloud Run (free quota, card required) with 1-2 GiB. |
| Not free | Hugging Face Docker Spaces | HF docs now require a paid plan to create Docker Spaces. |

### Steps
1. **Backend (Render):** New > Blueprint > pick this repo (uses `render.yaml`). Set `GEMINI_API_KEY`, `SERPER_API_KEY`. Set `CORS_ORIGINS` to your frontend URL (or leave `*`). Check `https://<service>.onrender.com/health` returns `"ready": true`.
2. **Frontend (Cloudflare Pages / Netlify / Vercel):** build command `npm run build`, output `dist`, env var `VITE_BACKEND_URL=https://<service>.onrender.com` (no trailing slash).
3. Open the site: the header should show the backend as connected. First request after idle takes about a minute (cold start).

### Local run (no Docker)
```bash
pip install -r requirements.txt && uvicorn web_app:app --port 8000   # terminal 1
npm install && npm run dev                                          # terminal 2 (Vite proxies /analyze,/generate_pdf,/health)
```
Single-origin alternative: `npm run build && NODE_ENV=production npm start` (gateway proxies to `PYTHON_BACKEND_URL`).

---


## Architecture Overview

The CRDF system consists of two containerized services:

| Service | Technology | Container | Port |
|---------|-----------|-----------|------|
| **Backend** | FastAPI + CrewAI (16 agents) + multimodal checks | `crdf-backend` | 8000 |
| **Frontend** | React + Vite (static build served by Nginx) | `crdf-frontend` | 80 |

```
┌──────────────┐      ┌──────────────┐
│   Frontend   │──────│   Backend    │
│  (Nginx:80)  │proxy │ (uvicorn:8000)│
│  Static SPA  │ ───► │  FastAPI API  │
└──────────────┘      └──────────────┘
       │                     │
       │                ┌────┴────┐
       │                │ Gemini  │
       │                │ Serper  │
       │                │  APIs   │
       │                └─────────┘
     Browser
```

Nginx reverse-proxies `/analyze`, `/generate_pdf`, and `/health` to the backend. All other routes serve the React SPA with client-side routing fallback.

---

## Prerequisites

- **Docker** ≥ 24.0 and **Docker Compose** ≥ 2.20
- API keys for:
  - [Google Gemini](https://aistudio.google.com/apikey) (`GEMINI_API_KEY`)
  - [Serper](https://serper.dev/) (`SERPER_API_KEY`)

---

## Quick Start (Docker Compose)

### 1. Clone and configure

```bash
git clone <your-repo-url> crdf_system
cd crdf_system
cp .env.example .env
```

Edit `.env` and fill in your API keys:

```env
GEMINI_API_KEY=your-real-key-here
SERPER_API_KEY=your-real-key-here
```

> **⚠️ Never commit `.env` to version control.** The `.gitignore` already excludes it.

### 2. Build and start

```bash
docker compose up --build -d
```

This will:
1. Build the backend image (Python 3.12 + all dependencies)
2. Build the frontend image (Node 20 build → Nginx serve)
3. Start both containers on a shared bridge network
4. Wait for backend health check before starting frontend

### 3. Verify

```bash
# Check health endpoint
curl http://localhost:8000/health

# Open the app
open http://localhost
```

The app should be accessible at **http://localhost** (port 80).

### 4. Stop

```bash
docker compose down
```

To also remove the persistent upload volume:

```bash
docker compose down -v
```

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GEMINI_API_KEY` | **Yes** | — | Google Gemini API key |
| `SERPER_API_KEY` | **Yes** | — | Serper web search API key |
| `MODEL` | No | `gemini/gemini-2.0-flash` | LLM model identifier |
| `CORS_ORIGINS` | No | `localhost:5173,127.0.0.1:5173` | Allowed CORS origins (comma-separated) |
| `CREWAI_TRACING_ENABLED` | No | `false` | Enable CrewAI tracing |
| `GROQ_API_KEY` | No | — | Only needed for Groq models |
| `OPENAI_API_KEY` | No | — | Only needed for OpenAI models |

---

## Local Development (Without Docker)

### Backend

```bash
# Create and activate virtual environment
python -m venv .venv
.venv\Scripts\activate  # Windows
# source .venv/bin/activate  # Linux/Mac

# Install dependencies
pip install -r requirements.txt

# Set environment variables
cp .env.example .env
# Edit .env with your API keys

# Start the backend
python -m uvicorn web_app:app --host 127.0.0.1 --port 8000
```

### Frontend

```bash
# Install Node dependencies
npm ci

# Start dev server (with API proxy to backend)
npx vite --port 5173

# Or build for production
npx vite build
```

In dev mode, Vite proxies `/analyze`, `/generate_pdf`, and `/health` to `http://127.0.0.1:8000` automatically.

---

## CI/CD (GitHub Actions)

The CI workflow (`.github/workflows/ci.yml`) runs on every push/PR to `main`:

1. **Lint & Test**: TypeScript check, Vite build, Python edge-case tests
2. **Docker Build**: Builds both images and verifies backend startup

### Required GitHub Secrets

Set these in your repository settings → Secrets and variables → Actions:

- `GEMINI_API_KEY`
- `SERPER_API_KEY`

---

## Production Deployment Considerations

### Cloud Hosting Options

The Docker Compose setup is directly deployable to:

- **Google Cloud Run** (with `docker-compose` or individual service deploy)
- **AWS ECS / Fargate**
- **Azure Container Apps**
- **Any VPS** with Docker installed

### Resource Requirements

| Service | Min RAM | Recommended RAM | CPU |
|---------|---------|-----------------|-----|
| Backend | 512 MB | 2 GB | 2 vCPU |
| Frontend | 64 MB | 128 MB | 0.25 vCPU |

The backend needs sufficient memory for the 16-agent CrewAI pipeline, which runs multiple concurrent LLM calls and in-memory JSON processing.

### Security Checklist

- [ ] API keys stored in cloud secret manager (not plain env vars)
- [ ] HTTPS enabled via load balancer or reverse proxy
- [ ] `CORS_ORIGINS` set to actual production domain
- [ ] Rate limiting configured at load balancer level
- [ ] Logging forwarded to centralized log aggregation
- [ ] Container images scanned for vulnerabilities

### Persistent Storage

The `crdf-uploads` volume stores temporary file uploads. In a managed cloud deployment, consider:
- Using cloud object storage (S3/GCS) instead of local volumes
- Setting up periodic cleanup of old temporary files
- The volume can be safely cleared — it only contains transient upload data

---

## File Reference

| File | Purpose |
|------|---------|
| `Dockerfile.backend` | Backend container (Python 3.12, uvicorn) |
| `Dockerfile.frontend` | Frontend container (Node build → Nginx serve) |
| `docker-compose.yml` | Orchestrates both services |
| `nginx.conf` | Nginx config with SPA routing + API proxy |
| `.dockerignore` | Excludes unnecessary files from build context |
| `.env.example` | Template for environment variables |
| `.github/workflows/ci.yml` | CI pipeline |
| `requirements.txt` | Python dependencies |
| `web_app.py` | FastAPI application entry point |

---

## Troubleshooting

### Backend won't start
- Check `docker compose logs backend` for missing API key errors
- The startup hook validates `GEMINI_API_KEY` and `SERPER_API_KEY` at boot

### Frontend shows blank page
- Ensure backend health check passes: `curl http://localhost:8000/health`
- Check Nginx logs: `docker compose logs frontend`

### Pipeline times out (504)
- Default timeout is 5 minutes (300s)
- The 16-agent pipeline can take 2-4 minutes for complex claims
- Check backend logs for rate-limiting (429) from Gemini API

### Docker build fails
- Ensure Docker daemon is running: `docker info`
- Check `.dockerignore` isn't excluding needed files
- For Windows: ensure Docker Desktop is fully initialized
