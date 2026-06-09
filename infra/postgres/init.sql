-- One database per service (database-per-service). A single Postgres instance
-- hosts them for local dev; in production these are separate managed databases.
CREATE DATABASE auth;
CREATE DATABASE lms;
CREATE DATABASE crm;
CREATE DATABASE notification;
