import SeoContent from './SeoContent';
import React, { useState, useEffect, useRef, useCallback } from "react";
import { Anchor, AlertTriangle, MessageCircle, Send, Compass, Users, X, Plus, LocateFixed, LogOut, Waves, Check, Clock, Flag, Download, Trash2, Pencil, Layers, Share2 } from "lucide-react";
import { storage, supabase } from "./lib/storage.js";

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap');

.leaflet-top.leaflet-left {
  margin-top: 64px !important;
}

/* Zoom manuel +/- : repositionné en haut à droite, sous le bouton Carte/Satellite,
   et restylé pour matcher son look (fond blanc, coins arrondis). */
.leaflet-top.leaflet-right {
  margin-top: 128px !important;
  margin-right: 12px !important;
}
.leaflet-control-zoom {
  border: 1px solid rgba(0,0,0,0.15) !important;
  border-radius: 10px !important;
  overflow: hidden;
  box-shadow: 0 4px 10px rgba(0,0,0,0.25) !important;
}
.leaflet-control-zoom a {
  background: #FFFFFF !important;
  color: #1A1A1A !important;
  width: 40px !important;
  height: 40px !important;
  line-height: 40px !important;
  font-size: 20px !important;
}
.leaflet-control-zoom a:hover {
  background: #F2F2F2 !important;
}

.leaflet-tooltip.orca-tooltip {
  background: #254864;
  color: #FFFFFF;
  border: 2px solid #3E7398;
  font-family: 'Inter', sans-serif;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.6;
  padding: 12px 16px;
  border-radius: 10px;
  box-shadow: 0 4px 14px rgba(0,0,0,0.45);
  text-align: center;
  max-width: 280px;
  white-space: normal;
}
.leaflet-tooltip.orca-tooltip::before {
  display: none;
}
.orca-tooltip-title {
  font-family: 'Oswald', sans-serif;
  font-size: 18px;
  letter-spacing: 0.02em;
  color: #FFFFFF;
}
.orca-tooltip-meta {
  font-family: 'JetBrains Mono', monospace;
  font-size: 14px;
  font-weight: 600;
  color: #FFFFFF;
}
.orca-tooltip-notes {
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  color: #FFFFFF;
}

/* Popups (bulle "Rejoindre le convoi" au clic sur un marqueur/tracé de convoi) — même
   habillage sombre que les tooltips .orca-tooltip pour rester cohérent avec le reste. */
.leaflet-popup-content-wrapper {
  background: #254864;
  color: #FFFFFF;
  border: 2px solid #3E7398;
  border-radius: 10px;
  box-shadow: 0 4px 14px rgba(0,0,0,0.45);
}
.leaflet-popup-tip {
  background: #254864;
  border: 2px solid #3E7398;
  box-shadow: none;
}
.leaflet-popup-content {
  margin: 12px 14px;
  font-family: 'Inter', sans-serif;
}
.leaflet-popup-close-button {
  color: #F0F5F4 !important;
}
`;

// Palette "Bleu + touche ambre" : plus claire et plus colorée que l'ancien bleu-ardoise
// sombre, avec l'ambre comme couleur d'accent pour les actions principales.
const COLORS = {
  bg: "#1D3A50",
  panel: "#254864",
  panelAlt: "#2F5E82",
  border: "#3E7398",
  text: "#F0F5F4",
  muted: "#9DBAC4",
  cyan: "#4FC3D9",
  cyanDim: "#1F4A56",
  orange: "#E8A23D",
  orangeDim: "#5C4014",
  green: "#4FD98A",
  greenDim: "#1F4A32",
  red: "#E5504F",
  redDim: "#5C2523",
};

const STALE_MS = 15 * 60 * 1000;
const POLL_MS = 7000;
const TRAIL_MAX_POINTS = 40; // nombre de points conservés par bateau pour la trace
const TRAIL_MAX_AGE_MS = 3 * 3600 * 1000; // profondeur de la trace : 3 h
const MAX_CHAT = 150;
const MAX_DM = 300; // messages privés conservés côté client, tous fils confondus
const MAX_ALERTS = 300; // couvre les signalements récents + l'historique de la saison
const MAX_CONVOYS = 40;
// Un convoi reste visible dans les listes/la carte jusqu'à 3 jours après sa date de fin
// prévue (arrivée, ou départ si pas d'arrivée renseignée) — voir isConvoyExpired plus bas.
const CONVOY_EXPIRY_BUFFER_MS = 3 * 24 * 3600 * 1000;
const RECENT_ALERT_MS = 6 * 3600 * 1000;
const DEFAULT_ALERT_RADIUS_KM = 100; // rayon par défaut pour les notifications push d'alerte orque
const ALERT_RADIUS_OPTIONS = [10, 25, 50, 100, 200, null]; // null = illimité (pas de filtre de distance)
const KM_TO_NM = 0.539957; // 1 km en milles nautiques

// Formate une distance en km selon la préférence d'unité choisie (km ou milles nautiques).
function fmtDist(km, unit) {
  if (km == null) return "";
  return unit === "nm" ? `${(km * KM_TO_NM).toFixed(1)} nm` : `${km.toFixed(1)} km`;
}

// Sources scientifiques officielles pour l'historique des observations, par espèce, hors signalements
// de la communauté — organismes de recherche/associations qui font autorité et sollicitent activement
// les remontées des plaisanciers (vérifié — voir recherche du 22/08/2026).
const OFFICIAL_SPECIES_SOURCES = {
  orque: [
    { label: "GTOA / Orca Ibérica — Groupe de Travail Orques Atlantique", url: "https://www.orcaiberica.org/fr" },
    { label: "Cruising Association — Signaler une interaction", url: "https://www.theca.org.uk/orcas/interaction-report-form" },
  ],
  dauphin: [
    { label: "PELAGIS (CNRS/La Rochelle) — Signaler une observation en mer", url: "https://www.observatoire-pelagis.cnrs.fr/signaler-une-observation/" },
    { label: "CEMMA — Coordinadora para o Estudo dos Mamíferos Mariños (Galice)", url: "https://www.cemma.org/" },
  ],
  baleine: [
    { label: "PELAGIS (CNRS/La Rochelle) — Signaler une observation en mer (grands cétacés)", url: "https://www.observatoire-pelagis.cnrs.fr/signaler-une-observation/" },
    { label: "CEMMA — Coordinadora para o Estudo dos Mamíferos Mariños (Galice)", url: "https://www.cemma.org/" },
  ],
  phoque: [
    { label: "PELAGIS (CNRS/La Rochelle) — Réseau national échouages (phoques inclus)", url: "https://www.observatoire-pelagis.cnrs.fr/echouages/signaler-un-echouage/" },
  ],
  tortue: [
    { label: "CESTM — Centre d'Études et de Soins pour les Tortues Marines (Aquarium La Rochelle)", url: "https://www.aquarium-larochelle.com/en/preserve/study-and-care-centre-for-marine-turtles/reportings/" },
    { label: "Rede de Arrojamentos do Algarve (RAAlg) — Portugal", url: "https://www.raalg.pt/" },
  ],
};

// Numéros à appeler en cas d'échouage ou d'animal marin en détresse (distinct des secours en mer/humains,
// voir RESCUE_STATIONS) — vérifié par pays pour dauphins/tortues (recherche du 22/08/2026).
const STRANDING_CONTACTS = {
  dauphin: [
    { zone: "France", phone: "05 46 44 99 10 (PELAGIS, 7j/7)" },
    { zone: "Espagne", phone: "112" },
    { zone: "Portugal", phone: "+351 968 688 233 (RAAlg, Algarve)" },
  ],
  baleine: [
    { zone: "France", phone: "05 46 44 99 10 (PELAGIS, 7j/7)" },
    { zone: "Espagne", phone: "112" },
    { zone: "Portugal", phone: "+351 968 688 233 (RAAlg, Algarve)" },
  ],
  phoque: [
    { zone: "France", phone: "05 46 44 99 10 (PELAGIS, 7j/7)" },
    { zone: "Espagne", phone: "112" },
    { zone: "Portugal", phone: "+351 968 688 233 (RAAlg, Algarve)" },
  ],
  tortue: [
    { zone: "France", phone: "05 46 34 00 00 (CESTM, 7j/7)" },
    { zone: "Espagne", phone: "112" },
    { zone: "Portugal", phone: "+351 968 688 233 (RAAlg, Algarve)" },
  ],
};

// Catalogue des espèces marines observables et signalables sur la carte (au-delà des orques) :
// utile pour les plaisanciers (comportement à adopter, curiosité) sans lien avec le risque incident.
const SPECIES_OPTIONS = [
  { key: "orque", label: "Orque", labelPlural: "orques", emoji: "🐋", pushTitle: "Orques signalées" },
  { key: "dauphin", label: "Dauphin", labelPlural: "dauphins", emoji: "🐬", pushTitle: "Dauphins signalés" },
  { key: "baleine", label: "Baleine / rorqual", labelPlural: "baleines", emoji: "🐳", pushTitle: "Baleines signalées" },
  { key: "phoque", label: "Phoque", labelPlural: "phoques", emoji: "🦭", pushTitle: "Phoques signalés" },
  { key: "tortue", label: "Tortue marine", labelPlural: "tortues", emoji: "🐢", pushTitle: "Tortues signalées" },
];
function speciesInfo(key) {
  return SPECIES_OPTIONS.find((s) => s.key === key) || SPECIES_OPTIONS[0];
}

// --- Couloir maritime Brest → Gibraltar : points au large des principaux caps, pour un tracé
// automatique de route qui longe la côte au lieu de couper à travers les terres (façon
// "autorouting" Navionics). Coordonnées approximatives placées volontairement au large.
const SEA_LANE = [
  { name: "Ouessant", lat: 48.45, lon: -5.35 },
  { name: "Penmarch", lat: 47.75, lon: -4.65 },
  { name: "Belle-Île", lat: 47.25, lon: -3.4 },
  { name: "Île de Ré", lat: 46.05, lon: -1.65 },
  { name: "Cap Ferret", lat: 44.55, lon: -1.5 },
  { name: "Hendaye", lat: 43.45, lon: -1.95 },
  { name: "Bilbao", lat: 43.48, lon: -3.05 },
  { name: "Santander", lat: 43.58, lon: -3.95 },
  { name: "Cabo Peñas", lat: 43.72, lon: -6.05 },
  { name: "Cabo Ortegal", lat: 43.95, lon: -7.95 },
  { name: "Ferrol (large)", lat: 43.62, lon: -8.36 },
  { name: "A Coruña", lat: 43.55, lon: -8.55 },
  { name: "Camariñas / Costa da Morte", lat: 43.15, lon: -9.22 },
  { name: "Cabo Fisterra", lat: 42.85, lon: -9.45 },
  { name: "Ría de Muros e Noia", lat: 42.72, lon: -9.2 },
  { name: "Vigo", lat: 42.05, lon: -9.05 },
  { name: "Porto", lat: 41.25, lon: -9.05 },
  { name: "Peniche", lat: 39.4, lon: -9.6 },
  { name: "Cascais", lat: 38.55, lon: -9.65 },
  { name: "Sagres", lat: 37.0, lon: -9.05 },
  { name: "Portimão", lat: 37.05, lon: -8.65 },
  { name: "Cadix", lat: 36.5, lon: -6.7 },
  { name: "Tarifa", lat: 35.98, lon: -5.65 },
  { name: "Gibraltar", lat: 36.12, lon: -5.4 },
];

// Chantiers navals / réparateurs (haul-out, urgences) sur la zone Brest → Gibraltar/Cadix
const SHIPYARDS = [
  { name: "Port de Brest — Réparation Navale", address: "Brest, France", lat: 48.3876, lon: -4.4591, phone: "+33 2 98 14 77 59" },
  { name: "Brest Marine Services", address: "Brest, France", lat: 48.3877, lon: -4.4366, phone: "+33 2 98 42 31 89" },
  { name: "Chantier Naval des Minimes", address: "La Rochelle, France", lat: 46.1505, lon: -1.1588, phone: "+33 5 46 44 75 47" },
  { name: "Boat Yard Old Port", address: "La Rochelle, France", lat: 46.1487, lon: -1.1528, phone: "+33 5 46 41 42 11" },
  { name: "Marinaseca", address: "A Coruña, Espagne", lat: 43.3484, lon: -8.3861, phone: "+34 881 91 36 51" },
  { name: "Domar Talleres Navales", address: "A Coruña, Espagne", lat: 43.3571, lon: -8.3937, phone: "+34 981 28 96 29" },
  { name: "Marina Davila Sport", address: "Vigo, Espagne", lat: 42.2316, lon: -8.7441, phone: null },
  { name: "Estaleiros Vila do Conde / Sicnave", address: "Póvoa de Varzim, Portugal", lat: 41.3434, lon: -8.7434, phone: "+351 252 631 369" },
  { name: "Safe Harbor Yacht Services", address: "Cascais, Portugal", lat: 38.6921, lon: -9.4192, phone: "+351 964 800 498" },
  { name: "Wavetech", address: "Cascais, Portugal", lat: 38.6913, lon: -9.4184, phone: "+351 21 484 7025" },
  { name: "Shipyard Marina de Portimão", address: "Portimão, Portugal", lat: 37.1367, lon: -8.5269, phone: "+351 282 411 533" },
  { name: "RC Marine Portugal Yacht Services", address: "Portimão, Portugal", lat: 37.1373, lon: -8.5269, phone: "+351 927 190 533" },
  { name: "Sopromar Portimão", address: "Portimão, Portugal", lat: 37.1369, lon: -8.5275, phone: "+351 282 425 173" },
  { name: "Varadero Marina Punta Europa", address: "El Puerto de Santa María, Cadix, Espagne", lat: 36.5849, lon: -6.2318, phone: "+34 609 33 06 18" },
  { name: "Gibdock", address: "Gibraltar", lat: 36.1241, lon: -5.3547, phone: "+350 200 59400" },
  { name: "All Motor Boat & Yacht Services", address: "Gibraltar", lat: 36.1474, lon: -5.3542, phone: "+34 678 34 55 95" },
];

// Stations de sauvetage en mer sur la zone Brest → Gibraltar : SNSM (France), Salvamento
// Marítimo (Espagne), Instituto de Socorros a Náufragos (Portugal). Positions au niveau du
// port/ville de rattachement (repères de référence, à vérifier avant usage opérationnel réel).
const RESCUE_STATIONS = [
  // France — SNSM
  { name: "SNSM Brest", org: "SNSM", address: "Brest, France", lat: 48.3904, lon: -4.4861, phone: null },
  { name: "SNSM Camaret-sur-Mer", org: "SNSM", address: "Camaret-sur-Mer, France", lat: 48.2807, lon: -4.5934, phone: null },
  { name: "SNSM Douarnenez", org: "SNSM", address: "Douarnenez, France", lat: 48.0928, lon: -4.3287, phone: null },
  { name: "SNSM Loctudy", org: "SNSM", address: "Loctudy, France", lat: 47.8375, lon: -4.1741, phone: null },
  { name: "SNSM Concarneau", org: "SNSM", address: "Concarneau, France", lat: 47.8737, lon: -3.9187, phone: null },
  { name: "SNSM Lorient", org: "SNSM", address: "Lorient, France", lat: 47.7482, lon: -3.3660, phone: null },
  { name: "SNSM Belle-Île (Le Palais)", org: "SNSM", address: "Le Palais, Belle-Île-en-Mer, France", lat: 47.3467, lon: -3.1533, phone: null },
  { name: "SNSM Le Croisic", org: "SNSM", address: "Le Croisic, France", lat: 47.2934, lon: -2.5133, phone: null },
  { name: "SNSM Île d'Yeu", org: "SNSM", address: "Port-Joinville, Île d'Yeu, France", lat: 46.7247, lon: -2.3453, phone: null },
  { name: "SNSM Les Sables-d'Olonne", org: "SNSM", address: "Les Sables-d'Olonne, France", lat: 46.4966, lon: -1.7836, phone: null },
  { name: "SNSM La Rochelle", org: "SNSM", address: "La Rochelle, France", lat: 46.1591, lon: -1.1520, phone: null },
  { name: "SNSM Royan", org: "SNSM", address: "Royan, France", lat: 45.6280, lon: -1.0280, phone: null },
  { name: "SNSM Arcachon", org: "SNSM", address: "Arcachon, France", lat: 44.6595, lon: -1.1685, phone: null },
  { name: "SNSM Capbreton", org: "SNSM", address: "Capbreton, France", lat: 43.6425, lon: -1.4390, phone: null },
  { name: "SNSM Hendaye", org: "SNSM", address: "Hendaye, France", lat: 43.3728, lon: -1.7736, phone: null },
  // Espagne — Salvamento Marítimo
  { name: "Salvamento Marítimo Hondarribia", org: "Salvamento Marítimo", address: "Hondarribia, Espagne", lat: 43.3224, lon: -1.9812, phone: null },
  { name: "Salvamento Marítimo Bilbao", org: "Salvamento Marítimo", address: "Bilbao, Espagne", lat: 43.3438, lon: -3.0195, phone: null },
  { name: "Salvamento Marítimo Santander", org: "Salvamento Marítimo", address: "Santander, Espagne", lat: 43.4623, lon: -3.7900, phone: null },
  { name: "Salvamento Marítimo Gijón", org: "Salvamento Marítimo", address: "Gijón, Espagne", lat: 43.5453, lon: -5.6615, phone: null },
  { name: "Salvamento Marítimo Avilés", org: "Salvamento Marítimo", address: "Avilés, Espagne", lat: 43.5652, lon: -5.9249, phone: null },
  { name: "Salvamento Marítimo Ribadeo", org: "Salvamento Marítimo", address: "Ribadeo, Espagne", lat: 43.5401, lon: -7.0402, phone: null },
  { name: "Salvamento Marítimo A Coruña", org: "Salvamento Marítimo", address: "A Coruña, Espagne", lat: 43.3623, lon: -8.4115, phone: null },
  { name: "Salvamento Marítimo Fisterra", org: "Salvamento Marítimo", address: "Fisterra, Espagne", lat: 42.9050, lon: -9.2652, phone: null },
  { name: "Salvamento Marítimo Vigo", org: "Salvamento Marítimo", address: "Vigo, Espagne", lat: 42.2406, lon: -8.7207, phone: null },
  // Portugal — Instituto de Socorros a Náufragos (ISN)
  { name: "ISN Viana do Castelo", org: "ISN", address: "Viana do Castelo, Portugal", lat: 41.6932, lon: -8.8330, phone: null },
  { name: "ISN Póvoa de Varzim / Vila do Conde", org: "ISN", address: "Póvoa de Varzim, Portugal", lat: 41.3806, lon: -8.7644, phone: null },
  { name: "ISN Leixões", org: "ISN", address: "Leixões, Matosinhos, Portugal", lat: 41.1846, lon: -8.7016, phone: null },
  { name: "ISN Aveiro", org: "ISN", address: "Aveiro, Portugal", lat: 40.6443, lon: -8.7508, phone: null },
  { name: "ISN Figueira da Foz", org: "ISN", address: "Figueira da Foz, Portugal", lat: 40.1500, lon: -8.8667, phone: null },
  { name: "ISN Nazaré", org: "ISN", address: "Nazaré, Portugal", lat: 39.6019, lon: -9.0704, phone: null },
  { name: "ISN Peniche", org: "ISN", address: "Peniche, Portugal", lat: 39.3558, lon: -9.3811, phone: null },
  { name: "ISN Cascais", org: "ISN", address: "Cascais, Portugal", lat: 38.6963, lon: -9.4215, phone: null },
  { name: "ISN Sesimbra", org: "ISN", address: "Sesimbra, Portugal", lat: 38.4444, lon: -9.1010, phone: null },
  { name: "ISN Sines", org: "ISN", address: "Sines, Portugal", lat: 37.9558, lon: -8.8647, phone: null },
  { name: "ISN Sagres", org: "ISN", address: "Sagres, Portugal", lat: 37.0064, lon: -8.9412, phone: null },
  { name: "ISN Ferragudo / Portimão", org: "ISN", address: "Portimão, Portugal", lat: 37.1233, lon: -8.5289, phone: null },
  { name: "ISN Olhão", org: "ISN", address: "Olhão, Portugal", lat: 37.0286, lon: -7.8408, phone: null },
  { name: "ISN Vila Real de Santo António", org: "ISN", address: "Vila Real de Santo António, Portugal", lat: 37.1936, lon: -7.4147, phone: null },
];

// Contacts officiels de secours en mer par pays (numéros publics, diffusés par les autorités
// elles-mêmes — à toujours privilégier le canal national plutôt qu'une station individuelle).
const RESCUE_CONTACT = {
  SNSM: { vhf: "Canal 16", phone: "196 (CROSS)" },
  "Salvamento Marítimo": { vhf: "Canal 16", phone: "900 202 202 / 112" },
  ISN: { vhf: "Canal 16", phone: "112" },
};

// Zones d'élevage de poissons (aquaculture marine) repérées sur la route Brest → Gibraltar.
// Liste volontairement limitée à des sites nommés et vérifiables via presse spécialisée/officielle
// (pas le cadastre aquacole complet — les portails SIG officiels ci-dessous en donnent la vue exhaustive
// et à jour). Positions approximatives, à confirmer avant usage opérationnel réel.
const FISH_FARMS = [
  {
    name: "Ferme Marine du Douhet (Poissons du Soleil)",
    address: "Port du Douhet, La Brée-les-Bains, Île d'Oléron, France",
    species: "Daurade, bar, maigre (écloserie/prégrossissement)",
    lat: 46.019, lon: -1.358,
  },
  {
    name: "Ferme pilote d'engraissement de thon rouge",
    address: "~5 mn au large de Getaria, mer Cantabrique, Espagne",
    species: "Thon rouge (projet pilote Balfegó / AZTI, 2025)",
    lat: 43.39, lon: -2.199,
  },
  {
    name: "CORALIS — ferme offshore Mariculture Systems",
    address: "~12 km au large de Vila Real de Santo António, Algarve, Portugal",
    species: "Bar, daurade (plateforme offshore, mise en service prévue 2028)",
    lat: 37.09, lon: -7.415,
  },
];

// Portails cartographiques officiels des zones d'aquaculture marine par pays — pour la vue
// exhaustive et à jour (cadastre complet des concessions), au-delà des quelques sites listés ci-dessus.
const AQUACULTURE_OFFICIAL_SOURCES = [
  { label: "GéoLittoral — Portail cartographique Aquaculture (France)", url: "https://www.geolittoral.developpement-durable.gouv.fr/portail-aquaculture-a1286.html" },
  { label: "DGRM — Geoportal de Aquicultura (Portugal)", url: "https://www.dgrm.pt/espa" },
  { label: "MAPA — Acuicultura marina (Espagne)", url: "https://www.mapa.gob.es/es/pesca/temas/acuicultura/" },
];

// --- Notifications push : clé publique VAPID (la clé privée reste côté serveur uniquement) ---
const VAPID_PUBLIC_KEY = "BMIS8tdZkU4-Ds_en30kFg0TsZWuxFnzBFguaStsE9DGI7FhxH2IIOdzvJyph2c4KGT_ZTMFkiNnJ7GKp69oeYs";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

function toRad(d) { return (d * Math.PI) / 180; }
function toDeg(r) { return (r * 180) / Math.PI; }

function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearingDeg(lat1, lon1, lat2, lon2) {
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// Point du SEA_LANE le plus proche d'une position donnée (index dans le tableau).
function nearestLaneIndex(lat, lon) {
  let best = 0;
  let bestDist = Infinity;
  SEA_LANE.forEach((p, i) => {
    const d = distanceKm(lat, lon, p.lat, p.lon);
    if (d < bestDist) { bestDist = d; best = i; }
  });
  return best;
}

// Trace une route qui longe la côte entre deux points, en passant par le couloir maritime
// SEA_LANE plutôt qu'en ligne droite (façon "autorouting" d'un traceur de route nautique).
function computeSeaRoute(a, b) {
  if (a == null || b == null || a.lat == null || b.lat == null) return null;
  const iA = nearestLaneIndex(a.lat, a.lon);
  const iB = nearestLaneIndex(b.lat, b.lon);
  const start = { lat: a.lat, lon: a.lon };
  const end = { lat: b.lat, lon: b.lon };
  // Les deux points se rattachent au même repère du couloir (ex : RDV et destination de part et
  // d'autre d'une presqu'île/ria, comme à Ferrol) : on route quand même via ce point au large plutôt
  // que de tracer une ligne droite qui peut couper à travers la terre.
  if (iA === iB) return [start, SEA_LANE[iA], end];
  const step = iA < iB ? 1 : -1;
  const middle = [];
  for (let i = iA; i !== iB; i += step) middle.push(SEA_LANE[i]);
  middle.push(SEA_LANE[iB]);
  return [start, ...middle, end];
}

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return `il y a ${Math.floor(s / 86400)} j`;
}

function fmtDateTime(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch (e) {
    return iso;
  }
}

// Les dates de convoi (départ/arrivée) sont prévisionnelles et dépendent de la météo — on
// affiche donc une fourchette autour de la date renseignée plutôt qu'une date figée, pour ne
// pas donner une fausse impression de précision.
const CONVOY_DATE_MARGIN_DAYS = 3;
function fmtDateRange(iso, marginDays = CONVOY_DATE_MARGIN_DAYS) {
  if (!iso) return "—";
  try {
    const center = new Date(iso);
    const from = new Date(center.getTime() - marginDays * 86400000);
    const to = new Date(center.getTime() + marginDays * 86400000);
    const opts = { day: "2-digit", month: "2-digit" };
    return `${from.toLocaleDateString("fr-FR", opts)} – ${to.toLocaleDateString("fr-FR", opts)}`;
  } catch (e) {
    return fmtDateTime(iso);
  }
}

// --- Export GPX : format standard lu par OpenCPN, Navionics, Garmin, qaRte, SeaNav, etc. ---
function escapeXml(str) {
  return String(str ?? "").replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));
}

function gpxWaypoint(lat, lon, name, desc, sym, time) {
  return `  <wpt lat="${lat}" lon="${lon}">
    <name>${escapeXml(name)}</name>
    ${desc ? `<desc>${escapeXml(desc)}</desc>` : ""}
    ${time ? `<time>${new Date(time).toISOString()}</time>` : ""}
    <sym>${sym}</sym>
  </wpt>`;
}

function buildGPX(waypoints) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<gpx version="1.1" creator="La Route des Orques" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
${waypoints.join("\n")}
</gpx>`;
}

