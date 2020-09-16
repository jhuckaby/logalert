#!/usr/bin/env node

// Log Alert
// Watches log files and sends alerts on matches
// See: https://github.com/jhuckaby/logalert
// Copyright (c) 2020 Joseph Huckaby, MIT License

const fs = require('fs');
const os = require('os');
const cp = require('child_process');
const Path = require('path');
const Request = require('pixl-request');
const Logger = require('pixl-logger');
const PixlMail = require('pixl-mail');
const cli = require('pixl-cli');
cli.global();

const title = "LogAlert/1.0.0";

const DEFAULT_EMAIL_TEMPLATE = `To: [email]
From: [from]
Subject: LogAlert for [name]: [file]
Importance: high

LogAlert Name: [name]
Date/Time: [date]
Hostname: [hostname]
File Path: [file]

Matched Lines:
[lines]

End of alert.
`;

const DEFAULT_SMS_TEMPLATE = `LogAlert: [name]: [file]

[lines]
`;

const request = new Request(title);
request.setTimeout( 5 * 1000 );
request.setAutoError( true );

const Tools = cli.Tools;
const args = cli.args;
const async = Tools.async;
const glob = Tools.glob;
const win32 = !!(process.platform == 'win32');
const self_bin = Path.resolve( process.pkg ? process.argv[0] : process.argv[1] );
const config_file = Path.join( Path.dirname( self_bin ), 'config.json' );
var config = null;

