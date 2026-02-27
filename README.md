# Bitespeed Identity Reconciliation API

## Production Endpoint

POST:
https://bitespeed-identity-reconciliation-production-da2a.up.railway.app/identify

## Sample Request

```json
{
  "email": "test@example.com",
  "phoneNumber": "123456"
}
```

## Sample Response

```json
{
  "contact": {
    "primaryContactId": 1,
    "emails": ["test@example.com"],
    "phoneNumbers": ["123456"],
    "secondaryContactIds": []
  }
}
```

## Tech Stack

- Node.js
- Express
- PostgreSQL (Neon)
- Prisma ORM
- Railway Deployment
