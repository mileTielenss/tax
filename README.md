# Loonpakket-calculator bedrijfsleider

Offline-first PWA waarmee iedereen (bedrijfsleider, niet RSZ-onderworpen) zijn
loonpakket kan doorrekenen: wat komt er netto binnen en wat geeft de
vennootschap in totaal uit. Het pakket omvat cash brutoloon, voordelen alle
aard (bedrijfswagen, bewoning, rente bulletkrediet, pc, internet, telefonie),
aandelenopties, maaltijdcheques, belastingvrije onkostenvergoedingen en een
IPT-premie met raming van de 80%-regel. Invoer kan per maand of per jaar;
de uitkomst toont beide kolommen, zoals de simulatie van de boekhouder.
Eén scherm, geen login, geen backend, geen database.

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

1. Belastbare basis = cashloon + som voordelen alle aard + VAA aandelenopties
2. Forfaitaire beroepskosten = 3% van de basis, geplafonneerd
3. Sociale bijdrage = progressief zelfstandigenstelsel op de basis (20,5% / 14,16%), plus beheerskost fonds; volledig fiscaal aftrekbaar
4. Netto belastbaar = basis − beroepskosten − sociale bijdrage
5. Staatsbelasting = progressieve schijven, daarna belastingvrije som × 25% verrekend
6. Gemeentebelasting = staatsbelasting × opcentiemen (instelbaar)
7. Netto cash = cashloon − belasting (zonder optiedeel) (− sociale bijdrage indien privé gedragen) + onkostenvergoedingen − eigen bijdrage maaltijdcheques. VAA worden nooit van het cashloon afgetrokken: ze zaten er nooit in.

Daarbovenop, volgens de mechaniek uit de simulatie van de boekhouder:

- **Aandelenopties**: VAA = bruto toekenning × onderliggende-factor (1,83) × VAA-percentage (18%). De heffing op de opties is de exacte delta tussen de berekening mét en zonder opties-VAA; netto uit opties = bruto − heffing − verkoopkost (8%). Beheerskost draagt de vennootschap.
- **Maaltijdcheques**: nettowaarde = aantal × zichtwaarde; eigen bijdrage (min. € 1,09/cheque) gaat van het netto af; werkgeversdeel en beheerskost (7,5%) zijn vennootschapskost.
- **Netto gecorrigeerd** = netto cash + opties netto + nettowaarde maaltijdcheques.
- **Vennootschap cash out** = cashloon + sociale bijdrage + onkosten + maaltijdcheques (werkgeversdeel + beheer) + opties (bruto + beheer) + IPT-premie.
- **80%-regel IPT (raming)**: max. aanvullende jaarrente = 80% × bruto (cash + VAA) − geraamd wettelijk pensioen; × loopbaan/40 × omzettingscoëfficiënt = max. eindkapitaal; gedeeld door de resterende jaren = indicatieve maximale jaarpremie. Alle coëfficiënten zijn instelbaar in het tarievenscherm.

## Testen

```
npm test
```

Vier ingebouwde testgevallen moeten bij elke build slagen:

1. Basis 50.000 → sociale bijdrage **€ 2.663,72 per kwartaal** (0,205 × 50.000 / 4 × 1,0395)
2. Het POL-pakket (cash 26.481 + VAA 23.518,87 = basis 50.000) → netto binnen kleine marge
3. De mechaniek uit de simulatie van de boekhouder: opties-VAA 6.048, verkoopkost 8%, maaltijdcheques 20 × € 10 (eigen bijdrage 261,60, beheer 180, nettowaarde 2.400) en de samenstelling van netto gecorrigeerd en vennootschaps-cash-out
4. De 80%-regelformule op bruto 32.460

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
