# QR Exam Attendance Dashboard

Local + Vercel-ready QR attendance dashboard with teacher login, class/session selection, camera scanner, QR authentication against a roster, and attendance persistence.

## Local Run

Install dependencies once:

```powershell
npm install
```

Start local server:

```powershell
npm start
```

Open `http://localhost:3000`.

## Login

- Teacher ID: `241036009`
- Password: `1234`

## QR Payload Format

Recommended QR text:

```json
{"rollNumber":"241036001","batch":"B1","name":"Aarav Sharma"}
```

Backup plain-text format is also supported by the parser, though the UI now only shows the camera scanner:

```text
rollNumber=241036001;batch=B1;name=Aarav Sharma
```

The scanned student must exist in `data/rosters/students.json` under the selected class.

## Storage Priority

The backend chooses storage in this order:

1. `MONGODB_URI` exists: save attendance in MongoDB Atlas.
2. `BLOB_READ_WRITE_TOKEN` exists: save attendance in Vercel Blob.
3. Neither exists: save attendance locally in `data/attendance/...`.

For production, MongoDB is recommended.

## MongoDB Atlas Setup

### 1. Create MongoDB Database

- Go to MongoDB Atlas.
- Create a free cluster.
- Create a database user with username/password.
- Network Access: allow Vercel to connect. For quick testing, use `0.0.0.0/0`. For production, restrict it more carefully.
- Copy your connection string. It looks like:

```text
mongodb+srv://USERNAME:PASSWORD@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
```

### 2. Add Environment Variables In Vercel

In your Vercel project:

- Go to `Settings` → `Environment Variables`.
- Add:

```text
MONGODB_URI=mongodb+srv://USERNAME:PASSWORD@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB_NAME=qr_attendance
```

Then redeploy the project.

### 3. Where Attendance Saves

The backend writes documents into:

```text
Database: qr_attendance
Collection: attendance
```

Each document is grouped by:

```text
teacherId + classCode + date + time
```

If the same teacher selects the same class/date/time again, new valid scans update the same attendance document instead of creating a separate one.

## Vercel Deployment

This project has Vercel API routes in `api/`, so frontend and backend deploy together from the same GitHub repo.

### 1. Push Whole Folder To GitHub

Yes, upload/push the whole `QR` folder contents:

```powershell
git add .
git commit -m "Add MongoDB-backed Vercel attendance app"
git push
```

Do not upload `node_modules` if it exists.

### 2. Import On Vercel

- Go to Vercel Dashboard.
- Add New Project.
- Import your GitHub repository.
- Framework preset can stay as `Other`.
- Deploy.

### 3. Add MongoDB Env Vars

Add `MONGODB_URI` and `MONGODB_DB_NAME` in Vercel settings, then redeploy.

### 4. Test Live

Open your deployed URL, for example:

```text
https://your-project.vercel.app
```

Login, select subject/date/time, then click `Open Camera` and scan a valid student QR.

## Notes

- Camera access requires HTTPS or localhost.
- Vercel gives HTTPS automatically.
- Current camera scanner uses browser `BarcodeDetector`, which works best in Chrome/Edge. If you need wider browser support, replace it with `html5-qrcode`.
- Keep `MONGODB_URI` secret. Never paste it into frontend code.
