<details><summary>Table of Contents</summary>

<!-- toc -->
- [Overview](#overview)
	* [Features](#features)
- [Installation](#installation)
- [Configuration](#configuration)
	* [Hot Reloading](#hot-reloading)
	* [Monitors](#monitors)
	* [Mail Settings](#mail-settings)
	* [Twilio Settings](#twilio-settings)
	* [Misc Settings](#misc-settings)
- [Usage](#usage)
	* [Single File](#single-file)
	* [Multiple Files](#multiple-files)
	* [Line Matching](#line-matching)
		+ [Regular Expressions](#regular-expressions)
		+ [Match Modes](#match-modes)
			- [Checksums](#checksums)
	* [Flood Control](#flood-control)
		+ [Max Lines](#max-lines)
		+ [Max Alerts Per Hour](#max-alerts-per-hour)
		+ [Poll Frequency](#poll-frequency)
	* [Email Alerts](#email-alerts)
		+ [Custom Email Template](#custom-email-template)
	* [SMS Alerts](#sms-alerts)
		+ [Custom SMS Template](#custom-sms-template)
	* [Web Hook Alerts](#web-hook-alerts)
	* [Shell Exec Alerts](#shell-exec-alerts)
	* [Complete Example](#complete-example)
- [Logging](#logging)
- [Development](#development)
- [License (MIT)](#license-mit)

</details>

# Overview

**LogAlert** monitors live log files on any server, and looks for specific pattern matches.  If found, all matching lines can be e-mailed to a customizable e-mail recipient, sent to any phones via SMS ([Twilio](https://www.twilio.com/)), or sent to any URL via HTTP POST.  This system was originally designed to monitor database logs, looking for process crashes (killed by the kernel), and other fatal errors as well.  However, it can be used to monitor all kinds of text files (not only logs), and can monitor entire directories instead of individual files.

LogAlert is shipped as a precompiled binary for Linux, macOS and Windows, and thus has no dependencies.  It is configured via a [JSON](https://www.json.org/json-en.html) file.

## Features

- Live log monitoring with regular expression matching and e-mail alerts.
- Monitor multiple logs at a time with different match criteria and different e-mail addresses.
- Can handle log files with date/time stamps in their filenames / directories.
- Designed to use very little memory and CPU.
- Flood control prevents alert spamming.
- Pre-compiled binary executables with no external requirements.
- JSON configuration file.

# Installation

*(Click each section to expand)*

<details><summary><strong>Linux / macOS</strong></summary>

The easiest way to install LogAlert is to use one of our precompiled binaries.  It can live anywhere on the filesystem, but for these examples we'll place it into the `/opt/logalert` directory.  Make sure you are `root` (superuser) to install this.

```
mkdir /opt/logalert
curl -L https://github.com/jhuckaby/logalert/releases/latest/download/logalert-linux > /opt/logalert/logalert.bin
chmod 755 /opt/logalert/logalert.bin
/opt/logalert/logalert.bin
```

The `linux` binary should work on any 64-bit Linux OS, including RedHat/CentOS and Debian/Ubuntu.  If you are installing on macOS, replace `linux` with `macos` in the URL.  On first run a sample configuration file is created for you.

Alternatively, if you already have [Node.js](https://nodejs.org/) on your server, you can install LogAlert via [npm](https://www.npmjs.com/) like this:

```
sudo npm install -g logalert
```

This has the benefit of allowing you to easily add it as a startup service:

```
sudo logalert boot
```

And start it as a background daemon:

```
sudo logalert start
```

</details>

<details><summary><strong>Microsoft Windows</strong></summary>

To install LogAlert on Microsoft Windows, please download our precompiled binary executable (EXE):

https://github.com/jhuckaby/logalert/releases/latest/download/logalert-win.exe

It is highly recommended that you create a dedicated folder for this, as it writes a couple of companion files alongside the executable.  Example location:

```
C:\Users\MyUser\LogAlert\
```

Place the EXE into your newly-created folder, and double-click it.  On first launch a sample configuration JSON file is created for you, which will be saved into the same folder with filename `config.json`.  You will need a text editor to edit the file, such as `NOTEPAD.EXE`.  Right-click on the JSON file to "Open With" the editor application of your choice.

To set LogAlert to automatically startup on boot, see [this guide](https://www.lifewire.com/add-startup-programs-on-windows-10-4801897).

</details>

# Configuration

LogAlert is configured via a JSON text file named `config.json`.  A sample file is created for you on first run of the app.  Here is an example file:

```json
{
	"monitors": [
		{
			"name": "Test Monitor",
			"path": "/Users/me/logalert/test.txt",
			"match": "ALERT",
			"email": "myemail@server.com"
		}
	],
	"mail_settings": {
		"host": "localhost",
		"port": 25,
		"secure": false,
		"from": "admin@localhost"
	},
	"sleep": 5,
	"echo": true,
	"verbose": 3
}
```

As you can see, the file is split up into sections.  There is a list of `monitors` (see [Monitors](#monitors) below), a section for `mail_settings` (see [Mail Settings](#mail-settings) below), and some additional properties at the bottom (see [Misc Settings](#misc-settings) below).

Here are all the top-level properties you can define in the `config.json` file:

| Property Name | Type | Description |
|---------------|------|-------------|
| `monitors` | Array | **(Required)** A list of all the monitors you want to define.  See [Monitors](#monitors) below. |
| `sleep` | Number | **(Required)** The number of seconds to sleep between file checks.  See [Misc Settings](#misc-settings) below. |
| `echo` | Boolean | **(Required)** Set this to `true` to output all log entries to the console, or `false` to run quiet.  See [Logging](#logging) below. |
| `verbose` | Number | **(Required)** Set the log verbosity from `1` (quietest) to `3` (loudest).  See [Logging](#logging) below. |
| `color` | Boolean | Optionally enable ANSI color in the LogAlert output.  See [Misc Settings](#misc-settings) below. |
| `mail_settings` | Object | Optionally configure your mail host for sending e-mail.  See [Mail Settings](#mail-settings) below. |
| `twilio_settings` | Object | Optionally configure settings for sending direct SMS messages.  See [Twilio Settings](#twilio-settings) below. |
| `log_file` | String | Optionally specify a custom log file location.  See [Logging](#logging) below. |
| `log_columns` | Array | Optionally customize the log columns.  See [Logging](#logging) below. |

Note that JSON is rather strict with its syntax.  You must make sure that all curly braces and brackets are balanced, all quotes are doubled, and there are no trailing commas.  If you have trouble formatting the file, it may help to use a text editor with JSON validation features, such as [Atom](https://atom.io/) (free).

**Note for Windows Users**: File paths on Windows use backslashes, and these must be "escaped" in JSON strings.  Meaning, a path like `c:\Users\MyUser\MyFile.txt` must be written in JSON with double-backslashes like this: `c:\\Users\\MyUser\\MyFile.txt`.

## Hot Reloading

LogAlert will automatically reload its configuration file if you make changes while it is running.  It checks the file at the same frequency as it monitors your files for changes.  Just make sure to check the console (Terminal window) for any errors!

Note that when the configuration is hot-reloaded, it resets the internal state.  This means that things like the number of alerts fired per hour is reset to zero, and the position inside each file for tracking appended content is reset to the current length.  In essence, it performs an internal "soft restart", similar to if you quit and relaunched the app.

## Monitors

The `monitors` section is where you describe the file(s) you want to watch, and tell it how to detect an alert.  The section is an array (a list) so you can define multiple monitors for different files or folders, each with its own settings.  Additional monitors should be separated by commas.  Here is an example containing two monitors:

```json
"monitors": [
	{
		"name": "Test Monitor",
		"path": "/Users/me/logalert/test.txt",
		"match": "ALERT",
		"email": "myemail@server.com"
	},
	{
		"name": "Test #2",
		"path": "/some/other/path/*",
		"match": "ERROR",
		"sms": "+1888555122"
	}
],
```

The above configuration defines two different monitors:

- The first watches a single file (`/Users/me/logalert/test.txt`), and looks for any appended lines that contain the phrase `ALERT`.  If found, an e-mail is dispatched to `myemail@server.com`.
- The second monitor watches **all files** in the `/some/other/path/` folder.  This is denoted by the asterisk wildcard (`*`).  It scans all the files for additions that match `ERROR`, and if found, an SMS message is dispatched to `+1888555122`.

Here are all the properties you can define for each monitor:

| Property Name | Type | Description |
|---------------|------|-------------|
| `name` | String | **(Required)** The name for the monitor.  This is included in all e-mail and SMS alerts, as well as the main log file, and is used to identify the monitor. |
| `path` | String | **(Required)** The file path or wildcard (glob) for monitoring multiple files.  See [Single File](#single-file) and [Multiple Files](#multiple-files) below. |
| `match` | String | **(Required)** The keyword match string to trigger alarms.  This is the phrase to look for inside the monitored files.  See [Line Matching](#line-matching) below. |
| `regexp` | Boolean | Set this to `true` to interpret `match` as a regular expression instead of a literal string match.  See [Regular Expressions](#regular-expressions) below for details. |
| `mode` | String | Optionally customize the mode in which matches are made in the file.  The default is to only watch for **appended** content (i.e. for a log file or a CSV file that is written progressively).  See [Match Modes](#match-modes) below. |
| `checksum` | Boolean | Optionally perform a checksum (fingerprint) of the entire file's contents on every detected change, so only actual changes are considered for alerts.  This only takes effect if `mode` is set to `"whole"`.  See [Checksums](#checksums) below. |
| `email` | String | When an alert is triggered, set this to the recipient e-mail address or addresses (comma-separated).  See [Email Alerts](#email-alerts) below. |
| `email_template` | String | For sending e-mails, use this to optionally customize the e-mail subject and body to your liking.  See [Custom Email Template](#custom-email-template) below. |
| `sms` | String | When an alert is triggered, you can use this to send SMS messages to one or more mobile phones (requires Twilio account).  See [SMS Alerts](#sms-alerts) below. |
| `sms_template` | String | For sending SMS alerts, use this to optionally customize the SMS message body to your liking.  See [Custom SMS Template](#custom-sms-template) below. |
| `url` | String | When an alert is triggered, you can use this to send a HTTP POST to a custom URL.  See [Web Hook Alerts](#web-hook-alerts) below. |
| `exec` | String | When an alert is triggered, you can use this to execute any shell command on the local machine.  See [Shell Exec Alerts](#shell-exec-alerts) below. |
| `max_lines` | Number | Optionally set a maximum number of matched lines to include in alert messages.  See [Max Lines](#max-lines) below. |
| `max_per_hour` | Number | Optionally set a maximum number of alerts to send per hour.  See [Max Alerts Per Hour](#max-alerts-per-hour) below. |

## Mail Settings

If you want to send e-mails for your alerts, you'll need to configure the `mail_settings` object.  This generally points at a SMTP server, but you can have it launch a local [sendmail](https://en.wikipedia.org/wiki/Sendmail) binary as well.  These options are passed directly to [nodemailer](https://nodemailer.com/smtp/), so please see their docs for full details.  Here is an example of using SMTP running on localhost:

```json
"mail_settings": {
	"host": "localhost",
	"port": 25,
	"secure": false,
	"from": "admin@localhost"
},
```

Here is how to use local sendmail via the command-line:

```json
"mail_settings": {
	"sendmail": true,
	"newline": "unix",
	"path": "/usr/sbin/sendmail",
	"from": "admin@localhost"
},
```

Note that many SMTP servers require authentication.  This is done by specifying an `auth` object.  Here is an example using my local ISP's mail server.  They listen on a different port (587), and require user authentication for mail relay:

```json
"mail_settings": {
	"host": "mail.mcn.org",
	"port": 587,
	"secure": false,
	"auth": {
		"user": "jsmith",
		"pass": "********"
	},
	"from": "jsmith@mcn.org"
},
```

Once this is configured, you can simply add an `email` property into your monitor configurations, and set it to one or more email addresses (comma-separated) to send out e-mail alerts.  See [Email Alerts](#email-alerts) below.

## Twilio Settings

If you want to send direct SMS messages for your alerts, you will need to configure the `twilio_settings` object, and also create your own [Twilio](https://www.twilio.com/) account.  Here is an example configuration:

```json
"twilio_settings": {
	"sid": "c2d0e2446335350c6cada99782d32c3a",
	"auth": "1b74dad8cc27b61347829743327b2e20",
	"from": "+18885551212"
},
```

Twilio provides you with a `sid` and an `auth` key for authorizing the use of their API.  Also, make sure to set the `from` property to your official Twilio-assigned phone number.

Once this is configured, you can simply add an `sms` property into your monitor configurations, and set it to one or more mobile numbers (comma-separated) to send out SMS alerts.  See [SMS Alerts](#sms-alerts) below.

## Misc Settings

There are a few miscellaneous settings at the bottom of the `config.json` file.  Here is what these look like:

```json
"sleep": 5,
"echo": true,
"verbose": 3,
"color": false
```

The `sleep` property controls how frequently LogAlert polls your files for changes, in seconds.  It defaults to `5` seconds, but you can set it to any number you want.  Lower numbers mean it will react to changes more quickly, but it has to hit your hard disk more frequently, so keep that in mind.

The `echo` property controls whether LogAlert emits information to the console (or Terminal window), so you can see what is happening without having to read its log file.  This defaults to `true`.  Set this to `false` to run quietly and not emit any information to the console.

The `verbose` property controls the logging level.  Lower numbers like `1` mean that it will only log when alerts fire, whereas `2` and `3` are increasingly verbose, meaning that LogAlert will emit additional information about what is happening.  See [Logging](#logging) below for more details.

The `color` property enables ANSI color output for LogAlert in the console (Terminal window).  This defaults to `false` (disabled).  Set to `true` to enable color output.  Please make sure your Terminal supports ANSI color before enabling this, as it can cause undesired effects.

# Usage

This section describes how to use LogAlert in detail.  The `config.json` configuration file may include one or more "monitors", which are entries in the `monitors` list.  Each monitor points to a single file or multiple files, defines how to identify alerts in the files, and specifies actions to take when an alert fires.  Here is an example monitor:

```json
{
	"name": "Test Monitor",
	"path": "/Users/me/logalert/test.txt",
	"match": "ALERT",
	"email": "myemail@server.com"
}
```

## Single File

For monitoring single files, you need to specify the full filesystem path to the file in your monitor configuration via the `path` property.  Here is an example for Linux or macOS:

```json
"path": "/home/jsmith/files/mylog.txt"
```

For Microsoft Windows you need to use this syntax:

```json
"path": "c:\\Users\\MyUser\\MyFiles\\MyLog.txt"
```

Notice that for Windows the backslashes are duplicated (escaped).  This is a requirement of the JSON syntax when specifying backslashes inside strings.

## Multiple Files

For monitoring multiple files at once, you can use a [filesystem glob](https://en.wikipedia.org/wiki/Glob_%28programming%29).  This is a special syntax for specifying things like wildcards (i.e. match any file in a directory).  For example:

```json
"path": "/home/jsmith/files/*.txt"
```

This would monitor all files in the `/home/jsmith/files` folder that had a `.txt` suffix.  The special asterisk (`*`) is a wildcard, meaning "match anything here".

Here is an example for Windows:

```json
"path": "c:\\Users\\MyUser\\MyFiles\\*"
```

This would monitor all files in the `c:\Users\MyUser\MyFiles` folder regardless of their filename.  This includes all existing files, and files that may appear later after LogAlert is running.

## Line Matching

LogAlert needs to be told how to identify an alert in your files.  This is done by specifying a search string (keyword or phrase) to match inside the file, using the `match` property.  Example:

```json
"match": "ALERT"
```

This would trigger an alert when the keyword `ALERT` appeared in the monitored file.  Note that the text is matched **case-sensitively**, so if the word `alert` or `Alert` appeared in the file, it would **not** trigger.  For more complicated matching options, see below.

### Regular Expressions

You can optionally instruct LogAlert to match using a [regular expression](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions).  This is a special syntax that allows you to define complex matching behavior, which goes beyond simple string matching.  To use this, you need to define an additional `regexp` property and set it to `true`.  Example:

```json
"match": "ALERT|WARNING",
"regexp": true
```

In this case the regular expression is defining an OR (`|`) match, meaning it would match either `ALERT` or `WARNING`.  See the [MDN guide](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions) for more details on how to format regular expressions.

### Match Modes

By default, LogAlert only pays attention to *additions* made to your monitored files.  Meaning, it keeps track of the file sizes, and only examines content that is appended to them.  This makes sense for monitoring things like log files, or possibly CSV files that are progressively written to.  However, LogAlert has another mode which can examine the **entire file's contents** on every change.  This is activated by including a `mode` property in your monitors, and setting it to `"whole"`.  Example:

```json
"mode": "whole"
```

The difference here is that with `whole` mode, when a file change is detected (either a new file appearing or an existing file being updated) the **whole** file is re-scanned for possible alerts, top to bottom.  This mode makes sense when you have a system that is "rewriting" (replacing) files instead of appending to them.

#### Checksums

When using `whole` mode (see above), LogAlert has an optional feature which can compute a checksum (i.e. a fingerprint) of your file's contents, and only act if the checksum has changed.  This is useful when you have a system that is continually rewriting files on disk (causing their modification dates to update, and thereby registering a change), but the actual file content isn't changing.  Using checksum mode, LogAlert will only re-scan the file for alerts if the actual content of the file has changed.  To use this feature, add a `checksum` property to your monitor, and set it to `true`.  Example:

```json
"mode": "whole",
"checksum": true
```

The checksum feature only has effect when using `whole` file mode.

## Flood Control

LogAlert has several ways to manage "flood control".  That is, to control a flood of alerts that may occur.  For example, if your system goes haywire and appends 10,000 alert-triggering lines to your monitored files, you certainly don't want 10,000 e-mails being sent!  These features assist with managing flood situations.

### Max Lines

You can limit the number of matched lines that are included in outgoing e-mails and SMS messages.  This is one way to manage a runaway alert situation, so that your e-mails aren't gargantuan in size.  To limit the maximum number of matched lines to include in alert messages, set a `max_lines` property to the maximum number you want.  Example:

```json
"max_lines": 50
```

This property must be configured per each monitor.

### Max Alerts Per Hour

You can also limit the maximum number of alerts to allow per hour.  This is a great way to manage flood control, as you can set this to a very low number, as low as `1` per hour.  Then, after the first alert, whatever else happens during the hour, it will **not** send out another alert, even if the file blows up.  To use this feature, include a `max_per_hour` property, and set it to the maximum number of alerts you want to allow per hour:

```json
"max_per_hour": 3
```

This property must be configured per each monitor.

### Poll Frequency

Finally, you can limit the poll frequency, to check for file changes at a slower rate (i.e. a longer sleep delay between checks).  The default poll frequency is 5 seconds.  If you don't need LogAlert to respond to alerts that quickly, it is recommended that you increase this value.  To do this, set the `sleep` property to a higher value (specified in seconds).  Here is how to make it check every minute:

```json
"sleep": 60
```

**Please Note:** The `sleep` property is configured *globally*, not per monitor.  It must be defined outside of your monitors, and live as a top-level `config.json` property, alongside other global props like `echo` and `verbose`. 

## Email Alerts

The most common action to take when an alert fires is to send an e-mail.  To set this up for your alerts, you need to first configure a mail server (see [Mail Settings](#mail-settings) above), and then specify one or more e-mail recipients in your monitors via the `email` property.  Example:

```json
"email": "jhuckaby@gnail.com, rrussell@fmail.com"
```

As you can see, you can specify multiple recipients if you want -- just separate them with commas.

Here is an example e-mail alert:

```
To: jhuckaby@gnail.com
From: admin@localhost.com
Subject: LogAlert for Test Monitor: /Users/jhuckaby/git/logalert/test.txt
Importance: high

LogAlert Name: Test Monitor
Date/Time: Sun Sep 13 2020 17:19:42 GMT-0700 (Pacific Daylight Time)
Hostname: joe16.local
File Path: /Users/jhuckaby/git/logalert/test.txt

Matched Lines: 
Hey, would you like an ALERT?  I thought so!

End of alert.
```

The e-mail subject line contains the name of your monitor ("Test Monitor" in this example), and the file path that matched.  The e-mail body contains more information, including the local date/time on the server, the server hostname, and all the matched lines (all the lines from the file that matched your custom keyword / phrase).

The e-mail "From" address is configured in the [Mail Settings](#mail-settings).

### Custom Email Template

If you want to customize the e-mail content, including the headers, subject and/or body text, simply include a `email_template` property in your monitor configuration, and stuff your entire template into a string.  Note that you will have to escape EOLs using `\n`, as JSON doesn't allow hard line breaks.  Example:

```json
"email_template": "To: [email]\nFrom: [from]\nSubject: LogAlert for [name]: [file]\nImportance: high\n\nLogAlert Name: [name]\nDate/Time: [date]\nHostname: [hostname]\nFile Path: [file]\n\nMatched Lines:\n[lines]\n\nEnd of alert.\n"
```

The e-mail template needs to contains the raw MIME headers (i.e. To, From, Subject), followed by two EOLs (end-of-line characters), followed by the body text of the e-mail.

As you can see, we use a square-bracket placeholder system in the e-mail template.  These special macros are replaced with dynamic content as each alert is triggered.  Here is a list of all the macros you can include in your e-mail template:

| Macro | Expansion |
|-------|-----------|
| `[email]` | This expands to the recipient e-mail address(es) as specified in the monitor. |
| `[from]` | This expands to the "From" address, as configured in your [Mail Settings](#mail-settings). |
| `[name]` | This expands to the monitor's name, from the `name` property. |
| `[file]` | This expands to the full file path of the file that triggered the alert. |
| `[date]` | This expands to a full date/time stamp, in the local server timezone. |
| `[hostname]` | This expands to the local server hostname. |
| `[pid]` | This expands to the LogAlert PID (Process ID) number. |
| `[lines]` | This expands to all the matched lines from the file. |

## SMS Alerts

For sending SMS messages to mobile phones, LogAlert uses the [Twilio](https://www.twilio.com/) service.  You will need to create a Twilio account, and then configure the [Twilio Settings](#twilio-settings) in your `config.json` file.  Once this is complete, you can specify SMS phone numbers in your monitors using the `sms` property.  Example:

```json
"sms": "+18885551212, +17078773411"
```

It is recommended that you use the phone number format shown above, including the country code prefix (e.g. `+1`), followed by the 10-digit phone number.  If the country code is omitted, it defaults to the United States.  You can send to multiple numbers by separating them with commas.

Here is an example SMS alert message:

```
LogAlert: Test Monitor: /Users/jhuckaby/git/logalert/test.txt

Hey, would you like an ALERT?  I thought so!
```

This is a shortened message format as compared to what is included in LogAlert e-mails.  This is so alerts will better fit into the SMS maximum character length (160 characters).

### Custom SMS Template

If you want to customize the SMS message, simply include a `sms_template` property in your monitor configuration, and stuff your entire template into a string.  Note that you will have to escape EOLs using `\n`, as JSON doesn't allow hard line breaks.  Example:

```json
"sms_template": "LogAlert: [name]: [file]\n\n[lines]\n"
```

As you can see, we use a square-bracket placeholder system in the SMS template.  These special macros are replaced with dynamic content as each alert is triggered.  Here is a list of all the macros you can include in your SMS template:

| Macro | Expansion |
|-------|-----------|
| `[name]` | This expands to the monitor's name, from the `name` property. |
| `[file]` | This expands to the full file path of the file that triggered the alert. |
| `[date]` | This expands to a full date/time stamp, in the local server timezone. |
| `[hostname]` | This expands to the local server hostname. |
| `[pid]` | This expands to the LogAlert PID (Process ID) number. |
| `[lines]` | This expands to all the matched lines from the file. |

## Web Hook Alerts

LogAlert can optionally send out a "web hook" on each alert.  A web hook is basically an HTTP POST web request, sent to any URL that you want.  This can be used to trigger a remote script of some kind, or even send a message to a chat application.  To use the feature, include a `url` property in your monitor configuration, and set it to a fully-qualified URL.  Example:

```json
"url": "http://myserver.com/scripts/my-alert-script.php"
```

The request made to the URL will be a HTTP POST, containing a JSON encoded body describing the alert.  The JSON document will contain the following properties:

| JSON Property | Type | Description |
|---------------|------|-------------|
| `name` | String | The monitor's name, from the `name` property. |
| `file` | String | The full file path of the file that triggered the alert. |
| `date` | String | A full date/time stamp, in the local server timezone. |
| `hostname` | String | The local server hostname. |
| `pid` | String | The LogAlert PID (Process ID) number. |
| `lines` | Array | An array of all the matched lines from the file. |
| `text` | String | A text representation of the alert (identical to the SMS message body). |

## Shell Exec Alerts

LogAlert can optionally execute a local shell command on each alert.  This can be used to trigger some kind of custom action on the server where LogAlert is running.  This works on Linux, macOS and Windows.  To use this, include an `exec` property in your monitor's configuration, and set it to the shell command you want to execute.  It may also contain command-line arguments.  Here is an example:

```json
"exec": "/usr/bin/afplay /path/to/sound.wav"
```

On Linux and macOS, the `/bin/sh` shell is used.  On Windows, `CMD.EXE` is used.

## Complete Example

Here is a complete example configuration showing every feature and option:

```json
{
	"monitors": [
		{
			"name": "Test Monitor",
			"path": "/Users/me/logalert/*.txt",
			"match": "ALERT|ERROR",
			"regexp": true,
			"mode": "whole",
			"checksum": true,
			
			"email": "jhuckaby@gnail.com, rrussell@fmail.com",
			"email_template": "To: [email]\nFrom: [from]\nSubject: LogAlert for [name]: [file]\nImportance: high\n\nLogAlert Name: [name]\nDate/Time: [date]\nHostname: [hostname]\nFile Path: [file]\n\nMatched Lines:\n[lines]\n\nEnd of alert.\n",
			
			"sms": "+18885551212, +17078773411",
			"sms_template": "LogAlert: [name]: [file]\n\n[lines]\n",
			
			"url": "http://myserver.com/scripts/my-alert-script.php",
			"exec": "/usr/bin/afplay /path/to/sound.wav",
			
			"max_lines": 50,
			"max_per_hour": 3
		}
	],
	"mail_settings": {
		"host": "mail.mcn.org",
		"port": 587,
		"secure": false,
		"auth": {
			"user": "jsmith",
			"pass": "********"
		},
		"from": "jsmith@mcn.org"
	},
	"twilio_settings": {
		"sid": "c2d0e2446335350c6cada99782d32c3a",
		"auth": "1b74dad8cc27b61347829743327b2e20",
		"from": "+18885551212"
	},
	"sleep": 5,
	"echo": true,
	"verbose": 9,
	"color": true
}
```

Notice that you can configure multiple actions per alert.  In the above example, an e-mail, an SMS, a URL request and a shell command are all executed as part of each alert.

# Logging

LogAlert keeps its own log file, which contains a copy of everything echoed to the console (Terminal window).  By default, this log file is created in the same directory as the LogAlert executable, and is named `log.txt`.  Here is an example log snippet:

```
[2020-09-13 17:12:57][LogAlert][LogAlert/1.0.0 starting up][]
[2020-09-13 17:12:57][Test Monitor][Performing initial scan: /Users/jhuckaby/git/logalert/test.txt][]
[2020-09-13 17:12:57][Test Monitor][1 files found.][]
[2020-09-13 17:13:07][Test Monitor][Detected change in file: /Users/jhuckaby/git/logalert/test.txt][]
[2020-09-13 17:13:07][Test Monitor][ALERT! Found 2 matching lines in: /Users/jhuckaby/git/logalert/test.txt][["Hello ALERT!","Here's another ALERT."]]
```

The top-level `verbose` property in your `config.json` controls how verbose the console output and the log file are.  A `verbose` level of `1` is the most quiet, and only contains triggered alerts.  A level of `2` is a bit louder, and level `3` is the loudest.  Use these higher levels for troubleshooting issues.

You can customize the location and filename of the log file by including a top-level `log_file` property in your `config.json` file, and setting it to a fully-qualified filesystem path.

You can also optionally customize the log "columns" that are written out.  By default, the following four columns are written for each row:

```
[date][component][msg][data]
```

Here are all the log columns available:

| Log Column | Description |
|------------|-------------|
| `hires_epoch` | This is a high-resolution [Epoch timestamp](https://en.wikipedia.org/wiki/Unix_time) (floating point decimal). |
| `epoch` | This is a standard resolution [Epoch timestamp](https://en.wikipedia.org/wiki/Unix_time) (nearest whole second). |
| `date` | This is a human-readable date/time stamp in the format: `YYYY-MM-DD HH:MI:SS` (in the local server timezone). |
| `hostname` | This is the hostname of the server or PC running the LogAlert script. |
| `pid` | This is the Process ID (PID) of the LogAlert program running on the server. |
| `component` | This is the name of the current monitor, or simply `LogAlert` for generic messages. |
| `code` | This is the log level of the message, from `1` to `3`. |
| `msg` | This is the message text itself. |
| `data` | Any additional data that accompanies the message will be in this column. |

To customize the log columns, include a top-level `log_columns` property in your `config.json` file, and set it to an array of strings, where each string specifies the column.  Example:

```json
"log_columns": ["epoch", "date", "hostname", "component", "code", "msg", "data"]
```

The log columns affect both the log file (`log.txt`) and the console / Terminal output.

# Development

You can install the LogAlert source code by using [Git](https://en.wikipedia.org/wiki/Git) (you'll also need to have [Node.js](https://nodejs.org/) installed):

```
git clone https://github.com/jhuckaby/logalert.git
cd logalert
npm install
```

To repackage the binary executables for Linux, macOS and Windows, run this command:

```
npm run package
```

# License (MIT)

**The MIT License**

*Copyright (c) 2011 - 2020 Joseph Huckaby.*

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
