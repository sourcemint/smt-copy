
exports.for = function (API) {

	var exports = {};

	exports.turn = function (resolvedConfig) {

		function copy (fromPath, toPath, callback) {

			API.console.debug("Copying and transforming fileset", fromPath, "to", toPath, "...");

			var domain = require('domain').create();
			domain.on('error', function(err) {
				// The error won't crash the process, but what it does is worse!
				// Though we've prevented abrupt process restarting, we are leaking
				// resources like crazy if this ever happens.
				// This is no better than process.on('uncaughtException')!
				console.error("UNHANDLED DOMAIN ERROR:", err.stack, new Error().stack);
				return callback(new Error("UNHANDLED DOMAIN ERROR"));
			});
			domain.run(function() {

				try {

					var destinationStream = null;

					destinationStream = API.GULP.dest(toPath);

					destinationStream.once("error", function (err) {
						return callback(err);
					});

					destinationStream.once("end", function () {

						API.console.debug("... done");

						return callback();
					});

					// TODO: Respect gitignore by making pinf walker into gulp plugin. Use pinf-package-insight to load ignore rules.
					var stream = null;
					stream = API.GULP.src([
						"**",
						".*"
					], {
						cwd: fromPath
					});

					var lastPath = null;
					stream
						.pipe(API.GULP_PLUMBER())
						.pipe(API.GULP_DEBUG({
							title: '[smt-copy]',
							minimal: true
						}))
						.pipe(API.GULP_RENAME(function (path) {
							var m = null;
							if (
								(m = path.basename.match(/__(.+?)__/)) &&
								typeof resolvedConfig.variables[m[1]] !== "undefined"
							) {
								path.basename = path.basename.replace(new RegExp(m[0], "g"), resolvedConfig.variables[m[1]]);
							} else
							if (
								(m = (path.basename + path.extname).match(/^__(.+?)__$/)) &&
								typeof resolvedConfig.variables[m[1]] !== "undefined"
							) {
								path.basename = (path.basename + path.extname).replace(new RegExp(m[0], "g"), resolvedConfig.variables[m[1]]);
								path.extname = "";
							}
							if (path.extname === ".tpl") {
								var basename = path.basename.split(".");
								path.extname = "." + basename.pop();
								path.basename = basename.join(".");
							}
							lastPath = path.basename + path.extname;
						}))
						.pipe(API.GULP_REPLACE(/%%[^%]+%%/g, function (matched) {
							var m = matched.match(/^%%([^%]+)%%$/);
							if (
								m &&
								typeof resolvedConfig.variables[m[1]] !== "undefined"
							) {
								return resolvedConfig.variables[m[1]];
							} else {
								API.console.debug("Skip replacing '" + matched + "' in '" + lastPath + "' as variable not found in variables.");
							}
							return matched;
						}))
						.pipe(API.GULP_EDIT(function(newData, callback) {
							var file = this;
							return API.FS.exists(API.PATH.join(toPath, file.relative), function (exists) {
								if (!exists) {
									return callback(null, newData);
								}
								if (!resolvedConfig.onExists) {
									return callback(null, newData);
								}
								var ext = file.relative.split(".").pop();
								if (!resolvedConfig.onExists[ext]) {
									return callback(null, newData);
								}
								if (/\.json$/.test(file.relative)) {
									return API.FS.readFile(API.PATH.join(toPath, file.relative), "utf8", function (err, data) {
										if (err) return callback(err);
										if (resolvedConfig.onExists.json === "skip") {
											return callback(null, data);
										} else
										if (resolvedConfig.onExists.json === "merge") {
											try {
												// What is already existing is more important than what is new.
												newData = JSON.stringify(API.DEEPMERGE(JSON.parse(newData), JSON.parse(data)), null, 4);
											} catch (err) {
												err.message += " (while parsing JSON for '" + file.relative + "')";
												err.stack += "\n(while parsing JSON for '" + file.relative + "')";
												return callback(err);
											}
											return callback(null, newData);
										} else {
											throw new Error("'onExists.json' value of '" + resolvedConfig.onExists.json + "' not supported!");
										}
									});
								} else
								if (/\.md$/.test(file.relative)) {
									return API.FS.readFile(API.PATH.join(toPath, file.relative), "utf8", function (err, data) {
										if (err) return callback(err);
										if (resolvedConfig.onExists.md === "skip") {
											return callback(null, data);
										} else {
											throw new Error("'onExists.md' value of '" + resolvedConfig.onExists.md + "' not supported!");
										}
									});
								} else
								if (/\.js$/.test(file.relative)) {
									return API.FS.readFile(API.PATH.join(toPath, file.relative), "utf8", function (err, data) {
										if (err) return callback(err);
										if (resolvedConfig.onExists.js === "skip") {
											return callback(null, data);
										} else {
											throw new Error("'onExists.js' value of '" + resolvedConfig.onExists.js + "' not supported!");
										}
									});
								} else
								if (
									typeof resolvedConfig.onExists[ext] === "object",
									resolvedConfig.onExists[ext].action === "wrap"
								) {
									return API.FS.readFile(API.PATH.join(toPath, file.relative), "utf8", function (err, data) {
										if (err) return callback(err);
										// Check if we have already wrapped it by comparing the first 3 lines of the file.
										if (
											data.split("\n").slice(0, 3).join("\n") === newData.split("\n").slice(0, 3).join("\n")
										) {
											// Already wrapped.
											newData = data;
										} else {
											newData = newData.replace(new RegExp(API.ESCAPE_REGEXP_COMPONENT(resolvedConfig.onExists[ext].anchor), "g"), data);
										}
										return callback(null, newData);
									});
								}
								var err = new Error("Implement instruction parsing for file: " + file.relative);
								console.error(err.stack);
								return callback(err);
							});
					    }))
//						.pipe(filter.restore())									
						.pipe(destinationStream);

					return stream.once("error", function (err) {
						err.message += " (while running gulp)";
						err.stack += "\n(while running gulp)";
						return callback(err);
					});
				} catch (err) {
					return callback(err);
				}
			});
		}

		return API.Q.denodeify(copy)(resolvedConfig.fromPath, resolvedConfig.toPath);
	}

	return exports;
}

