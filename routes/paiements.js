// routes/paiements.js — Mobile Money Flooz & TMoney
const express = require('express');
const router  = express.Router();
const { query, queryOne } = require('../config/db');
const { requireAuth } = require('../middleware/auth');

const genRef = m => `${m==='flooz'?'FLZ':m==='tmoney'?'TMN':'VIR'}-${Date.now()}-${Math.random().toString(36).substr(2,6).toUpperCase()}`;

async function appelMobileMoney(methode, numero, montant, reference) {
  // ── SIMULATION (remplacer par vraie API en production) ──────────
  await new Promise(r => setTimeout(r, 80));
  const succes = Math.random() > 0.05;
  return {
    succes,
    reference_operateur: succes ? `OP-${Math.random().toString(36).substr(2,10).toUpperCase()}` : null,
    message: succes ? `Paiement ${methode} confirmé` : 'Solde insuffisant',
    montant_debite: succes ? montant : 0,
    horodatage: new Date().toISOString(),
  };

  // ── FLOOZ PRODUCTION ────────────────────────────────────────────
  // const resp = await fetch(`${process.env.FLOOZ_API_URL}/payment`, {
  //   method: 'POST',
  //   headers: { 'Authorization': `Bearer ${process.env.FLOOZ_API_KEY}`, 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ subscriber_number: numero, amount: montant, external_reference: reference })
  // });
  // return resp.json();

  // ── TMONEY PRODUCTION ───────────────────────────────────────────
  // const resp = await fetch(`${process.env.TMONEY_API_URL}/transactions`, {
  //   method: 'POST',
  //   headers: { 'Authorization': `Bearer ${process.env.TMONEY_API_KEY}`, 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ msisdn: numero, amount: montant, reference, description: 'AutoFranchise Togo' })
  // });
  // return resp.json();
}

router.post('/initier', requireAuth, async (req, res) => {
  const { reservation_id, methode, numero_telephone } = req.body;
  if (!reservation_id || !methode || !numero_telephone)
    return res.status(400).json({ succes: false, message: 'reservation_id, methode et numero_telephone requis.' });
  if (!['flooz','tmoney','virement'].includes(methode))
    return res.status(400).json({ succes: false, message: 'Méthode invalide : flooz | tmoney | virement' });

  const reservation = await queryOne('SELECT * FROM reservations WHERE id=? AND client_id=?', [reservation_id, req.user.id]);
  if (!reservation)              return res.status(404).json({ succes: false, message: 'Réservation introuvable.' });
  if (reservation.statut==='confirmee') return res.status(409).json({ succes: false, message: 'Déjà payée.' });

  const dejaPayee = await queryOne("SELECT id FROM paiements WHERE reservation_id=? AND statut='succes'", [reservation_id]);
  if (dejaPayee) return res.status(409).json({ succes: false, message: 'Paiement déjà effectué.' });

  const reference = genRef(methode);
  try {
    const reponse = await appelMobileMoney(methode, numero_telephone, reservation.montant_total, reference);
    const statut  = reponse.succes ? 'succes' : 'echec';

    await query(`
      INSERT INTO paiements (reservation_id,utilisateur_id,methode,numero_telephone,montant,reference,statut,reponse_operateur)
      VALUES (?,?,?,?,?,?,?,?)
    `, [reservation_id, req.user.id, methode, numero_telephone, reservation.montant_total, reference, statut, JSON.stringify(reponse)]);

    if (reponse.succes) {
      await query("UPDATE reservations SET statut='confirmee' WHERE id=?", [reservation_id]);
      return res.json({
        succes: true,
        message: `✅ Paiement ${methode==='flooz'?'Flooz':'TMoney'} confirmé ! Réservation validée.`,
        reference, reference_operateur: reponse.reference_operateur,
        montant: reservation.montant_total, statut: 'succes',
      });
    }
    res.status(402).json({ succes: false, message: reponse.message || 'Paiement refusé.', reference, statut: 'echec' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ succes: false, message: 'Erreur lors du paiement. Réessayez.' });
  }
});

router.get('/mes', requireAuth, async (req, res) => {
  const paiements = await query(`
    SELECT p.*, r.date_debut, r.date_fin, r.nb_jours, v.marque, v.modele
    FROM paiements p
    JOIN reservations r ON r.id=p.reservation_id
    JOIN vehicules v    ON v.id=r.vehicule_id
    WHERE p.utilisateur_id=? ORDER BY p.cree_le DESC
  `, [req.user.id]);
  res.json({ succes: true, paiements });
});

router.get('/:reference', requireAuth, async (req, res) => {
  const p = await queryOne(`
    SELECT p.*, r.date_debut, r.date_fin, r.nb_jours, r.montant_ht, r.frais_service,
           v.marque, v.modele, v.annee, u.prenom, u.nom
    FROM paiements p
    JOIN reservations r ON r.id=p.reservation_id
    JOIN vehicules v    ON v.id=r.vehicule_id
    JOIN utilisateurs u ON u.id=p.utilisateur_id
    WHERE p.reference=? AND (p.utilisateur_id=? OR ?='admin')
  `, [req.params.reference, req.user.id, req.user.role]);
  if (!p) return res.status(404).json({ succes: false, message: 'Paiement introuvable.' });
  res.json({ succes: true, paiement: p });
});

router.post('/remboursement', requireAuth, async (req, res) => {
  const { reference } = req.body;
  const p = await queryOne("SELECT * FROM paiements WHERE reference=? AND statut='succes'", [reference]);
  if (!p) return res.status(404).json({ succes: false, message: 'Paiement non éligible.' });
  if (p.utilisateur_id!==req.user.id && req.user.role!=='admin')
    return res.status(403).json({ succes: false, message: 'Non autorisé.' });

  await query("UPDATE paiements SET statut='rembourse' WHERE reference=?", [reference]);
  await query("UPDATE reservations SET statut='annulee' WHERE id=?", [p.reservation_id]);
  res.json({ succes: true, message: `Remboursement de ${p.montant.toLocaleString()} FCFA initié. Délai : 24-48h.`, ref: `RMB-${reference}` });
});

module.exports = router;
