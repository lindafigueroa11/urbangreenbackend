const { all, run } = require("../config/database");

function create({ device_id, temperature, soil_moisture }) {
  return run(
    `INSERT INTO sensor_data (device_id, temperature, soil_moisture, created_at)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
    [device_id, temperature, soil_moisture]
  );
}

function upsertLatest({ device_id, temperature, soil_moisture }) {
  return run(
    `INSERT INTO sensor_latest (device_id, temperature, soil_moisture, updated_at)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(device_id)
     DO UPDATE SET
       temperature = excluded.temperature,
       soil_moisture = excluded.soil_moisture,
       updated_at = CURRENT_TIMESTAMP`,
    [device_id, temperature, soil_moisture]
  );
}

function getLatestByDeviceId(deviceId, options = {}) {
  const { limit = 50, from, to } = options;
  let sql = `
    SELECT temperature, soil_moisture, created_at
    FROM sensor_data
    WHERE device_id = ?
  `;
  const params = [deviceId];

  if (from) {
    sql += " AND datetime(created_at) >= datetime(?)";
    params.push(from);
  }
  if (to) {
    sql += " AND datetime(created_at) <= datetime(?)";
    params.push(to);
  }

  sql += " ORDER BY datetime(created_at) DESC, id DESC LIMIT ?";
  params.push(limit);

  return all(sql, params);
}

function getAllLatestWithLocation() {
  return all(
    `SELECT
       d.device_id,
       d.latitude,
       d.longitude,
       sl.temperature,
       sl.soil_moisture,
       sl.updated_at
     FROM devices d
     INNER JOIN sensor_latest sl ON sl.device_id = d.device_id
     ORDER BY datetime(sl.updated_at) DESC, d.device_id ASC`
  );
}

module.exports = {
  create,
  upsertLatest,
  getLatestByDeviceId,
  getAllLatestWithLocation
};
