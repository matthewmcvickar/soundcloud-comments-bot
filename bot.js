import * as dotenv from 'dotenv'; dotenv.config();
import { createRestAPIClient } from 'masto';
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
let accessTokenIsSet = false;
const keyv = new Keyv({
  store: new KeyvFile({
    filename: 'keys.json'
  })
});

// The main process. Get a comment and post it.
async function doPost() {
  console.log('\n💫 🔍 🔊 💬');
  const comment = await getCommentToPost();
  if (comment) {
    console.log('\n🔊 💬 🤖 🚀\n\nFound a usable comment, after ' + attempts + ' attempts, on this track:\n' + trackURL);
    console.log('\nTrying to post "' + comment + '" to Mastodon…');
    return await postToMastodon(comment);
  }
  else {
    console.error('Could not post.');
  }
}

// Keep track of how many attempts were made before a usable comment was found
// and which track URL provided the comment.
let shouldTryToRequest = true;
let attempts = 0;
let trackURL;

// Post!
doPost();

/* --- */

// Get SoundCloud OAuth access token, which is necessary for API calls.
async function getSoundCloudAccessToken() {
  if (accessTokenIsSet) {
    return await keyv.get('access_token');
  }
  else if (await keyv.has('access_token')) {
    // console.log('Access token already exists.');
    return await refreshSoundCloudAccessToken();
  }
  else {
    // console.log('Access token does not exist.');
    return await getNewSoundCloudAccessToken();
  }
}

async function getNewSoundCloudAccessToken() {
  const response = await fetch(
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
  );

  if ( response.status !== 200 ) {
    console.error('⚠️ REQUEST FOR NEW ACCESS TOKEN FAILED:');
    console.log(response);
    return false;
  }

  const responseData = await response.json();

  // console.log('Full request response:', responseData);
  // console.log('Newly created tokens expire in ' + responseData.expires_in / 60 + ' minutes.');

  const expirationTimeInMilliseconds = responseData.expires_in * 1000;
  await keyv.set('access_token', responseData.access_token, expirationTimeInMilliseconds);
  await keyv.set('refresh_token', responseData.refresh_token, expirationTimeInMilliseconds);

  const accessToken = await keyv.get('access_token');
  accessTokenIsSet = true;
  // console.log('Getting newly created access token:', accessToken);

  return accessToken;
}

async function refreshSoundCloudAccessToken() {
  const response = await fetch(
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
        'refresh_token': await keyv.get('refresh_token'),
      })
    }
  );
  const responseData = await response.json();

  if ( response.status !== 200 ) {
    console.error('⚠️ REQUEST TO REFRESH ACCESS TOKEN FAILED:');
    console.log(response);
    return false;
  }

  // console.log('Full request response:', responseData);
  // console.log('Storing refreshed access token and new refresh token which expire in ' + responseData.expires_in/60 + ' minutes.') ;

  const expirationTimeInMilliseconds = responseData.expires_in * 1000;
  await keyv.set('access_token', responseData.access_token, expirationTimeInMilliseconds);
  await keyv.set('refresh_token', responseData.refresh_token, expirationTimeInMilliseconds);

  const accessToken = await keyv.get('access_token');
  accessTokenIsSet = true;
  // console.log('Getting refreshed access token:', accessToken);

  return accessToken;
}

async function doSoundCloudRequest(endpoint) {
  const accessToken = await getSoundCloudAccessToken();
  // console.log('Doing request with token ' + accessToken)
  // console.log(`Querying https://api.soundcloud.com/${endpoint}`)

  if ( ! accessToken ) {
    shouldTryToRequest = false;
    return false;
  }

  const response = await fetch(
    `https://api.soundcloud.com/${endpoint}`,
    {
      method: 'GET',
      headers: {
        'accept': 'application/json; charset=utf-8',
        'Authorization': 'OAuth ' + accessToken,
      }
    }
  );

  if (response) {
    const json = await response.json();
    // Make sure the response is a JSON object and not an error message.
    if (typeof json === 'object') {
      return json;
    }
  }
}

async function getTrackThatHasComments() {
  // DEBUG: Test a track we know has usable comments in English:
  // return 400777524; // Has 20 comments, including ones with bad words!
  // return 249409061; // Has 2 comments, both are usable.

  // DEBUG: Test a track we know has a non-English comment:
  // return 170359332;

  // DEBUG: Test a track we know doesn't have any comments.
  // return 153976760;

  console.log('\n---\n');

  // Click the counter!
  attempts++;

  // Pick a random track. The API doesn't provide for this, but SoundCloud track
  // IDs are sequential! There are a lot of missing tracks (deleted, private,
  // etc.), but this will, uh, *eventually* find a track with comments.
  const randomTrackID = String(Math.floor(Math.random() * (maxTrackID - 1) + 1));

  console.log('Attempt #' + attempts + ': Looking for a track at ID #' + randomTrackID + '…');

  const response = await doSoundCloudRequest(`tracks/${randomTrackID}`);

  // console.log('FULL API RESPONSE:\n', response);

  if (!response) {
    console.error('Bad response.');
    return false;
  }

  // Save the track URL for later reference.
  trackURL = response.permalink_url;

  if (response.code === 401) {
    console.error('Could not authorize.');
  }
  else if (response.code === 404) {
    console.error('No track exists at this ID.');
  }
  else if (typeof response.code !== 'undefined') {
    console.error('Error trying to retrieve track.');
  }
  else {
    if (response.comment_count > 0) {
      console.log('\tOK! Track has comments! Comment count: ' + response.comment_count);
      return response.id;
    }
    else {
      console.error('Track has no comments!');
    }
  }
};

