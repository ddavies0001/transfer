var self = null;
var sammy = null;
//var host = 'http://ec2-52-72-137-164.compute-1.amazonaws.com:3000';
//var host = 'http://ec2-3-88-8-196.compute-1.amazonaws.com:3000';
var host = 'http://ec2-3-84-59-231.compute-1.amazonaws.com:3000';

let rooms = [];
let socket = io.connect(host+'/');
socket.on('data', (device, project, keytag, time, value) => {
  value = parseInt(value);
  if(self.realtime()) {
    self.projects().forEach(proj => {
      proj.charts().forEach(chart => {
        let now = new Date();
        now = now.getTime() - 1000 * self.duration();
        let changed = false;
        chart.data.orig().forEach(dataset => {
          if(dataset.device == device && dataset.project == project && dataset.keytag == keytag) {
            dataset.data.push({x:time, y:value});
            dataset.data = dataset.data.filter(row => now < row.x);
            changed = true;
          }
        });
        if(changed) {
          let newdata = getNewData(chart.data.orig(), chart);
          if(chart.config.type() == 'line') {
            chart.data.datasets(newdata);
          } else if(chart.config.type() == 'bar') {
            labels = ko.observableArray(newdata[0].data.map(row => row.x));
            let newdata2 = newdata.map(dataset => { dataset.data = dataset.data.map(row => row.y); return dataset});
            chart.data.datasets(newdata2);
            chart.data.labels(labels);
          }
        }
      })
    })
    updateGauges();
  }
});

let gauges = new Map();
function clearGauges(it) {
  it[0].bindings().forEach(binding => {
    gauges.delete(''+binding.sequence());
  });
}
function updateGauges() {
  let canvases = $('#charts').find('canvas[keytag]');
  for(let canvas of canvases) {
    canvas = $(canvas);
    let keytag = canvas.attr('keytag');
    let device = canvas.attr('device');
    let sequence = canvas.attr('id');
    let color = getColor(device+'.'+keytag, true);
    let gauge = gauges.get(sequence);
    if(!gauge) {
      gauge = new Gauge(canvas[0], {color:color, bgcolor:'white', unit:' '});
      gauge.setSetting('min', 0);
      gauges.set(sequence, gauge);
    }
    let chart = self.project().charts().find(chart => chart.bindings().filter(binding => binding.device() == device && binding.keytag() == keytag && binding.selected()).length > 0);
    let dataset = chart.data.orig().find(dataset => dataset.device == device && dataset.keytag == keytag);
    let max = dataset.data.reduce((a,b) => a > b.y ? a : b.y, 0);
    gauge.setSetting('max', max);
    gauge.value(parseFloat(Math.floor(dataset.data[dataset.data.length - 1].y * 100)) / 100);
  };
}

function formatDate(date) {
  var hours = date.getHours();
  var minutes = date.getMinutes();
  var seconds = date.getSeconds();
  var ampm = hours >= 12 ? 'pm' : 'am';
  hours = hours % 12;
  hours = hours ? hours : 12; // the hour '0' should be '12'
  minutes = minutes < 10 ? '0'+minutes : minutes;
  seconds = seconds < 10 ? '0'+seconds:seconds;
  var strTime = hours + ':' + minutes + ':' + seconds + ' ' + ampm;
  return date.getMonth()+1 + "/" + date.getDate() + "/" + date.getFullYear() + "  " + strTime;
}

