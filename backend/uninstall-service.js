const Service = require('node-windows').Service;

// Create a new service object (must match the installed service)
const svc = new Service({
  name: 'Mandara Talenta Backend Service',
  script: require('path').join(__dirname, 'server.js')
});

// Listen for the "uninstall" event
svc.on('uninstall', () => {
  console.log('Service uninstalled successfully!');
});

// Uninstall the service
svc.uninstall();
