# 🚗 AutoFranchise — Backend API (MySQL)
**Plateforme de location et vente de véhicules au Togo 🇹🇬**

---

## ⚡ Démarrage rapide

### 1. Installer Node.js
Téléchargez Node.js 18+ → https://nodejs.org

### 2. Installer les dépendances
```bash
cd autofranchise-mysql
npm install
```

### 3. Configurer l'environnement
```bash
cp .env.example .env
```
Puis modifiez `.env` :
```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=votre_mot_de_passe
DB_NAME=autofranchise
JWT_SECRET=changez_cette_cle_secrete_maintenant
```

### 4. Créer la base de données MySQL
```sql
-- Dans MySQL Workbench ou phpMyAdmin :
CREATE DATABASE autofranchise CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 5. Initialiser les tables
```bash
npm run init-db
```

### 6. Lancer le serveur
```bash
npm run dev    # Développement
npm start      # Production
```
✅ API disponible sur **http://localhost:5000**

---

## 🚀 Déploiement sur Render.com (RECOMMANDÉ — Gratuit)

### Option A — MySQL gratuit via PlanetScale + Render

**Étape 1 — Base de données MySQL gratuite sur PlanetScale**
1. Créez un compte sur https://planetscale.com (gratuit)
2. Créez une base : `autofranchise`
3. Copiez l'URL de connexion → format :
   ```
   mysql://user:password@host.aws.connect.psdb.cloud/autofranchise?sslaccept=strict
   ```

**Étape 2 — Déployer l'API sur Render**
1. Créez un compte sur https://render.com
2. Cliquez **"New Web Service"**
3. Connectez votre dépôt GitHub (uploadez le code d'abord sur GitHub)
4. Configurez :
   - **Name** : autofranchise-api
   - **Runtime** : Node
   - **Build Command** : `npm install`
   - **Start Command** : `npm start`
5. Ajoutez les variables d'environnement :
   ```
   NODE_ENV          = production
   DATABASE_URL      = (votre URL PlanetScale)
   JWT_SECRET        = (générez une clé sécurisée)
   FRONTEND_URL      = (URL de votre frontend)
   ```
6. Cliquez **"Create Web Service"**

🎉 Votre API sera disponible sur : `https://autofranchise-api.onrender.com`

---

### Option B — Déploiement sur Railway.app

1. Créez un compte sur https://railway.app
2. Cliquez **"New Project"** → **"Deploy from GitHub"**
3. Ajoutez un service MySQL :
   - Cliquez **"+"** → **"Database"** → **"MySQL"**
   - Railway crée automatiquement la variable `DATABASE_URL`
4. Configurez les variables :
   ```
   NODE_ENV    = production
   JWT_SECRET  = votre_secret
   ```
5. Déployez — Railway détecte automatiquement Node.js

✅ URL automatique : `https://autofranchise.up.railway.app`

---

## 🔌 Connecter le frontend

Dans votre fichier `autofranchise.html`, ajoutez au début du script :

```javascript
// Développement local
const API_URL = 'http://localhost:5000/api';

// OU Production (remplacez par votre vraie URL)
// const API_URL = 'https://autofranchise-api.onrender.com/api';

// ─── EXEMPLES D'UTILISATION ───────────────────────────────────────

// Inscription
async function inscrire(prenom, telephone, motDePasse) {
  const r = await fetch(`${API_URL}/auth/inscription`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prenom, nom: '', telephone, mot_de_passe: motDePasse })
  });
  const data = await r.json();
  if (data.succes) localStorage.setItem('token', data.token);
  return data;
}

// Connexion
async function connecter(telephone, motDePasse) {
  const r = await fetch(`${API_URL}/auth/connexion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifiant: telephone, mot_de_passe: motDePasse })
  });
  const data = await r.json();
  if (data.succes) localStorage.setItem('token', data.token);
  return data;
}

// Charger les véhicules
async function chargerVehicules(filtres = {}) {
  const params = new URLSearchParams(filtres).toString();
  const r = await fetch(`${API_URL}/vehicules?${params}`);
  return r.json();
}

// Faire une réservation
async function reserver(vehicule_id, date_debut, date_fin) {
  const token = localStorage.getItem('token');
  const r = await fetch(`${API_URL}/reservations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ vehicule_id, date_debut, date_fin })
  });
  return r.json();
}

// Payer par Flooz
async function payerFlooz(reservation_id, numero) {
  const token = localStorage.getItem('token');
  const r = await fetch(`${API_URL}/paiements/initier`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ reservation_id, methode: 'flooz', numero_telephone: numero })
  });
  return r.json();
}
```

---

## 📋 Tous les endpoints

### 🔐 `/api/auth`
| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/inscription` | Créer un compte |
| POST | `/connexion` | Se connecter |
| GET | `/profil` | Mon profil (🔒) |
| PUT | `/profil` | Modifier profil (🔒) |
| PUT | `/mot-de-passe` | Changer mot de passe (🔒) |

### 🚗 `/api/vehicules`
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/` | Liste + filtres |
| GET | `/:id` | Détail véhicule |
| POST | `/` | Déposer annonce (🔒) |
| PUT | `/:id` | Modifier (🔒) |
| DELETE | `/:id` | Supprimer (🔒) |
| POST | `/:id/avis` | Ajouter avis (🔒) |
| POST | `/:id/favori` | Toggle favori (🔒) |

### 📅 `/api/reservations`
| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/` | Créer réservation (🔒) |
| GET | `/mes` | Mes réservations (🔒) |
| GET | `/proprietaire` | Réservations reçues (🔒) |
| PATCH | `/:id/statut` | Changer statut (🔒) |

### 💳 `/api/paiements`
| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/initier` | Payer Flooz/TMoney (🔒) |
| GET | `/mes` | Historique paiements (🔒) |
| POST | `/remboursement` | Demander remboursement (🔒) |

### 🛠️ `/api/admin` (Admin seulement)
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/stats` | Tableau de bord |
| GET | `/vehicules-en-attente` | À approuver |
| GET | `/utilisateurs` | Tous les utilisateurs |
| PATCH | `/utilisateurs/:id` | Activer/désactiver |

---

## 👤 Comptes de démo
```
Admin      : admin@autofranchise.tg  / admin123
Propriétaire : +22891234567          / admin123
Client     : +22898765432            / admin123
```
⚠️ **Changez ces mots de passe avant la mise en production !**

---

## 📁 Structure
```
autofranchise-mysql/
├── server.js           ← Point d'entrée
├── package.json
├── render.yaml         ← Config déploiement Render
├── .env.example
├── config/
│   ├── db.js           ← Pool MySQL + helpers
│   └── initDb.js       ← Création tables + démo
├── middleware/
│   └── auth.js         ← JWT + rôles
├── routes/
│   ├── auth.js
│   ├── vehicules.js
│   ├── reservations.js
│   ├── paiements.js
│   └── admin.js
└── uploads/            ← Images véhicules
```

---
*AutoFranchise — Fait avec ❤️ pour le Togo 🇹🇬*
