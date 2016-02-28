var express = require('express');
var bodyParser = require('body-parser');
var pg = require('pg');
var sessions = require('client-sessions');
var bcrypt = require('bcryptjs');
var csrf = require('csurf');
var nodemailer = require('nodemailer');
var smtpTransport = require('nodemailer-smtp-transport');
var flash = require('express-flash');
var dateFormat = require('dateformat');


var connection = "pg://slick:slick123@localhost:5432/ivlog";

// create reusable transporter object using SMTP transport
var transporter = nodemailer.createTransport(smtpTransport({
    host: 'email-smtp.us-west-2.amazonaws.com',
    port: 587,
    auth: {
        user: 'AKIAJ7JDM6IWYEIZW35Q',
        pass: 'Ar3v9g6rpvNM01ie1Bi0VltLF+Z/c6XyEjnEYyVMxkHM',
        secure: true
    },
	tls: {
		rejectUnauthorized: false
	}
}));

var app = express();
app.set('view engine', 'jade');
app.locals.pretty = true;

//middleware
app.use(bodyParser.urlencoded({ extended: true}));
app.use(sessions({
	cookieName: 'session',
	secret: 'asdlfij833923hflh3o8hds8hf33l8hf8dh', //encrypts the cookie data using the secret string
	duration: 30 * 60 * 1000, //you will be logged in for 30 min
	activeDuration: 5 * 60 * 1000, //if you are active you get +5 min
	httpOnly: true, //don't let browser js access cookies
	secure: true, //only use cookies with https
	ephemeral: true //delete this cookie when the browser is closed
}));
app.use(flash()); //nifty error/info/success messages
app.use(express.static(__dirname + '/public'))

app.use(function(req, res, next) { //if there is a cookie this will verify the login (goes with dashboard)
	if(req.session && req.session.user) {
		//this initializes a connection pool
		pg.connect(connection, function(err, client, done) {
			if(err) {
				return console.error('error fetching client from pool', err);
			}
			client.query('SELECT * FROM users WHERE email=$1', 
					[req.session.user.email], function(err, result) {
				//call `done()` to release the client back to the pool
				done();

				if(err || result.rows[0] == undefined) { //error or returned 0 rows
					//req.session.reset(); //destroy session
					//res.redirect('/login');
				}
				else {
					var veriCode = result.rows[0].verificationcode;
					var vfd = false;
					if(veriCode == 1) {
						vfd = true;
					}
					var user = {
						ID:result.rows[0].id,
						realName:result.rows[0].realname,
						aliasName:result.rows[0].aliasname,
						email:result.rows[0].email,
						//passHash:result.rows[0].passhash
						verified:vfd
					};
					req.user = user;
					req.session.user = req.user; //save user obejct as cookie/session
					res.locals.user = req.user; //this allows us to call user from all of our templates
				}
				next();
			});
		});
	}
	else {
		next();
	}
});
function requireLogin(req, res, next) {
	if(!req.user) {
		res.redirect('/login');
	}
	else {
		if(req.user.verified) {
			next(); //continue to dashboard or wherever
		}
		else {
			res.redirect('/verify');
		}
	}
}
app.use(csrf());

app.get('/', function(req, res) {
	res.render('index.jade');
});

app.get('/register', function(req, res) {
	if(req.session && req.session.user) { //there is a user logged in
		res.redirect('/dashboard');
	}
	else {
		res.render('register.jade', { csrfToken: req.csrfToken() });
	}
});

