import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import crypto from "crypto";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize Supabase Client for Server
const isSupabaseConfigured = Boolean(
  process.env.VITE_SUPABASE_URL &&
  process.env.VITE_SUPABASE_URL !== 'https://jpoaoqifesxxmrknhydm.supabase.co'
);
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://jpoaoqifesxxmrknhydm.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_HqeXygLXyExbuePwri5SJQ_Y2NF5JcW';
const supabase = createClient(supabaseUrl, supabaseKey);

// In-memory database with persistent disk backing
const fallbackDb = {
  teachers: [
    { id: "t1", name: "Sriveni", subject: "English", classes: ["6th", "7th", "8th"], responsibilities: [] },
    { id: "t2", name: "Vinod Sir", subject: "Mathematics", classes: ["9th", "10th", "11th"], responsibilities: [] },
    { id: "t3", name: "Bhavya", subject: "Social Studies", classes: ["7th", "8th"], responsibilities: ["Library Advisor"] },
    { id: "t4", name: "Madhuri", subject: "Social Studies", classes: ["9th", "10th"], responsibilities: [] },
    { id: "t5", name: "Kavitha", subject: "Mathematics", classes: ["9th", "10th"], responsibilities: [] },
    { id: "t6", name: "Madhavi", subject: "Telugu", classes: ["7th", "8th", "9th", "10th"], responsibilities: ["Teacher Attendance Coordinator", "Substitution Coordinator"] },
  ],
  leaveRequests: [] as any[],
  substitutions: [] as any[],
  timetable: [] as any[],
  attendance: [] as any[],
  notifications: [] as any[],
  activityLogs: [] as any[],
  reportHistory: [] as any[],
  messages: [
    {
      id: "msg-1",
      senderId: "principal",
      senderName: "Poorna Devi Srivastava (Principal)",
      senderRole: "principal",
      recipientId: "t6",
      recipientName: "Madhavi (Coordinator)",
      recipientRole: "coordinator",
      conversationId: "principal_t6",
      messageText: "Good morning Madhavi Ma'am. Please verify that substitution coverage for today's English classes is fully coordinated.",
      createdAt: new Date(Date.now() - 7200000).toISOString(),
      read: true,
      readAt: new Date(Date.now() - 7000000).toISOString()
    },
    {
      id: "msg-2",
      senderId: "t6",
      senderName: "Madhavi (Coordinator)",
      senderRole: "coordinator",
      recipientId: "principal",
      recipientName: "Poorna Devi Srivastava (Principal)",
      recipientRole: "principal",
      conversationId: "principal_t6",
      messageText: "Good morning Principal Ma'am. Yes, Sriveni's 4 period classes have been checked for free substitutes and mapped period-by-period.",
      createdAt: new Date(Date.now() - 5400000).toISOString(),
      read: true,
      readAt: new Date(Date.now() - 5000000).toISOString()
    },
    {
      id: "msg-3",
      senderId: "t6",
      senderName: "Madhavi (Coordinator)",
      senderRole: "coordinator",
      recipientId: "t2",
      recipientName: "Vinod Sir",
      recipientRole: "teacher",
      conversationId: "t2_t6",
      messageText: "Vinod Sir, assigned you Period 2 Class 7B English coverage.",
      createdAt: new Date(Date.now() - 3600000).toISOString(),
      read: false,
      readAt: null
    }
  ] as any[]
};

const DB_FILE_PATH = path.join(process.cwd(), "data", "db.json");

function loadDatabaseFromDisk(): boolean {
  try {
    if (fs.existsSync(DB_FILE_PATH)) {
      const rawData = fs.readFileSync(DB_FILE_PATH, "utf-8");
      const parsed = JSON.parse(rawData);
      if (parsed) {
        if (Array.isArray(parsed.teachers) && parsed.teachers.length > 0) fallbackDb.teachers = parsed.teachers;
        if (Array.isArray(parsed.leaveRequests)) fallbackDb.leaveRequests = parsed.leaveRequests;
        if (Array.isArray(parsed.substitutions)) fallbackDb.substitutions = parsed.substitutions;
        if (Array.isArray(parsed.timetable) && parsed.timetable.length > 0) fallbackDb.timetable = parsed.timetable;
        if (Array.isArray(parsed.attendance)) fallbackDb.attendance = parsed.attendance;
        if (Array.isArray(parsed.notifications)) fallbackDb.notifications = parsed.notifications;
        if (Array.isArray(parsed.activityLogs)) fallbackDb.activityLogs = parsed.activityLogs;
        if (Array.isArray(parsed.reportHistory)) fallbackDb.reportHistory = parsed.reportHistory;
        if (Array.isArray(parsed.messages)) fallbackDb.messages = parsed.messages;
        console.log(`[DB Persistence] Successfully loaded database from disk (${fallbackDb.leaveRequests.length} leave requests).`);
        return true;
      }
    }
  } catch (err) {
    console.error("[DB Persistence Error] Failed reading db.json from disk:", err);
  }
  return false;
}

function saveDatabaseToDisk() {
  try {
    const dir = path.dirname(DB_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DB_FILE_PATH, JSON.stringify(fallbackDb, null, 2), "utf-8");
  } catch (err) {
    console.error("[DB Persistence Error] Failed saving db.json to disk:", err);
  }
}

// Seed realistic 6-day timetable for teachers
const daysOfWeek = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const periodTimes = [
  { period: 1, startTime: "08:30", endTime: "09:15", duration: 45, isLunch: false },
  { period: 2, startTime: "09:15", endTime: "10:00", duration: 45, isLunch: false },
  { period: 3, startTime: "10:15", endTime: "11:00", duration: 45, isLunch: false },
  { period: 4, startTime: "11:00", endTime: "11:45", duration: 45, isLunch: false },
  { period: 5, startTime: "11:45", endTime: "12:30", duration: 45, isLunch: true, label: "Lunch Break" },
  { period: 6, startTime: "12:30", endTime: "01:15", duration: 45, isLunch: false },
  { period: 7, startTime: "01:15", endTime: "02:00", duration: 45, isLunch: false },
  { period: 8, startTime: "02:00", endTime: "02:45", duration: 45, isLunch: false },
];

// Explicit realistic timetable mapping per period to test period-by-period substitution
// Teachers:
// t1: Sriveni (English)
// t2: Vinod Sir (Mathematics)
// t3: Bhavya (Social Studies)
// t4: Madhuri (Social Studies)
// t5: Kavitha (Mathematics)
// t6: Madhavi (Telugu)

