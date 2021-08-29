var net = require('net');

var server = net.createServer(function (socket) {
  console.log('client connected');

  socket.on('data', (data) => {
    console.log('data', data);

    responseId(socket);
  });

  socket.on('end', () => {
    console.log('client disconnected');
  });

  socket.pipe(socket);
});

server.on('error', (err) => {
  throw err;
});

server.listen(3310, '0.0.0.0', () => {
  console.log('server bound');
});

function responseId(socket) {
  socket.write(
    'ID: INWMPUNI001I000,001DC9A2C911,192.168.100.246,ASCII,v0.0.1,-44\r\n'
  );
}

function responseInfo(socket) {
  socket.write('INFO:RUNVERSION,1.0.1\r\n');
  socket.write('INFO:CFGVERSION,1.0.1\r\n');
  socket.write('INFO:HASH,2000:0106:001F:0104:F4DE\r\n');
}
