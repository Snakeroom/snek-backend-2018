const rp = require("request-promise");
const config = require("../config.json");

const jar = rp.jar();
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

	modhash = body.json.data.modhash;
}