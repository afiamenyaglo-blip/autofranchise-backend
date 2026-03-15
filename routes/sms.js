// routes/sms.js — API d'envoi de SMS + webhooks automatiques
const express = require('express');
const router  = express.Router();
const { query, queryOne } = require('../config/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { envoyerSMS, SMS } = require('../services/sms');

// ── POST /api/sms/envoyer — Envoi manuel (admin) ─────────────────
router.post('/envoyer', requireAuth, requireAdmin, async (req, res) => {
  const { telephone, message } = req.body;
  if (!telephone || !message) {
    return res.status(400).json({ succes: false, message: 'telephone et message requis.' });
  }
  const result = await envoyerSMS(telephone, message);
  res.json({ succes: result.succes, reference: result.reference, simule: result.simule });
});

// ── POST /api/sms/groupe — Envoi à tous les utilisateurs ─────────
router.post('/groupe', requireAuth, requireAdmin, async (req, res) => {
  const { message, role } = req.body;
  if (!message) return res.status(400).json({ succes: false, message: 'message requis.' });

  let sql = 'SELECT telephone, prenom FROM utilisateurs WHERE actif=1 AND telephone IS NOT NULL';
  let params = [];
  if (role) { sql += ' AND role=?'; params.push(role); }

  const utilisateurs = await query(sql, params);
  if (!utilisateurs.length) {
    return res.json({ succes: true, envoyes: 0, message: 'Aucun destinataire trouvé.' });
  }

  let envoyes = 0;
  for (const u of utilisateurs) {
    const result = await envoyerSMS(u.telephone, message.replace('{prenom}', u.prenom));
    if (result.succes) envoyes++;
    // Délai de 100ms entre chaque envoi pour éviter les limites API
    await new Promise(r => setTimeout(r, 100));
  }

  res.json({ succes: true, envoyes, total: utilisateurs.length,
    message: `${envoyes}/${utilisateurs.length} SMS envoyés.` });
});

// ── POST /api/sms/test — Tester l'envoi SMS ──────────────────────
router.post('/test', requireAuth, requireAdmin, async (req, res) => {
  const user = await queryOne('SELECT telephone, prenom FROM utilisateurs WHERE id=?', [req.user.id]);
  const result = await envoyerSMS(user.telephone,
    `AutoFranchise TEST 🔔\nBonjour ${user.prenom} !\nLe système SMS fonctionne parfaitement. 🇹🇬`);
  res.json({ succes: result.succes, telephone: user.telephone, reference: result.reference });
});

// ══════════════════════════════════════════════════════════════════
//  NOTIFICATIONS AUTOMATIQUES
//  Ces fonctions sont appelées depuis les autres routes
// ══════════════════════════════════════════════════════════════════

// Appelée depuis routes/auth.js après inscription
async function notifInscription(utilisateur) {
  await envoyerSMS(utilisateur.telephone, SMS.bienvenue(utilisateur.prenom));
}

// Appelée depuis routes/reservations.js après création
async function notifReservationCreee(reservation, vehicule, client) {
  const nomVehicule = `${vehicule.marque} ${vehicule.modele} ${vehicule.annee}`;
  // SMS au client
  await envoyerSMS(client.telephone,
    SMS.reservationCreee(client.prenom, nomVehicule, reservation.montant_total, `RES-${reservation.id}`));

  // SMS au propriétaire
  const proprietaire = await queryOne('SELECT * FROM utilisateurs WHERE id=?', [vehicule.proprietaire_id]);
  if (proprietaire) {
    await envoyerSMS(proprietaire.telephone,
      `AutoFranchise 🔔\nNouvelle réservation !\nVéhicule: ${nomVehicule}\nClient: ${client.prenom} ${client.nom}\nMontant: ${Number(reservation.montant_total).toLocaleString()} FCFA\nRépondez via: autofranchise-togo.netlify.app`);
  }
}

// Appelée depuis routes/paiements.js après paiement confirmé
async function notifPaiementConfirme(paiement, reservation, vehicule, client) {
  const nomVehicule = `${vehicule.marque} ${vehicule.modele}`;
  await envoyerSMS(client.telephone,
    SMS.paiementConfirme(client.prenom, nomVehicule, paiement.montant, paiement.reference));
}

// Appelée depuis routes/vehicules.js après approbation
async function notifAnnonceApprouvee(vehicule, proprietaire, approuve) {
  const nomVehicule = `${vehicule.marque} ${vehicule.modele} ${vehicule.annee}`;
  if (approuve) {
    await envoyerSMS(proprietaire.telephone, SMS.annonceApprouvee(proprietaire.prenom, nomVehicule));
  } else {
    await envoyerSMS(proprietaire.telephone, SMS.annonceRefusee(proprietaire.prenom, nomVehicule));
  }

  // Notifier l'admin d'une nouvelle annonce
  const admins = await query("SELECT telephone FROM utilisateurs WHERE role='admin' AND actif=1");
  for (const admin of admins) {
    await envoyerSMS(admin.telephone,
      SMS.nouvelleAnnonce(vehicule.marque, vehicule.modele, `${proprietaire.prenom} ${proprietaire.nom}`));
  }
}

// Appelée depuis routes/reservations.js après changement de statut
async function notifStatutReservation(reservation, vehicule, client, statut) {
  const nomVehicule = `${vehicule.marque} ${vehicule.modele}`;
  if (statut === 'confirmee') {
    await envoyerSMS(client.telephone,
      SMS.reservationApprouvee(client.prenom, nomVehicule, reservation.date_debut));
  } else if (statut === 'annulee' || statut === 'refusee') {
    await envoyerSMS(client.telephone, SMS.reservationAnnulee(client.prenom, nomVehicule));
  }
}

module.exports = {
  router,
  notifInscription,
  notifReservationCreee,
  notifPaiementConfirme,
  notifAnnonceApprouvee,
  notifStatutReservation,
};
