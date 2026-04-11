/**
 * UrbanGreen ESP32 — sensor + provisión WiFi/API por SoftAP y por Serial.
 *
 * Modo provisión: crea WiFi "UrbanGreen-Setup" (clave por defecto: urbangreen).
 * La app (o el navegador en http://192.168.4.1) envía ssid/pass del router
 * y api + dev del backend.
 *
 * Dependencias: ArduinoJson (v6 o v7), placa ESP32 Arduino.
 */
#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <ArduinoJson.h>
#include <WebServer.h>

#define SOIL_ADC_PIN 34

namespace {

constexpr char kNs[] = "ug";
constexpr char kContentType[] = "application/json";

// SoftAP (cambiar si quieres otro nombre/clave; WPA2 requiere pass >= 8 caracteres)
constexpr char kApSsid[] = "UrbanGreen-Setup";
constexpr char kApPass[] = "urbangreen";

constexpr unsigned kWifiConnectAttempts = 60;

WiFiClientSecure secureClient;
Preferences prefs;
WebServer web(80);

String gSsid;
String gPass;
String gApi;
String gDev;
bool gTlsInsecure = true;
bool gUseSimulated = false;
uint32_t gIntervalMs = 60000;

bool gProvisionMode = false;
unsigned long lastSendMs = 0;
String serialLine;

void savePrefs();
void setupTls();
void connectWifi();
void startProvisioningMode(const char* reason);
void stopProvisioningWeb();
void setupProvisionWeb();
bool applyJsonConfig(const String& jsonStr);
bool applyJsonObject(JsonObject obj);

void savePrefs() {
  prefs.begin(kNs, false);
  prefs.putString("ssid", gSsid);
  prefs.putString("pass", gPass);
  prefs.putString("api", gApi);
  prefs.putString("dev", gDev);
  prefs.putBool("tls", gTlsInsecure);
  prefs.putBool("sim", gUseSimulated);
  prefs.putUInt("interval", gIntervalMs);
  prefs.end();
}

bool loadPrefs() {
  prefs.begin(kNs, true);
  gSsid = prefs.getString("ssid", "");
  gPass = prefs.getString("pass", "");
  gApi = prefs.getString("api", "");
  gDev = prefs.getString("dev", "");
  gTlsInsecure = prefs.getBool("tls", true);
  gUseSimulated = prefs.getBool("sim", false);
  gIntervalMs = prefs.getUInt("interval", 60000);
  prefs.end();

  if (gIntervalMs < 5000) gIntervalMs = 5000;

  return gSsid.length() > 0 && gApi.length() > 0 && gDev.length() > 0;
}

void clearPrefs() {
  prefs.begin(kNs, false);
  prefs.clear();
  prefs.end();

  gSsid = "";
  gPass = "";
  gApi = "";
  gDev = "";
  gTlsInsecure = true;
  gUseSimulated = false;
  gIntervalMs = 60000;
}

void setupTls() {
  if (gTlsInsecure) {
    secureClient.setInsecure();
    Serial.println("TLS: modo inseguro (solo pruebas).");
  }
}

void connectWifi() {
  if (gSsid.isEmpty()) {
    Serial.println("WiFi: SSID vacio.");
    return;
  }

  WiFi.mode(WIFI_STA);
  WiFi.begin(gSsid.c_str(), gPass.c_str());

  Serial.print("Conectando WiFi");
  uint8_t tries = 0;
  while (WiFi.status() != WL_CONNECTED && tries < kWifiConnectAttempts) {
    delay(500);
    Serial.print(".");
    tries++;
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("WiFi OK, IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("ERROR: no se pudo conectar al WiFi.");
  }
}

bool readSensors(float& temperature, float& humidity, float& soilMoisture) {
  if (gUseSimulated) {
    static float s = 45.0f;
    s += (random(-10, 11) / 20.0f);
    s = constrain(s, 5.0f, 95.0f);

    temperature = 24.0f;
    humidity = 0.0f;
    soilMoisture = s;
    return true;
  }

  int raw = analogRead(SOIL_ADC_PIN);
  float soil = (raw / 4095.0f) * 100.0f;

  temperature = 24.0f;
  humidity = 0.0f;
  soilMoisture = soil;
  return true;
}

bool postSensorData(float temperature, float humidity, float soilMoisture) {
  if (gApi.isEmpty()) {
    Serial.println("ERROR: api vacia.");
    return false;
  }

  int devId = gDev.toInt();
  if (devId <= 0) {
    Serial.println("ERROR: dev invalido.");
    return false;
  }

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Sin WiFi, reintentando...");
    connectWifi();
    if (WiFi.status() != WL_CONNECTED) return false;
  }

  char body[256];
  int n = snprintf(
      body,
      sizeof(body),
      "{\"device_id\":%d,\"temperature\":%.2f,\"humidity\":%.2f,\"soil_moisture\":%.2f}",
      devId, temperature, humidity, soilMoisture);

  if (n <= 0 || static_cast<size_t>(n) >= sizeof(body)) {
    Serial.println("ERROR: JSON demasiado largo.");
    return false;
  }

  String url = gApi + "/sensor-data";
  HTTPClient http;
  http.setTimeout(45000);

  if (!http.begin(secureClient, url)) {
    Serial.println("ERROR: http.begin fallo.");
    return false;
  }

  http.addHeader("Content-Type", kContentType);
  int code = http.POST((uint8_t*)body, strlen(body));
  String resp = http.getString();
  http.end();

  Serial.printf("POST %s -> HTTP %d\n", url.c_str(), code);
  if (resp.length()) {
    Serial.println(resp);
  }

  return code >= 200 && code < 300;
}

void sendCorsHeaders() {
  web.sendHeader("Access-Control-Allow-Origin", "*");
  web.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  web.sendHeader("Access-Control-Allow-Headers", "Content-Type");
}

void handleOptionsProvision() {
  sendCorsHeaders();
  web.send(204);
}

bool applyJsonObject(JsonObject doc) {
  if (doc.isNull()) return false;

  if (doc.containsKey("ssid")) gSsid = doc["ssid"].as<String>();
  if (doc.containsKey("pass")) gPass = doc["pass"].as<String>();
  if (doc.containsKey("api")) gApi = doc["api"].as<String>();
  if (doc.containsKey("dev")) gDev = doc["dev"].as<String>();
  if (doc.containsKey("tls")) gTlsInsecure = doc["tls"].as<bool>();
  if (doc.containsKey("sim")) gUseSimulated = doc["sim"].as<bool>();
  if (doc.containsKey("interval")) {
    uint32_t v = doc["interval"].as<uint32_t>();
    gIntervalMs = (v < 5000) ? 5000 : v;
  }

  savePrefs();
  setupTls();
  return true;
}

bool applyJsonConfig(const String& jsonStr) {
  StaticJsonDocument<768> doc;
  DeserializationError err = deserializeJson(doc, jsonStr);
  if (err) {
    Serial.print("ERROR JSON: ");
    Serial.println(err.c_str());
    return false;
  }
  applyJsonObject(doc.as<JsonObject>());
  Serial.println("Config guardada en Preferences.");
  return true;
}

/** Cuerpo POST: form urlencoded (args) o JSON en arg "plain" / cuerpo crudo. */
bool applyProvisionFromRequest(String& errOut) {
  if (web.hasArg("ssid") || web.hasArg("api") || web.hasArg("dev")) {
    if (web.hasArg("ssid")) gSsid = web.arg("ssid");
    if (web.hasArg("pass")) gPass = web.arg("pass");
    if (web.hasArg("api")) gApi = web.arg("api");
    if (web.hasArg("dev")) gDev = web.arg("dev");
    if (web.hasArg("tls")) gTlsInsecure = web.arg("tls") == "1" || web.arg("tls") == "true";
    if (web.hasArg("sim")) gUseSimulated = web.arg("sim") == "1" || web.arg("sim") == "true";
    if (web.hasArg("interval")) {
      uint32_t v = (uint32_t)web.arg("interval").toInt();
      gIntervalMs = (v < 5000) ? 5000 : v;
    }
    savePrefs();
    setupTls();
    return true;
  }

  String raw;
  if (web.hasArg("plain")) {
    raw = web.arg("plain");
  } else {
    raw = web.arg("body");
  }
  raw.trim();
  if (raw.length() == 0) {
    errOut = "Falta cuerpo: usa form (ssid, pass, api, dev) o JSON";
    return false;
  }

  StaticJsonDocument<768> doc;
  DeserializationError err = deserializeJson(doc, raw);
  if (err) {
    errOut = String("JSON invalido: ") + err.c_str();
    return false;
  }
  applyJsonObject(doc.as<JsonObject>());
  return true;
}

void handleProvisionPost() {
  sendCorsHeaders();
  String err;
  if (!applyProvisionFromRequest(err)) {
    web.send(400, "application/json", String("{\"ok\":false,\"error\":\"") + err + "\"}");
    return;
  }

  web.send(200, "application/json", "{\"ok\":true,\"message\":\"Reiniciando en modo STA...\"}");
  delay(300);
  stopProvisioningWeb();
  gProvisionMode = false;
  WiFi.softAPdisconnect(true);
  WiFi.mode(WIFI_STA);
  ESP.restart();
}

void handleStatusGet() {
  sendCorsHeaders();
  StaticJsonDocument<384> doc;
  doc["provision"] = gProvisionMode;
  doc["ap_ssid"] = kApSsid;
  doc["sta_connected"] = (WiFi.status() == WL_CONNECTED);
  doc["ssid_set"] = gSsid.length() > 0;
  doc["api_set"] = gApi.length() > 0;
  doc["dev_set"] = gDev.length() > 0;
  String out;
  serializeJson(doc, out);
  web.send(200, "application/json", out);
}

void handleRootGet() {
  const char* html =
      "<!DOCTYPE html><html><head><meta charset='utf-8'><meta name='viewport' "
      "content='width=device-width'>"
      "<title>UrbanGreen</title></head><body style='font-family:sans-serif;max-width:420px;margin:16px'>"
      "<h2>Configurar UrbanGreen</h2>"
      "<p>Conecta el telefono a la red <b>UrbanGreen-Setup</b> y rellena los datos de tu WiFi y del "
      "backend.</p>"
      "<form method='POST' action='/provision'>"
      "<p>WiFi de casa (SSID)<br><input name='ssid' required style='width:100%'></p>"
      "<p>Contrasena WiFi<br><input name='pass' type='password' style='width:100%'></p>"
      "<p>API base (sin /sensor-data)<br>"
      "<input name='api' placeholder='https://urbangreen.onrender.com' required style='width:100%'></p>"
      "<p>Device ID (numero)<br><input name='dev' placeholder='1' required style='width:100%'></p>"
      "<p><label><input type='checkbox' name='tls' value='1' checked> TLS inseguro (pruebas)</label></p>"
      "<p>Intervalo ms (min 5000)<br><input name='interval' value='60000' style='width:100%'></p>"
      "<button type='submit'>Guardar y reiniciar</button>"
      "</form>"
      "<p style='font-size:12px;opacity:.8'>API app: POST /provision (form o JSON) — GET /status</p>"
      "</body></html>";
  web.send(200, "text/html; charset=utf-8", html);
}

void setupProvisionWeb() {
  web.on("/", HTTP_GET, handleRootGet);
  web.on("/status", HTTP_GET, handleStatusGet);
  web.on(
      "/provision", HTTP_OPTIONS,
      []() {
        handleOptionsProvision();
      });
  web.on(
      "/provision", HTTP_POST,
      []() {
        handleProvisionPost();
      });
  web.onNotFound([]() {
    sendCorsHeaders();
    web.send(404, "application/json", "{\"error\":\"not found\"}");
  });
  web.begin();
}

void stopProvisioningWeb() {
  web.stop();
}

void startProvisioningMode(const char* reason) {
  Serial.printf("Modo provisión: %s\n", reason);
  WiFi.mode(WIFI_AP);
  // Canal 1 (2,4 GHz): mejor compatibilidad para que el SSID aparezca en el móvil.
  if (!WiFi.softAP(kApSsid, kApPass, 1, 0, 4)) {
    Serial.println("ERROR: WiFi.softAP fallo. Revisa antena, alimentación y versión del core ESP32.");
    gProvisionMode = false;
    return;
  }
  gProvisionMode = true;
  IPAddress ip = WiFi.softAPIP();
  Serial.printf("AP SSID: %s  pass: %s  IP: %s\n", kApSsid, kApPass, ip.toString().c_str());
  Serial.println("Busca en el movil la red UrbanGreen-Setup (solo 2,4 GHz).");

  stopProvisioningWeb();
  setupProvisionWeb();
}

void printConfig(bool hidePass = true) {
  Serial.println("----- CONFIG ACTUAL -----");
  Serial.printf("ssid: %s\n", gSsid.c_str());
  if (hidePass && gPass.length() > 0) {
    Serial.println("pass: ********");
  } else {
    Serial.printf("pass: %s\n", gPass.c_str());
  }
  Serial.printf("api: %s\n", gApi.c_str());
  Serial.printf("dev: %s\n", gDev.c_str());
  Serial.printf("tls(insecure): %s\n", gTlsInsecure ? "true" : "false");
  Serial.printf("sim: %s\n", gUseSimulated ? "true" : "false");
  Serial.printf("interval(ms): %u\n", gIntervalMs);
  Serial.println("-------------------------");
}

void printHelp() {
  Serial.println();
  Serial.println("Comandos serial:");
  Serial.println("  HELP");
  Serial.println("  SHOW");
  Serial.println("  RESET");
  Serial.println("  WIFI");
  Serial.println("  SEND");
  Serial.println("  PROV   -> abre red UrbanGreen-Setup para configurar desde la app");
  Serial.println("  SET {...}");
  Serial.println();
}

void handleSerialLine(String line) {
  line.trim();
  if (line.length() == 0) return;

  if (line.equalsIgnoreCase("HELP")) {
    printHelp();
    return;
  }

  if (line.equalsIgnoreCase("SHOW")) {
    printConfig();
    return;
  }

  if (line.equalsIgnoreCase("RESET")) {
    clearPrefs();
    Serial.println("Config borrada.");
    printConfig(false);
    // Sin reinicio manual: abre el AP para que el SSID aparezca en el movil.
    startProvisioningMode("RESET serial");
    return;
  }

  if (line.equalsIgnoreCase("WIFI")) {
    if (gProvisionMode) {
      Serial.println("Estas en modo PROV. Reinicia o guarda desde la web primero.");
      return;
    }
    connectWifi();
    return;
  }

  if (line.equalsIgnoreCase("SEND")) {
    if (gProvisionMode) {
      Serial.println("En modo PROV no se envian lecturas.");
      return;
    }
    float t, h, s;
    if (readSensors(t, h, s)) postSensorData(t, h, s);
    return;
  }

  if (line.equalsIgnoreCase("PROV")) {
    startProvisioningMode("comando serial PROV");
    return;
  }

  if (line.startsWith("SET ")) {
    String payload = line.substring(4);
    if (applyJsonConfig(payload)) printConfig();
    return;
  }

  if (line.startsWith("{")) {
    if (applyJsonConfig(line)) printConfig();
    return;
  }

  Serial.println("Comando no reconocido. Escribe HELP.");
}

void pollSerialCommands() {
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '\n' || c == '\r') {
      if (serialLine.length() > 0) {
        handleSerialLine(serialLine);
        serialLine = "";
      }
    } else {
      if (serialLine.length() < 700) serialLine += c;
    }
  }
}

