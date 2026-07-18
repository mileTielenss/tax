"use strict";
/*
 * UI-schil: leest invoer, laat de rekenmotor draaien op de opgeloste
 * parameters (ingebouwd + lokale overrides) en toont de uitkomst.
 */
(function () {

  var $ = function (id) { return document.getElementById(id); };

  var eur = new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" });
  var getal = new Intl.NumberFormat("nl-BE", { maximumFractionDigits: 2 });
  var pctFmt = new Intl.NumberFormat("nl-BE", { maximumFractionDigits: 2 });

  function formatEUR(n) { return eur.format(n); }
  function formatPct(fractie) { return pctFmt.format(fractie * 100) + "%"; }

  // Aanvaardt Belgische notatie (1.234,56) en internationale (1234.56).
  function parseBE(tekst) {
    if (typeof tekst !== "string") return 0;
    var schoon = tekst.replace(/[\s €]/g, "");
    if (schoon === "") return 0;
    if (schoon.indexOf(",") >= 0) schoon = schoon.replace(/\./g, "").replace(",", ".");
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(schoon)) schoon = schoon.replace(/\./g, "");
    var n = parseFloat(schoon);
    return isFinite(n) ? n : 0;
  }

  function huidigAanslagjaar() { return $("aanslagjaar").value; }

  /* ---------- berekening + weergave ---------- */

  function herreken() {
    var aj = huidigAanslagjaar();
    var p = Storage.resolveParams(aj);
    var bijdragePrive = $("bijdrage-prive").checked;

    var r = Engine.berekenPakket({
      cashloon: parseBE($("cashloon").value),
      vaa: {
        bewoning: parseBE($("vaa-bewoning").value),
        renteBulletkrediet: parseBE($("vaa-rente").value),
        wagen: parseBE($("vaa-wagen").value),
        gsmInternet: parseBE($("vaa-gsm").value)
      }
    }, p, { bijdragePrive: bijdragePrive });

    $("netto-jaar").textContent = formatEUR(r.nettoBesteedbaarJaar) + " per jaar";
    $("netto-maand").textContent = formatEUR(r.nettoBesteedbaarMaand);
    $("netto-toelichting-prive").textContent = bijdragePrive ? " en min de sociale bijdrage die je privé draagt" : "";

    $("h-sociale").textContent = formatEUR(r.socialeBijdrage.jaar);
    $("h-sociale-kwartaal").textContent = formatEUR(r.socialeBijdrage.kwartaal);
    $("h-staat").textContent = formatEUR(r.staat.staatsbelasting);
    $("h-gemeente-naam").textContent = p["gemeente.naam"];
    $("h-gemeente-pct").textContent = formatPct(p["gemeente.opcentiemenPct"]);
    $("h-gemeente").textContent = formatEUR(r.gemeentebelasting);
    $("h-totaal").textContent = formatEUR(r.totaleHeffingen);
    $("h-druk").textContent = r.belastbareBasis > 0
      ? "Dat is " + pctFmt.format(r.totaleHeffingen / r.belastbareBasis * 100) + "% van de belastbare basis."
      : "";

    $("v-cashloon").textContent = formatEUR(r.input.cashloon);
    $("v-bijdrage-rij").style.display = bijdragePrive ? "none" : "";
    $("v-bijdrage").textContent = formatEUR(r.socialeBijdrage.jaar);
    $("v-totaal").textContent = formatEUR(r.vennootschapCashUit);

    $("i-vaa-totaal").textContent = formatEUR(r.vaaTotaal);
    $("i-basis").textContent = formatEUR(r.belastbareBasis);
    $("i-druk").textContent = r.input.cashloon > 0
      ? "Van je cashloon van " + formatEUR(r.input.cashloon) + " gaat " + formatEUR(r.input.cashloon - r.nettoBesteedbaarJaar) + " (" + pctFmt.format((r.input.cashloon - r.nettoBesteedbaarJaar) / r.input.cashloon * 100) + "%) op aan heffingen over het volledige pakket, VAA inbegrepen."
      : "";

    $("t-basis").textContent = formatEUR(r.belastbareBasis);
    $("t-kosten-plafond").textContent = r.beroepskostenGeplafonneerd ? " (plafond bereikt)" : " (3%)";
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

    toonIjkcontrole(p);
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
    if (veld.type === "eur") return getal.format(waarde);
    return String(waarde);
  }

  function tekstNaarVeldWaarde(veld, tekst) {
    if (veld.type === "pct") return parseBE(tekst) / 100;
    if (veld.type === "eur") return parseBE(tekst);
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

    document.querySelectorAll("#invoer input").forEach(function (el) {
      el.addEventListener("input", herreken);
    });
    select.addEventListener("change", function () { herreken(); renderBeheer(); });
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
