import React from 'react';
import { HomeCard } from '@/components/HomeCard';
import { motion } from 'framer-motion';
import { Layout } from '@/components/Layout';
import { useCustomData } from '@/contexts/CustomDataContext';
import { useAttendance } from '@/contexts/AttendanceContext';
import { useLocation } from 'wouter';
import { cn } from '@/lib/utils';

// Day abbreviations matching what AddNew uses in the day-picker
const DAY_ABBRS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function Home() {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const todayAbbr = DAY_ABBRS[dayOfWeek];

  const { getCurrentCustomWard, customSubjects, subjectMode, presetTimetable, getCurrentPresetWard } = useCustomData();
  const { subjects, wards } = useAttendance();
  const [, setLocation] = useLocation();

  // Custom ward takes priority over built-in schedule
  const customWard = getCurrentCustomWard();
  const presetWardObj = subjectMode === 'preloaded' ? getCurrentPresetWard(today) : null;
  const currentWard = customWard ? customWard.name : (presetWardObj ? presetWardObj.ward : null);
  const isWardHoliday = currentWard === 'Holiday';

  // Custom subjects scheduled for today (match against day abbreviation and map specific times)
  const todayCustomSubjects = customSubjects.flatMap(s => {
    if (s.schedules && s.schedules.length > 0) {
      const daySchedules = s.schedules.filter(sch => sch.day === todayAbbr);
      return daySchedules.map(sch => ({
        id: `${s.id}-${sch.day}-${sch.time}`,
        name: s.name,
        time: sch.time,
      }));
    }
    if (s.days) {
      const assigned = s.days.split(',').map(d => d.trim());
      if (assigned.includes(todayAbbr)) {
        return [{
          id: s.id,
          name: s.name,
          time: s.time || 'Time not set',
        }];
      }
    }
    return [];
  });

  // Built-in timetable — only shown in preloaded mode
  const schedule = subjectMode === 'preloaded' ? (presetTimetable[dayOfWeek] || []) : [];

  const hasAnything = schedule.length > 0 || todayCustomSubjects.length > 0 || (currentWard && !isWardHoliday);

  return (
    <Layout>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6 pb-8"
      >
        <div className="flex flex-col gap-1">
          <p className="text-2xl font-bold text-foreground">
            {today.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
          </p>
        </div>

        <hr className="border-t border-border/60" />

        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            Today's Schedule & Classes
          </h2>
        </div>

        {!hasAnything ? (
          <div className="flex flex-col items-center justify-center py-24 text-center space-y-4 min-h-[50vh]">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5, type: 'spring' }}
              className="space-y-4 flex flex-col items-center"
            >
              <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center text-5xl mb-2 shadow-[0_0_30px_rgba(16,185,129,0.1)]">
                🌴
              </div>
              <h3 className="text-4xl font-extrabold tracking-tight text-white">
                Holiday
              </h3>
              {subjectMode === 'custom' && customSubjects.length === 0 ? (
                <p className="text-muted-foreground text-sm max-w-xs leading-relaxed">
                  No subjects added yet.{' '}
                  <button
                    onClick={() => setLocation('/add-new')}
                    className="text-primary font-semibold underline-offset-2 hover:underline"
                  >
                    Add subjects
                  </button>{' '}
                  from the Add New tab to get started.
                </p>
              ) : (
                <p className="text-muted-foreground text-sm max-w-xs leading-relaxed">
                  Enjoy your rest day! No lectures or clinical ward postings are scheduled for today.
                </p>
              )}
            </motion.div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* ── Built-in timetable (preloaded mode only) ── */}
            {schedule.map((slot, idx) => {
              if (slot.type === 'integrated') {
                return slot.subjects.map((subject, subIdx) => (
                  <HomeCard
                    key={`${idx}-${subIdx}`}
                    subject={subject}
                    time={slot.time}
                    sessionId={String(idx)}
                  />
                ));
              }

              if (slot.type === 'ward' || slot.type === 'ward_replacement') {
                const effectiveTime = slot.type === 'ward_replacement'
                  ? (presetWardObj?.eveningTime || slot.time)
                  : (presetWardObj?.morningTime || slot.time);

                if (isWardHoliday || !currentWard) {
                  return (
                    <div key={idx} className="bg-card rounded-2xl p-5 border border-border">
                      <h3 className="text-lg font-semibold text-foreground">
                        Clinical Rotation: {isWardHoliday ? 'Holiday' : 'Not scheduled'}
                      </h3>
                      <p className="text-muted-foreground text-sm mt-1">{effectiveTime}</p>
                    </div>
                  );
                }
                const title = slot.type === 'ward_replacement'
                  ? `Clinical Rotation (Replacement): ${currentWard}`
                  : `Clinical Rotation: ${currentWard}`;
                return (
                  <HomeCard
                    key={idx}
                    title={title}
                    subject={currentWard}
                    time={effectiveTime}
                    isWard={true}
                    sessionId={String(idx)}
                  />
                );
              }

              return slot.subjects.map((subject, subIdx) => (
                <HomeCard
                  key={`${idx}-${subIdx}`}
                  subject={subject}
                  time={slot.time}
                  sessionId={String(idx)}
                />
              ));
            })}

            {/* ── Custom-mode ward (when no built-in timetable) ── */}
            {subjectMode === 'custom' && currentWard && !isWardHoliday && (
              <>
                <HomeCard
                  title={`Clinical Rotation (Morning): ${currentWard}`}
                  subject={currentWard}
                  time={customWard?.morningTime || "Morning Ward"}
                  isWard={true}
                  sessionId="custom-ward-am"
                />
                <HomeCard
                  title={`Clinical Rotation (Evening): ${currentWard}`}
                  subject={currentWard}
                  time={customWard?.eveningTime || "Evening Ward"}
                  isWard={true}
                  sessionId="custom-ward-pm"
                />
              </>
            )}

            {/* ── Custom subjects for today ── */}
            {todayCustomSubjects.map(s => (
              <HomeCard
                key={s.id}
                subject={s.name}
                time={s.time || 'Time not set'}
                sessionId={`custom-${s.id}`}
              />
            ))}
          </div>
        )}
      </motion.div>
    </Layout>
  );
}
