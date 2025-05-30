# Daisi Whatsapp Service Documentation

Base URL DEV: `https://whatsapp-service.daisi.dev/api/v1`
Base URL PRD: `https://whatsapp-service.daisi.app/api/v1`

---

## Authentication

All authenticated routes require a Bearer token in the `Authorization` header.

```
Authorization: Bearer <token>
```

---

## Health Check

**GET** `/api/v1/health`

- **Description:** Check if the API is running.
- **Response:**
  ```json
  { "status": "ok" }
  ```

---

## Meta Messaging

### Send Meta Message

**POST** `/api/v1/meta/send-message`

- **Body:**
  ```json
  {
    "type": "text" | "image" | "document",
    "to": "string",
    "message": {
      "text": "string",
      "imageUrl": "string",
      "documentUrl": "string",
      "filename": "string"
    },
    "metaCredentials": {
      "accessToken": "string",
      "phoneNumberId": "string"
    },
    "companyId": "string",
    "agentId": "string",
    "scheduleAt": "2025-06-01T12:00:00Z"
  }
  ```
- **Response:**
  - **200:** `{ "status": "sent", "result": { ... } }`
  - **200 (scheduled):** `{ "status": "scheduled", "scheduleAt": "..." }`
  - **400/500:** `{ "error": "..." }`

---

## Daisi Messaging

### Send Daisi Message

**POST** `/api/v1/daisi/send-message`

- **Body:**
  ```json
  {
    "agentId": "string",
    "phoneNumber": "string",
    "message": { "text": "string" },
    "type": "text" | "image" | "document",
    "scheduleAt": "2025-06-01T12:00:00Z",
    "options": { },
    "variables": { },
    "userId": "string",
    "label": "string"
  }
  ```
- **Response:**
  - **200:** `{ "success": true, "data": { "status": "sent" | "scheduled", "taskId": "...", "scheduleAt": "..." } }`
  - **400/500:** `{ "success": false, "error": "..." }`

### Send Daisi Message to Group

**POST** `/api/v1/daisi/send-message-to-group`

- **Body:** Same as above, but with `groupJid` instead of `phoneNumber`.

### Mark as Read

**POST** `/api/v1/daisi/mark-as-read`

- **Body:**
  ```json
  {
    "agentId": "string",
    "remoteJid": "string",
    "id": "string"
  }
  ```
- **Response:** `{ "success": true, "data": ... }` or error

### Logout

**POST** `/api/v1/daisi/logout`

- **Body:**
  ```json
  { "agentId": "string" }
  ```
- **Response:** `{ "status": "ok", "result": { "timestamp": "..." } }`

---

## Mailcast

### Send Mailcast Message

**POST** `/api/v1/mailcast/send-message`

- **Body:**
  ```json
  {
    "companyId": "string",
    "agentId": "string",
    "phoneNumber": "string",
    "type": "text" | "image" | "document",
    "message": { "text": "string" },
    "scheduleAt": "2025-06-01T12:00:00Z"
  }
  ```
- **Response:**  
  - **200:** `{ "success": true, "data": { "status": "sent" | "scheduled", "taskId": "...", "scheduleAt": "..." } }`
  - **400/500:** `{ "success": false, "error": "..." }`

---

## Tasks

### List Tasks

**GET** `/api/v1/tasks`

- **Query Parameters:** (see schema for details)
- **Response:**  
  ```json
  [
    {
      "id": "string",
      "companyId": "string",
      "agentId": "string",
      "taskType": "string",
      "channel": "string",
      "status": "string",
      "label": "string",
      "payload": { },
      "scheduledAt": "string",
      "createdAt": "string",
      "updatedAt": "string",
      "agendaJobId": "string"
    }
  ]
  ```

### Get Task by ID

**GET** `/api/v1/tasks/:id`

- **Response:** Task object or error

### Patch Task by ID

**PATCH** `/api/v1/tasks/:id`

- **Body:** Partial task fields to update
- **Response:** Updated task or error

---

## Notes

- All endpoints (except `/health`) require authentication.
- All date/time fields are ISO8601 strings.
- For more details on request/response schemas, see the corresponding JSON schema files in `/src/schemas/`.

---

## Error Handling

- All error responses will have an `error` field with a descriptive message.
- Example:
  ```json
  { "success": false, "error": "Invalid token" }
  ```

---

