const pool = require("../db");

/** Catálogo inicial: se inserta/actualiza en Postgres al arrancar (`ON CONFLICT` por `name`). */
const SEED_PLANTS_BASE = [
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
  ["palma datilera", 12, 28, "Phoenix dactylifera", "palm", "low_medium", "full_sun", "sandy deep well_drained soil", "arid", "adult palms tolerate drought; young plants need more frequent watering"],
  ["cipres", 25, 40, "Cupressus sempervirens", "tree", "low_medium", "full_sun", "well_drained loam", "mediterranean_temperate", "avoid waterlogging; deep occasional watering once established"],
  ["nogal", 35, 55, "Juglans regia", "fruit_tree", "medium", "full_sun", "deep fertile well_drained soil", "temperate", "regular water in growing season; reduce when dormant"],
  ["manzano", 30, 50, "Malus domestica", "fruit_tree", "medium", "full_sun", "loam well_drained slightly acidic", "temperate", "consistent moisture during fruit development"],
  ["duraznero", 30, 50, "Prunus persica", "fruit_tree", "medium", "full_sun", "deep sandy loam well_drained", "temperate_subtropical", "avoid drought stress during fruit sizing"],
  ["ciruelo", 30, 48, "Prunus domestica", "fruit_tree", "medium", "full_sun", "fertile well_drained soil", "temperate", "moderate irrigation; sensitive to soggy roots"],
  ["higuera", 25, 45, "Ficus carica", "fruit_tree", "medium", "full_sun", "deep well_drained soil", "mediterranean_warm_temperate", "drought tolerant when mature; water for better crop"],
  ["olivo", 15, 30, "Olea europaea", "fruit_tree", "low", "full_sun", "well_drained rocky soil", "mediterranean", "very sensitive to overwatering and poor drainage"],
  ["platano", 40, 65, "Musa acuminata", "fruit_tree", "high", "full_sun_partial_shade", "rich moist well_drained soil", "tropical_subtropical", "high transpiration; keep soil evenly moist in heat"],
  ["papayo", 35, 55, "Carica papaya", "fruit_tree", "medium_high", "full_sun", "sandy loam well_drained", "tropical_subtropical", "steady moisture without waterlogging"],
  ["chirimoyo", 35, 55, "Annona cherimola", "fruit_tree", "medium", "full_sun_partial_shade", "deep well_drained soil", "subtropical", "regular watering in warm season"],
  ["uva", 30, 50, "Vitis vinifera", "fruit_vine", "medium", "full_sun", "well_drained loam", "temperate_mediterranean", "deep less frequent water preferred over shallow daily"],
  ["fresa", 45, 70, "Fragaria x ananassa", "berry_crop", "high", "full_sun", "organic rich moist well_drained", "temperate", "shallow roots; avoid drying out during fruiting"],
  ["tomate", 45, 75, "Solanum lycopersicum", "vegetable", "medium_high", "full_sun", "fertile well_drained loam", "temperate_subtropical", "even moisture reduces blossom end rot risk"],
  ["chile jalapeno", 40, 70, "Capsicum annuum", "vegetable", "medium", "full_sun", "light fertile well_drained soil", "temperate_subtropical", "reduce water slightly when fruits ripen"],
  ["albahaca", 35, 60, "Ocimum basilicum", "aromatic_herb", "medium", "full_sun", "moist fertile well_drained", "warm_temperate", "do not let dry completely in hot weather"],
  ["cilantro", 35, 55, "Coriandrum sativum", "aromatic_herb", "medium", "full_sun_partial_shade", "loam well_drained", "temperate_subtropical", "bolts in heat; keep soil lightly moist"],
  ["menta", 40, 70, "Mentha spp.", "aromatic_herb", "medium_high", "partial_shade", "rich moist soil", "temperate", "prefers consistently damp soil; invasive in beds"],
  ["perejil", 38, 65, "Petroselinum crispum", "aromatic_herb", "medium", "full_sun_partial_shade", "fertile moist well_drained", "temperate", "shallow roots; avoid long dry spells"],
  ["hortensia", 45, 70, "Hydrangea macrophylla", "ornamental_shrub", "high", "partial_shade", "rich moist acidic_to_neutral soil", "temperate", "wilts quickly when dry; mulch helps"],
  ["gardenia", 40, 65, "Gardenia jasminoides", "ornamental_shrub", "medium_high", "partial_shade", "acidic well_drained organic soil", "subtropical", "no drought stress; humidity helps"],
  ["flamboyan", 30, 50, "Delonix regia", "tree", "medium", "full_sun", "deep well_drained soil", "tropical_subtropical", "showy tree; water regularly when young"],
  ["acacia", 15, 30, "Acacia spp.", "tree", "low", "full_sun", "sandy well_drained soil", "arid_semiarid", "nitrogen fixer; very drought tolerant when established"],
  ["sauce", 45, 70, "Salix spp.", "tree", "high", "full_sun", "moist riparian soils", "temperate", "high water demand; tolerates wet feet better than most trees"],
  ["ficus lyrata", 35, 55, "Ficus lyrata", "houseplant", "medium", "bright_indirect", "well_drained potting mix", "tropical_indoor", "allow slight dry between waterings; avoid cold drafts"],
  ["monstera", 30, 50, "Monstera deliciosa", "houseplant", "medium", "bright_indirect", "chunky aroid mix well_drained", "tropical_indoor", "water when top few cm dry; yellow leaves often overwater"],
  ["pothos", 35, 55, "Epipremnum aureum", "houseplant", "medium", "low_to_bright_indirect", "standard potting mix", "tropical_indoor", "forgiving; droops when thirsty"],
  ["dracaena", 25, 45, "Dracaena marginata", "houseplant", "low_medium", "bright_indirect", "well_drained potting mix", "tropical_indoor", "sensitive to fluoride in tap water in some regions"],
  ["sansevieria", 8, 25, "Dracaena trifasciata", "succulent", "very_low", "low_to_bright_indirect", "sandy well_drained mix", "tropical_indoor", "root rot if kept wet; water sparingly"],
  ["kalanchoe", 15, 35, "Kalanchoe blossfeldiana", "succulent", "low", "full_sun_partial_shade", "well_drained succulent mix", "warm_temperate", "short dry period between waterings"],
  ["petunia", 35, 55, "Petunia x hybrida", "annual_flower", "medium", "full_sun", "light fertile well_drained", "temperate", "container plants dry faster; daily water in heat"],
  ["clavel", 35, 55, "Dianthus caryophyllus", "ornamental_herb", "medium", "full_sun", "alkaline well_drained soil", "temperate", "avoid wet foliage overnight"],
  ["crisantemo", 38, 60, "Chrysanthemum morifolium", "ornamental_herb", "medium", "full_sun", "fertile well_drained soil", "temperate", "even moisture; good drainage essential"],
  ["anturio", 40, 65, "Anthurium andraeanum", "houseplant", "medium_high", "bright_indirect", "orchid_airy mix moist", "tropical_indoor", "likes humidity; never let roots sit in stagnant water"],
  ["orquidea phalaenopsis", 25, 45, "Phalaenopsis spp.", "houseplant", "low_medium", "bright_indirect", "bark orchid mix", "tropical_indoor", "soak and drain; roots need air between waterings"],
  ["cactus columnar", 5, 18, "Cereus spp.", "cactus", "very_low", "full_sun", "mineral well_drained mix", "arid", "deep rare watering in growing season only"],
];

