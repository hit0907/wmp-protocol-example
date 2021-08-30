document.addEventListener('deviceready', onDeviceReady, false);

function onDeviceReady() {
  window.connect = function () {
    const ip = document.getElementById('ip').value;
    openWmpConnection(ip);
  };

  window.disconnect = function () {
    if (wmp) {
      wmp.close();
      wmp = null;
    }
  };

  window.setTemperature = function () {
    if (wmp) {
      wmp.setTemperature(Number(document.getElementById('temperature')));
    }
  };

  // App logic
  var wmp;

  function openWmpConnection(ip) {
    // Open connection
    wmp = new WmpConnection(ip);
    wmp
      .connect()
      .then(() => {
        console.log('Connect successful');
        document.getElementById('setTempBtn').style.display = '';

        wmp.getDeviceId().then((data) => console.log('Device info', data));
      })
      .catch((error) => {
        console.error('Connect fail', error);
      });

    window.wmp = wmp;
  }
}
