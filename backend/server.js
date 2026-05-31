require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json()); // Permite receber JSON do HTML

// CONEXÃO COM O MYSQL (Ajuste o utilizador e senha se necessário)
const poolConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
};

if (/^(true|1|required)$/i.test(process.env.DB_SSL || '')) {
    poolConfig.ssl = { rejectUnauthorized: false };
}

const db = mysql.createPool(poolConfig);
console.log('DB pool config:', {
    host: poolConfig.host,
    port: poolConfig.port,
    database: poolConfig.database,
    ssl: !!poolConfig.ssl,
});

const checkDatabaseConnection = async () => {
    try {
        await db.query('SELECT 1');
        console.log('DB connection successful');

        // 1. Criar tabela de utilizadores
        await db.query(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nome VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                senha VARCHAR(255) NOT NULL,
                data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Helper para garantir a coluna usuario_id nas tabelas existentes de forma segura
        const adicionarUsuarioIdSeNaoExiste = async (tableName) => {
            const [colunas] = await db.query(`
                SELECT COLUMN_NAME 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_NAME = ? 
                  AND COLUMN_NAME = 'usuario_id' 
                  AND TABLE_SCHEMA = DATABASE()
            `, [tableName]);

            if (colunas.length === 0) {
                console.log(`Adicionando coluna usuario_id na tabela ${tableName}...`);
                await db.query(`ALTER TABLE ${tableName} ADD COLUMN usuario_id INT`);
                await db.query(`ALTER TABLE ${tableName} ADD FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE`);
            }
        };

        // 2. Criar tabelas principais com suporte a usuario_id
        await db.query(`
            CREATE TABLE IF NOT EXISTS financas (
                id INT AUTO_INCREMENT PRIMARY KEY,
                descricao VARCHAR(255) NOT NULL,
                valor DECIMAL(10, 2) NOT NULL,
                tipo ENUM('receita', 'despesa') NOT NULL,
                origem VARCHAR(50) DEFAULT 'Manual',
                usuario_id INT,
                data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
            )
        `);
        await adicionarUsuarioIdSeNaoExiste('financas');

        await db.query(`
            CREATE TABLE IF NOT EXISTS metas (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nome VARCHAR(255) NOT NULL,
                objetivo DECIMAL(10, 2) NOT NULL,
                guardado DECIMAL(10, 2) DEFAULT 0,
                usuario_id INT,
                data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
            )
        `);
        await adicionarUsuarioIdSeNaoExiste('metas');

        await db.query(`
            CREATE TABLE IF NOT EXISTS despensa (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nome VARCHAR(255) NOT NULL,
                quantidade INT NOT NULL,
                preco DECIMAL(10, 2) DEFAULT 0,
                validade VARCHAR(7),
                usuario_id INT,
                data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
            )
        `);
        await adicionarUsuarioIdSeNaoExiste('despensa');

        await db.query(`
            CREATE TABLE IF NOT EXISTS medicamentos (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nome VARCHAR(255) NOT NULL,
                dose VARCHAR(100) NOT NULL,
                hora VARCHAR(5) NOT NULL,
                usuario_id INT,
                data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
            )
        `);
        await adicionarUsuarioIdSeNaoExiste('medicamentos');

        await db.query(`
            CREATE TABLE IF NOT EXISTS pets (
                id INT AUTO_INCREMENT PRIMARY KEY,
                acao VARCHAR(255) NOT NULL,
                data_agendada DATE NOT NULL,
                custo DECIMAL(10, 2) DEFAULT 0,
                usuario_id INT,
                data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
            )
        `);
        await adicionarUsuarioIdSeNaoExiste('pets');

        console.log('DB tables and multi-user migrations verified/created successfully');
    } catch (erro) {
        console.error('DB startup connection or migration failed:', erro);
    }
};

checkDatabaseConnection();

// ==========================================
// CONTROLLERS (Rotas da API)
// ==========================================

// --- CONFIGURAÇÃO DE SEGURANÇA E SESSÃO (NATIVA) ---
const hashPassword = (password) => {
    return crypto.createHmac('sha256', process.env.DB_PASS || 'keephub-secret-key-12345')
                 .update(password)
                 .digest('hex');
};

const generateToken = (user) => {
    const payload = JSON.stringify({ id: user.id, email: user.email, exp: Date.now() + 30 * 24 * 60 * 60 * 1000 });
    const signature = crypto.createHmac('sha256', process.env.DB_PASS || 'keephub-secret-key-12345').update(payload).digest('hex');
    return Buffer.from(payload).toString('base64') + '.' + signature;
};

const verifyToken = (token) => {
    try {
        const parts = token.split('.');
        if (parts.length !== 2) return null;
        const payloadStr = Buffer.from(parts[0], 'base64').toString('utf-8');
        const payload = JSON.parse(payloadStr);
        if (payload.exp < Date.now()) return null;
        
        const expectedSignature = crypto.createHmac('sha256', process.env.DB_PASS || 'keephub-secret-key-12345').update(payloadStr).digest('hex');
        if (parts[1] !== expectedSignature) return null;
        
        return payload;
    } catch (e) {
        return null;
    }
};

// Middleware de Autenticação Segura
const requireAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ erro: 'Inicie sessão para continuar.' });
        }
        
        const token = authHeader.split(' ')[1];
        const decoded = verifyToken(token);
        if (!decoded) {
            return res.status(401).json({ erro: 'A sua sessão expirou ou é inválida. Inicie sessão novamente.' });
        }
        
        req.userId = decoded.id;
        req.userEmail = decoded.email;
        next();
    } catch (err) {
        res.status(401).json({ erro: 'Erro de autenticação.' });
    }
};

