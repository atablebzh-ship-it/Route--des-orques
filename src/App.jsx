import SeoContent from './SeoContent';
import React, { useState, useEffect, useRef, useCallback } from "react";
import { Anchor, Navigation, AlertTriangle, MessageCircle, Send, Compass, Users, X, Plus, LocateFixed, LogOut, Waves, Check, Clock, Flag, Download } from "lucide-react";
import { storage, supabase } from "./lib/storage.js";

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap');

.leaflet-top.leaflet-left {
  margin-top: 64px !important;
}

.leaflet-tooltip.orca-tooltip {
  background: #0F1F38;
  color: #E8EDF2;
  border: 1px solid #1E3A5F;
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.5;
  padding: 8px 12px;
  border-radius: 8px;
  box-shadow: 0 4px 14px rgba(0,0,0,0.45);
  text-align: center;
}
.leaflet-tooltip.orca-tooltip::before {
  display: none;
}
.orca-tooltip-title {
  font-family: 'Oswald', sans-serif;
  font-size: 13px;
  letter-spacing: 0.02em;
  color: #E8EDF2;
}
.orca-tooltip-meta {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: #6C87A6;
}
.orca-tooltip-notes {
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  color: #E8EDF2;
  opacity: 0.9;
}
`;

const COLORS = {
  bg: "#0A1628",
  panel: "#0F1F38",
  panelAlt: "#12283F",
  border: "#1E3A5F",
  text: "#E8EDF2",
  muted: "#6C87A6",
  cyan: "#4FC3D9",
  cyanDim: "#2C6B78",
  orange: "#FF6B35",
  orangeDim: "#7A3A1F",
  green: "#4CAF7D",
  greenDim: "#265C42",
};

const STALE_MS = 15 * 60 * 1000;
const POLL_MS = 7000;
const TRAIL_MAX_POINTS = 40; // nombre de points conservés par bateau pour la trace
const TRAIL_MAX_AGE_MS = 3 * 3600 * 1000; // profondeur de la trace : 3 h
const MAX_CHAT = 150;
const MAX_ALERTS = 300; // couvre les signalements récents + l'historique de la saison
const MAX_CONVOYS = 40;
const RECENT_ALERT_MS = 6 * 3600 * 1000;

// Sources officielles pour l'historique des interactions orques hors signalements de la communauté
const OFFICIAL_ORCA_SOURCES = [
  { label: "GTOA — Groupe de Travail Orques Atlantique", url: "https://gtoa.fr" },
  { label: "Cruising Association — Orca Attack Reports", url: "https://theca.org.uk/orca-alert" },
];

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
  { name: "A Coruña", lat: 43.55, lon: -8.55 },
  { name: "Cabo Fisterra", lat: 42.85, lon: -9.45 },
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
  if (iA === iB) return [start, end];
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
          className="flex flex-col items-center justify-center gap-1 px-3 py-2.5 rounded-full shadow-lg"
          style={{
            color: active ? COLORS.cyan : COLORS.text,
            background: active ? COLORS.cyanDim : "rgba(18,40,63,0.92)",
            backdropFilter: "blur(12px)",
            border: `1px solid ${active ? COLORS.cyan : COLORS.cyanDim}`,
            opacity: active ? 1 : 0.85,
            minWidth: 60,
          }}
        >
      {children}
      <span className="text-xs font-medium" style={{ fontFamily: "Inter, sans-serif" }}>{label}</span>
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
const PICK_CURSOR = `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44"><line x1="22" y1="2" x2="22" y2="42" stroke="%23FF6B35" stroke-width="5"/><line x1="2" y1="22" x2="42" y2="22" stroke="%23FF6B35" stroke-width="5"/><circle cx="22" cy="22" r="10" fill="none" stroke="%23FF6B35" stroke-width="5"/></svg>') 22 22, crosshair`;

