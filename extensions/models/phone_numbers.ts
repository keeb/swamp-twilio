import { z } from "npm:zod@4";
import Twilio from "npm:twilio@5.12.2";

const GlobalArgsSchema = z.object({
  accountSid: z.string().describe("Twilio Account SID"),
  authToken: z.string().describe("Twilio Auth Token"),
});

export const model = {
  type: "@keeb/twilio/phone-numbers",
  version: "2026.03.03.1",
  globalArguments: GlobalArgsSchema,
  resources: {
    "phoneNumber": {
      description: "Single owned phone number",
      schema: z.object({
        sid: z.string(),
        phoneNumber: z.string(),
        friendlyName: z.string(),
        capabilities: z.object({}).passthrough(),
      }).passthrough(),
      lifetime: "infinite",
      garbageCollection: 10,
    },
    "phoneNumberList": {
      description: "List of owned phone numbers",
      schema: z.object({
        numbers: z.array(z.object({}).passthrough()),
        timestamp: z.string(),
      }).passthrough(),
      lifetime: "infinite",
      garbageCollection: 10,
    },
    "availableNumbers": {
      description: "Search results for available phone numbers",
      schema: z.object({
        numbers: z.array(z.object({}).passthrough()),
        country: z.string(),
        timestamp: z.string(),
      }).passthrough(),
      lifetime: "infinite",
      garbageCollection: 10,
    },
  },
  methods: {
    list_numbers: {
      description: "List owned phone numbers",
      arguments: z.object({
        friendlyName: z.string().optional().describe("Filter by friendly name"),
        phoneNumber: z.string().optional().describe("Filter by phone number"),
        pageSize: z.number().default(20).describe("Number of results to return"),
      }),
      execute: async (args, context) => {
        const client = new Twilio(context.globalArgs.accountSid, context.globalArgs.authToken);

        const listParams = { limit: args.pageSize };
        if (args.friendlyName) listParams.friendlyName = args.friendlyName;
        if (args.phoneNumber) listParams.phoneNumber = args.phoneNumber;

        context.logger.info("Listing owned phone numbers");
        const numbers = await client.incomingPhoneNumbers.list(listParams);

        const handle = await context.writeResource("phoneNumberList", "latest", {
          numbers: numbers.map((n) => ({
            sid: n.sid,
            phoneNumber: n.phoneNumber,
            friendlyName: n.friendlyName,
            capabilities: n.capabilities,
            status: n.status,
            smsUrl: n.smsUrl,
            voiceUrl: n.voiceUrl,
            dateCreated: n.dateCreated ? n.dateCreated.toISOString() : null,
            dateUpdated: n.dateUpdated ? n.dateUpdated.toISOString() : null,
          })),
          timestamp: new Date().toISOString(),
        });
        return { dataHandles: [handle] };
      },
    },
    search_available: {
      description: "Search for available phone numbers to purchase",
      arguments: z.object({
        countryCode: z.string().default("US").describe("ISO country code"),
        areaCode: z.string().optional().describe("Filter by area code"),
        contains: z.string().optional().describe("Pattern to match (e.g. '***-555-****')"),
        smsEnabled: z.boolean().optional().describe("Filter for SMS-capable numbers"),
        voiceEnabled: z.boolean().optional().describe("Filter for voice-capable numbers"),
        pageSize: z.number().default(20).describe("Number of results to return"),
      }),
      execute: async (args, context) => {
        const client = new Twilio(context.globalArgs.accountSid, context.globalArgs.authToken);

        const searchParams = { limit: args.pageSize };
        if (args.areaCode) searchParams.areaCode = args.areaCode;
        if (args.contains) searchParams.contains = args.contains;
        if (args.smsEnabled !== undefined) searchParams.smsEnabled = args.smsEnabled;
        if (args.voiceEnabled !== undefined) searchParams.voiceEnabled = args.voiceEnabled;

        context.logger.info("Searching available numbers in {country}", { country: args.countryCode });
        const numbers = await client.availablePhoneNumbers(args.countryCode).local.list(searchParams);

        const handle = await context.writeResource("availableNumbers", "latest", {
          numbers: numbers.map((n) => ({
            phoneNumber: n.phoneNumber,
            friendlyName: n.friendlyName,
            locality: n.locality,
            region: n.region,
            postalCode: n.postalCode,
            isoCountry: n.isoCountry,
            capabilities: n.capabilities,
          })),
          country: args.countryCode,
          timestamp: new Date().toISOString(),
        });
        return { dataHandles: [handle] };
      },
    },
    buy_number: {
      description: "Purchase a phone number",
      arguments: z.object({
        phoneNumber: z.string().describe("Phone number to purchase (E.164 format)"),
        friendlyName: z.string().optional().describe("Friendly name for the number"),
        smsUrl: z.string().url().optional().describe("Webhook URL for incoming SMS"),
        voiceUrl: z.string().url().optional().describe("Webhook URL for incoming calls"),
      }),
      execute: async (args, context) => {
        const client = new Twilio(context.globalArgs.accountSid, context.globalArgs.authToken);

        const createParams = { phoneNumber: args.phoneNumber };
        if (args.friendlyName) createParams.friendlyName = args.friendlyName;
        if (args.smsUrl) createParams.smsUrl = args.smsUrl;
        if (args.voiceUrl) createParams.voiceUrl = args.voiceUrl;

        context.logger.info("Purchasing number {number}", { number: args.phoneNumber });
        const number = await client.incomingPhoneNumbers.create(createParams);

        const handle = await context.writeResource("phoneNumber", number.sid, {
          sid: number.sid,
          phoneNumber: number.phoneNumber,
          friendlyName: number.friendlyName,
          capabilities: number.capabilities,
          status: number.status,
          smsUrl: number.smsUrl,
          voiceUrl: number.voiceUrl,
          dateCreated: number.dateCreated ? number.dateCreated.toISOString() : null,
          dateUpdated: number.dateUpdated ? number.dateUpdated.toISOString() : null,
        });
        return { dataHandles: [handle] };
      },
    },
    update_number: {
      description: "Update configuration of an owned phone number",
      arguments: z.object({
        phoneNumberSid: z.string().describe("Phone number SID (starts with PN)"),
        friendlyName: z.string().optional().describe("New friendly name"),
        smsUrl: z.string().url().optional().describe("New webhook URL for incoming SMS"),
        voiceUrl: z.string().url().optional().describe("New webhook URL for incoming calls"),
      }),
      execute: async (args, context) => {
        const client = new Twilio(context.globalArgs.accountSid, context.globalArgs.authToken);

        const updateParams = {};
        if (args.friendlyName) updateParams.friendlyName = args.friendlyName;
        if (args.smsUrl) updateParams.smsUrl = args.smsUrl;
        if (args.voiceUrl) updateParams.voiceUrl = args.voiceUrl;

        context.logger.info("Updating number {sid}", { sid: args.phoneNumberSid });
        const number = await client.incomingPhoneNumbers(args.phoneNumberSid).update(updateParams);

        const handle = await context.writeResource("phoneNumber", number.sid, {
          sid: number.sid,
          phoneNumber: number.phoneNumber,
          friendlyName: number.friendlyName,
          capabilities: number.capabilities,
          status: number.status,
          smsUrl: number.smsUrl,
          voiceUrl: number.voiceUrl,
          dateCreated: number.dateCreated ? number.dateCreated.toISOString() : null,
          dateUpdated: number.dateUpdated ? number.dateUpdated.toISOString() : null,
        });
        return { dataHandles: [handle] };
      },
    },
    release_number: {
      description: "Release (delete) an owned phone number",
      arguments: z.object({
        phoneNumberSid: z.string().describe("Phone number SID to release (starts with PN)"),
      }),
      execute: async (args, context) => {
        const client = new Twilio(context.globalArgs.accountSid, context.globalArgs.authToken);

        context.logger.info("Releasing number {sid}", { sid: args.phoneNumberSid });
        await client.incomingPhoneNumbers(args.phoneNumberSid).remove();

        return { dataHandles: [] };
      },
    },
  },
};
