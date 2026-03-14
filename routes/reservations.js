// routes/reservations.js
const express = require('express');
const router  = express.Router();
const { query, queryOne, transaction } = require('../config/db');
const { requireAuth } = require('../middleware/auth');

router.post('/', requireAuth, async (req, res) => {
  const { vehicule_id, date_debut, date_fin, lieu_prise_en_charge, notes } = req.body;
  if (!vehicule_id || !date_debut)
    return res.status(400).json({ succes: false, message: 'vehicule_id et date_debut requis.' });

  const vehicule = await queryOne('SELECT * FROM vehicules WHERE id=? AND disponible=1 AND approuve=1', [vehicule_id]);
  if (!vehicule) return res.status(404).json({ succes: false, message: 'Véhicule indisponible.' });

  if (date_fin) {
    const conflit = await queryOne(`
      SELECT id FROM reservations
      WHERE vehicule_id=? AND statut NOT IN ('annulee','refusee')
        AND NOT (date_fin < ? OR date_debut > ?)
    `, [vehicule_id, date_debut, date_fin]);
    if (conflit) return res.status(409).json({ succes: false, message: 'Véhicule déjà réservé pour ces dates.' });
  }

  let nbJours = 1;
  if (date_fin && vehicule.prix_location) {
    nbJours = Math.max(1, Math.ceil((new Date(date_fin)-new Date(date_debut))/(1000*3600*24)));
  }
  const prix = vehicule.type_annonce==='vente' ? vehicule.prix_vente : (vehicule.prix_location||0)*nbJours;
  const fraisService = Math.round(prix * 0.05);
  const montantTotal = prix + fraisService;

  const result = await query(`
    INSERT INTO reservations (vehicule_id,client_id,date_debut,date_fin,lieu_prise_en_charge,nb_jours,montant_ht,frais_service,montant_total,notes)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `, [vehicule_id, req.user.id, date_debut, date_fin||null, lieu_prise_en_charge||null, nbJours, prix, fraisService, montantTotal, notes||null]);

  const reservation = await queryOne('SELECT * FROM reservations WHERE id=?', [result.insertId]);
  res.status(201).json({ succes: true, message: 'Réservation créée ! Procédez au paiement.', reservation });
});

router.get('/mes', requireAuth, async (req, res) => {
  const { statut } = req.query;
  let where = ['r.client_id=?']; let params = [req.user.id];
  if (statut) { where.push('r.statut=?'); params.push(statut); }
  const reservations = await query(`
    SELECT r.*, v.marque, v.modele, v.annee, v.images, v.ville AS ville_vehicule,
           u.prenom AS prenom_prop, u.telephone AS tel_prop
    FROM reservations r
    JOIN vehicules v ON v.id=r.vehicule_id
    JOIN utilisateurs u ON u.id=v.proprietaire_id
    WHERE ${where.join(' AND ')} ORDER BY r.cree_le DESC
  `, params);
  res.json({ succes: true, reservations });
});

router.get('/proprietaire', requireAuth, async (req, res) => {
  const { statut } = req.query;
  let where = ['v.proprietaire_id=?']; let params = [req.user.id];
  if (statut) { where.push('r.statut=?'); params.push(statut); }
  const reservations = await query(`
    SELECT r.*, v.marque, v.modele, v.annee,
           u.prenom AS prenom_client, u.telephone AS tel_client
    FROM reservations r
    JOIN vehicules v ON v.id=r.vehicule_id
    JOIN utilisateurs u ON u.id=r.client_id
    WHERE ${where.join(' AND ')} ORDER BY r.cree_le DESC
  `, params);
  res.json({ succes: true, reservations });
});

router.get('/:id', requireAuth, async (req, res) => {
  const r = await queryOne(`
    SELECT r.*, v.marque, v.modele, v.annee, v.images, v.prix_location, v.prix_vente,
           uc.prenom AS prenom_client, uc.telephone AS tel_client,
           up.prenom AS prenom_prop,   up.telephone AS tel_prop,
           p.statut AS statut_paiement, p.methode AS methode_paiement, p.reference
    FROM reservations r
    JOIN vehicules v    ON v.id=r.vehicule_id
    JOIN utilisateurs uc ON uc.id=r.client_id
    JOIN utilisateurs up ON up.id=v.proprietaire_id
    LEFT JOIN paiements p ON p.reservation_id=r.id
    WHERE r.id=? AND (r.client_id=? OR v.proprietaire_id=? OR ?='admin')
  `, [req.params.id, req.user.id, req.user.id, req.user.role]);

  if (!r) return res.status(404).json({ succes: false, message: 'Réservation introuvable.' });
  res.json({ succes: true, reservation: r });
});

router.patch('/:id/statut', requireAuth, async (req, res) => {
  const { statut } = req.body;
  if (!['confirmee','annulee','terminee','refusee'].includes(statut))
    return res.status(400).json({ succes: false, message: 'Statut invalide.' });

  const r = await queryOne('SELECT r.client_id, v.proprietaire_id FROM reservations r JOIN vehicules v ON v.id=r.vehicule_id WHERE r.id=?', [req.params.id]);
  if (!r) return res.status(404).json({ succes: false, message: 'Introuvable.' });

  const isClient = r.client_id===req.user.id;
  const isProp   = r.proprietaire_id===req.user.id;
  const isAdmin  = req.user.role==='admin';
  if (!isClient && !isProp && !isAdmin) return res.status(403).json({ succes: false, message: 'Non autorisé.' });
  if (isClient && statut!=='annulee')  return res.status(403).json({ succes: false, message: 'Vous pouvez uniquement annuler.' });

  await query('UPDATE reservations SET statut=? WHERE id=?', [statut, req.params.id]);
  res.json({ succes: true, message: `Réservation ${statut}.` });
});

module.exports = router;
