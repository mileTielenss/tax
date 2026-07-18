"use strict";
/*
 * UI-schil: simulaties beheren, invoer lezen, de rekenmotor laten draaien
 * op de opgeloste parameters (ingebouwd + lokale overrides) en de uitkomst
 * tonen. Bedragen worden ingegeven per maand of per jaar (globale keuze);
 * intern rekent alles op jaarbasis.
 */
(function () {

  var $ = function (id) { return document.getElementById(id); };

  var eur = new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" });
  var getal = new Intl.NumberFormat("nl-BE", { maximumFractionDigits: 2 });
  var pctFmt = new Intl.NumberFormat("nl-BE", { maximumFractionDigits: 2 });
  var factorFmt = new Intl.NumberFormat("nl-BE", { maximumFractionDigits: 4 });

  function formatEUR(n) { return eur.format(n); }
  function formatPct(fractie) { return pctFmt.format(fractie * 100) + "%"; }

  // Aanvaardt Belgische notatie (1.234,56) en internationale (1234.56).
  function parseBE(tekst) {
    if (typeof tekst !== "string") return 0;
    var schoon = tekst.replace(/[\s €]/g, "");
    if (schoon === "") return 0;
    if (schoon.indexOf(",") >= 0) schoon = schoon.replace(/\./g, "").replace(",", ".");
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(schoon)) schoon = schoon.replace(/\./g, "");
    var n = parseFloat(schoon);
    return isFinite(n) ? n : 0;
  }

  /* ---------- invoerconfiguratie ----------
   * Soorten velden:
   *   "bedrag" : bedrag, ingegeven per maand of per jaar (globale keuze)
   *   "jaar"   : bedrag altijd per jaar
   *   "eur"    : los bedrag
   *   "getal"  : gewoon getal (aantal, jaren, procent)
   *   "vink"   : ja/nee binnen de sectie
   * Waarden van bedrag/jaar-velden worden intern altijd per jaar bewaard. */
  var INVOER_SECTIES = [
    { id: "bezoldiging", titel: "Bezoldiging", velden: [
      { id: "cashloon", label: "Cash brutoloon", soort: "bedrag" }
    ]},
    { id: "wagen", titel: "Bedrijfswagen", toggle: true, velden: [
      { id: "vaa-wagen", label: "VAA wagen (loonfiche)", soort: "bedrag" }
    ]},
    { id: "woning", titel: "Woning via de vennootschap", toggle: true, velden: [
      { id: "woning-handmatig", label: "VAA-bedrag zelf ingeven (cijfer boekhouder)", soort: "vink" },
      { id: "woning-bedrag", label: "VAA bewoning (incl. forfaits)", soort: "jaar" },
      { id: "woning-ki", label: "Kadastraal inkomen (niet geïndexeerd)", soort: "eur" },
      { id: "woning-pct", label: "Privégedeelte (%)", soort: "getal" },
      { id: "woning-gemeubeld", label: "Gemeubeld (+2/3 op woongedeelte)", soort: "vink" },
      { id: "woning-verwarming", label: "Forfait verwarming", soort: "vink" },
      { id: "woning-elektriciteit", label: "Forfait elektriciteit", soort: "vink" },
      { id: "woning-preview", soort: "preview" }
    ]},
    { id: "overige", titel: "Overige voordelen alle aard", toggle: true, velden: [
      { id: "vaa-gsm", label: "Gsm, internet & pc", soort: "bedrag" },
      { id: "vaa-rente", label: "Rente bulletkrediet", soort: "bedrag" },
      { id: "vaa-andere", label: "Andere VAA", soort: "bedrag" }
    ]},
    { id: "opties", titel: "Aandelenopties", toggle: true, velden: [
      { id: "opties-bruto", label: "Bruto toekenning", soort: "bedrag" },
      { id: "opties-beheer", label: "Beheerskost (vennootschap)", soort: "bedrag" }
    ]},
    { id: "mc", titel: "Maaltijdcheques", toggle: true, velden: [
      { id: "mc-aantal", label: "Cheques per maand", soort: "getal" },
      { id: "mc-zichtwaarde", label: "Zichtwaarde per cheque", soort: "eur" }
    ]},
    { id: "onkosten", titel: "Onkostenvergoedingen (belastingvrij)", toggle: true, velden: [
      { id: "onk-totaal", label: "Totaal vergoedingen", soort: "bedrag" }
    ]},
    { id: "ipt", titel: "IPT (pensioen via de vennootschap)", toggle: true, velden: [
      { id: "ipt-premie", label: "Geplande jaarpremie", soort: "jaar" },
      { id: "ipt-restjaren", label: "Jaren tot pensioen", soort: "getal" },
      { id: "ipt-opgebouwd", label: "Reeds opgebouwd kapitaal", soort: "jaar" }
    ]}
  ];

  var BEDRAG_VELDEN = [];
  var GETAL_VELDEN = [];
  var VINK_VELDEN = [];
  var TOGGLES = [];
  INVOER_SECTIES.forEach(function (s) {
    if (s.toggle) TOGGLES.push(s.id);
    s.velden.forEach(function (v) {
      if (v.soort === "bedrag" || v.soort === "jaar") BEDRAG_VELDEN.push(v);
      else if (v.soort === "eur" || v.soort === "getal") GETAL_VELDEN.push(v);
      else if (v.soort === "vink") VINK_VELDEN.push(v);
    });
  });

  /* ---------- simulaties ----------
   * Opslag: { actief: naam, simulaties: { naam: { waarden, vinken, toggles,
   * bijdragePrive } } }. Bedragen altijd per jaar. */
  var SIM_KEY = "mtrex-loon.simulaties.v1";

  function presetKevin() {
    return {
      bijdragePrive: false,
      toggles: { wagen: true, woning: false, overige: true, opties: true, mc: true, onkosten: true, ipt: true },
      vinken: { "woning-handmatig": false, "woning-gemeubeld": false, "woning-verwarming": true, "woning-elektriciteit": true },
      waarden: {
        cashloon: 30000, "vaa-wagen": 2316, "woning-bedrag": 0, "woning-ki": 713, "woning-pct": 75,
        "vaa-gsm": 144, "vaa-rente": 0, "vaa-andere": 0,
        "opties-bruto": 18360, "opties-beheer": 600,
        "mc-aantal": 20, "mc-zichtwaarde": 10,
        "onk-totaal": 3011.88,
        "ipt-premie": 0, "ipt-restjaren": 20, "ipt-opgebouwd": 0
      }
    };
  }

  function presetMile() {
    var s = presetKevin();
    s.toggles = { wagen: true, woning: true, overige: true, opties: false, mc: false, onkosten: false, ipt: true };
    s.waarden.cashloon = 26481;
    s.waarden["vaa-rente"] = 13119.12;
    s.waarden["opties-bruto"] = 0;
    s.waarden["opties-beheer"] = 0;
    s.waarden["onk-totaal"] = 0;
    return s;
  }

  function laadSims() {
    var data = null;
    try { data = JSON.parse(localStorage.getItem(SIM_KEY)); } catch (e) { /* leeg */ }
    if (!data || !data.simulaties || !Object.keys(data.simulaties).length) {
      data = { actief: "Simulatie Kevin", simulaties: {
        "Simulatie Kevin": presetKevin(),
        "Simulatie Mile (woning)": presetMile()
      }};
      bewaarSims(data);
    }
    if (!data.simulaties[data.actief]) data.actief = Object.keys(data.simulaties)[0];
    return data;
  }

  function bewaarSims(data) {
    try { localStorage.setItem(SIM_KEY, JSON.stringify(data)); } catch (e) { /* opslag vol */ }
  }

  var sims = null;

  function actieveSim() { return sims.simulaties[sims.actief]; }

  /* ---------- maand/jaar-modus ---------- */
  var MODUS_KEY = "mtrex-loon.modus";
  var modus = "maand";
  try { modus = localStorage.getItem(MODUS_KEY) === "jaar" ? "jaar" : "maand"; } catch (e) { /* standaard */ }

  function zetModus(nieuw) {
    if (nieuw === modus) return;
    stateUitDom();
    modus = nieuw;
    try { localStorage.setItem(MODUS_KEY, modus); } catch (e) { /* opslag */ }
    $("modus-maand").classList.toggle("actief", modus === "maand");
    $("modus-jaar").classList.toggle("actief", modus === "jaar");
    stateNaarDom();
    herreken();
  }

  /* ---------- invoer opbouwen ---------- */

  function bouwInvoer() {
    var container = $("invoer-secties");
    INVOER_SECTIES.forEach(function (sectie) {
      var fs = document.createElement("fieldset");
      var legend = document.createElement("legend");
      if (sectie.toggle) {
        var tglLabel = document.createElement("label");
        tglLabel.className = "toggle-label";
        var tgl = document.createElement("input");
        tgl.type = "checkbox";
        tgl.id = "tgl-" + sectie.id;
        tglLabel.appendChild(tgl);
        tglLabel.appendChild(document.createTextNode(" " + sectie.titel));
        legend.appendChild(tglLabel);
        tgl.addEventListener("change", function () { verversSecties(); herreken(); });
      } else {
        legend.textContent = sectie.titel;
      }
      fs.appendChild(legend);

      var inhoud = document.createElement("div");
      inhoud.id = "inhoud-" + sectie.id;
      sectie.velden.forEach(function (veld) { inhoud.appendChild(maakVeldrij(veld)); });
      fs.appendChild(inhoud);
      container.appendChild(fs);
    });
  }

  function maakVeldrij(veld) {
    if (veld.soort === "preview") {
      var prev = document.createElement("p");
      prev.id = veld.id;
      prev.className = "toelichting";
      return prev;
    }
    var rij = document.createElement("div");
    rij.className = "veldrij";

    if (veld.soort === "vink") {
      var vinkLabel = document.createElement("label");
      vinkLabel.className = "toggle-label";
      var vink = document.createElement("input");
      vink.type = "checkbox";
      vink.id = veld.id;
      vink.addEventListener("change", herreken);
      vinkLabel.appendChild(vink);
      vinkLabel.appendChild(document.createTextNode(" " + veld.label));
      rij.appendChild(vinkLabel);
      return rij;
    }

    var label = document.createElement("label");
    label.id = "lbl-" + veld.id;
    label.htmlFor = veld.id;
    rij.appendChild(label);

    var input = document.createElement("input");
    input.type = "text";
    input.inputMode = "decimal";
    input.id = veld.id;
    input.addEventListener("input", herreken);
    rij.appendChild(input);
    return rij;
  }

  function veldLabel(veld) {
    if (veld.soort === "bedrag") return veld.label + (modus === "maand" ? " (per maand)" : " (per jaar)");
    if (veld.soort === "jaar") return veld.label + " (per jaar)";
    return veld.label;
  }

  function verversSecties() {
    TOGGLES.forEach(function (id) {
      $("inhoud-" + id).classList.toggle("verborgen", !$("tgl-" + id).checked);
    });
  }

  /* ---------- state <-> DOM ----------
   * De actieve simulatie is de bron van waarheid; bedragen per jaar. */

  function stateNaarDom() {
    var s = actieveSim();
    $("bijdrage-prive").checked = !!s.bijdragePrive;
    TOGGLES.forEach(function (id) { $("tgl-" + id).checked = !!s.toggles[id]; });
    VINK_VELDEN.forEach(function (v) { $(v.id).checked = !!s.vinken[v.id]; });
    BEDRAG_VELDEN.forEach(function (v) {
      var jaar = s.waarden[v.id] || 0;
      $(v.id).value = getal.format(v.soort === "bedrag" && modus === "maand" ? jaar / 12 : jaar);
      $("lbl-" + v.id).textContent = veldLabel(v);
    });
    GETAL_VELDEN.forEach(function (v) {
      $(v.id).value = getal.format(s.waarden[v.id] || 0);
      $("lbl-" + v.id).textContent = veldLabel(v);
    });
    verversSecties();
  }

  function stateUitDom() {
    var s = actieveSim();
    s.bijdragePrive = $("bijdrage-prive").checked;
    TOGGLES.forEach(function (id) { s.toggles[id] = $("tgl-" + id).checked; });
    VINK_VELDEN.forEach(function (v) { s.vinken[v.id] = $(v.id).checked; });
    BEDRAG_VELDEN.forEach(function (v) {
      var w = parseBE($(v.id).value);
      s.waarden[v.id] = v.soort === "bedrag" && modus === "maand" ? w * 12 : w;
    });
    GETAL_VELDEN.forEach(function (v) { s.waarden[v.id] = parseBE($(v.id).value); });
    bewaarSims(sims);
  }

  /* ---------- simulatiebalk ---------- */

  function verversSimSelect() {
    var select = $("sim-select");
    select.innerHTML = "";
    Object.keys(sims.simulaties).forEach(function (naam) {
      var optie = document.createElement("option");
      optie.value = naam;
      optie.textContent = naam;
      select.appendChild(optie);
    });
    select.value = sims.actief;
  }

  function wisselSim(naam) {
    stateUitDom();
    sims.actief = naam;
    bewaarSims(sims);
    stateNaarDom();
    herreken();
  }

  function nieuweSim() {
    var basis = "Nieuwe simulatie";
    var naam = window.prompt("Naam van de nieuwe simulatie (start van Kevins simulatie):", basis);
    if (!naam) return;
    naam = naam.trim();
    if (!naam || sims.simulaties[naam]) return;
    stateUitDom();
    sims.simulaties[naam] = presetKevin();
    sims.actief = naam;
    bewaarSims(sims);
    verversSimSelect();
    stateNaarDom();
    herreken();
  }

  function verwijderSim() {
    if (!window.confirm('Simulatie "' + sims.actief + '" verwijderen?')) return;
    delete sims.simulaties[sims.actief];
    if (!Object.keys(sims.simulaties).length) {
      sims.simulaties["Simulatie Kevin"] = presetKevin();
      sims.simulaties["Simulatie Mile (woning)"] = presetMile();
    }
    sims.actief = Object.keys(sims.simulaties)[0];
    bewaarSims(sims);
    verversSimSelect();
    stateNaarDom();
    herreken();
  }

  /* ---------- berekening + weergave ---------- */

  function aan(sectieId) { return $("tgl-" + sectieId).checked; }

  function jaarwaarde(veldId) {
    var veld = null;
    BEDRAG_VELDEN.forEach(function (v) { if (v.id === veldId) veld = v; });
    var w = parseBE($(veldId).value);
    return veld && veld.soort === "bedrag" && modus === "maand" ? w * 12 : w;
  }

  function huidigAanslagjaar() { return $("aanslagjaar").value; }

  function verzamelInput() {
    return {
      cashloon: jaarwaarde("cashloon"),
      vaa: {
        wagen: aan("wagen") ? jaarwaarde("vaa-wagen") : 0,
        gsmInternetPc: aan("overige") ? jaarwaarde("vaa-gsm") : 0,
        renteBulletkrediet: aan("overige") ? jaarwaarde("vaa-rente") : 0,
        andere: aan("overige") ? jaarwaarde("vaa-andere") : 0,
        bewoning: aan("woning") && $("woning-handmatig").checked ? jaarwaarde("woning-bedrag") : 0
      },
      woning: aan("woning") && !$("woning-handmatig").checked ? {
        ki: parseBE($("woning-ki").value),
        privePct: parseBE($("woning-pct").value) / 100,
        gemeubeld: $("woning-gemeubeld").checked,
        verwarming: $("woning-verwarming").checked,
        elektriciteit: $("woning-elektriciteit").checked
      } : { ki: 0 },
      opties: aan("opties")
        ? { bruto: jaarwaarde("opties-bruto"), beheerskost: jaarwaarde("opties-beheer") }
        : { bruto: 0, beheerskost: 0 },
      maaltijdcheques: aan("mc")
        ? { aantalPerMaand: parseBE($("mc-aantal").value), zichtwaarde: parseBE($("mc-zichtwaarde").value) }
        : { aantalPerMaand: 0, zichtwaarde: 0 },
      onkosten: { totaal: aan("onkosten") ? jaarwaarde("onk-totaal") : 0 },
      ipt: aan("ipt")
        ? { jaarpremie: jaarwaarde("ipt-premie"), resterendeJaren: parseBE($("ipt-restjaren").value), reedsOpgebouwd: jaarwaarde("ipt-opgebouwd") }
        : { jaarpremie: 0, resterendeJaren: 0, reedsOpgebouwd: 0 }
    };
  }

  function zetMJ(basisId, jaarbedrag) {
    $(basisId + "-m").textContent = formatEUR(jaarbedrag / 12);
    $(basisId + "-j").textContent = formatEUR(jaarbedrag);
  }

  function herreken() {
    var aj = huidigAanslagjaar();
    var p = Storage.resolveParams(aj);
    var bijdragePrive = $("bijdrage-prive").checked;
    var input = verzamelInput();
    var r = Engine.berekenPakket(input, p, { bijdragePrive: bijdragePrive });

    var handmatig = $("woning-handmatig").checked;
    ["woning-ki", "woning-pct", "woning-gemeubeld", "woning-verwarming", "woning-elektriciteit"].forEach(function (id) {
      $(id).closest(".veldrij").style.display = handmatig ? "none" : "";
    });
    $("woning-bedrag").closest(".veldrij").style.display = handmatig ? "" : "none";

    var w = r.woning;
    $("woning-preview").textContent = !aan("woning") ? ""
      : handmatig
        ? "Het ingegeven bedrag van de boekhouder (" + formatEUR(input.vaa.bewoning) + " per jaar) wordt gebruikt als VAA bewoning."
        : "Berekend VAA: woongedeelte " + formatEUR(w.vaaWoning) + " (KI × privé% × " + factorFmt.format(p["vaa.kiIndexatie"]) + " × 100/60 × " + getal.format(p["vaa.woningFactor"]) + ")"
          + (w.markUpGemeubeld ? " + gemeubeld " + formatEUR(w.markUpGemeubeld) : "")
          + (w.vaaVerwarming ? " + verwarming " + formatEUR(w.vaaVerwarming) : "")
          + (w.vaaElektriciteit ? " + elektriciteit " + formatEUR(w.vaaElektriciteit) : "")
          + " = " + formatEUR(w.totaal) + " per jaar.";

    $("netto-gecorrigeerd-jaar").textContent = formatEUR(r.nettoGecorrigeerd) + " per jaar";
    $("netto-gecorrigeerd-maand").textContent = formatEUR(r.nettoGecorrigeerdMaand);
    zetMJ("s-netto-cash", r.nettoCash);
    zetMJ("s-opties", r.opties.netto);
    zetMJ("s-mc", r.maaltijdcheques.nettowaarde);
    $("s-opties-rij").style.display = r.opties.bruto > 0 ? "" : "none";
    $("s-mc-rij").style.display = r.maaltijdcheques.nettowaarde > 0 ? "" : "none";

    zetMJ("n-bruto", r.input.cashloon);
    zetMJ("n-pb", r.personenbelastingZonderOpties);
    $("n-sb-rij").style.display = bijdragePrive ? "" : "none";
    zetMJ("n-sb", bijdragePrive ? r.socialeBijdrage.jaar - r.opties.sbDelta : 0);
    zetMJ("n-onkosten", r.onkostenTotaal);
    zetMJ("n-mceigen", r.maaltijdcheques.eigenBijdrage);
    zetMJ("n-netto", r.nettoCash);

    $("kaart-opties").style.display = r.opties.bruto > 0 ? "" : "none";
    zetMJ("o-bruto", r.opties.bruto);
    zetMJ("o-vaa", r.opties.vaa);
    zetMJ("o-heffing", r.opties.heffing);
    zetMJ("o-verkoop", r.opties.verkoopkost);
    zetMJ("o-netto", r.opties.netto);

    $("h-sb-kwartaal").textContent = formatEUR(r.socialeBijdrage.kwartaal);
    zetMJ("h-sb", r.socialeBijdrage.jaar);
    zetMJ("h-staat", r.staat.staatsbelasting);
    $("h-gemeente-naam").textContent = p["gemeente.naam"];
    $("h-gemeente-pct").textContent = formatPct(p["gemeente.opcentiemenPct"]);
    zetMJ("h-gemeente", r.gemeentebelasting);
    zetMJ("h-totaal", r.totaleHeffingen);
    $("h-druk").textContent = r.belastbareBasis > 0
      ? "Dat is " + pctFmt.format(r.totaleHeffingen / r.belastbareBasis * 100) + "% van de belastbare basis."
      : "";

    zetMJ("v-bruto", r.input.cashloon);
    $("v-sb-rij").style.display = bijdragePrive ? "none" : "";
    zetMJ("v-sb", bijdragePrive ? 0 : r.socialeBijdrage.jaar);
    zetMJ("v-onkosten", r.onkostenTotaal);
    zetMJ("v-mcwg", r.maaltijdcheques.werkgeversDeel);
    zetMJ("v-mcbeheer", r.maaltijdcheques.beheerskost);
    zetMJ("v-opties", r.opties.bruto);
    zetMJ("v-optiesbeheer", r.opties.beheerskost);
    zetMJ("v-ipt", input.ipt.jaarpremie);
    zetMJ("v-totaal", r.vennootschapCashUit);

    $("p-bruto").textContent = formatEUR(r.ipt80.brutoJaarbezoldiging);
    $("p-wettelijk").textContent = formatEUR(r.ipt80.wettelijkPensioen);
    $("p-rente").textContent = formatEUR(r.ipt80.maxAanvullendeRente);
    $("p-kapitaal").textContent = formatEUR(r.ipt80.maxKapitaal);
    $("p-ruimte").textContent = formatEUR(r.ipt80.ruimte);
    $("p-premie").textContent = aan("ipt") && input.ipt.resterendeJaren > 0
      ? formatEUR(r.ipt80.indicatieveJaarpremie) + " per jaar"
      : "vul de jaren tot pensioen in";

    $("i-vaa-totaal").textContent = formatEUR(r.vaaTotaalExclOpties + r.optiesVaa);
    $("i-basis").textContent = formatEUR(r.belastbareBasis);

    $("t-basis").textContent = formatEUR(r.belastbareBasis);
    $("t-kosten-plafond").textContent = r.beroepskostenGeplafonneerd ? " (plafond bereikt)" : "";
    $("t-kosten").textContent = "− " + formatEUR(r.beroepskosten);
    $("t-sociale").textContent = "− " + formatEUR(r.socialeBijdrage.jaar);
    $("t-netto-belastbaar").textContent = formatEUR(r.nettoBelastbaar);

    var schijvenHtml = "";
    r.staat.schijfBedragen.forEach(function (s) {
      if (s.grondslag <= 0) return;
      schijvenHtml += "<tr><td>" + formatPct(s.tarief) + " op " + formatEUR(s.grondslag) + "</td><td>" + formatEUR(s.belasting) + "</td></tr>";
    });
    $("t-schijven").innerHTML = schijvenHtml;
    $("t-bruto").textContent = formatEUR(r.staat.brutoBelasting);
    $("t-vrijesom").textContent = "− " + formatEUR(r.staat.belastingvrijeSomKorting);
    $("t-staat").textContent = formatEUR(r.staat.staatsbelasting);

    toonWaarschuwingen(r, input, p);
    toonIjkcontrole(p);
    stateUitDom();
  }

  function toonWaarschuwingen(r, input, p) {
    var meldingen = [];
    if (r.maaltijdcheques.zichtwaardeBovenMax) {
      meldingen.push("De zichtwaarde van de maaltijdcheques (" + formatEUR(r.maaltijdcheques.zichtwaarde) + ") ligt boven het vrijgestelde maximum van " + formatEUR(p["mc.maxZichtwaarde"]) + ".");
    }
    if (r.ipt80.premieBovenRuimte) {
      meldingen.push("De geplande IPT-premie (" + formatEUR(input.ipt.jaarpremie) + ") ligt boven de indicatieve 80%-ruimte van " + formatEUR(r.ipt80.indicatieveJaarpremie) + " per jaar.");
    }
    if (r.socialeBijdrage.minimumToegepast) {
      meldingen.push("De minimale kwartaalbijdrage voor zelfstandigen is van toepassing.");
    }
    var container = $("waarschuwingen");
    container.innerHTML = "";
    meldingen.forEach(function (m) {
      var div = document.createElement("div");
      div.className = "banner banner-info";
      div.textContent = m;
      container.appendChild(div);
    });
  }

  /* ---------- ijkcontrole ---------- */

  function toonIjkcontrole(p) {
    var ijk = Engine.ijkcontrole(p);
    var banner = $("ijk-banner");
    if (ijk.ok) {
      banner.classList.add("verborgen");
    } else {
      banner.classList.remove("verborgen");
      banner.textContent = "IJkcontrole gebroken: basis " + getal.format(ijk.basis) + " moet " + formatEUR(ijk.verwacht) + " per kwartaal geven, maar de huidige parameters geven " + formatEUR(ijk.berekend) + ". Controleer de laatst gewijzigde tarieven.";
    }
    var beheerIjk = $("beheer-ijk");
    if (beheerIjk) {
      beheerIjk.innerHTML = ijk.ok
        ? '<span class="ijk-ok">IJkcontrole OK</span> — basis ' + getal.format(ijk.basis) + " geeft " + formatEUR(ijk.berekend) + " per kwartaal (verwacht " + formatEUR(ijk.verwacht) + ")."
        : '<span class="ijk-fout">IJkcontrole GEBROKEN</span> — basis ' + getal.format(ijk.basis) + " geeft " + formatEUR(ijk.berekend) + " per kwartaal in plaats van " + formatEUR(ijk.verwacht) + ".";
    }
  }

  /* ---------- beheerscherm ---------- */

  function veldWaardeNaarTekst(veld, waarde) {
    if (veld.type === "pct") return pctFmt.format(waarde * 100);
    if (veld.type === "factor") return factorFmt.format(waarde);
    if (veld.type === "eur") return getal.format(waarde);
    return String(waarde);
  }

  function tekstNaarVeldWaarde(veld, tekst) {
    if (veld.type === "pct") return parseBE(tekst) / 100;
    if (veld.type === "eur" || veld.type === "factor") return parseBE(tekst);
    return tekst.trim();
  }

  function datumLabel(iso) {
    var d = new Date(iso);
    return d.toLocaleDateString("nl-BE") + " " + d.toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" });
  }

  function renderBeheer() {
    var aj = huidigAanslagjaar();
    var p = Storage.resolveParams(aj);
    var container = $("beheer-velden");
    container.innerHTML = "";

    var categorieen = [];
    Params.PARAM_FIELDS.forEach(function (veld) {
      if (categorieen.indexOf(veld.categorie) < 0) categorieen.push(veld.categorie);
    });

    categorieen.forEach(function (categorie) {
      var blok = document.createElement("div");
      blok.className = "beheer-categorie";
      var velden = Params.PARAM_FIELDS.filter(function (v) { return v.categorie === categorie; });

      var kop = document.createElement("h2");
      kop.textContent = categorie;
      blok.appendChild(kop);

      var bron = document.createElement("p");
      bron.className = "bronlink";
      bron.innerHTML = 'Bron: <a href="' + velden[0].bron + '" target="_blank" rel="noopener">' + velden[0].bron + "</a>";
      blok.appendChild(bron);

      velden.forEach(function (veld) {
        var rij = document.createElement("div");
        rij.className = "beheer-veld";

        var naam = document.createElement("span");
        naam.className = "veldnaam";
        naam.textContent = veld.label + " ";
        if (veld.verify) {
          var badge = document.createElement("span");
          badge.className = "badge badge-verify";
          badge.title = "Nog te bevestigen tegen de primaire bron";
          badge.textContent = "VERIFY";
          naam.appendChild(badge);
        }
        var info = Storage.overrideInfo(aj, veld.key);
        if (info) {
          var badge2 = document.createElement("span");
          badge2.className = "badge badge-override";
          badge2.textContent = "aangepast";
          naam.appendChild(document.createTextNode(" "));
          naam.appendChild(badge2);
        }
        rij.appendChild(naam);

        var invoer = document.createElement("input");
        invoer.type = "text";
        invoer.inputMode = veld.type === "tekst" ? "text" : "decimal";
        invoer.value = veldWaardeNaarTekst(veld, p[veld.key]);
        invoer.addEventListener("change", function () {
          var nieuw = tekstNaarVeldWaarde(veld, invoer.value);
          var ingebouwd = Params.BUILTIN_PARAMS[aj][veld.key];
          if (nieuw === ingebouwd) Storage.wisOverride(aj, veld.key);
          else Storage.zetOverride(aj, veld.key, nieuw);
          herreken();
          renderBeheer();
        });
        rij.appendChild(invoer);

        var eenheid = document.createElement("span");
        eenheid.className = "eenheid";
        eenheid.textContent = veld.type === "pct" ? "%" : (veld.type === "eur" ? "€" : "");
        rij.appendChild(eenheid);

        if (info) {
          var reset = document.createElement("button");
          reset.type = "button";
          reset.className = "klein";
          reset.textContent = "herstel";
          reset.title = "Terug naar de ingebouwde waarde";
          reset.addEventListener("click", function () {
            Storage.wisOverride(aj, veld.key);
            herreken();
            renderBeheer();
          });
          rij.appendChild(reset);
        }

        var meta = document.createElement("span");
        meta.className = "meta";
        meta.textContent = Params.AANSLAGJAAR_LABELS[aj] + " · " + (info ? "laatst gewijzigd " + datumLabel(info.modified) : "ingebouwde waarde");
        rij.appendChild(meta);

        blok.appendChild(rij);
      });

      container.appendChild(blok);
    });
  }

  /* ---------- navigatie ---------- */

  function toonView() {
    var beheer = location.hash === "#beheer";
    $("view-calculator").classList.toggle("verborgen", beheer);
    $("view-beheer").classList.toggle("verborgen", !beheer);
    $("nav-calculator").classList.toggle("actief", !beheer);
    $("nav-beheer").classList.toggle("actief", beheer);
    if (beheer) renderBeheer();
  }

  /* ---------- initialisatie ---------- */

  function init() {
    var select = $("aanslagjaar");
    Object.keys(Params.BUILTIN_PARAMS).forEach(function (aj) {
      var optie = document.createElement("option");
      optie.value = aj;
      optie.textContent = Params.AANSLAGJAAR_LABELS[aj] || aj;
      select.appendChild(optie);
    });

    bouwInvoer();
    sims = laadSims();
    verversSimSelect();
    $("modus-maand").classList.toggle("actief", modus === "maand");
    $("modus-jaar").classList.toggle("actief", modus === "jaar");
    stateNaarDom();

    $("sim-select").addEventListener("change", function () { wisselSim(this.value); });
    $("sim-nieuw").addEventListener("click", nieuweSim);
    $("sim-verwijder").addEventListener("click", verwijderSim);
    $("modus-maand").addEventListener("click", function () { zetModus("maand"); });
    $("modus-jaar").addEventListener("click", function () { zetModus("jaar"); });
    $("bijdrage-prive").addEventListener("change", herreken);
    select.addEventListener("change", function () { herreken(); renderBeheer(); });
    $("print-knop").addEventListener("click", function () { window.print(); });
    $("reset-alles").addEventListener("click", function () {
      Storage.wisAlleOverrides(huidigAanslagjaar());
      herreken();
      renderBeheer();
    });
    window.addEventListener("hashchange", toonView);

    herreken();
    toonView();

    if ("serviceWorker" in navigator && location.protocol !== "file:") {
      navigator.serviceWorker.register("sw.js");
    }
  }

  init();

})();
