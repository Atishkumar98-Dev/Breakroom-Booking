import { useState, useEffect, useCallback } from "react";
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  Timestamp,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "../lib/firebase";
import {
  X,
  Clock,
  Calendar,
  User,
  Trash2,
  Plus,
  Circle,
  ChevronDown,
  AlertCircle,
  Phone,
  Mail,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import {
  format,
  addMinutes,
  parseISO,
  isToday,
  isFuture,
  startOfDay,
} from "date-fns";
import { Toaster, toast } from "sonner";

type StationType = "pool" | "ps5";

interface Station {
  id: string;
  name: string;
  type: StationType;
  icon: React.ReactNode;
  color: string;
}

interface Booking {
  id: string;
  stationId: string;
  playerName: string;
  phone: string;
  email: string;
  date: string;
  startTime: string;
  endTime: string;
  duration: number;
  createdAt: number;
}

const STATIONS: Station[] = [
  {
    id: "pool-1",
    name: "Pool Table 1",
    type: "pool",
    icon: "🎱",
    color: "#7c3aed",
  },
  {
    id: "pool-2",
    name: "Pool Table 2",
    type: "pool",
    icon: "🎱",
    color: "#9333ea",
  },
  {
    id: "ps5-1",
    name: "PS5 Station 1",
    type: "ps5",
    icon: "🎮",
    color: "#05d9a0",
  },
  {
    id: "ps5-2",
    name: "PS5 Station 2",
    type: "ps5",
    icon: "🎮",
    color: "#06b6d4",
  },
];

const TIME_SLOTS = Array.from({ length: 28 }, (_, i) => {
  const hour = Math.floor(i / 2) + 9;
  const min = i % 2 === 0 ? "00" : "30";
  return `${String(hour).padStart(2, "0")}:${min}`;
});

const DURATIONS = [
  { label: "30 min", value: 30 },
  { label: "1 hour", value: 60 },
  { label: "1.5 hours", value: 90 },
  { label: "2 hours", value: 120 },
  { label: "3 hours", value: 180 },
];

function toMinutes(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function fromMinutes(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function formatTime(time: string) {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

let mockBookings: Booking[] = [];
let mockListeners: Array<(bookings: Booking[]) => void> = [];

function mockSubscribe(cb: (bookings: Booking[]) => void) {
  mockListeners.push(cb);
  cb([...mockBookings]);
  return () => {
    mockListeners = mockListeners.filter((l) => l !== cb);
  };
}

function mockAdd(booking: Omit<Booking, "id">) {
  const newBooking = { ...booking, id: `mock-${Date.now()}` };
  mockBookings = [...mockBookings, newBooking];
  mockListeners.forEach((l) => l([...mockBookings]));
  return newBooking.id;
}

function mockDelete(id: string) {
  mockBookings = mockBookings.filter((b) => b.id !== id);
  mockListeners.forEach((l) => l([...mockBookings]));
}

export default function App() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [selectedStation, setSelectedStation] =
    useState<Station | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [viewDate, setViewDate] = useState(
    format(new Date(), "yyyy-MM-dd"),
  );
  const [form, setForm] = useState({
    playerName: "",
    phone: "",
    email: "",
    date: format(new Date(), "yyyy-MM-dd"),
    startTime: "10:00",
    duration: 60,
  });
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "book" | "schedule"
  >("book");
  const [showSetup, setShowSetup] = useState(
    !isFirebaseConfigured,
  );

  useEffect(() => {
    if (isFirebaseConfigured && db) {
      const q = query(collection(db, "bookings"));
      const unsub = onSnapshot(q, (snap) => {
        const data = snap.docs.map(
          (d) => ({ id: d.id, ...d.data() }) as Booking,
        );
        setBookings(data);
      });
      return unsub;
    } else {
      return mockSubscribe(setBookings);
    }
  }, []);

  const getStationBookings = useCallback(
    (stationId: string, date: string) =>
      bookings
        .filter(
          (b) => b.stationId === stationId && b.date === date,
        )
        .sort(
          (a, b) =>
            toMinutes(a.startTime) - toMinutes(b.startTime),
        ),
    [bookings],
  );

  const isSlotTaken = useCallback(
    (
      stationId: string,
      date: string,
      startTime: string,
      duration: number,
      excludeId?: string,
    ) => {
      const newStart = toMinutes(startTime);
      const newEnd = newStart + duration;
      return getStationBookings(stationId, date)
        .filter((b) => b.id !== excludeId)
        .some((b) => {
          const bStart = toMinutes(b.startTime);
          const bEnd = toMinutes(b.endTime);
          return newStart < bEnd && newEnd > bStart;
        });
    },
    [getStationBookings],
  );

  const isStationAvailableNow = useCallback(
    (stationId: string) => {
      const today = format(new Date(), "yyyy-MM-dd");
      const now = format(new Date(), "HH:mm");
      return !getStationBookings(stationId, today).some(
        (b) => b.startTime <= now && b.endTime > now,
      );
    },
    [getStationBookings],
  );

  const openBooking = (station: Station) => {
    setSelectedStation(station);
    setForm({
      playerName: "",
      phone: "",
      email: "",
      date: format(new Date(), "yyyy-MM-dd"),
      startTime: format(
        new Date(
          Math.ceil(new Date().getTime() / (30 * 60000)) *
            30 *
            60000,
        ),
        "HH:mm",
      ),
      duration: 60,
    });
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!selectedStation) return;
    if (!form.playerName.trim()) {
      toast.error("Please enter your name");
      return;
    }
    if (!form.phone.trim()) {
      toast.error("Please enter your phone number");
      return;
    }
    if (
      !form.email.trim() ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)
    ) {
      toast.error("Please enter a valid email address");
      return;
    }

    const endTime = fromMinutes(
      toMinutes(form.startTime) + form.duration,
    );

    if (
      isSlotTaken(
        selectedStation.id,
        form.date,
        form.startTime,
        form.duration,
      )
    ) {
      toast.error(
        "This time slot is already booked. Please choose another.",
      );
      return;
    }

    setSubmitting(true);
    try {
      const booking: Omit<Booking, "id"> = {
        stationId: selectedStation.id,
        playerName: form.playerName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        date: form.date,
        startTime: form.startTime,
        endTime,
        duration: form.duration,
        createdAt: Date.now(),
      };

      if (isFirebaseConfigured && db) {
        await addDoc(collection(db, "bookings"), {
          ...booking,
          createdAt: Timestamp.now(),
        });
      } else {
        mockAdd(booking);
      }

      toast.success(
        `Booking confirmed! A confirmation has been sent to ${form.email}`,
        {
          description: `${selectedStation.name} · ${formatTime(form.startTime)} – ${formatTime(endTime)} · ${form.playerName}`,
          duration: 6000,
        },
      );
      setShowModal(false);
    } catch (e) {
      toast.error(
        "Failed to create booking. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (bookingId: string) => {
    try {
      if (isFirebaseConfigured && db) {
        await deleteDoc(doc(db, "bookings", bookingId));
      } else {
        mockDelete(bookingId);
      }
      toast.success("Booking cancelled.");
    } catch {
      toast.error("Failed to cancel booking.");
    }
  };

  const endTime = fromMinutes(
    toMinutes(form.startTime) + form.duration,
  );
  const hasConflict = selectedStation
    ? isSlotTaken(
        selectedStation.id,
        form.date,
        form.startTime,
        form.duration,
      )
    : false;

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const viewBookings = bookings.filter(
    (b) => b.date === viewDate,
  );

  return (
    <div className="min-h-screen bg-background text-foreground font-['Outfit',sans-serif]">
      <Toaster
        theme="dark"
        toastOptions={{
          style: {
            background: "#1a1a2e",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "#eeeef5",
          },
        }}
      />

      {/* Setup Banner */}
      {showSetup && (
        <div className="bg-amber-950/60 border-b border-amber-500/30 px-4 py-3">
          <div className="max-w-6xl mx-auto flex items-start gap-3">
            <AlertCircle
              className="text-amber-400 shrink-0 mt-0.5"
              size={16}
            />
            <div className="flex-1 min-w-0">
              <p className="text-amber-200 text-sm font-medium">
                Firebase not configured — running in demo mode
              </p>
              <p className="text-amber-400/70 text-xs mt-1">
                Add these to your{" "}
                <code className="bg-amber-900/40 px-1 rounded">
                  .env
                </code>{" "}
                file to enable real-time sync:
                <code className="ml-1 bg-amber-900/40 px-1 rounded">
                  VITE_FIREBASE_API_KEY
                </code>
                ,{" "}
                <code className="bg-amber-900/40 px-1 rounded">
                  VITE_FIREBASE_AUTH_DOMAIN
                </code>
                ,{" "}
                <code className="bg-amber-900/40 px-1 rounded">
                  VITE_FIREBASE_PROJECT_ID
                </code>
                ,{" "}
                <code className="bg-amber-900/40 px-1 rounded">
                  VITE_FIREBASE_STORAGE_BUCKET
                </code>
                ,{" "}
                <code className="bg-amber-900/40 px-1 rounded">
                  VITE_FIREBASE_MESSAGING_SENDER_ID
                </code>
                ,{" "}
                <code className="bg-amber-900/40 px-1 rounded">
                  VITE_FIREBASE_APP_ID
                </code>
              </p>
            </div>
            <button
              onClick={() => setShowSetup(false)}
              className="text-amber-400/60 hover:text-amber-300 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center text-lg">
              🎮
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight leading-none">
                BreakRoom
              </h1>
              <p className="text-xs text-muted-foreground font-['JetBrains_Mono',monospace] mt-0.5">
                {format(new Date(), "EEE, MMM d")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("book")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === "book"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
            >
              Stations
            </button>
            <button
              onClick={() => setActiveTab("schedule")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === "schedule"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
            >
              Schedule
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <AnimatePresence mode="wait">
          {activeTab === "book" ? (
            <motion.div
              key="book"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2 }}
            >
              <div className="mb-8">
                <h2 className="text-2xl font-bold mb-1">
                  Available Stations
                </h2>
                <p className="text-muted-foreground text-sm">
                  Select a station to make a booking
                </p>
              </div>

              {/* Pool Tables */}
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-lg">🎱</span>
                  <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                    Pool Tables
                  </h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {STATIONS.filter(
                    (s) => s.type === "pool",
                  ).map((station) => (
                    <StationCard
                      key={station.id}
                      station={station}
                      bookings={getStationBookings(
                        station.id,
                        todayStr,
                      )}
                      isAvailable={isStationAvailableNow(
                        station.id,
                      )}
                      onBook={() => openBooking(station)}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              </div>

              {/* PS5 Stations */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-lg">🎮</span>
                  <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                    PS5 Stations
                  </h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {STATIONS.filter((s) => s.type === "ps5").map(
                    (station) => (
                      <StationCard
                        key={station.id}
                        station={station}
                        bookings={getStationBookings(
                          station.id,
                          todayStr,
                        )}
                        isAvailable={isStationAvailableNow(
                          station.id,
                        )}
                        onBook={() => openBooking(station)}
                        onDelete={handleDelete}
                      />
                    ),
                  )}
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="schedule"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2 }}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                <div>
                  <h2 className="text-2xl font-bold mb-1">
                    Schedule
                  </h2>
                  <p className="text-muted-foreground text-sm">
                    All bookings for the selected date
                  </p>
                </div>
                <div className="relative">
                  <Calendar
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                  />
                  <input
                    type="date"
                    value={viewDate}
                    onChange={(e) =>
                      setViewDate(e.target.value)
                    }
                    className="bg-card border border-border rounded-lg pl-9 pr-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary transition-colors"
                  />
                </div>
              </div>

              {viewBookings.length === 0 ? (
                <div className="text-center py-20 text-muted-foreground">
                  <div className="text-4xl mb-3">📅</div>
                  <p className="font-medium">
                    No bookings for{" "}
                    {format(parseISO(viewDate), "MMMM d, yyyy")}
                  </p>
                  <p className="text-sm mt-1">
                    Switch to Stations tab to make a booking
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {STATIONS.map((station) => {
                    const stationBookings = viewBookings
                      .filter((b) => b.stationId === station.id)
                      .sort(
                        (a, b) =>
                          toMinutes(a.startTime) -
                          toMinutes(b.startTime),
                      );
                    if (stationBookings.length === 0)
                      return null;
                    return (
                      <div
                        key={station.id}
                        className="bg-card border border-border rounded-xl overflow-hidden"
                      >
                        <div className="px-5 py-3 border-b border-border flex items-center gap-2">
                          <span>{station.icon as string}</span>
                          <span className="font-semibold text-sm">
                            {station.name}
                          </span>
                          <span className="ml-auto text-xs text-muted-foreground font-['JetBrains_Mono',monospace]">
                            {stationBookings.length} booking
                            {stationBookings.length !== 1
                              ? "s"
                              : ""}
                          </span>
                        </div>
                        <div className="divide-y divide-border">
                          {stationBookings.map((b) => (
                            <div
                              key={b.id}
                              className="px-5 py-3 flex items-start gap-4"
                            >
                              <div className="text-xs font-['JetBrains_Mono',monospace] text-accent whitespace-nowrap pt-0.5">
                                {formatTime(b.startTime)} –{" "}
                                {formatTime(b.endTime)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <User
                                    size={13}
                                    className="text-muted-foreground shrink-0"
                                  />
                                  <span className="text-sm font-medium truncate">
                                    {b.playerName}
                                  </span>
                                </div>
                                <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                                  {b.phone && (
                                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                      <Phone size={11} />
                                      <span>{b.phone}</span>
                                    </div>
                                  )}
                                  {b.email && (
                                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                      <Mail size={11} />
                                      <span className="truncate">
                                        {b.email}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="text-xs text-muted-foreground whitespace-nowrap pt-0.5">
                                {b.duration >= 60
                                  ? `${b.duration / 60}h`
                                  : `${b.duration}m`}
                              </div>
                              <button
                                onClick={() =>
                                  handleDelete(b.id)
                                }
                                className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded-lg hover:bg-destructive/10 mt-0.5"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Booking Modal */}
      <AnimatePresence>
        {showModal && selectedStation && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={(e) =>
              e.target === e.currentTarget &&
              setShowModal(false)
            }
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{
                type: "spring",
                damping: 25,
                stiffness: 300,
              }}
              className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
            >
              {/* Modal Header */}
              <div className="px-6 py-5 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-lg"
                    style={{
                      background: `${selectedStation.color}22`,
                    }}
                  >
                    {selectedStation.icon as string}
                  </div>
                  <div>
                    <h3 className="font-bold">
                      {selectedStation.name}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      New Booking
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="px-6 py-5 space-y-5">
                {/* Name */}
                <div>
                  <label className="block text-sm font-semibold mb-2">
                    Your Name
                  </label>
                  <div className="relative">
                    <User
                      size={15}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                    />
                    <input
                      type="text"
                      value={form.playerName}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          playerName: e.target.value,
                        }))
                      }
                      placeholder="Enter your name"
                      className="w-full bg-input-background border border-border rounded-xl pl-10 pr-4 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
                    />
                  </div>
                </div>

                {/* Phone + Email */}
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-sm font-semibold mb-2">
                      Phone Number
                    </label>
                    <div className="relative">
                      <Phone
                        size={15}
                        className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                      />
                      <input
                        type="tel"
                        value={form.phone}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            phone: e.target.value,
                          }))
                        }
                        placeholder="+1 (555) 000-0000"
                        className="w-full bg-input-background border border-border rounded-xl pl-10 pr-4 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-2">
                      Email Address
                    </label>
                    <div className="relative">
                      <Mail
                        size={15}
                        className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                      />
                      <input
                        type="email"
                        value={form.email}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            email: e.target.value,
                          }))
                        }
                        placeholder="you@example.com"
                        className="w-full bg-input-background border border-border rounded-xl pl-10 pr-4 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5 pl-1">
                      Booking confirmation will be sent here
                    </p>
                  </div>
                </div>

                {/* Date */}
                <div>
                  <label className="block text-sm font-semibold mb-2">
                    Date
                  </label>
                  <div className="relative">
                    <Calendar
                      size={15}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                    />
                    <input
                      type="date"
                      value={form.date}
                      min={format(new Date(), "yyyy-MM-dd")}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          date: e.target.value,
                        }))
                      }
                      className="w-full bg-input-background border border-border rounded-xl pl-10 pr-4 py-3 text-sm text-foreground focus:outline-none focus:border-primary transition-colors"
                    />
                  </div>
                </div>

                {/* Time + Duration */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-semibold mb-2">
                      Start Time
                    </label>
                    <div className="relative">
                      <Clock
                        size={15}
                        className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none z-10"
                      />
                      <select
                        value={form.startTime}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            startTime: e.target.value,
                          }))
                        }
                        className="w-full bg-input-background border border-border rounded-xl pl-10 pr-8 py-3 text-sm text-foreground focus:outline-none focus:border-primary transition-colors appearance-none"
                      >
                        {TIME_SLOTS.map((t) => (
                          <option key={t} value={t}>
                            {formatTime(t)}
                          </option>
                        ))}
                      </select>
                      <ChevronDown
                        size={13}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-2">
                      Duration
                    </label>
                    <div className="relative">
                      <select
                        value={form.duration}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            duration: Number(e.target.value),
                          }))
                        }
                        className="w-full bg-input-background border border-border rounded-xl pl-4 pr-8 py-3 text-sm text-foreground focus:outline-none focus:border-primary transition-colors appearance-none"
                      >
                        {DURATIONS.map((d) => (
                          <option key={d.value} value={d.value}>
                            {d.label}
                          </option>
                        ))}
                      </select>
                      <ChevronDown
                        size={13}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Time Summary */}
                <div
                  className={`rounded-xl px-4 py-3 text-sm flex items-center gap-2 transition-colors ${
                    hasConflict
                      ? "bg-destructive/10 border border-destructive/30 text-destructive"
                      : "bg-accent/10 border border-accent/20 text-accent"
                  }`}
                >
                  {hasConflict ? (
                    <>
                      <AlertCircle size={15} />
                      <span>
                        Time conflict — this slot is already
                        booked
                      </span>
                    </>
                  ) : (
                    <>
                      <Clock size={15} />
                      <span>
                        {formatTime(form.startTime)} →{" "}
                        {formatTime(endTime)}
                        <span className="opacity-60 ml-2">
                          (
                          {form.duration >= 60
                            ? `${form.duration / 60}h`
                            : `${form.duration}m`}
                          )
                        </span>
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="px-6 pb-6 flex gap-3">
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-3 rounded-xl border border-border text-sm font-semibold hover:bg-secondary transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={
                    submitting ||
                    hasConflict ||
                    !form.playerName.trim() ||
                    !form.phone.trim() ||
                    !form.email.trim()
                  }
                  className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <Plus size={15} />
                      Confirm Booking
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StationCard({
  station,
  bookings,
  isAvailable,
  onBook,
  onDelete,
}: {
  station: Station;
  bookings: Booking[];
  isAvailable: boolean;
  onBook: () => void;
  onDelete: (id: string) => void;
}) {
  const now = format(new Date(), "HH:mm");
  const currentBooking = bookings.find(
    (b) => b.startTime <= now && b.endTime > now,
  );
  const upcomingBookings = bookings.filter(
    (b) => b.startTime > now,
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-border rounded-2xl overflow-hidden hover:border-white/15 transition-colors group"
    >
      {/* Card Header */}
      <div className="px-5 pt-5 pb-4 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0"
            style={{
              background: `${station.color}1a`,
              border: `1px solid ${station.color}30`,
            }}
          >
            {station.icon as string}
          </div>
          <div>
            <h4 className="font-bold text-base leading-tight">
              {station.name}
            </h4>
            <div className="flex items-center gap-1.5 mt-1">
              <Circle
                size={7}
                className={
                  isAvailable
                    ? "text-accent fill-accent"
                    : "text-rose-400 fill-rose-400"
                }
              />
              <span
                className={`text-xs font-medium ${isAvailable ? "text-accent" : "text-rose-400"}`}
              >
                {isAvailable ? "Available now" : "In use"}
              </span>
            </div>
          </div>
        </div>
        <button
          onClick={onBook}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all text-primary-foreground hover:opacity-90 active:scale-[0.97]"
          style={{ background: station.color }}
        >
          <Plus size={13} />
          Book
        </button>
      </div>

      {/* Current Booking */}
      {currentBooking && (
        <div className="mx-5 mb-3 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
          <p className="text-xs font-semibold text-rose-300 mb-1">
            Currently booked
          </p>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <User size={12} className="text-rose-400/70" />
              <span className="text-sm text-rose-200">
                {currentBooking.playerName}
              </span>
            </div>
            <span className="text-xs font-['JetBrains_Mono',monospace] text-rose-400/70">
              until {formatTime(currentBooking.endTime)}
            </span>
          </div>
        </div>
      )}

      {/* Today's Bookings */}
      {bookings.length > 0 ? (
        <div className="border-t border-border">
          <div className="px-5 py-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">
              Today — {bookings.length} booking
              {bookings.length !== 1 ? "s" : ""}
            </p>
            <div className="space-y-1.5">
              {bookings.slice(0, 3).map((b) => {
                const isPast = b.endTime <= now;
                const isCurrent =
                  b.startTime <= now && b.endTime > now;
                return (
                  <div
                    key={b.id}
                    className={`flex items-center gap-2 text-xs py-1.5 px-2.5 rounded-lg transition-all group/item ${
                      isCurrent
                        ? "bg-rose-500/10"
                        : isPast
                          ? "opacity-40"
                          : "hover:bg-secondary"
                    }`}
                  >
                    <span
                      className="font-['JetBrains_Mono',monospace] whitespace-nowrap"
                      style={{
                        color: isCurrent
                          ? "#f87171"
                          : station.color,
                      }}
                    >
                      {formatTime(b.startTime)}
                    </span>
                    <span className="text-foreground/80 truncate flex-1">
                      {b.playerName}
                    </span>
                    <span className="text-muted-foreground shrink-0">
                      {b.duration >= 60
                        ? `${b.duration / 60}h`
                        : `${b.duration}m`}
                    </span>
                    <button
                      onClick={() => onDelete(b.id)}
                      className="text-muted-foreground opacity-0 group-hover/item:opacity-100 hover:text-destructive transition-all"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                );
              })}
              {bookings.length > 3 && (
                <p className="text-xs text-muted-foreground px-2.5 py-1">
                  +{bookings.length - 3} more booking
                  {bookings.length - 3 !== 1 ? "s" : ""}
                </p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="border-t border-border px-5 py-4 text-xs text-muted-foreground">
          No bookings today
        </div>
      )}
    </motion.div>
  );
}