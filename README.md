# SoundCloud Said

A bot that posts random comments from SoundCloud.

This bot is currently posting every few hours to both Twitter and Mastodon.

- **[@soundcloudsaid on Mastodon](https://botsin.space/@soundcloudsaid)**
- **[@soundcloudsaid on Twitter](https://twitter.com/soundcloudsaid)**


---

As a lover of music I spend a lot of time on SoundCloud, and can't help but notice the comments. SoundCloud comments have a certain character: a lot of concise and enthusiastic praise, a ton of spam, the occasional multi-sentence opinion on the production, and, rarely, a negative review.

This bot grabs a comment at random.


## How I Built It

### Getting Random Comments

At first I struggled with how to retrieve a random comment—the SoundCloud API doesn't allow for getting random nodes. Then I discovered that track IDs (and comment IDs) are sequential. I found an old comment ID at [100000000](https://api.soundcloud.com/comments/100000000?client_id=f189440f42d14bfcf0a708703782cefc), a recent one at [500000010](https://api.soundcloud.com/comments/500000010?client_id=f189440f42d14bfcf0a708703782cefc), and figured that 190 million comments was more than enough of a well from which to draw.

~The script picks a number at random, checks if the comment still exists, and passes it on for filtering.~

As of March 10, 2020 the `/comments` endpoint was apparently removed from the SoundCloud API, so this stopped working! There was no notice of this on the SoundCloud API blog, but the API reference has nothing about a comments endpoint anymore. (Strangely, the API itself is still returning URIs for comments as though the endpoint still existed—e.g., check the `uri` property on [this comment](https://api.soundcloud.com/tracks/123456789/comments?client_id=f189440f42d14bfcf0a708703782cefc).)

In any case, I had to rework this script to first fetch a random track and then check if it has any useable comments. And now it works again!

### Filtering Comments

My aesthetic for this bot is simple, text-only, anonymous. So I filter the potential comments rigorously. I filter out the following:

  - self-promotion (anything including the words `follow`, `check out`, `blog`, and any of a half-dozen social networks)
  - classic spam (`free`, `dollars`, `cam`, `sex`)
  - anything that looks like a URL
  - replies and mentions (anything including the `@` symbol)
  - anything pointing to another user or track on SoundCloud

I also filter out any comment including any of the [bad words listed in Darius Kazemi's wordfilter](https://github.com/dariusk/wordfilter/blob/master/lib/badwords.json).

Finally, I use the [Yandex translation API](https://tech.yandex.com/translate/) to ensure the comment is English. The library is imperfect for checking informal, comment-style language, but helps discard most non-English comments. The primary reason for this filter is preventing abusive language appearing in my bot in a language that I don't speak and thus cannot filter out.

### Posting SoundCloud Comments

The [`soundcloud-comments-bot.js`](soundcloud-comments-bot.js) script does the following:

1. Chooses a track at random from SoundCloud. Checks whether the track still exists and if it has any comments. If either is untrue, get another track at random.

2. Check all comments using the criteria listed above.

3. Randomly select one of the comments that is useable.

3. Post the comment.

This script is running on Heroku.


---


## Acknowledgements

I could not have created this bot without help from the following people and resources:

- [Justin Falcone](https://twitter.com/modernserf) provided code review.

- [Twitter user @berlindisaster](https://twitter.com/berlindisaster/status/621943270726344704) also had this idea in July of 2015. (This tweet and account have since been deleted.)

- [Yandex Translation API](https://tech.yandex.com/translate/)


## Afterward

This is my third Twitter bot. ([@obliquestions](https://twitter.com/obliquestions) and [@novelcompounds](https://twitter.com/novelcompounds) are the first two.)