function getNewData(data, chart) {
  //if(chart.config.type().toLowerCase() == 'line') {
  let data2 = data;
  let newdata = data.map(dataset => {
    if(!rooms.includes(dataset.device+'.'+dataset.project+'.'+dataset.keytag)) {
      socket.emit('room', dataset.device+'.'+dataset.project+'.'+dataset.keytag);
      rooms.push(dataset.device+'.'+dataset.project+'.'+dataset.keytag);
    }
    let data = dataset.data.reduce((newset,row) => {
      if(newset[parseInt(row.x/self.interval()/1000)] === undefined) {
        newset[parseInt(row.x/self.interval()/1000)] = [row.y];
      } else {
        newset[parseInt(row.x/self.interval()/1000)].push(row.y);
      }
      return newset;
    }, {});
    data = Object.keys(data).map(key => { return {x: formatDate(new Date(key*self.interval()*1000)), y:data[key].reduce((a,b) => a+b, 0)/data[key].length}});
    let color = getColor(dataset.device+'.'+dataset.keytag);
    let label = dataset.label;
    if(data2.filter(set => { return set.label.toLowerCase() == dataset.label.toLowerCase() }).length > 1) {
      label = self.devices().find(device => dataset.device == device.did().substr(0,8)).name() + ' ' + dataset.label;
    }
    return {backgroundColor:color,borderColor:color, pointBorderColor:color, data:data, label:label};
  });

  if(chart.config.type() == 'bar') {
    newdata.forEach(d1 => {
      d1.data.forEach(r1 => {
        newdata.forEach(d2 => {
          if(!d2.data.find(r2 => r2.x == r1.x)) {
            d2.data.push({x: r1.x, y: 0});
          }
        })
      })
    })
    newdata.forEach(d => {
      d.data.sort(function(a,b) {
        return new Date(b.x) - new Date(a.x);
      })
    })
  }
  return newdata;
  /*} else if(chart.config.type().toLowerCase() == 'bar') {
  return data.map(dataset => {
  if(!rooms.includes(dataset.device+'.'+dataset.project+'.'+dataset.keytag)) {
  socket.emit('room', dataset.device+'.'+dataset.project+'.'+dataset.keytag);
  rooms.push(dataset.device+'.'+dataset.project+'.'+dataset.keytag);
}
let data = dataset.data.reduce((newset,row) => {
if(newset[parseInt(row.x/self.interval()/1000)] === undefined) {
newset[parseInt(row.x/self.interval()/1000)] = [row.y];
} else {
newset[parseInt(row.x/self.interval()/1000)].push(row.y);
}
return newset;
}, {});
data = Object.keys(data).map(key => { return data[key].reduce((a,b) => a+b, 0)/data[key].length});
let color = getColor(dataset.device+'.'+dataset.keytag);
let label = dataset.label;
if(data.filter(set => set.label == dataset.label))
return {backgroundColor:color,borderColor:color, pointBorderColor:color, data:data, label:label};
});
}*/
}

function loadData(callback) {
  let projects =null;
  let devices = null;
  let promises = [
    new Promise(resolve => {
      if(self.project() !== null) {
        resolve();
      } else if(self.projects().length > 0) {
        self.project(self.projects()[0]);
        resolve();
      } else {
        $.get(host + '/projects', data => {
          projects = data;
          resolve();
        });
      }
    }),
    new Promise(resolve => {
      if(self.user() !== null) {
        resolve();
      } else {
        $.get(host + '/user', data => {
          self.user(new User(data));
          resolve();
        });
      }
    }),
    new Promise(resolve => {
      if(self.device() !== null) {
        resolve();
      } else if(self.devices().length > 0) {
        self.device(self.devices()[0]);
        resolve();
      } else {
        $.get(host + '/devices', data => {
          devices = data;
          resolve();
        });
      }
    })
  ];
  Promise.all(promises).then(_=> {
    self.devices(devices.map(item => new Device(item)));
    self.device(self.devices()[0]);
    self.projects(projects.map(item => new Project(item)));
    self.project(self.projects()[0]);
    callback();
  });
}

