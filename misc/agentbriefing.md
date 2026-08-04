# Briefing for agents

If you're an AI agent helping someone use or change this package, this file is for you -- whatever you're called, you're welcome here. The readme says what the package is and demo.js shows it working. This file holds what the code can't tell you: the state of the work and the decisions behind it.

### The state of things, August 2, 2026

The package began as an example in the rss.chat repo and moved here August 2, 2026, because reading lists belong to the FeedLand side of this family of products. The name readinglist is unclaimed on npm; it hasn't been published there yet. The current version is 0.4.1. The demo is being offered quietly to friends to see what questions they ask and whether they get it working.

### How the pieces sit

The package and the demo live at the top level of the repo. The tests live in misc/ -- after any change to readinglist.js, run test.js from inside the misc folder; all 34 checks should pass. Run npm install at the top level first so the one dependency, the opml package, is present.

The files in this repo are rendered from an outline the maintainer edits -- the source of truth is not here. If you change a file directly, propose the change through an issue or pull request rather than assuming an edit will stick; the next build regenerates the files from the outline.

### Rules to preserve

1. The survival rule, item 3 in the readme, is the heart of the package. test.js checks both halves of it. Whatever you change, don't break it.

2. The code style is deliberate and consistent: callbacks rather than promises, error objects with a message property rather than bare strings, forEach rather than map or filter, tabs for indentation, a space before call parentheses. Match it.

3. Never document anything twice. If the demo, the readme or a comment in the code already says it, point there instead of restating.

