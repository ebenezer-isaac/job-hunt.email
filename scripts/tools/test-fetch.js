const payload = {
  entry: {
    level: 'info',
    scope: 'local-dev',
    message: 'Testing secure log ingestion',
    data: { example: 'hello world' },
  },
};

fetch('http://127.0.0.1:3000/api/log', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-internal-token': process.env.ACCESS_CONTROL_INTERNAL_TOKEN ?? '<internal-token>',
    'x-log-client': 'local-dev-cli',
  },
  body: JSON.stringify(payload),
})
  .then((res) => console.log('Success:', res.status))
  .catch((err) => {
    console.error('Fetch error:', err);
    if (err.cause) console.error('Cause:', err.cause);
  });
