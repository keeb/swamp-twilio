---
name: twilio
description: Send SMS/MMS, manage Twilio phone numbers, and query message history through the @keeb/twilio swamp extension. Covers the @keeb/twilio/messaging model (send_sms, get_message, list_messages) and @keeb/twilio/phone-numbers model (list_numbers, search_available, buy_number, update_number, release_number). Use when the user wants to send a text message, send an SMS, send an MMS, fetch SMS history, look up a Twilio message SID, list owned Twilio numbers, search for available phone numbers to purchase, buy a Twilio number, configure SMS/voice webhook URLs on a number, release a Twilio number, or wire Twilio into a swamp workflow. Triggers on "twilio", "send sms", "send text", "send mms", "twilio number", "buy phone number", "phone number search", "sms webhook", "twilio messaging".
---

# Twilio Extension

`@keeb/twilio` wraps the Twilio REST API as two swamp extension models.
Credentials live in a vault; methods write resources that downstream models can
reference via CEL.

## Models

### `@keeb/twilio/messaging`

Send and query SMS/MMS messages.

**Global arguments** (required on every model instance):

- `accountSid` — Twilio Account SID (starts with `AC`)
- `authToken` — Twilio Auth Token

**Methods**:

- `send_sms` — Send an SMS or MMS.
  - `to` (required) — destination, E.164 format (e.g. `+15555550123`)
  - `from` (required) — Twilio number sending the message, E.164 format
  - `body` (required) — message text
  - `mediaUrl` (optional) — public URL of media to attach (turns it into MMS)
- `get_message` — Fetch one message by SID.
  - `messageSid` (required) — message SID, starts with `SM`
- `list_messages` — List messages with optional filters.
  - `to`, `from` — filter by number
  - `dateSent`, `dateSentAfter`, `dateSentBefore` — `YYYY-MM-DD` strings
  - `pageSize` (default `20`)

**Resources written**:

- `message` (keyed by message SID) — single message details
- `messageList` (key `latest`) — last list query result

### `@keeb/twilio/phone-numbers`

Search, purchase, configure, and release Twilio numbers.

**Global arguments**: same `accountSid` / `authToken` as messaging.

**Methods**:

- `list_numbers` — List owned numbers. Filters: `friendlyName`, `phoneNumber`,
  `pageSize`.
- `search_available` — Search the marketplace for purchasable numbers.
  - `countryCode` (default `US`) — ISO country code
  - `areaCode`, `contains` — narrow the search (`contains` accepts patterns like
    `***-555-****`)
  - `smsEnabled`, `voiceEnabled` — capability filters
  - `pageSize` (default `20`)
- `buy_number` — Purchase a number.
  - `phoneNumber` (required) — E.164 format, taken from a `search_available`
    result
  - `friendlyName`, `smsUrl`, `voiceUrl` — optional config applied at purchase
- `update_number` — Edit an owned number.
  - `phoneNumberSid` (required) — starts with `PN`
  - `friendlyName`, `smsUrl`, `voiceUrl` — fields to change
- `release_number` — Permanently release a number. Argument: `phoneNumberSid`.
  Writes no resources.

**Resources written**:

- `phoneNumber` (keyed by SID) — single owned number
- `phoneNumberList` (key `latest`) — last `list_numbers` result
- `availableNumbers` (key `latest`) — last `search_available` result

## Common patterns

### Vault credentials

Store the Twilio creds once and reference them from every model instance:

```bash
swamp vault set twilio accountSid AC...
swamp vault set twilio authToken  ...
```

```yaml
# model definition
type: "@keeb/twilio/messaging"
name: alerts
globalArguments:
  accountSid: "{{ vault.twilio.accountSid }}"
  authToken: "{{ vault.twilio.authToken }}"
```

### Sending an SMS from a workflow

```yaml
jobs:
  notify:
    steps:
      - name: text on-call
        model: alerts # @keeb/twilio/messaging instance
        method: send_sms
        arguments:
          to: "+15555550123"
          from: "+15555550100"
          body: "Deploy finished"
```

### Chaining with CEL

After `search_available` populates `availableNumbers/latest`, buy the first
result in a follow-up step:

```yaml
- name: buy first match
  model: numbers # @keeb/twilio/phone-numbers instance
  method: buy_number
  arguments:
    phoneNumber: "{{ data.latest('numbers', 'availableNumbers').attributes.numbers[0].phoneNumber }}"
    friendlyName: "ops-line"
    smsUrl: "https://hooks.example.com/sms"
```

After `send_sms`, look up the resulting `message` by its SID:

```yaml
status: "{{ data.get('alerts', 'message', steps.text.dataHandles[0].dataName).attributes.status }}"
```

### Verify before destructive ops

`release_number` is irreversible. Always run `swamp model get numbers --json`
and confirm the `PN...` SID before invoking it.

## Gotchas

- **Phone numbers must be E.164.** `to`, `from`, and `phoneNumber` arguments
  must include the `+` and country code (`+15555550123`). The Twilio API rejects
  local formats.
- **Message SIDs vs phone SIDs.** `get_message` takes an `SM...` SID;
  `update_number` / `release_number` take a `PN...` SID. They are not
  interchangeable.
- **`list_messages` date filters expect `YYYY-MM-DD` strings**, not ISO
  timestamps. The model parses them with `new Date(...)`.
- **`mediaUrl` must be publicly reachable.** Twilio fetches it server-side; a
  localhost or auth-gated URL will silently produce a media-less message.
- **`search_available` is local-only.** It calls
  `availablePhoneNumbers(country).local.list`. For toll-free or mobile, the
  current model does not support it — extend the model rather than working
  around it.
- **`messageList` and `phoneNumberList` always overwrite key `latest`.** Each
  list call replaces the previous snapshot; chain CEL off the most recent run in
  the same workflow.
- **Twilio errors surface as thrown exceptions.** A failed `send_sms` aborts the
  step; check `errorCode` / `errorMessage` on a stored `message` resource when
  investigating delivery failures via `get_message`.
- **`buy_number` costs real money.** Always run `search_available` first and
  confirm the candidate number before invoking it.
