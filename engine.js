"use strict";
/*
 * Rekenmotor loonberekening bedrijfsleider (niet RSZ-onderworpen).
 * Pure functies: geen DOM, geen opslag, geen neveneffecten.
 * Bedragen intern in volle precisie; afronding gebeurt pas bij weergave.
 */
(function (root) {

  // Progressieve sociale bijdrage zelfstandigen op de belastbare basis,
  // verhoogd met de beheerskost van het sociaal verzekeringsfonds.
  function berekenSocialeBijdrage(belastbareBasis, p) {
    var g1 = p["sb.grensSchijf1"];
    var g2 = p["sb.grensSchijf2"];
    var schijf1Bedrag = p["sb.tariefSchijf1"] * Math.min(belastbareBasis, g1);
    var schijf2Bedrag = p["sb.tariefSchijf2"] * Math.max(0, Math.min(belastbareBasis, g2) - g1);

    var kwartaalExclBeheer = (schijf1Bedrag + schijf2Bedrag) / 4;
    var minimumToegepast = kwartaalExclBeheer < p["sb.minKwartaalExclBeheer"];
    if (minimumToegepast) kwartaalExclBeheer = p["sb.minKwartaalExclBeheer"];
    var maximumToegepast = kwartaalExclBeheer > p["sb.maxKwartaalExclBeheer"];
    if (maximumToegepast) kwartaalExclBeheer = p["sb.maxKwartaalExclBeheer"];

    var kwartaal = kwartaalExclBeheer * (1 + p["sb.beheerskostPct"]);
    return {
      schijf1Bedrag: schijf1Bedrag,
      schijf2Bedrag: schijf2Bedrag,
      kwartaalExclBeheer: kwartaalExclBeheer,
      jaarExclBeheer: kwartaalExclBeheer * 4,
      beheerskostJaar: (kwartaal - kwartaalExclBeheer) * 4,
      kwartaal: kwartaal,
      jaar: kwartaal * 4,
      minimumToegepast: minimumToegepast,
      maximumToegepast: maximumToegepast
    };
  }

  function pbSchijven(p) {
    return [
      { tot: p["pb.schijf1.tot"], tarief: p["pb.schijf1.tarief"] },
      { tot: p["pb.schijf2.tot"], tarief: p["pb.schijf2.tarief"] },
      { tot: p["pb.schijf3.tot"], tarief: p["pb.schijf3.tarief"] },
      { tot: null, tarief: p["pb.schijf4.tarief"] }
    ];
  }

  // Progressieve schijven op het netto belastbaar beroepsinkomen; de
  // belastingvrije som wordt verrekend aan het tarief van de laagste schijf.
  function berekenStaatsbelasting(nettoBelastbaar, p) {
    var schijven = pbSchijven(p);
    var schijfBedragen = [];
    var brutoBelasting = 0;
    var ondergrens = 0;
    for (var i = 0; i < schijven.length; i++) {
      var bovengrens = schijven[i].tot === null ? Infinity : schijven[i].tot;
      var grondslag = Math.max(0, Math.min(nettoBelastbaar, bovengrens) - ondergrens);
      var belasting = grondslag * schijven[i].tarief;
      schijfBedragen.push({ tot: schijven[i].tot, tarief: schijven[i].tarief, grondslag: grondslag, belasting: belasting });
      brutoBelasting += belasting;
      ondergrens = bovengrens;
    }
    var belastingvrijeSomKorting = p["pb.belastingvrijeSom"] * schijven[0].tarief;
    var staatsbelasting = Math.max(0, brutoBelasting - belastingvrijeSomKorting);
    return {
      schijfBedragen: schijfBedragen,
      brutoBelasting: brutoBelasting,
      belastingvrijeSomKorting: belastingvrijeSomKorting,
      staatsbelasting: staatsbelasting
    };
  }

  // Volledige berekening van het loonpakket.
  // input:   { cashloon, vaa: { bewoning, renteBulletkrediet, wagen, gsmInternet } }
  // p:       opgeloste parameters voor een aanslagjaar (flat map)
  // options: { bijdragePrive } — false = vennootschap draagt de sociale bijdrage
  function berekenPakket(input, p, options) {
    options = options || {};
    var bijdragePrive = !!options.bijdragePrive;
    var vaa = input.vaa || {};
    var vaaTotaal = (vaa.bewoning || 0) + (vaa.renteBulletkrediet || 0) + (vaa.wagen || 0) + (vaa.gsmInternet || 0);
    var cashloon = input.cashloon || 0;
    var belastbareBasis = cashloon + vaaTotaal;

    var kostenOngeplafonneerd = p["kosten.pct"] * belastbareBasis;
    var beroepskosten = Math.min(kostenOngeplafonneerd, p["kosten.plafond"]);
    var beroepskostenGeplafonneerd = kostenOngeplafonneerd > p["kosten.plafond"];

    var socialeBijdrage = berekenSocialeBijdrage(belastbareBasis, p);

    // De sociale bijdrage is volledig fiscaal aftrekbaar, ongeacht wie ze draagt.
    var nettoBelastbaar = Math.max(0, belastbareBasis - beroepskosten - socialeBijdrage.jaar);

    var staat = berekenStaatsbelasting(nettoBelastbaar, p);
    var gemeentebelasting = staat.staatsbelasting * p["gemeente.opcentiemenPct"];
    var personenbelasting = staat.staatsbelasting + gemeentebelasting;
    var totaleHeffingen = personenbelasting + socialeBijdrage.jaar;

    // VAA worden nooit van het cashloon afgetrokken: ze zaten er nooit in.
    var nettoBesteedbaarJaar = cashloon - personenbelasting - (bijdragePrive ? socialeBijdrage.jaar : 0);
    var vennootschapCashUit = cashloon + (bijdragePrive ? 0 : socialeBijdrage.jaar);

    return {
      input: input,
      options: { bijdragePrive: bijdragePrive },
      vaaTotaal: vaaTotaal,
      belastbareBasis: belastbareBasis,
      beroepskosten: beroepskosten,
      beroepskostenGeplafonneerd: beroepskostenGeplafonneerd,
      socialeBijdrage: socialeBijdrage,
      nettoBelastbaar: nettoBelastbaar,
      staat: staat,
      gemeentebelasting: gemeentebelasting,
      personenbelasting: personenbelasting,
      totaleHeffingen: totaleHeffingen,
      nettoBesteedbaarJaar: nettoBesteedbaarJaar,
      nettoBesteedbaarMaand: nettoBesteedbaarJaar / 12,
      vennootschapCashUit: vennootschapCashUit
    };
  }

  // Vaste ijkcontrole uit de spec: basis 50.000 -> 2.663,72 EUR/kwartaal
  // (0,205 x 50.000 / 4 x 1,0395). Breekt dit na een parameterwijziging,
  // dan is er vermoedelijk een cijfer fout overgetikt.
  var IJK_BASIS = 50000;
  var IJK_VERWACHT_KWARTAAL = 2663.72;
  var IJK_TOLERANTIE = 0.01;

  function ijkcontrole(p) {
    var berekend = berekenSocialeBijdrage(IJK_BASIS, p).kwartaal;
    return {
      ok: Math.abs(berekend - IJK_VERWACHT_KWARTAAL) <= IJK_TOLERANTIE,
      basis: IJK_BASIS,
      verwacht: IJK_VERWACHT_KWARTAAL,
      berekend: berekend
    };
  }

  var Engine = {
    berekenPakket: berekenPakket,
    berekenSocialeBijdrage: berekenSocialeBijdrage,
    berekenStaatsbelasting: berekenStaatsbelasting,
    ijkcontrole: ijkcontrole
  };

  if (typeof module !== "undefined" && module.exports) module.exports = Engine;
  else root.Engine = Engine;

})(this);
