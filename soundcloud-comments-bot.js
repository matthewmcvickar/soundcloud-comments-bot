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
function createAndPost() {

  getTrack()
    .then((trackID) => {
      return getComment(trackID)
    })
    .then((comment) => {
      post(comment);
    })
    .catch(function (error) {
      console.log('ERROR:', error);

      // That track had no comments or no good comments, so run it again.
      createAndPost();
    });

}

// Get a random track and see if it has comments.
function getTrack() {
  return new Promise (function (resolve, reject) {

    // DEBUG: Test a track we know has two comments:
    // resolve(249409061);

    console.log('\n---\n');

    // Pick a random track. The API doesn't provide for this, but SoundCloud
    // track IDs are sequential! There are a lot of missing tracks (deleted,
    // private, etc.), but this has a decent success rate.
    var randomTrackID = String(_.random(0, 784514266));

    // Query the SoundCloud API and filter the results.
    SC.get('/tracks/' + randomTrackID, function(error, track) {

      console.log('LOOKING FOR A TRACK AT ID #' + randomTrackID + '…');

      // console.log('\n\nFULL API RESPONSE:\n\n', track)

      if (typeof(error) !== 'undefined') {
        reject('Track does not exist at this ID anymore.');
      }
      else {
        if (track.comment_count > 0) {
          console.log('\tOK! Track has comments! Comment count: ' + track.comment_count);

          resolve(track.id);
        }
        else {
          reject('Track has no comments.');
        }
      }
    });

  });

}

// Get a random comment and see if it's usable.
function getComment(trackID) {

  console.log('\n---\n');

  return new Promise(function (resolve, reject) {

    // Get all of the comments for this track.
    SC.get('/tracks/' + trackID + '/comments', async function(error, comments) {

      console.log('CHECKING COMMENTS FOR TRACK ID #' + trackID + '…');

      if (typeof(error) !== 'undefined') {
        reject('Failure fetching comments for this track.')
      }
      else {
        // Check all comments and only keep the useable ones.
        await getUseableComments(comments)
          .then((useableComments) => {
            // Choose one of the comments at random.
            var chosenComment = _.sample(useableComments);
            resolve(chosenComment);
          })
          .catch((error) => {
            reject('None of the comments were useable:', error);
          });
      }
    });

  });
}

// Go through each comment until we find a useable one.
async function getUseableComments(comments) {
  let useableComments = [];

  for (let i = 0; i < comments.length; i++) {
    var comment = comments[i].body.trim();

    console.log('CHECKING COMMENT ' + ( i + 1 ) + ' OF ' + comments.length + ':', comment);

    console.log('ANALYZING: Checking if too short…');

    if (comment.length < 1) {
      console.log('NOPE: Comment is too short.');
      continue;
    }

    console.log('\tOK!');

    console.log('ANALYZING: Checking if too long…');

    if (comment.length > 280) {
      console.log('NOPE: Comment is too long');
      continue;
    }

    console.log('\tOK!');

    console.log('ANALYZING: Checking for bad words…');

    if (wordfilter.blacklisted(comment)) {
      console.log('NOPE: Comment is a reply, contains a bad word, or looks like spam.');
      continue;
    }

    console.log('\tOK!');

    console.log('ANALYZING: Checking if English…');

    await checkIfEnglish(comment)
      .then((result) => {
        console.log('\tOK!', i);
        console.log('SUCCESS: All checks passed! Comment is useable!');

        useableComments.push(result);
      })
      .catch((error) => {
        console.log('NOPE: ' + error)
      });
  }

  if (useableComments.length > 0) {
    return useableComments;
  }
  else {
    return false;
  }
}

function checkIfEnglish(comment) {
  return new Promise(function (resolve, reject) {
    translate.detect(comment, function (error, result) {
      if (result.lang === 'en') {
        resolve(comment)
      }
      else if (typeof(error) !== 'undefined') {
        reject('Error from Yandex:', error)
      }
      else {
        reject('Comment is not in English.')
      }
    });
  });
}

function post(thePostToPost) {
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