function downloadGPX(xmlStr, filename) {
  const blob = new Blob([xmlStr], { type: "application/gpx+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Interrupteur type "switch" pour les préférences de notifications — chaque utilisateur
// choisit lui-même quels types de notifications push il reçoit, dans l'onglet "Moi".
function ToggleRow({ label, sub, value, onToggle }) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="pr-3">
        <p className="text-sm" style={{ color: COLORS.text }}>{label}</p>
        {sub && <p className="text-xs mt-0.5" style={{ color: COLORS.muted }}>{sub}</p>}
      </div>
      <button onClick={onToggle} title={value ? "Désactiver" : "Activer"}
        className="shrink-0 rounded-full"
        style={{
          width: 44, height: 26, position: "relative",
          background: value ? COLORS.green : "rgba(255,255,255,0.08)",
          border: `1px solid ${value ? COLORS.green : COLORS.border}`,
        }}>
        <span style={{
          position: "absolute", top: 2, left: value ? 20 : 2, width: 20, height: 20, borderRadius: "50%",
          background: "#FFFFFF", transition: "left 0.15s",
        }} />
      </button>
    </div>
  );
}
function Panel({ children, style, className = "", ...rest }) {
  return (
    <div
      className={`rounded-lg border ${className}`}
      style={{ background: COLORS.panel, borderColor: COLORS.border, ...style }}
      {...rest}
    >
      {children}
    </div>
  );
}

function Badge({ children, color, bg }) {
  return (
    <span className="text-xs px-2 py-0.5 rounded-full inline-block" style={{ color, background: bg }}>
      {children}
    </span>
  );
}

function IconBtn({ onClick, active, children, label }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex items-center justify-center rounded-full shadow-lg"
      style={{
        color: active ? COLORS.cyan : COLORS.text,
        /* Fond sombre uniforme (comme Observations) sur tous les boutons, actif ou non —
           seule la couleur de bordure/texte change pour indiquer l'état actif. Icônes seules
           (sans libellé sous l'icône) pour rester compact sur mobile. */
        background: "rgba(37,72,100,0.92)",
        backdropFilter: "blur(12px)",
        border: `1px solid ${active ? COLORS.cyan : COLORS.cyanDim}`,
        opacity: active ? 1 : 0.85,
        width: 44,
        height: 44,
      }}
    >
      {children}
    </button>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-xs uppercase tracking-wider" style={{ color: COLORS.muted }}>{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

const inputStyle = {
  background: COLORS.panelAlt,
  color: COLORS.text,
  border: `1px solid ${COLORS.border}`,
};

// --- Curseur de sélection sur la carte : viseur épais et bien visible pendant le "Sur la carte" ---
const PICK_CURSOR = `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44"><line x1="22" y1="2" x2="22" y2="42" stroke="%23E8A23D" stroke-width="5"/><line x1="2" y1="22" x2="42" y2="22" stroke="%23E8A23D" stroke-width="5"/><circle cx="22" cy="22" r="10" fill="none" stroke="%23E8A23D" stroke-width="5"/></svg>') 22 22, crosshair`;

// Icône "élevage de poissons" : un filet suspendu entre deux perches (représente un parc
// aquacole flottant), plutôt que l'emoji poisson générique. Version HTML brute (pour les
// divIcon Leaflet, qui n'acceptent pas de JSX) + composant React (pour les boutons de l'UI).
const FISH_NET_SVG_HTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="1.6" stroke-linecap="round"><ellipse cx="4" cy="4" rx="2.2" ry="1.3" transform="rotate(-40 4 4)" fill="#000000" stroke="none"/><ellipse cx="20" cy="4" rx="2.2" ry="1.3" transform="rotate(40 20 4)" fill="#000000" stroke="none"/><ellipse cx="4" cy="20" rx="2.2" ry="1.3" transform="rotate(40 4 20)" fill="#000000" stroke="none"/><ellipse cx="20" cy="20" rx="2.2" ry="1.3" transform="rotate(-40 20 20)" fill="#000000" stroke="none"/><rect x="5" y="5" width="14" height="14" rx="1"/><line x1="8.5" y1="5" x2="8.5" y2="19"/><line x1="12" y1="5" x2="12" y2="19"/><line x1="15.5" y1="5" x2="15.5" y2="19"/><line x1="5" y1="8.5" x2="19" y2="8.5"/><line x1="5" y1="12" x2="19" y2="12"/><line x1="5" y1="15.5" x2="19" y2="15.5"/></svg>`;
// Icône "voilier" pleine (silhouette solide, façon logo), plutôt que le tracé fin de l'icône
// Sailboat de lucide-react — plus lisible en petite taille et personnalisable par couleur.
function SolidSailboatIcon({ size = 16, color = "#5FD0C4", style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={style}>
      <path d="M12.5 2.5 L19 14.5 L12.5 14.5 Z" fill={color} />
      <path d="M11 6 L11 14.5 L4.5 14.5 Z" fill={color} />
      <path d="M2.5 16.5 L21.5 16.5 L18 20.5 L6 20.5 Z" fill={color} />
    </svg>
  );
}
// Icône "jumelles" dessinée à la main : l'icône "Binoculars" n'existe pas dans la version de
// lucide-react installée sur le projet (build Vercel en échec : "Binoculars" is not exported),
// donc on ne dépend plus du jeu d'icônes de la librairie pour celle-ci.
function BinocularsIcon({ size = 20, color = "currentColor", strokeWidth = 2 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="15" r="4" />
      <circle cx="18" cy="15" r="4" />
      <path d="M14 15a2 2 0 0 0-4 0" />
      <path d="M6 11V7a2 2 0 0 1 2-2" />
      <path d="M18 11V7a2 2 0 0 0-2-2h-2" />
    </svg>
  );
}
function FishNetIcon({ size = 20, color = "#000000" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round">
      <ellipse cx="4" cy="4" rx="2.2" ry="1.3" transform="rotate(-40 4 4)" fill={color} stroke="none" />
      <ellipse cx="20" cy="4" rx="2.2" ry="1.3" transform="rotate(40 20 4)" fill={color} stroke="none" />
      <ellipse cx="4" cy="20" rx="2.2" ry="1.3" transform="rotate(40 4 20)" fill={color} stroke="none" />
      <ellipse cx="20" cy="20" rx="2.2" ry="1.3" transform="rotate(-40 20 20)" fill={color} stroke="none" />
      <rect x="5" y="5" width="14" height="14" rx="1" />
      <line x1="8.5" y1="5" x2="8.5" y2="19" />
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="15.5" y1="5" x2="15.5" y2="19" />
      <line x1="5" y1="8.5" x2="19" y2="8.5" />
      <line x1="5" y1="12" x2="19" y2="12" />
      <line x1="5" y1="15.5" x2="19" y2="15.5" />
    </svg>
  );
}

// --- Carte marine réelle (Leaflet + OpenStreetMap + OpenSeaMap), chargée via CDN dans index.html ---
function MarineMap({ pos, others, alertsWithDist, convoys, myConvoyMemberIds, now, onSelectBoat, showShipyards, showRescueStations, showFishFarms, pickMode, onPickLocation, trails, showTrails, myBoatId, isModerator, focusTarget, mapStyle, onSelectPlace, onSelectConvoyMarker, onSelectAlert }) {
  const mapElRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);  const pickModeRef = useRef(pickMode);
  const onPickLocationRef = useRef(onPickLocation);
  const onSelectPlaceRef = useRef(onSelectPlace);
  const onSelectConvoyMarkerRef = useRef(onSelectConvoyMarker);
  const onSelectAlertRef = useRef(onSelectAlert);
  const alertMarkersRef = useRef({});
  const baseLayerRef = useRef(null);
  const labelsLayerRef = useRef(null);
  useEffect(() => { pickModeRef.current = pickMode; }, [pickMode]);
  useEffect(() => { onPickLocationRef.current = onPickLocation; }, [onPickLocation]);
  useEffect(() => { onSelectPlaceRef.current = onSelectPlace; }, [onSelectPlace]);
  useEffect(() => { onSelectConvoyMarkerRef.current = onSelectConvoyMarker; }, [onSelectConvoyMarker]);
  useEffect(() => { onSelectAlertRef.current = onSelectAlert; }, [onSelectAlert]);

  useEffect(() => {
    if (!mapElRef.current || mapRef.current || !window.L) return;
    const map = window.L.map(mapElRef.current, { zoomControl: false, attributionControl: true }).setView(
      pos ? [pos.lat, pos.lon] : [47.0, -3.0],
      pos ? 10 : 5
    );
    // Zoom manuel (+ / -) repositionné en haut à droite, sous le bouton Carte/Satellite
    // (voir règle CSS .leaflet-top.leaflet-right ci-dessus pour le décalage).
    window.L.control.zoom({ position: "topright" }).addTo(map);
    window.L.tileLayer("https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png", {
      maxZoom: 18,
      zIndex: 2,
      attribution: '&copy; OpenSeaMap',
    }).addTo(map);
    layerRef.current = window.L.layerGroup().addTo(map);
        map.on("click", (e) => {
      if (pickModeRef.current && onPickLocationRef.current) {
        onPickLocationRef.current(e.latlng.lat, e.latlng.lng);
      }
    });mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fond de carte : rue (OpenStreetMap) ou satellite (Esri World Imagery), au choix de
  // l'utilisateur. Toujours en dessous de la surcouche OpenSeaMap (zIndex 2 > 1).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.L) return;
    if (baseLayerRef.current) map.removeLayer(baseLayerRef.current);
    if (labelsLayerRef.current) { map.removeLayer(labelsLayerRef.current); labelsLayerRef.current = null; }
    const newBase = mapStyle === "satellite"
      ? window.L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
          maxZoom: 18,
          zIndex: 1,
          attribution: "Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics",
        })
      : window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 18,
          zIndex: 1,
          attribution: "&copy; OpenStreetMap",
        });
    newBase.addTo(map);
    baseLayerRef.current = newBase;

    if (mapStyle === "satellite") {
      // Superposition des noms de villes/frontières/routes par-dessus l'imagerie satellite brute
      // (qui n'a aucun repère écrit), sans quoi la carte satellite est illisible pour se situer.
      const labels = window.L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 18, zIndex: 1.5, attribution: "Labels &copy; Esri" }
      );
      labels.addTo(map);
      labelsLayerRef.current = labels;
    }
  }, [mapStyle]);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer || !window.L) return;
    layer.clearLayers();

    if (pos) {
      window.L.circleMarker([pos.lat, pos.lon], {
        radius: 11, color: COLORS.orange, fillColor: COLORS.orange, fillOpacity: 1, weight: 3,
      })
        .bindTooltip("Toi", { direction: "top", sticky: true, className: "orca-tooltip", opacity: 1 })
        .addTo(layer);
    }

    // Marqueurs utilisateurs : vert = actif, cyan = actif et dans ton convoi, rouge (estompé,
    // pointillé) = inactif depuis plus de 15 min — bien plus visible que l'ancien gris,
    // notamment sur fond de carte clair/satellite.
    others.forEach((b) => {
      if (b.lat == null || b.lon == null) return;
      const inMyConvoy = myConvoyMemberIds.includes(b.id);
      const c = b.stale ? COLORS.red : inMyConvoy ? COLORS.cyan : COLORS.green;
      const boatDesc = `${b.pseudo} · ${b.boatName}${b.stale ? " · inactif" : ""}`;
      window.L.circleMarker([b.lat, b.lon], {
        radius: 10, color: c, fillColor: c, fillOpacity: b.stale ? 0.45 : 1, weight: 3,
        dashArray: b.stale ? "4 3" : null,
      })
        .bindTooltip(boatDesc, { direction: "top", sticky: true, className: "orca-tooltip", opacity: 1 })
        .on("click", () => onSelectBoat && onSelectBoat(b))
        .addTo(layer);
    });

    alertMarkersRef.current = {};
    alertsWithDist.forEach((a) => {
      const sp = speciesInfo(a.species || "orque");
      const isRecent = now - a.createdAt < RECENT_ALERT_MS;
      const color = a.incident ? COLORS.orange : COLORS.cyan;
      // Les orques restent l'espèce phare de l'appli : marqueur plus grand, rendu en noir et
      // blanc contrasté (contraste très poussé pour que les zones grises de l'emoji ressortent
      // en noir franc plutôt qu'en gris terne) pour rester repérable en un coup d'œil.
      const isOrca = (a.species || "orque") === "orque";
      const size = isOrca ? (isRecent ? 54 : 40) : (isRecent ? 42 : 30);
      const fontSize = isOrca ? (isRecent ? 40 : 28) : (isRecent ? 30 : 20);
      const filterCss = isOrca
        ? `grayscale(1) contrast(2.5) drop-shadow(0 2px 4px rgba(0,0,0,0.85)) drop-shadow(0 0 ${isRecent ? 7 : 4}px ${a.incident ? COLORS.orange : "#ffffff"})`
        : `drop-shadow(0 2px 3px rgba(0,0,0,0.7)) drop-shadow(0 0 ${isRecent ? 5 : 3}px ${color})`;
      const iconInner = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:${fontSize}px;line-height:1;">${sp.emoji}</div>`;
      const speciesIcon = window.L.divIcon({
        html: `<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;opacity:${isRecent ? 1 : 0.75};filter:${filterCss};">${iconInner}</div>`,
        className: "",
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });
      // Un seul clic ouvre la mini-fenêtre (plus de bulle au survol en plus de la fenêtre au
      // clic : les deux s'affichaient en même temps sur les logos d'espèces, notamment orques).
      const alertMarker = window.L.marker([a.lat, a.lon], { icon: speciesIcon })
        .on("click", () => onSelectAlertRef.current && onSelectAlertRef.current(a))
        .addTo(layer);

      alertMarkersRef.current[a.id] = { marker: alertMarker, alert: a };
    });

    // Tous les convois avec un point de RDV s'affichent sur la carte (pas seulement le
    // tien) : chacun est cliquable et propose de le rejoindre directement depuis la carte,
    // comme dans l'onglet Convois. Le tien reste distingué visuellement (vert) des convois
    // que tu peux rejoindre (cyan).
    (convoys || []).forEach((cv) => {
      const hasRdv = cv.rdvLat != null && cv.rdvLon != null;
      const hasDest = cv.destLat != null && cv.destLon != null;
      if (!hasRdv && !hasDest) return;

      const me = cv.members.find((m) => m.boatId === myBoatId);
      const isMine = me?.status === "confirme";
      const isPending = me?.status === "en_attente";
      const accentBg = isMine ? COLORS.green : COLORS.cyan;
      const accentBorder = isMine ? "#0A1F14" : "#0A2E33";

      // Au clic, on ouvre une mini-fenêtre React (comme pour les onglets) au lieu d'une bulle
      // Leaflet qui se refermait dès qu'on cliquait ailleurs ou qu'on quittait la carte des
      // yeux : plus lisible, avec les dates de départ/arrivée du convoi, et reste ouverte tant
      // qu'on ne la ferme pas explicitement.
      const bindJoinPopup = (marker, headline) => {
        marker.on("click", () => {
          onSelectConvoyMarkerRef.current && onSelectConvoyMarkerRef.current({ convoy: cv, headline, isMine, isPending });
        });
      };

      if (hasRdv) {
        const rdvHeadline = `RDV${cv.rdvLabel ? ` · ${cv.rdvLabel}` : ""}`;
        const rdvIcon = window.L.divIcon({
          html: `<div style="width:42px;height:42px;border-radius:50%;background:${accentBg};border:3px solid ${accentBorder};display:flex;align-items:center;justify-content:center;font-size:22px;line-height:1;filter:drop-shadow(0 2px 3px rgba(0,0,0,0.5));">🏁</div>`,
          className: "",
          iconSize: [42, 42],
          iconAnchor: [21, 21],
        });
        const rdvMarker = window.L.marker([cv.rdvLat, cv.rdvLon], { icon: rdvIcon });
        bindJoinPopup(rdvMarker, rdvHeadline);
        rdvMarker.addTo(layer);
      }

      if (hasDest) {
        const destHeadline = `Destination${cv.destLabel ? ` · ${cv.destLabel}` : ""}`;
        const destIcon = window.L.divIcon({
          html: `<div style="width:42px;height:42px;border-radius:50%;background:${accentBg};border:3px solid ${accentBorder};display:flex;align-items:center;justify-content:center;font-size:22px;line-height:1;filter:drop-shadow(0 2px 3px rgba(0,0,0,0.5));">🏁</div>`,
          className: "",
          iconSize: [42, 42],
          iconAnchor: [21, 21],
        });
        const destMarker = window.L.marker([cv.destLat, cv.destLon], { icon: destIcon });
        bindJoinPopup(destMarker, destHeadline);
        destMarker.addTo(layer);
      }

      // Étapes intermédiaires du convoi : un petit marqueur numéroté par escale, cliquable
      // comme le reste (ouvre la même mini-fenêtre, avec la liste complète des étapes).
      const stages = Array.isArray(cv.waypoints) ? cv.waypoints.filter((w) => w.lat != null && w.lon != null) : [];
      stages.forEach((wp, i) => {
        const stageIcon = window.L.divIcon({
          html: `<div style="width:28px;height:28px;border-radius:50%;background:${accentBg};border:2px solid ${accentBorder};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#0A1F14;filter:drop-shadow(0 2px 3px rgba(0,0,0,0.5));">${i + 1}</div>`,
          className: "",
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });
        const stageMarker = window.L.marker([wp.lat, wp.lon], { icon: stageIcon });
        bindJoinPopup(stageMarker, `Étape ${i + 1}${wp.label ? ` · ${wp.label}` : ""}`);
        stageMarker.addTo(layer);
      });

      // Tracé automatique : longe le couloir maritime SEA_LANE plutôt qu'une ligne droite,
      // en passant par chaque étape dans l'ordre (RDV -> étape 1 -> ... -> destination).
      const routePoints = [
        ...(hasRdv ? [{ lat: cv.rdvLat, lon: cv.rdvLon }] : []),
        ...stages,
        ...(hasDest ? [{ lat: cv.destLat, lon: cv.destLon }] : []),
      ];

      if (routePoints.length >= 2) {
        // Aux deux extrémités du trajet global (départ et arrivée finale), le tracé approche
        // le port en ligne approximative : il ne suit PAS le balisage nautique réel (chenal,
        // bouées, feux). On distingue visuellement ces segments d'« approche » (fins,
        // pointillés serrés, discrets) du « couloir » central (large, trait plein) pour
        // rappeler qu'à l'approche des ports il faut suivre le balisage réel (voir la couche
        // OpenSeaMap sur la carte) — le couloir central, lui, reste en trait plein pour un
        // rendu plus lisible / moins "ligne de construction" sur le reste du trajet. Entre deux
        // étapes intermédiaires, tout le tracé reste en couloir (ni l'une ni l'autre n'est le
        // vrai départ/la vraie arrivée du convoi).
        // Ton convoi (noir) reste plus marqué que les convois qu'on peut rejoindre (cyan).
        const routeColor = isMine ? "#000000" : COLORS.cyan;
        const approachStyle = { color: routeColor, weight: isMine ? 2.5 : 2, opacity: isMine ? 0.55 : 0.45, dashArray: "2 6", lineCap: "round" };
        const corridorStyle = { color: routeColor, weight: isMine ? 4 : 3, opacity: isMine ? 0.85 : 0.7, lineCap: "round" };
        const approachHeadline = "Approche du port · balisage nautique réel à suivre (voir bouées/chenal sur la carte)";
        const corridorHeadline = "Route du convoi (indicative)";

        for (let legIdx = 0; legIdx < routePoints.length - 1; legIdx++) {
          const isFirstLeg = legIdx === 0;
          const isLastLeg = legIdx === routePoints.length - 2;
          const seaRoute = computeSeaRoute(routePoints[legIdx], routePoints[legIdx + 1]);
          const routeLatLngs = seaRoute
            ? seaRoute.map((p) => [p.lat, p.lon])
            : [[routePoints[legIdx].lat, routePoints[legIdx].lon], [routePoints[legIdx + 1].lat, routePoints[legIdx + 1].lon]];

          if (routeLatLngs.length <= 2) {
            const style = (isFirstLeg || isLastLeg) ? approachStyle : corridorStyle;
            const headline = (isFirstLeg || isLastLeg) ? approachHeadline : corridorHeadline;
            const line = window.L.polyline(routeLatLngs, style);
            bindJoinPopup(line, headline);
            line.addTo(layer);
            continue;
          }
          // Segment de départ de cette portion : approche non balisée seulement si c'est le
          // tout premier départ du convoi (RDV) — sinon couloir, comme le reste de la portion.
          const startLine = window.L.polyline([routeLatLngs[0], routeLatLngs[1]], isFirstLeg ? approachStyle : corridorStyle);
          bindJoinPopup(startLine, isFirstLeg ? approachHeadline : corridorHeadline);
          startLine.addTo(layer);
          // Segment central : couloir maritime indicatif entre repères, évite les terres.
          if (routeLatLngs.length > 3) {
            const midLine = window.L.polyline(routeLatLngs.slice(1, -1), corridorStyle);
            bindJoinPopup(midLine, corridorHeadline);
            midLine.addTo(layer);
          }
          // Segment d'arrivée de cette portion : approche non balisée seulement si c'est la
          // toute dernière arrivée du convoi (destination) — sinon couloir.
          const endLine = window.L.polyline([routeLatLngs[routeLatLngs.length - 2], routeLatLngs[routeLatLngs.length - 1]], isLastLeg ? approachStyle : corridorStyle);
          bindJoinPopup(endLine, isLastLeg ? approachHeadline : corridorHeadline);
          endLine.addTo(layer);
        }
      }
    });

    if (showShipyards) {
      const wrenchIcon = window.L.divIcon({
        html: `<div style="background:${COLORS.green};width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid #0A1F14;font-size:19px;">🛠️</div>`,
        className: "",
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });
      SHIPYARDS.forEach((s) => {
        window.L.marker([s.lat, s.lon], { icon: wrenchIcon })
          .on("click", () => onSelectPlaceRef.current && onSelectPlaceRef.current({ type: "yard", icon: "🛠️", name: s.name, address: s.address, phone: s.phone }))
          .addTo(layer);
      });
    }

    if (showRescueStations) {
      const buoyIcon = window.L.divIcon({
        html: `<div style="background:${COLORS.orange};width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid #4A2409;font-size:19px;">🛟</div>`,
        className: "",
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });
      RESCUE_STATIONS.forEach((s) => {
        const contact = RESCUE_CONTACT[s.org];
        window.L.marker([s.lat, s.lon], { icon: buoyIcon })
          .on("click", () => onSelectPlaceRef.current && onSelectPlaceRef.current({
            type: "rescue", icon: "🛟", name: s.name, address: s.address,
            vhf: contact?.vhf, phone: contact?.phone,
          }))
          .addTo(layer);
      });
    }

    if (showFishFarms) {
      const fishFarmIcon = window.L.divIcon({
        html: `<div style="background:${COLORS.cyan};width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid #0A2E33;">${FISH_NET_SVG_HTML}</div>`,
        className: "",
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });
      FISH_FARMS.forEach((f) => {
        window.L.marker([f.lat, f.lon], { icon: fishFarmIcon })
          .on("click", () => onSelectPlaceRef.current && onSelectPlaceRef.current({ type: "farm", icon: "🐟", name: f.name, address: f.address, species: f.species }))
          .addTo(layer);
      });
    }

    // --- Trace : simple trait de sillage par bateau (moi + les autres), comme sur un traceur de route ---
    if (showTrails && trails) {
      const othersById = {};
      others.forEach((b) => { othersById[b.id] = b; });

      Object.entries(trails).forEach(([boatId, points]) => {
        if (!points || points.length < 2) return;
        const isMe = boatId === myBoatId;
        const otherInfo = othersById[boatId];
        const inConvoy = myConvoyMemberIds.includes(boatId);
        const stale = otherInfo ? otherInfo.stale : false;
        const color = isMe ? COLORS.orange : inConvoy ? COLORS.cyan : COLORS.green;

        const first = points[0];
        const last = points[points.length - 1];
        const dtH = (last.t - first.t) / 3600000;
        const totalKm = distanceKm(first.lat, first.lon, last.lat, last.lon);
        const speedKn = dtH > 0 ? totalKm / 1.852 / dtH : null;
        const brg = bearingDeg(first.lat, first.lon, last.lat, last.lon);

        const trailTooltip = `<div class="orca-tooltip-meta">${fmtDateTime(new Date(last.t).toISOString())}</div><div class="orca-tooltip-meta">${last.lat.toFixed(4)}, ${last.lon.toFixed(4)}</div>${speedKn != null ? `<div class="orca-tooltip-meta">${speedKn.toFixed(1)} nds · cap ${Math.round(brg)}°</div>` : ""}`;
        window.L.polyline(points.map((p) => [p.lat, p.lon]), {
          color,
          weight: 2,
          opacity: stale ? 0.3 : 0.7,
        })
          .bindTooltip(trailTooltip, { direction: "top", sticky: true, className: "orca-tooltip", opacity: 1 })
          .addTo(layer);
      });
    }
  }, [pos, others, alertsWithDist, convoys, myConvoyMemberIds, now, onSelectBoat, showShipyards, showRescueStations, showFishFarms, trails, showTrails, myBoatId, isModerator]);

  // Centre/zoome la carte et ouvre la bulle du marqueur correspondant quand on clique
  // sur une alerte dans la liste (géolocalisation visuelle demandée depuis l'onglet Alertes).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusTarget || focusTarget.lat == null || focusTarget.lon == null) return;
    map.setView([focusTarget.lat, focusTarget.lon], Math.max(map.getZoom(), 12), { animate: true });
    const entry = alertMarkersRef.current[focusTarget.id];
    if (entry) onSelectAlertRef.current && onSelectAlertRef.current(entry.alert);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTarget]);

  return (
    <div
      ref={mapElRef}
    style={{ width: "100%", height: "100%", cursor: pickMode ? PICK_CURSOR : "" }}
    />
  );
}

