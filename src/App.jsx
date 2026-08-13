import React, { useState, useEffect, useRef, useCallback } from "react";
import { Anchor, Navigation, AlertTriangle, MessageCircle, Send, Compass, Users, X, Plus, LocateFixed, LogOut, Waves, Check, Clock, Flag, Download } from "lucide-react";
import { storage, supabase } from "./lib/storage.js";

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap');
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
const MAX_CHAT = 150;
const MAX_ALERTS = 60;
const MAX_CONVOYS = 40;

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

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
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

function Panel({ children, style, className = "" }) {
  return (
    <div
      className={`rounded-lg border ${className}`}
      style={{ background: COLORS.panel, borderColor: COLORS.border, ...style }}
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
      className="flex flex-col items-center justify-center gap-1 flex-1 py-2"
      style={{ color: active ? COLORS.cyan : COLORS.muted }}
    >
      {children}
      <span className="text-xs" style={{ fontFamily: "Inter, sans-serif" }}>{label}</span>
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

export default function RouteDesOrques() {
  const [authReady, setAuthReady] = useState(false);
  const [session, setSession] = useState(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [linkSent, setLinkSent] = useState(false);
  const [authError, setAuthError] = useState("");
  const [otpCode, setOtpCode] = useState("");

  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState(null);
  const [pos, setPos] = useState(null);
  const [heading, setHeading] = useState("");
  const [status, setStatus] = useState("en_route");
  const [boats, setBoats] = useState({});
  const [alerts, setAlerts] = useState([]);
  const [chat, setChat] = useState([]);
  const [convoys, setConvoys] = useState([]);
  const [tab, setTab] = useState("carte");
  const [showAlertForm, setShowAlertForm] = useState(false);
  const [showConvoyForm, setShowConvoyForm] = useState(false);
  const [alertCount, setAlertCount] = useState("");
  const [alertNotes, setAlertNotes] = useState("");
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
  const [cvEta, setCvEta] = useState("");

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
        const res = await storage.get("profile", false);
        if (res?.value) {
          const p = JSON.parse(res.value);
          setProfile(p);
          if (p.lastLat && p.lastLon) setPos({ lat: p.lastLat, lon: p.lastLon });
        }
      } catch (e) {}
      setReady(true);
    })();
  }, []);

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
          lat: a.lat, lon: a.lon, count: a.count, notes: a.notes, createdAt: new Date(a.created_at).getTime(),
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
      () => setGeoError("Position refusée. Saisis tes coordonnées manuellement."),
      { enableHighAccuracy: true, timeout: 8000 }
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
    <input ref={fileInputRef} type="file" accept=".gpx,application/gpx+xml" onChange={handleGPXFile} style={{ display: "none" }} />
  );

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
      await storage.set("profile", JSON.stringify(p), false);
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

  const addAlert = async () => {
    if (!pos) return;
    const count = parseInt(alertCount, 10);
    if (!count || count < 1) return;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("alerts")
        .insert({ author_id: profile.id, author: profile.pseudo, boat_name: profile.boatName, lat: pos.lat, lon: pos.lon, count, notes: alertNotes.trim() })
        .select()
        .single();
      if (!error && data) {
        const entry = {
          id: data.id, authorId: data.author_id, author: data.author, boatName: data.boat_name,
          lat: data.lat, lon: data.lon, count: data.count, notes: data.notes, createdAt: new Date(data.created_at).getTime(),
        };
        setAlerts((prev) => [entry, ...prev].slice(0, MAX_ALERTS));
      }
      setAlertCount("");
      setAlertNotes("");
      setShowAlertForm(false);
      setTab("alerts");
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
      }
      setCvName(""); setCvRdv(""); setCvRdvLat(null); setCvRdvLon(null);
      setCvDeparture(""); setCvDest(""); setCvDestLat(null); setCvDestLon(null); setCvEta("");
      setShowConvoyForm(false);
      setTab("convois");
    } catch (e) {}
    setSaving(false);
  };

  const openConvoyForm = () => {
    setCvRdvLat(pos?.lat ?? null);
    setCvRdvLon(pos?.lon ?? null);
    setShowConvoyForm(true);
  };

  const requestJoin = async (convoyId) => {
    try {
      await supabase.from("convoy_members").insert({ convoy_id: convoyId, boat_id: profile.id, pseudo: profile.pseudo, boat_name: profile.boatName, status: "en_attente" });
      await fetchShared();
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

  if (!authReady) {
    return (
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
          <p className="text-sm mb-6" style={{ color: COLORS.muted }}>
            Connexion par lien magique — pas de mot de passe à retenir.
          </p>
          <Panel className="p-5 space-y-4">
            {linkSent ? (
          <div className="text-center py-3">
                <Check size={28} style={{ color: COLORS.green, marginBottom: 10 }} className="mx-auto" />
                <p className="text-sm" style={{ color: COLORS.text }}>
                  Code envoyé à <strong>{loginEmail}</strong>. Saisis-le ci-dessous.
                </p>
                <Field label="Code de connexion">
                  <input value={otpCode} onChange={(e) => setOtpCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && verifyCode()}
                    placeholder="12345678" type="text" maxLength={8}
                    className="w-full px-3 py-2 rounded outline-none text-sm text-center" style={inputStyle} />
                </Field>
                {authError && <p className="text-xs" style={{ color: COLORS.orange }}>{authError}</p>}
                <button onClick={verifyCode} className="w-full py-2.5 rounded font-medium text-sm mt-2"
                  style={{ background: COLORS.orange, color: "#1A0E08" }}>
                  Valider le code
                </button>
                <button onClick={() => setLinkSent(false)} className="text-xs mt-3" style={{ color: COLORS.cyan }}>
                  Utiliser une autre adresse
                </button>
              </div>
              
            ) : (
              <>
                <Field label="Adresse e-mail">
                  <input value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendMagicLink()}
                    placeholder="toi@exemple.com" type="email"
                    className="w-full px-3 py-2 rounded outline-none text-sm" style={inputStyle} />
                </Field>
                {authError && <p className="text-xs" style={{ color: COLORS.orange }}>{authError}</p>}
                <button onClick={sendMagicLink} className="w-full py-2.5 rounded font-medium text-sm"
                  style={{ background: COLORS.orange, color: "#1A0E08" }}>
                  Recevoir le lien de connexion
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
          <p className="text-sm mb-6" style={{ color: COLORS.muted }}>
            Rejoins les plaisanciers en route pour partager position, alertes orques et former des convois.
          </p>

          <Panel className="p-5 space-y-4">
            <Field label="Pseudo">
              <input value={obPseudo} onChange={(e) => setObPseudo(e.target.value)} placeholder="Ex. Yann"
                className="w-full px-3 py-2 rounded outline-none text-sm" style={inputStyle} />
            </Field>
            <Field label="Nom du bateau">
              <input value={obBoat} onChange={(e) => setObBoat(e.target.value)} placeholder="Ex. Albatros II"
                className="w-full px-3 py-2 rounded outline-none text-sm" style={inputStyle} />
            </Field>
            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs uppercase tracking-wider" style={{ color: COLORS.muted }}>Position actuelle</label>
                <div className="flex gap-2">
                  <button onClick={() => useGeolocation(setObLat, setObLon)}
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded" style={{ color: COLORS.cyan, border: `1px solid ${COLORS.cyanDim}` }}>
                    <LocateFixed size={13} /> Me localiser
                  </button>
                  <button onClick={() => triggerImport("onboarding")}
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded" style={{ color: COLORS.muted, border: `1px solid ${COLORS.border}` }}>
                    <Download size={13} /> GPX
                  </button>
                </div>
              </div>
              <div className="flex gap-2 mt-1">
                <input value={obLat} onChange={(e) => setObLat(e.target.value)} placeholder="Latitude" inputMode="decimal"
                  className="w-1/2 px-3 py-2 rounded outline-none text-sm" style={{ ...inputStyle, fontFamily: "JetBrains Mono, monospace" }} />
                <input value={obLon} onChange={(e) => setObLon(e.target.value)} placeholder="Longitude" inputMode="decimal"
                  className="w-1/2 px-3 py-2 rounded outline-none text-sm" style={{ ...inputStyle, fontFamily: "JetBrains Mono, monospace" }} />
              </div>
              {geoError && <p className="text-xs mt-1" style={{ color: COLORS.orange }}>{geoError}</p>}
            </div>
            <button onClick={completeOnboarding} className="w-full py-2.5 rounded font-medium text-sm mt-2"
              style={{ background: COLORS.orange, color: "#1A0E08" }}>
              Rejoindre la route
            </button>
            <p className="text-xs leading-relaxed" style={{ color: COLORS.muted }}>
              Ton pseudo, ton bateau et ta position sont visibles par les autres plaisanciers connectés à cette appli.
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

  const CHART_MAX_KM = 50;
  const CHART_R = 125;
  const center = 150;
  const chartPoint = (dist, brg) => {
    const r = Math.min(1, Math.sqrt(dist / CHART_MAX_KM)) * CHART_R;
    const rad = toRad(brg);
    return { x: center + r * Math.sin(rad), y: center - r * Math.cos(rad) };
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: COLORS.bg, fontFamily: "Inter, sans-serif" }}>
      <style>{FONTS}</style>

      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: COLORS.border }}>
        <div className="flex items-center gap-2">
          <Compass size={22} style={{ color: COLORS.orange }} />
          <span className="font-semibold tracking-wide text-sm" style={{ color: COLORS.text, fontFamily: "Oswald, sans-serif" }}>
            ROUTE DES ORQUES
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-xs" style={{ color: COLORS.green }}>
          <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: COLORS.green }} />
          {activeCount} actif{activeCount > 1 ? "s" : ""}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 pb-2">
        {tab === "carte" && (
          <div>
            <div className="flex items-center justify-center mb-3 relative">
              <svg width="300" height="300" viewBox="0 0 300 300">
                <defs>
                  <pattern id="chartGrid" width="30" height="30" patternUnits="userSpaceOnUse">
                    <path d="M 30 0 L 0 0 0 30" fill="none" stroke={COLORS.border} strokeWidth="0.5" opacity="0.5" />
                  </pattern>
                </defs>
                <rect x="10" y="10" width="280" height="280" fill="url(#chartGrid)" stroke={COLORS.border} strokeWidth="1" />

                {[125, 83, 42].map((r, i) => (
                  <circle key={i} cx={center} cy={center} r={r} fill="none" stroke={COLORS.cyanDim} strokeWidth="0.5" strokeDasharray="2,3" opacity="0.6" />
                ))}
                <line x1={center} y1={12} x2={center} y2={288} stroke={COLORS.border} strokeWidth="1" />
                <line x1={12} y1={center} x2={288} y2={center} stroke={COLORS.border} strokeWidth="1" />
                <text x={center} y="22" textAnchor="middle" fontSize="11" fill={COLORS.muted} fontFamily="JetBrains Mono, monospace">N</text>
                <text x={center} y="282" textAnchor="middle" fontSize="11" fill={COLORS.muted} fontFamily="JetBrains Mono, monospace">S</text>
                <text x="18" y={center + 4} fontSize="11" fill={COLORS.muted} fontFamily="JetBrains Mono, monospace">O</text>
                <text x="276" y={center + 4} fontSize="11" fill={COLORS.muted} fontFamily="JetBrains Mono, monospace">E</text>

                {/* lignes vers mon convoi confirmé */}
                {myConvoy && others.filter((b) => myConvoyMemberIds.includes(b.id) && b.dist !== null).map((b) => {
                  const p2 = chartPoint(b.dist, b.brg);
                  return <line key={"cv-" + b.id} x1={center} y1={center} x2={p2.x} y2={p2.y} stroke={COLORS.green} strokeWidth="1.2" strokeDasharray="4,3" opacity="0.8" />;
                })}

                {myConvoy && myConvoy.destLat != null && pos && (() => {
                  const d = distanceKm(pos.lat, pos.lon, myConvoy.destLat, myConvoy.destLon);
                  const br = bearingDeg(pos.lat, pos.lon, myConvoy.destLat, myConvoy.destLon);
                  const { x, y } = chartPoint(d, br);
                  return (
                    <g key="dest">
                      <line x1={center} y1={center} x2={x} y2={y} stroke={COLORS.green} strokeWidth="1" strokeDasharray="1,4" opacity="0.6" />
                      <path d={`M ${x} ${y - 6} L ${x + 5} ${y} L ${x} ${y + 6} L ${x - 5} ${y} Z`} fill={COLORS.green} />
                    </g>
                  );
                })()}

                <circle cx={center} cy={center} r="5" fill={COLORS.orange} />

                {alertsWithDist.filter((a) => now - a.createdAt < 6 * 3600 * 1000 && a.dist !== null).map((a) => {
                  const { x, y } = chartPoint(a.dist, a.brg);
                  return (
                    <g key={a.id}>
                      <circle cx={x} cy={y} r="7" fill="none" stroke={COLORS.orange} strokeWidth="1.5" opacity="0.6">
                        <animate attributeName="r" values="6;12;6" dur="2.5s" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.7;0;0.7" dur="2.5s" repeatCount="indefinite" />
                      </circle>
                      <circle cx={x} cy={y} r="4" fill={COLORS.orange} />
                    </g>
                  );
                })}

                {others.filter((b) => b.dist !== null).map((b) => {
                  const { x, y } = chartPoint(b.dist, b.brg);
                  const inMyConvoy = myConvoyMemberIds.includes(b.id);
                  return (
                    <circle key={b.id} cx={x} cy={y} r="5"
                      fill={b.stale ? COLORS.muted : inMyConvoy ? COLORS.green : COLORS.cyan}
                      opacity={b.stale ? 0.5 : 1}
                      onClick={() => setSelectedBoat(b)} style={{ cursor: "pointer" }} />
                  );
                })}
              </svg>
              <div className="absolute top-2 right-2 opacity-70">
                <Compass size={18} style={{ color: COLORS.muted }} />
              </div>
            </div>
            <p className="text-center text-xs mb-4" style={{ color: COLORS.muted }}>
              <span style={{ color: COLORS.orange }}>●</span> toi &nbsp;
              <span style={{ color: COLORS.cyan }}>●</span> plaisanciers &nbsp;
              <span style={{ color: COLORS.green }}>●</span> mon convoi &nbsp;
              <span style={{ color: COLORS.orange }}>◎</span> orques · échelle {CHART_MAX_KM} km
            </p>

            <button onClick={exportChartGPX}
              className="w-full py-2 rounded text-xs mb-4 flex items-center justify-center gap-2"
              style={{ color: COLORS.cyan, border: `1px solid ${COLORS.cyanDim}` }}>
              <Download size={13} /> Exporter en GPX (OpenCPN, Navionics, Garmin…)
            </button>

            {others.length === 0 ? (
              <Panel className="p-4 text-center">
                <p className="text-sm" style={{ color: COLORS.muted }}>
                  Aucun plaisancier à proximité pour l'instant. Sois le premier à signaler ta position.
                </p>
              </Panel>
            ) : (
              <div className="space-y-2">
                {others.map((b) => (
                  <Panel key={b.id} className="p-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium" style={{ color: COLORS.text }}>
                        {b.pseudo} <span style={{ color: COLORS.muted, fontWeight: 400 }}>· {b.boatName}</span>
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: COLORS.muted, fontFamily: "JetBrains Mono, monospace" }}>
                        {b.dist?.toFixed(1)} km · cap {Math.round(b.brg)}° · {b.stale ? "hors ligne" : timeAgo(b.updatedAt)}
                      </p>
                    </div>
                    <button onClick={() => proposeConvoyViaChat(b)} className="text-xs px-3 py-1.5 rounded"
                      style={{ color: COLORS.cyan, border: `1px solid ${COLORS.cyanDim}` }}>
                      Contacter
                    </button>
                  </Panel>
                ))}
              </div>
            )}
          </div>
        )}

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
            <button onClick={() => setShowAlertForm(true)}
              className="w-full py-2.5 rounded font-medium text-sm mb-2 flex items-center justify-center gap-2"
              style={{ background: COLORS.orange, color: "#1A0E08" }}>
              <Plus size={16} /> Signaler des orques
            </button>
            {alertsWithDist.length === 0 ? (
              <Panel className="p-4 text-center">
                <p className="text-sm" style={{ color: COLORS.muted }}>Aucune observation signalée récemment.</p>
              </Panel>
            ) : (
              alertsWithDist.map((a) => (
                <Panel key={a.id} className="p-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <AlertTriangle size={16} style={{ color: COLORS.orange }} />
                      <span className="text-sm font-medium" style={{ color: COLORS.text }}>{a.count} orque{a.count > 1 ? "s" : ""}</span>
                    </div>
                    <span className="text-xs" style={{ color: COLORS.muted }}>{timeAgo(a.createdAt)}</span>
                  </div>
                  {a.notes && <p className="text-sm mt-1.5" style={{ color: COLORS.text }}>{a.notes}</p>}
                  <div className="flex items-center justify-between mt-1.5">
                    <p className="text-xs" style={{ color: COLORS.muted, fontFamily: "JetBrains Mono, monospace" }}>
                      {a.author} · {a.boatName}{a.dist !== null ? ` · ${a.dist.toFixed(1)} km (cap ${Math.round(a.brg)}°)` : ""}
                    </p>
                    <button onClick={() => exportAlertGPX(a)} title="Exporter ce point en GPX" style={{ color: COLORS.muted }}>
                      <Download size={14} />
                    </button>
                  </div>
                </Panel>
              ))
            )}
          </div>
        )}

        {tab === "chat" && (
          <div className="flex flex-col" style={{ minHeight: "60vh" }}>
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

            <Panel className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: COLORS.muted }}>Mettre à jour ma position</span>
                <div className="flex gap-2">
                  <button onClick={() => useGeolocation((lat) => updatePosition(parseFloat(lat), pos.lon), () => {})}
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
                <input defaultValue={pos?.lat} onBlur={(e) => pos && updatePosition(parseFloat(e.target.value) || pos.lat, pos.lon)}
                  inputMode="decimal" className="w-1/2 px-3 py-2 rounded outline-none text-sm" style={{ ...inputStyle, fontFamily: "JetBrains Mono, monospace" }} />
                <input defaultValue={pos?.lon} onBlur={(e) => pos && updatePosition(pos.lat, parseFloat(e.target.value) || pos.lon)}
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

      <div className="flex border-t" style={{ borderColor: COLORS.border, background: COLORS.panel }}>
        <IconBtn onClick={() => setTab("carte")} active={tab === "carte"} label="Carte"><Navigation size={17} /></IconBtn>
        <IconBtn onClick={() => setTab("convois")} active={tab === "convois"} label="Convois"><Users size={17} /></IconBtn>
        <IconBtn onClick={() => setTab("alerts")} active={tab === "alerts"} label="Alertes"><AlertTriangle size={17} /></IconBtn>
        <IconBtn onClick={() => setTab("chat")} active={tab === "chat"} label="Chat"><MessageCircle size={17} /></IconBtn>
        <IconBtn onClick={() => setTab("profile")} active={tab === "profile"} label="Moi"><Anchor size={17} /></IconBtn>
      </div>

      {showAlertForm && (
        <div className="fixed inset-0 flex items-end justify-center z-50" style={{ background: "rgba(0,0,0,0.6)" }}>
          <div className="w-full max-w-sm rounded-t-xl p-5" style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}` }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-sm" style={{ color: COLORS.text, fontFamily: "Oswald, sans-serif" }}>SIGNALER DES ORQUES</h3>
              <button onClick={() => setShowAlertForm(false)}><X size={18} style={{ color: COLORS.muted }} /></button>
            </div>
            <Field label="Nombre d'individus">
              <input value={alertCount} onChange={(e) => setAlertCount(e.target.value)} inputMode="numeric" placeholder="Ex. 3"
                className="w-full px-3 py-2 rounded outline-none text-sm" style={inputStyle} />
            </Field>
            <div className="h-3" />
            <Field label="Notes (comportement, distance…)">
              <textarea value={alertNotes} onChange={(e) => setAlertNotes(e.target.value)} rows={3} placeholder="Ex. Approche curieuse du safran, rester calme"
                className="w-full px-3 py-2 rounded outline-none text-sm resize-none" style={inputStyle} />
            </Field>
            <p className="text-xs my-3" style={{ color: COLORS.muted, fontFamily: "JetBrains Mono, monospace" }}>
              Position : {pos?.lat.toFixed(4)}, {pos?.lon.toFixed(4)}
            </p>
            <button onClick={addAlert} className="w-full py-2.5 rounded font-medium text-sm" style={{ background: COLORS.orange, color: "#1A0E08" }}>
              Publier l'alerte
            </button>
          </div>
        </div>
      )}

      {showConvoyForm && (
        <div className="fixed inset-0 flex items-end justify-center z-50" style={{ background: "rgba(0,0,0,0.6)" }}>
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
                <button onClick={() => triggerImport("convoy-rdv")}
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded" style={{ color: COLORS.muted, border: `1px solid ${COLORS.border}` }}>
                  <Download size={12} /> Importer GPX
                </button>
              </div>
              <Field label="Date et heure de départ">
                <input type="datetime-local" value={cvDeparture} onChange={(e) => setCvDeparture(e.target.value)}
                  className="w-full px-3 py-2 rounded outline-none text-sm" style={inputStyle} />
              </Field>
              <Field label="Destination">
                <input value={cvDest} onChange={(e) => setCvDest(e.target.value)} placeholder="Ex. Port de Saint-Jean-de-Luz"
                  className="w-full px-3 py-2 rounded outline-none text-sm" style={inputStyle} />
              </Field>
              <div className="flex items-center justify-between">
                <p className="text-xs" style={{ color: COLORS.muted, fontFamily: "JetBrains Mono, monospace" }}>
                  {cvDestLat != null ? `${cvDestLat.toFixed(4)}, ${cvDestLon.toFixed(4)}` : "Coordonnées non définies"}
                </p>
                <button onClick={() => triggerImport("convoy-dest")}
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded" style={{ color: COLORS.muted, border: `1px solid ${COLORS.border}` }}>
                  <Download size={12} /> Importer GPX
                </button>
              </div>
              <Field label="Date et heure d'arrivée estimée">
                <input type="datetime-local" value={cvEta} onChange={(e) => setCvEta(e.target.value)}
                  className="w-full px-3 py-2 rounded outline-none text-sm" style={inputStyle} />
              </Field>
              <button onClick={createConvoy} className="w-full py-2.5 rounded font-medium text-sm mt-1" style={{ background: COLORS.green, color: "#0A1F14" }}>
                Créer le convoi
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedBoat && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(0,0,0,0.6)" }} onClick={() => setSelectedBoat(null)}>
          <div className="w-full max-w-xs rounded-lg p-4" style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}` }} onClick={(e) => e.stopPropagation()}>
            <p className="font-medium text-sm mb-1" style={{ color: COLORS.text }}>{selectedBoat.pseudo} · {selectedBoat.boatName}</p>
            <p className="text-xs mb-3" style={{ color: COLORS.muted, fontFamily: "JetBrains Mono, monospace" }}>
              {selectedBoat.dist?.toFixed(1)} km · cap {Math.round(selectedBoat.brg)}° · {selectedBoat.stale ? "hors ligne" : timeAgo(selectedBoat.updatedAt)}
            </p>
            <button onClick={() => { proposeConvoyViaChat(selectedBoat); setSelectedBoat(null); }} className="w-full py-2 rounded text-sm" style={{ background: COLORS.cyanDim, color: COLORS.cyan }}>
              Contacter par chat
            </button>
          </div>
        </div>
      )}

      {renderHiddenFileInput()}
      {renderImportModal()}
    </div>
  );
}
