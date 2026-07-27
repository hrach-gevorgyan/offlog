const PouchDB = require('../../../offlog-app/node_modules/pouchdb');
const memAdapter = require('../../../offlog-app/node_modules/pouchdb-adapter-memory');
PouchDB.plugin(memAdapter);

const local = new PouchDB('local_empty', { adapter: 'memory' });
const remote = new PouchDB('http://127.0.0.1:57990/offlog', {
  auth: { username: 'test', password: 'testpass1234' }
});

local.sync(remote, { live: false })
  .on('complete', (info) => {
    console.log('COMPLETE:', JSON.stringify(info, null, 2));
    local.allDocs({ include_docs: false }).then(r => {
      console.log('local doc count after sync:', r.rows.length);
      process.exit(0);
    });
  })
  .on('error', (err) => {
    console.log('ERROR:', JSON.stringify(err, null, 2));
    process.exit(1);
  })
  .on('denied', (err) => console.log('DENIED:', JSON.stringify(err)))
  .on('change', (info) => console.log('CHANGE direction=' + info.direction + ' docs_written=' + (info.change ? info.change.docs_written : '?')));
