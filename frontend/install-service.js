const Service = require('node-windows').Service;
const path = require('path');

// Get current directory
const currentDir = __dirname;

// Create a new service object
const svc = new Service({
  name: 'Mandara Talenta Frontend',
  description: 'Mandara Talenta Frontend Server (Production)',
  script: path.join(currentDir, 'serve.js'),
  workingDirectory: currentDir,
  nodeOptions: [
    '--max-old-space-size=4096'
  ]
});

// Listen for the "install" event
svc.on('install', function(){
  console.log('Service installed successfully');
  svc.start();
});

svc.on('start', function(){
  console.log('Service started successfully');
});

svc.on('error', function(err){
  console.error('Service error:', err);
});

svc.install();