// Get a random comment and see if it's usable.
async function getCommentFromTrack(trackID) {
  // Get all of the comments for this track.
  const comments = await doSoundCloudRequest('tracks/' + trackID + '/comments');
  console.log('CHECKING COMMENTS FOR TRACK ID ' + trackID + '…');
  // console.log('Full response of comments: ', comments);

  // Exit
  if (!comments) {
    console.error('FAILED: Request failed or the returned comments object was empty.')
    return false;
  }

  // Check all comments and only keep the usable ones.
  const usableComments = await getUsableComments(comments);
  if (usableComments) {
    // Choose one of the comments at random.
    const chosenCommentNumber = Math.floor(Math.random() * usableComments.length);
    const chosenComment = usableComments[chosenCommentNumber];
    console.log('\nCHOSE COMMENT ' + (chosenCommentNumber+1) + ' of ' + usableComments.length + ':\n\t', chosenComment)
    return chosenComment;
  }
  else {
    console.error('FAILED: None of the comments were usable.');
    return false;
  }
}

// Go through each comment until we find a usable one.
async function getUsableComments(comments) {
  let usableComments = [];

  for (let i = 0; i < comments.length; i++) {
    var comment = comments[i].body.trim();

    console.log('\nCHECKING COMMENT ' + ( i + 1 ) + ' OF ' + comments.length + ':', comment);

    // ---

    console.log('ANALYZING: Checking if too short…');

    if (comment.length < 1) {
      console.error('\tNOPE! Comment is too short.');
      continue;
    }

    console.log('\tOK! Comment is not too short.');

    // ---

    console.log('ANALYZING: Checking if too long…');

    if (comment.length > 360) {
      console.error('\tNOPE! Comment is too long');
      continue;
    }

    console.log('\tOK! Comment is not too long.');

    // ---

    console.log('ANALYZING: Checking for bad words…');

    if (wordfilter.blacklisted(comment)) {
      console.error('\tNOPE! Comment is a reply, contains a bad word, or looks like spam.');
      continue;
    }

    console.log('\tOK! Comment does not contain any bad words');

    // ---

    console.log('ANALYZING: Checking if written in English…');

    if (await checkIfEnglish(comment)) {
      console.log('\tOK! Comment appears to be written in English.');
      console.log('SUCCESS: All checks passed! Comment is usable: "' + comment + '"');
      usableComments.push(comment);
    }
    else {
      console.error('\tNOPE! Comment appears not to be written in English.')
    }
  }

  if (usableComments.length > 0) {
    return usableComments;
  }
}

async function checkIfEnglish(comment) {
  const response = await fetch(
    'https://translation.googleapis.com/language/translate/v2/detect?key=' + process.env.GOOGLE_TRANSLATE_API_KEY + '&q=' + comment,
    {
      method: 'POST',
      headers: {
        'accept': 'application/json; charset=utf-8',
      }
    }
  );
  const responseData = await response.json();
  const detectedLanguage = responseData.data.detections[0][0].language;

  // console.log('Detections:', responseData.data.detections);
  // console.log('Detected language: ' + detectedLanguage);

  if (detectedLanguage === 'en') {
    return comment;
  }
}

async function getCommentToPost() {
  if (!shouldTryToRequest) {
    console.error('Not trying anymore.');
    return false;
  }

  const trackID = await getTrackThatHasComments();

  if (trackID) {
    const comment = await getCommentFromTrack(trackID);

    if (comment) {
      return comment;
    }
    else {
      // Try again if we failed to find a usable comment.
      console.error('FAILED.');
      return getCommentToPost();
    }
  }
  else {
    // Try again if we failed to find a track with comments.
    console.error('FAILED.');
    return getCommentToPost();
  }
}

// Post the comment.
let attemptsToPost = 0;

async function postToMastodon(thePostToPost) {
  attemptsToPost++;

  if (thePostToPost) {
    // console.log('NOW ATTEMPTING TO POST:', thePostToPost);

    // Access Mastodon.
    const masto = createRestAPIClient({
      url: 'https://botsin.space',
      accessToken: process.env.MASTODON_ACCESS_TOKEN,
    });

    // console.log('LOGGING IN TO MASTODON:', masto);

    if (masto) {
      const status = await masto.v1.statuses.create({
        status: thePostToPost,
        visibility: 'public'
      });

      // console.log('RESULT OF ATTEMPT TO POST:', status);

      if (status.id) {
        console.error('\n✅ SUCCESSFULLY POSTED TO MASTODON:', status.url);
      }
      else {
        console.error('ERROR POSTING:', status);
      }
    }
    else {
      // If we haven't already tried ten times, wait a bit and try again.
      if (attemptsToPost < 10) {
        setTimeout(() => {
          postToMastodon(thePostToPost);
        }, 5000);
      }
      else {
        console.error('ERROR: Could not post to Mastodon. Try again later.');
      }
    }
  }
  else {
    console.error('ERROR: No comment retrieved; cannot post.');
  }
}
