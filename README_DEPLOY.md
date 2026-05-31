Deployment notes — Render + Netlify
=================================

This repository is set up to deploy the backend on Render and the frontend on Netlify.

Render (backend)
- The `render.yaml` file declares a web service named `keephub-backend` using branch `main`.
- After adding the repository to Render, open the service settings and populate the environment variables with your Aiven credentials:
  - `DB_HOST` (e.g. keephub-iaedesenvolvimento-4568.l.aivencloud.com)
  - `DB_PORT` (e.g. 20023)
  - `DB_USER` (e.g. avnadmin)
  - `DB_PASS` (your Aiven password)
  - `DB_NAME` (e.g. defaultdb)
  - `DB_SSL=REQUIRED`

Notes: do NOT store secrets in the repo. Leave values empty in `render.yaml` and set them in Render's dashboard.

Netlify (frontend) — deploy automático via Git
----------------------------------------------

O site **keephub.netlify.app** publica a branch **`deploy-clean`** (não `main`).

Após alterar o frontend, faça push de `main` **e** atualize `deploy-clean`:

```bash
git checkout deploy-clean
git merge main
git push origin deploy-clean
git checkout main
```

Opcional: o workflow `.github/workflows/netlify-deploy.yml` também pode publicar a partir de `main` se os secrets estiverem configurados.

### Configuração única (obrigatória)

1. **Token Netlify**  
   - https://app.netlify.com/user/applications#personal-access-tokens  
   - Create token → copie o valor.

2. **Site ID**  
   - https://app.netlify.com/sites/keephub/settings/general  
   - Campo **Site ID** (ex.: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`).

3. **Secrets no GitHub** (repositório `infofieb/keephub`)  
   - https://github.com/infofieb/keephub/settings/secrets/actions  
   - **New repository secret**:
     - `NETLIFY_AUTH_TOKEN` = token do passo 1
     - `NETLIFY_SITE_ID` = Site ID do passo 2

4. **Testar**  
   - Faça push em `main` ou em Actions → **Deploy frontend to Netlify** → **Run workflow**.  
   - Site: https://keephub.netlify.app

### Ficheiros de configuração

- `netlify.toml` — publish `frontend/`, proxy `/api/*` → Render, cache do PWA.
- `frontend/_redirects` — fallback do proxy API (redundante com `netlify.toml`).

### Netlify ligado ao Git (opcional)

Se no painel Netlify o site já estiver ligado ao GitHub, pode haver **dois deploys** por push. Recomendação:

- **Usar só GitHub Actions** (recomendado): em Netlify → *Site configuration* → *Build & deploy* → desative *Builds* ou desligue o repositório.
- **Ou** usar só Netlify Git: apague/desative o workflow e ligue `infofieb/keephub`, branch `main`, publish directory `frontend`, build command vazio.

Workflow geral
1. Push para `main`.
2. **Render** — auto-deploy do `backend/` (`render.yaml`).
3. **Netlify** — GitHub Action publica `frontend/` (requer secrets acima).

Troubleshooting
- Action falha com auth: confirme `NETLIFY_AUTH_TOKEN` e `NETLIFY_SITE_ID` nos secrets do GitHub.
- Site mostra HTML antigo: Ctrl+Shift+R; confira deploy em https://app.netlify.com/sites/keephub/deploys
- `/api/*` 404: confirme `netlify.toml` e `_redirects` na pasta publicada.
- Render DB errors: variáveis de ambiente e SSL no dashboard Render.
