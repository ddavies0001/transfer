*INSTAL*
symlink the html folder to apache, and run api under forever.

Download influx
wget https://dl.influxdata.com/influxdb/releases/influxdb_1.2.4_amd64.deb
sudo dpkg -i influxdb_1.2.4_amd64.deb

set up devices:scimodo on /devices for rabbitmq
enable mqtt, stomp, and management plugins