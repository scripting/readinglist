const fs = require ("fs");
const readinglist = require ("./readinglist.js");

const pathStateFile = "state.json";
const opmlUrl = process.argv [2];

if (opmlUrl === undefined) {
	console.log ("Usage: node demo.js <url-of-reading-list>");
	process.exit (1);
	}

const theManager = new readinglist.readingListManager ({
	isSubscribed: function (feedUrl, callback) {
		callback (false); //this demo has no subscriptions of its own
		},
	subscribe: function (feedUrl, listInfo, callback) {
		console.log ("subscribe: " + feedUrl + ((listInfo.categories === undefined) ? "" : " (" + listInfo.categories + ")"));
		callback ();
		},
	unsubscribe: function (feedUrl, callback) {
		console.log ("unsubscribe: " + feedUrl);
		callback ();
		},
	loadState: function (callback) {
		fs.readFile (pathStateFile, "utf8", function (err, filetext) {
			if (err) { //no file yet -- first run
				callback (undefined, undefined);
				}
			else {
				var theState;
				try {
					theState = JSON.parse (filetext);
					}
				catch (err) {
					callback ({message: "Can't read the saved state because it isn't valid JSON."});
					return;
					}
				callback (undefined, theState);
				}
			});
		},
	saveState: function (theState, callback) {
		fs.writeFile (pathStateFile, JSON.stringify (theState, undefined, "\t"), function (err) {
			callback (err);
			});
		}
	});

theManager.start (function (err) {
	if (err) {
		console.log (err.message);
		}
	else {
		theManager.getLists (function (err, theLists) {
			var flAlreadyFollowing = false;
			theLists.forEach (function (listRec) {
				if (listRec.opmlUrl === opmlUrl) {
					flAlreadyFollowing = true;
					}
				});
			if (flAlreadyFollowing) { //second run and later: just check for changes
				theManager.checkList (opmlUrl, function (err, theChanges) {
					if (err) {
						console.log (err.message);
						}
					else {
						if (theChanges.flUnchanged) {
							console.log ("The list hasn't changed since last time.");
							}
						else {
							console.log (theChanges.adds.length + " added, " + theChanges.removes.length + " removed.");
							}
						}
					});
				}
			else {
				theManager.followList (opmlUrl, function (err, listRec) {
					if (err) {
						console.log (err.message);
						}
					else {
						const theTitle = (listRec.title === undefined) ? opmlUrl : listRec.title;
						console.log ("\nNow following \"" + theTitle + "\" -- " + listRec.feedUrls.length + " feeds.");
						}
					});
				}
			});
		}
	});
