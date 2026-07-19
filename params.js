"use strict";
/*
 * Wettelijke parameters per aanslagjaar. Dit bestand is de ingebouwde
 * vertreklaag; wijzigingen via het beheerscherm gaan naar localStorage
 * en laten deze waarden ongemoeid.
 *
 * Bedragen zijn geverifieerd op 2026-07-18 tegen de bronnen in PARAM_FIELDS.
 * Velden met verify: true zijn nog niet tegen de primaire bron bevestigd.
 */
(function (root) {

  var BUILTIN_PARAMS = {
    "2027": {
      // Personenbelasting, aanslagjaar 2027 (inkomsten 2026)
      "pb.schijf1.tot": 16720,
      "pb.schijf1.tarief": 0.25,
      "pb.schijf2.tot": 29510,
      "pb.schijf2.tarief": 0.40,
      "pb.schijf3.tot": 51070,
      "pb.schijf3.tarief": 0.45,
      "pb.schijf4.tarief": 0.50,
      "pb.belastingvrijeSom": 11180,

      // Forfaitaire beroepskosten bedrijfsleider (3%, geplafonneerd)
      "kosten.pct": 0.03,
      "kosten.plafond": 3200,

      // Sociale bijdragen zelfstandigen, bijdragejaar 2026 (RSVZ)
      "sb.tariefSchijf1": 0.205,
      "sb.tariefSchijf2": 0.1416,
      "sb.grensSchijf1": 75024.54,
      "sb.grensSchijf2": 110562.42,
      "sb.minKwartaalExclBeheer": 890.42,
      "sb.maxKwartaalExclBeheer": 5103.05,
      "sb.beheerskostPct": 0.0395,

      // Aanvullende gemeentebelasting
      "gemeente.naam": "Lommel",
      "gemeente.opcentiemenPct": 0.06,

      // Woning en energie via de vennootschap (VAA, officiele cijfers
      // inkomstenjaar 2026 volgens Securex/Group S; identiek aan het
      // X-imus analyseverslag: KI 713 x 75% x 2,3 x 100/60 x 2
      // = 4.099,75 + forfaits = 7.939,75)
      "vaa.kiIndexatie": 2.3,
      "vaa.woningFactor": 2,
      "vaa.verwarmingForfait": 2560,
      "vaa.elektriciteitForfait": 1280,

      // Maaltijdcheques (vrijgesteld mits minimale eigen bijdrage en max zichtwaarde)
      "mc.minEigenBijdrage": 1.09,
      "mc.maxZichtwaarde": 10,
      "mc.beheerskostPct": 0.075,

      // Aandelenopties (optiewet 26/03/1999, zoals in de simulatie van de boekhouder):
      // VAA = bruto toekenning x onderliggende-factor x VAA-percentage
      "opties.vaaPct": 0.18,
      "opties.onderliggendeFactor": 1.83,
      "opties.verkoopkostPct": 0.08
    }
    // Nieuw aanslagjaar: blok kopieren, sleutel en bedragen aanpassen.
  };

  var BRON = {
    pb: "https://www.practicali.be/blog/geindexeerde-bedragen-aj-2027",
    pbOfficieel: "https://financien.belgium.be",
    sb: "https://www.liantis.be/sites/default/files/uploads/bijdragetabel_2026_1225_NL_digitaal.pdf",
    sbOfficieel: "https://www.rsvz.be/nl/faq/hoeveel-sociale-bijdragen-moet-ik-betalen",
    gemeente: "https://www.lommel.be/aanvullende-gemeentebelasting-op-de-personenbelasting-van-de-staat",
    woning: "https://www.securex.be/nl/lex4you/werkgever/actuele-bedragen/sociaalrechtelijke-bedragen/huisvesting,-verwarming-en-elektriciteit",
    mc: "https://www.rsz.be/werkgevers/loonelementen/voordelen/maaltijdcheques",
    opties: "https://financien.belgium.be/nl/ondernemingen/personenbelasting/voordelen-alle-aard/aandelenopties",
    ipt: "https://financien.belgium.be/nl/ondernemingen/vennootschapsbelasting/belastingvoordelen/individuele-pensioentoezegging"
  };

  // Metadata die het beheerscherm aandrijft: een entry per bewerkbaar veld.
  // type: "eur" | "pct" | "tekst"
  var PARAM_FIELDS = [
    { key: "pb.schijf1.tot", label: "Schijf 1: bovengrens", categorie: "Personenbelasting", type: "eur", bron: BRON.pb, verify: false },
    { key: "pb.schijf1.tarief", label: "Schijf 1: tarief", categorie: "Personenbelasting", type: "pct", bron: BRON.pb, verify: false },
    { key: "pb.schijf2.tot", label: "Schijf 2: bovengrens", categorie: "Personenbelasting", type: "eur", bron: BRON.pb, verify: false },
    { key: "pb.schijf2.tarief", label: "Schijf 2: tarief", categorie: "Personenbelasting", type: "pct", bron: BRON.pb, verify: false },
    { key: "pb.schijf3.tot", label: "Schijf 3: bovengrens", categorie: "Personenbelasting", type: "eur", bron: BRON.pb, verify: false },
    { key: "pb.schijf3.tarief", label: "Schijf 3: tarief", categorie: "Personenbelasting", type: "pct", bron: BRON.pb, verify: false },
    { key: "pb.schijf4.tarief", label: "Schijf 4: tarief (boven schijf 3)", categorie: "Personenbelasting", type: "pct", bron: BRON.pb, verify: false },
    { key: "pb.belastingvrijeSom", label: "Belastingvrije som (basisbedrag)", categorie: "Personenbelasting", type: "eur", bron: BRON.pb, verify: false },

    { key: "kosten.pct", label: "Forfait bedrijfsleider", categorie: "Beroepskosten", type: "pct", bron: BRON.pb, verify: false },
    { key: "kosten.plafond", label: "Plafond forfait (AJ2027: 3.200)", categorie: "Beroepskosten", type: "eur", bron: BRON.pb, verify: true },

    { key: "sb.tariefSchijf1", label: "Tarief schijf 1", categorie: "Sociale bijdragen", type: "pct", bron: BRON.sbOfficieel, verify: false },
    { key: "sb.tariefSchijf2", label: "Tarief schijf 2", categorie: "Sociale bijdragen", type: "pct", bron: BRON.sbOfficieel, verify: false },
    { key: "sb.grensSchijf1", label: "Grens schijf 1", categorie: "Sociale bijdragen", type: "eur", bron: BRON.sbOfficieel, verify: false },
    { key: "sb.grensSchijf2", label: "Grens schijf 2 (plafond)", categorie: "Sociale bijdragen", type: "eur", bron: BRON.sbOfficieel, verify: false },
    { key: "sb.minKwartaalExclBeheer", label: "Minimum kwartaalbijdrage (excl. beheer)", categorie: "Sociale bijdragen", type: "eur", bron: BRON.sb, verify: false },
    { key: "sb.maxKwartaalExclBeheer", label: "Maximum kwartaalbijdrage (excl. beheer)", categorie: "Sociale bijdragen", type: "eur", bron: BRON.sb, verify: false },
    { key: "sb.beheerskostPct", label: "Beheerskost verzekeringsfonds (Liantis)", categorie: "Sociale bijdragen", type: "pct", bron: BRON.sb, verify: false },

    { key: "gemeente.naam", label: "Gemeente", categorie: "Gemeentebelasting", type: "tekst", bron: BRON.gemeente, verify: false },
    { key: "gemeente.opcentiemenPct", label: "Aanvullende gemeentebelasting", categorie: "Gemeentebelasting", type: "pct", bron: BRON.gemeente, verify: true },

    { key: "vaa.kiIndexatie", label: "Indexatiecoëfficiënt kadastraal inkomen", categorie: "Woning & energie (VAA)", type: "factor", bron: BRON.woning, verify: false },
    { key: "vaa.woningFactor", label: "Vermenigvuldigingsfactor woning (x2)", categorie: "Woning & energie (VAA)", type: "factor", bron: BRON.woning, verify: false },
    { key: "vaa.verwarmingForfait", label: "Forfait verwarming (leidinggevend)", categorie: "Woning & energie (VAA)", type: "eur", bron: BRON.woning, verify: false },
    { key: "vaa.elektriciteitForfait", label: "Forfait elektriciteit (leidinggevend)", categorie: "Woning & energie (VAA)", type: "eur", bron: BRON.woning, verify: false },

    { key: "mc.minEigenBijdrage", label: "Minimale eigen bijdrage per cheque", categorie: "Maaltijdcheques", type: "eur", bron: BRON.mc, verify: false },
    { key: "mc.maxZichtwaarde", label: "Maximale zichtwaarde per cheque", categorie: "Maaltijdcheques", type: "eur", bron: BRON.mc, verify: true },
    { key: "mc.beheerskostPct", label: "Beheerskost uitgever", categorie: "Maaltijdcheques", type: "pct", bron: BRON.mc, verify: false },

    { key: "opties.vaaPct", label: "VAA-percentage optiewet", categorie: "Aandelenopties", type: "pct", bron: BRON.opties, verify: false },
    { key: "opties.onderliggendeFactor", label: "Onderliggende waarde / bruto toekenning", categorie: "Aandelenopties", type: "factor", bron: BRON.opties, verify: true },
    { key: "opties.verkoopkostPct", label: "Verkoopkost bij directe verkoop", categorie: "Aandelenopties", type: "pct", bron: BRON.opties, verify: true }
  ];

  var AANSLAGJAAR_LABELS = {
    "2027": "Aanslagjaar 2027 (inkomsten 2026)"
  };

  // Referentiecijfers uit het X-imus analyseverslag (14 juli 2026), om in
  // de app zichtbaar te maken waar de gebruikte parameters ervan afwijken.
  var XIMUS_WONING = {
    "vaa.kiIndexatie": 2.3,
    "vaa.verwarmingForfait": 2560,
    "vaa.elektriciteitForfait": 1280
  };

  var Params = {
    BUILTIN_PARAMS: BUILTIN_PARAMS,
    PARAM_FIELDS: PARAM_FIELDS,
    AANSLAGJAAR_LABELS: AANSLAGJAAR_LABELS,
    XIMUS_WONING: XIMUS_WONING
  };

  if (typeof module !== "undefined" && module.exports) module.exports = Params;
  else root.Params = Params;

})(this);
