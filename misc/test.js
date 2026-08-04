/*  Tests for readinglist.js. 7/31/26 by CC

	A little http server plays the role of the web, serving OPML we control
	and honoring etags. A fake reader app records every subscribe and
	unsubscribe. Then we walk the contract, rule by rule.
	
	Run it: node test.js -- it prints one line per test and a total.  */

const http = require ("http");
const readinglist = require ("../readinglist.js");

const testPort = 1799;
const urlServer = "http://localhost:" + testPort + "/";

var ctTests = 0, ctFailures = 0;
function assert (flCondition, theMessage) {
	ctTests++;
	if (flCondition) {
		console.log ("ok -- " + theMessage);
		}
	else {
		ctFailures++;
		console.log ("FAILED -- " + theMessage);
		}
	}

//the pretend web: a table of OPML files, each with a version number that becomes its etag
	const theWebFiles = {};
	function setWebFile (theName, opmltext) {
		if (theWebFiles [theName] === undefined) {
			theWebFiles [theName] = {version: 0};
			}
		theWebFiles [theName].opmltext = opmltext;
		theWebFiles [theName].version++;
		}
	const theServer = http.createServer (function (theRequest, theResponse) {
		const theName = theRequest.url.substring (1);
		const theFile = theWebFiles [theName];
		if (theFile === undefined) {
			theResponse.writeHead (404, {"Content-Type": "text/plain"});
			theResponse.end ("Not found.");
			}
		else {
			const theEtag = "\"v" + theFile.version + "\"";
			if (theRequest.headers ["if-none-match"] === theEtag) {
				theResponse.writeHead (304);
				theResponse.end ();
				}
			else {
				theResponse.writeHead (200, {"Content-Type": "text/xml", "ETag": theEtag});
				theResponse.end (theFile.opmltext);
				}
			}
		});

function opmlForFeeds (theTitle, theFeeds) { //build a reading list; a feed can be a string or {feedUrl, category, flComment}
	var itemtext = "";
	theFeeds.forEach (function (theFeed) {
		if (typeof (theFeed) === "string") {
			theFeed = {feedUrl: theFeed};
			}
		var atts = "type=\"rss\" text=\"" + theFeed.feedUrl + "\" xmlUrl=\"" + theFeed.feedUrl + "\"";
		if (theFeed.category !== undefined) {
			atts += " category=\"" + theFeed.category + "\"";
			}
		if (theFeed.flComment) {
			atts += " isComment=\"true\"";
			}
		itemtext += "\t\t<outline " + atts + "/>\n";
		});
	var headtext = "";
	if (theTitle !== undefined) {
		headtext = "\t<head>\n\t\t<title>" + theTitle + "</title>\n\t\t<description>A list for testing.</description>\n\t\t</head>\n";
		}
	return ("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<opml version=\"2.0\">\n" + headtext + "\t<body>\n" + itemtext + "\t\t</body>\n\t</opml>\n");
	}

//the pretend reader app
	var theApp; //assigned by newApp
	function newApp () {
		theApp = {
			subscriptions: {}, //feedUrl: the listInfo that came with the subscribe call
			personalFeeds: {}, //feeds the user subscribed to on their own
			log: []
			};
		}
	function appCallbacks () {
		return ({
			isSubscribed: function (feedUrl, callback) {
				callback ((theApp.subscriptions [feedUrl] !== undefined) || (theApp.personalFeeds [feedUrl] !== undefined));
				},
			subscribe: function (feedUrl, listInfo, callback) {
				theApp.subscriptions [feedUrl] = listInfo;
				theApp.log.push ("subscribe " + feedUrl);
				callback ();
				},
			unsubscribe: function (feedUrl, callback) {
				delete theApp.subscriptions [feedUrl];
				theApp.log.push ("unsubscribe " + feedUrl);
				callback ();
				},
			loadState: function (callback) {
				callback (undefined, theApp.savedState);
				},
			saveState: function (theState, callback) {
				theApp.savedState = JSON.parse (JSON.stringify (theState)); //what a file or database would hold
				callback ();
				}
			});
		}
	function ctSubscriptions () {
		return (Object.keys (theApp.subscriptions).length);
		}
	function ctLogLines (theText) { //how many times the app heard exactly this
		var ct = 0;
		theApp.log.forEach (function (theLine) {
			if (theLine === theText) {
				ct++;
				}
			});
		return (ct);
		}