function Project(data) {
  data.pid = data.pid ? data.pid : '00000000-0000-0000-0000-000000000000';
  let that = this;
  that.pid = ko.observable(data.pid);
  that.device = ko.observable(null);
  that.assoc = ko.observable(null);
  that.name = ko.observable(data.name);
  that.assocs = ko.observableArray(data.assocs ? data.assocs.map(assoc => new Assoc(assoc)) : []);
  that.charts = ko.observableArray(data.charts ? data.charts.map(chart => new Chart(chart)) : []);
  that.displayName = ko.computed(function() {
    return that.name() ? that.name() : 'New Project';
  });
  that.devices = ko.computed(function() {
    return self.devices().filter(device => that.assocs().filter(assoc => assoc.did() == device.did()) == 0);
  });
  that.id = ko.computed(function() {
    return that.pid().substr(0,8).toUpperCase();
  });
  that.hashid = ko.computed(function() {
    return '#' + that.pid();
  });
  that.getDashboardLink = ko.computed(function() {
    return '#dashboard/' + that.pid();
  });
  that.associate = function() {
    $.post(host+'/assoc', {did:that.device().did(), pid:that.pid()}, data => {
      let assoc = new Assoc(data);
      that.assocs.push(assoc);
      that.device(null);
    })
  }
  that.disassociate = function() {
    $.delete(host+'/assoc', {aid: that.assoc().aid()}, data => {
      that.assocs.remove(that.assoc());
      that.assoc(null);
    });
  }
  that.save = function(_, event) {
    if($(event.target).parent().validator('validate').has('.has-error').length == 0) {
      let it = JSON.parse(JSON.stringify(ko.toJS(that)));
      let fun = it.pid == '00000000-0000-0000-0000-000000000000' ? $.post : $.put;
      fun(host+'/project', it, data => {
        if(it.pid == '00000000-0000-0000-0000-000000000000') {
          that.pid(data.pid);
        }
        $(that.hashid()).collapse('hide');
      });
    }
  }
  that.addChart = function() {
    let chart = new Chart({bindings:[],pid:that.pid(),name:'New Chart',config:{width:500, height:300, type:'line', x:'', y1:'', y2:''}, data:[]});
    that.charts.push(chart);
  }
  that.showAddChart = ko.computed(function() {
    return that.charts().filter(chart => chart.cid() == '00000000-0000-0000-0000-000000000000').length == 0;
  })
  that.charts.subscribe(function (changes) {
    let charts = that.charts();
    for(let i = 0; i < charts.length; i++) {
      if(charts[i].position() != i) {
        charts[i].position(i);
        charts[i].save();
      }
    }
  }, null, "arrayChange");
  that.del = function() {
    if(self.projects().length <= 1) {
      return;
    }
    self.projects(self.projects().filter(project => project.pid() != that.pid()));
    if(self.project().pid() == that.pid()) {
      self.project(self.projects()[0]);
    }
    $.delete(host+'/project', {pid:that.pid()}, _=>{});
  }
}
let bindingId = 0;
function Binding(data) {
  let that = this;
  that.device = ko.observable(data.device);
  that.project = ko.observable(data.project);
  that.keytag = ko.observable(data.keytag);
  that.selected = ko.observable(!!data.selected);
  that.id = ko.computed(function() {
    if(self.devices().length == 0) return "";
    return self.devices().find(device => device.did().substr(0,8) == that.device()).name() + ' - ' + that.keytag();
  })
  that.sequence = ko.observable(bindingId++);
}

let colors = ['rgba(0,255,0,0.15)','rgba(0,0,255,0.15)','rgba(255,0,0,0.15)',
'rgba(255,255,0,0.15)','rgba(0,255,255,0.15)','rgba(255,0,255,0.15)',
'rgba(255,150,0,0.15)','rgba(150,255,0,0.15)','rgba(0,150,255,0.15)',
'rgba(0,255,150,0.15)','rgba(0,150,255,0.15)','rgba(255,0,150,0.15)'];
let colors2 = ['rgba(0,255,0,0.5)','rgba(0,0,255,0.5)','rgba(255,0,0,0.5)',
'rgba(255,255,0,0.5)','rgba(0,255,255,0.5)','rgba(255,0,255,0.5)',
'rgba(255,150,0,0.5)','rgba(150,255,0,0.5)','rgba(0,150,255,0.5)',
'rgba(0,255,150,0.5)','rgba(0,150,255,0.5)','rgba(255,0,150,0.5)'];
let assignments = {};
let assignments2 = {};

