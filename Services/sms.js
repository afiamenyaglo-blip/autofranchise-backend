// services/sms.js — Service SMS pour le Togo (AfricasTalking)
require('dotenv').config();

// ══════════════════════════════════════════════════════════════════
//  CONFIGURATION
//  Fournisseur principal : AfricasTalking (recommandé pour le Togo)
//  Fournisseur backup   : Twilio
//  Mode simulation      : activé si pas de clé API configurée
// ══════════════════════════════════════════════════════════════════

const SMS_PROVIDER  = process.env.SMS_PROVIDER  || 'simulation'; // 'africastalking' | 'twilio' | 'simulation'
const SMS_SENDER    = process.env.SMS_SENDER     || 'AutoFranchise';

// ── Formatage numéro togolais ─────────────────────────────────────
function formatNumero(numero) {
  // Accepte : +22890123456, 0022890123456, 90123456
  let n = numero.replace(/[\s\-\.]/g, '');
  if (n.startsWith('00228')) n = '+228' + n.slice(5);
  if (!n.startsWith('+228') && !n.startsWith('+')) n = '+228' + n;
  return n;
}

// ── Envoi via AfricasTalking ──────────────────────────────────────
async function sendViaAfricasTalking(to, message) {
  const AT = require('africastalking')({
    apiKey:   process.env.AT_API_KEY,
    username: process.env.AT_USERNAME,
  });
  const sms = AT.SMS;
  const result = await sms.send({
    to:      [formatNumero(to)],
    message: message,
    from:    SMS_SENDER,
  });
  return {
    succes: result.SMSMessageData?.Recipients?.[0]?.status === 'Success',
    reference: result.SMSMessageData?.Recipients?.[0]?.messageId,
    cout: result.SMSMessageData?.Recipients?.[0]?.cost,
  };
}

// ── Envoi via Twilio ──────────────────────────────────────────────
async function sendViaTwilio(to, message) {
  const twilio = require('twilio')(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
  const result = await twilio.messages.create({
    body: message,
    from: process.env.TWILIO_FROM,
    to:   formatNumero(to),
  });
  return { succes: result.status === 'queued' || result.status === 'sent', reference: result.sid };
}

// ── Simulation (développement) ────────────────────────────────────
async function sendSimulation(to, message) {
  console.log('\n📱 ══════════════════════════════════════════');
  console.log(`   SMS SIMULÉ → ${formatNumero(to)}`);
  console.log(`   De         : ${SMS_SENDER}`);
  console.log(`   Message    :\n   ${message.replace(/\n/g, '\n   ')}`);
  console.log('══════════════════════════════════════════\n');
  return { succes: true, reference: `SIM-${Date.now()}`, simule: true };
}

// ── Fonction principale d'envoi ───────────────────────────────────
async function envoyerSMS(to, message) {
  if (!to) return { succes: false, message: 'Numéro manquant' };

  try {
    let result;
    switch (SMS_PROVIDER) {
      case 'africastalking': result = await sendViaAfricasTalking(to, message); break;
      case 'twilio':         result = await sendViaTwilio(to, message);         break;
      default:               result = await sendSimulation(to, message);        break;
    }
    console.log(`✅ SMS envoyé à ${formatNumero(to)} — Ref: ${result.reference}`);
    return result;
  } catch (err) {
    console.error(`❌ Erreur SMS vers ${to}:`, err.message);
    // Fallback simulation si erreur
    return await sendSimulation(to, `[FALLBACK] ${message}`);
  }
}

// ══════════════════════════════════════════════════════════════════
//  MODÈLES DE MESSAGES SMS
// ══════════════════════════════════════════════════════════════════

const SMS = {

  // ── Inscription ─────────────────────────────────────────────────
  bienvenue: (prenom) =>
    `Bonjour ${prenom} ! 🎉\nBienvenue sur AutoFranchise Togo !\nVotre compte est activé.\nLocation & vente de véhicules au Togo 🇹🇬\nautofranchise-togo.netlify.app`,

  // ── Réservation créée ────────────────────────────────────────────
  reservationCreee: (prenom, vehicule, montant, reference) =>
    `AutoFranchise 🚗\nBonjour ${prenom},\nVotre réservation est enregistrée !\nVéhicule: ${vehicule}\nMontant: ${Number(montant).toLocaleString()} FCFA\nRef: ${reference}\nPayez par Flooz/TMoney pour confirmer.`,

  // ── Paiement confirmé ────────────────────────────────────────────
  paiementConfirme: (prenom, vehicule, montant, reference) =>
    `AutoFranchise ✅\nBonjour ${prenom},\nPaiement confirmé !\nVéhicule: ${vehicule}\nMontant: ${Number(montant).toLocaleString()} FCFA\nRef: ${reference}\nBonne route ! 🚗`,

  // ── Réservation approuvée (par propriétaire) ─────────────────────
  reservationApprouvee: (prenom, vehicule, dateDebut) =>
    `AutoFranchise ✅\nBonjour ${prenom},\nVotre réservation est CONFIRMÉE !\nVéhicule: ${vehicule}\nDébut: ${dateDebut}\nBonne route ! 🇹🇬`,

  // ── Réservation annulée ──────────────────────────────────────────
  reservationAnnulee: (prenom, vehicule) =>
    `AutoFranchise ❌\nBonjour ${prenom},\nVotre réservation pour ${vehicule} a été annulée.\nContactez-nous: autofranchise-togo.netlify.app`,

  // ── Nouveau message reçu ─────────────────────────────────────────
  nouveauMessage: (prenom, expediteur) =>
    `AutoFranchise 💬\nBonjour ${prenom},\n${expediteur} vous a envoyé un message.\nConsultez: autofranchise-togo.netlify.app/messagerie.html`,

  // ── Nouvelle annonce soumise (pour admin) ────────────────────────
  nouvelleAnnonce: (marque, modele, proprietaire) =>
    `AutoFranchise Admin 🔔\nNouvelle annonce en attente:\n${marque} ${modele}\nPropriétaire: ${proprietaire}\nValider: autofranchise-togo.netlify.app/admin.html`,

  // ── Annonce approuvée ────────────────────────────────────────────
  annonceApprouvee: (prenom, vehicule) =>
    `AutoFranchise ✅\nBonjour ${prenom},\nVotre annonce "${vehicule}" est APPROUVÉE et visible sur la plateforme !\nautofranchise-togo.netlify.app`,

  // ── Annonce refusée ──────────────────────────────────────────────
  annonceRefusee: (prenom, vehicule) =>
    `AutoFranchise ❌\nBonjour ${prenom},\nVotre annonce "${vehicule}" a été refusée.\nContactez-nous pour plus d'infos.`,

  // ── Rappel réservation (J-1) ─────────────────────────────────────
  rappelReservation: (prenom, vehicule, dateDebut) =>
    `AutoFranchise ⏰\nBonjour ${prenom},\nRappel: votre location de "${vehicule}" commence demain ${dateDebut}.\nBonne route ! 🚗🇹🇬`,

  // ── Remboursement initié ─────────────────────────────────────────
  remboursement: (prenom, montant) =>
    `AutoFranchise 💰\nBonjour ${prenom},\nVotre remboursement de ${Number(montant).toLocaleString()} FCFA a été initié.\nDélai: 24-48h ouvrables.`,
};

module.exports = { envoyerSMS, SMS, formatNumero };
