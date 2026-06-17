import * as core from '@actions/core';
import * as dotenv from 'dotenv'; dotenv.config();
import { createRestAPIClient } from 'masto';
import Keyv from 'keyv';
import { KeyvFile } from 'keyv-file';
import { AtpAgent, RichText } from '@atproto/api';
import wordfilter from 'wordfilter';
import extraWords from './wordfilter-additions.js';

// Filter a lot of strings to improve comment selection.
wordfilter.addWords(extraWords);

// Set a high number as the ceiling for picking a random track ID. There are
// more than a billion tracks on SoundCloud; stick with a slightly smaller pool.
const maxTrackID = 784514266;

// Initiate key-value store for SoundCloud.
let soundcloudAccessTokenIsSet = false;
const keyv = new Keyv({
  store: new KeyvFile({
    filename: 'keys.json'
  })
});

// Initiate BlueSky connections.
const soundcloudsaidBlueskyAgent = new AtpAgent({
  service: 'https://bsky.social',
});

const soundcloudsaidsourceBlueskyAgent = new AtpAgent({
  service: 'https://bsky.social',
});

// TODO: Use OAuth-based session management instead.
// https://www.npmjs.com/package/@atproto/oauth-client-node
await soundcloudsaidBlueskyAgent.login({
  identifier: process.env.SOUNDCLOUDSAID_BLUESKY_USERNAME,
  password: process.env.SOUNDCLOUDSAID_BLUESKY_PASSWORD
});

await soundcloudsaidsourceBlueskyAgent.login({
  identifier: process.env.SOUNDCLOUDSAIDSOURCE_BLUESKY_USERNAME,
  password: process.env.SOUNDCLOUDSAIDSOURCE_BLUESKY_PASSWORD
});

// Initiate Mastodon connections.
const soundcloudsaidMastodonConnection = createRestAPIClient({
  url: 'https://mastodon.matthewmcvickar.com',
  accessToken: process.env.SOUNDCLOUDSAID_MASTODON_ACCESS_TOKEN,
});

const soundcloudsaidsourceMastodonConnection = createRestAPIClient({
  url: 'https://mastodon.matthewmcvickar.com',
  accessToken: process.env.SOUNDCLOUDSAIDSOURCE_MASTODON_ACCESS_TOKEN,
});

// console.log('CONNECTING TO MASTODON:', soundcloudsaidMastodonConnection);
// console.log('CONNECTING TO MASTODON... AGAIN:', soundcloudsaidsourceMastodonConnection);

// The main process. Get a comment and post it.
async function doPost() {
  console.log('\n💫 🔍 🔊 💬');
  const comment = await getCommentToPost();
  if (comment) {
    console.log('\n🔊 💬 🤖 🚀\n\nFound a usable comment, after ' + attempts + ' attempts, on this track:\n' + track.permalink_url);
    console.log('\nTrying to post "' + comment + '" to Mastodon…');

    const postedToMastodon = await soundcloudsaid_postToMastodon(comment);
    const postedToBluesky = await soundcloudsaid_postToBluesky(comment);

    return {
      postedToMastodon,
      postedToBluesky
    }
  }
  else {
    core.setFailed('Could not post.');
  }
}

// Keep track of how many attempts were made before a usable comment was found
// and which track provided the comment.
let shouldTryToRequest = true;
let attempts = 0;
let track;

// Post!
doPost();

/* --- */

