---
id: service-accounts
title: Service Accounts
sidebar_position: 9
description: Create machine identities that own API keys, so external systems and scripts can access your Qability QMS programmatically without borrowing a person's account.
keywords: [service account, API key, integration, machine-to-machine, automation, bearer token, authentication]
---

# Service Accounts

## Overview

A **service account** is a machine identity — an account that belongs to an integration
rather than to a person. It holds its own roles, and it owns the **API keys** that an
external system uses to authenticate. Use one whenever another system needs to talk to
Qability without a person signing in: syncing records with an ERP, feeding a dashboard,
or running a scheduled job.

You'll find **Service Accounts** under Administration.

:::note
Qability used to offer *personal* API keys — a key you created against your own login,
which then carried your permissions. That has been retired. A personal key silently
inherited every new permission its owner was later granted, so a key minted by a new
starter quietly became an administrator credential the day they were promoted. A service
account has exactly the roles someone deliberately gave it, and changing them is a
recorded, reviewable act.
:::

## Why a service account, not a person's key

| | Personal key (retired) | Service account |
| --- | --- | --- |
| **Whose permissions?** | Whatever its owner happens to hold, now and in future | Only the roles assigned to the account |
| **When the owner leaves** | Key dies with the account — the integration breaks | Unaffected; the integration keeps running |
| **Who does the audit trail name?** | The person | The integration |
| **Who can see it?** | Only its owner | Every administrator, in one list |

That last row matters more than it looks. Because a service account is visible to every
administrator, the Service Accounts page is a complete map of what is wired into your
tenant — something a scattering of personal keys could never give you.

## Key concepts

| Concept | What it means |
| --- | --- |
| **Service account** | The machine identity. It has a name, a description, roles, and a status. It has no email and no password, so it cannot sign in to the app. |
| **Roles** | What the account is allowed to do. Assigned exactly like a person's roles. |
| **API key** | A long, random secret an external system sends with each request. An account can own several. Each is shown **once**, at creation. |
| **Status** | *Active* or *Disabled*. Disabling the account stops **every** key it owns, immediately — the master switch. |
| **Expiry** | An optional date after which an individual key stops working on its own. |
| **Last used** | When a request last authenticated with a key — useful for spotting keys nothing is using any more. |

:::note
Qability stores only a secure, hashed copy of each key — never the original. That's why
the full key is displayed only at creation time. If you lose it, you can't recover it;
revoke it and issue a new one.
:::

## How to create a service account

1. Open **Service Accounts** under Administration.
2. Select **New Service Account**.
3. Give it a clear **name** describing the system it represents, such as "SAP nightly
   sync" or "Power BI dashboard", and a short **description** of what it does.
4. Assign the **roles** it needs — and only those. An integration that reads suppliers
   should not hold a role that can approve documents.
5. Select **Create**.

:::warning
You can only give a service account permissions **you hold yourself**, at the scope you
hold them. If you try to assign a role that grants something beyond your own access,
Qability refuses and names the permissions involved. The same check runs again when you
issue a key, so an existing powerful account can't be used as a side door either.
:::

## How to issue an API key

1. Open the service account.
2. Select **Issue Key**, give the key a **name** describing where it will live (which
   server, which script), and optionally an **expiry date**.
3. The full key value is shown **once**, and starts with `sk_`.
4. **Copy it immediately** and store it in a secrets manager or password vault. Once you
   close the dialog, you can't see it again.

Give each system its own key, so you can revoke one without disrupting the others.

## How to use an API key

Send the key with each request, in **either** of these HTTP headers:

```http
x-api-key: <your-key-value>
```

```http
Authorization: Bearer <your-key-value>
```

The request is then treated as if the service account made it, with the account's roles.
Anything those roles don't allow is refused, exactly as it would be in the app.

:::note
API keys work on the REST API only. They are deliberately **not** accepted on the
GraphQL endpoint, and they cannot be used to manage service accounts or issue further
keys — a leaked credential must not be able to create more of itself.
:::

## How to turn access off

You have three levers, from broadest to narrowest:

- **Disable the account** — stops every key it owns at once, and reverses cleanly when
  you enable it again. Use this the moment something looks wrong; you can investigate
  afterwards.
- **Revoke a key** — permanently stops that one key while the account and its other keys
  keep working. Use this to rotate a key, or when one credential may have been exposed.
- **Delete the account** — revokes all of its keys and removes it. The audit history of
  what it did stays intact.

All three take effect immediately.

:::tip
Rotate keys periodically: issue a new key, switch the integration over to it, confirm
everything still works, then revoke the old one. Because both keys are valid during the
changeover, there's no downtime.
:::

:::warning
Anyone holding a key can act as the service account. Never paste keys into emails, chat
messages, shared documents, or source code committed to a repository. Store them in a
secrets manager, and revoke immediately if a key is ever exposed.
:::
