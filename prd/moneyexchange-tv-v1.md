# MoneyExchangeTV Product Requirements

This local PRD mirrors the v1.0.0 enterprise specification for the Money Exchange Digital Signage & Branch Management System.

## Goals

- Centralized administration for a money exchange company with 7 initial branches and unlimited future scalability
- Android TV digital signage with 70/30 video/rates layout and bottom ticker
- Real-time exchange rate, ticker, and playlist synchronization under 1 second
- Offline playback with automatic recovery sync

## Roles

- **Super Admin:** full platform control
- **Branch Manager:** branch-scoped content and rate management

## Core Modules

1. Branch Management
2. Currency Management
3. Exchange Rate Management with audit trail
4. Video and Playlist Management
5. Ticker Management
6. TV Device Registration and Monitoring
7. Analytics, Notifications, Audit Logs, Settings

## Firebase Services

- Project: `moneyexchange-35c33`
- Authentication, Firestore, Storage, Hosting, Analytics, Cloud Functions, Cloud Messaging

## Acceptance Criteria

- Admin can sign in with Firebase Authentication
- Super Admin can create branches and currencies
- Rate updates propagate to TV player listeners in near real time
- TV player continues showing cached rates/videos/tickers when offline
- All privileged actions create audit log entries
- Firestore security rules enforce role and branch boundaries
