// routes/vehicules.js — CRUD véhicules + images + avis + favoris
const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { query, queryOne } = require('../config/db');
const { requireAuth, requireAdmin, optionalAuth } = require('../middleware/auth');

// ── Config upload Multer ──────────────────────────────────────────
const uploadDir = process.env.UPLOAD_DIR || './uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `v_${Date.now()}_${Math.random().toString(36).substr(2,5)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    /\.(jpg|jpeg|png|webp)$/i.test(file.originalname) ? cb(null, true) : cb(new Error('Format accepté : JPG, PNG, WEBP'));
  },
});

// ── GET /api/vehicules ────────────────────────────────────────────
router.get('/', optionalAuth, async (req, res) => {
  const { type, marque, ville, carburant, prix_min, prix_max,
          annee_min, page=1, limite=12, tri='cree_le', ordre='DESC', recherche } = req.query;

  let where = ['v.disponible=1','v.approuve=1'];
  let params = [];

  if (type)      { where.push('v.type_annonce=?');                params.push(type); }
  if (marque)    { where.push('v.marque LIKE ?');                 params.push(`%${marque}%`); }
  if (ville)     { where.push('v.ville=?');                       params.push(ville); }
  if (carburant) { where.push('v.carburant=?');                   params.push(carburant); }
  if (prix_min)  { where.push('(v.prix_location>=? OR v.prix_vente>=?)'); params.push(prix_min, prix_min); }
  if (prix_max)  { where.push('(v.prix_location<=? OR v.prix_vente<=?)'); params.push(prix_max, prix_max); }
  if (annee_min) { where.push('v.annee>=?');                      params.push(annee_min); }
  if (recherche) {
    where.push('(v.marque LIKE ? OR v.modele LIKE ? OR v.description LIKE ?)');
    const r = `%${recherche}%`;
    params.push(r, r, r);
  }

  const whereSQL = `WHERE ${where.join(' AND ')}`;
  const trisValides = ['cree_le','prix_location','prix_vente','annee','vues'];
  const colTri  = trisValides.includes(tri) ? `v.${tri}` : 'v.cree_le';
  const ordSQL  = ordre.toUpperCase()==='ASC' ? 'ASC' : 'DESC';
  const offset  = (parseInt(page)-1) * parseInt(limite);

  try {
    const [totalRow] = await query(`SELECT COUNT(*) AS n FROM vehicules v ${whereSQL}`, params);
    const total = totalRow.n;

    const vehicules = await query(`
      SELECT v.*, u.prenom, u.nom, u.telephone AS tel_proprietaire,
             COALESCE(AVG(a.note),0) AS note_moyenne,
             COUNT(DISTINCT a.id) AS nb_avis
      FROM vehicules v
      JOIN utilisateurs u ON u.id=v.proprietaire_id
      LEFT JOIN avis a ON a.vehicule_id=v.id
      ${whereSQL}
      GROUP BY v.id
      ORDER BY v.featured DESC, ${colTri} ${ordSQL}
      LIMIT ? OFFSET ?
    `, [...params, parseInt(limite), offset]);

    res.json({
      succes: true, total, page: parseInt(page),
      pages: Math.ceil(total/parseInt(limite)),
      vehicules: vehicules.map(v => ({ ...v, images: v.images || [] })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ succes: false, message: 'Erreur serveur.' });
  }
});

// ── GET /api/vehicules/:id ────────────────────────────────────────
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const v = await queryOne(`
      SELECT v.*, u.prenom, u.nom, u.telephone AS tel_proprietaire,
             COALESCE(AVG(a.note),0) AS note_moyenne, COUNT(DISTINCT a.id) AS nb_avis
      FROM vehicules v
      JOIN utilisateurs u ON u.id=v.proprietaire_id
      LEFT JOIN avis a ON a.vehicule_id=v.id
      WHERE v.id=? AND (v.approuve=1 OR ?='admin')
      GROUP BY v.id
    `, [req.params.id, req.user?.role||'']);

    if (!v) return res.status(404).json({ succes: false, message: 'Véhicule introuvable.' });

    await query('UPDATE vehicules SET vues=vues+1 WHERE id=?', [v.id]);

    const avis = await query(`
      SELECT a.*, u.prenom, u.nom FROM avis a
      JOIN utilisateurs u ON u.id=a.auteur_id
      WHERE a.vehicule_id=? ORDER BY a.cree_le DESC LIMIT 10
    `, [v.id]);

    const similaires = await query(
      'SELECT id,marque,modele,annee,prix_location,prix_vente,images,ville,type_annonce FROM vehicules WHERE marque=? AND id!=? AND disponible=1 AND approuve=1 LIMIT 4',
      [v.marque, v.id]
    );

    let enFavori = false;
    if (req.user) {
      const fav = await queryOne('SELECT 1 FROM favoris WHERE utilisateur_id=? AND vehicule_id=?', [req.user.id, v.id]);
      enFavori = !!fav;
    }

    res.json({ succes: true, vehicule: { ...v, images: v.images||[], enFavori }, avis, similaires });
  } catch (err) {
    console.error(err);
    res.status(500).json({ succes: false, message: 'Erreur serveur.' });
  }
});

