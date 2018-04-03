const rp = require("request-promise");
const config = require("../config.json");

let cookie = "";
let modhash = "";

exports.init = async () => {
	// Login to check_account
	const body = await rp("https://www.reddit.com/api/login", {
		method: "POST",
		form: {
			op: "login",
			user: config.check_account.username,
			passwd: config.check_account.password,
			api_type: "json"
		},
		json: true
	});

	cookie = body.json.data.cookie;
	modhash = body.json.data.modhash;
};

exports.check = async (id, key) => {
	try {
		const body = await rp("https://www.reddit.com/api/guess_voting_key.json", {
			method: "POST",
			form: {
				id,
				vote_key: key
			},
			headers: {
				cookie: `reddit_session=${cookie}`,
				"x-modhash": modhash
			},
			json: true
		});

		return body[key];
	} catch (e) {
		console.log(e)
		return false;
	}
};