// More details: https://cdn.hms-networks.com/docs/librariesprovider11/manuals-design-guides/wmp-protocol-specifications.pdf
function WmpConnection(ip, pingIntervalTime) {
  this.ip = ip;
  this.pingIntervalTime = pingIntervalTime || 30000; // 30s
  this._callbacks = [];
}

// Turns the AC unit On or Off
WmpConnection.FUNC_ONOFF = 'ONOFF';

// Sets the mode (heat, cool, fan, dry or auto)
WmpConnection.FUNC_MODE = 'MODE';

// Sets the set point temperature
WmpConnection.FUNC_SETPTEMP = 'SETPTEMP';

// Sets the fan speed
WmpConnection.FUNC_FANSP = 'FANSP';

// Sets the Up/Down vane position
WmpConnection.FUNC_VANEUD = 'VANEUD';

// Sets the Left/Right vane position
WmpConnection.FUNC_VANELR = 'VANELR';

// Shows the ambient temperature
WmpConnection.FUNC_AMBTMP = 'AMBTMP';

// Shows if any error occurs. Responds is “OK” if there is
// not error, “ERR” if any error ocurrs. (Not available forINWMPUNI001I000)
WmpConnection.FUNC_ERRSTATUS = 'ERRSTATUS';

// Shows the error code. (Not available for INWMPUNI001I000)
WmpConnection.FUNC_ERRCODE = 'ERRCODE';

WmpConnection.prototype.connect = function () {
  if (this.socket) {
    console.warn('Destroy socket opening');
    this.close();
  }

  this.socket = new Socket();
  this.socket.onData = (data) => this.onData(data);
  this.socket.onError = (error) => this.onError(error);
  this.socket.onClose = (hasError) => this.onClose(hasError);

  return new Promise((resolve, reject) => {
    this.socket.open(
      this.ip,
      3310,
      () => {
        // Ping each 30s to hold connection
        this._pingTimer = setInterval(() => this.ping(), this.pingIntervalTime);
        resolve();
      },
      (error) => reject(error)
    );
  });
};

WmpConnection.prototype.ping = function () {
  return this.cmdId().then(() => {
    console.log('Ping successful');
  });
};

WmpConnection.prototype.close = function () {
  clearInterval(this._pingTimer);
  if (this.socket) {
    this.socket.close();
    this.socket = null;
  }
};

WmpConnection.prototype.uint8ArrayToString = function (data) {
  let text = '';
  for (let i = 0; i < data.length; i++) {
    text += String.fromCharCode(data[i]);
  }
  return text;
};

WmpConnection.prototype.onData = function (data) {
  console.log('Received data', data);
  const text = this.uint8ArrayToString(data);
  console.log('Received text', text);
  const wmpdata = this.parseResponseLines(text);

  for (let i = 0; i < wmpdata.length; i++) {
    if (wmpdata[i].type !== 'CHN') {
      this._execCallback(wmpdata[i]);
    }
  }
};

WmpConnection.prototype.onError = function (error) {
  console.error('Socket error', error);
};

WmpConnection.prototype.onClose = function (hasError) {
  console.log('Socket close', hasError);
};

WmpConnection.prototype.writeText = function (text) {
  const data = new Uint8Array(text.length);
  for (var i = 0; i < data.length; i++) {
    data[i] = text.charCodeAt(i);
  }
  this.socket.write(data);
};

WmpConnection.prototype.sendCmd = function (cmd) {
  return new Promise((resolve, reject) => {
    if (this.socket && this.socket.state !== Socket.State.OPENED) {
      reject('Socket is not opened');
      return;
    }
    this._callbacks.push(resolve);
    this.writeText(cmd + '\n');
  });
};

WmpConnection.prototype.cmdId = function () {
  return this.sendCmd('ID');
};

WmpConnection.prototype.cmdInfo = function () {
  return this.sendCmd('INFO');
};

WmpConnection.prototype.cmdGet = function (feature) {
  return this.sendCmd('GET,1:' + feature);
};

WmpConnection.prototype.cmdSet = function (feature, value) {
  //convert decimal to 10x temp numbers
  // if (feature.toUpperCase() === 'SETPTEMP') value = value * 10;

  return this.sendCmd(`SET,1:${feature},${value}`).then((data) => {
    if (data.type !== 'ACK') {
      console.error('Received non-ack message from set command', data);
    }
  });
};

WmpConnection.prototype.setTemperature = function (value) {
  return this.cmdSet(WmpConnection.FUNC_SETPTEMP, value * 10);
};

WmpConnection.prototype.getTemperature = function (value) {
  return this.cmdGet(WmpConnection.FUNC_SETPTEMP, value);
};

WmpConnection.prototype.login = function (password) {
  return this.sendCmd(`LOGIN:${password}`);
};

WmpConnection.prototype.logout = function () {
  return this.sendCmd('LOGOUT');
};

WmpConnection.prototype._execCallback = function (data) {
  const callback = this._callbacks.splice(0, 1)[0];
  if (callback) {
    callback(data);
  } else {
    console.error('Received message without callback', data);
  }
};

WmpConnection.prototype.parseResponseLines = function (wmpString) {
  const lines = wmpString.split('\r\n');
  const rv = [];
  lines.forEach((line) => {
    if (line) {
      const data = this.parseResponseLine(line);
      if (data) {
        rv.push(data);
      }
    }
  });
  return rv;
};

WmpConnection.prototype.parseResponseLine = function (wmpLine) {
  const segments = wmpLine.split(':');
  const type = segments[0].split(',')[0];
  const rv = {
    type: type,
  };
  let parts;
  switch (type) {
    case 'ACK':
      break;
    case 'ERR':
      break;
    case 'ID':
      if (!segments[1]) {
        console.error('Data invalid', segments);
        return;
      }
      parts = segments[1].split(',');
      Object.assign(rv, {
        model: parts[0],
        mac: parts[1],
        ip: parts[2],
        protocol: parts[3],
        version: parts[4],
        rssi: parts[5],
      });
      break;
    default:
      if (!segments[1]) {
        console.error('Data invalid', segments);
        return;
      }
      parts = segments[1].split(',');
      Object.assign(rv, {
        feature: parts[0],
        value: parts[1],
      });
      break;
  }

  if (rv.type === 'CHN') {
    if (rv.feature === 'AMBTEMP' || rv.feature === 'SETPTEMP') {
      rv.value = rv.value / 10;
    }
  }

  return rv;
};
