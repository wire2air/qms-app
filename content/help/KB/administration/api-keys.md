---
id: api-keys
title: API Keys
sidebar_position: 9
description: Create, use, and revoke machine-to-machine API keys that let external systems and scripts access your Qability QMS programmatically.
keywords: [API key, integration, machine-to-machine, automation, bearer token, authentication]
---

# API Keys

## Overview

**API Keys** let other systems talk to Qability without a person signing in. Instead of
a username and password, an automated script, integration, or service authenticates with
a secret key you generate here. Use them to push or pull data programmatically — for
example, syncing records with another business system, feeding a dashboard, or running a
scheduled job.

An API key always acts **on behalf of the person who created it**, inside that person's
company, with that person's permissions. Anything the key can do, the owner could have
done by signing in. Treat a key like a password.

You'll find **API Keys** under Administration. The page lists your existing keys with
their name, status, and when each was last used.

## Key concepts

| Concept | What it means |
| --- | --- |
| **Key** | A long, random secret string. It's shown **once**, when you create it, and never again. |
| **Owner** | The user who created the key. The key inherits that user's company access and permissions. |
| **Expiry** | An optional date after which the key stops working automatically. |
| **Status** | A key is *Active* until you revoke it or it expires. |
| **Last used** | When a request last authenticated with this key — useful for spotting unused or stale keys. |

:::note
Qability stores only a secure, hashed copy of each key — never the original. That's why
the full key is displayed only at creation time. If you lose it, you can't recover it;
revoke it and create a new one.
:::

## How to create an API key

1. Open the **API Keys** page under Administration.
2. Select **Create** (or **New API Key**).
3. Give the key a clear **name** that describes what it's for, such as "ERP nightly sync"
   or "Power BI dashboard."
4. Optionally set an **expiry date** so the key retires itself.
5. Select **Create**. The full key value is shown **once**.
6. **Copy the key immediately** and store it somewhere secure (a secrets manager or
   password vault). Once you close the dialog, you can't see it again.

## How to use an API key

Send the key with each API request, in **either** of these HTTP headers:

```http
x-api-key: <your-key-value>
```

```http
Authorization: Bearer <your-key-value>
```

The request is then treated as if the key's owner made it. Requests that need a
permission the owner doesn't have will be refused, just as they would be in the app.

## How to revoke or remove a key

- **Revoke** a key to disable it while keeping a record that it once existed. This is the
  recommended option — your audit trail stays intact. Use it the moment a key is no longer
  needed or might have been exposed.
- **Delete** a key to remove it entirely.

Revoking takes effect within a few minutes across the system. After that, any request
using the key is rejected.

:::tip
Rotate keys periodically: create a new key, switch your integration over to it, confirm
everything still works, then revoke the old one. Give each integration its own key so you
can revoke one without disrupting the others.
:::

:::warning
Anyone who has the key can act as its owner. Never paste keys into emails, chat messages,
shared documents, or source code that's committed to a repository. Store them in a secrets
manager, and revoke immediately if a key is ever exposed.
:::
