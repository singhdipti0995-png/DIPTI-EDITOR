import type { TimetableState } from '../types/timetable';

const DB_NAME = 'MySmartTimetableDB';
const DB_VERSION = 2;
const STORE_NAME = 'app_state';
const STATE_KEY = 'hnbgu_ece_state_v2';
const LS_FALLBACK_KEY = 'my_smart_timetable_hnbgu_v2';

/**
 * Clean editable default timetable for HNBGU B.Tech ECE (First Year).
 * Contains zero fictional demo names, zero overlapping classes, and empty
 * trackers ready for the student's actual schedule and tasks.
 */
export function createCleanDefaultState(): TimetableState {
  return {
    subjects: [
      {
        id: 'ece-mon-1',
        subjectName: 'Engineering Mathematics I',
        day: 'Mon',
        startTime: '09:00',
        endTime: '10:00',
        teacher: 'Faculty (Edit)',
        classroom: 'First Year Block',
        colorKey: 'purple',
      },
      {
        id: 'ece-mon-2',
        subjectName: 'Basic Electronics Engineering',
        day: 'Mon',
        startTime: '10:00',
        endTime: '11:00',
        teacher: 'ECE Faculty (Edit)',
        classroom: 'ECE Dept.',
        colorKey: 'navy',
      },
      {
        id: 'ece-tue-1',
        subjectName: 'Engineering Physics',
        day: 'Tue',
        startTime: '09:00',
        endTime: '10:00',
        teacher: 'Faculty (Edit)',
        classroom: 'Physics Lecture Hall',
        colorKey: 'indigo',
      },
      {
        id: 'ece-tue-2',
        subjectName: 'Programming for Problem Solving',
        day: 'Tue',
        startTime: '11:00',
        endTime: '12:00',
        teacher: 'Faculty (Edit)',
        classroom: 'Computer Lab',
        colorKey: 'cyan',
      },
      {
        id: 'ece-wed-1',
        subjectName: 'Basic Electrical Engineering',
        day: 'Wed',
        startTime: '09:00',
        endTime: '10:00',
        teacher: 'Faculty (Edit)',
        classroom: 'First Year Block',
        colorKey: 'emerald',
      },
      {
        id: 'ece-thu-1',
        subjectName: 'Basic Electronics Lab',
        day: 'Thu',
        startTime: '14:00',
        endTime: '16:00',
        teacher: 'ECE Faculty (Edit)',
        classroom: 'ECE Lab',
        colorKey: 'violet',
      },
      {
        id: 'ece-fri-1',
        subjectName: 'Engineering Graphics & Design',
        day: 'Fri',
        startTime: '10:00',
        endTime: '12:00',
        teacher: 'Faculty (Edit)',
        classroom: 'Drawing Hall',
        colorKey: 'amber',
      },
    ],
    tasks: [],
    sessions: [],
    exams: [],
    assignments: [],
    notes: [],
    settings: {
      studentName: 'B.Tech ECE Student',
      collegeProfile: {
        university: 'HNBGU',
        course: 'B.Tech',
        branch: 'Electronics and Communication Engineering (ECE)',
        academicYear: 'First Year',
      },
      dailyStudyGoalHours: 3,
      classRemindersEnabled: true,
      studyRemindersEnabled: true,
      reminderLeadMinutes: 15,
      studyReminderTime: '18:30',
    },
  };
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
  });
}

function sanitizeLoadedState(candidate: TimetableState): TimetableState {
  const defaults = createCleanDefaultState();
  return {
    subjects: Array.isArray(candidate.subjects) ? candidate.subjects : defaults.subjects,
    tasks: Array.isArray(candidate.tasks) ? candidate.tasks : [],
    sessions: Array.isArray(candidate.sessions) ? candidate.sessions : [],
    exams: Array.isArray(candidate.exams) ? candidate.exams : [],
    assignments: Array.isArray(candidate.assignments) ? candidate.assignments : [],
    notes: Array.isArray(candidate.notes) ? candidate.notes : [],
    settings: {
      ...defaults.settings,
      ...(candidate.settings ?? {}),
      collegeProfile: {
        ...defaults.settings.collegeProfile,
        ...(candidate.settings?.collegeProfile ?? {}),
      },
    },
  };
}

export async function loadOfflineState(): Promise<TimetableState> {
  try {
    const db = await openDatabase();
    const stored = await new Promise<TimetableState | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(STATE_KEY);
      req.onsuccess = () => resolve(req.result as TimetableState | undefined);
      req.onerror = () => reject(req.error);
    });
    if (stored && Array.isArray(stored.subjects)) {
      return sanitizeLoadedState(stored);
    }
  } catch {
    // Fallback to localStorage below
  }

  try {
    const raw = window.localStorage.getItem(LS_FALLBACK_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as TimetableState;
      if (parsed && Array.isArray(parsed.subjects)) {
        return sanitizeLoadedState(parsed);
      }
    }
  } catch {
    // Ignore parse error
  }

  const cleanDefault = createCleanDefaultState();
  await saveOfflineState(cleanDefault);
  return cleanDefault;
}

export async function saveOfflineState(state: TimetableState): Promise<void> {
  try {
    window.localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors
  }

  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(state, STATE_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Fallback already persisted to localStorage
  }
}
