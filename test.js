"use strict";
/*
 * Ingebouwde testgevallen. Draaien met: npm test (of node test.js).
 * Faalt een geval, dan is een parameter of de rekenmotor stuk.
 */
var Engine = require("./engine.js");
var Params = require("./params.js");

var p = Params.BUILTIN_PARAMS["2027"];
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
assertClose("staatsbelasting (AJ2027-schijven)", r.staat.staatsbelasting, 10251.76, 1);
assertClose("gemeentebelasting (Lommel 6%)", r.gemeentebelasting, 615.11, 1);
assertClose("netto cash per jaar", r.nettoCash, 15614.13, 5);
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

// Testgeval 4 — woning uit kadastraal inkomen, conform het X-imus verslag:
// KI 713 x 75% x 2,3 x 100/60 x 2 = 4.099,75; + forfaits 2.560/1.280 = 7.939,75
console.log("");
console.log("Testgeval 4: VAA woning en energie uit KI (X-imus)");
var w = Engine.berekenWoning({ ki: 713, privePct: 0.75, verwarming: true, elektriciteit: true }, p);
assertClose("woongedeelte (KI 713, 75% privé)", w.vaaWoning, 4099.75, 0.01);
assertClose("forfait verwarming 2026", w.vaaVerwarming, 2560, 0.01);
assertClose("forfait elektriciteit 2026", w.vaaElektriciteit, 1280, 0.01);
assertClose("totaal VAA woning (X-imus: 7.939,75)", w.totaal, 7939.75, 0.01);
var w100 = Engine.berekenWoning({ ki: 713, privePct: 1 }, p);
assertClose("woongedeelte bij 100% privé (X-imus: 5.466,33)", w100.vaaWoning, 5466.33, 0.01);
var wGem = Engine.berekenWoning({ ki: 713, privePct: 0.75, gemeubeld: true }, p);
assertClose("mark-up gemeubeld +2/3 (X-imus: 2.733,17)", wGem.markUpGemeubeld, 2733.17, 0.01);

// Testgeval 5 — 80%-regel IPT op bruto 32.460 (cash + gewone VAA);
// premie via kapitalisatie aan 4,7% (impliciet rendement X-imus prognose)
console.log("");
console.log("Testgeval 5: 80%-regel IPT");
assertClose("maximale aanvullende rente", k.ipt80.maxAanvullendeRente, 17853, 0.5);
assertClose("maximaal kapitaal (x 13,43)", k.ipt80.maxKapitaal, 239765.79, 1);
assertClose("indicatieve jaarpremie (20 jaar, 4,7%)", k.ipt80.indicatieveJaarpremie, 7484.09, 1);
assertTrue("premie 0 zit binnen de ruimte", !k.ipt80.premieBovenRuimte);

// X-imus consistentie: bij 48.000 bruto en 38,75 jaar moet de premie van
// 3.133,44 uit het verslag binnen de indicatieve ruimte vallen.
var ximusIpt = Engine.berekenIpt80(48000, { jaarpremie: 3133.44, resterendeJaren: 38.75, reedsOpgebouwd: 0 }, p);
assertClose("max premie bij 48.000 en 38,75 jaar", ximusIpt.indicatieveJaarpremie, 3381.24, 1);
assertTrue("X-imus premie 3.133,44 zit binnen de ruimte", !ximusIpt.premieBovenRuimte);

console.log("");
if (fouten > 0) {
  console.error(fouten + " controle(s) GEFAALD");
  process.exit(1);
}
console.log("Alle testgevallen geslaagd.");
