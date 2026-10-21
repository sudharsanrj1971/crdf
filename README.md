# Running the CRDF Demo

To run the CRDF backend and expose it publicly for the frontend, follow these steps:

1.  **Set up the environment**:
    Create a `.env` file from `.env.example` and set your `GEMINI_API_KEY`.
    ```bash
    cp .env.example .env
    # Edit .env and add your key
    ```

2.  **Install dependencies**:
    ```bash
    pip install -r requirements.txt
    ```

3.  **Start the backend server**:
    ```bash
    uvicorn web_app:app --host 0.0.0.0 --port 8000
    ```

4.  **Expose the backend publicly** (e.g., using cloudflared):
    ```bash
    cloudflared tunnel --url http://localhost:8000
    ```
    Copy the generated HTTPS URL (e.g., `https://random-name.trycloudflare.com`).

5.  **Configure and start the frontend**:
    Set the backend URL in your environment and restart the frontend.
    ```bash
    export VITE_API_URL=https://<your-tunnel-url>/api
    npm run dev
    ```

---

## Test Checklist
1.  **Backend Health**: Curl the health endpoint:
    `curl http://localhost:8000/health`
    Expected response: `{"status": "ok"}`
2.  **API Documentation**: Navigate to `http://localhost:8000/docs` in your browser.
3.  **UI Pipeline**: Open the frontend URL, enter a claim, and click **Analyze**. Check that the results appear in the UI.