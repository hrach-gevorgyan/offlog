const { Bonjour } = require('bonjour-service');
const bonjour = new Bonjour();
console.log('Browsing for _offlog._tcp ...');
const browser = bonjour.find({ type: 'offlog' }, (service) => {
  console.log('FOUND:', JSON.stringify({
    name: service.name,
    port: service.port,
    addresses: service.addresses,
    txt: service.txt,
  }));
});
setTimeout(() => {
  console.log('DONE');
  browser.stop();
  bonjour.destroy();
  process.exit(0);
}, 8000);
