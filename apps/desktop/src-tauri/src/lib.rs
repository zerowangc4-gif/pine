// Prevents additional console window on Windows in release, DO NOT REMOVE
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::net::TcpStream;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Manager};

struct RuntimeProcess(Mutex<Option<Child>>);

fn runtime_listening() -> bool {
	TcpStream::connect_timeout(
		&"127.0.0.1:7821".parse().expect("static addr"),
		Duration::from_millis(200),
	)
	.is_ok()
}

fn bundled_runtime_paths(app: &AppHandle) -> Option<(PathBuf, PathBuf)> {
	let resource_dir = app.path().resource_dir().ok()?;
	let runtime_dir = resource_dir.join("runtime");
	#[cfg(windows)]
	let node = runtime_dir.join("node.exe");
	#[cfg(not(windows))]
	let node = runtime_dir.join("node");
	let script = runtime_dir.join("pine-runtime.cjs");
	if node.is_file() && script.is_file() {
		Some((node, script))
	} else {
		None
	}
}

fn start_runtime(app: &AppHandle) -> Option<Child> {
	if runtime_listening() {
		eprintln!("pine runtime already listening on 7821");
		return None;
	}

	let (node, script) = match bundled_runtime_paths(app) {
		Some(paths) => paths,
		None => {
			eprintln!("bundled pine runtime missing under resource dir");
			return None;
		}
	};

	let mut command = Command::new(&node);
	command
		.arg(&script)
		.stdout(Stdio::null())
		.stderr(Stdio::null())
		.current_dir(script.parent().unwrap_or_else(|| std::path::Path::new(".")));

	#[cfg(windows)]
	{
		use std::os::windows::process::CommandExt;
		const CREATE_NO_WINDOW: u32 = 0x0800_0000;
		command.creation_flags(CREATE_NO_WINDOW);
	}

	match command.spawn() {
		Ok(process) => {
			eprintln!("started bundled pine runtime pid={}", process.id());
			// Give the websocket a moment to bind before the UI connects.
			std::thread::sleep(Duration::from_millis(400));
			Some(process)
		}
		Err(error) => {
			eprintln!("failed to start bundled pine runtime: {error}");
			None
		}
	}
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
	tauri::Builder::default()
		.plugin(tauri_plugin_shell::init())
		.setup(|app| {
			let child = start_runtime(app.handle());
			app.manage(RuntimeProcess(Mutex::new(child)));
			Ok(())
		})
		.build(tauri::generate_context!())
		.expect("error while building pine")
		.run(|app_handle, event| {
			if let tauri::RunEvent::Exit = event {
				if let Some(state) = app_handle.try_state::<RuntimeProcess>() {
					if let Ok(mut guard) = state.0.lock() {
						if let Some(mut child) = guard.take() {
							let _ = child.kill();
						}
					}
				}
			}
		});
}