// --- Carte marine réelle (Leaflet + OpenStreetMap + OpenSeaMap), chargée via CDN dans index.html ---
function MarineMap({ pos, others, alertsWithDist, myConvoy, myConvoyMemberIds, now, onSelectBoat, showShipyards, showRescueStations, pickMode, onPickLocation, trails, showTrails, myBoatId, focusTarget }) {
  const mapElRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);  const pickModeRef = useRef(pickMode);
  const onPickLocationRef = useRef(onPickLocation);
  const alertMarkersRef = useRef({});
  useEffect(() => { pickModeRef.current = pickMode; }, [pickMode]);
  useEffect(() => { onPickLocationRef.current = onPickLocation; }, [onPickLocation]);

  useEffect(() => {
    if (!mapElRef.current || mapRef.current || !window.L) return;
    const map = window.L.map(mapElRef.current, { zoomControl: true, attributionControl: true }).setView(
      pos ? [pos.lat, pos.lon] : [47.0, -3.0],
      pos ? 10 : 5
    );
    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);
    window.L.tileLayer("https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png", {
      maxZoom: 18,
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

    others.forEach((b) => {
      if (b.lat == null || b.lon == null) return;
      const inMyConvoy = myConvoyMemberIds.includes(b.id);
      const c = b.stale ? COLORS.muted : inMyConvoy ? COLORS.green : COLORS.cyan;
      const boatDesc = `${b.pseudo} · ${b.boatName}${b.stale ? " · inactif" : ""}`;
      window.L.circleMarker([b.lat, b.lon], {
        radius: 10, color: c, fillColor: c, fillOpacity: b.stale ? 0.5 : 1, weight: 3,
      })
        .bindTooltip(boatDesc, { direction: "top", sticky: true, className: "orca-tooltip", opacity: 1 })
        .on("click", () => onSelectBoat && onSelectBoat(b))
        .addTo(layer);
    });

    alertMarkersRef.current = {};
    alertsWithDist.forEach((a) => {
      const isRecent = now - a.createdAt < RECENT_ALERT_MS;
      const color = a.incident ? COLORS.orange : COLORS.cyan;
      const size = isRecent ? 44 : 32;
      const orcaIcon = window.L.divIcon({
        html: `<div style="background:${color};width:${size}px;height:${size}px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid #0A1628;box-shadow:0 0 0 ${isRecent ? 7 : 4}px ${color}55;opacity:${isRecent ? 1 : 0.75};font-size:${isRecent ? 22 : 17}px;">🐋</div>`,
        className: "",
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });
      const alertDesc = `
        <div class="orca-tooltip-title">${a.incident ? "⚠️ Incident" : "Observation"} · ${a.count} orque${a.count > 1 ? "s" : ""}</div>
        <div class="orca-tooltip-meta">${fmtDateTime(new Date(a.createdAt).toISOString())} · ${a.author}</div>
        <div class="orca-tooltip-meta">${a.lat.toFixed(4)}, ${a.lon.toFixed(4)}</div>
        ${a.notes ? `<div class="orca-tooltip-notes">${a.notes}</div>` : ""}
      `;
      const alertMarker = window.L.marker([a.lat, a.lon], { icon: orcaIcon })
        .bindTooltip(alertDesc, { direction: "top", sticky: true, className: "orca-tooltip", opacity: 1 })
        .addTo(layer);
      alertMarkersRef.current[a.id] = alertMarker;
    });

    if (myConvoy) {
      const hasRdv = myConvoy.rdvLat != null && myConvoy.rdvLon != null;
      const hasDest = myConvoy.destLat != null && myConvoy.destLon != null;

      if (hasRdv) {
        const rdvDesc = `RDV · ${myConvoy.name}${myConvoy.rdvLabel ? ` · ${myConvoy.rdvLabel}` : ""}`;
        const rdvIcon = window.L.divIcon({
          html: `<div style="width:42px;height:42px;display:flex;align-items:center;justify-content:center;font-size:36px;line-height:1;filter:drop-shadow(0 2px 3px rgba(0,0,0,0.7));">🏁</div>`,
          className: "",
          iconSize: [42, 42],
          iconAnchor: [21, 21],
        });
        window.L.marker([myConvoy.rdvLat, myConvoy.rdvLon], { icon: rdvIcon })
          .bindTooltip(rdvDesc, { direction: "top", sticky: true, className: "orca-tooltip", opacity: 1 })
          .addTo(layer);
      }

      if (hasDest) {
        const destDesc = `Destination · ${myConvoy.name}${myConvoy.destLabel ? ` · ${myConvoy.destLabel}` : ""}`;
        const destIcon = window.L.divIcon({
          html: `<div style="width:42px;height:42px;display:flex;align-items:center;justify-content:center;font-size:36px;line-height:1;filter:drop-shadow(0 2px 3px rgba(0,0,0,0.7));">🏁</div>`,
          className: "",
          iconSize: [42, 42],
          iconAnchor: [21, 21],
        });
        window.L.marker([myConvoy.destLat, myConvoy.destLon], { icon: destIcon })
          .bindTooltip(destDesc, { direction: "top", sticky: true, className: "orca-tooltip", opacity: 1 })
          .addTo(layer);
      }

      if (hasRdv && hasDest) {
        // Tracé automatique : longe le couloir maritime SEA_LANE plutôt qu'une ligne droite.
        const seaRoute = computeSeaRoute(
          { lat: myConvoy.rdvLat, lon: myConvoy.rdvLon },
          { lat: myConvoy.destLat, lon: myConvoy.destLon }
        );
        const routeLatLngs = seaRoute
          ? seaRoute.map((p) => [p.lat, p.lon])
          : [[myConvoy.rdvLat, myConvoy.rdvLon], [myConvoy.destLat, myConvoy.destLon]];
        window.L.polyline(
          routeLatLngs,
          { color: "#000000", weight: 5, opacity: 0.9, dashArray: "12 10", lineCap: "round" }
        )
          .bindTooltip(`Route du convoi · ${myConvoy.name}`, { direction: "top", sticky: true, className: "orca-tooltip", opacity: 1 })
          .addTo(layer);
      }
    }

    if (showShipyards) {
      const wrenchIcon = window.L.divIcon({
        html: `<div style="background:${COLORS.green};width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid #0A1F14;font-size:19px;">🛠️</div>`,
        className: "",
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });
      SHIPYARDS.forEach((s) => {
        const yardTooltip = `<div class="orca-tooltip-title">${s.name}</div><div class="orca-tooltip-meta">${s.address}${s.phone ? ` · ${s.phone}` : ""}</div>`;
        window.L.marker([s.lat, s.lon], { icon: wrenchIcon })
          .bindTooltip(yardTooltip, { direction: "top", sticky: true, className: "orca-tooltip", opacity: 1 })
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
        const contactLine = contact ? `<div class="orca-tooltip-meta">VHF ${contact.vhf} · ☎ ${contact.phone}</div>` : "";
        const stationTooltip = `<div class="orca-tooltip-title">${s.name}</div><div class="orca-tooltip-meta">${s.address}</div>${contactLine}`;
        window.L.marker([s.lat, s.lon], { icon: buoyIcon })
          .bindTooltip(stationTooltip, { direction: "top", sticky: true, className: "orca-tooltip", opacity: 1 })
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
        const color = isMe ? COLORS.orange : inConvoy ? COLORS.green : COLORS.cyan;

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
  }, [pos, others, alertsWithDist, myConvoy, myConvoyMemberIds, now, onSelectBoat, showShipyards, showRescueStations, trails, showTrails, myBoatId]);

  // Centre/zoome la carte et ouvre la bulle du marqueur correspondant quand on clique
  // sur une alerte dans la liste (géolocalisation visuelle demandée depuis l'onglet Alertes).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusTarget || focusTarget.lat == null || focusTarget.lon == null) return;
    map.setView([focusTarget.lat, focusTarget.lon], Math.max(map.getZoom(), 12), { animate: true });
    const marker = alertMarkersRef.current[focusTarget.id];
    if (marker) marker.openTooltip();
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
    tabAlerts: "Alertes",
    tabChat: "Chat",
    tabProfile: "Moi",
    activeLabel: (n) => `${n} actif${n > 1 ? "s" : ""}`,
    alertsRecent: "Récentes",
    alertsHistory: "Historique",
    noRecentAlerts: "Aucune observation signalée récemment.",
    noHistoryAlerts: "Aucun signalement dans l'historique pour l'instant.",
    officialSourcesTitle: "Sources officielles",
    officialSourcesDesc: "Pour les données antérieures et les statistiques complètes d'interactions orques :",
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
    tabAlerts: "Alerts",
    tabChat: "Chat",
    tabProfile: "Me",
    activeLabel: (n) => `${n} active`,
    alertsRecent: "Recent",
    alertsHistory: "History",
    noRecentAlerts: "No sightings reported recently.",
    noHistoryAlerts: "No reports in the history yet.",
    officialSourcesTitle: "Official sources",
    officialSourcesDesc: "For past data and full orca interaction statistics:",
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
    tabAlerts: "Alertas",
    tabChat: "Chat",
    tabProfile: "Yo",
    activeLabel: (n) => `${n} activo${n > 1 ? "s" : ""}`,
    alertsRecent: "Recientes",
    alertsHistory: "Historial",
    noRecentAlerts: "No se han señalado avistamientos recientemente.",
    noHistoryAlerts: "Aún no hay reportes en el historial.",
    officialSourcesTitle: "Fuentes oficiales",
    officialSourcesDesc: "Para datos anteriores y estadísticas completas de interacciones con orcas:",
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
    tabAlerts: "Alertas",
    tabChat: "Chat",
    tabProfile: "Eu",
    activeLabel: (n) => `${n} ativo${n > 1 ? "s" : ""}`,
    alertsRecent: "Recentes",
    alertsHistory: "Histórico",
    noRecentAlerts: "Nenhum avistamento reportado recentemente.",
    noHistoryAlerts: "Ainda não há relatos no histórico.",
    officialSourcesTitle: "Fontes oficiais",
    officialSourcesDesc: "Para dados anteriores e estatísticas completas de interações com orcas:",
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
  const [showShipyards, setShowShipyards] = useState(true);
  const [showRescueStations, setShowRescueStations] = useState(true);
  const [alertFocus, setAlertFocus] = useState(null);
  const [showTrails, setShowTrails] = useState(true);
  const [trails, setTrails] = useState({});
  const [showConvoyForm, setShowConvoyForm] = useState(false);
  const [alertCount, setAlertCount] = useState("");
  const [alertNotes, setAlertNotes] = useState("");
  const [alertIncident, setAlertIncident] = useState(false);
  const [alertLat, setAlertLat] = useState(null);
  const [alertLon, setAlertLon] = useState(null);
  const [alertLocating, setAlertLocating] = useState(false);
  const [chatText, setChatText] = useState("");
  const [selectedBoat, setSelectedBoat] = useState(null);
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
    });
    return () => listener.subscription.unsubscribe();
  }, []);

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
  setProfile({ id: p.id, pseudo: p.pseudo, boatName: p.boat_name });
  if (p.last_lat && p.last_lon) setPos({ lat: p.last_lat, lon: p.last_lon });
}
      } catch (e) {}
      setReady(true);
    })();
  }, [session]);

  // --- Notifications push ---
  const sendPush = useCallback(async (boatIds, title, body, url) => {
    try {
      const ids = (boatIds || []).filter((id) => id && id !== profile?.id);
      if (ids.length === 0) return;
      await supabase.functions.invoke("send-push", { body: { boatIds: ids, title, body, url } });
    } catch (e) {}
  }, [profile]);

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
      const [boatsRes, alertsRes, chatRes, convoysRes, membersRes] = await Promise.all([
        supabase.from("boats").select("*"),
        supabase.from("alerts").select("*").order("created_at", { ascending: false }).limit(MAX_ALERTS),
        supabase.from("chat_messages").select("*").order("created_at", { ascending: true }).limit(MAX_CHAT),
        supabase.from("convoys").select("*").order("created_at", { ascending: false }).limit(MAX_CONVOYS),
        supabase.from("convoy_members").select("*"),
      ]);

      if (boatsRes.data) {
        const map = {};
        boatsRes.data.forEach((b) => {
          map[b.id] = {
            id: b.id, pseudo: b.pseudo, boatName: b.boat_name, lat: b.lat, lon: b.lon,
            heading: b.heading, status: b.status, updatedAt: new Date(b.updated_at).getTime(),
          };
        });
        setBoats(map);
      }

      if (alertsRes.data) {
        setAlerts(alertsRes.data.map((a) => ({
          id: a.id, authorId: a.author_id, author: a.author, boatName: a.boat_name,
          lat: a.lat, lon: a.lon, count: a.count, notes: a.notes, incident: !!a.incident, createdAt: new Date(a.created_at).getTime(),
        })));
      }

      if (chatRes.data) {
        setChat(chatRes.data.map((m) => ({
          id: m.id, author: m.author, boatName: m.boat_name, text: m.text, createdAt: new Date(m.created_at).getTime(),
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
          createdAt: new Date(cv.created_at).getTime(),
          members: membersByConvoy[cv.id] || [],
        })));
      }
    } catch (e) {}
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
  }, [chat, tab]);

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
            [profile.id]: { id: profile.id, pseudo: profile.pseudo, boatName: profile.boatName, lat, lon, heading: headingVal, status, updatedAt: Date.now() },
          }));
        }
      } catch (e) {}
      setSaving(false);
    },
    [profile, pos, heading, status]
  );

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
    setAlertLat(pos?.lat ?? null);
    setAlertLon(pos?.lon ?? null);
    setAlertCount("1");
    setAlertIncident(false);
    setShowAlertForm(true);
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
      const { data, error } = await supabase
        .from("alerts")
        .insert({ author_id: profile.id, author: profile.pseudo, boat_name: profile.boatName, lat, lon, count, notes: alertNotes.trim(), incident: alertIncident })
        .select()
        .single();
      if (!error && data) {
        const entry = {
          id: data.id, authorId: data.author_id, author: data.author, boatName: data.boat_name,
          lat: data.lat, lon: data.lon, count: data.count, notes: data.notes, incident: !!data.incident, createdAt: new Date(data.created_at).getTime(),
        };
        setAlerts((prev) => [entry, ...prev].slice(0, MAX_ALERTS));
      }
      setAlertCount("");
      setAlertNotes("");
      setAlertIncident(false);
      setAlertLat(null);
      setAlertLon(null);
      setShowAlertForm(false);
      setTab("alerts");

      const myConvoyNow = convoys.find((cv) => cv.members.some((m) => m.boatId === profile.id && m.status === "confirme"));
      if (myConvoyNow) {
        const memberIds = myConvoyNow.members.filter((m) => m.status === "confirme").map((m) => m.boatId);
        sendPush(memberIds, "Orques signalées", `${profile.pseudo} a signalé ${count} orque${count > 1 ? "s" : ""} près de votre convoi`, "/");
      }
    } catch (e) {}
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
          .filter((b) => b.id !== profile.id && b.lat != null && b.lon != null)
          .filter((b) => distanceKm(rdvLat, rdvLon, b.lat, b.lon) <= NEARBY_KM)
          .map((b) => b.id);
        sendPush(nearbyIds, "Nouveau convoi près de toi", `${profile.pseudo} organise "${cv.name}"`, "/");
      }
      setCvName(""); setCvRdv(""); setCvRdvLat(null); setCvRdvLon(null);
      setCvDeparture(""); setCvDest(""); setCvDestLat(null); setCvDestLon(null); setCvEta("");
      setShowConvoyForm(false);
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
    setTab("convois");
  }
};

