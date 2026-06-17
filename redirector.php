<?php
// This file lives at https://via.mattmcv.com/index.php.

if ( empty( $_REQUEST['url'] ) ) {
  echo 'Nope!';
  die();
}

$url = htmlspecialchars( urldecode( $_REQUEST['url'] ) );
$url_with_utm_params = $url . '?utm_medium=api&utm_campaign=social_sharing&utm_source=id_262882';
?><!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">

	<title>@soundcloudsaid Redirector</title>

	<link rel="apple-touch-icon" sizes="180x180" href="./favicon.png">
	<link rel="icon" type="image/png" sizes="180x180" href="./favicon.png">

	<!-- Empty meta and OpenGraph tags to discourage preview cards. -->
	<meta name="title" content="" />
	<meta name="description" content="" />
	<meta property="og:type" content="" />
	<meta property="og:url" content="" />
	<meta property="og:title" content="" />
	<meta property="og:description" content="" />
	<meta property="og:image" content="" />
	<meta property="twitter:card" content="" />
	<meta property="twitter:url" content="" />
	<meta property="twitter:title" content="" />
	<meta property="twitter:description" content="" />
	<meta property="twitter:image" content="" />

	<style>
	body {
		font-family: system-ui, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji';
		font-size: 16px;
		line-height: 1.4;
		padding: 12px;
		max-width: 700px;
	}

	h1 {
		font-size: 24px;
		margin-bottom: 1.5rem;
		margin-top: 0;
	}

	p {
		margin-top: 0;
		margin-bottom: 2rem;
	}

	p.redirecting,
	p.url,
	p.countdown {
		font-size: 18px;
		font-weight: bold;
		word-break: break-all;

		&.canceled {
			text-decoration: line-through;
			color: #999;
		}
	}

	p.redirecting,
	p.url {
		margin-bottom: 0.25rem;
	}

	button {
		color: #000;
		padding: 0.5rem;
		border: 1px solid #aaa;
		background: linear-gradient(to bottom, #fafafa, #eee);
		border-radius: 8px;
		font-size: 16px;
		font-weight: bold;
		user-select: none;
		cursor: pointer;

		@media (hover: hover) {
			&:hover {
				transform: scale(1.05);
			}
		}

		&:active {
			background: linear-gradient(to top, #fafafa, #eee);
		}

		&:disabled {
			cursor: default;
			opacity: 0.5;
			pointer-events: none;
		}
	}

	a {
		color: #0099FF;

		@media (hover: hover) {
			&:hover {
				color: darkblue;
			}
		}

		&:active,
		&:visited {
			color: purple;
		}
	}
	</style>
</head>
<body>
	<h1>@soundcloudsaid Redirector</h1>
	<p class="redirecting">Redirecting to</p>
	<p class="url"><a href="<?php echo $url_with_utm_params; ?>"><?php echo $url; ?></a></p>
	<p class="countdown">in 3 seconds</p>
	<p><button class="go" onclick="window.location.href='<?php echo $url_with_utm_params; ?>'">✅ Go now!</button></p>
	<p><button class="stop">❌ Stop redirect</button></p>
	<p>This redirector exists only to prevent preview cards from appearing in <a href="https://mastodon.matthewmcvickar.com/@soundcloudsaid_source">@soundcloudsaid_source</a> posts. I don't want to show usernames, titles, images, or descriptions from SoundCloud uploads without filtering them, and I can&rsquo;t reliably filter them.</p>

	<script>
	const secondsToWait = 3; // Seconds, that is.
	const countdownContainer = document.querySelector('.countdown');
	const countdownEnd = Date.now() + (secondsToWait * 1000); // 3 seconds

	const redirectTimer = setTimeout(() => {
		window.location.href = '<?php echo $url_with_utm_params; ?>';
	}, secondsToWait * 1000);

	const countdownUpdater = setInterval(() => {
		const timeRemaining = Math.max(
			0, Math.ceil((countdownEnd - Date.now()) / 1000)
		);

		countdownContainer.textContent = `in ${timeRemaining} seconds.`;

		if (timeRemaining === 0) {
			countdownContainer.textContent = 'now!';
			clearInterval(countdownUpdater);
		}
	}, 250);

	document.querySelector('.stop').addEventListener('click', (event) => {
		event.preventDefault();

		clearTimeout(redirectTimer);
		clearInterval(countdownUpdater);

		event.target.disabled = true;
		event.target.textContent = '❌ Redirect stopped!';

		document.querySelector('.redirecting').classList.add('canceled');
		document.querySelector('.countdown').classList.add('canceled');
	})
	</script>
</body>
</html>
