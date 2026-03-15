// services/sms.js — Service SMS pour le Togo
require('dotenv').config();

const SMS_PROVIDER = process.env.SMS_PROVIDER || 'simulation';
const SMS_SENDER   = process.env.SMS_SENDER   || 'AutoFranchise';

function formatNumero(numero) {
  let n = numero.replace(/[\s\-\.]/g, '');
  if (n.startsWith('00228')) n = '+228' + n.slice(5);
  if (!n.startsWith('+228') && !n.startsWith('+')) n = '+228' + n;
  return n;
}

// ── Simulation (développement / defaut) ───────────────────────────
async function sendSimulation(to, message) {
  console.log('\n📱 ══════════════════════════════════════');
  console.log(`   SMS SIMULÉ → ${formatNumero(to)}`);
  console.log(`   Message    : ${message}`);
  console.log('══════════════════════════════════════\n');
  return { succes: true, reference: `SIM-${Date.now()}`, simule: true };
}

// ── AfricasTalking (production) ────────────────────────────────────
async function sendViaAfricasTalking(to, message) {
  try {
    const AT = require('africastalking')({
      apiKey:   process.env.AT_API_KEY,
      username: process.env.AT_USERNAME,
    });
    const result = await AT.SMS.send({
      to: [formatNumero(to)], message, from: SMS_SENDER,
    });
    const recipient = result.SMSMessageData?.Recipients?.[0];
    return {
      succes: recipient?.status === 'Success',
      reference: recipient?.messageId,
    };
  } catch (err) {
    console.error('AfricasTalking error:', err.message);
    return await sendSimulation(to, message);
  }
}

// ── Fonction principale ───────────────────────────────────────────
async function envoyerSMS(to, message) {
  if (!to) return { succes: false, message: 'Numéro manquant' };
  try {
    if (SMS_PROVIDER === 'africastalking') {
      return await sendViaAfricasTalking(to, message);
    }
    return await sendSimulation(to, message);
  } catch (err) {
    console.error('SMS error:', err.message);
    return { succes: false, message: err.message };
  }
}

// ── Modèles de messages ───────────────────────────────────────────
const SMS = {
  bienvenue:           (p)           => `Bienvenue ${p} sur AutoFranchise Togo! 🎉\nautofranchise-togo.netlify.app 🚗🇹🇬`,
  reservationCreee:    (p,v,m,r)     => `AutoFranchise 🚗\nBonjour ${p},\nRéservation enregistrée!\n${v}\n${Number(m).toLocaleString()} FCFA\nRef: ${r}`,
  paiementConfirme:    (p,v,m,r)     => `AutoFranchise ✅\nBonjour ${p},\nPaiement confirmé!\n${v}\n${Number(m).toLocaleString()} FCFA\nRef: ${r}`,
  reservationApprouvee:(p,v,d)       => `AutoFranchise ✅\nBonjour ${p},\nRéservation CONFIRMÉE!\n${v}\nDébut: ${d}`,
  reservationAnnulee:  (p,v)         => `AutoFranchise ❌\nBonjour ${p},\nRéservation ${v} annulée.`,
  nouveauMessage:      (p,e)         => `AutoFranchise 💬\nBonjour ${p},\n${e} vous a envoyé un message.`,
  annonceApprouvee:    (p,v)         => `AutoFranchise ✅\nBonjour ${p},\nVotre annonce "${v}" est APPROUVÉE et visible!`,
  annonceRefusee:      (p,v)         => `AutoFranchise ❌\nBonjour ${p},\nVotre annonce "${v}" a été refusée.`,
  rappelReservation:   (p,v,d)       => `AutoFranchise ⏰\nBonjour ${p},\nRappel: location "${v}" commence demain ${d}.`,
};

module.exports = { envoyerSMS, SMS, formatNumero };