daysOfWeek.forEach(day => {
  fallbackDb.timetable.push(
    // --- Period 1 (08:30 - 09:15) --- Class: t1, t2, t5 | Free: t3, t4, t6 (Madhavi Free)
    { id: `t1-${day}-P1`, teacherId: "t1", teacherName: "Sriveni", subject: "English", day, period: 1, startTime: "08:30", endTime: "09:15", className: "6-B", section: "B", roomNumber: "Room 101", status: "Scheduled" },
    { id: `t2-${day}-P1`, teacherId: "t2", teacherName: "Vinod Sir", subject: "Mathematics", day, period: 1, startTime: "08:30", endTime: "09:15", className: "8-A", section: "A", roomNumber: "Room 102", status: "Scheduled" },
    { id: `t5-${day}-P1`, teacherId: "t5", teacherName: "Kavitha", subject: "Mathematics", day, period: 1, startTime: "08:30", endTime: "09:15", className: "9-B", section: "B", roomNumber: "Room 105", status: "Scheduled" },

    // --- Period 2 (09:15 - 10:00) --- Class: t1, t3, t4, t6 | Free: t2, t5 (Madhavi: Telugu 7-B)
    { id: `t1-${day}-P2`, teacherId: "t1", teacherName: "Sriveni", subject: "English", day, period: 2, startTime: "09:15", endTime: "10:00", className: "7-B", section: "B", roomNumber: "Room 101", status: "Scheduled" },
    { id: `t3-${day}-P2`, teacherId: "t3", teacherName: "Bhavya", subject: "Social Studies", day, period: 2, startTime: "09:15", endTime: "10:00", className: "7-A", section: "A", roomNumber: "Room 103", status: "Scheduled" },
    { id: `t4-${day}-P2`, teacherId: "t4", teacherName: "Madhuri", subject: "Social Studies", day, period: 2, startTime: "09:15", endTime: "10:00", className: "9-A", section: "A", roomNumber: "Room 104", status: "Scheduled" },
    { id: `t6-${day}-P2`, teacherId: "t6", teacherName: "Madhavi", subject: "Telugu", day, period: 2, startTime: "09:15", endTime: "10:00", className: "7-B", section: "B", roomNumber: "Room 106", status: "Scheduled" },

    // --- Period 3 (10:15 - 11:00) --- Class: t1, t2, t4 | Free: t3, t5, t6 (Madhavi Free)
    { id: `t1-${day}-P3`, teacherId: "t1", teacherName: "Sriveni", subject: "English", day, period: 3, startTime: "10:15", endTime: "11:00", className: "8-B", section: "B", roomNumber: "Room 101", status: "Scheduled" },
    { id: `t2-${day}-P3`, teacherId: "t2", teacherName: "Vinod Sir", subject: "Mathematics", day, period: 3, startTime: "10:15", endTime: "11:00", className: "7-C", section: "C", roomNumber: "Room 102", status: "Scheduled" },
    { id: `t4-${day}-P3`, teacherId: "t4", teacherName: "Madhuri", subject: "Social Studies", day, period: 3, startTime: "10:15", endTime: "11:00", className: "10-A", section: "A", roomNumber: "Room 104", status: "Scheduled" },

    // --- Period 4 (11:00 - 11:45) --- Class: t1, t2, t3, t6 | Free: t4, t5 (Madhavi: Telugu 9-A)
    { id: `t1-${day}-P4`, teacherId: "t1", teacherName: "Sriveni", subject: "English", day, period: 4, startTime: "11:00", endTime: "11:45", className: "7-B", section: "B", roomNumber: "Room 101", status: "Scheduled" },
    { id: `t2-${day}-P4`, teacherId: "t2", teacherName: "Vinod Sir", subject: "Mathematics", day, period: 4, startTime: "11:00", endTime: "11:45", className: "6-A", section: "A", roomNumber: "Room 102", status: "Scheduled" },
    { id: `t3-${day}-P4`, teacherId: "t3", teacherName: "Bhavya", subject: "Social Studies", day, period: 4, startTime: "11:00", endTime: "11:45", className: "9-A", section: "A", roomNumber: "Room 103", status: "Scheduled" },
    { id: `t6-${day}-P4`, teacherId: "t6", teacherName: "Madhavi", subject: "Telugu", day, period: 4, startTime: "11:00", endTime: "11:45", className: "9-A", section: "A", roomNumber: "Room 106", status: "Scheduled" },

    // --- Period 5 (11:45 - 12:30) --- Class: t3, t4, t5 | Free: t1, t2, t6 (Madhavi Free)
    { id: `t3-${day}-P5`, teacherId: "t3", teacherName: "Bhavya", subject: "Social Studies", day, period: 5, startTime: "11:45", endTime: "12:30", className: "8-A", section: "A", roomNumber: "Room 103", status: "Scheduled" },
    { id: `t4-${day}-P5`, teacherId: "t4", teacherName: "Madhuri", subject: "Social Studies", day, period: 5, startTime: "11:45", endTime: "12:30", className: "10-B", section: "B", roomNumber: "Room 104", status: "Scheduled" },
    { id: `t5-${day}-P5`, teacherId: "t5", teacherName: "Kavitha", subject: "Mathematics", day, period: 5, startTime: "11:45", endTime: "12:30", className: "6-B", section: "B", roomNumber: "Room 105", status: "Scheduled" },

    // --- Period 6 (12:30 - 01:15) --- Class: t2, t5, t6 | Free: t1, t3, t4 (Madhavi: Telugu 10-A)
    { id: `t2-${day}-P6`, teacherId: "t2", teacherName: "Vinod Sir", subject: "Mathematics", day, period: 6, startTime: "12:30", endTime: "01:15", className: "9-A", section: "A", roomNumber: "Room 102", status: "Scheduled" },
    { id: `t5-${day}-P6`, teacherId: "t5", teacherName: "Kavitha", subject: "Mathematics", day, period: 6, startTime: "12:30", endTime: "01:15", className: "8-B", section: "B", roomNumber: "Room 105", status: "Scheduled" },
    { id: `t6-${day}-P6`, teacherId: "t6", teacherName: "Madhavi", subject: "Telugu", day, period: 6, startTime: "12:30", endTime: "01:15", className: "10-A", section: "A", roomNumber: "Room 106", status: "Scheduled" },

    // --- Period 7 (01:15 - 02:00) --- Class: t2, t3, t5 | Free: t1, t4, t6 (Madhavi Free)
    { id: `t2-${day}-P7`, teacherId: "t2", teacherName: "Vinod Sir", subject: "Mathematics", day, period: 7, startTime: "01:15", endTime: "02:00", className: "10-A", section: "A", roomNumber: "Room 102", status: "Scheduled" },
    { id: `t3-${day}-P7`, teacherId: "t3", teacherName: "Bhavya", subject: "Social Studies", day, period: 7, startTime: "01:15", endTime: "02:00", className: "6-B", section: "B", roomNumber: "Room 103", status: "Scheduled" },
    { id: `t5-${day}-P7`, teacherId: "t5", teacherName: "Kavitha", subject: "Mathematics", day, period: 7, startTime: "01:15", endTime: "02:00", className: "7-A", section: "A", roomNumber: "Room 105", status: "Scheduled" }
  );
});

// Seed automatic daily attendance records (default: Present)
const todayIsoStr = new Date().toISOString().split('T')[0];
fallbackDb.teachers.forEach((t, idx) => {
  fallbackDb.attendance.push({
    id: `att-${t.id}-${todayIsoStr}`,
    teacherId: t.id,
    teacherName: t.name,
    subject: t.subject,
    date: todayIsoStr,
    status: idx === 2 ? "Late Arrival" : idx === 4 ? "Early Departure" : "Present",
    checkInTime: idx === 2 ? "08:50 AM" : "08:25 AM",
    checkOutTime: idx === 4 ? "01:30 PM" : "03:00 PM",
    reason: idx === 2 ? "Traffic congestion" : idx === 4 ? "Doctor appointment" : undefined,
    approvalStatus: "Approved"
  });
});

// Load persistent database from disk if available
const loaded = loadDatabaseFromDisk();