const LANGS = [
  { code: "fr", flag: "🇫🇷" },
  { code: "en", flag: "🇬🇧" },
  { code: "es", flag: "🇪🇸" },
  { code: "pt", flag: "🇵🇹" },
];

const TRANSLATIONS = {
  fr: {
    loginTagline: "Connexion par lien magique — pas de mot de passe à retenir.",
    slogan: "Naviguons ensemble, naviguons en sécurité",
    codeSent: (email) => `Code envoyé à ${email}. Saisis-le ci-dessous.`,
    codeLabel: "Code de connexion",
    validateCode: "Valider le code",
    useOtherEmail: "Utiliser une autre adresse",
    emailLabel: "Adresse e-mail",
    receiveLink: "Recevoir le lien de connexion",
    onboardingTagline: "Rejoins les plaisanciers en route pour partager position, alertes orques et former des convois.",
    pseudoLabel: "Pseudo",
    boatNameLabel: "Nom du bateau",
    positionLabel: "Position actuelle",
    locateMe: "Me localiser",
    joinRoute: "Rejoindre la route",
    onboardingDisclaimer: "Ton pseudo, ton bateau et ta position sont visibles par les autres plaisanciers connectés à cette appli.",
    tabCarte: "Carte",
    tabConvois: "Convois",
    tabAlerts: "Observations",
    tabChat: "Chat",
    tabProfile: "Moi",
    activeLabel: (n) => `${n} actif${n > 1 ? "s" : ""}`,
    alertsRecent: "Récentes",
    alertsHistory: "Historique",
    noRecentAlerts: "Aucune observation signalée récemment.",
    noHistoryAlerts: "Aucun signalement dans l'historique pour l'instant.",
    officialSourcesTitle: "Sources officielles",
    officialSourcesDesc: "Pour les données antérieures et les statistiques complètes par espèce :",
    convoyOrganizedBy: (pseudo, boat) => `Organisé par ${pseudo} · ${boat}`,
    convoyYours: "Ton convoi",
    convoyPending: "Demande envoyée — en attente de confirmation",
    convoyJoinBtn: "Rejoindre le convoi",
    departureLabel: "Départ",
    etaLabel: "Arrivée prévue",
    approxPosition: "Position approximative — voir sources officielles pour le cadastre complet",
    closeLabel: "Fermer",
    weatherMarginNote: "Dates à ± 3 jours selon la météo",
    stagesLabel: "Étapes",
  },
  en: {
    loginTagline: "Sign in with a magic link — no password to remember.",
    slogan: "Sail together, sail safer",
    codeSent: (email) => `Code sent to ${email}. Enter it below.`,
    codeLabel: "Sign-in code",
    validateCode: "Validate code",
    useOtherEmail: "Use another address",
    emailLabel: "Email address",
    receiveLink: "Receive sign-in link",
    onboardingTagline: "Join fellow sailors to share position, orca alerts, and form convoys.",
    pseudoLabel: "Nickname",
    boatNameLabel: "Boat name",
    positionLabel: "Current position",
    locateMe: "Locate me",
    joinRoute: "Join the route",
    onboardingDisclaimer: "Your nickname, boat, and position are visible to other sailors connected to this app.",
    tabCarte: "Map",
    tabConvois: "Convoys",
    tabAlerts: "Observations",
    tabChat: "Chat",
    tabProfile: "Me",
    activeLabel: (n) => `${n} active`,
    alertsRecent: "Recent",
    alertsHistory: "History",
    noRecentAlerts: "No sightings reported recently.",
    noHistoryAlerts: "No reports in the history yet.",
    officialSourcesTitle: "Official sources",
    officialSourcesDesc: "For past data and full statistics per species:",
    convoyOrganizedBy: (pseudo, boat) => `Organized by ${pseudo} · ${boat}`,
    convoyYours: "Your convoy",
    convoyPending: "Request sent — awaiting confirmation",
    convoyJoinBtn: "Join the convoy",
    departureLabel: "Departure",
    etaLabel: "Expected arrival",
    approxPosition: "Approximate position — see official sources for the full register",
    closeLabel: "Close",
    weatherMarginNote: "Dates ± 3 days depending on weather",
    stagesLabel: "Stages",
  },
  es: {
    loginTagline: "Inicia sesión con un enlace mágico — sin contraseña que recordar.",
    slogan: "Naveguemos juntos, naveguemos más seguros",
    codeSent: (email) => `Código enviado a ${email}. Introdúcelo a continuación.`,
    codeLabel: "Código de acceso",
    validateCode: "Validar código",
    useOtherEmail: "Usar otra dirección",
    emailLabel: "Correo electrónico",
    receiveLink: "Recibir enlace de acceso",
    onboardingTagline: "Únete a los navegantes para compartir posición, alertas de orcas y formar convoyes.",
    pseudoLabel: "Apodo",
    boatNameLabel: "Nombre del barco",
    positionLabel: "Posición actual",
    locateMe: "Localizarme",
    joinRoute: "Unirse a la ruta",
    onboardingDisclaimer: "Tu apodo, barco y posición son visibles para otros navegantes conectados a esta app.",
    tabCarte: "Mapa",
    tabConvois: "Convoyes",
    tabAlerts: "Observaciones",
    tabChat: "Chat",
    tabProfile: "Yo",
    activeLabel: (n) => `${n} activo${n > 1 ? "s" : ""}`,
    alertsRecent: "Recientes",
    alertsHistory: "Historial",
    noRecentAlerts: "No se han señalado avistamientos recientemente.",
    noHistoryAlerts: "Aún no hay reportes en el historial.",
    officialSourcesTitle: "Fuentes oficiales",
    officialSourcesDesc: "Para datos anteriores y estadísticas completas por especie:",
    convoyOrganizedBy: (pseudo, boat) => `Organizado por ${pseudo} · ${boat}`,
    convoyYours: "Tu convoy",
    convoyPending: "Solicitud enviada — a la espera de confirmación",
    convoyJoinBtn: "Unirse al convoy",
    departureLabel: "Salida",
    etaLabel: "Llegada prevista",
    approxPosition: "Posición aproximada — consulta las fuentes oficiales para el registro completo",
    closeLabel: "Cerrar",
    weatherMarginNote: "Fechas ± 3 días según el tiempo",
    stagesLabel: "Etapas",
  },
  pt: {
    loginTagline: "Entrar com link mágico — sem senha para lembrar.",
    slogan: "Naveguemos juntos, naveguemos mais seguros",
    codeSent: (email) => `Código enviado para ${email}. Digite-o abaixo.`,
    codeLabel: "Código de acesso",
    validateCode: "Validar código",
    useOtherEmail: "Usar outro endereço",
    emailLabel: "Endereço de e-mail",
    receiveLink: "Receber link de acesso",
    onboardingTagline: "Junte-se aos navegadores para partilhar posição, alertas de orcas e formar comboios.",
    pseudoLabel: "Apelido",
    boatNameLabel: "Nome do barco",
    positionLabel: "Posição atual",
    locateMe: "Localizar-me",
    joinRoute: "Entrar na rota",
    onboardingDisclaimer: "O teu apelido, barco e posição ficam visíveis para outros navegadores ligados a esta app.",
    tabCarte: "Mapa",
    tabConvois: "Comboios",
    tabAlerts: "Observações",
    tabChat: "Chat",
    tabProfile: "Eu",
    activeLabel: (n) => `${n} ativo${n > 1 ? "s" : ""}`,
    alertsRecent: "Recentes",
    alertsHistory: "Histórico",
    noRecentAlerts: "Nenhum avistamento reportado recentemente.",
    noHistoryAlerts: "Ainda não há relatos no histórico.",
    officialSourcesTitle: "Fontes oficiais",
    officialSourcesDesc: "Para dados anteriores e estatísticas completas por espécie:",
    convoyOrganizedBy: (pseudo, boat) => `Organizado por ${pseudo} · ${boat}`,
    convoyYours: "O teu comboio",
    convoyPending: "Pedido enviado — a aguardar confirmação",
    convoyJoinBtn: "Juntar-me ao comboio",
    departureLabel: "Partida",
    etaLabel: "Chegada prevista",
    approxPosition: "Posição aproximada — ver fontes oficiais para o registo completo",
    closeLabel: "Fechar",
    weatherMarginNote: "Datas ± 3 dias consoante o tempo",
    stagesLabel: "Etapas",
  },
};

