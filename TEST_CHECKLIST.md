# Test Checklist - Logistics Network Platform

## Auth

- [ ] Register with valid email/password creates user in Supabase Auth.
- [ ] Register as **transporter** saves `role = transporter` in `users` table.
- [ ] Register as **business** saves `role = business` in `users` table.
- [ ] Invalid registration (bad email / weak password) shows error and does not create user.
- [ ] Login with correct credentials redirects to `/dashboard`.
- [ ] Login with wrong password shows error and stays on `/auth/login`.
- [ ] Visiting `/dashboard` without a session redirects to `/auth/login`.

## Route Creation (Transporter Dashboard)

- [ ] Creating a route with all required fields inserts a row in `routes` with `status = available`.
- [ ] Newly created route appears under **My Routes** for the transporter.
- [ ] Updating route status to `in_transit` updates UI and database.
- [ ] Updating route status to `completed` updates UI and database.
- [ ] Transporter A cannot see routes belonging to Transporter B.

## Request Workflow

### Business

- [ ] Business user can search and see only routes with `status = available`.
- [ ] Clicking **Request Transport** creates a row in `requests` with:
  - [ ] Correct `route_id`
  - [ ] Correct `business_id`
  - [ ] `status = pending`

### Transporter

- [ ] Transporter sees incoming requests only for their own routes.
- [ ] Clicking **Accept** sets request `status = accepted` in DB and UI.
- [ ] Clicking **Reject** sets request `status = rejected` in DB and UI.
- [ ] Refreshing the page keeps the updated request statuses.

## Role Permissions & RLS

### Transporter

- [ ] Can create routes; each route row has `transporter_id = auth.uid()`.
- [ ] Cannot update or delete routes created by another transporter (verified via Supabase SQL/API).

### Business

- [ ] Can read available routes but cannot insert into `routes` table.
- [ ] Can read and manage only their own requests (no access to other businesses' requests).

### Admin

- [ ] Admin can view all users in the admin dashboard.
- [ ] Admin can view all routes in the admin dashboard.
- [ ] Admin can toggle `is_suspended` for any user and change is reflected in DB.
- [ ] Non-admin user cannot access `/dashboard/admin` (redirected away).

