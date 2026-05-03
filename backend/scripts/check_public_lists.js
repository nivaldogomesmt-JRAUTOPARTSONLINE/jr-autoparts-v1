const axios = require('axios');

(async () => {
  const base = 'http://127.0.0.1:3001';
  try {
    const login = await axios.post(base + '/api/auth/login', {
      email: 'admin@jrautoparts.com.br',
      password: 'Admin@123!',
    });
    const token = login.data.token;
    console.log('login_ok=1');

    for (const [name, path] of [['clients', '/api/clients?limit=5'], ['products', '/api/products?limit=5'], ['clients_me', '/api/auth/me']]) {
      try {
        const res = await axios.get(base + path, { headers: { Authorization: 'Bearer ' + token } });
        const size = Array.isArray(res.data) ? res.data.length : Array.isArray(res.data?.data) ? res.data.data.length : (res.data?.length ?? 'obj');
        console.log(name + '_status=200');
        console.log(name + '_size=' + size);
      } catch (err) {
        console.log(name + '_status=' + (err.response?.status || 'ERR'));
        console.log(name + '_msg=' + (err.response?.data?.error || err.message));
      }
    }
  } catch (err) {
    console.log('login_status=' + (err.response?.status || 'ERR'));
    console.log('login_msg=' + (err.response?.data?.error || err.message));
  }
})();
