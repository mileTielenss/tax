"use strict";
/*
 * UI-schil: leest invoer, laat de rekenmotor draaien op de opgeloste
 * parameters (ingebouwd + lokale overrides) en toont de uitkomst.
 * Elk onderdeel van het pakket heeft een aan/uit-knop; bedragen kunnen
 * per maand of per jaar ingegeven worden. Intern rekent alles op jaarbasis.
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
   * Elke sectie (behalve de bezoldiging) heeft een ja/nee-knop; staat die
   * uit, dan telt het onderdeel niet mee. Soorten velden:
   *   "dual"  : bedrag per maand en per jaar, gesynchroniseerd
   *   "jaar"  : bedrag enkel per jaar
   *   "eur"   : los bedrag
   *   "getal" : gewoon getal (aantal, jaren, procent)
   *   "vink"  : ja/nee binnen de sectie
   * De standaardwaarden zijn suggesties uit de simulatie van de boekhouder
   * en de wettelijke forfaits. */
  var INVOER_SECTIES = [
    { id: "bezoldiging", titel: "Bezoldiging", velden: [
      { id: "cashloon", label: "Cash brutoloon", soort: "dual", maand: 2000 }
    ]},
    { id: "wagen", titel: "Bedrijfswagen", toggle: true, aan: true, velden: [
      { id: "vaa-wagen", label: "VAA bedrijfswagen (uit loonfiche of boekhouder)", soort: "dual", maand: 193 }
    ]},
    { id: "woning", titel: "Woning via de vennootschap", toggle: true, aan: false, velden: [
      { id: "woning-ki", label: "Kadastraal inkomen (niet geïndexeerd)", soort: "eur", waarde: 1000 },
      { id: "woning-pct", label: "Privégedeelte (%)", soort: "getal", waarde: 100 },
      { id: "woning-verwarming", label: "Forfait verwarming (suggestie: € 2.500/jaar)", soort: "vink", aan: true },
      { id: "woning-elektriciteit", label: "Forfait elektriciteit (suggestie: € 1.250/jaar)", soort: "vink", aan: true },
      { id: "woning-preview", soort: "preview" }
    ]},
    { id: "overige", titel: "Overige voordelen alle aard", toggle: true, aan: true, velden: [
      { id: "vaa-internet", label: "Internet", soort: "dual", maand: 5 },
      { id: "vaa-tel-toestel", label: "Telefonie: toestel", soort: "dual", maand: 3 },
      { id: "vaa-tel-abo", label: "Telefonie: abonnement", soort: "dual", maand: 4 },
      { id: "vaa-pc", label: "PC", soort: "dual", maand: 0 },
      { id: "vaa-rente", label: "Rente bulletkrediet", soort: "dual", maand: 0 },
      { id: "vaa-andere", label: "Andere VAA", soort: "dual", maand: 0 }
    ]},
    { id: "opties", titel: "Aandelenopties", toggle: true, aan: false, velden: [
      { id: "opties-bruto", label: "Bruto toekenning", soort: "dual", maand: 1530 },
      { id: "opties-beheer", label: "Beheerskost (vennootschap)", soort: "dual", maand: 50 }
    ]},
    { id: "mc", titel: "Maaltijdcheques", toggle: true, aan: true, velden: [
      { id: "mc-aantal", label: "Aantal cheques per maand", soort: "getal", waarde: 20 },
      { id: "mc-zichtwaarde", label: "Zichtwaarde per cheque (max € 10)", soort: "eur", waarde: 10 }
    ]},
    { id: "onkosten", titel: "Onkostenvergoedingen (belastingvrij)", toggle: true, aan: true, velden: [
      { id: "onk-auto", label: "Forfait autokosten / staanplaats", soort: "dual", maand: 50 },
      { id: "onk-carwash", label: "Forfait carwash", soort: "dual", maand: 15 },
      { id: "onk-parking", label: "Forfait parkeerkosten", soort: "dual", maand: 15 },
      { id: "onk-vakliteratuur", label: "Forfait vakliteratuur", soort: "dual", maand: 10 },
      { id: "onk-thuiswerk", label: "Thuiswerkvergoeding", soort: "dual", maand: 160.99 },
      { id: "onk-andere", label: "Andere vergoedingen", soort: "dual", maand: 0 }
    ]},
    { id: "ipt", titel: "IPT (pensioenopbouw via de vennootschap)", toggle: true, aan: true, velden: [
      { id: "ipt-premie", label: "Geplande jaarpremie", soort: "jaar", waarde: 0 },
      { id: "ipt-restjaren", label: "Jaren tot pensioen", soort: "getal", waarde: 20 },
      { id: "ipt-opgebouwd", label: "Reeds opgebouwd kapitaal", soort: "jaar", waarde: 0 }
    ]}
  ];

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
        tgl.checked = !!sectie.aan;
        tglLabel.appendChild(tgl);
        tglLabel.appendChild(document.createTextNode(" " + sectie.titel));
        legend.appendChild(tglLabel);
      } else {
        legend.textContent = sectie.titel;
      }
      fs.appendChild(legend);

      var inhoud = document.createElement("div");
      inhoud.id = "inhoud-" + sectie.id;
      sectie.velden.forEach(function (veld) { inhoud.appendChild(maakVeldrij(veld)); });
      fs.appendChild(inhoud);
      container.appendChild(fs);

      if (sectie.toggle) {
        var toggleEl = $("tgl-" + sectie.id);
        var zetZichtbaar = function () {
          inhoud.classList.toggle("verborgen", !toggleEl.checked);
        };
        toggleEl.addEventListener("change", function () { zetZichtbaar(); herreken(); });
        zetZichtbaar();
      }
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
      vink.checked = !!veld.aan;
      vink.addEventListener("change", herreken);
      vinkLabel.appendChild(vink);
      vinkLabel.appendChild(document.createTextNode(" " + veld.label));
      rij.appendChild(vinkLabel);
      return rij;
    }

    var label = document.createElement("label");
    label.textContent = veld.label;
    label.htmlFor = veld.id + (veld.soort === "dual" ? "-m" : "");
    rij.appendChild(label);

    if (veld.soort === "dual") {
      var wrap = document.createElement("span");
      wrap.className = "dual";
      var im = maakBedragInput(veld.id + "-m", veld.maand);
      var ij = maakBedragInput(veld.id + "-j", veld.maand * 12);
      im.addEventListener("input", function () { ij.value = getal.format(parseBE(im.value) * 12); herreken(); });
      ij.addEventListener("input", function () { im.value = getal.format(parseBE(ij.value) / 12); herreken(); });
      wrap.appendChild(im); wrap.appendChild(maakSuffix("/maand"));
      wrap.appendChild(ij); wrap.appendChild(maakSuffix("/jaar"));
      rij.appendChild(wrap);
    } else {
      var input = maakBedragInput(veld.id, veld.waarde);
      input.addEventListener("input", herreken);
      var wrap2 = document.createElement("span");
      wrap2.className = "dual";
      wrap2.appendChild(input);
      if (veld.soort === "jaar") wrap2.appendChild(maakSuffix("/jaar"));
      rij.appendChild(wrap2);
    }
    return rij;
  }

  function maakBedragInput(id, waarde) {
    var input = document.createElement("input");
    input.type = "text";
    input.inputMode = "decimal";
    input.id = id;
    input.value = getal.format(waarde || 0);
    return input;
  }

  function maakSuffix(tekst) {
    var s = document.createElement("span");
    s.className = "suffix";
    s.textContent = tekst;
    return s;
  }

  function aan(sectieId) { return $("tgl-" + sectieId).checked; }
  function jaarwaarde(id) { return parseBE($(id + "-j").value); }

  function huidigAanslagjaar() { return $("aanslagjaar").value; }

  function verzamelInput() {
    return {
      cashloon: jaarwaarde("cashloon"),
      vaa: {
        wagen: aan("wagen") ? jaarwaarde("vaa-wagen") : 0,
        internet: aan("overige") ? jaarwaarde("vaa-internet") : 0,
        telefonieToestel: aan("overige") ? jaarwaarde("vaa-tel-toestel") : 0,
        telefonieAbonnement: aan("overige") ? jaarwaarde("vaa-tel-abo") : 0,
        pc: aan("overige") ? jaarwaarde("vaa-pc") : 0,
        renteBulletkrediet: aan("overige") ? jaarwaarde("vaa-rente") : 0,
        andere: aan("overige") ? jaarwaarde("vaa-andere") : 0
      },
      woning: aan("woning") ? {
        ki: parseBE($("woning-ki").value),
        privePct: parseBE($("woning-pct").value) / 100,
        verwarming: $("woning-verwarming").checked,
        elektriciteit: $("woning-elektriciteit").checked
      } : { ki: 0 },
      opties: aan("opties")
        ? { bruto: jaarwaarde("opties-bruto"), beheerskost: jaarwaarde("opties-beheer") }
        : { bruto: 0, beheerskost: 0 },
      maaltijdcheques: aan("mc")
        ? { aantalPerMaand: parseBE($("mc-aantal").value), zichtwaarde: parseBE($("mc-zichtwaarde").value) }
        : { aantalPerMaand: 0, zichtwaarde: 0 },
      onkosten: { totaal: aan("onkosten")
        ? jaarwaarde("onk-auto") + jaarwaarde("onk-carwash") + jaarwaarde("onk-parking") + jaarwaarde("onk-vakliteratuur") + jaarwaarde("onk-thuiswerk") + jaarwaarde("onk-andere")
        : 0 },
      ipt: aan("ipt")
        ? { jaarpremie: parseBE($("ipt-premie").value), resterendeJaren: parseBE($("ipt-restjaren").value), reedsOpgebouwd: parseBE($("ipt-opgebouwd").value) }
        : { jaarpremie: 0, resterendeJaren: 0, reedsOpgebouwd: 0 }
    };
  }

  /* ---------- berekening + weergave ---------- */

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

    var w = r.woning;
    $("woning-preview").textContent = aan("woning")
      ? "Berekend VAA: woning " + formatEUR(w.vaaWoning) + " (KI × " + factorFmt.format(p["vaa.kiIndexatie"]) + " × 100/60 × " + getal.format(p["vaa.woningFactor"]) + " × privégedeelte)"
        + (w.vaaVerwarming ? " + verwarming " + formatEUR(w.vaaVerwarming) : "")
        + (w.vaaElektriciteit ? " + elektriciteit " + formatEUR(w.vaaElektriciteit) : "")
        + " = " + formatEUR(w.totaal) + " per jaar."
      : "";

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
