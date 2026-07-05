import React from 'react';
import { TIMETABLE, getCurrentWard } from '@/lib/constants';
import { HomeCard } from '@/components/HomeCard';
import { motion } from 'framer-motion';
import { Layout } from '@/components/Layout';
import { useCustomData } from '@/contexts/CustomDataContext';
import { useLocation } from 'wouter';

// Day abbreviations matching what AddNew uses in the day-picker
const DAY_ABBRS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function Home() {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const todayAbbr = DAY_ABBRS[dayOfWeek];

  const { getCurrentCustomWard, customSubjects, subjectMode } = useCustomData();
  const [, setLocation] = useLocation();

  // Custom ward takes priority over built-in schedule
  const customWard = getCurrentCustomWard();
  const builtInWard = subjectMode === 'preloaded' ? getCurrentWard(today) : null;
  const currentWard = customWard ? customWard.name : builtInWard;
  const isWardHoliday = currentWard === 'Holiday';

  // Custom subjects scheduled for today (match against day abbreviation)
  const todayCustomSubjects = customSubjects.filter(s => {
    if (!s.days) return false;
    const assigned = s.days.split(',').map(d => d.trim());
    return assigned.includes(todayAbbr);
  });

  // Built-in timetable — only shown in preloaded mode
  const schedule = subjectMode === 'preloaded' ? (TIMETABLE[dayOfWeek] || []) : [];

  const hasAnything = schedule.length > 0 || todayCustomSubjects.length > 0 || (currentWard && !isWardHoliday);

  return (
    <Layout>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6 pb-8"
      >
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            Today's Schedule
          </h2>
          <p className="text-2xl font-bold text-foreground">
            {today.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
          </p>
        </div>

        {!hasAnything ? (
          <div className="bg-card rounded-2xl p-8 border border-border text-center shadow-sm">
            <p className="text-5xl mb-4">🌴</p>
            <h3 className="text-xl font-semibold mb-2">Rest Day</h3>
            {subjectMode === 'custom' && customSubjects.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No subjects added yet.{' '}
                <button
                  onClick={() => setLocation('/add-new')}
                  className="text-primary font-semibold underline-offset-2 hover:underline"
                >
                  Add subjects
                </button>{' '}
                from the Add New tab.
              </p>
            ) : (
              <p className="text-muted-foreground text-sm">No scheduled lectures today.</p>
            )}
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
                if (isWardHoliday || !currentWard) {
                  return (
                    <div key={idx} className="bg-card rounded-2xl p-5 border border-border">
                      <h3 className="text-lg font-semibold text-foreground">
                        Ward Posting: {isWardHoliday ? 'Holiday' : 'Not scheduled'}
                      </h3>
                      <p className="text-muted-foreground text-sm mt-1">{slot.time}</p>
                    </div>
                  );
                }
                const title = slot.type === 'ward_replacement'
                  ? `Ward Replacement: ${currentWard}`
                  : `Ward Current Posting: ${currentWard}`;
                return (
                  <HomeCard
                    key={idx}
                    title={title}
                    subject={currentWard}
                    time={slot.time}
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
                  title={`Ward Current Posting: ${currentWard}`}
                  subject={currentWard}
                  time="Morning Ward"
                  isWard={true}
                  sessionId="custom-ward-am"
                />
                <HomeCard
                  title={`Ward Replacement: ${currentWard}`}
                  subject={currentWard}
                  time="Evening Ward"
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