app.post('/register', function(req, res) {
	//res.json(req.body);
	var user = {
		realName:req.body.realName,
		aliasName:req.body.aliasName,
		email:req.body.email,
		passHash:bcrypt.hashSync(req.body.password, bcrypt.genSaltSync(10)) //hash the password with bcrypt
	};
	console.log("Real Name: " + user.realName);
	var varCode = randomInt(11111,99999);

	//this initializes a connection pool
	//it will keep idle connections open for (configurable) 30 seconds
	//and set a limit of 20 (also configurable)
	pg.connect(connection, function(err, client, done) {
		if(err) {
			return console.error('error fetching client from pool', err);
		}
		client.query('INSERT INTO users (realName, aliasName, passHash, email, verificationCode) VALUES($1, $2, $3, $4, $5) RETURNING id', 
				[user.realName, user.aliasName, user.passHash, user.email, varCode], function(err, result) {
			//call `done()` to release the client back to the pool
			done();

			if(err) {
				var errCode = err.code;
				var errDetail = err.detail;

				if(errCode == 23505) { //Duplicate Record, either email or user name
					if(errDetail.indexOf("(aliasname)=") > -1) {
						req.flash('error', "That user name is already taken.");
					}
					else if(errDetail.indexOf("(email)=") > -1) {
						req.flash('error', "That email is already registered.");
					}
					else {
						req.flash('error', "Unknown duplicate record error.");
					}
				}
				else { //unknown error
					req.flash('error', "Unknown error, code: " + err.code);
				}

				res.render('register.jade', {
					csrfToken: req.csrfToken(),
					realName: req.body.realName,
					aliasName: req.body.aliasName,
					email: req.body.email,
					password: req.body.password,
					repeatPassword: req.body.repeatPassword

				});
				return console.error('error running query', err);
			}
			else {
				var newID = result.rows[0].id;
				console.log("New record inserter, ID = " + newID);
				var user = {
					ID:newID,
					realName:req.body.realName,
					aliasName:req.body.aliasName,
					email:req.body.email,
					verified:false
				};
				req.session.user = user; //save user obejct as cookie/session
				res.redirect('/verify');

				//Send Email Verification
				var verifyEmail = {
					from: 'SLICK <jesse@slickelectric.com>', // sender address
					to: user.email, // list of receivers
					subject: 'SLICK Registration', // Subject line
					text: 'Thank you for registering. Your verification code is: ' + varCode, // plaintext body
					//html: '<b>Hello world ✔</b>' // html body
				};

				// send mail with defined transport object
				transporter.sendMail(verifyEmail, function(error, info) {
				    if(error){
				        console.log(error);
				    }else{
				        console.log('Message sent: ' + info.response);
				    }
				});
			}
		});
	});
});

app.get('/login', function(req, res) {
	if(req.session && req.session.user) { //there is a user logged in
		res.redirect('/dashboard');
	}
	else {
		res.render('login.jade', { csrfToken: req.csrfToken() });
	}
});

app.post('/login', function(req, res) {
	var email = req.body.email;
	var password = req.body.password;

	//this initializes a connection pool
	pg.connect(connection, function(err, client, done) {
		if(err) {
			return console.error('error fetching client from pool', err);
		}
		client.query('SELECT * FROM users WHERE email=$1', 
				[email], function(err, result) {
			//call `done()` to release the client back to the pool
			done();

			if(err) {
				error = "There has been an error!";
				req.flash('error', 'There has been an error!');
				res.render('login.jade', {csrfToken: req.csrfToken() });
				return console.error('error running query', err);
			}
			else if(result.rows[0] == undefined) { //no results found
				req.flash('error', 'Email and/or password not correct, please try again.');
				res.render('login.jade', {csrfToken: req.csrfToken() });
			}
			else {
				var failedLogins = result.rows[0].failedlogins;
				var veriCode = result.rows[0].verificationcode;
				console.log("Verification Code from DB: " + veriCode);
				var vfd = false;
				if(veriCode == 1) {
					vfd = true;
				}
				var user = {
					ID:result.rows[0].id,
					realName:result.rows[0].realname,
					aliasName:result.rows[0].aliasname,
					email:result.rows[0].email,
					passHash:result.rows[0].passhash,
					verified:vfd
				};

				console.log("retreived data from id " + user.ID);
				if(failedLogins > 5) { //check for failed logins
					req.flash('error', 'You have 6+ failed logins, please select the Reset Password button to reset your password.');
					res.render('login.jade', {csrfToken: req.csrfToken() });
				}
				else {
					if(bcrypt.compareSync(password, user.passHash)) { //Login Success
						req.session.user = user; //save user obejct as cookie/session
						console.log("Loged in and user verified: " + user.verified);
						//update last login date and login count
						client.query('UPDATE users SET loginCount=loginCount+1, lastLogin=current_date, failedLogins=0 WHERE email=$1', 
								[user.email], function(err, result) {
							//call `done()` to release the client back to the pool
							done();

							if(err) {
								var errCode = err.code;
								var errDetail = err.detail;
								req.flash('error', 'Failed to increment login count. Unknown error, code:' + err.code);
								res.render('login.jade', {csrfToken: req.csrfToken() });
								return console.error('Failed to increment login count.', err);
							}
							else {
								console.log("login incremented");
								if(user.verified) {
									res.redirect('/dashboard');
								}
								else {
									res.redirect('/verify');
								}
							}
						});
					}
					else { //Login Failed
						//update failed login count
						client.query('UPDATE users SET failedLogins=failedLogins+1 WHERE email=$1', 
								[user.email], function(err, result) {
							//call `done()` to release the client back to the pool
							done();

							if(err) {
								var errCode = err.code;
								var errDetail = err.detail;
								req.flash('error', 'Failed to increment failed login count. Unknown error, code:' + err.code);
								res.render('login.jade', {csrfToken: req.csrfToken() });
								return console.error('Failed to increment failed login count.', err);
							}
							else {
								console.log("failed login incremented");
								req.flash('error', 'Email and/or password not correct, please try again. (' + (6 - failedLogins) + ' tries left)');
								res.render('login.jade', {csrfToken: req.csrfToken() });
							}
						});
					}
				}
			}
		});
	});
});

