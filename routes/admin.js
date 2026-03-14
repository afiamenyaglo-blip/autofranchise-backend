// routes/admin.js — Tableau de bord admin
const express = require('express');
const router  = express.Router();
const { query, queryOne } = require('../config/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

router.get('/stats', requireAuth, requireAdmin, async (req, res) => {
  const [u, vt, vp, va, rt, rp, rc, rev, revm] = await Promise.all([
    queryOne('SELECT COUNT(*) AS n FROM utilisateurs WHERE actif=1'),
    queryOne('SELECT COUNT(*) AS n FROM vehicules'),
    queryOne('SELECT COUNT(*) AS n FROM vehicules WHERE approuve=0'),
    queryOne('SELECT COUNT(*) AS n FROM vehicules WHERE approuve=1'),
    queryOne('SELECT COUNT(*) AS n FROM reservations'),
    queryOne("SELECT COUNT(*) AS n FROM reservations WHERE statut='en_attente'"),
    queryOne("SELECT COUNT(*) AS n FROM reservations WHERE statut='confirmee'"),
    queryOne("SELECT COALESCE(SUM(montant),0) AS n FROM paiements WHERE statut='succes'"),
    queryOne("SELECT COALESCE(SUM(montant),0) AS n FROM paiements WHERE statut='succes' AND MONTH(cree_le)=MONTH(NOW())"),
  ]);

  const villes  = await query('SELECT ville, COUNT(*) AS nb FROM vehicules WHERE approuve=1 GROUP BY ville ORDER BY nb DESC');
  const recents = await query('SELECT prenom,nom,telephone,role,cree_le FROM utilisateurs ORDER BY cree_le DESC LIMIT 5');

  res.json({
    succes: true,
    stats: {
      utilisateurs: u.n, vehicules_total: vt.n,
      vehicules_en_attente: vp.n, vehicules_approuves: va.n,
      reservations_total: rt.n, reservations_en_attente: rp.n,
      reservations_confirmees: rc.n,
      revenus_total: rev.n, revenus_mois: revm.n,
    },
    villes, recents_inscrits: recents,
  });
});

router.get('/vehicules-en-attente', requireAuth, requireAdmin, async (req, res) => {
  const vehicules = await query(`
    SELECT v.*, u.prenom, u.nom, u.telephone
    FROM vehicules v JOIN utilisateurs u ON u.id=v.proprietaire_id
    WHERE v.approuve=0 ORDER BY v.cree_le ASC
  `);
  res.json({ succes: true, vehicules });
});

router.get('/utilisateurs', requireAuth, requireAdmin, async (req, res) => {
  const { role, page=1, limite=20 } = req.query;
  let where=[]; let params=[];
  if (role) { where.push('role=?'); params.push(role); }
  const whereSQL = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const offset   = (parseInt(page)-1)*parseInt(limite);
  const [total]  = await query(`SELECT COUNT(*) AS n FROM utilisateurs ${whereSQL}`, params);
  const utilisateurs = await query(`SELECT id,prenom,nom,email,telephone,ville,role,actif,cree_le FROM utilisateurs ${whereSQL} ORDER BY cree_le DESC LIMIT ? OFFSET ?`, [...params,parseInt(limite),offset]);
  res.json({ succes: true, total: total.n, utilisateurs });
});

router.patch('/utilisateurs/:id', requireAuth, requireAdmin, async (req, res) => {
  const { actif, role } = req.body;
  if (actif!==undefined) await query('UPDATE utilisateurs SET actif=? WHERE id=?', [actif?1:0, req.params.id]);
  if (role) await query('UPDATE utilisateurs SET role=? WHERE id=?', [role, req.params.id]);
  res.json({ succes: true, message: 'Utilisateur mis à jour.' });
});

module.exports = router;
