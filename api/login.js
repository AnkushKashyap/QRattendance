function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(payload));
}

module.exports = async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return sendJson(response, 405, { message: 'Method not allowed.' });
  }

  const body = typeof request.body === 'string' ? JSON.parse(request.body || '{}') : request.body || {};
  const isValid = body.teacherId === '241036009' && body.password === '1234';

  return sendJson(response, isValid ? 200 : 401, {
    ok: isValid,
    teacherId: isValid ? body.teacherId : undefined,
    message: isValid ? 'Login successful.' : 'Invalid teacher ID or password.'
  });
};
