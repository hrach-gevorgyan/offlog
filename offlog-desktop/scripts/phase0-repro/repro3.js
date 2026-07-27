const PouchDB = require('../../../offlog-app/node_modules/pouchdb');
const memAdapter = require('../../../offlog-app/node_modules/pouchdb-adapter-memory');
PouchDB.plugin(memAdapter);

const local = new PouchDB('local_empty3', { adapter: 'memory' });
const remote = new PouchDB('http://127.0.0.1:57990/offlog', {
  auth: { username: 'test', password: 'testpass1234' }
});

let errorCount = 0;
const sync = local.sync(remote, { live: true, retry: true })
  .on('change', (info) => console.log('CHANGE', info.direction))
  .on('paused', () => console.log('PAUSED (caught up)'))
  .on('error', (err) => { errorCount++; console.log('ERROR:', JSON.stringify(err)); });

setTimeout(() => {
  sync.cancel();
  local.allDocs().then(r => {
    console.log('final local doc count:', r.rows.length, 'errorCount:', errorCount);
    process.exit(errorCount > 0 ? 1 : 0);
  });
}, 6000);