app.get('/dashboard', requireLogin, function(req, res) {

	pg.connect(connection, function(err, client, done) {
		if(err) {
			return console.error('error fetching client from pool', err);
		}
		client.query('SELECT * FROM data ORDER BY id DESC LIMIT 20', function(err, result) {
			//call `done()` to release the client back to the pool
			done();

			if(err || result.rows[0] == undefined) { //error or returned 0 rows
				//req.session.reset(); //destroy session
				//res.redirect('/login');
			}
			else {
				var dataOut = [{
					ID:result.rows[0].id,
					sender:result.rows[0].sender,
					dateTimeReceived:result.rows[0].datetimereceived,
					volts:result.rows[0].volts,
					amps:result.rows[0].amps,
					kwh:result.rows[0].kwh
				}];

				var kwh = [];
				var yDates = [];
				var yvals = [];

				for(i=result.rows.length-1; i>0; i--) {
					dataOut.push({
						ID:result.rows[i].id,
						sender:result.rows[i].sender,
						dateTimeReceived:result.rows[i].datetimereceived,
						volts:result.rows[i].volts,
						amps:result.rows[i].amps,
						kwh:result.rows[i].kwh
					});

					kwh.push(result.rows[i-1].kwh - result.rows[19].kwh);
					yDates.push(dateFormat(result.rows[i-1].datetimereceived, "ddd, h:MM TT"));
				}

				//console.log("dataOut.length="+dataOut.length);

				var data = {
					labels: yDates,
					datasets: [{
					label: "My First dataset",
					fillColor: "rgba(220,220,220,0.2)",
					strokeColor: "rgba(220,220,220,1)",
					pointColor: "rgba(220,220,220,1)",
					pointStrokeColor: "#fff",
					pointHighlightFill: "#fff",
					pointHighlightStroke: "rgba(220,220,220,1)",
					data: kwh
					}]
				};

				res.render('dashboard.jade', { layout:false, json:data });
			}
		});
	});
	/*
	var chartData = [];
	for (var i = 0; i < 7; i++)
		chartData.push(Math.random() * 50);

	*/
});

app.get('/verify', function(req, res) {
	//Make sure you're not verified before showing
	if(req.session && req.session.user) { //there is a user logged in
		//Check if they're verified
		pg.connect(connection, function(err, client, done) {
			if(err) {
				return console.error('error fetching client from pool', err);
			}
			//console.log("Query DB for email: " + req.user.email);
			client.query('SELECT * FROM users WHERE email=$1', 
					[req.user.email], function(err, result) {
				//call `done()` to release the client back to the pool
				done();

				if(err) {
					req.flash('error', 'Failed to connect to database.');
					res.render('verify.jade', {csrfToken: req.csrfToken() });
					return console.error('error running query', err);
				}
				else if(result.rows[0] == undefined) { //no results found
					req.flash('error', 'Error, no email found.');
					res.render('verify.jade', {csrfToken: req.csrfToken() });
				}
				else {
					var veriCode = result.rows[0].verificationcode;
					console.log("Verification Code from DB: " + veriCode);
					if(veriCode == 1) {
						res.redirect('/dashboard');
					}
					else {
						res.render('verify.jade', {csrfToken: req.csrfToken() });
					}
				}
			});
		});
	}
	else {
		//error = "You must login before you can verify your account.";
		req.flash('error', 'You must login before you can verify your account.');
		res.redirect('/login');
	}
});

