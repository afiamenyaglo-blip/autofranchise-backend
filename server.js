// server.js — AutoFranchise Backend API (MySQL + Render/Railway)
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const morgan  = require('morgan');
const path    = require('path');
const fs      = require('fs');
const { testConnection } = require('./config/db');

const app  = express();
const PORT = process.env.PORT || 5000;

// ── Dossier uploads ──────────────────────────────────────────────
const uploadDir = process.env.UPLOAD_DIR || './uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// ── Middlewares ──────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(process.env.NODE_ENV==='production' ? 'combined' : 'dev'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Routes ───────────────────────────────────────────────────────
app.use('/api/auth',         require('./routes/auth'));
app.use('/api/vehicules',    require('./routes/vehicules'));
app.use('/api/reservations', require('./routes/reservations'));
app.use('/api/paiements',    require('./routes/paiements'));
app.use('/api/admin',        require('./routes/admin'));
app.use('/api/messages',     require('./routes/messages'));
app.use('/api/sms', require('./routes/sms').router);

// ── Route racine ─────────────────────────────────────────────────
app.get('/', (req, res) => res.json({
  nom: '🚗 AutoFranchise API',
  version: '1.0.0',
  pays: '🇹🇬 Togo',
  statut: '✅ En ligne',
  base_de_donnees: 'MySQL',
  endpoints: ['/api/auth','/api/vehicules','/api/reservations','/api/paiements','/api/admin'],
}));

// ── Gestion erreurs ───────────────────────────────────────────────
app.use((err, req, res, next) => {
  if (err.code==='LIMIT_FILE_SIZE')
    return res.status(413).json({ succes: false, message: 'Fichier trop volumineux (max 5 MB).' });
  console.error('❌', err.message);
  res.status(err.status||500).json({
    succes: false,
    message: process.env.NODE_ENV==='production' ? 'Erreur interne.' : err.message,
  });
});
app.use((req, res) => res.status(404).json({ succes: false, message: `Route introuvable : ${req.method} ${req.path}` }));

// ── Démarrage ────────────────────────────────────────────────────
async function start() {
  const dbOk = await testConnection();
  if (!dbOk) {
    console.error('❌ Impossible de démarrer sans base de données.');
    process.exit(1);
  }
  app.listen(PORT, () => {
    console.log('\n🚗  AutoFranchise API — Togo 🇹🇬');
    console.log(`✅  http://localhost:${PORT}`);
    console.log(`🗄️  MySQL : ${process.env.DB_HOST || 'localhost'}/${process.env.DB_NAME || 'autofranchise'}`);
    console.log(`🌍  Env   : ${process.env.NODE_ENV || 'development'}\n`);
  });
}
start();

module.exports = app;
