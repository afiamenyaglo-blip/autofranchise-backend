// routes/auth.js — Inscription, Connexion, Profil
const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { query, queryOne } = require('../config/db');
const { requireAuth } = require('../middleware/auth');

const genToken = id => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

// ── POST /api/auth/inscription ────────────────────────────────────
router.post('/inscription', [
  body('prenom').trim().notEmpty().withMessage('Prénom requis'),
  body('nom').trim().notEmpty().withMessage('Nom requis'),
  body('telephone').trim().notEmpty().withMessage('Téléphone requis'),
  body('mot_de_passe').isLength({ min: 6 }).withMessage('Mot de passe min. 6 caractères'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ succes: false, erreurs: errors.array() });

  const { prenom, nom, email, telephone, mot_de_passe, ville, role } = req.body;

  try {
    const existant = await queryOne(
      'SELECT id FROM utilisateurs WHERE telephone = ? OR (email IS NOT NULL AND email = ?)',
      [telephone, email || '']
    );
    if (existant) return res.status(409).json({ succes: false, message: 'Téléphone ou email déjà utilisé.' });

    const hash = await bcrypt.hash(mot_de_passe, 12);
    const roleValide = ['client','proprietaire'].includes(role) ? role : 'client';

    const result = await query(
      'INSERT INTO utilisateurs (prenom, nom, email, telephone, mot_de_passe, ville, role) VALUES (?,?,?,?,?,?,?)',
      [prenom, nom, email||null, telephone, hash, ville||'Lomé', roleValide]
    );

    const user = await queryOne('SELECT id,prenom,nom,email,telephone,ville,role FROM utilisateurs WHERE id=?', [result.insertId]);
    res.status(201).json({ succes: true, message: `Bienvenue sur AutoFranchise, ${prenom} ! 🎉`, token: genToken(result.insertId), utilisateur: user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ succes: false, message: 'Erreur serveur.' });
  }
});

// ── POST /api/auth/connexion ──────────────────────────────────────
router.post('/connexion', [
  body('identifiant').trim().notEmpty().withMessage('Identifiant requis'),
  body('mot_de_passe').notEmpty().withMessage('Mot de passe requis'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ succes: false, erreurs: errors.array() });

  const { identifiant, mot_de_passe } = req.body;

  try {
    const user = await queryOne('SELECT * FROM utilisateurs WHERE telephone=? OR email=?', [identifiant, identifiant]);
    if (!user)        return res.status(401).json({ succes: false, message: 'Identifiants incorrects.' });
    if (!user.actif)  return res.status(401).json({ succes: false, message: 'Compte désactivé.' });

    const valide = await bcrypt.compare(mot_de_passe, user.mot_de_passe);
    if (!valide) return res.status(401).json({ succes: false, message: 'Identifiants incorrects.' });

    const { mot_de_passe: _, ...userSafe } = user;
    res.json({ succes: true, message: `Bonjour ${user.prenom} ! 👋`, token: genToken(user.id), utilisateur: userSafe });
  } catch (err) {
    console.error(err);
    res.status(500).json({ succes: false, message: 'Erreur serveur.' });
  }
});

// ── GET /api/auth/profil ──────────────────────────────────────────
router.get('/profil', requireAuth, async (req, res) => {
  const user = await queryOne(`
    SELECT u.id, u.prenom, u.nom, u.email, u.telephone, u.ville, u.role, u.avatar, u.cree_le,
           COUNT(DISTINCT v.id) AS nb_vehicules,
           COUNT(DISTINCT r.id) AS nb_reservations
    FROM utilisateurs u
    LEFT JOIN vehicules v    ON v.proprietaire_id = u.id
    LEFT JOIN reservations r ON r.client_id = u.id
    WHERE u.id = ?
    GROUP BY u.id
  `, [req.user.id]);
  res.json({ succes: true, utilisateur: user });
});

// ── PUT /api/auth/profil ──────────────────────────────────────────
router.put('/profil', requireAuth, async (req, res) => {
  const { prenom, nom, email, ville } = req.body;
  await query('UPDATE utilisateurs SET prenom=?,nom=?,email=?,ville=? WHERE id=?',
    [prenom||req.user.prenom, nom||req.user.nom, email||null, ville||'Lomé', req.user.id]);
  res.json({ succes: true, message: 'Profil mis à jour.' });
});

// ── PUT /api/auth/mot-de-passe ────────────────────────────────────
router.put('/mot-de-passe', requireAuth, async (req, res) => {
  const { ancien, nouveau } = req.body;
  const user = await queryOne('SELECT mot_de_passe FROM utilisateurs WHERE id=?', [req.user.id]);
  const valide = await bcrypt.compare(ancien, user.mot_de_passe);
  if (!valide) return res.status(400).json({ succes: false, message: 'Ancien mot de passe incorrect.' });
  const hash = await bcrypt.hash(nouveau, 12);
  await query('UPDATE utilisateurs SET mot_de_passe=? WHERE id=?', [hash, req.user.id]);
  res.json({ succes: true, message: 'Mot de passe modifié.' });
});

module.exports = router;
