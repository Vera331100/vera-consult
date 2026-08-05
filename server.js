"use strict";
/*
 * Vera Consult – Kontaktregister
 * Kleiner Sync-Server ohne Abhängigkeiten (nur Node.js-Bordmittel).
 *
 * Start:        node server.js
 * Zugangscode:  über Umgebungsvariable KONTAKTREGISTER_PASS setzen,
 *               sonst gilt der Standardwert unten.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3112;
const PASS = process.env.KONTAKTREGISTER_PASS || "vera-consult-2026";
const DATA_FILE = path.join(__dirname, "data.json");
const SITE_FILE = path.join(__dirname, "website.html");
const APP_FILE = path.join(__dirname, "index.html");
/* Interner, unverlinkter Pfad zum Kontaktregister */
const APP_PATH = "/intern";

/* ---------- Datenhaltung ---------- */
let entries = [];
try {
  entries = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  if (!Array.isArray(entries)) entries = [];
} catch (e) { entries = []; }

let saveTimer = null;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.writeFile(DATA_FILE, JSON.stringify(entries, null, 2), (err) => {
      if (err) console.error("Speichern fehlgeschlagen:", err.message);
    });
  }, 150);
}

/* Ein eingehender Eintrag wird mit dem Bestand zusammengeführt:
   neuerer updatedAt gewinnt, Notizen werden vereinigt. */
function upsert(inc) {
  if (!inc || typeof inc.id !== "string" || typeof inc.alias !== "string") return null;
  const clean = {
    id: inc.id,
    alias: String(inc.alias).slice(0, 24),
    kategorie: String(inc.kategorie || "sonstige"),
    status: String(inc.status || "neu"),
    org: String(inc.org || "").slice(0, 60),
    branche: String(inc.branche || "").slice(0, 60),
    rolle: String(inc.rolle || "").slice(0, 80),
    tags: Array.isArray(inc.tags) ? inc.tags.slice(0, 20).map(t => String(t).slice(0, 40)) : [],
    notizen: Array.isArray(inc.notizen)
      ? inc.notizen.slice(0, 500).map(n => ({ ts: Number(n.ts) || Date.now(), text: String(n.text || "").slice(0, 500) }))
      : [],
    createdAt: Number(inc.createdAt) || Date.now(),
    updatedAt: Number(inc.updatedAt) || Date.now()
  };
  const existing = entries.find(e => e.id === clean.id);
  if (!existing) {
    entries.push(clean);
    persist();
    return clean;
  }
  const merged = (clean.updatedAt >= (existing.updatedAt || 0)) ? clean : existing;
  const other = merged === clean ? existing : clean;
  (other.notizen || []).forEach(n => {
    if (!merged.notizen.some(m => m.ts === n.ts && m.text === n.text)) merged.notizen.push(n);
  });
  entries[entries.indexOf(existing)] = merged;
  persist();
  return merged;
}

/* ---------- SSE ---------- */
const clients = new Set();
function broadcast(event) {
  const msg = "data: " + JSON.stringify(event) + "\n\n";
  for (const res of clients) {
    try { res.write(msg); } catch (e) { clients.delete(res); }
  }
}

/* ---------- HTTP ---------- */
function authed(req, url) {
  const token = req.headers["x-token"] || url.searchParams.get("token") || "";
  return token === PASS;
}
function json(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", c => {
      body += c;
      if (body.length > 1e6) { reject(new Error("too large")); req.destroy(); }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");

  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
    fs.readFile(SITE_FILE, (err, buf) => {
      if (err) { res.writeHead(500); res.end("website.html fehlt"); return; }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(buf);
    });
    return;
  }

  if (req.method === "GET" && (url.pathname === "/impressum" || url.pathname === "/datenschutz")) {
    const file = path.join(__dirname, url.pathname.slice(1) + ".html");
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404); res.end("Nicht gefunden."); return; }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(buf);
    });
    return;
  }

  if (req.method === "GET" && (url.pathname === APP_PATH || url.pathname === APP_PATH + "/")) {
    fs.readFile(APP_FILE, (err, buf) => {
      if (err) { res.writeHead(500); res.end("index.html fehlt"); return; }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(buf);
    });
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    if (!authed(req, url)) { json(res, 401, { error: "Zugangscode falsch." }); return; }

    if (req.method === "GET" && url.pathname === "/api/entries") {
      json(res, 200, { entries });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/entries") {
      try {
        const inc = JSON.parse(await readBody(req));
        const saved = upsert(inc);
        if (!saved) { json(res, 400, { error: "Ungültiger Eintrag." }); return; }
        broadcast({ type: "upsert", entry: saved });
        json(res, 200, { entry: saved });
      } catch (e) { json(res, 400, { error: "Ungültiges JSON." }); }
      return;
    }

    if (req.method === "DELETE" && url.pathname === "/api/entries") {
      const id = url.searchParams.get("id");
      const before = entries.length;
      entries = entries.filter(e => e.id !== id);
      if (entries.length !== before) {
        persist();
        broadcast({ type: "delete", id });
      }
      json(res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/stream") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      });
      res.write("data: {\"type\":\"hello\"}\n\n");
      clients.add(res);
      const ping = setInterval(() => {
        try { res.write(": ping\n\n"); } catch (e) { /* wird unten aufgeräumt */ }
      }, 25000);
      req.on("close", () => { clearInterval(ping); clients.delete(res); });
      return;
    }

    json(res, 404, { error: "Nicht gefunden." });
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Nicht gefunden.");
});

server.listen(PORT, () => {
  console.log("Kontaktregister läuft auf http://localhost:" + PORT);
  console.log("Zugangscode: " + (process.env.KONTAKTREGISTER_PASS ? "(aus Umgebungsvariable)" : PASS));
});
