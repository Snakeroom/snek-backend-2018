const uuid = require("node-uuid");
const rp = require("request-promise");
const config = require("../config.json");

exports.getRedirect = req => {
	// Generate a random state and place it in the session
	req.session.state = uuid.v4();
	// Build an authorize URL to redirect the user to
	return `
		https://www.reddit.com/api/v1/authorize
		?client_id=${config.reddit.client_id}
		&response_type=code
		&state=${req.session.state}
		&redirect_uri=${config.reddit.redirect_uri}
		&duration=permanent
		&scope=identity
	`.replace(/\n|\t/g, "");
};

exports.getAccessToken = async (code) => {
	// Requests the access token for the user
	const res = await rp({
		method: "POST",
		uri: "https://www.reddit.com/api/v1/access_token",
		auth: {
			username: config.reddit.client_id,
			password: config.reddit.client_secret
		},
		form: {
			grant_type: "authorization_code",
			code: code,
			redirect_uri: config.reddit.redirect_uri
		},
		json: true
	});

	if (!res.access_token) throw new Error(res);

	return res;
};

exports.getMe = (token) => {
	// Gets the me.json of the currently logged in user
	return rp({
		uri: "https://oauth.reddit.com/api/v1/me",
		headers: {
			"Authorization": "bearer " + token,
			"User-Agent": "snek-backend v1.0.0"
		},
		json: true
	});
};