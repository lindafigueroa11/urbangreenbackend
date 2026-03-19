const { get, all } = require("../config/database");

function findByName(name) {
  return get("SELECT * FROM plants WHERE LOWER(name) = LOWER(?)", [name]);
}

function listAll() {
  return all("SELECT * FROM plants ORDER BY name ASC");
}

module.exports = {
  findByName,
  listAll
};
