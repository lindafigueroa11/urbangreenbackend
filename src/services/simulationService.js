function randomInRange(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Un decimal, coherente con JSON del ESP32 (%.2f). */
function randomFloat(min, max, decimals = 2) {
  const v = Math.random() * (max - min) + min;
  const p = 10 ** decimals;
  return Math.round(v * p) / p;
}

/** Lectura completa para POST /sensor-data (temperatura, humedad, suelo). */
function generateFullReading() {
  return {
    temperature: randomFloat(16, 32),
    humidity: randomFloat(35, 82),
    soil_moisture: randomFloat(12, 78)
  };
}

function generateReading() {
  const full = generateFullReading();
  return {
    temperature: full.temperature,
    soil_moisture: full.soil_moisture
  };
}

module.exports = {
  generateReading,
  generateFullReading
};
