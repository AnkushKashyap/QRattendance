const { getClasses } = require('./_lib/attendance');

function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(payload));
}

module.exports = async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return sendJson(response, 405, { message: 'Method not allowed.' });
  }

  const classes = await getClasses();
  return sendJson(response, 200, { classes });
};
