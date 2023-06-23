import * as dotenv from 'dotenv'; dotenv.config();
import * as _ from 'underscore';
import { login } from 'masto';
import Keyv from '@keyvhq/core';
import { KeyvFile } from 'keyv-file';
import wordfilter from 'wordfilter';
import extraWords from './wordfilter-additions.js';

// Filter a lot of strings to improve comment selection.
wordfilter.addWords(extraWords);

// Set a high number as the ceiling for picking a random track ID. There are
// more than a billion tracks on SoundCloud; stick with a slightly smaller pool.
const maxTrackID = 784514266;

// Initiate key-value store.
const keyv = new Keyv({
  store: new KeyvFile({
    filename: 'keys.json'
  })
});

// The main process. Get a comment and post it.
export async function doPost() {
  await getCommentToPost()
  .then(async (comment) => {
    console.log('Trying to post "' + comment + '" to Mastodon...');
    return await postToMastodon(comment);
  });
}

/* --- */

// Access Mastodon.
function accessMastodon() {
  return login({
    url: 'https://botsin.space',
    accessToken: process.env.MASTODON_ACCESS_TOKEN,
  });
};

// Get SoundCloud OAuth access token, which is necessary for API calls.
var soundcloudAccessToken;

function getSoundCloudAccessToken() {
  return new Promise(async (resolve, reject) => {
    if (typeof soundcloudAccessToken !== 'undefined') {
      resolve(soundcloudAccessToken);
    }
    else if (await keyv.has('access_token')) {
      console.log('Access token already exists.');
      refreshSoundCloudAccessToken()
      .then((accessToken) => {
        console.log('Refreshed access token created:', accessToken);
        resolve(accessToken);
      })
      .catch((error) => {
        console.log('ERROR REFRESHING SOUNDCLOUD ACCESS TOKEN:', error);
        reject(error);
      });
    }
    else {
      console.log('Need to fetch new access token.')
      getNewSoundCloudAccessToken()
      .then((accessToken) => {
        console.log('New access token created:', accessToken);
        resolve(accessToken);
      })
      .catch((error) => {
        console.log('ERROR GETTING NEW SOUNDCLOUD ACCESS TOKEN:', error);
        reject(error);
      });
    }
  });
}

function getNewSoundCloudAccessToken() {
  return new Promise((resolve, reject) => {
    fetch(
      'https://api.soundcloud.com/oauth2/token',
      {
        method: 'POST',
        headers: {
          'accept': 'application/json; charset=utf-8',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          'client_id': process.env.SOUNDCLOUD_CLIENT_ID,
          'client_secret': process.env.SOUNDCLOUD_SECRET,
          'grant_type': 'client_credentials',
        })
      }
    )
    .then((response) => response.json())
    .then(async (data) => {
      // console.log('Full request response:', data);
      console.log('Newly created tokens expire in ' + data.expires_in / 60 + ' minutes.');

      let expirationTimeInMilliseconds = data.expires_in * 1000;
      await keyv.set('access_token', data.access_token, expirationTimeInMilliseconds);
      await keyv.set('refresh_token', data.refresh_token, expirationTimeInMilliseconds);
    })
    .then(async () => {
      let accessToken = await keyv.get('access_token');
      console.log('Getting newly created access token:', accessToken);
      resolve(accessToken);
    })
    .catch((error) => {
      reject(error);
    });
  });
}

function refreshSoundCloudAccessToken() {
  return new Promise(async (resolve, reject) => {
    let refreshToken = await keyv.get('refresh_token');

    fetch(
      'https://api.soundcloud.com/oauth2/token',
      {
        method: 'POST',
        headers: {
          'accept': 'application/json; charset=utf-8',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          'client_id': process.env.SOUNDCLOUD_CLIENT_ID,
          'client_secret': process.env.SOUNDCLOUD_SECRET,
          'grant_type': 'refresh_token',
          'refresh_token': refreshToken,
        })
      }
    )
    .then((response) => response.json())
    .then(async (data) => {
      // console.log('Full request response:', data);
      console.log('Storing refreshed access token and new refresh token which expire in ' + data.expires_in/60 + ' minutes.') ;

      let expirationTimeInMilliseconds = data.expires_in * 1000;
      await keyv.set('access_token', data.access_token, expirationTimeInMilliseconds);
      await keyv.set('refresh_token', data.refresh_token, expirationTimeInMilliseconds);
    })
    .then(async () => {
      let accessToken = await keyv.get('access_token');
      console.log('Getting refreshed access token:', accessToken);
      resolve(accessToken);
    })
    .catch((error) => {
      reject(error);
    });
  });
}

const doSoundCloudRequest = (endpoint) => {
  return new Promise((resolve, reject) => {
    getSoundCloudAccessToken()
    .then((accessToken) => {
      console.log('Doing request with token ' + accessToken)
      return fetch(
        `https://api.soundcloud.com/${endpoint}`,
        {
          method: 'GET',
          headers: {
            'accept': 'application/json; charset=utf-8',
            'Authorization': 'OAuth ' + accessToken,
          }
        }
      )
    })
    .then((response) => {
      console.log(`Querying https://api.soundcloud.com/${endpoint}`)
      return response.json();
    })
    .then((data) => {
      // console.log('Full response from SoundCloud:', data)
      resolve(data);
    })
    .catch((error) => {
      console.log('ERROR DOING SOUNDCLOUD REQUEST:', error);
      reject(error);
    });
  });
}

