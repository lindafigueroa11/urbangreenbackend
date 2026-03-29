/**
 * Clasificación estable (códigos en inglés) + traducción es-ES para la API legacy `category`.
 */

const LEISURE_SPORTS = new Set([
  "pitch",
  "stadium",
  "sports_centre",
  "track",
  "golf_course",
  "fitness_station",
  "skatepark",
  "marina",
  "horse_riding"
]);

const LABEL_ES = {
  park: "Parque",
  sports: "Área deportiva",
  green_area: "Área verde",
  forest: "Bosque",
  green_corridor: "Corredores verdes"
};

function hasSportTag(tags = {}) {
  const s = tags.sport;
  return typeof s === "string" && s.trim().length > 0;
}

function isSportsArea(tags = {}) {
  const leisure = String(tags.leisure || "");
  if (LEISURE_SPORTS.has(leisure)) return true;
  if (leisure === "pitch" || hasSportTag(tags)) return true;
  if (leisure === "recreation_ground" && hasSportTag(tags)) return true;
  return false;
}

function isGreenCorridor(tags = {}, name = "") {
  const n = String(name || "").toLowerCase();
  if (
    /corredor|corredores|lineal|linear|sendero verde|eje verde|bulevar verde|ciclov[ií]a|parque lineal/i.test(n)
  ) {
    return true;
  }
  if (tags["park:type"] === "linear") return true;
  if (tags.highway === "path" && n.length > 0) {
    if (
      /verde|green|ecol[oó]g|arbol|árbol|parque|sendero|camino|trail/i.test(n)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * @param {Record<string, string>} tags
 * @param {string} name
 * @returns {{ code: string, confidence: number }}
 */
function categorize(tags = {}, name = "") {
  const t = tags || {};

  if (isGreenCorridor(t, name)) {
    return { code: "green_corridor", confidence: t.highway === "path" ? 0.58 : 0.65 };
  }
  if (isSportsArea(t)) {
    const base = t.leisure === "pitch" || hasSportTag(t) ? 0.9 : 0.88;
    return { code: "sports", confidence: base };
  }
  if (t.leisure === "park") {
    return { code: "park", confidence: 0.95 };
  }
  if (t.natural === "wood") {
    return { code: "forest", confidence: 0.85 };
  }
  if (t.natural === "scrub") {
    return { code: "green_area", confidence: 0.7 };
  }
  if (t.landuse === "grass") {
    return { code: "green_area", confidence: 0.75 };
  }

  const leisure = String(t.leisure || "");
  const landuse = String(t.landuse || "");

  if (["garden", "nature_reserve", "playground"].includes(leisure)) {
    return { code: "green_area", confidence: 0.72 };
  }
  if (["forest", "village_green"].includes(landuse)) {
    return { code: "green_area", confidence: 0.74 };
  }
  if (leisure === "recreation_ground" || landuse === "recreation_ground") {
    return { code: "green_area", confidence: 0.68 };
  }
  if (landuse) {
    return { code: "green_area", confidence: 0.65 };
  }
  if (leisure) {
    return { code: "green_area", confidence: 0.62 };
  }
  if (t.natural) {
    return { code: "green_area", confidence: 0.64 };
  }

  return { code: "green_area", confidence: 0.6 };
}

function categoryLabelEs(code) {
  return LABEL_ES[code] || LABEL_ES.green_area;
}

module.exports = {
  categorize,
  categoryLabelEs,
  LABEL_ES
};
