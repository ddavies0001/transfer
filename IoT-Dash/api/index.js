'use strict';
const amqp = require('amqp');
const Hapi = require('hapi');
const InfluxDB = require('influxdb-nodejs');
var mysql = require('mysql');
var UUID = require('uuid/v4');
var bcrypt = require('bcrypt');
var validator = require('validator');
var AuthBearer = require('hapi-auth-bearer-token');
var tokenGen = require('rand-token');
var request = require('requisition');

const GET = 'GET';
const POST = 'POST';
const PUT = 'PUT';
const DELETE = 'DELETE';


let influxdb = new InfluxDB('http://root:root@127.0.0.1:8086/scimodo');

const server = new Hapi.Server();

server.connection({ port: 3000, host: '0.0.0.0', routes:{cors: true}});
const io = require('socket.io')(server.listener);
io.sockets.on('connection', (socket) => {
    socket.on('room', (room) => {
	console.log('connecting ' + socket.id + ' to ' + room);
	socket.join(room);
    });
});

var pool  = mysql.createPool({
    connectionLimit : 10,
    host            : 'localhost',
    user            : 'scimodo',
    password        : '!QAZ3edc4',
    database        : 'scimodo'
});

pool._query = pool.query;
pool.query = function(sql, params) {
    return new Promise((resolve, reject) => {
	if(params) {
	    sql = sql.replace(/\:(\w+)/g, (txt, key) => {
		if(params[key] !== undefined) {
		    return this.escape(params[key] ? params[key] : null);
		}
		return txt;
	    });
	}
	pool._query(sql, null, (err, res, fields) => {
	    if(err) {
		console.error('SQL Error: ' + err.sqlMessage);
		return reject(err);
	    }
	    resolve({rows:res, fields:fields});
	});
    });
}

server.on('response', function (request) {
    console.log(request.info.remoteAddress + ': ' + request.method.toUpperCase() + ' ' + request.url.path + ' --> ' + request.response.statusCode);
});

influxdb.schema('readingsv2', {value:'float'}, {project:'string', device:'string', keytag:'string'});

let apikey = '73dafbf8918bbc24e2f0f309d2933be6';

