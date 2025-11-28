require('dotenv').config();
const express = require('express');
const sql = require('mssql');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(__dirname));

// Configuration Azure SQL
const sqlConfig = {
    server: process.env.AZURE_SQL_SERVER,
    database: process.env.AZURE_SQL_DATABASE,
    authentication: {
        type: 'default',
        options: {
            userName: process.env.AZURE_SQL_USER,
            password: process.env.AZURE_SQL_PASSWORD
        }
    },
    options: {
        encrypt: true,
        trustServerCertificate: false,
        connectTimeout: 30000,
        requestTimeout: 30000
    }
};

// Pool de connexion
let connectionPool;

// Initialiser la connexion à la DB
async function initializeDB() {
    try {
        connectionPool = new sql.ConnectionPool(sqlConfig);
        await connectionPool.connect();
        console.log('✅ Connecté à Azure SQL Database');
        
        // Créer la table si elle n'existe pas
        const request = connectionPool.request();
        await request.query(`
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='people' and xtype='U')
            CREATE TABLE people (
                id INT IDENTITY(1,1) PRIMARY KEY,
                name NVARCHAR(100) NOT NULL,
                email NVARCHAR(100) NULL,
                created_at DATETIME DEFAULT GETDATE()
            )
        `);
        console.log('✅ Table "people" vérifiée');
    } catch (error) {
        console.error('❌ Erreur de connexion à la DB:', error.message);
        process.exit(1);
    }
}

// === ROUTES API ===

// GET /api/people - Récupérer toutes les personnes
app.get('/api/people', async (req, res) => {
    try {
        const request = connectionPool.request();
        const result = await request.query('SELECT id, name, email FROM people ORDER BY id DESC');
        res.json(result.recordset);
    } catch (error) {
        console.error('Erreur GET /api/people:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/people - Ajouter une personne
app.post('/api/people', async (req, res) => {
    try {
        const { name, email } = req.body;
        
        // Validation
        if (!name || name.trim().length === 0) {
            return res.status(400).json({ error: 'Le nom est requis' });
        }
        
        const request = connectionPool.request();
        request.input('name', sql.NVarChar(100), name.trim());
        request.input('email', sql.NVarChar(100), email ? email.trim() : null);
        
        await request.query('INSERT INTO people (name, email) VALUES (@name, @email)');
        
        res.status(201).json({ success: true, message: 'Personne ajoutée' });
    } catch (error) {
        console.error('Erreur POST /api/people:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/people/:id - Supprimer une personne
app.delete('/api/people/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const request = connectionPool.request();
        request.input('id', sql.Int, parseInt(id));
        
        const result = await request.query('DELETE FROM people WHERE id = @id');
        
        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ error: 'Personne non trouvée' });
        }
        
        res.json({ success: true, message: 'Personne supprimée' });
    } catch (error) {
        console.error('Erreur DELETE /api/people/:id:', error);
        res.status(500).json({ error: error.message });
    }
});

// Route par défaut - servir index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Démarrer le serveur
app.listen(PORT, async () => {
    console.log(`🚀 Serveur lancé sur http://localhost:${PORT}`);
    await initializeDB();
});

// Gestion de l'arrêt gracieux
process.on('SIGINT', async () => {
    console.log('\n⏹️  Arrêt du serveur...');
    if (connectionPool) {
        await connectionPool.close();
    }
    process.exit(0);
});