function getColor(key, opaque) {
  if(assignments[key] && !opaque) return assignments[key];
  if(assignments2[key] && opaque) return assignments2[key];
  assignments[key] = colors.shift();
  colors.push(assignments[key]);
  assignments2[key] = colors2.shift();
  colors2.push(assignments2[key]);
  return opaque ? assignments2[key] : assignments[key];
}
function getCData(data, that) {
  let newdata = getNewData(data, that);
  let labels = '';
  let newdata2 = null;
  if(that.config.type() == 'line') {
    labels = ko.observableArray(newdata.map(set => set.label));
    newdata2 = newdata;
  } else if(that.config.type() == 'bar') {
    labels = ko.observableArray(newdata[0].data.map(row => row.x));
    newdata2 = newdata.map(dataset => { dataset.data = dataset.data.map(row => row.y); return dataset});
  }

  let cdata = {
    datasets: ko.observableArray(newdata2),
    orig: ko.observableArray(data),
    labels: labels,
    settings:ko.observable(that.config),
    triggerUpdate:ko.observable(0)
  };
  return cdata;
}

function Chart(data) {
  data.cid = data.cid ? data.cid : '00000000-0000-0000-0000-000000000000';
  if(typeof data.config == 'string') {
    data.config = JSON.parse(data.config);
  }
  if(typeof data.bindings == 'string') {
    data.bindings = JSON.parse(data.bindings).map(binding => new Binding(binding));
  } else {
    data.bindings = data.bindings.map(binding => { binding.selected=true; return new Binding(binding)});
  }

  let that = this;
  that.id = Math.random();
  that.types = ko.observableArray([{name:'Bar', type:'bar'}, {name:'Line', type:'line'}, {name:'Gauge', type:'pie'}]);
  that.cid = ko.observable(data.cid);
  that.pid = ko.observable(data.pid);
  that.name = ko.observable(data.name);
  that.position = ko.observable(data.position);
  that.config = ko.mapping.fromJS(data.config);
  that.bindings = ko.observableArray(data.bindings);
  that.showChart = ko.observable(data.cid && data.cid != '00000000-0000-0000-0000-000000000000');
  that.type = ko.computed(function() {
    return that.config.type().toLowerCase();
  });
  that.data = getCData(data.data, that);
  that.width = ko.computed(function() { return that.config.width() + 'px';});
  that.height = ko.computed(function() { return that.config.height() + 'px';});
  that.options = ko.computed(function() {
    return {
      title: {
        display:true,
        text:that.name()
      },
      observeChanges:true,
      animation:{duration:0},
      maintainAspectRatio: false,
      scales: {
        yAxes: [{
          scaleLabel: {
            display:true,
            labelString:that.config.y1
          },
          ticks: {
            beginAtZero:true
          }
        }],
        xAxes: [{
          scaleLabel: {
            display:true,
            labelString:that.config.x()
          },
          type:'time',
          ticks: {
            minRotation:15
          }
        }]
      }
    };
  });
  that.showChart.subscribe(function () {
    if(!that.showChart()) {
      $.get(host+'/keytags', data => {
        data.map(binding => {
          if(!that.bindings().find(b => b.project() == binding.project && b.device() == binding.device && b.keytag() == binding.keytag) && binding.project == self.project().pid().substr(0,8)) {
            that.bindings.push(new Binding(binding));
          }
        })
      })
    }
  });
  that.updateChartMeta = function() {
    that.save(function() {
      let charts = self.project().charts();
      for(let i = 0; i < charts.length; i++) {
        if(charts[i].equals(that)) {
          let it = self.project().charts.splice(i,1);
          clearGauges(it);
          self.project().charts.splice(i,0,it[0]);
          updateGauges();
        }
      }
    });
  };
  that.equals = function(chart) {
    if(chart.id == that.id) return true;
  }
  that.del = function() {
    self.project().charts(self.project().charts().filter(chart => chart.cid() != that.cid()));
    $.delete(host+'/chart', {cid:that.cid()}, _=>{});
  }

  that.save = function(_, event) {
    that.bindings(that.bindings().filter(binding => binding.selected()));
    let js = ko.toJS(that);
    delete js.data;
    delete js.options;
    delete js.types;
    js.config = ko.toJS(js.config);
    js.bindings = ko.toJS(js.bindings);

    let it = JSON.parse(JSON.stringify(js));
    delete it.config.__ko_mapping__;
    it.config = JSON.stringify(it.config);
    it.bindings = JSON.stringify(it.bindings);
    let fun = it.cid == '00000000-0000-0000-0000-000000000000' ? $.post : $.put;
    fun(host+'/chart', it, data => {
      if(it.cid == '00000000-0000-0000-0000-000000000000') {
        that.cid(data.cid);
      }
      let endtime = self.realtime() ? new Date() : new Date(self.endtime());
      let starttime = self.realtime() ? new Date(Date.now() - self.duration() *1000) : new Date(self.starttime());
      if(endtime.getTime() < starttime.getTime() || endtime.getTime() - starttime.getTime() > 3600*24*30*1000) {
        self.hasError(true);
        return;
      } else {
        self.hasError(false);
      }
      if(''+endtime.getTime() != 'NaN' && ''+starttime.getTime() != 'NaN') {
        $.get(host+'/getdata/'+that.cid()+'/'+starttime.getTime()+'/'+endtime.getTime(), data => {
          let cdata = getCData(data, that);
          that.data = cdata;
          if(typeof _ == 'function') {
            _();
          }
        });
      }
    });
    that.showChart(true);
  }

  that.savesize = function(e,u) {
    if(that.cid() != '00000000-0000-0000-0000-000000000000') {
      that.save();
    }
  }

  that.setsize = function(e,u) {
    that.config.width(u.size.width);
    that.config.height(u.size.height);
  }
}