function LangSwitcher({ lang, setLang }) {
  return (
    <div className="flex gap-2 mb-4">
      {LANGS.map((l) => (
        <button
          key={l.code}
          onClick={() => setLang(l.code)}
          className="text-xl w-9 h-9 rounded flex items-center justify-center"
          style={{ border: `1px solid ${lang === l.code ? COLORS.orange : COLORS.border}`, opacity: lang === l.code ? 1 : 0.5 }}
        >
          {l.flag}
        </button>
      ))}
    </div>
  );
}
export default function RouteDesOrques() {
  const [authReady, setAuthReady] = useState(false);
  const [session, setSession] = useState(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [linkSent, setLinkSent] = useState(false);
  const [authError, setAuthError] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [loginMode, setLoginMode] = useState("magic"); // "magic" | "password"
  const [loginPassword, setLoginPassword] = useState("");
  const [pwSignupMode, setPwSignupMode] = useState(false);
  const [pwInfo, setPwInfo] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [newPassword1, setNewPassword1] = useState("");
  const [newPassword2, setNewPassword2] = useState("");
  const [recoveryError, setRecoveryError] = useState("");
  const [recoveryDone, setRecoveryDone] = useState(false);
  const [lang, setLang] = useState("fr");
  const t = TRANSLATIONS[lang];

  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState(null);
  const [pushStatus, setPushStatus] = useState("inconnu"); // inconnu | inactif | actif | refuse | indisponible
  const [pos, setPos] = useState(null);
  const [heading, setHeading] = useState("");
  const [status, setStatus] = useState("en_route");
  const [boats, setBoats] = useState({});
  const [alerts, setAlerts] = useState([]);
  const [chat, setChat] = useState([]);
  const [convoys, setConvoys] = useState([]);
  const [tab, setTab] = useState("carte");
  const [showAlertForm, setShowAlertForm] = useState(false);
  const [alertsView, setAlertsView] = useState("recentes");
  // Couches optionnelles (chantiers/secours/élevage) : masquées par défaut au démarrage pour
  // ne pas surcharger la carte — l'utilisateur les active lui-même via le menu "Couches".
  const [showShipyards, setShowShipyards] = useState(false);
  const [showFishFarms, setShowFishFarms] = useState(false);
  const [showRescueStations, setShowRescueStations] = useState(false);
  const [showLayersMenu, setShowLayersMenu] = useState(false);
  const [visibleSpecies, setVisibleSpecies] = useState({ orque: true, dauphin: true, tortue: true });
  const [mapStyle, setMapStyle] = useState("street"); // "street" | "satellite"
  const [distUnit, setDistUnitState] = useState(() => {
    try { return localStorage.getItem("orca_dist_unit") === "nm" ? "nm" : "km"; } catch (e) { return "km"; }
  });
  const setDistUnit = (u) => {
    setDistUnitState(u);
    try { localStorage.setItem("orca_dist_unit", u); } catch (e) {}
  };
  const [alertFocus, setAlertFocus] = useState(null);
  const [showTrails, setShowTrails] = useState(true);
  const [trails, setTrails] = useState({});
  const [showConvoyForm, setShowConvoyForm] = useState(false);
  const [alertCount, setAlertCount] = useState("");
  const [alertNotes, setAlertNotes] = useState("");
  const [alertIncident, setAlertIncident] = useState(false);
  const [alertSpecies, setAlertSpecies] = useState("orque");
  const [editingAlertId, setEditingAlertId] = useState(null);
  const [alertLat, setAlertLat] = useState(null);
  const [alertLon, setAlertLon] = useState(null);
  const [alertLocating, setAlertLocating] = useState(false);
  const [chatText, setChatText] = useState("");
  // Messages privés 1-à-1 entre utilisateurs (pour s'organiser en dehors du canal général),
  // avec notification push à chaque nouveau message. null = onglet "Général" du chat.
  const [dms, setDms] = useState([]);
  const [activeDmPeerId, setActiveDmPeerId] = useState(null);
  const [dmText, setDmText] = useState("");
  const [selectedBoat, setSelectedBoat] = useState(null);
  // Mini-fenêtres d'info carte (remplacent les bulles Leaflet qui se refermaient au survol) :
  // un point d'intérêt (chantier/secours/élevage) ou un marqueur/tracé de convoi cliqué.
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [selectedConvoyMarker, setSelectedConvoyMarker] = useState(null);
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [expandedConvoy, setExpandedConvoy] = useState(null);
  const [geoError, setGeoError] = useState("");
  const [saving, setSaving] = useState(false);

  const [obPseudo, setObPseudo] = useState("");
  const [obBoat, setObBoat] = useState("");
  const [obLat, setObLat] = useState("");
  const [obLon, setObLon] = useState("");

  const [cvName, setCvName] = useState("");
  const [cvRdv, setCvRdv] = useState("");
  const [cvRdvLat, setCvRdvLat] = useState(null);
  const [cvRdvLon, setCvRdvLon] = useState(null);
  const [cvDeparture, setCvDeparture] = useState("");
  const [cvDest, setCvDest] = useState("");
  const [cvDestLat, setCvDestLat] = useState(null);
  const [cvDestLon, setCvDestLon] = useState(null);
  const [cvEta, setCvEta] = useState("");const [pickTarget, setPickTarget] = useState(null); // "rdv" | "dest" | null
  const cvDepartureRef = useRef(null);
  const cvEtaRef = useRef(null);

  // Étapes intermédiaires du convoi (escales entre le RDV et la destination) : chacune a un
  // libellé géocodé + coordonnées, et une date estimée de passage optionnelle.
  const [cvStages, setCvStages] = useState([]); // [{ label, lat, lon, etaAt }]
  const [cvStageText, setCvStageText] = useState("");
  const [cvStageSuggestions, setCvStageSuggestions] = useState([]);
  const [cvStageSuggestLoading, setCvStageSuggestLoading] = useState(false);
  const stageGeoTimer = useRef(null);

  // Suggestions d'adresse (géocodage) pour les champs RDV/destination du formulaire de convoi.
  const [rdvSuggestions, setRdvSuggestions] = useState([]);
  const [destSuggestions, setDestSuggestions] = useState([]);
  const [rdvSuggestLoading, setRdvSuggestLoading] = useState(false);
  const [destSuggestLoading, setDestSuggestLoading] = useState(false);
  const rdvGeoTimer = useRef(null);
  const destGeoTimer = useRef(null);

  const [showImportPicker, setShowImportPicker] = useState(false);
  const [importedWaypoints, setImportedWaypoints] = useState([]);
  const [importTarget, setImportTarget] = useState(null);
  const fileInputRef = useRef(null);

  const [gpsTracking, setGpsTracking] = useState(false);
  const watchIdRef = useRef(null);
  const lastPublishRef = useRef(0);

  const chatEndRef = useRef(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      // Supabase établit une session temporaire quand on clique sur le lien "mot de passe
      // oublié" reçu par e-mail — on bloque alors l'app sur l'écran "nouveau mot de passe".
      if (_event === "PASSWORD_RECOVERY") setPasswordRecovery(true);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const sendPasswordReset = async () => {
    setAuthError("");
    setResetSent(false);
    if (!loginEmail.trim()) { setAuthError("Indique ton adresse e-mail ci-dessus d'abord."); return; }
    const { error } = await supabase.auth.resetPasswordForEmail(loginEmail.trim(), {
      redirectTo: window.location.origin,
    });
    if (error) setAuthError(error.message);
    else setResetSent(true);
  };

  const updatePasswordAfterRecovery = async () => {
    setRecoveryError("");
    if (!newPassword1 || newPassword1.length < 6) { setRecoveryError("Le mot de passe doit faire au moins 6 caractères."); return; }
    if (newPassword1 !== newPassword2) { setRecoveryError("Les deux mots de passe ne correspondent pas."); return; }
    const { error } = await supabase.auth.updateUser({ password: newPassword1 });
    if (error) setRecoveryError(error.message);
    else {
      setRecoveryDone(true);
      setNewPassword1("");
      setNewPassword2("");
    }
  };

  const sendMagicLink = async () => {
    setAuthError("");
    if (!loginEmail.trim()) return;
    const { error } = await supabase.auth.signInWithOtp({
      email: loginEmail.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) setAuthError(error.message);
    else setLinkSent(true);
  };

  const verifyCode = async () => {
    setAuthError("");
    if (!otpCode.trim()) return;
    const { error } = await supabase.auth.verifyOtp({
      email: loginEmail.trim(),
      token: otpCode.trim(),
      type: "email",
    });
    if (error) setAuthError(error.message);
  };

  const signInPassword = async () => {
    setAuthError("");
    setPwInfo("");
    if (!loginEmail.trim() || !loginPassword) return;
    const { error } = await supabase.auth.signInWithPassword({
      email: loginEmail.trim(),
      password: loginPassword,
    });
    if (error) setAuthError(error.message);
  };

  const signUpPassword = async () => {
    setAuthError("");
    setPwInfo("");
    if (!loginEmail.trim() || !loginPassword) return;
    const { data, error } = await supabase.auth.signUp({
      email: loginEmail.trim(),
      password: loginPassword,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) setAuthError(error.message);
    else if (!data.session) setPwInfo("Compte créé — vérifie tes e-mails pour confirmer ton adresse avant de te connecter.");
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setPos(null);
    setBoats({});
  };

  useEffect(() => {
    (async () => {
      try {
  const { data: p } = await supabase
  .from("profiles")
  .select("*")
  .eq("id", session?.user?.id)
  .maybeSingle();
if (p) {
  setProfile({ id: p.id, pseudo: p.pseudo, boatName: p.boat_name, isModerator: !!p.is_moderator });
  if (p.last_lat && p.last_lon) setPos({ lat: p.last_lat, lon: p.last_lon });
}
      } catch (e) {}
      setReady(true);
    })();
  }, [session]);

  // --- Notifications push + e-mail (Resend) ---
  const sendPush = useCallback(async (boatIds, title, body, url) => {
    try {
      const ids = (boatIds || []).filter((id) => id && id !== profile?.id);
      if (ids.length === 0) return;
      await supabase.functions.invoke("send-push", { body: { boatIds: ids, title, body, url } });
      // E-mail via Resend : uniquement les bateaux ayant coché "Recevoir aussi par e-mail"
      // dans leurs préférences (onglet Moi). Envoi best-effort, ne bloque jamais le push.
      const emailIds = ids.filter((id) => boats[id]?.notifyEmail);
      if (emailIds.length) {
        supabase.functions.invoke("send-email", { body: { boatIds: emailIds, title, body, url } }).catch(() => {});
      }
    } catch (e) {}
  }, [profile, boats]);

  const checkPushStatus = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushStatus("indisponible");
      return;
    }
    if (Notification.permission === "denied") {
      setPushStatus("refuse");
      return;
    }
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      setPushStatus(sub ? "actif" : "inactif");
    } catch (e) {
      setPushStatus("inactif");
    }
  }, []);

  useEffect(() => {
    if (profile) checkPushStatus();
  }, [profile, checkPushStatus]);

  const subscribeToPush = async () => {
    if (!profile) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushStatus("indisponible");
      return;
    }
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPushStatus("refuse");
        return;
      }
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }
      const json = sub.toJSON();
      await supabase.from("push_subscriptions").upsert(
        {
          boat_id: profile.id,
          endpoint: json.endpoint,
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
        },
        { onConflict: "endpoint" }
      );
      setPushStatus("actif");
    } catch (e) {
      setPushStatus("inactif");
    }
  };

  const fetchShared = useCallback(async () => {
    try {
      const [boatsRes, alertsRes, chatRes, convoysRes, membersRes, dmsRes] = await Promise.all([
        supabase.from("boats").select("*"),
        supabase.from("alerts").select("*").order("created_at", { ascending: false }).limit(MAX_ALERTS),
        supabase.from("chat_messages").select("*").order("created_at", { ascending: true }).limit(MAX_CHAT),
        supabase.from("convoys").select("*").order("created_at", { ascending: false }).limit(MAX_CONVOYS),
        supabase.from("convoy_members").select("*"),
        // Pas de filtre explicite ici : la RLS sur direct_messages ne laisse chacun voir que
        // les messages où il est expéditeur ou destinataire, donc select("*") est déjà privé.
        supabase.from("direct_messages").select("*").order("created_at", { ascending: true }).limit(MAX_DM),
      ]);

      if (boatsRes.data) {
        const map = {};
        boatsRes.data.forEach((b) => {
          map[b.id] = {
            id: b.id, pseudo: b.pseudo, boatName: b.boat_name, lat: b.lat, lon: b.lon,
            heading: b.heading, status: b.status, updatedAt: new Date(b.updated_at).getTime(),
            alertRadiusKm: b.alert_radius_km === undefined ? DEFAULT_ALERT_RADIUS_KM : b.alert_radius_km,
            // Préférences de notifications push, choisies par chaque utilisateur dans l'onglet
            // "Moi" — true par défaut si jamais réglées (colonnes ajoutées après coup en base).
            notifySpecies: b.notify_species === false ? false : true,
            notifyConvoys: b.notify_convoys === false ? false : true,
            notifyConvoyActivity: b.notify_convoy_activity === false ? false : true,
            notifyMessages: b.notify_messages === false ? false : true,
            // E-mail (Resend) : contrairement au push, c'est un opt-in — false par défaut.
            notifyEmail: !!b.notify_email,
          };
        });
        setBoats(map);
      }

      if (alertsRes.data) {
        setAlerts(alertsRes.data.map((a) => ({
          id: a.id, authorId: a.author_id, author: a.author, boatName: a.boat_name,
          lat: a.lat, lon: a.lon, count: a.count, notes: a.notes, incident: !!a.incident, createdAt: new Date(a.created_at).getTime(),
          species: a.species || "orque",
        })));
      }

      if (chatRes.data) {
        setChat(chatRes.data.map((m) => ({
          id: m.id, author: m.author, boatName: m.boat_name, text: m.text, createdAt: new Date(m.created_at).getTime(),
        })));
      }

      if (dmsRes.data) {
        setDms(dmsRes.data.map((m) => ({
          id: m.id, fromId: m.from_id, toId: m.to_id, fromPseudo: m.from_pseudo, fromBoatName: m.from_boat_name,
          text: m.text, createdAt: new Date(m.created_at).getTime(),
        })));
      }

      if (convoysRes.data) {
        const membersByConvoy = {};
        (membersRes.data || []).forEach((m) => {
          (membersByConvoy[m.convoy_id] ||= []).push({ boatId: m.boat_id, pseudo: m.pseudo, boatName: m.boat_name, status: m.status });
        });
        setConvoys(convoysRes.data.map((cv) => ({
          id: cv.id, name: cv.name, organizerId: cv.organizer_id, organizerPseudo: cv.organizer_pseudo, organizerBoat: cv.organizer_boat,
          rdvLabel: cv.rdv_label, rdvLat: cv.rdv_lat, rdvLon: cv.rdv_lon, departureAt: cv.departure_at,
          destLabel: cv.dest_label, destLat: cv.dest_lat, destLon: cv.dest_lon, etaAt: cv.eta_at,
          waypoints: Array.isArray(cv.waypoints) ? cv.waypoints : [],
          createdAt: new Date(cv.created_at).getTime(),
          members: membersByConvoy[cv.id] || [],
        })));
      }
    } catch (e) {
      console.error("fetchShared error:", e);
    }
  }, []);

  useEffect(() => {
    if (!profile) return;
    fetchShared();
    const id = setInterval(fetchShared, POLL_MS);
    return () => clearInterval(id);
  }, [profile, fetchShared]);

  useEffect(() => {
    if (tab === "chat" && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chat, dms, activeDmPeerId, tab]);

  // --- Trace : on ajoute un point par bateau (moi + les autres) à chaque nouvelle position connue ---
  useEffect(() => {
    const nowT = Date.now();
    setTrails((prev) => {
      let changed = false;
      const next = { ...prev };
      Object.values(boats).forEach((b) => {
        if (b.lat == null || b.lon == null) return;
        const list = next[b.id] ? [...next[b.id]] : [];
        const last = list[list.length - 1];
        if (!last || last.lat !== b.lat || last.lon !== b.lon) {
          list.push({ lat: b.lat, lon: b.lon, t: b.updatedAt || nowT });
          changed = true;
        }
        next[b.id] = list.filter((p) => nowT - p.t < TRAIL_MAX_AGE_MS).slice(-TRAIL_MAX_POINTS);
      });
      return changed ? next : prev;
    });
  }, [boats]);

  const publishMe = useCallback(
    async (overrides = {}) => {
      if (!profile || !pos) return;
      setSaving(true);
      try {
        const lat = overrides.lat ?? pos.lat;
        const lon = overrides.lon ?? pos.lon;
        const headingVal = heading === "" ? null : Number(heading);
        const { error } = await supabase.from("boats").upsert({
          id: profile.id,
          pseudo: profile.pseudo,
          boat_name: profile.boatName,
          lat, lon,
          heading: headingVal,
          status,
          updated_at: new Date().toISOString(),
        });
        if (!error) {
          setBoats((prev) => ({
            ...prev,
            [profile.id]: {
              id: profile.id, pseudo: profile.pseudo, boatName: profile.boatName, lat, lon, heading: headingVal, status, updatedAt: Date.now(),
              alertRadiusKm: prev[profile.id]?.alertRadiusKm ?? DEFAULT_ALERT_RADIUS_KM,
              notifySpecies: prev[profile.id]?.notifySpecies ?? true,
              notifyConvoys: prev[profile.id]?.notifyConvoys ?? true,
              notifyConvoyActivity: prev[profile.id]?.notifyConvoyActivity ?? true,
              notifyMessages: prev[profile.id]?.notifyMessages ?? true,
              notifyEmail: prev[profile.id]?.notifyEmail ?? false,
            },
          }));
        }
      } catch (e) {}
      setSaving(false);
    },
    [profile, pos, heading, status]
  );

  const updateAlertRadius = async (km) => {
    if (!profile) return;
    setBoats((prev) => (prev[profile.id] ? { ...prev, [profile.id]: { ...prev[profile.id], alertRadiusKm: km } } : prev));
    try {
      await supabase.from("boats").update({ alert_radius_km: km }).eq("id", profile.id);
    } catch (e) {}
  };

  // Chaque utilisateur choisit lui-même, dans l'onglet "Moi", quels types de notifications
  // push il reçoit. Stocké par bateau (colonnes notify_species / notify_convoys /
  // notify_convoy_activity sur la table "boats"), donc chacun règle ses propres préférences
  // sans affecter les autres.
  const NOTIFY_PREF_COLUMNS = {
    notifySpecies: "notify_species",
    notifyConvoys: "notify_convoys",
    notifyConvoyActivity: "notify_convoy_activity",
    notifyMessages: "notify_messages",
    notifyEmail: "notify_email",
  };
  const updateNotifyPref = async (field, value) => {
    if (!profile) return;
    setBoats((prev) => (prev[profile.id] ? { ...prev, [profile.id]: { ...prev[profile.id], [field]: value } } : prev));
    try {
      await supabase.from("boats").update({ [NOTIFY_PREF_COLUMNS[field]]: value }).eq("id", profile.id);
    } catch (e) {}
  };

  useEffect(() => {
    if (profile && pos) publishMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  // Message d'erreur détaillé selon le code retourné par l'API de géolocalisation,
  // pour que l'utilisateur sache exactement quoi corriger (permission / signal / délai).
  const geoErrorMessage = (err) => {
    if (err && err.code === 1) return "Localisation bloquée : autorise l'accès à la position dans les réglages du navigateur (icône cadenas/site à côté de l'URL), puis réessaie.";
    if (err && err.code === 2) return "Position indisponible : signal GPS trop faible. Réessaie près d'une fenêtre ou en extérieur, ou choisis le point sur la carte.";
    if (err && err.code === 3) return "Délai dépassé en cherchant ta position. Réessaie, ou choisis le point directement sur la carte.";
    return "Position refusée. Réessaie ou vérifie l'autorisation de localisation.";
  };

  const useGeolocation = (setLat, setLon) => {
    setGeoError("");
    if (!navigator.geolocation) {
      setGeoError("La géolocalisation n'est pas disponible sur cet appareil.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLat(p.coords.latitude.toFixed(5));
        setLon(p.coords.longitude.toFixed(5));
      },
      (err) => setGeoError(geoErrorMessage(err) || "Position refusée. Saisis tes coordonnées manuellement."),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );
  };

  // --- Import GPX : lit un fichier exporté depuis OpenCPN, Navionics, Garmin, etc. ---
  const triggerImport = (target) => {
    setImportTarget(target);
    fileInputRef.current?.click();
  };

  const handleGPXFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let list = [];
      try {
        const xml = new DOMParser().parseFromString(String(reader.result), "application/xml");
        if (!xml.querySelector("parsererror")) {
          list = Array.from(xml.getElementsByTagName("wpt"))
            .map((el) => ({
              lat: parseFloat(el.getAttribute("lat")),
              lon: parseFloat(el.getAttribute("lon")),
              name: el.getElementsByTagName("name")[0]?.textContent?.trim() || "Point",
            }))
            .filter((w) => Number.isFinite(w.lat) && Number.isFinite(w.lon));
        }
      } catch (err) {}
      setImportedWaypoints(list);
      setShowImportPicker(true);
    };
    reader.readAsText(file);
  };

  // Ouvre automatiquement le détail d'un convoi si on arrive via un lien de partage
  // (ex : routedesorques.fr/?convoi=ID), et nettoie l'URL ensuite.
  useEffect(() => {
    if (!profile) return;
    const params = new URLSearchParams(window.location.search);
    const convoyId = params.get("convoi");
    if (convoyId) {
      setTab("convois");
      setExpandedConvoy(convoyId);
      window.history.replaceState({}, "", window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);
  const applyImportedWaypoint = (w) => {
    if (importTarget === "onboarding") {
      setObLat(w.lat.toFixed(5));
      setObLon(w.lon.toFixed(5));
    } else if (importTarget === "profile" && pos) {
      updatePosition(w.lat, w.lon);
    } else if (importTarget === "convoy-rdv") {
      setCvRdvLat(w.lat);
      setCvRdvLon(w.lon);
      if (!cvRdv.trim()) setCvRdv(w.name);
    } else if (importTarget === "convoy-dest") {
      setCvDestLat(w.lat);
      setCvDestLon(w.lon);
      if (!cvDest.trim()) setCvDest(w.name);
    }
    setShowImportPicker(false);
    setImportTarget(null);
  };

  const renderHiddenFileInput = () => (
    <input ref={fileInputRef} type="file" accept=".gpx,application/gpx+xml" onChange={handleGPXFile} style={{ display: "none" }} />  );

  const renderImportModal = () =>
    showImportPicker && (
      <div className="fixed inset-0 flex items-end justify-center z-50" style={{ background: "rgba(0,0,0,0.6)" }}>
        <div className="w-full max-w-sm rounded-t-xl p-5" style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, maxHeight: "70vh", overflowY: "auto" }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-sm" style={{ color: COLORS.text, fontFamily: "Oswald, sans-serif" }}>POINTS DU FICHIER GPX</h3>
            <button onClick={() => setShowImportPicker(false)}><X size={18} style={{ color: COLORS.muted }} /></button>
          </div>
          {importedWaypoints.length === 0 ? (
            <p className="text-sm" style={{ color: COLORS.muted }}>Aucun point exploitable trouvé dans ce fichier GPX.</p>
          ) : (
            <div className="space-y-2">
              {importedWaypoints.map((w, i) => (
                <button key={i} onClick={() => applyImportedWaypoint(w)} className="w-full text-left px-3 py-2 rounded text-sm" style={inputStyle}>
                  <span style={{ color: COLORS.text }}>{w.name}</span>
                  <span className="block text-xs mt-0.5" style={{ color: COLORS.muted, fontFamily: "JetBrains Mono, monospace" }}>
                    {w.lat.toFixed(5)}, {w.lon.toFixed(5)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );

  const toggleTracking = () => {
    if (gpsTracking) {
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
      setGpsTracking(false);
      return;
    }
    if (!navigator.geolocation) {
      setGeoError("La géolocalisation n'est pas disponible sur cet appareil.");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const lat = p.coords.latitude;
        const lon = p.coords.longitude;
        setPos({ lat, lon });
        const t = Date.now();
        if (t - lastPublishRef.current < 20000) return;
        lastPublishRef.current = t;
        const updatedProfile = { ...profile, lastLat: lat, lastLon: lon };
        setProfile(updatedProfile);
        storage.set("profile", JSON.stringify(updatedProfile), false).catch(() => {});
        publishMe({ lat, lon });
      },
      () => setGeoError("Suivi GPS refusé ou indisponible sur cet appareil."),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
    watchIdRef.current = id;
    setGpsTracking(true);
  };

  useEffect(() => {
    return () => {
      if (watchIdRef.current != null && navigator.geolocation) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []);

  const completeOnboarding = async () => {
    const lat = parseFloat(obLat);
    const lon = parseFloat(obLon);
    if (!obPseudo.trim() || !obBoat.trim() || Number.isNaN(lat) || Number.isNaN(lon)) return;
    const p = { id: session.user.id, pseudo: obPseudo.trim(), boatName: obBoat.trim(), lastLat: lat, lastLon: lon };
  try {
  await supabase.from("profiles").upsert({
    id: p.id,
    pseudo: p.pseudo,
    boat_name: p.boatName,
    last_lat: lat,
    last_lon: lon,
  });
} catch (e) {}
    setProfile(p);
    setPos({ lat, lon });
  };

  const updatePosition = async (lat, lon) => {
    setPos({ lat, lon });
    const p = { ...profile, lastLat: lat, lastLon: lon };
    setProfile(p);
    try {
      await storage.set("profile", JSON.stringify(p), false);
    } catch (e) {}
    setTimeout(() => publishMe({ lat, lon }), 50);
  };

  const leaveRoute = async () => {
    try {
      if (profile) {
        await supabase.from("boats").delete().eq("id", profile.id);
        await storage.delete("profile", false).catch(() => {});
      }
    } catch (e) {}
    setProfile(null);
    setPos(null);
    setBoats({});
  };

  const openAlertForm = () => {
    setEditingAlertId(null);
    setAlertLat(pos?.lat ?? null);
    setAlertLon(pos?.lon ?? null);
    setAlertCount("1");
    setAlertNotes("");
    setAlertIncident(false);
    setAlertSpecies("orque");
    setShowAlertForm(true);
  };

  const openEditAlertForm = (a) => {
    setEditingAlertId(a.id);
    setAlertLat(a.lat);
    setAlertLon(a.lon);
    setAlertCount(String(a.count));
    setAlertNotes(a.notes || "");
    setAlertIncident(!!a.incident);
    setAlertSpecies(a.species || "orque");
    setShowAlertForm(true);
  };

  const deleteAlert = async (id) => {
    if (!window.confirm("Supprimer ce signalement ?")) return;
    try {
      let query = supabase.from("alerts").delete({ count: "exact" }).eq("id", id);
      if (!profile.isModerator) query = query.eq("author_id", profile.id);
      const { error, count } = await query;
      if (error || !count) {
        window.alert("Impossible de supprimer ce signalement. La suppression n'est peut-être pas encore autorisée côté Supabase (policy manquante sur la table alerts) — réessaie plus tard ou préviens le développeur.");
        return;
      }
      setAlerts((prev) => prev.filter((a) => a.id !== id));
    } catch (e) {
      window.alert("Impossible de supprimer ce signalement (erreur réseau).");
    }
  };

  const refreshPosition = () => {
    setGeoError("");
    if (!navigator.geolocation) {
      setGeoError("La géolocalisation n'est pas disponible sur cet appareil.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => updatePosition(p.coords.latitude, p.coords.longitude),
      (err) => setGeoError(geoErrorMessage(err)),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );
  };

  const locateForAlert = () => {
    setGeoError("");
    if (!navigator.geolocation) {
      setGeoError("La géolocalisation n'est pas disponible sur cet appareil.");
      return;
    }
    setAlertLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setAlertLat(p.coords.latitude);
        setAlertLon(p.coords.longitude);
        setAlertLocating(false);
      },
      (err) => {
        setGeoError(geoErrorMessage(err));
        setAlertLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );
  };

  const addAlert = async () => {
    const lat = alertLat ?? pos?.lat;
    const lon = alertLon ?? pos?.lon;
    if (lat == null || lon == null) return;
    const count = parseInt(alertCount, 10);
    if (!count || count < 1) return;
    setSaving(true);
    try {
      const sp = speciesInfo(alertSpecies);

      if (editingAlertId) {
        // Modification d'un signalement existant : pas de nouvelle notification push, juste une mise à jour.
        let updateQuery = supabase
          .from("alerts")
          .update({ lat, lon, count, notes: alertNotes.trim(), incident: alertIncident, species: alertSpecies })
          .eq("id", editingAlertId);
        if (!profile.isModerator) updateQuery = updateQuery.eq("author_id", profile.id);
        const { data, error } = await updateQuery.select().single();
        if (error) {
          window.alert(`Impossible de modifier ce signalement : ${error.message}`);
          setSaving(false);
          return;
        }
        if (data) {
          setAlerts((prev) => prev.map((a) => (a.id === editingAlertId ? {
            ...a, lat: data.lat, lon: data.lon, count: data.count, notes: data.notes, incident: !!data.incident, species: data.species || alertSpecies,
          } : a)));
        }
      } else {
        const { data, error } = await supabase
          .from("alerts")
          .insert({ author_id: profile.id, author: profile.pseudo, boat_name: profile.boatName, lat, lon, count, notes: alertNotes.trim(), incident: alertIncident, species: alertSpecies })
          .select()
          .single();
        if (error) {
          window.alert(`Impossible d'enregistrer ce signalement : ${error.message}`);
          setSaving(false);
          return;
        }
        if (data) {
          const entry = {
            id: data.id, authorId: data.author_id, author: data.author, boatName: data.boat_name,
            lat: data.lat, lon: data.lon, count: data.count, notes: data.notes, incident: !!data.incident, createdAt: new Date(data.created_at).getTime(),
            species: data.species || alertSpecies,
          };
          setAlerts((prev) => [entry, ...prev].slice(0, MAX_ALERTS));
        }

        const animalLabel = count > 1 ? sp.labelPlural : sp.label.toLowerCase();
        const myConvoyNow = convoys.find((cv) => cv.members.some((m) => m.boatId === profile.id && m.status === "confirme"));
        // Ne notifie que les bateaux qui ont choisi de recevoir ce type de notification
        // (réglage personnel dans l'onglet "Moi" → notifySpecies).
        const memberIds = myConvoyNow
          ? myConvoyNow.members.filter((m) => m.status === "confirme" && boats[m.boatId]?.notifySpecies !== false).map((m) => m.boatId)
          : [];
        if (memberIds.length) {
          sendPush(memberIds, `${sp.emoji} ${sp.pushTitle}`, `${profile.pseudo} a signalé ${count} ${animalLabel} près de votre convoi`, "/");
        }

        // Notifie aussi tous les autres bateaux dont le rayon d'alerte personnalisé couvre
        // la position du signalement (rayon "illimité" = null → toujours notifié) et qui ont
        // choisi de recevoir ce type de notification.
        const memberIdSet = new Set(myConvoyNow ? myConvoyNow.members.filter((m) => m.status === "confirme").map((m) => m.boatId) : []);
        const nearbyIds = Object.values(boats)
          .filter((b) => b.id !== profile.id && !memberIdSet.has(b.id) && b.lat != null && b.lon != null && b.notifySpecies !== false)
          .filter((b) => (b.alertRadiusKm == null ? true : distanceKm(lat, lon, b.lat, b.lon) <= b.alertRadiusKm))
          .map((b) => b.id);
        if (nearbyIds.length) {
          sendPush(nearbyIds, `${sp.emoji} ${sp.pushTitle}`, `${profile.pseudo} a signalé ${count} ${animalLabel} dans ta zone de navigation`, "/");
        }
      }

      setAlertCount("");
      setAlertNotes("");
      setAlertIncident(false);
      setAlertSpecies("orque");
      setEditingAlertId(null);
      setAlertLat(null);
      setAlertLon(null);
      setShowAlertForm(false);
      setShowLayersMenu(false);
      setTab("alerts");
    } catch (e) {
      window.alert(`Erreur inattendue lors de l'enregistrement : ${e?.message || e}`);
    }
    setSaving(false);
  };

  const sendMessage = async () => {
    const text = chatText.trim();
    if (!text || !profile) return;
    setChatText("");
    try {
      const { data, error } = await supabase
        .from("chat_messages")
        .insert({ author_id: profile.id, author: profile.pseudo, boat_name: profile.boatName, text })
        .select()
        .single();
      if (!error && data) {
        const entry = { id: data.id, author: data.author, boatName: data.boat_name, text: data.text, createdAt: new Date(data.created_at).getTime() };
        setChat((prev) => [...prev, entry].slice(-MAX_CHAT));
      }
    } catch (e) {}
  };

  // Ouvre (ou crée) le fil de messages privés avec un autre utilisateur — utilisé depuis les
  // boutons "Contacter" (membres/organisateur d'un convoi) pour s'organiser en dehors du canal
  // général, et bascule directement sur l'onglet Chat, sur ce fil.
  const openDmWith = (boatId) => {
    if (!boatId || boatId === profile.id) return;
    setActiveDmPeerId(boatId);
    setShowLayersMenu(false);
    setTab("chat");
  };

  const sendDirectMessage = async () => {
    const text = dmText.trim();
    if (!text || !profile || !activeDmPeerId) return;
    setDmText("");
    try {
      const { data, error } = await supabase
        .from("direct_messages")
        .insert({ from_id: profile.id, to_id: activeDmPeerId, from_pseudo: profile.pseudo, from_boat_name: profile.boatName, text })
        .select()
        .single();
      if (!error && data) {
        const entry = {
          id: data.id, fromId: data.from_id, toId: data.to_id, fromPseudo: data.from_pseudo, fromBoatName: data.from_boat_name,
          text: data.text, createdAt: new Date(data.created_at).getTime(),
        };
        setDms((prev) => [...prev, entry].slice(-MAX_DM));
        // Respecte la préférence du destinataire (onglet "Moi" → notifyMessages).
        if (boats[activeDmPeerId]?.notifyMessages !== false) {
          sendPush([activeDmPeerId], `💬 Message de ${profile.pseudo}`, text, "/");
        }
      }
    } catch (e) {}
  };

  // --- Convois : la confirmation est verrouillée côté base (RLS), pas seulement côté écran ---
  const createConvoy = async () => {
    if (!cvName.trim() || !pos) return;
    setSaving(true);
    try {
      const rdvLat = cvRdvLat ?? pos.lat;
      const rdvLon = cvRdvLon ?? pos.lon;
      const { data: cv, error } = await supabase
        .from("convoys")
        .insert({
          name: cvName.trim(),
          organizer_id: profile.id,
          organizer_pseudo: profile.pseudo,
          organizer_boat: profile.boatName,
          rdv_label: cvRdv.trim(),
          rdv_lat: rdvLat,
          rdv_lon: rdvLon,
          departure_at: cvDeparture || null,
          dest_label: cvDest.trim(),
          dest_lat: cvDestLat,
          dest_lon: cvDestLon,
          eta_at: cvEta || null,
          waypoints: cvStages,
        })
        .select()
        .single();
      if (!error && cv) {
        // L'organisateur s'insère lui-même en "en_attente" (seule valeur autorisée à
        // l'insertion) puis se confirme aussitôt — il est bien le seul à pouvoir le faire.
        await supabase.from("convoy_members").insert({ convoy_id: cv.id, boat_id: profile.id, pseudo: profile.pseudo, boat_name: profile.boatName, status: "en_attente" });
        await supabase.from("convoy_members").update({ status: "confirme" }).eq("convoy_id", cv.id).eq("boat_id", profile.id);
        await fetchShared();
        setExpandedConvoy(cv.id);

        const NEARBY_KM = 30;
        const nearbyIds = Object.values(boats)
          .filter((b) => b.id !== profile.id && b.lat != null && b.lon != null && b.notifyConvoys !== false)
          .filter((b) => distanceKm(rdvLat, rdvLon, b.lat, b.lon) <= NEARBY_KM)
          .map((b) => b.id);
        sendPush(nearbyIds, "Nouveau convoi près de toi", `${profile.pseudo} organise "${cv.name}"`, "/");
      }
      setCvName(""); setCvRdv(""); setCvRdvLat(null); setCvRdvLon(null);
      setCvDeparture(""); setCvDest(""); setCvDestLat(null); setCvDestLon(null); setCvEta("");
      setCvStages([]); setCvStageText(""); setCvStageSuggestions([]);
      setShowConvoyForm(false);
      setShowLayersMenu(false);
      setTab("convois");
    } catch (e) {}
    setSaving(false);
  };

  const handlePickLocation = (lat, lon) => {
  if (pickTarget === "rdv") { setCvRdvLat(lat); setCvRdvLon(lon); }
  if (pickTarget === "dest") { setCvDestLat(lat); setCvDestLon(lon); }
  if (pickTarget === "alert") { setAlertLat(lat); setAlertLon(lon); }
  const wasAlert = pickTarget === "alert";
  setPickTarget(null);
  if (wasAlert) {
    setShowAlertForm(true);
  } else {
    setShowConvoyForm(true);
    setShowLayersMenu(false);
    setTab("convois");
  }
};

const startPicking = (target) => {
  setPickTarget(target);
  setShowConvoyForm(false);
  setShowAlertForm(false);
  setShowLayersMenu(false);
  setTab("carte");
};const openConvoyForm = () => {
    setCvRdvLat(pos?.lat ?? null);
    setCvRdvLon(pos?.lon ?? null);
    setRdvSuggestions([]);
    setDestSuggestions([]);
    setShowConvoyForm(true);
  };

  // Géocodage (Nominatim/OpenStreetMap, gratuit, sans clé) pour proposer des lieux au fil de la
  // saisie dans les champs RDV/destination du formulaire de convoi. Un mot générique comme
  // "puerto" remonte des centaines de résultats sur toute la façade Brest → Gibraltar (chaque
  // résultat tombe bien dans cette zone, mais celle-ci est bien trop large pour être utile) :
  // on resserre donc la recherche (viewbox stricte + tri par distance) autour d'un point de
  // référence — l'autre point déjà choisi dans le formulaire (RDV pour la destination et
  // inversement), ou à défaut la position actuelle du bateau — dès qu'on en a un.
  const PORT_OSM_TYPES = new Set(["marina", "harbour", "port", "yacht_club", "slipway", "dock", "boatyard"]);
  const geocodeSearch = async (query, refPoint) => {
    const q = query.trim();
    if (!q || q.length < 3) return [];
    try {
      // bounded=0 partout : le viewbox n'est qu'une préférence de tri pour Nominatim, jamais un
      // filtre strict — un point de référence proche (RDV/étape précédente) resserre la zone
      // "préférée", mais une destination légitimement plus lointaine (ex. Bilbao -> La Corogne,
      // ~500 km) ne doit jamais être exclue des résultats. Le tri par distance côté client
      // (plus bas) fait le travail de mise en avant du plus proche, sans jamais rien masquer.
      const box = refPoint
        ? `${refPoint.lon - 3},${refPoint.lat + 3},${refPoint.lon + 3},${refPoint.lat - 3}`
        : "-10,50,0,34";
      const fetchOne = async (text) => {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(text)}&limit=8&addressdetails=0&viewbox=${box}&bounded=0`;
        const res = await fetch(url, { headers: { Accept: "application/json" } });
        if (!res.ok) return [];
        return (await res.json()) || [];
      };
      const [marinaResults, plainResults] = await Promise.all([fetchOne(`marina ${q}`), fetchOne(q)]);
      const seen = new Set();
      const merged = [];
      [...marinaResults, ...plainResults].forEach((d) => {
        const key = `${Math.round(parseFloat(d.lat) * 500)},${Math.round(parseFloat(d.lon) * 500)}`;
        if (seen.has(key)) return;
        seen.add(key);
        merged.push(d);
      });
      // Avec un point de référence : le plus proche d'abord (au-delà de 5 km d'écart, sinon on
      // laisse les vrais points portuaires/marinas remonter en tête comme avant).
      merged.sort((a, b) => {
        if (refPoint) {
          const distA = distanceKm(refPoint.lat, refPoint.lon, parseFloat(a.lat), parseFloat(a.lon));
          const distB = distanceKm(refPoint.lat, refPoint.lon, parseFloat(b.lat), parseFloat(b.lon));
          if (Math.abs(distA - distB) > 5) return distA - distB;
        }
        return (PORT_OSM_TYPES.has(a.type) ? 0 : 1) - (PORT_OSM_TYPES.has(b.type) ? 0 : 1);
      });
      return merged.slice(0, 6).map((d) => ({
        label: d.display_name, lat: parseFloat(d.lat), lon: parseFloat(d.lon), isPort: PORT_OSM_TYPES.has(d.type),
      }));
    } catch (e) {
      return [];
    }
  };

  const onRdvTextChange = (value) => {
    setCvRdv(value);
    if (rdvGeoTimer.current) clearTimeout(rdvGeoTimer.current);
    if (value.trim().length < 3) { setRdvSuggestions([]); return; }
    setRdvSuggestLoading(true);
    const refPoint = (cvDestLat != null && cvDestLon != null) ? { lat: cvDestLat, lon: cvDestLon }
      : pos ? { lat: pos.lat, lon: pos.lon } : null;
    rdvGeoTimer.current = setTimeout(async () => {
      const results = await geocodeSearch(value, refPoint);
      setRdvSuggestions(results);
      setRdvSuggestLoading(false);
    }, 450);
  };

  const onDestTextChange = (value) => {
    setCvDest(value);
    if (destGeoTimer.current) clearTimeout(destGeoTimer.current);
    if (value.trim().length < 3) { setDestSuggestions([]); return; }
    setDestSuggestLoading(true);
    const refPoint = (cvRdvLat != null && cvRdvLon != null) ? { lat: cvRdvLat, lon: cvRdvLon }
      : pos ? { lat: pos.lat, lon: pos.lon } : null;
    destGeoTimer.current = setTimeout(async () => {
      const results = await geocodeSearch(value, refPoint);
      setDestSuggestions(results);
      setDestSuggestLoading(false);
    }, 450);
  };

  const pickRdvSuggestion = (s) => {
    setCvRdv(s.label);
    setCvRdvLat(s.lat);
    setCvRdvLon(s.lon);
    setRdvSuggestions([]);
  };

  const pickDestSuggestion = (s) => {
    setCvDest(s.label);
    setCvDestLat(s.lat);
    setCvDestLon(s.lon);
    setDestSuggestions([]);
  };

  // Étapes du convoi : recherche biaisée sur la dernière étape déjà ajoutée (ou le RDV, ou la
  // position actuelle), même logique que pour RDV/destination.
  const onStageTextChange = (value) => {
    setCvStageText(value);
    if (stageGeoTimer.current) clearTimeout(stageGeoTimer.current);
    if (value.trim().length < 3) { setCvStageSuggestions([]); return; }
    setCvStageSuggestLoading(true);
    const last = cvStages[cvStages.length - 1];
    const refPoint = last ? { lat: last.lat, lon: last.lon }
      : (cvRdvLat != null && cvRdvLon != null) ? { lat: cvRdvLat, lon: cvRdvLon }
      : pos ? { lat: pos.lat, lon: pos.lon } : null;
    stageGeoTimer.current = setTimeout(async () => {
      const results = await geocodeSearch(value, refPoint);
      setCvStageSuggestions(results);
      setCvStageSuggestLoading(false);
    }, 450);
  };

  const addStage = (s) => {
    setCvStages((prev) => [...prev, { label: s.label, lat: s.lat, lon: s.lon, etaAt: null }]);
    setCvStageText("");
    setCvStageSuggestions([]);
  };

  const removeStage = (index) => {
    setCvStages((prev) => prev.filter((_, i) => i !== index));
  };

  const setStageEta = (index, value) => {
    setCvStages((prev) => prev.map((s, i) => (i === index ? { ...s, etaAt: value || null } : s)));
  };

  const requestJoin = async (convoyId) => {
    try {
      await supabase.from("convoy_members").insert({ convoy_id: convoyId, boat_id: profile.id, pseudo: profile.pseudo, boat_name: profile.boatName, status: "en_attente" });
      await fetchShared();
      const cv = convoys.find((c) => c.id === convoyId);
      if (cv && boats[cv.organizerId]?.notifyConvoyActivity !== false) {
        sendPush([cv.organizerId], "Nouvelle demande de convoi", `${profile.pseudo} demande à rejoindre "${cv.name}"`, "/");
      }
    } catch (e) {}
  };

  const respondRequest = async (convoyId, boatId, accept) => {
    try {
      if (accept) {
        await supabase.from("convoy_members").update({ status: "confirme" }).eq("convoy_id", convoyId).eq("boat_id", boatId);
      } else {
        await supabase.from("convoy_members").delete().eq("convoy_id", convoyId).eq("boat_id", boatId);
      }
      await fetchShared();
      if (accept && boats[boatId]?.notifyConvoyActivity !== false) {
        const cv = convoys.find((c) => c.id === convoyId);
        sendPush([boatId], "Demande acceptée", `Tu as rejoint le convoi "${cv?.name || ""}"`, "/");
      }
    } catch (e) {}
  };

  const leaveConvoy = async (convoyId) => {
    try {
      const cv = convoys.find((c) => c.id === convoyId);
      if (cv && cv.organizerId === profile.id) {
        await supabase.from("convoys").delete().eq("id", convoyId); // supprime aussi les membres (cascade)
      } else {
        await supabase.from("convoy_members").delete().eq("convoy_id", convoyId).eq("boat_id", profile.id);
      }
      await fetchShared();
    } catch (e) {}
  };

  const exportChartGPX = () => {
    if (!pos) return;
    const wpts = [gpxWaypoint(pos.lat, pos.lon, `Moi - ${profile.boatName}`, `${profile.pseudo}`, "Anchor")];
    others.forEach((b) => {
      if (b.stale) return;
      wpts.push(gpxWaypoint(b.lat, b.lon, `${b.pseudo} - ${b.boatName}`, `Statut : ${b.status || "?"}`, "Boat, Sail", b.updatedAt));
    });
    alertsWithDist
      .filter((a) => now - a.createdAt < 6 * 3600 * 1000)
      .forEach((a) => {
        wpts.push(gpxWaypoint(a.lat, a.lon, `Orques (${a.count}) - ${a.author}`, a.notes, "Danger Area", a.createdAt));
      });
    downloadGPX(buildGPX(wpts), `route-des-orques-carte-${Date.now()}.gpx`);
  };

  const exportAlertGPX = (a) => {
    const wpts = [gpxWaypoint(a.lat, a.lon, `Orques (${a.count}) - ${a.author}`, a.notes, "Danger Area", a.createdAt)];
    downloadGPX(buildGPX(wpts), `orques-${a.id}.gpx`);
  };

  const exportConvoyGPX = (cv) => {
    const wpts = [gpxWaypoint(cv.rdvLat, cv.rdvLon, `RDV - ${cv.name}`, `${cv.rdvLabel || ""} · départ ${fmtDateTime(cv.departureAt)}`, "Flag, Blue", cv.createdAt)];
    if (cv.destLat != null && cv.destLon != null) {
      wpts.push(gpxWaypoint(cv.destLat, cv.destLon, `Destination - ${cv.name}`, `${cv.destLabel || ""} · arrivée ${fmtDateTime(cv.etaAt)}`, "Flag, Green", cv.createdAt));
    }
    downloadGPX(buildGPX(wpts), `convoi-${cv.id}.gpx`);
  };

 const shareConvoy = async (cv) => {
    const shareData = {
      title: `Convoi : ${cv.name}`,
      text: `Rejoins le convoi "${cv.name}" sur La Route des Orques !`,
      url: `${window.location.origin}/?convoi=${cv.id}`,
    };
    if (navigator.share) {
      try { await navigator.share(shareData); } catch (e) {}
    } else {
      try {
        await navigator.clipboard.writeText(shareData.url);
        window.alert("Lien du convoi copié dans le presse-papiers !");
      } catch (e) {}
    }
  }; const shareApp = async () => {
    const shareData = {
      title: "La Route des Orques",
      text: "Rejoins-moi sur La Route des Orques pour partager ta position, être alerté des orques et naviguer en convoi avec d'autres plaisanciers !",
      url: "https://routedesorques.fr",
    };
    if (navigator.share) {
      try { await navigator.share(shareData); } catch (e) {}
    } else {
      try {
        await navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`);
        window.alert("Lien copié dans le presse-papiers !");
      } catch (e) {}
    }
  };
  const proposeConvoyViaChat = (boat) => {
    setChatText(`${profile.pseudo} propose de naviguer avec ${boat.pseudo} (${boat.boatName}) — rejoins un convoi dans l'onglet Convois ou on se cale ici.`);
    setShowLayersMenu(false);
    setTab("chat");
  };

  if (!authReady) {    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: COLORS.bg }}>
        <style>{FONTS}</style>
        <Waves className="animate-pulse" size={32} style={{ color: COLORS.cyan }} />
      </div>
    );
  }

  if (passwordRecovery) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 py-10" style={{ background: COLORS.bg, fontFamily: "Inter, sans-serif" }}>
        <style>{FONTS}</style>
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-3 mb-4">
            <Compass size={30} style={{ color: COLORS.orange }} />
            <h1 className="text-2xl font-semibold tracking-wide" style={{ color: COLORS.text, fontFamily: "Oswald, sans-serif" }}>
              LA ROUTE DES ORQUES
            </h1>
          </div>
          <Panel className="p-5 space-y-4">
            {recoveryDone ? (
              <div className="text-center py-3">
                <Check size={28} style={{ color: COLORS.green, marginBottom: 10 }} className="mx-auto" />
                <p className="text-sm mb-3" style={{ color: COLORS.text }}>Mot de passe mis à jour.</p>
                <button onClick={() => setPasswordRecovery(false)} className="w-full py-2.5 rounded font-medium text-sm"
                  style={{ background: COLORS.orange, color: "#1A0E08" }}>
                  Continuer
                </button>
              </div>
            ) : (
              <>
                <p className="text-sm mb-1" style={{ color: COLORS.text }}>Choisis un nouveau mot de passe.</p>
                <Field label="Nouveau mot de passe">
                  <input value={newPassword1} onChange={(e) => setNewPassword1(e.target.value)}
                    placeholder="••••••••" type="password"
                    className="w-full px-3 py-2 rounded outline-none text-sm" style={inputStyle} />
                </Field>
                <Field label="Confirme le mot de passe">
                  <input value={newPassword2} onChange={(e) => setNewPassword2(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && updatePasswordAfterRecovery()}
                    placeholder="••••••••" type="password"
                    className="w-full px-3 py-2 rounded outline-none text-sm" style={inputStyle} />
                </Field>
                {recoveryError && <p className="text-xs" style={{ color: COLORS.orange }}>{recoveryError}</p>}
                <button onClick={updatePasswordAfterRecovery} className="w-full py-2.5 rounded font-medium text-sm"
                  style={{ background: COLORS.orange, color: "#1A0E08" }}>
                  Valider le nouveau mot de passe
                </button>
              </>
            )}
          </Panel>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 py-10" style={{ background: COLORS.bg, fontFamily: "Inter, sans-serif" }}>
        <style>{FONTS}</style>
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-3 mb-2">
            <Compass size={30} style={{ color: COLORS.orange }} />
            <h1 className="text-2xl font-semibold tracking-wide" style={{ color: COLORS.text, fontFamily: "Oswald, sans-serif" }}>
              LA ROUTE DES ORQUES
            </h1>
          </div>
          <p className="text-sm mb-3" style={{ color: COLORS.cyan, fontStyle: "italic" }}>
            {t.slogan}
          </p>
          <p className="text-sm mb-4" style={{ color: COLORS.muted }}>
            {t.loginTagline}
          </p>
          <LangSwitcher lang={lang} setLang={setLang} />

          <div className="flex gap-2 mb-3 mt-3">
            {[["magic", "Lien magique"], ["password", "Mot de passe"]].map(([val, label]) => (
              <button key={val} onClick={() => { setLoginMode(val); setAuthError(""); setPwInfo(""); }}
                className="flex-1 text-xs py-1.5 rounded"
                style={{
                  background: loginMode === val ? COLORS.orangeDim : "transparent",
                  color: loginMode === val ? COLORS.orange : COLORS.muted,
                  border: `1px solid ${loginMode === val ? COLORS.orangeDim : COLORS.border}`,
                }}>
                {label}
              </button>
            ))}
          </div>

          <Panel className="p-5 space-y-4">
            {loginMode === "magic" ? (
              linkSent ? (
                <div className="text-center py-3">
                  <Check size={28} style={{ color: COLORS.green, marginBottom: 10 }} className="mx-auto" />
                  <p className="text-sm" style={{ color: COLORS.text }}>
                    {t.codeSent(loginEmail)}
                  </p>
                  <Field label={t.codeLabel}>
                    <input value={otpCode} onChange={(e) => setOtpCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && verifyCode()}
                      placeholder="12345678" type="text" maxLength={8}
                      className="w-full px-3 py-2 rounded outline-none text-sm text-center" style={inputStyle} />
                  </Field>
                  {authError && <p className="text-xs" style={{ color: COLORS.orange }}>{authError}</p>}
                  <button onClick={verifyCode} className="w-full py-2.5 rounded font-medium text-sm mt-2"
                    style={{ background: COLORS.orange, color: "#1A0E08" }}>
                    {t.validateCode}
                  </button>
                  <button onClick={() => setLinkSent(false)} className="text-xs mt-3" style={{ color: COLORS.cyan }}>
                    {t.useOtherEmail}
                  </button>
                </div>
              ) : (
                <>
                  <Field label={t.emailLabel}>
                    <input value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendMagicLink()}
                      placeholder="toi@exemple.com" type="email"
                      className="w-full px-3 py-2 rounded outline-none text-sm" style={inputStyle} />
                  </Field>
                  {authError && <p className="text-xs" style={{ color: COLORS.orange }}>{authError}</p>}
                  <button onClick={sendMagicLink} className="w-full py-2.5 rounded font-medium text-sm"
                    style={{ background: COLORS.orange, color: "#1A0E08" }}>
                    {t.receiveLink}
                  </button>
                </>
              )
            ) : (
              <>
                <Field label={t.emailLabel}>
                  <input value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="toi@exemple.com" type="email"
                    className="w-full px-3 py-2 rounded outline-none text-sm" style={inputStyle} />
                </Field>
                <Field label="Mot de passe">
                  <input value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (pwSignupMode ? signUpPassword() : signInPassword())}
                    placeholder="••••••••" type="password"
                    className="w-full px-3 py-2 rounded outline-none text-sm" style={inputStyle} />
                </Field>
                {!pwSignupMode && (
                  <div className="text-right">
                    <button onClick={sendPasswordReset} className="text-xs" style={{ color: COLORS.cyan }}>
                      Mot de passe oublié ?
                    </button>
                  </div>
                )}
                {resetSent && <p className="text-xs" style={{ color: COLORS.green }}>E-mail de réinitialisation envoyé — vérifie ta boîte mail et clique sur le lien reçu.</p>}
                {authError && <p className="text-xs" style={{ color: COLORS.orange }}>{authError}</p>}
                {pwInfo && <p className="text-xs" style={{ color: COLORS.green }}>{pwInfo}</p>}
                <button onClick={pwSignupMode ? signUpPassword : signInPassword} className="w-full py-2.5 rounded font-medium text-sm"
                  style={{ background: COLORS.orange, color: "#1A0E08" }}>
                  {pwSignupMode ? "Créer le compte" : "Se connecter"}
                </button>
                <button onClick={() => { setPwSignupMode(!pwSignupMode); setAuthError(""); setPwInfo(""); setResetSent(false); }} className="text-xs mt-1 block mx-auto" style={{ color: COLORS.cyan }}>
                  {pwSignupMode ? "J'ai déjà un compte" : "Pas encore de compte ? Créer un compte"}
                </button>
              </>
            )}
          </Panel>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: COLORS.bg }}>
        <style>{FONTS}</style>
        <Waves className="animate-pulse" size={32} style={{ color: COLORS.cyan }} />
      </div>
    );
  }

   if (!profile) {
    return (
      <div className="relative overflow-hidden" style={{ background: COLORS.bg, fontFamily: "Inter, sans-serif", position: "fixed", inset: 0 }}>
        <style>{FONTS}</style>
        <div className="absolute inset-0">
          <MarineMap
            pos={null}
            others={[]}
            alertsWithDist={[]}
            convoys={[]}
            myConvoyMemberIds={[]}
            now={Date.now()}
            onSelectBoat={() => {}}
            showShipyards={true}
            showRescueStations={true}
            showFishFarms={false}
            pickMode={false}
            onPickLocation={() => {}}
            trails={{}}
            showTrails={false}
            myBoatId={null}
            focusTarget={null}
            mapStyle="street"
          />
        </div>
        <div className="absolute left-0 right-0 z-[1100] flex justify-center px-3" style={{ bottom: 20 }}>
        <div className="w-full max-w-sm rounded-xl p-5" style={{ background: "rgba(34,56,74,0.96)", backdropFilter: "blur(12px)", border: `1px solid ${COLORS.border}`, maxHeight: "78vh", overflowY: "auto" }}>
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-3 mb-2">
            <Compass size={30} style={{ color: COLORS.orange }} />
            <h1 className="text-2xl font-semibold tracking-wide" style={{ color: COLORS.text, fontFamily: "Oswald, sans-serif" }}>
              LA ROUTE DES ORQUES
            </h1>
          </div>
          <p className="text-sm mb-3" style={{ color: COLORS.cyan, fontStyle: "italic" }}>
            {t.slogan}
          </p>
          <p className="text-sm mb-6" style={{ color: COLORS.muted }}>
            {t.onboardingTagline}
          </p>

          <Panel className="p-5 space-y-4">
            <Field label={t.pseudoLabel}>
              <input value={obPseudo} onChange={(e) => setObPseudo(e.target.value)} placeholder="Ex. Yann"
                className="w-full px-3 py-2 rounded outline-none text-sm" style={inputStyle} />
            </Field>
            <Field label={t.boatNameLabel}>
              <input value={obBoat} onChange={(e) => setObBoat(e.target.value)} placeholder="Ex. Albatros II"
                className="w-full px-3 py-2 rounded outline-none text-sm" style={inputStyle} />
            </Field>
                         <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs uppercase tracking-wider" style={{ color: COLORS.muted }}>{t.positionLabel}</label>
                  <div className="flex gap-2">
                    <button onClick={() => useGeolocation(setObLat, setObLon)}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded" style={{ color: COLORS.cyan, border: `1px solid ${COLORS.cyanDim}` }}>
                      <LocateFixed size={13} /> {t.locateMe}
                    </button>
                    <button onClick={() => triggerImport("onboarding")}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded" style={{ color: COLORS.muted, border: `1px solid ${COLORS.border}` }}>
                      <Download size={13} /> GPX
                    </button>
                  </div>
                </div>
                {obLat && obLon && (
                  <p className="text-xs mt-1" style={{ color: COLORS.muted, fontFamily: "JetBrains Mono, monospace" }}>
                    {parseFloat(obLat).toFixed(4)}, {parseFloat(obLon).toFixed(4)}
                  </p>
                )}
                {geoError && <p className="text-xs mt-1" style={{ color: COLORS.orange }}>{geoError}</p>}
              </div>
            <button onClick={completeOnboarding} className="w-full py-2.5 rounded font-medium text-sm mt-2"
              style={{ background: COLORS.orange, color: "#1A0E08" }}>
              {t.joinRoute}
            </button>
            <p className="text-xs leading-relaxed" style={{ color: COLORS.muted }}>
              {t.onboardingDisclaimer}
            </p>
          </Panel>
        </div>            
          </div>
          </div>
          {renderHiddenFileInput()}
        {renderImportModal()}
      </div>
    );
  }

  const now = Date.now();
  const others = Object.values(boats)
    .filter((b) => b.id !== profile.id)
    .map((b) => ({
      ...b,
      dist: pos ? distanceKm(pos.lat, pos.lon, b.lat, b.lon) : null,
      brg: pos ? bearingDeg(pos.lat, pos.lon, b.lat, b.lon) : null,
      stale: now - b.updatedAt > STALE_MS,
    }))
    .sort((a, b) => (a.dist ?? 0) - (b.dist ?? 0));

  const alertsWithDist = alerts
    .filter((a) => visibleSpecies[a.species || "orque"] !== false)
    .map((a) => ({
      ...a,
      dist: pos ? distanceKm(pos.lat, pos.lon, a.lat, a.lon) : null,
      brg: pos ? bearingDeg(pos.lat, pos.lon, a.lat, a.lon) : null,
    }));

  // Fenêtre de visibilité d'un convoi : reste dans les listes/la carte jusqu'à 3 jours après
  // sa date de fin prévue (arrivée, ou départ si pas d'arrivée renseignée). Passé ce délai, il
  // sort automatiquement — sans être supprimé en base (on garde l'historique côté Supabase).
  const isConvoyExpired = (cv) => {
    const endIso = cv.etaAt || cv.departureAt;
    if (!endIso) return false; // pas de date renseignée : jamais masqué automatiquement
    const endTs = new Date(endIso).getTime();
    if (Number.isNaN(endTs)) return false;
    return now - endTs > CONVOY_EXPIRY_BUFFER_MS;
  };
  const visibleConvoys = convoys.filter((cv) => !isConvoyExpired(cv));

  const activeCount = others.filter((b) => !b.stale).length;
  const myConvoy = visibleConvoys.find((cv) => cv.members.some((m) => m.boatId === profile.id && m.status === "confirme"));
  const myConvoyMemberIds = myConvoy ? myConvoy.members.filter((m) => m.status === "confirme").map((m) => m.boatId) : [];

  // Rejoindre un convoi directement depuis son tracé/marqueur sur la carte — même action que
  // le bouton "Demander à rejoindre" de l'onglet Convois. On revérifie l'appartenance ici au
  // cas où l'état aurait changé depuis le dernier rendu de la carte (double-clic, etc.).
  const onJoinConvoy = (convoyId) => {
    const cv = visibleConvoys.find((c) => c.id === convoyId);
    if (!cv || cv.members.some((m) => m.boatId === profile.id)) return;
    requestJoin(convoyId);
  };

  // Le panneau d'onglet (Convois/Observations/Chat/Moi) et le menu "Couches" occupent la même
  // zone en bas de l'écran — les ouvrir en même temps les faisait se chevaucher. On garantit
  // maintenant qu'un seul des deux est ouvert à la fois : ouvrir l'un ferme l'autre.
  const openTab = (name) => {
    setShowLayersMenu(false);
    setTab((prev) => (prev === name ? "carte" : name));
  };
  const toggleLayersMenu = () => {
    setTab("carte");
    setShowLayersMenu((v) => !v);
  };

    return (
   <div className="relative overflow-hidden" style={{ background: COLORS.bg, fontFamily: "Inter, sans-serif", position: "fixed", inset: 0 }}>
      <style>{FONTS}</style>

      {/* Carte marine plein écran, en fond */}
      <div className="absolute inset-0">
        <MarineMap
          pos={pos}
          others={others}
          alertsWithDist={alertsWithDist}
          convoys={visibleConvoys}
          myConvoyMemberIds={myConvoyMemberIds}
          now={now}
          onSelectBoat={setSelectedBoat}
                showShipyards={showShipyards}
                showRescueStations={showRescueStations}
                showFishFarms={showFishFarms}
                pickMode={!!pickTarget}
                onPickLocation={handlePickLocation}
                trails={trails}
                showTrails={showTrails}
                myBoatId={profile.id}
                isModerator={!!profile.isModerator}
                focusTarget={alertFocus}
                mapStyle={mapStyle}
                onSelectPlace={setSelectedPlace}
                onSelectConvoyMarker={setSelectedConvoyMarker}
                onSelectAlert={setSelectedAlert}
              />
      </div>

      {/* Sélecteur de fond de carte : un seul bouton style Google Maps (carte claire + libellé du
          mode vers lequel on bascule), plus visible que l'ancienne paire de pastilles sombres. */}

      {/* Header flottant */}
      <div className="absolute top-0 left-0 right-0 z-[1100] flex items-center justify-between px-4 py-3"
        style={{ background: "rgba(29,58,80,0.82)", backdropFilter: "blur(10px)", borderBottom: `1px solid ${COLORS.border}` }}>
        <div className="flex items-center gap-2">
          <Compass size={22} style={{ color: COLORS.orange }} />
          <span className="font-semibold tracking-wide text-sm" style={{ color: COLORS.text, fontFamily: "Oswald, sans-serif" }}>
            ROUTE DES ORQUES
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-xs" style={{ color: COLORS.green }}>
          <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: COLORS.green }} />
          {t.activeLabel(activeCount)}
        </div>
      </div>

      {/* Chat et Profil ("Moi") : déplacés en haut à gauche, juste sous le bandeau
          "ROUTE DES ORQUES", toujours visibles (comme la barre du bas) plutôt que rangés
          avec les autres onglets en bas. Icônes seules (sans libellé) pour rester compacts
          sur mobile — le nom de l'onglet reste accessible via l'attribut title/aria-label. */}
      <div className="absolute z-[1200] flex flex-col" style={{ top: 72, left: 12, gap: 10 }}>
        <IconBtn onClick={() => openTab("chat")} active={tab === "chat"} label={t.tabChat}><MessageCircle size={20} color="#8C7AE6" /></IconBtn>
        <IconBtn onClick={() => openTab("profile")} active={tab === "profile"} label={t.tabProfile}><Anchor size={20} color={COLORS.orange} /></IconBtn>
      </div>

      {/* Panneau flottant pour les onglets autres que la carte : la carte reste toujours
          visible en fond, ce panneau vient juste se poser par-dessus. Un bouton fermer permet
          d'y revenir directement sans repasser par un onglet "Carte" dédié. */}
      {tab !== "carte" && (
        // bottom relevé : la barre du bas reste compacte (icônes seules) mais on garde une
        // marge confortable pour ne pas chevaucher le panneau.
        <div className="absolute left-0 right-0 z-[1100] flex justify-center px-3" style={{ bottom: 108 }}>
          <div className="w-full flex flex-col rounded-xl overflow-hidden" style={{ maxWidth: 480, maxHeight: "64vh", background: "rgba(37,72,100,0.94)", backdropFilter: "blur(12px)", border: `1px solid ${COLORS.border}` }}>
            <div className="flex items-center justify-between px-4 py-2.5 shrink-0" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
              <span className="text-sm font-semibold tracking-wide" style={{ color: COLORS.text, fontFamily: "Oswald, sans-serif" }}>
                {tab === "convois" ? t.tabConvois : tab === "alerts" ? t.tabAlerts : tab === "chat" ? t.tabChat : t.tabProfile}
              </span>
              <button onClick={() => setTab("carte")} title="Fermer et revenir à la carte"
                className="flex items-center justify-center rounded-full shrink-0"
                style={{ width: 28, height: 28, background: "rgba(255,255,255,0.08)", color: COLORS.text }}>
                <X size={16} />
              </button>
            </div>
            <div className="overflow-y-auto px-4 py-4" style={{ flex: 1 }}>

              {tab === "convois" && (
                <div className="space-y-2">
                  <button onClick={openConvoyForm}
                    className="w-full py-2.5 rounded font-medium text-sm mb-2 flex items-center justify-center gap-2"
                    style={{ background: COLORS.green, color: "#0A1F14" }}>
                    <Plus size={16} /> Créer un convoi
                  </button>

                  {visibleConvoys.length === 0 ? (
                    <Panel className="p-4 text-center">
                      <p className="text-sm" style={{ color: COLORS.muted }}>Aucun convoi pour l'instant. Crée le premier et invite les plaisanciers proches.</p>
                    </Panel>
                  ) : (
                    visibleConvoys.map((cv) => {
                      const me = cv.members.find((m) => m.boatId === profile.id);
                      const isOrganizer = cv.organizerId === profile.id;
                      const confirmed = cv.members.filter((m) => m.status === "confirme");
                      const pending = cv.members.filter((m) => m.status === "en_attente");
                      const open = expandedConvoy === cv.id;
                      return (
                        <Panel key={cv.id} className="p-3">
                          <button className="w-full text-left" onClick={() => setExpandedConvoy(open ? null : cv.id)}>
                            <div className="flex items-start justify-between">
                              <div>
                                <p className="text-sm font-medium" style={{ color: COLORS.text }}>{cv.name}</p>
                                <p className="text-xs mt-0.5" style={{ color: COLORS.muted }}>
                                  organisé par {cv.organizerPseudo} · {cv.organizerBoat}
                                </p>
                              </div>
                              {me ? (
                                <Badge color={me.status === "confirme" ? COLORS.green : COLORS.orange}
                                  bg={me.status === "confirme" ? COLORS.greenDim : COLORS.orangeDim}>
                                  {me.status === "confirme" ? "Confirmé" : "En attente"}
                                </Badge>
                              ) : (
                                <Users size={16} style={{ color: COLORS.muted }} />
                              )}
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs" style={{ color: COLORS.muted, fontFamily: "JetBrains Mono, monospace" }}>
                              <span className="flex items-center gap-1"><Clock size={12} /> départ {fmtDateTime(cv.departureAt)}</span>
                              <span className="flex items-center gap-1"><Flag size={12} /> arrivée {fmtDateTime(cv.etaAt)}</span>
                            </div>
                            {(cv.rdvLabel || cv.destLabel) && (
                              <p className="text-xs mt-1" style={{ color: COLORS.muted }}>
                                {cv.rdvLabel && <>RDV : {cv.rdvLabel} </>}{cv.destLabel && <>→ {cv.destLabel}</>}
                              </p>
                            )}
                            <p className="text-xs mt-1" style={{ color: COLORS.cyan }}>
                              {confirmed.length} confirmé{confirmed.length > 1 ? "s" : ""}{pending.length > 0 ? ` · ${pending.length} en attente` : ""}
                            </p>
                          </button>

                          {open && (
                            <div className="mt-3 pt-3 border-t space-y-2" style={{ borderColor: COLORS.border }}>
                              <button onClick={() => exportConvoyGPX(cv)}
                                className="w-full py-1.5 rounded text-xs flex items-center justify-center gap-2"
                                style={{ color: COLORS.cyan, border: `1px solid ${COLORS.cyanDim}` }}>
                                <Download size={12} /> Exporter le point de RDV en GPX
                              </button>
                              
                              <button onClick={() => shareConvoy(cv)}
                                className="w-full py-1.5 rounded text-xs flex items-center justify-center gap-2"
                                style={{ color: COLORS.orange, border: `1px solid ${COLORS.orangeDim}` }}>
                                <Share2 size={12} /> Partager le lien du convoi
                              </button>
                              {confirmed.map((m) => (
                                <div key={m.boatId} className="flex items-center justify-between text-sm">
                                  <span style={{ color: COLORS.text }}>{m.pseudo} · {m.boatName}</span>
                                  <div className="flex items-center gap-2">
                                    {m.boatId !== profile.id && (
                                      <button onClick={() => openDmWith(m.boatId)} title={`Contacter ${m.pseudo}`}
                                        className="flex items-center justify-center rounded-full shrink-0"
                                        style={{ width: 26, height: 26, background: "rgba(140,122,230,0.15)", color: "#8C7AE6" }}>
                                        <MessageCircle size={13} />
                                      </button>
                                    )}
                                    <Check size={14} style={{ color: COLORS.green }} />
                                  </div>
                                </div>
                              ))}
                              {isOrganizer && pending.map((m) => (
                                <div key={m.boatId} className="flex items-center justify-between text-sm">
                                  <span style={{ color: COLORS.text }}>{m.pseudo} · {m.boatName}</span>
                                  <div className="flex items-center gap-2">
                                    <button onClick={() => openDmWith(m.boatId)} title={`Contacter ${m.pseudo}`}
                                      className="flex items-center justify-center rounded-full shrink-0"
                                      style={{ width: 26, height: 26, background: "rgba(140,122,230,0.15)", color: "#8C7AE6" }}>
                                      <MessageCircle size={13} />
                                    </button>
                                    <button onClick={() => respondRequest(cv.id, m.boatId, true)}
                                      className="text-xs px-2 py-1 rounded" style={{ color: COLORS.green, border: `1px solid ${COLORS.greenDim}` }}>Accepter</button>
                                    <button onClick={() => respondRequest(cv.id, m.boatId, false)}
                                      className="text-xs px-2 py-1 rounded" style={{ color: COLORS.orange, border: `1px solid ${COLORS.orangeDim}` }}>Refuser</button>
                                  </div>
                                </div>
                              ))}
                              {!isOrganizer && (
                                <button onClick={() => openDmWith(cv.organizerId)}
                                  className="w-full py-2 rounded text-sm mt-1 flex items-center justify-center gap-2"
                                  style={{ color: "#8C7AE6", border: "1px solid rgba(140,122,230,0.4)" }}>
                                  <MessageCircle size={14} /> Contacter {cv.organizerPseudo} (organisateur)
                                </button>
                              )}
                              {!me && (
                                <button onClick={() => requestJoin(cv.id)}
                                  className="w-full py-2 rounded text-sm mt-1"
                                  style={{ background: COLORS.cyanDim, color: COLORS.cyan }}>
                                  Demander à rejoindre
                                </button>
                              )}
                              {me && (
                                <button onClick={() => leaveConvoy(cv.id)}
                                  className="w-full py-2 rounded text-sm mt-1"
                                  style={{ color: COLORS.orange, border: `1px solid ${COLORS.orangeDim}` }}>
                                  {isOrganizer ? "Annuler le convoi" : "Quitter le convoi"}
                                </button>
                              )}
                            </div>
                          )}
                        </Panel>
                      );
                    })
                  )}
                </div>
              )}

              {tab === "alerts" && (
                <div className="space-y-2">
                  <button onClick={openAlertForm}
                    className="w-full py-2.5 rounded font-medium text-sm mb-2 flex items-center justify-center gap-2"
                    style={{ background: COLORS.orange, color: "#1A0E08" }}>
                    <Plus size={16} /> Signaler une observation
                  </button>

                  <div className="flex gap-2 mb-2">
                    {[["recentes", t.alertsRecent], ["historique", t.alertsHistory]].map(([val, label]) => (
                      <button key={val} onClick={() => setAlertsView(val)}
                        className="flex-1 text-xs py-1.5 rounded"
                        style={{
                          background: alertsView === val ? COLORS.orangeDim : "transparent",
                          color: alertsView === val ? COLORS.orange : COLORS.muted,
                          border: `1px solid ${alertsView === val ? COLORS.orangeDim : COLORS.border}`,
                        }}>
                        {label}
                      </button>
                    ))}
                  </div>

                  {(() => {
                    const recentAlerts = alertsWithDist.filter((a) => now - a.createdAt < RECENT_ALERT_MS);
                    const historyAlerts = alertsWithDist.filter((a) => now - a.createdAt >= RECENT_ALERT_MS);
                    const shown = alertsView === "recentes" ? recentAlerts : historyAlerts;
                    const emptyLabel = alertsView === "recentes" ? t.noRecentAlerts : t.noHistoryAlerts;
                    return (
                      <>
                        {shown.length === 0 ? (
                          <Panel className="p-4 text-center">
                            <p className="text-sm" style={{ color: COLORS.muted }}>{emptyLabel}</p>
                          </Panel>
                        ) : (
                          <div className="space-y-2">
                            {shown.map((a) => {
                              const sp = speciesInfo(a.species || "orque");
                              return (
                              <Panel key={a.id} className="p-3 cursor-pointer" onClick={() => { setAlertFocus({ lat: a.lat, lon: a.lon, id: a.id, ts: Date.now() }); setTab("carte"); }}
                                title="Localiser ce marqueur sur la carte">
                                <div className="flex items-start justify-between">
                                  <div className="flex items-center gap-2">
                                    {a.incident ? (
                                      <AlertTriangle size={16} style={{ color: COLORS.orange }} />
                                    ) : (
                                      <span style={{ fontSize: 15, lineHeight: 1 }}>{sp.emoji}</span>
                                    )}
                                    <span className="text-sm font-medium" style={{ color: COLORS.text }}>{a.count} {a.count > 1 ? sp.labelPlural : sp.label.toLowerCase()}</span>
                                  </div>
                                  <span className="text-xs" style={{ color: COLORS.muted }}>
                                    {alertsView === "recentes" ? timeAgo(a.createdAt) : fmtDateTime(new Date(a.createdAt).toISOString())}
                                  </span>
                                </div>
                                {a.notes && <p className="text-sm mt-1.5" style={{ color: COLORS.text }}>{a.notes}</p>}
                                <div className="flex items-center justify-between mt-1.5">
                                  <p className="text-xs" style={{ color: COLORS.muted, fontFamily: "JetBrains Mono, monospace" }}>
                                    {a.author} · {a.boatName}{a.dist !== null ? ` · ${fmtDist(a.dist, distUnit)} (cap ${Math.round(a.brg)}°)` : ""}
                                  </p>
                                  <div className="flex items-center gap-2">
                                    <span className="flex items-center gap-1 text-xs" style={{ color: COLORS.cyan }}>
                                      <LocateFixed size={13} /> Voir
                                    </span>
                                    <button onClick={(e) => { e.stopPropagation(); exportAlertGPX(a); }} title="Exporter ce point en GPX" style={{ color: COLORS.muted }}>
                                      <Download size={14} />
                                    </button>
                                    {(a.authorId === profile.id || profile.isModerator) && (
                                      <>
                                        <button onClick={(e) => { e.stopPropagation(); openEditAlertForm(a); }} title="Modifier ce signalement" style={{ color: COLORS.muted }}>
                                          <Pencil size={14} />
                                        </button>
                                        <button onClick={(e) => { e.stopPropagation(); deleteAlert(a.id); }} title="Supprimer ce signalement" style={{ color: COLORS.orange }}>
                                          <Trash2 size={14} />
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </Panel>
                              );
                            })}
                          </div>
                        )}

                        {alertsView === "historique" && (
                          <Panel className="p-4 mt-3">
                            <p className="text-xs uppercase tracking-wider mb-1.5" style={{ color: COLORS.muted }}>{t.officialSourcesTitle}</p>
                            <p className="text-sm mb-2" style={{ color: COLORS.text }}>{t.officialSourcesDesc}</p>
                            {SPECIES_OPTIONS.filter((sp) => visibleSpecies[sp.key] !== false).map((sp) => (
                              <div key={sp.key} className="mb-2.5 last:mb-0">
                                <p className="text-xs mb-1 flex items-center gap-1.5" style={{ color: COLORS.muted }}>
                                  <span>{sp.emoji}</span> {sp.labelPlural}
                                </p>
                                <div className="space-y-1.5">
                                  {(OFFICIAL_SPECIES_SOURCES[sp.key] || []).map((s) => (
                                    <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer"
                                      className="block text-sm underline" style={{ color: COLORS.cyan }}>
                                      {s.label}
                                    </a>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </Panel>
                        )}

                        {alertsView === "historique" && (
                          <Panel className="p-4 mt-3">
                            <p className="text-xs uppercase tracking-wider mb-1.5" style={{ color: COLORS.muted }}>🐟 Zones d'élevage de poissons</p>
                            <p className="text-sm mb-2" style={{ color: COLORS.text }}>Quelques sites repérés sur la carte (non exhaustif). Cadastre complet et à jour :</p>
                            <div className="space-y-1.5">
                              {AQUACULTURE_OFFICIAL_SOURCES.map((s) => (
                                <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer"
                                  className="block text-sm underline" style={{ color: COLORS.cyan }}>
                                  {s.label}
                                </a>
                              ))}
                            </div>
                          </Panel>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}

              {tab === "chat" && (
                <div className="flex flex-col" style={{ minHeight: "30vh" }}>
                  {/* Fils : canal général + un fil par message privé — s'organiser en dehors
                      du canal général, entre deux utilisateurs, avec notif push dédiée. */}
                  <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
                    <button onClick={() => setActiveDmPeerId(null)}
                      className="shrink-0 text-xs px-3 py-1.5 rounded-full"
                      style={{
                        background: activeDmPeerId === null ? COLORS.cyanDim : "transparent",
                        color: activeDmPeerId === null ? COLORS.cyan : COLORS.muted,
                        border: `1px solid ${activeDmPeerId === null ? COLORS.cyanDim : COLORS.border}`,
                      }}>
                      Général
                    </button>
                    {Array.from(new Set(dms.map((m) => (m.fromId === profile.id ? m.toId : m.fromId))).add(activeDmPeerId).values())
                      .filter((id) => id && id !== profile.id)
                      .map((peerId) => (
                        <button key={peerId} onClick={() => setActiveDmPeerId(peerId)}
                          className="shrink-0 text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5"
                          style={{
                            background: activeDmPeerId === peerId ? "rgba(140,122,230,0.2)" : "transparent",
                            color: activeDmPeerId === peerId ? "#8C7AE6" : COLORS.muted,
                            border: `1px solid ${activeDmPeerId === peerId ? "#8C7AE6" : COLORS.border}`,
                          }}>
                          <MessageCircle size={11} /> {boats[peerId]?.pseudo || "Utilisateur"}
                        </button>
                      ))}
                  </div>

                  {activeDmPeerId === null ? (
                    <div className="flex-1 space-y-2">
                      {chat.length === 0 && (
                        <p className="text-center text-sm mt-6" style={{ color: COLORS.muted }}>Canal général — coordonne-toi ici.</p>
                      )}
                      {chat.map((m) => (
                        <div key={m.id} className={m.author === profile.pseudo ? "text-right" : "text-left"}>
                          <div className="inline-block px-3 py-2 rounded-lg max-w-[80%] text-left"
                            style={{ background: m.author === profile.pseudo ? COLORS.cyanDim : COLORS.panelAlt, border: `1px solid ${COLORS.border}` }}>
                            <p className="text-xs mb-0.5" style={{ color: COLORS.muted }}>{m.author} · {m.boatName}</p>
                            <p className="text-sm" style={{ color: COLORS.text }}>{m.text}</p>
                          </div>
                        </div>
                      ))}
                      <div ref={chatEndRef} />
                    </div>
                  ) : (
                    <div className="flex-1 space-y-2">
                      <p className="text-center text-xs mb-1" style={{ color: COLORS.muted }}>
                        Message privé avec {boats[activeDmPeerId]?.pseudo || "cet utilisateur"} — visible uniquement par vous deux.
                      </p>
                      {dms.filter((m) => (m.fromId === profile.id && m.toId === activeDmPeerId) || (m.fromId === activeDmPeerId && m.toId === profile.id)).length === 0 && (
                        <p className="text-center text-sm mt-4" style={{ color: COLORS.muted }}>Aucun message pour l'instant — dis bonjour !</p>
                      )}
                      {dms
                        .filter((m) => (m.fromId === profile.id && m.toId === activeDmPeerId) || (m.fromId === activeDmPeerId && m.toId === profile.id))
                        .map((m) => (
                          <div key={m.id} className={m.fromId === profile.id ? "text-right" : "text-left"}>
                            <div className="inline-block px-3 py-2 rounded-lg max-w-[80%] text-left"
                              style={{ background: m.fromId === profile.id ? "rgba(140,122,230,0.25)" : COLORS.panelAlt, border: `1px solid ${COLORS.border}` }}>
                              <p className="text-xs mb-0.5" style={{ color: COLORS.muted }}>{m.fromPseudo} · {m.fromBoatName}</p>
                              <p className="text-sm" style={{ color: COLORS.text }}>{m.text}</p>
                            </div>
                          </div>
                        ))}
                      <div ref={chatEndRef} />
                    </div>
                  )}
                </div>
              )}

              {tab === "profile" && (
                <div className="space-y-4">
                  <Panel className="p-4">
                    <p className="text-lg font-medium" style={{ color: COLORS.text, fontFamily: "Oswald, sans-serif" }}>{profile.pseudo}</p>
                    <p className="text-sm" style={{ color: COLORS.muted }}>{profile.boatName}</p>
                    {session?.user?.email && <p className="text-xs mt-1" style={{ color: COLORS.muted }}>{session.user.email}</p>}
                    {pos && <p className="text-xs mt-2" style={{ color: COLORS.muted, fontFamily: "JetBrains Mono, monospace" }}>{pos.lat.toFixed(5)}, {pos.lon.toFixed(5)}</p>}
                  </Panel>
                  
                  <button onClick={shareApp} className="w-full py-2.5 rounded font-medium text-sm flex items-center justify-center gap-2"
                    style={{ background: COLORS.cyan, color: "#0A2E33" }}>
                    <Share2 size={16} /> Inviter un ami
                  </button>

                  <Panel className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm" style={{ color: COLORS.text }}>Notifications</p>
                        <p className="text-xs mt-0.5" style={{ color: COLORS.muted }}>
                          {pushStatus === "actif" && "Actives — alertes orques, convois et demandes reçues même appli fermée"}
                          {pushStatus === "inactif" && "Reçois une alerte même quand l'appli est fermée"}
                          {pushStatus === "refuse" && "Autorisation refusée — active-la dans les réglages de ton navigateur"}
                          {pushStatus === "indisponible" && "Non disponibles sur ce navigateur/appareil"}
                          {pushStatus === "inconnu" && "Vérification…"}
                        </p>
                      </div>
                      {pushStatus === "actif" ? (
                        <span className="px-3 py-1.5 rounded text-xs flex items-center gap-1 shrink-0" style={{ background: COLORS.green, color: "#0A1F14" }}>
                          <span className="w-1.5 h-1.5 rounded-full inline-block animate-pulse" style={{ background: "#0A1F14" }} />
                          Actif
                        </span>
                      ) : pushStatus === "inactif" ? (
                        <button onClick={subscribeToPush} className="px-3 py-1.5 rounded text-xs shrink-0"
                          style={{ color: COLORS.cyan, border: `1px solid ${COLORS.cyanDim}` }}>
                          Activer
                        </button>
                      ) : null}
                    </div>
                  </Panel>

                  <Panel className="p-4">
                    <p className="text-sm" style={{ color: COLORS.text }}>Types de notifications</p>
                    <p className="text-xs mt-0.5 mb-1" style={{ color: COLORS.muted }}>
                      Choisis toi-même les notifications push que tu reçois (si les notifications sont activées ci-dessus).
                    </p>
                    <ToggleRow
                      label="Signalements d'animaux"
                      sub="Orques, dauphins, baleines… dans ton rayon d'alerte"
                      value={boats[profile.id]?.notifySpecies !== false}
                      onToggle={() => updateNotifyPref("notifySpecies", !(boats[profile.id]?.notifySpecies !== false))}
                    />
                    <ToggleRow
                      label="Nouveaux convois à proximité"
                      sub="Quand un convoi se crée près de toi"
                      value={boats[profile.id]?.notifyConvoys !== false}
                      onToggle={() => updateNotifyPref("notifyConvoys", !(boats[profile.id]?.notifyConvoys !== false))}
                    />
                    <ToggleRow
                      label="Activité de mes convois"
                      sub="Demandes pour rejoindre, demandes acceptées"
                      value={boats[profile.id]?.notifyConvoyActivity !== false}
                      onToggle={() => updateNotifyPref("notifyConvoyActivity", !(boats[profile.id]?.notifyConvoyActivity !== false))}
                    />
                    <ToggleRow
                      label="Messages privés"
                      sub="Quand un autre utilisateur t'envoie un message"
                      value={boats[profile.id]?.notifyMessages !== false}
                      onToggle={() => updateNotifyPref("notifyMessages", !(boats[profile.id]?.notifyMessages !== false))}
                    />
                    <ToggleRow
                      label="Recevoir aussi par e-mail"
                      sub={session?.user?.email ? `Envoyé à ${session.user.email}, en plus du push` : "Envoyé à ton adresse de connexion, en plus du push"}
                      value={!!boats[profile.id]?.notifyEmail}
                      onToggle={() => updateNotifyPref("notifyEmail", !boats[profile.id]?.notifyEmail)}
                    />
                  </Panel>

                  <Panel className="p-4">
                    <p className="text-sm" style={{ color: COLORS.text }}>Rayon d'alerte orques</p>
                    <p className="text-xs mt-0.5 mb-2.5" style={{ color: COLORS.muted }}>
                      Distance à partir de laquelle tu reçois une notification pour un nouveau signalement d'orques
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {ALERT_RADIUS_OPTIONS.map((km) => {
                        const current = boats[profile.id]?.alertRadiusKm ?? DEFAULT_ALERT_RADIUS_KM;
                        const active = current === km;
                        return (
                          <button key={km ?? "illimite"} onClick={() => updateAlertRadius(km)}
                            className="text-xs px-3 py-1.5 rounded"
                            style={{
                              background: active ? COLORS.cyanDim : "transparent",
                              color: active ? COLORS.cyan : COLORS.muted,
                              border: `1px solid ${active ? COLORS.cyanDim : COLORS.border}`,
                            }}>
                            {km == null ? "Illimité" : fmtDist(km, distUnit)}
                          </button>
                        );
                      })}
                    </div>
                  </Panel>

                  <Panel className="p-4">
                    <p className="text-sm" style={{ color: COLORS.text }}>Unité de distance</p>
                    <p className="text-xs mt-0.5 mb-2.5" style={{ color: COLORS.muted }}>
                      Utilisée pour les distances affichées dans l'app (alertes, rayon de notification…)
                    </p>
                    <div className="flex gap-2">
                      {[["km", "Kilomètres"], ["nm", "Milles nautiques"]].map(([val, label]) => (
                        <button key={val} onClick={() => setDistUnit(val)}
                          className="flex-1 text-xs py-1.5 rounded"
                          style={{
                            background: distUnit === val ? COLORS.cyanDim : "transparent",
                            color: distUnit === val ? COLORS.cyan : COLORS.muted,
                            border: `1px solid ${distUnit === val ? COLORS.cyanDim : COLORS.border}`,
                          }}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </Panel>

                  <Panel className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm" style={{ color: COLORS.text }}>Suivi GPS du téléphone</p>
                        <p className="text-xs mt-0.5" style={{ color: COLORS.muted }}>
                          {gpsTracking ? "Actif — ta position se met à jour automatiquement en navigation" : "Envoie ta position en continu sans avoir à l'actualiser à la main"}
                        </p>
                      </div>
                      <button onClick={toggleTracking} className="px-3 py-1.5 rounded text-xs flex items-center gap-1 shrink-0"
                        style={{
                          background: gpsTracking ? COLORS.green : "transparent",
                          color: gpsTracking ? "#0A1F14" : COLORS.muted,
                          border: `1px solid ${gpsTracking ? COLORS.green : COLORS.border}`,
                        }}>
                        {gpsTracking && <span className="w-1.5 h-1.5 rounded-full inline-block animate-pulse" style={{ background: "#0A1F14" }} />}
                        {gpsTracking ? "Actif" : "Activer"}
                      </button>
                    </div>
                  </Panel>

                  <Panel className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm" style={{ color: COLORS.text }}>Trace sur la carte</p>
                        <p className="text-xs mt-0.5" style={{ color: COLORS.muted }}>
                          Affiche le trajet récent de chaque bateau (moi et les autres) — les points sont cliquables (heure, position, vitesse/cap)
                        </p>
                      </div>
                      <button onClick={() => setShowTrails((v) => !v)} className="px-3 py-1.5 rounded text-xs flex items-center gap-1 shrink-0"
                        style={{
                          background: showTrails ? COLORS.cyanDim : "transparent",
                          color: showTrails ? COLORS.cyan : COLORS.muted,
                          border: `1px solid ${showTrails ? COLORS.cyanDim : COLORS.border}`,
                        }}>
                        {showTrails ? "Visible" : "Masquée"}
                      </button>
                    </div>
                  </Panel>

                  <Panel className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm" style={{ color: COLORS.muted }}>Mettre à jour ma position</span>
                      <div className="flex gap-2">
                        <button onClick={refreshPosition}
                          className="flex items-center gap-1 text-xs px-2 py-1 rounded" style={{ color: COLORS.cyan, border: `1px solid ${COLORS.cyanDim}` }}>
                          <LocateFixed size={13} /> Actualiser
                        </button>
                        <button onClick={() => triggerImport("profile")}
                          className="flex items-center gap-1 text-xs px-2 py-1 rounded" style={{ color: COLORS.muted, border: `1px solid ${COLORS.border}` }}>
                          <Download size={13} /> GPX
                        </button>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <input key={`lat-${pos?.lat}`} defaultValue={pos?.lat} onBlur={(e) => pos && updatePosition(parseFloat(e.target.value) || pos.lat, pos.lon)}
                        inputMode="decimal" className="w-1/2 px-3 py-2 rounded outline-none text-sm" style={{ ...inputStyle, fontFamily: "JetBrains Mono, monospace" }} />
                      <input key={`lon-${pos?.lon}`} defaultValue={pos?.lon} onBlur={(e) => pos && updatePosition(pos.lat, parseFloat(e.target.value) || pos.lon)}
                        inputMode="decimal" className="w-1/2 px-3 py-2 rounded outline-none text-sm" style={{ ...inputStyle, fontFamily: "JetBrains Mono, monospace" }} />
                    </div>
                    <div>
                      <label className="text-xs uppercase tracking-wider" style={{ color: COLORS.muted }}>Statut</label>
                      <div className="flex gap-2 mt-1">
                        {[["en_route", "En route"], ["ancre", "À l'ancre"], ["a_quai", "À quai"]].map(([val, label]) => (
                          <button key={val} onClick={() => { setStatus(val); setTimeout(publishMe, 50); }}
                            className="flex-1 text-xs py-1.5 rounded"
                            style={{ background: status === val ? COLORS.cyanDim : "transparent", color: status === val ? COLORS.cyan : COLORS.muted, border: `1px solid ${status === val ? COLORS.cyanDim : COLORS.border}` }}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs uppercase tracking-wider" style={{ color: COLORS.muted }}>Cap (degrés, optionnel)</label>
                      <input value={heading} onChange={(e) => setHeading(e.target.value)} onBlur={() => publishMe()} placeholder="Ex. 270" inputMode="numeric"
                        className="w-full mt-1 px-3 py-2 rounded outline-none text-sm" style={{ ...inputStyle, fontFamily: "JetBrains Mono, monospace" }} />
                    </div>
                    {saving && <p className="text-xs" style={{ color: COLORS.muted }}>Synchronisation…</p>}
                  </Panel>

                  <button onClick={leaveRoute} className="w-full py-2.5 rounded text-sm flex items-center justify-center gap-2"
                    style={{ color: COLORS.orange, border: `1px solid ${COLORS.orangeDim}` }}>
                    <LogOut size={15} /> Quitter la route
                  </button>
                  <button onClick={handleSignOut} className="w-full py-2.5 rounded text-sm"
                    style={{ color: COLORS.muted, border: `1px solid ${COLORS.border}` }}>
                    Se déconnecter
                  </button>
                </div>
              )}

            </div>

            {tab === "chat" && activeDmPeerId === null && (
              <div className="flex items-center gap-2 px-4 py-3 border-t" style={{ borderColor: COLORS.border }}>
                <input value={chatText} onChange={(e) => setChatText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                  placeholder="Écrire un message…" className="flex-1 px-3 py-2 rounded outline-none text-sm" style={inputStyle} />
                <button onClick={sendMessage} className="p-2.5 rounded" style={{ background: COLORS.orange, color: "#1A0E08" }}>
                  <Send size={16} />
                </button>
              </div>
            )}
            {tab === "chat" && activeDmPeerId !== null && (
              <div className="flex items-center gap-2 px-4 py-3 border-t" style={{ borderColor: COLORS.border }}>
                <input value={dmText} onChange={(e) => setDmText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendDirectMessage()}
                  placeholder={`Écrire à ${boats[activeDmPeerId]?.pseudo || ""}…`} className="flex-1 px-3 py-2 rounded outline-none text-sm" style={inputStyle} />
                <button onClick={sendDirectMessage} className="p-2.5 rounded" style={{ background: "#8C7AE6", color: "#1A0E2E" }}>
                  <Send size={16} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Barre d'onglets flottante — Option B : icônes seules (sans libellé sous l'icône) pour
          rester compacte en mode téléphone. 2 onglets principaux (Convois avec compteur,
          Observations) + un bouton "Couches" qui ouvre un petit menu regroupant les 3 filtres
          de calques (chantiers navals / secours / zones de pêche), au lieu de 5 boutons fixes. */}
      <div className="absolute left-0 right-0 z-[1200] flex justify-center px-4" style={{ bottom: 20 }}>
        <div className="relative flex" style={{ gap: 10 }}>
          {showLayersMenu && (
            <div className="absolute rounded-xl p-3 flex gap-3" style={{ bottom: 88, left: "50%", transform: "translateX(-50%)", background: "rgba(37,72,100,0.96)", border: `1px solid ${COLORS.border}`, backdropFilter: "blur(10px)" }}>
              <button onClick={() => setShowShipyards((v) => !v)} className="flex flex-col items-center gap-1" style={{ opacity: showShipyards ? 1 : 0.4 }}>
                <span style={{ width: 40, height: 40, borderRadius: "50%", background: COLORS.green, border: "2px solid #0A1F14", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19 }}>🛠️</span>
                <span className="text-xs" style={{ color: COLORS.text }}>Chantiers</span>
              </button>
              <button onClick={() => setShowRescueStations((v) => !v)} className="flex flex-col items-center gap-1" style={{ opacity: showRescueStations ? 1 : 0.4 }}>
                <span style={{ width: 40, height: 40, borderRadius: "50%", background: COLORS.orange, border: "2px solid #4A2409", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19 }}>🛟</span>
                <span className="text-xs" style={{ color: COLORS.text }}>Secours</span>
              </button>
              <button onClick={() => setShowFishFarms((v) => !v)} className="flex flex-col items-center gap-1" style={{ opacity: showFishFarms ? 1 : 0.4 }}>
                <span style={{ width: 40, height: 40, borderRadius: "50%", background: COLORS.cyan, border: "2px solid #0A2E33", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <FishNetIcon size={19} color="#000000" />
                </span>
                <span className="text-xs" style={{ color: COLORS.text }}>Élevage</span>
              </button>
            </div>
          )}
          {/* Plus d'onglet "Carte" dédié : la carte est la vue de base, toujours visible en
              fond. Chaque bouton ci-dessous ouvre son panneau par-dessus la carte ; retaper
              sur le bouton déjà actif (ou le bouton fermer du panneau) referme le panneau et
              redonne directement accès à la carte, sans détour par un onglet séparé. */}
          <IconBtn onClick={() => openTab("convois")} active={tab === "convois"} label={`${t.tabConvois} (${visibleConvoys.length})`}>
            <span style={{ position: "relative", display: "inline-block" }}>
              <SolidSailboatIcon size={20} color={COLORS.orange} />
              {visibleConvoys.length > 0 && (
                <span style={{
                  position: "absolute", top: -7, right: -9, background: COLORS.orange, color: "#1A0E08",
                  fontSize: 9, fontWeight: 500, borderRadius: 8, padding: "0px 4px", minWidth: 14, textAlign: "center",
                  border: `1.5px solid ${COLORS.panel}`,
                }}>{visibleConvoys.length}</span>
              )}
            </span>
          </IconBtn>
          <IconBtn onClick={() => openTab("alerts")} active={tab === "alerts"} label={t.tabAlerts}><BinocularsIcon size={20} strokeWidth={2.75} color="#FFC94A" /></IconBtn>
          <IconBtn onClick={toggleLayersMenu} active={showLayersMenu} label="Couches"><Layers size={18} color={COLORS.cyan} /></IconBtn>
        </div>
      </div>

      {showAlertForm && (
        <div className="fixed inset-0 flex items-end justify-center z-[1300]" style={{ background: "rgba(0,0,0,0.6)" }}>
          <div className="w-full max-w-sm rounded-t-xl p-5" style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}` }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-sm" style={{ color: COLORS.text, fontFamily: "Oswald, sans-serif" }}>{editingAlertId ? "MODIFIER L'OBSERVATION" : "SIGNALER UNE OBSERVATION"}</h3>
              <button onClick={() => setShowAlertForm(false)}><X size={18} style={{ color: COLORS.muted }} /></button>
            </div>
            <Field label="Espèce observée">
              <div className="grid grid-cols-3 gap-2">
                {SPECIES_OPTIONS.map((sp) => (
                  <button key={sp.key} type="button" onClick={() => setAlertSpecies(sp.key)}
                    className="py-2 px-1 rounded text-xs font-medium flex flex-col items-center justify-center gap-1"
                    style={{
                      background: alertSpecies === sp.key ? COLORS.orangeDim : "transparent",
                      color: alertSpecies === sp.key ? COLORS.orange : COLORS.muted,
                      border: `1px solid ${alertSpecies === sp.key ? COLORS.orangeDim : COLORS.border}`,
                    }}>
                    <span style={{ fontSize: 18 }}>{sp.emoji}</span>
                    <span className="text-center leading-tight">{sp.label}</span>
                  </button>
                ))}
              </div>
            </Field>
            {STRANDING_CONTACTS[alertSpecies] && (
              <div className="mt-2 p-2.5 rounded text-xs" style={{ background: COLORS.panelAlt, border: `1px solid ${COLORS.border}`, color: COLORS.muted }}>
                <p className="mb-1" style={{ color: COLORS.text }}>Animal échoué ou en détresse ? Appeler directement :</p>
                {STRANDING_CONTACTS[alertSpecies].map((c) => (
                  <p key={c.zone}>{c.zone} : <span style={{ color: COLORS.cyan }}>{c.phone}</span></p>
                ))}
              </div>
            )}
            <div className="h-3" />
            <Field label="Nombre d'individus">
              <div className="flex items-center gap-2">
                <button type="button"
                  onClick={() => setAlertCount(String(Math.max(1, (parseInt(alertCount, 10) || 1) - 1)))}
                  className="w-10 h-10 rounded text-lg font-medium shrink-0"
                  style={{ ...inputStyle, color: COLORS.cyan }}>
                  −
                </button>
                <input value={alertCount} onChange={(e) => setAlertCount(e.target.value.replace(/[^0-9]/g, ""))}
                  inputMode="numeric" placeholder="Ex. 3" style={{ ...inputStyle, textAlign: "center" }}
                  className="flex-1 px-3 py-2 rounded outline-none text-sm" />
                <button type="button"
                  onClick={() => setAlertCount(String((parseInt(alertCount, 10) || 0) + 1))}
                  className="w-10 h-10 rounded text-lg font-medium shrink-0"
                  style={{ ...inputStyle, color: COLORS.cyan }}>
                  +
                </button>
              </div>
              <div className="flex gap-2 mt-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" onClick={() => setAlertCount(String(n))}
                    className="flex-1 py-1.5 rounded text-xs"
                    style={{
                      background: alertCount === String(n) ? COLORS.orangeDim : "transparent",
                      color: alertCount === String(n) ? COLORS.orange : COLORS.muted,
                      border: `1px solid ${alertCount === String(n) ? COLORS.orangeDim : COLORS.border}`,
                    }}>
                    {n}
                  </button>
                ))}
              </div>
            </Field>
            <div className="h-3" />
            <Field label="Type d'observation">
              <div className="flex gap-2">
                <button type="button" onClick={() => setAlertIncident(false)}
                  className="flex-1 py-2 rounded text-sm font-medium"
                  style={{
                    background: !alertIncident ? COLORS.cyanDim : "transparent",
                    color: !alertIncident ? COLORS.cyan : COLORS.muted,
                    border: `1px solid ${!alertIncident ? COLORS.cyanDim : COLORS.border}`,
                  }}>
                  Sans incident
                </button>
                <button type="button" onClick={() => setAlertIncident(true)}
                  className="flex-1 py-2 rounded text-sm font-medium"
                  style={{
                    background: alertIncident ? COLORS.orangeDim : "transparent",
                    color: alertIncident ? COLORS.orange : COLORS.muted,
                    border: `1px solid ${alertIncident ? COLORS.orangeDim : COLORS.border}`,
                  }}>
                  Avec incident
                </button>
              </div>
            </Field>
            <div className="h-3" />
            <Field label="Notes (comportement, distance…)">
              <textarea value={alertNotes} onChange={(e) => setAlertNotes(e.target.value)} rows={3} placeholder="Ex. Approche curieuse du safran, rester calme"
                className="w-full px-3 py-2 rounded outline-none text-sm resize-none" style={inputStyle} />
            </Field>
            <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
              <p className="text-xs" style={{ color: COLORS.muted, fontFamily: "JetBrains Mono, monospace" }}>
                Position : {alertLat != null && alertLon != null ? `${alertLat.toFixed(4)}, ${alertLon.toFixed(4)}` : "non localisée"}
              </p>
              <div className="flex items-center gap-2">
                <button onClick={() => startPicking("alert")}
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded" style={{ color: COLORS.orange, border: `1px solid ${COLORS.orangeDim}` }}>
                  <LocateFixed size={13} /> Sur la carte
                </button>
                <button onClick={locateForAlert} disabled={alertLocating}
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded" style={{ color: COLORS.cyan, border: `1px solid ${COLORS.cyanDim}` }}>
                  <LocateFixed size={13} /> {alertLocating ? "Localisation…" : "Me localiser"}
                </button>
              </div>
            </div>
            {geoError && <p className="text-xs mt-1.5" style={{ color: COLORS.orange }}>{geoError}</p>}
            <button onClick={addAlert} disabled={alertLat == null || alertLon == null}
              className="w-full py-2.5 rounded font-medium text-sm mt-3"
              style={{ background: COLORS.orange, color: "#1A0E08", opacity: alertLat == null || alertLon == null ? 0.5 : 1 }}>
              {editingAlertId ? "Enregistrer les modifications" : "Publier le signalement"}
            </button>
          </div>
        </div>
      )}

      {showConvoyForm && (
        <div className="fixed inset-0 flex items-end justify-center z-[1300]" style={{ background: "rgba(0,0,0,0.6)" }}>
          <div className="w-full max-w-sm rounded-t-xl p-5 overflow-y-auto" style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, maxHeight: "85vh" }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-sm" style={{ color: COLORS.text, fontFamily: "Oswald, sans-serif" }}>CRÉER UN CONVOI</h3>
              <button onClick={() => { setShowConvoyForm(false); setRdvSuggestions([]); setDestSuggestions([]); setCvStageSuggestions([]); }}><X size={18} style={{ color: COLORS.muted }} /></button>
            </div>
            <div className="space-y-3">
              <Field label="Nom du convoi">
                <input value={cvName} onChange={(e) => setCvName(e.target.value)} placeholder="Ex. Traversée du détroit - matinée"
                  className="w-full px-3 py-2 rounded outline-none text-sm" style={inputStyle} />
              </Field>
              <Field label="Point de rendez-vous (description)">
                <div className="relative">
                  <input value={cvRdv} onChange={(e) => onRdvTextChange(e.target.value)} placeholder="Ex. Bilbao, ou sortie du port, bouée verte"
                    autoComplete="off"
                    className="w-full px-3 py-2 rounded outline-none text-sm" style={inputStyle} />
                  {rdvSuggestLoading && (
                    <p className="text-xs mt-1" style={{ color: COLORS.muted }}>Recherche…</p>
                  )}
                  {rdvSuggestions.length > 0 && (
                    <div className="absolute left-0 right-0 z-10 mt-1 rounded overflow-hidden shadow-lg"
                      style={{ background: COLORS.panelAlt, border: `1px solid ${COLORS.border}` }}>
                      {rdvSuggestions.map((s, i) => (
                        <button key={i} type="button" onClick={() => pickRdvSuggestion(s)}
                          className="w-full text-left px-3 py-2 text-xs flex items-start gap-1.5"
                          style={{ color: COLORS.text, borderBottom: i < rdvSuggestions.length - 1 ? `1px solid ${COLORS.border}` : "none" }}>
                          {s.isPort && <Anchor size={12} className="shrink-0 mt-0.5" style={{ color: COLORS.cyan }} />}
                          <span>{s.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </Field>
              <div className="flex items-center justify-between">
  <p className="text-xs" style={{ color: COLORS.muted, fontFamily: "JetBrains Mono, monospace" }}>
    RDV : {(cvRdvLat ?? pos?.lat)?.toFixed(4)}, {(cvRdvLon ?? pos?.lon)?.toFixed(4)}
  </p>
  <div className="flex gap-2">
    <button onClick={() => startPicking("rdv")}
      className="flex items-center gap-1 text-xs px-2 py-1 rounded" style={{ color: COLORS.cyan, border: `1px solid ${COLORS.cyanDim}` }}>
      <LocateFixed size={12} /> Sur la carte
    </button>
    <button onClick={() => triggerImport("convoy-rdv")}
      className="flex items-center gap-1 text-xs px-2 py-1 rounded" style={{ color: COLORS.muted, border: `1px solid ${COLORS.border}` }}>
      <Download size={12} /> Importer GPX
    </button>
  </div>
</div>
              <Field label="Date et heure de départ">
                <div className="flex items-center gap-2">
                  <input ref={cvDepartureRef} type="datetime-local" value={cvDeparture} onChange={(e) => setCvDeparture(e.target.value)}
                    className="w-full px-3 py-2 rounded outline-none text-sm" style={inputStyle} />
                  <button type="button" onClick={() => cvDepartureRef.current?.blur()}
                    className="flex items-center gap-1 text-xs px-2.5 py-2 rounded font-medium shrink-0" style={{ background: COLORS.cyanDim, color: COLORS.cyan }}>
                    <Check size={13} /> Valider
                  </button>
                </div>
              </Field>
              <Field label="Destination">
                <div className="relative">
                  <input value={cvDest} onChange={(e) => onDestTextChange(e.target.value)} placeholder="Ex. Port de Saint-Jean-de-Luz"
                    autoComplete="off"
                    className="w-full px-3 py-2 rounded outline-none text-sm" style={inputStyle} />
                  {destSuggestLoading && (
                    <p className="text-xs mt-1" style={{ color: COLORS.muted }}>Recherche…</p>
                  )}
                  {destSuggestions.length > 0 && (
                    <div className="absolute left-0 right-0 z-10 mt-1 rounded overflow-hidden shadow-lg"
                      style={{ background: COLORS.panelAlt, border: `1px solid ${COLORS.border}` }}>
                      {destSuggestions.map((s, i) => (
                        <button key={i} type="button" onClick={() => pickDestSuggestion(s)}
                          className="w-full text-left px-3 py-2 text-xs flex items-start gap-1.5"
                          style={{ color: COLORS.text, borderBottom: i < destSuggestions.length - 1 ? `1px solid ${COLORS.border}` : "none" }}>
                          {s.isPort && <Anchor size={12} className="shrink-0 mt-0.5" style={{ color: COLORS.cyan }} />}
                          <span>{s.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </Field>
              <div className="flex items-center justify-between">
                <p className="text-xs" style={{ color: COLORS.muted, fontFamily: "JetBrains Mono, monospace" }}>
                  {cvDestLat != null ? `${cvDestLat.toFixed(4)}, ${cvDestLon.toFixed(4)}` : "Coordonnées non définies"}
                </p>
                <div className="flex gap-2">
                  <button onClick={() => startPicking("dest")}
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded" style={{ color: COLORS.cyan, border: `1px solid ${COLORS.cyanDim}` }}>
                    <LocateFixed size={12} /> Sur la carte
                  </button>
                  <button onClick={() => triggerImport("convoy-dest")}
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded" style={{ color: COLORS.muted, border: `1px solid ${COLORS.border}` }}>
                    <Download size={12} /> Importer GPX
                  </button>
                </div>
              </div>
              {cvDestLat == null && (
                <p className="text-xs" style={{ color: COLORS.orange }}>
                  Sans coordonnées, la destination n'apparaîtra pas sur la carte — utilisez "Sur la carte" ou "Importer GPX".
                </p>
              )}
              {cvRdvLat != null && cvDestLat != null && (
                <p className="text-xs" style={{ color: COLORS.muted }}>
                  Le tracé affiché entre RDV et destination est indicatif (couloir maritime approximatif) et ne suit pas le balisage nautique réel — près des ports, suis toujours le chenal et les bouées/feux réels (couche OpenSeaMap sur la carte) plutôt que ce tracé.
                </p>
              )}
              <Field label="Étapes (escales intermédiaires, optionnel)">
                {cvStages.length > 0 && (
                  <div className="space-y-2 mb-2">
                    {cvStages.map((s, i) => (
                      <div key={i} className="rounded p-2 space-y-1.5" style={{ background: COLORS.panelAlt, border: `1px solid ${COLORS.border}` }}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs" style={{ color: COLORS.text }}>{i + 1}. {s.label}</span>
                          <button type="button" onClick={() => removeStage(i)}><X size={14} style={{ color: COLORS.muted }} /></button>
                        </div>
                        <input type="datetime-local" value={s.etaAt || ""} onChange={(e) => setStageEta(i, e.target.value)}
                          className="w-full px-2 py-1.5 rounded outline-none text-xs" style={inputStyle} />
                      </div>
                    ))}
                  </div>
                )}
                <div className="relative">
                  <input value={cvStageText} onChange={(e) => onStageTextChange(e.target.value)} placeholder="Ex. Saint-Sébastien"
                    autoComplete="off"
                    className="w-full px-3 py-2 rounded outline-none text-sm" style={inputStyle} />
                  {cvStageSuggestLoading && (
                    <p className="text-xs mt-1" style={{ color: COLORS.muted }}>Recherche…</p>
                  )}
                  {cvStageSuggestions.length > 0 && (
                    <div className="absolute left-0 right-0 z-10 mt-1 rounded overflow-hidden shadow-lg"
                      style={{ background: COLORS.panelAlt, border: `1px solid ${COLORS.border}` }}>
                      {cvStageSuggestions.map((s, i) => (
                        <button key={i} type="button" onClick={() => addStage(s)}
                          className="w-full text-left px-3 py-2 text-xs flex items-start gap-1.5"
                          style={{ color: COLORS.text, borderBottom: i < cvStageSuggestions.length - 1 ? `1px solid ${COLORS.border}` : "none" }}>
                          {s.isPort && <Anchor size={12} className="shrink-0 mt-0.5" style={{ color: COLORS.cyan }} />}
                          <span>{s.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </Field>
              <Field label="Heure d'arrivée estimée">
                <div className="flex items-center gap-2">
                  <input ref={cvEtaRef} type="datetime-local" value={cvEta} onChange={(e) => setCvEta(e.target.value)}
                    className="w-full px-3 py-2 rounded outline-none text-sm" style={inputStyle} />
                  <button type="button" onClick={() => cvEtaRef.current?.blur()}
                    className="flex items-center gap-1 text-xs px-2.5 py-2 rounded font-medium shrink-0" style={{ background: COLORS.cyanDim, color: COLORS.cyan }}>
                    <Check size={13} /> Valider
                  </button>
                </div>
              </Field>
              <button onClick={createConvoy} className="w-full py-2.5 rounded font-medium text-sm" style={{ background: COLORS.orange, color: "#1A0E08" }}>
                Créer le convoi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fiche contact : s'ouvre au clic sur un bateau (marqueur carte ou liste), avec sa
          dernière position, son statut, un raccourci Message (fil DM) et un raccourci pour
          le recentrer sur la carte. */}
      {selectedBoat && (
        <div className="fixed inset-0 flex items-end justify-center z-[1300]" style={{ background: "rgba(0,0,0,0.6)" }} onClick={() => setSelectedBoat(null)}>
          <div className="w-full max-w-sm rounded-t-xl p-5" style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}` }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div style={{ width: 46, height: 46, borderRadius: "50%", background: COLORS.cyanDim, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 500, fontSize: 15, color: COLORS.text }}>
                  {selectedBoat.pseudo.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium" style={{ color: COLORS.text }}>{selectedBoat.pseudo}</p>
                  <p className="text-xs" style={{ color: COLORS.muted }}>{selectedBoat.boatName}</p>
                </div>
              </div>
              <button onClick={() => setSelectedBoat(null)}><X size={18} style={{ color: COLORS.muted }} /></button>
            </div>
            <div className="pt-3 space-y-2" style={{ borderTop: `1px solid ${COLORS.border}` }}>
              {selectedBoat.dist != null && (
                <div className="flex items-center justify-between text-sm">
                  <span style={{ color: COLORS.muted }}>Position</span>
                  <span style={{ color: COLORS.text }}>{fmtDist(selectedBoat.dist, distUnit)} · cap {Math.round(selectedBoat.brg)}°</span>
                </div>
              )}
              <div className="flex items-center justify-between text-sm">
                <span style={{ color: COLORS.muted }}>Statut</span>
                <span style={{ color: COLORS.text }}>
                  {selectedBoat.status === "en_route" ? "En route" : selectedBoat.status === "ancre" ? "À l'ancre" : "À quai"}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span style={{ color: COLORS.muted }}>Dernière position</span>
                <span style={{ color: selectedBoat.stale ? COLORS.red : COLORS.text }}>{timeAgo(selectedBoat.updatedAt)}</span>
              </div>
              {myConvoy && myConvoyMemberIds.includes(selectedBoat.id) && (
                <div className="flex items-center justify-between text-sm">
                  <span style={{ color: COLORS.muted }}>Convoi commun</span>
                  <span style={{ color: COLORS.cyan }}>{myConvoy.name}</span>
                </div>
              )}
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => { openDmWith(selectedBoat.id); setSelectedBoat(null); }}
                className="flex-1 py-2 rounded text-sm font-medium" style={{ background: "rgba(140,122,230,0.2)", color: "#8C7AE6", border: "1px solid #8C7AE6" }}>
                Message
              </button>
              <button onClick={() => { setAlertFocus({ lat: selectedBoat.lat, lon: selectedBoat.lon, id: `boat-${selectedBoat.id}`, ts: Date.now() }); setSelectedBoat(null); setTab("carte"); }}
                className="flex-1 py-2 rounded text-sm font-medium" style={{ background: "transparent", color: COLORS.cyan, border: `1px solid ${COLORS.cyanDim}` }}>
                Voir sur la carte
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fiche point d'intérêt (chantier naval / station de secours / élevage) : s'ouvre au clic
          sur le marqueur et reste ouverte tant qu'on ne la ferme pas explicitement — remplace
          l'ancienne bulle Leaflet au survol, qui disparaissait dès qu'on quittait le marqueur
          des yeux (ou ne s'affichait jamais au tactile). */}
      {selectedPlace && (
        <div className="fixed inset-0 flex items-end justify-center z-[1300]" style={{ background: "rgba(0,0,0,0.6)" }} onClick={() => setSelectedPlace(null)}>
          <div className="w-full max-w-sm rounded-t-xl p-5" style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}` }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <span style={{ fontSize: 26 }}>{selectedPlace.icon}</span>
                <p className="text-sm font-medium" style={{ color: COLORS.text }}>{selectedPlace.name}</p>
              </div>
              <button onClick={() => setSelectedPlace(null)}><X size={18} style={{ color: COLORS.muted }} /></button>
            </div>
            <div className="pt-3 space-y-2" style={{ borderTop: `1px solid ${COLORS.border}` }}>
              <div className="text-sm" style={{ color: COLORS.text }}>{selectedPlace.address}</div>
              {selectedPlace.species && (
                <div className="text-sm" style={{ color: COLORS.muted }}>{selectedPlace.species}</div>
              )}
              {(selectedPlace.vhf || selectedPlace.phone) && (
                <div className="flex items-center gap-3 text-sm" style={{ color: COLORS.text }}>
                  {selectedPlace.vhf && <span>VHF {selectedPlace.vhf}</span>}
                  {selectedPlace.phone && <span>☎ {selectedPlace.phone}</span>}
                </div>
              )}
              {selectedPlace.type === "farm" && (
                <div className="text-xs" style={{ color: COLORS.muted }}>{t.approxPosition}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Fiche observation/incident cliqué sur la carte (marqueur d'espèce, orques compris) :
          avant, un clic pouvait afficher à la fois la bulle au survol ET la fenêtre de
          suppression — désormais un seul clic, une seule mini-fenêtre. */}
      {selectedAlert && (() => {
        const a = selectedAlert;
        const sp = speciesInfo(a.species || "orque");
        const canDelete = profile && (a.authorId === profile.id || profile.isModerator);
        return (
          <div className="fixed inset-0 flex items-end justify-center z-[1300]" style={{ background: "rgba(0,0,0,0.6)" }} onClick={() => setSelectedAlert(null)}>
            <div className="w-full max-w-sm rounded-t-xl p-5" style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}` }} onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span style={{ fontSize: 26 }}>{sp.emoji}</span>
                  <div>
                    <p className="text-sm font-medium" style={{ color: COLORS.text }}>
                      {a.incident ? "⚠️ Incident" : "Observation"} · {a.count} {a.count > 1 ? sp.labelPlural : sp.label.toLowerCase()}
                    </p>
                    <p className="text-xs" style={{ color: COLORS.muted }}>{fmtDateTime(new Date(a.createdAt).toISOString())} · {a.author}</p>
                  </div>
                </div>
                <button onClick={() => setSelectedAlert(null)}><X size={18} style={{ color: COLORS.muted }} /></button>
              </div>
              <div className="pt-3 space-y-2" style={{ borderTop: `1px solid ${COLORS.border}` }}>
                <div className="text-sm" style={{ color: COLORS.text }}>{a.lat.toFixed(4)}, {a.lon.toFixed(4)}</div>
                {a.notes && <div className="text-sm" style={{ color: COLORS.muted }}>{a.notes}</div>}
              </div>
              {canDelete && (
                <button
                  onClick={() => { deleteAlert(a.id); setSelectedAlert(null); }}
                  className="w-full mt-4 py-2 rounded text-sm font-medium"
                  style={{ background: COLORS.red, color: "#FFFFFF" }}
                >
                  Supprimer ce signalement
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {/* Fiche convoi cliqué sur la carte (repère RDV/destination ou tracé du couloir) : même
          habillage mini-fenêtre que le reste, avec les dates de départ/arrivée du convoi. */}
      {selectedConvoyMarker && (
        <div className="fixed inset-0 flex items-end justify-center z-[1300]" style={{ background: "rgba(0,0,0,0.6)" }} onClick={() => setSelectedConvoyMarker(null)}>
          <div className="w-full max-w-sm rounded-t-xl p-5" style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}` }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-medium" style={{ color: COLORS.text }}>{selectedConvoyMarker.convoy.name}</p>
                {selectedConvoyMarker.headline && (
                  <p className="text-xs" style={{ color: COLORS.muted }}>{selectedConvoyMarker.headline}</p>
                )}
              </div>
              <button onClick={() => setSelectedConvoyMarker(null)}><X size={18} style={{ color: COLORS.muted }} /></button>
            </div>
            <div className="pt-3 space-y-2" style={{ borderTop: `1px solid ${COLORS.border}` }}>
              <div className="flex items-center justify-between text-sm">
                <span style={{ color: COLORS.muted }}>{t.convoyOrganizedBy(selectedConvoyMarker.convoy.organizerPseudo, selectedConvoyMarker.convoy.organizerBoat)}</span>
              </div>
              {selectedConvoyMarker.convoy.departureAt && (
                <div className="flex items-center justify-between text-sm">
                  <span style={{ color: COLORS.muted }}>{t.departureLabel}</span>
                  <span style={{ color: COLORS.text }}>{fmtDateRange(selectedConvoyMarker.convoy.departureAt)}</span>
                </div>
              )}
              {selectedConvoyMarker.convoy.etaAt && (
                <div className="flex items-center justify-between text-sm">
                  <span style={{ color: COLORS.muted }}>{t.etaLabel}</span>
                  <span style={{ color: COLORS.text }}>{fmtDateRange(selectedConvoyMarker.convoy.etaAt)}</span>
                </div>
              )}
              {(selectedConvoyMarker.convoy.departureAt || selectedConvoyMarker.convoy.etaAt) && (
                <div className="text-xs" style={{ color: COLORS.muted }}>{t.weatherMarginNote}</div>
              )}
            </div>
            {Array.isArray(selectedConvoyMarker.convoy.waypoints) && selectedConvoyMarker.convoy.waypoints.length > 0 && (
              <div className="pt-3 mt-3 space-y-1.5" style={{ borderTop: `1px solid ${COLORS.border}` }}>
                <p className="text-xs font-medium" style={{ color: COLORS.muted }}>{t.stagesLabel}</p>
                {selectedConvoyMarker.convoy.waypoints.map((wp, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 text-sm">
                    <span style={{ color: COLORS.text }}>{i + 1}. {wp.label || "—"}</span>
                    {wp.etaAt && <span className="shrink-0" style={{ color: COLORS.muted }}>{fmtDateRange(wp.etaAt)}</span>}
                  </div>
                ))}
              </div>
            )}
            {selectedConvoyMarker.isMine ? (
              <div className="mt-4 text-sm font-medium" style={{ color: COLORS.green }}>{t.convoyYours}</div>
            ) : selectedConvoyMarker.isPending ? (
              <div className="mt-4 text-sm" style={{ color: COLORS.muted }}>{t.convoyPending}</div>
            ) : (
              <button
                onClick={() => { onJoinConvoy(selectedConvoyMarker.convoy.id); setSelectedConvoyMarker(null); }}
                className="w-full mt-4 py-2 rounded text-sm font-medium"
                style={{ background: COLORS.green, color: "#0A1F14" }}
              >
                {t.convoyJoinBtn}
              </button>
            )}
          </div>
        </div>
      )}

      {renderImportModal()}
      {renderHiddenFileInput()}
     <div style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0, 0, 0, 0)", whiteSpace: "nowrap", border: 0 }}>
  <SeoContent />
</div>
    </div>
  );
}
