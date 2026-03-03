import { z } from "npm:zod@4";
import Twilio from "npm:twilio@5.12.2";

const GlobalArgsSchema = z.object({
  accountSid: z.string().describe("Twilio Account SID"),
  authToken: z.string().describe("Twilio Auth Token"),
});

export const model = {
  type: "@keeb/twilio/messaging",
  version: "2026.03.03.1",
  globalArguments: GlobalArgsSchema,
  resources: {
    "message": {
      description: "Single SMS/MMS message",
      schema: z.object({
        sid: z.string(),
        to: z.string(),
        from: z.string(),
        body: z.string(),
        status: z.string(),
        direction: z.string(),
        dateSent: z.string().nullable(),
      }).passthrough(),
      lifetime: "infinite",
      garbageCollection: 10,
    },
    "messageList": {
      description: "List of messages from a query",
      schema: z.object({
        messages: z.array(z.object({}).passthrough()),
        timestamp: z.string(),
      }).passthrough(),
      lifetime: "infinite",
      garbageCollection: 10,
    },
  },
  methods: {
    send_sms: {
      description: "Send an SMS or MMS message",
      arguments: z.object({
        to: z.string().describe("Destination phone number (E.164 format)"),
        from: z.string().describe("Twilio phone number to send from (E.164 format)"),
        body: z.string().describe("Message body text"),
        mediaUrl: z.string().url().optional().describe("URL of media to attach (MMS)"),
      }),
      execute: async (args, context) => {
        const client = new Twilio(context.globalArgs.accountSid, context.globalArgs.authToken);

        const createParams = {
          to: args.to,
          from: args.from,
          body: args.body,
        };
        if (args.mediaUrl) {
          createParams.mediaUrl = [args.mediaUrl];
        }

        context.logger.info("Sending message to {to} from {from}", { to: args.to, from: args.from });
        const message = await client.messages.create(createParams);

        const handle = await context.writeResource("message", message.sid, {
          sid: message.sid,
          to: message.to,
          from: message.from,
          body: message.body,
          status: message.status,
          direction: message.direction,
          dateSent: message.dateSent ? message.dateSent.toISOString() : null,
          numSegments: message.numSegments,
          numMedia: message.numMedia,
          price: message.price,
          priceUnit: message.priceUnit,
          uri: message.uri,
          dateCreated: message.dateCreated ? message.dateCreated.toISOString() : null,
          dateUpdated: message.dateUpdated ? message.dateUpdated.toISOString() : null,
        });
        return { dataHandles: [handle] };
      },
    },
    get_message: {
      description: "Fetch details of a single message by SID",
      arguments: z.object({
        messageSid: z.string().describe("Message SID (starts with SM)"),
      }),
      execute: async (args, context) => {
        const client = new Twilio(context.globalArgs.accountSid, context.globalArgs.authToken);

        context.logger.info("Fetching message {sid}", { sid: args.messageSid });
        const message = await client.messages(args.messageSid).fetch();

        const handle = await context.writeResource("message", message.sid, {
          sid: message.sid,
          to: message.to,
          from: message.from,
          body: message.body,
          status: message.status,
          direction: message.direction,
          dateSent: message.dateSent ? message.dateSent.toISOString() : null,
          numSegments: message.numSegments,
          numMedia: message.numMedia,
          price: message.price,
          priceUnit: message.priceUnit,
          errorCode: message.errorCode,
          errorMessage: message.errorMessage,
          uri: message.uri,
          dateCreated: message.dateCreated ? message.dateCreated.toISOString() : null,
          dateUpdated: message.dateUpdated ? message.dateUpdated.toISOString() : null,
        });
        return { dataHandles: [handle] };
      },
    },
    list_messages: {
      description: "List messages with optional filters",
      arguments: z.object({
        to: z.string().optional().describe("Filter by destination number"),
        from: z.string().optional().describe("Filter by sender number"),
        dateSent: z.string().optional().describe("Filter by exact date sent (YYYY-MM-DD)"),
        dateSentAfter: z.string().optional().describe("Messages sent after this date (YYYY-MM-DD)"),
        dateSentBefore: z.string().optional().describe("Messages sent before this date (YYYY-MM-DD)"),
        pageSize: z.number().default(20).describe("Number of messages to return"),
      }),
      execute: async (args, context) => {
        const client = new Twilio(context.globalArgs.accountSid, context.globalArgs.authToken);

        const listParams = { limit: args.pageSize };
        if (args.to) listParams.to = args.to;
        if (args.from) listParams.from = args.from;
        if (args.dateSent) listParams.dateSent = new Date(args.dateSent);
        if (args.dateSentAfter) listParams.dateSentAfter = new Date(args.dateSentAfter);
        if (args.dateSentBefore) listParams.dateSentBefore = new Date(args.dateSentBefore);

        context.logger.info("Listing messages with filters {filters}", { filters: JSON.stringify(listParams) });
        const messages = await client.messages.list(listParams);

        const handle = await context.writeResource("messageList", "latest", {
          messages: messages.map((m) => ({
            sid: m.sid,
            to: m.to,
            from: m.from,
            body: m.body,
            status: m.status,
            direction: m.direction,
            dateSent: m.dateSent ? m.dateSent.toISOString() : null,
            numSegments: m.numSegments,
            numMedia: m.numMedia,
            price: m.price,
            priceUnit: m.priceUnit,
            dateCreated: m.dateCreated ? m.dateCreated.toISOString() : null,
          })),
          timestamp: new Date().toISOString(),
        });
        return { dataHandles: [handle] };
      },
    },
  },
};
