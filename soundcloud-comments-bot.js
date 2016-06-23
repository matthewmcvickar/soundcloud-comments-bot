"use strict";

// Local tweet test override.
var canTweetFromLocal = false;

// Load libraries.
var _ = require('underscore');
var wordfilter = require('wordfilter');
var languageDetector = require('cld');
var SC = require('node-soundcloud');
var Twit = require('twit');

// Are we on production? Check if an important environment variable exists.
function isProduction () {
  return (typeof(process.env.TWITTER_CONSUMER_KEY) !== 'undefined');
}

// Use environment variables if we're on production, config files if we're local.
if (isProduction()) {
  SC.init({
    id:     process.env.SOUNDCLOUD_CLIENT_ID,
    secret: process.env.SOUNDCLOUD_SECRET
  });

  var twitter = new Twit({
    consumer_key: process.env.TWITTER_CONSUMER_KEY,
    consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
    access_token: process.env.TWITTER_ACCESS_TOKEN,
    access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET
  });
}
else {
  SC.init(require('./soundcloud-config.js'));
  var twitter = new Twit(require('./twitter-config.js'));
}

// Get a handful of comments and choose one.
function makeAndPostTweet () {
  getRandomComment().then(function (results) {
    postTweet(results);
  }).catch(function (err) {
    console.log('ERROR:', err);
    makeAndPostTweet();
  });
}

// Pick a random comment. The API doesn't provide for this, but SoundCloud
// comment IDs are sequential! There are a lot of missing comments (deleted
// spam, etc.), but this has about a 40-50% success rate at finding an actual
// comment, which is pretty good!
function getRandomCommentID () {
  return String(_.random(100000000, 300000000));
}

function getRandomComment () {

  return new Promise (function (resolve, reject) {

    console.log('\n---\n');

    SC.get('/comments/' + getRandomCommentID(), function(err, comment) {
      // console.log('\n\nFULL RESPONSE:\n\n', comment)

      if (typeof(err) !== 'undefined') {
        reject('Comment does not exist.');
      }
      else {
        var comment = comment.body.trim();

        console.log('FOUND A COMMENT:', comment);

        if (comment.length < 1) {
          reject('Comment is too short.');
          return;
        }

        if (comment.length > 141) {
          reject('Comment is too long');
          return;
        }

        if (!isEnglish(comment)) {
          reject('Comment is not in English.');
          return;
        }

        if (wordfilter.blacklisted(comment)) {
          reject('Comment is a reply, contains a bad word, or looks like spam.');
          return;
        }

        console.log('COMMENT IS USEABLE!');

        resolve(comment);
      }

    });

  });

}


function postTweet (tweet) {

  console.log('TWEET:', tweet);

  if (isProduction() || canTweetFromLocal) {
    twitter.post('statuses/update', { status: tweet }, function (error) {
      if (error) {
        console.log('ERROR POSTING TWEET:', error);
      }
    });
  }

}

// Tweet on a regular schedule. 8 times a day means every 3 hours. Note that
// Because Heroku cycles dynos once per day, the bot's schedule will not be
// regular: https://devcenter.heroku.com/articles/how-heroku-works#dyno-manager
if (isProduction()) {
  var timesToTweetPerDay = 8;

  setInterval(function () {
    try {
      postTweet();
    }
    catch (err) {
      console.log('PROCESS UNSUCCESSFUL!', err);
    }
  }, (1000 * 60 * 60 * 24) / timesToTweetPerDay);
}

// Go!
makeAndPostTweet();


///


// Is this English?
function isEnglish (string) {

  var options = {
    isHTML       : false,
    encodingHint : 'UTF8UTF8',
    tldHint      : 'com'
  };

  return languageDetector.detect(string, options, function(err, result) {

    if (!_.isEmpty(err)) {
      console.log('LANGUAGE DETECTION ERROR:', err.message);

      // If the language couldn't be detected, just show the tweet. Most of the
      // time this means it's slang or internet-speak and is fine to print.
      if (err.message === 'Failed to identify language') {
        console.log('LANGUAGE DETECTION OVERRIDE: Approving as English anyway, just for kicks.');

        return true;
      }
    }
    else {
      return (result.languages[0].name === 'ENGLISH');
    }

  });

}

// Additional filters.
wordfilter.addWords([

  // To get a better set of comments, I'm filtering out a lot of things.
  // The lists below are used in addition to the default set:
  // https://github.com/dariusk/wordfilter/blob/master/lib/badwords.json

  // Spam.
  'follow',
  'listen to my',
  'check out',
  'check my',
  'subscribe',
  'channel',
  'my cloud',

  'facebook',
  'soundcloud',
  'youtube',
  'instagram',
  'blog',

  'http',
  'www',
  '.co',
  '.net',

  'sex',
  'cam',
  'dollars',

  'free',
  'download',
  'DL',

  // Replies, SoundCloud links, tags, etc.
  'user-',
  '\@',
  '\n',
  '_',
  '#',

  // A few curses.
  'fuck'

]);
