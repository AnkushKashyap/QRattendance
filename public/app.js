const state = {
  teacherId: null,
  classes: [],
  session: null,
  recent: []
};

let qrScanner = null;

const elements = {
  loginView: document.querySelector('#loginView'),
  dashboardView: document.querySelector('#dashboardView'),
  loginForm: document.querySelector('#loginForm'),
  loginStatus: document.querySelector('#loginStatus'),
  teacherId: document.querySelector('#teacherId'),
  password: document.querySelector('#password'),
  classCode: document.querySelector('#classCode'),
  classDate: document.querySelector('#classDate'),
  classTime: document.querySelector('#classTime'),
  sessionForm: document.querySelector('#sessionForm'),
  scannerPanel: document.querySelector('#scannerPanel'),
  activeClass: document.querySelector('#activeClass'),
  activeSession: document.querySelector('#activeSession'),
  presentCount: document.querySelector('#presentCount'),
  savePath: document.querySelector('#savePath'),
  reader: document.querySelector('#reader'),
  scanResult: document.querySelector('#scanResult'),
  scanList: document.querySelector('#scanList'),
  cameraButton: document.querySelector('#cameraButton'),
  stopCameraButton: document.querySelector('#stopCameraButton'),
  closeScanner: document.querySelector('#closeScanner'),
  logoutButton: document.querySelector('#logoutButton'),
  themeToggle: document.querySelector('#themeToggle')
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function currentTime() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function setDefaultSessionValues() {
  elements.classDate.value = today();
  elements.classTime.value = currentTime();
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || 'Request failed.');
  }
  return data;
}

function parseStudentPayload(rawPayload) {
  const trimmed = rawPayload.trim();
  if (!trimmed) throw new Error('QR payload is empty.');

  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    parsed = Object.fromEntries(
      trimmed
        .split(/[;|,]/)
        .map((part) => part.split('=').map((value) => value.trim()))
        .filter(([key, value]) => key && value)
    );
  }

  const student = {
    rollNumber: String(parsed.rollNumber || parsed.roll || '').trim(),
    batch: String(parsed.batch || '').trim(),
    name: String(parsed.name || '').trim()
  };

  if (!student.rollNumber || !student.batch || !student.name) {
    throw new Error('QR must include rollNumber, batch, and name.');
  }

  return student;
}

function renderClasses(classes) {
  elements.classCode.innerHTML = classes
    .map((item) => `<option value="${item.code}">${item.code} · ${item.students} students</option>`)
    .join('');
}

function updateSessionSummary() {
  elements.activeClass.textContent = state.session?.classCode || 'Not selected';
  elements.activeSession.textContent = state.session ? `${state.session.date} at ${state.session.time}` : '--';
}

function setScanResult(type, message) {
  elements.scanResult.className = `result-toast ${type || ''}`.trim();
  elements.scanResult.textContent = message;
}

function addScanItem(type, title, subtitle) {
  state.recent.unshift({ type, title, subtitle, at: new Date().toLocaleTimeString() });
  state.recent = state.recent.slice(0, 10);
  elements.scanList.innerHTML = state.recent.map((item) => `
    <div class="scan-item">
      <div class="scan-mark ${item.type}">${item.type === 'success' ? '✓' : '×'}</div>
      <div>
        <strong>${item.title}</strong><br />
        <span class="muted">${item.subtitle}</span>
      </div>
      <small class="muted">${item.at}</small>
    </div>
  `).join('');
}

async function loadClasses() {
  const data = await api('/api/classes');
  state.classes = data.classes;
  renderClasses(data.classes);
}

async function saveScan(rawPayload) {
  if (!state.session) {
    throw new Error('Set class date and time before scanning.');
  }

  const student = parseStudentPayload(rawPayload);
  const result = await api('/api/attendance/scan', {
    method: 'POST',
    body: JSON.stringify({ session: state.session, student })
  });

  const label = `${result.student.name} (${result.student.rollNumber})`;
  const duplicateText = result.duplicate ? 'Already marked present.' : 'Attendance marked.';
  setScanResult('success', `✓ ${duplicateText}`);
  addScanItem('success', label, `${result.student.batch} · ${duplicateText}`);
  elements.presentCount.textContent = result.totalPresent;
  elements.savePath.textContent = `Saved in ${result.file}`;
}

async function handleDetectedPayload(rawPayload) {
  try {
    await saveScan(rawPayload);
  } catch (error) {
    setScanResult('error', `× ${error.message}`);
    addScanItem('error', 'Scan rejected', error.message);
  }
}

async function startCamera() {

    if (!qrScanner) {
        qrScanner = new Html5Qrcode("reader");
    }

    const cameras = await Html5Qrcode.getCameras();

    if (cameras.length === 0) {
        throw new Error("No camera found.");
    }

    let cameraId = cameras[0].id;

    const rearCamera = cameras.find(camera =>
        camera.label.toLowerCase().includes("back") ||
        camera.label.toLowerCase().includes("rear") ||
        camera.label.toLowerCase().includes("environment")
    );

    if (rearCamera) {
        cameraId = rearCamera.id;
    }

    console.log("Available Cameras:", cameras);
    console.log("Using Camera:", cameraId);

    await qrScanner.start(
        cameraId,
        {
            fps: 10,
            qrbox: { width: 250, height: 250 }
        },
        async (decodedText) => {
            await handleDetectedPayload(decodedText);
        },
        () => {
            // Ignore scan failures
        }
    );

    setScanResult("", "Camera is scanning...");
}

async function stopCamera() {

    if (!qrScanner) return;

    try {

        await qrScanner.stop();
        await qrScanner.clear();

    } catch (e) {
        console.log(e);
    }

    qrScanner = null;

}

elements.loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  elements.loginStatus.textContent = '';

  try {
    const data = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ teacherId: elements.teacherId.value.trim(), password: elements.password.value })
    });
    state.teacherId = data.teacherId;
    await loadClasses();
    elements.loginView.classList.add('hidden');
    elements.dashboardView.classList.remove('hidden');
  } catch (error) {
    elements.loginStatus.textContent = error.message;
  }
});

elements.sessionForm.addEventListener('submit', (event) => {
  event.preventDefault();
  state.session = {
    teacherId: state.teacherId,
    classCode: elements.classCode.value,
    date: elements.classDate.value,
    time: elements.classTime.value
  };
  updateSessionSummary();
  setScanResult('', 'Waiting for QR scan...');
  elements.scannerPanel.classList.remove('hidden');
});

elements.cameraButton.addEventListener('click', async () => {
  try {
    await startCamera();
    setScanResult('', 'Camera is scanning for QR codes...');
  } catch (error) {

    console.error("Camera Error:", error);

    setScanResult(
      'error',
      `Camera Error:
${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`
    );
  }
});

elements.stopCameraButton.addEventListener('click', stopCamera);

elements.closeScanner.addEventListener('click', () => {
  stopCamera();
  elements.scannerPanel.classList.add('hidden');
  setScanResult('', 'Scanner closed. Attendance is saved after each valid scan.');
});

elements.logoutButton.addEventListener('click', () => {
  stopCamera();
  state.teacherId = null;
  state.session = null;
  elements.dashboardView.classList.add('hidden');
  elements.loginView.classList.remove('hidden');
});

elements.themeToggle.addEventListener('click', () => {
  document.body.classList.toggle('light');
  elements.themeToggle.textContent = document.body.classList.contains('light') ? '☀' : '☾';
});

setDefaultSessionValues();
