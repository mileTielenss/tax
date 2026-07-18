"use strict";
/*
 * Ingebouwde testgevallen. Draaien met: npm test (of node test.js).
 * Faalt een geval, dan is een parameter of de rekenmotor stuk.
 */
var Engine = require("./engine.js");
var Params = require("./params.js");

var p = Params.BUILTIN_PARAMS["2026"];
var fouten = 0;

function assertClose(naam, berekend, verwacht, tolerantie) {
  var ok = Math.abs(berekend - verwacht) <= tolerantie;
  console.log((ok ? "OK  " : "FOUT") + "  " + naam + ": berekend " + berekend.toFixed(2) + ", verwacht " + verwacht.toFixed(2) + " (tolerantie " + tolerantie + ")");
  if (!ok) fouten++;
}

function assertTrue(naam, conditie) {
  console.log((conditie ? "OK  " : "FOUT") + "  " + naam);
  if (!conditie) fouten++;
}

// Testgeval 1 — ijkpunt sociale bijdrage:
// basis 50.000 -> 0,205 x 50.000 / 4 x 1,0395 = 2.663,72 EUR/kwartaal
console.log("Testgeval 1: sociale bijdrage op basis 50.000");
var sb = Engine.berekenSocialeBijdrage(50000, p);
assertClose("kwartaalbijdrage", sb.kwartaal, 2663.72, 0.01);
assertTrue("ijkcontrole slaagt op ingebouwde parameters", Engine.ijkcontrole(p).ok);

// Testgeval 2 — POL-simulatie: kernberekening zonder opties/cheques/onkosten
console.log("");
console.log("Testgeval 2: POL-pakket (kern)");
var r = Engine.berekenPakket({
  cashloon: 26481,
  vaa: { bewoning: 7939.75, renteBulletkrediet: 13119.12, wagen: 2316, andere: 144 }
}, p, { bijdragePrive: false });

// De componenten uit de spec sommeren tot 49.999,87 — afronding in de POL-bron.
assertClose("belastbare basis", r.belastbareBasis, 50000, 0.5);
assertClose("forfaitaire beroepskosten (3%)", r.beroepskosten, 1500.00, 0.5);
assertClose("sociale bijdrage per jaar", r.socialeBijdrage.jaar, 10654.85, 1);
assertClose("netto belastbaar beroepsinkomen", r.nettoBelastbaar, 37845.02, 1);
assertClose("staatsbelasting", r.staat.staatsbelasting, 10414.76, 1);
assertClose("gemeentebelasting (Lommel 6%)", r.gemeentebelasting, 624.89, 1);
assertClose("netto cash per jaar", r.nettoCash, 15441.35, 5);
assertClose("vennootschap cash uit", r.vennootschapCashUit, 37135.85, 5);

// VAA mogen de cash nooit verlagen: netto = cash - PB, niet basis - PB.
assertTrue("VAA niet van cashloon afgetrokken", Math.abs((r.input.cashloon - r.personenbelasting) - r.nettoCash) < 0.001);

// Testgeval 3 — mechaniek uit de simulatie van de boekhouder (Kevin):
// bezoldiging 2.500/maand + aandelenopties 1.530/maand + wagen/telefonie/internet
// + 20 maaltijdcheques van 10 + onkostenvergoedingen 250,99/maand.
console.log("");
console.log("Testgeval 3: simulatie boekhouder (opties, cheques, onkosten)");
var k = Engine.berekenPakket({
  cashloon: 30000,
  vaa: { wagen: 2316, internet: 60, telefonieToestel: 36, telefonieAbonnement: 48 },
  opties: { bruto: 18360, beheerskost: 600 },
  maaltijdcheques: { aantalPerMaand: 20, zichtwaarde: 10 },
  onkosten: { totaal: 3011.88 },
  ipt: { jaarpremie: 0, resterendeJaren: 20, reedsOpgebouwd: 0 }
}, p, { bijdragePrive: false });

assertClose("opties-VAA (18% x 1,83, simulatie: 6.048)", k.opties.vaa, 6048, 1);
assertClose("opties verkoopkost (8%)", k.opties.verkoopkost, 1468.80, 0.01);
assertClose("MC eigen bijdrage (simulatie: 261,60)", k.maaltijdcheques.eigenBijdrage, 261.60, 0.01);
assertClose("MC beheerskost (simulatie: 180)", k.maaltijdcheques.beheerskost, 180, 0.01);
assertClose("MC nettowaarde (simulatie: 2.400)", k.maaltijdcheques.nettowaarde, 2400, 0.01);
assertClose("MC werkgeversdeel", k.maaltijdcheques.werkgeversDeel, 2138.40, 0.01);
assertTrue("heffing op opties = delta met/zonder opties-VAA",
  Math.abs(k.opties.pbDelta - (k.personenbelasting - k.personenbelastingZonderOpties)) < 0.001);
assertTrue("netto gecorrigeerd = netto cash + opties netto + MC-waarde",
  Math.abs(k.nettoGecorrigeerd - (k.nettoCash + k.opties.netto + k.maaltijdcheques.nettowaarde)) < 0.001);
var verwachtVennootschap = 30000 + k.socialeBijdrage.jaar + 3011.88 + 2138.40 + 180 + 18360 + 600;
assertClose("vennootschap cash uit (samenstelling)", k.vennootschapCashUit, verwachtVennootschap, 0.01);

// Testgeval 4 — woning uit kadastraal inkomen:
// KI 1.000 x 2,2446 x 100/60 x 2 = 7.482, plus forfaits verwarming/elektriciteit
console.log("");
console.log("Testgeval 4: VAA woning en energie uit KI");
var w = Engine.berekenWoning({ ki: 1000, privePct: 1, verwarming: true, elektriciteit: true }, p);
assertClose("VAA woning (KI 1.000, 100% privé)", w.vaaWoning, 7482.00, 0.01);
assertClose("forfait verwarming", w.vaaVerwarming, 2500, 0.01);
assertClose("forfait elektriciteit", w.vaaElektriciteit, 1250, 0.01);
assertClose("totaal woning & energie", w.totaal, 11232.00, 0.01);
var wHalf = Engine.berekenWoning({ ki: 1000, privePct: 0.5 }, p);
assertClose("VAA woning bij 50% privégedeelte", wHalf.vaaWoning, 3741.00, 0.01);

// Testgeval 5 — 80%-regel IPT op bruto 32.460 (cash + gewone VAA)
console.log("");
console.log("Testgeval 5: 80%-regel IPT");
assertClose("maximale aanvullende rente", k.ipt80.maxAanvullendeRente, 17853, 0.5);
assertClose("maximaal kapitaal (x 13,43)", k.ipt80.maxKapitaal, 239765.79, 1);
assertClose("indicatieve jaarpremie (20 jaar)", k.ipt80.indicatieveJaarpremie, 11988.29, 1);
assertTrue("premie 0 zit binnen de ruimte", !k.ipt80.premieBovenRuimte);

console.log("");
if (fouten > 0) {
  console.error(fouten + " controle(s) GEFAALD");
  process.exit(1);
}
console.log("Alle testgevallen geslaagd.");
