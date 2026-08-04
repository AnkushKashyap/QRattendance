const http = require('http');
const fs = require('fs/promises');
const path = require('path');
try {
  require('dotenv').config();
} catch {
  // dotenv is only needed for local development.
}
const { getClasses, saveAttendance } = require('./api/_lib/attendance');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function sendJson(response, status, payload) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload, null, 2));
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

async function handleApi(request, response) {
  if (request.method === 'POST' && request.url === '/api/login') {
    const body = await readJson(request);
    const isValid = body.teacherId === '241036009' && body.password === '1234';
    return sendJson(response, isValid ? 200 : 401, {
      ok: isValid,
      teacherId: isValid ? body.teacherId : undefined,
      message: isValid ? 'Login successful.' : 'Invalid teacher ID or password.'
    });
  }

  if (request.method === 'GET' && request.url === '/api/classes') {
    const classes = await getClasses();
    return sendJson(response, 200, { classes });
  }

  if (request.method === 'POST' && request.url === '/api/attendance/scan') {
    const body = await readJson(request);
    const result = await saveAttendance(body);
    return sendJson(response, result.status, result.body);
  }

  return sendJson(response, 404, { message: 'API route not found.' });
}

async function serveStatic(request, response) {
  const requestedPath = decodeURIComponent(new URL(request.url, `http://localhost:${PORT}`).pathname);
  const safePath = requestedPath === '/' ? '/index.html' : requestedPath;
  const filePath = path.normalize(path.join(PUBLIC_DIR, safePath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  try {
    const content = await fs.readFile(filePath);
    response.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(filePath)] || 'application/octet-stream' });
    response.end(content);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
}

const server = http.createServer(async (request, response) => {
  try {
    if (request.url.startsWith('/api/')) {
      await handleApi(request, response);
    } else {
      await serveStatic(request, response);
    }
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { message: 'Server error.', detail: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`QR attendance app running at http://localhost:${PORT}`);
});

