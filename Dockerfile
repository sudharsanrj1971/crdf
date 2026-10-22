# Backend image for Render / Cloud Run / Fly / any container host.
FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 MPLCONFIGDIR=/tmp/mpl
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
# Hosts like Render and Cloud Run inject $PORT; 7860 is only the local default.
ENV PORT=7860
EXPOSE 7860
CMD ["sh", "-c", "uvicorn web_app:app --host 0.0.0.0 --port ${PORT}"]
