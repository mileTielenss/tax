# Loonberekening bedrijfsleider (MT-Rex)

Offline-first PWA die voor één bedrijfsleider (niet RSZ-onderworpen) berekent
wat er van een loonpakket netto op de rekening overblijft en wat de
vennootschap in totaal uitgeeft. Het pakket bevat naast het cash brutoloon ook
de voordelen alle aard (bewoning, rente bulletkrediet, bedrijfswagen,
gsm & internet). Eén scherm, geen login, geen backend, geen database.

## Opbouw

| Bestand | Rol |
|---|---|
| `engine.js` | Rekenmotor: pure functies, geen DOM of opslag |
| `params.js` | Wettelijke parameters per aanslagjaar + veldmetadata voor het beheerscherm |
| `storage.js` | Lokale overrides op de parameters (localStorage) |
| `app.js` | UI-schil: invoer lezen, herrekenen, weergeven |
| `index.html`, `styles.css` | Eén pagina met twee views: Berekening en Tarieven |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA-schil: installeerbaar en volledig offline |
| `test.js` | Ingebouwde testgevallen (`npm test`) |

## Rekenvolgorde

1. Belastbare basis = cashloon + som voordelen alle aard
2. Forfaitaire beroepskosten = 3% van de basis, geplafonneerd
3. Sociale bijdrage = progressief zelfstandigenstelsel op de basis (20,5% / 14,16%), plus beheerskost fonds; volledig fiscaal aftrekbaar
4. Netto belastbaar = basis − beroepskosten − sociale bijdrage
5. Staatsbelasting = progressieve schijven, daarna belastingvrije som × 25% verrekend
6. Gemeentebelasting = staatsbelasting × opcentiemen (Lommel)
7. Netto besteedbaar = cashloon − personenbelasting (− sociale bijdrage indien privé gedragen). VAA worden nooit van het cashloon afgetrokken: ze zaten er nooit in.

## Testen

```
npm test
```

Twee ingebouwde ijkpunten moeten bij elke build slagen:

1. Basis 50.000 → sociale bijdrage **€ 2.663,72 per kwartaal** (0,205 × 50.000 / 4 × 1,0395)
2. Het POL-pakket (cash 26.481 + VAA 23.518,87 = basis 50.000) → netto besteedbaar binnen kleine marge

Dezelfde ijkcontrole draait ook live in de app: wijzig je een tarief in het
beheerscherm en breekt het ijkpunt, dan verschijnt meteen een waarschuwing.

## Tarieven bijwerken

Open **Tarieven** in de app. Elk wettelijk cijfer is daar een bewerkbaar veld
met bronlink, aanslagjaar en datum van laatste wijziging. Aanpassingen worden
lokaal in de browser bewaard; de ingebouwde waarden in `params.js` blijven het
vertrekpunt en één knop herstelt ze. Voor een nieuw aanslagjaar voeg je in
`params.js` een nieuw blok toe (en verhoog je `CACHE` in `sw.js`).

Velden met een **VERIFY**-badge zijn nog niet tegen de primaire bron bevestigd:

- Plafond beroepskostenforfait (AJ2026: € 3.130 volgens geïndexeerde bedragen; bevestig tegen FOD Financiën)
- Opcentiemen Lommel (6% volgens secundaire bron; bevestig via het reglement op lommel.be)

## Lokaal draaien en deploy

```
npm start          # of: python3 -m http.server 8080
```

Open <http://localhost:8080>. (Dubbelklikken op `index.html` werkt ook voor de
berekening; de service worker vereist http(s).)

Elke push naar `main` draait de tests en publiceert de app naar GitHub Pages
(`.github/workflows/deploy-pages.yml`). Eenmalig in de repo-instellingen:
**Settings → Pages → Source: GitHub Actions**. Daarna staat de app op
`https://miletielenss.github.io/tax/` en kan je ze op gsm of desktop
installeren; ze werkt daarna volledig offline.

## Bewust buiten scope

De VAA-bedragen zelf (uit kadastraal inkomen, cataloguswaarde,
referentierentevoet) worden niet berekend — die komen uit de X-imus prognose en
van de boekhouder. Geen meerdere gebruikers, geen historiek, geen aangifte.
Indicatief instrument: de definitieve aanslag ligt bij de boekhouder.
