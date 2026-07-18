"use strict";
/*
 * Rekenmotor loonpakket bedrijfsleider (niet RSZ-onderworpen).
 * Pure functies: geen DOM, geen opslag, geen neveneffecten.
 * Alle invoer en tussenwaarden op jaarbasis, in volle precisie;
 * afronding en maandweergave gebeuren pas in de UI.
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

  // Kern: van belastbare basis naar sociale bijdrage en personenbelasting.
  function berekenKern(belastbareBasis, p) {
    var kostenOngeplafonneerd = p["kosten.pct"] * belastbareBasis;
    var beroepskosten = Math.min(kostenOngeplafonneerd, p["kosten.plafond"]);
    var socialeBijdrage = berekenSocialeBijdrage(belastbareBasis, p);
    // De sociale bijdrage is volledig fiscaal aftrekbaar, ongeacht wie ze draagt.
    var nettoBelastbaar = Math.max(0, belastbareBasis - beroepskosten - socialeBijdrage.jaar);
    var staat = berekenStaatsbelasting(nettoBelastbaar, p);
    var gemeentebelasting = staat.staatsbelasting * p["gemeente.opcentiemenPct"];
    return {
      belastbareBasis: belastbareBasis,
      beroepskosten: beroepskosten,
      beroepskostenGeplafonneerd: kostenOngeplafonneerd > p["kosten.plafond"],
      socialeBijdrage: socialeBijdrage,
      nettoBelastbaar: nettoBelastbaar,
      staat: staat,
      gemeentebelasting: gemeentebelasting,
      personenbelasting: staat.staatsbelasting + gemeentebelasting
    };
  }

  // Woning via de vennootschap: VAA = geindexeerd KI x 100/60 x factor 2,
  // beperkt tot het privegedeelte. De forfaits verwarming/elektriciteit gelden
  // enkel als de vennootschap ook de woning ter beschikking stelt.
  function berekenWoning(woning, p) {
    woning = woning || {};
    var ki = woning.ki || 0;
    var privePct = woning.privePct === undefined ? 1 : woning.privePct;
    var vaaWoning = ki * p["vaa.kiIndexatie"] * (100 / 60) * p["vaa.woningFactor"] * privePct;
    // Gemeubelde woning: het woongedeelte wordt met 2/3 verhoogd.
    var markUpGemeubeld = woning.gemeubeld ? vaaWoning * (2 / 3) : 0;
    var vaaVerwarming = woning.verwarming ? p["vaa.verwarmingForfait"] : 0;
    var vaaElektriciteit = woning.elektriciteit ? p["vaa.elektriciteitForfait"] : 0;
    return {
      ki: ki,
      privePct: privePct,
      vaaWoning: vaaWoning,
      markUpGemeubeld: markUpGemeubeld,
      vaaVerwarming: vaaVerwarming,
      vaaElektriciteit: vaaElektriciteit,
      totaal: vaaWoning + markUpGemeubeld + vaaVerwarming + vaaElektriciteit
    };
  }

  // Aandelenopties: VAA = bruto toekenning x onderliggende-factor x VAA-percentage
  // (optiewet 26/03/1999). De heffing erop volgt via de delta-methode in
  // berekenPakket; de verkoopkost is het geraamde verlies bij directe verkoop.
  function berekenOptiesVaa(optiesBruto, p) {
    return optiesBruto * p["opties.onderliggendeFactor"] * p["opties.vaaPct"];
  }

  // Maaltijdcheques: vrijgesteld als de eigen bijdrage minstens het wettelijke
  // minimum bedraagt en de zichtwaarde het maximum niet overschrijdt.
  function berekenMaaltijdcheques(mc, p) {
    var aantalJaar = (mc.aantalPerMaand || 0) * 12;
    var zichtwaarde = mc.zichtwaarde || 0;
    var eigenBijdrage = aantalJaar * p["mc.minEigenBijdrage"];
    var totaleZichtwaarde = aantalJaar * zichtwaarde;
    return {
      aantalJaar: aantalJaar,
      zichtwaarde: zichtwaarde,
      eigenBijdrage: eigenBijdrage,
      werkgeversDeel: aantalJaar * Math.max(0, zichtwaarde - p["mc.minEigenBijdrage"]),
      beheerskost: totaleZichtwaarde * p["mc.beheerskostPct"],
      nettowaarde: totaleZichtwaarde,
      zichtwaardeBovenMax: zichtwaarde > p["mc.maxZichtwaarde"]
    };
  }

  // 80%-regel IPT (indicatieve raming): wettelijk + aanvullend pensioen mag
  // samen (als jaarrente) niet boven 80% van de normale brutobezoldiging.
  function berekenIpt80(brutoJaarbezoldiging, ipt, p) {
    var wettelijkPensioen = p["ipt.wettelijkPensioenPct"] * brutoJaarbezoldiging;
    var maxAanvullendeRente = Math.max(0, 0.8 * brutoJaarbezoldiging - wettelijkPensioen);
    var maxKapitaal = maxAanvullendeRente * (p["ipt.loopbaanJaren"] / 40) * p["ipt.omzettingsCoefficient"];
    var ruimte = Math.max(0, maxKapitaal - (ipt.reedsOpgebouwd || 0));
    var resterendeJaren = ipt.resterendeJaren || 0;
    // Premie via kapitalisatie: de stortingen renderen tot de pensioenleeftijd,
    // dus de maximale jaarpremie is het kapitaal gedeeld door de eindwaarde-
    // factor van een annuiteit (zoals in de X-imus prognose), niet door n.
    var rendement = p["ipt.rendementPct"] || 0;
    var eindwaardeFactor = resterendeJaren > 0
      ? (rendement > 0 ? (Math.pow(1 + rendement, resterendeJaren) - 1) / rendement : resterendeJaren)
      : 0;
    var indicatieveJaarpremie = eindwaardeFactor > 0 ? ruimte / eindwaardeFactor : 0;
    return {
      brutoJaarbezoldiging: brutoJaarbezoldiging,
      wettelijkPensioen: wettelijkPensioen,
      maxAanvullendeRente: maxAanvullendeRente,
      maxKapitaal: maxKapitaal,
      ruimte: ruimte,
      indicatieveJaarpremie: indicatieveJaarpremie,
      premieBovenRuimte: (ipt.jaarpremie || 0) > indicatieveJaarpremie && resterendeJaren > 0
    };
  }

  // Volledige berekening van het loonpakket. Alle bedragen per jaar.
  // input: {
  //   cashloon,
  //   vaa: { wagen, bewoning, renteBulletkrediet, pc, internet,
  //          telefonieToestel, telefonieAbonnement, andere },
  //   woning: { ki, privePct, verwarming, elektriciteit },
  //   opties: { bruto, beheerskost },
  //   maaltijdcheques: { aantalPerMaand, zichtwaarde },
  //   onkosten: { totaal },
  //   ipt: { jaarpremie, resterendeJaren, reedsOpgebouwd }
  // }
  // options: { bijdragePrive } — false = vennootschap draagt de sociale bijdrage
  function berekenPakket(input, p, options) {
    options = options || {};
    var bijdragePrive = !!options.bijdragePrive;
    var cashloon = input.cashloon || 0;
    var vaa = input.vaa || {};
    var opties = input.opties || {};
    var onkosten = input.onkosten || {};
    var ipt = input.ipt || {};

    var woning = berekenWoning(input.woning, p);

    var vaaTotaalExclOpties = woning.totaal;
    for (var k in vaa) vaaTotaalExclOpties += vaa[k] || 0;

    var optiesBruto = opties.bruto || 0;
    var optiesVaa = berekenOptiesVaa(optiesBruto, p);

    // Delta-methode: het pakket met en zonder opties-VAA doorrekenen, zodat de
    // heffing die aan de opties toe te rekenen valt exact zichtbaar wordt.
    var met = berekenKern(cashloon + vaaTotaalExclOpties + optiesVaa, p);
    var zonder = optiesVaa > 0 ? berekenKern(cashloon + vaaTotaalExclOpties, p) : met;

    var mc = berekenMaaltijdcheques(input.maaltijdcheques || {}, p);

    var pbDeltaOpties = met.personenbelasting - zonder.personenbelasting;
    var sbDeltaOpties = met.socialeBijdrage.jaar - zonder.socialeBijdrage.jaar;
    var heffingOpties = pbDeltaOpties + (bijdragePrive ? sbDeltaOpties : 0);
    var optiesVerkoopkost = optiesBruto * p["opties.verkoopkostPct"];
    var optiesNetto = optiesBruto - heffingOpties - optiesVerkoopkost;

    // VAA en opties worden nooit van het cashloon afgetrokken: ze zaten er
    // nooit in. De heffing op het optiedeel wordt aan de opties toegerekend.
    var nettoCash = cashloon
      - zonder.personenbelasting
      - (bijdragePrive ? zonder.socialeBijdrage.jaar : 0)
      + (onkosten.totaal || 0)
      - mc.eigenBijdrage;

    var nettoGecorrigeerd = nettoCash + (optiesBruto > 0 ? optiesNetto : 0) + mc.nettowaarde;

    var vennootschapCashUit = cashloon
      + (bijdragePrive ? 0 : met.socialeBijdrage.jaar)
      + (onkosten.totaal || 0)
      + mc.werkgeversDeel + mc.beheerskost
      + optiesBruto + (opties.beheerskost || 0)
      + (ipt.jaarpremie || 0);

    var ipt80 = berekenIpt80(cashloon + vaaTotaalExclOpties, ipt, p);

    return {
      input: input,
      options: { bijdragePrive: bijdragePrive },
      vaaTotaalExclOpties: vaaTotaalExclOpties,
      woning: woning,
      optiesVaa: optiesVaa,
      belastbareBasis: met.belastbareBasis,
      beroepskosten: met.beroepskosten,
      beroepskostenGeplafonneerd: met.beroepskostenGeplafonneerd,
      socialeBijdrage: met.socialeBijdrage,
      nettoBelastbaar: met.nettoBelastbaar,
      staat: met.staat,
      gemeentebelasting: met.gemeentebelasting,
      personenbelasting: met.personenbelasting,
      personenbelastingZonderOpties: zonder.personenbelasting,
      totaleHeffingen: met.personenbelasting + met.socialeBijdrage.jaar,
      opties: {
        bruto: optiesBruto,
        vaa: optiesVaa,
        heffing: heffingOpties,
        pbDelta: pbDeltaOpties,
        sbDelta: sbDeltaOpties,
        verkoopkost: optiesVerkoopkost,
        beheerskost: opties.beheerskost || 0,
        netto: optiesBruto > 0 ? optiesNetto : 0
      },
      maaltijdcheques: mc,
      onkostenTotaal: onkosten.totaal || 0,
      nettoCash: nettoCash,
      nettoGecorrigeerd: nettoGecorrigeerd,
      nettoGecorrigeerdMaand: nettoGecorrigeerd / 12,
      vennootschapCashUit: vennootschapCashUit,
      ipt80: ipt80
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
    berekenKern: berekenKern,
    berekenSocialeBijdrage: berekenSocialeBijdrage,
    berekenStaatsbelasting: berekenStaatsbelasting,
    berekenWoning: berekenWoning,
    berekenOptiesVaa: berekenOptiesVaa,
    berekenMaaltijdcheques: berekenMaaltijdcheques,
    berekenIpt80: berekenIpt80,
    ijkcontrole: ijkcontrole
  };

  if (typeof module !== "undefined" && module.exports) module.exports = Engine;
  else root.Engine = Engine;

})(this);
