const config = require("../config.json");
const db = require("./db");

exports.banUser = async name => {
	require("./websocket").disconnectUser(name);
	await db.put(`${name}:banned`, true);
};

exports.isAdmin = name => config.admins.includes(name);

exports.isBanned = name =>
	db.get(`${name}:banned`)
		.then(() => true)
		.catch(() => false);