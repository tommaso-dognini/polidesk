//! PoliDesk backend: everything the app does, without any UI.
//! Used by `polideskd` (the always-on daemon) and, through it, by the Electron UI, the CLI and the MCP server.
pub mod ai;
pub mod api;
pub mod browser;
pub mod calendars;
pub mod cleaner;
pub mod cloud;
pub mod config;
pub mod downloader;
pub mod drives;
pub mod enhance;
pub mod exams;
pub mod indexpage;
pub mod integrations;
pub mod library;
pub mod materials;
pub mod net;
pub mod notes;
pub mod paths;
pub mod polinetwork;
pub mod deps;
pub mod recman;
pub mod rooms;
pub mod rpc;
pub mod schedule;
pub mod search;
pub mod setup;
pub mod sync;
pub mod sys;
pub mod timetable;
pub mod tools;
pub mod transcriber;
pub mod util;
pub mod webeep;
pub mod webex;
pub mod workspace;

use serde_json::Value;
use std::sync::Arc;

/// Events pushed to every connected client (UI log, progress, refresh…), same shapes as before.
pub type Emit = Arc<dyn Fn(Value) + Send + Sync>;

pub fn log_event(msg: impl Into<String>) -> Value {
    serde_json::json!({ "type": "log", "msg": msg.into() })
}