function Assoc(data) {
  let that = this;
  that.aid = ko.observable(data.aid);
  that.pid = ko.observable(data.pid);
  that.did = ko.observable(data.did);
  that.name = ko.computed(function() {
    if(self.devices().length == 0) return "";
    return self.devices().filter(device => device.did() == that.did())[0].name();
  });
}

function Device(data) {
  data.did = data.did ? data.did : '00000000-0000-0000-0000-000000000000';
  let that = this;
  that.types = ko.observableArray(['Weather']);
  that.did = ko.observable(data.did);
  that.name = ko.observable(data.name);
  that.type = ko.observable(data.type);
  that.zipcode = ko.observable(data.zipcode);
  that.displayName = ko.computed(function() {
    return that.name() ? that.name() : 'New Device';
  });
  that.id = ko.computed(function() {
    return that.did().substr(0,8).toUpperCase();
  });
  that.hashid = ko.computed(function() {
    return '#' + that.did();
  });
  that.save = function(_, event) {
    if($(event.target).parent().validator('validate').has('.has-error').length == 0) {
      let it = JSON.parse(JSON.stringify(ko.toJS(that)));
      let fun = it.did == '00000000-0000-0000-0000-000000000000' ? $.post : $.put;
      if(it.name) {
        fun(host+'/device', it, data => {
          if(it.did == '00000000-0000-0000-0000-000000000000') {
            that.did(data.did);
          }
          $(that.hashid()).collapse('hide');
        });
      }
    }
  }
  that.del = function() {
    if(self.devices().length <= 1) {
      return;
    }
    self.devices(self.devices().filter(device => device.did() != that.did()));
    if(self.device().did() == that.did()) {
      self.device(self.device()[0]);
    }
    $.delete(host+'/device', {did:that.did()}, _=>{});
  }
}

function User(data, signup) {
  data.uid = data.uid ? data.uid : '00000000-0000-0000-0000-000000000000';
  let that = this;
  that.uid = ko.observable(data.uid);
  that.name = ko.observable(data.name);
  that.email = ko.observable(data.email);
  that.zipcode = ko.observable('');
  that.password = ko.observable('');
  that.password2 = ko.observable('');
  that.signup = ko.observable(signup);

  that.save = function(_, event) {
    if($(event.target).parent().validator('validate').has('.has-error').length == 0) {
      let it = JSON.parse(JSON.stringify(ko.toJS(that)));
      let fun = it.uid == '00000000-0000-0000-0000-000000000000' ? $.post : $.put;
      that.email('');
      that.password('');
      that.password2('');
      that.zipcode('');
      that.name('');
      fun(host+'/user', it, data => {
        $.post(host+'/login', it, (r) => {
          localStorage.setItem('token', r.token);
          self.loggedin(true);
          $.get(host+'/user', data => {
            self.user(new User(data));
            let name = it.name;
            it.name = name + '\'s Project';
            $.post(host+'/project', it, data => {
              let project = new Project(data);
              self.project(project);
              self.projects.push(project);
              it.name = name + '\'s First Device';
              it.type = 'MKR1000';
              $.post(host+'/device', it, data => {
                let device = new Device(data);
                self.device(device);
                self.devices.push(device);
                $.post(host+'/assoc', {pid:self.project().pid(), did: self.device().did()}, data => {
                  self.project().assocs.push(new Assoc(data));
                  location = '#introduction';
                })
              });
            });
          });
        });
      });
    }
  }

  that.login = function() {
    //$('#username').parent().removeClass('has-danger').find('p').text('');
    let it = ko.toJS(that);
    $.post(host+'/login', JSON.parse(JSON.stringify(it)), (r) => {
      localStorage.setItem('token', r.token);
      self.loggedin(true);
      loadData(_=> {
        location = "#dashboard"
      });
    })
    .fail((e) => {
      $('#username').parent().addClass('has-danger').find('p').text(e.responseJSON.error);
    });
  }
}

