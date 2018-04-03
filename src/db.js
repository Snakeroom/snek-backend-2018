const levelup = require("levelup");
const leveldown = require("leveldown");

module.exports = levelup(leveldown("database"));