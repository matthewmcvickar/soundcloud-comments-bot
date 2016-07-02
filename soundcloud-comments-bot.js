"use strict";

// Local tweet test override.
var canTweetFromLocal = false;

// Load libraries.
var _ = require('underscore');
var wordfilter = require('wordfilter');
var SC = require('node-soundcloud');
var Twit = require('twit');

// Are we on production? Check if an important environment variable exists.
function isProduction () {
  return (typeof(process.env.TWITTER_CONSUMER_KEY) !== 'undefined');
}

// Use environment variables if we're on production, config files if we're local.
if (isProduction()) {
  var yandexKey = process.env.YANDEX_KEY;

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
  var yandexConfig = require('./config/yandex-config.js'),
      yandexKey    = yandexConfig.key;

  var twitter = new Twit(require('./config/twitter-config.js'));

  SC.init(require('./config/soundcloud-config.js'));
}

// Load Yandex Translation API library.
var translate = require('yandex-translate')(yandexKey);

// Execute once upon initialization.
makeAndPostTweet();

// Get a handful of comments and choose one.
function makeAndPostTweet () {
  getComment()
    .then(function (results) {
      postTweet(results);
    })
    .catch(function (error) {
      console.log('ERROR:', error);
      makeAndPostTweet();
    });
}

function getComment () {

  return new Promise (function (resolve, reject) {

    console.log('\n---\n');

    // Pick a random comment. The API doesn't provide for this, but SoundCloud
    // comment IDs are sequential! There are a lot of missing comments (deleted
    // spam, etc.), but this has about a 40-50% success rate at finding an
    // actual comment, which is pretty good!
    var randomCommentID = String(_.random(100000000, 300000000));

    // Query the SoundCloud API and filter the results.
    SC.get('/comments/' + randomCommentID, function(error, comment) {

      // console.log('\n\nFULL API RESPONSE:\n\n', comment)

      console.log('LOOKING FOR A COMMENT AT ID #' + randomCommentID + '…');

      if (typeof(error) !== 'undefined') {
        reject('Comment does not exist at this ID anymore.');
      }
      else {
        var comment = comment.body.trim();

        console.log('FOUND A COMMENT:', comment);

        console.log('ANALYZING: Checking if too short…');

        if (comment.length < 1) {
          reject('Comment is too short.');
          return;
        }

        console.log('\tOK!');

        console.log('ANALYZING: Checking if too long…');

        if (comment.length > 141) {
          reject('Comment is too long');
          return;
        }

        console.log('\tOK!');

        console.log('ANALYZING: Checking for bad words…');

        if (wordfilter.blacklisted(comment)) {
          reject('Comment is a reply, contains a bad word, or looks like spam.');
          return;
        }

        console.log('\tOK!');

        console.log('ANALYZING: Checking if is English…');

        translate.detect(comment, function (error, result) {
          if (result.lang === 'en') {
            console.log('\tOK!');

            console.log('SUCCESS: All checks passed! Comment is useable!');

            resolve(comment);
          }
          else if (typeof(error) !== 'undefined') {
            reject(error);
          }
          else {
            reject('Comment is not in English.')
          }
        })

      }

    });
  });
}

function postTweet (tweet) {

  if (typeof(tweet) !== 'undefined') {
    console.log('NOW TWEETING:', tweet);

    if (isProduction() || canTweetFromLocal) {
      twitter.post('statuses/update', { status: tweet }, function (error) {
        if (error) {
          console.log('ERROR POSTING TWEET:', error);
        }
      });
    }
  }
  else {
    console.log('ERROR: No comment was fetched!');
  }

}

// Tweet on a regular schedule. 8 times a day means every 3 hours. Note that
// Because Heroku cycles dynos once per day, the bot's schedule will not be
// regular: https://devcenter.heroku.com/articles/how-heroku-works#dyno-manager
if (isProduction()) {
  var timesToTweetPerDay = 8;

  setInterval(function () {
    try {
      makeAndPostTweet();
    }
    catch (error) {
      console.log('PROCESS UNSUCCESSFUL!', error);
    }
  }, (1000 * 60 * 60 * 24) / timesToTweetPerDay);
}


///


// Additional filters.
wordfilter.addWords([

  // To get a better set of comments, I'm filtering out a lot of things.
  // The lists below are used in addition to the default set:
  // https://github.com/dariusk/wordfilter/blob/master/lib/badwords.json

  // Promotion.
  'follow',
  'listen to my',
  'check out',
  'check my',
  'subscribe',
  'channel',
  'my cloud',
  'add me',

  'soundcloud',
  'facebook',
  'twitter',
  'youtube',
  'instagram',
  'blog',

  'free',
  'download',

  // Fake comments.
  'repost',
  'posted',
  'full support',
  'fully support',

  // Traditional spam.
  'sex',
  'cam',
  'dollars',
  'money',

  // URLs.
  'http',
  'www',
  '.co',
  '.net',

  // Replies, SoundCloud links, tags, etc.
  'user-',
  '\@',
  '\n',
  '_',
  '#',

  // A few curses and bad words.
  'fuck',
  'rape'

]);