function AppViewModel() {
  self = this;
  self.goBack=function(){
    let bits = location.hash.replace('#','').split('/');
    if(bits.length == 2 && bits[1] != '00000000-0000-0000-0000-000000000000' && bits[1].length == 36) self[bits[0]]().save();
    bits.pop();
    location = '#' + bits.join('/');
  }
  self.register = ko.observable(new User({},true));
  self.login = ko.observable(new User({},false));
  self.page=ko.observable('login');
  self.showPage=function(page) {
    return self.page() == page;
  };
  self.devices = ko.observableArray([]);
  self.devicesOnly = ko.computed(function() {
    return self.devices().filter(device => device.type() == "MKR1000");
  })
  self.devicesSource = ko.computed(function() {
    return self.devices().filter(device => device.type() != "MKR1000");
  })
  self.device = ko.observable(null);
  self.projects = ko.observableArray([]);
  self.bindings = ko.observableArray([]);
  self.realtime = ko.observable(true);
  var tzoffset = (new Date()).getTimezoneOffset();
  let date = new Date();
  self.starttime = ko.observable((new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1, 0, 0-tzoffset, 0)).toISOString().replace('Z',''));
  self.endtime = ko.observable((new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0-tzoffset, 0)).toISOString().replace('Z',''));
  self.duration = ko.observable(3600*8);
  self.durations = ko.observableArray([
    {seconds:1800, text:'30 Minutes'},
    {seconds:3600*2, text:'2 Hours'},
    {seconds:3600*8, text:'8 Hours'},
    {seconds:3600*24, text:'1 Day'},
    {seconds:3600*48, text:'2 Days'},
    {seconds:3600*96, text:'4 Days'},
    {seconds:3600*24*7, text:'1 Week'},
  ])
  self.interval = ko.observable(600);
  self.hasError = ko.observable(false);
  self.intervals = ko.observableArray([
    {seconds:60, text:'1 Minute'},
    {seconds:300, text:'5 Minutes'},
    {seconds:600, text:'10 Minutes'},
    {seconds:1800, text:'30 Minutes'},
    {seconds:3600, text:'1 Hour'},
    {seconds:3600*4, text:'4 Hours'},
    {seconds:3600*12, text:'12 Hours'},
    {seconds:3600*24, text:'1 Day'},
  ]);
  function timechange() {
    self.project().charts().forEach(that => {
      if(that.cid() != '00000000-0000-0000-0000-000000000000') {
        let endtime = self.realtime() ? new Date() : new Date(self.endtime());
        let starttime = self.realtime() ? new Date(Date.now() - self.duration() *1000) : new Date(self.starttime());
        if(endtime.getTime() < starttime.getTime() || endtime.getTime() - starttime.getTime() > 3600*24*30*1000) {
          self.hasError(true);
          return;
        } else {
          self.hasError(false);
        }
        if(''+endtime.getTime() != 'NaN' && ''+starttime.getTime() != 'NaN') {
          $.get(host+'/getdata/'+that.cid()+'/'+starttime.getTime()+'/'+endtime.getTime(), data => {
            let cdata = getCData(data, that);
            that.data.datasets(cdata.datasets());
            that.data.orig(cdata.orig());
            that.data.labels(cdata.labels());
            that.data.settings(cdata.settings());
          });
        }
      }
    });
  }
  self.duration.subscribe(timechange);
  self.starttime.subscribe(timechange);
  self.endtime.subscribe(timechange);
  self.interval.subscribe(timechange);
  self.realtime.subscribe(timechange);

  self.project = ko.observable(null);
  self.bindingsForProject = ko.computed(function() {
    let curproj = self.project();
    if(!curproj) {
      return [];
    }
    curproj = curproj.pid().substr(0,8);
    return self.bindings().filter(binding => binding.project() == curproj)
  });
  self.loggedin = ko.observable(false);
  self.user = ko.observable(null);
  self.zipcode = ko.observable('');
  self.addDevice = function(_,event) {
    let device = new Device({});
    self.devices.push(device);
    $(device.hashid()).collapse('show');
  }
  self.addDeviceMkr = function(_,event) {
    let device = new Device({type:'MKR1000'});
    self.devices.push(device);
    $(device.hashid()).collapse('show');
  }
  self.addDeviceVisibleMkr = ko.computed(function() {
    return self.devices().filter(device => device.type()=='MKR1000' && device.did()=='00000000-0000-0000-0000-000000000000').length == 0;
  });
  self.addDeviceVisible = ko.computed(function() {
    return self.devices().filter(device => device.type()!='MKR1000' && device.did()=='00000000-0000-0000-0000-000000000000').length == 0;
  });
  self.addProjectVisible = ko.computed(function() {
    return self.projects().filter(project => project.pid()=='00000000-0000-0000-0000-000000000000').length == 0;
  });

  self.addProject = function() {
    let project = new Project({});
    self.projects.push(project);
    $(project.hashid()).collapse('show');
  }

  function runSammy() {
    Sammy(function () {
      sammy = this;
      this.get('#weather/:wid', function() {
        let that = this;
        let weather = self.weathers().filter(weather => weather.wid() == that.params.wid)
        if(that.params.wid == '00000000-0000-0000-0000-000000000000') {
          weather = [new Weather({wid:'00000000-0000-0000-0000-000000000000'})];
        }

        if(weather.length == 1) {
          self.weather(weather[0]);
          self.page(that.params.wid == '00000000-0000-0000-0000-000000000000' ? 'weather-add' : 'weather-edit');
        }
      });
      this.get('#home', function() {
        $.get(host+'/logout');
        self.page('home');
      });
      this.get('#dashboard', function() {
        if(self.project().charts().length == 0) {
          self.project().addChart();
        }
        self.page('dashboard');
        $('#realtime').bootstrapToggle();
        updateGauges();
      });
      this.get('#dashboard/:pid', function() {
        let that = this;
        let project = self.projects().find(project => project.pid() == that.params.pid)
        self.project(project);
        location = '#dashboard';
      });
      this.get('#mydata', function() {
        self.page('mydata');
      });
      this.get('#introduction', function() {
        self.page('introduction');
      });
      this.get('', function() {
        if(window.localStorage && window.localStorage.getItem('token')) {
          $.get(host+'/user').done(() => {
            location = "#dashboard"
            this.app.runRoute('get', '#dashboard');
            self.loggedin(true);
          });
        } else {
          this.app.runRoute('get', '#home');
        }
      });
    }).run();
  }
  //load data if logged in
  if(window.localStorage && window.localStorage.getItem('token')) {
    loadData(_=> {
      $.get(host+'/user', _ => runSammy());
    });
  } else {
    runSammy();
  }
}

