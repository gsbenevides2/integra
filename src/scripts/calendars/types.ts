export interface Calendar {
    email: string;
    primary: boolean;
    summary: string;
    calendarId: string;
}
interface Attendee {
    display_name: string;
    email: string;
    response_status: "accepted" | "declined" | "needsAction" | "tentative";
}
interface BirthdayProperties {
    type: "birthday" | "anniversary" | "other" | "custom" | "self";
}
interface ConferenceData {
    label: string;
    uri: string;
}
interface Organizer {
    display_name: string;
    email: string;
    self: boolean;
}
interface Override {
    method: "email" | "popup";
}
interface Remider {
    overrides: Override[];
    use_default: boolean;
}
interface WorkLocationProperties {
    type: "homeOffice" | "officeLocation" | "customLocation";
}
export interface Event {
    attendees: Attendee[];
    birthday_properties: BirthdayProperties;
    color_id: string;
    conference_data: ConferenceData[];
    description: string;
    end_date: string;
    event_type:
        "birthday" | "default" | "focusTime" | "outOfOffice" | "workingLocation" | "fromGmail";
    hangout_link: string;
    htmlLink: string;
    id: string;
    location: string;
    organizer: Organizer;
    reminders: Remider;
    start_date: string;
    summary: string;
    work_location_properties: WorkLocationProperties;
}

export interface CalendarEvents {
    calendar: Calendar;
    events: Event[];
}
export interface EventWithCalendar extends Event {
    calendar: Calendar;
}

export interface SchedulledRequest {
    body: string;
    excludeBeforeExecution: boolean;
    externalId: string;
    headers: Record<string, string>;
    method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
    triggerType: "cron" | "date";
    triggerValue: string;
    url: string;
}

export interface MakedDates {
    startDate: string;
    endDate: string;
    nonDuplicatedCalendars: Calendar[];
    schedullersIdsToDelete: string[];
}