theServer.listen (testPort, function () {
	setWebFile ("listA.opml", opmlForFeeds ("List A", [
		{feedUrl: "http://feeds.example/one.xml", category: "tech"},
		"http://feeds.example/two.xml",
		"http://feeds.example/three.xml",
		{feedUrl: "http://feeds.example/hidden.xml", flComment: true}
		]));
	setWebFile ("listB.opml", opmlForFeeds ("List B", [
		"http://feeds.example/three.xml",
		"http://feeds.example/five.xml"
		]));
	setWebFile ("headless.opml", opmlForFeeds (undefined, [
		"http://feeds.example/six.xml"
		]));
	setWebFile ("broken.opml", "this is not opml at all <><");
	
	newApp ();
	theApp.personalFeeds ["http://feeds.example/two.xml"] = true; //the user's own, from before any list
	
	const theManager = new readinglist.readingListManager (appCallbacks ());
	
	theManager.start (function (err) {
		assert (err === undefined, "the manager starts with no saved state");
		
		theManager.followList (urlServer + "listA.opml", function (err, listRec) {
			assert (err === undefined, "following list A works");
			assert (listRec.title === "List A", "the list's title came from the OPML head");
			assert (listRec.feedUrls.length === 3, "the comment node stayed invisible -- 3 feeds, not 4");
			assert (theApp.subscriptions ["http://feeds.example/one.xml"] !== undefined, "feed one was subscribed");
			assert (theApp.subscriptions ["http://feeds.example/one.xml"].categories === "tech", "the category rode along with the subscribe call");
			assert (theApp.subscriptions ["http://feeds.example/two.xml"] === undefined, "feed two was NOT subscribed -- the user already had it personally");
			assert (ctSubscriptions () === 2, "exactly two subscribe calls for list A");
			
			theManager.followList (urlServer + "listA.opml", function (err, listRec) {
				assert ((err === undefined) && (ctSubscriptions () === 2), "following the same list again changes nothing");
				
				theManager.followList (urlServer + "listB.opml", function (err, listRec) {
					assert (err === undefined, "following list B works");
					assert (theApp.subscriptions ["http://feeds.example/five.xml"] !== undefined, "feed five was subscribed");
					assert (ctLogLines ("subscribe http://feeds.example/three.xml") === 1, "feed three was subscribed once, not twice -- list A already carried it");
					
					theManager.checkList (urlServer + "listA.opml", function (err, theChanges) {
						assert ((err === undefined) && (theChanges.flUnchanged === true), "an unchanged list answers 304 and nothing happens");
						
						//list A changes: drops one, two and three, adds four
							setWebFile ("listA.opml", opmlForFeeds ("List A", [
								"http://feeds.example/four.xml"
								]));
						theManager.checkList (urlServer + "listA.opml", function (err, theChanges) {
							assert (err === undefined, "checking the changed list works");
							assert ((theChanges.adds.length === 1) && (theChanges.adds [0] === "http://feeds.example/four.xml"), "the added feed was reported");
							assert (theApp.subscriptions ["http://feeds.example/four.xml"] !== undefined, "the added feed was subscribed");
							assert (theApp.subscriptions ["http://feeds.example/one.xml"] === undefined, "the dropped feed was unsubscribed");
							assert (theApp.personalFeeds ["http://feeds.example/two.xml"] !== undefined, "THE RULE: the user's personal feed survived being dropped from the list");
							assert (ctLogLines ("unsubscribe http://feeds.example/two.xml") === 0, "no unsubscribe call ever fired for the personal feed");
							assert (theApp.subscriptions ["http://feeds.example/three.xml"] !== undefined, "THE RULE: feed three survived -- list B still carries it");
							
							theManager.unfollowList (urlServer + "listB.opml", function (err) {
								assert (err === undefined, "unfollowing list B works");
								assert (theApp.subscriptions ["http://feeds.example/three.xml"] === undefined, "feed three went when its last list let go");
								assert (theApp.subscriptions ["http://feeds.example/five.xml"] === undefined, "feed five went with list B");
								assert (theApp.subscriptions ["http://feeds.example/four.xml"] !== undefined, "list A's feed stayed");
								
								theManager.followList (urlServer + "headless.opml", function (err, listRec) {
									assert (err === undefined, "a list with no head section still works");
									assert (listRec.title === undefined, "its title is honestly undefined");
									
									theManager.followList (urlServer + "broken.opml", function (err) {
										assert (err !== undefined, "a file that isn't OPML answers with an error, not a crash");
										assert (err.message.indexOf ("Can't") === 0, "the error message says what couldn't be done");
										
										theManager.followList ("http://localhost:1/nothing.opml", function (err) {
											assert (err !== undefined, "an unreachable address answers with an error");
											
											theManager.followList ("not a url at all", function (err) {
												assert (err !== undefined, "a non-url answers with an error");
												
												//a brand new manager instance picks up the saved state, like an app relaunching
													const secondManager = new readinglist.readingListManager (appCallbacks ());
													secondManager.start (function (err) {
														secondManager.getLists (function (err, theLists) {
															assert (theLists.length === 2, "a fresh instance loads the saved state -- still following 2 lists");
															setWebFile ("listA.opml", opmlForFeeds ("List A", [
																"http://feeds.example/four.xml",
																"http://feeds.example/seven.xml"
																]));
															secondManager.checkLists (function (err, theReports) {
																assert (err === undefined, "checkLists sweeps every followed list");
																assert (theApp.subscriptions ["http://feeds.example/seven.xml"] !== undefined, "the relaunched app still tracks the list -- new feed subscribed");
																var theReport;
																theReports.forEach (function (item) {
																	if (item.opmlUrl === urlServer + "listA.opml") {
																		theReport = item;
																		}
																	});
																assert ((theReport !== undefined) && (theReport.adds.length === 1), "the sweep reported the change per-list");
																
																console.log ("\n" + ctTests + " tests, " + (ctTests - ctFailures) + " passed, " + ctFailures + " failed.");
																theServer.close ();
																process.exit ((ctFailures === 0) ? 0 : 1);
																});
															});
														});
												});
											});
										});
									});
								});
							});
						});
					});
				});
			});
		});
	});
