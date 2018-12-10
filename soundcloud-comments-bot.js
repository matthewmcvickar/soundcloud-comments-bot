'use strict';

// Change this to `true` to post to the web
// when you run this script locally.
var canPostFromLocal = false;

// Load libraries.
var _ = require('underscore');
var wordfilter = require('wordfilter');
var SC = require('node-soundcloud');
var Masto = require('mastodon');
var Twit = require('twit');

// Are we on production? Check if an important environment variable exists.
function isProduction () {
  return (
    typeof(process.env.MASTODON_ACCESS_TOKEN) !== 'undefined' &&
    typeof(process.env.TWITTER_CONSUMER_KEY) !== 'undefined'
  );
}

// Use environment variables if we're on production, config files if we're local.
if (isProduction()) {
  var yandexKey = process.env.YANDEX_KEY;

  var twitter = new Twit({
    consumer_key: process.env.TWITTER_CONSUMER_KEY,
    consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
    access_token: process.env.TWITTER_ACCESS_TOKEN,
    access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET
  });

  var mastodon = new Masto({
    access_token: process.env.MASTODON_ACCESS_TOKEN,
    api_url: 'https://botsin.space/api/v1/'
  });

  SC.init({
    id:     process.env.SOUNDCLOUD_CLIENT_ID,
    secret: process.env.SOUNDCLOUD_SECRET
  });
}
else {
  var yandexConfig = require('./config/yandex-config.js'),
      yandexKey    = yandexConfig.key;

  var mastodon = new Masto(require('./config/mastodon-config.js'));
  var twitter  = new Twit(require('./config/twitter-config.js'));

  SC.init(require('./config/soundcloud-config.js'));
}

// Load Yandex Translation API library.
var translate = require('yandex-translate')(yandexKey);

// Execute once upon initialization.
createAndPost();

// The main process. Get a useable comment and post it or try again.
function createAndPost () {

  getComment()
    .then(function (results) {
      post(results);
    })
    .catch(function (error) {
      console.log('ERROR:', error);
      createAndPost();
    });

}

// Get a random comment and see if it's usable.
function getComment () {

  return new Promise (function (resolve, reject) {

    console.log('\n---\n');

    // Pick a random comment. The API doesn't provide for this, but SoundCloud
    // comment IDs are sequential! There are a lot of missing comments (deleted
    // spam, etc.), but this has about a 40-50% success rate at finding an
    // actual comment, which is pretty good!
    var randomCommentID = String(_.random(100000000, 500000000));

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

        console.log('ANALYZING: Checking if English…');

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

function post (thePostToPost) {
  if (typeof(thePostToPost) !== 'undefined') {
    console.log('NOW ATTEMPTING TO POST:', thePostToPost);

    // Twitter.
    if (isProduction() || canPostFromLocal) {
      twitter.post('statuses/update', { status: thePostToPost }, function (error) {
        if (error) {
          console.log('ERROR POSTING:', error);
        }
        else {
          console.log('SUCCESSFULLY POSTED TO TWITTER!');
        }
      });

      // Mastodon.
      mastodon.post('statuses', { status: thePostToPost }, function (error) {
        if (error) {
          console.log('ERROR POSTING:', error);
        }
        else {
          console.log('SUCCESSFULLY POSTED TO MASTODON!');
        }
      });
    }
  }
  else {
    console.log('ERROR: No comment was fetched!');
  }
}

// Post on a regular schedule. 6 times a day means every 4 hours. Note that
// because Heroku cycles dynos once per day, the bot's schedule will not be
// regular: https://devcenter.heroku.com/articles/how-heroku-works#dyno-manager
if (isProduction()) {
  var millisecondsInDay = 1000 * 60 * 60 * 24;
  var timesToPostPerDay = 6;
  var postInterval = millisecondsInDay / timesToPostPerDay;

  setInterval(function () {
    try {
      createAndPost();
    }
    catch (error) {
      console.log('POSTING UNSUCCESSFUL!', error);
    }
  }, postInterval);
}


///


// Additional filters.
wordfilter.addWords([

  // To get a better set of comments, I'm filtering out a lot of things.
  // The lists below are used in addition to the default set:
  // https://github.com/dariusk/wordfilter/blob/master/lib/badwords.json

  // Promotion, spam, link pollution.
  'follow',
  'listen to my',
  'check out',
  'check my',
  'subscribe',
  'channel',
  'my cloud',
  'add me',
  'profile',
  'premiere',
  'promo',
  'app',
  'repost',
  'posted',
  'full support',
  'fully support',

  'soundcloud',
  'facebook',
  'twitter',
  'youtube',
  'instagram',
  'blog',

  'free',
  'download',

  // Traditional spam.
  'sex',
  'cam',
  'dollars',
  'money',
  'fans',
  'plays',
  'get play',
  'get fan',

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
  'rape',
  'raping',
  'gay',
  'nig',
  'igg',
  'icc'

]);
