const express = require("express");
const session = require("express-session");
const bodyParser = require("body-parser");
const { createServer } = require("http");
const WebSocketServer = require("uws").Server;
const reddit = require("./reddit");
const config = require("../config.json");

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(bodyParser.urlencoded({
	extended: false
}));
app.use(session({
	secret: config.secret,
	resave: false,
	saveUninitialized: true
}));

app.get("/auth", (req, res) => {
	res.redirect(reddit.getRedirect(req));
});

app.get("/auth/check", async (req, res) => {
	// Make sure given state matches
	if (!req.query.state || req.query.state !== req.session.state) {
		return res.status(401).send("invalid state");
	}

	// Update the session with access token
	const data = await reddit.getAccessToken(req.query.code);
	req.session.access_token = data.access_token;
	res.send("Success!");
});

app.post("/send-circle", async (req, res) => {
	// Make sure user has an access token
	if (!req.session.access_token) {
		return res.status(401).send("not authorized");
	}

	// Get the logged in user's me.json data
	const data = (await reddit.getMe(req.session.access_token));
	// If the user is not an admin, deny access
	if (!config.admins.includes(data.name)) {
		return res.status(401).send("not an admin");
	}

	// Send the join_circle event to all clients
	wss.clients.forEach(client => {
		client.send(JSON.stringify({
			type: "join_circle",
			payload: {
				id: req.body.id,
				key: req.body.key
			}
		}));
	});

	res.send("Success!");
})

server.listen(process.env.PORT || 3000, () => console.log("Listening"));