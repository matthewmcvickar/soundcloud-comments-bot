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
  // Notice the double-escaping here, which makes sure the escape characters
  // make it into the regex.
  'http',
  'www',
  '\\.cc',
  '\\.co',
  '\\.do',
  '\\.gl',
  '\\.io',
  '\\.ly',
  '\\.net',
  '\\.st',

  // Replies, SoundCloud links, tags, etc.
  'user\\-',
  '\\@',
  '\\\n',
  '\\_',
  '\\#',

  // A few more curses and bad words.
  'arab',
  'bibl',
  'islam',
  'israel',
  'jew',
  'judai',
  'muslim',
  'slave',
  'fuck',
  'rape',
  'raping',
  'gay',
  'nig',
  'igg',
  'icc',
];
