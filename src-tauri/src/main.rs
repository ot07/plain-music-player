#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod player;
mod track;

use crate::player::PlayerError;
use crate::track::Track;
use anyhow::Result;
use cocoa::appkit::{NSWindow, NSWindowStyleMask, NSWindowTitleVisibility};
use player::Player;
use std::fs::File;
use std::io::BufReader;
use std::path::Path;
use std::sync::Mutex;
use std::thread::sleep;
use std::time::Duration;
use tauri::State;
use tauri::{Manager, Runtime, Window};

struct PlayerState(Mutex<Player>);

pub trait WindowExt {
    #[cfg(target_os = "macos")]
    fn set_transparent_titlebar(&self, title_transparent: bool, remove_toolbar: bool);
}

impl<R: Runtime> WindowExt for Window<R> {
    #[cfg(target_os = "macos")]
    fn set_transparent_titlebar(&self, title_transparent: bool, remove_tool_bar: bool) {
        unsafe {
            let id = self.ns_window().unwrap() as cocoa::base::id;
            NSWindow::setTitlebarAppearsTransparent_(id, cocoa::base::YES);
            let mut style_mask = id.styleMask();
            style_mask.set(
                NSWindowStyleMask::NSFullSizeContentViewWindowMask,
                title_transparent,
            );

            if remove_tool_bar {
                style_mask.remove(
                    NSWindowStyleMask::NSClosableWindowMask
                        | NSWindowStyleMask::NSMiniaturizableWindowMask
                        | NSWindowStyleMask::NSResizableWindowMask,
                );
            }

            id.setStyleMask_(style_mask);

            id.setTitleVisibility_(if title_transparent {
                NSWindowTitleVisibility::NSWindowTitleHidden
            } else {
                NSWindowTitleVisibility::NSWindowTitleVisible
            });

            id.setTitlebarAppearsTransparent_(if title_transparent {
                cocoa::base::YES
            } else {
                cocoa::base::NO
            });
        }
    }
}

#[tauri::command]
fn play(path: &str, player: State<PlayerState>) {
    player.0.lock().unwrap().play(Path::new(path));
}

#[tauri::command]
fn pause(player: State<PlayerState>) {
    player.0.lock().unwrap().pause();
}

#[tauri::command]
fn resume(player: State<PlayerState>) {
    player.0.lock().unwrap().resume();
}

#[tauri::command]
fn is_paused(player: State<PlayerState>) -> bool {
    player.0.lock().unwrap().is_paused()
}

#[tauri::command]
fn stop(player: State<PlayerState>) {
    player.0.lock().unwrap().stop();
}

#[tauri::command]
fn seek_to(time: u64, player: State<PlayerState>) {
    player.0.lock().unwrap().seek_to(Duration::from_secs(time));
}

#[tauri::command]
fn get_progress(player: State<PlayerState>) -> Result<(f64, i64, i64), PlayerError> {
    player.0.lock().unwrap().get_progress()
}

#[tauri::command]
fn read_track_from_path(path: String) -> Track {
    Track::read_from_path(path).unwrap()
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let main_window = app.get_window("main").unwrap();
            main_window.set_transparent_titlebar(true, false);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            play,
            pause,
            resume,
            is_paused,
            stop,
            seek_to,
            get_progress,
            read_track_from_path
        ])
        .manage(PlayerState(Mutex::new(Player::new())))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
