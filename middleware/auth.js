// middleware/auth.js — Vérification JWT + gestion des rôles
const jwt = require('jsonwebtoken');
const { queryOne } = require('../config/db');

async function requireAuth(req, res, next) {
  const header = req.headers['authorization'];
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ succes: false, message: 'Token manquant. Veuillez vous connecter.' });
  }
  try {
    const decoded = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
    const user = await queryOne(
      'SELECT id, prenom, nom, email, telephone, role, actif FROM utilisateurs WHERE id = ?',
      [decoded.id]
    );
    if (!user || !user.actif) {
      return res.status(401).json({ succes: false, message: 'Compte introuvable ou désactivé.' });
    }
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ succes: false, message: 'Token invalide ou expiré.' });
  }
}

async function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ succes: false, message: 'Accès réservé aux administrateurs.' });
  }
  next();
}

async function optionalAuth(req, res, next) {
  const header = req.headers['authorization'];
  if (header?.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
      req.user = await queryOne('SELECT id, prenom, nom, role FROM utilisateurs WHERE id = ?', [decoded.id]);
    } catch { req.user = null; }
  }
  next();
}

module.exports = { requireAuth, requireAdmin, optionalAuth };
