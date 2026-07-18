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
      { id: "woning-preview", soort: "preview" },
      { id: "woning-ximus", soort: "preview" }
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
    // IPT zoals in het X-imus verslag: 3.133,44/jaar tot de pensioenleeftijd.
    s.waarden["ipt-premie"] = 3133.44;
    s.waarden["ipt-restjaren"] = 39;
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
    zetModusKlasse();
    stateNaarDom();
    herreken();
  }

  // Op smalle schermen toont CSS enkel de kolom van de actieve modus.
  function zetModusKlasse() {
    document.body.classList.toggle("modus-maand", modus === "maand");
    document.body.classList.toggle("modus-jaar", modus === "jaar");
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

  // De maand/jaar-keuze staat prominent bovenaan; enkel velden die ALTIJD
  // per jaar zijn krijgen een suffix, zodat de labels kort en leesbaar blijven.
  function veldLabel(veld) {
    if (veld.soort === "jaar" && modus === "maand") return veld.label + " (€/jaar)";
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

  /* ---------- startscherm met simulaties ---------- */

  // Bouwt de rekenmotor-invoer rechtstreeks uit een simulatie-state,
  // zodat de lijstkaarten en de calculator dezelfde berekening delen.
  function inputVanState(s) {
    var t = s.toggles, v = s.vinken, w = s.waarden;
    return {
      cashloon: w.cashloon || 0,
      vaa: {
        wagen: t.wagen ? w["vaa-wagen"] || 0 : 0,
        gsmInternetPc: t.overige ? w["vaa-gsm"] || 0 : 0,
        renteBulletkrediet: t.overige ? w["vaa-rente"] || 0 : 0,
        andere: t.overige ? w["vaa-andere"] || 0 : 0,
        bewoning: t.woning && v["woning-handmatig"] ? w["woning-bedrag"] || 0 : 0
      },
      woning: t.woning && !v["woning-handmatig"] ? {
        ki: w["woning-ki"] || 0,
        privePct: (w["woning-pct"] || 0) / 100,
        gemeubeld: !!v["woning-gemeubeld"],
        verwarming: !!v["woning-verwarming"],
        elektriciteit: !!v["woning-elektriciteit"]
      } : { ki: 0 },
      opties: t.opties
        ? { bruto: w["opties-bruto"] || 0, beheerskost: w["opties-beheer"] || 0 }
        : { bruto: 0, beheerskost: 0 },
      maaltijdcheques: t.mc
        ? { aantalPerMaand: w["mc-aantal"] || 0, zichtwaarde: w["mc-zichtwaarde"] || 0 }
        : { aantalPerMaand: 0, zichtwaarde: 0 },
      onkosten: { totaal: t.onkosten ? w["onk-totaal"] || 0 : 0 },
      ipt: t.ipt
        ? { jaarpremie: w["ipt-premie"] || 0, resterendeJaren: w["ipt-restjaren"] || 0, reedsOpgebouwd: w["ipt-opgebouwd"] || 0 }
        : { jaarpremie: 0, resterendeJaren: 0, reedsOpgebouwd: 0 }
    };
  }

  function renderSimLijst() {
    var p = Storage.resolveParams(huidigAanslagjaar());
    var lijst = $("sim-lijst");
    lijst.innerHTML = "";
    Object.keys(sims.simulaties).forEach(function (naam) {
      var s = sims.simulaties[naam];
      var r = Engine.berekenPakket(inputVanState(s), p, { bijdragePrive: !!s.bijdragePrive });

      var kaart = document.createElement("div");
      kaart.className = "sim-kaart";

      var info = document.createElement("button");
      info.type = "button";
      info.className = "sim-open";
      info.innerHTML = "<strong>" + naam + "</strong><span>"
        + formatEUR(r.nettoGecorrigeerdMaand) + " netto per maand · "
        + formatEUR(r.nettoGecorrigeerd) + " per jaar · vennootschap "
        + formatEUR(r.vennootschapCashUit) + "</span>";
      info.addEventListener("click", function () { openSim(naam); });
      kaart.appendChild(info);

      var weg = document.createElement("button");
      weg.type = "button";
      weg.className = "sim-weg";
      weg.title = "Simulatie verwijderen";
      weg.textContent = "✕";
      weg.addEventListener("click", function () {
        if (!window.confirm('Simulatie "' + naam + '" verwijderen?')) return;
        delete sims.simulaties[naam];
        if (!Object.keys(sims.simulaties).length) {
          sims.simulaties["Simulatie Kevin"] = presetKevin();
          sims.simulaties["Simulatie Mile (woning)"] = presetMile();
        }
        if (sims.actief === naam) sims.actief = Object.keys(sims.simulaties)[0];
        bewaarSims(sims);
        renderSimLijst();
      });
      kaart.appendChild(weg);

      lijst.appendChild(kaart);
    });
  }

  function openSim(naam) {
    sims.actief = naam;
    bewaarSims(sims);
    stateNaarDom();
    $("sim-naam").textContent = naam;
    location.hash = "#sim";
    herreken();
  }

  function nieuweSim() {
    var naam = window.prompt("Naam van de nieuwe simulatie:", "Nieuwe simulatie");
    if (!naam) return;
    naam = naam.trim();
    if (!naam || sims.simulaties[naam]) return;
    sims.simulaties[naam] = presetKevin();
    bewaarSims(sims);
    openSim(naam);
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
    $("woning-ximus").textContent = aan("woning") && !handmatig ? vergelijkMetXimus(input.woning, p, w) : "";

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
    if (aan("ipt") && input.ipt.resterendeJaren > 0) {
      $("p-premie").textContent = formatEUR(r.ipt80.indicatieveJaarpremie) + " per jaar";
      $("p-premie-maand").textContent = formatEUR(r.ipt80.indicatieveJaarpremie / 12) + " per maand, gedurende " + getal.format(input.ipt.resterendeJaren) + " jaar";
    } else {
      $("p-premie").textContent = "—";
      $("p-premie-maand").textContent = "Vink IPT aan en vul de jaren tot pensioen in.";
    }

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
    vulLoonbrief(r, input, p);
    stateUitDom();
  }

  /* ---------- loonbrief (afdruk / PDF) ---------- */

  function vulLoonbrief(r, input, p) {
    var bijdragePrive = r.options.bijdragePrive;
    function rij(label, jaar, klasse) {
      if (!jaar && klasse !== "lb-tot" && klasse !== "lb-eind") return "";
      return "<tr" + (klasse ? ' class="' + klasse + '"' : "") + "><td>" + label + "</td><td>" + formatEUR(jaar / 12) + "</td><td>" + formatEUR(jaar) + "</td></tr>";
    }
    function sectie(titel) {
      return '<tr class="lb-sectie"><td colspan="3">' + titel + "</td></tr>";
    }

    var html = '<div class="lb-kop"><h1>Loonbrief — ' + sims.actief + "</h1><p>"
      + Params.AANSLAGJAAR_LABELS[huidigAanslagjaar()]
      + " · opgemaakt " + new Date().toLocaleDateString("nl-BE")
      + " · indicatieve simulatie</p></div>";

    html += '<table class="lb-tabel"><tr class="lb-kolomkop"><td></td><td>per maand</td><td>per jaar</td></tr>';

    html += sectie("Bezoldiging en voordelen alle aard");
    html += rij("Cash brutoloon", r.input.cashloon);
    html += rij("VAA bedrijfswagen", input.vaa.wagen);
    html += rij("VAA woning, verwarming & elektriciteit", r.woning.totaal + (input.vaa.bewoning || 0));
    html += rij("VAA gsm, internet & pc", input.vaa.gsmInternetPc);
    html += rij("VAA rente bulletkrediet", input.vaa.renteBulletkrediet);
    html += rij("VAA andere", input.vaa.andere);
    html += rij("VAA aandelenopties", r.opties.vaa);
    html += rij("Belastbare basis", r.belastbareBasis, "lb-tot");

    html += sectie("Inhoudingen en vergoedingen");
    if (bijdragePrive) html += rij("Sociale bijdrage (privé gedragen)", -(r.socialeBijdrage.jaar - r.opties.sbDelta));
    html += rij("Belasting (staat + gemeente, zonder optiedeel)", -r.personenbelastingZonderOpties);
    html += rij("Eigen bijdrage maaltijdcheques", -r.maaltijdcheques.eigenBijdrage);
    html += rij("Onkostenvergoedingen (belastingvrij)", r.onkostenTotaal);
    html += rij("Netto cash op de rekening", r.nettoCash, "lb-tot");
    html += rij("Aandelenopties netto (bruto − heffing − verkoopkost)", r.opties.netto);
    html += rij("Nettowaarde maaltijdcheques", r.maaltijdcheques.nettowaarde);
    html += rij("Netto gecorrigeerd", r.nettoGecorrigeerd, "lb-eind");

    html += sectie("Kosten vennootschap");
    html += rij("Cash brutoloon", r.input.cashloon);
    if (!bijdragePrive) html += rij("Sociale bijdrage zelfstandige (" + formatEUR(r.socialeBijdrage.kwartaal) + "/kwartaal)", r.socialeBijdrage.jaar);
    html += rij("Onkostenvergoedingen", r.onkostenTotaal);
    html += rij("Maaltijdcheques: werkgeversdeel", r.maaltijdcheques.werkgeversDeel);
    html += rij("Maaltijdcheques: beheerskost", r.maaltijdcheques.beheerskost);
    html += rij("Aandelenopties: bruto toekenning", r.opties.bruto);
    html += rij("Aandelenopties: beheerskost", r.opties.beheerskost);
    html += rij("IPT-premie", input.ipt.jaarpremie);
    html += rij("Totale cash out vennootschap", r.vennootschapCashUit, "lb-eind");
    html += "</table>";

    if (input.ipt.jaarpremie > 0 || r.ipt80.indicatieveJaarpremie > 0) {
      html += '<p class="lb-voet">IPT: geplande premie ' + formatEUR(input.ipt.jaarpremie) + " per jaar; indicatieve maximale premie volgens de 80%-regel " + formatEUR(r.ipt80.indicatieveJaarpremie) + " per jaar (max. eindkapitaal " + formatEUR(r.ipt80.maxKapitaal) + ").</p>";
    }
    html += '<p class="lb-voet">Indicatieve simulatie, geen officieel loondocument. Voordelen alle aard zijn fiscale forfaits en komen niet als cash binnen; de werkelijke kosten van wagen, gsm of woning staan los van dit overzicht. De definitieve aanslag ligt bij de boekhouder.</p>';

    $("loonbrief").innerHTML = html;
  }

  // Toont of de gebruikte woningparameters overeenkomen met het
  // X-imus analyseverslag, en zo niet, waar ze afwijken.
  function vergelijkMetXimus(woningInput, p, w) {
    var afwijkingen = [];
    var X = Params.XIMUS_WONING;
    if (Math.abs(p["vaa.kiIndexatie"] - X["vaa.kiIndexatie"]) > 0.0001) {
      afwijkingen.push("KI-index " + factorFmt.format(p["vaa.kiIndexatie"]) + " i.p.v. " + factorFmt.format(X["vaa.kiIndexatie"]));
    }
    if (woningInput.verwarming && Math.abs(p["vaa.verwarmingForfait"] - X["vaa.verwarmingForfait"]) > 0.001) {
      afwijkingen.push("verwarming " + formatEUR(p["vaa.verwarmingForfait"]) + " i.p.v. " + formatEUR(X["vaa.verwarmingForfait"]));
    }
    if (woningInput.elektriciteit && Math.abs(p["vaa.elektriciteitForfait"] - X["vaa.elektriciteitForfait"]) > 0.001) {
      afwijkingen.push("elektriciteit " + formatEUR(p["vaa.elektriciteitForfait"]) + " i.p.v. " + formatEUR(X["vaa.elektriciteitForfait"]));
    }
    if (!afwijkingen.length) {
      return "Komt overeen met het X-imus-verslag: de officiële cijfers voor inkomsten 2026 (KI-index 2,3 · verwarming € 2.560 · elektriciteit € 1.280) zijn dezelfde.";
    }
    var pXimus = {};
    for (var k in p) pXimus[k] = p[k];
    for (var xk in X) pXimus[xk] = X[xk];
    var wXimus = Engine.berekenWoning(woningInput, pXimus);
    return "Wijkt af van het X-imus-verslag (" + afwijkingen.join(", ") + "): X-imus zou " + formatEUR(wXimus.totaal) + " geven, hier " + formatEUR(w.totaal) + " (verschil " + formatEUR(w.totaal - wXimus.totaal) + ").";
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
    var calculator = location.hash === "#sim";
    var start = !beheer && !calculator;
    $("view-simulaties").classList.toggle("verborgen", !start);
    $("view-calculator").classList.toggle("verborgen", !calculator);
    $("view-beheer").classList.toggle("verborgen", !beheer);
    $("nav-simulaties").classList.toggle("actief", !beheer);
    $("nav-beheer").classList.toggle("actief", beheer);
    if (start) renderSimLijst();
    if (calculator) { $("sim-naam").textContent = sims.actief; herreken(); }
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
    $("modus-maand").classList.toggle("actief", modus === "maand");
    $("modus-jaar").classList.toggle("actief", modus === "jaar");
    zetModusKlasse();
    stateNaarDom();

    $("sim-nieuw").addEventListener("click", nieuweSim);
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
