const { get, all } = require("../config/database");

function normalizeForMatch(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function findByName(name) {
  return get("SELECT * FROM plants WHERE LOWER(name) = LOWER(?)", [name]).then(
    (row) => {
      if (row) return row;

      // Fallback: tolerar acentos/variantes del nombre.
      const wanted = normalizeForMatch(name);
      if (!wanted) return null;

      return all("SELECT * FROM plants").then((rows) => {
        const exact = rows.find(
          (p) =>
            normalizeForMatch(p?.name || "") === wanted ||
            normalizeForMatch(p?.scientific_name || "") === wanted
        );
        return exact || null;
      });
    }
  );
}

function listAll() {
  return all("SELECT * FROM plants ORDER BY name ASC");
}

module.exports = {
  findByName,
  listAll
};
