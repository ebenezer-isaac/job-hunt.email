
fetch('http://127.0.0.1:3000/api/log', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ level: 'info', message: 'test' })
})
.then(res => console.log('Success:', res.status))
.catch(err => {
  console.error('Fetch error:', err);
  if (err.cause) console.error('Cause:', err.cause);
});