async function getWeather() {
    let weathers = [];

    let time = new Date();
    time = time.getTime();
    let result = await pool.query('SELECT * FROM devices, projects, projectDevices WHERE devices.did = projectDevices.did AND projectDevices.pid = projects.pid AND type=\'Weather\'');
    for(let row of result.rows) {
	let res = weathers.filter(weather => weather.zipcode == row.zipcode);
	let weather = null;
	if(res.length == 0) {
	    console.log('getting weather for ' + row.zipcode);
	    let url = 'http://api.openweathermap.org/data/2.5/weather?zip=' + row.zipcode + '&appid=' + apikey + '&units=imperial';
	    try {
		let result = await request(url);
		weather = await result.json();
		//main.temp, main.pressure, main.humidity, visibility, wind.speed, wind.deg, clouds.all, rain.3h, snow.3h, icon, 
	    } catch (e) {
		console.log(e);
	    }
	} else {
	    weather = res[0].data;
	}

	await influxdb.write('readingsv2').tag({project: row.pid.substr(0,8), device:row.did.substr(0,8), keytag:'temperature'}).field({value:weather.main.temp}).time(time,"ms");
	io.sockets.in(row.did.substr(0,8)+'.'+row.pid.substr(0,8)+'.temperature').emit('data', row.did.substr(0,8), row.pid.substr(0,8),'temperature', time, weather.main.temp);

	await influxdb.write('readingsv2').tag({project: row.pid.substr(0,8), device:row.did.substr(0,8), keytag:'pressure'}).field({value:weather.main.pressure}).time(time,"ms");
	io.sockets.in(row.did.substr(0,8)+'.'+row.pid.substr(0,8)+'.pressure').emit('data', row.did.substr(0,8), row.pid.substr(0,8),'pressure', time, weather.main.pressure);

	await influxdb.write('readingsv2').tag({project: row.pid.substr(0,8), device:row.did.substr(0,8), keytag:'humidity'}).field({value:weather.main.humidity}).time(time,"ms");
	io.sockets.in(row.did.substr(0,8)+'.'+row.pid.substr(0,8)+'.humidity').emit('data', row.did.substr(0,8), row.pid.substr(0,8),'humidity', time, weather.main.humidity);

	await influxdb.write('readingsv2').tag({project: row.pid.substr(0,8), device:row.did.substr(0,8), keytag:'visibility'}).field({value:weather.visibility}).time(time,"ms");
	io.sockets.in(row.did.substr(0,8)+'.'+row.pid.substr(0,8)+'.visibility').emit('data', row.did.substr(0,8), row.pid.substr(0,8),'visibility', time, weather.main.visibility);

	await influxdb.write('readingsv2').tag({project: row.pid.substr(0,8), device:row.did.substr(0,8), keytag:'windspeed'}).field({value:weather.wind ? weather.wind.speed : 0}).time(time,"ms");
	io.sockets.in(row.did.substr(0,8)+'.'+row.pid.substr(0,8)+'.windspeed').emit('data', row.did.substr(0,8), row.pid.substr(0,8),'windspeed', time, weather.wind ? weather.wind.speed : 0);

	await influxdb.write('readingsv2').tag({project: row.pid.substr(0,8), device:row.did.substr(0,8), keytag:'winddirection'}).field({value:weather.wind ? weather.wind.deg : 0}).time(time,"ms");
	io.sockets.in(row.did.substr(0,8)+'.'+row.pid.substr(0,8)+'.winddirection').emit('data', row.did.substr(0,8), row.pid.substr(0,8),'winddirection', time, weather.wind ? weather.wind.deg : 0);

	await influxdb.write('readingsv2').tag({project: row.pid.substr(0,8), device:row.did.substr(0,8), keytag:'clouds'}).field({value:weather.clouds ? weather.clouds.all : 0}).time(time,"ms");
	io.sockets.in(row.did.substr(0,8)+'.'+row.pid.substr(0,8)+'.clouds').emit('data', row.did.substr(0,8), row.pid.substr(0,8),'couds', time, weather.clouds? weather.clouds.all : 0);

	await influxdb.write('readingsv2').tag({project: row.pid.substr(0,8), device:row.did.substr(0,8), keytag:'rain'}).field({value:weather.rain ? weather.rain['3h'] : 0}).time(time,"ms");
	io.sockets.in(row.did.substr(0,8)+'.'+row.pid.substr(0,8)+'.rain').emit('data', row.did.substr(0,8), row.pid.substr(0,8),'rain', time, weather.rain ? weather.rain['3h'] : 0);

	await influxdb.write('readingsv2').tag({project: row.pid.substr(0,8), device:row.did.substr(0,8), keytag:'snow'}).field({value:weather.snow ? weather.snow['3h'] : 0}).time(time,"ms");
	io.sockets.in(row.did.substr(0,8)+'.'+row.pid.substr(0,8)+'.snow').emit('data', row.did.substr(0,8), row.pid.substr(0,8),'snow', time, weather.snow ? weather.snow['3h'] : 0);

	await influxdb.write('readingsv2').tag({project: row.pid.substr(0,8), device:row.did.substr(0,8), keytag:'temperature'}).field({value:weather.main.temp}).time(time,"ms");
	io.sockets.in(row.did.substr(0,8)+'.'+row.pid.substr(0,8)+'.temperature').emit('data', row.did.substr(0,8), row.pid.substr(0,8),'temperature', time, weather.main.temp);
    }
};
getWeather();
setInterval(getWeather, 600000);

let amqpConn = amqp.createConnection({heartbeat:15, url:'amqp://devices:scimodo@localhost:5672/devices'});
amqpConn.on('ready', () => {
    console.log('amqp connected');
    amqpConn.queue('backend-consumer-01', {durable:true, autoDelete:false}, queue => {
	console.log('connection to queue made');
	queue.bind('amq.topic', 'device.*.*', _ => {
	    console.log('queue is bound');
	    queue.subscribe(async (msg, headers, deliverInfo, obj) => {
		console.log('processing message from ' + deliverInfo.routingKey);
		let time = new Date();
		time = time.getTime();
		deliverInfo.routingKey = deliverInfo.routingKey.toLowerCase();
		let data = msg.data.toString().match(/.{1,16}/g).map(item => item.trim());
		let routingKey = deliverInfo.routingKey.split('.');
		let projectId = routingKey[1];
		let deviceId = routingKey[2];
		
		for(let i = 0; i < data.length; i+=2) {
		    if(data[i].trim() !== '') {
			let key = data[i].trim();
			let value = data[i+1].trim();
			influxdb.write('readingsv2').tag({project:projectId, device:deviceId, keytag:key}).field({value:value}).time(time, "ms").then((err)=>{});
			io.sockets.in(deviceId+'.'+projectId+'.'+key).emit('data',deviceId, projectId, key, time,value);
		    }
		}
	    });
	});
    })
});
amqpConn.on('error', err => console.log(err));

