# MyntraAI — Batch Virtual Try-On (React + Vite + Express + MongoDB + NanoBananaAPI)

## Project layout
- `client/`: React + Vite frontend
- `server/`: Express API, Mongoose models, NanoBananaAPI task submission/status polling, temporary image URLs and Sharp-based crop processing
- `render.yaml`: optional Render Blueprint for backend deployment

## Requirements
- Node.js 20 or newer
- A MongoDB Atlas database
- A NanoBananaAPI key with image-edit credits: https://docs.nanobananaapi.ai/quickstart
- A public HTTPS URL/tunnel that forwards to the running backend so NanoBananaAPI can fetch short-lived input images

## Run locally on Windows
1. Open two PowerShell terminals in this project folder.
2. In `server`, copy `.env.example` to `.env` and fill in your credentials.
3. In the first terminal:
   ```powershell
   cd server
   npm install
   npm run dev
   ```
4. In the second terminal:
   ```powershell
   cd client
   copy .env.example .env
   npm install
   npm run dev
   ```
5. Open `http://localhost:5173`. The Vite development proxy forwards `/api` requests to `http://localhost:5000`.

## Environment variables
Backend `server/.env`:
- `PORT`: local/backend port (default `5000`).
- `MONGODB_URI`: MongoDB connection string.
- `MONGODB_DB_NAME`: database name, for example `myntra_ai_tryon`.
- `NANOBANANA_API_KEY`: secret API key from NanoBananaAPI. Do not put it in a `VITE_` variable or client code.
- `NANOBANANA_PUBLIC_BASE_URL`: public **HTTPS** URL that reaches this backend. NanoBananaAPI image-edit requests use image URLs, so the backend hosts each input image behind a random, expiring URL for up to 10 minutes. A `localhost` URL will not work because the provider cannot access your PC's loopback address.
- `NANOBANANA_CALLBACK_URL`: optional public callback URL; defaults to `${NANOBANANA_PUBLIC_BASE_URL}/api/tryon/nanobanana/callback`.
- `NANOBANANA_TUNNEL_RESTRICT_MODE`: set `true` for local tunnel development to block profile/history routes through the public tunnel; set `false` for deployment only if the public app is secured appropriately.
- `CLIENT_ORIGIN`: frontend origin, e.g. `http://localhost:5173`.

Frontend `client/.env`:
- `VITE_API_BASE_URL=/api` for local development. This value is public and must not contain secrets.

### Local image URL tunnel (required when running the backend on your PC)
1. Keep the backend running on port `5000`.
2. Open a second terminal and start an HTTPS tunnel, for example using a tunnel tool you trust that forwards to `http://localhost:5000`.
3. Copy the generated HTTPS URL into `NANOBANANA_PUBLIC_BASE_URL` in `server/.env` (no trailing path), such as `https://YOUR-TUNNEL-DOMAIN`.
4. Set `NANOBANANA_TUNNEL_RESTRICT_MODE=true` for local tunnel development. This allows only the health check, temporary image fetches, and provider callback through the public tunnel; other app routes remain reachable only through localhost.
5. Restart the backend after editing `.env`, and keep the tunnel running while generation is in progress. The URL changes whenever a Quick Tunnel restarts, so update `.env` again if it changes.
6. Check `http://localhost:5000/api/health`; it should report `nanoBananaConfigured: true` and `nanoBananaPublicBaseConfigured: true`.

**Privacy:** during generation, the profile photo and catalog composite are sent to NanoBananaAPI using temporary, high-entropy URLs. Anyone who obtains a valid temporary URL could view that image until it expires or the task finishes. Use this only if you accept that transfer.

## Deploy
### 1. GitHub
- Create a repository and push the contents of this project folder.
- Confirm `.env` files and API keys are not committed. `.gitignore` excludes `.env`, `node_modules`, and build output.

### 2. MongoDB Atlas
- Create a database user and database.
- Configure Network Access for the hosting environment. Avoid broad public access where possible.
- Copy the Atlas connection string into Render's `MONGODB_URI` environment variable.

### 3. Render backend
- Create a Web Service from the GitHub repository.
- Root Directory: `server`
- Build Command: `npm install`
- Start Command: `npm start`
- Set `MONGODB_URI`, `MONGODB_DB_NAME`, `NANOBANANA_API_KEY`, `NANOBANANA_PUBLIC_BASE_URL`, and `CLIENT_ORIGIN`.
- Check `https://YOUR-RENDER-SERVICE.onrender.com/api/health`.

### 4. Vercel frontend
- Import the same GitHub repository.
- Set Root Directory to `client`.
- Framework preset: Vite. Build Command: `npm run build`; Output Directory: `dist`.
- Set `VITE_API_BASE_URL` to `https://YOUR-RENDER-SERVICE.onrender.com/api`. Redeploy after changing environment variables.
- Set Render's `CLIENT_ORIGIN` to the exact Vercel domain and redeploy/restart the backend. Set `NANOBANANA_PUBLIC_BASE_URL` to the deployed Render backend's public HTTPS origin and set `NANOBANANA_TUNNEL_RESTRICT_MODE=false` for deployment.

## Important notes
- Successful generation has not been verified against your live account yet; it requires a valid server-side NanoBananaAPI key, provider credits, and a publicly reachable HTTPS backend URL.
- Try-on generation requires the backend, a valid NanoBananaAPI key, and `NANOBANANA_PUBLIC_BASE_URL` reachable from the provider. The UI no longer silently substitutes the browser compositor when the API fails; it surfaces the actual backend/API error instead.
- Profile save/load/delete and try-on history now attempt to sync with MongoDB, while IndexedDB remains a local fallback. The current project has no user authentication: profile and history API routes are not safe for a public launch because one visitor could access or delete another visitor's records. Add authentication and per-user authorization before making this public.
- Image data stored as base64 in MongoDB can grow quickly. For production scale, store images in object storage and keep only URLs/metadata in MongoDB.
- Review privacy, consent, deletion, rate limiting, and upload limits before opening the site publicly.