app.post('/verify', function(req, res) {
	//this initializes a connection pool
	pg.connect(connection, function(err, client, done) {
		if(err) {
			return console.error('error fetching client from pool', err);
		}
		//console.log("Query DB for email: " + req.user.email);
		client.query('SELECT * FROM users WHERE email=$1', 
				[req.user.email], function(err, result) {
			//call `done()` to release the client back to the pool
			done();

			if(err) {
				req.flash('error', 'Failed to connect to database.');
				res.render('verify.jade', {csrfToken: req.csrfToken() });
				return console.error('error running query', err);
			}
			else if(result.rows[0] == undefined) { //no results found
				req.flash('error', 'Error, no email found.');
				res.render('verify.jade', {csrfToken: req.csrfToken() });
			}
			else {
				var veriCode = result.rows[0].verificationcode;
				console.log("Verification Code from DB: " + veriCode);
				console.log("Verification Code from Form: " + req.body.verify);
				if(veriCode == req.body.verify) { //correct verification code
					req.user.verified = true;
					//set verificationCode in DB to 1 (verified)
					pg.connect(connection, function(err, client, done) {
						if(err) {
							return console.error('error fetching client from pool', err);
						}
						client.query('UPDATE users SET verificationCode=1 WHERE email=$1', 
								[req.user.email], function(err, result) {
							//call `done()` to release the client back to the pool
							done();

							if(err) {
								var errCode = err.code;
								var errDetail = err.detail;
								req.flash('error', 'Unknown error, code:' + err.code);
								res.render('verify.jade', {csrfToken: req.csrfToken() });
								return console.error('error running query', err);
							}
							else {
								console.log("User Verified: " + req.user.email);
								res.redirect('/dashboard');
							}
						});
					});
				}
				else { //incorrect verification code
					req.flash('error', 'Incorrect verification code.');
					res.render('verify.jade', {csrfToken: req.csrfToken() });
					//TODO: update attempted login
				}
			}
		});
	});
});

app.get('/reset', function(req, res) {
	res.render('reset.jade', {csrfToken: req.csrfToken() });
});

