const plantModel = require("../models/plantModel");

async function decideWatering(plantType, soilMoisture) {
  const plant = await plantModel.findByName(plantType);

  if (!plant) {
    return {
      action: "unknown",
      reason: `plant type '${plantType}' not configured`
    };
  }

  if (soilMoisture < plant.min_soil_moisture) {
    return {
      action: "water",
      reason: "soil moisture below plant threshold"
    };
  }

  if (soilMoisture > plant.max_soil_moisture) {
    return {
      action: "do_not_water",
      reason: "soil moisture above plant threshold"
    };
  }

  return {
    action: "optimal",
    reason: "soil moisture is within recommended range"
  };
}

module.exports = {
  decideWatering
};
