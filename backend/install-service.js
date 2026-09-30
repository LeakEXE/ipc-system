const Service = require('node-windows').Service;
const path = require('path');

// Create a new service object
const svc = new Service({
  name: 'Mandara Talenta Backend Service',
  description: 'Mandara Talenta Backend API',
  script: path.join(__dirname, 'server.js'),
  nodeOptions: [
    '--max-old-space-size=4096'
  ],
  env: {
    name: "NODE_ENV",
    value: "production"
  }
});

// Listen for the "install" event
svc.on('install', () => {
  console.log('Service installed successfully!');
  console.log('Starting service...');
  svc.start();
});

// Listen for the "start" event
svc.on('start', () => {
  console.log('Service started successfully!');
  console.log('Service name: Mandara Talenta Backend Service');
});

// Listen for the "alreadyinstalled" event
svc.on('alreadyinstalled', () => {
  console.log('Service is already installed.');
  console.log('Restarting service...');
  svc.restart();
});

// Listen for the "uninstall" event
svc.on('uninstall', () => {
  console.log('Service uninstalled successfully!');
});

// Install the service
svc.install();
