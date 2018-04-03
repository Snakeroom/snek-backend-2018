const express = require("express");
const cookieSession = require("cookie-session");
const bodyParser = require("body-parser");
const { encode } = require("ent");
const { createServer } = require("http");
const WebSocketServer = require("uws").Server;
const config = require("../config.json");
const db = require("./db");
const reddit = require("./reddit");

const ID_REGEX = /\/([a-z0-9]{6})(\/|$)/;

// Send the join_circle event to all clients
const broadcastCircle = (id, key) => {
	wss.clients.forEach(client => {
		client.send(JSON.stringify({
			type: "join_circle",
			payload: {
				id,
				key
			}
		}));
	});
};

// If the user is not an admin, deny access
const checkIsAdmin = (req, res) => {
	if (!checkToken(req, res)) return false;

	if (!config.admins.includes(req.session.name)) {
		res.status(401).send("not an admin");
		return false;
	}

	return true;
};

// Makes sure user has an access token
const checkToken = (req, res) => {
	if (!req.session.access_token) {
		res.status(401).send("not authorized");
		return false;
	}

	return true;
};

const app = express();

app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({
	extended: false
}));

const sessionParser = cookieSession({
	name: "session",
	keys: [config.secret],

	maxAge: 144 * 60 * 60 * 1000
});
app.use(sessionParser);

app.get("/auth", (req, res) => {
	res.redirect(reddit.getRedirect(req));
});

app.get("/auth/check", async (req, res) => {
	// Make sure given state matches
	if (!req.query.state || req.query.state !== req.session.state) {
		return res.status(401).send("invalid state");
	}

	if (req.query.error) {
		return res.status(401).send("permission was declined, try again");
	}

	// Update the session with access token
	const data = await reddit.getAccessToken(req.query.code);
	const username = (await reddit.getMe(data.access_token)).name;
	req.session.access_token = data.access_token;
	req.session.name = username;
	res.send("You may close this tab.");
});

app.get("/authenticated", (req, res) => {
	res.header("Access-Control-Allow-Origin", req.header("origin"));
	res.header("Access-Control-Allow-Credentials", "true");

	res.json({
		access_token: req.session.access_token,
		authenticated: !!req.session.access_token
	});
});

app.post("/request-circle", async (req, res) => {
	res.header("Access-Control-Allow-Origin", req.header("origin"));
	res.header("Access-Control-Allow-Credentials", "true");

	if (!checkToken(req, res)) return;

	if (!req.body.url || !req.body.key || !req.body.url.match(ID_REGEX)) {
		return res.status(400).send("invalid params");
	}

	const insertRequest = () => {
		db.put(username, JSON.stringify({
			id: "t3_" + encode(req.body.url.match(ID_REGEX)[1]),
			key: encode(req.body.key)
		}));

		res.send("Success!");
	};

	const username = req.session.username;
	db.get(username)
		// Already requested before. If user is an admin, allow - else deny
		.then(async () => {
			if (!config.admins.includes(username)) res.status(409).send("already requested");
			else insertRequest();
		})
		// Haven't requested, add it to database
		.catch(insertRequest);
});

app.post("/requests", async (req, res, next) => {
	if (!checkIsAdmin(req, res)) return;

	if (!req.body.action || !req.body.username) {
		return res.status(400).send("invalid params");
	}

	if (req.body.action === "approve") {
		const { id, key } = JSON.parse((await db.get(req.body.username)).toString("utf-8"));
		broadcastCircle(id, key);
	}

	await db.put(req.body.username, req.body.action);
	next()
});

app.all("/requests", (req, res) => {
	if (!checkIsAdmin(req, res)) return;

	const requests = [];

	db.createReadStream()
		.on("data", data => {
			const username = data.key.toString("utf-8");
			const strValue = data.value.toString("utf-8");
			if (strValue === "approve" || strValue === "deny") return;

			const value = JSON.parse(strValue);
			requests.push({
				username,
				id: value.id,
				key: value.key
			});
		})
		.on("end", () => {
			res.render("requests", { requests });
		});
})

const server = createServer(app);
const wss = new WebSocketServer({ server });

wss.on("connection", client => {
	try {
		sessionParser(client.upgradeReq, {}, () => {});
		if (!client.upgradeReq.session.access_token) {
			client.close();
			return;
		}
	} catch (e) { }
});

server.listen(process.env.PORT || 3000, () => console.log("Listening"));