server.register(AuthBearer, (err) => {

    server.auth.strategy('simple', 'bearer-access-token', {
	allowQueryToken: true,              // optional, false by default
	allowMultipleHeaders: false,        // optional, false by default
	accessTokenName: 'access_token',    // optional, 'access_token' by default
	validateFunc: async function (token, callback) {

	    // For convenience, the request object can be accessed
	    // from `this` within validateFunc.
	    var request = this;
	    // Use a real strategy here,
	    // comparing with a token from your database for example
	    let result = await pool.query('SELECT users.*, tokens.token, tokens.expires FROM users, tokens WHERE users.uid = tokens.uid AND tokens.token = :token', {token:token});
	    if(result.rows.length == 1 && result.rows[0].expires.getTime() > Date.now()) {
		if(Date.now() + (86400000) > result.rows[0].expires.getTime()) {
		    await pool.query('UPDATE tokens SET expires = NOW() + INTERVAL 2 HOUR WHERE token = :token', {token:token});
		}
		delete result.rows[0].password
		return callback(null, true, result.rows[0]);
	    }

	    return callback(null, false, { token: token }, {});
	}
    });
    function route(method, name, handler, auth) {
	let config = {method:method, path:'/'+name,config:{handler:handler}};
	if(auth)
	    config.config.auth='simple';
	server.route(config);
    }

    function getChart(id) {
	if(id === undefined) id = Math.floor(Math.random() * 1000);
	return  {
	    bindings:[{device:'abcdefgh', project:'12345678', keytag:'Counter'},
		      {device:'abcdefgh', project:'12345678', keytag:'Random'},
		      {device:'abcdefgh', project:'12345678', keytag:'Random4'}],
	    id:id,
	    title:'Demo ' + id,
	    width:(id % 40) * 10 + 400,
	    height:(id % 20) * 10 + 200,
	    type:'line',
	    duration:600,
	    timeframe: 'realtime',
	    aggregation:60
	};
    }
    
    route(GET, 'getdata/{chartid}', async (request, reply) => {
	try {
	    let chart = getChart(request.params.chartid);
	    var datasets = [];
	    for(let binding of chart.bindings) {
		let dataset = await influxdb.queryRaw('SELECT value FROM readingsv2 WHERE time > now() - ' + chart.duration + 's AND project = \''+binding.project+'\' AND device = \'' + binding.device + '\' AND keytag = \'' + binding.keytag + '\'');
		dataset = dataset.results[0].series[0].values.map(row => { return {x: (new Date(row[0])).getTime(), y: row[1]}; });
		binding.data = dataset;
		binding.label = binding.keytag;
		datasets.push(binding);
	    }
	    reply(datasets);
	} catch(e) {
	    console.error(e);
	}
    }, true);


    route(GET,  'getcharts', async (request, reply) => {
	reply(
	    [
		getChart(),
		getChart(),
		getChart(),
		getChart(),
	    ]
	);
    }, true);

    route(GET, 'email', async (req, rep) => {
	if(req.query.email == '') {
	    return rep();
	}
	if(req.query.email == 'invalidemail')
	    return rep({error:'email address is required'}).code(400);
	if(!validator.isEmail(req.query.email))
	    return rep({error:'email address is invalid'}).code(400);
	let result = await pool.query('SELECT * FROM users WHERE email = :email', {email:req.query.email});
	if(result.rows.length == 1) {
	    rep({error:'email address is already in use'}).code(409);
	} else {
	    rep();
	}
    });

    route(POST, 'user', async (req, rep) => {
	try {
	    if(req.payload.name === undefined || req.payload.name.length == 0)
		return rep({error:'Name is required'}).code(400);
	    if(req.payload.email === undefined || !validator.isEmail(req.payload.email))
		return rep({error:'Email is required'}).code(400);
	    if(req.payload.password === undefined || req.payload.password.length < 10)
		return rep({error:'password is required, and must be at least 10 characters long'}).code(400);

	    let uuid = UUID();
	    let hash = await bcrypt.hash(""+req.payload.password, 12);
	    let email = req.payload.email;

	    let emailResult = await pool.query('SELECT * FROM users WHERE email = :email', {email:req.payload.email});
	    if(emailResult.rows.length != 0)
		return rep({error:'That email address already has an account'}).code(409);

	    let result = await pool.query('INSERT INTO users SET uid = :uid, name = :name, email = :email, password = :password', {uid:uuid, name:req.payload.name, email:email, password:hash});
	    rep({uid:uuid});
	} catch(e) {
	    console.log(e);
	}
    });

    route(GET, 'logout', (req, rep) => { rep().code(401); });
    
    route(POST, 'login', async (req, rep) => {
	if(req.payload.email === undefined || !validator.isEmail(req.payload.email) || req.payload.password === undefined)
	    return rep({error:'Email and password must be provided'}).code(400);

	let result = await pool.query('SELECT * FROM users WHERE email = :email', {email:req.payload.email});
	if(result.rows.length == 0)
	    return rep({error:'Invalid email/password'}).code(403);
	let user = result.rows[0];

	let valid = await bcrypt.compare(req.payload.password, user.password);
	if(valid) {
	    let token = tokenGen.generate(255);
	    await pool.query('INSERT INTO tokens SET token = :token, uid = :uid, expires = NOW() + INTERVAL 26 HOUR', {token:token,uid:user.uid});
	    rep({uid:user.uid, token:token});
	} else
	    rep({error:'Invalid email/password'}).code(403);
    });

    route(GET, 'user', async (req, rep) => {
	rep(req.auth.credentials);
    }, true);


    route(POST, 'device', async (req, rep) => {
	if(req.payload.name === undefined) {
	    return rep({error:'Name is required'}).code(400);
	}
	let sql = getDeviceSQL(req.payload);
	sql = 'INSERT INTO devices SET ' + sql + ' , uid = :uid , did= :did';
	req.payload.uid = req.auth.credentials.uid;
	req.payload.did = UUID();
	let response = await pool.query(sql, req.payload);
	return rep({did:req.payload.did, uid:req.payload.uid, name:req.payload.name, zipcode:req.payload.zipcode});
    }, true);

    route(PUT, 'device', async (req, rep) => {
	if(req.payload.name === undefined) {
	    return rep({error:'Name is required'}).code(400);
	}
	let sql = getDeviceSQL(req.payload);
	sql = 'UPDATE devices SET ' + sql + ' WHERE uid = :uid AND did= :did ';
	req.payload.uid = req.auth.credentials.uid;
	let response = await pool.query(sql, req.payload);
	return rep({did:req.payload.did});
    }, true);

    route(POST, 'project', async (req, rep) => {
	if(req.payload.name === undefined) {
	    return rep({error:'Name is required'}).code(400);
	}
	let sql = getProjectSQL(req.payload);
	sql = 'INSERT INTO projects SET ' + sql + ' , uid = :uid , pid= :pid';
	req.payload.uid = req.auth.credentials.uid;
	req.payload.pid = UUID();
	let response = await pool.query(sql, req.payload);
	return rep({pid:req.payload.pid, uid:req.payload.uid, name:req.payload.name});
    }, true);

    route(PUT, 'project', async (req, rep) => {
	if(req.payload.name === undefined) {
	    return rep({error:'Name is required'}).code(400);
	}
	req.payload.uid = req.auth.credentials.uid;
	let sql = getProjectSQL(req.payload);
	sql = 'UPDATE projects SET ' + sql + ' WHERE uid = :uid AND pid= :pid ';
	let response = await pool.query(sql, req.payload);
	return rep({pid:req.payload.pid});
    }, true);

    route(POST, 'board', async (req, rep) => {
	if(req.payload.name === undefined) {
	    return rep({error:'Name is required'}).code(400);
	}
	let sql = getBoardSQL(req.payload);
	sql = 'INSERT INTO boards SET ' + sql + ' , uid = :uid , bid= :bid';
	req.payload.uid = req.auth.credentials.uid;
	req.payload.bid = UUID();
	let response = await pool.query(sql, req.payload);
	return rep({bid:req.payload.bid, uid:req.payload.uid, name:req.payload.name});
    }, true);

    route(PUT, 'board', async (req, rep) => {
	if(req.payload.name === undefined) {
	    return rep({error:'Name is required'}).code(400);
	}
	let sql = getBoardSQL(req.payload);
	sql = 'UPDATE boards SET ' + sql + ' WHERE uid = :uid AND bid= :bid ';
	req.payload.uid = req.auth.credentials.uid;
	let response = await pool.query(sql, req.payload);
	return rep({bid:req.payload.bid});
    }, true);

    route(POST, 'assoc', async (req, rep) => {
	if(req.payload.pid === undefined || req.payload.did === undefined) {
	    return rep({error:'Name is required'}).code(400);
	}
	req.payload.uid = req.auth.credentials.uid;
	let sql = getAssocSQL(req.payload);
	let auth = await pool.query('SELECT * FROM projects WHERE uid = :uid AND pid = :pid', req.payload);
	if(auth.rows.length == 1) {
	    sql = 'INSERT INTO projectDevices SET ' + sql + ' , aid= :aid';
	    req.payload.aid = UUID();
	    let response = await pool.query(sql, req.payload);
	    return rep({aid: req.payload.aid, did: req.payload.did, pid: req.payload.pid});
	} else {
	    return rep({error:'not authorized'});
	}
    }, true);

    route(DELETE, 'assoc', async (req, rep) => {
	if(req.payload.aid === undefined) {
	    return rep({error:'Name is required'}).code(400);
	}
	req.payload.uid = req.auth.credentials.uid;
	let auth = await pool.query('SELECT * FROM projects,projectDevices WHERE uid = :uid AND projects.pid = projectDevices.pid AND aid = :aid', req.payload);
	if(auth.rows.length == 1) {
	    let sql = 'DELETE FROM projectDevices WHERE aid= :aid';
	    let response = await pool.query(sql, req.payload);
	    return rep({aid:req.payload.aid});
	} else {
	    return rep({error:'not authorized'});
	}
    }, true);

    route(GET, 'projects', async (req, rep) => {
	let results = await pool.query('SELECT projects.* FROM projects WHERE uid = :uid ORDER BY name', {uid: req.auth.credentials.uid});
	for(let i = 0; i < results.rows.length; i++) {
	    results.rows[i].assoc = (await pool.query('SELECT projectDevices.* FROM projectDevices, devices WHERE projectDevices.did = devices.did AND pid = :pid ORDER BY name', {pid: results.rows[i].pid})).rows;
	}
	console.log(results.rows);
	return rep(results.rows);
    }, true);

    route(GET, 'devices', async (req, rep) => {
	let results = await pool.query('SELECT * FROM devices WHERE uid = :uid ORDER BY name', {uid: req.auth.credentials.uid});
	return rep(results.rows);
    }, true);

    route(GET, 'boards', async (req, rep) => {
	let results = await pool.query('SELECT * FROM boardss WHERE uid = :uid ORDER BY name', {uid: req.auth.credentials.uid});
	return rep(results.rows);
    }, true);

    route(POST, 'chart', async (req, rep) => {
	if(req.payload.name === undefined) {
	    return rep({error:'Name is required'}).code(400);
	}
	req.payload.uid = req.auth.credentials.uid;
	req.payload.config = JSON.stringify(req.payload.config);
	req.payload.uid = req.auth.credentials.uid;
	req.payload.cid = UUID();
	let sql = getChartSQL(req.payload);
	let result = pool.query('SELECT * FROM boards WHERE uid = :uid AND did = :did', req.payload);
	if(results.rows.length == 1) {
	    sql = 'INSERT INTO charts SET ' + sql + ', cid = :cid';
	    let response = await pool.query(sql, req.payload);
	    return rep({bid:req.payload.bid, did:req.payload.did, name:req.payload.name, position:req.payload.position, config: JSON.parse(req.payload.config)});
	} else {
	    return rep({error:'not authorized'});
	}
    }, true);

    route(PUT, 'chart', async (req, rep) => {
	if(req.payload.name === undefined) {
	    return rep({error:'Name is required'}).code(400);
	}
	req.payload.uid = req.auth.credentials.uid;
	req.payload.config = JSON.stringify(req.payload.config);
	req.payload.uid = req.auth.credentials.uid;
	req.payload.cid = UUID();
	let sql = getChartSQL(req.payload);
	let result = pool.query('SELECT * FROM boards WHERE uid = :uid AND did = :did', req.payload);
	if(results.rows.length == 1) {
	    sql = 'UPDATE charts SET ' + sql + ' WHERE cid = :cid';
	    let response = await pool.query(sql, req.payload);
	    return rep({bid:req.payload.bid});
	} else {
	    return rep({error:'not authorized'});
	}
    }, true);

});

function getAssocSQL(data) {
    let fields = ['pid', 'did'];
    return getSQL(data, fields);
}

function getChartSQL(data) {
    let fields = ['name', 'did', 'position', 'config'];
    return getSQL(data, fields);
}

function getBoardSQL(data) {
    let fields = ['name'];
    return getSQL(data, fields);
}

function getDeviceSQL(data) {
    let fields = ['name', 'zipcode', 'type'];
    return getSQL(data, fields);
}

function getProjectSQL(data) {
    let fields = ['name'];
    return getSQL(data, fields);
}

function getSQL(data, fields) {
    let x = 1;
    let sql = '';
    let _data = [];
    let keys = Object.keys(data);
    for(let key of keys) {
	if(fields.includes(key)) {
	    sql += sql.length ? ' ,' : '';
	    sql += '`'+key + '`= :' + key;
	    x++;
	}
    }
    return sql;
}

server.start((err) => {
    
    if (err) {
	throw err;
    }
    console.log(`Server running at: ${server.info.uri}`);
});
