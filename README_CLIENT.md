# JARVIS · Druckelite24
### Ihr persönlicher Business-Assistent

---

## Was ist JARVIS?

JARVIS ist ein sprachgesteuerter Business-Assistent, der direkt im Browser läuft — ohne Installation, ohne App. Sie sprechen Deutsch, JARVIS antwortet auf Deutsch und zeigt Ihnen gleichzeitig Live-Daten aus Ihrem Shopify-Shop auf einem übersichtlichen Dashboard.

---

## Was wurde in Phase 1 geliefert?

| Bereich | Was enthalten ist |
|---|---|
| 🎙️ **Sprachkern** | Blitzschnelle Sprachantworten (Ziel: unter 800 ms) — kein Ruckeln, kein Warten |
| 🗣️ **Nur Deutsch** | JARVIS antwortet immer auf Deutsch, egal in welcher Sprache Sie ihn ansprechen |
| 🔇 **Kein Überschneiden** | JARVIS redet nie gleichzeitig mit Ihnen oder sich selbst |
| ⏱️ **Sprechpausen erkannt** | JARVIS wartet, bis Sie fertig gesprochen haben — auch bei natürlichen Pausen |
| 💬 **Wake Word** | Sagen Sie einfach „Hey Jarvis" — er hört sofort zu |
| 📱 **iPhone & iPad** | Tap-to-Talk-Schaltfläche für iOS, funktioniert in Safari |
| 📊 **Live-Dashboard** | 4 Panels gleichzeitig sichtbar: Bestellungen, Umsatz, Produkte, Systemstatus |
| 🛒 **Shopify-Daten** | Echte Live-Daten aus Ihrem Shop — keine Beispieldaten |
| 🔒 **Nur Lesezugriff** | JARVIS kann nichts in Ihrem Shop verändern — nur anzeigen und berichten |

---

## So benutzen Sie JARVIS

### Starten
1. Öffnen Sie die JARVIS-URL in Ihrem Browser (Desktop, iPhone oder iPad)
2. Klicken Sie auf den **Orb** (den leuchtenden Kreis in der Mitte)
3. Erlauben Sie den Mikrofonzugriff, wenn der Browser fragt

### Sprechen
- Sagen Sie **„Hey Jarvis"** — der Orb leuchtet auf
- Oder drücken Sie auf **„🎤 SPRECHEN"** (besonders auf dem iPhone)
- Stellen Sie Ihre Frage auf Deutsch

### Beispielfragen
| Frage | Was JARVIS macht |
|---|---|
| *„Wie ist der Umsatz heute?"* | Nennt den heutigen Tagesumsatz |
| *„Was sind die letzten Bestellungen?"* | Liest die neuesten Aufträge vor |
| *„Welches Produkt verkauft sich am besten?"* | Nennt den Bestseller des Monats |
| *„Wie viele Bestellungen sind offen?"* | Gibt die Anzahl offener Aufträge an |

### Dashboard-Panels (immer sichtbar)

| Panel | Inhalt | Aktualisierung |
|---|---|---|
| **Bestellungen** | Letzte 20 Aufträge mit Status | Alle 60 Sekunden |
| **Umsatz täglich** | Balkendiagramm letzte 7 Tage | Alle 60 Sekunden |
| **Top Produkte** | Meistverkaufte Produkte (30 Tage) | Alle 5 Minuten |
| **Systemstatus** | Verbindungsstatus OpenAI + Shopify | Live |

### Statusanzeigen des Orbs

| Farbe / Animation | Bedeutung |
|---|---|
| ⚫ Dunkel, ruhig | Bereit — wartet auf Wake Word |
| 🟣 Magenta, pulsierend | Hört zu |
| 🟡 Gelb, pulsierend | Denkt / verarbeitet |
| 🟢 Grün, leuchtend | Spricht gerade |
| 🔴 Rot | Fehler — Meldung erscheint im Dashboard |

---

## Was Sie noch bereitstellen müssen

Damit JARVIS live gehen kann, benötigen wir noch folgende Angaben von Ihnen:

| Was | Wo Sie es finden | Status |
|---|---|---|
| **OpenAI API Key** | platform.openai.com → API Keys | ⏳ Ausstehend |
| **Shopify Custom App** | Shopify Admin → Apps → Eigene Apps | ⏳ Ausstehend |
| **Render-Zugang** | render.com — Region: Frankfurt, bezahlter Plan | ⏳ Ausstehend |
| **Exakter Markenton** | Ihr Magenta-Farbwert als Hex-Code (z.B. #E6007E) | ⏳ Bestätigen |
| **Logo-Datei** | PNG oder SVG in Weiß | ⏳ Ausstehend |

> **Wichtig — Hosting-Plan:**
> JARVIS muss auf einem **bezahlten Render-Plan** in der Region **Frankfurt** laufen.
> Der kostenlose Plan schläft nach Inaktivität ein und braucht dann 20–30 Sekunden zum Aufwachen —
> das ist der Hauptgrund, warum das alte System sich „zu langsam" angefühlt hat.

---

## Was ist NICHT in Phase 1 enthalten?

Diese Funktionen wurden bewusst für spätere Phasen zurückgestellt:

| Funktion | Warum nicht in Phase 1 |
|---|---|
| Gmail-Integration | Eigene Google-Verifizierung erforderlich |
| WhatsApp via Superchat | Abhängig von Ihrem Superchat-Vertrag |
| Individuelle JARVIS-Stimme | Separat kalkuliert — geschwindigkeitskritisch |
| Meta Ads / Berichte | Eigene Meta-Verifizierung erforderlich |
| Bestellungen ändern / bestätigen | Sicherheits-Review vor Schreibzugriff |
| Telefonie-Integration | Eigene Nummernvergabe erforderlich |

---

## Wichtige Hinweise

- **JARVIS ist nur lesend** — er kann keine Bestellungen ändern, Mails senden oder Daten löschen
- **Bestellhistorie** — Shopify erlaubt standardmäßig Zugriff auf ca. die letzten 60 Tage. Ältere Daten sind auf Anfrage bei Shopify freischaltbar
- **Währung** — aktuell ist EUR als einzige Währung konfiguriert. Bitte bestätigen Sie, ob Ihr Shop ausschließlich in EUR verkauft
- **Gleichzeitige Nutzer** — Phase 1 ist für einen Nutzer auf einem Gerät gleichzeitig ausgelegt

---

## Support & Kontakt

Bei Fragen oder Problemen wenden Sie sich bitte an Ihren Entwickler.

Für Fehlermeldungen bitte immer angeben:
1. Was Sie gesagt / getan haben
2. Was JARVIS gemacht hat (oder nicht)
3. Was das Dashboard-Panel „Systemstatus" anzeigt

---

*JARVIS · Druckelite24 — Phase 1 · Stand: August 2026*
