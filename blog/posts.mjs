// Blog posts: one per PulsePic feature. `npm run blog` turns these into static
// pages in public/blog/ (plus the sitemap, RSS feed and llms.txt).
//
// Each post: slug (URL), icon (emoji fallback), image (optional icon art), title (H1), seoTitle (<title>, keep under ~60
// chars), description (meta, under ~155 chars), answer (the "Quick answer"
// at the top: a direct, self-contained reply to the question in the title,
// which is what search snippets and AI assistants quote), body (HTML),
// faqs (also published as FAQPage structured data).
//
// Keep every claim true to how the app actually works.

export const PUBLISHED = '2026-11-11';

export const posts = [
  {
    slug: 'how-beat-detection-works',
    icon: '🎵', image: '/img/icons/find-the-beat.webp',
    feature: 'Beat detection',
    title: 'How PulsePic Finds the Beat in Any Song',
    seoTitle: 'How PulsePic Finds the Beat in Any Song',
    description: 'PulsePic listens to your whole song first, works out the tempo, every beat and the start of each bar, so your picture pulses right on the beat.',
    keywords: ['beat detection', 'make picture pulse to music', 'beat sync', 'BPM detection', 'music visualizer'],
    answer: 'PulsePic analyzes your whole song before it plays. It measures how the energy changes across about 40 frequency bands, works out the tempo (BPM), then lines up every beat and the first beat of each bar. Because the beats are known ahead of time, effects land exactly on the beat instead of a moment late.',
    body: `
<h2>Why most "pulse to the music" effects feel late</h2>
<p>Many music visualizers react to sound as it comes out of the speaker: they hear a loud moment, then move the picture. That reaction always arrives a little after the beat, and it twitches on every loud noise, not just the beat you tap your foot to.</p>
<p>PulsePic takes a different approach. When you pick a song, it studies the entire track first (the Start button shows "Analyzing song…" for a few seconds). By the time you press play, it already has a map of where every beat falls.</p>

<h2>What PulsePic listens for</h2>
<ul>
  <li><strong>Tempo (BPM).</strong> It looks for the repeating pattern in the music and shows the tempo it found next to the sync buttons.</li>
  <li><strong>Every beat.</strong> It places a steady grid of beats that follows the song, even through quieter parts where the drums drop out.</li>
  <li><strong>The start of each bar.</strong> The first beat of a bar (the downbeat) usually carries the kick drum and bass. PulsePic marks it, so the bigger effects like Sparks and Strobe hit there.</li>
  <li><strong>Kicks and other hits.</strong> It also finds individual drum hits, ranked by how strong they are, for the Kick and All hits modes.</li>
</ul>

<h2>Beat, Kick or All hits: which sync mode should I use?</h2>
<p>Under the play button you'll find <strong>Sync to</strong> with three choices:</p>
<ul>
  <li><strong>Beat</strong>: a steady pulse on every beat. Best for most songs, and the most "on time" feeling.</li>
  <li><strong>Kick</strong>: follows the bass drum. Great for hip-hop, EDM and anything with a punchy kick.</li>
  <li><strong>All hits</strong>: reacts to every strong hit, including snares and percussion. Busier and more energetic.</li>
</ul>
<p>In Kick and All hits, the <strong>Sensitivity</strong> slider decides how strong a hit has to be to count. Turn it up to catch more hits, down to keep only the big ones.</p>

<h2>What if the picture still feels early or late?</h2>
<p>PulsePic already corrects for the delay your phone adds before sound reaches your ears. Some speakers and Bluetooth headphones add more delay than the phone reports, though. Use the <strong>Offset</strong> slider (from −300 to +300 ms):</p>
<ul>
  <li>If the picture moves <em>before</em> you hear the beat, slide it <strong>right</strong>.</li>
  <li>If the picture moves <em>after</em> the beat, slide it <strong>left</strong>.</li>
</ul>
<p>Small steps make a big difference. Try 50 ms at a time.</p>

<h2>Does it work with any kind of music?</h2>
<p>It works best with music that has a clear pulse: pop, hip-hop, EDM, rock, R&amp;B, reggaeton and most dance music. Songs with no drums or with very loose timing (some ambient or classical pieces) don't have a strong beat to find, so try Beat mode with a lower Strength for a gentler "breathing" look.</p>
<p>Want to see what the beat can drive? Read about the <a href="/blog/beat-synced-effects-and-presets">12 beat-synced effects and 3 presets</a>.</p>
`,
    faqs: [
      { q: 'Does PulsePic upload my song to analyze it?', a: 'No. The beat analysis runs on your phone. Your song is only uploaded if you choose to create a share link.' },
      { q: 'How long does the analysis take?', a: 'Usually a few seconds for a typical 3–4 minute song. Longer songs and older phones take a little longer.' },
      { q: 'Can I see the BPM PulsePic detected?', a: 'Yes. The tempo it found is shown next to the Sync to buttons in the player.' },
      { q: 'Why does the picture feel out of sync with Bluetooth headphones?', a: 'Bluetooth adds extra delay. Move the Offset slider to the right until the pulse lines up with what you hear. Exported videos are not affected, because the video and audio are saved together.' },
    ],
  },

  {
    slug: 'beat-synced-effects-and-presets',
    icon: '✨',
    feature: 'Effects and presets',
    title: '12 Beat-Synced Effects for Your Cover Art (and 3 One-Tap Presets)',
    seoTitle: '12 Beat-Synced Effects for Cover Art | PulsePic',
    description: 'Glow, Shake, Flash, Tilt, Bounce, Echo, Rings, Sparks, RGB split, Bars, Strobe and Circle. What each PulsePic effect does and when to use it.',
    keywords: ['cover art animation', 'music visualizer effects', 'pulse effect', 'album art video', 'beat effects'],
    answer: 'PulsePic has 12 effects that fire on the beat: Glow, Shake, Flash, Tilt, Bounce, Echo, Rings, Sparks, RGB split, Bars, Strobe and Circle. Turn on as many as you like, or tap a preset: Chill (soft glow, rings and echo), Club (glow, flash, rings, bars and tilt) or Hype (almost everything at full strength).',
    body: `
<h2>Every effect, explained</h2>
<p>Tap <strong>Effects</strong> in the player to open the grid, then tap any effect to switch it on or off. They all follow the beat you chose under <a href="/blog/how-beat-detection-works">Sync to</a>.</p>
<dl class="fx-list">
  <dt>Glow</dt><dd>A colored halo around your picture that flares on each beat and shifts color as the song goes.</dd>
  <dt>Shake</dt><dd>A quick jolt on the beat. Short and punchy, great for heavy drops.</dd>
  <dt>Flash</dt><dd>A bright flash over the picture on the beat.</dd>
  <dt>Tilt</dt><dd>The picture rocks left and right, alternating each beat.</dd>
  <dt>Bounce</dt><dd>The picture hops up on the beat and settles back down.</dd>
  <dt>Echo</dt><dd>Fading copies of the picture spread out behind it, like a visual delay.</dd>
  <dt>Rings</dt><dd>Outlines ripple out from the edges of the picture on each beat.</dd>
  <dt>Sparks</dt><dd>Bursts of colored particles, strongest on the first beat of each bar.</dd>
  <dt>RGB split</dt><dd>The red, green and blue layers pull apart on the beat for a glitchy, retro look.</dd>
  <dt>Bars</dt><dd>Spectrum bars around the picture that dance with the actual frequencies of the song, bass to treble.</dd>
  <dt>Strobe</dt><dd>A hard strobe on the first beat of each bar. Use it sparingly.</dd>
  <dt>Circle</dt><dd>Crops the picture into a circle, like a spinning record. Works with all the other effects.</dd>
</dl>

<h2>What do the presets do?</h2>
<p>Presets are one-tap starting points. They set the effects and the Strength for you, and you can change anything afterwards.</p>
<ul>
  <li><strong>Chill</strong>: Glow, Rings and Echo at low strength. Smooth and laid-back, good for acoustic, lo-fi and R&amp;B.</li>
  <li><strong>Club</strong>: Glow, Flash, Rings, Bars and Tilt at medium strength. Good for dance, house and pop.</li>
  <li><strong>Hype</strong>: Glow, Shake, Flash, RGB split, Sparks, Strobe, Echo and Bounce at high strength. Made for drops, trap and hard EDM.</li>
</ul>

<h2>How do I make the effects stronger or softer?</h2>
<p>Use the <strong>Strength</strong> slider. It scales every effect at once, from a gentle breathing pulse to a full-on light show. If the beat feels too busy, switch Sync to <strong>Beat</strong>; if it's not busy enough, try <strong>All hits</strong>.</p>

<h2>Tips for great-looking results</h2>
<ul>
  <li><strong>Less is often more.</strong> Two or three effects usually look more polished than all twelve.</li>
  <li><strong>Match the song's energy.</strong> Chill for verses and ballads, Hype for the drop.</li>
  <li><strong>Use Circle for album art.</strong> It gives a vinyl or "now playing" feel that reads well on social feeds.</li>
  <li><strong>Tap Hide</strong> to tuck the controls away and see the picture full screen.</li>
  <li><strong>Be kind to eyes.</strong> If you or your viewers are sensitive to flashing light, leave Flash and Strobe off.</li>
</ul>
<p>Happy with the look? Your effects are saved with your <a href="/blog/share-song-link-with-artist-info">share link</a> and baked into any <a href="/blog/instagram-reels-stories-video">video you export</a>.</p>
`,
    faqs: [
      { q: 'How many effects can I use at once?', a: 'As many as you like. All 12 can run together, and the Strength slider controls how intense they are.' },
      { q: 'Do my effect choices carry over to the share link and video?', a: 'Yes. The share page plays your picture with the same effects, strength and sync settings, and exported videos include them too.' },
      { q: 'Which preset is best for Instagram Reels?', a: 'Club is a safe all-rounder. Use Hype for high-energy drops and Chill for slower songs.' },
      { q: 'Can I change effects after I share a link?', a: 'Yes, if you are signed in. Open My links, tap Edit, change the effects and save. The link stays the same.' },
    ],
  },

  {
    slug: 'instagram-reels-stories-video',
    icon: '🎬', image: '/img/icons/video-export.webp',
    feature: 'Video export',
    title: 'How to Turn a Song and a Picture Into a Video for Instagram Reels, Stories and TikTok',
    seoTitle: 'Turn a Song and Picture Into an Instagram Reel',
    description: 'Make a 1080p MP4 of your cover art pulsing to your song, in 9:16, 1:1 or 4:5, then post it to Instagram Reels, Stories or TikTok. Free, on your phone.',
    keywords: ['song to video for instagram', 'cover art video', 'music video from picture', 'instagram reels audio visualizer', 'tiktok song video'],
    answer: 'Open PulsePic on your phone, add a picture and a song, pick your effects, then tap 🎬 Video. Choose Story / Reel (9:16), Square (1:1) or Feed (4:5), pick 15, 30, 60 or 90 seconds or the full song, and tap Record video. PulsePic makes a 1080p MP4 you can save to your phone and post to Instagram, TikTok or anywhere else.',
    body: `
<h2>Step by step</h2>
<ol class="steps">
  <li><strong>Go to pulsepic.com on your phone.</strong> It runs in the browser, so there's nothing to install. Safari on iPhone and Chrome on Android work best.</li>
  <li><strong>Pick a picture and a song.</strong> Cover art, a photo or a flyer, and your track (MP3, M4A, WAV and more).</li>
  <li><strong>Set the look.</strong> Choose a preset or your own <a href="/blog/beat-synced-effects-and-presets">effects</a>, and add your song details so the song name and artist show on the video.</li>
  <li><strong>Choose where the clip starts.</strong> Drag the song slider to the part you want, like the chorus or the drop. The video starts from there.</li>
  <li><strong>Tap 🎬 Video</strong>, pick the format and length, and tap <strong>Record video</strong>.</li>
  <li><strong>Save it.</strong> Tap <strong>Share / Save video</strong> and choose Save Video (it goes to your Photos), or share it straight to an app.</li>
</ol>

<h2>Which format should I pick?</h2>
<ul>
  <li><strong>Story / Reel (9:16, 1080×1920)</strong>: full-screen vertical video for Instagram Reels and Stories, TikTok and YouTube Shorts.</li>
  <li><strong>Square (1:1, 1080×1080)</strong>: classic feed post, works almost everywhere.</li>
  <li><strong>Feed (4:5, 1080×1350)</strong>: the tallest size Instagram shows in the main feed, so it takes up more of the screen.</li>
</ul>

<h2>How long can the video be?</h2>
<p>Pick <strong>15, 30, 60 or 90 seconds</strong>, or <strong>Full</strong> for the rest of the song from where the slider is. Shorter clips are quicker to make and tend to do better on Reels and TikTok, so 15–30 seconds of the best part of the song is a great default.</p>

<h2>Do I have to wait while it records?</h2>
<p>On most recent phones, no. PulsePic builds the video faster than it plays, so a 30-second clip often takes just a few seconds. On phones that can't do that, it falls back to recording the clip as it plays, so a 30-second video takes about 30 seconds. Either way, keep PulsePic open until it finishes.</p>

<h2>Will Instagram accept the file?</h2>
<p>Yes. On Safari (iPhone) and Chrome (Android), PulsePic saves a standard MP4 (H.264 video with AAC audio), the format Instagram and TikTok expect. Some desktop browsers can only make WebM files, which Instagram doesn't accept; PulsePic warns you if that happens. It's built for phones anyway.</p>

<h2>Can I remove the watermark?</h2>
<p>Yes. A small "Made with PulsePic.com" credit is on by default. Untick it in the export screen if you'd rather not include it. (We'd love it if you kept it.)</p>

<h2>Tips for videos that get watched</h2>
<ul>
  <li>Start on the hook: drag the slider to the chorus or drop before exporting.</li>
  <li>Turn on <strong>Show song name and artist on the video</strong> in Song details so people know what they're hearing.</li>
  <li>Add your link in the caption or bio: a <a href="/blog/share-song-link-with-artist-info">PulsePic share link</a> lets people hear the song and visit your website.</li>
</ul>
`,
    faqs: [
      { q: 'Is the video export free?', a: 'Yes. Exporting videos is free and you do not need an account.' },
      { q: 'Is my song uploaded to make the video?', a: 'No. The video is made on your phone. Nothing is uploaded unless you separately create a share link.' },
      { q: 'What resolution are the videos?', a: '1080p: 1080×1920 for Story / Reel, 1080×1080 for Square and 1080×1350 for Feed.' },
      { q: 'Can I export only the chorus?', a: 'Yes. Drag the song slider to where the chorus starts, then export. The video starts from the slider position.' },
      { q: 'Does it work for TikTok and YouTube Shorts?', a: 'Yes. Use the Story / Reel (9:16) format; it is the vertical size TikTok and Shorts use.' },
    ],
  },

  {
    slug: 'share-song-link-with-artist-info',
    icon: '🔗', image: '/img/icons/share-links.webp',
    feature: 'Share links',
    title: 'How to Share Your Song as a Link With a Pulsing Picture and Artist Info',
    seoTitle: 'Share Your Song as a Link With Artist Info',
    description: 'Create a PulsePic share link: a mini landing page with your pulsing cover art, your song, artist name, album and website. Looks great in texts and socials.',
    keywords: ['share song link', 'music landing page', 'song link with cover art', 'artist promo link', 'smart link for musicians'],
    answer: 'In the PulsePic player, tap Share, confirm you own the music or have permission, and tap Create link. You get a pulsepic.com link to a page that plays your song with your pulsing picture and effects, and shows the song name, artist, album and a button to your website. Links without an account last 30 days; sign in with Google or Apple to keep them forever.',
    body: `
<h2>What does the share page show?</h2>
<ul>
  <li>Your picture, pulsing to the song with the exact effects and settings you chose.</li>
  <li>The song, ready to play with one tap.</li>
  <li>Song name, artist, and album if you added one.</li>
  <li>A button to the artist's website, so listeners can find more music, merch or shows.</li>
  <li>A <a href="/blog/jam-counter-song-plays">jam counter</a> showing how many times it's been played.</li>
</ul>
<p>When you paste the link into a text, DM or post, it shows a preview with your picture, so it stands out in the conversation.</p>

<h2>How to create a share link</h2>
<ol class="steps">
  <li>Add your picture and song on pulsepic.com and set your <a href="/blog/beat-synced-effects-and-presets">effects</a>.</li>
  <li>Tap <strong>Details</strong> and fill in the song name and artist (album and website are optional).</li>
  <li>Tap <strong>Share</strong>, tick <strong>I own this music or have permission to share it</strong>, and tap <strong>Create link</strong>.</li>
  <li>Copy the link, or tap <strong>Share…</strong> to send it straight to any app.</li>
</ol>

<h2>How long do share links last?</h2>
<p>Without an account, a link lasts <strong>30 days</strong>. After that, the page, picture and song are deleted automatically. <strong>Sign in with Google or Apple</strong> and your links never expire. If you made links before signing in, sign in on the same phone within the 30 days and they move into your account.</p>

<h2>Will my song show up on the PulsePic homepage?</h2>
<p>By default, new links can appear in the "Fresh on PulsePic" row on the homepage, which helps new listeners find your music. Don't want that? Untick <strong>Show on the PulsePic homepage</strong> when you create the link, or change it later when you <a href="/blog/edit-share-link-without-changing-url">edit the link</a>. Only the picture, song name and artist are shown there.</p>

<h2>Can I share music I didn't make?</h2>
<p>Only share songs you own or have permission to share. Share links are perfect for artists, producers, DJs and labels promoting their own releases. If you just want to make a video of a song for yourself, use <a href="/blog/instagram-reels-stories-video">video export</a> instead, which keeps everything on your phone.</p>

<h2>Who can see my link?</h2>
<p>Anyone who has the link can open it. It doesn't need an account or an app to play. You can delete a link at any time from <strong>My links</strong>, which removes the page, the picture, the song and its play count.</p>
`,
    faqs: [
      { q: 'Do listeners need an account or an app?', a: 'No. Share pages open in any browser on any device and play with one tap.' },
      { q: 'How long does a share link last?', a: '30 days without an account. Links you make while signed in with Google or Apple never expire.' },
      { q: 'Can I add my website to the share page?', a: 'Yes. Add it under Song details (Artist website) and the page shows a button to it.' },
      { q: 'Can I change the link after sharing it?', a: 'Yes, if you are signed in: edit the effects, picture or details and the same link updates for everyone.' },
      { q: 'How big can the song file be?', a: 'Up to 40 MB after PulsePic compresses it. Studio files like WAV are converted to MP3 on your phone first, so most songs fit easily.' },
    ],
  },

  {
    slug: 'jam-counter-song-plays',
    icon: '🔥',
    feature: 'Jam counter',
    title: 'What "This Has Been Jammed X Times" Means: How PulsePic Counts Plays',
    seoTitle: 'How the PulsePic Jam Counter Counts Plays',
    description: 'Every PulsePic share page shows how many times it has been played. Here is what counts as a jam, how often it counts, and where to see your numbers.',
    keywords: ['song play counter', 'track plays', 'share page plays', 'music link analytics', 'jam counter'],
    answer: 'The jam counter at the top of every PulsePic share page shows how many times the song has been played. A play counts once someone has listened for at least 5 seconds, and each browser counts at most once per day, so quick taps and replays don\'t inflate the number. You can see the count for each of your links in My links.',
    body: `
<h2>Where do I see the jam count?</h2>
<ul>
  <li><strong>On the share page</strong>: at the top it says "🔥 This has been jammed X times!" Before the first play it says "Be the first to jam this!"</li>
  <li><strong>In My links</strong>: when you're signed in, each of your links shows its jam count, so you can see which songs are getting the most love.</li>
</ul>

<h2>What counts as a jam?</h2>
<p>A jam is a real listen, not just a page view. It counts when:</p>
<ul>
  <li>the listener has heard <strong>at least 5 seconds</strong> of the song, and</li>
  <li>that browser <strong>hasn't already counted a jam for this song today</strong>.</li>
</ul>
<p>So if someone plays your song ten times in an afternoon, it counts once that day. If they come back tomorrow and play it again, that's another jam. This keeps the number honest and hard to inflate by refreshing.</p>

<h2>Why 5 seconds?</h2>
<p>It filters out accidental taps and people who bounce straight away, while still counting anyone who actually gave the song a listen.</p>

<h2>How to get more jams</h2>
<ul>
  <li>Post an <a href="/blog/instagram-reels-stories-video">exported video</a> to Reels, Stories or TikTok and put the share link in your bio or caption.</li>
  <li>Send the link directly: its preview shows your picture, which gets more taps than a plain link.</li>
  <li>Keep it on the homepage: leave <strong>Show on the PulsePic homepage</strong> ticked so new visitors can find it in "Fresh on PulsePic".</li>
  <li>Freshen it up: <a href="/blog/edit-share-link-without-changing-url">edit the picture or effects</a> without losing your count or changing the link.</li>
</ul>

<h2>Is the count private?</h2>
<p>The number is public on the share page, so it doubles as social proof. PulsePic counts plays without identifying who played them.</p>
`,
    faqs: [
      { q: 'Does refreshing the page add a jam?', a: 'No. Each browser counts at most one jam per song per day, and only after 5 seconds of listening.' },
      { q: 'Does editing my link reset the jam count?', a: 'No. Editing the picture, effects or details keeps the same link and the same count.' },
      { q: 'Do my own plays count?', a: 'Yes, like anyone else\'s: once per day per browser, after 5 seconds.' },
      { q: 'What happens to the count if I delete the link?', a: 'Deleting a link removes the page, its files and its play count.' },
    ],
  },

  {
    slug: 'upload-wav-studio-files',
    icon: '🎚️', image: '/img/icons/studio-files.webp',
    feature: 'Studio files',
    title: 'Can I Use a WAV File? Uploading Studio Masters to PulsePic',
    seoTitle: 'Can I Use a WAV File? Studio Masters on PulsePic',
    description: 'Yes. PulsePic accepts WAV, AIFF and FLAC studio files, analyzes the beat from the original, and shrinks them to MP3 on your phone before uploading.',
    keywords: ['upload wav file', 'wav to mp3 on phone', 'share wav song', 'studio master', 'flac aiff upload'],
    answer: 'Yes. PulsePic works with WAV, AIFF and FLAC files as well as MP3, M4A, AAC and OGG. The beat is found from your original file. If you create a share link, PulsePic converts studio files to a high-quality MP3 on your phone first, so the upload is small and the share page loads fast. The original file never leaves your phone.',
    body: `
<h2>Which audio files work?</h2>
<p>Any format your phone's browser can play, including <strong>MP3, M4A, AAC, WAV, AIFF, FLAC and OGG</strong>. That covers bounces straight out of most DAWs and files sent by your engineer or producer.</p>

<h2>What happens to a WAV file when I share it?</h2>
<p>A 4-minute WAV is around 40 MB, which is slow to upload and slow for listeners to load. So when you create a <a href="/blog/share-song-link-with-artist-info">share link</a>, PulsePic converts WAV, AIFF and FLAC files to MP3 <strong>on your phone</strong>, with a progress bar while it works:</p>
<ul>
  <li><strong>192 kbps</strong> for stereo songs, <strong>128 kbps</strong> for mono.</li>
  <li>The beat timing is kept exactly in line with the original, so the pulse stays on the beat.</li>
  <li>Any other file over 40 MB is compressed the same way.</li>
</ul>
<p>The finished upload can be up to 40 MB, which fits songs well over half an hour long at these settings.</p>

<h2>Does compressing change the video quality?</h2>
<p>No. <a href="/blog/instagram-reels-stories-video">Video export</a> uses the song you picked, straight from your phone, and encodes the audio for the video itself. Compression only applies to the copy uploaded for a share link.</p>

<h2>Will PulsePic read my song's title and artist?</h2>
<p>For MP3 files with tags, yes: PulsePic fills in the song name, artist and album from the file automatically. WAV files usually don't carry tags, so just type the details in under <strong>Song details</strong>.</p>

<h2>What about my picture?</h2>
<p>Use any image your phone can open: cover art, photos, flyers or screenshots. For share links, PulsePic saves a copy as a JPEG up to 1600 pixels on the long side, which keeps the page fast while still looking sharp on any phone.</p>

<h2>Tips for the best result</h2>
<ul>
  <li>Use your final master, not a rough mix: the beat detection loves a clear, punchy low end.</li>
  <li>Square cover art (like 3000×3000) looks best, especially with the Circle effect.</li>
  <li>On a slow connection, stay on the page until the upload finishes.</li>
</ul>
`,
    faqs: [
      { q: 'Is my original WAV file uploaded?', a: 'No. Only the compressed MP3 copy is uploaded, and only if you create a share link. The original stays on your phone.' },
      { q: 'What bitrate does PulsePic use?', a: '192 kbps MP3 for stereo files and 128 kbps for mono.' },
      { q: 'Can I upload a FLAC or AIFF file?', a: 'Yes. FLAC and AIFF are converted to MP3 on your phone before uploading, just like WAV.' },
      { q: 'What is the maximum song size?', a: '40 MB after compression, which at 192 kbps is roughly 29 minutes of stereo audio.' },
    ],
  },

  {
    slug: 'edit-share-link-without-changing-url',
    icon: '✏️', image: '/img/icons/editing.webp',
    feature: 'Editing',
    title: 'How to Edit a PulsePic Share Link Without Changing the URL',
    seoTitle: 'Edit Your PulsePic Share Link, Keep the Same URL',
    description: 'Change the picture, effects, song details or homepage setting of a PulsePic share link at any time. The link stays the same and updates for everyone.',
    keywords: ['edit share link', 'update song page', 'change cover art', 'edit music link', 'pulsepic my links'],
    answer: 'Sign in, tap your account button, open My links and tap Edit on the song. PulsePic opens it in the player, where you can change the effects, strength, sync mode, song details and picture. Tap Save changes and the same link updates for everyone, usually within a minute. Your jam count is kept.',
    body: `
<h2>What can I change?</h2>
<ul>
  <li><strong>Effects and presets</strong>, Strength, Sensitivity and the Sync to mode.</li>
  <li><strong>Song details</strong>: song name, artist, album and website.</li>
  <li><strong>The picture</strong>: tap <strong>Change picture</strong> in the save screen to swap the artwork.</li>
  <li><strong>Homepage visibility</strong>: show or hide the song in "Fresh on PulsePic".</li>
</ul>
<p>The song itself can't be swapped on an existing link, since the link and its jam count belong to that song. For a new version or remix, create a new link.</p>

<h2>How to edit a link, step by step</h2>
<ol class="steps">
  <li>Open pulsepic.com on your phone and <strong>sign in</strong> (top right).</li>
  <li>Tap your account button to open <strong>My links</strong>.</li>
  <li>Tap <strong>Edit</strong> on the song you want to change. It opens in the player with its current settings.</li>
  <li>Make your changes: effects, details or picture.</li>
  <li>Tap <strong>Share</strong>, then <strong>Save changes</strong>.</li>
</ol>
<p>Anyone opening the link will see the new version. It can take up to a minute to show up everywhere.</p>

<h2>Why keep the same link?</h2>
<p>Your link is probably already in your bio, in old posts and in people's messages. Editing in place means all of those keep working, and your <a href="/blog/jam-counter-song-plays">jam count</a> keeps growing instead of starting over.</p>

<h2>Do I need an account to edit?</h2>
<p>Yes. Editing is tied to your account so that only you can change your links. If you made a link before signing in, sign in on the same phone within 30 days and it moves into your account, ready to edit. <a href="/blog/privacy-files-and-accounts">Here's how accounts work</a>.</p>

<h2>Other things you can do in My links</h2>
<ul>
  <li><strong>Copy</strong> a link to paste anywhere.</li>
  <li><strong>Open</strong> the share page to check how it looks.</li>
  <li><strong>Delete</strong> a link to remove the page, picture, song and play count.</li>
</ul>
`,
    faqs: [
      { q: 'Does editing change my share link?', a: 'No. The URL stays exactly the same; only what the page shows changes.' },
      { q: 'How long until my edits show up?', a: 'Usually right away, and within about a minute everywhere.' },
      { q: 'Can I replace the song on a link?', a: 'No. Each link belongs to one song. Create a new link for a new version.' },
      { q: 'Will editing reset my jam count?', a: 'No. The count is kept when you edit.' },
    ],
  },

  {
    slug: 'privacy-files-and-accounts',
    icon: '🔒',
    feature: 'Privacy and accounts',
    title: 'Do My Files Stay Private? How PulsePic Handles Your Picture, Song and Account',
    seoTitle: 'Is PulsePic Private? Your Files and Your Account',
    description: 'PulsePic works on your phone. Nothing is uploaded unless you create a share link. Guest links last 30 days; sign in with Google or Apple to keep them.',
    keywords: ['is pulsepic safe', 'private music app', 'no upload video maker', 'pulsepic account', 'pulsepic free'],
    answer: 'Your picture and song stay on your phone while you use PulsePic: the beat analysis, effects and video export all happen on the device. Files are only uploaded when you tap Create link to make a share page. You don\'t need an account to use PulsePic; signing in with Google or Apple just keeps your share links forever instead of 30 days.',
    body: `
<h2>What stays on my phone?</h2>
<ul>
  <li><strong>Beat analysis</strong>: PulsePic studies your song on your phone.</li>
  <li><strong>Effects and preview</strong>: everything you see in the player is drawn on your phone.</li>
  <li><strong>Video export</strong>: the MP4 is made on your phone and saved to it. Nothing is uploaded.</li>
</ul>

<h2>When is something uploaded?</h2>
<p>Only when you create a <a href="/blog/share-song-link-with-artist-info">share link</a>. Then PulsePic uploads a copy of the picture (as a JPEG, up to 1600 px) and the song (compressed to MP3 if it's a <a href="/blog/upload-wav-studio-files">studio file</a>), plus the song details and effect settings you chose. Anyone with the link can see and hear them, so only share music you own or have permission to share.</p>

<h2>Do I need an account?</h2>
<p>No. You can make pulsing pictures, export videos and create share links without signing in. An account adds:</p>
<ul>
  <li><strong>Links that never expire</strong> (guest links are deleted after 30 days).</li>
  <li><strong>My links</strong>: every link you've made, with jam counts, in one place.</li>
  <li><strong><a href="/blog/edit-share-link-without-changing-url">Editing</a></strong> links without changing the URL.</li>
</ul>
<p>Sign-in uses Google or Apple, so there's no new password to remember. Links you made as a guest on the same phone move into your account when you sign in.</p>

<h2>How do I delete my stuff?</h2>
<p>Open <strong>My links</strong> and tap <strong>Delete</strong> on any link. That removes the share page, the uploaded picture and song, and the play count. Guest links clean themselves up after 30 days.</p>

<h2>Does PulsePic track me?</h2>
<p>PulsePic keeps simple counts, like how many songs are shared, videos exported and jams played, to see what's working. Jams are counted without identifying who played them.</p>

<h2>Is PulsePic really free?</h2>
<p>Yes: 100% free to use… until the hosting bill says otherwise. There's no app to buy and no subscription.</p>
`,
    faqs: [
      { q: 'Is my song uploaded when I make a video?', a: 'No. Videos are made and saved on your phone. Uploads only happen when you create a share link.' },
      { q: 'Do I need an account to use PulsePic?', a: 'No. An account is optional; it keeps your share links forever and lets you edit them.' },
      { q: 'How do I sign in?', a: 'Tap Sign in at the top right and choose Google or Apple.' },
      { q: 'What happens to links I made before signing in?', a: 'Sign in on the same phone within 30 days and they move into your account and stop expiring.' },
      { q: 'Is PulsePic free?', a: 'Yes. It is free to use, with no subscription and nothing to install.' },
    ],
  },
];
