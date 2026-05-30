require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');

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

        // Cria as tabelas automaticamente se não existirem
        await db.query(`
            CREATE TABLE IF NOT EXISTS financas (
                id INT AUTO_INCREMENT PRIMARY KEY,
                descricao VARCHAR(255) NOT NULL,
                valor DECIMAL(10, 2) NOT NULL,
                tipo ENUM('receita', 'despesa') NOT NULL,
                origem VARCHAR(50) DEFAULT 'Manual',
                data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS metas (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nome VARCHAR(255) NOT NULL,
                objetivo DECIMAL(10, 2) NOT NULL,
                guardado DECIMAL(10, 2) DEFAULT 0,
                data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS despensa (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nome VARCHAR(255) NOT NULL,
                quantidade INT NOT NULL,
                preco DECIMAL(10, 2) DEFAULT 0,
                validade VARCHAR(7),
                data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS medicamentos (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nome VARCHAR(255) NOT NULL,
                dose VARCHAR(100) NOT NULL,
                hora VARCHAR(5) NOT NULL,
                data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS pets (
                id INT AUTO_INCREMENT PRIMARY KEY,
                acao VARCHAR(255) NOT NULL,
                data_agendada DATE NOT NULL,
                custo DECIMAL(10, 2) DEFAULT 0,
                data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log('DB tables verified/created successfully');
    } catch (erro) {
        console.error('DB startup connection or migration failed:', erro);
    }
};

checkDatabaseConnection();

// ==========================================
// CONTROLLERS (Rotas da API)
// ==========================================

// Rota unificada para carregar tudo (Leitura - READ)
app.get('/api/sync', async (req, res) => {
    try {
        const [financas] = await db.query('SELECT * FROM financas ORDER BY data_criacao DESC');
        const [metas] = await db.query('SELECT * FROM metas');
        const [despensa] = await db.query('SELECT * FROM despensa');
        const [medicamentos] = await db.query('SELECT * FROM medicamentos');
        const [pets] = await db.query('SELECT * FROM pets');

        res.json({ financas, metas, despensa, medicamentos, pets });
    } catch (erro) {
        console.error('DB error on /api/sync:', erro);
        res.status(500).json({ erro: 'Erro ao consultar a base de dados', detalhes: erro.message });
    }
});

// Adicionar Finança (Criação - CREATE)
app.post('/api/financas', async (req, res) => {
    try {
        const { desc, valor, tipo, origem } = req.body;
        await db.query('INSERT INTO financas (descricao, valor, tipo, origem) VALUES (?, ?, ?, ?)', [desc, valor, tipo, origem]);
        res.json({ sucesso: true });
    } catch (erro) {
        console.error('DB error on /api/financas:', erro);
        res.status(500).json({ erro: 'Erro ao inserir a finança', detalhes: erro.message });
    }
});

// Adicionar Meta e Integrar Finanças
app.post('/api/metas', async (req, res) => {
    try {
        const { nome, objetivo, guardado } = req.body;
        await db.query('INSERT INTO metas (nome, objetivo, guardado) VALUES (?, ?, ?)', [nome, objetivo, guardado]);
        
        // Integração Cruzada (Cross-Reference) no Back-end
        if (guardado > 0) {
            await db.query('INSERT INTO financas (descricao, valor, tipo, origem) VALUES (?, ?, ?, ?)', [`Reserva: ${nome}`, guardado, 'despesa', 'Metas']);
        }
        res.json({ sucesso: true });
    } catch (erro) {
        console.error('DB error on /api/metas:', erro);
        res.status(500).json({ erro: 'Erro ao inserir a meta', detalhes: erro.message });
    }
});

// Adicionar Despensa e Integrar Finanças
app.post('/api/despensa', async (req, res) => {
    try {
        const { nome, qtd, preco, validade } = req.body;
        await db.query('INSERT INTO despensa (nome, quantidade, preco, validade) VALUES (?, ?, ?, ?)', [nome, qtd, preco, validade]);
        
        if (preco > 0) {
            await db.query('INSERT INTO financas (descricao, valor, tipo, origem) VALUES (?, ?, ?, ?)', [`Compra: ${nome}`, preco, 'despesa', 'Despensa']);
        }
        res.json({ sucesso: true });
    } catch (erro) {
        console.error('DB error on /api/despensa:', erro);
        res.status(500).json({ erro: 'Erro ao inserir o item da despensa', detalhes: erro.message });
    }
});

// Adicionar Medicamento
app.post('/api/medicamentos', async (req, res) => {
    try {
        const { nome, dose, hora } = req.body;
        await db.query('INSERT INTO medicamentos (nome, dose, hora) VALUES (?, ?, ?)', [nome, dose, hora]);
        res.json({ sucesso: true });
    } catch (erro) {
        console.error('DB error on /api/medicamentos:', erro);
        res.status(500).json({ erro: 'Erro ao inserir o medicamento', detalhes: erro.message });
    }
});

// Adicionar Lembrete Pet e Integrar Finanças
app.post('/api/pets', async (req, res) => {
    try {
        const { acao, data, custo } = req.body;
        await db.query('INSERT INTO pets (acao, data_agendada, custo) VALUES (?, ?, ?)', [acao, data, custo]);
        
        if (custo > 0) {
            await db.query('INSERT INTO financas (descricao, valor, tipo, origem) VALUES (?, ?, ?, ?)', [`Agendamento Pet: ${acao}`, custo, 'despesa', 'Pets']);
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