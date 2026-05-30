require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json()); // Permite receber JSON do HTML

// CONEXÃO COM O MYSQL WORKBENCH (Ajuste o utilizador e senha se necessário)
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME
});

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
        res.status(500).json({ erro: 'Erro ao conectar à base de dados' });
    }
});

// Adicionar Finança (Criação - CREATE)
app.post('/api/financas', async (req, res) => {
    const { desc, valor, tipo, origem } = req.body;
    await db.query('INSERT INTO financas (descricao, valor, tipo, origem) VALUES (?, ?, ?, ?)', [desc, valor, tipo, origem]);
    res.json({ sucesso: true });
});

// Adicionar Meta e Integrar Finanças
app.post('/api/metas', async (req, res) => {
    const { nome, objetivo, guardado } = req.body;
    await db.query('INSERT INTO metas (nome, objetivo, guardado) VALUES (?, ?, ?)', [nome, objetivo, guardado]);
    
    // Integração Cruzada (Cross-Reference) no Back-end
    if (guardado > 0) {
        await db.query('INSERT INTO financas (descricao, valor, tipo, origem) VALUES (?, ?, ?, ?)', [`Reserva: ${nome}`, guardado, 'despesa', 'Metas']);
    }
    res.json({ sucesso: true });
});

// Adicionar Despensa e Integrar Finanças
app.post('/api/despensa', async (req, res) => {
    const { nome, qtd, preco, validade } = req.body;
    await db.query('INSERT INTO despensa (nome, quantidade, preco, validade) VALUES (?, ?, ?, ?)', [nome, qtd, preco, validade]);
    
    if (preco > 0) {
        await db.query('INSERT INTO financas (descricao, valor, tipo, origem) VALUES (?, ?, ?, ?)', [`Compra: ${nome}`, preco, 'despesa', 'Despensa']);
    }
    res.json({ sucesso: true });
});

// Adicionar Medicamento
app.post('/api/medicamentos', async (req, res) => {
    const { nome, dose, hora } = req.body;
    await db.query('INSERT INTO medicamentos (nome, dose, hora) VALUES (?, ?, ?)', [nome, dose, hora]);
    res.json({ sucesso: true });
});

// Adicionar Lembrete Pet e Integrar Finanças
app.post('/api/pets', async (req, res) => {
    const { acao, data, custo } = req.body;
    await db.query('INSERT INTO pets (acao, data_agendada, custo) VALUES (?, ?, ?)', [acao, data, custo]);
    
    if (custo > 0) {
        await db.query('INSERT INTO financas (descricao, valor, tipo, origem) VALUES (?, ?, ?, ?)', [`Agendamento Pet: ${acao}`, custo, 'despesa', 'Pets']);
    }
    res.json({ sucesso: true });
});

// Iniciar o Servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor MVC rodando na porta http://localhost:${PORT}`);
});