// --- ROTAS DE AUTENTICAÇÃO ---

// Registar Novo Utilizador
app.post('/api/auth/register', async (req, res) => {
    try {
        const { nome, email, senha } = req.body;
        
        if (!nome || !email || !senha) {
            return res.status(400).json({ erro: 'Todos os campos são obrigatórios!' });
        }
        
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ erro: 'Formato de email inválido!' });
        }
        
        if (senha.length < 6) {
            return res.status(400).json({ erro: 'A senha deve ter pelo menos 6 caracteres!' });
        }
        
        // Verificar se o email já existe
        const [existente] = await db.query('SELECT id FROM usuarios WHERE email = ?', [email]);
        if (existente.length > 0) {
            return res.status(400).json({ erro: 'Este email já está registado!' });
        }
        
        const senhaHash = hashPassword(senha);
        const [resultado] = await db.query('INSERT INTO usuarios (nome, email, senha) VALUES (?, ?, ?)', [nome, email, senhaHash]);
        
        const novoUsuario = { id: resultado.insertId, nome, email };
        const token = generateToken(novoUsuario);
        
        res.json({ sucesso: true, usuario: novoUsuario, token });
    } catch (erro) {
        console.error('Erro no registo:', erro);
        res.status(500).json({ erro: 'Erro interno ao criar conta.' });
    }
});

// Perfil do utilizador autenticado
app.get('/api/auth/me', requireAuth, async (req, res) => {
    try {
        const [usuarios] = await db.query(
            'SELECT id, nome, email FROM usuarios WHERE id = ?',
            [req.userId]
        );
        if (usuarios.length === 0) {
            return res.status(404).json({ erro: 'Utilizador não encontrado.' });
        }
        res.json({ usuario: usuarios[0] });
    } catch (erro) {
        console.error('Erro em /api/auth/me:', erro);
        res.status(500).json({ erro: 'Erro ao obter perfil.' });
    }
});

// Iniciar Sessão (Login)
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, senha } = req.body;
        
        if (!email || !senha) {
            return res.status(400).json({ erro: 'Email e senha são obrigatórios!' });
        }
        
        const senhaHash = hashPassword(senha);
        const [usuarios] = await db.query('SELECT * FROM usuarios WHERE email = ? AND senha = ?', [email, senhaHash]);
        
        if (usuarios.length === 0) {
            return res.status(400).json({ erro: 'Email ou senha incorretos!' });
        }
        
        const usuario = usuarios[0];
        const usuarioFormatado = { id: usuario.id, nome: usuario.nome, email: usuario.email };
        const token = generateToken(usuarioFormatado);
        
        res.json({ sucesso: true, usuario: usuarioFormatado, token });
    } catch (erro) {
        console.error('Erro no login:', erro);
        res.status(500).json({ erro: 'Erro interno ao iniciar sessão.' });
    }
});

// Rota de Diagnóstico Seguro para Produção
app.get('/api/health', async (req, res) => {
    const config = {
        host: process.env.DB_HOST ? 'Definido (finaliza com ' + process.env.DB_HOST.slice(-15) + ')' : 'Indefinido',
        port: process.env.DB_PORT || 'Indefinido',
        user: process.env.DB_USER || 'Indefinido',
        database: process.env.DB_NAME || 'Indefinido',
        ssl: process.env.DB_SSL || 'Indefinido',
        node_env: process.env.NODE_ENV || 'Indefinido',
    };
    
    try {
        await db.query('SELECT 1');
        res.json({ status: 'OK', config, message: 'Base de dados conectada com sucesso!' });
    } catch (erro) {
        res.status(500).json({ status: 'ERROR', config, error: erro.message });
    }
});