app.post('/reset', function(req, res) {
	if(req.body.verify == undefined) { //submitting reset page (not resetVerify page)
		//console.log("Varify Code: " + req.body.verify);
		var varCode = randomInt(11111,99999);
		pg.connect(connection, function(err, client, done) {
			if(err) {
				return console.error('error fetching client from pool', err);
			}
			client.query('UPDATE users SET verificationCode=$1 WHERE email=$2 RETURNING id', 
					[varCode, req.body.email], function(err, result) {
				//call `done()` to release the client back to the pool
				done();

				if(err) {
					var errCode = err.code;
					var errDetail = err.detail;
					req.flash('error', 'Unknown error, code:' + err.code);
					res.render('reset.jade', {csrfToken: req.csrfToken() });
					return console.error('error running query', err);
				}
				else if(result.rows[0] == undefined) { //nothing updated
					req.flash('error', 'That user email does not exist.');
					res.render('reset.jade', {csrfToken: req.csrfToken() });
				}
				else {
					console.log("User Verified: " + req.body.email);


					//Send Email Verification
					var verifyEmail = {
						from: 'SLICK <jesse@slickelectric.com>', // sender address
						to: req.body.email, // list of receivers
						subject: 'SLICK Password Reset', // Subject line
						text: 'You have requested a password reset. Your verification code is: ' + varCode, // plaintext body
						//html: '<b>Hello world ✔</b>' // html body
					};

					// send mail with defined transport object
					transporter.sendMail(verifyEmail, function(error, info) {
					    if(error){
					        console.log(error);
					    }else{
					        console.log('Message sent: ' + info.response);
					    }
					});

					res.render('verifyReset.jade', {csrfToken: req.csrfToken(), email: req.body.email });
				}
			});
		});
	}
	else { //Handeling the resetVerify page (not the reset page)
		//this initializes a connection pool
		pg.connect(connection, function(err, client, done) {
			if(err) {
				return console.error('error fetching client from pool', err);
			}
			//console.log("Query DB for email: " + req.user.email);
			client.query('SELECT * FROM users WHERE email=$1', 
					[req.body.email], function(err, result) {
				//call `done()` to release the client back to the pool
				done();

				if(err) {
					req.flash('error', 'Failed to connect to database.');
					res.render('verifyReset.jade', {csrfToken: req.csrfToken() });
					return console.error('error running query', err);
				}
				else if(result.rows[0] == undefined) { //no results found
					req.flash('error', 'Error, no email found.');
					res.render('verifyReset.jade', {csrfToken: req.csrfToken() });
				}
				else {
					var veriCode = result.rows[0].verificationcode;
					console.log("Verification Code from DB: " + veriCode);
					console.log("Verification Code from Form: " + req.body.verify);
					if(veriCode == req.body.verify) { //correct verification code
						var user = {
							ID:result.rows[0].id,
							realName:result.rows[0].realname,
							aliasName:result.rows[0].aliasname,
							email:result.rows[0].email,
							verified:true
						};
						var passHash = bcrypt.hashSync(req.body.password, bcrypt.genSaltSync(10)) //hash the password with bcrypt
						//set verificationCode in DB to 1 (verified)
						pg.connect(connection, function(err, client, done) {
							if(err) {
								return console.error('error fetching client from pool', err);
							}
							client.query('UPDATE users SET verificationCode=1, failedLogins=0, passHash=$1 WHERE email=$2', 
									[passHash, req.body.email], function(err, result) {
								//call `done()` to release the client back to the pool
								done();

								if(err) {
									var errCode = err.code;
									var errDetail = err.detail;
									req.flash('error', 'Unknown error, code:' + err.code);
									res.render('verifyReset.jade', {csrfToken: req.csrfToken() });
									return console.error('error running query', err);
								}
								else {
									req.user = user;
									req.session.user = req.user; //save user obejct as cookie/session
									res.locals.user = req.user; //this allows us to call user from all of our templates
									console.log("User Verified and logged in: " + req.body.email);
									res.redirect('/dashboard');
								}
							});
						});
					}
					else { //incorrect verification code
						req.flash('error', 'Incorrect verification code.');
						res.render('verifyReset.jade', {csrfToken: req.csrfToken() });
						//TODO: update attempted login
					}
				}
			});
		});
	}	
});

app.get('/changePassword', requireLogin, function(req, res) {
	res.render('changePassword.jade', {csrfToken: req.csrfToken() });
});

app.post('/changePassword', function(req, res) {
	//this initializes a connection pool
	pg.connect(connection, function(err, client, done) {
		if(err) {
			return console.error('error fetching client from pool', err);
		}
		client.query('SELECT * FROM users WHERE email=$1', 
				[req.user.email], function(err, result) {
			//call `done()` to release the client back to the pool
			done();

			if(err) {
				req.flash('error', 'Failed to connect to database.');
				res.render('changePassword.jade', {csrfToken: req.csrfToken() });
				return console.error('error running query', err);
			}
			else if(result.rows[0] == undefined) { //no results found
				req.flash('error', 'Error, user not found in database.');
				res.render('changePassword.jade', {csrfToken: req.csrfToken() });
			}
			else { 
				console.log("checking current pass hash: " + result.rows[0].passhash);
				if(bcrypt.compareSync(req.body.oldPassword, result.rows[0].passhash)) { //Validate Old Pass
					var passHash = bcrypt.hashSync(req.body.password, bcrypt.genSaltSync(10)) //hash the password with bcrypt
					
					pg.connect(connection, function(err, client, done) {
						if(err) {
							return console.error('error fetching client from pool', err);
						}
						client.query('UPDATE users SET passHash=$1 WHERE email=$2 RETURNING id', 
								[passHash, req.user.email], function(err, result) {

							done(); //release the client back to the pool

							if(err) {
								var errCode = err.code;
								var errDetail = err.detail;
								req.flash('error', 'Unknown error, code:' + err.code);
								res.render('changePassword.jade', {csrfToken: req.csrfToken() });
								return console.error('error running query', err);
							}
							else if(result.rows[0] == undefined) { //nothing updated
								req.flash('error', 'That user email does not exist.');
								res.render('changePassword.jade', {csrfToken: req.csrfToken() });
							}
							else {
								console.log("Password Changed for: " + req.body.email);
								res.redirect('/dashboard');
							}
						});
					});
				}
			}
		});
	});
});

