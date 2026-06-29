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
export interface EmailListResponse {
    id: string;
    from: string;
    to: string;
    subject: string;
    date: string;
    isUnread: boolean;
}

export interface EmailResponse {
    id: string;
    from: string;
    to: string;
    subject: string;
    date: string;
    body: string;
    isUnread: boolean;
    threadId: string;
}