$(document).ready(() => {
  jQuery.each( [ "put", "delete" ], function( i, method ) {
    jQuery[ method ] = function( url, data, callback, type ) {
      if ( jQuery.isFunction( data ) ) {
        type = type || callback;
        callback = data;
        data = undefined;
      }

      return jQuery.ajax({
        url: url,
        type: method,
        dataType: type,
        data: data,
        success: callback
      });
    };
  });

  $(document).ajaxError(function() {
    localStorage.removeItem('token');
    self.project(null);
    self.projects([]);
    self.devices([]);
    self.user(null);
    self.device(null);
    self.loggedin(false);
    self.login().email('');
    self.login().password('');
    location = "#home";
  });

  $.ajaxPrefilter(function( options ) {
    if ( !options.beforeSend) {
      options.beforeSend = function (xhr) {
        if(window.localStorage.getItem('token')) {
          self.loggedin(true);
          xhr.setRequestHeader('Authorization', 'Bearer ' + window.localStorage.getItem('token'));
        }
      }
    }
  });
  ko.bindingHandlers.slideVisible = {
    init: function (element, valueAccessor) {
      var value = ko.utils.unwrapObservable(valueAccessor());
      if(typeof value == 'function') value = value();
      if($(element).is(':visible') != value) {
        $(element).toggle(value);
      }
    },
    update: function (element, valueAccessor) {
      var value = ko.utils.unwrapObservable(valueAccessor());
      if(typeof value == 'function') value = value();
      value ? $(element).slideDown() : $(element).slideUp();
    }
  };
  ko.bindingHandlers.fadeVisible = {
    init: function(element, valueAccessor) {
      // Initially set the element to be instantly visible/hidden depending on the value
      var value = valueAccessor();
      $(element).toggle(ko.unwrap(value)); // Use "unwrapObservable" so we can handle values that may or may not be observable
    },
    update: function(element, valueAccessor) {
      // Whenever the value subsequently changes, slowly fade the element in or out
      var value = valueAccessor();
      ko.unwrap(value) ? $(element).fadeIn() : $(element).fadeOut();
    }
  };
  ko.bindingHandlers.toggle = {
    init: function (element, valueAccessor) {
      var value = valueAccessor();

      ko.utils.registerEventHandler(element, "click", function () {
        value(!value());
      });
    }
  };
  ko.bindingHandlers.invisible = {
    update: function(element, valueAccessor) {
      ko.bindingHandlers.visible.update(element, function() {
        return !ko.utils.unwrapObservable(valueAccessor());
      });
    }
  };

  ko.bindingHandlers.calendar = {
    update: function(element, valueAccessor) {
      var value = valueAccessor();
      ko.bindingHandlers.text.update(element, function() {
        if(!value()) return "Never";
        return moment(value()).calendar();
      });
    }
  };

  ko.bindingHandlers.datePicker = {
    init: function (element, valueAccessor, allBindingsAccessor, viewModel) {
      // Register change callbacks to update the model
      // if the control changes.
      ko.utils.registerEventHandler(element, "change", function () {
        var value = valueAccessor();
        value(new Date(element.value));
      });
    },
    // Update the control whenever the view model changes
    update: function (element, valueAccessor, allBindingsAccessor, viewModel) {
      var value =  valueAccessor();
      element.value = value().toISOString();
    }
  };
  ko.bindingHandlers.resizable = {
    init: function(element, valueAccessor, allBindings, viewModel) {
      var options = valueAccessor();
      $(element).resizable(options);
    }
  };
  ko.applyBindings(new AppViewModel());
  (function(factory) {
    // Module systems magic dance.

    if (typeof require === "function" && typeof exports === "object" && typeof module === "object") {
      // CommonJS or Node: hard-coded dependency on "knockout"
      factory(require("knockout"), require("jquery"));
    } else if (typeof define === "function" && define["amd"]) {
      // AMD anonymous module with hard-coded dependency on "knockout"
      define(["knockout", "jquery"], factory);
    } else {
      // <script> tag: use the global `ko` object, attaching a `mapping` property
      factory(ko, jQuery);
    }
  }(function(ko, $) {
    function setBootstrapToggleState(element, value) {
      //$(element).bootstrapToggle(value ? 'on' : 'off');
    }
    ko.bindingHandlers.bootstrapToggle = {
      init: function(element, valueAccessor, allBindingsAccessor, viewModel) {
        //$(element).bootstrapToggle();
        setBootstrapToggleState(element, ko.utils.unwrapObservable(valueAccessor()))
        $(element).on('change', function() {
          valueAccessor()($(this).prop('checked'));
        });
      },
      update: function(element, valueAccessor, allBindingsAccessor, viewModel) {
        var vStatus = $(element).prop('checked');
        var vmStatus = ko.utils.unwrapObservable(valueAccessor());
        if (vStatus != vmStatus) {
          setBootstrapToggleState(element, vmStatus);
        }
      }
    };

  }));  });
