import mongoose from "mongoose";
import safeEnvGet from "utils/safeEnvGet";

export const client = await mongoose.connect(safeEnvGet("MONGO_LOGS"), {
    dbName: "integra",
});

export const eventSchema = new client.Schema({
    eventId: {
        type: String,
        required: true,
    },
    eventName: {
        type: String,
        required: true,
    },
    eventData: {
        type: Object,
        required: false,
    },
    eventType: {
        type: String,
        required: true,
    },
    dateTime: {
        type: Date,
        required: false,
    },
});

export const runSchema = new client.Schema({
    traceId: {
        type: String,
        required: true,
    },
    triggerId: {
        type: String,
        required: true,
    },
    startTime: {
        type: Date,
        required: true,
    },
    endTime: {
        type: Date,
        required: false,
    },
    workflowType: {
        type: String,
        required: true,
    },
    inputData: {
        type: Object,
        required: false,
    },
    outputData: {
        type: Object,
        required: false,
    },
    events: {
        type: [eventSchema],
        default: [],
    },
    status: {
        type: String,
        required: false,
    },
});

export const runModel = client.model("runs", runSchema);