if (!loaded || fallbackDb.leaveRequests.length === 0) {
  // Seed initial academic-year leave records (2026-2027) so Principal has immediate historical data
  fallbackDb.leaveRequests = [
    {
      id: "leave-seed-1",
      teacherId: "t1",
      teacherName: "Sriveni",
      subject: "English",
      startDate: "2026-06-12",
      endDate: "2026-06-12",
      reason: "Personal family event",
      leaveType: "casual",
      academicYear: "2026-2027",
      status: "approved",
      createdAt: "2026-06-10T09:00:00.000Z",
      submittedAt: "2026-06-10T09:00:00.000Z",
      reviewedAt: "2026-06-10T11:30:00.000Z",
      reviewedBy: "Poorna Devi Srivastava (Principal)",
      reviewComment: "Approved."
    },
    {
      id: "leave-seed-2",
      teacherId: "t1",
      teacherName: "Sriveni",
      subject: "English",
      startDate: "2026-06-25",
      endDate: "2026-06-25",
      reason: "High fever & medical consultation",
      leaveType: "sick",
      academicYear: "2026-2027",
      status: "approved",
      createdAt: "2026-06-24T08:15:00.000Z",
      submittedAt: "2026-06-24T08:15:00.000Z",
      reviewedAt: "2026-06-24T09:00:00.000Z",
      reviewedBy: "Poorna Devi Srivastava (Principal)",
      reviewComment: "Approved. Get well soon."
    },
    {
      id: "leave-seed-3",
      teacherId: "t1",
      teacherName: "Sriveni",
      subject: "English",
      startDate: "2026-07-14",
      endDate: "2026-07-14",
      reason: "Out-of-station travel",
      leaveType: "casual",
      academicYear: "2026-2027",
      status: "rejected",
      createdAt: "2026-07-13T10:00:00.000Z",
      submittedAt: "2026-07-13T10:00:00.000Z",
      reviewedAt: "2026-07-13T12:00:00.000Z",
      reviewedBy: "Poorna Devi Srivastava (Principal)",
      reviewComment: "Declined due to mid-term exam schedule."
    },
    {
      id: "leave-seed-4",
      teacherId: "t1",
      teacherName: "Sriveni",
      subject: "English",
      startDate: "2026-08-15",
      endDate: "2026-08-15",
      reason: "Annual family event",
      leaveType: "casual",
      academicYear: "2026-2027",
      status: "approved",
      createdAt: "2026-08-14T11:00:00.000Z",
      submittedAt: "2026-08-14T11:00:00.000Z",
      reviewedAt: "2026-08-14T14:20:00.000Z",
      reviewedBy: "Poorna Devi Srivastava (Principal)",
      reviewComment: "Approved."
    },
    {
      id: "leave-seed-5",
      teacherId: "t1",
      teacherName: "Sriveni",
      subject: "English",
      startDate: todayIsoStr,
      endDate: todayIsoStr,
      reason: "Medical appointment & health checkup",
      leaveType: "casual",
      academicYear: "2026-2027",
      status: "pending_principal",
      createdAt: new Date().toISOString(),
      submittedAt: new Date().toISOString(),
      reviewedAt: null,
      reviewedBy: null,
      reviewComment: null
    }
  ];
  saveDatabaseToDisk();
}

// SSE Realtime Connections
let sseClients: express.Response[] = [];

