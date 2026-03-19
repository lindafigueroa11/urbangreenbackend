const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

function resolveDbPath() {
  if (process.env.DATABASE_PATH) {
    return path.resolve(process.env.DATABASE_PATH);
  }

  // Render persistent disks are usually mounted under /var/data.
  if (process.env.RENDER === "true") {
    return "/var/data/urbangreen.db";
  }

  const localDataDir = path.join(__dirname, "../../data");
  return path.join(localDataDir, "urbangreen.db");
}

const dbPath = resolveDbPath();
const dataDir = path.dirname(dbPath);

fs.mkdirSync(dataDir, { recursive: true });

const db = new sqlite3.Database(dbPath, (error) => {
  if (error) {
    console.error("Error opening SQLite database:", error.message);
  } else {
    console.log("SQLite connected at", dbPath);
  }
});

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) return reject(error);
      resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) return reject(error);
      resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) return reject(error);
      resolve(rows);
    });
  });
}

async function initDatabase() {
  await run(`
    CREATE TABLE IF NOT EXISTS devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL UNIQUE,
      plant_type TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS sensor_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL,
      temperature REAL NOT NULL,
      soil_moisture REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(
    "CREATE INDEX IF NOT EXISTS sensor_data_device_id ON sensor_data (device_id)"
  );
  await run(
    "CREATE INDEX IF NOT EXISTS sensor_data_created_at ON sensor_data (created_at)"
  );

  await run(`
    CREATE TABLE IF NOT EXISTS sensor_latest (
      device_id TEXT PRIMARY KEY,
      temperature REAL NOT NULL,
      soil_moisture REAL NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const sensorDataColumns = await all("PRAGMA table_info(sensor_data)");
  const hasCreatedAt = sensorDataColumns.some((column) => column.name === "created_at");
  const hasLegacyTimestamp = sensorDataColumns.some((column) => column.name === "timestamp");

  // Backward-compatible migration for older local DBs that used "timestamp".
  if (!hasCreatedAt) {
    await run("ALTER TABLE sensor_data ADD COLUMN created_at DATETIME");
  }

  if (hasLegacyTimestamp) {
    await run(`
      UPDATE sensor_data
      SET created_at = COALESCE(created_at, timestamp, CURRENT_TIMESTAMP)
    `);
  } else {
    await run(`
      UPDATE sensor_data
      SET created_at = COALESCE(created_at, CURRENT_TIMESTAMP)
    `);
  }

  await run(`
    CREATE TABLE IF NOT EXISTS plants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      min_soil_moisture REAL NOT NULL,
      max_soil_moisture REAL NOT NULL,
      scientific_name TEXT,
      plant_category TEXT,
      water_need TEXT,
      sun_exposure TEXT,
      soil_preference TEXT,
      climate_preference TEXT,
      notes TEXT
    )
  `);

  const plantColumns = await all("PRAGMA table_info(plants)");
  const existingPlantColumnNames = new Set(plantColumns.map((column) => column.name));
  const requiredPlantColumns = [
    ["scientific_name", "TEXT"],
    ["plant_category", "TEXT"],
    ["water_need", "TEXT"],
    ["sun_exposure", "TEXT"],
    ["soil_preference", "TEXT"],
    ["climate_preference", "TEXT"],
    ["notes", "TEXT"]
  ];

  for (const [columnName, columnType] of requiredPlantColumns) {
    if (!existingPlantColumnNames.has(columnName)) {
      await run(`ALTER TABLE plants ADD COLUMN ${columnName} ${columnType}`);
    }
  }

  const seedPlants = [
    ["jacaranda", 30, 50, "Jacaranda mimosifolia", "tree", "medium", "full_sun", "well_drained loam", "subtropical warm-temperate", "ornamental tree with moderate irrigation once established"],
    ["ficus", 40, 60, "Ficus benjamina", "tree", "medium_high", "full_sun_partial_shade", "fertile well_drained soil", "tropical_subtropical", "prefers stable moisture and warm environments"],
    ["encino", 35, 55, "Quercus spp.", "tree", "medium", "full_sun", "deep well_drained soil", "temperate", "young trees need regular watering; mature trees tolerate some drought"],
    ["pino", 20, 35, "Pinus spp.", "tree", "low_medium", "full_sun", "sandy_loam well_drained", "temperate_mediterranean", "avoid waterlogging; roots need oxygenated soil"],
    ["eucalipto", 18, 30, "Eucalyptus globulus", "tree", "low_medium", "full_sun", "well_drained soils", "warm_temperate", "fast-growing tree with good drought tolerance after establishment"],
    ["fresno", 30, 45, "Fraxinus uhdei", "tree", "medium", "full_sun", "deep fertile loam", "temperate", "responds well to moderate and consistent irrigation"],
    ["olmo", 28, 42, "Ulmus parvifolia", "tree", "medium", "full_sun_partial_shade", "well_drained loam", "temperate", "tolerates urban conditions; avoid prolonged saturated soils"],
    ["ahuehuete", 40, 65, "Taxodium mucronatum", "tree", "high", "full_sun", "moist alluvial soils", "temperate_subtropical", "native riparian species with high water demand"],
    ["palo verde", 12, 25, "Parkinsonia aculeata", "tree", "low", "full_sun", "sandy gravelly soils", "arid_semiarid", "desert-adapted tree; very sensitive to overwatering"],
    ["neem", 18, 32, "Azadirachta indica", "tree", "low_medium", "full_sun", "well_drained sandy_loam", "tropical_semiarid", "drought resistant and prefers warm climates"],
    ["naranjo", 30, 45, "Citrus sinensis", "fruit_tree", "medium", "full_sun", "well_drained loam", "subtropical", "requires regular watering during flowering and fruiting"],
    ["limonero", 30, 45, "Citrus limon", "fruit_tree", "medium", "full_sun", "slightly acidic well_drained soil", "subtropical", "sensitive to drought stress in hot periods"],
    ["mango", 28, 42, "Mangifera indica", "fruit_tree", "medium", "full_sun", "deep well_drained soil", "tropical_subtropical", "moderate irrigation; reduce excess water near harvest"],
    ["guayabo", 25, 40, "Psidium guajava", "fruit_tree", "medium", "full_sun", "well_drained loam", "tropical_subtropical", "maintain moderate moisture for better fruit set"],
    ["granado", 20, 35, "Punica granatum", "fruit_tree", "low_medium", "full_sun", "well_drained soils", "mediterranean_semiarid", "drought tolerant but benefits from deep periodic irrigation"],
    ["aguacate", 35, 55, "Persea americana", "fruit_tree", "medium_high", "full_sun_partial_shade", "well_drained aerated soil", "subtropical", "roots are sensitive to flooding; keep moisture stable"],
    ["mandarino", 30, 45, "Citrus reticulata", "fruit_tree", "medium", "full_sun", "well_drained loam", "subtropical", "consistent irrigation improves fruit quality"],
    ["bugambilia", 15, 30, "Bougainvillea glabra", "ornamental_shrub", "low", "full_sun", "light well_drained soil", "warm_dry", "blooms better with moderate water stress"],
    ["hibiscus", 35, 55, "Hibiscus rosa-sinensis", "ornamental_shrub", "medium_high", "full_sun_partial_shade", "rich well_drained soil", "tropical_subtropical", "prefers moist substrate and warm temperatures"],
    ["rosales", 30, 50, "Rosa spp.", "ornamental_shrub", "medium", "full_sun", "organic rich well_drained soil", "temperate", "regular irrigation is key for flowering"],
    ["lavanda", 15, 30, "Lavandula angustifolia", "aromatic_shrub", "low", "full_sun", "alkaline sandy well_drained soil", "mediterranean", "highly sensitive to overwatering"],
    ["romero", 12, 28, "Salvia rosmarinus", "aromatic_shrub", "low", "full_sun", "sandy rocky well_drained", "mediterranean", "thrives in dry conditions once established"],
    ["jazmin", 30, 50, "Jasminum officinale", "ornamental_vine", "medium", "full_sun_partial_shade", "fertile well_drained soil", "warm_temperate_subtropical", "maintain moderate moisture for continuous flowering"],
    ["geranio", 20, 40, "Pelargonium x hortorum", "ornamental_herb", "low_medium", "full_sun_partial_shade", "light well_drained substrate", "temperate", "allow topsoil to dry slightly between waterings"],
    ["agave", 8, 20, "Agave americana", "succulent", "very_low", "full_sun", "sandy rocky well_drained", "arid_semiarid", "xerophytic species; avoid frequent irrigation"],
    ["nopal", 5, 18, "Opuntia ficus-indica", "cactus", "very_low", "full_sun", "sandy stony well_drained", "arid_semiarid", "very drought tolerant; water deeply but infrequently"],
    ["yuca", 10, 22, "Yucca elephantipes", "succulent_shrub", "low", "full_sun_partial_shade", "sandy well_drained soil", "arid_warm_temperate", "low watering requirement and good heat tolerance"],
    ["aloe", 8, 20, "Aloe vera", "succulent", "very_low", "full_sun_partial_shade", "sandy well_drained substrate", "arid_subtropical", "store water in leaves; excess moisture causes rot"],
    ["palma datilera", 12, 28, "Phoenix dactylifera", "palm", "low_medium", "full_sun", "sandy deep well_drained soil", "arid", "adult palms tolerate drought; young plants need more frequent watering"]
  ];

  for (const plant of seedPlants) {
    await run(
      `INSERT INTO plants (
         name,
         min_soil_moisture,
         max_soil_moisture,
         scientific_name,
         plant_category,
         water_need,
         sun_exposure,
         soil_preference,
         climate_preference,
         notes
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(name)
       DO UPDATE SET
         min_soil_moisture = excluded.min_soil_moisture,
         max_soil_moisture = excluded.max_soil_moisture,
         scientific_name = excluded.scientific_name,
         plant_category = excluded.plant_category,
         water_need = excluded.water_need,
         sun_exposure = excluded.sun_exposure,
         soil_preference = excluded.soil_preference,
         climate_preference = excluded.climate_preference,
         notes = excluded.notes`,
      plant
    );
  }
}

module.exports = {
  db,
  run,
  get,
  all,
  initDatabase
};