function getTrackThatHasComments() {
  return new Promise (function (resolve, reject) {
    // DEBUG: Test a track we know has usable comments in English:
    // resolve(400777524); // Has 20 comments, including ones with bad words!
    // resolve(249409061);
    // resolve(486767115);

    // DEBUG: Test a track we know has a non-English comment:
    // resolve(170359332);

    console.log('\n💫 🔍 🔊 💬\n');

    // Pick a random track. The API doesn't provide for this, but SoundCloud
    // track IDs are sequential! There are a lot of missing tracks (deleted,
    // private, etc.), but this... will eventually succeeed.
    const randomTrackID = String(_.random(0, maxTrackID));

    console.log('Looking for a track at ID #' + randomTrackID + '…');

    doSoundCloudRequest(`tracks/${randomTrackID}`)
    .then((response) => {
      // console.log('FULL API RESPONSE:\n', response);

      if (response.code === 401) {
        reject('Could not authorize.');
      }
      else if (response.code === 404) {
        reject('No track exists at this ID.');
      }
      else if (typeof response.code !== 'undefined') {
        reject('Error trying to retrieve track.');
      }
      else {
        if (response.comment_count > 0) {
          console.log('\tOK! Track has comments! Comment count: ' + response.comment_count);
          resolve(response.id);
        }
        else {
          console.log('Track has no comments!');
          reject('Track has no comments.');
        }
      }
    });

  });
}

// Get a random comment and see if it's usable.
function getCommentFromTrack(trackID) {
  return new Promise(async (resolve, reject) => {

    // Get all of the comments for this track.
    doSoundCloudRequest('tracks/' + trackID + '/comments')
    .then((response) => {
      console.log('CHECKING COMMENTS FOR TRACK ID #' + trackID + '…');
      // console.log('Full response of comments: ' + response);

      // Check all comments and only keep the useable ones.
      return getUseableComments(response)
    })
    .then((useableComments) => {
      // Choose one of the comments at random.
      var chosenComment = _.sample(useableComments);
      resolve(chosenComment);
    })
    .catch(() => {
      reject('None of the comments were useable.');
    });
  });
}

// Go through each comment until we find a useable one.
function getUseableComments(comments) {
  return new Promise(async (resolve, reject) => {

    let useableComments = [];

    for (let i = 0; i < comments.length; i++) {
      var comment = comments[i].body.trim();

      console.log('\nCHECKING COMMENT ' + ( i + 1 ) + ' OF ' + comments.length + ':', comment);

      console.log('ANALYZING: Checking if too short…');

      if (comment.length < 1) {
        console.log('\tNOPE: Comment is too short.');
        continue;
      }

      console.log('\tOK!');

      console.log('ANALYZING: Checking if too long…');

      if (comment.length > 360) {
        console.log('\tNOPE: Comment is too long');
        continue;
      }

      console.log('\tOK!');

      console.log('ANALYZING: Checking for bad words…');

      if (wordfilter.blacklisted(comment)) {
        console.log('\tNOPE: Comment is a reply, contains a bad word, or looks like spam.');
        continue;
      }

      console.log('\tOK!');

      console.log('ANALYZING: Checking if English…');

      await checkIfEnglish(comment)
      .then(() => {
        console.log('\tOK!');
        console.log('SUCCESS: All checks passed! Comment is usable!');

        console.log('COMMENT IS USABLE: ' + comment)
        useableComments.push(comment);
      })
      .catch((error) => {
        console.log('\tNOPE: ' + error)
      });
    }

    if (useableComments.length > 0) {
      resolve(useableComments);
    }
    else {
      reject();
    }
  });
}

function checkIfEnglish(comment) {
  return new Promise(function (resolve, reject) {
    fetch(
      'https://translation.googleapis.com/language/translate/v2/detect?key=' + process.env.GOOGLE_TRANSLATE_API_KEY + '&q=' + comment,
      {
        method: 'POST',
        headers: {
          'accept': 'application/json; charset=utf-8',
        }
      }
    )
    .then((response) => response.json())
    .then((response) => {
      let detectedLanguage = response.data.detections[0][0].language;
      console.log('Detections:', response.data.detections);
      // console.log('Detected language: ' + detectedLanguage);

      if (detectedLanguage === 'en') {
        resolve(comment);
      }
      else {
        reject('Comment is not in English.');
      }
    })
    .catch((error) => {
      reject('Error checking language: ' + error);
    })
  });
}

function getCommentToPost() {
  return new Promise((resolve) => {
    getTrackThatHasComments()
    .then((trackID) => {
      return getCommentFromTrack(trackID)
    })
    .then((comment) => {
      console.log('\nCOMMENT TO POST:', comment)
      resolve(comment);
    })
    .catch(function (error) {
      console.log('ERROR:', error);

      // Try again if any step failed.
      getCommentToPost();
    });
  })
}

// Post the comment.
async function postToMastodon(thePostToPost) {
  if (typeof(thePostToPost) !== 'undefined') {
    console.log('NOW ATTEMPTING TO POST:', thePostToPost);

    const masto = await accessMastodon();

    console.log('LOGGING IN TO MASTODON:', masto);

    const status = await masto.v1.statuses.create({
      status: thePostToPost,
      visibility: 'public'
    });

    console.log('RESULT OF ATTEMPT TO POST:', status);

    if (status.id !== 'undefined') {
      console.log('SUCCESSFULLY POSTED TO MASTODON: ', status.url);
    }
    else {
      console.log('ERROR POSTING:', status);
    }
  }
  else {
    console.log('ERROR: No comment retrieved; cannot post.');
  }
}