app.get("/api/realtime", (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: Date.now() })}\n\n`);
  sseClients.push(res);

  req.on('close', () => {
    sseClients = sseClients.filter(c => c !== res);
  });
});

setInterval(() => {
  sseClients.forEach(c => {
    try { c.write(':ping\n\n'); } catch (e) {}
  });
}, 15000);

function notifyRealtime(eventType: string, payload?: any) {
  const data = JSON.stringify({ type: eventType, payload, update: true, timestamp: Date.now() });
  sseClients.forEach(c => {
    try { c.write(`data: ${data}\n\n`); } catch (e) {}
  });
}

function createNotification({ title, message, category, role, userId }: any) {
  const newNotif = {
    id: crypto.randomUUID(),
    title,
    message,
    category: category || "System",
    role: role || "all",
    userId: userId || "all",
    time: "Just now",
    read: false,
    createdAt: new Date().toISOString()
  };
  fallbackDb.notifications.unshift(newNotif);
  return newNotif;
}

function createActivityLog({ user, role, action, description }: any) {
  const newLog = {
    id: crypto.randomUUID(),
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    user: user || "System",
    role: role || "System",
    action: action || "Update",
    description: description || ""
  };
  fallbackDb.activityLogs.unshift(newLog);
  return newLog;
}

// API Routes
app.get("/api/teachers", async (req, res) => {
  if (!isSupabaseConfigured) {
    return res.json(fallbackDb.teachers);
  }
  try {
    const { data, error } = await supabase.from('teachers').select('*').order('teacher_id', { ascending: true });
    if (error) throw error;
    
    if (data && data.length > 0) {
      // Map database snake_case to camelCase
      const formattedTeachers = data.map(t => ({
        id: t.teacher_id, // Map teacher_id to id for frontend
        name: t.name,
        subject: t.subject,
        classes: t.classes || [],
        responsibilities: t.responsibilities || []
      }));
      return res.json(formattedTeachers);
    }
    res.json(fallbackDb.teachers);
  } catch (error) {
    console.log("Using in-memory fallback database for teachers.");
    res.json(fallbackDb.teachers);
  }
});

app.get("/api/leave-requests", async (req, res) => {
  if (!isSupabaseConfigured) {
    const requests = fallbackDb.leaveRequests.map(lr => {
      const teacher = fallbackDb.teachers.find(t => t.id === lr.teacherId);
      const nowIso = new Date().toISOString();
      const todayStr = nowIso.split('T')[0];
      return {
        ...lr,
        startDate: lr.startDate || todayStr,
        endDate: lr.endDate || lr.startDate || todayStr,
        createdAt: lr.createdAt || nowIso,
        teacherName: teacher?.name,
        subject: teacher?.subject
      };
    });
    return res.json(requests);
  }
  try {
    const { data, error } = await supabase.from('leave_requests').select(`
      *,
      teachers:teacher_id (name, subject)
    `);
    
    if (error) throw error;

    if (data) {
      const nowIso = new Date().toISOString();
      const todayStr = nowIso.split('T')[0];
      const formattedRequests = data.map(r => ({
        id: r.id,
        teacherId: r.teacher_id,
        startDate: r.start_date || todayStr,
        endDate: r.end_date || r.start_date || todayStr,
        reason: r.reason,
        status: r.status,
        createdAt: r.created_at || nowIso,
        teacherName: r.teachers?.name,
        subject: r.teachers?.subject
      }));
      return res.json(formattedRequests);
    }
    
    // Fallback if data is null but no error
    throw new Error("No data returned");
  } catch (error) {
    console.log("Using in-memory fallback database for leave requests.");
    const requests = fallbackDb.leaveRequests.map(lr => {
      const teacher = fallbackDb.teachers.find(t => t.id === lr.teacherId);
      const nowIso = new Date().toISOString();
      const todayStr = nowIso.split('T')[0];
      return {
        ...lr,
        startDate: lr.startDate || todayStr,
        endDate: lr.endDate || lr.startDate || todayStr,
        createdAt: lr.createdAt || nowIso,
        teacherName: teacher?.name,
        subject: teacher?.subject
      };
    });
    res.json(requests);
  }
});

app.post("/api/leave-requests", async (req, res) => {
  const { teacherId, startDate, endDate, reason, leaveType, notes } = req.body;
  const teacher = fallbackDb.teachers.find(t => t.id === teacherId);
  const teacherName = teacher?.name || "Teacher";
  const nowIso = new Date().toISOString();
  
  const fallbackReq = {
    id: crypto.randomUUID(),
    teacherId,
    teacherName,
    subject: teacher?.subject || "General",
    startDate,
    endDate,
    reason,
    leaveType: leaveType || "casual",
    academicYear: "2026-2027",
    notes,
    status: "pending_principal",
    submittedAt: nowIso,
    createdAt: nowIso,
    updatedAt: nowIso
  };

  fallbackDb.leaveRequests.push(fallbackReq);
  saveDatabaseToDisk();

  if (isSupabaseConfigured) {
    try {
      await supabase.from('leave_requests').insert([{
        id: fallbackReq.id,
        teacher_id: teacherId,
        start_date: startDate,
        end_date: endDate,
        reason,
        status: "pending_principal"
      }]);
    } catch (error) {}
  }

  createNotification({
    title: "New Leave Request Submitted",
    message: `${teacherName} applied for leave (${startDate} to ${endDate}). Reason: ${reason}`,
    category: "Leave",
    role: "principal"
  });

  createActivityLog({
    user: teacherName,
    role: "Teacher",
    action: "Leave Request Submitted",
    description: `Applied for leave from ${startDate} to ${endDate}`
  });

  notifyRealtime("leave_requests");
  return res.json(fallbackReq);
});

app.put("/api/leave-requests/:id/status", async (req, res) => {
  const { id } = req.params;
  const { status, reviewComment, reviewerName } = req.body;
  const nowIso = new Date().toISOString();

  let request = fallbackDb.leaveRequests.find(r => r.id === id);
  if (request) {
    request.status = status;
    request.reviewedAt = nowIso;
    request.reviewedBy = reviewerName || "Poorna Devi Srivastava (Principal)";
    if (reviewComment) request.reviewComment = reviewComment;
    request.updatedAt = nowIso;
  }

  saveDatabaseToDisk();

  if (isSupabaseConfigured) {
    try {
      await supabase.from('leave_requests').update({ status }).eq('id', id);
    } catch (e) {}
  }

  const teacher = fallbackDb.teachers.find(t => t.id === request?.teacherId);
  const teacherName = teacher?.name || request?.teacherName || "Teacher";

  if (status === "pending_coordinator" || status === "approved") {
    createNotification({
      title: "Leave Request Approved",
      message: `Your leave request for ${request?.startDate || 'today'} has been approved by Principal Poorna Devi Srivastava.`,
      category: "Leave",
      role: "teacher",
      userId: request?.teacherId
    });

    createNotification({
      title: "Leave Approved - Action Needed",
      message: `Principal approved leave for ${teacherName}. Please assign substitute teacher.`,
      category: "Assignment",
      role: "coordinator"
    });

    createActivityLog({
      user: "Poorna Devi Srivastava",
      role: "Principal",
      action: "Leave Request Approved",
      description: `Approved leave request for ${teacherName}`
    });
  } else if (status === "rejected") {
    createNotification({
      title: "Leave Request Rejected",
      message: `Your leave request for ${request?.startDate || 'today'} was declined by Principal Poorna Devi Srivastava.`,
      category: "Leave",
      role: "teacher",
      userId: request?.teacherId
    });

    createActivityLog({
      user: "Poorna Devi Srivastava",
      role: "Principal",
      action: "Leave Request Rejected",
      description: `Rejected leave request for ${teacherName}`
    });
  }

  notifyRealtime("leave_requests");
  return res.json(request || { id, status });
});

app.get("/api/leave-requests/teacher/:teacherId", async (req, res) => {
  const { teacherId } = req.params;
  const { academicYear, status } = req.query;

  let requests = fallbackDb.leaveRequests.filter(r => r.teacherId === teacherId);

  if (academicYear && academicYear !== "all") {
    requests = requests.filter(r => r.academicYear === academicYear);
  }
  if (status && status !== "all") {
    requests = requests.filter(r => r.status === status);
  }

  requests.sort((a, b) => new Date(b.createdAt || b.startDate).getTime() - new Date(a.createdAt || a.startDate).getTime());
  return res.json(requests);
});

app.post("/api/leaves/clear", async (req, res) => {
  fallbackDb.leaveRequests = [];
  fallbackDb.substitutions = [];
  fallbackDb.notifications = [];
  fallbackDb.activityLogs = [];

  if (isSupabaseConfigured) {
    try {
      await supabase.from('leave_requests').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('substitutions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    } catch (e) {
      console.log("Supabase clear error", e);
    }
  }

  notifyRealtime("leave_requests");
  notifyRealtime("substitutions");
  notifyRealtime("notifications");

  return res.json({ success: true, message: "All leave requests and substitutions cleared." });
});

app.delete("/api/leave-requests", async (req, res) => {
  fallbackDb.leaveRequests = [];
  fallbackDb.substitutions = [];
  fallbackDb.notifications = [];
  fallbackDb.activityLogs = [];

  if (isSupabaseConfigured) {
    try {
      await supabase.from('leave_requests').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('substitutions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    } catch (e) {}
  }

  notifyRealtime("leave_requests");
  notifyRealtime("substitutions");
  notifyRealtime("notifications");

  return res.json({ success: true, message: "All leave requests cleared." });
});

// Helper: Get day of week name from date string safely without UTC offset shift
function getDayOfWeekName(dateStr: string) {
  if (!dateStr) return "Monday";
  const dateOnly = dateStr.split('T')[0];
  const parts = dateOnly.split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const date = new Date(year, month, day);
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return days[date.getDay()] || "Monday";
  }
  const date = new Date(dateStr);
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return days[date.getDay()] || "Monday";
}

// Helper: Safely match timetable entries for a day (falling back to Monday only if day has zero entries)
function getTargetTimetableDay(dayName: string) {
  const hasEntries = fallbackDb.timetable.some(e => e.day === dayName);
  return hasEntries ? dayName : "Monday";
}

// Helper: Ensure period-by-period substitution requirements exist for a leave request
function ensureSubstitutionsForLeaveRequest(leaveReq: any) {
  if (!leaveReq) return;
  const teacher = fallbackDb.teachers.find(t => t.id === leaveReq.teacherId);
  const teacherName = teacher?.name || leaveReq.teacherName || "Teacher";
  const date = leaveReq.startDate || new Date().toISOString().split('T')[0];
  const dayName = getDayOfWeekName(date);
  const targetDay = getTargetTimetableDay(dayName);

  // Find scheduled periods for this teacher in timetable
  let teacherPeriods = fallbackDb.timetable.filter(
    e => e.teacherId === leaveReq.teacherId && e.day === targetDay
  );

  // Fallback to default periods if none found
  if (teacherPeriods.length === 0) {
    teacherPeriods = [
      { period: 1, startTime: "08:30", endTime: "09:15", className: "6-B", section: "B", subject: teacher?.subject || "General" },
      { period: 2, startTime: "09:15", endTime: "10:00", className: "7-B", section: "B", subject: teacher?.subject || "General" },
      { period: 3, startTime: "10:15", endTime: "11:00", className: "8-B", section: "B", subject: teacher?.subject || "General" },
      { period: 4, startTime: "11:00", endTime: "11:45", className: "7-B", section: "B", subject: teacher?.subject || "General" },
    ];
  }

  teacherPeriods.forEach((p: any) => {
    const existing = fallbackDb.substitutions.find(
      s => s.leaveRequestId === leaveReq.id && Number(s.period) === Number(p.period)
    );
    if (!existing) {
      fallbackDb.substitutions.push({
        id: `sub-${leaveReq.id}-P${p.period}`,
        leaveRequestId: leaveReq.id,
        date: date,
        period: Number(p.period),
        startTime: p.startTime || "08:30",
        endTime: p.endTime || "09:15",
        className: p.className || p.class || "Class",
        section: p.section || "B",
        subject: p.subject || teacher?.subject || "Subject",
        originalTeacherId: leaveReq.teacherId,
        originalTeacherName: teacherName,
        substituteTeacherId: null,
        substituteName: null,
        status: "pending",
        declineReason: null,
        createdAt: new Date().toISOString()
      });
    }
  });
}

// Helper: Get available teachers for a specific period
function getAvailableTeachersForPeriod(date: string, dayName: string, period: number, absentTeacherId: string) {
  const allTeachers = fallbackDb.teachers;
  const targetDay = getTargetTimetableDay(dayName);

  // Find absent/on-leave teacher IDs
  const absentTeacherIds = new Set<string>();
  if (absentTeacherId) absentTeacherIds.add(absentTeacherId);

  fallbackDb.leaveRequests.forEach(lr => {
    if ((lr.status === "pending_coordinator" || lr.status === "completed" || lr.status === "pending_principal") &&
        lr.startDate <= date && lr.endDate >= date && lr.status !== "rejected") {
      absentTeacherIds.add(lr.teacherId);
    }
  });

  // Find busy teachers who have a scheduled class in timetable during this period
  const busyTeachingMap = new Map<string, string>(); // teacherId -> className
  fallbackDb.timetable.forEach(entry => {
    if (entry.day === targetDay && Number(entry.period) === Number(period)) {
      busyTeachingMap.set(entry.teacherId, `${entry.className}-${entry.section || 'A'}`);
    }
  });

  // Find busy teachers already assigned to another substitution in this period
  const subAssignedMap = new Map<string, string>(); // teacherId -> className
  fallbackDb.substitutions.forEach(sub => {
    if (sub.date === date && Number(sub.period) === Number(period) && sub.substituteTeacherId && (sub.status === "assigned" || sub.status === "accepted")) {
      subAssignedMap.set(sub.substituteTeacherId, sub.className);
    }
  });

  return allTeachers.map(t => {
    const isAbsent = absentTeacherIds.has(t.id);
    const teachingClass = busyTeachingMap.get(t.id);
    const subClass = subAssignedMap.get(t.id);

    let isAvailable = true;
    let reason = "Available (Free period)";

    if (isAbsent) {
      isAvailable = false;
      reason = t.id === absentTeacherId ? "Absent (Original Teacher)" : "On Leave";
    } else if (teachingClass) {
      isAvailable = false;
      reason = `Teaching Class ${teachingClass}`;
    } else if (subClass) {
      isAvailable = false;
      reason = `Covering sub for Class ${subClass}`;
    }

    const substitutionsCountToday = fallbackDb.substitutions.filter(
      s => s.substituteTeacherId === t.id && s.date === date && (s.status === "assigned" || s.status === "accepted")
    ).length;

    return {
      teacherId: t.id,
      name: t.name,
      subject: t.subject,
      classes: t.classes || [],
      isAvailable,
      reason,
      substitutionsCountToday
    };
  });
}

app.get("/api/substitutions/availability", async (req, res) => {
  const date = (req.query.date as string) || new Date().toISOString().split('T')[0];
  const period = parseInt(req.query.period as string) || 1;
  const absentTeacherId = (req.query.absentTeacherId as string) || "";
  const dayName = getDayOfWeekName(date);

  const availability = getAvailableTeachersForPeriod(date, dayName, period, absentTeacherId);
  return res.json(availability);
});

app.get("/api/substitutions", async (req, res) => {
  const todayStr = new Date().toISOString().split('T')[0];
  
  // Ensure period-by-period substitution records exist for all non-rejected leave requests
  fallbackDb.leaveRequests.forEach(lr => {
    if (lr.status !== "rejected") {
      ensureSubstitutionsForLeaveRequest(lr);
    }
  });

  if (!isSupabaseConfigured) {
    const subs = fallbackDb.substitutions.map(s => ({
      ...s,
      date: s.date || todayStr
    }));
    return res.json(subs);
  }
  try {
    const { data, error } = await supabase.from('substitutions').select('*');
    if (error) throw error;
    
    if (data && data.length > 0) {
      const formattedSubs = data.map(s => {
        const origTeacher = fallbackDb.teachers.find(t => t.id === s.original_teacher_id);
        const subTeacher = fallbackDb.teachers.find(t => t.id === s.substitute_teacher_id);
        return {
          id: s.id,
          leaveRequestId: s.leave_request_id,
          date: s.date || todayStr,
          period: s.period,
          className: s.class || "Class",
          originalTeacherId: s.original_teacher_id,
          originalTeacherName: origTeacher?.name,
          substituteTeacherId: s.substitute_teacher_id,
          substituteName: subTeacher?.name,
          status: s.status || "pending"
        };
      });
      return res.json(formattedSubs);
    }
    return res.json(fallbackDb.substitutions);
  } catch (error) {
    const subs = fallbackDb.substitutions.map(s => ({
      ...s,
      date: s.date || todayStr
    }));
    res.json(subs);
  }
});

app.post("/api/substitutions", async (req, res) => {
  const { leaveRequestId, assignments } = req.body;

  const request = fallbackDb.leaveRequests.find(r => r.id === leaveRequestId);
  if (!request) {
    return res.status(404).json({ error: "Leave request not found" });
  }

  const date = request.startDate || new Date().toISOString().split('T')[0];
  const dayName = getDayOfWeekName(date);

  // SERVER-SIDE HARD CONFLICT VALIDATION FOR EACH PERIOD ASSIGNMENT
  for (const a of assignments) {
    const periodNum = parseInt(a.period) || 1;
    const subTeacherId = a.substituteTeacherId;
    if (!subTeacherId) continue;

    const subTeacher = fallbackDb.teachers.find(t => t.id === subTeacherId);
    const subTeacherName = subTeacher?.name || "Teacher";

    // Rule 1: Reject self-assignment
    if (subTeacherId === request.teacherId) {
      return res.status(400).json({ error: `Cannot assign absent teacher (${subTeacherName}) as their own substitute!` });
    }

    // Rule 2: Check if substitute teacher is on leave
    const isTeacherOnLeave = fallbackDb.leaveRequests.some(
      lr => lr.teacherId === subTeacherId && lr.startDate <= date && lr.endDate >= date && lr.status !== "rejected"
    );
    if (isTeacherOnLeave) {
      return res.status(400).json({ error: `${subTeacherName} is on leave on ${date} and cannot be assigned as substitute!` });
    }

    // Rule 3: Check timetable conflict (teacher is scheduled to teach during this period)
    const targetDay = getTargetTimetableDay(dayName);
    const teachingConflict = fallbackDb.timetable.find(
      e => e.teacherId === subTeacherId && e.day === targetDay && Number(e.period) === Number(periodNum)
    );
    if (teachingConflict) {
      return res.status(400).json({
        error: `Conflict: ${subTeacherName} is already teaching Class ${teachingConflict.className} during Period ${periodNum}!`
      });
    }

    // Rule 4: Check substitution conflict (already assigned to another substitution during this period)
    const subConflict = fallbackDb.substitutions.find(
      s => s.date === date && Number(s.period) === Number(periodNum) && s.substituteTeacherId === subTeacherId &&
           (s.status === "assigned" || s.status === "accepted") && s.id !== a.substitutionId
    );
    if (subConflict) {
      return res.status(400).json({
        error: `Conflict: ${subTeacherName} is already assigned to another substitution for Class ${subConflict.className} during Period ${periodNum}!`
      });
    }
  }

  // All assignments validated! Apply changes
  request.status = "completed";

  assignments.forEach((assignment: any) => {
    const periodNum = parseInt(assignment.period) || 1;
    const subTeacher = fallbackDb.teachers.find(t => t.id === assignment.substituteTeacherId);
    const origTeacher = fallbackDb.teachers.find(t => t.id === request.teacherId);
    const origTeacherName = origTeacher?.name || request.teacherName || "Teacher";

    let subEntry = fallbackDb.substitutions.find(
      s => (s.id === assignment.substitutionId) || (s.leaveRequestId === leaveRequestId && Number(s.period) === Number(periodNum))
    );

    if (subEntry) {
      subEntry.substituteTeacherId = assignment.substituteTeacherId;
      subEntry.substituteName = subTeacher?.name || "Substitute Teacher";
      subEntry.status = "assigned";
      subEntry.declineReason = null;
    } else {
      subEntry = {
        id: assignment.substitutionId || `sub-${leaveRequestId}-P${periodNum}`,
        leaveRequestId,
        date,
        period: periodNum,
        startTime: assignment.startTime || "08:30",
        endTime: assignment.endTime || "09:15",
        className: assignment.className || assignment.class || "Multiple",
        section: "B",
        subject: origTeacher?.subject || "Subject",
        originalTeacherId: request.teacherId,
        originalTeacherName: origTeacherName,
        substituteTeacherId: assignment.substituteTeacherId,
        substituteName: subTeacher?.name || "Substitute Teacher",
        status: "assigned",
        declineReason: null,
        createdAt: new Date().toISOString()
      };
      fallbackDb.substitutions.push(subEntry);
    }

    createNotification({
      title: `Substitution Assignment: Period ${periodNum}`,
      message: `Assigned to cover Class ${subEntry.className} (${subEntry.subject}) for ${origTeacherName} during Period ${periodNum} on ${date}.`,
      category: "Assignment",
      role: "teacher",
      userId: assignment.substituteTeacherId
    });

    createNotification({
      title: `Period ${periodNum} Substitution Assigned`,
      message: `Coordinator Madhavi assigned ${subTeacher?.name} for Period ${periodNum} (${subEntry.className}).`,
      category: "Assignment",
      role: "principal"
    });

    createActivityLog({
      user: "Madhavi",
      role: "Coordinator",
      action: "Substitute Assigned",
      description: `Assigned ${subTeacher?.name} for ${origTeacherName} (Period ${periodNum}, Class ${subEntry.className})`
    });
  });

  saveDatabaseToDisk();
  notifyRealtime("substitutions");
  return res.json({ success: true, substitutions: fallbackDb.substitutions.filter(s => s.leaveRequestId === leaveRequestId) });
});

app.put("/api/substitutions/:id/status", async (req, res) => {
  const { id } = req.params;
  const { status, reason } = req.body;

  const sub = fallbackDb.substitutions.find(s => s.id === id);
  if (!sub) {
    return res.status(404).json({ error: "Substitution record not found" });
  }

  sub.status = status;
  if (reason) sub.declineReason = reason;

  const subTeacherName = sub.substituteName || "Substitute Teacher";

  if (status === "accepted") {
    createNotification({
      title: `Period ${sub.period} Substitution Accepted`,
      message: `${subTeacherName} accepted Period ${sub.period} substitution for Class ${sub.className}.`,
      category: "Assignment",
      role: "coordinator"
    });

    createNotification({
      title: `Period ${sub.period} Substitution Accepted`,
      message: `${subTeacherName} accepted coverage for Class ${sub.className} (Period ${sub.period}).`,
      category: "Assignment",
      role: "principal"
    });

    createActivityLog({
      user: subTeacherName,
      role: "Teacher",
      action: "Substitution Accepted",
      description: `Accepted substitution for Period ${sub.period} (Class ${sub.className})`
    });
  } else if (status === "declined") {
    sub.status = "declined";

    createNotification({
      title: `Period ${sub.period} Substitution Declined`,
      message: `${subTeacherName} declined Period ${sub.period} substitution. Reason: ${reason || 'Not specified'}. Please reassign Period ${sub.period}.`,
      category: "Assignment",
      role: "coordinator"
    });

    createNotification({
      title: `Period ${sub.period} Substitution Declined`,
      message: `${subTeacherName} declined coverage for Period ${sub.period}.`,
      category: "Assignment",
      role: "principal"
    });

    createActivityLog({
      user: subTeacherName,
      role: "Teacher",
      action: "Substitution Declined",
      description: `Declined Period ${sub.period} substitution. Reason: ${reason || 'Not specified'}`
    });
  }

  saveDatabaseToDisk();
  notifyRealtime("substitutions");
  return res.json(sub);
});

// New endpoints for Timetable, Attendance, Notifications, Activity Logs, and Report History
app.get("/api/timetable", async (req, res) => {
  const { teacherId, day } = req.query;
  let entries = fallbackDb.timetable;
  if (teacherId) {
    entries = entries.filter(e => e.teacherId === teacherId);
  }
  if (day) {
    entries = entries.filter(e => e.day === day);
  }
  res.json(entries);
});

app.get("/api/timetable/capacity", async (req, res) => {
  const date = (req.query.date as string) || new Date().toISOString().split('T')[0];
  const dayName = getDayOfWeekName(date);
  const targetDay = getTargetTimetableDay(dayName);

  const periodsAnalysis = [];
  const totalPeriods = 7;
  let healthyPeriodsCount = 0;

  for (let p = 1; p <= totalPeriods; p++) {
    const teachingList: any[] = [];
    const freeList: any[] = [];

    fallbackDb.teachers.forEach(t => {
      const scheduled = fallbackDb.timetable.find(
        entry => entry.teacherId === t.id && entry.day === targetDay && Number(entry.period) === p
      );
      if (scheduled) {
        teachingList.push({
          teacherId: t.id,
          teacherName: t.name,
          subject: t.subject,
          className: scheduled.className,
          section: scheduled.section || "A"
        });
      } else {
        freeList.push({
          teacherId: t.id,
          teacherName: t.name,
          subject: t.subject,
          classes: t.classes || []
        });
      }
    });

    const freeCount = freeList.length;
    let status = "Optimal";
    if (freeCount >= 2) {
      status = "Optimal";
      healthyPeriodsCount++;
    } else if (freeCount === 1) {
      status = "Moderate";
      healthyPeriodsCount += 0.5;
    } else {
      status = "Critical";
    }

    periodsAnalysis.push({
      period: p,
      startTime: periodTimes[p - 1]?.startTime || `Period ${p}`,
      endTime: periodTimes[p - 1]?.endTime || "",
      totalTeachers: fallbackDb.teachers.length,
      teachingCount: teachingList.length,
      freeCount: freeCount,
      teachingTeachers: teachingList,
      freeTeachers: freeList,
      status
    });
  }

  const capacityScore = Math.round((healthyPeriodsCount / totalPeriods) * 100);

  return res.json({
    date,
    day: dayName,
    capacityScore,
    periods: periodsAnalysis
  });
});

app.get("/api/timetable/validate", async (req, res) => {
  const dayName = (req.query.day as string) || "Monday";
  const targetDay = getTargetTimetableDay(dayName);
  const checks = [];

  let teacherConflictCount = 0;
  for (let p = 1; p <= 7; p++) {
    const teacherMap = new Map();
    fallbackDb.timetable.filter(e => e.day === targetDay && Number(e.period) === p).forEach(e => {
      if (teacherMap.has(e.teacherId)) teacherConflictCount++;
      else teacherMap.set(e.teacherId, true);
    });
  }
  checks.push({
    title: "No Teacher Double-Booking",
    passed: teacherConflictCount === 0,
    details: teacherConflictCount === 0 ? "All teachers scheduled max 1 class per period" : `${teacherConflictCount} conflicts detected`
  });

  let periodsWithZeroFree = 0;
  let periodsWithSufficientFree = 0;
  for (let p = 1; p <= 7; p++) {
    const teachingCount = fallbackDb.timetable.filter(e => e.day === targetDay && Number(e.period) === p).length;
    const freeCount = fallbackDb.teachers.length - teachingCount;
    if (freeCount >= 2) periodsWithSufficientFree++;
    if (freeCount === 0) periodsWithZeroFree++;
  }

  checks.push({
    title: "Substitution Capacity Protection",
    passed: periodsWithZeroFree === 0,
    details: `${periodsWithSufficientFree}/7 periods have >=2 free teachers available`
  });

  const teacherWorkloads = fallbackDb.teachers.map(t => {
    const count = fallbackDb.timetable.filter(e => e.teacherId === t.id && e.day === targetDay).length;
    return { name: t.name, teaching: count, free: 7 - count };
  });

  const balanced = teacherWorkloads.every(w => w.teaching <= 5 && w.free >= 2);
  checks.push({
    title: "Balanced Daily Workload (~4 teaching / 3 free)",
    passed: balanced,
    details: teacherWorkloads.map(w => `${w.name}: ${w.teaching}T/${w.free}F`).join(", ")
  });

  const allPassed = checks.every(c => c.passed);

  return res.json({
    day: dayName,
    isValid: allPassed,
    checks,
    teacherWorkloads
  });
});

app.post("/api/timetable/batch", async (req, res) => {
  const { userRole, teacherId, day, entries } = req.body;

  if (userRole !== "coordinator" && userRole !== "principal") {
    return res.status(403).json({ error: "Unauthorized: Only Coordinators and Principals can edit the timetable." });
  }

  if (!Array.isArray(entries)) {
    return res.status(400).json({ error: "Invalid request payload: entries must be an array." });
  }

  const tempTimetable = [...fallbackDb.timetable];

  // Remove existing entries for this teacher and day
  if (teacherId && day) {
    for (let i = tempTimetable.length - 1; i >= 0; i--) {
      if (tempTimetable[i].teacherId === teacherId && tempTimetable[i].day === day) {
        tempTimetable.splice(i, 1);
      }
    }
  }

  // Add proposed entries
  entries.forEach((e: any) => {
    if (e.status === "Scheduled" || e.className) {
      tempTimetable.push({
        id: e.id || `tt-${e.teacherId}-${e.day}-P${e.period}`,
        teacherId: e.teacherId,
        teacherName: e.teacherName || fallbackDb.teachers.find(t => t.id === e.teacherId)?.name || "Teacher",
        subject: e.subject || "Subject",
        day: e.day,
        period: Number(e.period),
        startTime: periodTimes[Number(e.period) - 1]?.startTime || "08:30",
        endTime: periodTimes[Number(e.period) - 1]?.endTime || "09:15",
        className: e.className,
        section: e.section || "A",
        roomNumber: e.roomNumber || e.room || "Room 101",
        status: "Scheduled"
      });
    }
  });

  // Validate for double-booking conflicts
  const teacherMap = new Map<string, string>();
  const classMap = new Map<string, string>();

  for (const entry of tempTimetable) {
    if (entry.status === "Scheduled") {
      const teacherKey = `${entry.teacherId}-${entry.day}-${entry.period}`;
      if (teacherMap.has(teacherKey)) {
        const existingCls = teacherMap.get(teacherKey);
        return res.status(400).json({
          error: `Double-Booking Conflict: Teacher ${entry.teacherName} is assigned to multiple classes (${existingCls} and Class ${entry.className}) during Period ${entry.period} on ${entry.day}!`
        });
      }
      teacherMap.set(teacherKey, `Class ${entry.className}`);

      const classKey = `${entry.className}-${entry.section || 'A'}-${entry.day}-${entry.period}`;
      if (classMap.has(classKey)) {
        const existingTeacher = classMap.get(classKey);
        return res.status(400).json({
          error: `Class Conflict: Class ${entry.className}-${entry.section || 'A'} is assigned to multiple teachers (${existingTeacher} and ${entry.teacherName}) during Period ${entry.period} on ${entry.day}!`
        });
      }
      classMap.set(classKey, entry.teacherName);
    }
  }

  // Save changes
  fallbackDb.timetable = tempTimetable;
  saveDatabaseToDisk();

  if (isSupabaseConfigured) {
    try {
      await supabase.from('timetable').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (fallbackDb.timetable.length > 0) {
        await supabase.from('timetable').insert(fallbackDb.timetable);
      }
    } catch (e) {
      console.log("Supabase timetable sync error:", e);
    }
  }

  notifyRealtime("timetable");
  notifyRealtime("substitutions");

  return res.json({ success: true, message: "Timetable updated successfully.", timetable: fallbackDb.timetable });
});

app.post("/api/timetable", async (req, res) => {
  const newEntry = {
    id: crypto.randomUUID(),
    ...req.body
  };
  fallbackDb.timetable.push(newEntry);
  saveDatabaseToDisk();
  notifyRealtime("timetable");
  res.json(newEntry);
});

app.get("/api/attendance", async (req, res) => {
  const { date, teacherId } = req.query;
  let records = fallbackDb.attendance;
  if (date) {
    records = records.filter(r => r.date === date);
  }
  if (teacherId) {
    records = records.filter(r => r.teacherId === teacherId);
  }
  res.json(records);
});

app.post("/api/attendance", async (req, res) => {
  const { teacherId, date, status, checkInTime, checkOutTime, reason } = req.body;
  const existingIndex = fallbackDb.attendance.findIndex(a => a.teacherId === teacherId && a.date === date);
  if (existingIndex >= 0) {
    fallbackDb.attendance[existingIndex] = {
      ...fallbackDb.attendance[existingIndex],
      status: status || fallbackDb.attendance[existingIndex].status,
      checkInTime: checkInTime || fallbackDb.attendance[existingIndex].checkInTime,
      checkOutTime: checkOutTime || fallbackDb.attendance[existingIndex].checkOutTime,
      reason: reason || fallbackDb.attendance[existingIndex].reason
    };
    saveDatabaseToDisk();
    notifyRealtime("attendance");
    return res.json(fallbackDb.attendance[existingIndex]);
  }
  const teacher = fallbackDb.teachers.find(t => t.id === teacherId);
  const newRec = {
    id: `att-${teacherId}-${date || new Date().toISOString().split('T')[0]}`,
    teacherId,
    teacherName: teacher?.name || "Teacher",
    subject: teacher?.subject || "Subject",
    date: date || new Date().toISOString().split('T')[0],
    status: status || "Present",
    checkInTime: checkInTime || "08:30 AM",
    checkOutTime: checkOutTime || "03:00 PM",
    reason,
    approvalStatus: "Approved"
  };
  fallbackDb.attendance.push(newRec);
  saveDatabaseToDisk();
  notifyRealtime("attendance");
  res.json(newRec);
});

app.get("/api/notifications", async (req, res) => {
  const { role, userId } = req.query;
  let notifs = fallbackDb.notifications;
  if (role) {
    notifs = notifs.filter(n => n.role === role || n.role === "all" || n.userId === userId || n.userId === "all");
  }
  res.json(notifs);
});

app.post("/api/notifications", async (req, res) => {
  const newNotif = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    read: false,
    ...req.body
  };
  fallbackDb.notifications.unshift(newNotif);
  notifyRealtime("notifications");
  res.json(newNotif);
});

app.patch("/api/notifications/:id/read", async (req, res) => {
  const { id } = req.params;
  if (id === "all") {
    fallbackDb.notifications.forEach(n => { n.read = true; });
    notifyRealtime("notifications");
    return res.json({ success: true });
  }
  const notif = fallbackDb.notifications.find(n => n.id === id);
  if (notif) {
    notif.read = true;
    notifyRealtime("notifications");
    return res.json(notif);
  }
  res.status(404).json({ error: "Notification not found" });
});

app.get("/api/activity-logs", async (req, res) => {
  res.json(fallbackDb.activityLogs);
});

app.post("/api/activity-logs", async (req, res) => {
  const newLog = {
    id: crypto.randomUUID(),
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    ...req.body
  };
  fallbackDb.activityLogs.unshift(newLog);
  notifyRealtime("activity_logs");
  res.json(newLog);
});

app.get("/api/report-history", async (req, res) => {
  res.json(fallbackDb.reportHistory);
});

app.post("/api/report-history", async (req, res) => {
  const newRep = {
    id: crypto.randomUUID(),
    createdDate: new Date().toISOString(),
    ...req.body
  };
  fallbackDb.reportHistory.unshift(newRep);
  res.json(newRep);
});

app.delete("/api/report-history/:id", async (req, res) => {
  const { id } = req.params;
  const idx = fallbackDb.reportHistory.findIndex(r => r.id === id);
  if (idx !== -1) {
    fallbackDb.reportHistory.splice(idx, 1);
  }
  res.json({ success: true });
});

// Helper: Get deterministic conversation ID between two participants
function getConversationId(idA: string, idB: string) {
  if (idA === "all" || idB === "all") return "broadcast_all";
  const sorted = [idA, idB].sort();
  return `${sorted[0]}_${sorted[1]}`;
}

// Internal Staff Messaging Routes
app.get("/api/messages", async (req, res) => {
  const { userId, role } = req.query;
  const userStr = (userId as string) || "";
  const roleStr = (role as string) || "";

  if (!isSupabaseConfigured) {
    let msgs = fallbackDb.messages;
    if (userStr || roleStr) {
      msgs = msgs.filter(m => {
        const isSender = m.senderId === userStr || (roleStr === "principal" && m.senderRole === "principal") || (roleStr === "coordinator" && m.senderId === "t6");
        const isRecipient = m.recipientId === userStr || (roleStr === "principal" && m.recipientRole === "principal") || (roleStr === "coordinator" && (m.recipientId === "t6" || m.recipientRole === "coordinator")) || m.recipientId === "all";

        // Strict boundary: Teachers can only see messages sent by them or sent directly to them or broadcasts
        if (roleStr === "teacher") {
          return m.senderId === userStr || m.recipientId === userStr || m.recipientId === "all";
        }
        return isSender || isRecipient;
      });
    }
    return res.json(msgs);
  }

  try {
    const { data, error } = await supabase.from('messages').select('*').order('created_at', { ascending: true });
    if (error) throw error;
    if (data && data.length > 0) {
      const formatted = data.map(m => ({
        id: m.id,
        senderId: m.sender_id,
        senderName: m.sender_name,
        senderRole: m.sender_role,
        recipientId: m.recipient_id,
        recipientName: m.recipient_name,
        recipientRole: m.recipient_role,
        conversationId: m.conversation_id,
        messageText: m.message_text,
        createdAt: m.created_at,
        readAt: m.read_at,
        read: Boolean(m.read_at),
        relatedSubstitutionId: m.related_substitution_id,
        substitutionContext: m.substitution_context
      }));
      return res.json(formatted);
    }
    return res.json(fallbackDb.messages);
  } catch (error) {
    return res.json(fallbackDb.messages);
  }
});

app.post("/api/messages", async (req, res) => {
  const { senderId, senderName, senderRole, recipientId, recipientName, recipientRole, messageText, relatedSubstitutionId, substitutionContext } = req.body;

  if (!messageText || !messageText.trim()) {
    return res.status(400).json({ error: "Message text cannot be empty." });
  }

  // ABSOLUTE SECURITY CONSTRAINTS: Teachers CANNOT message other teachers
  if (senderRole === "teacher") {
    if (recipientRole === "teacher" && recipientId !== "t6" && recipientId !== "principal") {
      return res.status(403).json({ error: "Unauthorized: Teachers are strictly not permitted to send direct messages to other teachers." });
    }
  }

  const conversationId = getConversationId(senderId, recipientId);
  const nowIso = new Date().toISOString();

  const newMsg = {
    id: crypto.randomUUID(),
    senderId,
    senderName: senderName || "Staff Member",
    senderRole: senderRole || "teacher",
    recipientId,
    recipientName: recipientName || "Staff Member",
    recipientRole: recipientRole || "teacher",
    conversationId,
    messageText: messageText.trim(),
    createdAt: nowIso,
    readAt: null,
    read: false,
    relatedSubstitutionId: relatedSubstitutionId || null,
    substitutionContext: substitutionContext || null
  };

  if (!isSupabaseConfigured) {
    fallbackDb.messages.push(newMsg);
  } else {
    try {
      await supabase.from('messages').insert([{
        id: newMsg.id,
        sender_id: senderId,
        sender_name: newMsg.senderName,
        sender_role: senderRole,
        recipient_id: recipientId,
        recipient_name: newMsg.recipientName,
        recipient_role: recipientRole,
        conversation_id: conversationId,
        message_text: newMsg.messageText,
        created_at: nowIso,
        related_substitution_id: relatedSubstitutionId || null
      }]);
      fallbackDb.messages.push(newMsg);
    } catch (e) {
      fallbackDb.messages.push(newMsg);
    }
  }

  createNotification({
    title: `New Message from ${newMsg.senderName}`,
    message: newMsg.messageText.length > 60 ? `${newMsg.messageText.substring(0, 60)}...` : newMsg.messageText,
    category: "System",
    role: recipientRole === "all" ? "all" : recipientRole,
    userId: recipientId
  });

  notifyRealtime("messages", newMsg);
  return res.json(newMsg);
});

app.patch("/api/messages/read", async (req, res) => {
  const { conversationId, userId } = req.body;
  const nowIso = new Date().toISOString();

  fallbackDb.messages.forEach(m => {
    if ((!conversationId || m.conversationId === conversationId) && m.recipientId === userId) {
      m.read = true;
      m.readAt = nowIso;
    }
  });

  notifyRealtime("messages");
  return res.json({ success: true });
});

app.post("/api/ai/recommend-substitutes", async (req, res) => {
  const { leaveRequestId, period, date: reqDate } = req.body;
  
  const request = fallbackDb.leaveRequests.find(r => r.id === leaveRequestId);
  if (!request) {
    return res.status(404).json({ error: "Leave request not found" });
  }

  const date = reqDate || request.startDate || new Date().toISOString().split('T')[0];
  const dayName = getDayOfWeekName(date);
  const periodNum = parseInt(period) || 1;
  const absentTeacher = fallbackDb.teachers.find(t => t.id === request.teacherId);

  // Get exact availability for this period
  const periodAvailability = getAvailableTeachersForPeriod(date, dayName, periodNum, request.teacherId);
  const availableTeachers = periodAvailability.filter(a => a.isAvailable);

  if (availableTeachers.length === 0) {
    return res.json([]);
  }

  try {
    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY || "",
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
    });

    const prompt = `
    You are an AI assistant for a school staff portal timetable engine.
    Teacher ${absentTeacher?.name} (${absentTeacher?.subject}) is absent on ${date}.
    We need a substitute teacher for Period ${periodNum}.
    
    Truly FREE available teachers for Period ${periodNum}:
    ${availableTeachers.map(t => `- ID: ${t.teacherId}, Name: ${t.name} (${t.subject}, Today's sub workload: ${t.substitutionsCountToday})`).join('\n')}
    
    Recommend suitable substitute teachers from the available free list for Period ${periodNum}. 
    Prefer teachers with matching subjects or lower substitution workloads.
    For each recommended teacher, return:
    - teacherId
    - teacherName
    - period: ${periodNum}
    - compatibilityScore (a number out of 100)
    - scoreBreakdown: object with subjectMatch, availability, currentWorkload, weeklyLoad, monthlyLoad, acceptanceHistory
    - reason (explanation)

    Return ONLY a valid JSON array of objects without markdown formatting.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });
    
    const text = response.text || "[]";
    const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const recommendations = JSON.parse(cleanedText);
    
    res.json(recommendations);
  } catch (error) {
    // Fallback scoring for free available teachers
    const fallbackRecs = availableTeachers.map((t, idx) => {
      const isSameSubject = t.subject === absentTeacher?.subject;
      const total = isSameSubject ? 95 - (idx * 5) : 85 - (idx * 5);
      return {
        teacherId: t.teacherId,
        teacherName: t.name,
        period: periodNum,
        compatibilityScore: total,
        scoreBreakdown: {
          subjectMatch: isSameSubject ? 40 : 25,
          availability: 25,
          currentWorkload: Math.max(0, 15 - t.substitutionsCountToday * 5),
          weeklyLoad: 10,
          monthlyLoad: 5,
          acceptanceHistory: 5
        },
        reason: isSameSubject 
          ? `Specializes in ${t.subject} and is completely free during Period ${periodNum}.` 
          : `Free during Period ${periodNum} with low substitution workload.`
      };
    });
    res.json(fallbackRecs);
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}
startServer();
