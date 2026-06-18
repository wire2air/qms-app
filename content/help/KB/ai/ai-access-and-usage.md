---
id: ai-access-and-usage
title: AI Access & Usage
sidebar_position: 2
description: Control who can use Qability AI, review AI usage and cost, and create personal access tokens that connect external AI tools to your QMS.
keywords: [AI usage, AI access, AI permission, personal access token, MCP, AI cost, governance, AI tokens]
---

# AI Access & Usage

## Overview

This page covers the controls around the [AI Assistant](./ai-assistant.md): how AI is
turned on, who can use it, how to keep an eye on usage and cost, and how to connect an
external AI tool to your workspace with a personal access token.

## Enabling AI and controlling access

AI is governed at three levels:

1. **Workspace** — AI must be enabled for your company. When it's off, the AI buttons are
   hidden everywhere in the product.
2. **Permission** — within the workspace, the **AI** permission controls who can use AI
   features. Grant it through [Roles & Permissions](../administration/roles-and-permissions.md).
3. **Configuration** — administrators can set AI preferences for the workspace, such as the
   model used.

:::note
If AI features have disappeared for everyone, the workspace-level switch is likely off. If
they're missing only for certain people, check that their role includes the **AI**
permission.
:::

## Reviewing AI usage

The **AI Usage** page (under Administration) gives administrators a dashboard of AI
activity across the workspace. Every AI action is recorded, so you can see what's being
used and keep cost predictable.

Use it to:

- See how much AI is being used over time.
- Understand the cost associated with AI activity.
- Spot which features are getting the most use.

:::tip
Check the usage dashboard periodically when you first roll out AI to your team. It's the
quickest way to confirm adoption and to keep an eye on spend before it becomes a surprise.
:::

## Personal access tokens (connecting external AI tools)

Qability can also be connected to **external AI clients** — such as Claude Desktop or
Claude Code — so you can query your QMS from those tools. This connection is authenticated
with a **personal access token** that you create on the **AI Access Tokens** page.

A personal access token:

- Belongs to **you** and acts with your permissions.
- Is shown **once**, when you create it — copy it immediately and store it securely.
- Can be revoked at any time if you no longer need it or it may have been exposed.

### How to create a personal access token

1. Open the **AI Access Tokens** page.
2. Select **Create**, and give the token a descriptive name (for example, "Claude Desktop —
   my laptop").
3. Copy the token value shown in the dialog and store it somewhere safe. You won't be able
   to see it again.
4. Paste it into your external AI tool's connection settings.

To stop a connection, revoke its token from the same page.

:::warning
A personal access token can read your workspace with your permissions. Treat it like a
password — never share it or commit it to source code, and revoke it immediately if it's
ever exposed.
:::

## Related

- [AI Assistant](./ai-assistant.md) — the in-product AI features themselves.
- [Roles & Permissions](../administration/roles-and-permissions.md) — granting the AI
  permission.
- [API Keys](../administration/api-keys.md) — machine-to-machine keys for non-AI
  integrations.
