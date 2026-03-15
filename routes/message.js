// routes/messages.js — Messagerie temps réel entre clients et propriétaires
const express = require('express');
const router  = express.Router();
const { query, queryOne } = require('../config/db');
const { requireAuth } = require('../middleware/auth');

// ── GET /api/messages/conversations ─────────────────────────────
// Liste toutes les conversations de l'utilisateur connecté
router.get('/conversations', requireAuth, async (req, res) => {
  const convs = await query(`
    SELECT
      CASE WHEN m.expediteur_id = ? THEN m.destinataire_id ELSE m.expediteur_id END AS interlocuteur_id,
      u.prenom, u.nom, u.telephone, u.role,
      MAX(m.cree_le) AS dernier_message_le,
      SUM(CASE WHEN m.lu=0 AND m.destinataire_id=? THEN 1 ELSE 0 END) AS non_lus,
      (SELECT contenu FROM messages m2
       WHERE (m2.expediteur_id=? AND m2.destinataire_id=CASE WHEN m.expediteur_id=? THEN m.destinataire_id ELSE m.expediteur_id END)
          OR (m2.destinataire_id=? AND m2.expediteur_id=CASE WHEN m.expediteur_id=? THEN m.destinataire_id ELSE m.expediteur_id END)
       ORDER BY m2.cree_le DESC LIMIT 1) AS dernier_message,
      v.marque, v.modele, v.id AS vehicule_id
    FROM messages m
    JOIN utilisateurs u ON u.id = CASE WHEN m.expediteur_id=? THEN m.destinataire_id ELSE m.expediteur_id END
    LEFT JOIN vehicules v ON v.id = m.vehicule_id
    WHERE m.expediteur_id=? OR m.destinataire_id=?
    GROUP BY interlocuteur_id, u.prenom, u.nom, u.telephone, u.role, v.marque, v.modele, v.id
    ORDER BY dernier_message_le DESC
  `, [req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id]);

  res.json({ succes: true, conversations: convs });
});

// ── GET /api/messages/:userId ────────────────────────────────────
// Messages entre l'utilisateur connecté et un autre utilisateur
router.get('/:userId', requireAuth, async (req, res) => {
  const { vehicule_id } = req.query;
  let sql = `
    SELECT m.*, 
           u.prenom AS prenom_exp, u.nom AS nom_exp,
           v.marque, v.modele
    FROM messages m
    JOIN utilisateurs u ON u.id = m.expediteur_id
    LEFT JOIN vehicules v ON v.id = m.vehicule_id
    WHERE ((m.expediteur_id=? AND m.destinataire_id=?)
        OR (m.expediteur_id=? AND m.destinataire_id=?))
  `;
  let params = [req.user.id, req.params.userId, req.params.userId, req.user.id];
  if (vehicule_id) { sql += ' AND m.vehicule_id=?'; params.push(vehicule_id); }
  sql += ' ORDER BY m.cree_le ASC';

  const messages = await query(sql, params);

  // Marquer comme lus
  await query('UPDATE messages SET lu=1 WHERE destinataire_id=? AND expediteur_id=?',
    [req.user.id, req.params.userId]);

  // Infos interlocuteur
  const interlocuteur = await queryOne(
    'SELECT id, prenom, nom, telephone, role FROM utilisateurs WHERE id=?',
    [req.params.userId]
  );

  res.json({ succes: true, messages, interlocuteur });
});

// ── POST /api/messages ───────────────────────────────────────────
// Envoyer un message
router.post('/', requireAuth, async (req, res) => {
  const { destinataire_id, contenu, vehicule_id } = req.body;

  if (!destinataire_id || !contenu?.trim()) {
    return res.status(400).json({ succes: false, message: 'destinataire_id et contenu requis.' });
  }
  if (destinataire_id == req.user.id) {
    return res.status(400).json({ succes: false, message: 'Vous ne pouvez pas vous envoyer un message.' });
  }

  const dest = await queryOne('SELECT id FROM utilisateurs WHERE id=?', [destinataire_id]);
  if (!dest) return res.status(404).json({ succes: false, message: 'Destinataire introuvable.' });

  const result = await query(
    'INSERT INTO messages (expediteur_id, destinataire_id, vehicule_id, contenu) VALUES (?,?,?,?)',
    [req.user.id, destinataire_id, vehicule_id||null, contenu.trim()]
  );

  const message = await queryOne(`
    SELECT m.*, u.prenom AS prenom_exp, u.nom AS nom_exp
    FROM messages m JOIN utilisateurs u ON u.id=m.expediteur_id
    WHERE m.id=?
  `, [result.insertId]);

  res.status(201).json({ succes: true, message });
});

// ── GET /api/messages/non-lus/count ─────────────────────────────
router.get('/non-lus/count', requireAuth, async (req, res) => {
  const row = await queryOne(
    'SELECT COUNT(*) AS n FROM messages WHERE destinataire_id=? AND lu=0',
    [req.user.id]
  );
  res.json({ succes: true, count: row.n });
});

// ── DELETE /api/messages/:id ─────────────────────────────────────
router.delete('/:id', requireAuth, async (req, res) => {
  const msg = await queryOne('SELECT expediteur_id FROM messages WHERE id=?', [req.params.id]);
  if (!msg) return res.status(404).json({ succes: false, message: 'Message introuvable.' });
  if (msg.expediteur_id !== req.user.id)
    return res.status(403).json({ succes: false, message: 'Non autorisé.' });
  await query('DELETE FROM messages WHERE id=?', [req.params.id]);
  res.json({ succes: true, message: 'Message supprimé.' });
});

module.exports = router;

// ── GET /api/auth/trouver?q= — Trouver un utilisateur ──────────
// (À ajouter dans routes/auth.js)
/*
router.get('/trouver', requireAuth, async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ succes: false, message: 'Paramètre q requis.' });
  const user = await queryOne(
    'SELECT id, prenom, nom, telephone, role FROM utilisateurs WHERE telephone=? OR email=?',
    [q, q]
  );
  if (!user) return res.status(404).json({ succes: false, message: 'Utilisateur introuvable.' });
  res.json({ succes: true, utilisateur: user });
});
*/
