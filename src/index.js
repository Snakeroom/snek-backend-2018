const express = require("express");
const session = require("express-session");
const LevelStore = require("level-session-store")(session);
const bodyParser = require("body-parser");
const RateLimit = require("express-rate-limit");
const { encode } = require("ent");
const { createServer } = require("http");
const config = require("../config.json");
const checker = require("./checker");
const db = require("./db");
const reddit = require("./reddit");
const { banUser, isAdmin, isBanned } = require("./utils");
const websocket = require("./websocket");

const ID_REGEX = /\/([a-z0-9]{6})(\/|$)/;

// Add cors headers to a response
const addCors = (req, res, next) => {
	res.header("Access-Control-Allow-Origin", req.header("origin"));
	res.header("Access-Control-Allow-Credentials", "true");
	next();
};

// Send the join_circle event to all clients
const broadcastCircle = (id, key) => {
	websocket.sendToAll(JSON.stringify({
		type: "join_circle",
		payload: {
			id,
			key
		}
	}));
};

// If the user is not an admin, deny access
const checkIsAdmin = (req, res) => {
	if (!checkToken(req, res)) return false;

	if (!isAdmin(req.session.name)) {
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

checker.init();

app.enable("trust proxy");
app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({
	extended: false
}));

const sessionParser = session({
	cookie: {
		maxAge: 144 * 60 * 60 * 1000
	},
	resave: false,
	saveUninitialized: false,
	secret: config.secret,
	store: new LevelStore()
});
app.use(sessionParser);

// Check if user is banned, and delete session if so
app.all("*", async (req, res, next) => {
	if (req.session.name && await isBanned(req.session.name)) {
		req.session.destroy();
		res.status(401).send("you're banned");
	} else {
		next();
	}
});

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
	if (await isBanned(username)) {
		res.status(401).send("you're banned");
		return;
	}

	req.session.access_token = data.access_token;
	req.session.name = username;
	res.send("You may close this tab.");
});

app.get("/authenticated", addCors, (req, res) => {
	res.json({
		access_token: req.session.access_token,
		authenticated: !!req.session.access_token
	});
});

app.post("/ban", async (req, res, next) => {
	if (!checkIsAdmin(req, res)) return;

	if (!req.body.action || !req.body.name) {
		return res.status(400).send("invalid params");
	}

	if (req.body.action === "ban") {
		await banUser(req.body.name);
	} else if (req.body.action === "unban") {
		await unbanUser(req.body.name);
	}

	next();
});

app.all("/ban", (req, res) => {
	if (!checkIsAdmin(req, res)) return;

	res.render("ban");
});

app.post("/request-circle",
	addCors,
	new RateLimit({
		windowMs: 30*60*1000,
		max: 5,
		delayMs: 500,
		message: "slow down, try again later",
		skip: checkIsAdmin
	}),
	async (req, res) => {
		if (!checkToken(req, res)) return;

		if (!req.body.url || !req.body.key || !req.body.url.match(ID_REGEX)) {
			return res.status(400).send("invalid params");
		}

		const insertRequest = async () => {
			const id = "t3_" + encode(req.body.url.match(ID_REGEX)[1]);
			if (!await checker.check(id, req.body.key)) {
				res.status(400).send("invalid key/url");
				return;
			}

			db.put(username, JSON.stringify({
				id,
				key: encode(req.body.key)
			}));

			res.send("Success!");
		};

		const username = req.session.name;
		db.get(username)
			// Already requested before. If user is an admin, allow - else deny
			.then(async () => {
				if (!isAdmin(username)) res.status(409).send("already requested");
				else insertRequest();
			})
			// Haven't requested, add it to database
			.catch(insertRequest);
	}
);

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
websocket.init(server, sessionParser);

server.listen(process.env.PORT || 3000, () => console.log("Listening"));