const startPicking = (target) => {
  setPickTarget(target);
  setShowConvoyForm(false);
  setShowAlertForm(false);
  setTab("carte");
};const openConvoyForm = () => {
    setCvRdvLat(pos?.lat ?? null);
    setCvRdvLon(pos?.lon ?? null);
    setShowConvoyForm(true);
  };

  const requestJoin = async (convoyId) => {
    try {
      await supabase.from("convoy_members").insert({ convoy_id: convoyId, boat_id: profile.id, pseudo: profile.pseudo, boat_name: profile.boatName, status: "en_attente" });
      await fetchShared();
      const cv = convoys.find((c) => c.id === convoyId);
      if (cv) {
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
      if (accept) {
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

  const proposeConvoyViaChat = (boat) => {
    setChatText(`${profile.pseudo} propose de naviguer avec ${boat.pseudo} (${boat.boatName}) — rejoins un convoi dans l'onglet Convois ou on se cale ici.`);
    setTab("chat");
  };

  if (!authReady) {    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: COLORS.bg }}>
        <style>{FONTS}</style>
        <Waves className="animate-pulse" size={32} style={{ color: COLORS.cyan }} />
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
          <Panel className="p-5 space-y-4">
            {linkSent ? (
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

  const alertsWithDist = alerts.map((a) => ({
    ...a,
    dist: pos ? distanceKm(pos.lat, pos.lon, a.lat, a.lon) : null,
    brg: pos ? bearingDeg(pos.lat, pos.lon, a.lat, a.lon) : null,
  }));

  const activeCount = others.filter((b) => !b.stale).length;
  const myConvoy = convoys.find((cv) => cv.members.some((m) => m.boatId === profile.id && m.status === "confirme"));
  const myConvoyMemberIds = myConvoy ? myConvoy.members.filter((m) => m.status === "confirme").map((m) => m.boatId) : [];

    return (
   <div className="relative overflow-hidden" style={{ background: COLORS.bg, fontFamily: "Inter, sans-serif", position: "fixed", inset: 0 }}>
      <style>{FONTS}</style>

      {/* Carte marine plein écran, en fond */}
      <div className="absolute inset-0">
        <MarineMap
          pos={pos}
          others={others}
          alertsWithDist={alertsWithDist}
          myConvoy={myConvoy}
          myConvoyMemberIds={myConvoyMemberIds}
          now={now}
          onSelectBoat={setSelectedBoat}
                showShipyards={showShipyards}
                showRescueStations={showRescueStations}
                pickMode={!!pickTarget}
                onPickLocation={handlePickLocation}
                trails={trails}
                showTrails={showTrails}
                myBoatId={profile.id}
                focusTarget={alertFocus}
              />
      </div>

      {/* Header flottant */}
      <div className="absolute top-0 left-0 right-0 z-[1100] flex items-center justify-between px-4 py-3"
        style={{ background: "rgba(10,22,40,0.82)", backdropFilter: "blur(10px)", borderBottom: `1px solid ${COLORS.border}` }}>
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

      {/* Panneau flottant pour les onglets autres que la carte */}
      {tab !== "carte" && (
        <div className="absolute left-0 right-0 z-[1100] flex justify-center px-3" style={{ bottom: 92 }}>
          <div className="w-full flex flex-col rounded-xl overflow-hidden" style={{ maxWidth: 480, maxHeight: "62vh", background: "rgba(15,31,56,0.94)", backdropFilter: "blur(12px)", border: `1px solid ${COLORS.border}` }}>
            <div className="overflow-y-auto px-4 py-4" style={{ flex: 1 }}>

              {tab === "convois" && (
                <div className="space-y-2">
                  <button onClick={openConvoyForm}
                    className="w-full py-2.5 rounded font-medium text-sm mb-2 flex items-center justify-center gap-2"
                    style={{ background: COLORS.green, color: "#0A1F14" }}>
                    <Plus size={16} /> Créer un convoi
                  </button>

                  {convoys.length === 0 ? (
                    <Panel className="p-4 text-center">
                      <p className="text-sm" style={{ color: COLORS.muted }}>Aucun convoi pour l'instant. Crée le premier et invite les plaisanciers proches.</p>
                    </Panel>
                  ) : (
                    convoys.map((cv) => {
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
                              {confirmed.map((m) => (
                                <div key={m.boatId} className="flex items-center justify-between text-sm">
                                  <span style={{ color: COLORS.text }}>{m.pseudo} · {m.boatName}</span>
                                  <Check size={14} style={{ color: COLORS.green }} />
                                </div>
                              ))}
                              {isOrganizer && pending.map((m) => (
                                <div key={m.boatId} className="flex items-center justify-between text-sm">
                                  <span style={{ color: COLORS.text }}>{m.pseudo} · {m.boatName}</span>
                                  <div className="flex gap-2">
                                    <button onClick={() => respondRequest(cv.id, m.boatId, true)}
                                      className="text-xs px-2 py-1 rounded" style={{ color: COLORS.green, border: `1px solid ${COLORS.greenDim}` }}>Accepter</button>
                                    <button onClick={() => respondRequest(cv.id, m.boatId, false)}
                                      className="text-xs px-2 py-1 rounded" style={{ color: COLORS.orange, border: `1px solid ${COLORS.orangeDim}` }}>Refuser</button>
                                  </div>
                                </div>
                              ))}
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
                    <Plus size={16} /> Signaler des orques
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
                            {shown.map((a) => (
                              <Panel key={a.id} className="p-3 cursor-pointer" onClick={() => { setAlertFocus({ lat: a.lat, lon: a.lon, id: a.id, ts: Date.now() }); setTab("carte"); }}
                                title="Localiser ce marqueur sur la carte">
                                <div className="flex items-start justify-between">
                                  <div className="flex items-center gap-2">
                                    {a.incident ? (
                                      <AlertTriangle size={16} style={{ color: COLORS.orange }} />
                                    ) : (
                                      <Waves size={16} style={{ color: COLORS.cyan }} />
                                    )}
                                    <span className="text-sm font-medium" style={{ color: COLORS.text }}>{a.count} orque{a.count > 1 ? "s" : ""}</span>
                                  </div>
                                  <span className="text-xs" style={{ color: COLORS.muted }}>
                                    {alertsView === "recentes" ? timeAgo(a.createdAt) : fmtDateTime(new Date(a.createdAt).toISOString())}
                                  </span>
                                </div>
                                {a.notes && <p className="text-sm mt-1.5" style={{ color: COLORS.text }}>{a.notes}</p>}
                                <div className="flex items-center justify-between mt-1.5">
                                  <p className="text-xs" style={{ color: COLORS.muted, fontFamily: "JetBrains Mono, monospace" }}>
                                    {a.author} · {a.boatName}{a.dist !== null ? ` · ${a.dist.toFixed(1)} km (cap ${Math.round(a.brg)}°)` : ""}
                                  </p>
                                  <div className="flex items-center gap-2">
                                    <span className="flex items-center gap-1 text-xs" style={{ color: COLORS.cyan }}>
                                      <LocateFixed size={13} /> Voir
                                    </span>
                                    <button onClick={(e) => { e.stopPropagation(); exportAlertGPX(a); }} title="Exporter ce point en GPX" style={{ color: COLORS.muted }}>
                                      <Download size={14} />
                                    </button>
                                  </div>
                                </div>
                              </Panel>
                            ))}
                          </div>
                        )}

                        {alertsView === "historique" && (
                          <Panel className="p-4 mt-3">
                            <p className="text-xs uppercase tracking-wider mb-1.5" style={{ color: COLORS.muted }}>{t.officialSourcesTitle}</p>
                            <p className="text-sm mb-2" style={{ color: COLORS.text }}>{t.officialSourcesDesc}</p>
                            <div className="space-y-1.5">
                              {OFFICIAL_ORCA_SOURCES.map((s) => (
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

            {tab === "chat" && (
              <div className="flex items-center gap-2 px-4 py-3 border-t" style={{ borderColor: COLORS.border }}>
                <input value={chatText} onChange={(e) => setChatText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                  placeholder="Écrire un message…" className="flex-1 px-3 py-2 rounded outline-none text-sm" style={inputStyle} />
                <button onClick={sendMessage} className="p-2.5 rounded" style={{ background: COLORS.orange, color: "#1A0E08" }}>
                  <Send size={16} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Barre d'onglets flottante */}
      <div className="absolute left-0 right-0 z-[1200] flex justify-center px-4" style={{ bottom: 20 }}>
       <div className="flex" style={{ gap: 10 }}>
          <IconBtn onClick={() => setTab("carte")} active={tab === "carte"} label={t.tabCarte}><Navigation size={17} /></IconBtn>
          <IconBtn onClick={() => setTab("convois")} active={tab === "convois"} label={t.tabConvois}><Users size={17} /></IconBtn>
          <IconBtn onClick={() => setTab("alerts")} active={tab === "alerts"} label={t.tabAlerts}><AlertTriangle size={17} /></IconBtn>
          <IconBtn onClick={() => setTab("chat")} active={tab === "chat"} label={t.tabChat}><MessageCircle size={17} /></IconBtn>
          <IconBtn onClick={() => setTab("profile")} active={tab === "profile"} label={t.tabProfile}><Anchor size={17} /></IconBtn>
        </div>
      </div>

      {showAlertForm && (
        <div className="fixed inset-0 flex items-end justify-center z-[1300]" style={{ background: "rgba(0,0,0,0.6)" }}>
          <div className="w-full max-w-sm rounded-t-xl p-5" style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}` }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-sm" style={{ color: COLORS.text, fontFamily: "Oswald, sans-serif" }}>SIGNALER DES ORQUES</h3>
              <button onClick={() => setShowAlertForm(false)}><X size={18} style={{ color: COLORS.muted }} /></button>
            </div>
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
              Publier l'alerte
            </button>
          </div>
        </div>
      )}

      {showConvoyForm && (
        <div className="fixed inset-0 flex items-end justify-center z-[1300]" style={{ background: "rgba(0,0,0,0.6)" }}>
          <div className="w-full max-w-sm rounded-t-xl p-5 overflow-y-auto" style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, maxHeight: "85vh" }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-sm" style={{ color: COLORS.text, fontFamily: "Oswald, sans-serif" }}>CRÉER UN CONVOI</h3>
              <button onClick={() => setShowConvoyForm(false)}><X size={18} style={{ color: COLORS.muted }} /></button>
            </div>
            <div className="space-y-3">
              <Field label="Nom du convoi">
                <input value={cvName} onChange={(e) => setCvName(e.target.value)} placeholder="Ex. Traversée du détroit - matinée"
                  className="w-full px-3 py-2 rounded outline-none text-sm" style={inputStyle} />
              </Field>
              <Field label="Point de rendez-vous (description)">
                <input value={cvRdv} onChange={(e) => setCvRdv(e.target.value)} placeholder="Ex. Sortie du port, bouée verte"
                  className="w-full px-3 py-2 rounded outline-none text-sm" style={inputStyle} />
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
              <Field label="Destination"><input value={cvDest} onChange={(e) => setCvDest(e.target.value)} placeholder="Ex. Port de Saint-Jean-de-Luz"
                  className="w-full px-3 py-2 rounded outline-none text-sm" style={inputStyle} />
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

      {renderImportModal()}
      {renderHiddenFileInput()}
     <div style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0, 0, 0, 0)", whiteSpace: "nowrap", border: 0 }}>
  <SeoContent />
</div>
    </div>
  );
}
