async function checkWorker() {
  const url = 'https://miitjee-backend.miitjee-api.workers.dev';
  const res = await fetch(`${url}/health`, {
    headers: { 'x-dev-mode': 'true' }
  });
  console.log('Worker health status:', res.status);
  try {
    console.log('Worker response:', await res.text());
  } catch (e) {
    console.log(e);
  }
}

checkWorker();
