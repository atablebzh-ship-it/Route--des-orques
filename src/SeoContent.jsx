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
          près par les scientifiques et les associations comme le GTOA (Grupo de Trabajo Orca
          Atlántica).
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
          historique des interactions passées, alimenté par les déclarations des utilisateurs et
          croisé avec les données publiques du GTOA et de la Cruising Association.
        </p>

        <h2 style={styles.h2}>Ressources officielles</h2>
        <ul style={styles.ul}>
          <li>
            <a href="https://www.gtoceanica.org/" target="_blank" rel="noopener noreferrer" style={styles.a}>
              GTOA — Grupo de Trabajo Orca Atlántica
            </a>
          </li>
          <li>
            <a href="https://www.theca.org.uk/" target="_blank" rel="noopener noreferrer" style={styles.a}>
              Cruising Association — Orca Interaction Reporting
            </a>
          </li>
        </ul>

        <p style={styles.footer}>
          La Route des Orques est une application gratuite développée par et pour des
          plaisanciers, pour naviguer en convoi et se sécuriser à plusieurs. Elle propose des
          alertes en temps réel, une carte marine interactive et des notifications push,
          disponible en français, anglais, espagnol et portugais.
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
