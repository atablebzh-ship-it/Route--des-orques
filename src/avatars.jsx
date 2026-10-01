import React, { useRef, useState } from "react";

// Logos de marqueur proposés aux utilisateurs. Valeur stockée : l'identifiant ci-dessous,
// ou une photo (data URL JPEG 64x64). Sans choix -> "sailboat" (petit voilier).
export const DEFAULT_AVATAR = "sailboat";

const ICONS = {
  sailboat: '<path d="M5 21h22l-3.5 5H8.5z" fill="#0B2A4A"/><path d="M16 5v16" stroke="#0B2A4A" stroke-width="1.6" stroke-linecap="round"/><path d="M17.6 6.5V19.5H26z" fill="#0B2A4A"/><path d="M14.4 9V19.5H7z" fill="#0B2A4A" opacity="0.85"/>',
  catamaran: '<path d="M3 21h9.5l-1.4 4.5H5z M19.5 21H29l-2 4.5h-6z" fill="#0B2A4A"/><path d="M8 21h16" stroke="#0B2A4A" stroke-width="1.6" stroke-linecap="round"/><path d="M16 6v15" stroke="#0B2A4A" stroke-width="1.6" stroke-linecap="round"/><path d="M17.5 7.5V19.5H25z" fill="#0B2A4A"/>',
  motor: '<path d="M4 20h24l-3.2 6H8z" fill="#0B2A4A"/><path d="M11 20l3.2-6.5H21L23.5 20z" fill="#0B2A4A" opacity="0.9"/><path d="M15.4 15.2h4.4l1.4 3.2h-7.2z" fill="#F6E7C1"/>',
  anchor: '<circle cx="16" cy="7.5" r="2.3" fill="none" stroke="#0B2A4A" stroke-width="1.7"/><path d="M16 9.8V25M11.5 13h9" fill="none" stroke="#0B2A4A" stroke-width="1.7" stroke-linecap="round"/><path d="M6.5 18.5c0.6 4.3 4.4 7 9.5 7s8.9-2.7 9.5-7" fill="none" stroke="#0B2A4A" stroke-width="1.7" stroke-linecap="round"/><path d="M4.3 19.8L6.5 17.4L9 19.6M23 19.6L25.5 17.4L27.7 19.8" fill="none" stroke="#0B2A4A" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
  compass: '<circle cx="16" cy="16" r="10.5" fill="none" stroke="#0B2A4A" stroke-width="1.6"/><path d="M16 7l3.4 9h-6.8z" fill="#0B2A4A"/><path d="M16 25l-3.4-9h6.8z" fill="none" stroke="#0B2A4A" stroke-width="1.4" stroke-linejoin="round"/>',
  orca: '<g transform="translate(1 6.8) scale(0.3)"><path fill-rule="evenodd" fill="#0B0F14" d="M100.0 35.1 L94.9 27.7 L88.4 23.8 L75.0 19.9 L58.9 18.0 L57.3 16.5 L53.7 9.2 L50.4 4.3 L47.2 1.3 L44.1 0.0 L43.5 1.0 L45.3 5.9 L46.1 10.7 L46.1 15.7 L45.2 19.2 L28.5 27.1 L20.9 33.6 L13.8 43.1 L5.9 44.7 L2.1 47.3 L0.0 50.5 L11.4 50.2 L16.7 57.0 L18.3 61.2 L20.4 58.2 L21.4 53.9 L21.0 51.0 L19.0 46.5 L21.7 45.1 L26.1 43.9 L32.0 43.5 L45.2 45.4 L56.4 46.2 L57.2 47.1 L54.9 53.0 L52.8 56.3 L53.4 57.5 L55.6 57.6 L59.2 56.5 L63.8 53.8 L67.5 50.3 L70.2 46.1 L81.2 44.3 L94.1 40.5 L97.4 38.9 L99.5 36.7ZM97.8 37.6 L97.7 37.8 L97.1 38.5 L95.2 39.5 L91.9 40.6 L91.1 40.7 L90.0 41.1 L89.0 41.3 L88.3 41.7 L85.8 42.3 L84.7 42.8 L83.6 43.0 L80.5 43.9 L74.8 45.0 L70.7 45.3 L70.5 45.0 L70.5 44.5 L71.0 43.1 L71.2 42.0 L71.7 41.0 L71.9 40.7 L77.0 37.8 L79.2 36.8 L80.9 36.3 L84.6 35.8 L86.8 35.9 L95.7 36.8 L97.4 37.2ZM24.6 39.9 L26.0 38.2 L27.7 37.0 L30.5 35.7 L32.7 35.3 L35.4 35.2 L37.8 35.7 L39.9 36.8 L41.6 38.2 L44.6 41.3 L45.7 42.1 L48.0 43.1 L49.8 43.5 L52.1 43.7 L56.4 43.5 L58.3 43.2 L59.3 43.2 L59.5 43.5 L58.2 45.2 L57.5 45.7 L52.3 45.6 L46.4 45.1 L38.8 43.9 L34.9 42.0 L32.6 41.3 L31.2 41.1 L25.8 41.2 L24.8 40.7ZM71.1 30.2 L71.4 29.6 L72.3 28.8 L74.1 28.1 L74.4 28.1 L74.5 28.0 L75.0 28.0 L75.1 27.9 L75.7 27.9 L75.8 27.8 L76.1 27.8 L76.2 27.7 L77.1 27.7 L77.1 27.6 L77.7 27.6 L77.8 27.7 L79.1 27.7 L79.2 27.8 L79.8 27.8 L79.9 27.9 L81.0 28.0 L81.1 28.1 L81.7 28.2 L82.0 28.3 L82.2 28.3 L82.5 28.5 L82.8 28.5 L83.5 28.8 L83.6 29.0 L84.1 29.2 L84.6 29.5 L85.4 30.3 L85.7 30.9 L85.7 31.4 L85.3 32.1 L84.8 32.4 L84.4 32.6 L84.2 32.8 L84.0 32.8 L83.7 33.0 L83.5 33.0 L82.8 33.3 L82.5 33.3 L82.1 33.5 L81.7 33.5 L81.6 33.5 L80.9 33.5 L80.8 33.6 L79.3 33.6 L79.3 33.7 L79.0 33.7 L78.9 33.6 L77.5 33.6 L77.4 33.5 L76.2 33.5 L76.1 33.4 L75.9 33.4 L75.8 33.3 L75.2 33.2 L74.9 33.0 L74.6 33.0 L72.8 32.2 L72.2 31.8 L71.4 31.0 L71.1 30.4Z"/></g>',
};