const app = {
	
	run: function() {	
		// parse config
		try {
			config = this.loadConfig();
		}
		catch (err) {
			customDie("ERROR: " + err);
		}
		
		if (!config.log_columns) {
			config.log_columns = ['date', 'monitor', 'msg', 'data'];
		}
		
		var log_file = config.log_file || Path.join( Path.dirname( self_bin ), 'log.txt' );
		this.logger = new Logger( log_file, config.log_columns, {
			sync: true,
			echo: config.echo || false,
			color: config.color || false,
			debugLevel: config.verbose || 9,
			monitor: "LogAlert"
		} );
		
		this.logDebug(1, title + " starting up");
		
		this.timer = setInterval( this.checkAll.bind(this), config.sleep * 1000 );
		this.checkAll();
	},
	
	loadConfig: function() {
		// load and validate config file
		var cfg = null;
		try {
			cfg = Tools.parseJSON( fs.readFileSync(config_file, 'utf8') );
		}
		catch(err) {
			throw new Error( "Failed to parse configuration file: " + config_file + ":\n\n" + err );
		}
		
		// validate config
		if (!cfg.monitors || !cfg.monitors.length || (typeof(cfg.monitors) != 'object')) {
			throw new Error( "Monitors not defined in configuration." );
		}
		if (!cfg.sleep || (typeof(cfg.sleep) != 'number')) {
			throw new Error( "'sleep' property is missing or not a number." );
		}
		cfg.monitors.forEach( function(monitor, idx) {
			if (!monitor.name) throw new Error("Monitor #" + Math.floor(idx + 1) + "  has no 'name' property.");
			if (!monitor.path) throw new Error("Monitor '" + monitor.name + "' has no 'path' property.");
			if (!monitor.match) throw new Error("Monitor '" + monitor.name + "' has no 'match' property.");
			monitor.match = new RegExp( monitor.regexp ? monitor.match : Tools.escapeRegExp(monitor.match) );
			if (!monitor.mode) monitor.mode = 'append';
		} );
		
		// include mod date in config, for hot reloading
		var stats = fs.statSync(config_file);
		cfg.mod = stats.mtime.getTime() / 1000;
		
		return cfg;
	},
	
	checkAll: function() {
		// called every N seconds, check all monitors
		var self = this;
		
		if (this.checkInProgress) return;
		this.checkInProgress = true;
		
		// check config for hot reload
		var stats = fs.statSync(config_file);
		var mod = stats.mtime.getTime() / 1000;
		
		if (mod != config.mod) {
			config.mod = mod;
			
			try {
				config = this.loadConfig();
				this.logDebug(1, "Hot-reloaded configuration file: " + config_file);
				
				// in case sleep time changed
				clearTimeout( this.timer );
				this.timer = setInterval( this.checkAll.bind(this), config.sleep * 1000 );
				
				// in case log options changed
				this.logger.set({
					echo: config.echo || false,
					color: config.color || false,
					debugLevel: config.verbose || 9
				});
			}
			catch (err) {
				this.logError("Failed to reload configuration file: " + err);
			}
		}
		
		// check all monitors
		async.eachSeries( config.monitors, this.check.bind(this), function() {
			self.checkInProgress = false;
			self.logger.set('monitor', "LogAlert");
		} );
	},
	
	check: function(monitor, callback) {
		// check one monitor
		this.logger.set('monitor', monitor.name);
		if (!monitor.files) return this.setup(monitor, callback);
		
		var self = this;
		var jobs = [];
		
		this.scan( monitor, function(err, files) {
			// check for new files
			for (var file in files) {
				if (!(file in monitor.files)) {
					monitor.files[file] = { file: file, size: 0, mod: 0, checksum: '' };
					self.logDebug(2, "New file detected: " + file);
				}
			}
			
			// check for deleted files
			for (var file in monitor.files) {
				if (!(file in files)) {
					delete monitor.files[file];
					self.logDebug(2, "File has been deleted: " + file);
				}
			}
			
			// check for changed files
			for (var file in files) {
				if ((files[file].size != monitor.files[file].size) || (files[file].mod != monitor.files[file].mod)) {
					if (monitor.checksum) {
						if (files[file].checksum != monitor.files[file].checksum) {
							jobs.push( files[file] );
						}
					}
					else jobs.push( files[file] );
				}
			}
			
			async.eachSeries( jobs,
				function(job, callback) {
					self.processChange( monitor, job, callback );
				},
				callback
			); // eachSeries
		}); // scan
	},
	
	processChange: function(monitor, new_info, callback) {
		// load one change and see if alert fired
		var self = this;
		var file = new_info.file;
		var old_info = monitor.files[file];
		var pos = 0;
		var len = new_info.size;
		
		if ((monitor.mode == 'append') && (new_info.size == old_info.size)) {
			this.logDebug(3, "File has not grown, skipping check (append mode)");
			return callback();
		}
		
		if ((monitor.mode == 'append') && (new_info.size > old_info.size)) {
			pos = old_info.size;
			len = new_info.size - pos;
		}
		
		old_info.size = new_info.size;
		old_info.mod = new_info.mod;
		
		if (len <= 0) {
			// nothing to do
			return callback();
		}
		
		this.logDebug(3, "Detected change in file: " + file);
		
		fs.open( file, 'r', function(err, fd) {
			if (err) {
				self.logError("Failed to open file: " + file + ": " + err);
				return callback();
			}
			var buf = Buffer.alloc(len);
			fs.read( fd, buf, 0, len, pos, function(err) {
				if (err) {
					self.logError("Failed to read file: " + file + ": " + err);
					fs.closeSync(fd);
					return callback();
				}
				
				fs.close(fd, function() {
					var lines = buf.toString().replace(/\r\n/g, "\n").split(/\n/).filter( function(line) {
						return line.match( monitor.match );
					} );
					
					if (lines.length) self.sendAlert(monitor, file, lines, callback);
					else callback();
				}); // fs.close
			} ); // fs.read
		} ); // fs.open
	},
	
	sendAlert: function(monitor, file, lines, callback) {
		// send out alert for matched lines
		var self = this;
		this.logDebug(1, "ALERT! Found " + lines.length + " matching lines in: " + file, lines);
		
		if (config.debug) return callback(); // dry-run
		
		if (monitor.max_lines && (lines.length > monitor.max_lines)) {
			this.logDebug(3, "Pruning max lines to " + monitor.max_lines);
			lines.splice( monitor.max_lines );
		}
		if (monitor.max_per_hour) {
			var date_code = Tools.formatDate( new Date(), "[yyyy]/[mm]/[dd]/[hh]" );
			if (!monitor.current_hour) {
				// first time for alert
				monitor.current_hour = date_code;
				monitor.hour_count = 1;
			}
			else if (monitor.current_hour != date_code) {
				// new hour, reset count
				monitor.current_hour = date_code;
				monitor.hour_count = 1;
			}
			else {
				// multiple alerts per hour, check limits
				monitor.hour_count++;
				if (monitor.hour_count > monitor.max_per_hour) {
					this.logDebug(2, "Too many alerts per hour (" + monitor.hour_count + "), skipping notifications");
					return callback();
				}
			}
		}
		
		var jobs = [];
		if (monitor.email) jobs.push('sendEmail');
		if (monitor.sms) jobs.push('sendSMS');
		if (monitor.url) jobs.push('sendURL');
		if (monitor.exec) jobs.push('sendExec');
		if (!jobs.length) {
			this.logDebug(3, "No alert actions configured.");
			return callback(); // no alert actions
		}
		
		async.eachSeries( jobs,
			function(job, callback) {
				self[job](monitor, file, lines, callback)
			},
			callback
		); // eachSeries
	},
	
	sendEmail: function(monitor, file, lines, callback) {
		// send e-mail using pixl-mail (nodemailer)
		var self = this;
		var mail = new PixlMail();
		
		if (config.mail_settings) {
			mail.setOptions( Tools.copyHashRemoveKeys( config.mail_settings, { from: 1 } ) );
		}
		
		var email_args = { ...monitor, 
			from: config.mail_settings.from,
			file: file,
			lines: lines.join("\n"),
			hostname: os.hostname(),
			pid: process.pid,
			date: (new Date()).toString()
		};
		var text = Tools.sub( monitor.email_template || DEFAULT_EMAIL_TEMPLATE, email_args );
		
		this.logDebug(3, "Sending alert e-mail", text);
		
		mail.send( text, function(err) {
			if (err) self.logError("Failed to send e-mail: " + err);
			else self.logDebug(3, "Successfully sent e-mail to: " + monitor.email);
			callback();
		} );
	},
	
	sendSMS: function(monitor, file, lines, callback) {
		// send SMS using Twilio API
		var self = this;
		var tw_config = config.twilio_settings;
		
		var sms_args = { ...monitor, 
			file: file,
			lines: lines.join("\n"),
			hostname: os.hostname(),
			pid: process.pid,
			date: (new Date()).toString()
		};
		var text = Tools.sub( monitor.sms_template || DEFAULT_SMS_TEMPLATE, sms_args );
		
		var url = 'https://api.twilio.com/2010-04-01/Accounts/' + tw_config.sid + '/Messages.json';
		var addrs = Array.isArray(monitor.sms) ? monitor.sms : monitor.sms.split(/\,\s*/);
		
		async.eachSeries( addrs,
			function(addr, callback) {
				var opts = {
					data: {
						Body: '' + text,
						From: tw_config.from.replace(/[^\d\+]+/g, ''),
						To: addr.replace(/[^\d\+]+/g, '')
					},
					auth: tw_config.sid + ':' + tw_config.auth
				};
				
				if (opts.data.From.match(/^\d{10}$/)) opts.data.From = "+1" + opts.data.From;
				if (opts.data.To.match(/^\d{10}$/)) opts.data.To = "+1" + opts.data.To;
				
				self.logDebug(3, "Sending alert via Twilio: " + url, opts);
				
				request.post( url, opts, function(err, resp, data) {
					if (err) {
						self.logError("Twilio HTTP Error: " + err);
						return callback();
					}
					self.logDebug(9, "Raw Twilio Response: " + data);
					
					if (resp.statusCode > 399) {
						self.logError("Bad Twilio Response: HTTP " + resp.statusCode + " " + resp.statusMessage + ": " + data);
						return callback();
					}
					
					var json = null;
					try { json = JSON.parse( ''+data ); }
					catch (err) {
						self.logError("JSON Error from Twilio API: " + err);
						return callback();
					}
					if (json.error_code) {
						self.logError("Error from Twilio API: " + json.error_code + ": " + json.error_message);
						return callback();
					}
					
					self.logDebug(2, "Successfully sent Twilio SMS", addr);
					callback();
				} );
			},
			callback
		); // eachSeries
	},
	
	sendURL: function(monitor, file, lines, callback) {
		// send web hook as an alert action
		var self = this;
		var url = monitor.url;
		var post_args = { ...monitor, 
			file: file,
			lines: lines,
			hostname: os.hostname(),
			pid: process.pid,
			date: (new Date()).toString()
		};
		delete post_args.files;
		
		post_args.text = Tools.sub( monitor.post_template || DEFAULT_SMS_TEMPLATE, post_args );
		
		self.logDebug(3, "Sending alert via HTTP POST: " + url, post_args);
		
		request.json( url, post_args, function(err, resp, data) {
			if (err) {
				self.logError("HTTP Error: " + err);
				return callback();
			}
			self.logDebug(2, "Successfully sent HTTP POST notification", url);
			callback();
		} );
	},
	
	sendExec: function(monitor, file, lines, callback) {
		// fire off shell exec command as alert action
		var self = this;
		var cmd = monitor.exec;
		
		self.logDebug(3, "Performing shell exec for alert: " + cmd);
		
		cp.exec( cmd, function(err, stdout, stderr) {
			if (err) self.logError("Shell exec error: " + err);
			callback();
		} );
	},
	
	setup: function(monitor, callback) {
		// perform initial glob for files and sizes
		var self = this;
		this.logDebug(1, "Performing initial scan: " + monitor.path );
		
		this.scan( monitor, function(err, files) {
			self.logDebug( 3, Tools.numKeys(files) + " files found." );
			monitor.files = files;
			callback();
		} );
	},
	
	scan: function(monitor, callback) {
		// perform glob + stat on all files
		var spec = monitor.path;
		var items = {};
		
		glob( spec, function(err, files) {
			if (!files) files = [];
			
			async.eachSeries( files, 
				function(file, callback) {
					fs.stat( file, function(err, stats) {
						if (stats && stats.isFile()) {
							items[file] = {
								file: file,
								size: stats.size,
								mod: stats.mtime.getTime() / 1000
							};
							if (monitor.checksum) {
								items[file].checksum = Tools.digestHex( fs.readFileSync(file, 'utf8') );
							}
						}
						callback();
					} );
				},
				function() {
					callback( null, items );
				}
			); // eachSeries
		} );
	},
	
	logError: function(msg, data) {
		// errors are just debug level 1 messages for now
		this.logDebug(1, "ERROR: " + msg, data);
	},
	
	logDebug: function(level, msg, data) {
		this.logger.debug(level, msg, data);
	}
	
}; // app

