import {
  AvailabilityCheck,
  AvailabilityDaypart,
  AvailabilityPreset,
  AvailabilitySlot,
  AvailabilitySummary,
} from '../types';

type SlotSeed = {
  label: string;
  start: Date;
  end: Date;
};

type GeneratedSlotInput = Omit<AvailabilitySlot, 'id' | 'availability_check_id'>;

export type GeneratedAvailabilityCheck = {
  preset: AvailabilityPreset;
  title: string;
  timezone: string;
  range_start: string | null;
  range_end: string | null;
  slots: GeneratedSlotInput[];
  generation_mode?: 'detailed' | 'daily';
  truncated?: boolean;
  requested_day_count?: number;
};

export const CUSTOM_AVAILABILITY_MAX_DETAILED_DAYS = 4;
export const CUSTOM_AVAILABILITY_MAX_SLOTS = 6;

const DAYPART_CONFIG: Record<AvailabilityDaypart, { label: string; startHour: number; endHour: number }> = {
  morning: { label: 'morning', startHour: 9, endHour: 12 },
  afternoon: { label: 'afternoon', startHour: 13, endHour: 17 },
  evening: { label: 'evening', startHour: 18, endHour: 22 },
};

function startOfDay(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(value: Date, days: number) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function withTime(value: Date, hour: number, minute = 0) {
  const date = new Date(value);
  date.setHours(hour, minute, 0, 0);
  return date;
}

function formatWeekday(value: Date) {
  return value.toLocaleDateString(undefined, { weekday: 'long' });
}

function formatShortWeekday(value: Date) {
  return value.toLocaleDateString(undefined, { weekday: 'short' });
}

function formatShortDate(value: Date) {
  return value.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatTime(value: Date) {
  return value.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatRangeLabel(start: Date, end: Date) {
  return `${formatTime(start)}-${formatTime(end)}`;
}

function daySpanInclusive(start: Date, end: Date) {
  const diff = startOfDay(end).getTime() - startOfDay(start).getTime();
  return Math.floor(diff / 86400000) + 1;
}

function titleForPreset(preset: AvailabilityPreset) {
  switch (preset) {
    case 'tonight':
      return "Who's free tonight?";
    case 'tomorrow':
      return "Who's free tomorrow?";
    case 'this_weekend':
      return "Who's free this weekend?";
    case 'next_week':
      return "Who's free next week?";
    case 'custom':
    default:
      return 'Availability check';
  }
}

function buildSlots(preset: AvailabilityPreset, seeds: SlotSeed[], now: Date): GeneratedAvailabilityCheck {
  const futureSeeds = seeds.filter((seed) => seed.end.getTime() > now.getTime());
  return {
    preset,
    title: titleForPreset(preset),
    timezone: getLocalTimezone(),
    range_start: futureSeeds[0]?.start.toISOString() ?? null,
    range_end: futureSeeds[futureSeeds.length - 1]?.end.toISOString() ?? null,
    slots: futureSeeds.map((seed, index) => ({
      label: seed.label,
      starts_at: seed.start.toISOString(),
      ends_at: seed.end.toISOString(),
      sort_order: index,
    })),
  };
}

function tonightSeeds(baseDay: Date) {
  const earlyStart = withTime(baseDay, 18, 0);
  const midStart = withTime(baseDay, 20, 0);
  const lateStart = withTime(baseDay, 22, 0);

  return [
    { label: `Tonight ${formatRangeLabel(earlyStart, withTime(baseDay, 20, 0))}`, start: earlyStart, end: withTime(baseDay, 20, 0) },
    { label: `Tonight ${formatRangeLabel(midStart, withTime(baseDay, 22, 0))}`, start: midStart, end: withTime(baseDay, 22, 0) },
    { label: `Tonight ${formatRangeLabel(lateStart, withTime(addDays(baseDay, 1), 0, 0))}`, start: lateStart, end: withTime(addDays(baseDay, 1), 0, 0) },
  ];
}

function tomorrowSeeds(baseDay: Date) {
  return [
    { label: 'Tomorrow morning', start: withTime(baseDay, 9, 0), end: withTime(baseDay, 12, 0) },
    { label: 'Tomorrow lunch', start: withTime(baseDay, 12, 0), end: withTime(baseDay, 14, 0) },
    { label: 'Tomorrow afternoon', start: withTime(baseDay, 14, 0), end: withTime(baseDay, 17, 0) },
    { label: 'Tomorrow evening', start: withTime(baseDay, 18, 0), end: withTime(baseDay, 22, 0) },
  ];
}

function getWeekendAnchor(now: Date) {
  const today = startOfDay(now);
  const day = today.getDay();
  const fridayOffset = (5 - day + 7) % 7;
  const currentFriday = addDays(today, fridayOffset);
  const currentWeekendSeeds = [
    { start: withTime(currentFriday, 18, 0), end: withTime(currentFriday, 22, 0) },
    { start: withTime(addDays(currentFriday, 1), 13, 0), end: withTime(addDays(currentFriday, 1), 17, 0) },
    { start: withTime(addDays(currentFriday, 1), 18, 0), end: withTime(addDays(currentFriday, 1), 22, 0) },
    { start: withTime(addDays(currentFriday, 2), 13, 0), end: withTime(addDays(currentFriday, 2), 17, 0) },
  ];

  const hasFutureSeed = currentWeekendSeeds.some((seed) => seed.end.getTime() > now.getTime());
  return hasFutureSeed ? currentFriday : addDays(currentFriday, 7);
}

function thisWeekendSeeds(now: Date) {
  const friday = getWeekendAnchor(now);
  const saturday = addDays(friday, 1);
  const sunday = addDays(friday, 2);

  return [
    { label: 'Friday evening', start: withTime(friday, 18, 0), end: withTime(friday, 22, 0) },
    { label: 'Saturday afternoon', start: withTime(saturday, 13, 0), end: withTime(saturday, 17, 0) },
    { label: 'Saturday evening', start: withTime(saturday, 18, 0), end: withTime(saturday, 22, 0) },
    { label: 'Sunday afternoon', start: withTime(sunday, 13, 0), end: withTime(sunday, 17, 0) },
  ];
}

function nextWeekSeeds(now: Date) {
  const today = startOfDay(now);
  const day = today.getDay();
  const daysUntilNextMonday = ((8 - day) % 7) || 7;
  const monday = addDays(today, daysUntilNextMonday);

  return [0, 1, 2, 3, 4].map((offset) => {
    const dayDate = addDays(monday, offset);
    return {
      label: `${formatWeekday(dayDate)} evening`,
      start: withTime(dayDate, 18, 0),
      end: withTime(dayDate, 22, 0),
    };
  });
}

export function getLocalTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function buildAvailabilityForPreset(preset: AvailabilityPreset, now = new Date()): GeneratedAvailabilityCheck {
  const today = startOfDay(now);

  switch (preset) {
    case 'tonight':
      return buildSlots(preset, tonightSeeds(today), now);
    case 'tomorrow':
      return buildSlots(preset, tomorrowSeeds(addDays(today, 1)), now);
    case 'this_weekend':
      return buildSlots(preset, thisWeekendSeeds(now), now);
    case 'next_week':
      return buildSlots(preset, nextWeekSeeds(now), now);
    case 'custom':
    default:
      return { preset: 'custom', title: 'Availability check', timezone: getLocalTimezone(), range_start: null, range_end: null, slots: [] };
  }
}

export function buildCustomAvailability(
  startDate: Date,
  endDate: Date,
  dayparts: AvailabilityDaypart[],
  now = new Date()
): GeneratedAvailabilityCheck {
  const start = startOfDay(startDate);
  const end = startOfDay(endDate);
  const detailedSlots: GeneratedSlotInput[] = [];
  let cursor = new Date(start);
  let sortOrder = 0;

  while (cursor.getTime() <= end.getTime()) {
    for (const daypart of dayparts) {
      const config = DAYPART_CONFIG[daypart];
      const slotStart = withTime(cursor, config.startHour, 0);
      const slotEnd = withTime(cursor, config.endHour, 0);

      if (slotEnd.getTime() <= now.getTime()) continue;

      detailedSlots.push({
        label: `${formatShortWeekday(cursor)} ${config.label}`,
        starts_at: slotStart.toISOString(),
        ends_at: slotEnd.toISOString(),
        sort_order: sortOrder++,
      });
    }
    cursor = addDays(cursor, 1);
  }

  const requestedDayCount = daySpanInclusive(start, end);
  const shouldCompressToDaily =
    requestedDayCount > CUSTOM_AVAILABILITY_MAX_DETAILED_DAYS ||
    detailedSlots.length > CUSTOM_AVAILABILITY_MAX_SLOTS;

  let slots = detailedSlots;
  let generationMode: 'detailed' | 'daily' = 'detailed';

  if (shouldCompressToDaily) {
    generationMode = 'daily';
    slots = [];
    cursor = new Date(start);
    sortOrder = 0;

    const selectedConfigs = dayparts.map((daypart) => DAYPART_CONFIG[daypart]);
    const startHour = selectedConfigs.length > 0
      ? Math.min(...selectedConfigs.map((config) => config.startHour))
      : 9;
    const endHour = selectedConfigs.length > 0
      ? Math.max(...selectedConfigs.map((config) => config.endHour))
      : 22;

    while (cursor.getTime() <= end.getTime()) {
      const slotStart = withTime(cursor, startHour, 0);
      const slotEnd = withTime(cursor, endHour, 0);

      if (slotEnd.getTime() > now.getTime()) {
        slots.push({
          label: formatShortWeekday(cursor),
          starts_at: slotStart.toISOString(),
          ends_at: slotEnd.toISOString(),
          sort_order: sortOrder++,
        });
      }

      cursor = addDays(cursor, 1);
    }
  }

  const truncated = slots.length > CUSTOM_AVAILABILITY_MAX_SLOTS;
  if (truncated) {
    slots = slots.slice(0, CUSTOM_AVAILABILITY_MAX_SLOTS).map((slot, index) => ({
      ...slot,
      sort_order: index,
    }));
  }

  return {
    preset: 'custom',
    title: 'Availability check',
    timezone: getLocalTimezone(),
    range_start: slots[0]?.starts_at ?? null,
    range_end: slots[slots.length - 1]?.ends_at ?? null,
    slots,
    generation_mode: generationMode,
    truncated,
    requested_day_count: requestedDayCount,
  };
}

export function summarizeAvailability(
  slots: AvailabilitySlot[],
  votesBySlot: Record<string, string[]> | undefined
): AvailabilitySummary {
  const rankedSlots = [...slots]
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
    .map((slot) => {
      const voterIds = Array.from(new Set(votesBySlot?.[slot.id] ?? []));
      return {
        slot,
        voter_ids: voterIds,
        count: voterIds.length,
      };
    })
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return new Date(a.slot.starts_at).getTime() - new Date(b.slot.starts_at).getTime();
    });

  const respondentIds = Array.from(new Set(rankedSlots.flatMap((entry) => entry.voter_ids)));
  const bestSlot = rankedSlots.find((entry) => entry.count > 0) ?? null;

  return {
    best_slot: bestSlot,
    ranked_slots: rankedSlots,
    respondent_ids: respondentIds,
  };
}

export function formatAvailabilitySlotWindow(slot: Pick<AvailabilitySlot, 'starts_at' | 'ends_at'>) {
  const start = new Date(slot.starts_at);
  const end = new Date(slot.ends_at);
  return `${formatShortDate(start)} · ${formatRangeLabel(start, end)}`;
}

export function formatAvailabilitySubtitle(check: Pick<AvailabilityCheck, 'preset' | 'range_start' | 'range_end'>) {
  if (!check.range_start || !check.range_end) return null;

  const start = new Date(check.range_start);
  const end = new Date(check.range_end);

  if (check.preset === 'custom') {
    return `${formatShortDate(start)}-${formatShortDate(end)}`;
  }

  return `${formatShortDate(start)}-${formatShortDate(end)}`;
}
