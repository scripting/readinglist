# readinglist

A node package that manages OPML reading lists for a feed reader. 

### What is a reading list?

It's an OPML subscription list that a feed reader app subscribes to. When a new item shows up in the list, the feed reader subscribes to it. When one is removed, the subscription is removed. 

### The app and this package

If your app uses this package, this is how the two connect.

1. The app owns its subscriptions, storage and screens. 

2. This package owns the lists: it reads a reading list, remembers what the list said last time, diffs, and tells the app what changed through two callbacks.

3. The rule the package enforces: a feed the user subscribed to personally is never removed because a list dropped it, and a feed two lists both carry survives until the last list lets go.

### Demo

<a href="https://github.com/scripting/readinglist/blob/main/code/demo.js">demo.js</a> is a tiny reader app built on readinglist.js. 

It "subscribes" by printing to the console, and keeps its state in state.json in this folder, so you can run it twice and watch the second run find only what changed.

This is how you launch it, it requires an OPML file to watch

`node demo.js "https://feedland.social/opml?screenname=davewiner&catname=blogroll"`

### What's in the misc folder?

<a href="https://github.com/scripting/readinglist/blob/main/misc/test.js">test.js</a> is an app we use to be sure that it hasn't broken, we left it in because why not? It's in the misc folder.

<a href="https://github.com/scripting/readinglist/blob/main/misc/agentbriefing.md">agentbriefing.md</a> are a set of notes written by Claude Code to provide background to an AI agent to get them up to speed on working with the readinglist package.