// ── POST /api/vehicules — Créer une annonce ───────────────────────
router.post('/', requireAuth, upload.array('images', 10), async (req, res) => {
  const { type_annonce, marque, modele, annee, kilometrage, carburant,
          transmission, nb_places, couleur, description,
          prix_location, prix_vente, ville, adresse } = req.body;

  if (!type_annonce || !marque || !modele || !annee || !ville) {
    return res.status(400).json({ succes: false, message: 'Champs obligatoires manquants.' });
  }

  const images = (req.files||[]).map(f => `/uploads/${f.filename}`);

  try {
    if (req.user.role==='client') {
      await query("UPDATE utilisateurs SET role='proprietaire' WHERE id=?", [req.user.id]);
    }

    const result = await query(`
      INSERT INTO vehicules
        (proprietaire_id,type_annonce,marque,modele,annee,kilometrage,carburant,transmission,
         nb_places,couleur,description,prix_location,prix_vente,ville,adresse,images)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `, [
      req.user.id, type_annonce, marque, modele, parseInt(annee), parseInt(kilometrage)||0,
      carburant||'essence', transmission||'automatique', parseInt(nb_places)||5,
      couleur||null, description||null,
      prix_location ? parseFloat(prix_location) : null,
      prix_vente    ? parseFloat(prix_vente)    : null,
      ville, adresse||null, JSON.stringify(images)
    ]);

    res.status(201).json({
      succes: true,
      message: 'Annonce soumise ! En attente de validation par notre équipe.',
      vehicule_id: result.insertId,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ succes: false, message: 'Erreur serveur.' });
  }
});

// ── PUT /api/vehicules/:id ────────────────────────────────────────
router.put('/:id', requireAuth, async (req, res) => {
  const v = await queryOne('SELECT proprietaire_id FROM vehicules WHERE id=?', [req.params.id]);
  if (!v) return res.status(404).json({ succes: false, message: 'Véhicule introuvable.' });
  if (v.proprietaire_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ succes: false, message: 'Non autorisé.' });
  }

  const champs = ['type_annonce','marque','modele','annee','kilometrage','carburant',
                  'transmission','nb_places','couleur','description','prix_location',
                  'prix_vente','ville','adresse','disponible'];
  const updates = champs.filter(c => req.body[c] !== undefined).map(c => `${c}=?`).join(', ');
  const vals    = champs.filter(c => req.body[c] !== undefined).map(c => req.body[c]);

  if (!updates) return res.status(400).json({ succes: false, message: 'Rien à modifier.' });

  await query(`UPDATE vehicules SET ${updates} WHERE id=?`, [...vals, req.params.id]);
  res.json({ succes: true, message: 'Annonce mise à jour.' });
});

// ── DELETE /api/vehicules/:id ─────────────────────────────────────
router.delete('/:id', requireAuth, async (req, res) => {
  const v = await queryOne('SELECT proprietaire_id FROM vehicules WHERE id=?', [req.params.id]);
  if (!v) return res.status(404).json({ succes: false, message: 'Véhicule introuvable.' });
  if (v.proprietaire_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ succes: false, message: 'Non autorisé.' });
  }
  await query('DELETE FROM vehicules WHERE id=?', [req.params.id]);
  res.json({ succes: true, message: 'Annonce supprimée.' });
});

// ── POST /api/vehicules/:id/avis ──────────────────────────────────
router.post('/:id/avis', requireAuth, async (req, res) => {
  const { note, commentaire, reservation_id } = req.body;
  if (!note || note < 1 || note > 5) {
    return res.status(400).json({ succes: false, message: 'Note entre 1 et 5 requise.' });
  }
  await query('INSERT INTO avis (vehicule_id,auteur_id,reservation_id,note,commentaire) VALUES (?,?,?,?,?)',
    [req.params.id, req.user.id, reservation_id||null, note, commentaire||null]);
  res.status(201).json({ succes: true, message: 'Avis publié. Merci !' });
});

// ── POST /api/vehicules/:id/favori ────────────────────────────────
router.post('/:id/favori', requireAuth, async (req, res) => {
  const existe = await queryOne('SELECT 1 FROM favoris WHERE utilisateur_id=? AND vehicule_id=?', [req.user.id, req.params.id]);
  if (existe) {
    await query('DELETE FROM favoris WHERE utilisateur_id=? AND vehicule_id=?', [req.user.id, req.params.id]);
    return res.json({ succes: true, message: 'Retiré des favoris.', favori: false });
  }
  await query('INSERT INTO favoris (utilisateur_id,vehicule_id) VALUES (?,?)', [req.user.id, req.params.id]);
  res.json({ succes: true, message: 'Ajouté aux favoris !', favori: true });
});

// ── PATCH /api/vehicules/:id/approuver (Admin) ────────────────────
router.patch('/:id/approuver', requireAuth, requireAdmin, async (req, res) => {
  await query('UPDATE vehicules SET approuve=? WHERE id=?', [req.body.approuve ? 1 : 0, req.params.id]);
  res.json({ succes: true, message: req.body.approuve ? 'Annonce approuvée.' : 'Annonce désapprouvée.' });
});

module.exports = router;
