# Instrumentation

The instrumentation layer automatically traces every trigger execution and stores it in MongoDB.

## How It Works

Each trigger execution receives a `traceId` (UUID). The instrumentation system records:

1. **Start**: When execution begins (input data, trigger ID, workflow type)
2. **Events**: Named events during execution (errors, custom info)
3. **End**: When execution finishes (output data, SUCCESS/ERROR status)

## MongoDB Schema

### `runs` Collection

```ts
{
    traceId: string,          // UUID
    triggerId: string,        // e.g. "authentik:loginFailed"
    startTime: Date,
    endTime?: Date,
    workflowType: string,     // "http", "MQTT", "Redis", etc.
    inputData: object,
    outputData?: object,
    status?: "SUCCESS" | "ERROR",
    events: [{
        eventId: string,      // UUID
        eventName: string,
        eventData: object,
        eventType: "INFO" | "ERROR",
        dateTime: Date,
    }]
}
```

## Functions

### `startTracer(params)`
Records the beginning of a trace.

### `endTracer(params, createTracer?)`
Marks a trace as complete. If the trace doesn't exist and `createTracer` is provided, it creates one (for edge cases like HTTP error handlers).

### `addTracerEvent(params)`
Appends an event to an existing trace.

### `createTracerIfNotExtistsAndAppendEvent(params, event)`
Creates a trace if it doesn't exist, then appends an event. Used in HTTP error handlers.

### `instumentableFetch(traceId, input, init?)`
A wrapper around `fetch()` that logs the request and response as a trace event. Automatically handles `Headers` objects and `Request` objects.