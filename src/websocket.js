const WebSocketServer = require("uws").Server;
const { isBanned } = require("./utils");

const userToSocket = {};
let wss;

exports.disconnectUser = name => {
	const arr = userToSocket[name];
	if (!arr) return;

	arr.forEach(client => client.close());
	delete userToSocket[name];
};

exports.init = (server, sessionParser) => {
	wss = new WebSocketServer({ server });

	wss.on("connection", client => {
		try {
			// Parse the session from upgrade request
			const req = client.upgradeReq;
			sessionParser(req, {}, async () => {
				const session = req.session;
				// If the user doesn't have access token or name or is banned, close them out
				if (!session.access_token || !session.name || await isBanned(session.name)) {
					client.close();
					return;
				}

				// Add the websocket to the array
				userToSocket[session.name] = (userToSocket[session.name] || []).concat(client);

				// Remove websocket from array on close
				client.on("close", () => {
					const arr = userToSocket[session.name];
					if (!arr) return;

					arr.splice(arr.indexOf(client), 1);
				});
			});
		} catch (e) {
			client.close();
		}
	});

	// Ping every 90s to keep CloudFlare from closing the socket
	setInterval(() => {
		wss.clients.forEach(client => {
			client.send(JSON.stringify({ type: "ping" }));
		});
	}, 90000);
};