/** Lote 1 (expansión del catálogo; más lotes: SEED_PLANTS_EXTRA_2, …). */
const SEED_PLANTS_EXTRA_1 = [
  ["alamo blanco", 40, 70, "Populus alba", "tree", "medium_high", "full_sun", "moist well_drained soil", "temperate", "fast growing tree with moderate water demand"],
  ["alamo negro", 45, 75, "Populus nigra", "tree", "medium_high", "full_sun", "moist fertile soil", "temperate", "prefers riverbanks and consistent moisture"],
  ["cedro rojo", 30, 50, "Cedrela odorata", "tree", "medium", "full_sun", "well_drained loam", "tropical_subtropical", "valuable timber tree; moderate irrigation"],
  ["cedro blanco", 25, 45, "Cupressus lusitanica", "tree", "low_medium", "full_sun", "well_drained soil", "temperate", "drought tolerant once established"],
  ["caoba", 35, 60, "Swietenia macrophylla", "tree", "medium", "full_sun", "deep fertile soil", "tropical", "requires warmth and seasonal rainfall"],
  ["teca", 30, 55, "Tectona grandis", "tree", "medium", "full_sun", "well_drained soil", "tropical", "deciduous tree with moderate water needs"],
  ["roble rojo", 35, 55, "Quercus rubra", "tree", "medium", "full_sun", "deep loam", "temperate", "slow growing hardwood species"],
  ["roble blanco", 35, 60, "Quercus alba", "tree", "medium", "full_sun", "well_drained soil", "temperate", "tolerates drought once mature"],
  ["abedul", 30, 50, "Betula pendula", "tree", "medium", "full_sun", "light moist soil", "temperate", "prefers cool climates and moisture"],
  ["arce rojo", 30, 50, "Acer rubrum", "tree", "medium", "full_sun", "moist acidic soil", "temperate", "good ornamental with seasonal color"],
  ["arce japones", 20, 40, "Acer palmatum", "tree", "medium", "partial_shade", "well_drained soil", "temperate", "sensitive to intense sun and drought"],
  ["tilo", 30, 55, "Tilia cordata", "tree", "medium", "full_sun", "fertile soil", "temperate", "requires consistent watering when young"],
  ["castaño", 35, 60, "Castanea sativa", "tree", "medium", "full_sun", "deep soil", "temperate", "produces edible nuts"],
  ["haya", 35, 60, "Fagus sylvatica", "tree", "medium", "partial_shade", "rich moist soil", "temperate", "sensitive to drought stress"],
  ["algarrobo", 20, 40, "Prosopis pallida", "tree", "low", "full_sun", "sandy soil", "arid", "nitrogen fixer and drought resistant"],
  ["mezquite", 15, 30, "Prosopis juliflora", "tree", "low", "full_sun", "dry sandy soil", "arid", "extremely drought tolerant"],
  ["guamuchil", 20, 35, "Pithecellobium dulce", "tree", "low_medium", "full_sun", "well_drained soil", "tropical", "fast growing with edible pods"],
  ["capulin", 20, 35, "Prunus serotina", "tree", "medium", "full_sun", "fertile soil", "temperate", "produces small edible fruits"],
  ["tejocote", 20, 35, "Crataegus mexicana", "fruit_tree", "medium", "full_sun", "well_drained soil", "temperate", "traditional Mexican fruit tree"],
  ["zapote negro", 30, 50, "Diospyros digyna", "fruit_tree", "medium", "full_sun", "deep soil", "tropical", "sweet dark pulp fruit"],
  ["zapote blanco", 30, 50, "Casimiroa edulis", "fruit_tree", "medium", "full_sun", "well_drained soil", "subtropical", "soft edible fruit"],
  ["mamey", 35, 60, "Pouteria sapota", "fruit_tree", "medium_high", "full_sun", "deep fertile soil", "tropical", "requires warmth and moisture"],
  ["guanabana", 30, 50, "Annona muricata", "fruit_tree", "medium", "full_sun", "well_drained soil", "tropical", "sensitive to cold"],
  ["litchi", 35, 55, "Litchi chinensis", "fruit_tree", "medium_high", "full_sun", "acidic soil", "subtropical", "requires humidity"],
  ["longan", 35, 55, "Dimocarpus longan", "fruit_tree", "medium", "full_sun", "well_drained soil", "tropical", "similar to lychee"],
  ["tamarindo", 30, 55, "Tamarindus indica", "tree", "low_medium", "full_sun", "well_drained soil", "tropical", "drought tolerant"],
  ["anacardo", 25, 45, "Anacardium occidentale", "tree", "low_medium", "full_sun", "sandy soil", "tropical", "produces cashew nuts"],
  ["cacao", 40, 65, "Theobroma cacao", "tree", "high", "partial_shade", "rich moist soil", "tropical", "requires shade and humidity"],
  ["cafe", 40, 65, "Coffea arabica", "shrub", "medium_high", "partial_shade", "acidic soil", "tropical", "shade-loving crop"],
  ["vainilla", 45, 70, "Vanilla planifolia", "vine", "high", "partial_shade", "rich moist soil", "tropical", "climbing orchid species"],
];

