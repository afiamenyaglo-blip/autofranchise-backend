// config/initDb.js — Création des tables MySQL + données de démo
require('dotenv').config();
const { getPool } = require('./db');
const bcrypt = require('bcryptjs');

async function initDb() {
  const pool = getPool();
  const conn = await pool.getConnection();

  try {
    console.log('🔧 Initialisation de la base de données AutoFranchise...\n');

    // ── TABLE : utilisateurs ───────────────────────────────────────
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS utilisateurs (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        prenom        VARCHAR(100) NOT NULL,
        nom           VARCHAR(100) NOT NULL,
        email         VARCHAR(191) UNIQUE,
        telephone     VARCHAR(30)  NOT NULL UNIQUE,
        mot_de_passe  VARCHAR(255) NOT NULL,
        ville         VARCHAR(100) DEFAULT 'Lomé',
        role          ENUM('client','proprietaire','admin') DEFAULT 'client',
        avatar        VARCHAR(500),
        verifie       TINYINT(1) DEFAULT 0,
        actif         TINYINT(1) DEFAULT 1,
        cree_le       DATETIME DEFAULT CURRENT_TIMESTAMP,
        mis_a_jour    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✅ Table utilisateurs');

    // ── TABLE : vehicules ──────────────────────────────────────────
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS vehicules (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        proprietaire_id INT NOT NULL,
        type_annonce    ENUM('location','vente','les_deux') NOT NULL,
        marque          VARCHAR(100) NOT NULL,
        modele          VARCHAR(100) NOT NULL,
        annee           YEAR NOT NULL,
        kilometrage     INT DEFAULT 0,
        carburant       ENUM('essence','diesel','electrique','hybride') DEFAULT 'essence',
        transmission    ENUM('automatique','manuel') DEFAULT 'automatique',
        nb_places       TINYINT DEFAULT 5,
        couleur         VARCHAR(60),
        description     TEXT,
        prix_location   DECIMAL(12,2) COMMENT 'FCFA par jour',
        prix_vente      DECIMAL(12,2) COMMENT 'FCFA',
        ville           VARCHAR(100) NOT NULL,
        adresse         VARCHAR(255),
        disponible      TINYINT(1) DEFAULT 1,
        approuve        TINYINT(1) DEFAULT 0,
        featured        TINYINT(1) DEFAULT 0,
        vues            INT DEFAULT 0,
        images          JSON COMMENT 'Tableau de chemins d images',
        cree_le         DATETIME DEFAULT CURRENT_TIMESTAMP,
        mis_a_jour      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (proprietaire_id) REFERENCES utilisateurs(id) ON DELETE CASCADE,
        INDEX idx_ville (ville),
        INDEX idx_marque (marque),
        INDEX idx_type (type_annonce),
        INDEX idx_approuve (approuve),
        INDEX idx_disponible (disponible)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✅ Table vehicules');

    // ── TABLE : reservations ───────────────────────────────────────
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS reservations (
        id                   INT AUTO_INCREMENT PRIMARY KEY,
        vehicule_id          INT NOT NULL,
        client_id            INT NOT NULL,
        date_debut           DATE NOT NULL,
        date_fin             DATE,
        lieu_prise_en_charge VARCHAR(255),
        nb_jours             SMALLINT DEFAULT 1,
        montant_ht           DECIMAL(12,2) NOT NULL,
        frais_service        DECIMAL(12,2) NOT NULL,
        montant_total        DECIMAL(12,2) NOT NULL,
        statut               ENUM('en_attente','confirmee','annulee','terminee','refusee') DEFAULT 'en_attente',
        notes                TEXT,
        cree_le              DATETIME DEFAULT CURRENT_TIMESTAMP,
        mis_a_jour           DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (vehicule_id) REFERENCES vehicules(id) ON DELETE CASCADE,
        FOREIGN KEY (client_id)   REFERENCES utilisateurs(id) ON DELETE CASCADE,
        INDEX idx_vehicule (vehicule_id),
        INDEX idx_client (client_id),
        INDEX idx_statut (statut)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log('✅ Table reservations');

    // ── TABLE : paiements ──────────────────────────────────────────
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS paiements (
        id                  INT AUTO_INCREMENT PRIMARY KEY,
        reservation_id      INT NOT NULL,
        utilisateur_id      INT NOT NULL,
        methode             ENUM('flooz','tmoney','virement') NOT NULL,
        numero_telephone    VARCHAR(30) NOT NULL,
        montant             DECIMAL(12,2) NOT NULL,
        devise              VARCHAR(10) DEFAULT 'FCFA',
        reference           VARCHAR(100) UNIQUE NOT NULL,
        statut              ENUM('en_attente','succes','echec','rembourse') DEFAULT 'en_attente',
        reponse_operateur   JSON COMMENT 'Réponse brute API Mobile Money',
        cree_le             DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (reservation_id)  REFERENCES reservations(id),
        FOREIGN KEY (utilisateur_id)  REFERENCES utilisateurs(id),
        INDEX idx_reference (reference),
        INDEX idx_statut (statut)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log('✅ Table paiements');

    // ── TABLE : avis ───────────────────────────────────────────────
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS avis (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        vehicule_id     INT NOT NULL,
        auteur_id       INT NOT NULL,
        reservation_id  INT,
        note            TINYINT NOT NULL CHECK (note BETWEEN 1 AND 5),
        commentaire     TEXT,
        cree_le         DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (vehicule_id)    REFERENCES vehicules(id) ON DELETE CASCADE,
        FOREIGN KEY (auteur_id)      REFERENCES utilisateurs(id),
        FOREIGN KEY (reservation_id) REFERENCES reservations(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✅ Table avis');

    // ── TABLE : messages ───────────────────────────────────────────
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS messages (
        id                INT AUTO_INCREMENT PRIMARY KEY,
        expediteur_id     INT NOT NULL,
        destinataire_id   INT NOT NULL,
        vehicule_id       INT,
        contenu           TEXT NOT NULL,
        lu                TINYINT(1) DEFAULT 0,
        cree_le           DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (expediteur_id)   REFERENCES utilisateurs(id),
        FOREIGN KEY (destinataire_id) REFERENCES utilisateurs(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✅ Table messages');

    // ── TABLE : favoris ────────────────────────────────────────────
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS favoris (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        utilisateur_id  INT NOT NULL,
        vehicule_id     INT NOT NULL,
        cree_le         DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_favori (utilisateur_id, vehicule_id),
        FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id) ON DELETE CASCADE,
        FOREIGN KEY (vehicule_id)    REFERENCES vehicules(id)    ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log('✅ Table favoris');

    // ── Données de démo ────────────────────────────────────────────
    console.log('\n📦 Insertion des données de démo...');

    const hash = await bcrypt.hash('admin123', 12);

    await conn.execute(`
      INSERT IGNORE INTO utilisateurs (prenom, nom, email, telephone, mot_de_passe, ville, role, verifie) VALUES
        ('Admin',  'AutoFranchise', 'admin@autofranchise.tg', '+22890000000', ?, 'Lomé',    'admin',        1),
        ('Kofi',   'Amevor',        'kofi@test.tg',           '+22891234567', ?, 'Lomé',    'proprietaire', 1),
        ('Akosua', 'Mensah',        'akosua@test.tg',         '+22898765432', ?, 'Kara',    'client',       1),
        ('Yao',    'Kpakpo',        'yao@test.tg',            '+22897654321', ?, 'Kpalimé', 'client',       1)
    `, [hash, hash, hash, hash]);

    await conn.execute(`
      INSERT IGNORE INTO vehicules
        (proprietaire_id,type_annonce,marque,modele,annee,kilometrage,carburant,transmission,nb_places,description,prix_location,prix_vente,ville,disponible,approuve,featured,images)
      VALUES
        (2,'location','Toyota','Corolla',2020,45000,'essence','automatique',5,'Excellent état, climatisation, GPS intégré. Parfait pour la ville.',15000,NULL,'Lomé',1,1,1,'["https://placehold.co/400x250?text=Toyota+Corolla"]'),
        (2,'vente','Hyundai','Tucson',2019,82000,'essence','automatique',5,'SUV familial, bon état général, entretien régulier, carnet à jour.',NULL,4800000,'Lomé',1,1,0,'["https://placehold.co/400x250?text=Hyundai+Tucson"]'),
        (2,'les_deux','Honda','CR-V',2022,22000,'essence','automatique',5,'Quasi-neuf, toutes options premium, toit ouvrant panoramique.',25000,12500000,'Kpalimé',1,1,1,'["https://placehold.co/400x250?text=Honda+CR-V"]'),
        (2,'location','Nissan','Patrol',2021,35000,'diesel','automatique',7,'4x4 idéal pour les routes togolaises, puissant et fiable.',45000,NULL,'Kara',1,1,0,'["https://placehold.co/400x250?text=Nissan+Patrol"]'),
        (2,'vente','Mercedes','C200',2018,95000,'essence','automatique',5,'Mercedes bien entretenue, full options, sièges cuir, toit ouvrant.',NULL,9500000,'Lomé',1,1,0,'["https://placehold.co/400x250?text=Mercedes+C200"]'),
        (2,'location','Toyota','Land Cruiser',2019,68000,'diesel','manuel',8,'Grand SUV 8 places, parfait pour famille ou groupe, très fiable.',60000,NULL,'Sokodé',1,1,0,'["https://placehold.co/400x250?text=Land+Cruiser"]')
    `);

    console.log('✅ Données de démo insérées\n');
    console.log('🎉 Base de données AutoFranchise prête !');
    console.log('─────────────────────────────────────────');
    console.log('👤 Admin    : admin@autofranchise.tg / admin123');
    console.log('🏠 Proprio  : +22891234567 / admin123');
    console.log('👥 Client   : +22898765432 / admin123');
    console.log('─────────────────────────────────────────\n');

  } catch (err) {
    console.error('❌ Erreur init DB :', err.message);
    throw err;
  } finally {
    conn.release();
  }
}

initDb().then(() => process.exit(0)).catch(() => process.exit(1));
