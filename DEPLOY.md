# Deployment vera-consult.de (Render Free → später IONOS VPS)

## 1. Code zu GitHub pushen

Auf github.com: **New repository** → Name z. B. `vera-consult`, **Private**, ohne README anlegen.
Dann hier im Projektordner:

```
git remote add origin https://github.com/DEIN-GITHUB-NAME/vera-consult.git
git push -u origin main
```

## 2. Render einrichten

1. dashboard.render.com → **New** → **Web Service** → GitHub-Repo `vera-consult` verbinden.
2. Einstellungen:
   - Language/Runtime: **Node**
   - Build Command: *(leer lassen)*
   - Start Command: `node server.js`
   - Instance Type: **Free**
3. **Environment Variable** anlegen:
   - Key: `KONTAKTREGISTER_PASS`
   - Value: *(euer neuer, langer Zugangscode – selbst wählen, mind. 20 Zeichen)*
4. **Create Web Service** → nach dem ersten Deploy ist die Seite unter
   `https://vera-consult.onrender.com` erreichbar (Name kann abweichen).

## 3. Eigene Domain verbinden

1. In Render: Service → **Settings → Custom Domains** → `vera-consult.de` und
   `www.vera-consult.de` hinzufügen. Render zeigt die nötigen DNS-Werte an.
2. Bei IONOS: Domain → **DNS** →
   - `www` als **CNAME** auf den angezeigten `…onrender.com`-Host
   - Apex (`vera-consult.de`) als **A-Record** auf die von Render angezeigte IP
3. Warten bis Render „Certificate Issued" zeigt (HTTPS automatisch, kann bis zu 1 h dauern).

## 4. Wichtig im Free-Tarif

- Server schläft nach ~15 min Inaktivität ein (erster Aufruf danach dauert ~1 min).
- **`data.json` wird bei jedem Neustart/Deploy gelöscht** → nach Pflege-Sitzungen im
  Register immer **Export** klicken und die Datei lokal sichern; nach Neustart **Import**.

## 5. Später: Umzug auf IONOS VPS (~3 €/Monat)

1. VPS mit Ubuntu bestellen, Node.js installieren, Repo klonen.
2. `KONTAKTREGISTER_PASS` als Umgebungsvariable setzen, App per systemd starten.
3. Reverse Proxy (Caddy) mit Let's-Encrypt-Zertifikat vor Port 3112.
4. Letzten Export importieren, DNS bei IONOS vom Render-Host auf die VPS-IP umstellen.

## Interner Zugang

Das Kontaktregister liegt unverlinkt unter `https://vera-consult.de/intern`
(Login mit dem Zugangscode aus der Umgebungsvariable).
