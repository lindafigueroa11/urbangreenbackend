function getHealth(_req, res) {
  return res.json({ status: "running" });
}

module.exports = {
  getHealth
};
