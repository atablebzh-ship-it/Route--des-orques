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
  orca: '<path d="M7 24.5C13 24.5 16 19 17 7.5c1.4 7.5 5 14.5 9 17z" fill="#0B2A4A"/><path d="M4 27.5c2-1.2 4-1.2 6 0s4 1.2 6 0 4-1.2 6 0 4 1.2 6 0" fill="none" stroke="#0B2A4A" stroke-width="1.5" stroke-linecap="round"/>',
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