export const AVATAR_CHOICES = [
  { id: "sailboat", label: "Voilier" },
  { id: "catamaran", label: "Catamaran" },
  { id: "motor", label: "Moteur" },
  { id: "anchor", label: "Ancre" },
  { id: "compass", label: "Compas" },
  { id: "orca", label: "Orque" },
];

export const isPhotoAvatar = (a) => typeof a === "string" && a.startsWith("data:image/");

const iconSvg = (id, size) =>
  `<svg viewBox="0 0 32 32" width="${size}" height="${size}" aria-hidden="true">${ICONS[id] || ICONS[DEFAULT_AVATAR]}</svg>`;

// Marqueur "épingle" façon Google Maps : corps coloré selon l'activité (vert / orange / rouge),
// logo en noir posé directement dessus (ou photo dans un rond). `outline` = contour (cyan si dans mon convoi).
export function pinHtml(avatar, fill, outline = "#1A1A1A", w = 60) {
  const body = `<path d="M24 62C10 44 4 34 4 22a20 20 0 1 1 40 0c0 12-6 22-20 40z" fill="${fill}" stroke="${outline}" stroke-width="3" stroke-linejoin="round"/>`;
  const inner = isPhotoAvatar(avatar)
    ? `<defs><clipPath id="pinclip"><circle cx="24" cy="22" r="14"/></clipPath></defs><circle cx="24" cy="22" r="15.5" fill="#fff"/><image href="${avatar}" x="10" y="8" width="28" height="28" preserveAspectRatio="xMidYMid slice" clip-path="url(#pinclip)"/>`
    : `<svg x="8" y="6" width="32" height="32" viewBox="0 0 32 32">${(ICONS[avatar] || ICONS[DEFAULT_AVATAR]).split("#0B2A4A").join("#0A0A0A").split("#0B0F14").join("#0A0A0A")}</svg>`;
  return `<svg width="${w}" height="${Math.round((w * 4) / 3)}" viewBox="0 0 48 64" style="display:block;filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))" aria-hidden="true">${body}${inner}</svg>`;
}

// HTML d'un marqueur Leaflet (L.divIcon). `ringColor` = statut (vert/cyan/rouge), inchangé.
export function markerHtml(avatar, ringColor, stale, size = 34) {
  const inner = isPhotoAvatar(avatar)
    ? `<img src="${avatar}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block"/>`
    : iconSvg(avatar, Math.round(size * 0.62));
  return `<div style="width:${size}px;height:${size}px;box-sizing:border-box;border-radius:50%;background:#F6E7C1;border:3px ${stale ? "dashed" : "solid"} ${ringColor};opacity:${stale ? 0.6 : 1};display:flex;align-items:center;justify-content:center;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.45)">${inner}</div>`;
}

// Redimensionne une photo en carré 64x64 JPEG (~3 Ko) côté navigateur.
export function photoToAvatar(file, size = 64) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(img.width, img.height);
      const c = document.createElement("canvas");
      c.width = c.height = size;
      c.getContext("2d").drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.72));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("image")); };
    img.src = url;
  });
}

export function AvatarPicker({ value, onChange, colors, label = "Ton logo sur la carte", photoLabel = "Ajouter une photo" }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const current = value || DEFAULT_AVATAR;
  const circle = (selected) => ({
    width: 52, height: 52, borderRadius: "50%", background: "#F6E7C1", overflow: "hidden",
    border: `3px solid ${selected ? colors.orange : colors.border}`, display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
  });
  const onFile = async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    setBusy(true);
    try { onChange(await photoToAvatar(f)); } catch (err) {}
    setBusy(false);
  };
  return (
    <div>
      <label className="text-xs uppercase tracking-wider" style={{ color: colors.muted }}>{label}</label>
      <div className="flex flex-wrap gap-3 mt-2">
        {AVATAR_CHOICES.map((a) => (
          <button key={a.id} type="button" onClick={() => onChange(a.id)} title={a.label} aria-label={a.label} aria-pressed={current === a.id}
            style={circle(current === a.id)} dangerouslySetInnerHTML={{ __html: iconSvg(a.id, 32) }} />
        ))}
        {isPhotoAvatar(current) && (
          <button type="button" style={circle(true)} aria-label="Ma photo" aria-pressed="true">
            <img src={current} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </button>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" onChange={onFile} style={{ display: "none" }} />
      <button type="button" onClick={() => fileRef.current && fileRef.current.click()} disabled={busy}
        className="mt-3 text-xs px-3 py-2 rounded" style={{ color: colors.cyan, border: `1px solid ${colors.cyanDim}` }}>
        {busy ? "…" : photoLabel}
      </button>
    </div>
  );
}