// Rota unificada para carregar tudo (Leitura - READ)
app.get('/api/sync', requireAuth, async (req, res) => {
    try {
        const [financas] = await db.query('SELECT * FROM financas WHERE usuario_id = ? ORDER BY data_criacao DESC', [req.userId]);
        const [metas] = await db.query('SELECT * FROM metas WHERE usuario_id = ?', [req.userId]);
        const [despensa] = await db.query('SELECT * FROM despensa WHERE usuario_id = ?', [req.userId]);
        const [medicamentos] = await db.query('SELECT * FROM medicamentos WHERE usuario_id = ?', [req.userId]);
        const [pets] = await db.query('SELECT * FROM pets WHERE usuario_id = ?', [req.userId]);

        res.json({ financas, metas, despensa, medicamentos, pets });
    } catch (erro) {
        console.error('DB error on /api/sync:', erro);
        res.status(500).json({ erro: 'Erro ao consultar a base de dados', detalhes: erro.message });
    }
});

// Adicionar Finança (Criação - CREATE)
app.post('/api/financas', requireAuth, async (req, res) => {
    try {
        const { desc, valor, tipo, origem } = req.body;
        await db.query('INSERT INTO financas (descricao, valor, tipo, origem, usuario_id) VALUES (?, ?, ?, ?, ?)', [desc, valor, tipo, origem, req.userId]);
        res.json({ sucesso: true });
    } catch (erro) {
        console.error('DB error on /api/financas:', erro);
        res.status(500).json({ erro: 'Erro ao inserir a finança', detalhes: erro.message });
    }
});

// Adicionar Meta e Integrar Finanças
app.post('/api/metas', requireAuth, async (req, res) => {
    try {
        const { nome, objetivo, guardado } = req.body;
        await db.query('INSERT INTO metas (nome, objetivo, guardado, usuario_id) VALUES (?, ?, ?, ?)', [nome, objetivo, guardado, req.userId]);
        
        // Integração Cruzada (Cross-Reference) no Back-end
        if (guardado > 0) {
            await db.query('INSERT INTO financas (descricao, valor, tipo, origem, usuario_id) VALUES (?, ?, ?, ?, ?)', [`Reserva: ${nome}`, guardado, 'despesa', 'Metas', req.userId]);
        }
        res.json({ sucesso: true });
    } catch (erro) {
        console.error('DB error on /api/metas:', erro);
        res.status(500).json({ erro: 'Erro ao inserir a meta', detalhes: erro.message });
    }
});

// Adicionar Despensa e Integrar Finanças
app.post('/api/despensa', requireAuth, async (req, res) => {
    try {
        const { nome, qtd, preco, validade } = req.body;
        await db.query('INSERT INTO despensa (nome, quantidade, preco, validade, usuario_id) VALUES (?, ?, ?, ?, ?)', [nome, qtd, preco, validade, req.userId]);
        
        if (preco > 0) {
            await db.query('INSERT INTO financas (descricao, valor, tipo, origem, usuario_id) VALUES (?, ?, ?, ?, ?)', [`Compra: ${nome}`, preco, 'despesa', 'Despensa', req.userId]);
        }
        res.json({ sucesso: true });
    } catch (erro) {
        console.error('DB error on /api/despensa:', erro);
        res.status(500).json({ erro: 'Erro ao inserir o item da despensa', detalhes: erro.message });
    }
});

// Adicionar Medicamento
app.post('/api/medicamentos', requireAuth, async (req, res) => {
    try {
        const { nome, dose, hora } = req.body;
        await db.query('INSERT INTO medicamentos (nome, dose, hora, usuario_id) VALUES (?, ?, ?, ?)', [nome, dose, hora, req.userId]);
        res.json({ sucesso: true });
    } catch (erro) {
        console.error('DB error on /api/medicamentos:', erro);
        res.status(500).json({ erro: 'Erro ao inserir o medicamento', detalhes: erro.message });
    }
});

// Adicionar Lembrete Pet e Integrar Finanças
app.post('/api/pets', requireAuth, async (req, res) => {
    try {
        const { acao, data, custo } = req.body;
        await db.query('INSERT INTO pets (acao, data_agendada, custo, usuario_id) VALUES (?, ?, ?, ?)', [acao, data, custo, req.userId]);
        
        if (custo > 0) {
            await db.query('INSERT INTO financas (descricao, valor, tipo, origem, usuario_id) VALUES (?, ?, ?, ?, ?)', [`Agendamento Pet: ${acao}`, custo, 'despesa', 'Pets', req.userId]);
        }
        res.json({ sucesso: true });
    } catch (erro) {
        console.error('DB error on /api/pets:', erro);
        res.status(500).json({ erro: 'Erro ao inserir o pet', detalhes: erro.message });
    }
});

// Iniciar o Servidor
const PORT = process.env.PORT || 3000;
// Redireciona a raiz para o frontend Netlify
app.get('/', (req, res) => {
    res.redirect('https://keephub.netlify.app');
});
app.listen(PORT, () => {
    console.log(`Servidor MVC rodando na porta http://localhost:${PORT}`);
});