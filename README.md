# SoundCloud Comments Bot AKA @soundcloudsaid

A bot that posts random comments from SoundCloud.

Currently posting several times a day to Mastodon and Bluesky.

## The Bots

- **[@soundcloudsaid on Mastodon][bot-on-mastodon]**
- **[@soundcloudsaid_source on Mastodon][source-bot-on-mastodon]**
- **[@soundcloudsaid on Bluesky][bot-on-bluesky]**
- **[@soundcloudsaid-src on Bluesky][source-bot-on-bluesky]**

---

As a lover of music, I spend a lot of time on SoundCloud, and can't help but
notice the comments. SoundCloud comments have a certain character: a lot of
concise and enthusiastic praise, a ton of spam, the occasional multi-sentence
opinion on the production, and, rarely, a negative review.

This bot grabs a comment at random.

## How It Works

### Getting Random Comments

GitHub Actions is configured to run the [`bot.js`](bot.js) script on a fixed
schedule throughout the day. That script does the following:

1. Chooses a track at random from SoundCloud. Checks whether the track still
   exists and if it has any comments. If either is untrue, get another track at
   random. Retry until we get a track with comments.

2. Check all comments using the criteria listed in the 'Filtering Comments'
   section below. If none are usable, go back to step one.

3. Randomly select one of the comments that is usable and post it.

4. Reply to the posted comment with some stats and a link to the original
   SoundCloud comment where the comment was found.

### Filtering Comments

My aesthetic for this bot is simple, text-only, anonymous. So I filter the
potential comments rigorously. I filter out the following:

- self-promotion (anything including the words `follow`, `check out`, `blog`,
  and any of a half-dozen social networks)
- classic spam (`free`, `dollars`, `cam`, `sex`)
- anything that looks like a URL
- replies and mentions (anything including the `@` symbol)
- anything pointing to another user or track on SoundCloud

I also filter out any comment including any of the [bad words listed in Darius
Kazemi's wordfilter][wordfilter]. (And I added [many more words][more-words].)

Finally, I use the [Google Translate API][google-translate] to
make sure the comment is English. The automated check is imperfect for checking
informal, comment-style language, but helps discard most non-English comments.
The primary reason for this filter is preventing abusive language appearing in
my bot in a language that I don't speak and thus cannot filter out.

### Sharing the Source *(New as of June 2026!)*

As of June 17, 2026, every time this bot posts, it also posts a reply from a
companion bot that shares some info about the SoundCloud upload from which the
comment was drawn (the date of the upload, the number of likes, comments, and
plays, etc.) and provides a link to the upload on SoundCloud.

I do a lot of filtering of the content for this bot to make sure it behaves, but
I can't do the same for the names, titles, images, and content of the uploads on
SoundCloud. That's one of the reasons I didn't provide source links; the context
of the comment could be bad. I've settled on providing only metadata about the
upload in the post, and then a link that goes through a redirect page in order
to prevent a rich website preview from appearing in the post (see
[`redirector.php`](./redirector.php)).

### How It Used to Work

At first I struggled with how to retrieve a random comment—the SoundCloud API
doesn't allow for getting random nodes. Then I discovered that track IDs (and
comment IDs) are sequential. I found an old comment ID at `100000000` a recent
one at `500000000`, and figured that 400 million comments was more than enough
of a well from which to draw. The script picks a number at random, checks if
the comment still exists, and passes it on for filtering.

In early 2020, however, the `/comments` endpoint was removed from the SoundCloud
API without notice, so this bot stopped working. In 2023, I finally rewrote the
bot to use the process described above.

## Acknowledgements

I could not have created this bot without help from the following people and
resources:

- [Justin Falcone][justin-falcone] provided code review.

- [Twitter user @berlindisaster][parallel-invention] also had this idea in July
  of 2015. (This tweet and account have since been deleted.)

## Afterword

This is my third bot. ([@obliquestions][obliquestions-bot] and
[@novelcompounds][novel-compounds-bot] are the first two.)

<!-- *** -->

[bot-on-mastodon]: https://mastodon.matthewmcvickar.com/@soundcloudsaid
[source-bot-on-mastodon]: https://mastodon.matthewmcvickar.com/@soundcloudsaid_source
[bot-on-bluesky]: https://bsky.app/profile/soundcloudsaid.bsky.social
[source-bot-on-bluesky]: https://bsky.app/profile/soundcloudsaid-src.bsky.social
[wordfilter]: https://github.com/dariusk/wordfilter/blob/master/lib/badwords.json
[more-words]: ./wordfilter-additions.js
[google-translate]: https://cloud.google.com/translate
[justin-falcone]: https://justinfalcone.com/
[parallel-invention]: https://twitter.com/berlindisaster/status/621943270726344704
[obliquestions-bot]: https://mastodon.matthewmcvickar.com/@obliquestions
[novel-compounds-bot]: https://github.com/matthewmcvickar/novel-compounds-bot
