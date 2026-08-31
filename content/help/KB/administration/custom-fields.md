---
id: custom-fields
title: Custom Fields
sidebar_position: 11
description: Add your own fields to standard records — the things your process tracks that the built-in fields do not cover.
keywords: [custom fields, additional information, configuration, record fields, extensibility]
---

# Custom Fields

## Overview

Every quality system tracks something the software did not anticipate — a
customer's part revision, an internal project code, which production cell a
problem came from, a regulatory reference your industry uses and nobody else's.

Custom Fields let you add those to standard records without changing anything
else. They appear on the record in an **Additional information** card, are filled
in like any other field, and are captured in the record's history.

## Where they can be added

| Record type        |
| ------------------ |
| Nonconformance     |
| CAPA               |
| Change Request     |
| Audit              |
| Document           |
| Training           |
| Complaint          |
| Customer Complaint |

Each record type has its own set, so a field added to CAPAs does not appear on
Documents.

:::note Custom fields, or a module of your own?
Custom fields **extend** a standard record — a few extra things to capture on
something the system already models.

If what you need is a different record entirely, with its own list, numbering,
workflow and permissions, build it with the [App Builder](../operations/records.md)
instead. The test: are you adding detail to an existing NC, or tracking a
different kind of thing?
:::

## Adding fields

1. Go to **Custom Fields**.
2. Pick the record type.
3. Add fields, giving each a clear label — the label is all anyone will see, so
   it has to carry its own meaning.
4. Save. The fields appear immediately in the **Additional information** card on
   every record of that type.

:::tip
Add fields you will actually filter or report on. Every field costs someone a few
seconds on every record forever, so a field nobody reads is a small permanent tax
on your team. If it is context for one record, the description field is the
better home.
:::

## Filling them in

They behave like the built-in fields: fill them in on create or edit, and they
are captured in the audit trail. Fields added later appear on existing records as
empty — nothing is backfilled, because the system has no basis to guess what the
value should have been.

## Who can do what

Defining fields is a configuration permission, held by administrators. Filling
them in needs only the Update capability on that record type — anyone who can
edit the record can complete its custom fields.

See [Roles and Permissions](./roles-and-permissions.md).

## Related

- [App Builder](../operations/records.md) — when you need a whole module, not a field
- [Company Settings](./company-settings.md) — other configuration
- [Roles and Permissions](./roles-and-permissions.md) — who can configure
