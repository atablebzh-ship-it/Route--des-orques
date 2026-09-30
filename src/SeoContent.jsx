import React from 'react';

// Composant de contenu SEO, à afficher sur la page d'accueil,
// visible sans connexion, au-dessus ou en dessous de l'application.
export default function SeoContent() {
  return (
    <section style={styles.section}>
      <div style={styles.container}>
        <h1 style={styles.h1}>
          Naviguez en convoi dans les zones à orques
        </h1>
        <p style={styles.intro}>
          Face à la multiplication des interactions entre orques et voiliers depuis 2020,
          <strong> La Route des Orques</strong> a été créée pour une raison simple : on est
          plus en sécurité à plusieurs. L'application permet de <strong>former des convois
          avec d'autres plaisanciers</strong> pour traverser ensemble les zones à risque, en
          plus des alertes en temps réel et d'une carte marine interactive.
        </p>

        <h2 style={styles.h2}>Pourquoi naviguer en convoi ?</h2>
        <p style={styles.p}>
          C'est le cœur du projet La Route des Orques : au-delà de la simple alerte,
          l'application met l'accent sur l'<strong>entraide entre plaisanciers</strong>.
          Concrètement :
        </p>
        <ul style={styles.ul}>
          <li>Un plaisancier peut créer un convoi avec un point de rendez-vous, une date et une destination</li>
          <li>D'autres bateaux à proximité sont notifiés et peuvent demander à rejoindre le convoi</li>
          <li>Une fois le convoi formé, tous les membres restent en contact (chat, position partagée, alertes communes)</li>
          <li>En cas de signalement d'orques, tous les membres du convoi sont alertés instantanément</li>
        </ul>
        <p style={styles.p}>
          Contrairement aux applications qui se limitent à la remontée d'alertes, La Route des
          Orques privilégie la traversée à plusieurs plutôt que seul, dans les zones les plus
          exposées.
        </p>

        <div style={styles.cards}>
          <div style={styles.card}>
            <div style={{ width: 84, height: 84, borderRadius: '50%', background: '#F6E7C1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg viewBox="0 0 100 61.2" width="66" height="40" aria-hidden="true"><path fillRule="evenodd" fill="#0B0F14" d="M100.0 35.1 L94.9 27.7 L88.4 23.8 L75.0 19.9 L58.9 18.0 L57.3 16.5 L53.7 9.2 L50.4 4.3 L47.2 1.3 L44.1 0.0 L43.5 1.0 L45.3 5.9 L46.1 10.7 L46.1 15.7 L45.2 19.2 L28.5 27.1 L20.9 33.6 L13.8 43.1 L5.9 44.7 L2.1 47.3 L0.0 50.5 L11.4 50.2 L16.7 57.0 L18.3 61.2 L20.4 58.2 L21.4 53.9 L21.0 51.0 L19.0 46.5 L21.7 45.1 L26.1 43.9 L32.0 43.5 L45.2 45.4 L56.4 46.2 L57.2 47.1 L54.9 53.0 L52.8 56.3 L53.4 57.5 L55.6 57.6 L59.2 56.5 L63.8 53.8 L67.5 50.3 L70.2 46.1 L81.2 44.3 L94.1 40.5 L97.4 38.9 L99.5 36.7ZM97.8 37.6 L97.7 37.8 L97.1 38.5 L95.2 39.5 L91.9 40.6 L91.1 40.7 L90.0 41.1 L89.0 41.3 L88.3 41.7 L85.8 42.3 L84.7 42.8 L83.6 43.0 L80.5 43.9 L74.8 45.0 L70.7 45.3 L70.5 45.0 L70.5 44.5 L71.0 43.1 L71.2 42.0 L71.7 41.0 L71.9 40.7 L77.0 37.8 L79.2 36.8 L80.9 36.3 L84.6 35.8 L86.8 35.9 L95.7 36.8 L97.4 37.2ZM24.6 39.9 L26.0 38.2 L27.7 37.0 L30.5 35.7 L32.7 35.3 L35.4 35.2 L37.8 35.7 L39.9 36.8 L41.6 38.2 L44.6 41.3 L45.7 42.1 L48.0 43.1 L49.8 43.5 L52.1 43.7 L56.4 43.5 L58.3 43.2 L59.3 43.2 L59.5 43.5 L58.2 45.2 L57.5 45.7 L52.3 45.6 L46.4 45.1 L38.8 43.9 L34.9 42.0 L32.6 41.3 L31.2 41.1 L25.8 41.2 L24.8 40.7ZM71.1 30.2 L71.4 29.6 L72.3 28.8 L74.1 28.1 L74.4 28.1 L74.5 28.0 L75.0 28.0 L75.1 27.9 L75.7 27.9 L75.8 27.8 L76.1 27.8 L76.2 27.7 L77.1 27.7 L77.1 27.6 L77.7 27.6 L77.8 27.7 L79.1 27.7 L79.2 27.8 L79.8 27.8 L79.9 27.9 L81.0 28.0 L81.1 28.1 L81.7 28.2 L82.0 28.3 L82.2 28.3 L82.5 28.5 L82.8 28.5 L83.5 28.8 L83.6 29.0 L84.1 29.2 L84.6 29.5 L85.4 30.3 L85.7 30.9 L85.7 31.4 L85.3 32.1 L84.8 32.4 L84.4 32.6 L84.2 32.8 L84.0 32.8 L83.7 33.0 L83.5 33.0 L82.8 33.3 L82.5 33.3 L82.1 33.5 L81.7 33.5 L81.6 33.5 L80.9 33.5 L80.8 33.6 L79.3 33.6 L79.3 33.7 L79.0 33.7 L78.9 33.6 L77.5 33.6 L77.4 33.5 L76.2 33.5 L76.1 33.4 L75.9 33.4 L75.8 33.3 L75.2 33.2 L74.9 33.0 L74.6 33.0 L72.8 32.2 L72.2 31.8 L71.4 31.0 L71.1 30.4Z"/></svg>
            </div>
            <h2 style={styles.cardTitle}>La Route des Orques</h2>
            <p style={styles.cardText}>Naviguer en convoi, alertes orques en temps réel, carte marine : on est plus en sécurité à plusieurs.</p>
          </div>
          <div style={styles.card}>
            <svg viewBox="0 0 32 32" width="56" height="56" aria-hidden="true">
              <circle cx="16" cy="7.5" r="2.3" fill="none" stroke="#E8A23D" strokeWidth="1.7" />
              <path d="M16 9.8V25M11.5 13h9" fill="none" stroke="#E8A23D" strokeWidth="1.7" strokeLinecap="round" />
              <path d="M6.5 18.5c0.6 4.3 4.4 7 9.5 7s8.9-2.7 9.5-7" fill="none" stroke="#E8A23D" strokeWidth="1.7" strokeLinecap="round" />
              <path d="M4.3 19.8L6.5 17.4L9 19.6M23 19.6L25.5 17.4L27.7 19.8" fill="none" stroke="#E8A23D" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <h2 style={styles.cardTitle}>AnchorSpot <span style={{ fontWeight: 400, color: '#B9C7D6' }}>— Mouillage Dispo</span></h2>
            <p style={styles.cardText}>Le mouillage est-il plein ? L'affluence des mouillages en temps réel, pour arriver sans mauvaise surprise.</p>
            <a href="https://anchorspot.vercel.app/demo.html" target="_blank" rel="noopener noreferrer" style={styles.a}>Voir la démo</a>
          </div>
        </div>

        <h2 style={styles.h2}>Où se produisent les interactions avec les orques ?</h2>
        <p style={styles.p}>Les zones les plus concernées sont :</p>
        <ul style={styles.ul}>
          <li>Le <strong>détroit de Gibraltar</strong>, point de passage le plus sensible</li>
          <li>La <strong>côte atlantique du Portugal</strong>, notamment au sud de Lisbonne</li>
          <li>Le <strong>nord-ouest de l'Espagne</strong> (Galice, côte cantabrique)</li>
          <li>Le <strong>Golfe de Gascogne</strong>, dans une moindre mesure mais en extension ces dernières saisons</li>
        </ul>
        <p style={styles.p}>
          La population concernée est un petit groupe d'orques ibériques, aujourd'hui suivi de
          près par les scientifiques.
        </p>

        <h2 style={styles.h2}>Que faire en cas d'interaction avec une orque ?</h2>
        <p style={styles.p}>
          Les recommandations des associations spécialisées et des autorités maritimes incluent
          notamment :
        </p>
        <ul style={styles.ul}>
          <li>Couper le moteur dès qu'une interaction commence (le bruit semble être un facteur déclencheur)</li>
          <li>Descendre les voiles si possible</li>
          <li>Ne pas manœuvrer brusquement</li>
          <li>Signaler immédiatement sa position aux autorités locales et aux autres plaisanciers</li>
          <li>Éviter, si possible, de naviguer seul dans les zones les plus actives</li>
        </ul>

        <h2 style={styles.h2}>Historique des signalements</h2>
        <p style={styles.p}>
          L'application propose une carte des signalements récents (moins de 6h) et un
          historique des interactions passées, alimenté par les déclarations des utilisateurs.
        </p>

        <p style={styles.footer}>
          La Route des Orques est une application gratuite développée par et pour des
          plaisanciers, pour naviguer en convoi et se sécuriser à plusieurs. Elle propose des
          alertes en temps réel, une carte marine interactive et des notifications push,
          disponible en français, anglais, espagnol, portugais, allemand et néerlandais.
        </p>
      </div>
    </section>
  );
}

const styles = {
  section: {
    background: '#0A1628',
    padding: '48px 16px',
  },
  container: {
    maxWidth: 760,
    margin: '0 auto',
    color: '#E8EDF2',
    lineHeight: 1.6,
  },
  h1: {
    fontSize: '1.75rem',
    fontWeight: 700,
    marginBottom: 16,
    color: '#E8EDF2',
  },
  h2: {
    fontSize: '1.25rem',
    fontWeight: 600,
    marginTop: 32,
    marginBottom: 12,
    color: '#E8EDF2',
  },
  cards: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 16,
    margin: '28px 0 8px',
  },
  card: {
    flex: '1 1 260px',
    background: '#10213A',
    border: '1px solid #1E3A5F',
    borderRadius: 14,
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 6,
  },
  cardTitle: {
    fontSize: '1.15rem',
    fontWeight: 700,
    margin: '8px 0 0',
    color: '#E8EDF2',
  },
  cardText: {
    margin: 0,
    fontSize: '0.95rem',
    color: '#B9C7D6',
  },
  intro: {
    fontSize: '1.05rem',
    marginBottom: 8,
  },
  p: {
    marginBottom: 12,
  },
  ul: {
    marginBottom: 16,
    paddingLeft: 20,
  },
  a: {
    color: '#4FC3D9',
    textDecoration: 'underline',
  },
  footer: {
    marginTop: 32,
    fontSize: '0.9rem',
    color: '#6C87A6',
    borderTop: '1px solid #1E3A5F',
    paddingTop: 16,
  },
};
