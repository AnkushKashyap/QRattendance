const fs = require('fs/promises');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const ROSTER_PATH = path.join(ROOT, 'data', 'rosters', 'students.json');
const LOCAL_ATTENDANCE_DIR = path.join(ROOT, 'data', 'attendance');
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'qr_attendance';

let mongoClientPromise;

function cleanJson(content) {
  return content.replace(/^\uFEFF/, '');
}

function sanitizeSegment(value) {
  return String(value || '')
    .trim()
    .replace(/[<>:"/\\|?*]+/g, '-')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 80) || 'unknown';
}

async function readRoster() {
  const content = await fs.readFile(ROSTER_PATH, 'utf8');
  return JSON.parse(cleanJson(content));
}

async function getClasses() {
  const roster = await readRoster();
  return Object.keys(roster).map((classCode) => ({
    code: classCode,
    students: roster[classCode].length
  }));
}

function findStudent(roster, classCode, scannedStudent) {
  const students = roster[classCode] || [];
  return students.find((student) =>
    student.rollNumber === scannedStudent.rollNumber &&
    student.batch.toLowerCase() === scannedStudent.batch.toLowerCase() &&
    student.name.trim().toLowerCase() === scannedStudent.name.trim().toLowerCase()
  );
}

function attendancePathname(session) {
  const teacher = sanitizeSegment(session.teacherId);
  const classCode = sanitizeSegment(session.classCode);
  const date = sanitizeSegment(session.date);
  const time = sanitizeSegment(session.time);
  return `attendance/${teacher}/${classCode}/${date}/${time}.json`;
}

function localAttendanceFilePath(session) {
  return path.join(LOCAL_ATTENDANCE_DIR, ...attendancePathname(session).split('/').slice(1));
}

function createAttendance(session) {
  return {
    teacherId: session.teacherId,
    classCode: session.classCode,
    date: session.date,
    time: session.time,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    students: [],
    totalPresent: 0
  };
}

async function readLocalAttendance(session) {
  const filePath = localAttendanceFilePath(session);
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return JSON.parse(cleanJson(content));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return createAttendance(session);
  }
}

async function writeLocalAttendance(session, attendance) {
  const filePath = localAttendanceFilePath(session);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(attendance, null, 2));
  return {
    file: path.relative(ROOT, filePath),
    storage: 'local'
  };
}

async function readBlobAttendance(session) {
  const { list } = await import('@vercel/blob');
  const pathname = attendancePathname(session);
  const result = await list({ prefix: pathname, limit: 1 });
  const blob = result.blobs.find((item) => item.pathname === pathname);

  if (!blob) return createAttendance(session);

  const response = await fetch(blob.url, { cache: 'no-store' });
  if (!response.ok) return createAttendance(session);
  return response.json();
}

async function writeBlobAttendance(session, attendance) {
  const { put } = await import('@vercel/blob');
  const pathname = attendancePathname(session);
  const blob = await put(pathname, JSON.stringify(attendance, null, 2), {
    access: 'public',
    allowOverwrite: true,
    contentType: 'application/json'
  });
  return {
    file: pathname,
    url: blob.url,
    storage: 'vercel-blob'
  };
}

async function getMongoCollection() {
  const { MongoClient } = await import('mongodb');

  if (!mongoClientPromise) {
    const client = new MongoClient(process.env.MONGODB_URI);
    mongoClientPromise = client.connect();
  }

  const client = await mongoClientPromise;
  return client.db(MONGODB_DB_NAME).collection('attendance');
}

function mongoFilter(session) {
  return {
    teacherId: session.teacherId,
    classCode: session.classCode,
    date: session.date,
    time: session.time
  };
}

async function readMongoAttendance(session) {
  const collection = await getMongoCollection();
  const attendance = await collection.findOne(mongoFilter(session), { projection: { _id: 0 } });
  return attendance || createAttendance(session);
}

async function writeMongoAttendance(session, attendance) {
  const collection = await getMongoCollection();
  await collection.updateOne(
    mongoFilter(session),
    { $set: attendance },
    { upsert: true }
  );

  return {
    file: `mongodb://${MONGODB_DB_NAME}/attendance/${attendancePathname(session)}`,
    storage: 'mongodb'
  };
}

async function readAttendance(session) {
  if (process.env.MONGODB_URI) {
    return readMongoAttendance(session);
  }

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    return readBlobAttendance(session);
  }
  return readLocalAttendance(session);
}

async function writeAttendance(session, attendance) {
  if (process.env.MONGODB_URI) {
    return writeMongoAttendance(session, attendance);
  }

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    return writeBlobAttendance(session, attendance);
  }
  return writeLocalAttendance(session, attendance);
}

function validatePayload(payload) {
  if (!payload.session || !payload.student) {
    return 'Session and student details are required.';
  }

  const requiredSession = ['teacherId', 'classCode', 'date', 'time'];
  const requiredStudent = ['rollNumber', 'batch', 'name'];
  const missingSession = requiredSession.some((key) => !payload.session[key]);
  const missingStudent = requiredStudent.some((key) => !payload.student[key]);

  if (missingSession || missingStudent) {
    return 'Teacher, class, date, time, roll number, batch, and name are required.';
  }

  return null;
}

async function saveAttendance(payload) {
  const validationError = validatePayload(payload);
  if (validationError) {
    return {
      status: 400,
      body: { saved: false, message: validationError }
    };
  }

  const roster = await readRoster();
  const student = findStudent(roster, payload.session.classCode, payload.student);

  if (!student) {
    return {
      status: 403,
      body: { saved: false, message: 'Student is not linked with this class.' }
    };
  }

  const attendance = await readAttendance(payload.session);
  const alreadySaved = attendance.students.some((entry) => entry.rollNumber === student.rollNumber);

  if (!alreadySaved) {
    attendance.students.push({
      ...student,
      scannedAt: new Date().toISOString()
    });
  }

  attendance.updatedAt = new Date().toISOString();
  attendance.totalPresent = attendance.students.length;

  const savedLocation = await writeAttendance(payload.session, attendance);

  return {
    status: alreadySaved ? 200 : 201,
    body: {
      saved: true,
      duplicate: alreadySaved,
      student,
      totalPresent: attendance.totalPresent,
      ...savedLocation
    }
  };
}

module.exports = {
  getClasses,
  saveAttendance
};
