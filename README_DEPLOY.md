Deployment notes — Render + Netlify
=================================

This repository is set up to deploy the backend on Render and the frontend on Netlify.

Render (backend)
- The `render.yaml` file declares a web service named `keephub-backend` using branch `deploy-clean`.
- After adding the repository to Render, open the service settings and populate the environment variables with your Aiven credentials:
  - `DB_HOST` (e.g. keephub-iaedesenvolvimento-4568.l.aivencloud.com)
  - `DB_PORT` (e.g. 20023)
  - `DB_USER` (e.g. avnadmin)
  - `DB_PASS` (your Aiven password)
  - `DB_NAME` (e.g. defaultdb)
  - `DB_SSL=REQUIRED`

Notes: do NOT store secrets in the repo. Leave values empty in `render.yaml` and set them in Render's dashboard.

Netlify (frontend)
- `netlify.toml` is configured to publish the `frontend` folder.
- `_redirects` in `frontend/_redirects` proxies `/api/*` to the Render backend.
- Ensure the Netlify site is set to deploy from branch `deploy-clean` (or change branch in Netlify settings).

Workflow
1. Push code to `deploy-clean`.
2. Render will auto-deploy the backend from `backend/` (see render.yaml). Fill env vars in Render dashboard first.
3. Netlify will auto-deploy the frontend from `frontend/` (ensure branch matches).

Troubleshooting
- If `/api/*` returns 404 on Netlify: confirm `_redirects` exists in the published files and Netlify used the correct branch.
- If Render returns DB connection errors: check env vars and SSL/port settings, then check Render logs.