const SEED_PLANTS_EXTRA_3 = [
  ["baobab", 20, 40, "Adansonia digitata", "tree", "low", "full_sun", "sandy soil", "arid", "stores water in trunk"],
  ["sequoia", 40, 80, "Sequoia sempervirens", "tree", "medium_high", "full_sun", "deep moist soil", "temperate", "giant long-lived tree"],
  ["magnolia", 30, 50, "Magnolia grandiflora", "tree", "medium", "full_sun", "rich soil", "subtropical", "large fragrant flowers"],
  ["baobab africano", 20, 40, "Adansonia grandidieri", "tree", "low", "full_sun", "dry soil", "arid", "extreme drought tolerance"],
  ["ficus elastica", 35, 55, "Ficus elastica", "houseplant", "medium", "bright_indirect", "well_drained soil", "tropical_indoor", "popular indoor plant"],
  ["palma areca", 35, 55, "Dypsis lutescens", "palm", "medium", "bright_indirect", "well_drained soil", "tropical_indoor", "needs humidity"],
  ["helecho", 40, 70, "Nephrolepis exaltata", "houseplant", "medium_high", "partial_shade", "moist soil", "tropical", "requires humidity"],
  ["bambu", 30, 60, "Bambusa vulgaris", "grass", "medium_high", "full_sun", "moist soil", "tropical", "fast growing"],
  ["bambu negro", 30, 60, "Phyllostachys nigra", "grass", "medium", "full_sun", "well_drained soil", "temperate", "ornamental bamboo"],
  ["canna indica", 40, 70, "Canna indica", "flower", "medium_high", "full_sun", "moist soil", "tropical", "bright ornamental"],
];

