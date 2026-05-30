# KeepHub

## Deploy para Render + Netlify

### Backend (Render)
1. Crie um novo `Web Service` no Render.
2. Conecte o repositório Git.
3. Defina o diretório raiz como `backend`.
4. Build command: `npm install`
5. Start command: `npm start`

#### Variáveis de ambiente no Render
- `DB_HOST`
- `DB_USER`
- `DB_PASS`
- `DB_NAME`

> O backend já está configurado para usar `process.env.PORT || 3000`.

### Frontend (Netlify)
1. Crie um novo site no Netlify.
2. Conecte o repositório Git.
3. Defina o `Publish directory` como `frontend`.
4. Leave the build command empty.

#### Proxy API para Render
A configuração de proxy já está adicionada em `netlify.toml`.
Substitua `https://SEU_BACKEND.onrender.com` pela URL real do backend no Render.

### Arquivos adicionados
- `.gitignore`
- `backend/.env.example`
- `netlify.toml`
- `frontend/_redirects`

### Observações
- Não comite arquivos de configuração sensíveis como `.env`.
- Use a URL do backend Render no arquivo `netlify.toml` e/ou `frontend/_redirects`.
- O frontend já usa `const API_URL = '/api';` para funcionar com proxy.
