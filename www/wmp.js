function WmpConnection(ip, pingIntervalTime) {
  this.ip = ip;
  this.pingIntervalTime = pingIntervalTime || 30000; // 30s
  this._callbacks = [];
}

// Get device information
WmpConnection.CMD_ID = 'ID';
WmpConnection.CMD_INFO = 'INFO';
WmpConnection.CMD_SET = 'SET';
WmpConnection.CMD_GET = 'GET';

// Listen notification when value changes
WmpConnection.CMD_CHN = 'CHN';

WmpConnection.CMD_LOGIN = 'LOGIN';
WmpConnection.CMD_LOGOUT = 'LOGOUT';

// Success callback
WmpConnection.CMD_ACK = 'ACK';

// Error callback
WmpConnection.CMD_ERR = 'ERR';

// Notification callback
WmpConnection.CMD_CHN = 'CHN';

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
  // Stop ping alive
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
  const lines = text.split('\r\n');
  this._execCallback(lines);
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

WmpConnection.prototype.sendCmd = function (cmd, transformer) {
  console.log('Sending cmd', cmd);
  return new Promise((resolve, reject) => {
    if (this.socket && this.socket.state !== Socket.State.OPENED) {
      reject('Socket is not opened');
      return;
    }

    this.writeText(cmd + '\n');

    this._callbacks.push((lines) => {
      if (lines[0] === 'ERR') {
        reject(lines[0]);
        return;
      }
      resolve((transformer && transformer(lines)) || lines);
    });
  });
};

WmpConnection.prototype.parseLine = function (line) {
  const segments = line.split(':');
  return {
    type: segments[0],
    raw: segments[1],
  };
};

// > ID
// < ID: INWMPUNI001I000,001DC9A2C911,192.168.100.246,ASCII,v0.0.1,-44
WmpConnection.prototype.getDeviceId = function () {
  return this.sendCmd(WmpConnection.CMD_ID, (lines) => {
    const data = this.parseLine(lines[0]);
    const parts = data.raw.split(',');
    return Object.assign(data, {
      model: parts[0],
      mac: parts[1],
      ip: parts[2],
      protocol: parts[3],
      version: parts[4],
      rssi: parts[5],
    });
  });
};

// > INFO
// < INFO:RUNVERSION,1.0.1
// < INFO:CFGVERSION,1.0.1
// < INFO:HASH,2000:0106:001F:0104:F4DE
WmpConnection.prototype.getInfo = function () {
  return this.sendCmd(WmpConnection.CMD_INFO, (lines) => {
    const data = {
      type: WmpConnection.CMD_INFO,
      raw: lines,
    };
    lines.forEach((line) => {
      const values = line.split(':')[1].split(',');
      data[values[0]] = values[1];
    });
    return data;
  });
};

// < SET,1:ONOFF,ON
// < ACK
// < CHN,1:ONOFF,ON
WmpConnection.prototype.setValue = function (feature, value) {
  return this.sendCmd(`SET,1:${feature},${value}`);
};

// > GET,1:MODE
// < CHN,1:MODE,AUTO
WmpConnection.prototype.getValue = function (feature) {
  return this.sendCmd('GET,1:' + feature, (lines) => {
    const parts = lines[0].split(':')[1].split(',');
    return {
      raw: lines,
      feature: parts[0],
      value: parts[1],
    };
  });
};

WmpConnection.prototype.setTemperature = function (value) {
  return this.setValue(WmpConnection.FUNC_SETPTEMP, value * 10);
};

WmpConnection.prototype.getTemperature = function () {
  return this.getValue(WmpConnection.FUNC_SETPTEMP);
};

WmpConnection.prototype.turnOff = function () {
  return this.setValue(WmpConnection.FUNC_ONOFF, 'OFF');
};

WmpConnection.prototype.turnOn = function () {
  return this.setValue(WmpConnection.FUNC_ONOFF, 'ON');
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
    console.warn('Received message without callback', data);
  }
};