const SEED_PLANTS = [
  ...SEED_PLANTS_BASE,
  ...SEED_PLANTS_EXTRA_1,
  ...SEED_PLANTS_EXTRA_3,
];

async function ensurePlantCatalogSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS plants (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      min_soil_moisture NUMERIC NOT NULL,
      max_soil_moisture NUMERIC NOT NULL,
      scientific_name TEXT,
      plant_category TEXT,
      water_need TEXT,
      sun_exposure TEXT,
      soil_preference TEXT,
      climate_preference TEXT,
      notes TEXT
    )
  `);

  try {
    await pool.query(`
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS plant_type TEXT
    `);
  } catch (e) {
    console.warn(
      "[plantCatalog] ALTER devices.plant_type omitido:",
      e?.message || e
    );
  }

  const insertSql = `
    INSERT INTO plants (
      name, min_soil_moisture, max_soil_moisture, scientific_name,
      plant_category, water_need, sun_exposure, soil_preference, climate_preference, notes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    ON CONFLICT (name) DO UPDATE SET
      min_soil_moisture = EXCLUDED.min_soil_moisture,
      max_soil_moisture = EXCLUDED.max_soil_moisture,
      scientific_name = EXCLUDED.scientific_name,
      plant_category = EXCLUDED.plant_category,
      water_need = EXCLUDED.water_need,
      sun_exposure = EXCLUDED.sun_exposure,
      soil_preference = EXCLUDED.soil_preference,
      climate_preference = EXCLUDED.climate_preference,
      notes = EXCLUDED.notes
  `;

  for (const row of SEED_PLANTS) {
    await pool.query(insertSql, row);
  }
}

module.exports = {
  ensurePlantCatalogSchema,
  SEED_PLANTS,
  SEED_PLANTS_BASE,
  SEED_PLANTS_EXTRA_1,
  SEED_PLANTS_EXTRA_3,
};
