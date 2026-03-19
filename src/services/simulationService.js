function randomInRange(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateReading() {
  return {
    temperature: randomInRange(20, 40),
    soil_moisture: randomInRange(10, 60)
  };
}

module.exports = {
  generateReading
};