function customDie(msg) {
	// die with prompt on win32
	if (app.dead) return; // only die once
	app.dead = true;
	
	warnln( msg.trim() );
	
	if (win32) cli.prompt("\nPress Enter key to exit.", "", function() {
		process.exit(1);
	} );
	else process.exit(1);
};

if (!fs.existsSync(config_file)) {
	// first run, create sample config
	fs.writeFileSync( config_file, JSON.stringify({
		monitors: [
			{
				name: "Test Monitor",
				path: win32 ? "c:\\Users\\MyUser\\Logs\\MyLog.log" : "/var/log/mylog.log",
				match: "ALERT",
				email: "alerts@myserver.com"
			}
		],
		mail_settings: {
			host: "smtp.mymailserver.com",
			port: 25,
			secure: false,
			'auth': { user: 'fsmith', pass: '12345' },
			from: 'noreply@myserver.com'
		},
		sleep: 5,
		echo: 1,
		verbose: 2
	}, null, "\t") + os.EOL );
	
	println( "\n" + title + "\n" );
	println("Welcome! It looks like this is the first time you've run LogAlert.");
	println("We've created a sample config file for you: " + config_file);
	println("Please edit it using your favorite text editor, and then re-launch.");
	println("For help please see: https://github.com/jhuckaby/logalert\n");
	
	if (win32) cli.prompt("Press Enter key to exit.", "", function() {
		process.exit(0);
	} );
	else {
		process.exit(0);
	}
}
else if (args.other && (args.other[0] == 'start')) {
	// daemon start
	if (!process.env.__daemon) {
		println( title + ": Spawning background daemon process." );
	}
	
	require('daemon')({
		cwd: process.cwd() // workaround for https://github.com/indexzero/daemon.node/issues/41
	});
	
	if (process.env.__daemon) {
		// write pid file
		var pid_file = Path.join( Path.dirname( self_bin ), 'pid.txt' );
		fs.writeFileSync( pid_file, process.pid );
		
		// go go go
		app.run();
	}
}
else if (args.other && (args.other[0] == 'stop')) {
	// daemon stop
	var pid_file = Path.join( Path.dirname( self_bin ), 'pid.txt' );
	
	if (!fs.existsSync(pid_file)) {
		warnln( title + ": No PID file found." );
		process.exit(1);
	}
	
	try {
		var pid = fs.readFileSync(pid_file, 'utf8');
		process.kill(pid);
		fs.unlinkSync(pid_file);
		println( title + ": Sent term signal to PID " + pid + "." );
	}
	catch(err) {
		warnln( title + " ERROR: Failed to shutdown: " + err);
		process.exit(1);
	}
}
else if (args.other && (args.other[0] == 'boot')) {
	// activate pixl-boot
	var opts = {
		cwd: Path.dirname( self_bin )
	};
	cp.exec( 'npm run boot', opts, function(err, stdout, stderr) {
		if (err) customDie("Shell exec error: " + err);
		if (stdout && stdout.length) println( stdout );
		if (stderr && stderr.length) warnln( stderr );
		process.exit(0);
	} );
}
else if (args.other && (args.other[0] == 'unboot')) {
	// remove pixl-boot
	var opts = {
		cwd: Path.dirname( self_bin )
	};
	cp.exec( 'npm run unboot', opts, function(err, stdout, stderr) {
		if (err) customDie("Shell exec error: " + err);
		if (stdout && stdout.length) println( stdout );
		if (stderr && stderr.length) warnln( stderr );
		process.exit(0);
	} );
}
else app.run();