bool hasMinimumConfig() {
  return gSsid.length() > 0 && gApi.length() > 0 && gDev.length() > 0;
}

}  // namespace

void setup() {
  Serial.begin(115200);
  delay(300);
  randomSeed(esp_random());

  bool ok = loadPrefs();
  setupTls();

  Serial.println("\nUrbanGreen ESP32 iniciado.");
  printHelp();
  printConfig();

  if (!ok) {
    Serial.println("Sin config completa: modo provisión (SoftAP).");
    startProvisioningMode("falta ssid/api/dev");
    lastSendMs = millis();
    return;
  }

  connectWifi();
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("No se pudo conectar: entra en modo provisión.");
    startProvisioningMode("WiFi fallo tras arranque");
    lastSendMs = millis();
    return;
  }

  lastSendMs = millis() - gIntervalMs;
}

void loop() {
  pollSerialCommands();

  if (gProvisionMode) {
    web.handleClient();
    delay(2);
    return;
  }

  if (!hasMinimumConfig()) {
    delay(100);
    return;
  }

  unsigned long now = millis();
  if (now - lastSendMs < gIntervalMs) {
    delay(100);
    return;
  }
  lastSendMs = now;

  float temperature = 0, humidity = 0, soilMoisture = 0;
  if (!readSensors(temperature, humidity, soilMoisture)) return;

  Serial.printf("Lectura: T=%.2f H=%.2f suelo=%.2f\n", temperature, humidity, soilMoisture);

  bool sent = postSensorData(temperature, humidity, soilMoisture);
  if (!sent) Serial.println("No se pudo enviar la lectura.");
}
