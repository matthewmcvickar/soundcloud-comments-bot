// To get a better set of comments, I'm filtering out a lot of things.
// The words below are filtered in addition to the default set:
// https://github.com/dariusk/wordfilter/blob/master/lib/badwords.json

export default [

  // Promotion, spam, link pollution.
  'follow me',
  'follow my',
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
  'tiktok',
  'tik tok',
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
];
