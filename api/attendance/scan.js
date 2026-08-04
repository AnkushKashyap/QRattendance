const { saveAttendance } = require('../_lib/attendance');

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

  try {
    const body = typeof request.body === 'string' ? JSON.parse(request.body || '{}') : request.body || {};
    const result = await saveAttendance(body);
    return sendJson(response, result.status, result.body);
  } catch (error) {
    console.error(error);
    return sendJson(response, 500, { saved: false, message: 'Server error.', detail: error.message });
  }
};
