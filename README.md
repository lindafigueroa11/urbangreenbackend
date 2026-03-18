# Urban Green Backend (MVP)

Backend API for ingesting IoT sensor data (ESP32), storing sensor history, and deciding watering actions based on plant-specific soil moisture thresholds.

## Stack

- Node.js
- Express.js
- SQLite
- REST API

## Project Structure

```
.
|-- src
|   |-- config
|   |   `-- database.js
|   |-- controllers
|   |   |-- deviceController.js
|   |   |-- healthController.js
|   |   `-- sensorDataController.js
|   |-- models
|   |   |-- deviceModel.js
|   |   |-- plantModel.js
|   |   `-- sensorDataModel.js
|   |-- routes
|   |   |-- deviceRoutes.js
|   |   |-- healthRoutes.js
|   |   `-- sensorRoutes.js
|   |-- services
|   |   `-- wateringService.js
|   `-- server.js
|-- data
|   `-- urbangreen.db (auto-generated)
|-- server.js
`-- README.md
```

## Run Instructions

```bash
npm install
npm run dev
```

Server runs by default on `http://localhost:3000`.

## API Contract (OpenAPI)

- Contract file: `openapi.json`
- Endpoint to consume live contract: `GET /openapi.json`

You can paste `openapi.json` into [Swagger Editor](https://editor.swagger.io/) to visualize and validate.

## API Endpoints

### Health

- `GET /health`

Response:

```json
{
  "status": "running"
}
```

### Register Device

- `POST /devices/register`
- `GET /devices`
- `GET /devices/:device_id`
- `PATCH /devices/:device_id`
- `DELETE /devices/:device_id`

Body:

```json
{
  "device_id": "sensor_001",
  "plant_type": "jacaranda",
  "latitude": 29.0729,
  "longitude": -110.9559
}
```

### List Plants Catalog

- `GET /plants`
- `GET /plants/:name`

Returns all configured plants with:

- watering thresholds (`min_soil_moisture`, `max_soil_moisture`)
- scientific name
- category
- water demand
- sun/soil/climate preferences
- agronomic notes

Example:

- `GET /plants/aguacate`
- `GET /plants/palma%20datilera`

### Ingest Sensor Data + Watering Decision

- `POST /sensor-data`
- Requires a previously registered device in `devices`.

Body:

```json
{
  "device_id": "sensor_001",
  "temperature": 32,
  "soil_moisture": 25,
  "plant_type": "jacaranda",
  "latitude": 29.0729,
  "longitude": -110.9559
}
```

Response example:

```json
{
  "action": "water",
  "reason": "soil moisture below plant threshold",
  "device_id": "sensor_001",
  "plant_type": "jacaranda"
}
```

### Sensor History

- `GET /sensor-history/:device_id`
- `GET /sensor-history/:device_id?limit=50&from=2026-03-16 00:00:00&to=2026-03-17 00:00:00`

Response example:

```json
{
  "device_id": "sensor_001",
  "readings": [
    {
      "temperature": 32,
      "soil_moisture": 25,
      "created_at": "2026-03-16 20:52:57"
    }
  ]
}
```

### Simulate Reading

- `POST /simulate-reading`

Body:

```json
{
  "device_id": "sensor_001"
}
```

Response example:

```json
{
  "device_id": "sensor_001",
  "temperature": 34,
  "soil_moisture": 22,
  "action": "water",
  "reason": "soil moisture below recommended level"
}
```

## Watering Decision Rules

`wateringService.js` compares `soil_moisture` against plant thresholds:

- if `< min_soil_moisture` -> `water`
- if `> max_soil_moisture` -> `do_not_water`
- otherwise -> `optimal`

## Seeded Plants

- jacaranda -> min 30, max 50
- ficus -> min 40, max 60
- encino -> min 35, max 55

## Future-Ready Notes

Current modular structure is ready to extend with:

- weather API integration (`src/services/weatherService.js`)
- irrigation prediction module (`src/services/predictionService.js`)
- urban water stress analytics (`src/services/analyticsService.js`)
- multiple sensors per zone (new `zones` and `zone_sensors` tables)
