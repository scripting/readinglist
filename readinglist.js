const myVersion = "0.4.1", myProductName = "readinglist"; 

exports.readingListManager = readingListManager;

const https = require ("https");
const http = require ("http");
const opml = require ("opml");

function readingListManager (userOptions) {
	var options = {
		isSubscribed: function (feedUrl, callback) { //asks the app: already subscribed? callback (flSubscribed)
			callback (false);
			},
		subscribe: function (feedUrl, listInfo, callback) { //the app makes the subscription. callback (err)
			callback ();
			},
		unsubscribe: function (feedUrl, callback) { //the app removes it. callback (err)
			callback ();
			},
		loadState: function (callback) { //callback (err, theState) -- undefined the first time ever
			callback (undefined, undefined);
			},
		saveState: function (theState, callback) { //theState is a plain object, safe to stringify
			callback ();
			},
		userAgent: "readinglist for node"
		};
	for (var x in userOptions) {
		options [x] = userOptions [x];
		}
	
	var theState; //assigned by start -- {lists: {opmlUrl: listRec}, personalFeeds: {feedUrl: true}}
	
	function readUrl (theUrl, condGetInfo, callback) { //callback (err, {flNotModified} or {filetext, etag, lastModified})
		var theParsed;
		try {
			theParsed = new URL (theUrl);
			}
		catch (err) {
			const message = "Can't read " + theUrl + " because it isn't a valid address.";
			callback ({message});
			return;
			}
		const theProtocol = (theParsed.protocol === "http:") ? http : https;
		const theHeaders = {
			"User-Agent": options.userAgent
			};
		if (condGetInfo.etag !== undefined) {
			theHeaders ["If-None-Match"] = condGetInfo.etag;
			}
		if (condGetInfo.lastModified !== undefined) {
			theHeaders ["If-Modified-Since"] = condGetInfo.lastModified;
			}
		const theRequest = theProtocol.get (theUrl, {headers: theHeaders}, function (theResponse) {
			if (theResponse.statusCode === 304) { //the list hasn't changed since last time
				theResponse.resume ();
				callback (undefined, {flNotModified: true});
				}
			else {
				if ((theResponse.statusCode >= 301) && (theResponse.statusCode <= 308)) { //follow a redirect
					theResponse.resume ();
					const theLocation = theResponse.headers.location;
					if ((theLocation === undefined) || (condGetInfo.ctRedirects >= 5)) {
						const message = "Can't read " + theUrl + " because the redirect couldn't be followed.";
						callback ({message});
						}
					else {
						const nextCondGetInfo = {
							etag: condGetInfo.etag,
							lastModified: condGetInfo.lastModified,
							ctRedirects: (condGetInfo.ctRedirects === undefined) ? 1 : condGetInfo.ctRedirects + 1
							};
						readUrl (new URL (theLocation, theUrl).toString (), nextCondGetInfo, callback);
						}
					}
				else {
					if (theResponse.statusCode !== 200) {
						theResponse.resume ();
						const message = "Can't read " + theUrl + " because the server answered with a " + theResponse.statusCode + ".";
						callback ({message});
						}
					else {
						var filetext = "";
						theResponse.setEncoding ("utf8");
						theResponse.on ("data", function (theChunk) {
							filetext += theChunk;
							});
						theResponse.on ("end", function () {
							callback (undefined, {
								filetext,
								etag: theResponse.headers ["etag"],
								lastModified: theResponse.headers ["last-modified"]
								});
							});
						}
					}
				}
			});
		theRequest.on ("error", function (err) {
			const message = "Can't read " + theUrl + " because " + err.message + ".";
			callback ({message});
			});
		}
	
	function isComment (theNode) { //comment nodes and everything under them are invisible
		return ((theNode.isComment === "true") || (theNode.isComment === true));
		}
	function readList (opmlUrl, condGetInfo, callback) { //callback (err, {flNotModified} or {title, description, feeds, etag, lastModified})
		readUrl (opmlUrl, condGetInfo, function (err, theResult) {
			if (err) {
				callback (err);
				}
			else {
				if (theResult.flNotModified) {
					callback (undefined, theResult);
					}
				else {
					opml.parse (theResult.filetext, function (err, theOutline) {
						if (err) {
							const message = "Can't understand the list at " + opmlUrl + " because it isn't valid OPML.";
							callback ({message});
							}
						else {
							var title, description;
							if (theOutline.opml.head !== undefined) { //a list with no head section is still a list
								title = theOutline.opml.head.title;
								description = theOutline.opml.head.description;
								}
							const theFeeds = [];
							opml.visitAll (theOutline, function (theNode) {
								if (!isComment (theNode)) {
									if (theNode.type === "rss") {
										if (theNode.xmlUrl !== undefined) {
											theFeeds.push ({
												feedUrl: theNode.xmlUrl,
												text: theNode.text,
												htmlUrl: theNode.htmlUrl,
												categories: theNode.category
												});
											}
										}
									}
								return (true); //keep visiting
								});
							callback (undefined, {
								title, description,
								feeds: theFeeds,
								etag: theResult.etag,
								lastModified: theResult.lastModified
								});
							}
						});
					}
				}
			});
		}
	
	function ctOtherProviders (feedUrl, opmlUrlToSkip) { //how many OTHER followed lists carry this feed
		var ct = 0;
		Object.keys (theState.lists).forEach (function (theListUrl) {
			if (theListUrl !== opmlUrlToSkip) {
				theState.lists [theListUrl].feedUrls.forEach (function (theFeedUrl) {
					if (theFeedUrl === feedUrl) {
						ct++;
						}
					});
				}
			});
		return (ct);
		}
	function saveTheState (callback) {
		options.saveState (theState, function (err) {
			callback (err);
			});
		}
	
	function subscribeOnBehalfOfList (theFeeds, opmlUrl, callback) { //callback (err, ctSubscribed)
	
		/*  One feed at a time, in the order the list gives them. A feed
			another followed list already carries needs nothing. A feed the
			user already subscribes to personally is remembered as personal,
			so the list never owns it. Everything else gets subscribed.  */
		
		var ctSubscribed = 0;
		function doNextFeed (ix) {
			if (ix < theFeeds.length) {
				const theFeed = theFeeds [ix];
				if (ctOtherProviders (theFeed.feedUrl, opmlUrl) > 0) {
					doNextFeed (ix + 1);
					}
				else {
					options.isSubscribed (theFeed.feedUrl, function (flSubscribed) {
						if (flSubscribed) {
							theState.personalFeeds [theFeed.feedUrl] = true;
							doNextFeed (ix + 1);
							}
						else {
							const listInfo = {
								listUrl: opmlUrl,
								text: theFeed.text,
								htmlUrl: theFeed.htmlUrl,
								categories: theFeed.categories
								};
							options.subscribe (theFeed.feedUrl, listInfo, function (err) {
								if (err === undefined) {
									ctSubscribed++;
									}
								doNextFeed (ix + 1); //one feed failing doesn't stop the list
								});
							}
						});
					}
				}
			else {
				callback (undefined, ctSubscribed);
				}
			}
		doNextFeed (0);
		}
	function unsubscribeOnBehalfOfList (theFeedUrls, opmlUrl, callback) { //callback (err, ctUnsubscribed)
	
		/*  The provenance rule lives here: a feed survives if another
			followed list still carries it, or if it was the user's own
			before any list brought it around.  */
		
		var ctUnsubscribed = 0;
		function doNextFeed (ix) {
			if (ix < theFeedUrls.length) {
				const theFeedUrl = theFeedUrls [ix];
				if (ctOtherProviders (theFeedUrl, opmlUrl) > 0) {
					doNextFeed (ix + 1);
					}
				else {
					if (theState.personalFeeds [theFeedUrl]) {
						delete theState.personalFeeds [theFeedUrl]; //no list involves it anymore -- it's simply the user's
						doNextFeed (ix + 1);
						}
					else {
						options.unsubscribe (theFeedUrl, function (err) {
							if (err === undefined) {
								ctUnsubscribed++;
								}
							doNextFeed (ix + 1);
							});
						}
					}
				}
			else {
				callback (undefined, ctUnsubscribed);
				}
			}
		doNextFeed (0);
		}
	
	function start (callback) { //read the saved state before anything else runs. callback (err)
		options.loadState (function (err, savedState) {
			if (err) {
				callback (err);
				}
			else {
				if (savedState === undefined) {
					theState = {
						lists: {},
						personalFeeds: {}
						};
					}
				else {
					theState = savedState;
					}
				callback ();
				}
			});
		}
	function followList (opmlUrl, callback) { //callback (err, listRec)
		if (theState.lists [opmlUrl] !== undefined) { //already following -- nothing to do
			callback (undefined, theState.lists [opmlUrl]);
			}
		else {
			readList (opmlUrl, {}, function (err, theList) {
				if (err) {
					callback (err);
					}
				else {
					subscribeOnBehalfOfList (theList.feeds, opmlUrl, function (err, ctSubscribed) {
						const theFeedUrls = [];
						theList.feeds.forEach (function (theFeed) {
							theFeedUrls.push (theFeed.feedUrl);
							});
						const listRec = {
							opmlUrl,
							title: theList.title,
							description: theList.description,
							feedUrls: theFeedUrls,
							whenFollowed: new Date ().toISOString (),
							whenChecked: new Date ().toISOString (),
							etag: theList.etag,
							lastModified: theList.lastModified
							};
						theState.lists [opmlUrl] = listRec;
						saveTheState (function (err) {
							callback (err, listRec);
							});
						});
					}
				});
			}
		}
	function unfollowList (opmlUrl, callback) { //callback (err)
		const listRec = theState.lists [opmlUrl];
		if (listRec === undefined) {
			const message = "Can't unfollow " + opmlUrl + " because you're not following it.";
			callback ({message});
			}
		else {
			delete theState.lists [opmlUrl]; //out of the state first, so the provenance counts don't see it
			unsubscribeOnBehalfOfList (listRec.feedUrls, opmlUrl, function (err, ctUnsubscribed) {
				saveTheState (function (err) {
					callback (err);
					});
				});
			}
		}
	function checkList (opmlUrl, callback) { //callback (err, {flUnchanged, adds, removes})
		const listRec = theState.lists [opmlUrl];
		if (listRec === undefined) {
			const message = "Can't check " + opmlUrl + " because you're not following it.";
			callback ({message});
			}
		else {
			const condGetInfo = {
				etag: listRec.etag,
				lastModified: listRec.lastModified
				};
			readList (opmlUrl, condGetInfo, function (err, theList) {
				if (err) {
					callback (err); //an unreachable list changes nothing -- can't reach isn't the same as isn't there
					}
				else {
					if (theList.flNotModified) {
						listRec.whenChecked = new Date ().toISOString ();
						saveTheState (function (err) {
							callback (err, {flUnchanged: true, adds: [], removes: []});
							});
						}
					else {
						const oldFeedUrls = listRec.feedUrls;
						const newFeedUrls = [];
						theList.feeds.forEach (function (theFeed) {
							newFeedUrls.push (theFeed.feedUrl);
							});
						
						function isInArray (theValue, theArray) {
							var flFound = false;
							theArray.forEach (function (theItem) {
								if (theItem === theValue) {
									flFound = true;
									}
								});
							return (flFound);
							}
						const addedFeeds = [], removedFeedUrls = [];
						theList.feeds.forEach (function (theFeed) {
							if (!isInArray (theFeed.feedUrl, oldFeedUrls)) {
								addedFeeds.push (theFeed);
								}
							});
						oldFeedUrls.forEach (function (theFeedUrl) {
							if (!isInArray (theFeedUrl, newFeedUrls)) {
								removedFeedUrls.push (theFeedUrl);
								}
							});
						
						listRec.feedUrls = newFeedUrls; //the new truth, before the callbacks run
						listRec.title = theList.title;
						listRec.description = theList.description;
						listRec.etag = theList.etag;
						listRec.lastModified = theList.lastModified;
						listRec.whenChecked = new Date ().toISOString ();
						
						subscribeOnBehalfOfList (addedFeeds, opmlUrl, function (err, ctSubscribed) {
							unsubscribeOnBehalfOfList (removedFeedUrls, opmlUrl, function (err, ctUnsubscribed) {
								saveTheState (function (err) {
									const addedFeedUrls = [];
									addedFeeds.forEach (function (theFeed) {
										addedFeedUrls.push (theFeed.feedUrl);
										});
									callback (err, {flUnchanged: false, adds: addedFeedUrls, removes: removedFeedUrls});
									});
								});
							});
						}
					}
				});
			}
		}
	function checkLists (callback) { //every followed list, one at a time. callback (err, reports)
		const theListUrls = Object.keys (theState.lists);
		const theReports = [];
		function doNextList (ix) {
			if (ix < theListUrls.length) {
				const opmlUrl = theListUrls [ix];
				checkList (opmlUrl, function (err, theChanges) {
					if (err) {
						theReports.push ({opmlUrl, error: err.message});
						}
					else {
						theReports.push ({opmlUrl, adds: theChanges.adds, removes: theChanges.removes, flUnchanged: theChanges.flUnchanged});
						}
					doNextList (ix + 1); //one list failing doesn't stop the others
					});
				}
			else {
				callback (undefined, theReports);
				}
			}
		doNextList (0);
		}
	function getLists (callback) { //callback (err, array of listRecs)
		const theLists = [];
		Object.keys (theState.lists).forEach (function (opmlUrl) {
			theLists.push (theState.lists [opmlUrl]);
			});
		callback (undefined, theLists);
		}
	
	this.start = start;
	this.followList = followList;
	this.unfollowList = unfollowList;
	this.checkList = checkList;
	this.checkLists = checkLists;
	this.getLists = getLists;
	}
