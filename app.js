var express = require('express');
var socket = require('socket.io');
var mysql = require('mysql');
var cookieParser = require('cookie-parser');
var session = require('express-session');
var app = express();
var pbkdf2 = require('pbkdf2-sha256');
var sha1 = require('sha1');

var server = app.listen(82, function () {
	console.log("listening to port 82.");
});
var io = socket(server);

var sessionMiddleware = session({
	secret: "clau_secreta",
	cookie: {
        //expires: new Date(Date.now() + 3600000), //setting cookie to not expire on session end
        //maxAge: 60 * 1000
    }
});

io.use(function (socket, next) {
	sessionMiddleware(socket.request, socket.request.res, next);
});
app.use(sessionMiddleware);
app.use(cookieParser());
/*
app.get('/cookie',function(req, res){
	res.session.cookie(cookie_name , 'cookie_value').send('Cookie is set');
});

app.get('/*', function(req, res) {
	console.log("Cookies :  ", req.session.cookies);
});*/

const config = {
	"host": "localhost",
	"user": "root",
	"password": "",
	"base": "login"
};

var db = mysql.createConnection({
	host: config.host,
	user: config.user,
	password: config.password,
	database: config.base
});

db.connect(function (error) {
	if (!!error)
	throw error;

	console.log('mysql connected to ' + config.host + ", user " + config.user + ", database " + config.base);
});

app.use(express.static('./'));

var SOCKET_LIST = {};
var PLAYER_LIST = {};

var colorArray = ["green", "blue", "yellow", "black", "red", "magenta", "cyan"];
 
var Player = function(id){
    var self = {
        x:385,
        y:285,
        id:id,
		color:colorArray[Math.floor(Math.random() * colorArray.length)],
        pressingRight:false,
        pressingLeft:false,
        pressingUp:false,
        pressingDown:false,
        maxSpd:10,
    }
    self.updatePosition = function(){
        if(self.pressingRight)
            self.x += self.maxSpd;
        if(self.pressingLeft)
            self.x -= self.maxSpd;
        if(self.pressingUp)
            self.y -= self.maxSpd;
        if(self.pressingDown)
            self.y += self.maxSpd;
    }
    return self;
}

var connected = false;

io.on('connection', function (socket) {
	var req = socket.request;
	
	if(req.session.userID != null){
		console.log(req.headers.cookie);
		console.log(req.session.userID);
		//db.query("SELECT * FROM users WHERE id=?", [req.session.userID], function(err, rows, fields){
		//	socket.emit("logged_in", rows[0].username);
		//	console.log("already logged in");
		//});
	}
	
	socket.on('login', function(data){
		const user = data.user,
		pass = pbkdf2(data.pass,'salt',1,16).toString('hex');
		if(user.length < 5 || data.pass.length < 5){
			socket.emit("wrong_length");
		} else {
			db.query("SELECT * FROM users WHERE username=?", [user], function(err, rows, fields){
				if(rows.length == 0){
					socket.emit('no_exists');
				} else {
					const dataUser = rows[0].username,
					dataPass = rows[0].password;
					if(dataPass == null || dataUser == null){
						socket.emit('wrong');
					}
					else if(user == dataUser && pass == dataPass){
						socket.emit('logged_in', user);
						req.session.userID = rows[0].id;
						req.session.save();
						console.log('logged_in');
					} else {
						socket.emit('invalid');
					}
				}
			});
		}
	});
	
	socket.on('registre', function(data){
		const user = data.user,
		email = data.email,
		pass = pbkdf2(data.pass,'salt',1,16).toString('hex'),
		datetime = data.datetime;
		if(user.length < 5 || data.pass.length < 5){
			socket.emit("wrong_length");
		} else {
			db.query("SELECT * FROM users WHERE username=?", [user], function(err, rows, fields){
				if(rows.length == 0){
					db.query("INSERT INTO users(`username`,`email`,`password`,`trn_date`) VALUES(?, ?, ?, ?)", [user, email, pass, datetime], function(err, result){
						if(!!err)
						throw err;
						socket.emit('pass_quality', sha1(data.pass));
						socket.emit('registrat', user);
					});
				} else {
					socket.emit('exists');
				}
			});
		}
	});
	
	socket.on('connect_player',function(){
		socket.id = req.session.userID;
		SOCKET_LIST[socket.id] = socket;
		
		var player = Player(socket.id);
		PLAYER_LIST[socket.id] = player;
	});
			
	socket.on('disconnect',function(){
		socket.id = req.session.userID;
		delete SOCKET_LIST[socket.id];
		delete PLAYER_LIST[socket.id];
	});

	socket.on('keyPress',function(data){
		if(req.session.userID != null){
			var player = PLAYER_LIST[req.session.userID];
			if(data.inputId === 'left')
				player.pressingLeft = data.state;
			else if(data.inputId === 'right')
				player.pressingRight = data.state;
			else if(data.inputId === 'up')
				player.pressingUp = data.state;
			else if(data.inputId === 'down')
				player.pressingDown = data.state;
		}
	});
});

setInterval(function(){
    var pack = [];
    for(var i in PLAYER_LIST){
        var player = PLAYER_LIST[i];
        player.updatePosition();
        pack.push({
            x:player.x,
            y:player.y,
			color:player.color
        });    
    }
    for(var i in SOCKET_LIST){
        var socket = SOCKET_LIST[i];
        socket.emit('newPositions',pack);
    }
},1000/30);