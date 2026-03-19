const { all, get, run } = require("../config/database");

function findByDeviceId(deviceId) {
  return get("SELECT * FROM devices WHERE device_id = ?", [deviceId]);
}

function listAll() {
  return all("SELECT * FROM devices ORDER BY created_at DESC, id DESC");
}

async function create({ device_id, plant_type, latitude, longitude }) {
  await run(
    `INSERT INTO devices (device_id, plant_type, latitude, longitude)
     VALUES (?, ?, ?, ?)`,
    [device_id, plant_type, latitude, longitude]
  );

  return findByDeviceId(device_id);
}

async function updateByDeviceId(deviceId, { plant_type, latitude, longitude }) {
  await run(
    `UPDATE devices
     SET plant_type = ?, latitude = ?, longitude = ?
     WHERE device_id = ?`,
    [plant_type, latitude, longitude, deviceId]
  );

  return findByDeviceId(deviceId);
}

async function patchByDeviceId(deviceId, payload) {
  const fields = [];
  const values = [];

  if (payload.plant_type !== undefined) {
    fields.push("plant_type = ?");
    values.push(payload.plant_type);
  }
  if (payload.latitude !== undefined) {
    fields.push("latitude = ?");
    values.push(payload.latitude);
  }
  if (payload.longitude !== undefined) {
    fields.push("longitude = ?");
    values.push(payload.longitude);
  }

  if (fields.length === 0) {
    return findByDeviceId(deviceId);
  }

  values.push(deviceId);
  await run(`UPDATE devices SET ${fields.join(", ")} WHERE device_id = ?`, values);

  return findByDeviceId(deviceId);
}

async function deleteByDeviceId(deviceId) {
  await run("DELETE FROM sensor_latest WHERE device_id = ?", [deviceId]);
  return run("DELETE FROM devices WHERE device_id = ?", [deviceId]);
}

module.exports = {
  listAll,
  findByDeviceId,
  create,
  updateByDeviceId,
  patchByDeviceId,
  deleteByDeviceId
};
