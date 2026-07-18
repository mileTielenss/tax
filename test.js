"use strict";
/*
 * Ingebouwde testgevallen uit de spec. Draaien met: npm test (of node test.js).
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

// Testgeval 2 — POL-simulatie: volledig pakket
console.log("");
console.log("Testgeval 2: POL-pakket");
var r = Engine.berekenPakket({
  cashloon: 26481,
  vaa: { bewoning: 7939.75, renteBulletkrediet: 13119.12, wagen: 2316, gsmInternet: 144 }
}, p, { bijdragePrive: false });

// De componenten uit de spec sommeren tot 49.999,87 — afronding in de POL-bron.
assertClose("belastbare basis", r.belastbareBasis, 50000, 0.5);
assertClose("forfaitaire beroepskosten (3%)", r.beroepskosten, 1500.00, 0.5);
assertClose("sociale bijdrage per jaar", r.socialeBijdrage.jaar, 10654.85, 1);
assertClose("netto belastbaar beroepsinkomen", r.nettoBelastbaar, 37845.02, 1);
assertClose("staatsbelasting", r.staat.staatsbelasting, 10414.76, 1);
assertClose("gemeentebelasting (Lommel 6%)", r.gemeentebelasting, 624.89, 1);
assertClose("netto besteedbaar per jaar", r.nettoBesteedbaarJaar, 15441.35, 5);
assertClose("vennootschap cash uit", r.vennootschapCashUit, 37135.85, 5);

// VAA mogen de cash nooit verlagen: netto = cash - PB, niet basis - PB.
assertTrue("VAA niet van cashloon afgetrokken", Math.abs((r.input.cashloon - r.personenbelasting) - r.nettoBesteedbaarJaar) < 0.001);

console.log("");
if (fouten > 0) {
  console.error(fouten + " testgeval(len) GEFAALD");
  process.exit(1);
}
console.log("Alle testgevallen geslaagd.");
