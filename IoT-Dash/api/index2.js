'use strict';
const amqp = require('amqp');
const Hapi = require('hapi');
const InfluxDB = require('influxdb-nodejs');

let influxdb = new InfluxDB('http://root:root@127.0.0.1:8086/scimodo');

influxdb.schema('readings', {value:'float'}, {project:'string', device:'string', key:'string'});

let amqpConn = amqp.createConnection({heartbeat:15, url:'amqp://devices:scimodo@localhost:5672/devices'});
amqpConn.on('ready', () => {
    console.log('amqp connected');
    amqpConn.queue('backend-consumer-01', {durable:true, autoDelete:false}, queue => {
	console.log('connection to queue made');
	queue.bind('amq.topic', 'device.*.*', _ => {
	    console.log('queue is bound');
	    queue.subscribe(async (msg, headers, deliverInfo, obj) => {
		let time = new Date();
		time = time.getTime();
		let data = msg.data.toString().match(/.{1,16}/g).map(item => item.trim());
		let routingKey = deliverInfo.routingKey.split('.');
		let projectId = routingKey[1];
		let deviceId = routingKey[2];
		
		for(let i = 0; i < data.length; i+=2) {
		    if(data[i].trim() !== '') {
			let key = data[i].trim();
			let value = data[i+1].trim();
			influxdb.write('readings').tag({project:projectId, device:deviceId, key:key}).field({value:value}).time(time, "ms").then((err)=>{});
		    }
		}
	    });
	});
    })
});
amqpConn.on('error', err => console.log(err));

const server = new Hapi.Server();
server.connection({ port: 3000, host: '0.0.0.0', routes:{cors: true}});

let time1 = new Date();
let time2 = new Date();
let time3 = new Date();
let time4 = new Date();
let time5 = new Date();
let time6 = new Date();
let time7 = new Date();
let time8 = new Date();
let time9 = new Date();
let time10= new Date();

time2.setTime(time1.getTime() - 10000);
time3.setTime(time2.getTime() - 10000);
time4.setTime(time3.getTime() - 10000);
time5.setTime(time4.getTime() - 10000);
time6.setTime(time5.getTime() - 10000);
time7.setTime(time6.getTime() - 10000);
time8.setTime(time7.getTime() - 10000);
time9.setTime(time8.getTime() - 10000);
time10.setTime(time9.getTime() - 10000);

let _chart = {
    bindings:[{device:'abcdefgh', project:'12345678', key:'Counter'},
	      {device:'abcdefgh', project:'12345678', key:'Random'},
	      {device:'abcdefgh', project:'12345678', key:'Random4'}]
    id:Math.random() * 1000,
    title:'Demo ' + Math.random() * 1000,
    width:400,
    height:400,
    type:'line',
    duration:3600,
    timeframe: 'realtime'
    aggregation:60
};
server.route({ method: 'GET',
	       path: '/getdata/{chartid}',
	       handler: async (request, reply) => {
		   let chart = _chart
		   var datasets = [];
		   for(let binding of chart.bindings) {
		       dataset = await influxdb.queryRaw('SELECT value FROM readings WHERE time > now() - ' + chart.duration + 's AND project = \''+binding.project+'\' AND device = \'' + binding.device + '\' AND key = \'' + binding.key + '\'');
		       console.log(dataset);
		       binding.data = datasets
		       datasets.push(d);
		   }
		   reply(
		       [
			   {'TEMP': 10, 'HUMIDITY': 20, 'TIME': time1},
			   {'TEMP': 15, 'HUMIDITY': 21, 'TIME': time2},
			   {'TEMP': 10, 'HUMIDITY': 22, 'TIME': time3},
			   {'TEMP': 15, 'HUMIDITY': 23, 'TIME': time4},
			   {'TEMP': 10, 'HUMIDITY': 24, 'TIME': time5},
			   {'TEMP': 15, 'HUMIDITY': 25, 'TIME': time6},
			   {'TEMP': 10, 'HUMIDITY': 26, 'TIME': time7},
			   {'TEMP': 15, 'HUMIDITY': 27, 'TIME': time8},
			   {'TEMP': 10, 'HUMIDITY': 28, 'TIME': time9},
			   {'TEMP': 15, 'HUMIDITY': 29, 'TIME': time10},
		       ]
		   );
	       }
	     });

server.route({ method: 'GET',
	       path: '/getcharts',
	       handler: async (request, reply) => {
		   reply(
		       [
			   _chart
		       ]
		   );
	       }
	     });


server.start((err) => {

    if (err) {
	throw err;
    }
    console.log(`Server running at: ${server.info.uri}`);
});