// Get SoundCloud OAuth access token, which is necessary for API calls.
async function getSoundCloudAccessToken() {
  if (soundcloudAccessTokenIsSet) {
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
    'https://secure.soundcloud.com/oauth/token',
    {
      method: 'POST',
      headers: {
        'accept': 'application/json; charset=utf-8',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + btoa( process.env.SOUNDCLOUD_CLIENT_ID + ':' + process.env.SOUNDCLOUD_SECRET ),
      },
      body: new URLSearchParams({
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
  soundcloudAccessTokenIsSet = true;
  // console.log('Getting newly created access token:', accessToken);

  return accessToken;
}

async function refreshSoundCloudAccessToken() {
  const response = await fetch(
    'https://secure.soundcloud.com/oauth/token',
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
  soundcloudAccessTokenIsSet = true;
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

  // Save the track for later reference.
  track = response;

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

    let isEnglish = await checkIfEnglish(comment);

    if (isEnglish) {
      console.log('\tOK! Comment appears to be written in English. (Confidence level: ' + Math.round( isEnglish * 100 ) + '%)' );
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
  const detectedLanguageConfidence = responseData.data.detections[0][0].confidence;

  if (detectedLanguage === 'en') {
    return detectedLanguageConfidence;
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

// Build reply post with info about the upload.
function getReplyPost() {
  const commentCount = track.comment_count > 1 ? integerToWord( track.comment_count ) + ' comments' : 'one comment';
  const likeCount    = track.favoritings_count > 1 ? integerToWord( track.favoritings_count ) + ' likes' : 'one like';
  const playCount    = track.playback_count > 1 ? integerToWord( track.playback_count ) + ' plays' : 'one play';
  const duration     = millisecondsToDuration(track.duration);
  const date         = formatDateCreated(track.created_at);

  // Get permalink without query (UTM params) so the URL isn't as long.
  let url = new URL(track.permalink_url);
  url = 'https://via.mattmcv.com/?url=' + encodeURIComponent(url.origin + url.pathname);

  const replyPost = `After ${attempts} attempts, this comment was found on an upload from ${date} with ${playCount}, ${likeCount}, and ${commentCount}.\n\n${url}`;

  return replyPost;
}

async function soundcloudsaid_postToMastodon(thePostToPost) {
  if ( ! thePostToPost) {
    console.error('❰SOUNDCLOUDSAID❱ 🚫 ERROR: No comment retrieved; cannot post to Mastodon.');
  }

  if ( ! soundcloudsaidMastodonConnection ) {
    console.error('❰SOUNDCLOUDSAID❱ 🚫 ERROR: Could not connect to Mastodon. Try again later.');
  }

  console.log('❰SOUNDCLOUDSAID❱ ⚡️ NOW ATTEMPTING TO POST TO MASTODON:', thePostToPost);

  const postedPost = await soundcloudsaidMastodonConnection.v1.statuses.create({
    status: thePostToPost,
    visibility: 'public',
  });

  // console.log('❰SOUNDCLOUDSAID❱ 📋 FULL RESPONSE OF ATTEMPT TO POST TO MASTODON:', postedPost);

  if (postedPost.id) {
    console.log('\n❰SOUNDCLOUDSAID❱ ✅ SUCCESSFULLY POSTED TO MASTODON:', postedPost.url);

    return await soundcloudsaidsource_postToMastodon(postedPost)
  }
  else {
    console.error('❰SOUNDCLOUDSAID❱ 🚫 ERROR POSTING TO MASTODON:', postedPost);
  }
}

async function soundcloudsaid_postToBluesky(thePostToPost) {
  if ( ! thePostToPost) {
    console.error('❰SOUNDCLOUDSAID❱ 🚫 ERROR: No comment retrieved; cannot post to Bluesky.');
  }

  if ( ! soundcloudsaidBlueskyAgent.did ) {
    console.error('❰SOUNDCLOUDSAID❱ 🚫 ERROR: Could not connect to Bluesky. Try again later.');
  }

  console.log('❰SOUNDCLOUDSAID❱ ⚡️ NOW ATTEMPTING TO POST TO BLUESKY:', thePostToPost);

  const postedPost = await soundcloudsaidBlueskyAgent.post({
    text: thePostToPost
  });

  // console.log('❰SOUNDCLOUDSAID❱ 📋 FULL RESPONSE OF ATTEMPT TO POST TO BLUESKY:', postedPost);

  if (postedPost.uri) {
    console.log('\n❰SOUNDCLOUDSAID❱ ✅ SUCCESSFULLY POSTED TO BLUESKY:', getBskyURL( postedPost.uri ));

    return await soundcloudsaidsource_postToBluesky(postedPost);
  }
  else {
    console.error('❰SOUNDCLOUDSAID❱ 🚫 ERROR POSTING TO BLUESKY:', postedPost);
  }
}

async function soundcloudsaidsource_postToMastodon(originalPost) {
  console.log('❰SOUNDCLOUDSAID_SOURCE❱ ⚡️ NOW ATTEMPTING TO POST TO MASTODON.');

  const postedPost = await soundcloudsaidsourceMastodonConnection.v1.statuses.create({
    status: getReplyPost(),
    visibility: 'public',
    inReplyToId: originalPost.id,
  });

  // console.log('❰SOUNDCLOUDSAID_SOURCE❱ 📋 FULL RESPONSE OF ATTEMPT TO POST TO MASTODON:', postedPost);

  if (postedPost.id) {
    console.log('\n❰SOUNDCLOUDSAID_SOURCE❱ ✅ SUCCESSFULLY POSTED TO MASTODON:', postedPost.url);
  }
  else {
    console.error('❰SOUNDCLOUDSAID_SOURCE❱ 🚫 ERROR POSTING TO MASTODON:', postedPost);
  }
}

async function soundcloudsaidsource_postToBluesky(originalPost) {
  console.log('❰SOUNDCLOUDSAID_SOURCE❱ ⚡️ NOW ATTEMPTING TO POST TO BLUESKY.');

  // The 'root' and 'parent' post are the same here.
  // https://atproto.com/blog/create-post#replies-quote-posts-and-embeds

  // Detect the clickable URL in the post.
  const replyPost = new RichText({
    text: getReplyPost()
  });
  await replyPost.detectFacets(soundcloudsaidsourceBlueskyAgent);

  const postedPost = await soundcloudsaidsourceBlueskyAgent.post({
    text: replyPost.text,
    facets: replyPost.facets,
    reply: {
      root: {
        uri: originalPost.uri,
        cid: originalPost.cid,
      },
      parent: {
        uri: originalPost.uri,
        cid: originalPost.cid,
      },
    }
  });

  // console.log('❰SOUNDCLOUDSAID_SOURCE❱ 📋 FULL RESPONSE OF ATTEMPT TO POST TO BLUESKY:', postedPost);

  if (postedPost.uri) {
    console.log('\n❰SOUNDCLOUDSAID_SOURCE❱ ✅ SUCCESSFULLY POSTED TO BLUESKY:', getBskyURL( postedPost.uri ));
  }
  else {
    console.error('❰SOUNDCLOUDSAID_SOURCE❱ 🚫 ERROR POSTING TO BLUESKY:', postedPost);
  }
}

// Build a bsky.app URL from the returned object.
// Explanation: https://github.com/bluesky-social/atproto/discussions/2523
// Regex in action: https://regex101.com/r/oNdt57/1
function getBskyURL( uri ) {
  let uriRegex = uri.match(/at:\/\/([A-Za-z0-9:]+)\/[a-z.]+\/([A-Za-z0-9]+)/)
  let did = uriRegex[1];
  let rkey = uriRegex[2];
  return 'https://bsky.app/profile/' + did + '/post/' + rkey;
}

// Turn a digit into a word if it's under 10.
function integerToWord(integer) {
  if (!integer) {
    return 0;
  }

  if (integer > 9) {
    return integer.toLocaleString();
  }

  switch(integer) {
    case 1:
      return 'one';
      break;
    case 2:
      return 'two';
      break;
    case 3:
      return 'three';
      break;
    case 4:
      return 'four';
      break;
    case 5:
      return 'five';
      break;
    case 6:
      return 'six';
      break;
    case 7:
      return 'seven';
      break;
    case 8:
      return 'eight';
      break;
    case 9:
      return 'nine';
      break;
  }
}

// Turn a number of milliseconds into a duration like '4:14.'
function millisecondsToDuration(milliseconds) {
  let minutes = Math.floor(milliseconds / 60000);
  let seconds = ((milliseconds % 60000) / 1000).toFixed(0);
  return minutes + ':' + (seconds < 10 ? '0' : '') + seconds;
}

// Turn a date like '1985/04/14 04:14:14 +0000' into 'April 14, 1985.'
function formatDateCreated(dateString) {
  const date = new Date(dateString);
  const day  = date.getDate();

  // If day 11, 12, or 13, make the suffix 'th.' Otherwise, every number ending
  // in a 1 is a 'st,' in a 2 is a 'nd,' in a 3 is a 'rd,' and every other
  // number ends in a 'th.'
  let suffix;
  if (day % 100 >= 11 && day % 100 <= 13) {
    suffix = 'th';
  } else {
    switch (day % 10) {
      case 1:  suffix = 'st'; break;
      case 2:  suffix = 'nd'; break;
      case 3:  suffix = 'rd'; break;
      default: suffix = 'th';
    }
  }

  return `${date.toLocaleString('en-US', { month: 'long' })} ${day}${suffix}, ${date.getFullYear()}`;
}
