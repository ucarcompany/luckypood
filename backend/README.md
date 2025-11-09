# Lucky Pool Backend

Small, hardened Express server to host image uploads and metadata JSON for the admin app.

## Endpoints
- `GET /healthz` – health check
- `POST /api/upload` – multipart/form-data with field `file`; returns `{ url, filename, size, mime }`
- `POST /api/metadata` – JSON body `{ title, description, image }`; returns `{ uri, id }`
- Static hosting:
  - `GET /uploads/<filename>` – served files
  - `GET /meta/<id>.json` – stored metadata

If `API_KEY` is set, both `/api/*` endpoints require header `x-api-key: <API_KEY>`.

## Run locally (Windows PowerShell)
1. Install deps
   - `Set-Location -Path 'e:\Lucky-pool\backend'; npm install`
2. Copy env
   - `Copy-Item .env.example .env`
3. Start in dev mode (auto-reload)
   - `npm run dev`
   - Or build & run:
     - `npm run build`
     - `npm start`

## Notes
- Files are stored on disk under `uploads/` and `metadata/`; for production, use durable storage (S3/OSS) and a CDN.
- Request size is capped (JSON 1MB, file 5MB) and a basic rate limiter is enabled (60 req/min/IP).
- CORS is open by default (`origin: true`); tighten for production.
