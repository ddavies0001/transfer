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

let charts = [];
$(document).ready(() => {
  $.ajaxPrefilter(function( options ) {
    if ( !options.beforeSend) {
      options.beforeSend = function (xhr) {
        if(window.localStorage.getItem('token')) {
          xhr.setRequestHeader('Authorization', 'Bearer ' + window.localStorage.getItem('token'));
        }
      }
    }
  });

  let rooms = [];
  let socket = io.connect(':3000/');
  socket.on('data', (device, project, keytag, time, value) => {
    value = parseInt(value);
    charts.forEach(chart => {
      let now = new Date();
      now = now.getTime() - 1000 * chart.config.data.settings.duration;;
      let changed = false;
      chart.config.data.orig.forEach(dataset => {
        if(dataset.device == device && dataset.project == project && dataset.keytag == keytag) {
          dataset.data.push({x:time, y:value});
          dataset.data = dataset.data.filter(row => now < row.x);
          changed = true;
        }
      });
      if(changed) {
        let newdata = chart.config.data.orig.map(dataset => {
          let newset = {};
          dataset.data.forEach(row => {
            if(newset[parseInt(row.x/chart.config.data.settings.aggregation/1000)] === undefined) {
              newset[parseInt(row.x/chart.config.data.settings.aggregation/1000)] = [row.y];
            } else {
              newset[parseInt(row.x/chart.config.data.settings.aggregation/1000)].push(row.y);
            }
            return newset;
          });
          let data = Object.keys(newset).map(key => {
            return {x: formatDate(new Date(key*chart.config.data.settings.aggregation*1000)),
              y:newset[key].reduce((a,b) => a+b, 0)/newset[key].length
            }
          });
          return {data:data, label:dataset.label};
        });
        chart.config.data.datasets = newdata;
        chart.config.options.animation.duration = 0;
        chart.update();
      }
    });
  });
  $.get('http://ec2-3-84-59-231.compute-1.amazonaws.com:3000/getcharts', (data) => {
    data.forEach(chart => {
      let canvas = $('<div id="parent_'+chart.id+'" style="width:'+chart.width+'px; height:'+chart.height+'px;" width="'+chart.width+'px" height="'+chart.height+'px"><canvas id="chart_'+chart.id+'"></canvas></div>');
      $('#charts').append(canvas);
      $.get('http://ec2-3-84-59-231.compute-1.amazonaws.com:3000/getdata/' + chart.id, (data) => {
        let newdata = data.map(dataset => {
          if(!rooms.includes(dataset.device+'.'+dataset.project+'.'+dataset.keytag)) {
            socket.emit('room', dataset.device+'.'+dataset.project+'.'+dataset.keytag);
            rooms.push(dataset.device+'.'+dataset.project+'.'+dataset.keytag);
          }
          let data = dataset.data.reduce((newset,row) => {
            if(newset[parseInt(row.x/chart.aggregation/1000)] === undefined) {
              newset[parseInt(row.x/chart.aggregation/1000)] = [row.y];
            } else {
              newset[parseInt(row.x/chart.aggregation/1000)].push(row.y);
            }
            return newset;
          }, {});
          data = Object.keys(data).map(key => { return {x: formatDate(new Date(key*chart.aggregation*1000)), y:data[key].reduce((a,b) => a+b, 0)/data[key].length}});
          return {data:data, label:dataset.label};
        });
        let config = {
          type: chart.type,
          data: {
            datasets: newdata,
            orig: data,
            settings:chart
          },
          options: {
            maintainAspectRatio: false,
            scales: {
              yAxes: [{
                ticks: {
                  beginAtZero:true
                }
              }],
              xAxes: [{
                type:'time',
                ticks: {
                  minRotation:15
                }
              }]
            }
          }
        };
        charts.push(new Chart(canvas.find('canvas'), config));
      });
    });
  });
  setTimeout(() => {
    $('#charts').sortable({revert:true, handle:'> canvas'});
    charts.forEach(chart => {
      interact('#parent_'+chart.config.data.settings.id).resizable({preserveAspectRatio:true,edges:{ left: false, right: true, bottom: true, top: false }}).on('resizemove', event => {
        var target = event.target,
        x = (parseFloat(target.getAttribute('data-x')) || 0),
        y = (parseFloat(target.getAttribute('data-y')) || 0);

        // update the element's style
        target.style.width  = event.rect.width + 'px';
        target.style.height = event.rect.height + 'px';

        // translate when resizing from top or left edges
        x += event.deltaRect.left;
        y += event.deltaRect.top;

        target.style.webkitTransform = target.style.transform =
        'translate(' + x + 'px,' + y + 'px)';

        target.setAttribute('data-x', x);
        target.setAttribute('data-y', y);
        $("#charts").sortable( "refreshPositions" );
      }).on('resizestart', event => {
        $('#charts').sortable('disable');
      }).on('resizeend', event => {
        $('#charts').sortable('enable');
      });
    });
  }, 1000);
});