app.get('/logout', function(req, res) {
	req.session.reset(); //destroy session
	res.redirect('/');
});

app.get('/rawData', requireLogin, function(req, res) {

	pg.connect(connection, function(err, client, done) {
		if(err) {
			return console.error('error fetching client from pool', err);
		}
		client.query('SELECT * FROM data ORDER BY id DESC LIMIT 500', function(err, result) {
			//call `done()` to release the client back to the pool
			done();

			if(err || result.rows[0] == undefined) { //error or returned 0 rows
				//req.session.reset(); //destroy session
				//res.redirect('/login');
			}
			else {
				var dataOut = [{
					ID:result.rows[0].id,
					sender:result.rows[0].sender,
					//dateTimeSent:result.rows[0].datetimesent,
					dateTimeReceived:result.rows[0].datetimereceived,
					volts:result.rows[0].volts,
					amps:result.rows[0].amps,
					kwh:result.rows[0].kwh
				}];

				//console.log("result.rows.length="+result.rows.length);

				for(i=1; i<result.rows.length; i++) {
					dataOut.push({
						ID:result.rows[i].id,
						sender:result.rows[i].sender,
						//dateTimeSent:result.rows[i].datetimesent,
						dateTimeReceived:result.rows[i].datetimereceived,
						volts:result.rows[i].volts,
						amps:result.rows[i].amps,
						kwh:result.rows[i].kwh
					});
					//console.log("dataOutLooped");
				}

				//console.log("dataOut.length="+dataOut.length);

				var ob = { action:"date +%s", result:"1367263074"};
				res.render('rawData.jade', { layout : 'layout', json: dataOut });
			}
		});
	});
});

/*
app.get('/uploader', requireLogin, function(req, res) {
	res.render('uploader.jade');
});

app.post('/uploader', function(req, res) {
	var sender = req.body.sender;
	var dateTimeSent = req.body.dateTimeSent;
	var volts = req.body.volts;
	var amps = req.body.amps;

	//console.log(dateTimeSent)

	if(sender.length > 20 || dateTimeSent.length > 20 || volts > 1000 
			|| volts < -1000 || amps > 1000 || amps < -1000) {

		return console.log('form variable length error, sender = ' + sender
			+ "  dateTimeSent = " + dateTimeSent 
			+ "  volts = " + volts
			+ "  amps = " + amps
			+ "  True/Fals: "  + "\n"
			+ (sender.length > 20) + "\n"
			+ (dateTimeSent.length > 20) + "\n"
			+ (volts > 1000) + "\n"
			+ (volts < -1000) + "\n"
			+ (amps > 1000) + "\n"
			+ (amps < -1000));
	}

	//this initializes a connection pool
	//it will keep idle connections open for (configurable) 30 seconds
	//and set a limit of 20 (also configurable)
	pg.connect(connection, function(err, client, done) {
		if(err) {
			return console.error('error fetching client from pool', err);
		}
		client.query('INSERT INTO data (sender, dateTimeSent, volts, amps) VALUES($1, $2, $3, $4) RETURNING id', 
				[sender, dateTimeSent, volts, amps], function(err, result) {
			//call `done()` to release the client back to the pool
			done();

			if(err) {
				var errCode = err.code;
				var errDetail = err.detail;
				return console.error('error running query', err);
			}
			else {
				var newID = result.rows[0].id;
				console.log("New record inserter, ID = " + newID);
				res.redirect('/');
			}
		});
	});
});
*/
app.get('/team', function(req, res) {
	res.render('team.jade');
});

app.listen(3000);

function randomInt(min,max)
{
    return Math.floor(Math.random()*(max-min+1)+min);
}



























































