"use strict";
/*
 * Lokale overrides op de ingebouwde parameters, per aanslagjaar en per veld.
 * Schema in localStorage onder 1 sleutel:
 *   { "2026": { "sb.grensSchijf1": { "value": 75024.54, "modified": "ISO-datum" } } }
 * De ingebouwde waarden in params.js blijven altijd de vertreklaag.
 */
(function (root) {

  var STORAGE_KEY = "mtrex-loon.overrides.v1";

  function laadOverrides() {
    try {
      var raw = root.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function bewaarOverrides(overrides) {
    try {
      root.localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
    } catch (e) { /* opslag vol of geblokkeerd: berekening blijft werken */ }
  }

  function zetOverride(aanslagjaar, key, value) {
    var overrides = laadOverrides();
    if (!overrides[aanslagjaar]) overrides[aanslagjaar] = {};
    overrides[aanslagjaar][key] = { value: value, modified: new Date().toISOString() };
    bewaarOverrides(overrides);
  }

  function wisOverride(aanslagjaar, key) {
    var overrides = laadOverrides();
    if (overrides[aanslagjaar]) {
      delete overrides[aanslagjaar][key];
      if (Object.keys(overrides[aanslagjaar]).length === 0) delete overrides[aanslagjaar];
    }
    bewaarOverrides(overrides);
  }

  function wisAlleOverrides(aanslagjaar) {
    var overrides = laadOverrides();
    delete overrides[aanslagjaar];
    bewaarOverrides(overrides);
  }

  // Ingebouwde waarden + overrides samengevoegd tot de parameters
  // waarmee de rekenmotor draait.
  function resolveParams(aanslagjaar) {
    var basis = root.Params.BUILTIN_PARAMS[aanslagjaar] || {};
    var resolved = {};
    for (var k in basis) resolved[k] = basis[k];
    var jaarOverrides = laadOverrides()[aanslagjaar] || {};
    for (var key in jaarOverrides) resolved[key] = jaarOverrides[key].value;
    return resolved;
  }

  function overrideInfo(aanslagjaar, key) {
    var jaarOverrides = laadOverrides()[aanslagjaar] || {};
    return jaarOverrides[key] || null;
  }

  root.Storage = {
    laadOverrides: laadOverrides,
    zetOverride: zetOverride,
    wisOverride: wisOverride,
    wisAlleOverrides: wisAlleOverrides,
    resolveParams: resolveParams,
    overrideInfo: overrideInfo
  };

})(this);
